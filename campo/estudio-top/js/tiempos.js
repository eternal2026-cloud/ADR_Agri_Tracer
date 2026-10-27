/* ============================================================================
 * tiempos.js — JORNADA Y TOMA DE TIEMPO POR ETAPA (SECUENCIAL)
 * Inicio y fin de jornada son marcas fijas de la evaluación (no actividades).
 * Dentro de la jornada las etapas van una tras otra: se inicia, se termina y
 * se inicia la siguiente. Lo que pasa entre ambas se registra solo como
 * «Tiempo muerto» (con nota opcional) y se cierra al iniciar la etapa siguiente.
 * Los relojes viven en localStorage (no se pierden al cerrar la app) y cada toma
 * se guarda con segundos. Sin señal, queda en «pendientes» y se reintenta.
 * ==========================================================================*/
var TIEMPOS = { _ini: {} };

/** Un tiempo muerto más corto que esto (y sin nota) es solo el toque entre etapas: no se guarda. */
TIEMPOS.MUERTO_MIN_SEG = 5;

TIEMPOS.clave = function () { return 'reloj.' + EVAL.ev.id; };
TIEMPOS.clavePend = function () { return 'pend.' + EVAL.ev.id; };
TIEMPOS.claveJornada = function () { return 'jornada.' + EVAL.ev.id; };
/** Relojes en curso: [{ actividad_id, inicio, id?, nota? }]. Antes se guardaba uno solo (objeto). */
TIEMPOS.relojes = function () {
  var r = TOP.leer(TIEMPOS.clave(), null);
  r = !r ? [] : Array.isArray(r) ? r : [r];
  // Relojes de «Inicio/Fin de jornada» de la versión anterior: ahora son marcas de la evaluación.
  return r.filter(function (x) { return TOP.ID_JORNADA.indexOf(x.actividad_id) < 0; });
};
TIEMPOS.guardarRelojes = function (l) { TOP.escribir(TIEMPOS.clave(), l.length ? l : null); };
TIEMPOS.pendientes = function () { return TOP.leer(TIEMPOS.clavePend(), []); };
TIEMPOS.esMuerto = function (r) { return r.actividad_id === TOP.ID_MUERTO; };
/** La etapa en curso (no el tiempo muerto). */
TIEMPOS.etapa = function () { return TIEMPOS.relojes().filter(function (r) { return !TIEMPOS.esMuerto(r); })[0] || null; };

/** Jornada { inicio, fin }: lo que aún no sube al servidor manda sobre lo guardado. */
TIEMPOS.jornada = function () {
  return TOP.leer(TIEMPOS.claveJornada(), null) || { inicio: EVAL.ev.jornada_inicio || null, fin: EVAL.ev.jornada_fin || null };
};
TIEMPOS.guardarJornada = function (j) {
  var ev = EVAL.ev;
  ev.jornada_inicio = j.inicio; ev.jornada_fin = j.fin;
  TOP.escribir(TIEMPOS.claveJornada(), j);
  return AT.rpc('rpc_top_guardar_jornada', { p_eval: ev.id, p_inicio: j.inicio, p_fin: j.fin }).then(function () {
    // Solo se limpia si no cambió mientras se guardaba.
    var act = TOP.leer('jornada.' + ev.id, null);
    if (act && act.inicio === j.inicio && act.fin === j.fin) TOP.escribir('jornada.' + ev.id, null);
  }).catch(function () { /* sin señal: queda en el celular y se reintenta con las tomas pendientes */ });
};

