/* ============================================================================
 * integra.js — SUBIDA INCREMENTAL A INTEGRA (Supabase), en lugar de sheets.js de la APK
 * Mismo esquema que la APK: todo se guarda primero en el equipo; cuando hay señal se
 * envían, de uno en uno, los registros nuevos o editados después de su última subida
 * (y en vivo los pallets en proceso). El paquete es EXACTAMENTE el que la APK manda a
 * su Google Sheet: rpc_uva_guardar_campo hace «upsert» por ID (UV-IN-…), nunca duplica,
 * y lo guarda en uva_ciclos junto a los de la APK (UV-EQ-…), sin chocar.
 * Se conserva el nombre SHEETS para no tocar registrar.js ni vistas.js.
 * ==========================================================================*/

var SHEETS = { subiendo: false };

SHEETS.hayRed = function () { return navigator.onLine !== false; };
/** Con sesión de Integra siempre hay a dónde subir. */
SHEETS.configurado = function () { return !!(window.AT && AT.perfil); };

SHEETS.SIN_RED = /failed to fetch|networkerror|network request failed|load failed|fetch|timeout|aborted/i;

/** Llama a la RPC con el paquete; los errores de red se traducen para cortar la subida. */
SHEETS.llamar = function (cuerpo) {
  if (!SHEETS.hayRed()) return Promise.reject(new Error('Sin conexión con Integra. Revisa la red.'));
  return sb.rpc('rpc_uva_guardar_campo', { p_payload: cuerpo }).then(function (r) {
    if (r.error) {
      var m = r.error.message || '';
      if (SHEETS.SIN_RED.test(m)) throw new Error('Sin conexión con Integra. Revisa la red.');
      if (/JWT|sesi[oó]n/i.test(m)) throw new Error('Tu sesión venció: vuelve a entrar a Integra (los registros siguen en el equipo).');
      throw new Error(m || 'Integra rechazó el registro.');
    }
    return r.data || { ok: true };
  }, function (e) {
    throw new Error(SHEETS.SIN_RED.test(String(e && e.message)) ? 'Sin conexión con Integra. Revisa la red.' : String(e && e.message || e));
  });
};

SHEETS.probar = function () {
  return sb.rpc('rpc_uva_config').then(function (r) {
    if (r.error) throw new Error(r.error.message);
    return { hoja: 'Integra' };
  });
};

SHEETS.paquete = function (r) {
  var c = TC.calcular(r), sit = TC.situacion(r);
  var r1 = function (v) { return v === null || v === undefined ? '' : Math.round(v * 10) / 10; };
  var nombre = function (id) { return id ? TC.E[id].nombre : ''; };
  return {
    accion: 'guardar', app: 'Integra · Tiempo Ciclo Uva v' + DR.VERSION,
    registrador: r.registrador || TC.cfg.usuario, dispositivo: r.dispositivo || TC.cfg.dispositivo,
    registro: {
      id: r.id, semana: TC.semana(r.fecha), fecha: r.fecha, campana: r.campana, zona: r.zona, fundo: r.fundo, lote: r.lote,
      sublote: r.sublote, pasada: r.pasada, color: r.color, variedad: r.variedad, grupo: r.grupo, pallet: r.pallet,
      jabas: r.jabas, zunchos: r.zunchos, placa: r.placa, palletsTot: r.palletsTot, palletsCarg: r.palletsCarg,
      cargaTot: r.cargaTot || '', cargaCarg: r.cargaCarg || '', planta: r.planta,
      // Hora en que se tomó cada dato en el celular: Integra junta versiones del mismo ciclo por ella (0057).
      marcas: r.t || {}, union: r.union ? true : undefined, editadoPor: TC.cfg.usuario,
      minTotal: r1(c.total), minConformacion: r1(c.conformacion), minEtapas: r1(c.suma), minEsperas: r1(c.esperas), metaTotal: c.meta,
      enMeta: c.enMeta === null ? '' : (c.enMeta ? 'Sí' : 'No'), atipico: c.atipico ? 'Sí' : '',
      lenta: nombre(c.lenta), mayorEspera: nombre(c.mayorEspera),
      observacion: r.observacion || '', creado: r.creado, modificado: r.actualizado,
      estado: r.estado === 'cerrado' ? 'Cerrado' : (TC.enProceso(r) ? 'En proceso' : 'Sin iniciar'),
      etapaActual: r.estado === 'cerrado' ? '' : sit.etapa, situacion: r.estado === 'cerrado' ? '' : sit.estado, desde: r.estado === 'cerrado' ? '' : sit.desde,
      // El ámbito real (Campo / Ciclo completo) lo pone Integra según si Planta lo continúa.
      ambito: 'Campo',
      // En Integra el catálogo viene de la base (no hay JSON firmado): la trazabilidad es el usuario con sesión.
      permisosPerfil: 'Integra', permisosVersion: '', permisosFirma: '', permisosHash: ''
    },
    etapas: TC.ETAPAS.map(function (e) {
      var x = r.etapas[e.id], k = c.etapas[e.id];
      return { n: e.n, id: e.id, etapa: e.nombre, inicio: x.ini, fin: x.fin, minutos: r1(k.min), espera: r1(k.espera), meta: k.meta,
        enMeta: k.min === null || !k.meta ? '' : (k.min <= k.meta ? 'Sí' : 'No'), causa: x.causa || '', comentario: x.com || '', editado: x.editado ? 'Sí' : '' };
    })
  };
};

