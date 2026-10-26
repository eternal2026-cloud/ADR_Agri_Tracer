/* ============================================================================
 * reporte.js — EXPORTABLES DEL ESTUDIO TOP
 * Excel (ExcelJS): resumen, tiempos estándar, tomas, estándares, REBA,
 * ergonomía y propuesta, con los datos crudos para Power BI.
 * PDF (jsPDF): informe técnico de sustento con las imágenes REBA de la hoja.
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
REPORTE.excel = function (D, A) {
  return Promise.all([REPORTE.lib('../../vendor/exceljs.min.js', 'ExcelJS'), REPORTE.propuestas()]).then(function (r) {
    var ExcelJS = r[0], props = r[1], wb = new ExcelJS.Workbook();
    wb.creator = 'Integra · Don Ricardo';
    var hoja = function (nombre, cols, filas) {
      var ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2] || 16 }; });
      filas.forEach(function (f) { ws.addRow(f); });
      var cab = ws.getRow(1);
      cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0097CE' } };
      cab.alignment = { vertical: 'middle', wrapText: true };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      return ws;
    };
    var base = function (e) { return { codigo: e.codigo, fecha: e.fecha, cosechador: e.cosechador, dni: e.dni, fundo: e.fundo, lote: e.lote, material: e.material, presentacion: e.presentacion, variedad: e.variedad, lider: e.lider }; };
    var colsBase = [['Código', 'codigo', 11], ['Fecha', 'fecha', 11], ['Cosechador', 'cosechador', 28], ['DNI', 'dni', 11], ['Fundo', 'fundo', 14], ['Lote', 'lote', 9],
      ['Material', 'material', 14], ['Estándar', 'presentacion', 10], ['Variedad', 'variedad', 11], ['Líder', 'lider', 22]];
    var minutos = function (s) { return s === null || s === undefined ? null : Math.round(s / 60 * 100) / 100; };

    hoja('Tiempo estándar', [['Actividad', 'act', 40], ['Clase', 'clase', 18], ['Tomas', 'n', 8], ['TOP evaluados', 'nEval', 10], ['Promedio (min)', 'prom', 12],
      ['Mediana (min)', 'med', 12], ['P25 (min)', 'p25', 10], ['P75 (min)', 'p75', 10], ['Mín (min)', 'min', 10], ['Máx (min)', 'max', 10], ['CV %', 'cv', 8],
      ['Estándar (min)', 'est', 12], ['Estándar (m:ss)', 'estTxt', 12]],
      A.actividades.filter(function (x) { return x.n; }).map(function (x) {
        return { act: x.actividad.nombre, clase: TOP.CLASES[x.actividad.clase].t, n: x.n, nEval: x.nEval, prom: minutos(x.prom), med: minutos(x.med), p25: minutos(x.p25),
          p75: minutos(x.p75), min: minutos(x.min), max: minutos(x.max), cv: Math.round(x.cv), est: minutos(x.estandar), estTxt: TOP.seg(x.estandar) };
      }));
    hoja('Distribución jornada', colsBase.concat([['Productiva (min)', 'productiva', 14], ['Soporte (min)', 'soporte', 12], ['Espera (min)', 'espera', 12],
      ['Personal (min)', 'personal', 12], ['Total medido (min)', 'total', 14], ['% productivo', 'pct', 11]]),
      A.jornadas.map(function (j) {
        var f = base(j.ev);
        TOP.ORDEN_CLASES.forEach(function (c) { f[c] = minutos(j.tot[c]); });
        f.total = minutos(j.total); f.pct = Math.round(j.tot.productiva / j.total * 1000) / 10;
        return f;
      }));
    hoja('Tomas', colsBase.concat([['Actividad', 'act', 36], ['Clase', 'clase', 16], ['Inicio', 'ini', 20], ['Fin', 'fin', 20], ['Duración (s)', 'seg', 11], ['Duración (m:ss)', 'mmss', 12], ['Nota', 'nota', 30]]),
      D.tiempos.slice().sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; }).map(function (t) {
        var f = base(REPORTE.evalDe(D, t.evaluacion_id)), a = TOP.actividad(t.actividad_id);
        f.act = a.nombre; f.clase = TOP.CLASES[a.clase].t; f.ini = TOP.aLocal(t.inicio).replace('T', ' '); f.fin = TOP.aLocal(t.fin).replace('T', ' ');
        f.seg = t.duracion_seg; f.mmss = TOP.seg(t.duracion_seg); f.nota = t.nota;
        return f;
      }));
    hoja('Estándares (resumen)', [['Tipo', 'tipo', 13], ['Presentación', 'pres', 12], ['N°', 'num', 5], ['Ítem', 'txt', 60], ['Cumple', 'C', 8], ['No cumple', 'NC', 9], ['No aplica', 'NA', 9],
      ['% cumplimiento', 'pct', 12], ['Prácticas TOP', 'prac', 60], ['Observaciones', 'obs', 50]],
      A.items.map(function (x) {
        return { tipo: x.item.tipo, pres: x.item.presentacion, num: x.item.numero, txt: x.item.descripcion, C: x.C, NC: x.NC, NA: x.NA,
          pct: x.pct === null ? null : Math.round(x.pct), prac: x.practicas.map(function (p) { return p.t + (p.n > 1 ? ' (' + p.n + ')' : ''); }).join(' | '), obs: x.obs.join(' | ') };
      }));
    hoja('Estándares (detalle)', colsBase.concat([['Tipo', 'tipo', 13], ['Ítem', 'txt', 55], ['Resultado', 'res', 11], ['Cómo lo hace el TOP', 'prac', 45], ['Observación', 'obs', 40], ['Fotos', 'fotos', 8]]),
      D.cump.map(function (c) {
        var f = base(REPORTE.evalDe(D, c.evaluacion_id)), it = TOP.item(c.item_id) || {};
        f.tipo = it.tipo; f.txt = it.descripcion; f.res = { C: 'Cumple', NC: 'No cumple', NA: 'No aplica' }[c.resultado] || ''; f.prac = c.practica_top; f.obs = c.observacion; f.fotos = (c.fotos || []).length;
        return f;
      }));
    hoja('REBA', colsBase.concat([['Actividad', 'act', 30], ['Momento', 'momento', 24], ['Cuello', 'cuello', 7], ['Cuello +1', 'cuello_mod', 8], ['Tronco', 'tronco', 7], ['Tronco +1', 'tronco_mod', 8],
      ['Piernas', 'piernas', 8], ['Piernas +', 'piernas_mod', 8], ['Carga', 'carga', 7], ['Brusca +1', 'carga_brusca', 8], ['Brazo', 'brazo', 7], ['Hombro +1', 'brazo_elevado', 9],
      ['Apoyo −1', 'brazo_apoyo', 8], ['Antebrazo', 'antebrazo', 9], ['Muñeca', 'muneca', 8], ['Muñeca +1', 'muneca_mod', 9], ['Agarre', 'agarre', 7],
      ['Estática', 'act_estatica', 8], ['Repetitiva', 'act_repetitiva', 9], ['Inestable', 'act_inestable', 9], ['Tabla A', 'tabla_a', 7], ['Puntaje A', 'puntaje_a', 8],
      ['Tabla B', 'tabla_b', 7], ['Puntaje B', 'puntaje_b', 8], ['Puntaje C', 'puntaje_c', 8], ['REBA final', 'puntaje_final', 9], ['Riesgo', 'riesgo', 12], ['Observación', 'observacion', 30]]),
      D.reba.map(function (x) {
        var f = base(REPORTE.evalDe(D, x.evaluacion_id)), si = function (v) { return v ? 'Sí' : ''; };
        f.act = x.actividad_id ? TOP.actividad(x.actividad_id).nombre : ''; f.momento = x.momento;
        ['cuello', 'tronco', 'piernas', 'piernas_mod', 'carga', 'brazo', 'antebrazo', 'muneca', 'agarre', 'tabla_a', 'puntaje_a', 'tabla_b', 'puntaje_b', 'puntaje_c', 'puntaje_final', 'riesgo', 'observacion']
          .forEach(function (k) { f[k] = x[k]; });
        ['cuello_mod', 'tronco_mod', 'carga_brusca', 'brazo_elevado', 'brazo_apoyo', 'muneca_mod', 'act_estatica', 'act_repetitiva', 'act_inestable'].forEach(function (k) { f[k] = si(x[k]); });
        return f;
      }));
    var preguntas = TOP.ERGO.reduce(function (l, s) { return l.concat(s.items); }, []);
    hoja('Ergonomía', colsBase.concat(preguntas.map(function (p) { return [p[0] + ' ' + p[1], 'q' + p[0], 10]; }))
      .concat(TOP.ERGO.filter(function (s) { return s.dolor; })[0].items.map(function (p) { return ['Momento dolor ' + p[0], 'm' + p[0], 12]; })),
      D.ergo.map(function (g) {
        var f = base(REPORTE.evalDe(D, g.evaluacion_id));
        preguntas.forEach(function (p) { f['q' + p[0]] = { SI: 'Sí', NO: 'No', NS: 'NS/NC' }[(g.respuestas || {})[p[0]]] || ''; });
        Object.keys(g.dolor || {}).forEach(function (k) {
          f['m' + k] = (g.dolor[k] || []).map(function (m) { return (TOP.MOMENTOS[m - 1] || [])[1]; }).join(', ');
        });
        return f;
      }));
    var encRes = function (x, k) { return ENC.etiqueta(k, (x.respuestas || {})[k]); };
    hoja('Encuesta', colsBase.concat([['Aceptó', 'acepto', 8], ['Presentaciones', 'pres', 12], ['Momento', 'momento', 14],
      ['1 Campañas', 'p1', 16], ['2 Cómo trabaja la planta', 'p2', 40], ['3 Distinto a capacitación', 'p3', 12], ['3 ¿En qué?', 'p3_que', 36],
      ['4 Rinde más en', 'p4', 16], ['5 Granel', 'p5_granel', 32], ['5 Jarra', 'p5_jarra', 32], ['6 Tiempo perdido 1º', 'f1', 22],
      ['6 2º', 'f2', 22], ['6 3º', 'f3', 22], ['6 Otro', 'p6_otro', 20], ['7 Cómo lo resuelve', 'p7', 36], ['8 Cómo aprendió', 'p8', 20],
      ['9 Truco', 'p9', 40], ['10 Qué cambiaría', 'p10', 40], ['Observaciones', 'obs', 30]]),
      (D.enc || []).map(function (x) {
        var f = base(REPORTE.evalDe(D, x.evaluacion_id)), r = x.respuestas || {}, p6 = r.p6 || [];
        f.acepto = x.acepto ? 'Sí' : 'No';
        f.pres = encRes(x, 'presentaciones'); f.momento = r.momento === 'OTRO' ? (r.momento_otro || 'Otro') : encRes(x, 'momento');
        ['p1', 'p3', 'p4', 'p8'].forEach(function (k) { f[k] = encRes(x, k); });
        ['p2', 'p3_que', 'p5_granel', 'p5_jarra', 'p6_otro', 'p7', 'p9', 'p10', 'obs'].forEach(function (k) { f[k] = r[k] || ''; });
        [0, 1, 2].forEach(function (i) { f['f' + (i + 1)] = p6[i] ? ENC.etiqueta('p6', p6[i]) : ''; });
        return f;
      }));
    hoja('Propuesta', [['N°', 'id', 6], ['Estado', 'estado', 11], ['Ámbito', 'ambito', 18], ['Tipo', 'tipo', 14], ['Presentación', 'pres', 12], ['Actual', 'actual', 50],
      ['Propuesto', 'prop', 50], ['Tiempo estándar', 'tiempo', 12], ['Sustento', 'sust', 70]],
      props.map(function (p) {
        return { id: p.id, estado: PROP.ESTADOS[p.estado][0], ambito: PROP.AMBITOS[p.ambito], tipo: PROP.TIPOS[p.tipo][0], pres: p.presentacion || 'Ambas',
          actual: p.texto_actual || (p.actividad_id ? TOP.actividad(p.actividad_id).nombre : ''), prop: p.texto_propuesto,
          tiempo: p.tiempo_estandar_seg !== null ? TOP.seg(p.tiempo_estandar_seg) : '', sust: p.sustento };
      }));
    wb.eachSheet(function (ws) { ws.eachRow(function (row, n) { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; }); });
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    REPORTE.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), REPORTE.nombre('xlsx'));
    DR.toast('Excel descargado.');
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

REPORTE.pdf = function (D, A) {
  var imgs = ['img/reba-cuello.jpg', 'img/reba-tronco.jpg', 'img/reba-piernas.jpg', 'img/reba-antebrazo.jpg', 'img/reba-muneca.jpg', 'img/ergonomia-cuerpo.jpg'];
  return Promise.all([REPORTE.lib('../../vendor/jspdf.umd.min.js', 'jspdf.jsPDF'), REPORTE.propuestas(), Promise.all(imgs.map(REPORTE.imagen))]).then(function (r) {
    var JsPDF = r[0], props = r[1], fig = r[2], doc = new JsPDF({ unit: 'mm', format: 'a4' }), T = REPORTE.t;
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

    titulo('1. Objetivo y metodología');
    parrafo('Actualizar los estándares de cosecha a partir del método del personal TOP, con un sustento medible. A cada cosechador TOP se le observa durante su jornada y se registra:');
    parrafo('a) Tiempo por actividad aislada (inicio y fin con segundos) de las ' + TOP.actividades.length + ' actividades del seguimiento al cosechador, clasificadas en productiva, soporte necesario, espera/eliminable y personal.');
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
