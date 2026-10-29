/* ============================================================================
 * nucleo.js — UTILIDADES COMUNES (mismo patrón que las apps Integra)
 * anime.js va como build UMD precompilado (vendor/anime.min.js): no hay JSX ni
 * Babel, todo es JavaScript ES5 que el navegador ejecuta directamente.
 * ==========================================================================*/

/** Vistas de la app: cada archivo agrega la suya (VISTAS.resumen, VISTAS.registrar…). */
var VISTAS = {};

var DR = {
  VERSION: '1.3.0-integra',
  vista: null,
  anima: (typeof anime === 'function') &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
};

DR.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
DR.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

DR.esc = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
DR.num = function (v, dec) {
  var n = Number(v || 0);
  return n.toLocaleString('es-PE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 0 : dec });
};
DR.hoyISO = function () {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
DR.fechaCorta = function (f) {
  if (!f) return '—';
  var p = String(f).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f;
};
/** HH:MM local de un ISO. */
DR.hhmm = function (iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
/** Minutos entre dos ISO (1 decimal) o null. */
DR.minutos = function (a, b) {
  if (!a || !b) return null;
  var m = (new Date(b) - new Date(a)) / 60000;
  return isNaN(m) ? null : Math.round(m * 10) / 10;
};
/** «12,5 min» o «1 h 05 min». */
DR.dur = function (min) {
  if (min === null || min === undefined || isNaN(min)) return '—';
  if (Math.abs(min) < 60) return DR.num(min, 1) + ' min';
  var h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return h + ' h ' + String(m).padStart(2, '0') + ' min';
};
/** Cronómetro mm:ss / h:mm:ss desde un ISO. */
DR.crono = function (iso) {
  var s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
/** «hace 5 min», «hace 2 h». */
DR.hace = function (iso) {
  if (!iso) return '';
  var m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.floor(m / 60) + ' h' : 'hace ' + Math.floor(m / 1440) + ' d';
};
DR.sinTildes = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

/* ------------------------------ nativo (Capacitor, en la APK) ------------------------------ */
DR.nativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
DR.plugin = function (nombre) { return window.capacitorExports ? capacitorExports.registerPlugin(nombre) : null; };

/**
 * Entrega un archivo de texto (CSV, respaldo). En la APK lo guarda en Documentos y abre
 * «Compartir» (WhatsApp, correo, Drive…); en el navegador lo descarga.
 */
DR.entregarArchivo = function (nombre, texto, mime) {
  if (DR.nativo) {
    var Fs = DR.plugin('Filesystem'), Share = DR.plugin('Share'), guardado = '';
    return Fs.writeFile({ path: 'TiempoCicloUva/' + nombre, data: texto, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true })
      .then(function () { guardado = 'Documentos/TiempoCicloUva/' + nombre; }, function () { /* algunos Android no dejan escribir en Documentos */ })
      .then(function () { return Fs.writeFile({ path: nombre, data: texto, directory: 'CACHE', encoding: 'utf8' }); })
      .then(function (f) { return Share.share({ title: nombre, url: f.uri, dialogTitle: 'Guardar o enviar' }).catch(function () {}); })
      .then(function () { return guardado || nombre; });
  }
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: mime || 'text/plain;charset=utf-8' }));
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  return Promise.resolve(nombre);
};

/* ------------------------- almacenamiento local seguro ------------------------- */
DR.leer = function (k, def) {
  try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
};
DR.guardar = function (k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) {
    DR.toast('No se pudo guardar en el equipo (memoria llena o bloqueada).', 'error');
    return false;
  }
};

/* ------------------------------ avisos y animación ------------------------------ */
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

DR.entrarPaneles = function (raiz) {
  var nodos = DR.$$('.entra', DR.$(raiz));
  if (!DR.anima || document.hidden) { nodos.forEach(function (n) { n.style.opacity = 1; n.style.transform = 'none'; }); return; }
  anime.remove(nodos);
  anime({ targets: nodos, opacity: [0, 1], translateY: [16, 0], duration: 500, delay: anime.stagger(50), easing: 'easeOutQuad' });
};

DR.contar = function (el, valor, dec) {
  if (!el) return;
  if (!DR.anima || document.hidden) { el.textContent = DR.num(valor, dec); return; }
  var o = { v: 0 };
  anime({ targets: o, v: valor, duration: 900, easing: 'easeOutExpo', update: function () { el.textContent = DR.num(o.v, dec); } });
};

DR.vibrar = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) { /* sin vibración */ } };

/* ------------------------------ hoja inferior (sin alert/confirm) ------------------------------ */
DR.hoja = function (html, alAbrir) {
  var h = DR.$('#hoja'), c = DR.$('#hojaCaja');
  c.innerHTML = html;
  h.classList.remove('oculto');
  DR.$('#hojaFondo').onclick = DR.cerrarHoja;
  if (DR.anima) anime({ targets: c, translateY: ['100%', 0], duration: 360, easing: 'easeOutCubic' });
  if (alAbrir) alAbrir(c);
};
DR.cerrarHoja = function () { DR.$('#hoja').classList.add('oculto'); DR.$('#hojaCaja').innerHTML = ''; };
/** Confirmación propia: titulo, texto, rótulo del botón, acción. */
DR.confirmar = function (titulo, texto, boton, accion, peligro) {
  DR.hoja('<h3>' + DR.esc(titulo) + '</h3><p style="color:var(--texto-2);margin-bottom:16px">' + texto + '</p>' +
    '<div class="botones"><button class="btn" id="hNo" type="button">Cancelar</button>' +
    '<button class="btn ' + (peligro ? 'naranja' : 'primario') + '" id="hSi" type="button">' + DR.esc(boton) + '</button></div>', function () {
    DR.$('#hNo').onclick = DR.cerrarHoja;
    DR.$('#hSi').onclick = function () { DR.cerrarHoja(); accion(); };
  });
};

/* ------------------------------ íconos ------------------------------ */
DR.ICO = (function () {
  var s = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  return {
    inicio: s('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    registrar: s('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>'),
    registros: s('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
    resumen: s('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
    ayuda: s('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>'),
    config: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    play: s('<path d="M7 4l13 8-13 8z"/>'),
    stop: s('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    subir: s('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
    lupa: s('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    chevron: s('<path d="M6 9l6 6 6-6"/>'),
    descargar: s('<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
    check: s('<path d="M5 12l5 5L20 7"/>'),
    atras: s('<path d="M15 18l-6-6 6-6"/>'),
    adelante: s('<path d="M9 18l6-6-6-6"/>'),
    reloj: s('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M10 2h4"/>'),
    mas: s('<path d="M12 5v14M5 12h14"/>')
  };
})();
