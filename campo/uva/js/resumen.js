/* ============================================================================
 * resumen.js — RESUMEN DEL TIEMPO DE CICLO UVA (réplica del Resumen de Arándano)
 * Con los datos de Integra (nube.js: APK + Integra + Planta, según los permisos del usuario):
 *   · Ámbito: todas las semanas, una semana o un día; filtros de zona y fundo.
 *   · «Minutos por tramo»: cada etapa y, entre una etapa y la siguiente, su ESPERA en fila
 *     aparte (como el tablero Vista_Previa_Dashboard): incluye la parte de planta
 *     (espera de recepción, espera de descarga, descarga, espera de abastecimiento).
 *     En vivo: los pallets en curso suman sus tramos ya completados.
 *   · «Tiempo promedio por …» fundo, lote, variedad, grupo, planta, placa, zona, origen; «Ver tabla».
 *   · Mapa de lotes (GeoJSON de Agritracer, data/lotes_uva.geojson) coloreado frente a la meta.
 *   · Lotes frente a la meta: barras con el umbral punteado.
 *   · Tabla dinámica fundo › lote › pallets con cada tramo en min:seg (expandir, contraer, copiar a Outlook).
 *   · Evolución: líneas por fundo del ciclo o de una etapa / espera, por día, semana o ciclo.
 *   Los ciclos atípicos (> 480 min) no promedian.
 * ==========================================================================*/

var RSU = DR.leer('tcu.resumen', null) || {};
['semana', 'dia', 'zona', 'fundo'].forEach(function (k) { if (RSU[k] === undefined) RSU[k] = ''; });
RSU.dim = RSU.dim || 'fundo';
RSU.verTabla = false;
RSU.abiertos = {};
RSU.guardar = function () { DR.guardar('tcu.resumen', { semana: RSU.semana, dia: RSU.dia, zona: RSU.zona, fundo: RSU.fundo, dim: RSU.dim }); };

