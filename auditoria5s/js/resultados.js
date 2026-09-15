/* ============================================================================
 * resultados.js — HOJA «RESULTADOS» DEL EXCEL, SIEMPRE DE UN CULTIVO
 * Puntaje del área = promedio de PUNTAJE % de todas sus filas BD (igual que la
 * tabla dinámica), promedio por S (1S…5S) con gráfico radar, detalle por zona,
 * madurez e informe PDF por una o más fechas de auditoría.
 * ==========================================================================*/
var RESUL = {
  auditoria: null, filas: [], informe: { area: '', fechas: [] },
  COLOR: { 'EXCELENTE': '#76B729', 'BIEN': '#0097CE', 'REGULAR': '#EF7C3B', 'CRÍTICO': '#E5484D' }
};

VISTAS.resultados = function (cont) {
  S5.cargar().then(function () {
    var cul = S5.cultivoActual();
    return AT.rpc('fn_s5_resumen', { p_cultivo: cul ? cul.id : null });
  }).then(function (filas) {
    RESUL.filas = filas || [];
    var existe = RESUL.filas.some(function (f) { return f.auditoria_id === RESUL.auditoria; });
    if (RESUL.auditoria && existe) RESUL.pintarAuditoria(cont);
    else { RESUL.auditoria = null; RESUL.pintarGeneral(cont); }
  }).catch(function (e) { UI.error(cont, e); });
};

RESUL.cambiarCultivo = function () {
  var cont = DR.$('#contenido');
  RESUL.auditoria = null;
  RESUL.informe = { area: '', fechas: [] };
  cont.innerHTML = '<div class="vacio">Cargando resultados…</div>';
  VISTAS.resultados(cont);
};

/** Promedio por S y total sobre filas de zona (equivale a promediar las filas BD). */
RESUL.porS = function (zonas) {
  var r = {}, todos = [];
  for (var s = 1; s <= 5; s++) {
    var vals = zonas.map(function (z) { return z['p' + s]; });
    r[s] = S5.promedio(vals);
    todos = todos.concat(vals);
  }
  r.total = S5.promedio(todos);
  return r;
};

RESUL.agrupar = function () {
  var mapa = {}, lista = [];
  RESUL.filas.forEach(function (f) {
    var g = mapa[f.auditoria_id];
    if (!g) {
      g = mapa[f.auditoria_id] = { id: f.auditoria_id, codigo: f.codigo, fecha: f.fecha, semana: f.semana, numero_auditoria: f.numero_auditoria,
        tipo: f.tipo, estado: f.estado_auditoria, area_id: f.area_id, area: f.area, cultivo_id: f.cultivo_id, campana: f.campana, zonas: [] };
      lista.push(g);
    }
    g.zonas.push(f);
  });
  lista.forEach(function (g) {
    g.porS = RESUL.porS(g.zonas);
    g.pct = g.porS.total;
    g.completas = g.zonas.filter(function (z) { return z.estado_zona === 'completa'; }).length;
    g.totalZonas = Math.max(S5.zonasDe(g.area_id, false, g.cultivo_id).length, g.zonas.length);
  });
  return lista;
};

RESUL.colorDe = function (p) { return RESUL.COLOR[S5.madurez(p)] || '#6B5D51'; };
RESUL.estadoTxt = function (e) { return e === 'cerrada' ? 'Cerrada' : 'En curso'; };
RESUL.abrir = function (id) {
  var cont = DR.$('#contenido');
  RESUL.auditoria = id;
  RESUL.pintarAuditoria(cont);
  cont.scrollTop = 0;
};

