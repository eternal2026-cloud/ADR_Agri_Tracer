/* ============================================================================
 * captura.js — CAPTURA SECUENCIAL DE CICLOS (asistente por etapas, móvil)
 * Flujo: ciclos en curso → asistente de 7 etapas → al guardar avanza solo a
 * la siguiente → pantalla de cierre. Cada hora tiene su botón "Ahora", y el
 * botón grande inferior siempre dice qué toca marcar a continuación.
 * Marcar con "Ahora" guarda de inmediato (si el ciclo ya existe) para no
 * perder marcas si el celular se queda sin batería o sin señal.
 * ==========================================================================*/

var ETAPAS = [
  { id: 'cosecha', titulo: 'Cosecha', corto: 'Cosecha', color: '#76B729', campoCierre: 'fin_cosecha', campos: [
    { clave: 'fundo', tipo: 'lista', lista: 'fundo', label: 'Fundo', requerido: true },
    { clave: 'lote', tipo: 'texto', label: 'Lote', medio: true },
    { clave: 'lider', tipo: 'texto', label: 'Líder de grupo', medio: true },
    { clave: 'variedad', tipo: 'lista', lista: 'variedad', label: 'Variedad' },
    { clave: 'calibre', tipo: 'lista', lista: 'calibre', label: 'Calibre' },
    { clave: 'presentacion', tipo: 'lista', lista: 'presentacion', label: 'Presentación' },
    { clave: 'fecha', tipo: 'fecha', label: 'Fecha', medio: true },
    { clave: 'inicio_cosecha', tipo: 'hora', label: 'Inicio cosecha' },
    { clave: 'fin_cosecha', tipo: 'hora', label: 'Fin cosecha' }
  ] },
  { id: 'jabero', titulo: 'Jabero', corto: 'Jabero', color: '#EF7C3B', campoCierre: 'fin_jabero', campos: [
    { clave: 'inicio_jabero', tipo: 'hora', label: 'Inicio jabero' },
    { clave: 'fin_jabero', tipo: 'hora', label: 'Fin jabero' },
    { clave: 'num_jabas', tipo: 'numero', label: 'N° de jabas', medio: true },
    { clave: 'obs_jaba', tipo: 'texto', label: 'Observación de jaba' }
  ] },
  { id: 'motocarga', titulo: 'Motocarga', corto: 'Moto', color: '#0097CE', campoCierre: 'fin_carga_moto', campos: [
    { clave: 'hora_llegada_moto', tipo: 'hora', label: 'Llegada de motocarga' },
    { clave: 'inicio_carga_moto', tipo: 'hora', label: 'Inicio carga a motocarga' },
    { clave: 'fin_carga_moto', tipo: 'hora', label: 'Fin carga a motocarga' },
    { clave: 'placa', tipo: 'texto', label: 'Placa motocarga', medio: true, mayusculas: true }
  ] },
  { id: 'traslado_ca', titulo: 'Traslado a Centro de Acopio', corto: 'Traslado', color: '#76B729', campoCierre: 'fin_traslado_ca', campos: [
    { clave: 'inicio_traslado_ca', tipo: 'hora', label: 'Inicio traslado a C.A.' },
    { clave: 'fin_traslado_ca', tipo: 'hora', label: 'Fin traslado a C.A.' }
  ] },
  { id: 'descarga_ca', titulo: 'Descarga y armado en C.A.', corto: 'Descarga', color: '#EF7C3B', campoCierre: 'fin_descarga_ca', campos: [
    { clave: 'inicio_descarga_ca', tipo: 'hora', label: 'Inicio descarga y armado' },
    { clave: 'fin_descarga_ca', tipo: 'hora', label: 'Fin descarga y armado' },
    { clave: 'num_jabas_2', tipo: 'numero', label: 'N° de jabas', medio: true },
    { clave: 'num_pallets', tipo: 'numero', label: 'N° de pallets', medio: true },
    { clave: 'presentaciones', tipo: 'lista', lista: 'presentacion', label: 'Presentaciones' },
    { clave: 'placa_camion', tipo: 'texto', label: 'Placa de camión', medio: true, mayusculas: true },
    { clave: 'obs_jabas_2', tipo: 'texto', label: 'Observación de jabas' }
  ] },
  { id: 'carga_camion', titulo: 'Carga al camión', corto: 'Camión', color: '#0097CE', campoCierre: 'fin_carga_camion', campos: [
    { clave: 'inicio_carga_camion', tipo: 'hora', label: 'Inicio carga al camión' },
    { clave: 'fin_carga_camion', tipo: 'hora', label: 'Fin carga al camión' }
  ] },
  { id: 'traslado_planta', titulo: 'Traslado a planta', corto: 'Planta', color: '#D9622B', campoCierre: 'fin_traslado_planta', campos: [
    { clave: 'inicio_traslado_planta', tipo: 'hora', label: 'Inicio traslado a planta' },
    { clave: 'fin_traslado_planta', tipo: 'hora', label: 'Fin traslado a planta' },
    { clave: 'tareadora', tipo: 'lista', lista: 'tareadora', label: 'Tareadora' },
    { clave: 'obs_cs', tipo: 'texto', label: 'Observación Casa Sombra' },
    { clave: 'obs_ca', tipo: 'texto', label: 'Observación C. Acopio' }
  ] }
];

/** Orden cronológico esperado (la llegada de la moto se valida aparte: puede llegar antes de que acabe el jabero). */
var CADENA_HORAS = ['inicio_cosecha', 'fin_cosecha', 'inicio_jabero', 'fin_jabero', 'inicio_carga_moto', 'fin_carga_moto',
  'inicio_traslado_ca', 'fin_traslado_ca', 'inicio_descarga_ca', 'fin_descarga_ca', 'inicio_carga_camion', 'fin_carga_camion',
  'inicio_traslado_planta', 'fin_traslado_planta'];
