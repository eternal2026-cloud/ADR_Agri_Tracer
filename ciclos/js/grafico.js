/* ============================================================================
 * grafico.js — Barras horizontales: tiempo de ciclo total por fundo.
 * Horizontales para que el nombre del fundo se lea completo (antes, en barras
 * verticales, se cortaba a 9 letras). En celular el nombre pasa a otra línea.
 * ==========================================================================*/
var GRAFICO = {};

GRAFICO.barrasFundo = function (items, umbral) {
  if (!items.length) return '<div class="vacio">Sin datos para graficar.</div>';
  umbral = Number(umbral) || 0;
  var max = Math.max(umbral, items.reduce(function (m, i) { return Math.max(m, Number(i.valor) || 0); }, 0)) * 1.05 || 1;
  var pct = function (v) { return Math.max(0, Math.min(100, (Number(v) || 0) / max * 100)); };
  var linea = umbral ? '<span class="gf-umbral" style="left:' + pct(umbral).toFixed(2) + '%"></span>' : '';

  var h = '<div class="gf-barras">';
  if (umbral) {
    h += '<div class="gf-leyenda"><span class="gf-muestra-umbral"></span>Umbral ' + DR.num(umbral, 0) + ' min' +
      '<span class="gf-muestra-exceso"></span>Supera el umbral</div>';
  }
  items.forEach(function (it) {
    var sobre = umbral && it.valor > umbral;
    var titulo = it.etq + ': ' + DR.num(it.valor, 1) + ' min' + (sobre ? ' · supera el umbral' : '');
    h += '<div class="gf-fila" title="' + DR.esc(titulo) + '">' +
      '<div class="gf-nombre">' + DR.esc(it.etq) + '</div>' +
      '<div class="gf-pista">' + linea + '<span class="gf-barra' + (sobre ? ' sobre' : '') + '" data-ancho="' + pct(it.valor).toFixed(2) + '"></span></div>' +
      '<div class="gf-cifra">' + DR.num(it.valor, 0) + (sobre ? ' <span class="gf-alerta" aria-label="Supera el umbral">▲</span>' : '') + '</div>' +
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
