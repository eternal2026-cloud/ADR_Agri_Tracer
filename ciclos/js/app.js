/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL MÓDULO TIEMPOS DE CICLO
 * Exige sesión (viene siempre desde la puerta de entrada "/"); sin ella,
 * redirige. Sin splash propio: entra directo a la vista del enlace
 * (#resumen, #captura, #config, #usuarios, #sheets…) o a la de su rol.
 * ==========================================================================*/

DR.ORDEN = ['resumen', 'captura', 'config'];
DR.COLOR = { resumen: '#0097CE', captura: '#76B729', config: '#EF7C3B' };

DR.ir = function (vista) {
  if (vista === 'captura' && !AT.puedeCapturar()) vista = 'resumen';
  if (vista === 'config' && !AT.esAdmin()) vista = 'resumen';
  if (DR.ORDEN.indexOf(vista) < 0) vista = 'resumen';
  if (DR.vista === 'captura') {
    if (!CAPTURA.puedeSalir()) return;
    CAPTURA.quitarBarra();
    CAPTURA.vista = 'lista';
    CAPTURA.sucio = false;
  }
  DR.vista = vista;
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  if (vista !== 'config' || !/^#(usuarios|listas|sheets|ajustes)$/.test(location.hash)) {
    try { history.replaceState(null, '', '#' + vista); } catch (e) { /* sin history */ }
  }
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;
  cont.innerHTML = '<div class="vacio">Cargando información…</div>';
  (VISTAS[vista] || VISTAS.resumen)(cont);
};

DR.moverIndicador = function (vista) {
  var ind = DR.$('#navIndicador');
  var x = DR.ORDEN.indexOf(vista) * 100;
  DR.$('#navInf').style.setProperty('--acento-nav', DR.COLOR[vista]);
  if (DR.anima) anime({ targets: ind, translateX: x + '%', duration: 520, easing: 'easeOutElastic(1, .85)' });
  else ind.style.transform = 'translateX(' + x + '%)';
};

function vistaInicial() {
  var h = (location.hash || '').replace('#', '');
  if (['usuarios', 'listas', 'sheets', 'ajustes'].indexOf(h) > -1) { CONFIG.tab = h; return 'config'; }
  if (DR.ORDEN.indexOf(h) > -1) return h;
  return AT.perfil && AT.perfil.rol === 'captura' ? 'captura' : 'resumen';
}

function pintarBarraSup() {
  // Tiempos de ciclo es la Toma de tiempos campo de arándano (portada › Ingeniería · Campo).
  DR.$('#slotLogo').innerHTML = '<a href="../#campo" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
    DR.marcaSvg(42) + '<span class="texto">TIEMPOS · ARÁNDANO</span></a>';
  DR.$('#chipDatos').classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../'; return; }
    pintarBarraSup();
    DR.$$('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { DR.ir(b.getAttribute('data-vista')); }); });
    if (!AT.puedeCapturar()) DR.$('[data-vista="captura"]').classList.add('oculto');
    if (!AT.esAdmin()) DR.$('[data-vista="config"]').classList.add('oculto');
    DR.$('#chipDatos').addEventListener('click', function () {
      if (!CAPTURA.puedeSalir() || !window.confirm('¿Cerrar la sesión en este dispositivo?')) return;
      AT.logout().then(function () { location.href = '../'; });
    });

    DR.$('#app').style.opacity = 1;
    DR.ir(vistaInicial());
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
