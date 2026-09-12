/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL MÓDULO TIEMPOS DE CICLO
 * Exige sesión (viene siempre desde la puerta de entrada "/"); sin ella,
 * redirige. Sin splash propio: entra directo al tablero.
 * ==========================================================================*/

DR.ORDEN = ['resumen', 'captura', 'config'];
DR.COLOR = { resumen: '#579BCB', captura: '#8FBD38', config: '#B7A99C' };

DR.ir = function (vista) {
  if (vista === 'captura' && !AT.puedeCapturar()) vista = 'resumen';
  if (vista === 'config' && !AT.esAdmin()) vista = 'resumen';
  if (DR.ORDEN.indexOf(vista) < 0) vista = 'resumen';
  DR.vista = vista;
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;
  cont.innerHTML = '<div class="vacio">Cargando información…</div>';
  var render = VISTAS[vista] || VISTAS.resumen;
  render(cont);
};

DR.moverIndicador = function (vista) {
  var ind = DR.$('#navIndicador');
  var x = DR.ORDEN.indexOf(vista) * 100;
  ind.style.setProperty('--acento-nav', DR.COLOR[vista]);
  if (DR.anima) anime({ targets: ind, translateX: x + '%', duration: 520, easing: 'easeOutElastic(1, .85)' });
  else ind.style.transform = 'translateX(' + x + '%)';
};

function pintarBarraSup() {
  var slot = DR.$('#slotLogo');
  slot.innerHTML = '<a href="../" class="logo" style="display:flex;align-items:center;gap:8px;text-decoration:none">' +
    '<svg class="marca" width="34" viewBox="0 0 626 300"><path d="M150,0 A150,150 0 0 0 150,300 Z" fill="#579BCB"/><circle cx="272" cy="192" r="98" fill="#E37E3B"/><path d="M360,300 A132,132 0 0 1 624,300 Z" fill="#8FBD38"/></svg>' +
    '<span class="texto">TIEMPOS DE CICLO</span></a>';
  var chip = DR.$('#chipDatos');
  chip.classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../').then(function () {
    pintarBarraSup();
    DR.$$('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { DR.ir(b.getAttribute('data-vista')); }); });
    if (!AT.puedeCapturar()) DR.$('[data-vista="captura"]').classList.add('oculto');
    if (!AT.esAdmin()) DR.$('[data-vista="config"]').classList.add('oculto');
    DR.$('#chipDatos').addEventListener('click', function () { AT.logout().then(function () { location.href = '../'; }); });

    DR.$('#app').style.opacity = 1;
    DR.ir('resumen');
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
