/* ============================================================================
 * revisar.js — PESTAÑA «REVISAR»
 * Lista de revisiones → tabla dinámica Planta > Responsable (como Hoja1) →
 * detalle del encargado: una tarjeta por OT con checks por campo (solo ayuda
 * visual en este dispositivo) y el hallazgo: observación y/o no conformidad
 * con hasta 3 fotos, que sí se guarda en Supabase.
 * ==========================================================================*/
var REV = { revId: null, planta: null, resp: null, rev: null, ots: [], checks: {}, filtro: 'todas' };

REV.abrir = function (id, planta, resp) {
  REV.revId = id || null;
  REV.planta = planta || null;
  REV.resp = resp || null;
  REV.rev = null;
  DR.ir('revisar');
};

VISTAS.revisar = function (cont) {
  if (!REV.revId) { REV.pintarLista(cont); return; }
  Promise.all([MP.revision(REV.revId), MP.ots(REV.revId)]).then(function (r) {
    REV.rev = r[0];
    REV.ots = r[1];
    if (!REV.abierta()) MP.borrarChecks(REV.rev.id);
    REV.checks = MP.leerChecks(REV.rev.id);
    REV.mostrar(cont, true);
  }).catch(function (e) {
    REV.revId = null;
    UI.error(cont, e);
  });
};

REV.abierta = function () { return !!REV.rev && REV.rev.estado === 'en_curso'; };
REV.editable = function () { return REV.abierta() && AT.puedeCapturar(); };

/** Cambia entre tabla y detalle con los datos ya cargados. */
REV.mostrar = function (cont, animar) {
  cont = cont || DR.$('#contenido');
  cont.scrollTop = 0;
  if (REV.resp) REV.pintarDetalle(cont); else REV.pintarTabla(cont);
  if (animar !== false) DR.entrarPaneles('#contenido');
};

REV.enlazarMigas = function (cont, acciones) {
  DR.$$('[data-miga]', cont).forEach(function (b) {
    var fn = acciones[Number(b.getAttribute('data-miga'))];
    if (fn) b.onclick = fn;
  });
};

/* ============================================================ LISTA */
REV.pintarLista = function (cont) {
  Promise.all([MP.revisiones(false), AT.rpc('fn_mp_resultados', { p_revision: null })]).then(function (r) {
    var revs = r[0], tot = {};
    (r[1] || []).forEach(function (f) {
      var t = tot[f.revision_id] || (tot[f.revision_id] = { obs: 0, nc: 0 });
      t.obs += Number(f.n_obs);
      t.nc += Number(f.n_nc);
    });
    var tarjetas = revs.map(function (v) {
      var t = tot[v.id] || { obs: 0, nc: 0 };
      return '<button type="button" class="ciclo-card entra" data-rev="' + v.id + '" style="--c:' + (v.estado === 'en_curso' ? '#0097CE' : '#76B729') + '">' +
        '<div class="cc-top"><span class="cc-codigo">' + DR.esc(MP.etiqueta(v)) + '</span><span class="cc-hace">' + DR.esc(v.codigo) + '</span></div>' +
        '<div class="cc-sub">' + v.total_ot + ' OT · ' + t.obs + ' observación(es) · ' + t.nc + ' NC · ' + DR.esc(v.revisor || '') + ' · ' + MP.fecha(v.fecha_revision) + '</div>' +
        '<div class="cc-sig"><span>' + MP.pillEstado(v.estado) + ' ' + MP.pillPuntaje(MP.puntaje(t.nc)) + '</span>' + DR.ICONOS.chevron + '</div></button>';
    }).join('');
    cont.innerHTML = UI.encabezado('Plan de mantenimiento', 'Revisiones',
      'Elige la revisión del mes. Cada carga del Excel es una revisión independiente.',
      AT.puedeCapturar() ? '<button type="button" class="btn verde chico" id="btnIrCargar">' + DR.ICONOS.subir + 'Cargar plan</button>' : '') +
      (tarjetas || UI.panel('Sin revisiones', '', '<div class="vacio">Aún no se ha cargado ningún plan.</div>'));
    DR.entrarPaneles('#contenido');
    if (DR.$('#btnIrCargar')) DR.$('#btnIrCargar').onclick = function () { DR.ir('cargar'); };
    DR.$$('[data-rev]', cont).forEach(function (b) {
      b.onclick = function () { REV.abrir(this.getAttribute('data-rev')); };
    });
  }).catch(function (e) { UI.error(cont, e); });
};

