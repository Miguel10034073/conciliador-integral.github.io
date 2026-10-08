// Motor de conciliación: normaliza las fuentes y hace los cruces. Misma lógica que la versión de Power Query.
'use strict';

const Motor = (() => {
  const CLASES_DOC = ['Compra', 'NC compra', 'Venta', 'NC venta'];
  const ORDEN_DOCS = ['Diferencia de valor', 'Falta contabilizar', 'Número distinto', 'No está en DIAN', 'Mes anterior sin cruzar', 'Fuera del periodo', 'OK'];
  const ORDEN_BANCOS = ['Por conciliar: diferencia de valor', 'Falta registrar en libros', 'No aparece en extracto',
    'Gasto bancario por registrar', 'Conciliado (fecha distinta)', 'Conciliado en bloque', 'Conciliado'];
  const ORDEN_XML = ['Falta XML', 'XML no está en DIAN', 'Diferencia de valor', 'XML duplicado', 'OK'];
  const ORDEN_EVENTOS = ['Por acusar', 'Revisar: posible nota crédito', 'Evento incompleto', 'Con nota crédito (no acusar)', 'Con evento'];
  const FUENTES_ESPERADAS = ['XML Causaciones', 'DIAN', 'Digitación SCI', 'Eventos', 'Extracto Bancolombia', 'Libro bancos SCI'];
  const FORMA_PAGO = { 1: 'Contado', 2: 'Crédito' };
  const OTROS_IMPUESTOS = ['ICA', 'IC', 'INC', 'Timbre', 'INC Bolsas', 'IN Carbono', 'IN Combustibles', 'IC Datos', 'ICL', 'INPP', 'IBUA', 'ICUI'];

  const posicion = (lista, v) => { const i = lista.indexOf(v); return i < 0 ? lista.length : i; };
  const n0 = (v) => U.num(v) ?? 0;

  function procesar(conjunto, cargas, config) {
    const P = config.parametros;
    const filasDe = (fuente) => cargas.filter((c) => c.fuente === fuente && c.datos).flatMap((c) => c.datos);

    // ---------- Tabla de impuestos (archivo de la carpeta o respaldo manual) ----------
    const impArchivo = filasDe('Tabla de impuestos');
    const impuestos = impArchivo.length ? impArchivo : config.impuestosManual;
    const origenImpuestos = impArchivo.length ? impArchivo[0]._archivo : 'Configuración (tabla manual)';
    const tarifas = new Map();
    const repetidos = new Map();
    for (const t of impuestos) {
      const k = `${t.identificador}|${t.codigo}`;
      if (tarifas.has(k)) { if (!repetidos.has(k)) repetidos.set(k, [tarifas.get(k)]); repetidos.get(k).push(t); } else tarifas.set(k, t);
    }
    const tarifasEnUso = [...tarifas.values()].map((t) => ({ ...t, origen: origenImpuestos }))
      .sort((a, b) => a.identificador.localeCompare(b.identificador) || a.codigo - b.codigo);

    // ---------- SCI: líneas digitadas ----------
    const tiposSCI = new Map(config.tiposSCI.map((t) => [String(t.tipo).trim(), String(t.clase).trim()]));
    const lineas = filasDe('Digitación SCI').map((r) => {
      const tipo = U.texto(r.tipo);
      const clase = tiposSCI.get(tipo) || 'Sin clasificar';
      const asiento = (U.texto(r.asiento) || '').toUpperCase();
      const codIva = U.num(U.texto(r.codIva));
      const pct = codIva === null ? null : tarifas.get(`I|${codIva}`)?.porcentaje ?? null;
      const contrario = ['NC compra', 'Venta'].includes(clase) ? 'DB' : 'CR';
      const signo = asiento === contrario ? -1 : 1;
      const base = n0(r.subtotal) * signo;
      const iva = U.redondear(base * (pct || 0) / 100);
      const neto = n0(r.valorNeto) * signo;
      const documento = U.texto(r.documento);
      const docContable = U.texto(r.docContable);
      return {
        tipoSCI: tipo, clase, docContable, fecha: U.fecha(r.fecha, 'MM/dd/yyyy'), nit: U.nit(r.nit), tercero: U.texto(r.tercero),
        documento, asiento, codIva, pctIva: pct, descripcion: U.texto(r.descripcion), centroCosto: U.texto(r.centroCosto),
        usuario: U.texto(r.usuario), base, iva, neto, retencion: U.redondear(base + iva - neto),
        docReferencia: !documento || !/[1-9A-Za-z]/.test(documento) ? docContable : documento, archivo: r._archivo,
      };
    });

    // ---------- Periodo ----------
    let anio = P.anio || conjunto.anio, mes = P.mes || conjunto.mes;
    if (!anio || !mes) {
      const conteo = U.agrupar(lineas.filter((l) => l.fecha), (l) => U.partes(l.fecha).slice(0, 2).join('-'));
      const masComun = [...conteo.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      if (masComun) [anio, mes] = masComun[0].split('-').map(Number);
      else { const h = new Date(); anio = h.getFullYear(); mes = h.getMonth() + 1; }
    }
    // Razón social y NIT desde el encabezado de los reportes de SCI: "INVERSIONES MINDALA S.A.S. - 900.588.025-2"
    const encabezadoSCI = cargas.find((c) => c.encabezado)?.encabezado || '';
    const partesEnc = /^(.*?)\s+-\s+([\d.\-]+)\s*$/.exec(encabezadoSCI);
    const periodo = {
      empresa: conjunto.empresa || 'Empresa', anio, mes,
      razonSocial: partesEnc ? partesEnc[1].trim() : (encabezadoSCI || conjunto.empresa || 'Empresa'), nit: partesEnc ? partesEnc[2] : '',
      nombre: `${U.nombreMes(mes).replace(/^./, (c) => c.toUpperCase())} de ${anio}`, corte: U.finDeMes(anio, mes),
    };
    // '2026-08 · Agosto': así los meses quedan en orden en los filtros
    const etiquetaMes = (s) => {
      if (s === null) return 'Sin fecha';
      const [a, m] = U.partes(s);
      return `${a}-${String(m).padStart(2, '0')} · ${U.nombreMes(m).replace(/^./, (c) => c.toUpperCase())}`;
    };
    const clasificarPeriodo = (s) => {
      if (s === null) return 'Sin fecha';
      const [a, m] = U.partes(s);
      if (a === anio && m === mes) return 'Mes actual';
      return a * 12 + m < anio * 12 + mes ? 'Meses anteriores' : 'Posterior';
    };

    // ---------- DIAN ----------
    const tiposDIAN = new Map(config.tiposDIAN.map((t) => [`${String(t.tipo).trim()}|${String(t.grupo).trim()}`, String(t.clase).trim()]));
    const vistos = new Set();
    const dian = [];
    for (const r of filasDe('DIAN')) {
      const cufe = U.texto(r['CUFE/CUDE']);
      const id = cufe.toLowerCase();
      if (vistos.has(id)) continue;
      vistos.add(id);
      const grupo = U.texto(r.Grupo) || '';
      const recibido = grupo === 'Recibido';
      const fecha = U.fecha(r['Fecha Emisión'], 'dd-MM-yyyy');
      const iva = n0(r.IVA);
      const otros = U.suma(OTROS_IMPUESTOS, (c) => n0(r[c]));
      const total = n0(r.Total);
      const tipo = U.texto(r['Tipo de documento']) || '';
      dian.push({
        id, tipoDIAN: tipo, grupo, fecha, periodo: clasificarPeriodo(fecha),
        nit: U.nit(recibido ? r['NIT Emisor'] : r['NIT Receptor']),
        tercero: U.texto(recibido ? r['Nombre Emisor'] : r['Nombre Receptor']),
        documento: (U.texto(r.Prefijo) || '') + (U.texto(r.Folio) || ''), cufe,
        base: total - iva - otros, iva, otros, reteIva: n0(r['Rete IVA']), reteRenta: n0(r['Rete Renta']), reteIca: n0(r['Rete ICA']),
        total, estadoDIAN: U.texto(r.Estado) || '', archivo: r._archivo, formaPago: FORMA_PAGO[U.texto(r['Forma de Pago'])] || null,
        clase: tiposDIAN.get(`${tipo}|${grupo}`) || 'Sin clasificar',
      });
    }

    // ---------- SCI: documentos (tercero + factura) ----------
    const grupos = U.agrupar(lineas.filter((l) => CLASES_DOC.includes(l.clase)), (l) => `${l.clase}|${l.nit}|${l.docReferencia}`);
    const sciDocs = [...grupos.values()].map((g, i) => {
      const fechas = g.map((l) => l.fecha).filter((f) => f !== null);
      const base = U.suma(g, (l) => l.base), iva = U.suma(g, (l) => l.iva);
      return {
        idSCI: i + 1, clase: g[0].clase, nit: g[0].nit, docReferencia: g[0].docReferencia,
        terceroSCI: g.find((l) => l.tercero)?.tercero || null, fechaSCI: fechas.length ? Math.min(...fechas) : null,
        tipoSCI: U.unicos(g.map((l) => l.tipoSCI)).join(', '), docContable: U.unicos(g.map((l) => l.docContable)).join(', '),
        comprobantes: new Set(g.map((l) => l.docContable)).size, baseSCI: base, ivaSCI: iva, totalSCI: base + iva,
        retencionSCI: U.suma(g, (l) => l.retencion), netoSCI: U.suma(g, (l) => l.neto),
        centroCosto: U.unicos(g.map((l) => l.centroCosto)).join(', '), usuario: U.unicos(g.map((l) => l.usuario)).join(', '),
      };
    });

    // ---------- Eventos (último por CUFE) ----------
    const eventos = new Map();
    for (const r of filasDe('Eventos')) {
      const id = U.texto(r.CUFE).toLowerCase();
      const ev = {
        fechaRegistro: U.fecha(r['Fecha Registro'], 'yyyy-MM-dd'), estado: U.texto(r['Estado Actual']) || '',
        aceptacion: U.texto(r['Estado Aceptación Factura']) || '',
        recepcionFactura: U.texto(r['Estado Recepción Factura']) || '', recepcionMercancia: U.texto(r['Estado Recepción Mercancía']) || '',
      };
      const previo = eventos.get(id);
      if (!previo || (ev.fechaRegistro || 0) > (previo.fechaRegistro || 0)) eventos.set(id, ev);
    }

    // ---------- Cruce de documentos ----------
    function conciliarDocumentos(docsDian, docsSci, familiaNC) {
      const tol = Number(P.toleranciaDocumentos) || 0;
      const llaves = (nit, clase, doc, total) => {
        if (!nit) return [null, null, null, null];
        const pre = `${nit}|${familiaNC.includes(clase) ? 'NC' : 'F'}|`;
        const c = U.claveDoc(doc);
        return [c.completa && pre + c.completa, c.ult9 && pre + c.ult9, c.numero && pre + c.numero,
          total ? `${pre}$${Math.round(total)}` : null];
      };
      const izq = docsDian.map((d) => ({ id: d.id, k: llaves(d.nit, d.clase, d.documento, d.total) }));
      const der = docsSci.map((s) => ({ id: s.idSCI, k: llaves(s.nit, s.clase, s.docReferencia, s.totalSCI) }));
      const metodos = ['Número exacto', 'Últimos 9 caracteres', 'Solo número (sin prefijo)', 'Mismo tercero y valor (número distinto)'];
      const usadosI = new Set(), usadosD = new Set(), parDe = new Map();
      for (let p = 0; p < 4; p++) {
        const indice = U.agrupar(der.filter((d) => !usadosD.has(d.id) && d.k[p]), (d) => d.k[p]);
        for (const i of izq) {
          if (usadosI.has(i.id) || !i.k[p]) continue;
          const d = (indice.get(i.k[p]) || []).find((x) => !usadosD.has(x.id));
          if (!d) continue;
          usadosI.add(i.id); usadosD.add(d.id); parDe.set(i.id, { idSCI: d.id, metodo: metodos[p] });
        }
      }
      const sciPorId = new Map(docsSci.map((s) => [s.idSCI, s]));
      const filas = [];
      const construir = (d, s, metodo) => {
        const hayDian = !!d, haySci = !!s;
        const difBase = hayDian && haySci ? s.baseSCI - d.base : null;
        const difIva = hayDian && haySci ? s.ivaSCI - d.iva : null;
        const difTotal = hayDian && haySci ? s.totalSCI - d.total : null;
        let estado;
        if (hayDian && haySci && (metodo || '').startsWith('Mismo tercero')) estado = 'Número distinto';
        else if (hayDian && haySci) estado = Math.abs(difTotal) <= tol && Math.abs(difIva) <= tol ? 'OK' : 'Diferencia de valor';
        else if (hayDian) estado = d.periodo === 'Mes actual' ? 'Falta contabilizar' : d.periodo === 'Meses anteriores' ? 'Mes anterior sin cruzar' : 'Fuera del periodo';
        else estado = 'No está en DIAN';
        const alertas = [];
        if (haySci && s.comprobantes > 1) alertas.push(`Registrada en ${s.comprobantes} comprobantes (posible duplicado)`);
        if (hayDian && haySci && Math.abs(difIva) > tol) alertas.push('IVA distinto');
        if (hayDian && haySci && Math.abs(difBase) > tol && Math.abs(difTotal) <= tol) alertas.push('Base distinta');
        if (hayDian && d.estadoDIAN && !d.estadoDIAN.startsWith('Aprobado')) alertas.push(`Estado DIAN: ${d.estadoDIAN}`);
        if (metodo && metodo !== 'Número exacto' && !metodo.startsWith('Mismo tercero')) alertas.push(`Cruzó por ${metodo.toLowerCase()}`);
        if (metodo && metodo.startsWith('Mismo tercero')) alertas.push(`En SCI se registró con el número ${s.docReferencia}`);
        if (!hayDian && haySci && s.docReferencia && !/[1-9]/.test(s.docReferencia)) alertas.push('Sin número de factura en SCI');
        let evento = null;
        if (hayDian) {
          evento = eventos.get(d.id) || null;
          // Solo las facturas a crédito necesitan eventos (acuse, recibo y aceptación); ver "Eventos por acusar"
          if (d.grupo === 'Recibido' && d.tipoDIAN === 'Factura electrónica' && d.formaPago !== 'Contado' && !evento) alertas.push('Sin evento registrado');
        }
        return {
          estado, alertas: alertas.join(' | '), periodo: d ? d.periodo : 'Mes actual', mes: etiquetaMes(d?.fecha ?? s?.fechaSCI ?? null), clase: d ? d.clase : s.clase,
          tipoDIAN: d?.tipoDIAN ?? null, fecha: d?.fecha ?? s?.fechaSCI ?? null, nit: d?.nit ?? s?.nit ?? null,
          tercero: d?.tercero || s?.terceroSCI || null, facturaDIAN: d?.documento ?? null, facturaSCI: s?.docReferencia ?? null,
          docContable: s?.docContable ?? null, tipoSCI: s?.tipoSCI ?? null,
          baseDIAN: d?.base ?? null, ivaDIAN: d?.iva ?? null, otrosDIAN: d?.otros ?? null, totalDIAN: d?.total ?? null,
          baseSCI: s?.baseSCI ?? null, ivaSCI: s?.ivaSCI ?? null, totalSCI: s?.totalSCI ?? null,
          difBase, difIva, difTotal, retencionSCI: s?.retencionSCI ?? null, netoSCI: s?.netoSCI ?? null,
          reteIvaDIAN: d?.reteIva ?? null, reteRentaDIAN: d?.reteRenta ?? null, reteIcaDIAN: d?.reteIca ?? null,
          estadoDIAN: d?.estadoDIAN ?? null, formaPago: d?.formaPago ?? null, estadoEvento: evento?.estado ?? null, aceptacion: evento?.aceptacion ?? null,
          fechaEvento: evento?.fechaRegistro ?? null, metodo: metodo || null, centroCosto: s?.centroCosto ?? null,
          usuario: s?.usuario ?? null, cufe: d?.cufe ?? null,
        };
      };
      for (const d of docsDian) { const par = parDe.get(d.id); filas.push(construir(d, par ? sciPorId.get(par.idSCI) : null, par?.metodo)); }
      for (const s of docsSci) if (!usadosD.has(s.idSCI)) filas.push(construir(null, s, null));
      return filas.sort((a, b) => posicion(ORDEN_DOCS, a.estado) - posicion(ORDEN_DOCS, b.estado) || (a.fecha || 0) - (b.fecha || 0));
    }
    const compras = conciliarDocumentos(dian.filter((d) => ['Compra', 'NC compra'].includes(d.clase)),
      sciDocs.filter((s) => ['Compra', 'NC compra'].includes(s.clase)), ['NC compra']);
    const ventas = conciliarDocumentos(dian.filter((d) => ['Venta', 'NC venta'].includes(d.clase)),
      sciDocs.filter((s) => ['Venta', 'NC venta'].includes(s.clase)), ['NC venta']);

    // ---------- XML de "01. Causaciones" ----------
    const masComun = (lista) => [...U.agrupar(lista.filter(Boolean), (x) => x).entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] || null;
    const xmlCrudos = filasDe('XML Causaciones');
    const nitEmpresa = U.nit(periodo.nit) || masComun(xmlCrudos.map((f) => U.nit(f.adqNit)));
    const xmls = xmlCrudos.map((f) => {
      const emisorNit = U.nit(f.emisorNit), adqNit = U.nit(f.adqNit);
      const grupo = nitEmpresa && emisorNit === nitEmpresa ? 'Emitido' : 'Recibido';
      const fecha = U.fecha(f.fecha, 'yyyy-MM-dd');
      return {
        id: U.texto(f.cufe)?.toLowerCase() || null, cufe: U.texto(f.cufe), tipo: f.tipo, numero: f.numero, fecha, periodo: clasificarPeriodo(fecha), mes: etiquetaMes(fecha),
        grupo, nit: grupo === 'Emitido' ? adqNit : emisorNit, tercero: grupo === 'Emitido' ? f.adqNombre : f.emisorNombre,
        emisorNit, emisorNombre: f.emisorNombre, adqNit, adqNombre: f.adqNombre,
        bruto: f.bruto, descuentos: f.descuentos, subtotal: f.subtotal, iva: f.iva, otros: f.otros, retenciones: f.retenciones, total: f.total,
        formaPago: f.formaPago, medioPago: f.medioPago, vencimiento: U.fecha(f.vencimiento, 'yyyy-MM-dd'), validacionXML: f.estadoDian,
        cuadre: f.diferencia, lineas: f.lineas || [], archivo: f._archivo, carpeta: f._carpeta, factura: f,
        referencias: f.referencias || [], codigoNota: f.codigoNota || '', motivoNota: f.motivoNota || '',
      };
    });

    // Estado en SCI de un documento: por CUFE (cruce DIAN-SCI) o por tercero + número
    const docsCruzados = [...compras, ...ventas];
    const cruzadoPorCufe = new Map(docsCruzados.filter((f) => f.cufe).map((f) => [f.cufe.toLowerCase(), f]));
    const cruzadoPorNumero = new Map();
    for (const f of docsCruzados) {
      for (const doc of [f.facturaSCI, f.facturaDIAN]) {
        const c = U.claveDoc(doc).completa;
        if (f.nit && c && !cruzadoPorNumero.has(`${f.nit}|${c}`)) cruzadoPorNumero.set(`${f.nit}|${c}`, f);
      }
    }
    const enSCI = (id, nit, documento) => {
      const f = (id && cruzadoPorCufe.get(id)) || cruzadoPorNumero.get(`${nit}|${U.claveDoc(documento).completa}`);
      return f && f.docContable ? { estadoSCI: 'Contabilizado', docContable: f.docContable } : { estadoSCI: 'Sin contabilizar', docContable: null };
    };

    // ---------- Cruce XML vs DIAN ----------
    // Todo XML debe estar en la DIAN y todo documento recibido del mes en la DIAN debe tener su XML.
    const tolDoc = Number(P.toleranciaDocumentos) || 0;
    const dianDocs = dian.filter((d) => d.clase !== 'Excluir');
    const dianPorId = new Map(dianDocs.map((d) => [d.id, d]));
    const llaveNumero = (grupo, nit, doc) => { const c = U.claveDoc(doc).completa; return nit && c ? `${grupo}|${nit}|${c}` : null; };
    const dianPorNumero = U.agrupar(dianDocs.filter((d) => llaveNumero(d.grupo, d.nit, d.documento)), (d) => llaveNumero(d.grupo, d.nit, d.documento));
    const fechasDian = dian.map((d) => d.fecha).filter((f) => f !== null);
    const corteDian = fechasDian.length ? Math.max(...fechasDian) : null;
    const usadosDian = new Set(), xmlPorId = new Map();
    const xmlDian = [];
    const filaXml = (x, d, estado, alertas, metodo) => {
      const sci = enSCI(x?.id || d?.id, x?.nit ?? d?.nit, x?.numero ?? d?.documento);
      return {
        estado, alertas: alertas.join(' | '), periodo: (x || d).periodo, mes: etiquetaMes(x?.fecha ?? d.fecha), grupo: x?.grupo ?? d.grupo,
        tipo: x?.tipo ?? null, tipoDIAN: d?.tipoDIAN ?? null, fecha: x?.fecha ?? d.fecha, nit: x?.nit ?? d.nit, tercero: x?.tercero || d?.tercero || null,
        documento: x?.numero ?? d.documento, totalXML: x?.total ?? null, totalDIAN: d?.total ?? null,
        diferencia: x && d ? U.redondear(x.total - d.total) : null, ivaXML: x?.iva ?? null, ivaDIAN: d?.iva ?? null,
        formaPago: x?.formaPago ?? d?.formaPago ?? null, estadoDIAN: d?.estadoDIAN ?? null, ...sci, metodo: metodo || null,
        archivo: x?.archivo ?? null, carpeta: x?.carpeta ?? null, cufe: x?.cufe ?? d?.cufe ?? null,
      };
    };
    for (const x of xmls) {
      const alertas = [];
      const previo = x.id ? xmlPorId.get(x.id) : null;
      if (previo) {
        x.estadoCruce = 'XML duplicado';
        xmlDian.push(filaXml(x, previo.dian, 'XML duplicado', [`Es el mismo documento de ${previo.archivo}`], null));
        continue;
      }
      if (x.id) xmlPorId.set(x.id, x);
      let d = x.id ? dianPorId.get(x.id) : null, metodo = d ? 'CUFE' : null;
      if (!d) {
        d = (dianPorNumero.get(llaveNumero(x.grupo, x.nit, x.numero)) || []).find((z) => !usadosDian.has(z.id)) || null;
        if (d) { metodo = 'Tercero + número'; alertas.push('El CUFE del XML es distinto al del reporte DIAN'); }
      }
      let estado;
      if (d) {
        usadosDian.add(d.id);
        x.dian = d;
        estado = Math.abs(x.total - d.total) <= tolDoc ? 'OK' : 'Diferencia de valor';
        if (d.estadoDIAN && !d.estadoDIAN.startsWith('Aprobado')) alertas.push(`Estado DIAN: ${d.estadoDIAN}`);
      } else {
        estado = 'XML no está en DIAN';
        if (x.grupo === 'Recibido' && nitEmpresa && x.adqNit !== nitEmpresa) alertas.push(`A nombre de otro adquiriente: ${x.adqNombre || 'sin nombre'} (NIT ${x.adqNit || 'sin NIT'})`);
        if (corteDian !== null && x.fecha !== null && x.fecha > corteDian) alertas.push(`Posterior al último documento del reporte DIAN (${U.fmtFecha(corteDian)}): descargue de nuevo el reporte`);
      }
      if (x.periodo !== 'Mes actual') alertas.push(`Documento de otro mes (${x.mes})`);
      if (x.validacionXML && !['Validado DIAN', 'Sin información'].includes(x.validacionXML)) alertas.push(`Validación en el XML: ${x.validacionXML}`);
      if (Math.abs(x.cuadre || 0) >= 1) alertas.push(`El XML no cuadra internamente (diferencia ${U.fmtNum(x.cuadre, 2)})`);
      x.estadoCruce = estado;
      xmlDian.push(filaXml(x, d, estado, alertas, metodo));
    }
    for (const d of dianDocs) {
      if (usadosDian.has(d.id) || d.grupo !== 'Recibido' || d.periodo !== 'Mes actual') continue;
      xmlDian.push(filaXml(null, d, 'Falta XML', ['Descargue el XML del correo o del portal DIAN (con el CUFE) y guárdelo en 01. Causaciones'], null));
    }
    xmlDian.sort((a, b) => posicion(ORDEN_XML, a.estado) - posicion(ORDEN_XML, b.estado) || (a.fecha || 0) - (b.fecha || 0));

    // ---------- Eventos por acusar ----------
    // Facturas recibidas a crédito (forma de pago del reporte DIAN o, si falta, la del XML) que no están en el reporte de Eventos.
    // Una factura con nota crédito no se acusa. El XML de la nota trae la factura que afecta (CUFE y número);
    // las notas que solo están en el reporte DIAN no lo traen: se toman como "posible" si son del mismo proveedor y valor.
    const hoy = U.hoySerial();
    const MOTIVOS_NC = { 1: 'Devolución parcial', 2: 'Anulación de factura', 3: 'Rebaja o descuento', 4: 'Ajuste de precio', 5: 'Descuento por pronto pago', 6: 'Descuento por volumen' };
    const notasDe = new Map(); // CUFE o proveedor|número de la factura -> notas crédito
    const agregarNota = (clave, nota) => { if (!clave) return; if (!notasDe.has(clave)) notasDe.set(clave, []); if (!notasDe.get(clave).includes(nota)) notasDe.get(clave).push(nota); };
    const ncConXml = new Set();
    for (const x of xmlPorId.values()) {
      if (x.tipo !== 'Nota crédito' || x.grupo !== 'Recibido') continue;
      if (x.dian) ncConXml.add(x.dian.id);
      const nota = { documento: x.numero, total: x.total, fecha: x.fecha,
        motivo: [MOTIVOS_NC[x.codigoNota], x.motivoNota].filter(Boolean).join(': ') };
      for (const r of x.referencias) {
        agregarNota(r.cufe && r.cufe.toLowerCase(), nota);
        const c = U.claveDoc(r.numero).completa;
        if (c) agregarNota(`${x.nit}|${c}`, nota);
      }
    }
    const ncSoloDian = dian.filter((d) => d.grupo === 'Recibido' && d.clase === 'NC compra' && !ncConXml.has(d.id));
    const notasDeFactura = (id, nit, documento) => {
      const lista = [...(notasDe.get(id) || []), ...(notasDe.get(`${nit}|${U.claveDoc(documento).completa}`) || [])];
      return [...new Set(lista)];
    };
    const fmtNota = (n) => `${n.documento} por $ ${U.fmtNum(n.total, 2)}${n.motivo ? ` (${n.motivo})` : ''}`;

    const filaEvento = (d, x) => {
      const id = d?.id ?? x.id;
      const ev = eventos.get(id) || null;
      const alertas = [];
      const nitDoc = d?.nit ?? x.nit, docNum = d?.documento ?? x.numero, totalDoc = d?.total ?? x.total, fechaDoc = d?.fecha ?? x.fecha;
      const notas = notasDeFactura(id, nitDoc, docNum);
      const posibles = notas.length ? [] : ncSoloDian.filter((n) => n.nit === nitDoc && Math.abs(n.total - totalDoc) <= tolDoc
        && (n.fecha === null || fechaDoc === null || n.fecha >= fechaDoc));
      const pendientes = ev ? [['Recepción factura', ev.recepcionFactura], ['Recepción mercancía', ev.recepcionMercancia], ['Aceptación', ev.aceptacion]]
        .filter(([, v]) => v !== 'Validado').map(([k, v]) => `${k}: ${v || 'sin registrar'}`) : [];
      let estado;
      if (ev && !pendientes.length) estado = 'Con evento';
      else if (notas.length) estado = 'Con nota crédito (no acusar)';
      else if (posibles.length) estado = 'Revisar: posible nota crédito';
      else estado = ev ? 'Evento incompleto' : 'Por acusar';
      if (notas.length) {
        const totalNotas = U.suma(notas, (n) => n.total);
        alertas.push(`Nota crédito ${notas.map(fmtNota).join(', ')}${totalNotas + tolDoc >= totalDoc ? ' · anula el total' : ' · parcial'}`);
      }
      if (posibles.length) alertas.push(`Nota crédito del mismo proveedor y valor en la DIAN: ${posibles.map((n) => n.documento).join(', ')}. Confirme a qué factura corresponde antes de acusar`);
      if (pendientes.length && estado !== 'Con nota crédito (no acusar)') alertas.push(pendientes.join(', '));
      // Los XML y la digitación de otros meses están en la carpeta de ese mes: solo se exigen para el mes actual
      const periodoDoc = d?.periodo ?? x.periodo;
      const mesActual = periodoDoc === 'Mes actual';
      if (!x && mesActual) alertas.push('Sin XML en 01. Causaciones');
      if (!d) alertas.push('Aún no aparece en el reporte DIAN');
      const sci = enSCI(id, d?.nit ?? x.nit, d?.documento ?? x.numero);
      if (!x && !mesActual && sci.estadoSCI === 'Sin contabilizar') sci.estadoSCI = null;
      const fecha = d?.fecha ?? x.fecha;
      return {
        estado, alertas: alertas.join(' | '), periodo: periodoDoc, mes: etiquetaMes(fecha), fecha, dias: fecha === null ? null : hoy - fecha,
        nit: d?.nit ?? x.nit, tercero: d?.tercero || x?.tercero || null, documento: d?.documento ?? x.numero, total: d?.total ?? x.total,
        vencimiento: x?.vencimiento ?? null, tieneXML: x ? 'Sí' : mesActual ? 'No' : 'Otro mes', ...sci,
        estadoEvento: ev?.estado ?? null, recepcionFactura: ev?.recepcionFactura ?? null, recepcionMercancia: ev?.recepcionMercancia ?? null,
        aceptacion: ev?.aceptacion ?? null, fechaEvento: ev?.fechaRegistro ?? null, cufe: d?.cufe ?? x.cufe,
      };
    };
    const eventosPendientes = [];
    for (const d of dian) {
      if (d.grupo !== 'Recibido' || !d.tipoDIAN.startsWith('Factura electrónica')) continue;
      const x = xmlPorId.get(d.id) || xmls.find((z) => z.dian === d);
      if ((d.formaPago || x?.formaPago) === 'Crédito') eventosPendientes.push(filaEvento(d, x || null));
    }
    for (const x of xmlPorId.values()) {
      if (!x.dian && x.grupo === 'Recibido' && x.tipo === 'Factura' && x.formaPago === 'Crédito') eventosPendientes.push(filaEvento(null, x));
    }
    eventosPendientes.sort((a, b) => posicion(ORDEN_EVENTOS, a.estado) - posicion(ORDEN_EVENTOS, b.estado) || (a.fecha || 0) - (b.fecha || 0));

    // ---------- Extractos ----------
    const conceptos = config.conceptosBancarios.filter((c) => U.texto(c.texto));
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const categoria = (banco, desc) => conceptos.find((c) => (!U.texto(c.banco) || norm(c.banco) === norm(banco))
      && norm(desc).includes(norm(c.texto))) || null;
    const extractos = [
      ...filasDe('Extracto Bancolombia').map((r) => ({ banco: r._banco, cuenta: r.cuenta, fecha: U.fecha(r.fecha, 'yyyyMMdd'),
        valor: U.num(r.valor), referencia: r.referencia, descripcion: U.texto(r.descripcion), archivo: r._archivo })),
      ...filasDe('Extracto Davivienda').map((r) => {
        const tipo = (U.texto(r['Transacción']) || '').toLowerCase();
        const v = Math.abs(n0(r['Valor Total']));
        return { banco: r._banco, cuenta: null, fecha: U.fecha(r['Fecha de Sistema'], 'dd/MM/yyyy'),
          valor: tipo.includes('débito') || tipo.includes('debito') ? -v : v, referencia: U.texto(r.Documento),
          descripcion: U.texto(r['Descripción motivo']), archivo: r._archivo };
      }),
    ].filter((e) => e.fecha !== null && e.valor !== null)
      .map((e, i) => { const c = categoria(e.banco, e.descripcion); return { ...e, valor: U.redondear(e.valor), idE: i + 1, categoria: c?.categoria || null, cuentaContable: U.texto(c?.cuenta) }; });

    // ---------- Libro de bancos SCI (+ partidas de meses anteriores) ----------
    const libros = filasDe('Libro bancos SCI').map((r) => {
      const debitos = n0(r.DEBITOS), creditos = n0(r.CREDITOS);
      return { banco: r._banco, cuentaSCI: U.texto(r.NOMBRE), fecha: U.fecha(r.FECHA, 'dd-MMM-yyyy'), documentoSCI: U.texto(r.DOCUMENTO),
        docReferencia: U.texto(r['DOCUMENTO REFERENCIA']), descripcionSCI: U.texto(r.DESCRIPCION), beneficiario: U.texto(r.BENEFICIARIO),
        debitos, creditos, saldoAnterior: n0(r['SALDO ANTERIOR']), valor: U.redondear(debitos - creditos), archivo: r._archivo };
    });
    for (const p of config.partidasAnteriores[periodo.empresa] || []) {
      const valor = U.num(p.valor);
      if (!U.texto(p.banco) || valor === null) continue;
      libros.push({ banco: p.banco.trim(), cuentaSCI: null, fecha: U.fecha(p.fecha, 'yyyy-MM-dd'), documentoSCI: U.texto(p.documento),
        docReferencia: null, descripcionSCI: 'Pendiente de meses anteriores', beneficiario: U.texto(p.beneficiario),
        debitos: 0, creditos: 0, saldoAnterior: 0, valor: U.redondear(valor), archivo: 'Partidas anteriores' });
    }

    const bancos = conciliarBancos(extractos, libros, P, periodo.corte);

    // ---------- Saldos por banco ----------
    const nombresBancos = U.unicos([...libros.map((l) => l.banco), ...extractos.map((e) => e.banco)]);
    const saldos = nombresBancos.map((b) => {
      const l = libros.filter((x) => x.banco === b);
      const e = extractos.filter((x) => x.banco === b);
      const saldoAnterior = U.suma(l.filter((x) => x.fecha === null), (x) => x.saldoAnterior);
      const debitos = U.suma(l, (x) => x.debitos), creditos = U.suma(l, (x) => x.creditos);
      return { banco: b, cuentaSCI: U.unicos(l.map((x) => x.cuentaSCI)).join(', '), tieneLibro: l.some((x) => x.archivo !== 'Partidas anteriores'),
        saldoAnterior, debitos, creditos, saldoFinal: saldoAnterior + debitos - creditos, netoExtracto: U.suma(e, (x) => x.valor), movimientosExtracto: e.length };
    });

    // ---------- Gastos bancarios ----------
    const gastos = [...U.agrupar(bancos.filter((b) => b.categoria && b.fechaExtracto !== null), (b) => `${b.banco}|${b.categoria}|${b.cuentaContable || ''}`).values()].map((g) => {
      const pendiente = U.redondear(U.suma(g.filter((x) => x.estado === 'Gasto bancario por registrar'), (x) => x.valorExtracto));
      const difConciliar = U.redondear(U.suma(g.filter((x) => x.partida === 'Diferencia de valor'), (x) => x.diferencia));
      const cuenta = g[0].cuentaContable || '(defina la cuenta en Configuración)';
      let asiento;
      if (pendiente === 0 && difConciliar === 0) asiento = 'Ya registrado';
      else if (pendiente === 0) asiento = `Revise: lo registrado en SCI difiere del extracto en ${U.fmtNum(difConciliar, 2)}`;
      else if (pendiente < 0) asiento = `DB ${cuenta} / CR Banco ${g[0].banco} por ${U.fmtNum(-pendiente, 2)}`;
      else asiento = `DB Banco ${g[0].banco} / CR ${cuenta} por ${U.fmtNum(pendiente, 2)}`;
      return { banco: g[0].banco, categoria: g[0].categoria, cuentaContable: g[0].cuentaContable, movimientos: g.length,
        valorExtracto: U.redondear(U.suma(g, (x) => x.valorExtracto)), registradoSCI: U.redondear(U.suma(g, (x) => x.valorLibros)),
        diferenciaPorConciliar: difConciliar, pendiente, asiento };
    }).sort((a, b) => a.banco.localeCompare(b.banco) || a.pendiente - b.pendiente);

    // ---------- Tabla de codificación (conceptos y cuentas por tipo de transacción) ----------
    const nombreTipo = new Map(config.tiposSCI.map((t) => [String(t.tipo).split('-')[0].trim(), String(t.tipo).trim()]));
    const NATURALEZA = { 1: 'Débito', 2: 'Crédito' };
    const codificacion = filasDe('Tabla de codificación').map((r) => {
      const codTipo = r['Tipo transaccion'];
      return {
        codigoTipo: codTipo, tipo: nombreTipo.get(codTipo) || codTipo, codigo: r['Codigo Concepto'], nombre: r['Nombre Concepto'],
        cuentaBruto: r['Cuenta Bruto'], natBruto: NATURALEZA[r['Debito Credito Bruto']] || null,
        cuentaIva: r['Cuenta Iva'], natIva: NATURALEZA[r['Debito Credito Iva']] || null,
        cuentaRetencion: r['Cuenta Retencion'], natRetencion: NATURALEZA[r['Debito Credito Reten']] || null,
        cuentaTotal: r['Cuenta Total'], natTotal: NATURALEZA[r['Debito Credito Total']] || null,
        cuentaRteIva: r['Cuenta Rte Iva'], natRteIva: NATURALEZA[r['Deb Cre Rte Iva']] || null,
        comprobante: r.Comprobante, prefijo: r['Prefijo Documento'], activo: r['Concepto Activo'] === 'N' ? 'Inactivo' : 'Activo',
      };
    }).sort((a, b) => String(a.codigoTipo).localeCompare(String(b.codigoTipo), 'es', { numeric: true })
      || String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }));

    // ---------- Control de carga ----------
    const fechasPorArchivo = U.agrupar([
      ...dian.map((d) => [d.archivo, d.fecha]), ...lineas.map((l) => [l.archivo, l.fecha]),
      ...extractos.map((e) => [e.archivo, e.fecha]), ...libros.map((l) => [l.archivo, l.fecha]), ...xmls.map((x) => [x.archivo, x.fecha]),
    ].filter((x) => x[1] !== null), (x) => x[0]);
    const control = cargas.map((c) => {
      const f = (fechasPorArchivo.get(c.archivo) || []).map((x) => x[1]);
      const filas = c.datos ? c.datos.length : 0;
      return { fuente: c.fuente, banco: c.banco, archivo: c.archivo, estado: c.error ? 'Error' : c.omitido ? 'Omitido' : filas === 0 ? 'Sin datos' : 'OK', filas,
        fechaMin: f.length ? Math.min(...f) : null, fechaMax: f.length ? Math.max(...f) : null, modificado: c.modificado,
        error: c.error || (c.omitido ? `${c.omitido}: no es factura ni nota, no se tiene en cuenta` : c.aviso || null) };
    }).sort((a, b) => a.fuente.localeCompare(b.fuente) || a.archivo.localeCompare(b.archivo));

    // ---------- Advertencias ----------
    const adv = [];
    for (const c of cargas.filter((x) => x.error)) adv.push({ tipo: 'Archivo con error', detalle: `${c.fuente} - ${c.archivo}: ${c.error}`, cantidad: 1 });
    for (const c of cargas.filter((x) => x.aviso)) adv.push({ tipo: 'XML con líneas sin leer', detalle: `${c.archivo}: ${c.aviso}`, cantidad: 1 });
    if (xmls.length && !nitEmpresa) adv.push({ tipo: 'NIT de la empresa sin identificar', detalle: 'No se pudo saber qué XML son recibidos o emitidos: se tratan todos como recibidos', cantidad: 0 });
    const conDatos = new Set(cargas.filter((c) => c.datos).map((c) => c.fuente));
    for (const f of FUENTES_ESPERADAS) if (!conDatos.has(f)) adv.push({ tipo: 'Fuente sin archivos', detalle: `${f}: no se encontró ningún archivo válido en la carpeta`, cantidad: 0 });
    for (const [k, g] of U.agrupar(dian.filter((d) => d.clase === 'Sin clasificar'), (d) => `${d.tipoDIAN} (${d.grupo})`)) {
      adv.push({ tipo: 'Tipo DIAN sin clasificar', detalle: `${k}: agréguelo en Configuración > Tipos DIAN`, cantidad: g.length });
    }
    for (const [k, g] of U.agrupar(lineas.filter((l) => l.clase === 'Sin clasificar'), (l) => l.tipoSCI)) {
      adv.push({ tipo: 'Tipo SCI sin clasificar', detalle: `${k}: agréguelo en Configuración > Tipos SCI`, cantidad: g.length });
    }
    for (const [k, g] of U.agrupar(lineas.filter((l) => CLASES_DOC.includes(l.clase) && l.codIva !== null && l.pctIva === null), (l) => l.codIva)) {
      adv.push({ tipo: 'Código IVA sin tarifa', detalle: `Código ${k} no existe en la tabla de impuestos (IVA tomado como 0)`, cantidad: g.length });
    }
    const inicioMes = U.serial(anio, mes, 1);
    for (const c of control.filter((x) => ['Digitación SCI', 'Extracto Bancolombia', 'Extracto Davivienda', 'Libro bancos SCI'].includes(x.fuente) && x.fechaMin !== null)) {
      if (c.fechaMin < inicioMes || c.fechaMax > periodo.corte) {
        adv.push({ tipo: 'Archivo con fechas de otro mes', detalle: `${c.archivo}: tiene movimientos del ${U.fmtFecha(c.fechaMin)} al ${U.fmtFecha(c.fechaMax)} y el periodo es ${periodo.nombre}. Si es de otro mes, sáquelo de esta carpeta.`, cantidad: c.filas });
      }
    }
    if (!impArchivo.length) adv.push({ tipo: 'Tabla de impuestos manual', detalle: "No hay archivo en la carpeta 'Tabla de impuestos': se usa la tabla de respaldo de Configuración", cantidad: 0 });
    for (const [k, g] of repetidos) {
      adv.push({ tipo: 'Código repetido en tabla de impuestos', detalle: `${k.replace('|', '-')} aparece ${g.length} veces (${g.map((t) => `${t.porcentaje} % ${t.nombre || ''}`.trim()).join(' y ')}). Se usa el primero.`, cantidad: g.length });
    }

    return { periodo, conjunto, cargas, dian, lineas, sciDocs, compras, ventas, extractos, libros, bancos, saldos, gastos, control,
      advertencias: adv, tarifasEnUso, origenImpuestos, xmls, xmlDian, eventosPendientes, nitEmpresa, corteDian, codificacion };
  }

  // ---------- Conciliación bancaria en 4 pasos ----------
  // Solo es "Conciliado" si extracto y libros son iguales al centavo; cualquier diferencia queda "Por conciliar".
  function conciliarBancos(E, librosTodos, P, corte) {
    const tolDias = Number(P.toleranciaDiasBancos) || 0;
    const maxDif = Number(P.diferenciaMaximaEmparejarBancos) || 0;
    const hayDif = (d) => d !== null && d !== undefined && Math.abs(U.redondear(d)) > 0;
    const L = librosTodos.filter((l) => l.fecha !== null && l.valor !== 0).map((l, i) => ({ ...l, idL: i + 1 }));
    const LporId = new Map(L.map((l) => [l.idL, l]));
    const pares = new Map(); // idE -> { idL, metodo, vl, dif, difGrupo }
    const usadosE = new Set(), usadosL = new Set();

    // Paso 1: banco + fecha + valor + número de ocurrencia
    const codigos = (lista) => { const c = new Map(); return lista.map((x) => { const b = `${x.banco}_${x.fecha}_${x.valor.toFixed(2)}`; const n = (c.get(b) || 0) + 1; c.set(b, n); return [`${b}_${n}`, x]; }); };
    const libroPorCodigo = new Map(codigos(L));
    for (const [k, e] of codigos(E)) {
      const l = libroPorCodigo.get(k);
      if (!l) continue;
      pares.set(e.idE, { idL: l.idL, metodo: 'Fecha y valor exactos', vl: l.valor, dif: 0, difGrupo: 0 });
      usadosE.add(e.idE); usadosL.add(l.idL);
    }

    // Paso 2: valor parecido con fecha cercana (los gastos bancarios solo con valor idéntico)
    const candidatos = [];
    for (const e of E) {
      if (usadosE.has(e.idE)) continue;
      for (const l of L) {
        if (usadosL.has(l.idL) || l.banco !== e.banco) continue;
        const d = Math.abs(e.valor - l.valor);
        const permitido = e.categoria ? U.redondear(d) === 0 : d <= maxDif;
        const dias = Math.abs(e.fecha - l.fecha);
        if (permitido && dias <= tolDias) candidatos.push({ e, l, d, dias });
      }
    }
    candidatos.sort((a, b) => a.d - b.d || a.dias - b.dias || a.e.idE - b.e.idE);
    for (const { e, l, dias } of candidatos) {
      if (usadosE.has(e.idE) || usadosL.has(l.idL)) continue;
      const dif = U.redondear(e.valor - l.valor);
      pares.set(e.idE, { idL: l.idL, vl: l.valor, dif, difGrupo: dif,
        metodo: `${dias === 0 ? 'Misma fecha' : `Fecha distinta (${dias} días)`}${hayDif(dif) ? ', valor distinto' : ', mismo valor'}` });
      usadosE.add(e.idE); usadosL.add(l.idL);
    }

    // Paso 3: gastos bancarios unificados. SCI los causa en un solo registro con el banco como tercero, al cierre del mes:
    // la suma de todos los cargos se cruza con un registro de salida y la de todos los abonos con uno de entrada.
    // Se prefiere el registro a nombre del banco y más cercano al último día del mes; con el banco como tercero se acepta
    // diferencia hasta la máxima para emparejar (queda Por conciliar), con otro tercero solo valor idéntico.
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const finMes = corte ?? Math.max(...E.map((e) => e.fecha));
    const unificar = (soloBanco) => {
      const grupos = U.agrupar(E.filter((e) => e.categoria && !usadosE.has(e.idE)), (e) => `${e.banco}|${e.valor < 0 ? 'cargos' : 'abonos'}`);
      for (const g of grupos.values()) {
        const sumaG = U.redondear(U.suma(g, (e) => e.valor));
        const aNombreDelBanco = (l) => norm(l.beneficiario).includes(norm(g[0].banco));
        const opciones = L.filter((l) => !usadosL.has(l.idL) && l.banco === g[0].banco && Math.sign(l.valor) === Math.sign(sumaG)
          && (soloBanco ? aNombreDelBanco(l) && Math.abs(l.valor - sumaG) <= maxDif : U.redondear(l.valor - sumaG) === 0))
          .sort((a, b) => Math.abs(a.fecha - finMes) - Math.abs(b.fecha - finMes) || Math.abs(a.valor - sumaG) - Math.abs(b.valor - sumaG));
        if (!opciones.length) continue;
        const l = opciones[0];
        const dif = U.redondear(sumaG - l.valor);
        const metodo = `En bloque: ${sumaG < 0 ? 'cargos' : 'abonos'} bancarios del mes unificados en SCI, doc. ${l.documentoSCI || ''} (extracto ${U.fmtNum(sumaG, 2)} / libros ${U.fmtNum(l.valor, 2)})`;
        // Cada movimiento queda registrado por su propio valor; la diferencia se carga al de mayor valor
        const mayor = g.reduce((a, b) => (Math.abs(b.valor) > Math.abs(a.valor) ? b : a));
        for (const e of g) {
          const d = e === mayor ? dif : 0;
          pares.set(e.idE, { idL: l.idL, metodo, vl: U.redondear(e.valor - d), dif: d, difGrupo: d });
          usadosE.add(e.idE);
        }
        usadosL.add(l.idL);
      }
    };
    unificar(true);

    // Paso 3b: total de una categoría del mes contra un solo registro en libros (solo con valor idéntico,
    // para no confundir el total de gastos bancarios con un egreso de valor parecido)
    const gruposCat = U.agrupar(E.filter((e) => e.categoria && !usadosE.has(e.idE)), (e) => `${e.banco}|${e.categoria}`);
    for (const g of gruposCat.values()) {
      const sumaG = U.redondear(U.suma(g, (e) => e.valor));
      const l = L.find((x) => !usadosL.has(x.idL) && x.banco === g[0].banco && U.redondear(x.valor - sumaG) === 0);
      if (!l) continue;
      const dif = 0;
      const metodo = `En bloque: total ${g[0].categoria} del mes (extracto ${U.fmtNum(sumaG, 2)} / libros ${U.fmtNum(l.valor, 2)})`;
      g.sort((a, b) => a.idE - b.idE).forEach((e, i) => {
        pares.set(e.idE, { idL: l.idL, metodo, vl: i === 0 ? l.valor : null, dif: i === 0 ? dif : null, difGrupo: dif });
        usadosE.add(e.idE);
      });
      usadosL.add(l.idL);
    }

    // Paso 3c: lo que quede, unificado contra un registro de otro tercero solo si el valor es idéntico
    unificar(false);

    // Paso 4: pago en lote (varios egresos del mismo día = un débito del extracto)
    const lotes = [...U.agrupar(L.filter((l) => !usadosL.has(l.idL)), (l) => `${l.banco}|${l.fecha}`).values()]
      .filter((g) => g.length >= 2).map((g) => ({ banco: g[0].banco, fecha: g[0].fecha, suma: U.redondear(U.suma(g, (l) => l.valor)), ids: g.map((l) => l.idL), usado: false }));
    const loteDeL = new Map();
    for (const e of E) {
      if (usadosE.has(e.idE) || e.categoria) continue;
      const opciones = lotes.filter((o) => !o.usado && o.banco === e.banco && Math.abs(o.fecha - e.fecha) <= tolDias && Math.abs(o.suma - e.valor) <= maxDif)
        .sort((a, b) => Math.abs(a.suma - e.valor) - Math.abs(b.suma - e.valor));
      if (!opciones.length) continue;
      const o = opciones[0];
      o.usado = true;
      const dif = U.redondear(e.valor - o.suma);
      pares.set(e.idE, { idL: null, vl: o.suma, dif, difGrupo: dif, metodo: `Pago en lote: ${o.ids.length} registros en libros del ${U.fmtFecha(o.fecha).slice(0, 5)}` });
      usadosE.add(e.idE);
      for (const id of o.ids) loteDeL.set(id, { metodo: `Pago en lote: parte del movimiento del extracto del ${U.fmtFecha(e.fecha).slice(0, 5)}`, difGrupo: dif });
    }

    // Vista final
    const filas = [];
    for (const e of E) {
      const p = pares.get(e.idE);
      const l = p && p.idL ? LporId.get(p.idL) : null;
      let estado;
      if (!p) estado = e.categoria ? 'Gasto bancario por registrar' : 'Falta registrar en libros';
      else if (hayDif(p.difGrupo)) estado = 'Por conciliar: diferencia de valor';
      else if (p.metodo.startsWith('Fecha distinta')) estado = 'Conciliado (fecha distinta)';
      else if (p.metodo.startsWith('En bloque') || p.metodo.startsWith('Pago en lote')) estado = 'Conciliado en bloque';
      else estado = 'Conciliado';
      filas.push({ banco: e.banco, estado, origen: 'Extracto', fecha: e.fecha, valorExtracto: e.valor, valorLibros: p ? p.vl : null,
        diferencia: p ? p.dif : null, descripcionExtracto: e.descripcion, descripcionSCI: l?.descripcionSCI ?? null,
        documentoSCI: l?.documentoSCI ?? null, docReferencia: l?.docReferencia ?? null, beneficiario: l?.beneficiario ?? null,
        categoria: e.categoria, cuentaContable: e.cuentaContable, fechaExtracto: e.fecha, fechaLibros: l?.fecha ?? null,
        metodo: p?.metodo ?? null, referencia: e.referencia });
    }
    const emparejadosL = new Set([...pares.values()].map((p) => p.idL).filter(Boolean));
    for (const l of L) {
      if (emparejadosL.has(l.idL)) continue;
      const lote = loteDeL.get(l.idL);
      const estado = !lote ? 'No aparece en extracto' : hayDif(lote.difGrupo) ? 'Por conciliar: diferencia de valor' : 'Conciliado en bloque';
      filas.push({ banco: l.banco, estado, origen: 'Libros', fecha: l.fecha, valorExtracto: null, valorLibros: l.valor, diferencia: null,
        descripcionExtracto: null, descripcionSCI: l.descripcionSCI, documentoSCI: l.documentoSCI, docReferencia: l.docReferencia,
        beneficiario: l.beneficiario, categoria: null, cuentaContable: null, fechaExtracto: null, fechaLibros: l.fecha,
        metodo: lote?.metodo ?? null, referencia: null });
    }
    for (const f of filas) {
      if (f.estado === 'No aparece en extracto') { f.partida = 'Libros no en extracto'; f.valorPartida = f.valorLibros; }
      else if (f.estado === 'Falta registrar en libros' || f.estado === 'Gasto bancario por registrar') { f.partida = 'Extracto no en libros'; f.valorPartida = f.valorExtracto; }
      else if (f.estado === 'Por conciliar: diferencia de valor' && hayDif(f.diferencia)) { f.partida = 'Diferencia de valor'; f.valorPartida = f.diferencia; }
      else { f.partida = null; f.valorPartida = null; }
    }
    return filas.sort((a, b) => a.banco.localeCompare(b.banco) || posicion(ORDEN_BANCOS, a.estado) - posicion(ORDEN_BANCOS, b.estado) || a.fecha - b.fecha);
  }

  // Modelo de conciliación de un banco (libros -> extracto)
  function modeloConciliacion(resultado, banco, saldoExtracto) {
    const s = resultado.saldos.find((x) => x.banco === banco);
    const filas = resultado.bancos.filter((b) => b.banco === banco);
    const sp = (f) => U.redondear(U.suma(filas.filter(f), (b) => b.valorPartida)) + 0;
    const libros = s ? s.saldoFinal : 0;
    const cheques = 0 - sp((b) => b.partida === 'Libros no en extracto' && b.valorPartida < 0) || 0;
    const consignaciones = 0 - sp((b) => b.partida === 'Libros no en extracto' && b.valorPartida > 0) || 0;
    const notasCredito = sp((b) => b.partida === 'Extracto no en libros' && b.valorPartida > 0);
    const notasDebito = sp((b) => b.partida === 'Extracto no en libros' && b.valorPartida < 0);
    const diferencias = sp((b) => b.partida === 'Diferencia de valor');
    const calculado = U.redondear(libros + cheques + consignaciones + notasCredito + notasDebito + diferencias);
    const digitado = saldoExtracto === null || saldoExtracto === undefined || saldoExtracto === '' ? null : Number(saldoExtracto);
    const sinExplicar = digitado === null ? null : U.redondear(calculado - digitado);
    // Movimiento del mes: entradas y salidas de dinero en libros y en el extracto
    const ext = resultado.extractos.filter((e) => e.banco === banco);
    const movimiento = {
      saldoAnteriorLibros: s ? s.saldoAnterior : 0,
      entradasLibros: s ? U.redondear(s.debitos) : 0, salidasLibros: s ? U.redondear(s.creditos) : 0,
      entradasExtracto: U.redondear(U.suma(ext.filter((e) => e.valor > 0), (e) => e.valor)),
      salidasExtracto: U.redondear(-U.suma(ext.filter((e) => e.valor < 0), (e) => e.valor)) + 0,
      nEntradasExtracto: ext.filter((e) => e.valor > 0).length, nSalidasExtracto: ext.filter((e) => e.valor < 0).length,
    };
    return { banco, cuenta: s?.cuentaSCI || '', tieneLibro: !!s?.tieneLibro, libros, cheques, consignaciones, notasCredito, notasDebito,
      diferencias, calculado, digitado, sinExplicar, movimiento };
  }

  return { procesar, modeloConciliacion, ORDEN_DOCS, ORDEN_BANCOS, ORDEN_XML, ORDEN_EVENTOS };
})();
