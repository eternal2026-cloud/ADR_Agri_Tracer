/* ============================================================================
 * tiempos.js — TOMA DE TIEMPO POR ACTIVIDAD (ETAPAS EN PARALELO)
 * Se toca la actividad → arranca su reloj. Pueden correr varias a la vez
 * (p. ej. cosecha y traslado se solapan); cada una se termina por separado.
 * Los relojes en curso viven en localStorage (no se pierden al cerrar la app) y
 * cada toma se guarda con segundos. Sin señal, queda en «pendientes» y se reintenta.
 * ==========================================================================*/
var TIEMPOS = { _ini: {} };

TIEMPOS.clave = function () { return 'reloj.' + EVAL.ev.id; };
TIEMPOS.clavePend = function () { return 'pend.' + EVAL.ev.id; };
/** Relojes en curso: [{ actividad_id, inicio, id? }]. Antes se guardaba uno solo (objeto). */
TIEMPOS.relojes = function () {
  var r = TOP.leer(TIEMPOS.clave(), null);
  return !r ? [] : Array.isArray(r) ? r : [r];
};
TIEMPOS.guardarRelojes = function (l) { TOP.escribir(TIEMPOS.clave(), l.length ? l : null); };
TIEMPOS.pendientes = function () { return TOP.leer(TIEMPOS.clavePend(), []); };

