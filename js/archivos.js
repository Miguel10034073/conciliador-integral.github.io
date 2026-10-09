// Lectura y escritura de .xlsx y .csv sin librerías externas.
// Un .xlsx es un .zip con archivos XML; se descomprime con DecompressionStream (incluido en Chrome/Edge).
'use strict';

const ERROR_CELDA = Object.freeze({ error: true });
const esError = (v) => v === ERROR_CELDA;

const Archivos = (() => {
  async function inflar(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function abrirZip(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('No es un archivo Excel (.xlsx) válido');
    const total = dv.getUint16(fin + 10, true);
    let pos = dv.getUint32(fin + 16, true);
    const entradas = {};
    for (let k = 0; k < total; k++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(pos + 10, true);
      const tamComprimido = dv.getUint32(pos + 20, true);
      const lNombre = dv.getUint16(pos + 28, true);
      const lExtra = dv.getUint16(pos + 30, true);
      const lComentario = dv.getUint16(pos + 32, true);
      const local = dv.getUint32(pos + 42, true);
      const nombre = new TextDecoder().decode(u8.subarray(pos + 46, pos + 46 + lNombre));
      entradas[nombre.toLowerCase()] = { metodo, tamComprimido, local };
      pos += 46 + lNombre + lExtra + lComentario;
    }
    const bytes = async (nombre) => {
      const e = entradas[nombre.toLowerCase()];
      if (!e) return null;
      const inicio = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const datos = u8.subarray(inicio, inicio + e.tamComprimido);
      return e.metodo === 0 ? datos : inflar(datos);
    };
    const leer = async (nombre) => { const b = await bytes(nombre); return b === null ? null : new TextDecoder('utf-8').decode(b); };
    leer.bytes = bytes;
    leer.nombres = Object.keys(entradas);
    return leer;
  }

  // XML dentro de un .zip (paquetes descargados de la DIAN): [{ nombre, leer: () => Promise<Uint8Array> }]
  async function xmlsDeZip(buffer) {
    const zip = await abrirZip(buffer);
    return zip.nombres.filter((n) => n.endsWith('.xml') && !n.endsWith('/')).map((n) => ({ nombre: n, leer: () => zip.bytes(n) }));
  }

  const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml');
  const etiquetas = (nodo, nombre) => Array.from(nodo.getElementsByTagNameNS('*', nombre));

  function columnaANumero(ref) {
    let n = 0;
    for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  // Devuelve la primera hoja como matriz de filas (valores: texto, número, true/false, null o ERROR_CELDA).
  async function leerXlsx(buffer) {
    const leer = await abrirZip(buffer);
    const libro = xml(await leer('xl/workbook.xml') || '');
    const hojas = etiquetas(libro, 'sheet');
    if (!hojas.length) throw new Error('El archivo Excel no tiene hojas');
    const rid = hojas[0].getAttribute('r:id') || hojas[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let ruta = 'xl/worksheets/sheet1.xml';
    const rels = await leer('xl/_rels/workbook.xml.rels');
    if (rels && rid) {
      const rel = etiquetas(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const destino = rel.getAttribute('Target').replace(/^\//, '');
        ruta = destino.startsWith('xl/') ? destino : 'xl/' + destino;
      }
    }
    const compartidos = [];
    const ss = await leer('xl/sharedStrings.xml');
    if (ss) {
      for (const si of etiquetas(xml(ss), 'si')) {
        compartidos.push(etiquetas(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
      }
    }
    const textoHoja = await leer(ruta);
    if (!textoHoja) throw new Error('No se encontró la primera hoja del archivo');
    const filas = [];
    for (const fila of etiquetas(xml(textoHoja), 'row')) {
      const r = parseInt(fila.getAttribute('r'), 10) - 1;
      const valores = [];
      for (const c of etiquetas(fila, 'c')) {
        const col = columnaANumero(c.getAttribute('r') || '');
        const tipo = c.getAttribute('t');
        const v = etiquetas(c, 'v')[0];
        let valor = null;
        if (tipo === 's') valor = v ? compartidos[parseInt(v.textContent, 10)] ?? null : null;
        else if (tipo === 'inlineStr') valor = etiquetas(c, 't').map((t) => t.textContent).join('');
        else if (tipo === 'str') valor = v ? v.textContent : null;
        else if (tipo === 'b') valor = v ? v.textContent === '1' : null;
        else if (tipo === 'e') valor = ERROR_CELDA;
        else if (v && v.textContent !== '') valor = Number(v.textContent);
        valores[col] = valor;
      }
      filas[r] = valores;
    }
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    return filas;
  }

  async function leerTexto(archivo, codificacion = 'windows-1252') {
    const buffer = await archivo.arrayBuffer();
    return new TextDecoder(codificacion).decode(buffer);
  }

  // ---------- Escritura de .xlsx (zip sin compresión) ----------
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function armarZip(archivos) {
    const enc = new TextEncoder();
    const partes = [];
    const centrales = [];
    let desplazamiento = 0;
    for (const [nombre, contenido] of archivos) {
      const nombreB = enc.encode(nombre);
      const datos = enc.encode(contenido);
      const crc = crc32(datos);
      const cab = new DataView(new ArrayBuffer(30));
      cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true);
      cab.setUint16(8, 0, true); cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true);
      cab.setUint32(22, datos.length, true); cab.setUint16(26, nombreB.length, true);
      partes.push(new Uint8Array(cab.buffer), nombreB, datos);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombreB.length, true); cen.setUint32(42, desplazamiento, true);
      centrales.push(new Uint8Array(cen.buffer), nombreB);
      desplazamiento += 30 + nombreB.length + datos.length;
    }
    const tamCentral = centrales.reduce((s, p) => s + p.length, 0);
    const finCab = new DataView(new ArrayBuffer(22));
    finCab.setUint32(0, 0x06054b50, true); finCab.setUint16(8, archivos.length, true); finCab.setUint16(10, archivos.length, true);
    finCab.setUint32(12, tamCentral, true); finCab.setUint32(16, desplazamiento, true);
    return new Blob([...partes, ...centrales, new Uint8Array(finCab.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const escXml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function letraColumna(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  // Estilos de celda (índices usados por las hojas)
  const ESTILO = { normal: 0, encabezado: 1, numero: 2, fecha: 3, titulo: 4, negrita: 5, totalNum: 6, totalTxt: 7, sutil: 8,
    numLinea: 9, txtLinea: 10, numEntrada: 11, numRojo: 12, fechaLinea: 13 };
  const ESTILOS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
    + '<fonts count="6"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font>'
    + '<font><i/><sz val="9"/><color rgb="FF808080"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFB42318"/><name val="Calibri"/></font></fonts>'
    + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border/><border><bottom style="thin"><color rgb="FFD9D9D9"/></bottom></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>'
    + '<xf numFmtId="4" fontId="3" fillId="3" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>'
    + '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
    + '<xf numFmtId="4" fontId="3" fillId="4" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="4" fontId="5" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>'
    + '</cellXfs></styleSheet>';

  const celdaXml = (ref, v, s) => {
    if (v === null || v === undefined || v === '') return s ? `<c r="${ref}" s="${s}"/>` : '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${s || 0}"><v>${v}</v></c>`;
    return `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
  };

  // Hoja tabular: encabezado + filas, con filtro y primera fila fija
  function hojaTabla(h) {
    const cols = h.columnas;
    const anchos = cols.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.ancho || (c.tipo === 'texto' ? 28 : 15)}" customWidth="1"/>`).join('');
    const encabezado = `<row r="1">${cols.map((c, j) => celdaXml(`${letraColumna(j)}1`, c.titulo, ESTILO.encabezado)).join('')}</row>`;
    const cuerpo = h.filas.map((f, r) => `<row r="${r + 2}">${f.map((v, j) => {
      const tipo = cols[j]?.tipo;
      return celdaXml(letraColumna(j) + (r + 2), v, typeof v === 'number' ? (tipo === 'fecha' ? ESTILO.fecha : tipo === 'numero' ? ESTILO.numero : 0) : 0);
    }).join('')}</row>`).join('');
    const ultimo = `${letraColumna(Math.max(cols.length - 1, 0))}${h.filas.length + 1}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${anchos}</cols><sheetData>${encabezado}${cuerpo}</sheetData>${h.filas.length ? `<autoFilter ref="A1:${ultimo}"/>` : ''}</worksheet>`;
  }

  // Hoja con formato libre: filas de celdas { v, s }, celdas combinadas y lista para imprimir en una página de ancho
  function hojaLibre(h) {
    const anchos = h.anchos.map((a, j) => `<col min="${j + 1}" max="${j + 1}" width="${a}" customWidth="1"/>`).join('');
    const cuerpo = h.filas.map((f, r) => `<row r="${r + 1}"${f.alto ? ` ht="${f.alto}" customHeight="1"` : ''}>${(f.celdas || f).map((c, j) =>
      c ? celdaXml(letraColumna(j) + (r + 1), c.v, c.s) : '').join('')}</row>`).join('');
    const combinar = (h.combinar || []).length ? `<mergeCells count="${h.combinar.length}">${h.combinar.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols>${anchos}</cols><sheetData>${cuerpo}</sheetData>${combinar}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  // hojas: [{ nombre, columnas: [{ titulo, tipo, ancho }], filas: [[...]] }] o [{ nombre, libre: true, anchos, filas: [[{ v, s }]], combinar }]
  function escribirXlsx(hojas) {
    const archivos = [];
    const tiposContenido = hojas.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    archivos.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tiposContenido}</Types>`]);
    archivos.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    const nombresUsados = new Set();
    const nombres = hojas.map((h) => {
      let n = h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); let k = 2;
      while (nombresUsados.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + k++;
      nombresUsados.add(n.toLowerCase()); return n;
    });
    archivos.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
    archivos.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    archivos.push(['xl/styles.xml', ESTILOS_XML]);
    hojas.forEach((h, i) => archivos.push([`xl/worksheets/sheet${i + 1}.xml`, h.libre ? hojaLibre(h) : hojaTabla(h)]));
    return armarZip(archivos);
  }

  return { leerXlsx, leerTexto, escribirXlsx, xmlsDeZip, ESTILO };
})();
