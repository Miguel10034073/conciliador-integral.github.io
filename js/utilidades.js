// Normalización de datos: números, fechas, NIT y números de documento.
// Las fechas se manejan como número de serie de Excel (días desde 30/12/1899): se comparan y restan directo.
'use strict';

const U = (() => {
  const BASE = Date.UTC(1899, 11, 30);
  const serial = (a, m, d) => Math.round((Date.UTC(a, m - 1, d) - BASE) / 86400000);
  const partes = (s) => { const f = new Date(BASE + s * 86400000); return [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()]; };
  const MESES = {
    ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
    sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
  };
  const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const texto = (v) => {
    if (v === null || v === undefined || esError(v)) return null;
    const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim();
    return s === '' ? null : s;
  };

  // "1.234,50" | "$ 13.320.406,00" | "-1728000.00" | "440.000" | 1234.5 -> número
  function num(v) {
    if (v === null || v === undefined || esError(v)) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const t0 = String(v).trim();
    if (t0 === '') return null;
    const negativo = t0.startsWith('-') || t0.startsWith('(') || t0.endsWith('-');
    const t = t0.replace(/[^0-9,.]/g, '');
    const pc = t.lastIndexOf(','), pp = t.lastIndexOf('.');
    const nc = (t.match(/,/g) || []).length, np = (t.match(/\./g) || []).length;
    const decimales = (p) => t.length - p - 1;
    let sep = null;
    if (pc >= 0 && pp >= 0) sep = pc > pp ? ',' : '.';
    else if (pc >= 0) sep = nc === 1 && decimales(pc) !== 3 ? ',' : null;
    else if (pp >= 0) sep = np === 1 && decimales(pp) !== 3 ? '.' : null;
    let limpio;
    if (sep === null) limpio = t.replace(/[.,]/g, '');
    else { const i = t.lastIndexOf(sep); limpio = t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1); }
    if (limpio === '' || limpio === '.') return null;
    const n = Number(limpio);
    if (!isFinite(n)) return null;
    return negativo ? -n : n;
  }

  const redondear = (n, d = 2) => (n === null || n === undefined ? null : Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d);

  function valida(a, m, d) {
    if (!(a > 1900 && a < 2200 && m >= 1 && m <= 12 && d >= 1)) return null;
    const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return d <= dias ? serial(a, m, d) : null;
  }

  // formato: 'dd-MM-yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyyMMdd', 'yyyy-MM-dd', 'dd-MMM-yyyy'
  function segunFormato(t, formato) {
    const orden = [];
    const sinSeparador = !/[^dMy]/.test(formato);
    const patron = formato.replace(/yyyy|MMM|MM|dd|[^dMy]/g, (tok) => {
      if (tok === 'yyyy') { orden.push('a'); return '(\\d{4})'; }
      if (tok === 'MMM') { orden.push('mt'); return '([A-Za-zÁÉÍÓÚáéíóú]{3,10})\\.?'; }
      if (tok === 'MM') { orden.push('m'); return sinSeparador ? '(\\d{2})' : '(\\d{1,2})'; }
      if (tok === 'dd') { orden.push('d'); return sinSeparador ? '(\\d{2})' : '(\\d{1,2})'; }
      return '\\' + tok;
    });
    const r = new RegExp('^' + patron).exec(t);
    if (!r) return null;
    const v = {};
    orden.forEach((k, i) => { v[k] = r[i + 1]; });
    const mes = v.mt ? MESES[v.mt.slice(0, 3).toLowerCase()] : parseInt(v.m, 10);
    return valida(parseInt(v.a, 10), mes, parseInt(v.d, 10));
  }

  function fecha(v, formato) {
    if (v === null || v === undefined || esError(v)) return null;
    if (v instanceof Date) return serial(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') return v > 1 && v < 200000 ? Math.floor(v) : null;
    const t = String(v).trim();
    if (t === '') return null;
    const intentos = [formato, 'yyyy-MM-dd', 'dd/MM/yyyy', 'dd-MM-yyyy', 'dd-MMM-yyyy', 'yyyyMMdd'].filter(Boolean);
    for (const f of intentos) { const s = segunFormato(t, f); if (s !== null) return s; }
    if (/^\d{5}(\.\d+)?$/.test(t)) return Math.floor(Number(t));
    return null;
  }

  function nit(v) {
    if (v === null || v === undefined || esError(v)) return null;
    let t = typeof v === 'number' ? String(Math.round(v)) : String(v);
    if (t.includes('-')) t = t.split('-')[0];
    const d = t.replace(/\D/g, '').replace(/^0+/, '');
    return d === '' ? null : d;
  }

  // Tres claves para cruzar un número de factura escrito de formas distintas
  function claveDoc(v) {
    const t = (texto(v) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const inicio = t.search(/[1-9A-Z]/);
    const sinCeros = inicio < 0 ? '' : t.slice(inicio);
    if (sinCeros === '') return { completa: null, ult9: null, numero: null };
    const m = /(\d*)$/.exec(sinCeros);
    const digitos = m ? m[1] : '';
    const numero = digitos.replace(/^0+/, '');
    const prefijo = sinCeros.slice(0, sinCeros.length - digitos.length);
    return {
      completa: prefijo + numero,
      ult9: t.padStart(9, '0').slice(-9),
      numero: numero === '' ? null : numero,
    };
  }

  const fmtFecha = (s) => {
    if (s === null || s === undefined || s === '') return '';
    const [a, m, d] = partes(s);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
  };
  // Separador decimal en pantalla: 'punto' (1,000,020.52) o 'coma' (1.000.020,52). Se elige en Configuración.
  let decimalComa = false;
  const usarSeparadorDecimal = (s) => { decimalComa = s === 'coma'; };
  const formatear = (n, min, max) => {
    if (n === null || n === undefined || n === '' || !isFinite(n)) return '';
    const t = Number(n).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
    return decimalComa ? t.replace(/[,.]/g, (c) => (c === ',' ? '.' : ',')) : t;
  };
  const fmtNum = (n, dec = 0) => formatear(n, dec, dec);
  const fmtPct = (n) => formatear(n, 0, 2);
  const nombreMes = (m) => NOMBRES_MES[m - 1] || '';
  const hoySerial = () => { const h = new Date(); return serial(h.getFullYear(), h.getMonth() + 1, h.getDate()); };
  const finDeMes = (a, m) => serial(a, m + 1, 0);

  const agrupar = (lista, clave) => {
    const mapa = new Map();
    for (const x of lista) { const k = clave(x); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(x); }
    return mapa;
  };
  const suma = (lista, f = (x) => x) => lista.reduce((s, x) => s + (f(x) || 0), 0);
  const unicos = (lista) => [...new Set(lista.filter((x) => x !== null && x !== undefined && x !== ''))].sort();

  return { texto, num, redondear, fecha, partes, serial, nit, claveDoc, fmtFecha, fmtNum, fmtPct, usarSeparadorDecimal, nombreMes, hoySerial, finDeMes, agrupar, suma, unicos };
})();
