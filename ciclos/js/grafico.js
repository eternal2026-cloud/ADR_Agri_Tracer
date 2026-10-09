/* ============================================================================
 * grafico.js — Barras horizontales: tiempo de ciclo total por fundo.
 * Horizontales para que el nombre del fundo se lea completo (antes, en barras
 * verticales, se cortaba a 9 letras). En celular el nombre pasa a otra línea.
 * La línea punteada es la meta (META_TIEMPO_CICLO_MIN); el umbral ya no se dibuja.
 * ==========================================================================*/
var GRAFICO = {};

GRAFICO.barrasFundo = function (items, meta) {
  if (!items.length) return '<div class="vacio">Sin datos para graficar.</div>';
  meta = Number(meta) || 0;
  var max = Math.max(meta, items.reduce(function (m, i) { return Math.max(m, Number(i.valor) || 0); }, 0)) * 1.05 || 1;
  var pct = function (v) { return Math.max(0, Math.min(100, (Number(v) || 0) / max * 100)); };
  var linea = meta ? '<span class="gf-meta" style="left:' + pct(meta).toFixed(2) + '%"></span>' : '';

  var h = '<div class="gf-barras">';
  if (meta) {
    h += '<div class="gf-leyenda"><span class="gf-muestra-meta"></span>Meta ' + DR.num(meta, 0) + ' min' +
      '<span class="gf-muestra-exceso"></span>Sobre la meta</div>';
  }
  items.forEach(function (it) {
    var sobre = meta && it.valor > meta;
    var titulo = it.etq + ': ' + DR.num(it.valor, 1) + ' min' + (sobre ? ' · sobre la meta' : '');
    h += '<div class="gf-fila" title="' + DR.esc(titulo) + '">' +
      '<div class="gf-nombre">' + DR.esc(it.etq) + '</div>' +
      '<div class="gf-pista">' + linea + '<span class="gf-barra' + (sobre ? ' sobre' : '') + '" data-ancho="' + pct(it.valor).toFixed(2) + '"></span></div>' +
      '<div class="gf-cifra">' + DR.num(it.valor, 0) + (sobre ? ' <span class="gf-alerta" aria-label="Sobre la meta">▲</span>' : '') + '</div>' +
    '</div>';
  });
  return h + '</div>';
};

GRAFICO.animarBarrasFundo = function () {
  DR.$$('.gf-barra').forEach(function (b, i) {
    var ancho = b.getAttribute('data-ancho') + '%';
    if (DR.anima) anime({ targets: b, width: ['0%', ancho], duration: 800, delay: i * 40, easing: 'easeOutQuart' });
    else b.style.width = ancho;
  });
};