TIEMPOS.pintar = function (cont) {
  clearInterval(TIEMPOS._t);
  var ev = EVAL.ev, edita = TOP.puedeEditar(ev), rs = TIEMPOS.relojes(), pend = TIEMPOS.pendientes(), j = TIEMPOS.jornada();
  var abierta = !!j.inicio && !j.fin, etapa = TIEMPOS.etapa();
  var h = '';

  // Jornada: marca fija de inicio y fin.
  if (!j.inicio) {
    h += '<section class="panel entra top-jornada"><h2>Jornada sin iniciar</h2>' +
      '<div class="sub">Marca el inicio de la jornada del cosechador. Luego registra cada etapa una tras otra; el tiempo entre etapas queda como tiempo muerto.</div>' +
      (edita ? '<div class="acciones"><button type="button" class="btn grande verde" id="btnIniJornada">Iniciar jornada</button>' +
        '<button type="button" class="btn sec chico" id="btnHorasJornada">Registrar hora a mano</button></div>' : '') + '</section>';
  } else {
    h += '<section class="panel entra top-jornada' + (abierta ? ' abierta' : ' cerrada') + '"><div class="top-jornada-fila">' +
      '<div><small>Inicio de jornada</small><b>' + TOP.horaSeg(j.inicio) + '</b></div>' +
      '<div class="top-jornada-dur">' + (abierta ? '<span data-cifra="' + DR.esc(j.inicio) + '">0:00</span><small>en jornada</small>' :
        '<span>' + TOP.seg((new Date(j.fin) - new Date(j.inicio)) / 1000) + '</span><small>jornada</small>') + '</div>' +
      '<div><small>Fin de jornada</small><b>' + (j.fin ? TOP.horaSeg(j.fin) : '—') + '</b></div></div>' +
      (edita ? '<div class="acciones">' + (abierta ? '<button type="button" class="btn rojo" id="btnFinJornada">Fin de jornada</button>' :
        '<button type="button" class="btn sec chico" id="btnReabrir">Reabrir jornada</button>') +
        '<button type="button" class="btn sec chico" id="btnHorasJornada">Corregir horas</button></div>' : '') + '</section>';
  }

  // Reloj en curso: la etapa o el tiempo muerto (o varios si vienen de la versión en paralelo).
  rs.forEach(function (r) {
    var a = TOP.actividad(r.actividad_id), cl = TOP.CLASES[a.clase] || TOP.CLASES.espera, muerto = TIEMPOS.esMuerto(r);
    h += '<section class="panel entra top-reloj' + (muerto ? ' muerto' : '') + '" style="--c:' + cl.c + '"><div class="top-reloj-cab"><span class="pill gris">' +
      (muerto ? 'Entre etapas' : DR.esc(cl.t)) + '</span><span>Inició ' + TOP.horaSeg(r.inicio) + '</span></div><h2>' + DR.esc(muerto ? 'Tiempo muerto' : a.nombre) + '</h2>' +
      '<div class="top-reloj-cifra" data-cifra="' + DR.esc(r.inicio) + '">0:00</div>' +
      (muerto ? '<div class="sub">Se abrió solo al terminar la etapa anterior y se cierra al iniciar la siguiente.</div>' +
        (edita ? '<input class="top-muerto-nota" data-nota="' + DR.esc(r.inicio) + '" maxlength="200" placeholder="¿Qué pasó? Ej. esperó jarras, conversó con la líder…" value="' + DR.esc(r.nota || '') + '">' : '') :
        (edita ? '<div class="acciones"><button type="button" class="btn grande verde" data-terminar="' + DR.esc(r.inicio) + '">Terminar etapa</button>' +
          '<button type="button" class="btn sec" data-descartar="' + DR.esc(r.inicio) + '">Descartar</button></div>' : '')) + '</section>';
  });

  if (pend.length || TOP.leer(TIEMPOS.claveJornada(), null)) {
    h += '<div class="aviso alerta entra" style="margin-bottom:14px"><b>' + (pend.length ? pend.length + ' toma(s)' : 'La jornada') + ' sin subir</b> (sin señal). ' +
      '<button type="button" class="btn mini azul" id="btnReintentar">Reintentar ahora</button></div>';
  }

  if (edita && abierta) {
    h += UI.panel(etapa ? 'Termina la etapa en curso para iniciar otra' : 'Toca la etapa para iniciar',
      etapa ? 'Las etapas van una tras otra: termina «' + DR.esc(TOP.actividad(etapa.actividad_id).nombre) + '» y luego inicia la siguiente.' :
        'Una etapa a la vez. El tiempo entre etapas se registra solo como tiempo muerto.',
      TOP.ORDEN_CLASES.map(function (c) {
        var acts = TOP.actividades.filter(function (a2) { return a2.clase === c && a2.id !== TOP.ID_MUERTO; });
        if (!acts.length) return '';
        // Cosecha (productiva) va sola y grande: es la toma más frecuente.
        return '<div class="top-clase-tit" style="--c:' + TOP.CLASES[c].c + '">' + DR.esc(TOP.CLASES[c].t) + '</div><div class="top-acts' + (c === 'productiva' ? ' grande' : '') + '">' +
          acts.map(function (a2) {
            var n = EVAL.d.tiempos.filter(function (t) { return t.actividad_id === a2.id; }).length, on = etapa && etapa.actividad_id === a2.id;
            return '<button type="button" class="top-act' + (on ? ' en-curso' : '') + '" style="--c:' + TOP.CLASES[c].c + '" data-act="' + a2.id + '"' +
              (etapa ? ' disabled' : '') + (a2.sustento ? ' title="' + DR.esc('Etapa nueva: ' + a2.sustento) + '"' : '') + '>' +
              DR.esc(a2.nombre) + (on ? '<small>en curso</small>' : (a2.sustento ? '<small>nueva</small>' : '')) + (n ? '<b>' + n + '</b>' : '') + '</button>';
          }).join('') + '</div>';
      }).join('') + '<div class="acciones"><button type="button" class="btn sec chico" id="btnEtapaNueva">' + DR.ICONOS.mas + 'Etapa nueva</button>' +
        '<button type="button" class="btn sec chico" id="btnManual">' + DR.ICONOS.mas + 'Registrar a mano</button></div>');
  } else if (edita) {
    h += '<div class="acciones" style="margin:0 0 14px"><button type="button" class="btn sec chico" id="btnManual">' + DR.ICONOS.mas + 'Registrar toma a mano</button></div>';
  }

  var lista = EVAL.d.tiempos.slice().sort(function (a2, b) { return a2.inicio < b.inicio ? 1 : -1; });
  var total = lista.reduce(function (s, t) { return s + (t.duracion_seg || 0); }, 0);
  var muerto = lista.filter(function (t) { return t.actividad_id === TOP.ID_MUERTO; }).reduce(function (s, t) { return s + (t.duracion_seg || 0); }, 0);
  h += UI.panel('Tomas registradas', lista.length + ' toma(s) · ' + TOP.segTexto(total) + ' medidos' + (muerto ? ' · ' + TOP.segTexto(muerto) + ' de tiempo muerto' : '') +
    (edita ? ' · toca una para corregirla' : ''),
    lista.length ? '<div class="top-tomas">' + lista.map(function (t) {
      var a2 = TOP.actividad(t.actividad_id), cl = TOP.CLASES[a2.clase] || TOP.CLASES.espera;
      return '<button type="button" class="top-toma" data-toma="' + t.id + '"' + (edita ? '' : ' disabled') + ' style="--c:' + cl.c + '">' +
        '<span class="top-toma-nom">' + DR.esc(a2.nombre) + (t.nota ? '<small>' + DR.esc(t.nota) + '</small>' : '') + '</span>' +
        '<span class="top-toma-hora">' + TOP.horaSeg(t.inicio) + ' → ' + (t.fin ? TOP.horaSeg(t.fin) : 'en curso') + '</span>' +
        '<b>' + (t.duracion_seg !== null ? TOP.seg(t.duracion_seg) : '—') + '</b></button>';
    }).join('') + '</div>' : '<div class="vacio">Aún no hay tomas.</div>');
  cont.innerHTML = h;
  DR.entrarPaneles('#' + cont.id);

  if (DR.$$('[data-cifra]', cont).length) {
    var tic = function () {
      DR.$$('[data-cifra]', cont).forEach(function (el) { el.textContent = TOP.seg((Date.now() - new Date(el.getAttribute('data-cifra')).getTime()) / 1000); });
    };
    tic();
    TIEMPOS._t = setInterval(tic, 1000);
  }
  DR.$$('[data-terminar]', cont).forEach(function (b) { b.onclick = function () { TIEMPOS.terminar(this.getAttribute('data-terminar'), this); }; });
  DR.$$('[data-descartar]', cont).forEach(function (b) {
    b.onclick = function () {
      var ini = this.getAttribute('data-descartar'), rr = TIEMPOS.relojes().filter(function (x) { return x.inicio === ini; })[0];
      if (!rr || !window.confirm('¿Descartar la toma de «' + TOP.actividad(rr.actividad_id).nombre + '»? No se guardará y ese lapso quedará como tiempo muerto.')) return;
      TIEMPOS.descartar(rr);
      if (TIEMPOS.jornadaAbierta()) TIEMPOS.abrir(TOP.ID_MUERTO, rr.inicio);
      TIEMPOS.pintar(cont);
    };
  });
  DR.$$('[data-nota]', cont).forEach(function (inp) {
    inp.oninput = function () {
      var ini = this.getAttribute('data-nota'), v = this.value, l = TIEMPOS.relojes();
      l.forEach(function (x) { if (x.inicio === ini) x.nota = v; });
      TIEMPOS.guardarRelojes(l);
    };
  });
  DR.$$('[data-act]', cont).forEach(function (b) { b.onclick = function () { TIEMPOS.iniciar(Number(this.getAttribute('data-act'))); }; });
  DR.$$('[data-toma]', cont).forEach(function (b) {
    b.onclick = function () { TIEMPOS.editar(EVAL.d.tiempos.filter(function (t) { return t.id === Number(b.getAttribute('data-toma')); })[0]); };
  });
  if (DR.$('#btnIniJornada')) DR.$('#btnIniJornada').onclick = TIEMPOS.iniciarJornada;
  if (DR.$('#btnFinJornada')) DR.$('#btnFinJornada').onclick = TIEMPOS.finJornada;
  if (DR.$('#btnReabrir')) DR.$('#btnReabrir').onclick = function () {
    if (!window.confirm('¿Reabrir la jornada? El tiempo desde el fin marcado hasta ahora quedará como tiempo muerto.')) return;
    var jj = TIEMPOS.jornada(), fin = jj.fin;
    TIEMPOS.guardarJornada({ inicio: jj.inicio, fin: null });
    TIEMPOS.abrir(TOP.ID_MUERTO, fin);
    TIEMPOS.pintar(cont);
  };
  if (DR.$('#btnHorasJornada')) DR.$('#btnHorasJornada').onclick = TIEMPOS.editarJornada;
  if (DR.$('#btnEtapaNueva')) DR.$('#btnEtapaNueva').onclick = TIEMPOS.nuevaEtapa;
  if (DR.$('#btnManual')) DR.$('#btnManual').onclick = function () { TIEMPOS.editar(null); };
  if (DR.$('#btnReintentar')) DR.$('#btnReintentar').onclick = function () { TIEMPOS.subirPendientes(true); };
};

