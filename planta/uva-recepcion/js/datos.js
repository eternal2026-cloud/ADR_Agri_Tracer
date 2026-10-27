/* ============================================================================
 * datos.js — RECEPCIÓN UVA (PLANTA): marcas, cálculos, caché y cola sin señal
 * Continúa en planta un ciclo de campo del mismo día (APK o Integra) buscándolo por la
 * placa del camión, o inicia uno nuevo desde planta. Cinco marcas de hora en secuencia:
 *   Llegada del camión → Recepción → Inicio de descarga → Fin de descarga → Inicio de abastecimiento
 * Los tramos entre marcas no son fijos: se calculan (igual que en uva_ciclos, fn_uva_calcular).
 * Cada marca se guarda primero en el equipo y se envía con rpc_uva_planta_guardar (solo las
 * claves tocadas: varias personas pueden marcar el mismo camión sin pisarse).
 * ==========================================================================*/
var PL = { CACHE: 'integra.uvapl.regs', COLA: 'integra.uvapl.cola', CFG: 'integra.uvapl.cfg', enviando: false };

PL.MARCAS = [
  { k: 'hora_llegada', d: 'lleg', n: 9, nombre: 'Llegada del camión', corto: 'Llegada', color: '#0097CE' },
  { k: 'hora_recepcion', d: 'rec', n: 10, nombre: 'Recepción', corto: 'Recepción', color: '#7A3E8E' },
  { k: 'ini_descarga', d: 'idesc', n: 11, nombre: 'Inicio de descarga', corto: 'Ini. descarga', color: '#EF7C3B' },
  { k: 'fin_descarga', d: 'fdesc', n: 12, nombre: 'Fin de descarga', corto: 'Fin descarga', color: '#D9622B' },
  { k: 'ini_abastecimiento', d: 'abast', n: 13, nombre: 'Inicio de abastecimiento a línea', corto: 'Abastecimiento', color: '#76B729' }
];
/** Tramos de planta (minutos): [clave, desde, hasta, nombre]. */
PL.TRAMOS = [
  ['t_espera_recepcion', 'hora_llegada', 'hora_recepcion', 'Espera de recepción'],
  ['t_espera_descarga', 'hora_recepcion', 'ini_descarga', 'Espera de descarga'],
  ['t_descarga', 'ini_descarga', 'fin_descarga', 'Descarga'],
  ['t_espera_abastecimiento', 'fin_descarga', 'ini_abastecimiento', 'Espera de abastecimiento'],
  ['t_en_planta', 'hora_llegada', 'ini_abastecimiento', 'Tiempo en planta']
];
PL.CAUSAS = ['Cola de camiones', 'Falta de personal de descarga', 'Falta de montacargas / estoca', 'Línea detenida o llena',
  'Esperando guía / documentos', 'Control de calidad', 'Cambio de turno / refrigerio', 'Otro'];
PL.ETAPAS_CAMPO = ['Cosecha', 'Traslado de jaba', 'Armado de pallet', 'Lecturado', 'Enzunchado', 'Portabin', 'Carga', 'Traslado a planta'];

/* ------------------------------------------------ almacenamiento */
PL.leer = function (k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
PL.escribir = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { DR.toast('No se pudo guardar en el equipo.', 'error'); } };

/* ------------------------------------------------ horas */
PL.pad = function (n) { return (n < 10 ? '0' : '') + n; };
PL.hora = function (iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return isNaN(d) ? '—' : PL.pad(d.getHours()) + ':' + PL.pad(d.getMinutes()) + ':' + PL.pad(d.getSeconds());
};
PL.horaCorta = function (iso) { var h = PL.hora(iso); return h === '—' ? h : h.slice(0, 5); };
PL.min = function (a, b) { if (!a || !b) return null; var m = (new Date(b) - new Date(a)) / 60000; return isNaN(m) ? null : Math.round(m * 100) / 100; };
/** «HH:MM:SS» del día del registro (hora local) → ISO. */
PL.deHora = function (base, hhmmss) {
  var p = String(hhmmss || '').split(':');
  if (p.length < 2) return null;
  var d = base ? new Date(base) : new Date();
  if (isNaN(d)) d = new Date();
  d.setHours(+p[0] || 0, +p[1] || 0, +p[2] || 0, 0);
  return d.toISOString();
};
PL.hoyISO = function () { var d = new Date(); return d.getFullYear() + '-' + PL.pad(d.getMonth() + 1) + '-' + PL.pad(d.getDate()); };

/* ------------------------------------------------ cálculos (mismos que fn_uva_calcular) */
PL.calcular = function (r) {
  var o = {};
  PL.TRAMOS.forEach(function (t) { o[t[0]] = PL.min(r[t[1]], r[t[2]]); });
  o.t_llegada_desde_carga = r.vinculado ? PL.min(r.fin_carga, r.hora_llegada) : null;
  o.t_ciclo_completo = r.vinculado ? PL.min(r.ini_cosecha, r.ini_abastecimiento) : null;
  return o;
};
/** Siguiente marca por hacer (o null si ya terminó). */
PL.siguiente = function (r) { for (var i = 0; i < PL.MARCAS.length; i++) if (!r[PL.MARCAS[i].k]) return PL.MARCAS[i]; return null; };
PL.hechas = function (r) { return PL.MARCAS.filter(function (m) { return !!r[m.k]; }).length; };
PL.ambito = function (r) { return r.origen === 'planta' ? 'Planta' : (r.vinculado ? 'Ciclo completo' : 'Campo'); };
PL.origenTxt = function (r) { return r.origen === 'apk' ? 'APK' : r.origen === 'integra' ? 'Integra' : 'Planta'; };

