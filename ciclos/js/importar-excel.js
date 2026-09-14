/* ============================================================================
 * importar-excel.js — LECTURA DEL EXCEL HISTÓRICO "5.1. TIEMPO DE CICLO" (hoja BD)
 * Sin DOM: lo usa Config → Ajustes → Importar histórico (navegador) y también
 * puede cargarse en Node. Las horas del Excel son hora local de Lima (UTC−5,
 * sin horario de verano) y se envían con ese desfase explícito.
 * La clave_excel (fundo | lote | inicio de cosecha) permite reimportar el
 * mismo archivo actualizado sin duplicar ciclos.
 * ==========================================================================*/
(function (raiz) {
  var IMP = { ZONA: '-05:00' };

  /** Encabezado normalizado del Excel → columna de ciclos_cosecha (incluye erratas del archivo original). */
  IMP.COLUMNAS = {
    'FECHA': 'fecha', 'FUNDO': 'fundo', 'LOTE': 'lote', 'LIDERDE GRUPO': 'lider', 'LIDER DE GRUPO': 'lider',
    'PRESENTACION': 'presentacion', 'VARIEDAD': 'variedad', 'CALIBRE': 'calibre',
    'INICIO COSECHA': 'inicio_cosecha', 'FIN COSECHA': 'fin_cosecha',
    'INICIO JABERO': 'inicio_jabero', 'FIN JABERO': 'fin_jabero', 'N DE JABAS': 'num_jabas', 'OBSERVACIONES DE JABA': 'obs_jaba',
    'PLACA': 'placa', 'HORA LLEGADA MOTOCARGA': 'hora_llegada_moto',
    'INICIO DE CARGA A MOTOCARGA': 'inicio_carga_moto', 'FIN DE CARGA A MOTOCARGA': 'fin_carga_moto',
    'INICIO TRASLADO MOTOCARGA A CA': 'inicio_traslado_ca', 'FIN TRASLADO MOTOCARGA A CA': 'fin_traslado_ca',
    'N DE JABAS 2': 'num_jabas_2', 'OBSERVACIONES DE JABAS 2': 'obs_jabas_2',
    'INICIO DESCARGA Y ARMADO EN CA': 'inicio_descarga_ca', 'FIN DESCARGA Y ARMADO EN CA': 'fin_descarga_ca',
    'N DE PALLETS': 'num_pallets', 'PRESENTACIONES': 'presentaciones', 'PLACA DE CAMION': 'placa_camion',
    'INICIO CARGA AL CAMION': 'inicio_carga_camion', 'FIN CARGA AL CAMION': 'fin_carga_camion',
    'INICIO TRASLADO A PLANTA': 'inicio_traslado_planta', 'FIN DE TRASLADO A PLANTA': 'fin_traslado_planta',
    'OBSERVAACION CS': 'obs_cs', 'OBSERVACION CS': 'obs_cs', 'TAREADORA': 'tareadora', 'OBSERVACION CA': 'obs_ca',
    'TIEMPO DE CICLO': '_t_ciclo_excel'
  };
  IMP.HORAS = ['inicio_cosecha', 'fin_cosecha', 'inicio_jabero', 'fin_jabero', 'hora_llegada_moto', 'inicio_carga_moto', 'fin_carga_moto',
    'inicio_traslado_ca', 'fin_traslado_ca', 'inicio_descarga_ca', 'fin_descarga_ca', 'inicio_carga_camion', 'fin_carga_camion',
    'inicio_traslado_planta', 'fin_traslado_planta'];
  IMP.NUMEROS = ['num_jabas', 'num_jabas_2', 'num_pallets'];

  IMP.norm = function (s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[º°]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  };
  IMP.pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /** Serial de Excel o texto (dd/mm/aaaa hh:mm[:ss] · aaaa-mm-dd hh:mm[:ss]) → 'AAAA-MM-DDTHH:MM:SS-05:00'. */
  IMP.aFechaHora = function (v) {
    var p = IMP.pad, m;
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null;
      var d = new Date(Math.round((v - 25569) * 86400) * 1000);
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' +
        p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + IMP.ZONA;
    }
    var s = String(v).trim();
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return m[3] + '-' + p(+m[2]) + '-' + p(+m[1]) + 'T' + p(+(m[4] || 0)) + ':' + p(+(m[5] || 0)) + ':' + p(+(m[6] || 0)) + IMP.ZONA;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + p(+(m[4] || 0)) + ':' + p(+(m[5] || 0)) + ':' + p(+(m[6] || 0)) + IMP.ZONA;
    return null;
  };

  var minutos = function (a, b) { return (a && b) ? (Date.parse(b) - Date.parse(a)) / 60000 : null; };

  /** Misma fórmula que el trigger ciclos_calcular_formulas (13 tramos); null si falta alguno. */
  IMP.tiempoCiclo = function (f) {
    var t = [
      minutos(f.inicio_cosecha, f.fin_cosecha), minutos(f.fin_cosecha, f.inicio_jabero), minutos(f.inicio_jabero, f.fin_jabero),
      minutos(f.fin_jabero, f.inicio_carga_moto), minutos(f.inicio_carga_moto, f.fin_carga_moto), minutos(f.fin_carga_moto, f.inicio_traslado_ca),
      minutos(f.inicio_traslado_ca, f.fin_traslado_ca), minutos(f.fin_traslado_ca, f.inicio_descarga_ca), minutos(f.inicio_descarga_ca, f.fin_descarga_ca),
      minutos(f.fin_descarga_ca, f.inicio_carga_camion), minutos(f.inicio_carga_camion, f.fin_carga_camion),
      minutos(f.fin_carga_camion, f.inicio_traslado_planta), minutos(f.inicio_traslado_planta, f.fin_traslado_planta)
    ];
    return t.some(function (x) { return x === null; }) ? null : t.reduce(function (s, x) { return s + x; }, 0);
  };

  /** Libro de SheetJS → { hoja, filas, avisos, resumen }. */
  IMP.leerLibro = function (XLSX, libro) {
    var matrizDe = function (n) { return XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: null }); };
    var nombre = libro.SheetNames.filter(function (n) { return IMP.norm(n) === 'BD'; })[0] ||
      libro.SheetNames.filter(function (n) { return (matrizDe(n)[0] || []).some(function (c) { return IMP.norm(c) === 'INICIO COSECHA'; }); })[0];
    if (!nombre) throw new Error('No se encontró la hoja «BD» (con la columna INICIO COSECHA) en el archivo.');
    return IMP.convertir(matrizDe(nombre), nombre);
  };

  IMP.convertir = function (matriz, hoja) {
    var cab = matriz[0] || [], mapa = {};
    cab.forEach(function (c, i) { var k = IMP.COLUMNAS[IMP.norm(c)]; if (k && !(k in mapa)) mapa[k] = i; });
    if (!('fundo' in mapa) || !('inicio_cosecha' in mapa)) throw new Error('La hoja «' + hoja + '» no tiene las columnas FUNDO e INICIO COSECHA.');

    var filas = [], avisos = [], repetidas = {};
    for (var i = 1; i < matriz.length; i++) {
      var r = matriz[i];
      if (!r || !r.some(function (v) { return v !== null && v !== ''; })) continue;
      var f = {}, notas = [];
      Object.keys(mapa).forEach(function (k) {
        var v = r[mapa[k]];
        if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return;
        if (IMP.HORAS.indexOf(k) > -1 || k === 'fecha') {
          var t = IMP.aFechaHora(v);
          if (!t) { avisos.push('Fila ' + (i + 1) + ': «' + String(cab[mapa[k]]).trim() + '» no es una fecha/hora válida (' + v + ').'); return; }
          f[k] = k === 'fecha' ? t.substring(0, 10) : t;
        } else if (IMP.NUMEROS.indexOf(k) > -1) {
          var n = typeof v === 'number' ? v : parseInt(String(v), 10);
          if (!isNaN(n)) f[k] = Math.round(n);
          if (typeof v !== 'number' && String(v).trim() !== String(n)) notas.push(String(cab[mapa[k]]).trim() + ' en Excel: «' + String(v).trim() + '»');
        } else if (k === '_t_ciclo_excel') {
          if (typeof v === 'number') f._t_ciclo_excel = v;
        } else {
          f[k] = String(v).trim();
        }
      });
      if (notas.length) f.obs_ca = [f.obs_ca].concat(notas).filter(Boolean).join(' · ');
      if (!f.fundo) { avisos.push('Fila ' + (i + 1) + ': sin fundo, se omite.'); continue; }
      if (!f.fecha && f.inicio_cosecha) f.fecha = f.inicio_cosecha.substring(0, 10);
      if (!f.fecha) { avisos.push('Fila ' + (i + 1) + ': sin fecha ni inicio de cosecha, se omite.'); continue; }

      var base = [f.fundo, f.lote || '', (f.inicio_cosecha || f.fecha).substring(0, 16)].join('|').toUpperCase();
      repetidas[base] = (repetidas[base] || 0) + 1;
      f.clave_excel = base + (repetidas[base] > 1 ? '#' + repetidas[base] : '');
      f._fila = i + 1;
      f._t_ciclo_calc = IMP.tiempoCiclo(f);
      filas.push(f);
    }

    var fundos = {}, coinciden = 0, difieren = 0, sinTotal = 0, fechas = filas.map(function (f) { return f.fecha; }).sort();
    filas.forEach(function (f) {
      fundos[f.fundo] = (fundos[f.fundo] || 0) + 1;
      if (f._t_ciclo_calc === null) sinTotal++;
      else if (typeof f._t_ciclo_excel !== 'number' || Math.abs(f._t_ciclo_calc - f._t_ciclo_excel) <= 0.05) coinciden++;
      else { difieren++; avisos.push('Fila ' + f._fila + ': tiempo de ciclo ' + f._t_ciclo_calc.toFixed(1) + ' min ≠ Excel ' + f._t_ciclo_excel.toFixed(1) + ' min.'); }
    });
    return {
      hoja: hoja, filas: filas, avisos: avisos,
      resumen: { total: filas.length, desde: fechas[0] || '', hasta: fechas[fechas.length - 1] || '', fundos: fundos, coinciden: coinciden, difieren: difieren, sinTotal: sinTotal }
    };
  };

  /** Quita los campos internos (_fila, _t_ciclo_*) antes de enviar a Supabase. */
  IMP.paraEnviar = function (f) {
    var o = {};
    Object.keys(f).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = f[k]; });
    return o;
  };

  raiz.IMPORTAR_EXCEL = IMP;
  if (typeof module !== 'undefined' && module.exports) module.exports = IMP;
})(typeof window !== 'undefined' ? window : globalThis);