/* ============================================================ TABLA DINÁMICA */
REV.pintarTabla = function (cont) {
  var v = REV.rev, pv = MP.pivote(REV.ots, REV.checks), t = pv.total;
  var celda = function (n) { return n ? n : ''; };
  var filas = '';
  pv.plantas.forEach(function (p) {
    filas += '<tr class="mp-fila-planta"><td>' + DR.esc(p.planta) + '</td><td class="num">' + p.n + '</td>' +
      (REV.abierta() ? '<td class="num">' + celda(p.ok) + '</td>' : '') +
      '<td class="num">' + celda(p.obs) + '</td><td class="num">' + celda(p.nc) + '</td></tr>';
    p.lista.forEach(function (r) {
      filas += '<tr class="clicable" data-planta="' + DR.esc(p.planta) + '" data-resp="' + DR.esc(r.responsable) + '">' +
        '<td class="mp-sangria"><span class="mp-enlace">' + DR.esc(r.responsable) + DR.ICONOS.chevron + '</span></td><td class="num">' + r.n + '</td>' +
        (REV.abierta() ? '<td class="num">' + (r.ok ? r.ok + '/' + r.n : '') + '</td>' : '') +
        '<td class="num">' + celda(r.obs) + '</td><td class="num">' + celda(r.nc) + '</td></tr>';
    });
  });
  filas += '<tr class="fila-total"><td>Total general</td><td class="num">' + t.n + '</td>' +
    (REV.abierta() ? '<td class="num">' + celda(t.ok) + '</td>' : '') +
    '<td class="num">' + celda(t.obs) + '</td><td class="num">' + celda(t.nc) + '</td></tr>';

  var botones = '<button type="button" class="btn azul" id="btnVerResultados">Ver resultados</button>' +
    (REV.editable() ? '<button type="button" class="btn verde" id="btnCerrarRev">Cerrar revisión</button>' : '') +
    (AT.esAdmin() && v.estado === 'cerrada' ? '<button type="button" class="btn sec" id="btnReabrirRev">Reabrir</button>' : '') +
    (AT.esAdmin() ? '<button type="button" class="btn sec" id="btnAnularRev">Anular</button>' : '');

  cont.innerHTML = UI.migas([{ texto: 'Revisiones', accion: true }, { texto: v.codigo }]) +
    UI.encabezado('Revisión ' + v.codigo + ' · hoja ' + v.hoja, 'Plan de ' + MP.etiqueta(v),
      REV.abierta() ? 'Toca un encargado para revisar sus OT.' : 'Revisión ' + (v.estado === 'cerrada' ? 'cerrada' : 'anulada') + ': solo lectura.',
      MP.pillEstado(v.estado)) +
    '<div class="kpis entra">' +
      UI.kpi('OT', t.n, REV.abierta() ? t.ok + ' revisadas en este dispositivo' : '', '#0097CE') +
      UI.kpi('Observaciones', t.obs, '', '#E8B04A') +
      UI.kpi('No conformidades', t.nc, '−' + DR.num(MP.DESCUENTO_NC, 1) + ' % c/u', '#E5484D') +
      UI.kpi('Resultado', MP.pct(MP.puntaje(t.nc)), MP.etiqueta(v), '#76B729') +
    '</div>' +
    UI.panel('Tabla dinámica', 'Planta > Responsable, igual que Hoja1 del Excel.',
      '<div class="tabla-cont"><table class="mp-tabla"><thead><tr><th>Etiquetas de fila</th><th class="num">Cuenta de # OT</th>' +
      (REV.abierta() ? '<th class="num">Revisadas</th>' : '') + '<th class="num">Observa</th><th class="num">No conformidad</th></tr></thead><tbody>' +
      filas + '</tbody></table></div>' +
      (REV.abierta() ? '<div class="ayuda">Los checks son una ayuda visual de este dispositivo: no se guardan y se borran al cerrar la revisión.</div>' : '') +
      (v.motivo_anulacion ? '<div class="aviso alerta">Motivo de anulación: ' + DR.esc(v.motivo_anulacion) + '</div>' : '') +
      '<div class="acciones">' + botones + '</div>');

  REV.enlazarMigas(cont, [function () { REV.abrir(null); }]);
  DR.$$('tr[data-resp]', cont).forEach(function (tr) {
    tr.onclick = function () {
      REV.planta = this.getAttribute('data-planta');
      REV.resp = this.getAttribute('data-resp');
      REV.filtro = 'todas';
      REV.mostrar(cont);
    };
  });
  DR.$('#btnVerResultados').onclick = function () { RES_MP.revId = v.id; DR.ir('resultados'); };
  if (DR.$('#btnCerrarRev')) DR.$('#btnCerrarRev').onclick = function () { REV.confirmarCierre(t); };
  if (DR.$('#btnReabrirRev')) DR.$('#btnReabrirRev').onclick = function () {
    REV.confirmar('Reabrir ' + v.codigo, 'Se podrán volver a editar los hallazgos de ' + MP.etiqueta(v) + '.', 'Reabrir', false, function (btn) {
      return MP.accion(btn, 'rpc_mp_reabrir_revision', { p_revision: v.id }, 'Revisión reabierta.');
    });
  };
  if (DR.$('#btnAnularRev')) DR.$('#btnAnularRev').onclick = function () {
    REV.confirmar('Anular ' + v.codigo, 'La revisión deja de contar en resultados e histórico. Los datos se conservan.', 'Anular revisión', true, function (btn, motivo) {
      return MP.accion(btn, 'rpc_mp_anular_revision', { p_revision: v.id, p_motivo: motivo }, 'Revisión anulada.').then(function () { REV.revId = null; });
    });
  };
};

