/* ============================================================================
 * escaner.js — CÁMARA, LECTURA DEL FOTOCHECK Y HOJA DE RESULTADO
 * html5-qrcode (UMD precompilado) usa el lector nativo del celular
 * (BarcodeDetector) cuando existe y ZXing como respaldo.
 * ==========================================================================*/

var ESCANER = {
  LIB: '../vendor/html5-qrcode.min.js',
  lector: null,
  estado: 'apagado',            // apagado | iniciando | activo
  bloqueado: false,             // true mientras se muestra un resultado
  ultimo: { texto: '', t: 0 },
  torch: null,
  linterna: false,
  volverAlMostrar: false,
  anims: [],

  // Segundo lector de QR (jsQR) sobre la zona del recuadro: más tolerante a fotochecks
  // borrosos o con impresión de bajo contraste. Prueba un tamaño distinto en cada pasada.
  LIB_QR: '../vendor/jsQR.js',
  ZONA: { ancho: 0.82, alto: 0.62 },      // igual que .visor-marco en estilos.css
  INTENTOS: [[480, 1], [360, 1], [600, 1], [420, 1.2], [540, 1.2], [320, 1.2]],  // [ancho del lienzo, zona / recuadro]
  intentoQR: 0,
  temporizadorQR: null,
  escalaCover: 1,                         // px de pantalla por px de cámara
  escalaVideo: 1                          // factor de resolución del <video>
};

ESCANER.formatos = function () {
  var F = Html5QrcodeSupportedFormats;
  return [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.EAN_13, F.CODABAR];
};

ESCANER.enlazar = function () {
  DR.$('#btnCamara').addEventListener('click', function () { DR.desbloquearAudio(); ESCANER.iniciar(); });
  DR.$('#btnApagar').addEventListener('click', function () { ESCANER.detener(); });
  DR.$('#btnLinterna').addEventListener('click', ESCANER.alternarLinterna);
  // los eventos de video no burbujean: se escuchan en fase de captura
  DR.$('#lector').addEventListener('loadedmetadata', ESCANER.ajustarVideo, true);

  DR.$('#formManual').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var inp = DR.$('#inpDni'), v = inp.value.trim();
    if (!v) { DR.toast('Escribe el DNI del trabajador.', 'error'); inp.focus(); return; }
    DR.desbloquearAudio();
    inp.blur();
    inp.value = '';
    RESULTADO.mostrar(DATOS.buscar(v), 'manual');
  });

  // Libera la cámara cuando la app pasa a segundo plano y la retoma al volver.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (ESCANER.estado !== 'apagado') { ESCANER.volverAlMostrar = true; ESCANER.detener(true); }
    } else if (ESCANER.volverAlMostrar) {
      ESCANER.volverAlMostrar = false;
      if (DR.vista === 'escaner' && !RESULTADO.abierta) ESCANER.iniciar();
    }
  });
};

/* ------------------------------ ciclo de la cámara ------------------------------ */
ESCANER.iniciar = function () {
  if (ESCANER.estado !== 'apagado') return;
  if (!window.isSecureContext) {
    ESCANER.pintarError('La cámara solo funciona con un enlace seguro (https://). Abre la app desde su enlace de Vercel.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    ESCANER.pintarError('Este navegador no permite usar la cámara. Usa Chrome o Safari actualizados, o escribe el DNI abajo.');
    return;
  }

  ESCANER.estado = 'iniciando';
  ESCANER.pintarReposo('Encendiendo cámara…', false);

  DR.cargarScript(ESCANER.LIB).then(function () {
    DR.cargarScript(ESCANER.LIB_QR).catch(function () { /* opcional: sin él sigue html5-qrcode */ });
    if (!ESCANER.lector) {
      ESCANER.lector = new Html5Qrcode('lector', {
        formatsToSupport: ESCANER.formatos(),
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      });
    }
    return ESCANER.lector.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        disableFlip: true,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }]
        }
      },
      ESCANER.alLeer,
      function () { /* cuadro sin código: se ignora */ }
    );
  }).then(function () {
    if (DR.vista !== 'escaner' || ESCANER.estado !== 'iniciando') { ESCANER.estado = 'activo'; ESCANER.detener(); return; }
    ESCANER.estado = 'activo';
    ESCANER.bloqueado = RESULTADO.abierta;
    clearInterval(ESCANER.temporizadorQR);
    ESCANER.temporizadorQR = setInterval(ESCANER.pasadaQR, 260);
    ESCANER.pintarActivo();
    ESCANER.prepararLinterna();
  }).catch(function (err) {
    ESCANER.estado = 'apagado';
    ESCANER.pintarError(ESCANER.explicar(err));
  });
};