/** Minutos → «m:ss» (con segundos, como Arándano). */
RSU.mmss = function (min) {
  if (min === null || min === undefined || min === '' || isNaN(min)) return '—';
  var s = Math.round(Math.abs(Number(min)) * 60);
  return (Number(min) < 0 && s ? '-' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/**
 * Tramos en orden del proceso: antes de cada etapa, su espera (si la BD la mide).
 * v(r, c) devuelve los minutos del tramo para un registro (c = TC.calcular(r)) o null.
 */
RSU.TRAMOS = (function () {
  var l = [];
  TC.ETAPAS.forEach(function (e) {
    if (e.dep && !e.sinEspera) l.push({ id: 'esp_' + e.id, t: 'Espera antes de ' + e.nombre.toLowerCase(), corto: 'Esp. ' + e.corto.toLowerCase(), espera: true,
      v: function (r, c) { return c.etapas[e.id].espera; } });
    l.push({ id: e.id, t: e.n + '. ' + e.nombre, corto: e.corto, color: e.color, v: function (r, c) { return c.etapas[e.id].min; } });
  });
  var p = function (k) { return function (r) { return r.pl ? r.pl[k] : null; }; };
  l.push({ id: 'pl_rec', t: 'Espera de recepción (planta)', corto: 'Esp. recep.', espera: true, planta: true, v: p('espRecepcion') });
  l.push({ id: 'pl_esd', t: 'Espera de descarga (planta)', corto: 'Esp. desc.', espera: true, planta: true, v: p('espDescarga') });
  l.push({ id: 'pl_des', t: 'Descarga (planta)', corto: 'Descarga', planta: true, color: 'var(--azul-med)', v: p('descarga') });
  l.push({ id: 'pl_esa', t: 'Espera de abastecimiento (planta)', corto: 'Esp. abast.', espera: true, planta: true, v: p('espAbast') });
  return l;
})();

RSU.DIMS = [['fundo', 'Fundo'], ['lote', 'Lote'], ['variedad', 'Variedad'], ['grupo', 'Grupo'], ['planta', 'Planta'], ['placa', 'Placa'], ['zona', 'Zona'], ['origen', 'Origen']];

/** Registros del ámbito y filtros (sin los iniciados en planta sin datos de campo, que no tienen fundo/lote). */
RSU.base = function () { return NUBE.todos().filter(function (r) { return r.fecha; }); };
RSU.filtrar = function (l) {
  return l.filter(function (r) {
    if (RSU.dia) { if (r.fecha !== RSU.dia) return false; }
    else if (RSU.semana && String(TC.semana(r.fecha)) !== String(RSU.semana)) return false;
    if (RSU.zona && r.zona !== RSU.zona) return false;
    if (RSU.fundo && r.fundo !== RSU.fundo) return false;
    return true;
  });
};

/** Promedios de un grupo: cada tramo con su propio n (en vivo: también los tramos de pallets en curso). */
RSU.resumir = function (l) {
  var o = { n: 0, curso: 0, atipicos: 0, errores: 0, tramos: {}, tot: 0, nTot: 0, cc: 0, nCc: 0, meta: 0, nMeta: 0, ids: [] };
  RSU.TRAMOS.forEach(function (t) { o.tramos[t.id] = { s: 0, n: 0 }; });
  l.forEach(function (r) {
    var c = TC.calcular(r);
    if (c.atipico) { o.atipicos++; return; }
    // Horas cruzadas (ej. cosecha corregida después de la llegada): el ciclo sale negativo y no promedia.
    if (c.total !== null && c.total < 0) { o.errores++; return; }
    if (r.estado === 'cerrado') o.n++; else o.curso++;
    o.ids.push(r.id);
    RSU.TRAMOS.forEach(function (t) {
      var v = t.v(r, c);
      if (v !== null && v !== undefined && !isNaN(v)) { o.tramos[t.id].s += Number(v); o.tramos[t.id].n++; }
    });
    if (c.total !== null) { o.tot += c.total; o.nTot++; o.nMeta++; if (c.enMeta) o.meta++; }
    var cc = r.pl && r.pl.cicloCompleto;
    if (cc !== null && cc !== undefined && cc <= TC.ATIPICO) { o.cc += cc; o.nCc++; }
  });
  RSU.TRAMOS.forEach(function (t) { var x = o.tramos[t.id]; x.prom = x.n ? x.s / x.n : null; });
  o.prom = o.nTot ? o.tot / o.nTot : null;
  o.promCc = o.nCc ? o.cc / o.nCc : null;
  o.pctMeta = o.nMeta ? o.meta / o.nMeta * 100 : null;
  return o;
};

/** Barras de «Minutos por tramo»: la espera va en una fila aparte, sangrada y punteada. */
RSU.barrasTramos = function (o) {
  var filas = RSU.TRAMOS.filter(function (t) { return o.tramos[t.id].prom !== null; });
  if (!filas.length) return '<div class="vacio">Aún no hay tramos completos.</div>';
  var max = Math.max.apply(null, filas.map(function (t) { return Math.abs(o.tramos[t.id].prom); }).concat([1]));
  var mayorEsp = filas.filter(function (t) { return t.espera; }).reduce(function (m, t) { return !m || o.tramos[t.id].prom > o.tramos[m.id].prom ? t : m; }, null);
  var hayPlanta = false;
  return filas.map(function (t) {
    var v = o.tramos[t.id].prom, neg = v < 0, ancho = Math.round(Math.abs(v) / max * 100);
    var sep = t.planta && !hayPlanta ? (hayPlanta = true, '<div class="bt-sep">En planta</div>') : '';
    var nota = t.espera ? (neg ? 'Empieza antes (en paralelo)' : 'Pallet detenido') : 'Tiempo de la etapa';
    return sep + '<div class="bt-fila' + (t.espera ? ' espera' : '') + (t === mayorEsp && v > 0 ? ' mayor' : '') + '" title="' + DR.esc(t.t + ' · ' + nota + ': ' + RSU.mmss(v) + ' min · ' + o.tramos[t.id].n + ' dato(s)') + '">' +
      '<div class="bt-nombre">' + DR.esc(t.t) + '</div>' +
      '<div class="bt-pista"><div class="bt-valor' + (neg ? ' neg' : '') + '" style="width:' + ancho + '%' + (!t.espera && t.color && !neg ? ';background:' + t.color : '') + '"></div></div>' +
      '<div class="bt-cifra">' + RSU.mmss(v) + '</div></div>';
  }).join('') + '<div class="ayuda-campo">min:seg promedio por pallet. Fila punteada = espera entre etapas (pallet detenido); en rojo, una etapa que empezó antes de que terminara la anterior (en paralelo).' +
    (mayorEsp && o.tramos[mayorEsp.id].prom > 0 ? ' Mayor espera: <b>' + DR.esc(mayorEsp.t.replace('Espera antes de ', 'antes de ')) + '</b>.' : '') + '</div>';
};

/* ================================ VISTA ================================ */
VISTAS.resumen = function (cont) {
  RSU.pintar(cont);
  NUBE.cargar().then(function () { if (DR.vista === 'resumen') RSU.pintar(cont, true); });
  clearInterval(RSU._vivo);
  RSU._vivo = setInterval(function () {
    if (DR.vista !== 'resumen') { clearInterval(RSU._vivo); return; }
    if (document.hidden || DR.$('#hoja:not(.oculto)')) return;
    var antes = NUBE.hora;
    NUBE.cargar(true).then(function () { if (DR.vista === 'resumen' && NUBE.hora !== antes) RSU.pintar(cont, true); });
  }, 30000);
};

RSU.pintar = function (cont, quieto) {
  var y = cont.scrollTop, todos = RSU.base();
  var semanas = CAT.unicos(todos.map(function (r) { return String(TC.semana(r.fecha)); })).sort(function (a, b) { return b - a; });
  var dias = CAT.unicos(todos.filter(function (r) { return !RSU.semana || String(TC.semana(r.fecha)) === String(RSU.semana); }).map(function (r) { return r.fecha; })).sort().reverse();
  var zonas = CAT.unicos(CAT.zonas().concat(todos.map(function (r) { return r.zona; }))).sort();
  var fundos = CAT.unicos(CAT.filas().filter(function (f) { return !RSU.zona || f[0] === RSU.zona; }).map(function (f) { return f[1]; })
    .concat(todos.filter(function (r) { return !RSU.zona || r.zona === RSU.zona; }).map(function (r) { return r.fundo; }))).sort();
  var l = RSU.filtrar(todos), o = RSU.resumir(l), meta = TC.cfg.metas.total;
  var opt = function (v, t, sel) { return '<option value="' + DR.esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  var ambito = RSU.dia ? 'Día ' + DR.fechaCorta(RSU.dia) : (RSU.semana ? 'Semana ' + RSU.semana : 'Todas las semanas');
  ambito += [RSU.zona, RSU.fundo].filter(Boolean).map(function (x) { return ' · ' + x; }).join('');
  var nota = NUBE.error ? '<div class="aviso alerta">No se pudo leer Integra (' + DR.esc(NUBE.error) + '). Se muestra la última copia del equipo.</div>'
    : (!NUBE.hora ? '<div class="aviso">Conéctate para traer los registros de Integra.</div>' : '');

  cont.innerHTML = '<div class="vista">' +
    '<div class="enc' + (quieto ? '' : ' entra') + '"><div class="eti">Resumen · <span class="en-vivo">EN VIVO</span></div><h1>' + DR.esc(ambito) + '</h1>' +
      '<p>Todos los pallets de Integra (APK, Integra y Planta) que tus permisos te dejan ver.' + (NUBE.hora ? ' Actualizado ' + DR.hace(NUBE.hora) + '.' : '') + '</p></div>' + nota +
    '<div class="filtros' + (quieto ? '' : ' entra') + '">' +
      '<select id="rSemana">' + opt('', 'Todas las semanas', RSU.semana) + semanas.map(function (s) { return opt(s, 'Semana ' + s, RSU.semana); }).join('') + '</select>' +
      '<select id="rDia">' + opt('', 'Todos los días', RSU.dia) + dias.map(function (d) { return opt(d, DR.fechaCorta(d), RSU.dia); }).join('') + '</select>' +
      '<select id="rZona">' + opt('', 'Todas las zonas', RSU.zona) + zonas.map(function (z) { return opt(z, z, RSU.zona); }).join('') + '</select>' +
      '<select id="rFundo">' + opt('', 'Todos los fundos', RSU.fundo) + fundos.map(function (f) { return opt(f, f, RSU.fundo); }).join('') + '</select>' +
    '</div>' +
    '<div class="kpis' + (quieto ? '' : ' entra') + '">' +
      '<div class="kpi"><b>' + (o.prom !== null ? RSU.mmss(o.prom) : '—') + '</b><span>Ciclo campo (min:seg)' + (meta ? ' · meta ' + meta : '') + '</span></div>' +
      '<div class="kpi"><b>' + o.n + '</b><span>Pallets cerrados' + (o.curso ? ' + ' + o.curso + ' en curso' : '') + '</span></div>' +
      '<div class="kpi"><b>' + (o.promCc !== null ? RSU.mmss(o.promCc) : (o.pctMeta !== null ? DR.num(o.pctMeta) + '%' : '—')) + '</b><span>' +
        (o.promCc !== null ? 'Ciclo completo hasta abastecimiento' : 'Dentro de meta') + '</span></div></div>' +
    '<div class="tarjeta' + (quieto ? '' : ' entra') + '"><h2>Minutos por tramo · ' + DR.esc(ambito) + '</h2>' +
      '<p class="ayuda-campo" style="margin:0 0 10px">Promedio de cada etapa y, entre una etapa y la siguiente, la espera del pallet detenido. Incluye los tramos ya completados de los pallets en curso' +
      (o.atipicos ? ' · ' + o.atipicos + ' ciclo(s) atípico(s) (> ' + TC.ATIPICO + ' min) fuera' : '') +
      (o.errores ? ' · <b style="color:var(--alerta)">' + o.errores + ' pallet(s) con horas cruzadas (ciclo negativo) fuera: revísalos en Registros</b>' : '') + '.</p>' + RSU.barrasTramos(o) + '</div>' +
    '<div class="tarjeta' + (quieto ? '' : ' entra') + '"><h2>Tiempo promedio por ' + DR.esc(RSU.nombreDim(RSU.dim).toLowerCase()) + '</h2>' +
      '<div class="acc-dim">' + RSU.DIMS.map(function (d) { return '<button type="button" data-dim="' + d[0] + '" class="' + (d[0] === RSU.dim ? 'activa' : '') + '">' + d[1] + '</button>'; }).join('') +
      '<button type="button" id="rVerTabla" class="' + (RSU.verTabla ? 'activa' : '') + '">Ver tabla</button></div>' +
      '<div id="rGrupo">' + RSU.grupoHtml(l, meta) + '</div></div>' +
    // Sin «entra»: la animación movería el panel y Leaflet calcularía mal su tamaño.
    MAPAU.panelHtml() +
    '<div class="tarjeta' + (quieto ? '' : ' entra') + '"><h2>Lotes frente a la meta</h2>' +
      '<p class="ayuda-campo" style="margin:0 0 8px">Ciclo de campo promedio por lote, de mayor a menor; la línea punteada es el umbral (meta del ciclo). Toca un lote para abrirlo en la tabla.</p>' +
      RSU.lotesHtml(l, meta) + '</div>' +
    '<div class="tarjeta' + (quieto ? '' : ' entra') + '" id="pivPanel"><h2>Promedio por fundo · ' + DR.esc(ambito) + '</h2>' +
      '<p class="ayuda-campo" style="margin:0 0 8px">Tabla dinámica automática (se actualiza sola): min:seg · toca un fundo para ver sus lotes, un lote para ver sus pallets y un pallet para ver sus horas. Columnas en cursiva = esperas.</p>' +
      '<div class="botones" style="margin-bottom:8px"><button class="btn" id="pivAbrir" type="button">Expandir todo</button><button class="btn" id="pivCerrar" type="button">Contraer todo</button>' +
      '<button class="btn primario" id="pivCopiar" type="button">Copiar tabla</button></div>' +
      '<div class="piv-scroll" id="pivTablaU">' + RSU.pivotHtml(l) + '</div></div>' +
    '<div class="tarjeta' + (quieto ? '' : ' entra') + '"><h2>Evolución</h2>' +
      '<p class="ayuda-campo" style="margin:0 0 8px">Línea por fundo del ciclo o de la etapa / espera que elijas: por día, por semana o ciclo por ciclo.</p>' +
      '<div id="evoCaja">' + RSU.evoHtml(l, meta) + '</div></div>' +
  '</div>';

  if (!quieto) DR.entrarPaneles('#contenido'); else cont.scrollTop = y;
  var cambiar = function (k, v) {
    RSU[k] = v;
    if (k === 'semana') RSU.dia = '';
    if (k === 'zona' && RSU.fundo && fundos.indexOf(RSU.fundo) < 0) RSU.fundo = '';
    RSU.guardar(); RSU.pintar(cont, true);
  };
  DR.$('#rSemana').onchange = function () { cambiar('semana', this.value); };
  DR.$('#rDia').onchange = function () { cambiar('dia', this.value); };
  DR.$('#rZona').onchange = function () { RSU.fundo = ''; cambiar('zona', this.value); };
  DR.$('#rFundo').onchange = function () { cambiar('fundo', this.value); };
  DR.$$('[data-dim]', cont).forEach(function (b) { b.onclick = function () { RSU.dim = b.getAttribute('data-dim'); RSU.guardar(); RSU.pintar(cont, true); }; });
  DR.$('#rVerTabla').onclick = function () { RSU.verTabla = !RSU.verTabla; RSU.pintar(cont, true); };
  DR.$$('[data-piv]', cont).forEach(function (tr) {
    tr.onclick = function () { var k = tr.getAttribute('data-piv'); RSU.abiertos[k] = !RSU.abiertos[k]; RSU.pintar(cont, true); };
  });
  DR.$$('[data-pallet]', cont).forEach(function (tr) { tr.onclick = function () { NUBE.abrir(tr.getAttribute('data-pallet')); }; });
  var irLote = function (fundo, lote) {
    fundo = fundo || 'Sin fundo';
    RSU.abiertos[fundo] = true; RSU.abiertos[fundo + '|' + (lote || 'Sin lote')] = true;
    RSU.pintar(cont, true);
    var p = DR.$('#pivPanel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  DR.$$('[data-ir-lote]', cont).forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-ir-lote').split('|'); irLote(p[0], p[1]); }; });
  DR.$('#pivAbrir').onclick = function () {
    l.forEach(function (r) { var f = r.fundo || 'Sin fundo'; RSU.abiertos[f] = true; RSU.abiertos[f + '|' + (r.lote || 'Sin lote')] = true; });
    RSU.pintar(cont, true);
  };
  DR.$('#pivCerrar').onclick = function () { RSU.abiertos = {}; RSU.pintar(cont, true); };
  DR.$('#pivCopiar').onclick = RSU.copiarTabla;
  var enlazarEvo = function () {
    var cambiar = function (k, v) { RSU.evo[k] = v; DR.guardar('tcu.evo', RSU.evo); DR.$('#evoCaja').innerHTML = RSU.evoHtml(l, meta); enlazarEvo(); };
    DR.$('#evoMet').onchange = function () { cambiar('met', this.value); };
    DR.$$('[data-eje]', cont).forEach(function (b) { b.onclick = function () { cambiar('eje', b.getAttribute('data-eje')); }; });
  };
  enlazarEvo();
  MAPAU.montar(l, meta, irLote);
};

RSU.nombreDim = function (d) { return (RSU.DIMS.filter(function (x) { return x[0] === d; })[0] || [d, d])[1]; };
RSU.valorDim = function (r, d) { return d === 'origen' ? (NUBE.ORIGEN[r.origen] || r.origen) : (r[d] || 'Sin ' + RSU.nombreDim(d).toLowerCase()); };

/** Barras del ciclo de campo por dimensión, de mayor a menor, con la meta punteada; o la tabla por tramo. */
RSU.grupoHtml = function (l, meta) {
  var g = {};
  l.forEach(function (r) { var k = RSU.valorDim(r, RSU.dim); (g[k] = g[k] || []).push(r); });
  var items = Object.keys(g).map(function (k) { return { k: k, o: RSU.resumir(g[k]) }; }).filter(function (x) { return x.o.n + x.o.curso > 0; });
  if (!items.length) return '<div class="vacio">Sin pallets con estos filtros.</div>';
  items.sort(function (a, b) { return (b.o.prom === null ? -1 : b.o.prom) - (a.o.prom === null ? -1 : a.o.prom); });
  if (RSU.verTabla) {
    var cols = RSU.TRAMOS.filter(function (t) { return items.some(function (x) { return x.o.tramos[t.id].prom !== null; }); });
    return '<div class="piv-scroll"><table class="tabla piv"><tr><th>' + DR.esc(RSU.nombreDim(RSU.dim)) + '</th><th class="n">Pallets</th>' +
      cols.map(function (t) { return '<th class="n' + (t.espera ? ' th-esp' : '') + '" title="' + DR.esc(t.t) + '">' + DR.esc(t.corto) + '</th>'; }).join('') + '<th class="n">Ciclo</th></tr>' +
      items.map(function (x) {
        return '<tr><td>' + DR.esc(x.k) + '</td><td class="n">' + x.o.n + (x.o.curso ? '+' + x.o.curso : '') + '</td>' +
          cols.map(function (t) { return '<td class="n' + (t.espera ? ' td-esp' : '') + '">' + RSU.mmss(x.o.tramos[t.id].prom) + '</td>'; }).join('') +
          '<td class="n"><b>' + RSU.mmss(x.o.prom) + '</b></td></tr>';
      }).join('') + '</table></div>';
  }
  var tope = Math.max.apply(null, items.map(function (x) { return x.o.prom || 0; }).concat([meta || 0, 1])) * 1.05;
  return '<div class="gf-leyenda"><span class="gf-muestra-barra"></span>Ciclo de campo promedio' + (meta ? '<span class="gf-muestra-meta"></span>Meta ' + meta + ' min' : '') + '</div>' +
    items.map(function (x) {
      var v = x.o.prom, sobre = v !== null && meta && v > meta;
      return '<div class="gf-fila"><div class="gf-nombre">' + DR.esc(x.k) + '<small>' + x.o.n + ' pallet(s)' + (x.o.curso ? ' + ' + x.o.curso + ' en curso' : '') + '</small></div>' +
        '<div class="gf-pista">' + (meta ? '<span class="gf-meta" style="left:' + (meta / tope * 100).toFixed(1) + '%"></span>' : '') +
        '<span class="gf-barra' + (sobre ? ' sobre' : '') + '" style="width:' + (v === null ? 0 : v / tope * 100).toFixed(1) + '%"></span></div>' +
        '<div class="gf-cifra">' + (v === null ? 'en curso' : RSU.mmss(v)) + '</div></div>';
    }).join('');
};

/** Tabla dinámica fundo › lote › pallets: cada nivel con su propio promedio de cada tramo. */
RSU.pivotHtml = function (l) {
  var cols = RSU.TRAMOS.filter(function (t) { return !t.planta || l.some(function (r) { return r.pl && r.pl[{ pl_rec: 'espRecepcion', pl_esd: 'espDescarga', pl_des: 'descarga', pl_esa: 'espAbast' }[t.id]] !== null; }); });
  var celdas = function (o) {
    return cols.map(function (t) { return '<td class="n' + (t.espera ? ' td-esp' : '') + '">' + RSU.mmss(o.tramos[t.id].prom) + '</td>'; }).join('') + '<td class="n"><b>' + RSU.mmss(o.prom) + '</b></td>';
  };
  var porFundo = {};
  l.forEach(function (r) { var f = r.fundo || 'Sin fundo'; (porFundo[f] = porFundo[f] || {}); (porFundo[f][r.lote || 'Sin lote'] = porFundo[f][r.lote || 'Sin lote'] || []).push(r); });
  var fundos = Object.keys(porFundo).sort();
  if (!fundos.length) return '<div class="vacio">Sin pallets con estos filtros.</div>';
  var h = '<table class="tabla piv"><tr><th>Fundo › lote › pallet</th><th class="n">Pallets</th>' +
    cols.map(function (t) { return '<th class="n' + (t.espera ? ' th-esp' : '') + '" title="' + DR.esc(t.t) + '">' + DR.esc(t.corto) + '</th>'; }).join('') + '<th class="n">Ciclo</th></tr>';
  var tot = RSU.resumir(l);
  fundos.forEach(function (f) {
    var lotes = porFundo[f], todos = [];
    Object.keys(lotes).forEach(function (k) { todos = todos.concat(lotes[k]); });
    var o = RSU.resumir(todos), abierto = RSU.abiertos[f];
    h += '<tr class="piv-n0" data-piv="' + DR.esc(f) + '"><td>' + (abierto ? '▾ ' : '▸ ') + DR.esc(f) + '</td><td class="n">' + o.n + (o.curso ? '+' + o.curso : '') + '</td>' + celdas(o) + '</tr>';
    if (!abierto) return;
    Object.keys(lotes).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); }).forEach(function (lo) {
      var k = f + '|' + lo, ol = RSU.resumir(lotes[lo]), ab = RSU.abiertos[k];
      h += '<tr class="piv-n1" data-piv="' + DR.esc(k) + '"><td>' + (ab ? '▾ ' : '▸ ') + DR.esc(lo) + '</td><td class="n">' + ol.n + (ol.curso ? '+' + ol.curso : '') + '</td>' + celdas(ol) + '</tr>';
      if (ab) lotes[lo].forEach(function (r) {
        var or = RSU.resumir([r]);
        h += '<tr class="piv-n2" data-pallet="' + DR.esc(r.id) + '"><td>' + DR.fechaCorta(r.fecha).slice(0, 5) + ' · ' + DR.esc(r.pallet ? 'Pallet ' + r.pallet : r.id.slice(-6)) +
          (r.estado === 'cerrado' ? '' : ' <small>(en curso)</small>') + '</td><td class="n">' + DR.esc(NUBE.ORIGEN[r.origen] || '') + '</td>' + celdas(or) + '</tr>';
      });
    });
  });
  return h + '<tr class="piv-tot"><td>Total general</td><td class="n">' + tot.n + (tot.curso ? '+' + tot.curso : '') + '</td>' + celdas(tot) + '</tr></table>';
};

