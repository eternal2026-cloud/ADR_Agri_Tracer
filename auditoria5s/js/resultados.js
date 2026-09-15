/* ============================================================================
 * resultados.js — HOJA «RESULTADOS» DEL EXCEL
 * Puntaje del área = promedio de PUNTAJE % de todas sus filas BD (igual que la
 * tabla dinámica), promedio por S (1S…5S), detalle por zona y madurez.
 * ==========================================================================*/
var RESUL = { auditoria: null, filas: [], COLOR: { 'EXCELENTE': '#76B729', 'BIEN': '#0097CE', 'REGULAR': '#EF7C3B', 'CRÍTICO': '#E5484D' } };

VISTAS.resultados = function (cont) {
  Promise.all([S5.cargar(), AT.rpc('fn_s5_resumen')]).then(function (r) {
    RESUL.filas = r[1] || [];
    var existe = RESUL.filas.some(function (f) { return f.auditoria_id === RESUL.auditoria; });
    if (RESUL.auditoria && existe) RESUL.pintarAuditoria(cont);
    else { RESUL.auditoria = null; RESUL.pintarGeneral(cont); }
  }).catch(function (e) { UI.error(cont, e); });
};

RESUL.agrupar = function () {
  var mapa = {}, lista = [];
  RESUL.filas.forEach(function (f) {
    var g = mapa[f.auditoria_id];
    if (!g) {
      g = mapa[f.auditoria_id] = { id: f.auditoria_id, codigo: f.codigo, fecha: f.fecha, semana: f.semana, numero_auditoria: f.numero_auditoria,
        tipo: f.tipo, estado: f.estado_auditoria, area_id: f.area_id, area: f.area, zonas: [] };
      lista.push(g);
    }
    g.zonas.push(f);
  });
  lista.forEach(function (g) {
    var todos = [];
    g.porS = {};
    for (var s = 1; s <= 5; s++) {
      var vals = g.zonas.map(function (z) { return z['p' + s]; });
      g.porS[s] = S5.promedio(vals);
      todos = todos.concat(vals);
    }
    g.pct = S5.promedio(todos);
    g.completas = g.zonas.filter(function (z) { return z.estado_zona === 'completa'; }).length;
    g.totalZonas = Math.max(S5.zonasDe(g.area_id).length, g.zonas.length);
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
  var auds = RESUL.agrupar();
  if (!auds.length) {
    cont.innerHTML = UI.encabezado('Auditoría 5S', 'Resultados', 'Todavía no hay puntajes registrados.') +
      UI.panel('Sin datos', '', '<div class="aviso">Inicia una auditoría desde <b>Auditar</b>. Los resultados aparecen apenas se guarda la primera S de una zona.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  var ultimas = {};
  auds.forEach(function (g) { if (!ultimas[g.area_id]) ultimas[g.area_id] = g; });
  var areas = S5.areas.filter(function (a) { return ultimas[a.id]; });
  var general = S5.promedio(areas.map(function (a) { return ultimas[a.id].pct; }));
  var enCurso = auds.filter(function (g) { return g.estado === 'en_curso'; }).length;

  var h = UI.encabezado('Auditoría 5S', 'Resultados', 'Promedio de PUNTAJE % como en la hoja Resultados del Excel. Toca un área o una auditoría para ver el detalle por S y por zona.') +
    '<div class="kpis">' +
      UI.kpi('Nivel general', S5.pct(general), (S5.madurez(general) || '—') + ' · última auditoría de cada área', '#0097CE') +
      UI.kpi('Auditorías', DR.num(auds.length), enCurso + ' en curso', '#76B729') +
      UI.kpi('Áreas evaluadas', DR.num(areas.length), 'de ' + S5.areas.filter(function (a) { return a.activo; }).length + ' activas', '#EF7C3B') +
    '</div>';

  h += UI.panel('Madurez por área', 'Última auditoría de cada área · EXCELENTE ≥ 90 % · BIEN ≥ 75 % · REGULAR ≥ 65 % · CRÍTICO < 65 %',
    areas.map(function (a) {
      var g = ultimas[a.id];
      return '<button type="button" class="barra-fila barra-btn" data-aud="' + g.id + '"><div>' + DR.esc(a.nombre) + ' · N° ' + g.numero_auditoria + '</div>' +
        '<div class="barra-pista"><div class="barra-valor" data-ancho="' + Math.round((g.pct || 0) * 100) + '" style="background:' + RESUL.colorDe(g.pct) + '"></div></div>' +
        '<div class="barra-cifra">' + S5.pct(g.pct) + '</div></button>';
    }).join(''));

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
  h += UI.panel('Auditorías', auds.length + ' registrada(s) · toca una fila para ver el detalle', UI.tabla(cols, auds, function () { return 'clicable'; }));

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  S5.animarBarras(cont);
  DR.$$('[data-aud]', cont).forEach(function (b) { b.onclick = function () { RESUL.abrir(this.getAttribute('data-aud')); }; });
  DR.$$('tbody tr.clicable', cont).forEach(function (tr) {
    tr.onclick = function () { RESUL.abrir(auds[Number(this.getAttribute('data-idx'))].id); };
  });
};

RESUL.pintarAuditoria = function (cont) {
  var g = RESUL.agrupar().filter(function (x) { return x.id === RESUL.auditoria; })[0];
  if (!g) { RESUL.auditoria = null; RESUL.pintarGeneral(cont); return; }
  var zonas = g.zonas.slice().sort(function (a, b) { return a.numero_zona - b.numero_zona; });

  var h = UI.migas([{ texto: 'Resultados', accion: true }, { texto: g.area + ' · N° ' + g.numero_auditoria }]) +
    UI.encabezado(g.codigo + ' · ' + S5.fecha(g.fecha) + ' · semana ' + g.semana, g.area + ' · Auditoría N° ' + g.numero_auditoria,
      g.tipo + ' · ' + RESUL.estadoTxt(g.estado).toLowerCase()) +
    '<div class="kpis">' +
      UI.kpi('Puntaje del área', S5.pct(g.pct), S5.madurez(g.pct) || 'Sin puntajes', RESUL.colorDe(g.pct)) +
      UI.kpi('Zonas completas', g.completas + '<small>de ' + g.totalZonas + '</small>', '', '#76B729') +
      UI.kpi('Observaciones', '<span id="kpiObs">…</span>', '<span id="kpiObsNota">Cargando…</span>', '#EF7C3B') +
    '</div>' +
    UI.panel('Promedio por S', 'Promedio de las zonas evaluadas (tabla dinámica 1S…5S del Excel)', S5.barrasS(g.porS));

  var cols = [{ t: 'N°', num: true, k: 'numero_zona' }, { t: 'Zona', k: 'zona' }]
    .concat([1, 2, 3, 4, 5].map(function (s) { return { t: s + 'S', num: true, r: function (z) { return S5.pct(z['p' + s]); } }; }))
    .concat([
      { t: 'Total', num: true, r: function (z) { return '<b>' + S5.pct(z.total) + '</b>'; } },
      { t: 'Madurez', r: function (z) { return S5.pillMadurez(z.total); } },
      { t: 'Estado', r: function (z) { return z.estado_zona === 'completa' ? 'Completa' : 'En curso'; } }
    ]);
  h += UI.panel('Por zona', zonas.length + ' zona(s) con puntajes', UI.tabla(cols, zonas)) +
    '<div class="acciones-fin"><button type="button" class="btn sec" id="btnResObs">Ver observaciones de esta auditoría</button>' +
    (AT.puedeCapturar() ? '<button type="button" class="btn sec" id="btnResAuditar">Abrir en Auditar</button>' : '') + '</div>';

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  S5.animarBarras(cont);
  DR.$$('[data-miga]', cont).forEach(function (b) { b.onclick = function () { RESUL.auditoria = null; RESUL.pintarGeneral(cont); }; });
  DR.$('#btnResObs').onclick = function () {
    OBS.filtros = { estado: 'todas', area: String(g.area_id), zona: '', auditoria: g.id };
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
