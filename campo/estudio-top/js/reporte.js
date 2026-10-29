/* ============================================================================
 * reporte.js — EXPORTABLES DEL ESTUDIO TOP
 * Excel (ExcelJS) auditable: datos crudos + resúmenes y KPI con fórmulas de Excel que se
 * comparan con los valores de Integra (✔ / ✘).
 * PDF (jsPDF): informe técnico de sustento con las imágenes REBA de la hoja y, en la portada,
 * la última foto subida en las evaluaciones del periodo como imagen de referencia.
 * ==========================================================================*/
var REPORTE = {};

REPORTE.lib = function (src, global) {
  return DR.cargarScript(src).then(function () {
    var g = global.split('.').reduce(function (o, k) { return o && o[k]; }, window);
    if (!g) throw new Error('No se pudo cargar el generador. Revisa tu conexión.');
    return g;
  });
};
REPORTE.descargar = function (blob, nombre) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
};
REPORTE.nombre = function (ext) { return 'Estudio_TOP_' + TOP.hoy() + '.' + ext; };
REPORTE.propuestas = function () {
  return sb.from('top_propuestas').select('*').order('estado').order('creado_en').then(function (r) {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
};
REPORTE.evalDe = function (D, id) { return D.evals.filter(function (e) { return e.id === id; })[0] || {}; };

/* ------------------------------------------------------------ Excel */
/**
 * Excel AUDITABLE con los filtros del Resumen. Las hojas de datos (Evaluaciones, Tomas, Estándares
 * (detalle), REBA, Ergonomía (respuestas), Encuesta) traen lo registrado tal cual; las hojas de
 * resumen y la hoja KPIs se calculan con FÓRMULAS sobre ellas. Junto a cada cálculo va el valor
 * que muestra Integra y una marca ✔ / ✘: si alguien cambia un dato o el suplemento (hoja
 * Parámetros), Excel recalcula y se ve en qué coincide o no. REBA se recalcula con sus tablas A,
 * B y C (hoja Tablas REBA). Solo funciones de Excel 2010 sin prefijo (MEDIAN, PERCENTILE, STDEV,
 * COUNTIFS, SUMIFS…); las que van con IF( ) sobre rangos son fórmulas matriciales.
 * El script documentacion/verificar_estudio_top.py rehace los KPI desde las hojas de datos.
 */
REPORTE.excel = function (D, A) {
  return Promise.all([REPORTE.lib('../../vendor/exceljs.min.js', 'ExcelJS'), REPORTE.propuestas()]).then(function (r) {
    var ExcelJS = r[0], props = r[1], wb = new ExcelJS.Workbook();
    wb.creator = 'Integra · Don Ricardo';
    wb.calcProperties = { fullCalcOnLoad: true };
    var F = D.filtro || {}, MMSS = '[m]:ss', FECHA = 'dd/mm/yyyy', FH = 'dd/mm/yyyy hh:mm:ss';
    var L = {}, N = {};   // letra de cada columna por hoja y n.° de filas de datos

    var pintarCab = function (ws, n, color) {
      var cab = ws.getRow(1);
      cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color || 'FF0097CE' } };
      cab.alignment = { vertical: 'middle', wrapText: true };
      cab.height = 32;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: n } };
    };
    /** Hoja con columnas [título, clave, ancho, formato]. Las de resumen van en verde. */
    var hoja = function (nombre, cols, filas, color) {
      var ws = wb.getWorksheet(nombre) || wb.addWorksheet(nombre);
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2] || 14, style: c[3] ? { numFmt: c[3] } : {} }; });
      L[nombre] = {};
      cols.forEach(function (c) { L[nombre][c[1]] = ws.getColumn(c[1]).letter; });
      (filas || []).forEach(function (x) { ws.addRow(x); });
      N[nombre] = (filas || []).length;
      pintarCab(ws, cols.length, color);
      return ws;
    };
    /** Rango absoluto de una columna de datos: 'Tomas'!$P$2:$P$120. */
    var rg = function (h, k) { var fin = Math.max(N[h], 1) + 1; return "'" + h + "'!$" + L[h][k] + '$2:$' + L[h][k] + '$' + fin; };
    var ref = function (h, k, fila) { return "'" + h + "'!$" + L[h][k] + '$' + fila; };
    var c = function (h, k, fila) { return L[h][k] + fila; };   // celda relativa en la misma hoja
    /** Fórmula (matricial si arr) con el valor de Integra como resultado guardado; Excel la recalcula al abrir. */
    var fo = function (ws, celda, formula, resultado, arr) {
      var v = { formula: formula };
      if (resultado !== undefined && resultado !== null && resultado !== '') v.result = resultado;
      if (arr) { v.shareType = 'array'; v.ref = celda; }
      ws.getCell(celda).value = v;
    };
    /** ✔ si el cálculo de Excel (a) y el de Integra (b) coinciden dentro de la tolerancia. */
    var chk = function (a, b, tol) {
      return 'IF(AND(ISNUMBER(' + a + '),ISNUMBER(' + b + ')),IF(ABS(' + a + '-' + b + ')<=' + tol + ',"✔","✘"),IF(AND(' + a + '="",' + b + '=""),"✔","✘"))';
    };
    var verde = function (ws, cols) {
      cols.forEach(function (k) { ws.getColumn(k).font = { bold: true, color: { argb: 'FF2E7D32' } }; });
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    };
    var fechaX = function (iso) {
      var l = TOP.aLocal(iso);
      if (!l) return null;
      var p = l.split(/[-T:]/).map(Number);
      return new Date(Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]));
    };
    var diaX = function (s) { if (!s) return null; var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
    var base = function (e) {
      return { codigo: e.codigo, fecha: diaX(e.fecha), cosechador: e.cosechador, dni: e.dni, fundo: e.fundo, lote: e.lote,
        material: e.material, presentacion: e.presentacion, variedad: e.variedad, lider: e.lider };
    };
    var colsBase = [['Código', 'codigo', 11], ['Fecha', 'fecha', 11, FECHA], ['Cosechador', 'cosechador', 28], ['DNI', 'dni', 11], ['Fundo', 'fundo', 14],
      ['Lote', 'lote', 9], ['Material', 'material', 14], ['Estándar', 'presentacion', 10], ['Variedad', 'variedad', 11], ['Líder', 'lider', 22]];
    var VERDE = 'FF2E7D32';

    // Orden de pestañas: primero los KPI y los resúmenes con fórmulas; luego los datos.
    ['KPIs', 'Parámetros', 'Tiempo estándar', 'Distribución jornada', 'Clases de tiempo', 'Estándares (resumen)', 'REBA (resumen)',
      'Ergonomía (resumen)', 'Encuesta (factores)'].forEach(function (n) { wb.addWorksheet(n); });

    /* ============================== hojas de datos ============================== */
    hoja('Evaluaciones', colsBase.concat([['Labor', 'labor', 14], ['Herramienta', 'herramienta', 14], ['Evaluador', 'evaluador', 22],
      ['Inicio jornada', 'jIni', 18, FH], ['Fin jornada', 'jFin', 18, FH], ['Observaciones', 'obs', 40]]),
      D.evals.map(function (e) {
        var f = base(e);
        f.labor = e.labor; f.herramienta = e.herramienta; f.evaluador = e.evaluador_txt; f.jIni = fechaX(e.jornada_inicio); f.jFin = fechaX(e.jornada_fin); f.obs = e.observaciones;
        return f;
      }));

    var tomas = D.tiempos.slice().sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
    var wsT = hoja('Tomas', colsBase.concat([['ID actividad', 'actId', 9], ['Actividad', 'act', 34], ['Clase', 'clase', 16], ['Inicio', 'ini', 18, FH], ['Fin', 'fin', 18, FH],
      ['Duración (s)', 'seg', 11], ['Válida (1 = entra en la estadística)', 'val', 12], ['Primera toma de este TOP en la actividad', 'pri', 14],
      ['Duración (min:seg)', 'mmss', 11, MMSS], ['Nota', 'nota', 30]]),
      tomas.map(function (t) {
        var f = base(REPORTE.evalDe(D, t.evaluacion_id)), a = TOP.actividad(t.actividad_id);
        f.actId = Number(t.actividad_id); f.act = a.nombre; f.clase = TOP.CLASES[a.clase].t; f.ini = fechaX(t.inicio); f.fin = fechaX(t.fin);
        f.seg = t.duracion_seg; f.nota = t.nota;
        return f;
      }), 'FF6E6155');
    tomas.forEach(function (t, i) {
      var n = i + 2, val = t.duracion_seg !== null && t.duracion_seg >= 0 ? 1 : 0;
      fo(wsT, c('Tomas', 'val', n), 'IF(AND(ISNUMBER(' + c('Tomas', 'seg', n) + '),' + c('Tomas', 'seg', n) + '>=0),1,0)', val);
      fo(wsT, c('Tomas', 'pri', n), 'IF(' + c('Tomas', 'val', n) + '=1,IF(COUNTIFS($' + L.Tomas.actId + '$2:' + c('Tomas', 'actId', n) + ',' + c('Tomas', 'actId', n) +
        ',$' + L.Tomas.codigo + '$2:' + c('Tomas', 'codigo', n) + ',' + c('Tomas', 'codigo', n) + ',$' + L.Tomas.val + '$2:' + c('Tomas', 'val', n) + ',1)=1,1,0),0)');
      fo(wsT, c('Tomas', 'mmss', n), 'IF(ISNUMBER(' + c('Tomas', 'seg', n) + '),' + c('Tomas', 'seg', n) + '/86400,"")');
    });

    var RES = { C: 'Cumple', NC: 'No cumple', NA: 'No aplica' };
    hoja('Estándares (detalle)', colsBase.concat([['Ronda', 'ronda', 7], ['ID ítem', 'itemId', 8], ['Tipo', 'tipo', 13], ['Ítem', 'txt', 55], ['Resultado', 'res', 11],
      ['Cómo lo hace el TOP', 'prac', 45], ['Observación', 'obs', 40], ['Fotos', 'fotos', 8]]),
      D.cump.map(function (x) {
        var f = base(REPORTE.evalDe(D, x.evaluacion_id)), it = TOP.item(x.item_id) || {};
        f.ronda = x.ronda || 1; f.itemId = Number(x.item_id); f.tipo = it.tipo; f.txt = it.descripcion; f.res = RES[x.resultado] || '';
        f.prac = x.practica_top; f.obs = x.observacion; f.fotos = (x.fotos || []).length;
        return f;
      }), 'FF6E6155');

    // REBA: lo registrado + el recálculo con las tablas A, B y C (columnas verdes).
    var b01 = function (v) { return v ? 1 : 0; };
    var wsR = hoja('REBA', colsBase.concat([['Actividad', 'act', 30], ['Momento', 'momento', 20], ['Cuello', 'cuello', 7], ['Cuello +1 (1=sí)', 'cuello_mod', 8],
      ['Tronco', 'tronco', 7], ['Tronco +1', 'tronco_mod', 8], ['Piernas', 'piernas', 8], ['Piernas +', 'piernas_mod', 8], ['Carga', 'carga', 7],
      ['Brusca +1', 'carga_brusca', 8], ['Brazo', 'brazo', 7], ['Hombro +1', 'brazo_elevado', 8], ['Apoyo −1', 'brazo_apoyo', 8], ['Antebrazo', 'antebrazo', 9],
      ['Muñeca', 'muneca', 8], ['Muñeca +1', 'muneca_mod', 8], ['Agarre', 'agarre', 7], ['Estática +1', 'act_estatica', 8], ['Repetitiva +1', 'act_repetitiva', 9],
      ['Inestable +1', 'act_inestable', 9], ['Tabla A', 'tabla_a', 7], ['Puntaje A', 'puntaje_a', 8], ['Tabla B', 'tabla_b', 7], ['Puntaje B', 'puntaje_b', 8],
      ['Puntaje C', 'puntaje_c', 8], ['REBA final', 'puntaje_final', 9], ['Riesgo', 'riesgo', 12], ['Observación', 'observacion', 30],
      ['Excel: Tabla A', 'vA', 8], ['Excel: Puntaje A', 'vPA', 9], ['Excel: Tabla B', 'vB', 8], ['Excel: Puntaje B', 'vPB', 9], ['Excel: Puntaje C', 'vC', 9],
      ['Excel: REBA final', 'vF', 9], ['Excel: Riesgo', 'vR', 12], ['¿Coincide con Integra?', 'ok', 11]]),
      D.reba.map(function (x) {
        var f = base(REPORTE.evalDe(D, x.evaluacion_id));
        f.act = x.actividad_id ? TOP.actividad(x.actividad_id).nombre : ''; f.momento = x.momento;
        ['cuello', 'tronco', 'piernas', 'piernas_mod', 'carga', 'brazo', 'antebrazo', 'muneca', 'agarre', 'tabla_a', 'puntaje_a', 'tabla_b', 'puntaje_b', 'puntaje_c', 'puntaje_final', 'riesgo', 'observacion']
          .forEach(function (k) { f[k] = x[k]; });
        ['cuello_mod', 'tronco_mod', 'carga_brusca', 'brazo_elevado', 'brazo_apoyo', 'muneca_mod', 'act_estatica', 'act_repetitiva', 'act_inestable'].forEach(function (k) { f[k] = b01(x[k]); });
        return f;
      }), 'FF6E6155');
    verde(wsR, ['vA', 'vPA', 'vB', 'vPB', 'vC', 'vF', 'vR', 'ok']);
    D.reba.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c('REBA', key, n); };
      var cu = 'MIN(3,' + k('cuello') + '+' + k('cuello_mod') + ')', tr = 'MIN(5,' + k('tronco') + '+' + k('tronco_mod') + ')';
      var pi = 'MIN(4,' + k('piernas') + '+N(' + k('piernas_mod') + '))', br = 'MAX(1,MIN(6,' + k('brazo') + '+' + k('brazo_elevado') + '-' + k('brazo_apoyo') + '))';
      var mu = 'MIN(3,' + k('muneca') + '+' + k('muneca_mod') + ')';
      fo(wsR, k('vA'), "IFERROR(INDEX('Tablas REBA'!$B$3:$E$17,(" + tr + '-1)*3+' + cu + ',' + pi + '),"")', x.tabla_a);
      fo(wsR, k('vPA'), 'IFERROR(MIN(12,' + k('vA') + '+N(' + k('carga') + ')+' + k('carga_brusca') + '),"")', x.puntaje_a);
      fo(wsR, k('vB'), "IFERROR(INDEX('Tablas REBA'!$H$3:$J$14,(" + br + '-1)*2+' + k('antebrazo') + ',' + mu + '),"")', x.tabla_b);
      fo(wsR, k('vPB'), 'IFERROR(MIN(12,' + k('vB') + '+N(' + k('agarre') + ')),"")', x.puntaje_b);
      fo(wsR, k('vC'), "IFERROR(INDEX('Tablas REBA'!$M$3:$X$14," + k('vPA') + ',' + k('vPB') + '),"")', x.puntaje_c);
      fo(wsR, k('vF'), 'IFERROR(' + k('vC') + '+' + k('act_estatica') + '+' + k('act_repetitiva') + '+' + k('act_inestable') + ',"")', x.puntaje_final);
      fo(wsR, k('vR'), 'IF(' + k('vF') + '="","",IF(' + k('vF') + '=1,"Inapreciable",IF(' + k('vF') + '<=3,"Bajo",IF(' + k('vF') + '<=7,"Medio",IF(' + k('vF') + '<=10,"Alto","Muy alto")))))', x.riesgo);
      fo(wsR, k('ok'), 'IF(AND(' + k('vF') + '=' + k('puntaje_final') + ',' + k('vR') + '=' + k('riesgo') + '),"✔","✘")', '✔');
    });

    // Tablas REBA (las de la hoja «CHECKLIST REBA», iguales a TOP.REBA_A / B / C).
    var wsTR = wb.addWorksheet('Tablas REBA');
    wsTR.getCell('A1').value = 'Tabla A: fila = (tronco − 1) × 3 + cuello · columna = piernas';
    wsTR.getCell('G1').value = 'Tabla B: fila = (brazo − 1) × 2 + antebrazo · columna = muñeca';
    wsTR.getCell('L1').value = 'Tabla C: fila = puntaje A · columna = puntaje B';
    ['A1', 'G1', 'L1'].forEach(function (x) { wsTR.getCell(x).font = { bold: true }; });
    ['Piernas 1', 'Piernas 2', 'Piernas 3', 'Piernas 4'].forEach(function (t, j) { wsTR.getCell(2, 2 + j).value = t; });
    TOP.REBA_A.forEach(function (porCuello, ti) {
      porCuello.forEach(function (fila, ci) {
        var rr = 3 + ti * 3 + ci;
        wsTR.getCell(rr, 1).value = 'Tronco ' + (ti + 1) + ' · cuello ' + (ci + 1);
        fila.forEach(function (v, j) { wsTR.getCell(rr, 2 + j).value = v; });
      });
    });
    ['Muñeca 1', 'Muñeca 2', 'Muñeca 3'].forEach(function (t, j) { wsTR.getCell(2, 8 + j).value = t; });
    TOP.REBA_B.forEach(function (porAnte, bi) {
      porAnte.forEach(function (fila, ai) {
        var rr = 3 + bi * 2 + ai;
        wsTR.getCell(rr, 7).value = 'Brazo ' + (bi + 1) + ' · antebrazo ' + (ai + 1);
        fila.forEach(function (v, j) { wsTR.getCell(rr, 8 + j).value = v; });
      });
    });
    for (var j = 0; j < 12; j++) wsTR.getCell(2, 13 + j).value = 'B ' + (j + 1);
    TOP.REBA_C.forEach(function (fila, ai) {
      wsTR.getCell(3 + ai, 12).value = 'A ' + (ai + 1);
      fila.forEach(function (v, j) { wsTR.getCell(3 + ai, 13 + j).value = v; });
    });
    wsTR.getColumn(1).width = 22; wsTR.getColumn(7).width = 22;

    // Ergonomía en formato largo (una fila por pregunta respondida) para poder sumarla con fórmulas.
    var largas = [];
    D.ergo.forEach(function (g) {
      TOP.ERGO.forEach(function (s) {
        s.items.forEach(function (p) {
          var v = (g.respuestas || {})[p[0]];
          if (!v) return;
          var f = base(REPORTE.evalDe(D, g.evaluacion_id));
          f.sec = s.t; f.num = p[0]; f.preg = p[1]; f.resp = v; f.malo = p[2];
          f.mom = s.dolor ? ((g.dolor || {})[p[0]] || []).map(function (m) { return (TOP.MOMENTOS[m - 1] || [])[1]; }).join(', ') : '';
          largas.push(f);
        });
      });
    });
    var wsE = hoja('Ergonomía (respuestas)', colsBase.concat([['Sección', 'sec', 26], ['N°', 'num', 6], ['Pregunta', 'preg', 50], ['Respuesta (SI/NO/NS)', 'resp', 10],
      ['Respuesta desfavorable', 'malo', 10], ['Desfavorable (1/0)', 'desf', 10], ['Momento del dolor', 'mom', 24]]), largas, 'FF6E6155');
    largas.forEach(function (x, i) {
      var n = i + 2, rp = c('Ergonomía (respuestas)', 'resp', n);
      fo(wsE, c('Ergonomía (respuestas)', 'desf', n), 'IF(OR(' + rp + '="SI",' + rp + '="NO"),IF(' + rp + '=' + c('Ergonomía (respuestas)', 'malo', n) + ',1,0),0)',
        (x.resp === 'SI' || x.resp === 'NO') && x.resp === x.malo ? 1 : 0);
    });

    var encRes = function (x, k) { return ENC.etiqueta(k, (x.respuestas || {})[k]); };
    hoja('Encuesta', colsBase.concat([['Aceptó', 'acepto', 8], ['Presentaciones', 'pres', 12], ['Momento', 'momento', 14],
      ['1 Campañas', 'p1', 16], ['2 Cómo trabaja la planta', 'p2', 40], ['3 Distinto a capacitación', 'p3', 12], ['3 ¿En qué?', 'p3_que', 36],
      ['4 Rinde más en', 'p4', 16], ['5 Granel', 'p5_granel', 32], ['5 Jarra', 'p5_jarra', 32], ['6 Tiempo perdido 1º', 'f1', 22],
      ['6 2º', 'f2', 22], ['6 3º', 'f3', 22], ['6 Otro', 'p6_otro', 20], ['7 Cómo lo resuelve', 'p7', 36], ['8 Cómo aprendió', 'p8', 20],
      ['9 Truco', 'p9', 40], ['10 Qué cambiaría', 'p10', 40], ['Observaciones', 'obs', 30]]),
      (D.enc || []).map(function (x) {
        var f = base(REPORTE.evalDe(D, x.evaluacion_id)), rr = x.respuestas || {}, p6 = rr.p6 || [];
        f.acepto = x.acepto ? 'Sí' : 'No';
        f.pres = encRes(x, 'presentaciones'); f.momento = rr.momento === 'OTRO' ? (rr.momento_otro || 'Otro') : encRes(x, 'momento');
        ['p1', 'p3', 'p4', 'p8'].forEach(function (k) { f[k] = encRes(x, k); });
        ['p2', 'p3_que', 'p5_granel', 'p5_jarra', 'p6_otro', 'p7', 'p9', 'p10', 'obs'].forEach(function (k) { f[k] = rr[k] || ''; });
        [0, 1, 2].forEach(function (i) { f['f' + (i + 1)] = p6[i] ? ENC.etiqueta('p6', p6[i]) : ''; });
        return f;
      }), 'FF6E6155');

    var nuevas = TOP.todas.filter(function (a) { return a.sustento; });
    if (nuevas.length) hoja('Etapas nuevas', [['Etapa', 'nombre', 34], ['Clase', 'clase', 18], ['Sustento', 'sustento', 70], ['Creada por', 'quien', 24], ['Fecha', 'fecha', 12]],
      nuevas.map(function (a) {
        return { nombre: a.nombre, clase: TOP.CLASES[a.clase].t, sustento: a.sustento, quien: a.creado_txt, fecha: a.creado_en ? TOP.fecha(TOP.aLocal(a.creado_en)) : '' };
      }), 'FF6E6155');
    hoja('Propuesta', [['N°', 'id', 6], ['Estado', 'estado', 11], ['Ámbito', 'ambito', 18], ['Tipo', 'tipo', 14], ['Presentación', 'pres', 12], ['Actual', 'actual', 50],
      ['Propuesto', 'prop', 50], ['Tiempo estándar', 'tiempo', 12], ['Sustento', 'sust', 70]],
      props.map(function (p) {
        return { id: p.id, estado: PROP.ESTADOS[p.estado][0], ambito: PROP.AMBITOS[p.ambito], tipo: PROP.TIPOS[p.tipo][0], pres: p.presentacion || 'Ambas',
          actual: p.texto_actual || (p.actividad_id ? TOP.actividad(p.actividad_id).nombre : ''), prop: p.texto_propuesto,
          tiempo: p.tiempo_estandar_seg !== null ? TOP.seg(p.tiempo_estandar_seg) : '', sust: p.sustento };
      }), 'FF6E6155');

    /* ============================== parámetros ============================== */
    var wsP = wb.getWorksheet('Parámetros');
    wsP.columns = [{ header: 'Parámetro', key: 'k', width: 34 }, { header: 'Valor', key: 'v', width: 22 }, { header: 'Nota', key: 'n', width: 80 }];
    [['Suplemento % (fatiga y necesidades)', Number(F.suplemento) || 0, 'Cámbialo aquí: el tiempo estándar se recalcula en «Tiempo estándar» (las marcas ✘ indican que ya no coincide con Integra).'],
      ['Desde', F.desde || 'inicio', 'Filtros con los que se descargó (pestaña Resumen del módulo).'],
      ['Hasta', F.hasta || TOP.hoy(), ''], ['Estándar', F.presentacion || 'jarra y granel', ''], ['Material', F.material || 'todos', ''], ['Fundo', F.fundo || 'todos', ''],
      ['Generado', TOP.fecha(TOP.hoy()) + ' · ' + ((AT.perfil && AT.perfil.nombre) || '—'), ''],
      ['Cómo auditar', '', 'Verde = cálculo de Excel con fórmulas sobre las hojas de datos. «Integra» = lo que muestra la app. ✔ = coinciden. Toca una celda para ver su fórmula.'],
      ['Verificación externa', '', 'python documentacion/verificar_estudio_top.py Estudio_TOP_AAAA-MM-DD.xlsx rehace los KPI desde las hojas de datos.']
    ].forEach(function (x) { wsP.addRow({ k: x[0], v: x[1], n: x[2] }); });
    pintarCab(wsP, 3, VERDE);
    wsP.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    var SUP = "'Parámetros'!$B$2";

    /* ============================== resúmenes con fórmulas ============================== */
    var cond = function (h, k, v) { return '(' + rg(h, k) + '=' + v + ')'; };

    // Tiempo estándar por actividad.
    var acts = A.actividades.filter(function (x) { return x.n; });
    var TE = 'Tiempo estándar';
    var wsS = hoja(TE, [['ID', 'id', 6], ['Actividad', 'act', 36], ['Clase', 'clase', 16], ['Tomas', 'n', 8], ['TOP evaluados', 'nEval', 9],
      ['Promedio (s)', 'prom', 10], ['Mediana (s)', 'med', 10], ['P25 (s)', 'p25', 9], ['P75 (s)', 'p75', 9], ['Mín (s)', 'min', 8], ['Máx (s)', 'max', 8],
      ['CV %', 'cv', 8, '0.0'], ['Estándar (s) = ROUND(mediana × (1 + suplemento))', 'est', 14], ['Estándar (min:seg)', 'estMmss', 10, MMSS],
      ['Integra: estándar (s)', 'iEst', 10], ['✔ estándar', 'okEst', 8], ['Integra: mediana (s)', 'iMed', 10], ['✔ mediana', 'okMed', 8],
      ['Integra: tomas', 'iN', 8], ['✔ tomas', 'okN', 8], ['Integra: CV %', 'iCv', 8, '0.0'], ['✔ CV', 'okCv', 8]],
      acts.map(function (x) {
        return { id: x.actividad.id, act: x.actividad.nombre, clase: TOP.CLASES[x.actividad.clase].t, iEst: x.estandar, iMed: x.med, iN: x.n, iCv: x.cv };
      }), VERDE);
    verde(wsS, ['n', 'nEval', 'prom', 'med', 'p25', 'p75', 'min', 'max', 'cv', 'est', 'estMmss']);
    acts.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c(TE, key, n); };
      var si = 'IF(' + cond('Tomas', 'actId', k('id')) + '*' + cond('Tomas', 'val', 1) + ',' + rg('Tomas', 'seg') + ')';
      fo(wsS, k('n'), 'COUNTIFS(' + rg('Tomas', 'actId') + ',' + k('id') + ',' + rg('Tomas', 'val') + ',1)', x.n);
      fo(wsS, k('nEval'), 'SUMIFS(' + rg('Tomas', 'pri') + ',' + rg('Tomas', 'actId') + ',' + k('id') + ')', x.nEval);
      fo(wsS, k('prom'), 'AVERAGEIFS(' + rg('Tomas', 'seg') + ',' + rg('Tomas', 'actId') + ',' + k('id') + ',' + rg('Tomas', 'val') + ',1)', x.prom);
      fo(wsS, k('med'), 'MEDIAN(' + si + ')', x.med, true);
      fo(wsS, k('p25'), 'PERCENTILE(' + si + ',0.25)', x.p25, true);
      fo(wsS, k('p75'), 'PERCENTILE(' + si + ',0.75)', x.p75, true);
      fo(wsS, k('min'), 'MIN(' + si + ')', x.min, true);
      fo(wsS, k('max'), 'MAX(' + si + ')', x.max, true);
      fo(wsS, k('cv'), 'IF(' + k('n') + '>1,STDEV(' + si + ')/' + k('prom') + '*100,0)', x.cv, true);
      fo(wsS, k('est'), 'ROUND(' + k('med') + '*(1+' + SUP + '/100),0)', x.estandar);
      fo(wsS, k('estMmss'), k('est') + '/86400');
      fo(wsS, k('okEst'), chk(k('est'), k('iEst'), 0.5)); fo(wsS, k('okMed'), chk(k('med'), k('iMed'), 0.5));
      fo(wsS, k('okN'), chk(k('n'), k('iN'), 0)); fo(wsS, k('okCv'), chk(k('cv'), k('iCv'), 0.1));
    });

    // Distribución de la jornada por evaluación (minutos).
    var DJ = 'Distribución jornada';
    var wsD = hoja(DJ, colsBase.concat([['Inicio jornada', 'jIni', 18, FH], ['Fin jornada', 'jFin', 18, FH], ['Jornada (min)', 'jMin', 11, '0.00'],
      ['Tiempo muerto (min)', 'muerto', 11, '0.00'], ['Productiva (min)', 'productiva', 11, '0.00'], ['Soporte (min)', 'soporte', 11, '0.00'],
      ['Espera (min)', 'espera', 11, '0.00'], ['Personal (min)', 'personal', 11, '0.00'], ['Total medido (min)', 'total', 11, '0.00'], ['% productivo', 'pct', 10, '0.0'],
      ['Integra: total (min)', 'iTot', 11, '0.00'], ['✔ total', 'okTot', 8], ['Integra: % productivo', 'iPct', 10, '0.0'], ['✔ %', 'okPct', 8]]),
      A.jornadas.map(function (jj) {
        var f = base(jj.ev);
        f.jIni = fechaX(jj.ev.jornada_inicio); f.jFin = fechaX(jj.ev.jornada_fin);
        f.iTot = jj.total / 60; f.iPct = jj.total ? jj.tot.productiva / jj.total * 100 : null;
        return f;
      }), VERDE);
    verde(wsD, ['jMin', 'muerto', 'productiva', 'soporte', 'espera', 'personal', 'total', 'pct']);
    A.jornadas.forEach(function (jj, i) {
      var n = i + 2, k = function (key) { return c(DJ, key, n); };
      var suma = function (extra) { return 'SUMIFS(' + rg('Tomas', 'seg') + ',' + rg('Tomas', 'codigo') + ',' + k('codigo') + ',' + rg('Tomas', 'val') + ',1' + extra + ')/60'; };
      fo(wsD, k('jMin'), 'IF(AND(ISNUMBER(' + k('jIni') + '),ISNUMBER(' + k('jFin') + ')),(' + k('jFin') + '-' + k('jIni') + ')*1440,"")');
      fo(wsD, k('muerto'), suma(',' + rg('Tomas', 'actId') + ',' + TOP.ID_MUERTO));
      TOP.ORDEN_CLASES.forEach(function (cl) { fo(wsD, k(cl), suma(',' + rg('Tomas', 'clase') + ',"' + TOP.CLASES[cl].t + '"'), jj.tot[cl] / 60); });
      fo(wsD, k('total'), 'SUM(' + k('productiva') + ',' + k('soporte') + ',' + k('espera') + ',' + k('personal') + ')', jj.total / 60);
      fo(wsD, k('pct'), 'IF(' + k('total') + '>0,' + k('productiva') + '/' + k('total') + '*100,"")');
      fo(wsD, k('okTot'), chk(k('total'), k('iTot'), 0.02)); fo(wsD, k('okPct'), chk(k('pct'), k('iPct'), 0.1));
    });

    // Clases de tiempo (todas las jornadas).
    var CT = 'Clases de tiempo';
    var wsC = hoja(CT, [['Clase', 'clase', 22], ['Suma (min)', 'suma', 11, '0.00'], ['% del tiempo', 'pct', 10, '0.0'], ['Promedio por jornada (min)', 'prom', 12, '0.00'],
      ['Integra: %', 'iPct', 10, '0.0'], ['✔ %', 'okPct', 8], ['Qué significa', 'd', 50]],
      A.clases.map(function (x) { return { clase: TOP.CLASES[x.clase].t, iPct: x.pct, d: TOP.CLASES[x.clase].d }; }), VERDE);
    verde(wsC, ['suma', 'pct', 'prom']);
    A.clases.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c(CT, key, n); };
      fo(wsC, k('suma'), 'SUM(' + rg(DJ, x.clase) + ')', x.suma / 60);
      fo(wsC, k('pct'), 'IF(SUM(' + rg(DJ, 'total') + ')>0,' + k('suma') + '/SUM(' + rg(DJ, 'total') + ')*100,0)', x.pct);
      fo(wsC, k('prom'), 'IF(COUNT(' + rg(DJ, 'total') + ')>0,' + k('suma') + '/COUNT(' + rg(DJ, 'total') + '),0)', x.promJornada / 60);
      fo(wsC, k('okPct'), chk(k('pct'), k('iPct'), 0.1));
    });

    // Cumplimiento por ítem del estándar.
    var ER = 'Estándares (resumen)', ED = 'Estándares (detalle)';
    var wsI = hoja(ER, [['ID ítem', 'id', 7], ['Tipo', 'tipo', 13], ['Presentación', 'pres', 12], ['N°', 'num', 5], ['Ítem', 'txt', 60], ['Cumple', 'C', 8], ['No cumple', 'NC', 9],
      ['No aplica', 'NA', 9], ['% cumplimiento = C / (C + NC)', 'pct', 12, '0.0'], ['Integra: %', 'iPct', 10, '0.0'], ['✔', 'ok', 6], ['Prácticas TOP', 'prac', 60], ['Observaciones', 'obs', 50]],
      A.items.map(function (x) {
        return { id: x.item.id, tipo: x.item.tipo, pres: x.item.presentacion, num: x.item.numero, txt: x.item.descripcion, iPct: x.pct,
          prac: x.practicas.map(function (p) { return p.t + (p.n > 1 ? ' (' + p.n + ')' : ''); }).join(' | '), obs: x.obs.join(' | ') };
      }), VERDE);
    verde(wsI, ['C', 'NC', 'NA', 'pct']);
    A.items.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c(ER, key, n); };
      ['C', 'NC', 'NA'].forEach(function (res) { fo(wsI, k(res), 'COUNTIFS(' + rg(ED, 'itemId') + ',' + k('id') + ',' + rg(ED, 'res') + ',"' + RES[res] + '")', x[res]); });
      fo(wsI, k('pct'), 'IF(' + k('C') + '+' + k('NC') + '>0,' + k('C') + '/(' + k('C') + '+' + k('NC') + ')*100,"")', x.pct);
      fo(wsI, k('ok'), chk(k('pct'), k('iPct'), 0.1));
    });

    // REBA: niveles de riesgo y segmentos.
    var RR = 'REBA (resumen)';
    var segs = A.reba.n ? A.reba.segmentos : [];
    var filasR = TOP.RIESGOS.map(function (rg0, i) { return { a: rg0.t, iVal: A.reba.niveles[i], e: rg0.accion }; })
      .concat(segs.map(function (s) { return { a: 'Segmento: ' + s.t, k: s.k, max: s.max, iVal: s.prom }; }));
    var wsRR = hoja(RR, [['Nivel de riesgo / segmento', 'a', 26], ['Posturas o promedio (Excel)', 'v', 12, '0.00'], ['% de posturas', 'pct', 10, '0.0'],
      ['Máximo posible', 'max', 9], ['En la peor posición', 'nMax', 10], ['Integra', 'iVal', 10, '0.00'], ['✔', 'ok', 6], ['Acción', 'e', 46]], filasR, VERDE);
    verde(wsRR, ['v', 'pct', 'nMax']);
    filasR.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c(RR, key, n); };
      if (x.k) {
        fo(wsRR, k('v'), 'IFERROR(AVERAGE(' + rg('REBA', x.k) + '),"")', x.iVal);
        fo(wsRR, k('nMax'), 'COUNTIF(' + rg('REBA', x.k) + ',' + k('max') + ')');
        fo(wsRR, k('ok'), chk(k('v'), k('iVal'), 0.01));
      } else {
        fo(wsRR, k('v'), 'COUNTIF(' + rg('REBA', 'riesgo') + ',' + k('a') + ')', x.iVal);
        fo(wsRR, k('pct'), 'IF(COUNTA(' + rg('REBA', 'codigo') + ')>0,' + k('v') + '/COUNTA(' + rg('REBA', 'codigo') + ')*100,0)');
        fo(wsRR, k('ok'), chk(k('v'), k('iVal'), 0));
      }
    });

    // Ergonomía: % de respuestas desfavorables por sección.
    var EZ = 'Ergonomía (resumen)', EL = 'Ergonomía (respuestas)';
    var wsEZ = hoja(EZ, [['Sección', 'sec', 32], ['Respuestas Sí/No', 'resp', 10], ['Desfavorables', 'desf', 11], ['% desfavorable', 'pct', 11, '0.0'],
      ['Integra: %', 'iPct', 10, '0.0'], ['✔', 'ok', 6]],
      A.ergo.secciones.map(function (s) { return { sec: s.t, iPct: s.desfav }; }), VERDE);
    verde(wsEZ, ['resp', 'desf', 'pct']);
    A.ergo.secciones.forEach(function (s, i) {
      var n = i + 2, k = function (key) { return c(EZ, key, n); };
      fo(wsEZ, k('resp'), 'COUNTIFS(' + rg(EL, 'sec') + ',' + k('sec') + ',' + rg(EL, 'resp') + ',"SI")+COUNTIFS(' + rg(EL, 'sec') + ',' + k('sec') + ',' + rg(EL, 'resp') + ',"NO")');
      fo(wsEZ, k('desf'), 'SUMIFS(' + rg(EL, 'desf') + ',' + rg(EL, 'sec') + ',' + k('sec') + ')');
      fo(wsEZ, k('pct'), 'IF(' + k('resp') + '>0,' + k('desf') + '/' + k('resp') + '*100,"")', s.desfav);
      fo(wsEZ, k('ok'), chk(k('pct'), k('iPct'), 0.1));
    });

    // Encuesta: factores que quitan tiempo (1º = 3 pts, 2º = 2, 3º = 1; solo los que aceptaron).
    var EF = 'Encuesta (factores)';
    var facs = A.enc ? A.enc.factores : [];
    var wsF = hoja(EF, [['Factor que quita tiempo', 'f', 34], ['1º', 'p1', 6], ['2º', 'p2', 6], ['3º', 'p3', 6], ['Puntos = 3·1º + 2·2º + 1·3º', 'pts', 12],
      ['Menciones', 'men', 10], ['Integra: puntos', 'iPts', 10], ['✔', 'ok', 6]],
      facs.map(function (x) { return { f: x.t, iPts: x.puntos }; }), VERDE);
    verde(wsF, ['p1', 'p2', 'p3', 'pts', 'men']);
    facs.forEach(function (x, i) {
      var n = i + 2, k = function (key) { return c(EF, key, n); };
      [1, 2, 3].forEach(function (p) { fo(wsF, k('p' + p), 'COUNTIFS(' + rg('Encuesta', 'f' + p) + ',' + k('f') + ',' + rg('Encuesta', 'acepto') + ',"Sí")', x.pos[p - 1]); });
      fo(wsF, k('pts'), '3*' + k('p1') + '+2*' + k('p2') + '+' + k('p3'), x.puntos);
      fo(wsF, k('men'), k('p1') + '+' + k('p2') + '+' + k('p3'), x.menciones);
      fo(wsF, k('ok'), chk(k('pts'), k('iPts'), 0));
    });

    /* ============================== KPIs ============================== */
    var cos = {};
    D.evals.forEach(function (e) { cos[e.cosechador] = true; });
    var cerr = D.tiempos.filter(function (t) { return t.duracion_seg !== null && t.duracion_seg >= 0; }).length;
    var claseRow = function (cl) { return TOP.ORDEN_CLASES.indexOf(cl) + 2; };
    var alto = A.reba.n ? (A.reba.niveles[3] + A.reba.niveles[4]) / A.reba.n * 100 : null;
    var kpis = [
      ['Evaluaciones en el filtro', 'COUNTA(' + rg('Evaluaciones', 'codigo') + ')', D.evals.length, 0, 'Filas de la hoja Evaluaciones.', 'Evaluaciones'],
      ['Cosechadores TOP distintos', 'ROUND(SUMPRODUCT((' + rg('Evaluaciones', 'cosechador') + '<>"")/COUNTIF(' + rg('Evaluaciones', 'cosechador') + ',' + rg('Evaluaciones', 'cosechador') + '&"")),0)',
        Object.keys(cos).length, 0, 'Nombres distintos de la hoja Evaluaciones.', 'Evaluaciones'],
      ['Tomas de tiempo registradas', 'COUNTA(' + rg('Tomas', 'codigo') + ')', D.tiempos.length, 0, 'Filas de la hoja Tomas.', 'Tomas'],
      ['Tomas válidas (con fin)', 'SUM(' + rg('Tomas', 'val') + ')', cerr, 0, 'Tomas con duración ≥ 0: son las que entran en la mediana.', 'Tomas'],
      ['Jornadas medidas', 'COUNT(' + rg(DJ, 'total') + ')', A.jornadas.length, 0, 'Evaluaciones con al menos una toma válida.', DJ],
      ['% del tiempo productivo', "'" + CT + "'!$" + L[CT].pct + '$' + claseRow('productiva'), A.clases[0].pct, 0.1, 'Suma de minutos productivos ÷ total medido de todas las jornadas × 100.', CT],
      ['% del tiempo en espera / eliminable', "'" + CT + "'!$" + L[CT].pct + '$' + claseRow('espera'), A.clases[2].pct, 0.1, 'Igual que el anterior para la clase Espera / eliminable.', CT],
      ['Actividades con tiempo estándar', 'COUNT(' + rg(TE, 'est') + ')', acts.length, 0, 'Actividades con al menos una toma válida.', TE],
      ['Actividades cuyo estándar coincide con Integra', 'COUNTIF(' + rg(TE, 'okEst') + ',"✔")', acts.length, 0, 'Estándar = ROUND(mediana × (1 + suplemento %)). Si cambias el suplemento en Parámetros, deja de coincidir.', TE],
      ['Cumplimiento global de estándares %', 'IF(SUM(' + rg(ER, 'C') + ')+SUM(' + rg(ER, 'NC') + ')>0,SUM(' + rg(ER, 'C') + ')/(SUM(' + rg(ER, 'C') + ')+SUM(' + rg(ER, 'NC') + '))*100,"")',
        A.cumplimiento, 0.1, 'Cumple ÷ (Cumple + No cumple) × 100; «No aplica» no cuenta.', ER],
      ['Posturas REBA evaluadas', 'COUNTA(' + rg('REBA', 'codigo') + ')', A.reba.n, 0, 'Filas de la hoja REBA.', 'REBA'],
      ['REBA promedio', 'IFERROR(AVERAGE(' + rg('REBA', 'puntaje_final') + '),"")', A.reba.n ? A.reba.prom.prom : null, 0.01, 'Promedio del puntaje final.', 'REBA'],
      ['REBA máximo', 'IFERROR(MAX(' + rg('REBA', 'puntaje_final') + '),"")', A.reba.n ? A.reba.prom.max : null, 0, 'Mayor puntaje final.', 'REBA'],
      ['% posturas en riesgo alto o muy alto', 'IF(COUNTA(' + rg('REBA', 'codigo') + ')>0,(COUNTIF(' + rg('REBA', 'riesgo') + ',"Alto")+COUNTIF(' + rg('REBA', 'riesgo') + ',"Muy alto"))/COUNTA(' + rg('REBA', 'codigo') + ')*100,"")',
        alto, 0.1, 'Alto (8–10) + Muy alto (11+) ÷ posturas × 100.', RR],
      ['Posturas REBA recalculadas que coinciden', 'COUNTIF(' + rg('REBA', 'ok') + ',"✔")', A.reba.n, 0, 'Excel rehace tablas A, B y C de cada postura (hoja Tablas REBA) y lo compara con lo guardado.', 'REBA'],
      ['Entrevistas ergonómicas', 'ROUND(SUMPRODUCT((' + rg(EL, 'codigo') + '<>"")/COUNTIF(' + rg(EL, 'codigo') + ',' + rg(EL, 'codigo') + '&"")),0)', A.ergo.n, 0,
        'Evaluaciones distintas con respuestas en Ergonomía (respuestas).', EL],
      ['Encuestas aceptadas', 'COUNTIF(' + rg('Encuesta', 'acepto') + ',"Sí")', A.enc ? A.enc.n : 0, 0, 'Encuestas en las que el cosechador aceptó responder.', 'Encuesta']
    ];
    var wsK = hoja('KPIs', [['KPI', 'kpi', 40], ['Valor (fórmula de Excel)', 'v', 14, '0.00'], ['Valor en Integra', 'i', 14, '0.00'], ['¿Coincide?', 'ok', 10],
      ['Cómo se calcula', 'como', 70], ['Hoja de origen', 'hoja', 22]],
      kpis.map(function (x) { return { kpi: x[0], i: x[2], como: x[4], hoja: x[5] }; }), VERDE);
    verde(wsK, ['v', 'ok']);
    kpis.forEach(function (x, i) {
      var n = i + 2;
      fo(wsK, 'B' + n, x[1], x[2]);
      fo(wsK, 'D' + n, chk('B' + n, 'C' + n, x[3]), '✔');
      wsK.getCell('F' + n).value = { text: x[5], hyperlink: "#'" + x[5] + "'!A1" };
      wsK.getCell('F' + n).font = { color: { argb: 'FF0563C1' }, underline: true };
    });
    var nk = kpis.length + 3;
    wsK.getCell('A' + nk).value = 'KPI que coinciden con Integra';
    wsK.getCell('A' + nk).font = { bold: true };
    fo(wsK, 'B' + nk, 'COUNTIF(D2:D' + (kpis.length + 1) + ',"✔")&" de ' + kpis.length + '"');
    wsK.getCell('A' + (nk + 1)).value = 'Verde: calculado por Excel con fórmulas sobre las hojas de datos (toca la celda para ver la fórmula). Filtros y suplemento: hoja Parámetros.';

    // Bordes suaves y ajuste de texto en todo el libro.
    wb.eachSheet(function (ws) {
      ws.eachRow(function (row, n) { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    });
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    REPORTE.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), REPORTE.nombre('xlsx'));
    DR.toast('Excel descargado: los KPI se calculan con fórmulas (hoja KPIs).');
  });
};

