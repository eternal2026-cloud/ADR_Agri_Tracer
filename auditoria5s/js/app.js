/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL MÓDULO AUDITORÍA 5S
 * Exige sesión. Pestañas según rol y accesos del usuario: Resultados y Observaciones (todos),
 * Auditar (admin y captura), Catálogo (admin). Enlaces: #auditar,
 * #observaciones, #resultados, #catalogo.
 * ==========================================================================*/

DR.TABS = [
  { id: 'resultados', t: 'Resultados', c: '#0097CE', ver: function () { return AT.tieneAcceso('gestion.5s.resultados'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="11" rx="1"/><rect x="15.5" y="9" width="3" height="8" rx="1"/></svg>' },
  { id: 'auditar', t: 'Auditar', c: '#76B729', ver: function () { return AT.puedeCapturar() && AT.tieneAcceso('gestion.5s.auditar'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 11l2 2 4-4M8.5 17h7"/></svg>' },
  { id: 'observaciones', t: 'Observaciones', c: '#EF7C3B', ver: function () { return AT.tieneAcceso('gestion.5s.observaciones'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>' },
  { id: 'catalogo', t: 'Catálogo', c: '#E8B04A', ver: function () { return AT.esAdmin(); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18" cy="6" r="2"/><circle cx="15" cy="18" r="2"/></svg>' }
];

DR.tabsVisibles = function () { return DR.TABS.filter(function (t) { return t.ver(); }); };

DR.ir = function (vista) {
  var tabs = DR.tabsVisibles(), ids = tabs.map(function (t) { return t.id; });
  if (ids.indexOf(vista) < 0) vista = ids[0];
  if (DR.vista === 'auditar') {
    if (!AUD.puedeSalir()) return;
    AUD.salir();
  }
  if (DR.$('#hoja') && !DR.$('#hoja').classList.contains('oculto')) UI.cerrarHoja();
  DR.vista = vista;
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  try { history.replaceState(null, '', '#' + vista); } catch (e) { /* sin history */ }
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;
  cont.innerHTML = '<div class="vacio">Cargando información…</div>';
  VISTAS[vista](cont);
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
  DR.$('#slotLogo').innerHTML = '<a href="../" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
    DR.marcaSvg(42) + '<span class="texto">AUDITORÍA 5S</span></a>';
  DR.$('#chipDatos').classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

function vistaInicial() {
  var h = (location.hash || '').replace('#', '');
  if (DR.tabsVisibles().some(function (t) { return t.id === h; })) return h;
  var ids = DR.tabsVisibles().map(function (t) { return t.id; });
  return ids.indexOf('auditar') > -1 ? 'auditar' : ids[0];
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../'; return; }
    // Sin ninguna pestaña asignada (Config → Usuarios → Accesos): de vuelta a la portada.
    if (!DR.tabsVisibles().length) { location.href = '../'; return; }
    pintarBarraSup();
    pintarNav();
    DR.$('#chipDatos').addEventListener('click', function () {
      if ((DR.vista === 'auditar' && !AUD.puedeSalir()) || !window.confirm('¿Cerrar la sesión en este dispositivo?')) return;
      AUD.sucio = false;
      AT.logout().then(function () { location.href = '../'; });
    });
    DR.$('#app').style.opacity = 1;
    DR.ir(vistaInicial());
  }).catch(function () { /* AT.requiereSesion ya redirige */ });
});