RESUL.pintarGeneral = function (cont) {
  var cul = S5.cultivoActual(), auds = RESUL.agrupar();
  var cabecera = UI.encabezado('Auditoría 5S', 'Resultados', 'Promedio de PUNTAJE % como en la hoja Resultados del Excel, siempre por cultivo. Toca un área o una auditoría para ver el detalle.') +
    S5.selectorCultivoHtml();
  if (!auds.length) {
    cont.innerHTML = cabecera + UI.panel('Sin datos de ' + (cul ? cul.nombre : 'este cultivo'), '',
      '<div class="aviso">Inicia una auditoría desde <b>Auditar</b>. Los resultados aparecen apenas se guarda la primera S de una zona.</div>');
    DR.entrarPaneles('#contenido');
    S5.enlazarSelectorCultivo(cont, RESUL.cambiarCultivo);
    return;
  }
  var ultimas = {};
  auds.forEach(function (g) { if (!ultimas[g.area_id]) ultimas[g.area_id] = g; });
  var areas = S5.areas.filter(function (a) { return ultimas[a.id]; });
  var zonasUltimas = [];
  areas.forEach(function (a) { zonasUltimas = zonasUltimas.concat(ultimas[a.id].zonas); });
  var porSUlt = RESUL.porS(zonasUltimas);
  var enCurso = auds.filter(function (g) { return g.estado === 'en_curso'; }).length;

  var h = cabecera +
    '<div class="kpis">' +
      UI.kpi('Nivel de ' + cul.nombre, S5.pct(porSUlt.total), (S5.madurez(porSUlt.total) || '—') + ' · última auditoría de cada área', cul.color) +
      UI.kpi('Auditorías', DR.num(auds.length), enCurso + ' en curso', '#76B729') +
      UI.kpi('Áreas evaluadas', DR.num(areas.length), 'de ' + S5.areasDe(cul.id).length + ' con zonas', '#EF7C3B') +
    '</div>';

  h += UI.panel('Nivel por S', 'Última auditoría de cada área de ' + cul.nombre + ' · líneas punteadas: 90 % EXCELENTE y 75 % BIEN',
    '<div class="radar">' + INF.radarSvg([{ nombre: cul.nombre, color: '#0097CE', valores: porSUlt, total: porSUlt.total }], { ancho: 520, alto: 420 }) + '</div>');

  h += UI.panel('Madurez por área', 'Última auditoría de cada área · EXCELENTE ≥ 90 % · BIEN ≥ 75 % · REGULAR ≥ 65 % · CRÍTICO < 65 %',
    areas.map(function (a) {
      var g = ultimas[a.id];
      return '<button type="button" class="barra-fila barra-btn" data-aud="' + g.id + '"><div>' + DR.esc(a.nombre) + ' · N° ' + g.numero_auditoria + '</div>' +
        '<div class="barra-pista"><div class="barra-valor" data-ancho="' + Math.round((g.pct || 0) * 100) + '" style="background:' + RESUL.colorDe(g.pct) + '"></div></div>' +
        '<div class="barra-cifra">' + S5.pct(g.pct) + '</div></button>';
    }).join(''));

  h += '<section class="panel entra" id="panelInforme">' + RESUL.informeHtml(auds) + '</section>';

  auds.forEach(function (g, i) { g._idx = i; g._clic = true; });
  var cols = [
    { t: 'Área', k: 'area' }, { t: 'N°', num: true, k: 'numero_auditoria' },
    { t: 'Fecha', r: function (g) { return S5.fecha(g.fecha); } }, { t: 'Tipo', k: 'tipo' },
    { t: 'Zonas', num: true, r: function (g) { return g.completas + '/' + g.totalZonas; } }
  ].concat([1, 2, 3, 4, 5].map(function (s) { return { t: s + 'S', num: true, r: function (g) { return S5.pct(g.porS[s]); } }; }))
    .concat([
      { t: 'Total', num: true, r: function (g) { return '<b>' + S5.pct(g.pct) + '</b>'; } },
      { t: 'Madurez', r: function (g) { return S5.pillMadurez(g.pct); } },
      { t: 'Estado', r: function (g) { return RESUL.estadoTxt(g.estado); } }
    ]);
  h += UI.panel('Auditorías de ' + cul.nombre, auds.length + ' registrada(s) · toca una fila para ver el detalle', UI.tabla(cols, auds, function () { return 'clicable'; }));

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  S5.animarBarras(cont);
  S5.enlazarSelectorCultivo(cont, RESUL.cambiarCultivo);
  RESUL.enlazarInforme(auds);
  DR.$$('[data-aud]', cont).forEach(function (b) { b.onclick = function () { RESUL.abrir(this.getAttribute('data-aud')); }; });
  DR.$$('tbody tr.clicable', cont).forEach(function (tr) {
    tr.onclick = function () { RESUL.abrir(auds[Number(this.getAttribute('data-idx'))].id); };
  });
};

