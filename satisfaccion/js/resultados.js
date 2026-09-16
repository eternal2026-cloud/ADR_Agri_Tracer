/* ============================================================================
 * resultados.js — PESTAÑA «RESULTADOS»
 * Filtros: cultivo (o todos), campaña, rango de fechas y área evaluada.
 * Por área evaluada: puntaje ponderado (promedio por encuesta), matriz de
 * evaluaciones por planta y grupo evaluador (como la presentación), radar
 * consolidado, detalle por planta con sugerencias, encuestas e histórico.
 * Descargas: BD para Power BI (.xlsx) y presentación (.pptx).
 * ==========================================================================*/
var RSCI = { area: null, campana: '', desde: '', hasta: '', filas: [] };

VISTAS.resultados = function (cont) {
  SCI.resultados(SCI.cultivoFiltro()).then(function (filas) {
    RSCI.filas = filas || [];
    RSCI.pintar(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

/** Filas que cumplen campaña y fechas (sin filtrar el área). */
RSCI.filtradas = function () {
  return RSCI.filas.filter(function (f) {
    return (!RSCI.campana || f.campana === RSCI.campana) &&
      (!RSCI.desde || f.fecha >= RSCI.desde) && (!RSCI.hasta || f.fecha <= RSCI.hasta);
  });
};

/** Grupos evaluadores de un conjunto de encuestas, con su consolidado. */
RSCI.grupos = function (filas) {
  return SCI.agrupar(filas, function (f) { return f.grupo; }).map(function (g) {
    var c = SCI.consolidar(g.filas);
    return { grupo: g.clave, planta: g.filas[0].planta || '', filas: g.filas, n: c.n, total: c.total, criterios: c.criterios };
  }).sort(SCI.ordenGrupos);
};

RSCI.pintar = function (cont) {
  var cul = SCI.cultivo(SCI.cultivoFiltro());
  var base = RSCI.filtradas();
  var campanas = [];
  RSCI.filas.forEach(function (f) { if (campanas.indexOf(f.campana) < 0) campanas.push(f.campana); });
  campanas.sort().reverse();
  if (RSCI.campana && campanas.indexOf(RSCI.campana) < 0) RSCI.campana = '';

  var porArea = SCI.agrupar(base, function (f) { return f.area_evaluada_id; }).map(function (g) {
    var c = SCI.consolidar(g.filas), a = SCI.area(g.clave);
    return { id: Number(g.clave), nombre: g.filas[0].area_evaluada, orden: a ? a.orden : 99, filas: g.filas, n: c.n, total: c.total, criterios: c.criterios };
  }).sort(function (a, b) { return a.orden - b.orden || (a.nombre < b.nombre ? -1 : 1); });
  if (!porArea.some(function (a) { return a.id === RSCI.area; })) RSCI.area = porArea.length ? porArea[0].id : null;
  var area = porArea.filter(function (a) { return a.id === RSCI.area; })[0];

  var filtros = '<section class="panel entra"><div class="form">' +
    '<div class="campo"><label for="fCampana">Campaña</label><select id="fCampana"><option value="">Todas</option>' +
      campanas.map(function (c) { return '<option' + (c === RSCI.campana ? ' selected' : '') + '>' + DR.esc(c) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo"><label for="fDesde">Desde</label><input id="fDesde" type="date" value="' + DR.esc(RSCI.desde) + '"></div>' +
    '<div class="campo"><label for="fHasta">Hasta</label><input id="fHasta" type="date" value="' + DR.esc(RSCI.hasta) + '"></div>' +
    '<div class="campo"><label for="fArea">Área evaluada</label><select id="fArea">' +
      (porArea.length ? porArea.map(function (a) { return '<option value="' + a.id + '"' + (a.id === RSCI.area ? ' selected' : '') + '>' + DR.esc(a.nombre) + ' (' + a.n + ')</option>'; }).join('') : '<option value="">Sin datos</option>') +
    '</select></div></div>' +
    '<div class="acciones">' +
      '<button type="button" class="btn azul" id="btnPptx"' + (area ? '' : ' disabled') + '>Descargar presentación (.pptx)</button>' +
      '<button type="button" class="btn sec" id="btnBD"' + (RSCI.filas.length ? '' : ' disabled') + '>Descargar BD para Power BI (.xlsx)</button>' +
    '</div></section>';

  var h = UI.encabezado('Cliente interno', 'Satisfacción del cliente interno',
    'Puntaje ponderado = promedio de las encuestas del área evaluada. Cada ítem vale de 4 % a 10 %; 10 ítems «Totalmente de acuerdo» = 100 %.') +
    SCI.selectorCultivoHtml(true) + filtros;

  if (!base.length) {
    h += UI.panel('Sin encuestas', '', '<div class="vacio">No hay encuestas para este filtro' + (cul ? ' en ' + DR.esc(cul.nombre) : '') + '.</div>' +
      (AT.puedeCapturar() ? '<div class="acciones"><button type="button" class="btn verde" onclick="DR.ir(\'cargar\')">' + DR.ICONOS.subir + 'Cargar histórico</button>' +
        '<button type="button" class="btn sec" onclick="DR.ir(\'encuesta\')">Registrar encuesta</button></div>' : ''));
  } else {
    h += RSCI.areaHtml(area) + UI.panel('Resumen por área evaluada', 'Mismo filtro de cultivo, campaña y fechas.', RSCI.resumenAreasHtml(porArea)) +
      UI.panel('Histórico por campaña', 'Puntaje ponderado de cada área evaluada en cada campaña (sin filtro de campaña ni fechas).', RSCI.historicoHtml());
  }
  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');

  var recargar = function () { cont.innerHTML = '<div class="vacio">Cargando resultados…</div>'; VISTAS.resultados(cont); };
  SCI.enlazarSelectorCultivo(cont, recargar);
  DR.$('#fCampana').onchange = function () { RSCI.campana = this.value; RSCI.pintar(cont); };
  DR.$('#fDesde').onchange = function () { RSCI.desde = this.value; RSCI.pintar(cont); };
  DR.$('#fHasta').onchange = function () { RSCI.hasta = this.value; RSCI.pintar(cont); };
  DR.$('#fArea').onchange = function () { RSCI.area = Number(this.value) || null; RSCI.pintar(cont); };
  DR.$('#btnBD').onclick = RSCI.descargarBD;
  DR.$('#btnPptx').onclick = function () {
    if (!area) return;
    var btn = this;
    btn.disabled = true;
    btn.classList.add('cargando');
    PPT.generar(RSCI.contexto(area)).then(function () {
      DR.toast('Presentación descargada.');
    }).catch(function (e) { DR.toast(e.message, 'error'); }).then(function () {
      btn.disabled = false;
      btn.classList.remove('cargando');
    });
  };
  DR.$$('[data-ir-area]', cont).forEach(function (el) {
    el.onclick = function () { RSCI.area = Number(this.getAttribute('data-ir-area')); RSCI.pintar(cont); DR.$('#contenido').scrollTop = 0; };
  });
  DR.$$('[data-anular]', cont).forEach(function (el) {
    el.onclick = function () {
      var motivo = window.prompt('Motivo para anular la encuesta ' + this.getAttribute('data-codigo') + ':', 'Encuesta duplicada');
      if (motivo === null) return;
      SCI.accion(this, 'rpc_sci_anular_encuesta', { p_encuesta: this.getAttribute('data-anular'), p_motivo: motivo }, 'Encuesta anulada.')
        .then(recargar).catch(function () { /* ya avisó */ });
    };
  });
};

/** Datos que usa la presentación (misma lógica que la pantalla). */
RSCI.contexto = function (area) {
  var cul = SCI.cultivo(SCI.cultivoFiltro());
  var fechas = area.filas.map(function (f) { return f.fecha; }).sort();
  return {
    area: area.nombre, cultivo: cul ? cul.nombre : 'Todos los cultivos', campana: RSCI.campana,
    desde: fechas[0], hasta: fechas[fechas.length - 1], filas: area.filas,
    consolidado: SCI.consolidar(area.filas), grupos: RSCI.grupos(area.filas)
  };
};

RSCI.areaHtml = function (area) {
  var grupos = RSCI.grupos(area.filas);
  var peor = null;
  SCI.CRITERIOS.forEach(function (c) { if (area.criterios[c.id] !== null && (!peor || area.criterios[c.id] < area.criterios[peor.id])) peor = c; });

  var kpis = '<div class="kpis entra">' +
    UI.kpi('Puntaje ponderado', SCI.pct(area.total), DR.esc(area.nombre), SCI.colorPct(area.total)) +
    UI.kpi('Encuestas', area.n, grupos.length + ' grupo(s) evaluador(es)', '#0097CE') +
    UI.kpi('Criterio más bajo', peor ? SCI.pct(area.criterios[peor.id]) : '—', peor ? DR.esc(peor.t) : '', '#EF7C3B') +
    UI.kpi('Periodo', DR.esc(SCI.fecha(area.filas.map(function (f) { return f.fecha; }).sort()[0])),
      'al ' + DR.esc(SCI.fecha(area.filas.map(function (f) { return f.fecha; }).sort().pop())), '#B7A99C') +
    '</div>';

  var consolidado = '<div class="sci-resumen">' +
    '<div class="sci-radar-caja"><div class="sci-caja-tit">Evaluación criterio</div>' +
      SCI.radarSvg([{ nombre: area.nombre, color: '#B7A99C', criterios: area.criterios }]) + '</div>' +
    '<div>' + RSCI.barrasHtml(area.criterios) + RSCI.sugerenciasHtml(area.filas) + '</div></div>';

  return kpis +
    UI.panel('Matriz de evaluaciones', 'Resultado por grupo evaluador; varias encuestas del mismo grupo se promedian.', RSCI.matrizHtml(area, grupos)) +
    UI.panel('Resultado consolidado · ' + area.nombre, 'Promedio de las ' + area.n + ' encuesta(s).', consolidado) +
    RSCI.porPlantaHtml(grupos) +
    UI.panel('Encuestas de ' + area.nombre, area.n + ' registro(s).', RSCI.encuestasHtml(area.filas));
};

RSCI.barrasHtml = function (criterios) {
  return '<div class="sci-barras">' + SCI.CRITERIOS.map(function (c) {
    var v = criterios[c.id];
    return '<div class="barra-fila"><div>' + DR.esc(c.t) + '</div><div class="barra-pista"><div class="barra-valor" style="width:' + (v || 0) +
      '%;background:' + SCI.colorPct(v) + '"></div></div><div class="barra-cifra">' + SCI.pct(v) + '</div></div>';
  }).join('') + '</div>';
};

RSCI.sugerenciasHtml = function (filas) {
  var cols = [['aspectos_valorados', 'Aspectos valorados'], ['aspectos_mejorar', 'Aspectos por mejorar'], ['recomendaciones', 'Recomendaciones']];
  var listas = cols.map(function (c) { return SCI.unirTextos(filas, c[0]); });
  if (!listas.some(function (l) { return l.length; })) return '<div class="nota-vacia" style="margin-top:10px">Sin sugerencias registradas.</div>';
  return '<div class="tabla-cont"><table class="sci-sug"><thead><tr>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody><tr>' +
    listas.map(function (l) { return '<td>' + (l.length ? l.map(function (t) { return '<p>' + DR.esc(t) + '</p>'; }).join('') : '—') + '</td>'; }).join('') +
    '</tr></tbody></table></div>';
};

RSCI.matrizHtml = function (area, grupos) {
  var plantas = SCI.agrupar(grupos, function (g) { return g.planta; });
  var fila1 = '<tr><th rowspan="2">Área evaluada</th>' + plantas.map(function (p) {
    return '<th colspan="' + p.filas.length + '" class="sci-planta">' + DR.esc(p.clave || 'Sin planta') + '</th>';
  }).join('') + '<th rowspan="2" class="num">Ponderado</th></tr>';
  var fila2 = '<tr>' + grupos.map(function (g) { return '<th class="num">' + DR.esc(g.grupo) + (g.n > 1 ? ' <small>(' + g.n + ')</small>' : '') + '</th>'; }).join('') + '</tr>';
  return '<div class="tabla-cont"><table class="sci-matriz"><thead>' + fila1 + fila2 + '</thead><tbody><tr><td><b>' + DR.esc(area.nombre) + '</b></td>' +
    grupos.map(function (g) { return '<td class="num">' + SCI.pillPct(g.total) + '</td>'; }).join('') +
    '<td class="num"><b>' + SCI.pct(area.total) + '</b></td></tr></tbody></table></div>';
};

RSCI.porPlantaHtml = function (grupos) {
  return SCI.agrupar(grupos, function (g) { return g.planta; }).map(function (p) {
    var titulo = p.clave ? 'Planta ' + p.clave : 'Grupos sin planta';
    var tarjetas = p.filas.map(function (g) {
      return '<article class="sci-grupo">' +
        '<div class="sci-grupo-cab"><b>' + DR.esc(g.grupo) + '</b>' + SCI.pillPct(g.total) + '</div>' +
        '<div class="sci-caja-tit">Evaluación criterio' + (g.n > 1 ? ' · ' + g.n + ' encuestas' : '') + '</div>' +
        SCI.radarSvg([{ nombre: g.grupo, color: '#B7A99C', criterios: g.criterios }], { ancho: 330, alto: 270 }) +
        RSCI.sugerenciasHtml(g.filas) + '</article>';
    }).join('');
    return UI.panel(titulo, p.filas.length + ' grupo(s) evaluador(es).', '<div class="sci-grupos">' + tarjetas + '</div>');
  }).join('');
};

RSCI.encuestasHtml = function (filas) {
  return UI.tabla([
    { t: 'Código', k: 'codigo' },
    { t: 'Fecha', r: function (f) { return DR.esc(SCI.fecha(f.fecha)); } },
    { t: 'Cultivo', k: 'cultivo' },
    { t: 'Campaña', k: 'campana' },
    { t: 'Grupo evaluador', r: function (f) { return '<b>' + DR.esc(f.grupo) + '</b>'; } },
    { t: 'Cargo', k: 'cargo' }
  ].concat(SCI.CRITERIOS.map(function (c) {
    var k = ['p_atencion', 'p_tiempo', 'p_comunicacion', 'p_calidad'][c.id - 1];
    return { t: c.t, num: true, r: function (f) { return SCI.pct(SCI.num(f[k])); } };
  })).concat([
    { t: 'Resultado', num: true, r: function (f) { return SCI.pillPct(SCI.num(f.resultado)); } },
    { t: 'Origen', r: function (f) { return f.origen === 'app' ? UI.pill('App', { App: 'verde' }) : '<span title="' + DR.esc(f.archivo || '') + '">' + UI.pill('Excel', { Excel: 'azul' }) + '</span>'; } }
  ]).concat(AT.esAdmin() ? [{ t: '', r: function (f) {
    return '<button type="button" class="btn-peligro" data-anular="' + f.id + '" data-codigo="' + DR.esc(f.codigo) + '">Anular</button>';
  } }] : []), filas.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }));
};

RSCI.resumenAreasHtml = function (porArea) {
  return '<div class="tabla-cont"><table><thead><tr><th>Área evaluada</th><th class="num">Encuestas</th>' +
    SCI.CRITERIOS.map(function (c) { return '<th class="num">' + DR.esc(c.t) + '</th>'; }).join('') +
    '<th class="num">Ponderado</th></tr></thead><tbody>' + porArea.map(function (a) {
      return '<tr class="clicable' + (a.id === RSCI.area ? ' sci-activa' : '') + '" data-ir-area="' + a.id + '"><td><b>' + DR.esc(a.nombre) + '</b></td><td class="num">' + a.n + '</td>' +
        SCI.CRITERIOS.map(function (c) { return '<td class="num">' + SCI.pct(a.criterios[c.id]) + '</td>'; }).join('') +
        '<td class="num">' + SCI.pillPct(a.total) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
};

RSCI.historicoHtml = function () {
  var campanas = [];
  RSCI.filas.forEach(function (f) { if (campanas.indexOf(f.campana) < 0) campanas.push(f.campana); });
  campanas.sort();
  var areas = SCI.agrupar(RSCI.filas, function (f) { return f.area_evaluada; });
  areas.sort(function (a, b) { return a.clave < b.clave ? -1 : 1; });
  return '<div class="tabla-cont"><table><thead><tr><th>Área evaluada</th>' +
    campanas.map(function (c) { return '<th class="num">' + DR.esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    areas.map(function (a) {
      return '<tr><td>' + DR.esc(a.clave) + '</td>' + campanas.map(function (c) {
        var fs = a.filas.filter(function (f) { return f.campana === c; });
        return '<td class="num">' + (fs.length ? SCI.pillPct(SCI.consolidar(fs).total) + ' <small>(' + fs.length + ')</small>' : '—') + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
};

/* ============================================================ BD PARA POWER BI */
RSCI.COLUMNAS_BD = [
  ['Semana', 'semana', 9], ['Campaña', 'campana', 18], ['Cultivo', 'cultivo', 11], ['Planta', 'planta', 9], ['Fecha', 'fecha', 12],
  ['Área evaluada', 'area_evaluada', 22], ['Área evaluadora', 'area_evaluadora', 20], ['Sub área', 'sub_area', 12],
  ['Grupo evaluador', 'grupo_evaluador', 24], ['Cargo', 'cargo', 13], ['Items', 'item', 8], ['Pregunta', 'pregunta', 60],
  ['Criterio', 'criterio', 20], ['Respuesta', 'respuesta', 24], ['Puntaje ítem', 'puntaje_item', 12],
  ['Resultado encuesta', 'resultado_encuesta', 12], ['Código', 'codigo', 12], ['Origen', 'origen', 9],
  ['Aspectos valorados', 'aspectos_valorados', 40], ['Aspectos por mejorar', 'aspectos_mejorar', 40], ['Recomendaciones', 'recomendaciones', 40]
];

RSCI.descargarBD = function () {
  var btn = this, cultivoId = SCI.cultivoFiltro(), cul = SCI.cultivo(cultivoId);
  btn.disabled = true;
  btn.classList.add('cargando');
  Promise.all([SCI.excelJS(), SCI.bd(cultivoId, null)]).then(function (r) {
    var ExcelJS = r[0], filas = r[1];
    var sug = {};
    RSCI.filas.forEach(function (f) { sug[f.codigo] = f; });
    var libro = new ExcelJS.Workbook();
    libro.creator = 'AgriTracer · Don Ricardo';
    var hoja = libro.addWorksheet('Data Power BI');
    var fechaExcel = function (f) { var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
    hoja.addTable({
      name: 'TablaSCI', ref: 'A1', headerRow: true, style: { theme: 'TableStyleMedium7', showRowStripes: true },
      columns: RSCI.COLUMNAS_BD.map(function (c) { return { name: c[0], filterButton: true }; }),
      rows: filas.map(function (f) {
        var s = sug[f.codigo] || {};
        return RSCI.COLUMNAS_BD.map(function (c) {
          if (c[1] === 'fecha') return fechaExcel(f.fecha);
          if (c[1] === 'origen') return f.origen === 'app' ? 'App' : 'Excel';
          if (/^aspectos|^recomendaciones/.test(c[1])) return s[c[1]] || '';
          var v = f[c[1]];
          return v === null || v === undefined ? '' : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && /puntaje|resultado/.test(c[1]) ? Number(v) : v);
        });
      })
    });
    RSCI.COLUMNAS_BD.forEach(function (c, i) {
      var col = hoja.getColumn(i + 1);
      col.width = c[2];
      if (c[1] === 'fecha') col.numFmt = 'dd/mm/yyyy';
      if (c[1] === 'puntaje_item' || c[1] === 'resultado_encuesta') col.numFmt = '0.0%';
    });
    hoja.views = [{ state: 'frozen', ySplit: 1 }];

    // Hoja de resultados por encuesta (una fila por encuesta).
    var res = libro.addWorksheet('Resultados');
    var colsRes = [['Código', 'codigo', 12], ['Fecha', 'fecha', 12], ['Semana', 'semana', 9], ['Cultivo', 'cultivo', 11], ['Campaña', 'campana', 18],
      ['Área evaluada', 'area_evaluada', 22], ['Grupo evaluador', 'grupo', 24], ['Planta', 'planta', 9], ['Cargo', 'cargo', 13],
      ['Atención y trato', 'p_atencion', 14], ['Tiempo de respuesta', 'p_tiempo', 14], ['Comunicación', 'p_comunicacion', 14],
      ['Calidad de servicio', 'p_calidad', 14], ['Resultado', 'resultado', 12]];
    res.addTable({
      name: 'TablaSCIResultados', ref: 'A1', headerRow: true, style: { theme: 'TableStyleMedium7', showRowStripes: true },
      columns: colsRes.map(function (c) { return { name: c[0], filterButton: true }; }),
      rows: RSCI.filas.map(function (f) {
        return colsRes.map(function (c) {
          if (c[1] === 'fecha') return fechaExcel(f.fecha);
          if (/^p_|resultado/.test(c[1])) return f[c[1]] === null ? '' : Number(f[c[1]]) / 100;
          return f[c[1]] === null || f[c[1]] === undefined ? '' : f[c[1]];
        });
      })
    });
    colsRes.forEach(function (c, i) {
      var col = res.getColumn(i + 1);
      col.width = c[2];
      if (c[1] === 'fecha') col.numFmt = 'dd/mm/yyyy';
      if (/^p_|resultado/.test(c[1])) col.numFmt = '0.0%';
    });
    return libro.xlsx.writeBuffer().then(function (buf) {
      SCI.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        SCI.nombreArchivo(['BD - Satisfacción cliente interno', cul ? cul.nombre : 'Todos', SCI.hoy()], 'xlsx'));
      DR.toast(filas.length + ' filas descargadas.');
    });
  }).catch(function (e) { DR.toast(e.message, 'error'); }).then(function () {
    btn.disabled = false;
    btn.classList.remove('cargando');
  });
};