ESCANER.detener = function (silencioso) {
  clearInterval(ESCANER.temporizadorQR);
  ESCANER.temporizadorQR = null;
  ESCANER.pararAnimaciones();
  var lector = ESCANER.lector;
  var eraActivo = ESCANER.estado === 'activo';
  ESCANER.estado = 'apagado';
  ESCANER.torch = null;
  ESCANER.linterna = false;
  if (!silencioso) ESCANER.pintarReposo('Cámara apagada. Actívala para seguir escaneando.', true);
  else ESCANER.pintarReposo('Activa la cámara y apunta al código del fotocheck.', true);
  if (lector && eraActivo) {
    try { lector.stop().catch(function () { /* ya detenido */ }); } catch (e) { /* ya detenido */ }
  }
};

/**
 * html5-qrcode copia el cuadro COMPLETO de la cámara a un lienzo del tamaño del
 * <video> en pantalla. Si ese tamaño no respeta la proporción de la cámara, la
 * imagen se deforma y el QR deja de leerse. Aquí el video conserva su proporción,
 * cubre el visor (lo que sobra queda recortado) y se dibuja a mayor tamaño con
 * scale() para que el lienzo tenga hasta el doble de resolución.
 * Corre en "loadedmetadata", antes de que la librería mida el video ("playing").
 */
ESCANER.ajustarVideo = function (ev) {
  var v = ev.target;
  if (!v || v.tagName !== 'VIDEO' || !v.videoWidth || !v.videoHeight) return;
  var visor = DR.$('#visor');
  var W = visor.clientWidth, H = visor.clientHeight;
  var s = Math.max(W / v.videoWidth, H / v.videoHeight);        // escala "cover" en px de pantalla
  var dw = v.videoWidth * s, dh = v.videoHeight * s;
  var k = Math.max(1, Math.min(2, v.videoWidth / dw));          // factor de resolución del lienzo
  ESCANER.escalaCover = s;
  ESCANER.escalaVideo = k;
  var fijar = function (prop, valor) { v.style.setProperty(prop, valor, 'important'); };
  fijar('width', Math.round(dw * k) + 'px');
  fijar('height', Math.round(dh * k) + 'px');
  fijar('left', Math.round((W - dw) / 2) + 'px');
  fijar('top', Math.round((H - dh) / 2) + 'px');
  fijar('transform', 'scale(' + (1 / k) + ')');
  fijar('transform-origin', '0 0');
};

/** Pasada de jsQR sobre la zona del recuadro, con contraste estirado; alterna tamaño y amplitud de zona. */
ESCANER.pasadaQR = function () {
  if (ESCANER.estado !== 'activo' || ESCANER.bloqueado || typeof jsQR !== 'function') return;
  var v = DR.$('#lector video');
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  var visor = DR.$('#visor'), s = ESCANER.escalaCover || 1;
  var intento = ESCANER.INTENTOS[ESCANER.intentoQR++ % ESCANER.INTENTOS.length];
  var zw = Math.min(v.videoWidth, visor.clientWidth * ESCANER.ZONA.ancho * intento[1] / s);
  var zh = Math.min(v.videoHeight, visor.clientHeight * ESCANER.ZONA.alto * intento[1] / s);
  var w = intento[0], h = Math.round(zh * w / zw);
  var c = ESCANER.lienzoQR || (ESCANER.lienzoQR = document.createElement('canvas'));
  c.width = w; c.height = h;
  var g = c.getContext('2d', { willReadFrequently: true });
  try {
    g.drawImage(v, (v.videoWidth - zw) / 2, (v.videoHeight - zh) / 2, zw, zh, 0, 0, w, h);
    var datos = g.getImageData(0, 0, w, h);
    ESCANER.estirarContraste(datos.data);
    var r = jsQR(datos.data, w, h, { inversionAttempts: 'dontInvert' });
    if (r && r.data) ESCANER.alLeer(r.data);
  } catch (e) { /* cuadro no disponible */ }
};