/* ============================================================ INFORME PDF (una o más fechas) */
RESUL.informeHtml = function (auds) {
  var f = RESUL.informe;
  var areas = S5.areas.filter(function (a) { return auds.some(function (g) { return g.area_id === a.id; }); });
  if (f.area && !areas.some(function (a) { return String(a.id) === String(f.area); })) f.area = '';
  var enFiltro = auds.filter(function (g) { return !f.area || String(g.area_id) === String(f.area); });
  var fechas = [];
  enFiltro.forEach(function (g) { if (fechas.indexOf(g.fecha) < 0) fechas.push(g.fecha); });
  fechas.sort().reverse();
  f.fechas = f.fechas.filter(function (x) { return fechas.indexOf(x) > -1; });
  var series = INF.agruparPorFecha(RESUL.filas, f.area || null, f.fechas).map(function (g, i) {
    return { nombre: S5.fecha(g.fecha), color: INF.PALETA[i % INF.PALETA.length], valores: g.porS, total: g.porS.total };
  });
  return '<h2>Informe PDF</h2><div class="sub">Elige el área y una o más fechas de auditoría (máximo ' + INF.MAX_FECHAS + '). Incluye resultado por S, gráfico radar y detalle por ' +
      (f.area ? 'zona' : 'área') + ', con el logo y la paleta de Don Ricardo · Ingeniería de Procesos.</div>' +
    '<div class="form"><div class="campo ancho"><label for="infArea">Área</label><select id="infArea"><option value="">Todas las áreas</option>' +
      areas.map(function (a) { return '<option value="' + a.id + '"' + (String(a.id) === String(f.area) ? ' selected' : '') + '>' + DR.esc(a.nombre) + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="fechas-lista" id="infFechas">' + fechas.map(function (fe) {
      var gs = enFiltro.filter(function (g) { return g.fecha === fe; }), sel = f.fechas.indexOf(fe) > -1;
      return '<label class="fecha-op' + (sel ? ' activa' : '') + '"><input type="checkbox" value="' + fe + '"' + (sel ? ' checked' : '') + '><b>' + S5.fecha(fe) + '</b>' +
        '<span>' + gs.map(function (g) { return DR.esc(g.area) + ' N° ' + g.numero_auditoria + ' · ' + S5.pct(g.pct); }).join(' · ') + '</span></label>';
    }).join('') + '</div>' +
    (series.length ? '<div class="radar">' + INF.radarSvg(series, { ancho: 520, alto: series.length > 1 ? 480 : 420 }) + '</div>' : '') +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnPdf"' + (f.fechas.length ? '' : ' disabled') + '>' + DR.ICONOS.subir +
      '<span>' + (f.fechas.length ? 'Generar informe PDF · ' + f.fechas.length + ' fecha' + (f.fechas.length > 1 ? 's' : '') : 'Elige al menos una fecha') + '</span></button></div>';
};

RESUL.enlazarInforme = function (auds) {
  var panel = DR.$('#panelInforme');
  if (!panel) return;
  DR.$('#infArea').onchange = function () { RESUL.informe.area = this.value; RESUL.informe.fechas = []; RESUL.repintarInforme(auds); };
  DR.$$('#infFechas input').forEach(function (inp) {
    inp.onchange = function () {
      var fs = RESUL.informe.fechas, v = this.value;
      if (this.checked) {
        if (fs.length >= INF.MAX_FECHAS) { this.checked = false; DR.toast('Máximo ' + INF.MAX_FECHAS + ' fechas por informe.', 'error'); return; }
        fs.push(v);
      } else {
        fs.splice(fs.indexOf(v), 1);
      }
      RESUL.repintarInforme(auds);
    };
  });
  DR.$('#btnPdf').onclick = RESUL.generarPdf;
};

RESUL.repintarInforme = function (auds) {
  var panel = DR.$('#panelInforme');
  if (!panel) return;
  panel.innerHTML = RESUL.informeHtml(auds);
  RESUL.enlazarInforme(auds);
};

