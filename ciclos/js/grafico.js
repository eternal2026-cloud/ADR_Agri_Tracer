/* ============================================================================
 * grafico.js — SVG de barras verticales, tiempo de ciclo total por fundo
 * (mismo patrón que VISOR_TIEMPO_CICLO/Grafico.html)
 * ==========================================================================*/
var GRAFICO = {};

GRAFICO.barrasFundo = function (items, umbral) {
  if (!items.length) return '<div class="vacio">Sin datos para graficar.</div>';
  var alto = 200, base = 26, pad = 30;
  var ancho = Math.max(560, items.length * 66);
  var max = Math.max(Number(umbral) || 0, items.reduce(function (m, i) { return Math.max(m, i.valor); }, 0)) * 1.08 || 1;
  var escala = function (v) { return (alto - base) * (v / max); };

  var svg = '<div class="grafico" style="width:100%;overflow-x:auto"><svg viewBox="0 0 ' + ancho + ' ' + (alto + 30) + '" preserveAspectRatio="xMinYMid meet" style="display:block;min-width:520px">';
  if (umbral) {
    var y = alto - base - escala(umbral);
    svg += '<line x1="0" y1="' + y + '" x2="' + ancho + '" y2="' + y + '" stroke="#B94A02" stroke-width="1.4" stroke-dasharray="6,5"/>';
    svg += '<text x="6" y="' + (y - 6) + '" fill="#B94A02" font-size="10">Umbral ' + Math.round(umbral) + ' min</text>';
  }
  items.forEach(function (it, i) {
    var w = 34, x = pad + i * (ancho - pad) / items.length;
    var h = escala(it.valor), y2 = alto - base - h;
    svg += '<rect class="gf-barra" data-y="' + y2 + '" data-h="' + h + '" x="' + x + '" y="' + (alto - base) + '" width="' + w + '" height="0" rx="4" fill="' + (umbral && it.valor > umbral ? '#B94A02' : '#579BCB') + '"></rect>';
    svg += '<text x="' + (x + w / 2) + '" y="' + (alto - base + 16) + '" text-anchor="middle" font-size="9" fill="#B7A99C">' + DR.esc(String(it.etq).substring(0, 9)) + '</text>';
    svg += '<text x="' + (x + w / 2) + '" y="' + (y2 - 6) + '" text-anchor="middle" font-size="9.5" fill="#F1EBE4">' + DR.num(it.valor, 0) + '</text>';
  });
  svg += '</svg></div>';
  return svg;
};

GRAFICO.animarBarrasFundo = function () {
  DR.$$('.gf-barra').forEach(function (r) {
    var y = r.getAttribute('data-y'), h = r.getAttribute('data-h');
    if (DR.anima) anime({ targets: r, y: y, height: h, duration: 800, easing: 'easeOutQuart' });
    else { r.setAttribute('y', y); r.setAttribute('height', h); }
  });
};
