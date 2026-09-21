/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL MÓDULO SATISFACCIÓN DEL CLIENTE INTERNO
 * Exige sesión. Pestañas según rol: Resultados (todos), Encuesta y Cargar
 * histórico (admin y captura), Evaluadores (admin: plantas y áreas que cada
 * usuario puede evaluar). Enlaces: #resultados, #encuesta, #evaluadores, #cargar.
 * ==========================================================================*/

DR.TABS = [
  { id: 'resultados', t: 'Resultados', c: '#0097CE', ver: function () { return true; },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 20 9.3l-3 9.2H7L4 9.3z"/><path d="M12 8.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" opacity=".55"/></svg>' },
  { id: 'encuesta', t: 'Encuesta', c: '#76B729', ver: function () { return AT.puedeCapturar(); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 11l2 2 4-4M8.5 17h7"/></svg>' },
  { id: 'evaluadores', t: 'Evaluadores', c: '#9085E9', ver: function () { return AT.esAdmin(); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><path d="m15.5 11 1.8 1.8 3.4-3.6"/></svg>' },
  { id: 'cargar', t: 'Cargar histórico', c: '#EF7C3B', ver: function () { return AT.puedeCapturar(); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' }
];

DR.tabsVisibles = function () { return DR.TABS.filter(function (t) { return t.ver(); }); };

DR.ir = function (vista) {
  var ids = DR.tabsVisibles().map(function (t) { return t.id; });
  if (ids.indexOf(vista) < 0) vista = ids[0];
  if (DR.$('#hoja') && !DR.$('#hoja').classList.contains('oculto')) UI.cerrarHoja();
  DR.vista = vista;
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  try { history.replaceState(null, '', '#' + vista); } catch (e) { /* sin history */ }
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;
  cont.innerHTML = '<div class="vacio">Cargando información…</div>';
  SCI.cargar().then(function () { VISTAS[vista](cont); }).catch(function (e) { UI.error(cont, e); });
};

DR.moverIndicador = function (vista) {
  var tabs = DR.tabsVisibles(), i = Math.max(0, tabs.map(function (t) { return t.id; }).indexOf(vista));
  var ind = DR.$('#navIndicador'), x = i * 100;
  DR.$('#navInf').style.setProperty('--acento-nav', tabs[i].c);
  if (DR.anima) anime({ targets: ind, translateX: x + '%', duration: 520, easing: 'easeOutElastic(1, .85)' });
  else ind.style.transform = 'translateX(' + x + '%)';
};

function pintarNav() {
  var tabs = DR.tabsVisibles(), nav = DR.$('#navInf');
  nav.style.gridTemplateColumns = 'repeat(' + tabs.length + ',1fr)';
  nav.classList.toggle('compacta', tabs.length > 3);
  DR.$('#navIndicador').style.width = (100 / tabs.length) + '%';
  nav.insertAdjacentHTML('beforeend', tabs.map(function (t) {
    return '<button class="nav-btn" data-vista="' + t.id + '" type="button">' + t.ico + '<span>' + t.t + '</span></button>';
  }).join(''));
  DR.$$('.nav-btn', nav).forEach(function (b) { b.onclick = function () { DR.ir(b.getAttribute('data-vista')); }; });
}

function pintarBarraSup() {
  DR.$('#slotLogo').innerHTML = '<a href="../#gestion" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
    DR.marcaSvg(42) + '<span class="texto largo">ENCUESTA DE SATISFACCIÓN CLIENTE INTERNO</span></a>';
  DR.$('#chipDatos').classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

function vistaInicial() {
  var h = (location.hash || '').replace('#', '');
  if (DR.tabsVisibles().some(function (t) { return t.id === h; })) return h;
  return 'resultados';
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../'; return; }
    pintarBarraSup();
    pintarNav();
    DR.$('#chipDatos').addEventListener('click', function () {
      if (!window.confirm('¿Cerrar la sesión en este dispositivo?')) return;
      AT.logout().then(function () { location.href = '../'; });
    });
    DR.$('#app').style.opacity = 1;
    DR.ir(vistaInicial());
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