TIEMPOS.jornadaAbierta = function () { var j = TIEMPOS.jornada(); return !!j.inicio && !j.fin; };

/* ------------------------------------------------ jornada */
TIEMPOS.iniciarJornada = function () {
  DR.desbloquearAudio();
  var ahora = new Date().toISOString();
  TIEMPOS.guardarJornada({ inicio: ahora, fin: null });
  // Hasta la primera etapa corre tiempo muerto.
  TIEMPOS.abrir(TOP.ID_MUERTO, ahora);
  DR.vibrar(30); DR.sonar(true);
  DR.toast('Jornada iniciada a las ' + TOP.horaSeg(ahora) + '.');
  TIEMPOS.pintar(DR.$('#seccion'));
};

TIEMPOS.finJornada = function () {
  var etapa = TIEMPOS.etapa();
  if (!window.confirm('¿Marcar el fin de la jornada?' + (etapa ? ' Se terminará «' + TOP.actividad(etapa.actividad_id).nombre + '».' : ''))) return;
  var ahora = new Date().toISOString();
  TIEMPOS.relojes().forEach(function (r) { TIEMPOS.cerrar(r, ahora); });
  TIEMPOS.guardarJornada({ inicio: TIEMPOS.jornada().inicio, fin: ahora });
  DR.vibrar([30, 40, 30]); DR.sonar(true);
  DR.toast('Jornada cerrada a las ' + TOP.horaSeg(ahora) + '.');
  TIEMPOS.pintar(DR.$('#seccion'));
};