/** Pasa a gris y reparte el rango de luz (percentiles 5–95): ayuda con tinta marrón o reflejos del porta-fotocheck. */
ESCANER.estirarContraste = function (px) {
  var n = px.length / 4, paso = Math.max(1, Math.floor(n / 3000)), m = [], i, p, y;
  for (i = 0; i < n; i += paso) { p = i * 4; m.push(px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114); }
  m.sort(function (a, b) { return a - b; });
  var lo = m[Math.floor(m.length * 0.05)], rango = Math.max(1, m[Math.floor(m.length * 0.95)] - lo);
  for (p = 0; p < px.length; p += 4) {
    y = ((px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) - lo) * 255 / rango;
    px[p] = px[p + 1] = px[p + 2] = y < 0 ? 0 : (y > 255 ? 255 : y);
  }
};

ESCANER.pausar = function () {
  ESCANER.bloqueado = true;
  if (ESCANER.estado !== 'activo') return;
  try {
    if (ESCANER.lector.getState() === Html5QrcodeScannerState.SCANNING) ESCANER.lector.pause(true);
  } catch (e) { /* sin pausa */ }
  ESCANER.pararAnimaciones();
  DR.$('#visorEstado').textContent = 'En pausa';
};

ESCANER.continuar = function () {
  ESCANER.ultimo.t = Date.now();
  ESCANER.bloqueado = false;
  if (ESCANER.estado !== 'activo') return;
  try {
    if (ESCANER.lector.getState() === Html5QrcodeScannerState.PAUSED) ESCANER.lector.resume();
  } catch (e) { /* sin reanudar */ }
  ESCANER.pintarActivo();
};

ESCANER.alLeer = function (texto) {
  if (ESCANER.bloqueado || !texto) return;
  // evita mostrar dos veces el mismo fotocheck si sigue frente a la cámara
  if (texto === ESCANER.ultimo.texto && Date.now() - ESCANER.ultimo.t < 3500) return;
  ESCANER.ultimo = { texto: texto, t: Date.now() };
  RESULTADO.mostrar(DATOS.buscar(texto), 'escaner');
};

ESCANER.explicar = function (err) {
  var s = String(err && (err.message || err.name) ? (err.name || '') + ' ' + (err.message || '') : err);
  if (/NotAllowed|Permission|denied/i.test(s)) {
    return 'No hay permiso para usar la cámara. Toca el ícono junto a la dirección web, permite "Cámara" y vuelve a intentar.';
  }
  if (/NotFound|not found|DevicesNotFound/i.test(s)) return 'No se encontró una cámara en este equipo. Puedes escribir el DNI abajo.';
  if (/NotReadable|Could not start|in use|TrackStart/i.test(s)) return 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.';
  if (/descargar/i.test(s)) return s;
  return 'No se pudo encender la cámara. ' + DR.recortar(s, 120);
};

/* ------------------------------ linterna ------------------------------ */
ESCANER.prepararLinterna = function () {
  var btn = DR.$('#btnLinterna');
  btn.classList.add('oculto');
  btn.classList.remove('activo');
  try {
    var t = ESCANER.lector.getRunningTrackCameraCapabilities().torchFeature();
    if (t.isSupported()) { ESCANER.torch = t; btn.classList.remove('oculto'); }
  } catch (e) { /* sin linterna */ }
};