/* ------------------------------------------------------------ PDF */
/** jsPDF con Helvetica solo dibuja Latin-1: se cambian los signos que no tiene. */
REPORTE.t = function (s) {
  return String(s === null || s === undefined ? '' : s).replace(/→/g, '->').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');
};
REPORTE.imagen = function (src) {
  return fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
    return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
  }).catch(function () { return null; });
};

/**
 * Última foto subida en el periodo (estándares y REBA). La ruta termina en «-<Date.now()>.jpg»
 * (FOTOS.subirLista): ese número es la hora de subida. Devuelve {ruta, ts, eval, donde} o null.
 */
REPORTE.ultimaFoto = function (D) {
  var mejor = null;
  var ver = function (ruta, evalId, donde) {
    var m = /-(\d{11,})\.jpe?g$/i.exec(ruta || ''), ts = m ? Number(m[1]) : 0;
    if (ruta && (!mejor || ts > mejor.ts)) mejor = { ruta: ruta, ts: ts, eval: evalId, donde: donde };
  };
  D.cump.forEach(function (c) {
    var it = TOP.items.filter(function (x) { return x.id === c.item_id; })[0];
    (c.fotos || []).forEach(function (f) { ver(f, c.evaluacion_id, 'Estándar' + (it ? ': ' + it.descripcion : '')); });
  });
  D.reba.forEach(function (x) { (x.fotos || []).forEach(function (f) { ver(f, x.evaluacion_id, 'Postura REBA'); }); });
  return mejor;
};
/** Descarga la foto del bucket privado y la reduce (lado mayor 1200 px) para el PDF. */
REPORTE.fotoPdf = function (ruta) {
  return sb.storage.from(FOTOS.BUCKET).download(ruta).then(function (r) {
    if (r.error || !r.data) return null;
    return new Promise(function (res) {
      var url = URL.createObjectURL(r.data), img = new Image();
      img.onload = function () {
        var esc = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * esc)); c.height = Math.max(1, Math.round(img.naturalHeight * esc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res({ src: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }).catch(function () { return null; });
};

REPORTE.pdf = function (D, A) {
  var imgs = ['img/reba-cuello.jpg', 'img/reba-tronco.jpg', 'img/reba-piernas.jpg', 'img/reba-antebrazo.jpg', 'img/reba-muneca.jpg', 'img/ergonomia-cuerpo.jpg'];
  var ultima = REPORTE.ultimaFoto(D);
  return Promise.all([REPORTE.lib('../../vendor/jspdf.umd.min.js', 'jspdf.jsPDF'), REPORTE.propuestas(), Promise.all(imgs.map(REPORTE.imagen)),
    ultima ? REPORTE.fotoPdf(ultima.ruta) : null]).then(function (r) {
    var JsPDF = r[0], props = r[1], fig = r[2], ref = r[3], doc = new JsPDF({ unit: 'mm', format: 'a4' }), T = REPORTE.t;
    var W = 210, M = 16, y = 0, pagina = 1;
    var colores = { azul: [0, 151, 206], naranja: [239, 124, 59], verde: [118, 183, 41], gris: [110, 97, 85], texto: [34, 26, 19] };
    var pie = function () {
      doc.setFontSize(8); doc.setTextColor.apply(doc, colores.gris);
      doc.text(T('Integra · Don Ricardo · Ingeniería de Procesos · Estudio de cosechador TOP'), M, 290);
      doc.text(String(pagina), W - M, 290, { align: 'right' });
    };
    var nueva = function () { pie(); doc.addPage(); pagina++; y = 18; };
    var espacio = function (h) { if (y + h > 280) nueva(); };
    var titulo = function (s) {
      espacio(16); y += 4;
      doc.setFillColor.apply(doc, colores.naranja); doc.rect(M, y - 4, 3, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, colores.texto);
      doc.text(T(s), M + 6, y + 0.5); y += 8;
    };
    var parrafo = function (s, tam, color) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(tam || 9.5); doc.setTextColor.apply(doc, color || colores.texto);
      doc.splitTextToSize(T(s), W - 2 * M).forEach(function (l) { espacio(5); doc.text(l, M, y); y += (tam || 9.5) * 0.45; });
      y += 2;
    };
    /** Tabla simple: cols [{t, w, al}] y filas de textos; repite la cabecera al cambiar de página. */
    var tabla = function (cols, filas) {
      var cab = function () {
        doc.setFillColor(241, 234, 226); doc.rect(M, y - 4, W - 2 * M, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, colores.texto);
        var x = M;
        cols.forEach(function (c) { doc.text(T(c.t), c.al === 'r' ? x + c.w - 1.5 : x + 1.5, y, { align: c.al === 'r' ? 'right' : 'left' }); x += c.w; });
        y += 5;
      };
      espacio(14); cab();
      doc.setFont('helvetica', 'normal');
      filas.forEach(function (f) {
        var lineas = cols.map(function (c, i) { return doc.splitTextToSize(T(f[i]), c.w - 3); });
        var alto = Math.max.apply(null, lineas.map(function (l) { return l.length; })) * 3.6 + 1.6;
        if (y + alto > 282) { nueva(); cab(); doc.setFont('helvetica', 'normal'); }
        doc.setFontSize(8); doc.setTextColor.apply(doc, colores.texto);
        var x = M;
        lineas.forEach(function (l, i) { var c = cols[i]; doc.text(l, c.al === 'r' ? x + c.w - 1.5 : x + 1.5, y, { align: c.al === 'r' ? 'right' : 'left' }); x += c.w; });
        y += alto - 1.6;
        doc.setDrawColor(230, 222, 212); doc.line(M, y - 2.2, W - M, y - 2.2);
        y += 1.6;
      });
      y += 3;
    };

    // Portada.
    doc.setFillColor.apply(doc, colores.azul); doc.rect(0, 0, W / 3, 6, 'F');
    doc.setFillColor.apply(doc, colores.naranja); doc.rect(W / 3, 0, W / 3, 6, 'F');
    doc.setFillColor.apply(doc, colores.verde); doc.rect(2 * W / 3, 0, W / 3, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, colores.gris);
    doc.text('INGENIERÍA DE PROCESOS · INGENIERÍA CAMPO', M, 28);
    doc.setFontSize(22); doc.setTextColor.apply(doc, colores.texto);
    doc.text(T('Estudio de cosechador TOP'), M, 42);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal');
    doc.text(T('Sustento técnico para la actualización del estándar de cosecha de arándano'), M, 51);
    var f = D.filtro || {}, cos = {};
    D.evals.forEach(function (e) { cos[e.cosechador] = true; });
    y = 66;
    parrafo('Periodo: ' + (f.desde ? TOP.fecha(f.desde) : 'inicio') + ' al ' + (f.hasta ? TOP.fecha(f.hasta) : TOP.fecha(TOP.hoy())) +
      ' · Estándar: ' + (f.presentacion ? (f.presentacion === 'JARRA' ? 'jarra cosechera' : 'granel') : 'jarra y granel') + (f.material ? ' · Material: ' + TOP.materialTxt(f.material) : '') + ' · Fundo: ' + (f.fundo || 'todos') + '.', 10.5);
    parrafo(Object.keys(cos).length + ' cosechadores TOP · ' + D.evals.length + ' evaluaciones · ' + D.tiempos.length + ' tomas de tiempo · ' +
      D.cump.length + ' verificaciones de estándar · ' + D.reba.length + ' posturas REBA · ' + D.ergo.length + ' entrevistas ergonómicas · ' +
      (D.enc || []).length + ' encuestas de factores de rendimiento.', 10.5);
    parrafo('Emitido el ' + TOP.fecha(TOP.hoy()) + ' por ' + ((AT.perfil && AT.perfil.nombre) || '—') + '.', 9, colores.gris);

    // Imagen de referencia: la última foto subida en las evaluaciones del periodo (centrada, con su proporción).
    if (ref) {
      var ev = REPORTE.evalDe(D, ultima.eval), maxW = W - 2 * M, maxH = 120, k = Math.min(maxW / ref.w, maxH / ref.h);
      var iw = ref.w * k, ih = ref.h * k;
      y += 2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, colores.texto);
      doc.text(T('Imagen de referencia'), M, y); y += 3;
      try {
        doc.addImage(ref.src, 'JPEG', M + (maxW - iw) / 2, y, iw, ih, undefined, 'FAST');
        doc.setDrawColor(230, 222, 212); doc.rect(M + (maxW - iw) / 2, y, iw, ih);
        y += ih + 5;
        parrafo('Última foto subida' + (ultima.ts ? ' (' + TOP.fecha(new Date(ultima.ts - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)) + ')' : '') +
          (ev.cosechador ? ' · ' + ev.cosechador : '') + (ev.codigo ? ' · ' + ev.codigo : '') + ' · ' + ultima.donde + '.', 8, colores.gris);
      } catch (e) { /* imagen no disponible */ }
    }

    titulo('1. Objetivo y metodología');
    parrafo('Actualizar los estándares de cosecha a partir del método del personal TOP, con un sustento medible. A cada cosechador TOP se le observa durante su jornada y se registra:');
    parrafo('a) Tiempo por actividad (inicio y fin con segundos; dentro de una jornada con inicio y fin fijos; las etapas van una tras otra y el lapso entre ellas se registra como tiempo muerto) de las ' + TOP.actividades.length + ' actividades del seguimiento al cosechador, clasificadas en productiva, soporte necesario, espera/eliminable y personal.');
    parrafo('b) Cumplimiento (cumple / no cumple / no aplica) del instructivo, la LUP y el formato de puesto de trabajo de su presentación, anotando cómo lo hace el TOP cuando difiere del estándar.');
    parrafo('c) Evaluación postural REBA (tablas A, B y C) y checklist ergonómico de síntomas, fatiga, carga mental, ritmo y jornada.');
    parrafo('d) Encuesta de factores de rendimiento (1 por cosechador y día): experiencia, método, presentación, tiempo perdido, aprendizaje, trucos y mejoras.');
    parrafo('Tiempo estándar = mediana de las tomas TOP × (1 + suplemento ' + (Number(f.suplemento) || 0) + '%). Se usa la mediana para que una toma atípica no distorsione el estándar.');

    titulo('2. Tiempo estándar por actividad');
    var acts = A.actividades.filter(function (x) { return x.n; });
    if (acts.length) tabla([{ t: 'Actividad', w: 58 }, { t: 'Tomas', w: 13, al: 'r' }, { t: 'Promedio', w: 18, al: 'r' }, { t: 'Mediana', w: 18, al: 'r' },
      { t: 'P25-P75', w: 26, al: 'r' }, { t: 'CV', w: 12, al: 'r' }, { t: 'Estándar', w: 18, al: 'r' }, { t: 'Clase', w: 15 }],
      acts.map(function (x) { return [x.actividad.nombre, x.n, TOP.seg(x.prom), TOP.seg(x.med), TOP.seg(x.p25) + '-' + TOP.seg(x.p75), DR.num(x.cv, 0) + '%', TOP.seg(x.estandar), TOP.CLASES[x.actividad.clase].t.split(' ')[0]]; }));
    else parrafo('Sin tomas de tiempo en el periodo.');

    titulo('3. Distribución de la jornada');
    if (A.jornadas.length) {
      espacio(14);
      var x0 = M;
      A.clases.forEach(function (c) {
        var w = (W - 2 * M) * c.pct / 100, col = TOP.CLASES[c.clase].c;
        doc.setFillColor(parseInt(col.substr(1, 2), 16), parseInt(col.substr(3, 2), 16), parseInt(col.substr(5, 2), 16));
        if (w > 0) doc.rect(x0, y, w, 7, 'F');
        if (c.pct >= 8) { doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(DR.num(c.pct, 0) + '%', x0 + w / 2, y + 4.8, { align: 'center' }); }
        x0 += w;
      });
      y += 12;
      tabla([{ t: 'Clase', w: 50 }, { t: '% del tiempo', w: 26, al: 'r' }, { t: 'Promedio por jornada', w: 36, al: 'r' }, { t: 'Lectura', w: 66 }],
        A.clases.map(function (c) { return [TOP.CLASES[c.clase].t, DR.num(c.pct, 1) + '%', TOP.segTexto(c.promJornada), TOP.CLASES[c.clase].d]; }));
    } else parrafo('Sin jornadas medidas.');

    titulo('4. Cumplimiento de estándares por los TOP');
    if (A.cumplimiento !== null) parrafo('Cumplimiento global de los estándares actuales: ' + DR.num(A.cumplimiento, 0) + '%. Los ítems con menos de 80% indican que los TOP trabajan distinto al estándar.');
    var items = A.items.filter(function (x) { return x.pct !== null || x.practicas.length; }).sort(function (a, b) { return (a.pct === null ? 101 : a.pct) - (b.pct === null ? 101 : b.pct); });
    if (items.length) tabla([{ t: 'Ítem', w: 70 }, { t: 'C/NC/NA', w: 18, al: 'r' }, { t: '%', w: 11, al: 'r' }, { t: 'Cómo lo hacen los TOP', w: 79 }],
      items.map(function (x) {
        return [x.item.presentacion.substring(0, 1) + ' · ' + x.item.tipo + ' ' + (x.item.numero || '') + ': ' + x.item.descripcion, x.C + '/' + x.NC + '/' + x.NA,
          x.pct === null ? '-' : DR.num(x.pct, 0), x.practicas.map(function (p) { return p.t + (p.n > 1 ? ' (x' + p.n + ')' : ''); }).join('; ')];
      }));
    else parrafo('Sin verificaciones de estándar en el periodo.');

    titulo('5. Evaluación ergonómica REBA');
    if (A.reba.n) {
      parrafo(A.reba.n + ' posturas evaluadas. Puntaje final promedio ' + DR.num(A.reba.prom.prom, 1) + ', máximo ' + A.reba.prom.max + '.');
      tabla([{ t: 'Nivel de riesgo', w: 40 }, { t: 'Posturas', w: 22, al: 'r' }, { t: '%', w: 16, al: 'r' }, { t: 'Acción', w: 100 }],
        TOP.RIESGOS.map(function (rg, i) { return [rg.t, A.reba.niveles[i], DR.num(A.reba.niveles[i] / A.reba.n * 100, 0) + '%', rg.accion]; }));
      tabla([{ t: 'Segmento', w: 50 }, { t: 'Promedio', w: 28, al: 'r' }, { t: 'Máximo posible', w: 30, al: 'r' }, { t: 'En la peor posición', w: 70, al: 'r' }],
        A.reba.segmentos.map(function (s) { return [s.t, DR.num(s.prom, 1), s.max, s.nMax]; }));
      if (A.reba.porActividad.length) tabla([{ t: 'Actividad', w: 80 }, { t: 'Posturas', w: 25, al: 'r' }, { t: 'Promedio', w: 25, al: 'r' }, { t: 'Máximo', w: 48, al: 'r' }],
        A.reba.porActividad.map(function (x) { return [x.actividad.nombre, x.n, DR.num(x.est.prom, 1), x.max + ' (' + TOP.RIESGOS[TOP.rebaNivel(x.max)].t + ')']; }));
      // Imágenes de referencia de la hoja REBA (cuello, tronco, piernas, antebrazo, muñeca).
      espacio(52);
      var xi = M;
      fig.slice(0, 5).forEach(function (src) {
        if (!src) return;
        try {
          // Cada figura conserva su proporción dentro de un recuadro de 33 × 40 mm.
          var pr = doc.getImageProperties(src), k = Math.min(33 / pr.width, 40 / pr.height);
          doc.addImage(src, 'JPEG', xi + (33 - pr.width * k) / 2, y + (40 - pr.height * k) / 2, pr.width * k, pr.height * k, undefined, 'FAST');
        } catch (e) { /* imagen no disponible */ }
        xi += 35.6;
      });
      y += 44;
      parrafo('Referencias de postura de la hoja «CHECKLIST REBA»: cuello, tronco, piernas, antebrazo y muñeca.', 8, colores.gris);
    } else parrafo('Sin evaluaciones REBA en el periodo.');

    titulo('6. Checklist ergonómico');
    if (A.ergo.n) {
      parrafo(A.ergo.n + ' entrevistas. Porcentaje de respuestas desfavorables por sección:');
      tabla([{ t: 'Sección', w: 110 }, { t: '% desfavorable', w: 68, al: 'r' }],
        A.ergo.secciones.map(function (s) { return [s.t, s.desfav === null ? '-' : DR.num(s.desfav, 0) + '%']; }));
      var dol = A.ergo.secciones.filter(function (s) { return s.dolor; })[0].items.filter(function (i) { return i.SI; }).sort(function (a, b) { return b.SI - a.SI; });
      if (dol.length) {
        if (fig[5]) { espacio(48); try { doc.addImage(fig[5], 'JPEG', M, y, 60, 44, undefined, 'FAST'); } catch (e) { /* sin imagen */ } y += 48; }
        tabla([{ t: 'Zona con dolor', w: 70 }, { t: 'TOP que lo reportan', w: 40, al: 'r' }, { t: 'Cuándo', w: 68 }],
          dol.map(function (i) {
            return [i.c + ' ' + i.t, i.SI + ' de ' + A.ergo.n, TOP.MOMENTOS.filter(function (m, k) { return i.momentos[k]; }).map(function (m) { return m[1] + ' (' + i.momentos[m[0] - 1] + ')'; }).join(', ')];
          }));
      }
    } else parrafo('Sin entrevistas ergonómicas en el periodo.');

    titulo('7. Encuesta de factores de rendimiento');
    var E = A.enc;
    if (E && E.n) {
      parrafo(E.n + ' cosechadores TOP respondieron' + (E.noAcepto ? ' (' + E.noAcepto + ' no aceptaron)' : '') + '.');
      if (E.factores.length) tabla([{ t: 'Factor que quita tiempo', w: 80 }, { t: '1º', w: 14, al: 'r' }, { t: '2º', w: 14, al: 'r' }, { t: '3º', w: 14, al: 'r' }, { t: 'Puntos', w: 20, al: 'r' }, { t: 'Menciones', w: 36, al: 'r' }],
        E.factores.map(function (x) { return [x.t, x.pos[0], x.pos[1], x.pos[2], x.puntos, x.menciones]; }));
      tabla([{ t: 'Pregunta', w: 60 }, { t: 'Respuestas', w: 118 }], [
        ['Experiencia (campañas)', E.p1.map(function (o) { return o.t + ': ' + o.n; }).join(' · ')],
        ['Hace algo distinto a la capacitación', E.p3.map(function (o) { return o.t + ': ' + o.n; }).join(' · ')],
        ['Presentación donde rinde más', E.p4.map(function (o) { return o.t + ': ' + o.n; }).join(' · ')],
        ['Cómo aprendió', E.p8.map(function (o) { return o.t + ': ' + o.n; }).join(' · ')]]);
      var voces = function (t, l) { if (l.length) tabla([{ t: t, w: 130 }, { t: 'Cosechador', w: 48 }], l.map(function (x) { return [x.t, x.quien]; })); };
      voces('Trucos para cosechar más rápido cuidando la fruta', E.trucos);
      voces('Qué hacen distinto a lo enseñado', E.distinto);
      voces('Qué cambiarían del puesto, herramienta o instructivo', E.mejoras);
    } else parrafo('Sin encuestas en el periodo.');

    titulo('8. Propuesta de actualización del estándar');
    var vigentes = props.filter(function (p) { return p.estado !== 'descartada'; });
    if (vigentes.length) {
      parrafo('Aprobadas: ' + vigentes.filter(function (p) { return p.estado === 'aprobada'; }).length + ' · En borrador: ' + vigentes.filter(function (p) { return p.estado === 'borrador'; }).length + '.');
      tabla([{ t: 'Cambio', w: 26 }, { t: 'Actual', w: 44 }, { t: 'Propuesto', w: 50 }, { t: 'Sustento', w: 58 }],
        vigentes.map(function (p) {
          return [PROP.TIPOS[p.tipo][0] + '\n' + PROP.ESTADOS[p.estado][0] + (p.presentacion ? '\n' + p.presentacion : ''),
            p.texto_actual || (p.actividad_id ? TOP.actividad(p.actividad_id).nombre : ''),
            (p.texto_propuesto || '') + (p.tiempo_estandar_seg !== null ? '\nTiempo estándar: ' + TOP.seg(p.tiempo_estandar_seg) : ''), p.sustento || ''];
        }));
    } else parrafo('Aún no hay propuestas registradas. Revisa la pestaña Propuesta del módulo.');
    pie();
    REPORTE.descargar(doc.output('blob'), REPORTE.nombre('pdf'));
    DR.toast('Informe PDF descargado.');
  });
};
