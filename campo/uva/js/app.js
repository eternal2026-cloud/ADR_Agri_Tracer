/* ============================================================================
 * app.js — ARRANQUE (Integra): sesión de Integra en lugar del nombre de la APK,
 * navegación y estado. Sin señal se entra con el último perfil guardado en el equipo
 * (la sesión de Supabase vive en el celular) y los registros suben al volver la señal.
 * ==========================================================================*/

var APP = {};

APP.NAV = [['inicio', 'Inicio'], ['registrar', 'Registrar'], ['registros', 'Registros'], ['ayuda', 'Ayuda'], ['config', 'Config']];

APP.ir = function (vista, sinAnimar) {
  clearInterval(DR._tick);
  if (vista !== 'registrar' && window.REG) REG.quitarBarra();
  DR.vista = vista;
  DR.$$('#navInf button').forEach(function (b) { b.classList.toggle('activa', b.getAttribute('data-v') === vista); });
  var c = DR.$('#contenido');
  if (!sinAnimar) c.scrollTop = 0;
  VISTAS[vista](c);
  APP.estado();
};

/** Chip superior y globito de pendientes en la barra inferior. */
APP.estado = function () {
  var pend = TC.registros().filter(TC.pendiente).length;
  var chip = DR.$('#chipDatos'), txt;
  chip.classList.remove('ok', 'alerta');
  if (!SHEETS.hayRed()) { txt = 'Sin conexión'; if (pend) txt += ' · ' + pend + ' por subir'; chip.classList.add('alerta'); }
  else if (SHEETS.subiendo) txt = 'Subiendo…';
  else if (pend) { txt = 'En línea · ' + pend + ' por subir'; chip.classList.add('alerta'); }
  else { txt = 'En línea'; chip.classList.add('ok'); }
  DR.$('#chipTexto').textContent = txt;
  var b = DR.$('#navInf [data-v="registros"] .badge');
  if (b) { b.textContent = pend; b.classList.toggle('oculto', !pend); }
};

APP.iniciarApp = function () {
  DR.$('#navInf').innerHTML = APP.NAV.map(function (n) {
    return '<button type="button" data-v="' + n[0] + '">' + DR.ICO[n[0]] + '<span>' + n[1] + '</span>' + (n[0] === 'registros' ? '<b class="badge oculto"></b>' : '') + '</button>';
  }).join('');
  DR.$$('#navInf button').forEach(function (b) { b.onclick = function () { DR.vibrar(6); APP.ir(b.getAttribute('data-v')); }; });
  DR.$('#chipDatos').onclick = function () { APP.ir('registros'); };
  window.addEventListener('online', function () { APP.estado(); DR.toast('Volvió la señal.', 'info'); SHEETS.auto(); });
  window.addEventListener('offline', APP.estado);
  // Al volver a la app (desde otra app o al encender la pantalla) se sube lo pendiente.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { APP.estado(); SHEETS.auto(); } });
  setInterval(function () { APP.estado(); SHEETS.auto(); }, 2 * 60000);
  APP.enlazarAtras();
  ALERTAS.iniciar();

  DR.$('#app').style.opacity = 1;
  APP.ir('inicio');
  SHEETS.auto();
};

/** Botón «atrás» de Android: cierra la hoja; fuera de Inicio vuelve a Inicio; en Inicio minimiza. */
APP.enlazarAtras = function () {
  if (!DR.nativo) return;
  var App = DR.plugin('App');
  App.addListener('backButton', function () {
    if (DR.$('#splash').style.display !== 'none') { App.exitApp(); return; }
    if (!DR.$('#hoja').classList.contains('oculto')) { DR.cerrarHoja(); return; }
    if (DR.vista !== 'inicio') { APP.ir('inicio'); return; }
    App.minimizeApp().catch(function () { App.exitApp(); });
  });
  App.addListener('resume', function () { APP.estado(); SHEETS.auto(); });
};

/* ------------------------------ sesión de Integra ------------------------------ */
APP.PERFIL = 'tcu.perfil';
APP.sesion = function () {
  return sb.auth.getSession().then(function (r) {
    var ses = r.data && r.data.session;
    if (!ses) return null;
    return AT.cargarPerfil().then(function (p) {
      DR.guardar(APP.PERFIL, p);
      return p;
    }, function () {
      // Sin señal (o señal débil): el último perfil de este mismo usuario guardado en el equipo.
      // Todo lo que se sube lo vuelve a validar el servidor; si la sesión venció, la subida lo avisa.
      var p = DR.leer(APP.PERFIL, null);
      if (p && p.id === ses.user.id) { AT.perfil = p; return p; }
      return null;
    });
  }, function () { return null; });
};

document.addEventListener('DOMContentLoaded', function () {
  APP.sesion().then(function (perfil) {
    if (!perfil) { location.href = '../../'; return; }
    if (perfil.debe_cambiar_password) { location.href = '../../'; return; }
    if (!AT.tieneAcceso('campo.uva')) { location.href = '../../#campo'; return; }
    if (navigator.onLine && AT.vigilarHorario && !AT.vigilarHorario('campo.uva', '../../#campo')) return;
    TC.cfg.usuario = perfil.nombre || perfil.usuario || 'Integra';
    TC.cfg.sheets.auto = true;
    TC.guardarCfg();
    var listo = function () { APP.iniciarApp(); };
    // El catálogo se refresca al entrar; sin señal se usa el guardado (o el de fábrica).
    if (navigator.onLine) PERM.cargar().then(listo, listo); else listo();
  });
});