ESCANER.alternarLinterna = function () {
  if (!ESCANER.torch) return;
  var encender = !ESCANER.linterna;
  ESCANER.torch.apply(encender).then(function () {
    ESCANER.linterna = encender;
    DR.$('#btnLinterna').classList.toggle('activo', encender);
  }).catch(function () { DR.toast('No se pudo cambiar la linterna.', 'error'); });
};

/* ------------------------------ estados visuales ------------------------------ */
ESCANER.pintarReposo = function (mensaje, conBoton) {
  var reposo = DR.$('#visorReposo');
  reposo.classList.remove('oculto', 'error');
  DR.$('#visorMarco').classList.add('oculto');
  DR.$('#visorPie').classList.add('oculto');
  DR.$('#visorMensaje').textContent = mensaje;
  var btn = DR.$('#btnCamara');
  btn.textContent = 'Activar cámara';
  btn.classList.toggle('oculto', !conBoton);
  if (DR.anima && !conBoton) {
    ESCANER.anims.push(anime({ targets: '#reposoIcono', scale: [1, 1.08], opacity: [1, .6], direction: 'alternate', loop: true, duration: 700, easing: 'easeInOutSine' }));
  }
};

ESCANER.pintarError = function (mensaje) {
  ESCANER.pararAnimaciones();
  ESCANER.pintarReposo(mensaje, true);
  DR.$('#visorReposo').classList.add('error');
  DR.$('#btnCamara').textContent = 'Reintentar';
};

ESCANER.pintarActivo = function () {
  ESCANER.pararAnimaciones();
  DR.$('#visorReposo').classList.add('oculto');
  DR.$('#visorMarco').classList.remove('oculto');
  DR.$('#visorPie').classList.remove('oculto');
  DR.$('#visorEstado').textContent = DATOS.lista ? 'Buscando código…' : 'Sin lista cargada';
  if (!DR.anima) return;
  ESCANER.anims.push(anime({ targets: '.esq', opacity: [0, 1], scale: [1.35, 1], duration: 600, delay: anime.stagger(60), easing: 'easeOutBack' }));
  ESCANER.anims.push(anime({ targets: '#laser', top: ['6%', '94%'], direction: 'alternate', loop: true, duration: 1500, easing: 'easeInOutSine' }));
  ESCANER.anims.push(anime({ targets: '.punto', opacity: [1, .25], direction: 'alternate', loop: true, duration: 650, easing: 'linear' }));
};

ESCANER.pararAnimaciones = function () {
  ESCANER.anims.forEach(function (a) { a.pause(); });
  ESCANER.anims = [];
  if (DR.anima) anime.remove(['#reposoIcono', '.esq', '#laser', '.punto']);
  var icono = DR.$('#reposoIcono');
  if (icono) { icono.style.transform = ''; icono.style.opacity = ''; }
};

/* ============================================================================
 * HOJA DE RESULTADO
 * ==========================================================================*/
var RESULTADO = { abierta: false, origen: null };

RESULTADO.FORMAS = {
  linea: '<svg class="res-forma" viewBox="0 0 150 300" aria-hidden="true"><path d="M150,0 A150,150 0 0 0 150,300 Z"/></svg>',
  lado: '<svg class="res-forma" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98"/></svg>',
  labor: '<svg class="res-forma" viewBox="0 0 264 132" aria-hidden="true"><path d="M0,132 A132,132 0 0 1 264,132 Z"/></svg>'
};

RESULTADO.enlazar = function () {
  DR.$('#hojaVelo').addEventListener('click', function () { RESULTADO.cerrar(); });
  // botón "atrás" del celular cierra la hoja en lugar de salir de la app
  window.addEventListener('popstate', function () { if (RESULTADO.abierta) RESULTADO.cerrar(true); });
};

/** Quita el prefijo "LÍNEA" para mostrar el número en grande. */
RESULTADO.valorLinea = function (v) {
  var resto = String(v || '').replace(/^\s*L[IÍ]NEA\s*(N[°º]\s*)?/i, '').trim();
  return resto || v;
};