var ETIQUETA_HORA = {};
ETAPAS.forEach(function (e) { e.campos.forEach(function (c) { if (c.tipo === 'hora') ETIQUETA_HORA[c.clave] = c.label; }); });

var CAPTURA = {
  listas: { fundo: [], variedad: [], calibre: [], presentacion: [], tareadora: [] },
  vista: 'lista', fila: null, borrador: null, etapaIdx: 0,
  sucio: false, guardando: false, insistir: false,
  abiertos: [], cerrados: [], filtro: '', _pct: 0
};

/* ------------------------------------------------ fechas (hora local del celular) */
CAPTURA.pad = function (n) { return (n < 10 ? '0' : '') + n; };
CAPTURA.localDe = function (d) {
  var p = CAPTURA.pad;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
};
CAPTURA.ahoraLocal = function () { return CAPTURA.localDe(new Date()); };
CAPTURA.hoyLocal = function () { return CAPTURA.ahoraLocal().substring(0, 10); };
CAPTURA.aIso = function (v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
CAPTURA.aLocal = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : CAPTURA.localDe(d); };
CAPTURA.horaCorta = function (local) {
  if (!local) return '—';
  return local.substring(0, 10) === CAPTURA.hoyLocal() ? local.substring(11, 16) : local.substring(8, 10) + '/' + local.substring(5, 7) + ' ' + local.substring(11, 16);
};

/* ------------------------------------------------ preferencias del celular */
CAPTURA.PREF = 'agritracer.captura.preferencias';
CAPTURA.leerPrefs = function () { try { return JSON.parse(localStorage.getItem(CAPTURA.PREF) || '{}') || {}; } catch (e) { return {}; } };
CAPTURA.guardarPrefs = function (v) {
  try { localStorage.setItem(CAPTURA.PREF, JSON.stringify({ fundo: v.fundo, lider: v.lider, variedad: v.variedad, calibre: v.calibre, presentacion: v.presentacion })); } catch (e) { /* sin almacenamiento */ }
};

CAPTURA.cargarListas = function () {
  return sb.from('listas_maestras').select('tipo,valor').eq('activo', true).order('orden').order('valor').then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var m = { fundo: [], variedad: [], calibre: [], presentacion: [], tareadora: [] };
    (r.data || []).forEach(function (f) { if (!m[f.tipo]) m[f.tipo] = []; m[f.tipo].push(f.valor); });
    CAPTURA.listas = m;
  });
};

/** Índice de la primera etapa sin su hora de cierre; -1 si el ciclo está completo. */
CAPTURA.proximaIdx = function (fila) {
  for (var i = 0; i < ETAPAS.length; i++) if (!fila || !fila[ETAPAS[i].campoCierre]) return i;
  return -1;
};

CAPTURA.puedeSalir = function () {
  if (CAPTURA.vista !== 'ciclo' || !CAPTURA.sucio) return true;
  return window.confirm('Tienes cambios sin guardar en esta etapa. ¿Salir sin guardarlos?');
};

window.addEventListener('beforeunload', function (e) {
  if (CAPTURA.vista === 'ciclo' && CAPTURA.sucio) { e.preventDefault(); e.returnValue = ''; }
});

