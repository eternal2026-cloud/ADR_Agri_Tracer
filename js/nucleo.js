/* ============================================================================
 * nucleo.js — UTILIDADES COMUNES (idéntico a REUBICACION_FOTOCHECK/js/nucleo.js)
 * anime.js se carga como build UMD precompilado: no hay JSX ni Babel,
 * todo es JavaScript ES5 que el navegador ejecuta directamente.
 * ==========================================================================*/

var DR = {
  vista: null,
  anima: (typeof anime === 'function') &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
};

DR.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
DR.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

DR.num = function (v, dec) {
  var n = Number(v || 0);
  return n.toLocaleString('es-PE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 0 : dec });
};
DR.esc = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
DR.recortar = function (s, n) { s = String(s || ''); return s.length > n ? s.substring(0, n - 1) + '…' : s; };

DR.hora = function (t) {
  var d = new Date(t), hoy = new Date();
  var h = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return h;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + h;
};
DR.fechaHora = function (iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
};

/** Carga un script una sola vez (bajo demanda). */
DR._scripts = {};
DR.cargarScript = function (src) {
  if (!DR._scripts[src]) {
    DR._scripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        delete DR._scripts[src];
        s.parentNode.removeChild(s);
        reject(new Error('No se pudo descargar un componente de la app. Revisa tu conexión.'));
      };
      document.head.appendChild(s);
    });
  }
  return DR._scripts[src];
};

DR.toast = function (msg, tipo) {
  var t = DR.$('#toast');
  if (!t) return;
  t.textContent = msg;
  t.style.borderLeftColor = tipo === 'error' ? '#EF7C3B' : (tipo === 'info' ? '#0097CE' : '#76B729');
  clearTimeout(DR._toastT);
  if (DR.anima) {
    anime.remove(t);
    anime({ targets: t, opacity: [0, 1], translateY: [14, 0], duration: 320, easing: 'easeOutCubic' });
    DR._toastT = setTimeout(function () { anime({ targets: t, opacity: 0, duration: 420, easing: 'easeInCubic' }); }, 3400);
  } else {
    t.style.opacity = 1;
    DR._toastT = setTimeout(function () { t.style.opacity = 0; }, 3400);
  }
};

/** Entrada animada de los bloques marcados con .entra dentro de una vista. */
DR.entrarPaneles = function (raiz) {
  var nodos = DR.$$('.entra', DR.$(raiz)).filter(function (n) { return !n.classList.contains('oculto'); });
  // Pestaña en segundo plano: el navegador pausa requestAnimationFrame y los paneles quedarían en opacidad 0.
  if (!DR.anima || document.hidden) { nodos.forEach(function (n) { n.style.opacity = 1; n.style.transform = 'none'; }); return; }
  anime.remove(nodos);
  anime({ targets: nodos, opacity: [0, 1], translateY: [16, 0], duration: 520, delay: anime.stagger(55), easing: 'easeOutQuad' });
};

/** Contador animado para cifras. */
DR.contar = function (el, valor) {
  if (!el) return;
  if (!DR.anima) { el.textContent = DR.num(valor); return; }
  var o = { v: 0 };
  anime({ targets: o, v: valor, round: 1, duration: 900, easing: 'easeOutExpo', update: function () { el.textContent = DR.num(o.v); } });
};

/* ------------------------------ sonido y vibración ------------------------------ */
DR.audio = null;
DR.desbloquearAudio = function () {
  try {
    if (!DR.audio) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) DR.audio = new Ctx();
    }
    if (DR.audio && DR.audio.state === 'suspended') DR.audio.resume();
  } catch (e) { /* sin audio */ }
};
DR.sonar = function (ok) {
  var a = DR.audio;
  if (!a) return;
  try {
    var notas = ok ? [880, 1320] : [320, 220];
    notas.forEach(function (fr, i) {
      var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * 0.12;
      o.type = ok ? 'sine' : 'square';
      o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(ok ? 0.25 : 0.08, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + 0.13);
    });
  } catch (e) { /* sin audio */ }
};
DR.vibrar = function (patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* sin vibración */ }
};

