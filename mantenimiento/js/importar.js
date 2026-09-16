/* ============================================================================
 * importar.js — LECTURA DEL EXCEL «Plan de <mes>.xlsx»
 * Sin DOM. Busca la hoja cuyo nombre es un mes (MARZO, ABRIL…), ubica la fila
 * de encabezados (# OT … RESPONSABLE) y devuelve las OT listas para enviar.
 * Las demás hojas (Hoja1 con la tabla dinámica, OT (2)…) se ignoran.
 * ==========================================================================*/
(function (raiz) {
  var IMP = { LIB: '../reubicacion/vendor/xlsx.full.min.js' };

  IMP.MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
    SETIEMBRE: 9, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };

  /** Encabezado sin tildes, espacios ni símbolos → columna de mp_ot. */
  IMP.COLUMNAS = {
    OT: 'num_ot', NOT: 'num_ot', NROOT: 'num_ot', NUMOT: 'num_ot', NUMEROOT: 'num_ot', ORDENDETRABAJO: 'num_ot',
    PLANTA: 'planta',
    RESPONSABLE: 'responsable', ENCARGADO: 'responsable', SUPERVISOR: 'responsable',
    UBICACION: 'ubicacion',
    SUBEQUIPOS: 'sub_equipo', SUBEQUIPO: 'sub_equipo',
    DESCRIPCION: 'descripcion',
    PERSONAS: 'personas', PERSONA: 'personas',
    FECHAINICIOPLAN: 'f_ini_plan', FECHAFINPLAN: 'f_fin_plan',
    FECHAINICIOREAL: 'f_ini_real', FECHAFINREAL: 'f_fin_real',
    OBSERVACION: 'obs_excel', OBSERVACIONES: 'obs_excel'
  };
  IMP.FECHAS = ['f_ini_plan', 'f_fin_plan', 'f_ini_real', 'f_fin_real'];

  IMP.norm = function (s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  };
  IMP.clave = function (s) { return IMP.norm(s).replace(/[^A-Z0-9]/g, ''); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /** Nombre de hoja → número de mes (acepta «MARZO», «Marzo 2026», «PLAN ABRIL»). */
  IMP.mesDe = function (nombre) {
    var palabras = IMP.norm(nombre).split(/[^A-Z]+/);
    for (var i = 0; i < palabras.length; i++) if (IMP.MESES[palabras[i]]) return IMP.MESES[palabras[i]];
    return null;
  };

  /** Serial de Excel o texto (dd/mm/aaaa · aaaa-mm-dd) → 'AAAA-MM-DD'. */
  IMP.aFecha = function (v) {
    var m;
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null;
      var d = new Date(Math.round((v - 25569) * 86400) * 1000);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    var s = String(v).trim();
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  };

  IMP.texto = function (v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    return String(v).replace(/\s+/g, ' ').trim();
  };

  /** Libro de SheetJS → { hoja, mes, anio, filas, avisos }. */
  IMP.leerLibro = function (XLSX, libro) {
    var candidatas = libro.SheetNames.filter(function (n) { return IMP.mesDe(n); });
    if (!candidatas.length) {
      throw new Error('No se encontró una hoja con nombre de mes (p. ej. «MARZO»). Hojas del archivo: ' + libro.SheetNames.join(', ') + '.');
    }
    var errores = [];
    for (var i = 0; i < candidatas.length; i++) {
      var matriz = XLSX.utils.sheet_to_json(libro.Sheets[candidatas[i]], { header: 1, raw: true, defval: null });
      try { return IMP.convertir(matriz, candidatas[i]); } catch (e) { errores.push(e.message); }
    }
    throw new Error(errores.join(' '));
  };

  IMP.convertir = function (matriz, hoja) {
    var filaCab = -1, mapa = {};
    for (var i = 0; i < Math.min(matriz.length, 10) && filaCab < 0; i++) {
      var m = {};
      (matriz[i] || []).forEach(function (c, j) { var k = IMP.COLUMNAS[IMP.clave(c)]; if (k && !(k in m)) m[k] = j; });
      if ('num_ot' in m && 'responsable' in m) { filaCab = i; mapa = m; }
    }
    if (filaCab < 0) throw new Error('La hoja «' + hoja + '» no tiene las columnas # OT y RESPONSABLE en sus primeras filas.');

    var filas = [], avisos = [], sinPlanta = 0;
    for (var r = filaCab + 1; r < matriz.length; r++) {
      var fila = matriz[r];
      if (!fila || !fila.some(function (v) { return v !== null && String(v).trim() !== ''; })) continue;
      var f = { fila: r + 1 };
      Object.keys(mapa).forEach(function (k) {
        var v = fila[mapa[k]];
        if (IMP.FECHAS.indexOf(k) > -1) {
          f[k] = IMP.aFecha(v);
          if (!f[k] && v !== null && String(v).trim() !== '') avisos.push('Fila ' + (r + 1) + ': «' + v + '» no es una fecha válida.');
        } else {
          f[k] = IMP.texto(v);
        }
      });
      if (!f.num_ot || !f.responsable) {
        avisos.push('Fila ' + (r + 1) + ': sin ' + (!f.num_ot ? '# OT' : 'RESPONSABLE') + ', se omite.');
        continue;
      }
      f.responsable = f.responsable.toUpperCase();
      f.planta = (f.planta || '').toUpperCase();
      if (!f.planta) { f.planta = 'SIN PLANTA'; sinPlanta++; }
      filas.push(f);
    }
    if (!filas.length) throw new Error('La hoja «' + hoja + '» no tiene OT con # OT y RESPONSABLE.');
    if (sinPlanta) avisos.push(sinPlanta + ' OT sin PLANTA: quedan como «SIN PLANTA».');
    if (!('planta' in mapa)) avisos.push('La hoja no tiene la columna PLANTA.');

    return { hoja: hoja, mes: IMP.mesDe(hoja), anio: IMP.anio(filas), filas: filas, avisos: avisos };
  };

  /** Año más frecuente en las fechas reales (o plan); si no hay, el actual. */
  IMP.anio = function (filas) {
    var cuenta = {}, mejor = null;
    ['f_ini_real', 'f_ini_plan'].some(function (k) {
      filas.forEach(function (f) { if (f[k]) { var a = f[k].substring(0, 4); cuenta[a] = (cuenta[a] || 0) + 1; } });
      return Object.keys(cuenta).length > 0;
    });
    Object.keys(cuenta).forEach(function (a) { if (!mejor || cuenta[a] > cuenta[mejor]) mejor = a; });
    return mejor ? Number(mejor) : new Date().getFullYear();
  };

  raiz.IMP_MP = IMP;
  if (typeof module !== 'undefined' && module.exports) module.exports = IMP;
})(typeof window !== 'undefined' ? window : globalThis);