TIEMPOS.editarJornada = function () {
  var j = TIEMPOS.jornada();
  UI.abrirHoja('<h2>Horas de la jornada</h2><div class="form" id="frmJornada" style="margin-top:12px">' +
    '<div class="campo"><label>Inicio de jornada</label><input type="datetime-local" step="1" data-campo="inicio" value="' + (j.inicio ? TOP.aLocal(j.inicio) : TOP.localDe(new Date())) + '"></div>' +
    '<div class="campo"><label>Fin de jornada <em>vacío = sigue abierta</em></label><input type="datetime-local" step="1" data-campo="fin" value="' + TOP.aLocal(j.fin) + '"></div></div>' +
    '<div class="acciones"><button type="button" class="btn verde" id="btnGuardarJornada">Guardar</button>' +
    '<button type="button" class="btn sec" onclick="UI.cerrarHoja()">Cancelar</button></div>');
  DR.$('#btnGuardarJornada').onclick = function () {
    var f = UI.leerForm('frmJornada'), nj = { inicio: TOP.aIso(f.inicio), fin: TOP.aIso(f.fin) };
    if (!nj.inicio) { DR.toast('Falta la hora de inicio.', 'error'); return; }
    if (nj.fin && nj.fin < nj.inicio) { DR.toast('El fin no puede ser antes del inicio.', 'error'); return; }
    var antes = j.inicio;
    TIEMPOS.guardarJornada(nj);
    // Jornada nueva a mano: desde el inicio corre tiempo muerto hasta la primera etapa.
    if (!antes && !nj.fin && !TIEMPOS.relojes().length) TIEMPOS.abrir(TOP.ID_MUERTO, nj.inicio);
    if (nj.fin) { var fin = nj.fin; TIEMPOS.relojes().forEach(function (r) { TIEMPOS.cerrar(r, fin < r.inicio ? r.inicio : fin); }); }
    UI.cerrarHoja();
    DR.toast('Jornada guardada.');
    TIEMPOS.pintar(DR.$('#seccion'));
  };
};