/* ============================================================ LISTA DE CICLOS */
VISTAS.captura = function (cont) {
  if (!AT.puedeCapturar()) {
    cont.innerHTML = UI.encabezado('Tiempos de ciclo', 'Captura de datos', '') +
      UI.panel('Sin permiso', '', '<div class="aviso alerta">Tu cuenta no tiene permiso de captura en campo. Pide a un administrador que te lo habilite.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  var listo = CAPTURA.listas.fundo.length ? Promise.resolve() : CAPTURA.cargarListas();
  listo.then(function () { CAPTURA.pintarLista(); }).catch(function (e) { UI.error(cont, e); });
};

CAPTURA.pintarLista = function () {
  var cont = DR.$('#contenido');
  CAPTURA.vista = 'lista'; CAPTURA.fila = null; CAPTURA.sucio = false; CAPTURA.insistir = false;
  CAPTURA.quitarBarra();
  cont.scrollTop = 0;
  cont.innerHTML = UI.encabezado('Captura en campo', 'Ciclos de cosecha', 'Inicia un ciclo nuevo o toca uno en curso para registrar su siguiente etapa.') +
    '<button class="btn verde grande entra" id="btnNuevoCiclo" type="button">' + DR.ICONOS.mas + '<span>Iniciar nuevo ciclo</span></button>' +
    '<div class="buscador entra" style="margin-top:16px">' + DR.ICONOS.lupa +
    '<input id="inpFiltroCiclos" type="search" placeholder="Buscar código, fundo, lote o líder…" autocomplete="off" value="' + DR.esc(CAPTURA.filtro) + '"></div>' +
    '<div id="listaCiclos"><div class="vacio">Cargando ciclos en curso…</div></div>';
  DR.entrarPaneles('#contenido');

  DR.$('#btnNuevoCiclo').onclick = function () { DR.desbloquearAudio(); CAPTURA.nuevoCiclo(); };
  DR.$('#inpFiltroCiclos').oninput = function () { CAPTURA.filtro = this.value; CAPTURA.pintarTarjetas(false); };

  CAPTURA.cargarCiclos().then(function () { CAPTURA.pintarTarjetas(true); }).catch(function (e) {
    var l = DR.$('#listaCiclos');
    if (l) l.innerHTML = '<div class="aviso alerta">' + DR.esc(e.message) + '</div>';
  });
};

CAPTURA.cargarCiclos = function () {
  var desde = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  return Promise.all([
    // Solo ciclos capturados en la app: los importados del Excel histórico no son "en curso".
    sb.from('ciclos_cosecha').select('*').eq('origen', 'app').eq('cerrado', false).order('actualizado_en', { ascending: false }).limit(200),
    sb.from('ciclos_cosecha').select('*').eq('origen', 'app').eq('cerrado', true).gte('actualizado_en', desde).order('actualizado_en', { ascending: false }).limit(10)
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    CAPTURA.abiertos = r[0].data || [];
    CAPTURA.cerrados = r[1].error ? [] : (r[1].data || []);
  });
};

CAPTURA.tarjetaHtml = function (f) {
  var idx = CAPTURA.proximaIdx(f), et = idx > -1 ? ETAPAS[idx] : null;
  var segmentos = ETAPAS.map(function (e, i) {
    return '<i class="' + (f[e.campoCierre] ? 'hecho' : (i === idx ? 'actual' : '')) + '" style="--c:' + e.color + '"></i>';
  }).join('');
  var sub = [f.fundo, f.lote ? 'Lote ' + f.lote : '', f.lider].filter(Boolean).map(DR.esc).join(' · ');
  var pie = et
    ? '<span>Etapa ' + (idx + 1) + ' de ' + ETAPAS.length + ' · Siguiente: <b>' + et.titulo + '</b></span>'
    : '<span><b>Cerrado</b> · ' + (f.t_ciclo_total !== null ? DR.num(f.t_ciclo_total, 0) + ' min de ciclo' : 'ver detalle') + '</span>';
  return '<button type="button" class="ciclo-card entra" data-codigo="' + DR.esc(f.codigo) + '" style="--c:' + (et ? et.color : '#76B729') + '">' +
    '<div class="cc-top"><span class="cc-codigo">' + DR.esc(f.codigo) + '</span><span class="cc-hace">' + DR.hace(f.actualizado_en) + '</span></div>' +
    '<div class="cc-sub">' + (sub || '&nbsp;') + '</div>' +
    '<div class="cc-pasos">' + segmentos + '</div>' +
    '<div class="cc-sig">' + pie + DR.ICONOS.chevron + '</div></button>';
};

CAPTURA.pintarTarjetas = function (animar) {
  var cont = DR.$('#listaCiclos');
  if (!cont) return;
  var q = CAPTURA.filtro.trim().toLowerCase();
  var coincide = function (f) {
    return !q || [f.codigo, f.fundo, f.lote, f.lider].some(function (v) { return String(v || '').toLowerCase().indexOf(q) > -1; });
  };
  var abiertos = CAPTURA.abiertos.filter(coincide), cerrados = CAPTURA.cerrados.filter(coincide);

  var h = '<div class="conteo">En curso · ' + abiertos.length + '</div>';
  h += abiertos.length ? abiertos.map(CAPTURA.tarjetaHtml).join('')
    : '<div class="vacio">' + (q ? 'Ningún ciclo en curso coincide con la búsqueda.' : 'No hay ciclos en curso. Inicia uno con el botón verde.') + '</div>';
  if (cerrados.length) h += '<div class="conteo" style="margin-top:18px">Cerrados recientemente · ' + cerrados.length + '</div>' + cerrados.map(CAPTURA.tarjetaHtml).join('');
  h += '<div class="acciones" style="justify-content:center"><button type="button" class="btn sec chico" id="btnRecargarCiclos">Actualizar lista</button></div>';
  cont.innerHTML = h;

  DR.$$('.ciclo-card', cont).forEach(function (b) {
    b.onclick = function () {
      DR.desbloquearAudio();
      var codigo = this.getAttribute('data-codigo');
      var fila = CAPTURA.abiertos.concat(CAPTURA.cerrados).filter(function (f) { return f.codigo === codigo; })[0];
      if (fila) CAPTURA.abrirCiclo(fila);
    };
  });
  DR.$('#btnRecargarCiclos').onclick = function () {
    this.disabled = true;
    CAPTURA.cargarCiclos().then(function () { CAPTURA.pintarTarjetas(true); DR.toast('Lista actualizada.', 'info'); })
      .catch(function (e) { DR.toast(e.message, 'error'); });
  };
  if (animar) DR.entrarPaneles('#listaCiclos');
  else DR.$$('.entra', cont).forEach(function (n) { n.style.opacity = 1; });
};

/* ============================================================ ASISTENTE POR ETAPAS */
CAPTURA.nuevoCiclo = function () {
  var prefs = CAPTURA.leerPrefs();
  CAPTURA.fila = null;
  CAPTURA.borrador = { fecha: CAPTURA.hoyLocal(), fundo: prefs.fundo || '', lider: prefs.lider || '', variedad: prefs.variedad || '', calibre: prefs.calibre || '', presentacion: prefs.presentacion || '' };
  CAPTURA.etapaIdx = 0;
  CAPTURA.entrarAsistente();
};

CAPTURA.abrirCiclo = function (fila) {
  CAPTURA.fila = fila; CAPTURA.borrador = null;
  var idx = CAPTURA.proximaIdx(fila);
  if (idx < 0) { CAPTURA.mostrarFin(fila); return; }
  CAPTURA.etapaIdx = idx;
  CAPTURA.entrarAsistente();
};

CAPTURA.entrarAsistente = function () {
  CAPTURA.vista = 'ciclo'; CAPTURA.sucio = false; CAPTURA.insistir = false;
  CAPTURA._pct = 0;
  CAPTURA.pintarCiclo(1);
};

CAPTURA.valorInicial = function (c) {
  var fuente = CAPTURA.fila || CAPTURA.borrador || {};
  var v = fuente[c.clave];
  if (c.tipo === 'hora') return CAPTURA.fila ? CAPTURA.aLocal(v) : (v || '');
  return v === null || v === undefined ? '' : String(v);
};

CAPTURA.campoHtml = function (c) {
  var v = CAPTURA.valorInicial(c), id = 'cp_' + c.clave;
  if (c.tipo === 'hora') {
    return '<div class="hora' + (v ? ' llena' : '') + '" data-hora="' + c.clave + '">' +
      '<div class="hora-info"><label for="' + id + '">' + DR.ICONOS.checkChico + '<span>' + c.label + '</span></label>' +
      '<input id="' + id + '" type="datetime-local" data-campo="' + c.clave + '" value="' + v + '"></div>' +
      '<button type="button" class="hora-ahora" data-ahora="' + c.clave + '" aria-label="Marcar ' + c.label + ' con la hora actual">' + DR.ICONOS.reloj + '<span>Ahora</span></button>' +
      '<div class="hora-aviso" data-aviso="' + c.clave + '"></div></div>';
  }
  var clase = 'campo' + (c.medio ? '' : ' ancho');
  var etiqueta = '<label for="' + id + '">' + c.label + (c.requerido ? '<em>obligatorio</em>' : '') + '</label>';
  if (c.tipo === 'lista') {
    var ops = (CAPTURA.listas[c.lista] || []).slice();
    if (v && ops.indexOf(v) < 0) ops.unshift(v);
    if (ops.length > 14) {
      return '<div class="' + clase + '">' + etiqueta + '<select id="' + id + '" data-campo="' + c.clave + '"><option value="">—</option>' +
        ops.map(function (o) { return '<option value="' + DR.esc(o) + '"' + (o === v ? ' selected' : '') + '>' + DR.esc(o) + '</option>'; }).join('') + '</select></div>';
    }
    return '<div class="' + clase + '">' + etiqueta + '<input type="hidden" id="' + id + '" data-campo="' + c.clave + '" value="' + DR.esc(v) + '">' +
      '<div class="opciones" data-opciones="' + c.clave + '">' + (ops.length
        ? ops.map(function (o) { return '<button type="button" class="opcion' + (o === v ? ' activa' : '') + '" data-valor="' + DR.esc(o) + '">' + DR.esc(o) + '</button>'; }).join('')
        : '<span class="nota-vacia">Sin opciones. Un administrador puede agregarlas en Config → Listas.</span>') + '</div></div>';
  }
  if (c.tipo === 'fecha') return '<div class="' + clase + '">' + etiqueta + '<input id="' + id + '" type="date" data-campo="' + c.clave + '" value="' + v + '"></div>';
  if (c.tipo === 'numero') return '<div class="' + clase + '">' + etiqueta + '<input id="' + id + '" type="number" inputmode="numeric" min="0" step="1" data-campo="' + c.clave + '" value="' + DR.esc(v) + '"></div>';
  return '<div class="' + clase + '">' + etiqueta + '<input id="' + id + '" data-campo="' + c.clave + '" value="' + DR.esc(v) + '"' +
    (c.mayusculas ? ' autocapitalize="characters" style="text-transform:uppercase"' : '') + ' autocomplete="off"></div>';
};

CAPTURA.pasosHtml = function () {
  var fila = CAPTURA.fila, prox = CAPTURA.proximaIdx(fila);
  return ETAPAS.map(function (e, i) {
    var hecho = !!(fila && fila[e.campoCierre]), actual = i === CAPTURA.etapaIdx;
    var accesible = actual || (fila && (hecho || i === prox));
    return '<button type="button" class="paso' + (hecho ? ' hecho' : '') + (actual ? ' actual' : '') + '" data-paso="' + i + '" style="--c:' + e.color + '"' +
      (accesible ? '' : ' disabled') + ' aria-label="' + e.titulo + '"><i>' + (hecho && !actual ? DR.ICONOS.checkChico : (i + 1)) + '</i><span>' + e.corto + '</span></button>';
  }).join('');
};

CAPTURA.pintarCiclo = function (direccion) {
  var cont = DR.$('#contenido'), fila = CAPTURA.fila, e = ETAPAS[CAPTURA.etapaIdx];
  var prox = CAPTURA.proximaIdx(fila);
  var pct = !fila ? 0 : (prox < 0 ? 100 : Math.round(prox / (ETAPAS.length - 1) * 100));
  var sub = fila ? [fila.fundo, fila.lote ? 'Lote ' + fila.lote : '', fila.lider].filter(Boolean).map(DR.esc).join(' · ') : 'El código se asigna al guardar';

  var horas = e.campos.filter(function (c) { return c.tipo === 'hora'; });
  var otros = e.campos.filter(function (c) { return c.tipo !== 'hora'; });
  var bloqueHoras = '<div class="horas">' + horas.map(CAPTURA.campoHtml).join('') + '</div>';
  var bloqueDatos = otros.length ? '<div class="datos">' + otros.map(CAPTURA.campoHtml).join('') + '</div>' : '';
  var cuerpo = e.id === 'cosecha'
    ? bloqueDatos + '<div class="sep-titulo">Tiempos de cosecha</div>' + bloqueHoras
    : bloqueHoras + (bloqueDatos ? '<div class="sep-titulo">Datos de la etapa</div>' + bloqueDatos : '');
  var completada = fila && fila[e.campoCierre];

  cont.innerHTML =
    '<div class="wiz-cab">' +
      '<button type="button" class="wiz-volver" id="btnVolverLista">' + DR.ICONOS.atras + '<span>Ciclos</span></button>' +
      '<div class="wiz-id"><b id="wizCodigo">' + (fila ? DR.esc(fila.codigo) : 'Nuevo ciclo') + '</b><span>' + sub + '</span></div></div>' +
    '<div class="pasos"><div class="pasos-pista"><div class="pasos-relleno" id="pasosRelleno" style="width:' + CAPTURA._pct + '%"></div></div>' + CAPTURA.pasosHtml() + '</div>' +
    '<section class="etapa" id="etapaCard" style="--c:' + e.color + '">' +
      '<div class="etapa-cab"><span class="etapa-num">Etapa ' + (CAPTURA.etapaIdx + 1) + ' de ' + ETAPAS.length + '</span>' +
      '<h2>' + e.titulo + '</h2>' + (completada ? '<span class="pill verde">Completada · puedes corregirla</span>' : '') + '</div>' +
      cuerpo + '<div class="avisos oculto" id="avisosEtapa"></div></section>' +
    (fila && AT.esAdmin() ? '<div class="zona-peligro"><button type="button" class="btn-peligro" onclick="CAPTURA.confirmarEliminar()">Eliminar este ciclo</button></div>' : '');

  CAPTURA.ponerBarra();
  CAPTURA.enlazarCiclo(cont);
  CAPTURA.revisar();
  if (direccion) cont.scrollTop = 0;

  var relleno = DR.$('#pasosRelleno');
  if (!DR.anima) { relleno.style.width = pct + '%'; CAPTURA._pct = pct; return; }
  anime({ targets: relleno, width: pct + '%', duration: 750, easing: 'easeOutCubic' });
  CAPTURA._pct = pct;
  if (direccion) {
    anime({ targets: '#etapaCard', opacity: [0, 1], translateX: [44 * direccion, 0], duration: 420, easing: 'easeOutCubic' });
    anime({ targets: '#etapaCard .hora, #etapaCard .campo, #etapaCard .sep-titulo', opacity: [0, 1], translateY: [12, 0], duration: 380, delay: anime.stagger(40, { start: 140 }), easing: 'easeOutQuad' });
    anime({ targets: '.paso.actual i', scale: [0.55, 1], duration: 700, easing: 'easeOutElastic(1, .55)' });
  }
};

CAPTURA.enlazarCiclo = function (cont) {
  DR.$('#btnVolverLista').onclick = function () { if (CAPTURA.puedeSalir()) CAPTURA.pintarLista(); };
  DR.$$('.paso', cont).forEach(function (p) {
    p.onclick = function () {
      var i = Number(this.getAttribute('data-paso'));
      if (i === CAPTURA.etapaIdx || !CAPTURA.puedeSalir()) return;
      CAPTURA.irEtapa(i);
    };
  });
  DR.$$('.hora-ahora', cont).forEach(function (b) {
    b.onclick = function () { DR.desbloquearAudio(); CAPTURA.marcarAhora(this.getAttribute('data-ahora')); };
  });
  DR.$$('[data-campo]', cont).forEach(function (el) {
    el.addEventListener('input', CAPTURA.alEditar);
    el.addEventListener('change', CAPTURA.alEditar);
  });
  DR.$$('.opciones', cont).forEach(function (grupo) {
    grupo.onclick = function (ev) {
      var op = ev.target.closest('.opcion');
      if (!op) return;
      var inp = DR.$('input[data-campo="' + this.getAttribute('data-opciones') + '"]', cont);
      var yaActiva = op.classList.contains('activa');
      DR.$$('.opcion', this).forEach(function (o) { o.classList.remove('activa'); });
      if (!yaActiva) op.classList.add('activa');
      inp.value = yaActiva ? '' : op.getAttribute('data-valor');
      if (DR.anima) anime({ targets: op, scale: [0.9, 1], duration: 320, easing: 'easeOutBack' });
      CAPTURA.alEditar();
    };
  });
};

CAPTURA.alEditar = function () {
  CAPTURA.sucio = true;
  CAPTURA.insistir = false;
  CAPTURA.revisar();
};

CAPTURA.irEtapa = function (i) {
  var dir = i >= CAPTURA.etapaIdx ? 1 : -1, card = DR.$('#etapaCard');
  CAPTURA.sucio = false; CAPTURA.insistir = false;
  if (!DR.anima || !card) { CAPTURA.etapaIdx = i; CAPTURA.pintarCiclo(dir); return; }
  anime.remove(card);
  anime({ targets: card, opacity: [1, 0], translateX: [0, -44 * dir], duration: 190, easing: 'easeInQuad',
    complete: function () { CAPTURA.etapaIdx = i; CAPTURA.pintarCiclo(dir); } });
};

CAPTURA.leer = function () {
  var o = {};
  DR.$$('#etapaCard [data-campo]').forEach(function (el) { o[el.getAttribute('data-campo')] = el.value; });
  return o;
};

/** Avisos de coherencia: horas en el futuro, fuera de orden o faltantes. No bloquean: piden confirmar una vez. */
CAPTURA.validar = function (v) {
  var t = {}, porCampo = {}, lista = [], e = ETAPAS[CAPTURA.etapaIdx];
  CADENA_HORAS.concat(['hora_llegada_moto']).forEach(function (k) {
    t[k] = (k in v) ? v[k] : (CAPTURA.fila ? CAPTURA.aLocal(CAPTURA.fila[k]) : '');
  });
  var limite = Date.now() + 5 * 60000, previo = null;
  CADENA_HORAS.forEach(function (k) {
    if (!t[k]) return;
    var ms = new Date(t[k]).getTime();
    if (ms > limite) porCampo[k] = 'Está en el futuro (' + CAPTURA.horaCorta(t[k]) + '). Revisa la fecha.';
    else if (previo && ms < previo.ms) porCampo[k] = 'Es anterior a «' + ETIQUETA_HORA[previo.k] + '» (' + CAPTURA.horaCorta(t[previo.k]) + ').';
    if (!previo || ms >= previo.ms) previo = { k: k, ms: ms };
  });
  if (t.hora_llegada_moto) {
    var ll = new Date(t.hora_llegada_moto).getTime();
    if (ll > limite) porCampo.hora_llegada_moto = 'Está en el futuro. Revisa la fecha.';
    else if (t.inicio_carga_moto && ll > new Date(t.inicio_carga_moto).getTime()) porCampo.hora_llegada_moto = 'Es posterior al inicio de carga a motocarga.';
  }
  e.campos.forEach(function (c) {
    if (porCampo[c.clave]) lista.push(c.label + ': ' + porCampo[c.clave]);
    else if (c.tipo === 'hora' && !v[c.clave]) lista.push('Falta «' + c.label + '».');
  });
  return { porCampo: porCampo, lista: lista };
};

CAPTURA.revisar = function () {
  var e = ETAPAS[CAPTURA.etapaIdx], v = CAPTURA.leer(), val = CAPTURA.validar(v);
  DR.$$('#etapaCard .hora').forEach(function (h) {
    var k = h.getAttribute('data-hora'), msg = val.porCampo[k] || '';
    h.classList.toggle('llena', !!v[k]);
    h.classList.toggle('con-aviso', !!msg);
    DR.$('[data-aviso="' + k + '"]', h).textContent = msg;
  });

  var btn = DR.$('#btnAccion'), sec = DR.$('#btnGuardarSolo');
  if (!btn) return;
  sec.classList.toggle('oculto', !CAPTURA.sucio);
  var ultima = CAPTURA.etapaIdx === ETAPAS.length - 1;
  var vacia = v[e.campoCierre] ? null : e.campos.filter(function (c) { return c.tipo === 'hora' && !v[c.clave]; })[0];
  var modo, html;
  if (!CAPTURA.fila && !v.fundo) { modo = 'fundo'; html = '<span>Elige el fundo para empezar</span>'; }
  else if (vacia) { modo = 'marcar'; html = DR.ICONOS.reloj + '<span>Marcar <b>' + vacia.label.toLowerCase() + '</b> ahora</span>'; }
  else if (CAPTURA.insistir && val.lista.length) { modo = 'forzar'; html = '<span>Guardar igual y ' + (ultima ? 'cerrar el ciclo' : 'continuar') + '</span>'; }
  else if (ultima) { modo = 'cerrar'; html = DR.ICONOS.checkChico + '<span>Guardar y cerrar ciclo</span>'; }
  else { modo = 'continuar'; html = '<span>Guardar y continuar</span>' + DR.ICONOS.chevron; }

  btn.setAttribute('data-modo', modo);
  btn.setAttribute('data-campo', vacia ? vacia.clave : '');
  btn.className = 'btn grande accion-' + modo + (CAPTURA.guardando ? ' cargando' : '');
  btn.style.setProperty('--c', e.color);
  btn.innerHTML = html;

  var avisos = DR.$('#avisosEtapa');
  if (CAPTURA.insistir && val.lista.length) {
    avisos.innerHTML = '<b>Revisa antes de continuar</b><ul>' + val.lista.map(function (x) { return '<li>' + DR.esc(x) + '</li>'; }).join('') + '</ul>';
    avisos.classList.remove('oculto');
  } else {
    avisos.classList.add('oculto');
  }
};

CAPTURA.ponerBarra = function () {
  var barra = DR.$('#barraAccion'), nueva = !barra;
  if (nueva) { barra = document.createElement('div'); barra.id = 'barraAccion'; document.body.appendChild(barra); }
  barra.innerHTML = '<button type="button" class="btn sec oculto" id="btnGuardarSolo">Guardar</button>' +
    '<button type="button" class="btn grande" id="btnAccion"></button>';
  DR.$('#contenido').classList.add('con-barra');
  DR.$('#btnGuardarSolo').onclick = function () { CAPTURA.guardar({ avanzar: false }); };
  DR.$('#btnAccion').onclick = CAPTURA.accionPrincipal;
  if (nueva && DR.anima) anime({ targets: barra, translateY: [70, 0], opacity: [0, 1], duration: 450, easing: 'easeOutCubic' });
};

CAPTURA.quitarBarra = function () {
  var b = DR.$('#barraAccion');
  if (b) b.remove();
  var c = DR.$('#contenido');
  if (c) c.classList.remove('con-barra');
};

CAPTURA.accionPrincipal = function () {
  DR.desbloquearAudio();
  var btn = DR.$('#btnAccion'), modo = btn.getAttribute('data-modo');
  if (CAPTURA.guardando) return;
  if (modo === 'fundo') {
    var grupo = DR.$('[data-opciones="fundo"]');
    if (grupo) {
      grupo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (DR.anima) anime({ targets: grupo.children, translateY: [-8, 0], duration: 600, delay: anime.stagger(45), easing: 'easeOutBack' });
    }
    DR.toast('Primero elige el fundo.', 'info');
    return;
  }
  if (modo === 'marcar') {
    var clave = btn.getAttribute('data-campo'), fila = DR.$('[data-hora="' + clave + '"]');
    if (fila) fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    CAPTURA.marcarAhora(clave);
    return;
  }
  CAPTURA.guardar({ avanzar: true });
};

CAPTURA.marcarAhora = function (clave) {
  var inp = DR.$('#cp_' + clave);
  if (!inp || CAPTURA.guardando) return;
  inp.value = CAPTURA.ahoraLocal();
  var fila = inp.closest('.hora');
  DR.vibrar(25);
  if (DR.anima) {
    anime({ targets: fila, scale: [0.96, 1], duration: 420, easing: 'easeOutBack' });
    anime({ targets: DR.$('.hora-ahora svg', fila), rotate: ['0turn', '1turn'], duration: 600, easing: 'easeOutCubic' });
  }
  CAPTURA.sucio = true; CAPTURA.insistir = false;
  CAPTURA.revisar();
  if (CAPTURA.fila || CAPTURA.leer().fundo) {
    CAPTURA.guardar({ avanzar: false, mensaje: ETIQUETA_HORA[clave] + ' · ' + CAPTURA.horaCorta(inp.value) + ' guardado.' });
  } else {
    DR.toast('Hora marcada. Elige el fundo para guardar el ciclo.', 'info');
  }
};

CAPTURA.guardar = function (opc) {
  if (CAPTURA.guardando) return;
  var e = ETAPAS[CAPTURA.etapaIdx], v = CAPTURA.leer();
  if (!CAPTURA.fila && !v.fundo) { DR.toast('Elige el fundo antes de guardar.', 'error'); return; }

  if (opc.avanzar && !CAPTURA.insistir && CAPTURA.validar(v).lista.length) {
    CAPTURA.insistir = true;
    CAPTURA.revisar();
    var avisos = DR.$('#avisosEtapa');
    avisos.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (DR.anima) anime({ targets: avisos, translateX: [-10, 10, -6, 0], duration: 420, easing: 'easeInOutSine' });
    DR.vibrar([30, 40, 30]);
    return;
  }

  CAPTURA.guardando = true;
  CAPTURA.revisar();
  DR.$('#btnGuardarSolo').disabled = true;

  var promesa;
  if (!CAPTURA.fila) {
    CAPTURA.guardarPrefs(v);
    promesa = AT.rpc('rpc_iniciar_ciclo', { p: {
      fecha: v.fecha || CAPTURA.hoyLocal(), fundo: v.fundo, lote: v.lote || null, lider: v.lider || null,
      presentacion: v.presentacion || null, variedad: v.variedad || null, calibre: v.calibre || null,
      inicio_cosecha: CAPTURA.aIso(v.inicio_cosecha), fin_cosecha: CAPTURA.aIso(v.fin_cosecha)
    } });
  } else {
    var datos = {};
    e.campos.forEach(function (c) {
      var x = v[c.clave];
      if (c.tipo === 'hora') datos[c.clave] = CAPTURA.aIso(x);
      else if (x === '' || x === undefined) datos[c.clave] = null;
      else if (c.tipo === 'numero') datos[c.clave] = Math.round(Number(x));
      else datos[c.clave] = c.mayusculas ? String(x).toUpperCase() : x;
    });
    if (e.id === 'cosecha') CAPTURA.guardarPrefs(v);
    promesa = AT.rpc('rpc_agregar_etapa', { p_codigo: CAPTURA.fila.codigo, p_etapa: e.id, p_datos: datos });
  }

  promesa.then(function (fila) {
    var eraNuevo = !CAPTURA.fila;
    CAPTURA.fila = fila; CAPTURA.borrador = null;
    CAPTURA.sucio = false; CAPTURA.insistir = false; CAPTURA.guardando = false;
    DR.vibrar(40);
    DR.sonar(true);
    if (opc.avanzar) {
      var prox = CAPTURA.proximaIdx(fila);
      if (prox < 0) { CAPTURA.mostrarFin(fila); return; }
      DR.toast(e.titulo + ' guardado' + (eraNuevo ? ' · código ' + fila.codigo : '') + '. Sigue: ' + ETAPAS[prox].titulo + '.');
      CAPTURA.irEtapa(prox);
    } else {
      DR.toast((eraNuevo ? 'Ciclo ' + fila.codigo + ' creado. ' : '') + (opc.mensaje || 'Cambios guardados.'));
      CAPTURA.pintarCiclo(0);
      if (eraNuevo && DR.anima) anime({ targets: '#wizCodigo', scale: [1.25, 1], color: ['#B5E07A', '#F7F2EC'], duration: 900, easing: 'easeOutElastic(1, .6)' });
    }
  }).catch(function (err) {
    CAPTURA.guardando = false;
    var s = DR.$('#btnGuardarSolo');
    if (s) s.disabled = false;
    CAPTURA.revisar();
    DR.vibrar([60, 40, 60]);
    DR.toast('No se guardó: ' + err.message, 'error');
  });
};

/* ============================================================ CIERRE DEL CICLO */
CAPTURA.mostrarFin = function (fila) {
  CAPTURA.vista = 'fin'; CAPTURA.fila = fila; CAPTURA.sucio = false;
  CAPTURA.quitarBarra();
  var cont = DR.$('#contenido');
  cont.scrollTop = 0;

  var total = fila.t_ciclo_total;
  var tramos = CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, v: fila[c.clave] }; })
    .filter(function (x) { return x.v !== null && x.v !== undefined; });
  var maximo = Math.max.apply(null, tramos.map(function (x) { return Math.abs(Number(x.v)); }).concat([1]));
  var sub = [fila.fundo, fila.lote ? 'Lote ' + fila.lote : '', fila.lider].filter(Boolean).map(DR.esc).join(' · ');

  var barras = tramos.map(function (x) {
    var negativo = Number(x.v) < 0;
    return '<div class="barra-fila"><div title="' + DR.esc(x.t) + '">' + DR.esc(x.t) + '</div>' +
      '<div class="barra-pista"><div class="barra-valor" data-ancho="' + Math.round(Math.abs(Number(x.v)) / maximo * 100) + '" style="background:' +
      (negativo ? '#E5484D' : 'linear-gradient(90deg,#0097CE,#76B729)') + '"></div></div>' +
      '<div class="barra-cifra"' + (negativo ? ' style="color:#FF8A8A"' : '') + '>' + DR.num(x.v, 0) + '</div></div>';
  }).join('');
  var hayNegativos = tramos.some(function (x) { return Number(x.v) < 0; });

  cont.innerHTML =
    '<div class="fin-ciclo">' +
      '<svg class="fin-check" viewBox="0 0 120 120" aria-hidden="true"><circle class="fin-aro" cx="60" cy="60" r="52"/><path class="fin-trazo" d="M37 62l15 15 32-34"/></svg>' +
      '<div class="ruta">Ciclo cerrado</div><h1>' + DR.esc(fila.codigo) + '</h1><p>' + sub + '</p></div>' +
    '<div class="kpis">' +
      UI.kpi('Tiempo de ciclo', total !== null ? '<span id="finTotal">0</span><small>min</small>' : '—',
        total !== null ? DR.num(total / 60, 2) + ' horas' : 'Faltan tramos para calcular el total', '#76B729') +
      UI.kpi('Semana', DR.num(fila.semana), DR.esc(fila.fecha), '#0097CE') +
    '</div>' +
    UI.panel('Minutos por tramo', 'Diferencia entre cada marca registrada' + (hayNegativos ? ' · en rojo: horas fuera de orden, corrígelas' : ''), barras || '<div class="vacio">Sin tramos calculados.</div>') +
    '<div class="acciones-fin">' +
      '<button type="button" class="btn verde grande" id="btnOtroCiclo">' + DR.ICONOS.mas + '<span>Iniciar otro ciclo</span></button>' +
      '<button type="button" class="btn sec" id="btnFinLista">Ver ciclos en curso</button>' +
      '<button type="button" class="btn sec" id="btnFinCorregir">Corregir una etapa</button></div>' +
    (AT.esAdmin() && fila.origen !== 'excel' ? '<div class="zona-peligro"><button type="button" class="btn-peligro" onclick="CAPTURA.confirmarEliminar()">Eliminar este ciclo</button></div>' : '');

  DR.$('#btnOtroCiclo').onclick = CAPTURA.nuevoCiclo;
  DR.$('#btnFinLista').onclick = CAPTURA.pintarLista;
  DR.$('#btnFinCorregir').onclick = function () { CAPTURA.etapaIdx = ETAPAS.length - 1; CAPTURA.entrarAsistente(); };

  DR.vibrar([40, 60, 90]);
  if (!DR.anima) {
    DR.$$('.barra-valor', cont).forEach(function (b) { b.style.width = b.getAttribute('data-ancho') + '%'; });
    if (DR.$('#finTotal')) DR.$('#finTotal').textContent = DR.num(total, 0);
    return;
  }
  var trazo = DR.$('.fin-trazo');
  anime({ targets: '.fin-check', scale: [0.4, 1], opacity: [0, 1], duration: 800, easing: 'easeOutElastic(1, .6)' });
  anime({ targets: trazo, strokeDashoffset: [anime.setDashoffset, 0], duration: 700, delay: 250, easing: 'easeInOutQuad' });
  anime({ targets: '.fin-ciclo .ruta, .fin-ciclo h1, .fin-ciclo p, .kpi, .panel, .acciones-fin .btn', opacity: [0, 1], translateY: [14, 0], duration: 500, delay: anime.stagger(70, { start: 350 }), easing: 'easeOutQuad' });
  DR.$$('.barra-valor', cont).forEach(function (b, i) {
    anime({ targets: b, width: [0, b.getAttribute('data-ancho') + '%'], duration: 800, delay: 600 + i * 45, easing: 'easeOutCubic' });
  });
  if (DR.$('#finTotal')) DR.contar(DR.$('#finTotal'), Math.round(total));
};

