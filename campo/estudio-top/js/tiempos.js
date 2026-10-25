/* ============================================================================
 * tiempos.js — TOMA DE TIEMPO POR ACTIVIDAD AISLADA
 * Se toca la actividad → Iniciar → Terminar. Una sola actividad abierta a la vez.
 * El reloj en curso vive en localStorage (no se pierde al cerrar la app) y la
 * toma se guarda con segundos. Sin señal, queda en «pendientes» y se reintenta.
 * ==========================================================================*/
var TIEMPOS = {};

TIEMPOS.clave = function () { return 'reloj.' + EVAL.ev.id; };
TIEMPOS.clavePend = function () { return 'pend.' + EVAL.ev.id; };
TIEMPOS.reloj = function () { return TOP.leer(TIEMPOS.clave(), null); };
TIEMPOS.pendientes = function () { return TOP.leer(TIEMPOS.clavePend(), []); };

TIEMPOS.pintar = function (cont) {
  clearInterval(TIEMPOS._t);
  var ev = EVAL.ev, edita = TOP.puedeEditar(ev), r = TIEMPOS.reloj(), pend = TIEMPOS.pendientes();
  var h = '';
  if (r) {
    var a = TOP.actividad(r.actividad_id), cl = TOP.CLASES[a.clase];
    h += '<section class="panel entra top-reloj" style="--c:' + cl.c + '"><div class="top-reloj-cab"><span class="pill gris">' + DR.esc(cl.t) + '</span>' +
      '<span>Inició ' + TOP.horaSeg(r.inicio) + '</span></div><h2>' + DR.esc(a.nombre) + '</h2>' +
      '<div class="top-reloj-cifra" id="relojCifra">0:00</div>' +
      '<div class="acciones"><button type="button" class="btn grande verde" id="btnTerminar">Terminar</button>' +
      '<button type="button" class="btn sec" id="btnCancelarReloj">Descartar</button></div></section>';
  }
  if (pend.length) {
    h += '<div class="aviso alerta entra" style="margin-bottom:14px"><b>' + pend.length + ' toma(s) sin subir</b> (sin señal). ' +
      '<button type="button" class="btn mini azul" id="btnReintentar">Reintentar ahora</button></div>';
  }
  if (edita) {
    h += UI.panel(r ? 'Actividades' : 'Toca la actividad para iniciar', r ? 'Termina la actividad en curso para iniciar otra.' : 'Cada toma es independiente: inicio y fin con segundos.',
      TOP.ORDEN_CLASES.map(function (c) {
        var acts = TOP.actividades.filter(function (a2) { return a2.clase === c; });
        // Cosecha (productiva) va sola y grande: es la toma más frecuente.
        return '<div class="top-clase-tit" style="--c:' + TOP.CLASES[c].c + '">' + DR.esc(TOP.CLASES[c].t) + '</div><div class="top-acts' + (c === 'productiva' ? ' grande' : '') + '">' +
          acts.map(function (a2) {
            var n = EVAL.d.tiempos.filter(function (t) { return t.actividad_id === a2.id; }).length;
            return '<button type="button" class="top-act" style="--c:' + TOP.CLASES[c].c + '" data-act="' + a2.id + '"' + (r ? ' disabled' : '') + '>' +
              DR.esc(a2.nombre) + (n ? '<b>' + n + '</b>' : '') + '</button>';
          }).join('') + '</div>';
      }).join('') + '<div class="acciones"><button type="button" class="btn sec chico" id="btnManual">' + DR.ICONOS.mas + 'Registrar a mano</button></div>');
  }

  var lista = EVAL.d.tiempos.slice().sort(function (a2, b) { return a2.inicio < b.inicio ? 1 : -1; });
  var total = lista.reduce(function (s, t) { return s + (t.duracion_seg || 0); }, 0);
  h += UI.panel('Tomas registradas', lista.length + ' toma(s) · ' + TOP.segTexto(total) + ' medidos' + (edita ? ' · toca una para corregirla' : ''),
    lista.length ? '<div class="top-tomas">' + lista.map(function (t) {
      var a2 = TOP.actividad(t.actividad_id);
      return '<button type="button" class="top-toma" data-toma="' + t.id + '"' + (edita ? '' : ' disabled') + ' style="--c:' + TOP.CLASES[a2.clase].c + '">' +
        '<span class="top-toma-nom">' + DR.esc(a2.nombre) + (t.nota ? '<small>' + DR.esc(t.nota) + '</small>' : '') + '</span>' +
        '<span class="top-toma-hora">' + TOP.horaSeg(t.inicio) + ' → ' + (t.fin ? TOP.horaSeg(t.fin) : 'en curso') + '</span>' +
        '<b>' + (t.duracion_seg !== null ? TOP.seg(t.duracion_seg) : '—') + '</b></button>';
    }).join('') + '</div>' : '<div class="vacio">Aún no hay tomas.</div>');
  cont.innerHTML = h;
  DR.entrarPaneles('#' + cont.id);

  if (r) {
    var cifra = DR.$('#relojCifra'), ini = new Date(r.inicio).getTime();
    var tic = function () { if (cifra) cifra.textContent = TOP.seg((Date.now() - ini) / 1000); };
    tic();
    TIEMPOS._t = setInterval(tic, 1000);
    DR.$('#btnTerminar').onclick = function () { TIEMPOS.terminar(this); };
    DR.$('#btnCancelarReloj').onclick = function () {
      if (!window.confirm('¿Descartar esta toma? No se guardará.')) return;
      var rr = TIEMPOS.reloj();
      TOP.escribir(TIEMPOS.clave(), null);
      if (rr && rr.id) AT.rpc('rpc_top_borrar_tiempo', { p_id: rr.id }).then(EVAL.recargar).catch(function () { EVAL.recargar(); });
      else TIEMPOS.pintar(cont);
    };
  }
  DR.$$('[data-act]', cont).forEach(function (b) { b.onclick = function () { TIEMPOS.iniciar(Number(this.getAttribute('data-act'))); }; });
  DR.$$('[data-toma]', cont).forEach(function (b) {
    b.onclick = function () { TIEMPOS.editar(EVAL.d.tiempos.filter(function (t) { return t.id === Number(b.getAttribute('data-toma')); })[0]); };
  });
  if (DR.$('#btnManual')) DR.$('#btnManual').onclick = function () { TIEMPOS.editar(null); };
  if (DR.$('#btnReintentar')) DR.$('#btnReintentar').onclick = function () { TIEMPOS.subirPendientes(true); };
};