/* ------------------------------------------------ etapas */
/** Inicia una etapa: cierra el tiempo muerto en curso en el mismo instante. */
TIEMPOS.iniciar = function (actividadId) {
  if (!TIEMPOS.jornadaAbierta()) { DR.toast('Primero inicia la jornada.', 'error'); return; }
  var etapa = TIEMPOS.etapa();
  if (etapa) { DR.toast('Termina «' + TOP.actividad(etapa.actividad_id).nombre + '» antes de iniciar otra etapa.', 'error'); return; }
  DR.desbloquearAudio();
  var ahora = new Date().toISOString();
  TIEMPOS.relojes().forEach(function (r) { TIEMPOS.cerrar(r, ahora); });
  TIEMPOS.abrir(actividadId, ahora);
  DR.vibrar(30); DR.sonar(true);
  TIEMPOS.pintar(DR.$('#seccion'));
};

/** Termina la etapa y, si la jornada sigue, abre el tiempo muerto hasta la siguiente. */
TIEMPOS.terminar = function (inicio, btn) {
  var r = TIEMPOS.relojes().filter(function (x) { return x.inicio === inicio; })[0];
  if (!r) return;
  var ahora = new Date().toISOString();
  if (btn) btn.classList.add('cargando');
  TIEMPOS.cerrar(r, ahora);
  if (TIEMPOS.jornadaAbierta()) TIEMPOS.abrir(TOP.ID_MUERTO, ahora);
  DR.vibrar([30, 40, 30]); DR.sonar(true);
  DR.toast(TOP.actividad(r.actividad_id).nombre + ': ' + TOP.seg((new Date(ahora) - new Date(r.inicio)) / 1000));
  TIEMPOS.pintar(DR.$('#seccion'));
};

