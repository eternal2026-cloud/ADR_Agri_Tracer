/* ============================================================================
 * mapa.js — MAPA DE LOTES DEL RESUMEN (Leaflet 1.9.4 local, vendor/leaflet)
 *   Polígonos de arándano de Agritracer (data/lotes_arandano.geojson, lo genera
 *   «10. Mapa Carencias GeoJSON/extraer_geojson.py --integra») coloreados con las mismas filas
 *   de fn_resumen_pivot_vivo que pinta la tabla dinámica: mismo ámbito (todas / semana / día) y
 *   mismo filtro de fundo.
 *     verde = promedio del lote ≤ meta · naranja = sobre la meta · azul = solo ciclos en curso
 *     gris = sin ciclos en el filtro · borde blanco pulsante = ciclos en curso (EN VIVO)
 *   Cruce: fundo + lote guardado (ya normalizado, 0045) contra lote_clave del polígono; si no hay
 *   polígono con ese lote exacto se usa su base (YA1C, YA1D → YA1). Lo que no cruza se lista abajo.
 *   El mapa se crea una sola vez: en cada repintado (en vivo cada 20 s) se mueve su nodo al panel
 *   nuevo y solo cambian los estilos, sin perder el zoom ni la posición.
 * ==========================================================================*/
var MAPA = { mapa: null, nodo: null, capa: null, geo: null, clave: null, _carga: null };

MAPA.COLORES = { meta: '#76B729', sobre: '#EF7C3B', curso: '#0097CE', vacio: '#8A7D70' };

MAPA.cargarGeo = function () {
  if (!MAPA._carga) {
    MAPA._carga = fetch('data/lotes_arandano.geojson', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('No se pudo leer el mapa de lotes (' + r.status + ')');
      return r.json();
    }).then(function (g) { MAPA.geo = g; return g; }).catch(function (e) { MAPA._carga = null; throw e; });
  }
  return MAPA._carga;
};

MAPA.panelHtml = function () {
  var c = MAPA.COLORES, ley = function (color, txt, cls) {
    return '<span class="mapa-ley' + (cls ? ' ' + cls : '') + '"><i style="background:' + color + '"></i>' + txt + '</span>';
  };
  // Sin la clase «entra»: la animación de entrada mueve el panel con transform y Leaflet
  // calcularía mal su tamaño (y el mapa se vería en blanco al hacer zoom).
  return '<section class="panel panel-mapa"><h2>Mapa de lotes · ' + DR.esc(RES.ambitoFundoTxt()) + '</h2>' +
    '<div class="sub">' + RES.vivoTxt() + ' Tiempo de ciclo promedio de cada lote frente a la meta de ' + DR.num(RES.meta, 0) +
    ' min. Toca un lote para ver sus ciclos.</div>' +
    '<div class="mapa-leyenda">' + ley(c.meta, 'En meta (≤ ' + DR.num(RES.meta, 0) + ' min)') + ley(c.sobre, 'Sobre la meta') +
    ley(c.curso, 'Solo en curso') + ley(c.vacio, 'Sin ciclos') + ley('transparent', 'Ciclos en curso', 'vivo') + '</div>' +
    '<div id="mapaSlot" class="mapa-slot"></div><div id="mapaSinPoligono"></div></section>';
};

/** Filas nivel 3 (lote) de fn_resumen_pivot_vivo → datos por polígono. */
MAPA.cruzar = function (filas, fundoPiv) {
  var claves = {};
  MAPA.geo.features.forEach(function (f) { claves[f.properties.fundo + '|' + f.properties.lote_clave] = true; });
  var por = {}, sin = [];
  filas.forEach(function (f) {
    if (f.nivel !== 3 || (fundoPiv && f.fundo !== fundoPiv) || !(f.n_muestras || f.n_en_curso)) return;
    var l = f.lote, base = l ? (l.match(/^[A-Z]+\d+/) || [null])[0] : null;
    var k = l && claves[f.fundo + '|' + l] ? f.fundo + '|' + l : (base && claves[f.fundo + '|' + base] ? f.fundo + '|' + base : null);
    if (!k) { sin.push(f); return; }
    var d = por[k] || (por[k] = { n: 0, c: 0, suma: 0, nT: 0, lotes: [] });
    var n = Number(f.n_muestras || 0), t = f.t_ciclo_total === null || f.t_ciclo_total === undefined ? null : Number(f.t_ciclo_total);
    d.n += n; d.c += Number(f.n_en_curso || 0);
    if (t !== null && n) { d.suma += t * n; d.nT += n; }
    d.lotes.push(f);
  });
  Object.keys(por).forEach(function (k) { por[k].t = por[k].nT ? por[k].suma / por[k].nT : null; });
  return { por: por, sin: sin };
};

MAPA.estilo = function (d, fuera) {
  var c = MAPA.COLORES;
  var color = !d ? c.vacio : (d.t === null ? c.curso : (d.t <= RES.meta ? c.meta : c.sobre));
  return { color: d && d.c ? '#FFFFFF' : '#1B1511', weight: d && d.c ? 2.5 : 1, fillColor: color,
    fillOpacity: fuera ? 0.12 : (d ? 0.72 : 0.35), opacity: fuera ? 0.35 : 1 };
};

