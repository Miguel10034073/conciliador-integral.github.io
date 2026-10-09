// Configuración: valores por defecto y almacenamiento en el navegador (localStorage).
'use strict';

const Config = (() => {
  const CLAVE = 'conciliador.config.v1';

  const PREDETERMINADA = {
    parametros: {
      toleranciaDocumentos: 100,
      toleranciaDiasBancos: 5,
      diferenciaMaximaEmparejarBancos: 1000,
      separadorDecimal: 'punto', // 'punto' (1,000,020.52) o 'coma' (1.000.020,52)

    },
    tiposDIAN: [
      { tipo: 'Factura electrónica', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Nota de crédito electrónica', grupo: 'Recibido', clase: 'NC compra' },
      { tipo: 'Nota de débito electrónica', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Documento soporte con no obligados', grupo: 'Emitido', clase: 'Compra' },
      { tipo: 'Nota de ajuste del documento soporte', grupo: 'Emitido', clase: 'NC compra' },
      { tipo: 'Factura electrónica', grupo: 'Emitido', clase: 'Venta' },
      { tipo: 'Nota de crédito electrónica', grupo: 'Emitido', clase: 'NC venta' },
      { tipo: 'Nota de débito electrónica', grupo: 'Emitido', clase: 'Venta' },
      { tipo: 'Factura electrónica de contingencia', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Documento equivalente POS', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Documento equivalente - Cobro de peajes', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Documento equivalente - Servicios públicos domiciliarios', grupo: 'Recibido', clase: 'Compra' },
      { tipo: 'Nomina Individual', grupo: 'Emitido', clase: 'Excluir' },
      { tipo: 'Nomina Individual de Ajuste', grupo: 'Emitido', clase: 'Excluir' },
      { tipo: 'Nomima Individual De Ajustes', grupo: 'Emitido', clase: 'Excluir' },
      { tipo: 'Application response', grupo: 'Emitido', clase: 'Excluir' },
      { tipo: 'Application response', grupo: 'Recibido', clase: 'Excluir' },
    ],
    tiposSCI: [
      { tipo: '09 - Otras CxPagar', clase: 'Compra' },
      { tipo: '14 - NC Otras CxPagar', clase: 'NC compra' },
      { tipo: '30 - Ventas', clase: 'Venta' },
      { tipo: '72 - Cheques', clase: 'Otro' },
      { tipo: '75 - Anticipos CxP', clase: 'Otro' },
      { tipo: '90 - Recibos de Caja', clase: 'Otro' },
    ],
    conceptosBancarios: [
      { banco: 'Bancolombia', texto: 'IMPTO GOBIERNO 4X1000', categoria: 'GMF 4x1000', cuenta: '560505' },
      { banco: 'Bancolombia', texto: 'C MANEJO TARJ DEB', categoria: 'Cuota de manejo', cuenta: '560501' },
      { banco: 'Bancolombia', texto: 'IVA CUOTA PLAN', categoria: 'IVA comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'CUOTA PLAN CANAL', categoria: 'Cuota plan canal', cuenta: '' },
      { banco: 'Bancolombia', texto: 'COBRO IVA PAGOS AUTOMATICOS', categoria: 'IVA comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'SERVICIO PAGO A PROVEEDORES', categoria: 'Comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'SERVICIO PAGO DE NOMINA', categoria: 'Comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'SERVICIO POR PAGOS A NEQUI', categoria: 'Comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'SERVICIO PAGO A OTROS BANCOS', categoria: 'Comisiones', cuenta: '' },
      { banco: 'Bancolombia', texto: 'ABONO INTERESES AHORROS', categoria: 'Intereses', cuenta: '46061301' },
      { banco: 'Bancolombia', texto: 'RETENCION EN LA FUENTE', categoria: 'Retención sobre rendimientos', cuenta: '' },
      { banco: 'Davivienda', texto: 'Gmf Gravamen Mvto Financiero', categoria: 'GMF 4x1000', cuenta: '53152001' },
      { banco: 'Davivienda', texto: 'Cobro Servicio Manejo Portal', categoria: 'Cuota de manejo', cuenta: '530505' },
      { banco: 'Davivienda', texto: 'Cobro IVA Servicios Financieros', categoria: 'IVA comisiones', cuenta: '' },
      { banco: 'Davivienda', texto: 'Cobro Transf. Enviada Otra Entidad', categoria: 'Comisiones', cuenta: '' },
      { banco: 'Davivienda', texto: 'Rendimientos financieros', categoria: 'Intereses', cuenta: '421005' },
    ],
    // Respaldo: solo se usa si la carpeta "Tabla de impuestos" no tiene archivo
    impuestosManual: [
      { identificador: 'T', codigo: 1, porcentaje: 15, nombre: 'RTF DE IVA 15%', dbcr: '2', cuenta: '293001' },
      { identificador: 'I', codigo: 1, porcentaje: 5, nombre: 'IVA VENTAS GENERA 5%', dbcr: '2', cuenta: '200501' },
      { identificador: 'Z', codigo: 1, porcentaje: 0.55, nombre: 'AUTORENTA 0.55%', dbcr: '2', cuenta: '292204' },
      { identificador: 'C', codigo: 1, porcentaje: 0.2, nombre: 'RTE ICA 2*1000', dbcr: '1', cuenta: '135518' },
      { identificador: 'R', codigo: 1, porcentaje: 0, nombre: 'RTF ART 383 INDEPEND', dbcr: '2', cuenta: '290502' },
      { identificador: 'T', codigo: 2, porcentaje: 15, nombre: 'DV RTF DE IVA 15%', dbcr: '1', cuenta: '293001' },
      { identificador: 'I', codigo: 2, porcentaje: 5, nombre: 'DV IVA VENTAS 5%', dbcr: '1', cuenta: '200801' },
      { identificador: 'C', codigo: 2, porcentaje: 0.2, nombre: 'DEV RTE ICA 2*1000', dbcr: '2', cuenta: '135518' },
      { identificador: 'R', codigo: 2, porcentaje: 0, nombre: 'DV RTF ART 383 INDEP', dbcr: '1', cuenta: '290502' },
      { identificador: 'I', codigo: 3, porcentaje: 19, nombre: 'IVA VENTA GENER 19%', dbcr: '2', cuenta: '200502' },
      { identificador: 'T', codigo: 3, porcentaje: 15, nombre: 'RTE IVA 15% VTAS', dbcr: '1', cuenta: '13551701' },
      { identificador: 'R', codigo: 3, porcentaje: 10, nombre: 'RTF HONORARIOS 10%', dbcr: '2', cuenta: '290701' },
      { identificador: 'I', codigo: 4, porcentaje: 19, nombre: 'DV IVA VENTA GEN 19%', dbcr: '1', cuenta: '200802' },
      { identificador: 'T', codigo: 4, porcentaje: 15, nombre: 'DV RETE IVA 15% VTAS', dbcr: '2', cuenta: '13551701' },
      { identificador: 'R', codigo: 4, porcentaje: 10, nombre: 'DV RTF HONORARIO 10%', dbcr: '1', cuenta: '290701' },
      { identificador: 'R', codigo: 5, porcentaje: 11, nombre: 'RTF HONORARIOS 11%', dbcr: '2', cuenta: '290703' },
      { identificador: 'R', codigo: 6, porcentaje: 11, nombre: 'DV RTF HONORARIO 11%', dbcr: '1', cuenta: '290703' },
      { identificador: 'R', codigo: 7, porcentaje: 0, nombre: 'RTF ART 383 EMPLEADO', dbcr: '2', cuenta: '290501' },
      { identificador: 'R', codigo: 8, porcentaje: 0, nombre: 'DV RTF ART 383 EMPLE', dbcr: '1', cuenta: '290501' },
      { identificador: 'R', codigo: 9, porcentaje: 6, nombre: 'RTF SERVICIOS 6%', dbcr: '2', cuenta: '290911' },
      { identificador: 'R', codigo: 10, porcentaje: 6, nombre: 'DV RTF SERVICIOS 6%', dbcr: '1', cuenta: '290911' },
      { identificador: 'R', codigo: 11, porcentaje: 3.5, nombre: 'RTF SERVICIOS 3.5%', dbcr: '2', cuenta: '290905' },
      { identificador: 'R', codigo: 12, porcentaje: 3.5, nombre: 'DV RTF SERVICIO 3.5%', dbcr: '1', cuenta: '290905' },
      { identificador: 'R', codigo: 13, porcentaje: 2, nombre: 'RTF SERVICIOS 2%', dbcr: '2', cuenta: '290903' },
      { identificador: 'R', codigo: 14, porcentaje: 2, nombre: 'DV RTF SERVICIOS 2%', dbcr: '1', cuenta: '290903' },
      { identificador: 'R', codigo: 15, porcentaje: 3.5, nombre: 'RTF ARRIENDO 3.5%', dbcr: '2', cuenta: '291101' },
      { identificador: 'R', codigo: 16, porcentaje: 3.5, nombre: 'DV RTF ARRIENDO 3.5%', dbcr: '1', cuenta: '291101' },
      { identificador: 'R', codigo: 17, porcentaje: 4, nombre: 'RTF ARRIENDO 4%', dbcr: '2', cuenta: '291103' },
      { identificador: 'R', codigo: 18, porcentaje: 4, nombre: 'DV RTF ARRIENDO 4%', dbcr: '1', cuenta: '291103' },
      { identificador: 'R', codigo: 19, porcentaje: 10, nombre: 'RTF COMISIONES 10%', dbcr: '2', cuenta: '290801' },
      { identificador: 'R', codigo: 20, porcentaje: 10, nombre: 'DV RTF COMISION 10%', dbcr: '1', cuenta: '290801' },
      { identificador: 'R', codigo: 21, porcentaje: 11, nombre: 'RTF COMISIONES 11%', dbcr: '2', cuenta: '290803' },
      { identificador: 'R', codigo: 22, porcentaje: 11, nombre: 'DV RTF COMISION 11%', dbcr: '1', cuenta: '290803' },
      { identificador: 'R', codigo: 23, porcentaje: 1, nombre: 'RTF SERVICIOS 1%', dbcr: '2', cuenta: '290901' },
      { identificador: 'R', codigo: 24, porcentaje: 1, nombre: 'DV RTF SERVICIOS 1%', dbcr: '1', cuenta: '290901' },
      { identificador: 'R', codigo: 25, porcentaje: 2.5, nombre: 'RTF COMPRAS 2.5% ASU', dbcr: '2', cuenta: '291310' },
      { identificador: 'R', codigo: 26, porcentaje: 2.5, nombre: 'DV RTF COMPRA 2.5 AS', dbcr: '1', cuenta: '291310' },
      { identificador: 'R', codigo: 29, porcentaje: 1.5, nombre: 'RTF COMPRAS 1.5%', dbcr: '2', cuenta: '291307' },
      { identificador: 'R', codigo: 30, porcentaje: 1.5, nombre: 'DV RTF COMPRAS 1.5%', dbcr: '1', cuenta: '291307' },
      { identificador: 'R', codigo: 31, porcentaje: 1, nombre: 'RTF COMPRAS 1%', dbcr: '2', cuenta: '291305' },
      { identificador: 'R', codigo: 32, porcentaje: 1, nombre: 'DV RTF COMPRAS 1%', dbcr: '1', cuenta: '291305' },
      { identificador: 'R', codigo: 33, porcentaje: 4, nombre: 'RTF SERVICIOS 4%', dbcr: '2', cuenta: '290907' },
      { identificador: 'R', codigo: 34, porcentaje: 4, nombre: 'DV RTF SERVICIOS 4%', dbcr: '1', cuenta: '290907' },
      { identificador: 'R', codigo: 35, porcentaje: 2.5, nombre: 'RTF COMPRAS 2.5%', dbcr: '2', cuenta: '291309' },
      { identificador: 'R', codigo: 36, porcentaje: 2.5, nombre: 'DV RTF COMPRAS 2.5%', dbcr: '1', cuenta: '291309' },
      { identificador: 'R', codigo: 37, porcentaje: 0.1, nombre: 'RTF COMPRAS 0.1%', dbcr: '2', cuenta: '291301' },
      { identificador: 'R', codigo: 38, porcentaje: 0.1, nombre: 'DV RTF COMPRAS 0.1%', dbcr: '1', cuenta: '291301' },
      { identificador: 'R', codigo: 39, porcentaje: 0.1, nombre: 'RTF COMPRAS 0.1% ASU', dbcr: '2', cuenta: '291302' },
      { identificador: 'I', codigo: 50, porcentaje: 19, nombre: 'IVA DESC COMPRAS 19%', dbcr: '1', cuenta: '200705' },
      { identificador: 'I', codigo: 51, porcentaje: 19, nombre: 'IVA DESC SERVICIO 19', dbcr: '1', cuenta: '200708' },
      { identificador: 'R', codigo: 51, porcentaje: 1.5, nombre: 'RTF EN VENTAS 1.5%', dbcr: '1', cuenta: '13551510' },
      { identificador: 'I', codigo: 52, porcentaje: 5, nombre: 'IVA DESC COMPRA 5%', dbcr: '1', cuenta: '200704' },
      { identificador: 'R', codigo: 52, porcentaje: 1.5, nombre: 'DV RTF EN VENTA 1.5%', dbcr: '2', cuenta: '13551510' },
      { identificador: 'I', codigo: 53, porcentaje: 5, nombre: 'IVA DESC SERVICIO 5%', dbcr: '1', cuenta: '200707' },
      { identificador: 'R', codigo: 53, porcentaje: 1, nombre: 'RTF EN VENTAS 1%', dbcr: '1', cuenta: '13551509' },
      { identificador: 'I', codigo: 54, porcentaje: 19, nombre: 'IVA GEN DEV COMPR 19', dbcr: '2', cuenta: '200905' },
      { identificador: 'I', codigo: 56, porcentaje: 19, nombre: 'IVA GEN DV SERV 19%', dbcr: '2', cuenta: '200908' },
      { identificador: 'R', codigo: 54, porcentaje: 1, nombre: 'DV RTF EN VENTA 1%', dbcr: '2', cuenta: '13551509' },
      { identificador: 'I', codigo: 55, porcentaje: 5, nombre: 'IVA GEN DV COMP 5%', dbcr: '2', cuenta: '200904' },
      { identificador: 'R', codigo: 55, porcentaje: 3.5, nombre: 'RTE ARRIEN ASUM 3.5%', dbcr: '2', cuenta: '294202' },
      { identificador: 'R', codigo: 56, porcentaje: 10, nombre: 'RTF HONO 10% PN', dbcr: '2', cuenta: '293801' },
      { identificador: 'I', codigo: 56, porcentaje: 5, nombre: 'IVA GEN DV SERV 5%', dbcr: '2', cuenta: '200907' },
      { identificador: 'R', codigo: 57, porcentaje: 10, nombre: 'DV RTF HON 10% PN', dbcr: '1', cuenta: '293801' },
      { identificador: 'R', codigo: 58, porcentaje: 11, nombre: 'RTF HONO  11% PN', dbcr: '2', cuenta: '293803' },
      { identificador: 'R', codigo: 59, porcentaje: 11, nombre: 'DV RTF HONOR 11 PN', dbcr: '1', cuenta: '293803' },
      { identificador: 'R', codigo: 60, porcentaje: 6, nombre: 'RTF SERVICIOS 6 PN', dbcr: '2', cuenta: '294011' },
      { identificador: 'R', codigo: 61, porcentaje: 6, nombre: 'DV RTF SER 6 PN', dbcr: '1', cuenta: '294011' },
      { identificador: 'R', codigo: 62, porcentaje: 3.5, nombre: 'RTF SERV 3.5 PN', dbcr: '2', cuenta: '294005' },
      { identificador: 'R', codigo: 63, porcentaje: 3.5, nombre: 'DV RTF SERVI 3.5 PN', dbcr: '1', cuenta: '294005' },
      { identificador: 'R', codigo: 64, porcentaje: 2, nombre: 'RTF SERV 2 PN', dbcr: '2', cuenta: '294003' },
      { identificador: 'R', codigo: 65, porcentaje: 2, nombre: 'DV RTF SERV 2 PN', dbcr: '1', cuenta: '294004' },
      { identificador: 'R', codigo: 66, porcentaje: 3.5, nombre: 'RTF ARRIENDO 3.5 PN', dbcr: '2', cuenta: '294201' },
      { identificador: 'R', codigo: 67, porcentaje: 3.5, nombre: 'DV RTF ARR 3.5 PN', dbcr: '1', cuenta: '294201' },
      { identificador: 'R', codigo: 68, porcentaje: 4, nombre: 'RTF ARRIENDO 4 PN', dbcr: '2', cuenta: '294203' },
      { identificador: 'R', codigo: 69, porcentaje: 4, nombre: 'DV RTF ARRI 4 PN', dbcr: '1', cuenta: '294203' },
      { identificador: 'R', codigo: 70, porcentaje: 10, nombre: 'RTF COMIS 10 PN', dbcr: '2', cuenta: '293901' },
      { identificador: 'R', codigo: 71, porcentaje: 10, nombre: 'DV RTF COMIS 10 PN', dbcr: '1', cuenta: '293901' },
      { identificador: 'R', codigo: 72, porcentaje: 11, nombre: 'RTF COMISI 11% PN', dbcr: '2', cuenta: '293903' },
      { identificador: 'R', codigo: 73, porcentaje: 11, nombre: 'DV RTF COMIS 11 P1', dbcr: '1', cuenta: '293903' },
      { identificador: 'R', codigo: 74, porcentaje: 1, nombre: 'RTF SERVICIOS 1 PN', dbcr: '2', cuenta: '294001' },
      { identificador: 'R', codigo: 75, porcentaje: 1, nombre: 'DV RTF SERV 1 PN', dbcr: '1', cuenta: '294001' },
      { identificador: 'R', codigo: 76, porcentaje: 2.5, nombre: 'RTF COMP 2.5 AS PN', dbcr: '2', cuenta: '294510' },
      { identificador: 'R', codigo: 77, porcentaje: 2.5, nombre: 'DV RTF COM 2.5 AS PN', dbcr: '1', cuenta: '294510' },
      { identificador: 'R', codigo: 78, porcentaje: 1.5, nombre: 'RTF COMPRAS 1.5 PN', dbcr: '2', cuenta: '294507' },
      { identificador: 'R', codigo: 79, porcentaje: 1.5, nombre: 'DV RTF COM 1.5 PN', dbcr: '1', cuenta: '294507' },
      { identificador: 'R', codigo: 80, porcentaje: 1, nombre: 'RTF COMPRAS 1 PN', dbcr: '2', cuenta: '294505' },
      { identificador: 'R', codigo: 81, porcentaje: 1, nombre: 'DV RTF COM 1 PN', dbcr: '1', cuenta: '294505' },
      { identificador: 'R', codigo: 82, porcentaje: 4, nombre: 'RTF SERVICIOS 4 PN', dbcr: '2', cuenta: '294007' },
      { identificador: 'R', codigo: 83, porcentaje: 4, nombre: 'DV RTF SERV 4 PN', dbcr: '1', cuenta: '294007' },
      { identificador: 'R', codigo: 84, porcentaje: 2.5, nombre: 'RTF COMPRAS 2.5 PN', dbcr: '2', cuenta: '294509' },
      { identificador: 'R', codigo: 85, porcentaje: 2.5, nombre: 'DV RTF COM 2.5 PN', dbcr: '1', cuenta: '294509' },
      { identificador: 'R', codigo: 86, porcentaje: 0.1, nombre: 'RTF COMPRAS 0.1 PN', dbcr: '2', cuenta: '294501' },
      { identificador: 'R', codigo: 87, porcentaje: 0.1, nombre: 'DV RTF COM 0.1 PN', dbcr: '1', cuenta: '294501' },
      { identificador: 'R', codigo: 88, porcentaje: 11, nombre: 'RTF HONO ASU 11% PN', dbcr: '2', cuenta: '293804' },
      { identificador: 'R', codigo: 89, porcentaje: 1, nombre: 'RTF SERV ASU 1% PN', dbcr: '2', cuenta: '294002' },
      { identificador: 'R', codigo: 90, porcentaje: 3.5, nombre: 'RTF SERV ASUM 3.5 PN', dbcr: '2', cuenta: '294006' },
      { identificador: 'R', codigo: 91, porcentaje: 1, nombre: 'RTF SERVICIOS ASU 1%', dbcr: '2', cuenta: '290902' },
      { identificador: 'R', codigo: 92, porcentaje: 6, nombre: 'RTF SERVICIOS 6 PN', dbcr: '2', cuenta: '294011' },
      { identificador: 'R', codigo: 93, porcentaje: 4, nombre: 'RTE SERV ASU 4%', dbcr: '2', cuenta: '290908' },
      { identificador: 'C', codigo: 99, porcentaje: 0, nombre: 'SIN RTE ICA', dbcr: '', cuenta: '' },
      { identificador: 'E', codigo: 99, porcentaje: 0, nombre: 'No Aplica Imco', dbcr: '', cuenta: '' },
      { identificador: 'I', codigo: 99, porcentaje: 0, nombre: 'SIN IVA', dbcr: '', cuenta: '' },
      { identificador: 'P', codigo: 99, porcentaje: 0, nombre: 'SIN PRONTO PAGO', dbcr: '', cuenta: '' },
      { identificador: 'R', codigo: 99, porcentaje: 0, nombre: 'SIN RTE FTE', dbcr: '', cuenta: '' },
      { identificador: 'T', codigo: 99, porcentaje: 0, nombre: 'SIN RTE IVA', dbcr: '', cuenta: '' },
      { identificador: 'Z', codigo: 99, porcentaje: 0, nombre: 'No Aplica CREE', dbcr: '', cuenta: '' },
    ],
    // Por empresa: { "Inversiones Mindala SAS": [{ banco, fecha, documento, beneficiario, valor }] }
    partidasAnteriores: {},
    // Por empresa|año-mes|banco: saldo del extracto digitado
    saldosExtracto: {},
  };

  const copia = (o) => JSON.parse(JSON.stringify(o));

  function cargar() {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (!guardada) return copia(PREDETERMINADA);
      const c = copia(PREDETERMINADA);
      for (const k of Object.keys(c)) if (guardada[k] !== undefined) c[k] = guardada[k];
      c.parametros = { ...PREDETERMINADA.parametros, ...(guardada.parametros || {}) };
      // Conceptos bancarios nuevos de la versión: se agregan a la lista guardada si no estaban
      const clave = (x) => `${(x.banco || '').trim().toLowerCase()}|${(x.texto || '').trim().toLowerCase()}`;
      const existentes = new Set((c.conceptosBancarios || []).map(clave));
      for (const p of PREDETERMINADA.conceptosBancarios) if (!existentes.has(clave(p))) c.conceptosBancarios.push(copia(p));
      return c;
    } catch (e) {
      console.warn('No se pudo leer la configuración guardada', e);
      return copia(PREDETERMINADA);
    }
  }

  function guardar(c) {
    try { localStorage.setItem(CLAVE, JSON.stringify(c)); return true; } catch (e) { console.warn(e); return false; }
  }

  const restaurar = (seccion) => copia(seccion ? PREDETERMINADA[seccion] : PREDETERMINADA);

  return { cargar, guardar, restaurar, copia };
})();
