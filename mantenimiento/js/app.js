/* ============================================================================
 * app.js — ARRANQUE Y NAVEGACIÓN DEL MÓDULO REVISIÓN DEL PLAN DE MANTENIMIENTO
 * Exige sesión. Pestañas según rol y accesos del usuario: Resultados y Revisar (todos; visor solo
 * lectura), Cargar (admin y captura). Enlaces: #resultados, #revisar, #cargar.
 * ==========================================================================*/

DR.TABS = [
  { id: 'resultados', t: 'Resultados', c: '#0097CE', ver: function () { return AT.tieneAcceso('gestion.mtto.resultados'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="11" rx="1"/><rect x="15.5" y="9" width="3" height="8" rx="1"/></svg>' },
  { id: 'revisar', t: 'Revisar', c: '#76B729', ver: function () { return AT.tieneAcceso('gestion.mtto.revisar'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 11l2 2 4-4M8.5 17h7"/></svg>' },
  { id: 'cargar', t: 'Cargar plan', c: '#EF7C3B', ver: function () { return AT.puedeCapturar() && AT.tieneAcceso('gestion.mtto.cargar'); },
    ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' }
];

DR.tabsVisibles = function () { return DR.TABS.filter(function (t) { return t.ver(); }); };

DR.ir = function (vista) {
  var tabs = DR.tabsVisibles(), ids = tabs.map(function (t) { return t.id; });
  if (ids.indexOf(vista) < 0) vista = ids[0];
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
  DR.$$('.nav-btn', nav).forEach(function (b) {
    b.onclick = function () {
      var v = b.getAttribute('data-vista');
      if (v === 'revisar' && DR.vista === 'revisar') REV.abrir(null);  // segundo toque: volver a la lista
      else DR.ir(v);
    };
  });
}

function pintarBarraSup() {
  DR.$('#slotLogo').innerHTML = '<a href="../" class="logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
    DR.marcaSvg(42) + '<span class="texto">PLAN MTTO.</span></a>';
  DR.$('#chipDatos').classList.add('ok');
  DR.$('#chipTexto').textContent = (AT.perfil && AT.perfil.nombre) || '—';
}

function vistaInicial() {
  var h = (location.hash || '').replace('#', '');
  if (DR.tabsVisibles().some(function (t) { return t.id === h; })) return h;
  var ids = DR.tabsVisibles().map(function (t) { return t.id; });
  return AT.puedeCapturar() && ids.indexOf('revisar') > -1 ? 'revisar' : ids[0];
}

document.addEventListener('DOMContentLoaded', function () {
  AT.requiereSesion('../').then(function (perfil) {
    if (perfil.debe_cambiar_password) { location.href = '../'; return; }
    // Sin ninguna pestaña asignada (Config → Usuarios → Accesos): de vuelta a la portada.
    if (!DR.tabsVisibles().length) { location.href = '../'; return; }
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
