// Componentes de interfaz: creación de elementos, tabla con filtros y editor de tablas de configuración.
'use strict';

// h('div', { class: 'x', onclick: fn }, hijo1, 'texto', ...)
function h(etiqueta, atributos, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

const COLOR_ESTADO = {
  'OK': 'verde', 'Conciliado': 'verde', 'Conciliado (fecha distinta)': 'verde', 'Conciliado en bloque': 'verde', 'Ya registrado': 'verde',
  'Diferencia de valor': 'rojo', 'Falta registrar en libros': 'rojo', 'Por conciliar: diferencia de valor': 'rojo', 'Error': 'rojo',
  'Falta contabilizar': 'ambar', 'Número distinto': 'ambar', 'No aparece en extracto': 'ambar', 'Sin datos': 'ambar',
  'No está en DIAN': 'lila', 'Gasto bancario por registrar': 'lila',
  'Mes anterior sin cruzar': 'gris', 'Fuera del periodo': 'gris', 'Omitido': 'gris',
  'Falta XML': 'rojo', 'XML no está en DIAN': 'rojo', 'XML duplicado': 'ambar',
  'Por acusar': 'rojo', 'Evento incompleto': 'ambar', 'Con evento': 'verde',
  'Revisar: posible nota crédito': 'ambar', 'Con nota crédito (no acusar)': 'lila',
  'Contabilizado': 'verde', 'Sin contabilizar': 'ambar',
};
const insigniaEstado = (e) => h('span', { class: `estado e-${COLOR_ESTADO[e] || 'gris'}` }, e);

async function copiarTexto(texto, aviso = 'CUFE copiado') {
  try { await navigator.clipboard.writeText(texto); } catch {
    // Dentro de un <dialog> modal el área debe ir en el diálogo para poder seleccionarse
    const area = h('textarea', { style: 'position:fixed;opacity:0' });
    area.value = texto; (document.querySelector('dialog[open]') || document.body).append(area); area.select(); document.execCommand('copy'); area.remove();
  }
  avisoFlotante(aviso);
}
// Texto que se copia al hacer clic
const copiable = (texto, valor = texto) => h('button', { class: 'copiable', title: 'Clic para copiar', onclick: () => copiarTexto(valor, `Copiado: ${valor.length > 40 ? valor.slice(0, 40) + '…' : valor}`) }, texto);
// Valor en pesos que se copia al hacer clic (con el separador decimal elegido, sin el signo $)
const valorCopiable = (n, dec = 2) => (n === null || n === undefined || n === '' ? '' : copiable(U.fmtNum(n, dec)));

function celda(valor, tipo) {
  if (tipo === 'cufe') {
    if (!valor) return h('td', { class: 'fija' }, '');
    return h('td', { class: 'fija' }, h('button', { class: 'cufe', title: `${valor}\nClic para copiar`, onclick: () => copiarTexto(valor) }, valor));
  }
  if (tipo === 'copiar') return h('td', { class: 'largo' }, valor === null || valor === undefined || valor === '' ? '' : copiable(String(valor)));
  if (tipo === 'estado') return h('td', {}, valor ? insigniaEstado(valor) : '');
  if (tipo === 'moneda' || tipo === 'moneda2') {
    const dec = tipo === 'moneda2' ? 2 : (valor !== null && valor !== undefined && Math.abs(valor % 1) > 0.0001 ? 2 : 0);
    return h('td', { class: `num${valor < 0 ? ' negativo' : ''}` }, valorCopiable(valor, dec));
  }
  if (tipo === 'diferencia') {
    const hay = valor !== null && valor !== undefined && Math.abs(valor) >= 0.005;
    return h('td', { class: `num${hay ? ' dif' : ''}` }, valorCopiable(valor, 2));
  }
  if (tipo === 'entero') return h('td', { class: 'num' }, valor ?? '');
  if (tipo === 'fecha') return h('td', { class: 'num' }, U.fmtFecha(valor));
  if (tipo === 'alerta') return h('td', { class: 'largo' }, valor ? h('span', { class: 'alerta-txt' }, valor) : '');
  if (tipo === 'largo') return h('td', { class: 'largo' }, valor ?? '');
  return h('td', {}, valor ?? '');
}

// Filtros, búsqueda y orden de cada tabla, para conservarlos al cambiar de pestaña (se borran al cargar otro periodo)
const memoriaTablas = new Map();

// Tabla con búsqueda, filtros por chips, orden por columna y totales.
// opciones: { columnas: [{ clave, titulo, tipo, total }], filas, filtros: [clave], filtroInicial: { clave: [valores] }, ordenEstados, alClic: (fila) => …,
//   filtroFecha: clave, memoria: 'nombre' (recuerda filtros entre pestañas; un filtroInicial los reemplaza) }
function crearTabla(opciones) {
  const { columnas, filas } = opciones;
  const guardado = opciones.memoria && !opciones.filtroInicial ? memoriaTablas.get(opciones.memoria) : null;
  const estado = { texto: guardado?.texto || '', filtros: {}, orden: guardado?.orden ?? null, asc: guardado?.asc ?? true };
  for (const f of opciones.filtros || []) estado.filtros[f] = new Set(opciones.filtroInicial?.[f] || guardado?.filtros[f] || []);
  const recordar = () => {
    if (!opciones.memoria) return;
    memoriaTablas.set(opciones.memoria, { texto: estado.texto, orden: estado.orden, asc: estado.asc, fechas: { ...textoFechas },
      filtros: Object.fromEntries(Object.entries(estado.filtros).map(([k, v]) => [k, [...v]])) });
  };

  const buscador = h('input', { type: 'text', value: estado.texto, placeholder: 'Buscar (tercero, documento, descripción…)', oninput: (e) => { estado.texto = e.target.value.toLowerCase(); pintar(); } });
  const contador = h('span', { class: 'contador' });
  const zonaFiltros = h('div', { class: 'grupo-filtros' });
  const cuerpo = h('tbody');
  const pie = h('tfoot');
  const encabezados = columnas.map((c) => {
    const th = h('th', { class: ['moneda', 'moneda2', 'diferencia', 'entero', 'fecha'].includes(c.tipo) ? 'num' : c.tipo === 'cufe' ? 'fija' : '', title: 'Ordenar' }, c.titulo, ' ', h('span', { class: 'flecha' }));
    th.addEventListener('click', () => { if (estado.orden === c.clave) estado.asc = !estado.asc; else { estado.orden = c.clave; estado.asc = true; } pintar(); });
    return th;
  });
  const tabla = h('table', { class: 'datos' }, h('thead', {}, h('tr', {}, encabezados)), cuerpo, pie);

  // Filtro por rango de fechas (opciones.filtroFecha = clave de la columna de fecha)
  const textoFechas = { desde: guardado?.fechas?.desde || '', hasta: guardado?.fechas?.hasta || '' };
  const aSerial = (t) => (t ? U.fecha(t, 'yyyy-MM-dd') : null);
  const rango = { desde: aSerial(textoFechas.desde), hasta: aSerial(textoFechas.hasta) };
  let zonaFecha = '';
  if (opciones.filtroFecha) {
    const col = columnas.find((c) => c.clave === opciones.filtroFecha);
    const campoFecha = (lado) => h('input', { type: 'date', value: textoFechas[lado], title: lado === 'desde' ? 'Desde' : 'Hasta',
      onchange: (e) => { textoFechas[lado] = e.target.value; rango[lado] = aSerial(e.target.value); pintar(); } });
    const desde = campoFecha('desde'), hasta = campoFecha('hasta');
    zonaFecha = h('div', { class: 'grupo-filtros' }, h('span', { class: 'titulo-filtro' }, `${col?.titulo || 'Fecha'}:`), desde, h('span', { class: 'sutil' }, 'a'), hasta,
      h('button', { class: 'chip', title: 'Quitar filtro de fechas', onclick: () => { desde.value = ''; hasta.value = ''; textoFechas.desde = textoFechas.hasta = ''; rango.desde = rango.hasta = null; pintar(); } }, '✕'));
  }

  const coincide = (f, excepto) => {
    if (opciones.filtroFecha && (rango.desde !== null || rango.hasta !== null)) {
      const v = f[opciones.filtroFecha];
      if (v === null || v === undefined || (rango.desde !== null && v < rango.desde) || (rango.hasta !== null && v > rango.hasta)) return false;
    }
    for (const [clave, valores] of Object.entries(estado.filtros)) if (clave !== excepto && valores.size && !valores.has(f[clave] ?? '(vacío)')) return false;
    if (estado.texto) {
      const t = estado.texto;
      if (!columnas.some((c) => String(f[c.clave] ?? '').toLowerCase().includes(t))) return false;
    }
    return true;
  };

  function pintarFiltros() {
    zonaFiltros.replaceChildren();
    for (const clave of opciones.filtros || []) {
      const col = columnas.find((c) => c.clave === clave);
      const conteo = new Map();
      for (const f of filas) if (coincide(f, clave)) { const v = f[clave] ?? '(vacío)'; conteo.set(v, (conteo.get(v) || 0) + 1); }
      for (const v of estado.filtros[clave]) if (!conteo.has(v)) conteo.set(v, 0);
      const orden = [...conteo.keys()].sort((a, b) => {
        const oa = (opciones.ordenEstados || []).indexOf(a), ob = (opciones.ordenEstados || []).indexOf(b);
        return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob) || String(a).localeCompare(String(b));
      });
      zonaFiltros.append(h('span', { class: 'titulo-filtro' }, (col?.titulo || clave) + ':'));
      for (const v of orden) {
        const activo = estado.filtros[clave].has(v);
        zonaFiltros.append(h('button', { class: `chip${activo ? ' activo' : ''}`, onclick: () => { activo ? estado.filtros[clave].delete(v) : estado.filtros[clave].add(v); pintar(); } },
          v, h('span', { class: 'n' }, conteo.get(v))));
      }
    }
  }

  let visibles = [];
  function pintar() {
    visibles = filas.filter((f) => coincide(f));
    if (estado.orden) {
      const tipo = columnas.find((c) => c.clave === estado.orden)?.tipo;
      const num = ['moneda', 'moneda2', 'diferencia', 'entero', 'fecha'].includes(tipo);
      visibles = [...visibles].sort((a, b) => {
        const x = a[estado.orden], y = b[estado.orden];
        const r = num ? (x ?? -Infinity) - (y ?? -Infinity) : String(x ?? '').localeCompare(String(y ?? ''));
        return estado.asc ? r : -r;
      });
    }
    encabezados.forEach((th, i) => { th.querySelector('.flecha').textContent = estado.orden === columnas[i].clave ? (estado.asc ? '▲' : '▼') : ''; });
    const alClic = opciones.alClic;
    const clicFila = (f) => (e) => { if (!e.target.closest('button')) alClic(f); };
    cuerpo.replaceChildren(...(visibles.length ? visibles.map((f) => h('tr', alClic ? { class: 'clic', title: 'Clic para ver el detalle', onclick: clicFila(f) } : {},
      columnas.map((c) => celda(f[c.clave], c.tipo))))
      : [h('tr', {}, h('td', { colspan: columnas.length, class: 'sin-filas' }, 'No hay filas con estos filtros'))]));
    const conTotal = columnas.some((c) => c.total);
    pie.replaceChildren(conTotal && visibles.length ? h('tr', {}, columnas.map((c, i) => {
      if (i === 0) return h('td', {}, 'Total');
      if (!c.total) return h('td');
      return celda(U.redondear(U.suma(visibles, (f) => f[c.clave])), c.tipo === 'diferencia' ? 'diferencia' : 'moneda');
    })) : '');
    contador.textContent = `${visibles.length} de ${filas.length} filas`;
    pintarFiltros();
    recordar();
  }

  const nodo = h('div', {},
    h('div', { class: 'herramientas' }, buscador, zonaFecha, zonaFiltros, contador),
    h('div', { class: 'envoltura-tabla' }, tabla));
  pintar();
  nodo.filasVisibles = () => visibles;
  return nodo;
}