/* ================================ LOTES FRENTE A LA META (barras con umbral) ================================ */
RSU.lotesHtml = function (l, meta) {
  var g = {};
  l.forEach(function (r) { var k = (r.fundo || 'Sin fundo') + '|' + (r.lote || 'Sin lote'); (g[k] = g[k] || []).push(r); });
  var items = Object.keys(g).map(function (k) { return { k: k, o: RSU.resumir(g[k]) }; }).filter(function (x) { return x.o.n + x.o.curso > 0; })
    .sort(function (a, b) { return (b.o.prom === null ? -1 : b.o.prom) - (a.o.prom === null ? -1 : a.o.prom); });
  if (!items.length) return '<div class="vacio">Sin pallets con estos filtros.</div>';
  var tope = Math.max.apply(null, items.map(function (x) { return x.o.prom || 0; }).concat([meta || 0, 1])) * 1.05;
  var sobre = items.filter(function (x) { return x.o.prom !== null && meta && x.o.prom > meta; }).length;
  return '<div class="gf-leyenda"><span class="gf-muestra-barra" style="background:var(--dr-verde)"></span>En meta<span class="gf-muestra-barra" style="background:var(--dr-naranja);margin-left:10px"></span>Sobre la meta' +
      (meta ? '<span class="gf-muestra-meta"></span>Umbral ' + meta + ' min' : '') + '<span style="margin-left:auto">' + sobre + ' de ' + items.length + ' sobre la meta</span></div>' +
    '<div class="lotes-grid">' + items.map(function (x) {
      var p = x.k.split('|'), v = x.o.prom, mal = v !== null && meta && v > meta;
      return '<button type="button" class="lote-card' + (mal ? ' sobre' : '') + '" data-ir-lote="' + DR.esc(x.k) + '">' +
        '<div class="lc-top"><b>' + DR.esc(p[1]) + '</b><span class="lc-min' + (mal ? ' sobre' : '') + '">' + (v === null ? 'en curso' : RSU.mmss(v)) + '</span></div>' +
        '<div class="lc-pista">' + (meta ? '<span class="lc-meta" style="left:' + (meta / tope * 100).toFixed(1) + '%"></span>' : '') +
        '<span class="lc-barra' + (mal ? ' sobre' : '') + '" style="width:' + (v === null ? 0 : Math.min(100, v / tope * 100)).toFixed(1) + '%"></span></div>' +
        '<div class="lc-pie">' + DR.esc(p[0]) + ' · ' + x.o.n + ' pallet(s)' + (x.o.curso ? ' + ' + x.o.curso + ' en curso' : '') +
          (mal ? ' · <b>' + RSU.mmss(v - meta) + ' sobre</b>' : '') + '</div></button>';
    }).join('') + '</div>';
};