/** Inicia el reloj: primero en el celular (al instante) y luego crea la fila abierta en Supabase. */
TIEMPOS.iniciar = function (actividadId) {
  if (TIEMPOS.reloj()) { DR.toast('Termina primero la actividad en curso.', 'error'); return; }
  DR.desbloquearAudio();
  var r = { actividad_id: actividadId, inicio: new Date().toISOString() };
  TOP.escribir(TIEMPOS.clave(), r);
  DR.vibrar(30); DR.sonar(true);
  TIEMPOS.pintar(DR.$('#seccion'));
  // Si se termina antes de que responda el servidor, terminar() espera este id para no duplicar la toma.
  TIEMPOS._ini = { inicio: r.inicio, prom: AT.rpc('rpc_top_guardar_tiempo', { p: { evaluacion_id: EVAL.ev.id, actividad_id: actividadId, inicio: r.inicio } }).then(function (fila) {
    var actual = TIEMPOS.reloj();
    if (actual && actual.inicio === r.inicio) { actual.id = fila.id; TOP.escribir(TIEMPOS.clave(), actual); }
    return fila.id;
  }).catch(function () { return null; /* sin señal: se guardará completa al terminar */ }) };
};

TIEMPOS.terminar = function (btn) {
  var r = TIEMPOS.reloj();
  if (!r) return;
  var p = { id: r.id || null, evaluacion_id: EVAL.ev.id, actividad_id: r.actividad_id, inicio: r.inicio, fin: new Date().toISOString() };
  TOP.escribir(TIEMPOS.clave(), null);
  DR.vibrar([30, 40, 30]); DR.sonar(true);
  if (btn) btn.classList.add('cargando');
  var idInicio = !p.id && TIEMPOS._ini && TIEMPOS._ini.inicio === r.inicio ? TIEMPOS._ini.prom : Promise.resolve(p.id);
  idInicio.then(function (id) {
    p.id = id || null;
    return AT.rpc('rpc_top_guardar_tiempo', { p: p });
  }).then(function () {
    DR.toast(TOP.actividad(p.actividad_id).nombre + ': ' + TOP.seg((new Date(p.fin) - new Date(p.inicio)) / 1000));
    EVAL.recargar();
  }).catch(function () {
    var pend = TIEMPOS.pendientes();
    pend.push(p);
    TOP.escribir(TIEMPOS.clavePend(), pend);
    DR.toast('Sin señal: la toma quedó guardada en el celular y se subirá luego.', 'info');
    TIEMPOS.pintar(DR.$('#seccion'));
  });
};