// Editor de tabla de configuración. columnas: [{ clave, titulo, tipo: 'texto'|'numero'|'fecha'|'lista', opciones, ancho }]
function crearEditor(columnas, filas, alCambiar, textoAgregar = 'Agregar fila') {
  const cuerpo = h('tbody');
  const avisar = () => alCambiar(filas);
  function pintar() {
    cuerpo.replaceChildren(...filas.map((fila, i) => h('tr', {},
      columnas.map((c) => {
        let control;
        if (c.tipo === 'lista') {
          control = h('select', {}, c.opciones.map((o) => h('option', { value: o, selected: fila[c.clave] === o }, o)));
        } else {
          control = h('input', { type: c.tipo === 'numero' ? 'text' : c.tipo === 'fecha' ? 'date' : 'text', value: fila[c.clave] ?? '', inputmode: c.tipo === 'numero' ? 'decimal' : null });
        }
        control.addEventListener('change', (e) => { fila[c.clave] = c.tipo === 'numero' ? U.num(e.target.value) : e.target.value; avisar(); });
        return h('td', { style: c.ancho ? `width:${c.ancho}` : null }, control);
      }),
      h('td', { style: 'width:40px' }, h('button', { class: 'boton chico peligro', title: 'Eliminar fila', onclick: () => { filas.splice(i, 1); pintar(); avisar(); } }, '✕')))));
  }
  pintar();
  return h('div', {},
    h('div', { class: 'envoltura-tabla' }, h('table', { class: 'editor' }, h('thead', {}, h('tr', {}, columnas.map((c) => h('th', {}, c.titulo)), h('th'))), cuerpo)),
    h('div', { class: 'pie-editor' }, h('button', { class: 'boton chico', onclick: () => { filas.push(Object.fromEntries(columnas.map((c) => [c.clave, c.tipo === 'lista' ? c.opciones[0] : '']))); pintar(); avisar(); } }, '+ ' + textoAgregar)));
}

function avisoFlotante(texto) {
  const a = h('div', { class: 'aviso-flotante' }, texto);
  // Si hay una ventana modal abierta, el aviso va dentro de ella para que se vea encima
  (document.querySelector('dialog[open]') || document.body).append(a);
  setTimeout(() => a.remove(), 2200);
}