REV.confirmarCierre = function (t) {
  var v = REV.rev;
  REV.confirmar('Cerrar ' + v.codigo,
    MP.etiqueta(v) + ': ' + t.obs + ' observación(es) y ' + t.nc + ' no conformidad(es) · resultado ' + MP.pct(MP.puntaje(t.nc)) +
    '. Luego ya no se editan los hallazgos (un administrador puede reabrirla) y se borran los checks de este dispositivo.',
    'Cerrar revisión', false, function (btn) {
      return MP.accion(btn, 'rpc_mp_cerrar_revision', { p_revision: v.id }, 'Revisión cerrada.').then(function () { MP.borrarChecks(v.id); });
    });
};

/** Hoja de confirmación; conMotivo agrega un texto obligatorio. accion(btn, motivo) → Promise. */
REV.confirmar = function (titulo, texto, boton, conMotivo, accion) {
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.alerta + '<span>Confirmar</span></div>' +
    '<div class="res-nombre">' + DR.esc(titulo) + '</div>' +
    '<p class="mp-texto-hoja">' + DR.esc(texto) + '</p>' +
    (conMotivo ? '<div class="campo ancho" style="margin-top:12px"><label for="mpMotivo">Motivo</label><textarea id="mpMotivo" rows="2" placeholder="Ej. Carga de prueba"></textarea></div>' : '') +
    '<div class="acciones"><button type="button" class="btn sec" id="mpConfCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="mpConfOk" style="flex:1">' + DR.esc(boton) + '</button></div>');
  DR.$('#mpConfCancelar').onclick = UI.cerrarHoja;
  DR.$('#mpConfOk').onclick = function () {
    var motivo = conMotivo ? DR.$('#mpMotivo').value.trim() : null;
    if (conMotivo && !motivo) { DR.toast('Escribe el motivo.', 'error'); return; }
    accion(this, motivo).then(function () {
      UI.cerrarHoja();
      VISTAS.revisar(DR.$('#contenido'));
    }).catch(function () { /* MP.accion ya avisó */ });
  };
};

/* ============================================================ DETALLE DEL ENCARGADO */
REV.otsActuales = function () {
  return REV.ots.filter(function (o) { return o.planta === REV.planta && o.responsable === REV.resp; });
};

/** Orden de la tabla dinámica, para pasar al siguiente encargado. */
REV.secuencia = function () {
  var lista = [];
  MP.pivote(REV.ots).plantas.forEach(function (p) { p.lista.forEach(function (r) { lista.push([p.planta, r.responsable]); }); });
  return lista;
};

