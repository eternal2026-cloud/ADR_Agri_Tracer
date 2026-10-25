/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL ESTUDIO DE COSECHADOR TOP
 * Ingeniería · Campo. Vistas: #evaluar (y #evaluar/<id>), #resumen, #propuesta.
 * Accesos: campo.top.evaluar (registra), campo.top.resumen, campo.top.propuesta.
 * ==========================================================================*/
var VISTAS = {
  evaluar: function (c) { EVAL.pintar(c); },
  resumen: function (c) { RES.pintar(c); },
  propuesta: function (c) { TOP.cargarCatalogos().then(function () { PROP.pintar(c); }).catch(function (e) { UI.error(c, e); }); }
};
DR.ORDEN = ['evaluar', 'resumen', 'propuesta'];
DR.COLOR = { evaluar: '#76B729', resumen: '#0097CE', propuesta: '#EF7C3B' };

DR.puedeVer = function (vista) {
  if (vista === 'evaluar') return AT.tieneAcceso('campo.top.evaluar');
  return AT.tieneAcceso('campo.top.' + vista);
};

DR.ir = function (vista) {
  if (DR.ORDEN.indexOf(vista) < 0 || !DR.puedeVer(vista)) vista = DR.ORDEN.filter(DR.puedeVer)[0];
  clearInterval(TIEMPOS._t);
  DR.vista = vista;
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  var h = location.hash.replace('#', '');
  if (h.split('/')[0] !== vista) { try { history.replaceState(null, '', '#' + vista); } catch (e) { /* sin history */ } }
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;
  cont.innerHTML = '<div class="vacio">Cargando información…</div>';
  VISTAS[vista](cont);
};

DR.moverIndicador = function (vista) {
  var ind = DR.$('#navIndicador');
  var x = DR.ORDEN.filter(DR.puedeVer).indexOf(vista) * 100;
  DR.$('#navInf').style.setProperty('--acento-nav', DR.COLOR[vista]);
  if (DR.anima) anime({ targets: ind, translateX: x + '%', duration: 520, easing: 'easeOutElastic(1, .85)' });
  else ind.style.transform = 'translateX(' + x + '%)';
};

/* ------------------------------------------------ versión nueva publicada (como ciclos/js/app.js)
 * El celular deja Integra abierta todo el día: cada 2 min y al volver a la pantalla se
 * compara el ETag de los scripts; si cambió y no hay un reloj corriendo, se recarga.
 * Los borradores (estándares, REBA, ergonomía) quedan en el celular y se recuperan. */
DR.SCRIPTS_VERSION = ['js/app.js', 'js/datos.js', 'js/tiempos.js', 'js/evaluar.js', 'js/cosechadores.js', 'js/estandares.js', 'js/reba.js', 'js/resumen.js'];
DR.firmaVersion = function () {
  return Promise.all(DR.SCRIPTS_VERSION.map(function (s) {
    return fetch(s, { method: 'HEAD', cache: 'no-store' }).then(function (r) { return r.headers.get('etag') || r.headers.get('last-modified') || ''; });
  })).then(function (l) { return l.join('|'); });
};
DR.vigilarVersion = function () {
  if (!window.fetch || location.protocol === 'file:') return;
  var base = null, pendiente = false;
  DR.firmaVersion().then(function (f) { base = f; }).catch(function () { /* sin señal */ });
  var revisar = function () {
    if (!base || document.visibilityState !== 'visible') return;
    DR.firmaVersion().then(function (f) {
      if (!f || f === base) return;
      // El reloj vive en localStorage y sobrevive la recarga; solo se espera si hay una hoja abierta.
      var ocupado = DR.$('#hoja') && !DR.$('#hoja').classList.contains('oculto');
      if (!ocupado) { location.reload(); return; }
      if (!pendiente) { pendiente = true; DR.toast('Hay una versión nueva de Integra: se actualizará en un momento.', 'info'); }
    }).catch(function () { /* sin señal: se reintenta */ });
  };
  setInterval(revisar, 120000);
  document.addEventListener('visibilitychange', revisar);
};

/* ------------------------------------------------ modo claro (mismo ajuste que Tiempos de ciclo) */
DR.TEMA = 'integra.ciclos.tema';
DR.ICONO_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
DR.ICONO_LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
DR.esClaro = function () { return document.documentElement.getAttribute('data-tema') === 'claro'; };
DR.ponerTema = function (claro) {
  if (claro) document.documentElement.setAttribute('data-tema', 'claro'); else document.documentElement.removeAttribute('data-tema');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', claro ? '#FFFFFF' : '#0B0908');
  try { localStorage.setItem(DR.TEMA, claro ? 'claro' : 'oscuro'); } catch (e) { /* sin almacenamiento */ }
  var b = DR.$('#btnTema');
  if (b) { b.innerHTML = claro ? DR.ICONO_LUNA : DR.ICONO_SOL; b.title = claro ? 'Fondo oscuro' : 'Fondo claro (para ver a pleno sol)'; b.setAttribute('aria-label', b.title); }
};

function pintarBarraSup() {
  DR.$('#slotLogo').innerHTML = '<a href="../../#campo" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
    DR.marcaSvg(42) + '<span class="texto">ESTUDIO · TOP</span></a>';
  var tema = document.createElement('button');
  tema.type = 'button'; tema.id = 'btnTema'; tema.className = 'tema-btn';
  DR.$('#barraSup').insertBefore(tema, DR.$('#chipDatos'));
  tema.onclick = function () { DR.ponerTema(!DR.esClaro()); };
  DR.ponerTema(DR.esClaro());
  DR.$('#chipDatos').classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../../'; return; }
    if (!DR.ORDEN.some(DR.puedeVer)) { location.href = '../../#campo'; return; }
    pintarBarraSup();
    DR.$$('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#' + b.getAttribute('data-vista'); }); });
    DR.ORDEN.forEach(function (v) { if (!DR.puedeVer(v)) DR.$('[data-vista="' + v + '"]').classList.add('oculto'); });
    var nVistas = DR.ORDEN.filter(DR.puedeVer).length;
    DR.$('#navInf').style.gridTemplateColumns = 'repeat(' + nVistas + ',1fr)';
    DR.$('#navIndicador').style.width = (100 / nVistas) + '%';
    DR.$('#chipDatos').addEventListener('click', function () {
      if (!window.confirm('¿Cerrar la sesión en este dispositivo?')) return;
      AT.logout().then(function () { location.href = '../../'; });
    });
    // #evaluar/<id> y los botones de la barra inferior navegan por hash.
    window.addEventListener('hashchange', function () { DR.ir((location.hash.replace('#', '') || 'evaluar').split('/')[0]); });
    // Al recuperar la señal se suben las tomas que quedaron en el celular.
    window.addEventListener('online', function () { TIEMPOS.subirPendientes(true); });

    DR.$('#app').style.opacity = 1;
    var h = (location.hash.replace('#', '') || '').split('/')[0];
    DR.ir(DR.ORDEN.indexOf(h) > -1 ? h : (AT.perfil.rol === 'visor' ? 'resumen' : 'evaluar'));
    DR.vigilarVersion();
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
