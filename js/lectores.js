// Lectores de cada reporte. Cada subcarpeta de "06. Reportes sistema de contabilizacion (SCI)" tiene su lector,
// y los XML de facturas se toman de "01. Causaciones" (con todas sus subcarpetas).
'use strict';

const Lectores = (() => {
  const FUENTES = {
    'dian': { fuente: 'DIAN', ext: ['xlsx', 'xlsm'] },
    'digitacion': { fuente: 'Digitación SCI', ext: ['xlsx', 'xlsm'] },
    'digitación': { fuente: 'Digitación SCI', ext: ['xlsx', 'xlsm'] },
    'eventos': { fuente: 'Eventos', ext: ['xlsx', 'xlsm'] },
    'mov bancolombia': { fuente: 'Extracto Bancolombia', ext: ['csv'] },
    'mov davivienda': { fuente: 'Extracto Davivienda', ext: ['xlsx', 'xlsm'] },
    'tabla de impuestos': { fuente: 'Tabla de impuestos', ext: ['csv', 'xlsx'] },
    'tabla de codificacion': { fuente: 'Tabla de codificación', ext: ['csv', 'xlsx'] },
    'tabla de codificación': { fuente: 'Tabla de codificación', ext: ['csv', 'xlsx'] },
  };

  function clasificarCarpeta(carpeta) {
    const c = carpeta.toLowerCase().trim();
    if (FUENTES[c]) return { ...FUENTES[c], banco: c.startsWith('mov ') ? capitalizar(c.slice(4)) : null };
    if (c.startsWith('sci ')) return { fuente: 'Libro bancos SCI', ext: ['xlsx', 'xlsm'], banco: capitalizar(c.slice(4)) };
    return null;
  }
  const capitalizar = (s) => s.replace(/\b\p{L}/gu, (l) => l.toUpperCase());

  const esCausaciones = (s) => /^(\d{1,2}\.\s*)?causaciones$/i.test(s.trim());
  const esReportes = (s) => /reportes/i.test(s);
  const XML = { fuente: 'XML Causaciones', ext: ['xml', 'zip'], banco: null };

  // Agrupa los archivos seleccionados por carpeta de la empresa (empresa + mes):
  //   <empresa>\01. Causaciones\...\*.xml                      -> facturas XML
  //   <empresa>\06. Reportes sistema de contabilizacion (SCI)\<subcarpeta>\archivo -> reportes
  function detectarConjuntos(archivos) {
    const conjuntos = new Map();
    const agregar = (segmentos, entrada) => {
      const raiz = segmentos.join('/');
      if (!conjuntos.has(raiz)) conjuntos.set(raiz, { raiz, segmentos, archivos: [] });
      conjuntos.get(raiz).archivos.push(entrada);
    };
    for (const f of archivos) {
      const ruta = (f.webkitRelativePath || f.rutaRelativa || f.name).replace(/\\/g, '/');
      const seg = ruta.split('/');
      if (seg.length < 2) continue;
      const nombre = seg[seg.length - 1];
      if (nombre.startsWith('~$') || nombre.startsWith('.')) continue;
      const ext = nombre.split('.').pop().toLowerCase();
      const iCausaciones = seg.slice(0, -1).findIndex(esCausaciones);
      if (iCausaciones >= 0) {
        if (XML.ext.includes(ext)) agregar(seg.slice(0, iCausaciones), { archivo: f, nombre, carpeta: seg.slice(iCausaciones, -1).join('/'), ...XML });
        continue;
      }
      const info = clasificarCarpeta(seg[seg.length - 2]);
      if (!info || !info.ext.includes(ext)) continue;
      const padre = seg.slice(0, seg.length - 2);
      agregar(padre.length && esReportes(padre[padre.length - 1]) ? padre.slice(0, -1) : padre, { archivo: f, nombre, carpeta: seg[seg.length - 2], ...info });
    }
    const lista = [...conjuntos.values()].map((c) => ({ ...c, ...describir(c.segmentos), fuentes: new Set(c.archivos.map((a) => a.fuente)).size,
      xmls: c.archivos.filter((a) => a.fuente === XML.fuente).length }));
    lista.sort((a, b) => (b.anio || 0) * 12 + (b.mes || 0) - ((a.anio || 0) * 12 + (a.mes || 0)) || b.fuentes - a.fuentes
      || (a.empresa || '').localeCompare(b.empresa || ''));
    return lista;
  }

  // Segmentos de la carpeta de la empresa: ...\2026\09. Septiembre de 2026\01. Inversiones Mindala SAS
  function describir(segmentos) {
    const patronMes = /^(\d{1,2})\.\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})$/i;
    let anio = null, mes = null, empresa = null;
    for (const s of segmentos) {
      const m = patronMes.exec(s.trim());
      if (m) { mes = parseInt(m[1], 10); anio = parseInt(m[3], 10); }
    }
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && !patronMes.test(ultimo.trim()) && !/^\d{4}$/.test(ultimo.trim())) empresa = ultimo.replace(/^\d{1,2}\.\s*/, '').trim();
    return { anio, mes, empresa };
  }

  const filaATexto = (fila) => (fila || []).map((v) => U.texto(v) || '');
  function porEncabezado(filas, filaEncabezado) {
    const enc = filaATexto(filas[filaEncabezado]);
    const salida = [];
    for (let i = filaEncabezado + 1; i < filas.length; i++) {
      const f = filas[i] || [];
      const o = {};
      enc.forEach((h, j) => { if (h) o[h] = f[j] ?? null; });
      salida.push(o);
    }
    return { encabezados: enc, filas: salida };
  }
  const exigir = (encabezados, columnas, mensaje) => {
    if (!columnas.every((c) => encabezados.includes(c))) throw new Error(mensaje);
  };

  async function dian(file) {
    const { encabezados, filas } = porEncabezado(await Archivos.leerXlsx(await file.arrayBuffer()), 0);
    exigir(encabezados, ['CUFE/CUDE', 'Grupo', 'Total'], 'No parece un reporte de la DIAN: faltan las columnas CUFE/CUDE, Grupo o Total');
    return filas.filter((r) => U.texto(r['CUFE/CUDE']));
  }

  // "Movimiento por transacción": encabezados en la fila 3, columnas por posición (hay dos columnas "Documento").
  async function digitacion(file) {
    const filas = await Archivos.leerXlsx(await file.arrayBuffer());
    if (!String(U.texto((filas[2] || [])[2]) || '').startsWith('Nombre Transacci')) {
      throw new Error("No parece un reporte 'Movimiento por transacción' de SCI (fila 3, columna C)");
    }
    const col = { registro: 1, tipo: 3, docContable: 5, fecha: 6, nit: 7, tercero: 8, documento: 13, asiento: 16, codIva: 17,
      codReteIva: 19, codRetencion: 20, descripcion: 26, centroCosto: 28, usuario: 29, fechaDigitacion: 35, subtotal: 44, valorNeto: 45 };
    const salida = [];
    for (let i = 3; i < filas.length; i++) {
      const f = filas[i] || [];
      const tipo = f[col.tipo - 1];
      if (esError(tipo) || !U.texto(tipo)) continue;
      const o = {};
      for (const [k, c] of Object.entries(col)) o[k] = f[c - 1] ?? null;
      salida.push(o);
    }
    salida.encabezado = U.texto((filas[0] || [])[0]);
    return salida;
  }

  async function eventos(file) {
    const { encabezados, filas } = porEncabezado(await Archivos.leerXlsx(await file.arrayBuffer()), 2);
    exigir(encabezados, ['CUFE', 'Estado Actual'], 'No parece un reporte de registro de eventos de SCI (fila 3 sin CUFE / Estado Actual)');
    return filas.filter((r) => !esError(r.CUFE) && U.texto(r.CUFE));
  }

  async function libroBancos(file) {
    const crudas = await Archivos.leerXlsx(await file.arrayBuffer());
    const { encabezados, filas } = porEncabezado(crudas, 2);
    exigir(encabezados, ['FECHA', 'DEBITOS', 'CREDITOS'], "No parece un 'Libro de bancos' de SCI (fila 3 sin FECHA / DEBITOS / CREDITOS)");
    const salida = filas.filter((r) => !esError(r.NOMBRE) && U.texto(r.NOMBRE));
    salida.encabezado = U.texto((crudas[0] || [])[0]);
    return salida;
  }

  // CSV de Bancolombia sin encabezado: cuenta, oficina, -, fecha (aaaammdd), -, valor, referencia, descripción, 0,
  async function extractoBancolombia(file) {
    const lineas = (await Archivos.leerTexto(file)).split(/\r?\n/).filter((l) => l.trim() !== '');
    const salida = [];
    for (const linea of lineas) {
      const p = linea.split(',').map((x) => x.trim());
      const n = p.length;
      if (n < 9) continue;
      const fin = p[n - 1] === '' ? n - 2 : n - 1;
      salida.push({ cuenta: p[0], fecha: p[3], valor: p[5], referencia: p[6], descripcion: p.slice(7, Math.max(fin, 8)).join(',') });
    }
    if (!salida.length) throw new Error('El CSV no tiene filas con el formato de Bancolombia (mínimo 9 columnas)');
    return salida;
  }

  async function extractoDavivienda(file) {
    const { encabezados, filas } = porEncabezado(await Archivos.leerXlsx(await file.arrayBuffer()), 0);
    exigir(encabezados, ['Fecha de Sistema', 'Valor Total'], "No parece un extracto de Davivienda (faltan 'Fecha de Sistema' / 'Valor Total')");
    return filas.filter((r) => !esError(r['Fecha de Sistema']) && r['Fecha de Sistema'] !== null && r['Fecha de Sistema'] !== '');
  }

  // "Tabla de Impuestos.csv" exportada de SCI (separada por comas, campos rellenos con espacios)
  async function tablaImpuestos(file) {
    let encabezados, filas;
    if (/\.csv$/i.test(file.name)) {
      const lineas = (await Archivos.leerTexto(file)).split(/\r?\n/).filter((l) => l.trim() !== '');
      encabezados = lineas[0].split(',').map((x) => x.trim());
      filas = lineas.slice(1).map((l) => { const p = l.split(','); const o = {}; encabezados.forEach((h, j) => { o[h] = p[j] ?? null; }); return o; });
    } else {
      ({ encabezados, filas } = porEncabezado(await Archivos.leerXlsx(await file.arrayBuffer()), 0));
    }
    exigir(encabezados, ['Identificador', 'Tipo', 'Porcentaje'], 'No parece la tabla de impuestos de SCI (faltan Identificador / Tipo / Porcentaje)');
    return filas.map((r) => ({
      identificador: U.texto(r.Identificador),
      codigo: U.num(U.texto(r.Tipo)),
      porcentaje: U.num(U.texto(r.Porcentaje)),
      nombre: U.texto(r.Nombre),
      dbcr: U.texto(r['Tipo Asiento']),
      cuenta: U.texto(r['Cuenta Contable']),
      impuesto: U.texto(r.NombreImpuesto),
      inactivo: U.texto(r.Inactivo),
    })).filter((r) => r.identificador && r.codigo !== null && r.inactivo !== 'S');
  }

  // "Tabla Codificacion.csv" exportada de SCI: conceptos por tipo de transacción con sus cuentas contables.
  // Separada por comas, con los valores rellenos de espacios y tabulaciones.
  async function tablaCodificacion(file) {
    let encabezados, filas;
    const limpiar = (s) => (s === null || s === undefined ? null : String(s).replace(/^[\s\t]+|[\s\t]+$/g, '') || null);
    if (/\.csv$/i.test(file.name)) {
      const lineas = (await Archivos.leerTexto(file)).split(/\r?\n/).filter((l) => l.trim() !== '');
      encabezados = lineas[0].split(',').map((x) => limpiar(x) || '');
      filas = lineas.slice(1).map((l) => { const p = l.split(','); const o = {}; encabezados.forEach((h, j) => { if (h) o[h] = limpiar(p[j]); }); return o; });
    } else {
      ({ encabezados, filas } = porEncabezado(await Archivos.leerXlsx(await file.arrayBuffer()), 0));
      filas = filas.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, limpiar(v)])));
    }
    exigir(encabezados, ['Tipo transaccion', 'Codigo Concepto', 'Nombre Concepto', 'Cuenta Bruto'],
      'No parece la tabla de codificación de SCI (faltan Tipo transaccion / Codigo Concepto / Nombre Concepto / Cuenta Bruto)');
    return filas.filter((r) => r['Tipo transaccion'] && r['Codigo Concepto']);
  }

  const LECTOR = {
    'Tabla de codificación': tablaCodificacion,
    'DIAN': dian, 'Digitación SCI': digitacion, 'Eventos': eventos, 'Libro bancos SCI': libroBancos,
    'Extracto Bancolombia': extractoBancolombia, 'Extracto Davivienda': extractoDavivienda, 'Tabla de impuestos': tablaImpuestos,
  };

  // Un XML (o un .zip con varios XML) de "01. Causaciones": una carga por documento.
  // Los XML que no son factura ni nota (acuses, ApplicationResponse) quedan como "Omitido".
  async function leerXml(a) {
    const base = { fuente: XML.fuente, banco: null, modificado: a.archivo.lastModified ? new Date(a.archivo.lastModified) : null, datos: null, error: null };
    let entradas;
    if (/\.zip$/i.test(a.nombre)) {
      try {
        entradas = (await Archivos.xmlsDeZip(await a.archivo.arrayBuffer())).map((e) => ({ nombre: `${a.nombre} › ${e.nombre}`, leer: e.leer }));
      } catch (e) {
        return [{ ...base, archivo: `${a.carpeta}/${a.nombre}`, nombre: a.nombre, error: 'No se pudo abrir el ZIP: ' + (e.message || e) }];
      }
    } else {
      entradas = [{ nombre: a.nombre, leer: () => a.archivo.arrayBuffer() }];
    }
    const cargas = [];
    for (const en of entradas) {
      const carga = { ...base, archivo: `${a.carpeta}/${en.nombre}`, nombre: en.nombre };
      try {
        const { factura, lineas, avisos } = Parser.procesar(Parser.decodificar(await en.leer()), carga.archivo);
        factura.lineas = lineas;
        factura._archivo = carga.archivo;
        factura._carpeta = a.carpeta;
        carga.datos = [factura];
        if (avisos.length) carga.aviso = avisos.join(' | ');
      } catch (e) {
        if (e.omitir) { carga.datos = []; carga.omitido = e.message; } else carga.error = e.message || String(e);
      }
      cargas.push(carga);
    }
    return cargas;
  }

  // Lee todos los archivos de un conjunto. Un archivo con error no detiene a los demás.
  async function leerConjunto(conjunto, alAvanzar) {
    const cargas = [];
    let i = 0;
    for (const a of conjunto.archivos) {
      if (a.fuente === XML.fuente) {
        cargas.push(...await leerXml(a));
        if (alAvanzar) alAvanzar(++i, conjunto.archivos.length, a.nombre);
        continue;
      }
      const ext = a.nombre.split('.').pop().toLowerCase();
      const carga = { fuente: a.fuente, banco: a.banco, archivo: `${a.carpeta}/${a.nombre}`, nombre: a.nombre,
        modificado: a.archivo.lastModified ? new Date(a.archivo.lastModified) : null, datos: null, error: null };
      if (!a.ext.includes(ext)) continue;
      try {
        carga.datos = await LECTOR[a.fuente](a.archivo);
        carga.encabezado = carga.datos.encabezado || null;
        carga.datos.forEach((d) => { d._archivo = carga.archivo; d._banco = a.banco; });
      } catch (e) {
        carga.error = e.message || String(e);
      }
      cargas.push(carga);
      if (alAvanzar) alAvanzar(++i, conjunto.archivos.length, a.nombre);
    }
    return cargas;
  }

  return { detectarConjuntos, leerConjunto };
})();