MAPA.tip = function (p, d) {
  var h = '<b>Lote ' + DR.esc(p.lote_clave || p.lote_nombre) + '</b> · ' + DR.esc(p.fundo) +
    (p.area_ha ? '<br>' + DR.num(p.area_ha, 2) + ' ha' : '') + (p.variedades ? ' · ' + DR.esc(p.variedades) : '');
  if (!d) return h + '<br><i>Sin ciclos en ' + DR.esc(RES.ambitoTxt().toLowerCase()) + '</i>';
  h += '<br>Tiempo de ciclo: <b>' + (d.t === null ? 'sin ciclos cerrados' : UI.mmss(d.t) + ' min:seg') + '</b>' +
    (d.t === null ? '' : (d.t <= RES.meta ? ' · en meta' : ' · <b>' + UI.mmss(d.t - RES.meta) + ' sobre la meta</b>')) +
    '<br>' + DR.num(d.n) + ' ciclo(s) válidos' + (d.c ? ' · <b>' + d.c + ' en curso</b>' : '');
  if (d.lotes.length > 1) h += '<br>Incluye: ' + d.lotes.map(function (x) { return DR.esc(x.lote); }).join(', ');
  return h;
};

MAPA.crear = function () {
  MAPA.nodo = document.createElement('div');
  MAPA.nodo.className = 'mapa-lotes';
  DR.$('#mapaSlot').appendChild(MAPA.nodo);
  MAPA.mapa = L.map(MAPA.nodo, { zoomControl: true, scrollWheelZoom: false, renderer: L.svg({ padding: 0.5 }), attributionControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    // Esri no tiene imagen z18+ en la zona («Map data not yet available»): desde z17 se amplía.
    maxNativeZoom: 17, maxZoom: 19, attribution: 'Imágenes © Esri'
  }).addTo(MAPA.mapa);
  // La rueda solo hace zoom después de tocar el mapa: así la página sigue bajando con la rueda.
  MAPA.mapa.on('click focus', function () { MAPA.mapa.scrollWheelZoom.enable(); });
  MAPA.mapa.on('mouseout', function () { MAPA.mapa.scrollWheelZoom.disable(); });
  MAPA.capa = L.geoJSON(MAPA.geo, { style: function () { return MAPA.estilo(null); } }).addTo(MAPA.mapa);
  // Con vista desde el inicio, cada polígono ya tiene su <path> y se le puede marcar «en curso».
  MAPA.mapa.fitBounds(MAPA.capa.getBounds(), { padding: [12, 12], animate: false });
  window.addEventListener('resize', function () { if (MAPA.nodo.isConnected) MAPA.mapa.invalidateSize(); });
};

/** filas: las de fn_resumen_pivot_vivo del ámbito actual. */
MAPA.montar = function (filas) {
  var slot = DR.$('#mapaSlot');
  if (!slot) return;
  if (typeof L === 'undefined') { slot.innerHTML = '<div class="aviso">No cargó la librería del mapa.</div>'; return; }
  MAPA.cargarGeo().then(function () {
    if (!slot.isConnected) return;
    if (!MAPA.mapa) MAPA.crear(); else slot.appendChild(MAPA.nodo);
    MAPA.mapa.invalidateSize(false);
    var fundoPiv = RES.fundoPiv, x = MAPA.cruzar(filas, fundoPiv), activos = [];
    MAPA.capa.eachLayer(function (capa) {
      var p = capa.feature.properties, k = p.fundo + '|' + p.lote_clave, d = x.por[k], fuera = !!fundoPiv && p.fundo !== fundoPiv;
      capa.setStyle(MAPA.estilo(d, fuera));
      var el = capa.getElement();
      if (el) el.classList.toggle('mapa-vivo', !!(d && d.c));
      if (capa.getTooltip()) capa.setTooltipContent(MAPA.tip(p, d));
      else capa.bindTooltip(MAPA.tip(p, d), { sticky: true, className: 'mapa-tip' });
      capa.off('click').on('click', function () {
        var d2 = MAPA._ultimo && MAPA._ultimo.por[k];
        if (!d2) return;
        var mayor = d2.lotes.slice().sort(function (a, b) { return Number(b.n_muestras) - Number(a.n_muestras); })[0];
        var exacto = d2.lotes.filter(function (l) { return l.lote === p.lote_clave; })[0];
        RES.irMuestrasNorm(p.fundo, (exacto || mayor).lote);
      });
      if (!fuera) activos.push(capa);
    });
    MAPA._ultimo = x;
    // Solo se encuadra al cambiar de ámbito o de fundo; el refresco en vivo respeta el zoom del usuario.
    var clave = [RES.nivel, RES.semana, RES.dia, fundoPiv].join('|');
    if (clave !== MAPA.clave) {
      MAPA.clave = clave;
      var b = L.featureGroup(activos.length ? activos : MAPA.capa.getLayers()).getBounds();
      if (b.isValid()) MAPA.mapa.fitBounds(b, { padding: [12, 12] });
    }
    MAPA.sinPoligono(x.sin);
  }).catch(function (e) { slot.innerHTML = '<div class="aviso">' + DR.esc(e.message) + '</div>'; });
};

MAPA.sinPoligono = function (sin) {
  var caja = DR.$('#mapaSinPoligono');
  if (!caja) return;
  if (!sin.length) { caja.innerHTML = ''; return; }
  caja.innerHTML = '<div class="mapa-sin"><b>Sin polígono en el mapa:</b> ' + sin.map(function (f) {
    var n = Number(f.n_muestras || 0) + Number(f.n_en_curso || 0);
    return DR.esc(f.lote ? f.fundo + ' · ' + f.lote : f.fundo + ' · sin lote') + ' (' + n + ')';
  }).join(', ') + '</div>';
};