/* ------------------------------ íconos compartidos ------------------------------ */
DR.ICONOS = {
  check: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/>' +
    '<path class="trazo" d="M9.5 16.5l4.5 4.5 8.5-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alerta: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/>' +
    '<path class="trazo" d="M16 9v9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="22.5" r="1.7" fill="currentColor"/></svg>',
  checkChico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  alertaChico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v8"/><circle cx="12" cy="18.5" r=".6" fill="currentColor"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  subir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>'
};

/** Isotipo oficial Don Ricardo: D azul (lado recto a la izquierda) · círculo naranja · medio sol verde. */
DR.marcaSvg = function (ancho) {
  return '<svg class="marca" width="' + ancho + '" viewBox="0 0 650 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M0,0 A150,150 0 0 1 0,300 Z" fill="#0097CE"/><circle cx="262" cy="188" r="112" fill="#EF7C3B"/>' +
    '<path d="M350,300 A150,150 0 0 1 650,300 Z" fill="#76B729"/></svg>';
};

/** Íconos SVG de cultivo (autónomos: sirven en pantalla, en la portada y para el PDF). */
DR.iconoCultivo = function (icono, color, tam) {
  var c = color || '#76B729', t = tam || 28, hoja = '#76B729', cuerpo;
  if (icono === 'arandano') {
    cuerpo = '<path d="M36 13c5-7 14-8 19-4-5 5-12 7-19 4z" fill="' + hoja + '"/>' +
      '<circle cx="42" cy="41" r="14" fill="' + c + '" opacity=".8"/>' +
      '<circle cx="24" cy="37" r="16" fill="' + c + '"/>' +
      '<circle cx="18" cy="31" r="4.5" fill="#fff" opacity=".28"/>' +
      '<path d="M18.5 25l3 1.6 2.5-3.6 2.5 3.6 3-1.6-1 4.2h-9z" fill="#1B2347" opacity=".78"/>' +
      '<path d="M41 31.6l2.4 1.3 2-2.9 2 2.9 2.4-1.3-.8 3.3h-7.2z" fill="#1B2347" opacity=".62"/>';
  } else if (icono === 'uva') {
    cuerpo = '<path d="M33 4v10" stroke="#5D4835" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M34 10c5-6 14-7 19-3-5 5-13 7-19 3z" fill="' + hoja + '"/>' +
      [[19, 22], [33, 22], [47, 22], [26, 34], [40, 34], [33, 46], [19, 34], [47, 34], [26, 46], [40, 46], [33, 57]]
        .filter(function (p, i) { return i < 6 || i === 10; })
        .map(function (p) {
          return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="' + c + '"/><circle cx="' + (p[0] - 2.4) + '" cy="' + (p[1] - 2.4) + '" r="1.8" fill="#fff" opacity=".35"/>';
        }).join('');
  } else if (icono === 'citrico') {
    cuerpo = '<path d="M34 13c3-7 11-9 16-7-2 6-9 9-16 7z" fill="' + hoja + '"/>' +
      '<circle cx="32" cy="36" r="23" fill="' + c + '"/>' +
      '<circle cx="32" cy="36" r="18" fill="#FFE2BF"/>' +
      '<path d="M32 18v36M14 36h36M19.3 23.3l25.4 25.4M44.7 23.3L19.3 48.7" stroke="' + c + '" stroke-width="2.6" opacity=".85"/>' +
      '<circle cx="32" cy="36" r="3.5" fill="#FFF4E6"/>';
  } else {
    cuerpo = '<path d="M11 53C11 28 27 12 53 11c0 26-15 42-42 42z" fill="' + c + '"/>' +
      '<path d="M13 51L43 21" stroke="#fff" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>';
  }
  return '<svg class="cultivo-ico" width="' + t + '" height="' + t + '" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + cuerpo + '</svg>';
};

/** "hace 5 min", "hace 2 h 10 min", "hace 3 d". */
DR.hace = function (iso) {
  var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (isNaN(min)) return '';
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  var h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
  return 'hace ' + Math.floor(h / 24) + ' d';
};