RESULTADO.mapaLado = function (lado) {
  var n = DATOS.normalizar(lado);
  var izq = /IZQ/.test(n), der = /DER/.test(n);
  if (!izq && !der) return '';
  return '<svg class="lado-mapa" viewBox="0 0 120 44" aria-hidden="true">' +
    '<rect class="zona' + (izq ? ' on' : '') + '" x="1" y="3" width="42" height="38" rx="7"/>' +
    '<rect class="zona' + (der ? ' on' : '') + '" x="77" y="3" width="42" height="38" rx="7"/>' +
    '<rect class="banda" x="48" y="0" width="24" height="44" rx="3"/>' +
    '<path class="flecha" d="M54 20l6-6 6 6M54 32l6-6 6 6"/>' +
    '<circle class="persona-pto" cx="' + (izq ? 22 : 98) + '" cy="22" r="6"/></svg>';
};

RESULTADO.item = function (clase, titulo, valor, extra) {
  var v = valor || '—';
  // las casillas de línea y lado son angostas: el tamaño de letra depende del largo del texto
  var limite = clase === 'labor' ? 18 : 8;
  var tam = v.length <= 3 ? ' enorme' : (v.length > limite ? ' largo' : '');
  return '<div class="res-item ' + clase + '">' + RESULTADO.FORMAS[clase] +
    '<b>' + titulo + '</b>' +
    '<span class="res-valor' + tam + '">' + DR.esc(v) + '</span>' +
    (extra || '') + '</div>';
};

RESULTADO.htmlEncontrado = function (res) {
  var f = res.fila;
  return '<div class="asa"></div>' +
    '<div class="res-estado">' + DR.ICONOS.check + '<span>Reubicación asignada</span></div>' +
    '<div class="res-nombre">' + DR.esc(f.nombre || 'Sin nombre en la lista') + '</div>' +
    '<div class="res-dni">DNI ' + DR.esc(f.dni) + '</div>' +
    '<div class="res-grid">' +
      RESULTADO.item('linea', 'Línea', RESULTADO.valorLinea(f.linea)) +
      RESULTADO.item('lado', 'Lado', f.lado, RESULTADO.mapaLado(f.lado)) +
      RESULTADO.item('labor', 'Labor', f.labor) +
    '</div>' +
    (f.obs ? '<div class="res-obs"><b>Observación</b>' + DR.esc(f.obs) + '</div>' : '');
};

RESULTADO.htmlNoEncontrado = function (res) {
  var detalle = res.dni ? 'DNI ' + DR.esc(res.dni) : 'Código leído: ' + DR.esc(DR.recortar(res.leido, 70));
  var texto = DATOS.lista
    ? 'Este documento no figura en <b>' + DR.esc(DATOS.lista.meta.archivo) + '</b>. Verifica que el trabajador esté en el Excel o que el DNI esté bien escrito.'
    : 'Todavía no hay una lista cargada. Entra a <b>Datos</b> y sube el Excel de reubicación.';
  return '<div class="asa"></div>' +
    '<div class="res-estado">' + DR.ICONOS.alerta + '<span>Sin reubicación</span></div>' +
    '<div class="res-nombre">No está en la lista</div>' +
    '<div class="res-dni">' + detalle + '</div>' +
    '<div class="aviso alerta res-aviso" style="margin:16px 0">' + texto + '</div>';
};