REV.pintarDetalle = function (cont) {
  var v = REV.rev, ots = REV.otsActuales();
  if (!ots.length) { REV.resp = null; REV.pintarTabla(cont); return; }
  var seq = REV.secuencia(), pos = -1;
  seq.forEach(function (s, i) { if (s[0] === REV.planta && s[1] === REV.resp) pos = i; });
  var sig = seq[pos + 1];
  var filtros = [['todas', 'Todas'], ['pendientes', 'Por revisar'], ['hallazgos', 'Con hallazgo']];

  cont.innerHTML = UI.migas([{ texto: 'Revisiones', accion: true }, { texto: v.codigo, accion: true }, { texto: REV.planta + ' · ' + REV.resp }]) +
    UI.encabezado(REV.planta + ' · Plan de ' + MP.etiqueta(v), REV.resp, '', MP.pillEstado(v.estado)) +
    '<section class="panel entra">' +
      '<div class="mp-resumen" id="mpResumen"></div>' +
      (REV.editable() ? '<div class="opciones" id="mpFiltro" style="margin-top:12px">' + filtros.map(function (f) {
        return '<button type="button" class="opcion' + (REV.filtro === f[0] ? ' activa' : '') + '" data-valor="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>' : '') +
    '</section>' +
    '<div id="mpLista" class="entra"></div>' +
    '<div class="acciones">' +
      '<button type="button" class="btn sec" id="btnVolverTabla">' + DR.ICONOS.atras + 'Tabla dinámica</button>' +
      (sig ? '<button type="button" class="btn azul" id="btnSiguienteResp" style="flex:1">Siguiente: ' + DR.esc(sig[1]) + ' (' + DR.esc(sig[0]) + ')</button>' : '') +
    '</div>';

  REV.enlazarMigas(cont, [function () { REV.abrir(null); }, function () { REV.resp = null; REV.mostrar(cont); }]);
  DR.$('#btnVolverTabla').onclick = function () { REV.resp = null; REV.mostrar(cont); };
  if (sig) DR.$('#btnSiguienteResp').onclick = function () {
    REV.planta = sig[0];
    REV.resp = sig[1];
    REV.filtro = 'todas';
    REV.mostrar(cont);
  };
  DR.$$('#mpFiltro .opcion').forEach(function (b) {
    b.onclick = function () {
      REV.filtro = this.getAttribute('data-valor');
      DR.$$('#mpFiltro .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); });
      REV.pintarOts();
    };
  });
  DR.$('#mpLista').onclick = REV.alTocar;
  REV.pintarOts();
};

REV.pintarOts = function () {
  var ots = REV.otsActuales().filter(function (o) {
    if (REV.filtro === 'pendientes') return !MP.otCompleta(REV.checks, o);
    if (REV.filtro === 'hallazgos') return MP.tieneHallazgo(o);
    return true;
  });
  var lista = DR.$('#mpLista');
  lista.innerHTML = ots.length ? ots.map(REV.tarjetaHtml).join('') : '<div class="panel"><div class="vacio">No hay OT para este filtro.</div></div>';
  FOTOS.pintar(lista);
  REV.pintarResumen();
};

REV.pintarResumen = function () {
  var ots = REV.otsActuales(), ok = 0, obs = 0, nc = 0;
  ots.forEach(function (o) {
    if (MP.otCompleta(REV.checks, o)) ok++;
    if (o.observacion) obs++;
    if (o.no_conformidad) nc++;
  });
  var pct = ots.length ? Math.round(ok * 100 / ots.length) : 0;
  DR.$('#mpResumen').innerHTML =
    '<div class="mp-resumen-cifras"><span><b>' + ots.length + '</b> OT</span>' +
      (REV.editable() ? '<span><b>' + ok + '</b> revisadas</span>' : '') +
      '<span><b>' + obs + '</b> obs.</span><span><b>' + nc + '</b> NC</span>' +
      '<span>Resultado en esta planta ' + MP.pillPuntaje(MP.puntaje(nc)) + '</span></div>' +
    (REV.editable() ? '<div class="mp-progreso"><i style="width:' + pct + '%"></i></div>' : '');
};

REV.fechasFuera = function (o) {
  if (!o.f_ini_real || !o.f_fin_real) return 'Falta fecha real de inicio o fin.';
  if ((o.f_ini_plan && o.f_ini_real < o.f_ini_plan) || (o.f_fin_plan && o.f_fin_real > o.f_fin_plan)) return 'Fechas reales fuera del rango del plan.';
  if (o.f_fin_real < o.f_ini_real) return 'Fin real anterior al inicio real.';
  return '';
};

REV.tarjetaHtml = function (o) {
  var chk = REV.checks[o.id] || [], edit = REV.editable(), completa = edit && chk.length >= MP.CAMPOS.length;
  var clase = 'mp-ot' + (completa ? ' completa' : '') + (o.no_conformidad ? ' con-nc' : (o.observacion ? ' con-obs' : ''));
  var chips = MP.CAMPOS.map(function (c) {
    var on = chk.indexOf(c.k) > -1, val = MP.valor(o, c);
    var ancho = c.k === 'descripcion' || c.k === 'sub_equipo' ? ' ancho' : '';
    return edit
      ? '<button type="button" class="mp-chk' + (on ? ' on' : '') + ancho + '" data-campo="' + c.k + '" aria-pressed="' + on + '"><i>' + DR.ICONOS.checkChico + '</i>' +
        '<span class="etq">' + c.t + '</span><span class="val">' + (DR.esc(val) || '—') + '</span></button>'
      : '<div class="mp-chk fijo' + ancho + '"><span class="etq">' + c.t + '</span><span class="val">' + (DR.esc(val) || '—') + '</span></div>';
  }).join('');
  var alerta = REV.fechasFuera(o);
  var hallazgo = (o.no_conformidad ? '<div class="mp-hallazgo nc"><b>No conformidad</b>' + DR.esc(o.no_conformidad) + '</div>' : '') +
    (o.observacion ? '<div class="mp-hallazgo obs"><b>Observación</b>' + DR.esc(o.observacion) + '</div>' : '') +
    FOTOS.galeriaHtml(o.fotos, 'foto-grupo chico');

  return '<article class="' + clase + '" data-ot="' + o.id + '">' +
    '<div class="mp-ot-cab"><div><b>OT ' + DR.esc(o.num_ot) + '</b><span>' + DR.esc(o.ubicacion || '') + '</span></div>' +
      '<div class="mp-ot-etq">' + (o.no_conformidad ? '<span class="pill rojo">NC</span>' : '') + (o.observacion ? '<span class="pill naranja">OBS</span>' : '') +
      (completa ? '<span class="pill verde">Revisada</span>' : '') + '</div></div>' +
    '<div class="mp-checks">' + chips + '</div>' +
    (alerta ? '<div class="mp-alerta">' + DR.ICONOS.alertaChico + DR.esc(alerta) + '</div>' : '') +
    (o.obs_excel ? '<div class="mp-nota">Obs. del Excel: ' + DR.esc(o.obs_excel) + '</div>' : '') +
    hallazgo +
    (edit ? '<div class="mp-ot-acc"><button type="button" class="btn mini sec" data-todo="1">' + (completa ? 'Desmarcar todo' : 'Marcar todo') + '</button>' +
      '<span class="mp-ot-cont">' + chk.length + '/' + MP.CAMPOS.length + '</span>' +
      '<button type="button" class="btn chico" data-hallazgo="1">' + (MP.tieneHallazgo(o) ? 'Editar hallazgo' : 'Observación / NC') + '</button></div>' : '') +
    '</article>';
};

REV.alTocar = function (ev) {
  var tarjeta = ev.target.closest('[data-ot]');
  if (!tarjeta || !REV.editable()) return;
  var id = tarjeta.getAttribute('data-ot'), o = REV.ots.filter(function (x) { return x.id === id; })[0];
  if (!o) return;
  var chip = ev.target.closest('[data-campo]');
  if (chip) {
    var k = chip.getAttribute('data-campo'), l = REV.checks[id] || [], i = l.indexOf(k);
    if (i > -1) l.splice(i, 1); else l.push(k);
    REV.checks[id] = l;
    REV.cambioChecks(o);
    DR.vibrar(12);
    return;
  }
  if (ev.target.closest('[data-todo]')) {
    REV.checks[id] = MP.otCompleta(REV.checks, o) ? [] : MP.CAMPOS.map(function (c) { return c.k; });
    REV.cambioChecks(o);
    DR.vibrar(25);
    return;
  }
  if (ev.target.closest('[data-hallazgo]')) REV.abrirHallazgo(o);
};

REV.cambioChecks = function (o) {
  if (!(REV.checks[o.id] || []).length) delete REV.checks[o.id];
  MP.guardarChecks(REV.rev.id, REV.checks);
  REV.refrescarTarjeta(o);
};

REV.refrescarTarjeta = function (o) {
  var el = DR.$('[data-ot="' + o.id + '"]', DR.$('#mpLista'));
  if (el) {
    var tmp = document.createElement('div');
    tmp.innerHTML = REV.tarjetaHtml(o);
    var nuevo = tmp.firstChild;
    el.parentNode.replaceChild(nuevo, el);
    FOTOS.pintar(nuevo);
  }
  REV.pintarResumen();
};

/* ============================================================ HALLAZGO */
REV.abrirHallazgo = function (o) {
  var st = { fotos: (o.fotos || []).map(function (r) { return { ruta: r, blob: null, url: null }; }) };
  var tiene = MP.tieneHallazgo(o) || st.fotos.length > 0;
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + FOTOS.ICONO + '<span>Hallazgo</span></div>' +
    '<div class="res-nombre">OT ' + DR.esc(o.num_ot) + '</div>' +
    '<div class="res-dni" style="letter-spacing:.02em">' + DR.esc([o.planta, o.responsable, o.sub_equipo].filter(Boolean).join(' · ')) + '</div>' +
    (o.descripcion ? '<div class="res-obs" style="margin-top:12px">' + DR.esc(o.descripcion) + '</div>' : '') +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo ancho"><label for="mpObs">Observación</label>' +
        '<textarea id="mpObs" rows="3" placeholder="Ej. Falta firma del supervisor en la OT.">' + DR.esc(o.observacion || '') + '</textarea></div>' +
      '<div class="campo ancho"><label for="mpNc">No conformidad</label>' +
        '<textarea id="mpNc" rows="3" placeholder="Ej. La fecha fin del formato no coincide con el plan.">' + DR.esc(o.no_conformidad || '') + '</textarea>' +
        '<div class="ayuda-campo">Ambos son opcionales. Cada no conformidad descuenta ' + DR.num(MP.DESCUENTO_NC, 1) + ' % al encargado.</div></div>' +
      '<div class="campo ancho"><label>Fotos (opcional)</label>' + FOTOS.campoMultiHtml('mpFoto', 'Agregar foto', 'Evidencia · hasta 3', 3) + '</div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="mpCancelar">Cancelar</button>' +
      (tiene ? '<button type="button" class="btn sec" id="mpQuitar">Quitar</button>' : '') +
      '<button type="button" class="btn verde" id="mpGuardar" style="flex:1">Guardar</button></div>', { fija: true });

  FOTOS.enlazarLista('mpFoto', st.fotos, 3);
  DR.$('#mpCancelar').onclick = UI.cerrarHoja;
  if (DR.$('#mpQuitar')) DR.$('#mpQuitar').onclick = function () { REV.guardarHallazgo(this, o, '', '', []); };
  DR.$('#mpGuardar').onclick = function () {
    var obs = DR.$('#mpObs').value.trim(), nc = DR.$('#mpNc').value.trim();
    if (!obs && !nc) {
      if (st.fotos.length) { DR.toast('Escribe la observación o la no conformidad de las fotos.', 'error'); return; }
      if (!tiene) { DR.toast('Escribe una observación o una no conformidad.', 'error'); DR.$('#mpObs').focus(); return; }
    }
    REV.guardarHallazgo(this, o, obs, nc, st.fotos);
  };
};

REV.guardarHallazgo = function (btn, o, obs, nc, fotos) {
  var v = REV.rev;
  DR.$$('#hojaTarjeta .btn').forEach(function (b) { b.disabled = true; });
  btn.classList.add('cargando');
  FOTOS.subirLista(fotos, 'rpm/' + v.id + '/' + o.id).then(function (rutas) {
    return AT.rpc('rpc_mp_guardar_hallazgo', { p: { ot_id: o.id, observacion: obs, no_conformidad: nc, fotos: rutas } });
  }).then(function (n) {
    Object.keys(n).forEach(function (k) { o[k] = n[k]; });
    UI.cerrarHoja();
    DR.toast(MP.tieneHallazgo(o) ? 'Hallazgo guardado en OT ' + o.num_ot + '.' : 'Hallazgo quitado de OT ' + o.num_ot + '.');
    REV.refrescarTarjeta(o);
  }).catch(function (e) {
    DR.$$('#hojaTarjeta .btn').forEach(function (b) { b.disabled = false; });
    btn.classList.remove('cargando');
    DR.toast(e.message, 'error');
  });
};
