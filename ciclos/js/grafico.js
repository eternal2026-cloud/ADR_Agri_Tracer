/* ============================================================================
 * grafico.js — Barras horizontales del Resumen: «Tiempo promedio por …»
 * (fundo, grupo de lote, lote, variedad…), como el tablero de uva.
 * Horizontales para que el nombre se lea completo; en celular pasa a otra línea.
 * La línea punteada es la meta (META_TIEMPO_CICLO_MIN). Al pasar el mouse (o tocar
 * una barra en el celular) un recuadro muestra el promedio, las muestras y los en curso.
 * ==========================================================================*/
var GRAFICO = {};

/** items: [{ etq, sub, valor (min o null), tip (html) }]. */
GRAFICO.barras = function (items, meta) {
  if (!items.length) return '<div class="vacio">Sin datos para graficar.</div>';
  meta = Number(meta) || 0;
  var max = Math.max(meta, items.reduce(function (m, i) { return Math.max(m, Number(i.valor) || 0); }, 0)) * 1.05 || 1;
  var pct = function (v) { return Math.max(0, Math.min(100, (Number(v) || 0) / max * 100)); };
  var linea = meta ? '<span class="gf-meta" style="left:' + pct(meta).toFixed(2) + '%"></span>' : '';

  var h = '<div class="gf-barras">';
  if (meta) {
    h += '<div class="gf-leyenda"><span class="gf-muestra-meta"></span>Meta ' + DR.num(meta, 0) + ' min' +
      '<span class="gf-muestra-barra"></span>Dentro de la meta<span class="gf-muestra-exceso"></span>Sobre la meta</div>';
  }
  items.forEach(function (it, i) {
    var sin = it.valor === null || it.valor === undefined, sobre = meta && !sin && it.valor > meta;
    h += '<div class="gf-fila" data-gf="' + i + '">' +
      '<div class="gf-nombre">' + DR.esc(it.etq) + (it.sub ? '<small>' + DR.esc(it.sub) + '</small>' : '') + '</div>' +
      '<div class="gf-pista">' + linea + '<span class="gf-barra' + (sobre ? ' sobre' : '') + '" data-ancho="' + (sin ? 0 : pct(it.valor)).toFixed(2) + '"></span></div>' +
      '<div class="gf-cifra">' + (sin ? '—' : DR.num(it.valor, 0) + ' <small>min</small>') + (sobre ? ' <span class="gf-alerta" aria-label="Sobre la meta">▲</span>' : '') + '</div>' +
    '</div>';
  });
  return h + '</div>';
};

/** Crece las barras de «raiz» y enlaza el recuadro de cada una (items en el mismo orden). */
GRAFICO.montar = function (raiz, items) {
  if (!raiz) return;
  var barras = DR.$$('.gf-barra', raiz);
  // Pestaña en segundo plano: requestAnimationFrame se pausa y las barras quedarían en 0.
  if (!DR.anima || document.hidden) barras.forEach(function (b) { b.style.width = b.getAttribute('data-ancho') + '%'; });
  else {
    anime.remove(barras);
    barras.forEach(function (b, i) {
      anime({ targets: b, width: ['0%', b.getAttribute('data-ancho') + '%'], duration: 700, delay: i * 35, easing: 'easeOutQuart' });
    });
  }
  DR.$$('.gf-fila', raiz).forEach(function (f) {
    var it = items[Number(f.getAttribute('data-gf'))];
    if (!it || !it.tip) return;
    f.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') GRAFICO.tip(it.tip, ev); });
    f.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') GRAFICO.ocultarTip(); });
    f.addEventListener('click', function (ev) {
      var t = GRAFICO._tip;
      if (t && t.classList.contains('visible') && GRAFICO._fila === f) { GRAFICO.ocultarTip(); return; }
      GRAFICO._fila = f;
      GRAFICO.tip(it.tip, ev);
    });
  });
};

GRAFICO.tip = function (html, ev) {
  var t = GRAFICO._tip;
  if (!t) {
    t = GRAFICO._tip = document.createElement('div');
    t.className = 'gf-tip'; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    DR.$('#contenido').addEventListener('scroll', GRAFICO.ocultarTip, { passive: true });
  }
  t.innerHTML = html;
  t.classList.add('visible');
  var x = ev.clientX + 14, y = ev.clientY + 14, w = t.offsetWidth, h = t.offsetHeight;
  if (x + w > window.innerWidth - 8) x = Math.max(8, ev.clientX - w - 14);
  if (y + h > window.innerHeight - 8) y = Math.max(8, ev.clientY - h - 14);
  t.style.left = x + 'px'; t.style.top = y + 'px';
};
GRAFICO.ocultarTip = function () {
  if (GRAFICO._tip) GRAFICO._tip.classList.remove('visible');
  GRAFICO._fila = null;
};