SHEETS.subirPendientes = function (aviso) {
  aviso = aviso || function () {};
  if (SHEETS.subiendo) return Promise.reject(new Error('Ya hay una subida en curso.'));
  if (!SHEETS.configurado()) return Promise.reject(new Error('Inicia sesión en Integra para subir.'));
  if (!SHEETS.hayRed()) return Promise.reject(new Error('No hay conexión. Tus registros siguen guardados en el equipo.'));
  SHEETS.subiendo = true;
  var pend = TC.registros().filter(TC.pendiente).reverse(), hechos = 0, errores = 0;

  /** Primero las bajas: registros eliminados en el equipo que ya estaban en Integra. */
  function bajas() {
    var b = TC.cfg.bajas[0];
    if (!b) return Promise.resolve();
    return SHEETS.llamar({ accion: 'eliminar', registro: { id: b.id }, registrador: b.registrador, dispositivo: b.dispositivo })
      .then(function () { TC.cfg.bajas.shift(); TC.guardarCfg(); return bajas(); });
  }

  function siguiente(i) {
    if (i >= pend.length) return Promise.resolve({ total: pend.length, hechos: hechos, errores: errores });
    var r = pend[i], modEnviado = r.actualizado;
    aviso({ total: pend.length, hechos: hechos });
    return SHEETS.llamar(SHEETS.paquete(r)).then(function (res) {
      // Eliminado en Integra o de otra persona (usuario en «Solo sus ciclos»): se borra la copia del equipo.
      if (res && (res.eliminado || res.ajeno)) {
        TC.olvidar(r.id);
        DR.toast('Pallet ' + TC.titulo(r) + (res.eliminado ? ' ya fue eliminado en Integra' : ' es de ' + (res.registrador || 'otra persona')) + ': se quitó de este equipo.', 'info');
        hechos++;
        return siguiente(i + 1);
      }
      // Integra pudo unirlo a otro ciclo del mismo N° de pallet (otro ID) y devuelve el ciclo combinado.
      var act = res && res.id && res.id !== r.id ? TC.renombrar(r.id, res.id) : TC.obtener(r.id);
      if (act) {
        // Con otro ID se vuelve a subir con el vigente (Integra ya tiene lo combinado; no duplica).
        act.subidoMod = res && res.id && res.id !== r.id ? '' : modEnviado; act.subido = new Date().toISOString(); act.error = '';
        // Lo que otra persona tomó en este ciclo entra al equipo; se vuelve a subir para recalcular minutos y esperas.
        if (res && res.fila && TC.fusionar(act, NUBE.aRegistro(res.fila))) act.actualizado = new Date().toISOString();
        TC.guardarRegistro(act, true); SHEETS.ponerLlegada(act, res);
        if (window.REG && REG.id === act.id && REG.vista === 'wiz' && DR.vista === 'registrar' && act.actualizado !== act.subidoMod) REG.pintarWiz(DR.$('#contenido'), act, 0);
      }
      hechos++;
      return siguiente(i + 1);
    }, function (e) {
      errores++;
      var act = TC.obtener(r.id);
      if (act) { act.error = e.message; TC.guardarRegistro(act, true); }
      if (/conexión|tiempo de espera|sesión venció/i.test(e.message)) return { total: pend.length, hechos: hechos, errores: errores, cortado: e.message };
      return siguiente(i + 1);
    });
  }
  return bajas().then(function () { return siguiente(0); }, function (e) {
    if (/conexión|tiempo de espera|sesión venció/i.test(e.message)) return { total: pend.length, hechos: 0, errores: 1, cortado: e.message };
    TC.cfg.bajas.shift(); TC.guardarCfg();
    return siguiente(0);
  }).then(function (res) {
    SHEETS.subiendo = false;
    TC.cfg.sheets.ultimaSubida = new Date().toISOString();
    TC.guardarCfg();
    return res;
  }, function (e) { SHEETS.subiendo = false; throw e; });
};

