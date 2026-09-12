/* ============================================================================
 * app.js — ARRANQUE, UNIDAD DE INICIO Y NAVEGACIÓN (Reubicación de Personal)
 * Idéntico en espíritu a REUBICACION_FOTOCHECK: no exige login (fricción cero
 * en campo). Si el visitante ya tiene sesión (vino desde la puerta de entrada
 * con cuenta admin), se detecta en segundo plano para habilitar "Datos".
 * ==========================================================================*/

DR.ORDEN = ['escaner', 'personal', 'datos'];
DR.COLOR = { escaner: '#E37E3B', personal: '#579BCB', datos: '#8FBD38' };

function animarInicio() {
  if (!DR.anima) {
    ['#splashFondo', '#etiquetaApp', '#tituloApp', '#sedeApp', '#btnIngresar'].forEach(function (s) { DR.$(s).style.opacity = 1; });
    DR.$('#splashFondo').style.opacity = .5;
    DR.$('#marcaAgua').style.opacity = .05;
    return;
  }
  var texto = DR.$('#textoDR');
  texto.innerHTML = texto.textContent.split('').map(function (ch) { return "<span class='ltr'>" + (ch === ' ' ? '&nbsp;' : ch) + '</span>'; }).join('');
  anime.set(['.lg-azul', '.lg-naranja', '.lg-verde', '.ltr', '#bajadaDR'], { opacity: 0 });
  anime.timeline({ easing: 'easeOutExpo' })
    .add({ targets: '#splashFondo', opacity: [0, .5], scale: [1.12, 1], duration: 2200 })
    .add({ targets: '#marcaAgua', opacity: [0, .045], scale: [.85, 1], duration: 1800 }, 100)
    .add({ targets: '.lg-azul', opacity: [0, 1], translateX: [-90, 0], duration: 900 }, 250)
    .add({ targets: '.lg-naranja', opacity: [0, 1], scale: [0, 1], duration: 1100, easing: 'easeOutElastic(1, .7)' }, 450)
    .add({ targets: '.lg-verde', opacity: [0, 1], translateX: [90, 0], duration: 900 }, 650)
    .add({ targets: '.ltr', opacity: [0, 1], translateY: [16, 0], duration: 700, delay: anime.stagger(38) }, 900)
    .add({ targets: '#bajadaDR', opacity: [0, 1], letterSpacing: ['0.6em', '0.30em'], duration: 900 }, 1500)
    .add({ targets: '#etiquetaApp', opacity: [0, 1], translateY: [10, 0], duration: 700 }, 1700)
    .add({ targets: '#tituloApp', opacity: [0, 1], translateY: [10, 0], duration: 700 }, 1820)
    .add({ targets: '#sedeApp', opacity: [0, 1], duration: 700 }, 1940)
    .add({ targets: '#btnIngresar', opacity: [0, 1], scale: [.9, 1], duration: 700 }, 2060);
  anime({ targets: '#barraCarga', width: ['0%', '85%'], duration: 2600, easing: 'easeInOutQuad' });
  setTimeout(function () {
    DR.$$('#splashFondo, .lg-forma, .ltr, #bajadaDR, #etiquetaApp, #tituloApp, #sedeApp, #btnIngresar').forEach(function (el) {
      if (Number(getComputedStyle(el).opacity) < 0.05) { el.style.opacity = el.id === 'splashFondo' ? .5 : 1; el.style.transform = 'none'; }
    });
  }, 3500);
}