TIEMPOS.pintar = function (cont) {
  clearInterval(TIEMPOS._t);
  var ev = EVAL.ev, edita = TOP.puedeEditar(ev), rs = TIEMPOS.relojes(), pend = TIEMPOS.pendientes();
  var corriendo = rs.map(function (r) { return r.actividad_id; });
  var h = '';
  if (rs.length) {
    h += '<div class="top-relojes' + (rs.length > 1 ? ' varios' : '') + '">' + rs.map(function (r) {
      var a = TOP.actividad(r.actividad_id), cl = TOP.CLASES[a.clase];
      return '<section class="panel entra top-reloj" style="--c:' + cl.c + '"><div class="top-reloj-cab"><span class="pill gris">' + DR.esc(cl.t) + '</span>' +
        '<span>Inició ' + TOP.horaSeg(r.inicio) + '</span></div><h2>' + DR.esc(a.nombre) + '</h2>' +
        '<div class="top-reloj-cifra" data-cifra="' + DR.esc(r.inicio) + '">0:00</div>' +
        '<div class="acciones"><button type="button" class="btn grande verde" data-terminar="' + DR.esc(r.inicio) + '">Terminar</button>' +
        '<button type="button" class="btn sec" data-descartar="' + DR.esc(r.inicio) + '">Descartar</button></div></section>';
    }).join('') + '</div>';
  }
  if (pend.length) {
    h += '<div class="aviso alerta entra" style="margin-bottom:14px"><b>' + pend.length + ' toma(s) sin subir</b> (sin señal). ' +
      '<button type="button" class="btn mini azul" id="btnReintentar">Reintentar ahora</button></div>';
  }
  if (edita) {
    h += UI.panel(rs.length ? 'Iniciar otra etapa en paralelo' : 'Toca la actividad para iniciar',
      rs.length ? 'Las etapas en curso siguen corriendo; termina cada una cuando acabe.' : 'Puedes medir varias etapas a la vez: cada una tiene su propio reloj, con segundos.',
      TOP.ORDEN_CLASES.map(function (c) {
        var acts = TOP.actividades.filter(function (a2) { return a2.clase === c; });
        // Cosecha (productiva) va sola y grande: es la toma más frecuente.
        return '<div class="top-clase-tit" style="--c:' + TOP.CLASES[c].c + '">' + DR.esc(TOP.CLASES[c].t) + '</div><div class="top-acts' + (c === 'productiva' ? ' grande' : '') + '">' +
          acts.map(function (a2) {
            var n = EVAL.d.tiempos.filter(function (t) { return t.actividad_id === a2.id; }).length, on = corriendo.indexOf(a2.id) > -1;
            return '<button type="button" class="top-act' + (on ? ' en-curso' : '') + '" style="--c:' + TOP.CLASES[c].c + '" data-act="' + a2.id + '"' + (on ? ' disabled' : '') + '>' +
              DR.esc(a2.nombre) + (on ? '<small>en curso</small>' : '') + (n ? '<b>' + n + '</b>' : '') + '</button>';
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

  if (rs.length) {
    var tic = function () {
      DR.$$('[data-cifra]', cont).forEach(function (el) { el.textContent = TOP.seg((Date.now() - new Date(el.getAttribute('data-cifra')).getTime()) / 1000); });
    };
    tic();
    TIEMPOS._t = setInterval(tic, 1000);
    DR.$$('[data-terminar]', cont).forEach(function (b) { b.onclick = function () { TIEMPOS.terminar(this.getAttribute('data-terminar'), this); }; });
    DR.$$('[data-descartar]', cont).forEach(function (b) {
      b.onclick = function () {
        var ini = this.getAttribute('data-descartar'), l = TIEMPOS.relojes(), rr = l.filter(function (x) { return x.inicio === ini; })[0];
        if (!rr || !window.confirm('¿Descartar la toma de «' + TOP.actividad(rr.actividad_id).nombre + '»? No se guardará.')) return;
        TIEMPOS.guardarRelojes(l.filter(function (x) { return x.inicio !== ini; }));
        if (rr.id) AT.rpc('rpc_top_borrar_tiempo', { p_id: rr.id }).then(EVAL.recargar).catch(function () { EVAL.recargar(); });
        else TIEMPOS.pintar(cont);
      };
    });
  }
  DR.$$('[data-act]', cont).forEach(function (b) { b.onclick = function () { TIEMPOS.iniciar(Number(this.getAttribute('data-act'))); }; });
  DR.$$('[data-toma]', cont).forEach(function (b) {
    b.onclick = function () { TIEMPOS.editar(EVAL.d.tiempos.filter(function (t) { return t.id === Number(b.getAttribute('data-toma')); })[0]); };
  });
  if (DR.$('#btnManual')) DR.$('#btnManual').onclick = function () { TIEMPOS.editar(null); };
  if (DR.$('#btnReintentar')) DR.$('#btnReintentar').onclick = function () { TIEMPOS.subirPendientes(true); };
};

/** Inicia un reloj (sin detener los que ya corren): primero en el celular y luego crea la fila abierta en Supabase. */
TIEMPOS.iniciar = function (actividadId) {
  var l = TIEMPOS.relojes();
  if (l.some(function (x) { return x.actividad_id === actividadId; })) { DR.toast('Esa etapa ya está corriendo.', 'error'); return; }
  DR.desbloquearAudio();
  var r = { actividad_id: actividadId, inicio: new Date().toISOString() };
  // El inicio identifica cada reloj: dos toques en el mismo milisegundo se separan 1 ms.
  while (l.some(function (x) { return x.inicio === r.inicio; })) r.inicio = new Date(new Date(r.inicio).getTime() + 1).toISOString();
  l.push(r);
  TIEMPOS.guardarRelojes(l);
  DR.vibrar(30); DR.sonar(true);
  TIEMPOS.pintar(DR.$('#seccion'));
  // Si se termina antes de que responda el servidor, terminar() espera este id para no duplicar la toma.
  TIEMPOS._ini[r.inicio] = AT.rpc('rpc_top_guardar_tiempo', { p: { evaluacion_id: EVAL.ev.id, actividad_id: actividadId, inicio: r.inicio } }).then(function (fila) {
    var actual = TIEMPOS.relojes();
    actual.forEach(function (x) { if (x.inicio === r.inicio) x.id = fila.id; });
    TIEMPOS.guardarRelojes(actual);
    return fila.id;
  }).catch(function () { return null; /* sin señal: se guardará completa al terminar */ });
};

TIEMPOS.terminar = function (inicio, btn) {
  var l = TIEMPOS.relojes(), r = l.filter(function (x) { return x.inicio === inicio; })[0];
  if (!r) return;
  var p = { id: r.id || null, evaluacion_id: EVAL.ev.id, actividad_id: r.actividad_id, inicio: r.inicio, fin: new Date().toISOString() };
  TIEMPOS.guardarRelojes(l.filter(function (x) { return x.inicio !== inicio; }));
  DR.vibrar([30, 40, 30]); DR.sonar(true);
  if (btn) btn.classList.add('cargando');
  var idInicio = !p.id && TIEMPOS._ini[r.inicio] ? TIEMPOS._ini[r.inicio] : Promise.resolve(p.id);
  delete TIEMPOS._ini[r.inicio];
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