/* ================================ MAPA DE LOTES (GeoJSON de Agritracer, cultivo UVA) ================================
 * data/lotes_uva.geojson lo genera «10. Mapa Carencias GeoJSON/extraer_geojson.py --integra».
 * Verde = lote en meta · naranja = sobre la meta · azul = solo pallets en curso · gris = sin pallets.
 * El mapa se crea una vez; en cada repintado se mueve su nodo al panel nuevo y solo cambian los colores. */
var MAPAU = { mapa: null, nodo: null, capa: null, geo: null, _carga: null, clave: null };
MAPAU.COLORES = { meta: '#76B729', sobre: '#EF7C3B', curso: '#0097CE', vacio: '#8A9AAA' };
MAPAU.llave = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); };
MAPAU.loteClave = function (s) { var m = String(s || '').toUpperCase().match(/^\s*([A-Z]+)0*(\d+[A-Z]*)/); return m ? m[1] + m[2] : ''; };
MAPAU.cargarGeo = function () {
  if (!MAPAU._carga) MAPAU._carga = fetch('data/lotes_uva.geojson').then(function (r) {
    if (!r.ok) throw new Error('No se pudo leer el mapa de lotes (' + r.status + ')');
    return r.json();
  }).then(function (g) { MAPAU.geo = g; return g; }).catch(function (e) { MAPAU._carga = null; throw e; });
  return MAPAU._carga;
};
MAPAU.panelHtml = function () {
  var c = MAPAU.COLORES, ley = function (color, t) { return '<span class="mapa-ley"><i style="background:' + color + '"></i>' + t + '</span>'; };
  return '<div class="tarjeta"><h2>Mapa de lotes</h2><p class="ayuda-campo" style="margin:0 0 8px">Ciclo de campo promedio de cada lote frente a la meta. Toca un lote para abrirlo en la tabla dinámica.</p>' +
    '<div class="mapa-leyenda">' + ley(c.meta, 'En meta') + ley(c.sobre, 'Sobre la meta') + ley(c.curso, 'Solo en curso') + ley(c.vacio, 'Sin pallets') + '</div>' +
    '<div id="mapaSlot" class="mapa-slot"></div><div id="mapaSin" class="mapa-sin"></div></div>';
};
MAPAU.montar = function (l, meta, alTocar) {
  var slot = DR.$('#mapaSlot');
  if (!slot) return;
  if (typeof L === 'undefined') { slot.innerHTML = '<div class="aviso">Sin señal: el mapa necesita conexión la primera vez.</div>'; return; }
  MAPAU.cargarGeo().then(function () {
    if (!slot.isConnected) return;
    if (!MAPAU.mapa) {
      MAPAU.nodo = document.createElement('div'); MAPAU.nodo.className = 'mapa-lotes'; slot.appendChild(MAPAU.nodo);
      MAPAU.mapa = L.map(MAPAU.nodo, { scrollWheelZoom: false, renderer: L.svg({ padding: 0.5 }) });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 17, maxZoom: 19, attribution: 'Imágenes © Esri' }).addTo(MAPAU.mapa);
      MAPAU.mapa.on('click focus', function () { MAPAU.mapa.scrollWheelZoom.enable(); });
      MAPAU.capa = L.geoJSON(MAPAU.geo).addTo(MAPAU.mapa);
      MAPAU.mapa.fitBounds(MAPAU.capa.getBounds(), { padding: [10, 10], animate: false });
    } else slot.appendChild(MAPAU.nodo);
    MAPAU.mapa.invalidateSize(false);
    var claves = {}, por = {}, sin = {};
    MAPAU.geo.features.forEach(function (f) { claves[MAPAU.llave(f.properties.fundo) + '|' + f.properties.lote_clave] = true; });
    l.forEach(function (r) {
      var k = MAPAU.llave(r.fundo) + '|' + MAPAU.loteClave(r.lote);
      if (!claves[k]) { var s = (r.fundo || '?') + ' · ' + (r.lote || 'sin lote'); sin[s] = (sin[s] || 0) + 1; return; }
      (por[k] = por[k] || { regs: [], fundo: r.fundo, lote: r.lote }).regs.push(r);
    });
    Object.keys(por).forEach(function (k) { por[k].o = RSU.resumir(por[k].regs); });
    var activos = [], C = MAPAU.COLORES;
    MAPAU.capa.eachLayer(function (capa) {
      var p = capa.feature.properties, k = MAPAU.llave(p.fundo) + '|' + p.lote_clave, d = por[k], o = d && d.o;
      var fuera = !!RSU.fundo && MAPAU.llave(RSU.fundo) !== MAPAU.llave(p.fundo);
      var color = !o ? C.vacio : (o.prom === null ? C.curso : (meta && o.prom > meta ? C.sobre : C.meta));
      capa.setStyle({ color: o && o.curso ? '#FFFFFF' : '#1B2A38', weight: o && o.curso ? 2.5 : 1, fillColor: color, fillOpacity: fuera ? 0.1 : (o ? 0.75 : 0.3), opacity: fuera ? 0.3 : 1 });
      var tip = '<b>Lote ' + DR.esc(p.lote_clave || p.lote_nombre) + '</b> · ' + DR.esc(p.fundo) + (p.area_ha ? '<br>' + DR.num(p.area_ha, 2) + ' ha' : '') + (p.variedades ? ' · ' + DR.esc(p.variedades) : '') +
        (o ? '<br>Ciclo de campo: <b>' + (o.prom === null ? 'en curso' : RSU.mmss(o.prom) + ' min:seg') + '</b><br>' + o.n + ' pallet(s)' + (o.curso ? ' · <b>' + o.curso + ' en curso</b>' : '') : '<br><i>Sin pallets en el filtro</i>');
      if (capa.getTooltip()) capa.setTooltipContent(tip); else capa.bindTooltip(tip, { sticky: true, className: 'mapa-tip' });
      capa.off('click').on('click', function () { if (por[k]) alTocar(por[k].fundo, por[k].lote); });
      if (o && !fuera) activos.push(capa);
    });
    var clave = [RSU.semana, RSU.dia, RSU.zona, RSU.fundo].join('|');
    if (clave !== MAPAU.clave) {
      MAPAU.clave = clave;
      var b = L.featureGroup(activos.length ? activos : MAPAU.capa.getLayers()).getBounds();
      if (b.isValid()) MAPAU.mapa.fitBounds(b, { padding: [14, 14], maxZoom: 16 });
    }
    var s = Object.keys(sin);
    DR.$('#mapaSin').innerHTML = s.length ? '<b>Sin polígono en el mapa:</b> ' + s.map(function (x) { return DR.esc(x) + ' (' + sin[x] + ')'; }).join(', ') : '';
  }).catch(function (e) { slot.innerHTML = '<div class="aviso">' + DR.esc(e.message) + '</div>'; });
};