SHEETS.subir = function (silencioso) {
  return SHEETS.subirPendientes().then(function (res) {
    var msg = res.total ? res.hechos + ' de ' + res.total + ' subido(s)' + (res.errores ? ' · ' + res.errores + ' con error' : '') : 'No había nada pendiente.';
    if (!silencioso || res.hechos) DR.toast(res.cortado ? res.cortado + ' ' + msg : msg, res.errores ? 'error' : 'ok');
    APP.estado();
    return res;
  }, function (e) {
    if (!silencioso) DR.toast(e.message, 'error');
    APP.estado();
    throw e;
  });
};

/* ------------------------------ llegada del camión (compartida con Planta) ------------------------------
 * El fin de la etapa 8 (Traslado a planta) es la llegada del camión: la marca campo o planta, la que
 * llegue primero. Si la marcó planta, aquí se completa la etapa 8 (y se vuelve a subir igual). */
SHEETS.ponerLlegada = function (r, d) {
  if (!r || !d || !d.llegada || r.estado === 'cerrado') return;
  var x = r.etapas.tra;
  if (x.fin) return;
  if (!x.ini) x.ini = r.etapas.car.fin || '';
  x.fin = new Date(d.llegada).toISOString();
  x.porPlanta = true; x.editado = false;
  if (!r.planta && d.planta) r.planta = d.planta;
  TC.guardarRegistro(r); ALERTAS.sync(r);
  DR.toast('Planta marcó la llegada del camión' + (r.placa ? ' ' + r.placa : '') + ' · ' + DR.hhmm(x.fin) + '.', 'info');
  if (DR.vista === 'registrar' && window.REG && REG.id === r.id && REG.vista === 'wiz') REG.pintarWiz(DR.$('#contenido'), r, 0);
  SHEETS.pronto();
};

/** Consulta las llegadas que marcó planta para los pallets en curso ya subidos (con placa). */
SHEETS.llegadas = function () {
  var ids = TC.registros().filter(function (r) {
    return r.estado !== 'cerrado' && r.subidoMod && r.placa && !r.etapas.tra.fin;
  }).map(function (r) { return r.id; });
  if (!ids.length || SHEETS._consultando) return;
  SHEETS._consultando = true;
  sb.rpc('rpc_uva_campo_llegadas', { p_ids: ids }).then(function (res) {
    SHEETS._consultando = false;
    (res.data || []).forEach(function (d) { SHEETS.ponerLlegada(TC.obtener(d.id), d); });
    APP.estado();
  }, function () { SHEETS._consultando = false; });
};

/** Automática: al cerrar un registro, al volver la señal y cada 2 minutos. */
SHEETS.auto = function () {
  if (!SHEETS.configurado() || !SHEETS.hayRed()) return;
  SHEETS.llegadas();
  if (SHEETS.subiendo) { SHEETS._otraVez = true; return; }
  SHEETS.lotesNuevos();
  if (!TC.registros().some(TC.pendiente) && !TC.cfg.bajas.length) return;
  SHEETS.subir(true).then(function () {
    if (DR.vista === 'registros' || (DR.vista === 'registrar' && REG.vista === 'lista')) APP.ir(DR.vista, true);
    if (SHEETS._otraVez) { SHEETS._otraVez = false; SHEETS.auto(); }
  }, function () { SHEETS._otraVez = false; });
};

/** Lotes digitados que no estaban en el catálogo (CAT.agregarLote): se guardan en Integra para todos. */
SHEETS.lotesNuevos = function () {
  var l = TC.cfg.lotesNuevos || [];
  if (!l.length || SHEETS._lotes) return;
  SHEETS._lotes = true;
  var x = l[0];
  sb.rpc('rpc_uva_lote_nuevo', { p_fundo: x[1], p_lote: x[2], p_variedad: x[3] || '' }).then(function (res) {
    SHEETS._lotes = false;
    // Sin señal o la base aún sin rpc_uva_lote_nuevo (0057): se reintenta luego. Si Integra lo rechaza, queda solo aquí.
    if (res.error && (SHEETS.SIN_RED.test(res.error.message || '') || /function|funci[oó]n|schema cache/i.test(res.error.message || ''))) return;
    TC.cfg.lotesNuevos.shift(); TC.guardarCfg();
    SHEETS.lotesNuevos();
  }, function () { SHEETS._lotes = false; });
};

/** Envío «en vivo»: unos segundos después de cada Iniciar/Terminar (agrupa toques seguidos). */
SHEETS.pronto = function () {
  clearTimeout(SHEETS._prontoT);
  SHEETS._prontoT = setTimeout(SHEETS.auto, 2500);
};