/** Abre un reloj: primero en el celular y luego crea la fila abierta en Supabase. */
TIEMPOS.abrir = function (actividadId, inicio) {
  var l = TIEMPOS.relojes(), r = { actividad_id: actividadId, inicio: inicio || new Date().toISOString() };
  // El inicio identifica cada reloj: dos en el mismo milisegundo se separan 1 ms.
  while (l.some(function (x) { return x.inicio === r.inicio; })) r.inicio = new Date(new Date(r.inicio).getTime() + 1).toISOString();
  l.push(r);
  TIEMPOS.guardarRelojes(l);
  // Si se cierra antes de que responda el servidor, cerrar() espera este id para no duplicar la toma.
  TIEMPOS._ini[r.inicio] = AT.rpc('rpc_top_guardar_tiempo', { p: { evaluacion_id: EVAL.ev.id, actividad_id: actividadId, inicio: r.inicio } }).then(function (fila) {
    var actual = TOP.leer(TIEMPOS.clave(), null) || [];
    if (!Array.isArray(actual)) actual = [actual];
    actual.forEach(function (x) { if (x.inicio === r.inicio) x.id = fila.id; });
    TIEMPOS.guardarRelojes(actual);
    return fila.id;
  }).catch(function () { return null; /* sin señal: se guardará completa al cerrar */ });
  return r;
};

/** Id en el servidor de un reloj (el que ya trae o el que devolverá su creación). */
TIEMPOS.idDe = function (r) {
  var pr = !r.id && TIEMPOS._ini[r.inicio] ? TIEMPOS._ini[r.inicio] : Promise.resolve(r.id || null);
  delete TIEMPOS._ini[r.inicio];
  return pr;
};

/** Cierra un reloj en `fin` y sube la toma (o la deja pendiente sin señal). */
TIEMPOS.cerrar = function (r, fin) {
  TIEMPOS.guardarRelojes(TIEMPOS.relojes().filter(function (x) { return x.inicio !== r.inicio; }));
  var seg = (new Date(fin) - new Date(r.inicio)) / 1000;
  if (TIEMPOS.esMuerto(r) && seg < TIEMPOS.MUERTO_MIN_SEG && !(r.nota || '').trim()) { TIEMPOS.borrarServidor(r); return; }
  var p = { id: null, evaluacion_id: EVAL.ev.id, actividad_id: r.actividad_id, inicio: r.inicio, fin: fin, nota: r.nota || '' };
  TIEMPOS.idDe(r).then(function (id) {
    p.id = id || null;
    return AT.rpc('rpc_top_guardar_tiempo', { p: p });
  }).then(function () { EVAL.recargar(); }).catch(function () {
    var pend = TIEMPOS.pendientes();
    pend.push(p);
    TOP.escribir(TIEMPOS.clavePend(), pend);
    DR.toast('Sin señal: la toma quedó guardada en el celular y se subirá luego.', 'info');
    if (DR.$('#seccion') && EVAL.tab === 'tiempos') TIEMPOS.pintar(DR.$('#seccion'));
  });
};

TIEMPOS.descartar = function (r) {
  TIEMPOS.guardarRelojes(TIEMPOS.relojes().filter(function (x) { return x.inicio !== r.inicio; }));
  TIEMPOS.borrarServidor(r);
};
TIEMPOS.borrarServidor = function (r) {
  TIEMPOS.idDe(r).then(function (id) {
    if (id) return AT.rpc('rpc_top_borrar_tiempo', { p_id: id }).then(EVAL.recargar);
  }).catch(function () { /* quedará una fila abierta sin fin: no cuenta en el Resumen */ });
};

TIEMPOS.subirPendientes = function (avisar) {
  if (!EVAL.ev) return Promise.resolve();
  var pend = TIEMPOS.pendientes(), j = TOP.leer(TIEMPOS.claveJornada(), null);
  var pj = j ? TIEMPOS.guardarJornada(j) : Promise.resolve();
  if (!pend.length) return pj.then(function () { if (avisar && j) TIEMPOS.pintar(DR.$('#seccion')); });
  var quedan = [];
  return pj.then(function () {
    return pend.reduce(function (pr, p) {
      return pr.then(function () { return AT.rpc('rpc_top_guardar_tiempo', { p: p }).catch(function () { quedan.push(p); }); });
    }, Promise.resolve());
  }).then(function () {
    TOP.escribir(TIEMPOS.clavePend(), quedan.length ? quedan : null);
    if (avisar) DR.toast(quedan.length ? 'Aún sin señal: quedan ' + quedan.length + ' toma(s).' : 'Tomas pendientes subidas.', quedan.length ? 'error' : 'ok');
    if (quedan.length < pend.length) EVAL.recargar();
  });
};

