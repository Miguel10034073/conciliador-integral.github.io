// Aplicación: selección de carpeta, pestañas, vistas y exportación.
'use strict';

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const estado = { config: Config.cargar(), conjuntos: [], conjunto: null, cargas: new Map(), resultado: null, pestana: 'resumen' };

  const PESTANAS = [
    { id: 'resumen', titulo: 'Resumen' },
    { id: 'xmldian', titulo: 'XML vs DIAN' },
    { id: 'eventos', titulo: 'Eventos por acusar' },
    { id: 'compras', titulo: 'Compras' },
    { id: 'ventas', titulo: 'Ventas' },
    { id: 'xml', titulo: 'Facturas XML' },
    { id: 'codificacion', titulo: 'Tabla de codificación' },
    { id: 'bancos', titulo: 'Bancos' },
    { id: 'conciliacion', titulo: 'Conciliación bancaria' },
    { id: 'gastos', titulo: 'Gastos bancarios' },
    { id: 'control', titulo: 'Control de carga' },
    { id: 'configuracion', titulo: 'Configuración' },
    { id: 'guia', titulo: 'Guía' },
  ];

  // ---------- Carga de archivos ----------
  async function recibirArchivos(archivos) {
    const conjuntos = Lectores.detectarConjuntos(archivos);
    if (!conjuntos.length) {
      mostrarSeccion(estado.resultado ? 'vista' : 'vacio');
      alert('No se encontraron XML en "01. Causaciones" ni las subcarpetas de reportes de "06. Reportes sistema de contabilizacion (SCI)" (Dian, Digitacion, Eventos, Mov bancolombia, SCI Bancolombia, …).\n\nSeleccione la carpeta de la empresa, la del mes o la del año.');
      return;
    }
    estado.conjuntos = conjuntos;
    estado.cargas.clear();
    const sel = $('selectorConjunto');
    sel.replaceChildren(...conjuntos.map((c, i) => h('option', { value: i }, etiquetaConjunto(c))));
    sel.classList.toggle('oculto', conjuntos.length < 2);
    try {
      await elegirConjunto(0);
    } catch (e) {
      console.error(e);
      mostrarSeccion(estado.resultado ? 'vista' : 'vacio');
      alert('Ocurrió un error al procesar la carpeta: ' + (e.message || e));
    }
  }
  const etiquetaConjunto = (c) => {
    const periodo = c.mes ? `${U.nombreMes(c.mes).replace(/^./, (x) => x.toUpperCase())} ${c.anio}` : 'Periodo sin identificar';
    return `${c.empresa || 'Empresa'} · ${periodo} (${c.xmls} XML, ${c.archivos.length - c.xmls} reportes)`;
  };

  async function elegirConjunto(indice) {
    const c = estado.conjuntos[indice];
    estado.conjunto = c;
    memoriaTablas.clear(); // los filtros de otro periodo no aplican
    if (!estado.cargas.has(c.raiz)) {
      mostrarSeccion('progreso');
      const cargas = await Lectores.leerConjunto(c, (i, n, nombre) => {
        $('barraProgreso').style.width = `${Math.round((i / n) * 100)}%`;
        $('textoProgreso').textContent = `${i} de ${n}: ${nombre}`;
      });
      estado.cargas.set(c.raiz, cargas);
    }
    procesar();
    mostrarSeccion('vista');
    $('botonExportar').disabled = false;
  }

  function procesar(repintar = true) {
    const t0 = performance.now();
    U.usarSeparadorDecimal(estado.config.parametros.separadorDecimal);
    estado.resultado = Motor.procesar(estado.conjunto, estado.cargas.get(estado.conjunto.raiz), estado.config);
    const r = estado.resultado;
    $('subtitulo').textContent = `${r.periodo.empresa} · ${r.periodo.nombre} · procesado en ${Math.round(performance.now() - t0)} ms`;
    document.title = `Conciliador integral · ${r.periodo.empresa} · ${r.periodo.nombre}`;
    pintarPestanas();
    if (repintar) mostrar(estado.pestana);
  }

  function mostrarSeccion(id) {
    for (const s of ['vacio', 'progreso', 'vista']) $(s).classList.toggle('oculto', s !== id);
    $('pestanas').classList.toggle('oculto', id !== 'vista');
  }

  // ---------- Pestañas ----------
  const EVENTOS_PENDIENTES = ['Por acusar', 'Revisar: posible nota crédito', 'Evento incompleto'];
  const PENDIENTES_DOCS = ['Diferencia de valor', 'Falta contabilizar', 'Número distinto', 'No está en DIAN'];
  function contarPendientes(id) {
    const r = estado.resultado;
    if (!r) return null;
    if (id === 'compras') return r.compras.filter((f) => PENDIENTES_DOCS.includes(f.estado)).length;
    if (id === 'ventas') return r.ventas.filter((f) => PENDIENTES_DOCS.includes(f.estado)).length;
    if (id === 'xmldian') return r.xmlDian.filter((f) => f.estado !== 'OK').length;
    if (id === 'eventos') return r.eventosPendientes.filter((f) => EVENTOS_PENDIENTES.includes(f.estado)).length;
    if (id === 'bancos') return r.bancos.filter((f) => ['Por conciliar: diferencia de valor', 'Falta registrar en libros', 'No aparece en extracto'].includes(f.estado)).length;
    if (id === 'gastos') return r.gastos.filter((g) => g.pendiente !== 0 || g.diferenciaPorConciliar !== 0).length;
    if (id === 'conciliacion') return bancosVisibles().filter((b) => { const m = modelo(b); return m.sinExplicar === null || Math.abs(m.sinExplicar) >= 0.005; }).length;
    if (id === 'control') return r.advertencias.length + r.control.filter((c) => c.estado !== 'OK').length;
    return null;
  }
  function pintarPestanas() {
    $('pestanas').replaceChildren(...PESTANAS.map((p) => {
      const n = contarPendientes(p.id);
      return h('button', { class: p.id === estado.pestana ? 'activa' : '', onclick: () => mostrar(p.id) },
        p.titulo, n === null ? '' : h('span', { class: `insignia${n === 0 ? ' ok' : ''}` }, n === 0 ? '✓' : n));
    }));
  }

  function mostrar(id, filtro) {
    U.usarSeparadorDecimal(estado.config.parametros.separadorDecimal);
    estado.pestana = id;
    pintarPestanas();
    const vista = $('vista');
    const render = { resumen: vistaResumen, compras: () => vistaDocumentos('compras', filtro), ventas: () => vistaDocumentos('ventas', filtro),
      xmldian: () => vistaXmlDian(filtro), eventos: () => vistaEventos(filtro), xml: () => vistaXml(filtro), codificacion: () => vistaCodificacion(filtro),
      bancos: () => vistaBancos(filtro), conciliacion: vistaConciliacion, gastos: vistaGastos, control: vistaControl,
      configuracion: vistaConfiguracion, guia: vistaGuia }[id];
    vista.replaceChildren(render());
    window.scrollTo({ top: 0 });
  }

  const encabezado = (titulo, descripcion, ...extra) => h('div', { class: 'encabezado-vista' },
    h('div', {}, h('h2', {}, titulo), descripcion ? h('p', { class: 'sutil' }, descripcion) : ''), ...extra);
  const panel = (titulo, enlace, ...contenido) => h('div', { class: 'panel' },
    h('h3', {}, titulo, enlace || ''), h('div', { class: 'panel-cuerpo' }, ...contenido));
  const enlace = (texto, fn) => h('a', { class: 'enlace', onclick: fn }, texto);

  // ---------- Resumen ----------
  function kpi({ etiqueta, cantidad, valor, ayuda, color, alClic }) {
    return h('div', { class: `kpi ${cantidad ? color : 'cero'}`, onclick: alClic, title: 'Ver detalle' },
      h('div', { class: 'etiqueta' }, etiqueta), h('div', { class: 'cifra' }, cantidad),
      valor !== undefined ? h('div', { class: 'valor' }, '$ ' + U.fmtNum(valor, Math.abs(valor % 1) > 0.001 ? 2 : 0)) : '',
      ayuda ? h('div', { class: 'ayuda' }, ayuda) : '');
  }

  function bloqueXml() {
    const r = estado.resultado;
    const de = (e) => r.xmlDian.filter((f) => f.estado === e);
    const tarjetas = [
      ['OK', 'verde', 'El XML y el reporte DIAN coinciden (mismo documento y valor).'],
      ['Falta XML', 'rojo', 'Documento recibido del mes en la DIAN sin XML en 01. Causaciones.'],
      ['XML no está en DIAN', 'rojo', 'XML guardado que no aparece en el reporte DIAN (otro adquiriente, posterior al reporte…).'],
      ['Diferencia de valor', 'rojo', 'Mismo documento con total distinto entre el XML y la DIAN.'],
      ['XML duplicado', 'ambar', 'El mismo documento está guardado más de una vez en Causaciones.'],
    ].map(([e, color, ayuda]) => kpi({ etiqueta: e, cantidad: de(e).length, valor: U.suma(de(e), (f) => f.totalXML ?? f.totalDIAN), ayuda, color,
      alClic: () => mostrar('xmldian', { estado: [e] }) }));
    const sinSci = r.xmlDian.filter((f) => f.archivo && f.estado !== 'XML duplicado' && f.estadoSCI === 'Sin contabilizar');
    tarjetas.push(kpi({ etiqueta: 'XML sin contabilizar en SCI', cantidad: sinSci.length, valor: U.suma(sinSci, (f) => f.totalXML), color: 'ambar',
      ayuda: 'Hay XML en Causaciones pero no se encontró su causación en la digitación de SCI.', alClic: () => mostrar('xmldian', { estadoSCI: ['Sin contabilizar'] }) }));
    for (const [e, color, ayuda] of [['Por acusar', 'rojo', 'Facturas a crédito sin nota crédito que no están en el reporte de Eventos de SCI.'],
      ['Revisar: posible nota crédito', 'ambar', 'Hay una nota crédito del mismo proveedor y valor en la DIAN (sin XML): confirme antes de acusar.'],
      ['Evento incompleto', 'ambar', 'Tienen evento pero falta el recibo de la factura, de la mercancía o la aceptación.'],
      ['Con nota crédito (no acusar)', 'lila', 'Facturas a crédito afectadas por una nota crédito: no se acusan.']]) {
      const g = r.eventosPendientes.filter((f) => f.estado === e);
      tarjetas.push(kpi({ etiqueta: e === 'Por acusar' ? 'Eventos por acusar' : e, cantidad: g.length, valor: U.suma(g, (f) => f.total), color, ayuda,
        alClic: () => mostrar('eventos', { estado: [e] }) }));
    }
    return panel(`Facturas XML — 01. Causaciones vs DIAN (${r.xmls.length} XML leídos)`, enlace('Ver detalle →', () => mostrar('xmldian')),
      h('div', { class: 'rejilla' }, tarjetas));
  }

  function bloqueDocumentos(clave, titulo, conEvento) {
    const filas = estado.resultado[clave];
    const de = (e) => filas.filter((f) => f.estado === e);
    const tarjetas = [
      ['OK', 'verde', 'totalDIAN', 'Cuadra DIAN vs SCI (base, IVA y total dentro de la tolerancia).'],
      ['Diferencia de valor', 'rojo', 'totalDIAN', 'Está en ambos lados con valores distintos. Revise Alertas (IVA no registrado, base distinta).'],
      ['Falta contabilizar', 'ambar', 'totalDIAN', 'Documento del mes en la DIAN que no está digitado en SCI.'],
      ['Número distinto', 'ambar', 'totalDIAN', 'Cruzó por tercero y valor, pero en SCI tiene otro número. Corríjalo en SCI.'],
      ['No está en DIAN', 'lila', 'totalSCI', 'Digitado en SCI sin documento electrónico: verifique el soporte.'],
      ['Mes anterior sin cruzar', '', 'totalDIAN', 'Facturas de meses anteriores (carpeta Dian) que no están en la digitación de este mes.'],
    ].filter(([e]) => clave === 'compras' || e !== 'Número distinto')
      .map(([e, color, campo, ayuda]) => kpi({ etiqueta: e, cantidad: de(e).length, valor: U.suma(de(e), (f) => f[campo]), ayuda, color,
        alClic: () => mostrar(clave, { estado: [e] }) }));
    if (conEvento) {
      const sinEv = filas.filter((f) => (f.alertas || '').includes('Sin evento'));
      tarjetas.push(kpi({ etiqueta: 'Sin evento registrado (alerta)', cantidad: sinEv.length, valor: U.suma(sinEv, (f) => f.totalDIAN), color: 'ambar',
        ayuda: 'Facturas recibidas sin acuse / aceptación en SCI (RADIAN).', alClic: () => mostrar(clave, { evento: ['Sin evento registrado'] }) }));
    }
    const ivaDian = U.suma(filas.filter((f) => f.periodo === 'Mes actual'), (f) => f.ivaDIAN);
    const ivaSci = U.suma(filas, (f) => f.ivaSCI);
    const difIva = U.redondear(ivaSci - ivaDian);
    const nombreIva = clave === 'compras' ? 'IVA descontable del mes' : 'IVA generado del mes';
    return panel(titulo, enlace('Ver detalle →', () => mostrar(clave)),
      h('div', { class: 'rejilla' }, tarjetas),
      h('p', { style: 'margin:14px 0 0' }, h('b', {}, nombreIva + ': '), `DIAN $ ${U.fmtNum(ivaDian)} · SCI $ ${U.fmtNum(ivaSci)} · diferencia `,
        h('span', { class: Math.abs(difIva) > (estado.config.parametros.toleranciaDocumentos || 0) ? 'dif' : '' }, `$ ${U.fmtNum(difIva, 2)}`)));
  }

  function vistaResumen() {
    const r = estado.resultado;
    const bancos = bancosVisibles().map((b) => {
      const filas = r.bancos.filter((f) => f.banco === b);
      const m = modelo(b);
      const suma = (e) => U.suma(filas.filter((f) => f.estado === e), (f) => f.valorPartida);
      const sello = m.sinExplicar === null ? h('span', { class: 'sello pend' }, 'Digite el saldo del extracto')
        : Math.abs(m.sinExplicar) < 0.005 ? h('span', { class: 'sello ok' }, '✔ Conciliado') : h('span', { class: 'sello mal' }, `✖ Diferencia sin explicar $ ${U.fmtNum(m.sinExplicar, 2)}`);
      return h('div', {}, h('h3', { style: 'font-size:15px;margin:4px 0 10px;display:flex;gap:12px;align-items:center' }, b, sello),
        h('div', { class: 'rejilla' },
          kpi({ etiqueta: 'Conciliados', cantidad: filas.filter((f) => f.estado.startsWith('Conciliado')).length, color: 'verde', alClic: () => mostrar('bancos', { banco: [b] }) }),
          kpi({ etiqueta: 'Por conciliar: diferencia de valor', cantidad: filas.filter((f) => f.partida === 'Diferencia de valor').length, valor: suma('Por conciliar: diferencia de valor'), color: 'rojo',
            ayuda: 'Extracto y libros no son iguales (aunque sea por centavos).', alClic: () => mostrar('bancos', { banco: [b], estado: ['Por conciliar: diferencia de valor'] }) }),
          kpi({ etiqueta: 'Falta registrar en libros', cantidad: filas.filter((f) => f.estado === 'Falta registrar en libros').length, valor: suma('Falta registrar en libros'), color: 'rojo',
            ayuda: 'Movimiento del extracto sin registro en SCI.', alClic: () => mostrar('bancos', { banco: [b], estado: ['Falta registrar en libros'] }) }),
          kpi({ etiqueta: 'No aparece en extracto', cantidad: filas.filter((f) => f.estado === 'No aparece en extracto').length, valor: suma('No aparece en extracto'), color: 'ambar',
            ayuda: 'Registrado en SCI y aún no en el banco (cheques, consignaciones en tránsito).', alClic: () => mostrar('bancos', { banco: [b], estado: ['No aparece en extracto'] }) }),
          kpi({ etiqueta: 'Gastos bancarios por registrar', cantidad: filas.filter((f) => f.estado === 'Gasto bancario por registrar').length, valor: suma('Gasto bancario por registrar'), color: 'lila',
            ayuda: '4x1000, comisiones, intereses… (ver Gastos bancarios).', alClic: () => mostrar('gastos') })));
    });
    const errores = r.control.filter((c) => c.estado !== 'OK').length;
    return h('div', {},
      encabezado('Resumen de la conciliación', `${r.periodo.empresa} · ${r.periodo.nombre}`),
      bloqueXml(),
      bloqueDocumentos('compras', 'Compras — DIAN vs SCI', false),
      bloqueDocumentos('ventas', 'Ventas — DIAN vs SCI', false),
      panel('Bancos — extracto vs libros', enlace('Ver conciliación →', () => mostrar('conciliacion')),
        bancos.length ? bancos : h('p', { class: 'sutil' }, 'No se cargaron extractos ni libro de bancos.')),
      panel('Calidad de los datos', enlace('Ver control →', () => mostrar('control')),
        h('div', { class: 'rejilla' },
          kpi({ etiqueta: 'Archivos leídos correctamente', cantidad: r.control.filter((c) => c.estado === 'OK').length, color: 'verde', alClic: () => mostrar('control') }),
          kpi({ etiqueta: 'Archivos con error o sin datos', cantidad: errores, color: 'rojo', alClic: () => mostrar('control') }),
          kpi({ etiqueta: 'Advertencias por revisar', cantidad: r.advertencias.length, color: 'ambar', alClic: () => mostrar('control') }))));
  }

  // ---------- Compras / Ventas ----------
  const COLUMNAS_DOCS = [
    { clave: 'cufe', titulo: 'CUFE (clic para copiar)', tipo: 'cufe' },
    { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'alertas', titulo: 'Alertas', tipo: 'alerta' },
    { clave: 'periodo', titulo: 'Periodo' }, { clave: 'mes', titulo: 'Mes del documento' }, { clave: 'clase', titulo: 'Clase' }, { clave: 'tipoDIAN', titulo: 'Tipo DIAN' },
    { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }, { clave: 'nit', titulo: 'NIT' }, { clave: 'tercero', titulo: 'Tercero', tipo: 'largo' },
    { clave: 'facturaDIAN', titulo: 'Factura DIAN' }, { clave: 'facturaSCI', titulo: 'Factura SCI' }, { clave: 'docContable', titulo: 'Doc. contable' },
    { clave: 'tipoSCI', titulo: 'Tipo SCI' },
    { clave: 'baseDIAN', titulo: 'Base DIAN', tipo: 'moneda', total: true }, { clave: 'ivaDIAN', titulo: 'IVA DIAN', tipo: 'moneda', total: true },
    { clave: 'otrosDIAN', titulo: 'Otros imp. DIAN', tipo: 'moneda', total: true }, { clave: 'totalDIAN', titulo: 'Total DIAN', tipo: 'moneda', total: true },
    { clave: 'baseSCI', titulo: 'Base SCI', tipo: 'moneda', total: true }, { clave: 'ivaSCI', titulo: 'IVA SCI', tipo: 'moneda', total: true },
    { clave: 'totalSCI', titulo: 'Total SCI', tipo: 'moneda', total: true },
    { clave: 'difBase', titulo: 'Dif. base', tipo: 'diferencia', total: true }, { clave: 'difIva', titulo: 'Dif. IVA', tipo: 'diferencia', total: true },
    { clave: 'difTotal', titulo: 'Dif. total', tipo: 'diferencia', total: true },
    { clave: 'retencionSCI', titulo: 'Retención SCI', tipo: 'moneda', total: true }, { clave: 'netoSCI', titulo: 'Neto a pagar SCI', tipo: 'moneda', total: true },
    { clave: 'reteIvaDIAN', titulo: 'ReteIVA DIAN', tipo: 'moneda' }, { clave: 'reteRentaDIAN', titulo: 'ReteRenta DIAN', tipo: 'moneda' },
    { clave: 'reteIcaDIAN', titulo: 'ReteICA DIAN', tipo: 'moneda' }, { clave: 'estadoDIAN', titulo: 'Estado DIAN' }, { clave: 'formaPago', titulo: 'Forma de pago' },
    { clave: 'estadoEvento', titulo: 'Estado evento' }, { clave: 'aceptacion', titulo: 'Aceptación' }, { clave: 'fechaEvento', titulo: 'Fecha evento', tipo: 'fecha' },
    { clave: 'metodo', titulo: 'Método de cruce' }, { clave: 'centroCosto', titulo: 'Centro de costo' }, { clave: 'usuario', titulo: 'Usuario' },
  ];
  function vistaDocumentos(clave, filtro) {
    const esCompras = clave === 'compras';
    const filas = estado.resultado[clave].map((f) => ({ ...f, evento: (f.alertas || '').includes('Sin evento') ? 'Sin evento registrado' : 'Con evento o no aplica' }));
    const columnas = esCompras ? COLUMNAS_DOCS : COLUMNAS_DOCS.filter((c) => !['estadoEvento', 'aceptacion', 'fechaEvento', 'reteIvaDIAN', 'reteRentaDIAN', 'reteIcaDIAN', 'centroCosto'].includes(c.clave));
    return h('div', {},
      encabezado(esCompras ? 'Compras: DIAN vs SCI' : 'Ventas: DIAN vs SCI',
        (esCompras ? 'Facturas, notas crédito y documentos soporte de la DIAN contra la causación en SCI.' : 'Facturas y notas crédito emitidas contra el registro en SCI.')
          + ' Incluye todos los meses que haya en la carpeta Dian (filtre por Mes del documento o Periodo). Clic en un CUFE para copiarlo.'),
      h('div', { class: 'panel' }, crearTabla({ columnas: esCompras ? [...columnas, { clave: 'evento', titulo: 'Evento' }] : columnas, filas,
        filtros: esCompras ? ['estado', 'periodo', 'mes', 'clase', 'evento'] : ['estado', 'periodo', 'mes', 'clase'], filtroInicial: filtro, ordenEstados: Motor.ORDEN_DOCS, memoria: clave })));
  }

  // ---------- XML vs DIAN ----------
  const COLUMNAS_XML_DIAN = [
    { clave: 'cufe', titulo: 'CUFE (clic para copiar)', tipo: 'cufe' },
    { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'alertas', titulo: 'Alertas', tipo: 'alerta' },
    { clave: 'estadoSCI', titulo: 'En SCI', tipo: 'estado' }, { clave: 'docContable', titulo: 'Doc. contable' },
    { clave: 'periodo', titulo: 'Periodo' }, { clave: 'mes', titulo: 'Mes del documento' }, { clave: 'grupo', titulo: 'Grupo' },
    { clave: 'tipo', titulo: 'Tipo XML' }, { clave: 'tipoDIAN', titulo: 'Tipo DIAN' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
    { clave: 'nit', titulo: 'NIT' }, { clave: 'tercero', titulo: 'Tercero', tipo: 'largo' }, { clave: 'documento', titulo: 'Documento' },
    { clave: 'totalXML', titulo: 'Total XML', tipo: 'moneda', total: true }, { clave: 'totalDIAN', titulo: 'Total DIAN', tipo: 'moneda', total: true },
    { clave: 'diferencia', titulo: 'Diferencia', tipo: 'diferencia', total: true },
    { clave: 'ivaXML', titulo: 'IVA XML', tipo: 'moneda', total: true }, { clave: 'ivaDIAN', titulo: 'IVA DIAN', tipo: 'moneda', total: true },
    { clave: 'formaPago', titulo: 'Forma de pago' }, { clave: 'estadoDIAN', titulo: 'Estado DIAN' }, { clave: 'metodo', titulo: 'Cruzó por' },
    { clave: 'archivo', titulo: 'Archivo XML', tipo: 'largo' },
  ];
  function vistaXmlDian(filtro) {
    const r = estado.resultado;
    const porArchivo = new Map(r.xmls.map((x) => [x.archivo, x]));
    return h('div', {},
      encabezado('XML de Causaciones vs reporte DIAN',
        `Cada XML de 01. Causaciones debe estar en la DIAN, y cada documento recibido de ${r.periodo.nombre} en la DIAN debe tener su XML. `
        + (r.corteDian ? `El reporte DIAN llega hasta el ${U.fmtFecha(r.corteDian)}. ` : '') + 'Clic en una fila con XML para ver la factura.'),
      h('div', { class: 'panel' }, crearTabla({ memoria: 'xmldian', columnas: COLUMNAS_XML_DIAN, filas: r.xmlDian, filtros: ['estado', 'estadoSCI', 'periodo', 'grupo'],
        filtroInicial: filtro, ordenEstados: Motor.ORDEN_XML, alClic: (f) => { const x = porArchivo.get(f.archivo); if (x) abrirXml(x); } })));
  }

  // ---------- Eventos por acusar ----------
  const COLUMNAS_EVENTOS = [
    { clave: 'cufe', titulo: 'CUFE (clic para copiar)', tipo: 'cufe' },
    { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'alertas', titulo: 'Alertas', tipo: 'alerta' },
    { clave: 'mes', titulo: 'Mes del documento' }, { clave: 'fecha', titulo: 'Fecha factura', tipo: 'fecha' },
    { clave: 'dias', titulo: 'Días desde emisión', tipo: 'entero' }, { clave: 'nit', titulo: 'NIT' }, { clave: 'tercero', titulo: 'Proveedor', tipo: 'largo' },
    { clave: 'documento', titulo: 'Factura' }, { clave: 'total', titulo: 'Total', tipo: 'moneda', total: true },
    { clave: 'vencimiento', titulo: 'Vence (XML)', tipo: 'fecha' }, { clave: 'tieneXML', titulo: 'XML' },
    { clave: 'estadoSCI', titulo: 'En SCI', tipo: 'estado' }, { clave: 'docContable', titulo: 'Doc. contable' },
    { clave: 'recepcionFactura', titulo: 'Recepción factura' }, { clave: 'recepcionMercancia', titulo: 'Recepción mercancía' },
    { clave: 'aceptacion', titulo: 'Aceptación' }, { clave: 'fechaEvento', titulo: 'Fecha registro evento', tipo: 'fecha' },
  ];
  function vistaEventos(filtro) {
    return h('div', {},
      encabezado('Eventos por acusar',
        'Facturas recibidas a crédito (forma de pago del reporte DIAN o del XML) que no aparecen en el reporte de Eventos de SCI. '
        + 'Incluye todos los meses que haya en la carpeta Dian; "Con evento" muestra las que ya están completas.'),
      h('div', { class: 'panel' }, crearTabla({ memoria: 'eventos', columnas: COLUMNAS_EVENTOS, filas: estado.resultado.eventosPendientes, filtros: ['estado', 'mes', 'tieneXML'],
        filtroInicial: filtro || { estado: [...EVENTOS_PENDIENTES] }, ordenEstados: Motor.ORDEN_EVENTOS })));
  }

  // ---------- Facturas XML (lo que hacía facturas-dian-web) ----------
  const COLUMNAS_XML = [
    { clave: 'cufe', titulo: 'CUFE (clic para copiar)', tipo: 'cufe' },
    { clave: 'estadoCruce', titulo: 'Cruce con DIAN', tipo: 'estado' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
    { clave: 'tipo', titulo: 'Tipo' }, { clave: 'numero', titulo: 'Número' }, { clave: 'tercero', titulo: 'Tercero', tipo: 'largo' }, { clave: 'nit', titulo: 'NIT' },
    { clave: 'bruto', titulo: 'Valor bruto', tipo: 'moneda2', total: true }, { clave: 'descuentos', titulo: 'Descuentos', tipo: 'moneda2', total: true },
    { clave: 'subtotal', titulo: 'Subtotal', tipo: 'moneda2', total: true }, { clave: 'iva', titulo: 'IVA', tipo: 'moneda2', total: true },
    { clave: 'otros', titulo: 'Otros imp.', tipo: 'moneda2', total: true }, { clave: 'retenciones', titulo: 'Retenciones', tipo: 'moneda2', total: true },
    { clave: 'total', titulo: 'Total a pagar', tipo: 'moneda2', total: true }, { clave: 'formaPago', titulo: 'Forma de pago' }, { clave: 'medioPago', titulo: 'Medio de pago' },
    { clave: 'vencimiento', titulo: 'Vence', tipo: 'fecha' }, { clave: 'validacionXML', titulo: 'Validación en el XML' }, { clave: 'grupo', titulo: 'Grupo' },
    { clave: 'carpeta', titulo: 'Carpeta', tipo: 'largo' },
  ];
  const COLUMNAS_PRODUCTOS = [
    { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }, { clave: 'numero', titulo: 'Factura' }, { clave: 'tercero', titulo: 'Proveedor', tipo: 'largo' },
    { clave: 'codigo', titulo: 'Código' }, { clave: 'descripcion', titulo: 'Descripción', tipo: 'largo' },
    { clave: 'cantidad', titulo: 'Cantidad', tipo: 'moneda' }, { clave: 'unidad', titulo: 'Und.' }, { clave: 'precio', titulo: 'Precio unit.', tipo: 'moneda2' },
    { clave: 'bruto', titulo: 'Valor bruto', tipo: 'moneda2', total: true }, { clave: 'descuento', titulo: 'Descuento', tipo: 'moneda2', total: true },
    { clave: 'subtotal', titulo: 'Subtotal', tipo: 'moneda2', total: true }, { clave: 'ivaPct', titulo: 'IVA %', tipo: 'moneda' },
    { clave: 'iva', titulo: 'IVA', tipo: 'moneda2', total: true }, { clave: 'otros', titulo: 'Otros imp.', tipo: 'moneda2', total: true },
    { clave: 'total', titulo: 'Total', tipo: 'moneda2', total: true },
  ];
  const productosDe = (xmls) => xmls.flatMap((x) => x.lineas.map((l) => ({ ...l, fecha: x.fecha, tercero: x.tercero, _xml: x })));

  function vistaXml(filtro) {
    const r = estado.resultado;
    const zona = h('div', { class: 'panel' });
    const ver = (modo) => {
      botones.forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
      zona.replaceChildren(modo === 'facturas'
        ? crearTabla({ memoria: 'xml', columnas: COLUMNAS_XML, filas: r.xmls, filtros: ['estadoCruce', 'tipo', 'formaPago', 'grupo'], filtroInicial: filtro,
          ordenEstados: Motor.ORDEN_XML, alClic: abrirXml })
        : crearTabla({ memoria: 'productos', columnas: COLUMNAS_PRODUCTOS, filas: productosDe(r.xmls), alClic: (l) => abrirXml(l._xml) }));
    };
    const botones = [['facturas', `Facturas (${r.xmls.length})`], ['productos', 'Detalle de productos']]
      .map(([modo, texto]) => h('button', { 'data-modo': modo, onclick: () => ver(modo) }, texto));
    ver('facturas');
    return h('div', {},
      encabezado('Facturas XML de 01. Causaciones', 'Lectura de cada factura, nota crédito y nota débito electrónica. Clic en una fila para ver la factura completa.',
        h('div', { class: 'alternar' }, botones)),
      r.xmls.length ? zona : panel('Sin XML', null, h('p', { class: 'sutil' }, 'No se encontraron archivos .xml ni .zip en la carpeta 01. Causaciones.')));
  }

  // Ventana con la factura completa (ficha, cruce con DIAN y SCI, productos)
  function abrirXml(x) {
    const f = x.factura;
    const cruce = estado.resultado.xmlDian.find((c) => c.archivo === x.archivo);
    const dinero = (v) => '$ ' + U.fmtNum(v || 0, 2);
    const fechaTxt = (s) => U.fmtFecha(U.fecha(s, 'yyyy-MM-dd'));
    // Cada línea se copia al hacer clic (sin el rótulo "NIT", "Tel.", "Vence"…: solo el dato)
    const soloDato = (t) => t.replace(/^(NIT|Tel\.|Vence|Doc\.|Total|Anticipos:|Base gravable con IVA:)\s*/i, '').replace(/^\$\s*/, '').trim();
    const campo = (titulo, ...lineas) => h('div', {}, h('small', {}, titulo),
      h('span', {}, lineas.filter((l) => l !== null && l !== undefined && l !== '').flatMap((l, i) => {
        const nodo = typeof l === 'string' ? copiable(l, soloDato(l)) : l;
        return i ? [h('br'), nodo] : [nodo];
      })));
    // IVA discriminado por tarifa (19%, 5%…). Si el XML no lo trae en el total del documento, se arma con los productos
    const tarifas = f.ivaTarifas?.length ? f.ivaTarifas
      : [...U.agrupar(x.lineas.filter((l) => l.iva || l.ivaPct), (l) => l.ivaPct)]
        .map(([pct, ls]) => ({ pct, base: U.redondear(U.suma(ls, (l) => l.subtotal)), iva: U.redondear(U.suma(ls, (l) => l.iva)) }))
        .sort((a, b) => b.pct - a.pct);
    const lineaTarifa = (t) => copiable(`IVA ${U.fmtPct(t.pct)}%: ${dinero(t.iva)} · base ${dinero(t.base)}`, U.fmtNum(t.iva, 2));

    // Notas: observaciones del XML (cbc:Note), motivo y documento que afecta (si es nota)
    // y las notas crédito/débito de otros XML que afectan este documento (por CUFE o por tercero + número)
    const xmls = estado.resultado.xmls;
    const mismaClave = (a, b) => { const c = U.claveDoc(a).completa; return !!c && c === U.claveDoc(b).completa; };
    const esReferencia = (r, y) => (r.cufe && y.id === r.cufe.toLowerCase()) || (y.nit === x.nit && mismaClave(r.numero, y.numero));
    const afectadas = x.referencias.map((r) => ({ r, y: xmls.find((y) => y !== x && esReferencia(r, y)) }));
    const notasDeEste = [...new Map(xmls.filter((n) => n !== x && n.tipo !== 'Factura' && n.referencias.some((r) => esReferencia(r, x)))
      .map((n) => [n.id || n.archivo, n])).values()];
    const abrirOtro = (y, texto) => h('button', { class: 'enlace', title: 'Abrir documento', onclick: () => abrirXml(y) }, texto);
    const totalNotas = (f.notas?.length || 0) + notasDeEste.length + (f.codigoNota || f.motivoNota ? 1 : 0);
    const seccionNotas = h('div', { class: 'panel' }, h('h3', {}, `Notas (${totalNotas})`),
      h('div', { class: 'panel-cuerpo notas-factura' },
        f.notas?.length ? f.notas.map((n) => h('p', { class: 'nota-texto' }, copiable(n)))
          : h('p', { class: 'sutil' }, 'El XML no trae notas ni observaciones.'),
        f.codigoNota || f.motivoNota ? h('p', {}, h('b', {}, 'Motivo de la nota: '),
          [f.codigoNota ? `Código ${f.codigoNota}` : '', f.motivoNota].filter(Boolean).join(' · ')) : '',
        afectadas.length ? h('p', {}, h('b', {}, 'Documento que afecta: '), afectadas.map(({ r, y }, i) => [i ? ' · ' : '',
          y ? abrirOtro(y, `${y.tipo} ${y.numero}`) : r.numero || r.cufe, r.fecha ? ` del ${fechaTxt(r.fecha)}` : ''])) : '',
        notasDeEste.length ? h('div', {}, h('b', {}, 'Notas que afectan este documento:'),
          h('ul', {}, notasDeEste.map((n) => h('li', {}, abrirOtro(n, `${n.tipo} ${n.numero}`),
            ` · ${U.fmtFecha(n.fecha)} · ${dinero(n.total)}`, n.motivoNota ? ` · ${n.motivoNota}` : '')))) : ''));

    const dialogo = h('dialog', { class: 'detalle' },
      h('div', { class: 'detalle-cabeza' },
        h('div', {}, h('h2', {}, `${f.tipo} ${f.numero}`), h('p', { class: 'sutil' }, `${f.emisorNombre} · NIT ${f.emisorNit}`)),
        h('div', { class: 'acciones' }, cruce ? insigniaEstado(cruce.estado) : '', cruce ? insigniaEstado(cruce.estadoSCI) : '',
          h('button', { class: 'boton chico', onclick: () => dialogo.close() }, '✕ Cerrar'))),
      h('div', { class: 'detalle-cuerpo' },
        cruce?.alertas ? h('div', { class: 'aviso' }, h('b', {}, 'Alertas'), h('span', {}, cruce.alertas)) : '',
        f.cufe ? h('button', { class: 'cufe-largo', title: 'Clic para copiar', onclick: () => copiarTexto(f.cufe) }, `CUFE / CUDE: ${f.cufe}`) : '',
        h('div', { class: 'ficha' },
          campo('Fecha / hora', `${fechaTxt(f.fecha)} ${f.hora || ''}`),
          campo('Emisor', f.emisorNombre, `NIT ${f.emisorNit}`,
            [f.emisorDireccion, f.emisorCiudad, f.emisorDepartamento && f.emisorDepartamento !== f.emisorCiudad ? f.emisorDepartamento : ''].filter(Boolean).join(', '),
            f.emisorTelefono ? `Tel. ${f.emisorTelefono}` : '', f.emisorCorreo),
          campo('Adquiriente', f.adqNombre, `NIT ${f.adqNit}${f.adqCiudad ? ' · ' + f.adqCiudad : ''}`, f.adqCorreo),
          campo('Pago', `${f.formaPago} · ${f.medioPago}`, f.vencimiento ? `Vence ${fechaTxt(f.vencimiento)}` : ''),
          campo('Valor bruto', dinero(f.bruto)),
          campo('Descuentos', f.descuentos ? dinero(f.descuentos) : 'Sin descuento', f.motivosDescuento),
          f.cargos ? campo('Cargos', dinero(f.cargos)) : '',
          campo('Subtotal', dinero(f.subtotal), `Base gravable con IVA: ${dinero(f.base)}`),
          campo('IVA', dinero(f.iva), ...tarifas.map(lineaTarifa)),
          campo('Otros impuestos', dinero(f.otros), f.otrosLista ? Parser.textoImpuestos(f.otrosLista) : f.otrosDetalle),
          campo('Retenciones', dinero(f.retenciones), f.retencionesLista ? Parser.textoImpuestos(f.retencionesLista) : f.retencionesDetalle),
          campo('Total a pagar', h('b', {}, copiable(`${dinero(f.total)} ${f.moneda || ''}`.trim(), U.fmtNum(f.total || 0, 2))), f.anticipos ? `Anticipos: ${dinero(f.anticipos)}` : '',
            Math.abs(f.diferencia || 0) >= 1 ? h('span', { class: 'dif' }, `No cuadra: diferencia ${dinero(f.diferencia)}`) : ''),
          campo('Validación DIAN en el XML', `${f.estadoDian}${f.fechaValidacion ? ' · ' + fechaTxt(f.fechaValidacion) : ''}`, f.obsDian),
          campo('Reporte DIAN', cruce?.totalDIAN !== null && cruce?.totalDIAN !== undefined ? `Total ${dinero(cruce.totalDIAN)}` : 'No aparece', cruce?.estadoDIAN),
          campo('SCI', cruce?.estadoSCI || '', cruce?.docContable ? `Doc. ${cruce.docContable}` : ''),
          campo('Archivo', x.archivo)),
        seccionNotas,
        h('h3', { style: 'font-size:14px;margin-bottom:8px' }, `Productos (${x.lineas.length})`),
        h('div', { class: 'panel' }, crearTabla({ columnas: COLUMNAS_PRODUCTOS.filter((c) => !['fecha', 'numero', 'tercero'].includes(c.clave))
          .map((c) => (['codigo', 'descripcion'].includes(c.clave) ? { ...c, tipo: 'copiar' } : c)), filas: x.lineas }))));
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.append(dialogo);
    dialogo.showModal();
  }

  // ---------- Tabla de codificación ----------
  const COLUMNAS_CODIFICACION = [
    { clave: 'tipo', titulo: 'Tipo de transacción' }, { clave: 'codigo', titulo: 'Código concepto' }, { clave: 'nombre', titulo: 'Nombre concepto', tipo: 'largo' },
    { clave: 'cuentaBruto', titulo: 'Cuenta bruto' }, { clave: 'natBruto', titulo: 'DB/CR bruto' },
    { clave: 'cuentaIva', titulo: 'Cuenta IVA' }, { clave: 'natIva', titulo: 'DB/CR IVA' },
    { clave: 'cuentaRetencion', titulo: 'Cuenta retención' }, { clave: 'natRetencion', titulo: 'DB/CR retención' },
    { clave: 'cuentaTotal', titulo: 'Cuenta total' }, { clave: 'natTotal', titulo: 'DB/CR total' },
    { clave: 'cuentaRteIva', titulo: 'Cuenta ReteIVA' }, { clave: 'comprobante', titulo: 'Comprobante' }, { clave: 'prefijo', titulo: 'Prefijo' },
    { clave: 'activo', titulo: 'Estado' },
  ];
  function vistaCodificacion(filtro) {
    const filas = estado.resultado.codificacion;
    return h('div', {},
      encabezado('Tabla de codificación',
        'Conceptos de SCI por tipo de transacción con sus cuentas contables (carpeta "Tabla de codificacion"). '
        + 'Filtre por tipo o escriba en el buscador un código, un nombre o un número de cuenta: por ejemplo 240850 muestra todos los conceptos que usan esa cuenta.'),
      filas.length
        ? h('div', { class: 'panel' }, crearTabla({ memoria: 'codificacion', columnas: COLUMNAS_CODIFICACION, filas, filtros: ['tipo', 'activo'], filtroInicial: filtro }))
        : panel('Sin tabla de codificación', null, h('p', { class: 'sutil' },
          'Guarde el archivo "Tabla Codificacion.csv" exportado de SCI en la subcarpeta "Tabla de codificacion" de 06. Reportes sistema de contabilizacion (SCI).')));
  }

  // ---------- Bancos ----------
  const COLUMNAS_BANCOS = [
    { clave: 'banco', titulo: 'Banco' }, { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'partida', titulo: 'Partida conciliatoria' },
    { clave: 'origen', titulo: 'Origen' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
    { clave: 'valorExtracto', titulo: 'Valor extracto', tipo: 'moneda2', total: true }, { clave: 'valorLibros', titulo: 'Valor libros', tipo: 'moneda2', total: true },
    { clave: 'diferencia', titulo: 'Diferencia', tipo: 'diferencia', total: true }, { clave: 'valorPartida', titulo: 'Valor partida', tipo: 'moneda2', total: true },
    { clave: 'descripcionExtracto', titulo: 'Descripción extracto', tipo: 'largo' }, { clave: 'descripcionSCI', titulo: 'Descripción SCI', tipo: 'largo' },
    { clave: 'documentoSCI', titulo: 'Documento SCI' }, { clave: 'docReferencia', titulo: 'Doc. referencia' }, { clave: 'beneficiario', titulo: 'Beneficiario', tipo: 'largo' },
    { clave: 'categoria', titulo: 'Categoría' }, { clave: 'cuentaContable', titulo: 'Cuenta' },
    { clave: 'fechaExtracto', titulo: 'Fecha extracto', tipo: 'fecha' }, { clave: 'fechaLibros', titulo: 'Fecha libros', tipo: 'fecha' },
    { clave: 'metodo', titulo: 'Cómo se cruzó', tipo: 'largo' }, { clave: 'referencia', titulo: 'Referencia' },
  ];
  function vistaBancos(filtro) {
    return h('div', {},
      encabezado('Bancos: extracto vs libro de bancos SCI', 'Solo es Conciliado si extracto y libros son iguales al centavo. Cualquier diferencia queda Por conciliar.'),
      h('div', { class: 'panel' }, crearTabla({ memoria: 'bancos', columnas: COLUMNAS_BANCOS, filas: estado.resultado.bancos, filtros: ['banco', 'estado', 'origen'], filtroFecha: 'fecha',
        filtroInicial: filtro, ordenEstados: Motor.ORDEN_BANCOS })));
  }

  // ---------- Conciliación bancaria ----------
  const claveSaldo = (banco) => { const p = estado.resultado.periodo; return `${p.empresa}|${p.anio}-${String(p.mes).padStart(2, '0')}|${banco}`; };
  const modelo = (banco) => Motor.modeloConciliacion(estado.resultado, banco, estado.config.saldosExtracto[claveSaldo(banco)] ?? null);
  const bancosVisibles = () => U.unicos(estado.resultado.saldos.map((s) => s.banco));

  function vistaConciliacion() {
    const bancos = bancosVisibles();
    if (!bancos.length) return h('div', {}, encabezado('Conciliación bancaria'), panel('Sin datos', null, h('p', { class: 'sutil' }, 'No se cargaron extractos ni libro de bancos.')));
    return h('div', {},
      encabezado('Conciliación bancaria', 'Modelo básico de conciliación armado automáticamente. Digite solo el saldo del extracto.',
        h('div', { class: 'acciones' },
          h('button', { class: 'boton', title: 'Documento con formato para imprimir o guardar como PDF', onclick: () => exportarConciliacionPDF(bancos) }, 'Exportar a PDF'),
          h('button', { class: 'boton', title: 'Un archivo de Excel con una hoja por banco', onclick: () => exportarConciliacionExcel(bancos) }, 'Exportar a Excel'))),
      h('div', { class: 'dos-columnas' }, bancos.map(panelBanco)));
  }

  function panelBanco(banco) {
    const r = estado.resultado;
    const contenedor = h('div', { class: 'panel' });
    const pintar = () => {
      const m = modelo(banco);
      const entrada = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Saldo del extracto', value: m.digitado === null ? '' : U.fmtNum(m.digitado, 2) });
      entrada.addEventListener('change', () => {
        const v = U.num(entrada.value);
        if (v === null) delete estado.config.saldosExtracto[claveSaldo(banco)]; else estado.config.saldosExtracto[claveSaldo(banco)] = v;
        Config.guardar(estado.config); pintar(); pintarPestanas();
      });
      const sello = m.digitado === null ? h('span', { class: 'sello pend' }, '← Digite el saldo del extracto')
        : Math.abs(m.sinExplicar) < 0.005 ? h('span', { class: 'sello ok' }, '✔ Conciliado') : h('span', { class: 'sello mal' }, '✖ Revise la diferencia');
      const fila = (texto, valor, clase) => h('tr', { class: clase || '' }, h('td', {}, texto), h('td', {}, valor));
      const tablaModelo = h('table', { class: 'modelo' },
        fila('Empresa', r.periodo.empresa, 'info'), fila('Cuenta (SCI)', m.cuenta || 'Sin libro de bancos cargado', 'info'),
        fila('Fecha de corte', U.fmtFecha(r.periodo.corte), 'info'),
        fila('Saldo según libros (saldo anterior + débitos − créditos)', valorCopiable(m.libros, 2), 'fuerte'),
        fila('Más: cheques y egresos girados pendientes de cobro', valorCopiable(m.cheques, 2)),
        fila('Menos: consignaciones en libros que no aparecen en el extracto', valorCopiable(m.consignaciones, 2)),
        fila('Más: notas crédito del extracto pendientes de registrar', valorCopiable(m.notasCredito, 2)),
        fila('Menos: notas débito y gastos bancarios pendientes de registrar', valorCopiable(m.notasDebito, 2)),
        h('tr', {}, h('td', {}, 'Más / menos: diferencias de valor por conciliar (extracto − libros)'),
          h('td', { class: Math.abs(m.diferencias) >= 0.005 ? 'dif' : '' }, valorCopiable(m.diferencias, 2))),
        fila('Saldo según extracto (calculado)', valorCopiable(m.calculado, 2), 'fuerte'),
        h('tr', {}, h('td', {}, h('b', {}, 'Saldo según extracto bancario (digite)')), h('td', {}, entrada)),
        h('tr', {}, h('td', {}, h('b', {}, 'Diferencia sin explicar')), h('td', { class: m.sinExplicar ? 'dif' : '' }, valorCopiable(m.sinExplicar, 2))),
        h('tr', {}, h('td', {}, h('b', {}, 'Estado')), h('td', {}, sello)));
      const partidas = partidasBanco(banco);
      contenedor.replaceChildren(
        h('h3', {}, banco, h('span', { class: 'acciones' },
          h('button', { class: 'boton chico', title: 'Conciliación de este banco en PDF', onclick: () => exportarConciliacionPDF([banco]) }, 'PDF'),
          h('button', { class: 'boton chico', title: 'Conciliación de este banco en Excel', onclick: () => exportarConciliacionExcel([banco]) }, 'Excel'),
          enlace('Ver movimientos →', () => mostrar('bancos', { banco: [banco] })))),
        h('div', { class: 'panel-cuerpo' }, tablaModelo),
        h('h3', {}, 'Detalle de partidas conciliatorias'),
        crearTabla({ columnas: [
          { clave: 'partida', titulo: 'Partida', tipo: 'estado' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { clave: 'valorExtracto', titulo: 'Valor extracto', tipo: 'moneda2' }, { clave: 'valorLibros', titulo: 'Valor libros', tipo: 'moneda2' },
          { clave: 'valorPartida', titulo: 'Diferencia / partida', tipo: 'moneda2', total: true }, { clave: 'descripcion', titulo: 'Descripción', tipo: 'largo' }],
        filas: partidas, filtros: ['partida'], ordenEstados: Motor.ORDEN_BANCOS, memoria: 'partidas ' + banco }));
    };
    pintar();
    return contenedor;
  }

  // Partidas conciliatorias de un banco: movimientos pendientes + gastos agrupados por categoría
  function partidasBanco(banco) {
    const r = estado.resultado;
    const partidas = r.bancos.filter((b) => b.banco === banco && b.partida && b.estado !== 'Gasto bancario por registrar')
      .sort((a, b) => Motor.ORDEN_BANCOS.indexOf(a.estado) - Motor.ORDEN_BANCOS.indexOf(b.estado) || a.fecha - b.fecha)
      .map((b) => ({
        partida: b.estado, fecha: b.fecha, valorExtracto: b.valorExtracto, valorLibros: b.valorLibros, valorPartida: b.valorPartida,
        descripcion: [b.descripcionExtracto, b.descripcionSCI].filter(Boolean).join(' / ') + (b.documentoSCI ? ` · Doc ${b.documentoSCI}` : '') + (b.beneficiario ? ` · ${b.beneficiario}` : ''),
      }));
    for (const g of r.gastos.filter((x) => x.banco === banco && x.pendiente !== 0)) {
      partidas.push({ partida: 'Gasto bancario por registrar', fecha: r.periodo.corte, valorExtracto: g.pendiente, valorLibros: null, valorPartida: g.pendiente,
        descripcion: `${g.categoria} (${g.movimientos} movimientos) · ${g.cuentaContable ? 'cuenta ' + g.cuentaContable : 'cuenta sin definir'}` });
    }
    return partidas;
  }

  // Líneas del modelo (libros -> extracto), comunes a PDF y Excel
  function lineasModelo(m) {
    return [
      { texto: 'Saldo según libros (saldo anterior + débitos − créditos)', valor: m.libros, tipo: 'total' },
      { texto: 'Más: cheques y egresos girados pendientes de cobro', valor: m.cheques },
      { texto: 'Menos: consignaciones en libros que no aparecen en el extracto', valor: m.consignaciones },
      { texto: 'Más: notas crédito del extracto pendientes de registrar', valor: m.notasCredito },
      { texto: 'Menos: notas débito y gastos bancarios pendientes de registrar', valor: m.notasDebito },
      { texto: 'Más / menos: diferencias de valor por conciliar (extracto − libros)', valor: m.diferencias, tipo: Math.abs(m.diferencias) >= 0.005 ? 'alerta' : '' },
      { texto: 'Saldo según extracto (calculado)', valor: m.calculado, tipo: 'total' },
      { texto: 'Saldo según extracto bancario', valor: m.digitado, tipo: 'entrada' },
      { texto: 'Diferencia sin explicar', valor: m.sinExplicar, tipo: m.sinExplicar && Math.abs(m.sinExplicar) >= 0.005 ? 'alerta' : '' },
    ];
  }
  const textoEstadoModelo = (m) => m.digitado === null ? 'Pendiente: falta digitar el saldo del extracto'
    : Math.abs(m.sinExplicar) < 0.005 ? 'Conciliado' : 'Con diferencia sin explicar';
  const nombreArchivoConciliacion = (bancos) => {
    const p = estado.resultado.periodo;
    return `Conciliación bancaria ${bancos.length === 1 ? bancos[0] + ' ' : ''}${p.empresa} ${p.nombre}`;
  };

  // ---------- Exportar conciliación a Excel (una hoja con formato por banco) ----------
  function hojasConciliacion(bancos) {
    const E = Archivos.ESTILO;
    const p = estado.resultado.periodo;
    return bancos.map((banco) => {
      const m = modelo(banco);
      const filas = [];
      const combinar = [];
      const fila = (...celdas) => { filas.push(celdas); };
      const unir = (rango) => combinar.push(rango.replace(/#/g, filas.length));
      fila({ v: 'MODELO BÁSICO DE CONCILIACIÓN BANCARIA', s: E.titulo }); unir('A#:F#');
      fila({ v: `${p.razonSocial}${p.nit ? ' · NIT ' + p.nit : ''}`, s: E.sutil }); unir('A#:F#');
      fila();
      for (const [etq, valor, s] of [['Empresa', p.razonSocial], ['NIT', p.nit || ''], ['Entidad', banco], ['Cuenta (SCI)', m.cuenta || 'Sin libro de bancos cargado'],
        ['Periodo', p.nombre], ['Fecha de corte', U.fmtFecha(p.corte)]]) {
        fila({ v: etq, s: E.negrita }, { v: valor, s: s || 0 }); unir('B#:F#');
      }
      fila();
      for (const l of lineasModelo(m)) {
        const total = l.tipo === 'total';
        const sTexto = total ? E.totalTxt : l.tipo === 'entrada' ? E.negrita : E.txtLinea;
        const sValor = total ? E.totalNum : l.tipo === 'entrada' ? E.numEntrada : l.tipo === 'alerta' ? E.numRojo : E.numLinea;
        fila({ v: l.texto, s: sTexto }, { s: sTexto }, { s: sTexto }, { s: sTexto }, { s: sTexto }, { v: l.valor, s: sValor }); unir('A#:E#');
      }
      fila({ v: 'Estado', s: E.negrita }, null, null, null, null, { v: textoEstadoModelo(m), s: E.negrita });
      fila();
      fila({ v: 'DETALLE DE PARTIDAS CONCILIATORIAS', s: E.titulo }); unir('A#:F#');
      fila(...['Partida', 'Fecha', 'Valor extracto', 'Valor libros', 'Diferencia / partida', 'Descripción'].map((v) => ({ v, s: E.encabezado })));
      const partidas = partidasBanco(banco);
      if (!partidas.length) { fila({ v: 'Sin partidas pendientes', s: E.sutil }); unir('A#:F#'); }
      for (const x of partidas) {
        fila({ v: x.partida, s: E.txtLinea }, { v: x.fecha, s: E.fechaLinea }, { v: x.valorExtracto, s: E.numLinea }, { v: x.valorLibros, s: E.numLinea },
          { v: x.valorPartida, s: x.partida.startsWith('Por conciliar') ? E.numRojo : E.numLinea }, { v: x.descripcion, s: E.txtLinea });
      }
      if (partidas.length) {
        fila({ v: 'Total partidas', s: E.totalTxt }, { s: E.totalTxt }, { s: E.totalTxt }, { s: E.totalTxt },
          { v: U.redondear(U.suma(partidas, (x) => x.valorPartida)), s: E.totalNum }, { s: E.totalTxt });
      }
      fila(); fila(); fila();
      fila({ v: 'Elaboró: ______________________________', s: 0 }, null, null, { v: 'Revisó: ______________________________', s: 0 });
      fila({ v: `Fecha de elaboración: ${U.fmtFecha(U.hoySerial())}`, s: E.sutil });
      return { nombre: `Conciliación ${banco}`, libre: true, anchos: [44, 12, 17, 17, 18, 60], filas, combinar };
    });
  }
  function exportarConciliacionExcel(bancos) {
    descargar(Archivos.escribirXlsx(hojasConciliacion(bancos)), `${nombreArchivoConciliacion(bancos)}.xlsx`);
  }

  // ---------- Exportar conciliación a PDF (documento de impresión -> "Guardar como PDF") ----------
  function htmlConciliacion(bancos) {
    const p = estado.resultado.periodo;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const num = (v) => (v === null || v === undefined ? '' : U.fmtNum(v, 2));
    const paginas = bancos.map((banco) => {
      const m = modelo(banco);
      const mv = m.movimiento;
      const partidas = partidasBanco(banco);
      const claseEstado = m.digitado === null ? 'pend' : Math.abs(m.sinExplicar) < 0.005 ? 'ok' : 'mal';
      const filasModelo = lineasModelo(m).map((l) => `<tr class="${l.tipo || ''}"><td>${esc(l.texto)}</td><td>${l.tipo === 'entrada' && l.valor === null ? '<span class="falta">No digitado</span>' : num(l.valor)}</td></tr>`).join('');
      const tablaPartidas = partidas.length
        ? `<table class="partidas"><thead><tr><th>Partida</th><th>Fecha</th><th>Valor extracto</th><th>Valor libros</th><th>Diferencia / partida</th><th>Descripción</th></tr></thead><tbody>${
          partidas.map((x) => `<tr><td>${esc(x.partida)}</td><td class="n">${U.fmtFecha(x.fecha)}</td><td class="n">${num(x.valorExtracto)}</td><td class="n">${num(x.valorLibros)}</td><td class="n${x.partida.startsWith('Por conciliar') ? ' rojo' : ''}">${num(x.valorPartida)}</td><td>${esc(x.descripcion)}</td></tr>`).join('')
        }</tbody><tfoot><tr><td colspan="4">Total partidas</td><td class="n">${num(U.redondear(U.suma(partidas, (x) => x.valorPartida)))}</td><td></td></tr></tfoot></table>`
        : '<p class="sutil">Sin partidas pendientes.</p>';
      return `<section class="pagina">
        <header><div><h1>Modelo básico de conciliación bancaria</h1><p>${esc(p.razonSocial)}${p.nit ? ' · NIT ' + esc(p.nit) : ''}</p></div><div class="sello ${claseEstado}">${esc(textoEstadoModelo(m))}</div></header>
        <table class="datos-generales">
          <tr><th>Entidad</th><td>${esc(banco)}</td><th>Periodo</th><td>${esc(p.nombre)}</td></tr>
          <tr><th>Cuenta (SCI)</th><td>${esc(m.cuenta || 'Sin libro de bancos cargado')}</td><th>Fecha de corte</th><td>${U.fmtFecha(p.corte)}</td></tr>
        </table>
        <h2>Movimiento del mes</h2>
        <table class="movimiento"><thead><tr><th></th><th>Libros SCI</th><th>Extracto bancario</th><th>Diferencia</th></tr></thead><tbody>
          <tr><td>Total entradas de dinero</td><td class="n">${num(mv.entradasLibros)}</td><td class="n">${num(mv.entradasExtracto)} <span class="sutil">(${mv.nEntradasExtracto} mov.)</span></td><td class="n${Math.abs(mv.entradasExtracto - mv.entradasLibros) >= 0.005 ? ' rojo' : ''}">${num(U.redondear(mv.entradasExtracto - mv.entradasLibros))}</td></tr>
          <tr><td>Total salidas de dinero</td><td class="n">${num(mv.salidasLibros)}</td><td class="n">${num(mv.salidasExtracto)} <span class="sutil">(${mv.nSalidasExtracto} mov.)</span></td><td class="n${Math.abs(mv.salidasExtracto - mv.salidasLibros) >= 0.005 ? ' rojo' : ''}">${num(U.redondear(mv.salidasExtracto - mv.salidasLibros))}</td></tr>
          <tr class="neto"><td>Movimiento neto (entradas − salidas)</td><td class="n">${num(U.redondear(mv.entradasLibros - mv.salidasLibros))}</td><td class="n">${num(U.redondear(mv.entradasExtracto - mv.salidasExtracto))}</td><td class="n">${num(U.redondear((mv.entradasExtracto - mv.salidasExtracto) - (mv.entradasLibros - mv.salidasLibros)))}</td></tr>
        </tbody></table>
        <h2>Modelo de conciliación</h2>
        <table class="modelo">${filasModelo}</table>
        <h2>Detalle de partidas conciliatorias</h2>
        ${tablaPartidas}
        <div class="firmas"><div>Elaboró</div><div>Revisó</div></div>
        <footer>Generado por el Conciliador contable el ${U.fmtFecha(U.hoySerial())}</footer>
      </section>`;
    }).join('');
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(nombreArchivoConciliacion(bancos))}</title><style>
      @page { size: A4 portrait; margin: 14mm 12mm; }
      * { box-sizing: border-box; } body { font: 10.5px/1.4 "Segoe UI", Calibri, Arial, sans-serif; color: #1c2433; margin: 0; background: #fff; }
      .pagina { page-break-after: always; } .pagina:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #1f3864; padding-bottom: 8px; margin-bottom: 12px; }
      h1 { font-size: 17px; color: #1f3864; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .02em; } header p { margin: 0; color: #555; font-size: 12px; }
      h2 { font-size: 12px; color: #1f3864; text-transform: uppercase; margin: 18px 0 6px; }
      .sello { padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; white-space: nowrap; }
      .sello.ok { background: #e3f4ea; color: #1e7b45; } .sello.mal { background: #fdeceb; color: #b42318; } .sello.pend { background: #fff4dc; color: #9a5b00; }
      table { width: 100%; border-collapse: collapse; }
      .datos-generales th { text-align: left; color: #667085; font-weight: 600; width: 16%; padding: 3px 6px 3px 0; } .datos-generales td { padding: 3px 12px 3px 0; font-weight: 600; }
      .movimiento th { background: #1f3864; color: #fff; text-align: right; padding: 5px 8px; font-size: 9.5px; } .movimiento th:first-child { text-align: left; }
      .movimiento td { padding: 5px 8px; border-bottom: 1px solid #e2e6ee; } .movimiento .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .movimiento tr.neto td { background: #dde8f6; font-weight: 700; }
      .modelo { margin-top: 4px; } .modelo td { padding: 6px 8px; border-bottom: 1px solid #e2e6ee; }
      .modelo td:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; width: 30%; }
      .modelo tr.total td { background: #dde8f6; font-weight: 700; } .modelo tr.alerta td:last-child { color: #b42318; font-weight: 700; }
      .modelo tr.entrada td { font-weight: 700; } .modelo tr.entrada td:last-child { background: #fff4dc; } .falta { color: #9a5b00; font-weight: 600; }
      .partidas th { background: #1f3864; color: #fff; text-align: left; padding: 5px 6px; font-size: 9.5px; }
      .partidas td { padding: 4px 6px; border-bottom: 1px solid #e2e6ee; vertical-align: top; }
      .partidas .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .partidas tfoot td { font-weight: 700; background: #dde8f6; }
      .rojo { color: #b42318; font-weight: 700; } .sutil { color: #667085; }
      .firmas { display: flex; gap: 60px; margin-top: 60px; } .firmas div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-weight: 600; }
      footer { margin-top: 18px; font-size: 9px; color: #98a2b3; text-align: right; }
      tr { page-break-inside: avoid; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style></head><body>${paginas}</body></html>`;
  }
  function exportarConciliacionPDF(bancos) {
    const marco = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: 'Impresión de la conciliación' });
    document.body.append(marco);
    marco.addEventListener('load', () => {
      const tituloAnterior = document.title;
      document.title = nombreArchivoConciliacion(bancos);
      marco.contentWindow.focus();
      marco.contentWindow.print();
      setTimeout(() => { document.title = tituloAnterior; marco.remove(); }, 2000);
    }, { once: true });
    marco.srcdoc = htmlConciliacion(bancos);
    avisoFlotante('En el diálogo de impresión elija "Guardar como PDF"');
  }

  // ---------- Gastos bancarios ----------
  function vistaGastos() {
    return h('div', {},
      encabezado('Relación de gastos bancarios', 'Movimientos del extracto clasificados con los conceptos bancarios de Configuración, con el asiento sugerido. Clic en una fila para ver el detalle por fecha.'),
      h('div', { class: 'panel' }, crearTabla({ columnas: [
        { clave: 'banco', titulo: 'Banco' }, { clave: 'categoria', titulo: 'Categoría' }, { clave: 'cuentaContable', titulo: 'Cuenta' },
        { clave: 'movimientos', titulo: 'Movimientos', tipo: 'entero' }, { clave: 'valorExtracto', titulo: 'Valor extracto', tipo: 'moneda2', total: true },
        { clave: 'registradoSCI', titulo: 'Registrado en SCI', tipo: 'moneda2', total: true },
        { clave: 'diferenciaPorConciliar', titulo: 'Diferencia por conciliar', tipo: 'diferencia', total: true },
        { clave: 'pendiente', titulo: 'Pendiente por causar', tipo: 'moneda2', total: true }, { clave: 'asiento', titulo: 'Asiento sugerido', tipo: 'largo' }],
      filas: estado.resultado.gastos, filtros: ['banco'], memoria: 'gastos', alClic: abrirGasto })));
  }

  // Ventana con los movimientos de un gasto bancario, por fecha
  const COLUMNAS_DETALLE_GASTO = [
    { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }, { clave: 'descripcionExtracto', titulo: 'Descripción extracto', tipo: 'largo' },
    { clave: 'valorExtracto', titulo: 'Valor extracto', tipo: 'moneda2', total: true }, { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
    { clave: 'valorLibros', titulo: 'Registrado en SCI', tipo: 'moneda2', total: true }, { clave: 'documentoSCI', titulo: 'Documento SCI' },
    { clave: 'fechaLibros', titulo: 'Fecha libros', tipo: 'fecha' }, { clave: 'metodo', titulo: 'Cómo se cruzó', tipo: 'largo' }, { clave: 'referencia', titulo: 'Referencia' },
  ];
  function abrirGasto(g) {
    const r = estado.resultado;
    const movimientos = r.bancos.filter((b) => b.categoria === g.categoria && b.banco === g.banco && (b.cuentaContable || '') === (g.cuentaContable || '') && b.fechaExtracto !== null)
      .sort((a, b) => a.fecha - b.fecha);
    const titulo = `${g.categoria} · ${g.banco}`;
    const exportarDetalle = () => descargar(Archivos.escribirXlsx([hoja(g.categoria.replace(/[\\/:*?[\]]/g, '-').slice(0, 31),COLUMNAS_DETALLE_GASTO, movimientos)]),
      `${titulo.replace(/[\\/:*?"<>|]/g, '-')} ${r.periodo.empresa} ${r.periodo.nombre}.xlsx`);
    const dialogo = h('dialog', { class: 'detalle' },
      h('div', { class: 'detalle-cabeza' },
        h('div', {}, h('h2', {}, titulo),
          h('p', { class: 'sutil' }, `${movimientos.length} movimientos · ${g.cuentaContable ? 'cuenta ' + g.cuentaContable : 'cuenta sin definir'} · total extracto $ ${U.fmtNum(g.valorExtracto, 2)}`)),
        h('div', { class: 'acciones' },
          h('button', { class: 'boton chico', onclick: exportarDetalle }, 'Exportar a Excel'),
          h('button', { class: 'boton chico', onclick: () => dialogo.close() }, '✕ Cerrar'))),
      h('div', { class: 'detalle-cuerpo' },
        h('p', { class: 'sutil', style: 'margin-bottom:8px' }, g.asiento),
        h('div', { class: 'panel' }, crearTabla({ columnas: COLUMNAS_DETALLE_GASTO, filas: movimientos, filtros: ['estado'], ordenEstados: Motor.ORDEN_BANCOS }))));
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.append(dialogo);
    dialogo.showModal();
  }

  // ---------- Control de carga ----------
  function vistaControl() {
    const r = estado.resultado;
    const avisos = r.advertencias.length ? r.advertencias.map((a) => h('div', { class: 'aviso' }, h('b', {}, a.tipo), h('span', {}, a.detalle)))
      : [h('div', { class: 'aviso ok' }, h('b', {}, 'Sin advertencias'), h('span', {}, 'Todo en orden'))];
    return h('div', {},
      encabezado('Control de carga', 'Revise aquí primero: qué archivos se leyeron, con qué fechas y si hay algo por corregir.'),
      panel('Advertencias', null, avisos),
      h('div', { class: 'panel' }, h('h3', {}, 'Archivos leídos'), crearTabla({ columnas: [
        { clave: 'fuente', titulo: 'Fuente' }, { clave: 'banco', titulo: 'Banco' }, { clave: 'archivo', titulo: 'Archivo' },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'filas', titulo: 'Filas', tipo: 'entero' },
        { clave: 'fechaMin', titulo: 'Fecha mínima', tipo: 'fecha' }, { clave: 'fechaMax', titulo: 'Fecha máxima', tipo: 'fecha' },
        { clave: 'modificadoTxt', titulo: 'Modificado' }, { clave: 'error', titulo: 'Error', tipo: 'largo' }],
      memoria: 'control', filas: r.control.map((c) => ({ ...c, modificadoTxt: c.modificado ? c.modificado.toLocaleString('es-CO') : '' })), filtros: ['fuente', 'estado'] })));
  }

  // ---------- Configuración ----------
  let temporizador = null;
  function configCambiada() {
    Config.guardar(estado.config);
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { if (estado.conjunto) procesar(false); avisoFlotante('Configuración guardada · resultados actualizados'); }, 400);
  }

  function vistaConfiguracion() {
    const c = estado.config, p = c.parametros;
    const campoNum = (clave, etiqueta, ayuda) => {
      const inp = h('input', { type: 'text', inputmode: 'decimal', value: p[clave] });
      inp.addEventListener('change', () => { p[clave] = U.num(inp.value) ?? 0; inp.value = p[clave]; configCambiada(); });
      return h('div', { class: 'campo' }, h('label', {}, etiqueta), inp, h('p', { class: 'sutil' }, ayuda));
    };
    const campoLista = (clave, etiqueta, opciones, ayuda) => {
      const sel = h('select', {}, opciones.map(([valor, texto]) => h('option', { value: valor, selected: p[clave] === valor }, texto)));
      sel.addEventListener('change', () => { p[clave] = sel.value; U.usarSeparadorDecimal(p.separadorDecimal); configCambiada(); });
      return h('div', { class: 'campo' }, h('label', {}, etiqueta), sel, h('p', { class: 'sutil' }, ayuda));
    };


    const empresa = estado.resultado?.periodo.empresa || 'Empresa';
    if (!c.partidasAnteriores[empresa]) c.partidasAnteriores[empresa] = [];
    const bancos = U.unicos(['Bancolombia', 'Davivienda', ...(estado.resultado?.saldos.map((s) => s.banco) || [])]);

    const archivoConfig = h('input', { type: 'file', accept: '.json', hidden: true });
    archivoConfig.addEventListener('change', async () => {
      try {
        const datos = JSON.parse(await archivoConfig.files[0].text());
        estado.config = { ...Config.restaurar(), ...datos, parametros: { ...Config.restaurar('parametros'), ...(datos.parametros || {}) } };
        Config.guardar(estado.config); if (estado.conjunto) procesar(false); mostrar('configuracion'); avisoFlotante('Configuración importada');
      } catch (e) { alert('No se pudo leer el archivo de configuración: ' + e.message); }
    });

    return h('div', {},
      encabezado('Configuración', 'Los cambios se guardan en este navegador y los resultados se recalculan al instante.',
        h('div', { class: 'acciones' },
          h('button', { class: 'boton', onclick: () => descargar(new Blob([JSON.stringify(estado.config, null, 2)], { type: 'application/json' }), 'Configuracion conciliador.json') }, 'Exportar configuración'),
          h('button', { class: 'boton', onclick: () => archivoConfig.click() }, 'Importar configuración'), archivoConfig,
          h('button', { class: 'boton peligro', onclick: () => { if (confirm('¿Restaurar tipos, conceptos y parámetros a los valores iniciales? (los saldos digitados y partidas anteriores se conservan)')) {
            const r = Config.restaurar(); estado.config = { ...r, saldosExtracto: c.saldosExtracto, partidasAnteriores: c.partidasAnteriores }; configCambiada(); mostrar('configuracion'); } } }, 'Restaurar valores iniciales'))),
      panel('Parámetros', null, h('div', { class: 'formulario' },
        campoNum('toleranciaDocumentos', 'Tolerancia valor documentos ($)', 'Diferencia aceptada entre DIAN y SCI por redondeos.'),
        campoNum('toleranciaDiasBancos', 'Tolerancia días bancos', 'Días de diferencia aceptados entre la fecha del extracto y la de libros.'),
        campoNum('diferenciaMaximaEmparejarBancos', 'Diferencia máxima para emparejar en bancos ($)', 'Solo sirve para mostrar juntos extracto y libros cuando no son iguales. Cualquier diferencia queda Por conciliar.'),
        campoLista('separadorDecimal', 'Separador decimal', [['punto', 'Punto: $ 1,000,020.52'], ['coma', 'Coma: $ 1.000.020,52']],
          'Cómo se muestran los valores en pantalla, en las ventanas y en el PDF. Los archivos de Excel exportados no cambian.'),
      )),
      panel(`Partidas pendientes de meses anteriores · ${empresa}`, null,
        h('p', { class: 'sutil', style: 'margin-bottom:8px' }, 'Cheques girados no cobrados o consignaciones en tránsito de meses anteriores. Salidas en negativo. Se concilian cuando aparezcan en el extracto.'),
        crearEditor([{ clave: 'banco', titulo: 'Banco', tipo: 'lista', opciones: bancos, ancho: '160px' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: '160px' },
          { clave: 'documento', titulo: 'Documento' }, { clave: 'beneficiario', titulo: 'Beneficiario' }, { clave: 'valor', titulo: 'Valor', tipo: 'numero', ancho: '160px' }],
        c.partidasAnteriores[empresa], configCambiada, 'Agregar partida')),
      h('div', { class: 'dos-columnas' },
        panel('Tipos de documento DIAN', null, h('p', { class: 'sutil', style: 'margin-bottom:8px' }, 'Clase: Compra, NC compra, Venta, NC venta o Excluir.'),
          crearEditor([{ clave: 'tipo', titulo: 'Tipo de documento DIAN' }, { clave: 'grupo', titulo: 'Grupo', tipo: 'lista', opciones: ['Recibido', 'Emitido'], ancho: '120px' },
            { clave: 'clase', titulo: 'Clase', tipo: 'lista', opciones: ['Compra', 'NC compra', 'Venta', 'NC venta', 'Excluir'], ancho: '130px' }], c.tiposDIAN, configCambiada)),
        panel('Tipos de transacción SCI', null, h('p', { class: 'sutil', style: 'margin-bottom:8px' }, 'Solo Compra / NC compra / Venta / NC venta se cruzan con la DIAN.'),
          crearEditor([{ clave: 'tipo', titulo: 'Tipo de documento SCI' }, { clave: 'clase', titulo: 'Clase', tipo: 'lista', opciones: ['Compra', 'NC compra', 'Venta', 'NC venta', 'Otro'], ancho: '130px' }], c.tiposSCI, configCambiada))),
      panel('Conceptos bancarios (gastos, intereses, impuestos)', null,
        h('p', { class: 'sutil', style: 'margin-bottom:8px' }, 'Si la descripción del extracto contiene el texto, se clasifica en esa categoría. Gana la PRIMERA fila que coincida: ponga arriba los textos más específicos.'),
        crearEditor([{ clave: 'banco', titulo: 'Banco', tipo: 'lista', opciones: bancos, ancho: '150px' }, { clave: 'texto', titulo: 'Texto que contiene' },
          { clave: 'categoria', titulo: 'Categoría' }, { clave: 'cuenta', titulo: 'Cuenta contable', ancho: '140px' }], c.conceptosBancarios, configCambiada, 'Agregar concepto')),
      estado.resultado ? h('div', { class: 'panel' }, h('h3', {}, `Tabla de impuestos en uso · origen: ${estado.resultado.origenImpuestos}`),
        crearTabla({ columnas: [{ clave: 'identificador', titulo: 'Identificador' }, { clave: 'codigo', titulo: 'Código', tipo: 'entero' },
          { clave: 'porcentaje', titulo: '%', tipo: 'moneda' }, { clave: 'nombre', titulo: 'Nombre' }, { clave: 'dbcr', titulo: 'DB/CR' },
          { clave: 'cuenta', titulo: 'Cuenta contable' }, { clave: 'impuesto', titulo: 'Impuesto' }], filas: estado.resultado.tarifasEnUso, filtros: ['identificador'], memoria: 'impuestos' })) : '');
  }

  // ---------- Guía ----------
  function vistaGuia() {
    const seccion = (titulo, pares) => [h('h3', {}, titulo), h('dl', {}, pares.flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)]))];
    return h('div', { class: 'panel' }, h('div', { class: 'panel-cuerpo guia' },
      h('h2', {}, 'Cómo funciona el conciliador integral'),
      h('p', { class: 'sutil' }, 'Todo se procesa en este computador, dentro del navegador. Ningún archivo se envía a internet.'),
      seccion('1 · Lectura', [
        ['Carpeta', 'Seleccione la carpeta de la empresa (ej. "01. Inversiones Mindala SAS"), la del mes o la del año. La página encuentra cada empresa y mes y, si hay varios, los ofrece en el selector de arriba.'],
        ['XML', 'Se leen todos los .xml (y .zip con XML) de "01. Causaciones", en cualquier subcarpeta. Los acuses (ApplicationResponse) se omiten.'],
        ['Reportes', 'Subcarpetas de "06. Reportes sistema de contabilizacion (SCI)": Dian, Digitacion, Eventos, Mov bancolombia (.csv), Mov davivienda, SCI Bancolombia, SCI Davivienda, Tabla de impuestos y Tabla de codificacion (.csv de SCI).'],
        ['Si un archivo falla', 'Los demás se procesan igual; el archivo queda en Control de carga con el motivo.'],
      ]),
      seccion('XML vs DIAN', [
        ['Cruce', 'Primero por CUFE; si no, por tercero + número de documento (queda la alerta "CUFE distinto").'],
        ['OK', 'El XML está en el reporte DIAN y el total coincide (dentro de la tolerancia de documentos).'],
        ['Falta XML', 'Documento recibido del mes en el reporte DIAN que no tiene XML en 01. Causaciones.'],
        ['XML no está en DIAN', 'XML guardado que no aparece en el reporte DIAN. Las alertas dicen si está a nombre de otro adquiriente o si es posterior a la fecha del reporte.'],
        ['En SCI', 'Contabilizado si el documento aparece en la digitación de SCI (por CUFE o por tercero + número).'],
      ]),
      seccion('Eventos por acusar', [
        ['Qué incluye', 'Facturas electrónicas recibidas a crédito (forma de pago 2 en el reporte DIAN o "Crédito" en el XML).'],
        ['Por acusar', 'No aparecen en el reporte de Eventos de SCI (carpeta Eventos) y no tienen nota crédito.'],
        ['Con nota crédito', 'La factura tiene nota crédito: NO se acusa. El vínculo sale del XML de la nota, que trae el CUFE y el número de la factura que afecta. La alerta dice si la nota es parcial o anula el total.'],
        ['Posible nota crédito', 'Nota crédito que está en el reporte DIAN pero sin XML, del mismo proveedor y valor que la factura. Como el reporte no dice a qué factura corresponde, revise antes de acusar (o guarde el XML de la nota en 01. Causaciones).'],
        ['Evento incompleto', 'Aparecen, pero la recepción de la factura, de la mercancía o la aceptación no está Validada.'],
      ]),
      seccion('2 · Normalización', [
        ['Números', 'Entiende 1234.5, 1.234,50, $ 13.320.406,00 y -1728000.00.'],
        ['Fechas', 'Usa el formato de cada fuente (DIAN dd-mm-aaaa, SCI mm/dd/aaaa, libro de bancos 01-Sep-2026, Bancolombia aaaammdd).'],
        ['Documentos', 'El número de factura se compara de 3 formas: completo sin ceros, últimos 9 caracteres y solo el número.'],
      ]),
      seccion('3 · Compras y ventas', [
        ['DIAN', 'Un registro por CUFE, clasificado con Tipos DIAN y marcado como del mes o de meses anteriores.'],
        ['SCI', 'IVA = subtotal × % del código (tabla de impuestos); retención = subtotal + IVA − valor neto; las líneas contrarias restan. Se agrupa por tercero + factura.'],
        ['Cruce', '1) número exacto, 2) últimos 9 caracteres, 3) solo número, 4) mismo tercero y valor (queda como "Número distinto").'],
        ['Eventos', 'Se cruzan por CUFE; una factura recibida a crédito sin evento queda con alerta.'],
      ]),
      seccion('4 · Bancos', [
        ['Regla', 'Solo es Conciliado si extracto y libros son iguales al centavo. Cualquier diferencia queda "Por conciliar: diferencia de valor" con ambos valores y la diferencia.'],
        ['Paso 1', 'Fecha y valor exactos.'],
        ['Paso 2', 'Valor parecido (hasta la diferencia máxima para emparejar) con fecha cercana. Los gastos bancarios solo con valor idéntico.'],
        ['Paso 3', 'Gastos bancarios en bloque. Primero, la suma de todos los cargos bancarios del mes (salidas) contra un egreso de SCI con el banco como tercero, y la de todos los abonos (entradas, ej. intereses) contra un ingreso con el banco como tercero; se prefiere el registro más cercano al último día del mes y se acepta diferencia hasta la máxima para emparejar, que queda Por conciliar en el movimiento de mayor valor. Lo que sobre se cruza por categoría (ej. total 4x1000) solo con valor idéntico.'],
        ['Paso 4', 'Pagos en lote: varios egresos del mismo día contra un solo débito del extracto.'],
        ['Conciliación', 'Saldo libros + partidas = saldo extracto calculado; usted digita el saldo real y la diferencia debe dar 0.'],
      ]),
      seccion('5 · Mantenimiento', [
        ['Nuevo tipo', 'Agréguelo en Configuración (Tipos DIAN o Tipos SCI). Las advertencias le avisan cuando aparece uno nuevo.'],
        ['Nuevo concepto bancario', 'Agréguelo en Conceptos bancarios, con los textos más específicos arriba.'],
        ['Respaldo', 'Exporte la configuración a un archivo .json para guardarla o pasarla a otro computador.'],
      ])));
  }

  // ---------- Exportar a Excel ----------
  function descargar(blob, nombre) {
    const a = h('a', { href: URL.createObjectURL(blob), download: nombre });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const hoja = (nombre, columnas, filas) => ({
    nombre,
    columnas: columnas.map((c) => ({ titulo: c.titulo, tipo: ['moneda', 'moneda2', 'diferencia'].includes(c.tipo) ? 'numero' : c.tipo === 'fecha' ? 'fecha' : c.tipo === 'entero' ? 'numero' : 'texto',
      ancho: c.tipo === 'largo' || c.tipo === 'alerta' ? 45 : undefined })),
    filas: filas.map((f) => columnas.map((c) => f[c.clave] ?? null)),
  });
  function exportar() {
    const r = estado.resultado;
    if (!r) return;
    const resumen = [];
    const agregar = (seccion, concepto, cantidad, valor) => resumen.push({ seccion, concepto, cantidad, valor });
    for (const e of Motor.ORDEN_XML) { const g = r.xmlDian.filter((f) => f.estado === e); if (g.length) agregar('XML vs DIAN', e, g.length, U.suma(g, (f) => f.totalXML ?? f.totalDIAN)); }
    for (const e of Motor.ORDEN_EVENTOS) { const g = r.eventosPendientes.filter((f) => f.estado === e); if (g.length) agregar('Eventos (facturas a crédito)', e, g.length, U.suma(g, (f) => f.total)); }
    for (const [clave, nombre] of [['compras', 'Compras'], ['ventas', 'Ventas']]) {
      for (const e of Motor.ORDEN_DOCS) { const g = r[clave].filter((f) => f.estado === e); if (g.length) agregar(nombre, e, g.length, U.suma(g, (f) => f.totalDIAN ?? f.totalSCI)); }
    }
    for (const b of bancosVisibles()) {
      for (const e of Motor.ORDEN_BANCOS) { const g = r.bancos.filter((f) => f.banco === b && f.estado === e); if (g.length) agregar(`Bancos ${b}`, e, g.length, U.suma(g, (f) => f.valorPartida ?? f.valorExtracto ?? f.valorLibros)); }
    }
    const colTexto = (clave, titulo, tipo = 'texto') => ({ clave, titulo, tipo });
    const libro = Archivos.escribirXlsx([
      hoja('Resumen', [colTexto('seccion', 'Sección'), colTexto('concepto', 'Estado'), colTexto('cantidad', 'Cantidad', 'entero'), colTexto('valor', 'Valor', 'moneda')], resumen),
      hoja('XML vs DIAN', COLUMNAS_XML_DIAN, r.xmlDian),
      hoja('Eventos por acusar', COLUMNAS_EVENTOS, r.eventosPendientes),
      hoja('Facturas XML', [...COLUMNAS_XML, { clave: 'archivo', titulo: 'Archivo', tipo: 'largo' }], r.xmls),
      hoja('Productos XML', COLUMNAS_PRODUCTOS, productosDe(r.xmls)),
      hoja('Tabla de codificación', COLUMNAS_CODIFICACION, r.codificacion),
      hoja('Compras', COLUMNAS_DOCS, r.compras),
      hoja('Ventas', COLUMNAS_DOCS, r.ventas),
      hoja('Bancos', COLUMNAS_BANCOS, r.bancos),
      ...hojasConciliacion(bancosVisibles()),
      hoja('Gastos bancarios', [colTexto('banco', 'Banco'), colTexto('categoria', 'Categoría'), colTexto('cuentaContable', 'Cuenta'), colTexto('movimientos', 'Movimientos', 'entero'),
        colTexto('valorExtracto', 'Valor extracto', 'moneda'), colTexto('registradoSCI', 'Registrado en SCI', 'moneda'), colTexto('diferenciaPorConciliar', 'Diferencia por conciliar', 'moneda'),
        colTexto('pendiente', 'Pendiente por causar', 'moneda'), colTexto('asiento', 'Asiento sugerido', 'largo')], r.gastos),
      hoja('Control de carga', [colTexto('fuente', 'Fuente'), colTexto('archivo', 'Archivo', 'largo'), colTexto('estado', 'Estado'), colTexto('filas', 'Filas', 'entero'),
        colTexto('fechaMin', 'Fecha mínima', 'fecha'), colTexto('fechaMax', 'Fecha máxima', 'fecha'), colTexto('error', 'Error', 'largo')], r.control),
      hoja('Advertencias', [colTexto('tipo', 'Tipo'), colTexto('detalle', 'Detalle', 'largo'), colTexto('cantidad', 'Cantidad', 'entero')], r.advertencias),
    ]);
    descargar(libro, `Conciliación ${r.periodo.empresa} ${r.periodo.nombre}.xlsx`);
  }

  // ---------- Recorrido de carpetas ----------
  // La página recorre la carpeta ella misma y, dentro de cada empresa, solo entra a "01. Causaciones" y "06. Reportes…".
  // Así no toca Egresos, Nómina, etc., donde hay rutas de más de 260 caracteres que hacen fallar
  // la selección de carpeta normal de Chrome en Windows.
  const esCarpetaUtil = (n) => /^(\d{1,2}\.\s*)?causaciones$/i.test(n.trim()) || /reportes/i.test(n);
  const EXTENSIONES_UTILES = /\.(xml|zip|xlsx|xlsm|csv)$/i;

  // Adaptadores: carpeta elegida con el selector (FileSystemDirectoryHandle) o carpeta arrastrada (webkitGetAsEntry)
  const nodoHandle = (hnd) => ({
    nombre: hnd.name, esCarpeta: hnd.kind === 'directory', archivo: () => hnd.getFile(),
    hijos: async () => { const l = []; for await (const x of hnd.values()) l.push(nodoHandle(x)); return l; },
  });
  const nodoEntrada = (ent) => ({
    nombre: ent.name, esCarpeta: ent.isDirectory, archivo: () => new Promise((ok, mal) => ent.file(ok, mal)),
    hijos: async () => {
      const lector = ent.createReader(), l = [];
      let lote;
      do { lote = await new Promise((ok, mal) => lector.readEntries(ok, mal)); l.push(...lote); } while (lote.length);
      return l.map(nodoEntrada);
    },
  });

  async function recorrer(nodo, ruta, salida, dentroUtil) {
    const base = `${ruta}${nodo.nombre}/`;
    let hijos;
    try { hijos = await nodo.hijos(); } catch (e) { salida.omitidos.push(`${base} (${e.message || e})`); return; }
    salida.carpetas.push(base);
    // Si esta carpeta tiene "01. Causaciones" o "06. Reportes…" es la de una empresa: solo se entra a esas dos
    const utiles = hijos.filter((x) => x.esCarpeta && esCarpetaUtil(x.nombre));
    for (const x of hijos) {
      if (x.esCarpeta) {
        const util = utiles.includes(x);
        if (!dentroUtil && utiles.length && !util) continue;
        await recorrer(x, base, salida, dentroUtil || util);
      } else if (EXTENSIONES_UTILES.test(x.nombre) && !x.nombre.startsWith('~$')) {
        try {
          const f = await x.archivo();
          f.rutaRelativa = base + x.nombre;
          salida.archivos.push(f);
          $('textoProgreso').textContent = `${salida.archivos.length} archivos encontrados · ${base}`;
        } catch (e) { salida.omitidos.push(`${base}${x.nombre} (${e.message || e})`); }
      }
    }
  }

  async function cargarCarpetas(nodos) {
    mostrarSeccion('progreso');
    $('barraProgreso').style.width = '0';
    $('textoProgreso').textContent = 'Buscando XML y reportes…';
    const salida = { archivos: [], omitidos: [], carpetas: [] };
    try {
      for (const n of nodos) {
        if (n.esCarpeta) await recorrer(n, '', salida, esCarpetaUtil(n.nombre));
        else if (EXTENSIONES_UTILES.test(n.nombre)) { const f = await n.archivo(); f.rutaRelativa = n.nombre; salida.archivos.push(f); }
      }
    } catch (e) {
      salida.omitidos.push(`Error al recorrer la carpeta: ${e.message || e}`);
    }
    if (!salida.archivos.length) {
      mostrarSeccion(estado.resultado ? 'vista' : 'vacio');
      alert(`No se encontraron XML ni reportes en la carpeta elegida.\n\nCarpetas revisadas (${salida.carpetas.length}):\n${salida.carpetas.slice(0, 12).join('\n')}`
        + (salida.omitidos.length ? `\n\nNo se pudieron leer:\n${salida.omitidos.slice(0, 8).join('\n')}` : ''));
      return;
    }
    if (salida.omitidos.length) {
      alert(`No se pudieron leer ${salida.omitidos.length} archivo(s) o carpeta(s) (se omiten):\n\n${salida.omitidos.slice(0, 15).join('\n')}`
        + (salida.omitidos.length > 15 ? '\n…' : '') + '\n\nSi es un archivo necesario, acorte el nombre de sus carpetas.');
    }
    await recibirArchivos(salida.archivos);
  }

  let selectorClasico = !window.showDirectoryPicker;
  async function elegirCarpeta() {
    if (selectorClasico) { $('entradaCarpeta').click(); return; }
    let carpeta;
    try {
      carpeta = await window.showDirectoryPicker({ id: 'conciliador-integral', mode: 'read' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      selectorClasico = true;
      alert('Este navegador no permitió el selector de carpetas mejorado. Haga clic de nuevo en "Seleccionar carpeta" para usar el selector clásico.\n\n(' + e.message + ')');
      return;
    }
    await cargarCarpetas([nodoHandle(carpeta)]);
  }

  function iniciar() {
    U.usarSeparadorDecimal(estado.config.parametros.separadorDecimal);
    $('entradaCarpeta').addEventListener('change', (e) => { if (e.target.files.length) recibirArchivos([...e.target.files]); e.target.value = ''; });
    for (const b of document.querySelectorAll('.elegir-carpeta')) b.addEventListener('click', elegirCarpeta);
    $('selectorConjunto').addEventListener('change', (e) => elegirConjunto(Number(e.target.value)));
    $('botonExportar').addEventListener('click', exportar);
    const zona = $('zonaSoltar');
    document.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastrando'); });
    document.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
    document.addEventListener('drop', async (e) => {
      e.preventDefault(); zona.classList.remove('arrastrando');
      // Las entradas se toman todas antes del primer await: después el navegador invalida la lista
      const entradas = [...e.dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
      if (entradas.length) await cargarCarpetas(entradas.map(nodoEntrada));
    });
    if (!('DecompressionStream' in window)) alert('Este navegador es muy antiguo para leer archivos de Excel. Use Chrome o Edge actualizados.');
  }

  document.addEventListener('DOMContentLoaded', iniciar);
  return { recibirArchivos, cargarCarpetas, nodoHandle, get resultado() { return estado.resultado; }, get config() { return estado.config; }, mostrar,
    htmlConciliacion: (bancos) => htmlConciliacion(bancos || bancosVisibles()) };
})();
window.Conciliador = App;
