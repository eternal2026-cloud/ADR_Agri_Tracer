/* ============================================================================
 * evaluar.js — LISTA DE EVALUACIONES Y FICHA DEL COSECHADOR TOP
 * Ficha con 5 secciones: Tiempos · Estándares · REBA · Ergonomía · Datos.
 * Nueva evaluación sin digitar: cosechador de la lista cargada por Excel, fundo,
 * lote del mapa de calor (con lo que se está cosechando) y material con botones.
 * Enlaces: #evaluar/<id>, #evaluar/nueva, #evaluar/cosechadores.
 * ==========================================================================*/
var EVAL = { ev: null, d: null, tab: 'tiempos', lista: [], filtro: 'todas' };

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
    if (m && m[1] === 'cosechadores') return COS.pintar(cont);
    if (m) return EVAL.abrir(m[1], cont);
    EVAL.ev = null;
    return EVAL.pintarLista(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

/* ------------------------------------------------ lista (agrupada por día) */
EVAL.pintarLista = function (cont) {
  var desde = new Date(Date.now() - 60 * 86400000);
  return Promise.all([
    sb.from('top_evaluaciones').select('*').gte('fecha', TOP.localDe(desde).substring(0, 10))
      .order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(300),
    TOP.cargarCosechadores().catch(function () { return []; })
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    EVAL.lista = r[0].data;
    var ids = r[0].data.map(function (e) { return e.id; });
    return Promise.all(['top_tiempos', 'top_cumplimiento', 'top_reba', 'top_ergonomia'].map(function (t) {
      if (!ids.length) return Promise.resolve([]);
      return sb.from(t).select('evaluacion_id').in('evaluacion_id', ids.slice(0, 150)).then(function (x) { return x.data || []; });
    }));
  }).then(function (conteos) {
    EVAL.conteos = conteos;
    // Si mientras cargaba se fue a otra pantalla (#evaluar/…), no se pisa.
    if (/^#evaluar\/./.test(location.hash) || DR.vista !== 'evaluar') return;
    EVAL.dibujarLista(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

EVAL.dibujarLista = function (cont) {
  var conteos = EVAL.conteos, cuenta = function (i, id) { return conteos[i].filter(function (x) { return x.evaluacion_id === id; }).length; };
  var puede = AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar'), nCos = (TOP.cosechadores || []).filter(function (c) { return c.activo; }).length;
  var lista = EVAL.lista.filter(function (e) { return EVAL.filtro === 'todas' || e.evaluador_id === AT.perfil.id; });
  var hoy = TOP.hoy(), ayer = TOP.localDe(new Date(Date.now() - 86400000)).substring(0, 10);
  var grupos = [];
  lista.forEach(function (e) {
    var g = e.fecha === hoy ? 'Hoy' : (e.fecha === ayer ? 'Ayer' : TOP.fecha(e.fecha));
    if (!grupos.length || grupos[grupos.length - 1].t !== g) grupos.push({ t: g, l: [] });
    grupos[grupos.length - 1].l.push(e);
  });
  var h = '<div class="vista">' + UI.encabezado('Ingeniería · Campo › Estudio TOP', 'Evaluar cosechador TOP',
    'Tiempos por actividad, estándares, REBA y ergonomía de cada cosechador TOP.') +
    (puede ? '<a class="top-nueva entra" href="#evaluar/nueva"><span class="top-nueva-ico">' + DR.ICONOS.mas + '</span>' +
      '<span><b>Nueva evaluación</b><small>' + (nCos ? 'Elige al cosechador de la lista (' + nCos + ')' : 'Primero carga la lista de cosechadores') + '</small></span>' + DR.ICONOS.chevron + '</a>' : '') +
    '<div class="top-lista-barra"><div class="opciones">' + [['todas', 'Todas'], ['mias', 'Mías']].map(function (o) {
      return '<button type="button" class="opcion' + (EVAL.filtro === o[0] ? ' activa' : '') + '" data-filtro="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div><a class="btn sec chico" href="#evaluar/cosechadores">' + DR.ICONOS.lupa + 'Cosechadores' + (nCos ? ' (' + nCos + ')' : '') + '</a></div>';
  if (!lista.length) h += '<div class="panel entra"><div class="vacio">No hay evaluaciones en los últimos 60 días.</div></div>';
  grupos.forEach(function (g) {
    h += '<div class="top-dia">' + DR.esc(g.t) + '<span>' + g.l.length + '</span></div><div class="top-evals">' + g.l.map(function (e) {
      var n = [cuenta(0, e.id), cuenta(1, e.id), cuenta(2, e.id), cuenta(3, e.id)], hechas = n.filter(Boolean).length;
      return '<a class="top-eval entra' + (e.anulada ? ' anulada' : '') + '" href="#evaluar/' + e.id + '">' +
        '<span class="top-avatar">' + DR.esc(COS.iniciales(e.cosechador)) + '</span>' +
        '<div class="top-eval-cuerpo"><div class="top-eval-cab"><b>' + DR.esc(e.cosechador) + '</b><span>' + DR.esc(e.codigo) + '</span></div>' +
        '<div class="top-eval-sub">' + DR.esc([e.fundo, e.lote].filter(Boolean).join(' · ') || 'sin lote') + ' · ' + DR.esc(TOP.materialTxt(e.material || e.presentacion)) +
          (e.evaluador_id !== AT.perfil.id ? ' · ' + DR.esc(e.evaluador_txt || 'otro evaluador') : '') + '</div>' +
        '<div class="top-progreso" title="' + hechas + ' de 4 secciones">' + ['Tiempos', 'Estándares', 'REBA', 'Ergonomía'].map(function (t, i) {
          return '<span class="' + (n[i] ? 'ok' : '') + '">' + t + (n[i] && i < 3 ? ' ' + n[i] : '') + '</span>';
        }).join('') + '</div>' + (e.anulada ? '<span class="pill rojo">Anulada</span>' : '') + '</div></a>';
    }).join('') + '</div>';
  });
  cont.innerHTML = h + '</div>';
  DR.entrarPaneles('#contenido');
  DR.$$('[data-filtro]', cont).forEach(function (b) { b.onclick = function () { EVAL.filtro = b.getAttribute('data-filtro'); EVAL.dibujarLista(cont); }; });
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
    if (location.hash !== '#evaluar/' + id) return;   // ya se fue a otra pantalla
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
  var mat = e.material || e.presentacion;
  cont.innerHTML = '<div class="vista">' +
    '<div class="migas"><button type="button" id="btnVolverLista">Evaluaciones</button><span class="sep">›</span><button type="button" disabled>' + DR.esc(e.codigo) + '</button></div>' +
    '<section class="top-ficha entra"><span class="top-avatar grande">' + DR.esc(COS.iniciales(e.cosechador)) + '</span><div class="top-ficha-cuerpo">' +
      '<b>' + DR.esc(e.cosechador) + '</b>' +
      '<div class="top-ficha-sub">' + TOP.fecha(e.fecha) + (e.lider ? ' · Líder ' + DR.esc(e.lider) : '') + '</div>' +
      '<div class="top-ficha-chips"><span class="top-chip">' + DR.esc([e.fundo, e.lote].filter(Boolean).join(' · ') || 'sin lote') + '</span>' +
      '<span class="top-chip mat">' + TOP.icoMaterial(mat) + DR.esc(TOP.materialTxt(mat)) + '</span>' +
      (e.variedad ? '<span class="top-chip">' + DR.esc(e.variedad) + '</span>' : '') +
      (e.anulada ? '<span class="pill rojo">Anulada</span>' : (!edita ? '<span class="pill gris">Solo lectura</span>' : '')) + '</div></div></section>' +
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

/* ------------------------------------------------ datos de la evaluación (nueva o editar)
 * Todo con toques: cosechador (buscador sobre la lista), fundo, lote (mapa de calor; los
 * lotes con ciclos recientes van primero y traen su material y variedad) y material. */
EVAL.formulario = function (cont, e) {
  var nueva = !e;
  var edita = nueva ? (AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar')) : TOP.puedeEditar(e);
  cont.innerHTML = '<div class="vacio">Cargando lotes y cosechadores…</div>';
  return Promise.all([TOP.cargarLotes(), TOP.cargarCosechadores().catch(function () { return []; })]).then(function () {
    var ult = TOP.leer('ultimos', {});
    var st = EVAL.f = nueva ? {
      fecha: TOP.hoy(), fundo: ult.fundo || (TOP.misFundos().length === 1 ? TOP.misFundos()[0] : ''), lote: '', material: ult.material || '',
      variedad: '', cosechador_id: null, cosechador: '', lider: '', herramienta: '', observaciones: '', labor: 'Cosecha de arándano'
    } : {
      id: e.id, fecha: e.fecha, fundo: e.fundo || '', lote: e.lote || '', material: e.material || '', variedad: e.variedad || '',
      cosechador_id: e.cosechador_id, cosechador: e.cosechador, dni: e.dni, lider: e.lider || '', herramienta: e.herramienta || '',
      observaciones: e.observaciones || '', labor: e.labor
    };
    st.edita = edita;
    var h = (nueva ? '<div class="vista angosta">' + UI.encabezado('Estudio TOP › Evaluar', 'Nueva evaluación', 'Toca para elegir: no hace falta escribir.') : '') +
      '<section class="panel entra top-paso" id="pasoCos"></section>' +
      '<section class="panel entra top-paso" id="pasoLugar"></section>' +
      '<section class="panel entra top-paso" id="pasoMat"></section>' +
      '<details class="panel entra top-mas"' + (!nueva && (st.herramienta || st.observaciones) ? ' open' : '') + '><summary>Más datos <small>fecha, líder, herramienta y observaciones</small></summary>' +
        '<div class="form" id="frmMas" style="margin-top:12px">' +
        '<div class="campo"><label>Fecha</label><input type="date" data-campo="fecha" value="' + DR.esc(st.fecha) + '"' + (edita ? '' : ' disabled') + '></div>' +
        '<div class="campo"><label>Líder</label><input data-campo="lider" id="inpLider" maxlength="120" value="' + DR.esc(st.lider) + '"' + (edita ? '' : ' disabled') + '></div>' +
        '<div class="campo ancho"><label>Herramienta <em>opcional</em></label><input data-campo="herramienta" maxlength="120" value="' + DR.esc(st.herramienta) + '" placeholder="Ej. jarra 16 con tamiz 18"' + (edita ? '' : ' disabled') + '></div>' +
        '<div class="campo ancho"><label>Observaciones</label><textarea data-campo="observaciones" rows="2"' + (edita ? '' : ' disabled') + '>' + DR.esc(st.observaciones) + '</textarea></div>' +
        '</div></details>' +
      (edita ? '<div class="top-guardar"><span id="resumenSel"></span><button type="button" class="btn verde" id="btnGuardarEval">' + (nueva ? 'Empezar evaluación' : 'Guardar datos') + '</button></div>' : '') +
      (!nueva ? '<div class="ayuda-campo" style="margin:12px 2px">Registrada por ' + DR.esc(e.evaluador_txt || '—') + ' · ' + DR.fechaHora(e.creado_en) + '</div>' : '') +
      (!nueva && (AT.esAdmin() || e.evaluador_id === AT.perfil.id) && AT.puedeCapturar() ? '<section class="panel entra zona-peligro"><h2>' + (e.anulada ? 'Restaurar evaluación' : 'Anular evaluación') + '</h2>' +
        '<div class="sub">' + (e.anulada ? 'Vuelve a contar en el Resumen y la Propuesta.' : 'Deja de contar en el Resumen y la Propuesta (no se borra).') + '</div>' +
        '<button type="button" class="btn sec chico" id="btnAnular">' + (e.anulada ? 'Restaurar' : 'Anular') + '</button></section>' : '') +
      (nueva ? '</div>' : '');
    cont.innerHTML = h;
    DR.entrarPaneles('#' + cont.id);
    EVAL.pasoCosechador(); EVAL.pasoLugar(); EVAL.pasoMaterial(); EVAL.resumenSel();

    if (DR.$('#btnGuardarEval')) DR.$('#btnGuardarEval').onclick = function () { EVAL.guardar(this, nueva); };
    if (DR.$('#btnAnular')) DR.$('#btnAnular').onclick = function () {
      if (!window.confirm(e.anulada ? '¿Restaurar esta evaluación?' : '¿Anular esta evaluación? Dejará de contar en el Resumen.')) return;
      AT.rpc('rpc_top_anular_evaluacion', { p_id: e.id, p_anular: !e.anulada }).then(function () {
        DR.toast(e.anulada ? 'Evaluación restaurada.' : 'Evaluación anulada.');
        EVAL.recargar();
      }).catch(function (er) { DR.toast(er.message, 'error'); });
    };
  }).catch(function (er) { UI.error(cont, er); });
};

EVAL.cabPaso = function (n, titulo, valor, ok) {
  return '<div class="top-paso-cab"><span class="top-paso-n' + (ok ? ' ok' : '') + '">' + (ok ? DR.ICONOS.checkChico : n) + '</span><h2>' + titulo + '</h2>' +
    (valor ? '<span class="top-paso-val">' + valor + '</span>' : '') + '</div>';
};

/** Paso 1: cosechador. Buscador sobre la lista cargada por Excel; si no hay lista, nombre libre. */
EVAL.pasoCosechador = function (buscar) {
  var st = EVAL.f, cont = DR.$('#pasoCos'), lista = (TOP.cosechadores || []).filter(function (c) { return c.activo || c.id === st.cosechador_id; });
  var sel = st.cosechador_id ? lista.filter(function (c) { return c.id === st.cosechador_id; })[0] : null;
  var h = EVAL.cabPaso(1, '¿A quién evalúas?', '', !!st.cosechador);
  if (st.cosechador && buscar === undefined) {
    h += '<div class="top-cos sel"><span class="top-avatar">' + DR.esc(COS.iniciales(st.cosechador)) + '</span><div><b>' + DR.esc(st.cosechador) + '</b><small>' +
      DR.esc([sel ? 'DNI ' + sel.dni : (st.dni ? 'DNI ' + st.dni : ''), sel && sel.fundo, st.lider ? 'Líder ' + st.lider : ''].filter(Boolean).join(' · ')) + '</small></div>' +
      (st.edita ? '<button type="button" class="btn mini sec" id="btnCambiarCos">Cambiar</button>' : '') + '</div>';
    cont.innerHTML = h;
    if (DR.$('#btnCambiarCos')) DR.$('#btnCambiarCos').onclick = function () { EVAL.pasoCosechador(''); var i = DR.$('#buscarCos'); if (i) i.focus(); };
    return;
  }
  if (!lista.length) {
    h += '<div class="aviso alerta">Aún no hay lista de cosechadores. <a href="#evaluar/cosechadores">Cárgala desde Excel</a> o escribe el nombre:</div>' +
      '<input id="nombreLibre" maxlength="120" placeholder="Nombre del cosechador" style="margin-top:10px" value="' + DR.esc(st.cosechador) + '">';
    cont.innerHTML = h;
    DR.$('#nombreLibre').oninput = function () { st.cosechador = this.value.trim().toUpperCase(); st.cosechador_id = null; EVAL.resumenSel(); };
    return;
  }
  var t = TOP.norm(buscar || '');
  // Sin búsqueda: primero los del fundo elegido y los ya evaluados por este usuario.
  var evaluados = {};
  (EVAL.lista || []).forEach(function (e) { if (e.cosechador_id) evaluados[e.cosechador_id] = (evaluados[e.cosechador_id] || 0) + 1; });
  var res = lista.filter(function (c) { return !t || TOP.norm(c.nombre + ' ' + c.dni + ' ' + (c.lider || '')).indexOf(t) > -1; })
    .sort(function (a, b) {
      var fa = st.fundo && a.fundo === st.fundo ? 0 : 1, fb = st.fundo && b.fundo === st.fundo ? 0 : 1;
      return fa - fb || (evaluados[b.id] || 0) - (evaluados[a.id] || 0) || a.nombre.localeCompare(b.nombre);
    }).slice(0, 30);
  h += '<input type="search" id="buscarCos" placeholder="Busca por nombre, DNI o líder" autocomplete="off" value="' + DR.esc(buscar || '') + '">' +
    '<div class="top-cos-lista elegir">' + (res.length ? res.map(function (c) {
      return '<button type="button" class="top-cos" data-cos="' + c.id + '"><span class="top-avatar">' + DR.esc(COS.iniciales(c.nombre)) + '</span>' +
        '<div><b>' + DR.esc(c.nombre) + '</b><small>DNI ' + DR.esc(c.dni) + (c.fundo ? ' · ' + DR.esc(c.fundo) : '') + (c.lider ? ' · ' + DR.esc(c.lider) : '') + '</small></div>' +
        (evaluados[c.id] ? '<span class="pill gris">' + evaluados[c.id] + ' eval.</span>' : '') + '</button>';
    }).join('') : '<div class="vacio">Nadie coincide. ¿Falta en la lista? <a href="#evaluar/cosechadores">Cárgalo</a>.</div>') + '</div>';
  cont.innerHTML = h;
  var inp = DR.$('#buscarCos');
  inp.oninput = function () {
    var v = this.value, pos = this.selectionStart;
    EVAL.pasoCosechador(v);
    var n = DR.$('#buscarCos'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* sin selección */ }
  };
  DR.$$('[data-cos]', cont).forEach(function (b) {
    b.onclick = function () {
      var c = lista.filter(function (x) { return x.id === Number(b.getAttribute('data-cos')); })[0];
      st.cosechador_id = c.id; st.cosechador = c.nombre; st.dni = c.dni;
      if (c.lider) { st.lider = c.lider; var l = DR.$('#inpLider'); if (l) l.value = c.lider; }
      if (c.fundo && !st.fundo && TOP.misFundos().indexOf(c.fundo) > -1) { st.fundo = c.fundo; EVAL.pasoLugar(); }
      DR.vibrar(15);
      EVAL.pasoCosechador(); EVAL.resumenSel();
    };
  });
};

/** Paso 2: fundo y lote (lotes del mapa; los que tienen ciclos recientes primero). */
EVAL.pasoLugar = function () {
  var st = EVAL.f, cont = DR.$('#pasoLugar'), dis = st.edita ? '' : ' disabled';
  var fundos = TOP.misFundos();
  var lotes = (TOP.lotes[st.fundo] || []).map(function (l) { return { lote: l.lote, ha: l.ha, c: TOP.cosechaDe(st.fundo, l.lote) }; });
  var activos = lotes.filter(function (l) { return l.c; }).sort(function (a, b) { return a.c.ultima < b.c.ultima ? 1 : -1; });
  var resto = lotes.filter(function (l) { return !l.c; });
  var chip = function (l) {
    return '<button type="button" class="top-lote' + (st.lote === l.lote ? ' activo' : '') + (l.c ? ' cosecha' : '') + '" data-lote="' + DR.esc(l.lote) + '"' + dis + '>' +
      '<b>' + DR.esc(l.lote) + '</b>' + (l.c ? '<small>' + DR.esc(TOP.materialTxt(l.c.material)) + ' · ' + EVAL.haceDias(l.c.ultima) + '</small>' : (l.ha ? '<small>' + DR.num(l.ha, 1) + ' ha</small>' : '')) + '</button>';
  };
  cont.innerHTML = EVAL.cabPaso(2, '¿Dónde?', st.lote ? DR.esc(st.fundo + ' · ' + st.lote) : '', !!(st.fundo && st.lote)) +
    '<div class="top-fundos">' + fundos.map(function (f) {
      return '<button type="button" class="opcion' + (st.fundo === f ? ' activa' : '') + '" data-fundo="' + DR.esc(f) + '"' + dis + '>' + DR.esc(f) + '</button>';
    }).join('') + '</div>' +
    (!st.fundo ? '<div class="ayuda-campo" style="margin-top:10px">Elige el fundo para ver sus lotes.</div>' :
      (activos.length ? '<div class="top-sub-tit"><span class="en-vivo-punto"></span>En cosecha (últimos 14 días)</div><div class="top-lotes">' + activos.map(chip).join('') + '</div>' : '') +
      (resto.length ? '<div class="top-sub-tit">' + (activos.length ? 'Otros lotes' : 'Lotes del fundo') + '</div><div class="top-lotes">' + resto.map(chip).join('') + '</div>' : '') +
      (!lotes.length ? '<div class="ayuda-campo" style="margin-top:10px">Este fundo no tiene lotes en el mapa.</div>' : ''));
  DR.$$('[data-fundo]', cont).forEach(function (b) {
    b.onclick = function () { st.fundo = b.getAttribute('data-fundo'); st.lote = ''; EVAL.pasoLugar(); EVAL.resumenSel(); };
  });
  DR.$$('[data-lote]', cont).forEach(function (b) {
    b.onclick = function () {
      st.lote = b.getAttribute('data-lote');
      // El lote trae lo que se está cosechando: material y variedad de sus ciclos recientes.
      var c = TOP.cosechaDe(st.fundo, st.lote);
      if (c) { if (c.material) st.material = String(c.material).toUpperCase(); if (c.variedad) st.variedad = c.variedad; EVAL.pasoMaterial(); }
      DR.vibrar(15);
      EVAL.pasoLugar(); EVAL.resumenSel();
    };
  });
};
EVAL.haceDias = function (f) {
  var d = Math.round((new Date(TOP.hoy()) - new Date(f)) / 86400000);
  return d <= 0 ? 'hoy' : (d === 1 ? 'ayer' : 'hace ' + d + ' d');
};

/** Paso 3: material de cosecha (presentaciones de Tiempos de ciclo). */
EVAL.pasoMaterial = function () {
  var st = EVAL.f, cont = DR.$('#pasoMat'), dis = st.edita ? '' : ' disabled';
  var mats = TOP.ordenarMateriales(TOP.listas.material.concat(st.material ? [st.material] : []));
  var c = TOP.cosechaDe(st.fundo, st.lote);
  cont.innerHTML = EVAL.cabPaso(3, '¿Con qué material cosecha?', '', !!st.material) +
    (c ? '<div class="ayuda-campo" style="margin-bottom:10px">En ' + DR.esc(st.lote) + ' se registró <b>' + DR.esc(TOP.materialTxt(c.material)) + '</b>' +
      (c.variedad ? ' · variedad ' + DR.esc(c.variedad) : '') + ' (' + c.ciclos + ' ciclos, ' + EVAL.haceDias(c.ultima) + ').</div>' : '') +
    '<div class="top-mats">' + mats.map(function (m) {
      return '<button type="button" class="top-mat' + (st.material === m ? ' activo' : '') + '" data-mat="' + DR.esc(m) + '"' + dis + '>' + TOP.icoMaterial(m) +
        '<b>' + DR.esc(TOP.materialTxt(m)) + '</b><small>' + (TOP.familia(m) === 'JARRA' ? 'Estándar jarra' : 'Estándar granel') + '</small></button>';
    }).join('') + '</div>';
  DR.$$('[data-mat]', cont).forEach(function (b) {
    b.onclick = function () { st.material = b.getAttribute('data-mat'); DR.vibrar(15); EVAL.pasoMaterial(); EVAL.resumenSel(); };
  });
};

EVAL.resumenSel = function () {
  var st = EVAL.f, el = DR.$('#resumenSel');
  if (!el) return;
  var falta = [!st.cosechador && 'cosechador', !st.lote && 'lote', !st.material && 'material'].filter(Boolean);
  el.innerHTML = falta.length ? 'Falta: <b>' + falta.join(', ') + '</b>' : DR.esc(st.cosechador.split(' ').slice(0, 2).join(' ')) + ' · ' + DR.esc(st.lote) + ' · ' + DR.esc(TOP.materialTxt(st.material));
  var b = DR.$('#btnGuardarEval');
  if (b) b.disabled = !!falta.length;
};

EVAL.guardar = function (btn, nueva) {
  var st = EVAL.f, mas = UI.leerForm('frmMas');
  var p = { id: st.id || null, fecha: mas.fecha || st.fecha, fundo: st.fundo, lote: st.lote, material: st.material, variedad: st.variedad,
    cosechador_id: st.cosechador_id, cosechador: st.cosechador, dni: st.cosechador_id ? '' : (st.dni || ''), lider: mas.lider,
    herramienta: mas.herramienta, observaciones: mas.observaciones, labor: st.labor };
  btn.classList.add('cargando');
  AT.rpc('rpc_top_guardar_evaluacion', { p: p }).then(function (fila) {
    TOP.escribir('ultimos', { fundo: st.fundo, material: st.material });
    DR.toast(nueva ? 'Evaluación ' + fila.codigo + ' creada.' : 'Datos guardados.');
    if (nueva) { EVAL.tab = 'tiempos'; location.hash = '#evaluar/' + fila.id; }
    else EVAL.recargar();
  }).catch(function (er) { btn.classList.remove('cargando'); DR.toast(er.message, 'error'); });
};