/* ================================ EVOLUCIÓN (gráfico de líneas) ================================
 * Métrica: ciclo de campo, ciclo completo o cualquier etapa / espera. Eje: por día, por semana o
 * ciclo por ciclo (cada pallet en orden). Una línea por fundo (máx. 6) + todos; la meta punteada. */
RSU.evo = DR.leer('tcu.evo', null) || { met: 'ciclo', eje: 'dia' };
RSU.EVO_COLORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
RSU.metricas = function () {
  return [{ id: 'ciclo', t: 'Ciclo de campo', v: function (r, c) { return c.total; } },
    { id: 'completo', t: 'Ciclo completo (hasta abastecimiento)', v: function (r) { return r.pl ? r.pl.cicloCompleto : null; } }]
    .concat(RSU.TRAMOS.map(function (t) { return { id: t.id, t: t.t, v: t.v }; }));
};
RSU.evoHtml = function (l, meta) {
  var mets = RSU.metricas(), met = mets.filter(function (m) { return m.id === RSU.evo.met; })[0] || mets[0];
  var opt = function (v, t, sel) { return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  var ctl = '<div class="evo-ctl"><select id="evoMet">' + mets.map(function (m) { return opt(m.id, m.t, met.id); }).join('') + '</select>' +
    '<div class="acc-dim" style="margin:0">' + [['dia', 'Por día'], ['semana', 'Por semana'], ['pallet', 'Por ciclo']].map(function (e) {
      return '<button type="button" data-eje="' + e[0] + '" class="' + (RSU.evo.eje === e[0] ? 'activa' : '') + '">' + e[1] + '</button>'; }).join('') + '</div></div>';
  var pts = [];
  l.slice().sort(function (a, b) { return (a.fecha + (a.etapas.cos.ini || a.creado || '')).localeCompare(b.fecha + (b.etapas.cos.ini || b.creado || '')); }).forEach(function (r) {
    var c = TC.calcular(r);
    if (c.atipico || (c.total !== null && c.total < 0)) return;
    var v = met.v(r, c);
    if (v === null || v === undefined || isNaN(v)) return;
    pts.push({ r: r, v: Number(v), serie: r.fundo || 'Sin fundo' });
  });
  if (!pts.length) return ctl + '<div class="vacio">Sin datos de «' + DR.esc(met.t) + '» con estos filtros.</div>';
  var series = CAT.unicos(pts.map(function (p) { return p.serie; })).sort();
  var conTodos = series.length > 1 && RSU.evo.eje !== 'pallet';
  if (series.length > RSU.EVO_COLORES.length) series = series.slice(0, RSU.EVO_COLORES.length);
  var xs, val = {};
  if (RSU.evo.eje === 'pallet') {
    xs = pts.map(function (p, i) { return { k: String(i), etq: DR.fechaCorta(p.r.fecha).slice(0, 5) + ' ' + (p.r.pallet || '') }; });
    pts.forEach(function (p, i) { (val[p.serie] = val[p.serie] || {})[String(i)] = p.v; });
  } else {
    var clave = function (p) { return RSU.evo.eje === 'semana' ? String(TC.semana(p.r.fecha)).padStart(2, '0') : p.r.fecha; };
    var acc = {};
    pts.forEach(function (p) {
      var k = clave(p);
      [p.serie].concat(conTodos ? ['__todos'] : []).forEach(function (s) { acc[s] = acc[s] || {}; var a = acc[s][k] = acc[s][k] || [0, 0]; a[0] += p.v; a[1]++; });
    });
    Object.keys(acc).forEach(function (s) { val[s] = {}; Object.keys(acc[s]).forEach(function (k) { val[s][k] = acc[s][k][0] / acc[s][k][1]; }); });
    xs = CAT.unicos(pts.map(clave)).sort().map(function (k) { return { k: k, etq: RSU.evo.eje === 'semana' ? 'S' + Number(k) : DR.fechaCorta(k).slice(0, 5) }; });
  }
  var lineas = series.map(function (s, i) { return { s: s, color: RSU.EVO_COLORES[i], v: val[s] || {} }; });
  if (conTodos) lineas.push({ s: 'Todos los fundos', color: '#13263A', v: val.__todos, grueso: true });
  var refMeta = met.id === 'ciclo' && meta ? meta : null;
  var todosV = [];
  lineas.forEach(function (ln) { Object.keys(ln.v).forEach(function (k) { todosV.push(ln.v[k]); }); });
  var maxV = Math.max.apply(null, todosV.concat([refMeta || 0, 0.1])) * 1.1, minV = Math.min(0, Math.min.apply(null, todosV));
  var W = 640, H = 240, ml = 40, mr = 12, mt = 12, mb = 34, iw = W - ml - mr, ih = H - mt - mb;
  var X = function (i) { return ml + (xs.length === 1 ? iw / 2 : i * iw / (xs.length - 1)); };
  var Y = function (v) { return mt + ih - (v - minV) / (maxV - minV) * ih; };
  var svg = '<svg class="evo-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de ' + DR.esc(met.t) + '">';
  for (var g = 0; g <= 4; g++) {
    var gv = minV + (maxV - minV) * g / 4;
    svg += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '" class="evo-grid"/>' +
      '<text x="' + (ml - 6) + '" y="' + (Y(gv) + 4).toFixed(1) + '" class="evo-eje" text-anchor="end">' + RSU.mmss(gv) + '</text>';
  }
  var paso = Math.max(1, Math.ceil(xs.length / 8));
  xs.forEach(function (x, i) { if (i % paso === 0 || i === xs.length - 1) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 12) + '" class="evo-eje" text-anchor="middle">' + DR.esc(x.etq) + '</text>'; });
  if (refMeta) svg += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(refMeta).toFixed(1) + '" y2="' + Y(refMeta).toFixed(1) + '" class="evo-meta"/>' +
    '<text x="' + (W - mr) + '" y="' + (Y(refMeta) - 5).toFixed(1) + '" class="evo-eje" text-anchor="end">meta ' + refMeta + ' min</text>';
  lineas.forEach(function (ln) {
    var d = '', puntos = '';
    xs.forEach(function (x, i) {
      var v = ln.v[x.k];
      if (v === undefined) return;
      d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      puntos += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (ln.grueso ? 3.5 : 3) + '" fill="' + ln.color + '"><title>' + DR.esc(ln.s + ' · ' + x.etq + ': ' + RSU.mmss(v) + ' min:seg') + '</title></circle>';
    });
    svg += '<path d="' + d + '" fill="none" stroke="' + ln.color + '" stroke-width="' + (ln.grueso ? 2.6 : 1.8) + '"' + (ln.grueso ? ' stroke-dasharray="6 4"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>' + puntos;
  });
  svg += '</svg>';
  return ctl + '<div class="evo-ley">' + lineas.map(function (ln) { return '<span><i style="background:' + ln.color + '"></i>' + DR.esc(ln.s) + '</span>'; }).join('') + '</div>' + svg;
};

/* ================================ COPIAR LA TABLA DINÁMICA (para Outlook / Excel) ================================ */
RSU.copiarTabla = function () {
  var t = DR.$('#pivTablaU table');
  if (!t) return;
  var limpio = function (s) { return s.replace(/[▸▾] /g, ''); };
  var html = '<table border="1" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">' + limpio(t.innerHTML.replace(/ data-[a-z-]+="[^"]*"/g, '')) + '</table>';
  var texto = DR.$$('tr', t).map(function (tr) { return DR.$$('th,td', tr).map(function (c) { return limpio(c.textContent).trim(); }).join('\t'); }).join('\n');
  var ok = function () { DR.toast('Tabla copiada: pégala en Outlook o Excel.', 'ok'); };
  var mal = function () { DR.toast('No se pudo copiar.', 'error'); };
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })])
        .then(ok, function () { navigator.clipboard.writeText(texto).then(ok, mal); });
    } else navigator.clipboard.writeText(texto).then(ok, mal);
  } catch (e) { mal(); }
};