/* ------------------------------------------------ caché local (lo del día) */
PL.regs = PL.leer(PL.CACHE, {});
PL.guardarCache = function () {
  // Solo lo de los últimos 2 días: el celular no acumula.
  var lim = Date.now() - 2 * 864e5;
  Object.keys(PL.regs).forEach(function (id) { var r = PL.regs[id]; if (new Date(r._visto || 0) < lim) delete PL.regs[id]; });
  PL.escribir(PL.CACHE, PL.regs);
};
PL.ponerFila = function (f) {
  if (!f || !f.id) return;
  var local = PL.regs[f.id];
  // Lo que aún está en la cola manda sobre lo que vino del servidor.
  var pend = PL.cola().filter(function (o) { return o.p.id === f.id && o.op === 'guardar'; });
  pend.forEach(function (o) { Object.keys(o.p).forEach(function (k) { if (k !== 'id' && k !== 'detalle') f[k] = o.p[k] === '' ? null : o.p[k]; }); });
  if (local && local.planta_detalle && pend.length) f.planta_detalle = local.planta_detalle;
  f._visto = new Date().toISOString();
  PL.regs[f.id] = f;
};

/* ------------------------------------------------ cola sin señal */
PL.cola = function () { return PL.leer(PL.COLA, []); };
PL.encolar = function (op, p) {
  var c = PL.cola();
  c.push({ op: op, p: p, t: Date.now() });
  PL.escribir(PL.COLA, c);
  PL.enviar();
};
PL.esRed = function (m) { return /fetch|network|conexi|timeout|load failed|aborted/i.test(String(m || '')); };

/** Envía la cola en orden; sin señal se detiene y se reintenta luego (online, cada 30 s, botón). */
PL.enviar = function () {
  if (PL.enviando || !navigator.onLine) { PL.estado(); return Promise.resolve(); }
  var c = PL.cola();
  if (!c.length) { PL.estado(); return Promise.resolve(); }
  PL.enviando = true; PL.estado();
  var o = c[0];
  var fn = o.op === 'iniciar' ? 'rpc_uva_planta_iniciar' : 'rpc_uva_planta_guardar';
  return sb.rpc(fn, { p: o.p }).then(function (r) {
    PL.enviando = false;
    if (r.error) {
      if (PL.esRed(r.error.message)) { PL.estado(); return; }
      // El servidor lo rechazó (sin acceso, fuera de horario…): se descarta para no trabar la cola.
      DR.toast('No se guardó en Integra: ' + r.error.message, 'error');
    }
    var resto = PL.cola(); resto.shift(); PL.escribir(PL.COLA, resto);
    if (r.data) { PL.ponerFila(r.data); PL.guardarCache(); }
    if (PL.alCambiar) PL.alCambiar();
    return PL.enviar();
  }, function () { PL.enviando = false; PL.estado(); });
};

PL.estado = function () {
  var n = PL.cola().length, chip = DR.$('#chipDatos'), t = DR.$('#chipTexto');
  if (!chip) return;
  chip.classList.remove('ok', 'alerta');
  if (!navigator.onLine) { t.textContent = 'Sin señal' + (n ? ' · ' + n + ' por enviar' : ''); chip.classList.add('alerta'); }
  else if (n) { t.textContent = (PL.enviando ? 'Enviando… ' : '') + n + ' por enviar'; chip.classList.add('alerta'); }
  else { t.textContent = (AT.perfil && AT.perfil.nombre) || 'En línea'; chip.classList.add('ok'); }
};

/* ------------------------------------------------ servidor */
PL.cargarHoy = function () {
  return AT.rpc('rpc_uva_planta_hoy', { p_placa: null }).then(function (d) {
    (d.filas || []).forEach(PL.ponerFila);
    PL.hoy = d.hoy;
    PL.guardarCache();
    return d;
  });
};
PL.cargarUno = function (id) {
  return AT.rpc('rpc_uva_planta_uno', { p_id: id }).then(function (f) { if (f) { PL.ponerFila(f); PL.guardarCache(); } return f; });
};
PL.cargarConfig = function () {
  return AT.rpc('rpc_uva_config').then(function (d) { var c = (d && d.config) || {}; PL.escribir(PL.CFG, c); return c; }, function () { return PL.config(); });
};
PL.config = function () { return PL.leer(PL.CFG, null) || { plantas: ['LOS MOLINOS', 'DON CARLOS', 'YANCAY'], lineas: [] }; };

/** Lista de hoy (desde la caché): por continuar (campo con placa, sin vincular) y en planta. */
PL.listas = function (filtroPlaca) {
  var hoy = PL.hoy || PL.hoyISO(), f = String(filtroPlaca || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var todos = Object.keys(PL.regs).map(function (id) { return PL.regs[id]; }).filter(function (r) {
    var delDia = r.fecha === hoy || (r.planta_inicio && String(r.planta_inicio).slice(0, 10) >= hoy.slice(0, 10)) || r._nuevo;
    return delDia && (!f || String(r.placa || '').replace(/[^A-Z0-9]/g, '').indexOf(f) > -1);
  });
  var orden = function (a, b) { return String(b.fin_carga || b.planta_inicio || '').localeCompare(String(a.fin_carga || a.planta_inicio || '')); };
  return {
    porContinuar: todos.filter(function (r) { return r.origen !== 'planta' && !r.vinculado && r.placa && r.fecha === hoy; }).sort(orden),
    enPlanta: todos.filter(function (r) { return r.origen === 'planta' || r.vinculado; }).sort(orden)
  };
};

PL.nuevoId = function () {
  var eq = PL.leer('integra.uvapl.equipo', null);
  if (!eq) { eq = Math.random().toString(36).slice(2, 6).toUpperCase(); PL.escribir('integra.uvapl.equipo', eq); }
  return 'UV-PL-' + eq + '-' + Date.now().toString(36).toUpperCase();
};