RESUL.generarPdf = function () {
  var btn = this, f = RESUL.informe, cul = S5.cultivoActual();
  if (!f.fechas.length || !cul) return;
  var grupos = INF.agruparPorFecha(RESUL.filas, f.area || null, f.fechas), ids = [];
  grupos.forEach(function (g) { g.lista.forEach(function (a) { ids.push(a.id); }); });
  if (!ids.length) { DR.toast('No hay auditorías con esas fechas.', 'error'); return; }
  var original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Generando PDF…';
  sb.from('s5_observaciones').select('auditoria_id,estado').in('auditoria_id', ids).then(function (r) {
    return INF.pdfResultados({ cultivo: cul, area: f.area ? S5.area(f.area) : null, grupos: grupos, obs: r.error ? [] : (r.data || []) });
  }).then(function (blob) {
    var area = f.area ? (S5.area(f.area) || {}).nombre : 'Todas las áreas';
    INF.descargar(blob, INF.nombreArchivo(['Informe 5S', cul.nombre, area, grupos.map(function (g) { return S5.fecha(g.fecha).replace(/\//g, '-'); }).join(' y ')], 'pdf'));
    DR.toast('Informe PDF descargado.');
  }).catch(function (e) {
    DR.toast('No se generó el PDF: ' + e.message, 'error');
  }).then(function () {
    btn.disabled = false;
    btn.innerHTML = original;
  });
};

/* ============================================================ DETALLE DE UNA AUDITORÍA */
RESUL.pintarAuditoria = function (cont) {
  var g = RESUL.agrupar().filter(function (x) { return x.id === RESUL.auditoria; })[0], cul = S5.cultivoActual();
  if (!g) { RESUL.auditoria = null; RESUL.pintarGeneral(cont); return; }
  var zonas = g.zonas.slice().sort(function (a, b) { return a.numero_zona - b.numero_zona; });

  var h = UI.migas([{ texto: 'Resultados', accion: true }, { texto: g.area + ' · N° ' + g.numero_auditoria }]) +
    UI.encabezado((cul ? cul.nombre + ' · ' : '') + g.codigo + ' · ' + S5.fecha(g.fecha) + ' · semana ' + g.semana, g.area + ' · Auditoría N° ' + g.numero_auditoria,
      g.tipo + ' · ' + g.campana + ' · ' + RESUL.estadoTxt(g.estado).toLowerCase()) +
    '<div class="kpis">' +
      UI.kpi('Puntaje del área', S5.pct(g.pct), S5.madurez(g.pct) || 'Sin puntajes', RESUL.colorDe(g.pct)) +
      UI.kpi('Zonas completas', g.completas + '<small>de ' + g.totalZonas + '</small>', '', '#76B729') +
      UI.kpi('Observaciones', '<span id="kpiObs">…</span>', '<span id="kpiObsNota">Cargando…</span>', '#EF7C3B') +
    '</div>' +
    UI.panel('Gráfico radar por S', 'Promedio de las zonas evaluadas', '<div class="radar">' +
      INF.radarSvg([{ nombre: g.area, color: '#0097CE', valores: g.porS, total: g.pct }], { ancho: 520, alto: 420 }) + '</div>') +
    UI.panel('Promedio por S', 'Tabla dinámica 1S…5S del Excel', S5.barrasS(g.porS));

  var cols = [{ t: 'N°', num: true, k: 'numero_zona' }, { t: 'Zona', k: 'zona' }]
    .concat([1, 2, 3, 4, 5].map(function (s) { return { t: s + 'S', num: true, r: function (z) { return S5.pct(z['p' + s]); } }; }))
    .concat([
      { t: 'Total', num: true, r: function (z) { return '<b>' + S5.pct(z.total) + '</b>'; } },
      { t: 'Madurez', r: function (z) { return S5.pillMadurez(z.total); } },
      { t: 'Estado', r: function (z) { return z.estado_zona === 'completa' ? 'Completa' : 'En curso'; } }
    ]);
  h += UI.panel('Por zona', zonas.length + ' zona(s) con puntajes', UI.tabla(cols, zonas)) +
    '<div class="acciones-fin">' +
      '<button type="button" class="btn verde" id="btnResPdf">' + DR.ICONOS.subir + '<span>Informe PDF de esta auditoría</span></button>' +
      '<button type="button" class="btn sec" id="btnResObs">Ver observaciones de esta auditoría</button>' +
      (AT.puedeCapturar() ? '<button type="button" class="btn sec" id="btnResAuditar">Abrir en Auditar</button>' : '') + '</div>';

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  S5.animarBarras(cont);
  DR.$$('[data-miga]', cont).forEach(function (b) { b.onclick = function () { RESUL.auditoria = null; RESUL.pintarGeneral(cont); }; });
  DR.$('#btnResPdf').onclick = function () {
    RESUL.informe = { area: String(g.area_id), fechas: [g.fecha] };
    RESUL.generarPdf.call(this);
  };
  DR.$('#btnResObs').onclick = function () {
    OBS.filtros.estado = 'todas'; OBS.filtros.area = String(g.area_id); OBS.filtros.zona = ''; OBS.filtros.auditoria = g.id;
    DR.ir('observaciones');
  };
  if (DR.$('#btnResAuditar')) DR.$('#btnResAuditar').onclick = function () { AUD.pendiente = g.id; DR.ir('auditar'); };

  sb.from('s5_observaciones').select('estado').eq('auditoria_id', g.id).then(function (r) {
    var k = DR.$('#kpiObs'), n = DR.$('#kpiObsNota');
    if (!k || r.error) return;
    var lista = r.data || [];
    k.textContent = DR.num(lista.length);
    n.textContent = lista.filter(function (o) { return S5.ABIERTOS.indexOf(o.estado) > -1; }).length + ' abiertas · ' +
      lista.filter(function (o) { return o.estado === 'Cerrado'; }).length + ' cerradas';
  });
};
