/* ============================================================================
 * app.js — ARRANQUE DE RECEPCIÓN UVA (Ingeniería · Planta)
 * Vistas: #hoy (en vivo) y #reg/<id>. Accesos: planta.uva (planta.uva.recepcion registra).
 * ==========================================================================*/
DR.ir = function () {
  var h = location.hash.replace('#', '') || 'hoy', p = h.split('/');
  var cont = DR.$('#contenido');
  clearInterval(VIS._t);
  PL.alCambiar = null;
  cont.scrollTop = 0;
  if (p[0] === 'reg' && p[1]) { DR.vista = 'reg'; VIS.registro(cont, decodeURIComponent(p[1])); return; }
  DR.vista = 'hoy';
  VIS.hoy(cont);
};

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../../'; return; }
    if (!AT.tieneAcceso('planta.uva')) { location.href = '../../#planta'; return; }
    if (AT.vigilarHorario && !AT.vigilarHorario('planta.uva', '../../#planta')) return;
    DR.$('#slotLogo').innerHTML = '<a href="../../#planta" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
      DR.marcaSvg(42) + '<span class="texto">RECEPCIÓN · UVA</span></a>';
    DR.$('#chipDatos').onclick = function () { PL.enviar().then(function () { if (!PL.cola().length) DR.toast('Todo enviado a Integra.', 'ok'); }); };
    window.addEventListener('hashchange', DR.ir);
    window.addEventListener('online', function () { PL.enviar(); });
    window.addEventListener('offline', PL.estado);
    setInterval(PL.enviar, 30000);
    DR.$('#app').style.opacity = 1;
    PL.estado();
    PL.cargarConfig();
    PL.enviar();
    DR.ir();
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