TIEMPOS.subirPendientes = function (avisar) {
  if (!EVAL.ev) return Promise.resolve();
  var pend = TIEMPOS.pendientes();
  if (!pend.length) return Promise.resolve();
  var quedan = [];
  return pend.reduce(function (pr, p) {
    return pr.then(function () { return AT.rpc('rpc_top_guardar_tiempo', { p: p }).catch(function () { quedan.push(p); }); });
  }, Promise.resolve()).then(function () {
    TOP.escribir(TIEMPOS.clavePend(), quedan.length ? quedan : null);
    if (avisar) DR.toast(quedan.length ? 'Aún sin señal: quedan ' + quedan.length + ' toma(s).' : 'Tomas pendientes subidas.', quedan.length ? 'error' : 'ok');
    if (quedan.length < pend.length) EVAL.recargar();
  });
};

/** Corregir una toma (o registrarla a mano): horas con segundos y nota. */
TIEMPOS.editar = function (t) {
  var nueva = !t, ahora = TOP.localDe(new Date());
  UI.abrirHoja('<h2>' + (nueva ? 'Registrar toma a mano' : 'Corregir toma') + '</h2><div class="form" id="frmToma" style="margin-top:12px">' +
    '<div class="campo ancho"><label>Actividad</label><select data-campo="actividad_id">' + TOP.actividades.map(function (a) {
      return '<option value="' + a.id + '"' + (t && t.actividad_id === a.id ? ' selected' : '') + '>' + DR.esc(a.nombre) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="campo"><label>Inicio</label><input type="datetime-local" step="1" data-campo="inicio" value="' + (t ? TOP.aLocal(t.inicio) : ahora) + '"></div>' +
    '<div class="campo"><label>Fin</label><input type="datetime-local" step="1" data-campo="fin" value="' + (t ? TOP.aLocal(t.fin) : ahora) + '"></div>' +
    '<div class="campo ancho"><label>Nota <em>opcional</em></label><input data-campo="nota" maxlength="200" value="' + DR.esc(t ? t.nota : '') + '" placeholder="Ej. lote con mucha fruta, interrupción…"></div></div>' +
    '<div class="acciones"><button type="button" class="btn verde" id="btnGuardarToma">Guardar</button>' +
    (nueva ? '' : '<button type="button" class="btn sec btn-peligro" id="btnBorrarToma">Borrar toma</button>') +
    '<button type="button" class="btn sec" onclick="UI.cerrarHoja()">Cancelar</button></div>');
  DR.$('#btnGuardarToma').onclick = function () {
    var f = UI.leerForm('frmToma'), btn = this;
    var p = { id: t ? t.id : null, evaluacion_id: EVAL.ev.id, actividad_id: Number(f.actividad_id), inicio: TOP.aIso(f.inicio), fin: TOP.aIso(f.fin), nota: f.nota };
    if (!p.inicio) { DR.toast('Falta la hora de inicio.', 'error'); return; }
    if (p.fin && p.fin < p.inicio) { DR.toast('El fin no puede ser antes del inicio.', 'error'); return; }
    btn.classList.add('cargando');
    AT.rpc('rpc_top_guardar_tiempo', { p: p }).then(function () { UI.cerrarHoja(); DR.toast('Toma guardada.'); EVAL.recargar(); })
      .catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
  if (DR.$('#btnBorrarToma')) DR.$('#btnBorrarToma').onclick = function () {
    if (!window.confirm('¿Borrar esta toma?')) return;
    AT.rpc('rpc_top_borrar_tiempo', { p_id: t.id }).then(function () { UI.cerrarHoja(); DR.toast('Toma borrada.'); EVAL.recargar(); })
      .catch(function (e) { DR.toast(e.message, 'error'); });
  };
};