function entrarAplicacion() {
  var boton = DR.$('#btnIngresar');
  if (boton.disabled) return;
  boton.disabled = true;
  DR.desbloquearAudio();

  var app = DR.$('#app'), logo = DR.$('#logoDR'), slot = DR.$('#slotLogo'), marca = DR.$('#marcaDR');
  var ANCHO = 46;
  var rLogo = logo.getBoundingClientRect(), rMarca = marca.getBoundingClientRect(), rSlot = slot.getBoundingClientRect();
  var escala = ANCHO / rMarca.width;
  var cx = rLogo.left + rLogo.width / 2, cy = rLogo.top + rLogo.height / 2;
  var ox = (rMarca.left + rMarca.width / 2) - cx, oy = (rMarca.top + rMarca.height / 2) - cy;
  var dx = (rSlot.left + ANCHO / 2) - cx - ox * escala;
  var dy = (rSlot.top + rSlot.height / 2) - cy - oy * escala;

  var terminado = false, linea = null;
  if (!DR.anima) { finalizar(); return; }
  anime({ targets: '#barraCarga', width: '100%', duration: 400, easing: 'easeOutQuad' });
  setTimeout(finalizar, 2600);

  linea = anime.timeline({ easing: 'easeInOutQuart' })
    .add({ targets: '#etiquetaApp, #tituloApp, #sedeApp, #btnIngresar', opacity: 0, translateY: -12, duration: 420, delay: anime.stagger(40) })
    .add({ targets: '#textoDR, #bajadaDR', opacity: 0, duration: 320 }, 100)
    .add({ targets: '#logoDR', translateX: dx, translateY: dy, scale: escala, duration: 1000 }, 260)
    .add({ targets: '#splashFondo, #splashVelo, #marcaAgua', opacity: 0, duration: 800 }, 480)
    .add({
      targets: '#app', opacity: [0, 1], duration: 600,
      begin: function () {
        anime({ targets: '#navInf', translateY: [40, 0], opacity: [0, 1], duration: 700, easing: 'easeOutQuart' });
        anime({ targets: '.nav-btn', opacity: [0, 1], translateY: [14, 0], duration: 600, delay: anime.stagger(80, { start: 200 }), easing: 'easeOutQuart' });
      }
    }, 880)
    .add({ targets: '#splash', opacity: 0, duration: 420, complete: finalizar }, 1180);

  function finalizar() {
    if (terminado) return;
    terminado = true;
    if (linea) linea.pause();
    DR.$$('#navInf, .nav-btn').forEach(function (n) { n.style.opacity = 1; n.style.transform = 'none'; });
    var l = DR.$('#logoDR');
    l.style.transform = 'none';
    slot.appendChild(l);
    DR.$('#splash').style.display = 'none';
    app.style.opacity = 1;
    var t = DR.$('#textoDR');
    if (DR.anima) anime({ targets: t, opacity: [0, 1], translateX: [-10, 0], duration: 600, easing: 'easeOutQuad' });
    else t.style.opacity = 1;
    DR.ir('escaner');
  }
}

DR.ir = function (vista) {
  if (DR.ORDEN.indexOf(vista) < 0) vista = 'escaner';
  var anterior = DR.vista;
  DR.vista = vista;
  if (anterior === 'escaner' && vista !== 'escaner') ESCANER.detener(true);
  DR.$$('.vista').forEach(function (v) { v.classList.toggle('oculto', v.id !== 'vista-' + vista); });
  DR.$$('.nav-btn').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-vista') === vista); });
  DR.moverIndicador(vista);
  DR.$('#contenido').scrollTop = 0;
  if (VISTAS[vista]) VISTAS[vista]();
  if (anterior !== vista) DR.entrarPaneles('#vista-' + vista);
  if (vista === 'escaner') ESCANER.iniciar();
};

DR.moverIndicador = function (vista) {
  var ind = DR.$('#navIndicador');
  var x = DR.ORDEN.indexOf(vista) * 100;
  ind.style.setProperty('--acento-nav', DR.COLOR[vista]);
  if (DR.anima) anime({ targets: ind, translateX: x + '%', duration: 520, easing: 'easeOutElastic(1, .85)' });
  else ind.style.transform = 'translateX(' + x + '%)';
};

DR.pintarChip = function () {
  var chip = DR.$('#chipDatos'), txt = DR.$('#chipDatos span');
  chip.classList.remove('ok', 'alerta');
  if (DATOS.lista) { chip.classList.add('ok'); txt.textContent = DR.num(DATOS.lista.filas.length) + ' en lista'; }
  else { chip.classList.add('alerta'); txt.textContent = 'Sin lista'; }
  if (DR.anima) anime({ targets: chip, scale: [.92, 1], duration: 500, easing: 'easeOutBack' });
};

document.addEventListener('DOMContentLoaded', function () {
  animarInicio();
  DR.$('#btnIngresar').addEventListener('click', entrarAplicacion);
  DR.$$('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { DR.ir(b.getAttribute('data-vista')); }); });
  DR.$('#chipDatos').addEventListener('click', function () { DR.ir('datos'); });

  ESCANER.enlazar();
  RESULTADO.enlazar();
  VISTAS.enlazar();

  DATOS.alCambiar(function () {
    DR.pintarChip();
    if (DR.vista === 'personal') VISTAS.personal();
    if (DR.vista === 'datos') VISTAS.datos();
    if (DR.vista === 'escaner' && ESCANER.estado === 'activo' && !ESCANER.bloqueado) {
      DR.$('#visorEstado').textContent = DATOS.lista ? 'Buscando código…' : 'Sin lista cargada';
    }
  });

  // Sesión (si vino ya logueado desde la puerta de entrada) y lista, en paralelo a la animación.
  AT.sesionInicial().catch(function () { return null; });
  DATOS.cargarInicial().catch(function (err) { console.warn('Lista no disponible:', err && err.message); });
  DATOS.vaciarCola();
  VISTAS.pintarHistorial();
});
