/* ============================================================================
 * evaluar.js — LISTA DE EVALUACIONES Y FICHA DEL COSECHADOR TOP
 * Ficha con 5 secciones: Tiempos · Estándares · REBA · Ergonomía · Datos.
 * El enlace #evaluar/<id> vuelve a abrir la misma ficha.
 * ==========================================================================*/
var EVAL = { ev: null, d: null, tab: 'tiempos', lista: [] };

EVAL.TABS = [
  { k: 'tiempos', t: 'Tiempos', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2.5h4"/></svg>' },
  { k: 'estandares', t: 'Estándares', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/></svg>' },
  { k: 'reba', t: 'REBA', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-3 7M12 13l3 7M7 10l5-1 5 1"/></svg>' },
  { k: 'ergonomia', t: 'Ergonomía', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/></svg>' },
  { k: 'datos', t: 'Datos', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>' }
];

EVAL.pintar = function (cont) {
  clearInterval(TIEMPOS._t);
  var m = /^#evaluar\/(.+)$/.exec(location.hash);
  TOP.cargarCatalogos().then(function () {
    if (m && m[1] === 'nueva') return EVAL.formulario(cont, null);
    if (m) return EVAL.abrir(m[1], cont);
    EVAL.ev = null;
    return EVAL.pintarLista(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

/* ------------------------------------------------ lista */
EVAL.pintarLista = function (cont) {
  var desde = new Date(Date.now() - 60 * 86400000);
  return sb.from('top_evaluaciones').select('*').gte('fecha', TOP.localDe(desde).substring(0, 10))
    .order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(300).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      EVAL.lista = r.data;
      var ids = r.data.map(function (e) { return e.id; });
      return Promise.all(['top_tiempos', 'top_cumplimiento', 'top_reba', 'top_ergonomia'].map(function (t) {
        if (!ids.length) return Promise.resolve([]);
        return sb.from(t).select('evaluacion_id').in('evaluacion_id', ids.slice(0, 150)).then(function (x) { return x.data || []; });
      }));
    }).then(function (conteos) {
      var cuenta = function (i, id) { return conteos[i].filter(function (x) { return x.evaluacion_id === id; }).length; };
      var puede = AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar');
      var h = '<div class="vista">' + UI.encabezado('Ingeniería · Campo › Estudio TOP', 'Evaluar cosechador TOP',
        'Tiempos por actividad, cumplimiento de estándares, REBA y checklist ergonómico de cada cosechador TOP.',
        puede ? '<a class="btn verde" href="#evaluar/nueva">' + DR.ICONOS.mas + 'Nueva evaluación</a>' : '');
      if (!EVAL.lista.length) h += '<div class="panel entra"><div class="vacio">No hay evaluaciones en los últimos 60 días.</div></div>';
      else h += '<div class="top-evals">' + EVAL.lista.map(function (e) {
        var nt = cuenta(0, e.id), nc = cuenta(1, e.id), nr = cuenta(2, e.id), ng = cuenta(3, e.id), propia = e.evaluador_id === AT.perfil.id;
        return '<a class="top-eval entra' + (e.anulada ? ' anulada' : '') + '" href="#evaluar/' + e.id + '">' +
          '<div class="top-eval-cab"><b>' + DR.esc(e.cosechador) + '</b><span>' + DR.esc(e.codigo) + '</span></div>' +
          '<div class="top-eval-sub">' + TOP.fecha(e.fecha) + ' · ' + DR.esc([e.fundo, e.lote].filter(Boolean).join(' · ') || 'sin fundo') + ' · ' + DR.esc(e.presentacion) +
          (e.lider ? ' · Líder ' + DR.esc(e.lider) : '') + '</div>' +
          '<div class="top-eval-chips">' +
            '<span class="pill ' + (nt ? 'verde' : 'gris') + '">' + nt + ' tiempos</span>' +
            '<span class="pill ' + (nc ? 'verde' : 'gris') + '">' + nc + ' estándares</span>' +
            '<span class="pill ' + (nr ? 'verde' : 'gris') + '">' + nr + ' REBA</span>' +
            '<span class="pill ' + (ng ? 'verde' : 'gris') + '">' + (ng ? 'Ergonomía ✓' : 'Ergonomía') + '</span>' +
            (e.anulada ? '<span class="pill rojo">Anulada</span>' : '') +
            (!propia ? '<span class="pill azul">' + DR.esc(e.evaluador_txt || 'Otro evaluador') + '</span>' : '') +
          '</div></a>';
      }).join('') + '</div>';
      cont.innerHTML = h + '</div>';
      DR.entrarPaneles('#contenido');
    }).catch(function (e) { UI.error(cont, e); });
};

/* ------------------------------------------------ ficha */
EVAL.abrir = function (id, cont) {
  return Promise.all([
    sb.from('top_evaluaciones').select('*').eq('id', id).maybeSingle(),
    sb.from('top_tiempos').select('*').eq('evaluacion_id', id),
    sb.from('top_cumplimiento').select('*').eq('evaluacion_id', id),
    sb.from('top_reba').select('*').eq('evaluacion_id', id),
    sb.from('top_ergonomia').select('*').eq('evaluacion_id', id).maybeSingle()
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    if (!r[0].data) throw new Error('No se encontró la evaluación (o no tienes acceso).');
    EVAL.ev = r[0].data;
    EVAL.d = { tiempos: r[1].data, cump: r[2].data, reba: r[3].data, ergo: r[4].data };
    EVAL.pintarFicha(cont);
    TIEMPOS.subirPendientes(false);
  });
};

EVAL.recargar = function () {
  if (!EVAL.ev) return;
  EVAL.abrir(EVAL.ev.id, DR.$('#contenido')).catch(function (e) { DR.toast(e.message, 'error'); });
};

EVAL.pintarFicha = function (cont) {
  var e = EVAL.ev, edita = TOP.puedeEditar(e), scroll = DR.$('#contenido').scrollTop;
  var avance = {
    tiempos: EVAL.d.tiempos.length, estandares: EVAL.d.cump.filter(function (c) { return c.resultado; }).length,
    reba: EVAL.d.reba.length, ergonomia: EVAL.d.ergo ? Object.keys(EVAL.d.ergo.respuestas || {}).length : 0
  };
  cont.innerHTML = '<div class="vista">' +
    '<div class="migas"><button type="button" id="btnVolverLista">Evaluaciones</button><span class="sep">›</span><button type="button" disabled>' + DR.esc(e.codigo) + '</button></div>' +
    '<section class="top-ficha entra"><div><b>' + DR.esc(e.cosechador) + '</b>' + (e.dni ? '<span>DNI ' + DR.esc(e.dni) + '</span>' : '') + '</div>' +
      '<div class="top-ficha-sub">' + TOP.fecha(e.fecha) + ' · ' + DR.esc([e.fundo, e.lote].filter(Boolean).join(' · ') || 'sin fundo') + ' · <b>' + DR.esc(e.presentacion) + '</b>' +
      (e.lider ? ' · Líder ' + DR.esc(e.lider) : '') + '</div>' +
      (e.anulada ? '<span class="pill rojo">Anulada</span>' : (!edita ? '<span class="pill gris">Solo lectura</span>' : '')) + '</section>' +
    '<div class="segmentos top-tabs">' + EVAL.TABS.map(function (t) {
      var n = avance[t.k];
      return '<button type="button" class="segmento' + (EVAL.tab === t.k ? ' activo' : '') + '" data-tab="' + t.k + '">' + t.ico + '<span>' + t.t +
        (n ? ' <i class="top-tab-n">' + n + '</i>' : '') + '</span></button>';
    }).join('') + '</div><div id="seccion"></div></div>';
  DR.$('#btnVolverLista').onclick = function () { location.hash = '#evaluar'; };
  DR.$$('[data-tab]', cont).forEach(function (b) {
    b.onclick = function () {
      if (!EVAL.puedeCambiar()) return;
      EVAL.tab = this.getAttribute('data-tab');
      DR.$$('[data-tab]', cont).forEach(function (o) { o.classList.toggle('activo', o === b); });
      EVAL.pintarSeccion();
      DR.$('#contenido').scrollTop = 0;
    };
  });
  EVAL.pintarSeccion();
  DR.$('#contenido').scrollTop = scroll;
};

/** Al salir de Estándares o Ergonomía con cambios: el borrador queda en el celular, solo se avisa. */
EVAL.puedeCambiar = function () {
  if ((EVAL.tab === 'estandares' && EST.sucio) || (EVAL.tab === 'ergonomia' && ERGO.sucio)) {
    DR.toast('Tus cambios quedan como borrador en este celular. Recuerda «Guardar».', 'info');
  }
  return true;
};

EVAL.pintarSeccion = function () {
  clearInterval(TIEMPOS._t);
  var s = DR.$('#seccion');
  if (EVAL.tab === 'tiempos') TIEMPOS.pintar(s);
  else if (EVAL.tab === 'estandares') EST.pintar(s);
  else if (EVAL.tab === 'reba') REBA.pintar(s);
  else if (EVAL.tab === 'ergonomia') ERGO.pintar(s);
  else EVAL.formulario(s, EVAL.ev);
};

/* ------------------------------------------------ datos de la evaluación (nueva o editar) */
EVAL.formulario = function (cont, e) {
  var nueva = !e, edita = nueva ? (AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar')) : TOP.puedeEditar(e), dis = edita ? '' : ' disabled';
  var ult = TOP.leer('ultimos', {});
  e = e || { fecha: TOP.hoy(), fundo: ult.fundo || '', lote: '', presentacion: ult.presentacion || 'JARRA', lider: ult.lider || '', labor: 'Cosecha de arándano' };
  var fundos = TOP.misFundos();
  var h = (nueva ? '<div class="vista angosta">' + UI.encabezado('Estudio TOP › Evaluar', 'Nueva evaluación', 'Datos del cosechador TOP y del lugar donde se le observa.') : '') +
    '<section class="panel entra"><div class="form" id="frmEval">' +
    '<div class="campo"><label>Fecha</label><input type="date" data-campo="fecha" value="' + DR.esc(e.fecha) + '"' + dis + '></div>' +
    '<div class="campo"><label>Fundo</label><select data-campo="fundo"' + dis + '><option value="">—</option>' + fundos.map(function (f) {
      return '<option' + (f === e.fundo ? ' selected' : '') + '>' + DR.esc(f) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo"><label>Lote</label><input data-campo="lote" maxlength="30" value="' + DR.esc(e.lote) + '" placeholder="Ej. L-12" style="text-transform:uppercase"' + dis + '></div>' +
    '<div class="campo ancho"><label>Presentación</label><div class="opciones" id="opPresentacion">' + ['JARRA', 'BANDEJA'].map(function (p) {
      return '<button type="button" class="opcion' + (e.presentacion === p ? ' activa' : '') + '" data-pres="' + p + '"' + dis + '>' + (p === 'JARRA' ? 'Jarra cosechera' : 'Bandeja (granel)') + '</button>';
    }).join('') + '</div></div>' +
    '<div class="campo ancho"><label>Cosechador TOP</label><input data-campo="cosechador" list="dlCosechadores" maxlength="120" value="' + DR.esc(e.cosechador) + '" placeholder="Nombre y apellidos"' + dis + '>' +
      '<datalist id="dlCosechadores"></datalist></div>' +
    '<div class="campo"><label>DNI <em>opcional</em></label><input data-campo="dni" inputmode="numeric" maxlength="12" value="' + DR.esc(e.dni) + '"' + dis + '></div>' +
    '<div class="campo"><label>Líder</label><input data-campo="lider" maxlength="120" value="' + DR.esc(e.lider) + '"' + dis + '></div>' +
    '<div class="campo"><label>Labor</label><input data-campo="labor" maxlength="120" value="' + DR.esc(e.labor) + '"' + dis + '></div>' +
    '<div class="campo"><label>Herramienta</label><input data-campo="herramienta" maxlength="120" value="' + DR.esc(e.herramienta) + '" placeholder="Ej. jarra 16 con tamiz 18"' + dis + '></div>' +
    '<div class="campo ancho"><label>Observaciones</label><textarea data-campo="observaciones" rows="2"' + dis + '>' + DR.esc(e.observaciones) + '</textarea></div>' +
    '</div>' + (edita ? '<div class="acciones"><button type="button" class="btn verde" id="btnGuardarEval">' + (nueva ? 'Crear y empezar' : 'Guardar datos') + '</button>' +
      (nueva ? '<a class="btn sec" href="#evaluar">Cancelar</a>' : '') + '</div>' : '') +
    (!nueva ? '<div class="ayuda-campo" style="margin-top:12px">Registrada por ' + DR.esc(e.evaluador_txt || '—') + ' · ' + DR.fechaHora(e.creado_en) + '</div>' : '') +
    '</section>' +
    (!nueva && (AT.esAdmin() || e.evaluador_id === AT.perfil.id) && AT.puedeCapturar() ? '<section class="panel entra zona-peligro"><h2>' + (e.anulada ? 'Restaurar evaluación' : 'Anular evaluación') + '</h2>' +
      '<div class="sub">' + (e.anulada ? 'Vuelve a contar en el Resumen y la Propuesta.' : 'Deja de contar en el Resumen y la Propuesta (no se borra).') + '</div>' +
      '<button type="button" class="btn sec chico" id="btnAnular">' + (e.anulada ? 'Restaurar' : 'Anular') + '</button></section>' : '') +
    (nueva ? '</div>' : '');
  cont.innerHTML = h;
  DR.entrarPaneles('#' + cont.id);

  var pres = e.presentacion;
  DR.$$('[data-pres]', cont).forEach(function (b) {
    b.onclick = function () { pres = this.getAttribute('data-pres'); DR.$$('[data-pres]', cont).forEach(function (o) { o.classList.toggle('activa', o === b); }); };
  });
  // Autocompletar cosechadores ya evaluados (nombre → DNI).
  sb.from('top_evaluaciones').select('cosechador,dni').order('creado_en', { ascending: false }).limit(500).then(function (r) {
    var vistos = {};
    (r.data || []).forEach(function (x) { if (!vistos[x.cosechador]) vistos[x.cosechador] = x.dni || ''; });
    EVAL.conocidos = vistos;
    var dl = DR.$('#dlCosechadores');
    if (dl) dl.innerHTML = Object.keys(vistos).map(function (n) { return '<option value="' + DR.esc(n) + '">'; }).join('');
  });
  var inpCos = DR.$('[data-campo="cosechador"]', cont), inpDni = DR.$('[data-campo="dni"]', cont);
  if (inpCos) inpCos.onchange = function () { var d = (EVAL.conocidos || {})[this.value]; if (d && !inpDni.value) inpDni.value = d; };

  if (DR.$('#btnGuardarEval')) DR.$('#btnGuardarEval').onclick = function () {
    var f = UI.leerForm('frmEval'), btn = this;
    f.presentacion = pres;
    if (!f.cosechador.trim()) { DR.toast('Escribe el nombre del cosechador.', 'error'); return; }
    if (!nueva) f.id = e.id;
    btn.classList.add('cargando');
    AT.rpc('rpc_top_guardar_evaluacion', { p: f }).then(function (fila) {
      TOP.escribir('ultimos', { fundo: f.fundo, presentacion: f.presentacion, lider: f.lider });
      DR.toast(nueva ? 'Evaluación ' + fila.codigo + ' creada.' : 'Datos guardados.');
      if (nueva) { EVAL.tab = 'tiempos'; location.hash = '#evaluar/' + fila.id; }
      else EVAL.recargar();
    }).catch(function (er) { btn.classList.remove('cargando'); DR.toast(er.message, 'error'); });
  };
  if (DR.$('#btnAnular')) DR.$('#btnAnular').onclick = function () {
    if (!window.confirm(e.anulada ? '¿Restaurar esta evaluación?' : '¿Anular esta evaluación? Dejará de contar en el Resumen.')) return;
    AT.rpc('rpc_top_anular_evaluacion', { p_id: e.id, p_anular: !e.anulada }).then(function () {
      DR.toast(e.anulada ? 'Evaluación restaurada.' : 'Evaluación anulada.');
      EVAL.recargar();
    }).catch(function (er) { DR.toast(er.message, 'error'); });
  };
};