RESULTADO.mostrar = function (res, origen) {
  RESULTADO.origen = origen;
  ESCANER.pausar();

  if (origen !== 'lista') {
    DATOS.registrar(res);
    VISTAS.pintarHistorial();
    DR.vibrar(res.ok ? 70 : [120, 80, 120]);
    DR.sonar(res.ok);
  }

  var tarjeta = DR.$('#hojaTarjeta');
  tarjeta.className = res.ok ? 'ok' : 'no';
  tarjeta.innerHTML = (res.ok ? RESULTADO.htmlEncontrado(res) : RESULTADO.htmlNoEncontrado(res)) +
    '<button class="btn grande" id="btnHojaCerrar" type="button">' +
    (origen === 'escaner' ? 'Escanear siguiente' : 'Listo') + '</button>' +
    (origen === 'escaner' ? '<button class="res-cerrar-sec" id="btnHojaApagar" type="button">Terminar y apagar cámara</button>' : '');
  tarjeta.scrollTop = 0;

  DR.$('#btnHojaCerrar').onclick = function () { RESULTADO.cerrar(); };
  var apagar = DR.$('#btnHojaApagar');
  if (apagar) apagar.onclick = function () { ESCANER.detener(); RESULTADO.cerrar(); };

  if (!RESULTADO.abierta && !(history.state && history.state.hoja)) {
    try { history.pushState({ hoja: 1 }, ''); } catch (e) { /* sin historial */ }
  }
  RESULTADO.abierta = true;
  DR.$('#hoja').classList.remove('oculto');
  RESULTADO.animarEntrada(res);
};

RESULTADO.animarEntrada = function (res) {
  if (!DR.anima) return;
  var sel = function (s) { return '#hojaTarjeta ' + s; };
  var piezas = [sel('.res-estado'), sel('.res-nombre'), sel('.res-dni'), sel('.res-item'), sel('.res-obs'), sel('.res-aviso'), sel('.btn'), sel('.res-cerrar-sec')];

  anime.remove(['#hojaVelo', '#hojaTarjeta']);
  anime.set(piezas, { opacity: 0 });
  anime({ targets: '#hojaVelo', opacity: [0, 1], duration: 240, easing: 'linear' });
  anime({ targets: '#hojaTarjeta', translateY: ['100%', '0%'], duration: 480, easing: 'easeOutCubic' });

  anime.timeline({ easing: 'easeOutQuart' })
    .add({ targets: sel('.res-estado'), opacity: [0, 1], translateY: [10, 0], duration: 380 }, 160)
    .add({ targets: sel('.res-nombre'), opacity: [0, 1], translateY: [16, 0], duration: 520 }, 240)
    .add({ targets: sel('.res-dni'), opacity: [0, 1], duration: 400 }, 330)
    .add({ targets: sel('.res-item'), opacity: [0, 1], translateY: [22, 0], scale: [.94, 1], duration: 600, delay: anime.stagger(90) }, 380)
    .add({ targets: [sel('.res-obs'), sel('.res-aviso'), sel('.btn'), sel('.res-cerrar-sec')], opacity: [0, 1], translateY: [10, 0], duration: 420, delay: anime.stagger(60) }, 640);

  var trazo = DR.$(sel('.trazo'));
  if (trazo) anime({ targets: trazo, strokeDashoffset: [anime.setDashoffset, 0], duration: 650, delay: 260, easing: 'easeInOutSine' });

  if (res.ok) {
    anime({ targets: sel('.lado-mapa .zona.on'), opacity: [.3, 1], direction: 'alternate', loop: 4, duration: 420, delay: 900, easing: 'easeInOutSine' });
  } else {
    anime({ targets: sel('.res-estado svg'), translateX: [0, -7, 7, -5, 5, 0], duration: 520, delay: 420, easing: 'easeInOutSine' });
  }
};

RESULTADO.cerrar = function (desdeHistorial) {
  if (!RESULTADO.abierta) return;
  RESULTADO.abierta = false;
  if (!desdeHistorial && history.state && history.state.hoja) {
    try { history.back(); } catch (e) { /* sin historial */ }
  }
  var fin = function () {
    DR.$('#hoja').classList.add('oculto');
    DR.$('#hojaTarjeta').style.transform = '';
    if (!RESULTADO.abierta) ESCANER.continuar();
  };
  if (!DR.anima) { fin(); return; }
  anime.remove(['#hojaVelo', '#hojaTarjeta']);
  anime({ targets: '#hojaVelo', opacity: 0, duration: 220, easing: 'linear' });
  anime({ targets: '#hojaTarjeta', translateY: '100%', duration: 300, easing: 'easeInCubic', complete: fin });
};