/* ------------------------------------------------ etapa nueva (con sustento) */
TIEMPOS.nuevaEtapa = function () {
  var clase = 'soporte';
  UI.abrirHoja('<h2>Etapa nueva</h2><div class="sub">Solo si lo que hace el cosechador no está en la lista. Queda disponible para todos los evaluadores con tu sustento.</div>' +
    '<div class="form" id="frmEtapa" style="margin-top:12px">' +
    '<div class="campo ancho"><label>Nombre de la etapa</label><input data-campo="nombre" maxlength="80" placeholder="Ej. Limpieza de jarras"></div>' +
    '<div class="campo ancho"><label>Tipo</label><div class="top-clases-sel">' + TOP.ORDEN_CLASES.map(function (c) {
      return '<button type="button" class="top-clase-op' + (c === clase ? ' activo' : '') + '" data-clase="' + c + '" style="--c:' + TOP.CLASES[c].c + '"><b>' +
        DR.esc(TOP.CLASES[c].t) + '</b><small>' + DR.esc(TOP.CLASES[c].d) + '</small></button>';
    }).join('') + '</div></div>' +
    '<div class="campo ancho"><label>¿Por qué hace falta? <em>sustento obligatorio</em></label><textarea data-campo="sustento" rows="3" maxlength="400" ' +
      'placeholder="Ej. Los TOP limpian las jarras cada 4 viajes para no dañar la fruta; ninguna etapa de la lista lo cubre."></textarea></div></div>' +
    '<div class="acciones"><button type="button" class="btn verde" id="btnCrearEtapa">' + (TIEMPOS.jornadaAbierta() && !TIEMPOS.etapa() ? 'Crear e iniciar' : 'Crear etapa') + '</button>' +
    '<button type="button" class="btn sec" onclick="UI.cerrarHoja()">Cancelar</button></div>');
  DR.$$('[data-clase]').forEach(function (b) {
    b.onclick = function () {
      clase = b.getAttribute('data-clase');
      DR.$$('[data-clase]').forEach(function (o) { o.classList.toggle('activo', o === b); });
    };
  });
  DR.$('#btnCrearEtapa').onclick = function () {
    var f = UI.leerForm('frmEtapa'), btn = this, nombre = (f.nombre || '').trim(), sustento = (f.sustento || '').trim();
    if (nombre.length < 3) { DR.toast('Escribe el nombre de la etapa.', 'error'); return; }
    if (sustento.length < 15) { DR.toast('Explica por qué hace falta esta etapa (mínimo 15 caracteres).', 'error'); return; }
    var ya = TOP.actividades.filter(function (a) { return TOP.norm(a.nombre) === TOP.norm(nombre); })[0];
    if (ya) { DR.toast('Ya existe «' + ya.nombre + '»: elígela de la lista.', 'error'); return; }
    btn.classList.add('cargando');
    AT.rpc('rpc_top_crear_actividad', { p_nombre: nombre, p_clase: clase, p_sustento: sustento }).then(function (a) {
      TOP.todas.push(a); TOP.actividades.push(a);
      UI.cerrarHoja();
      DR.toast('Etapa «' + a.nombre + '» creada.');
      if (TIEMPOS.jornadaAbierta() && !TIEMPOS.etapa()) TIEMPOS.iniciar(a.id);
      else TIEMPOS.pintar(DR.$('#seccion'));
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
};

/** Corregir una toma (o registrarla a mano): horas con segundos y nota. */
TIEMPOS.editar = function (t) {
  var nueva = !t, ahora = TOP.localDe(new Date());
  var ops = TOP.actividades.concat(t && !TOP.actividades.some(function (a) { return a.id === t.actividad_id; }) ? [TOP.actividad(t.actividad_id)] : []);
  UI.abrirHoja('<h2>' + (nueva ? 'Registrar toma a mano' : 'Corregir toma') + '</h2><div class="form" id="frmToma" style="margin-top:12px">' +
    '<div class="campo ancho"><label>Etapa</label><select data-campo="actividad_id">' + ops.map(function (a) {
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