/* ============================================================ ELIMINAR CICLO (solo admin → papelera) */
CAPTURA.confirmarEliminar = function () {
  var fila = CAPTURA.fila;
  if (!fila || !AT.esAdmin()) return;
  var sub = [fila.fundo, fila.lote ? 'Lote ' + fila.lote : '', fila.fecha].filter(Boolean).map(DR.esc).join(' · ');
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#FFA3A3">' + DR.ICONOS.alerta + '<span>Eliminar ciclo</span></div>' +
    '<div class="res-nombre">' + DR.esc(fila.codigo) + '</div><div class="res-dni">' + sub + '</div>' +
    '<div class="aviso" style="margin-top:14px">Se mueve a la <b>papelera</b> (Config → Ajustes): deja de contar en el resumen y en Google Sheets, y puedes restaurarlo cuando quieras.</div>' +
    '<div class="campo" style="margin-top:14px"><label for="inpMotivo">Motivo</label><input id="inpMotivo" value="Dato de prueba" autocomplete="off"></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="btnCancelarEliminar" style="flex:1">Cancelar</button>' +
    '<button type="button" class="btn btn-rojo" id="btnSiEliminar" style="flex:1">Mover a la papelera</button></div>');
  DR.$('#btnCancelarEliminar').onclick = UI.cerrarHoja;
  DR.$('#btnSiEliminar').onclick = function () {
    var btn = this;
    btn.disabled = true;
    AT.rpc('rpc_eliminar_ciclo', { p_codigo: fila.codigo, p_motivo: DR.$('#inpMotivo').value }).then(function () {
      UI.cerrarHoja();
      CAPTURA.sucio = false;
      DR.toast('Ciclo ' + fila.codigo + ' movido a la papelera.');
      CAPTURA.pintarLista();
    }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
  };
};
