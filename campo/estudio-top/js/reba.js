/* ============================================================================
 * reba.js — HOJA «CHECKLIST REBA» CON LAS IMÁGENES DE POSTURA
 * Una evaluación TOP tiene hasta 3 REBA (3 veces por día; p. ej. inicio, media
 * mañana y final, o cosecha en zona baja y en zona alta). El puntaje se calcula en vivo (tablas A, B y C) y el servidor lo
 * vuelve a calcular al guardar (fn_top_reba_puntaje).
 * ==========================================================================*/
var REBA = { r: null, MAX: 3 };

REBA.pintar = function (cont) {
  REBA.r = null;
  var edita = TOP.puedeEditar(EVAL.ev), lista = EVAL.d.reba.slice().sort(function (a, b) { return a.id - b.id; });
  var h = UI.panel('Evaluaciones REBA · ' + lista.length + ' de ' + REBA.MAX, 'Hasta ' + REBA.MAX + ' veces por día, una por postura o momento observado. Toca una para verla o corregirla.',
    (lista.length ? '<div class="top-tomas">' + lista.map(function (r) {
      var rg = TOP.RIESGOS[r.nivel] || TOP.RIESGOS[0];
      return '<button type="button" class="top-toma" data-reba="' + r.id + '" style="--c:' + rg.c + '">' +
        '<span class="top-toma-nom">' + DR.esc(r.actividad_id ? TOP.actividad(r.actividad_id).nombre : 'Sin actividad') + (r.momento ? '<small>' + DR.esc(r.momento) + '</small>' : '') + '</span>' +
        '<span class="top-toma-hora">A ' + r.puntaje_a + ' · B ' + r.puntaje_b + ' · C ' + r.puntaje_c + '</span>' +
        '<b class="top-reba-chip" style="background:' + rg.c + '">' + r.puntaje_final + ' · ' + DR.esc(rg.t) + '</b></button>';
    }).join('') + '</div>' : '<div class="vacio">Aún no hay evaluaciones REBA.</div>') +
    (edita && lista.length < REBA.MAX ? '<div class="acciones"><button type="button" class="btn azul" id="btnNuevoReba">' + DR.ICONOS.mas + 'Nueva evaluación REBA (' + (lista.length + 1) + ' de ' + REBA.MAX + ')</button></div>' :
      (edita ? '<div class="ayuda-campo" style="margin-top:10px">Ya están las ' + REBA.MAX + ' del día: para cambiar algo, corrige una de ellas.</div>' : '')));
  cont.innerHTML = h;
  DR.entrarPaneles('#' + cont.id);
  if (DR.$('#btnNuevoReba')) DR.$('#btnNuevoReba').onclick = function () {
    var borrador = TOP.leer('reba.' + EVAL.ev.id, null);
    REBA.abrir(borrador || TOP.REBA_VACIO(), cont);
  };
  DR.$$('[data-reba]', cont).forEach(function (b) {
    b.onclick = function () {
      var r = EVAL.d.reba.filter(function (x) { return x.id === Number(b.getAttribute('data-reba')); })[0];
      var copia = JSON.parse(JSON.stringify(r));
      copia.fotos = (r.fotos || []).map(function (f) { return { ruta: f }; });
      REBA.abrir(copia, cont);
    };
  });
};

REBA.abrir = function (r, cont) {
  REBA.r = r;
  if (!Array.isArray(r.fotos)) r.fotos = [];
  r.fotos = r.fotos.map(function (f) { return typeof f === 'string' ? { ruta: f } : f; });
  var edita = TOP.puedeEditar(EVAL.ev), dis = edita ? '' : ' disabled';
  var h = '<div class="migas"><button type="button" id="rebaVolver">REBA</button><span class="sep">›</span><button type="button" disabled>' + (r.id ? 'Evaluación #' + r.id : 'Nueva') + '</button></div>' +
    '<section class="panel entra"><div class="form">' +
    '<div class="campo"><label>Actividad observada</label><select id="rebaAct"' + dis + '><option value="">—</option>' + TOP.actividades.map(function (a) {
      return '<option value="' + a.id + '"' + (Number(r.actividad_id) === a.id ? ' selected' : '') + '>' + DR.esc(a.nombre) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="campo"><label>Momento / postura <em>opcional</em></label><input id="rebaMomento" maxlength="120" value="' + DR.esc(r.momento) + '" placeholder="Ej. cosecha zona baja de la planta"' + dis + '></div>' +
    '</div></section>';
  var grupos = { A: 'Grupo A: cuello, tronco y piernas', B: 'Grupo B: brazos, antebrazos y muñecas', C: 'Actividad muscular' };
  var grupoActual = null;
  TOP.REBA_SEG.forEach(function (s) {
    if (s.grupo !== grupoActual) { grupoActual = s.grupo; h += '<div class="sep-titulo top-grupo-tit">' + grupos[s.grupo] + '</div>'; }
    var fig = s.img ? '<img class="top-fig" src="' + s.img + '" alt="Posturas de ' + DR.esc(s.t.toLowerCase()) + '" loading="lazy">' : (s.svg ? TOP.svgBrazo() : '');
    h += '<section class="panel entra top-seg"><div class="top-seg-cab"><h2>' + DR.esc(s.t) + '</h2><span class="top-seg-pts" data-pts="' + s.k + '"></span></div>' +
      (fig ? '<div class="top-fig-marco">' + fig + '</div>' : '') +
      (s.op.length ? '<div class="top-ops">' + s.op.map(function (o) {
        return '<button type="button" class="top-op' + (r[s.k] === o.v ? ' activo' : '') + '" data-seg="' + s.k + '" data-v="' + o.v + '"' + dis + '><b>' + o.v + '</b>' + DR.esc(o.t) + '</button>';
      }).join('') + '</div>' : '') +
      (s.mods.length ? '<div class="top-mods">' + s.mods.map(function (m) {
        var on = m.valor ? r[m.k] === m.valor : !!r[m.k];
        return '<button type="button" class="top-mod' + (on ? ' activo' : '') + '" data-mod="' + m.k + '"' + (m.valor ? ' data-valor="' + m.valor + '"' : '') + dis + '>' +
          '<span class="top-mod-v">' + m.v + '</span>' + DR.esc(m.t) + '</button>';
      }).join('') + '</div>' : '') + '</section>';
  });
  h += '<section class="panel entra"><h2>Foto de la postura y observación</h2><div class="form" style="margin-top:10px">' +
    '<div class="campo ancho">' + (edita ? FOTOS.campoMultiHtml('fotoReba', 'Agregar foto', 'Hasta 3', 3) : FOTOS.galeriaHtml(r.fotos.map(function (f) { return f.ruta; }))) + '</div>' +
    '<div class="campo ancho"><label>Observación</label><textarea id="rebaObs" rows="2"' + dis + '>' + DR.esc(r.observacion) + '</textarea></div></div></section>' +
    '<div class="top-reba-res" id="rebaRes"></div>';
  cont.innerHTML = h;
  DR.$('#contenido').scrollTop = 0;
  DR.entrarPaneles('#' + cont.id);

  var cambiar = function () { if (!r.id) TOP.escribir('reba.' + EVAL.ev.id, REBA.sinBlobs(r)); REBA.resultado(edita); };
  DR.$('#rebaVolver').onclick = function () { REBA.pintar(cont); };
  DR.$$('[data-seg]', cont).forEach(function (b) {
    b.onclick = function () {
      var k = this.getAttribute('data-seg');
      r[k] = Number(this.getAttribute('data-v'));
      DR.$$('[data-seg="' + k + '"]', cont).forEach(function (o) { o.classList.toggle('activo', o === b); });
      DR.vibrar(12); cambiar();
    };
  });
  DR.$$('[data-mod]', cont).forEach(function (b) {
    b.onclick = function () {
      var k = this.getAttribute('data-mod'), valor = this.getAttribute('data-valor');
      if (valor) {
        r[k] = r[k] === Number(valor) ? 0 : Number(valor);
        DR.$$('[data-mod="' + k + '"]', cont).forEach(function (o) { o.classList.toggle('activo', Number(o.getAttribute('data-valor')) === r[k]); });
      } else {
        r[k] = !r[k];
        // Hombro elevado (+1) y apoyo (−1) pueden coexistir; el resto son independientes.
        b.classList.toggle('activo', r[k]);
      }
      DR.vibrar(12); cambiar();
    };
  });
  if (edita) {
    DR.$('#rebaAct').onchange = function () { r.actividad_id = this.value ? Number(this.value) : null; cambiar(); };
    DR.$('#rebaMomento').oninput = function () { r.momento = this.value; cambiar(); };
    DR.$('#rebaObs').oninput = function () { r.observacion = this.value; cambiar(); };
    FOTOS.enlazarLista('fotoReba', r.fotos, 3);
  } else FOTOS.pintar(cont);
  REBA.resultado(edita);
};

REBA.sinBlobs = function (r) {
  var c = {};
  Object.keys(r).forEach(function (k) { if (k !== 'fotos') c[k] = r[k]; });
  c.fotos = r.fotos.filter(function (f) { return f.ruta; }).map(function (f) { return f.ruta; });
  return c;
};

/** Barra fija con A, B, C, puntaje final y nivel de riesgo. */
REBA.resultado = function (edita) {
  var r = REBA.r, x = TOP.rebaCalc(r), rg = TOP.RIESGOS[x.nivel];
  TOP.REBA_SEG.forEach(function (s) {
    var el = DR.$('[data-pts="' + s.k + '"]');
    if (!el) return;
    var v = s.k === 'actividad' ? (r.act_estatica ? 1 : 0) + (r.act_repetitiva ? 1 : 0) + (r.act_inestable ? 1 : 0) : r[s.k];
    var m = s.mods.reduce(function (t, md) { return t + (md.valor ? (r[md.k] === md.valor ? md.valor : 0) : (r[md.k] ? (md.v === '−1' ? -1 : 1) : 0)); }, 0);
    el.textContent = s.k === 'actividad' ? '+' + v : (v + (m ? (m > 0 ? ' +' : ' ') + m : '') + ' pts');
  });
  DR.$('#rebaRes').innerHTML = '<div class="top-reba-cifras"><span>A <b>' + x.puntaje_a + '</b></span><span>B <b>' + x.puntaje_b + '</b></span><span>C <b>' + x.puntaje_c + '</b></span></div>' +
    '<div class="top-reba-final" style="--c:' + rg.c + '"><b>' + x.puntaje_final + '</b><span>' + rg.t + '<small>' + rg.accion + '</small></span></div>' +
    (edita ? '<button type="button" class="btn verde" id="btnGuardarReba">Guardar</button>' +
      (r.id ? '<button type="button" class="btn sec mini" id="btnBorrarReba" title="Borrar">✕</button>' : '') : '');
  if (!edita) return;
  DR.$('#btnGuardarReba').onclick = function () {
    var btn = this;
    btn.classList.add('cargando');
    FOTOS.subirLista(r.fotos, 'eval/' + EVAL.ev.id + '/reba-' + Date.now()).then(function (rutas) {
      var p = REBA.sinBlobs(r);
      p.fotos = rutas;
      p.evaluacion_id = EVAL.ev.id;
      return AT.rpc('rpc_top_guardar_reba', { p: p });
    }).then(function (fila) {
      if (!r.id) TOP.escribir('reba.' + EVAL.ev.id, null);
      DR.toast('REBA guardado: ' + fila.puntaje_final + ' · riesgo ' + fila.riesgo.toLowerCase() + '.');
      DR.sonar(true);
      EVAL.recargar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
  if (DR.$('#btnBorrarReba')) DR.$('#btnBorrarReba').onclick = function () {
    if (!window.confirm('¿Borrar esta evaluación REBA?')) return;
    AT.rpc('rpc_top_borrar_reba', { p_id: r.id }).then(function () { DR.toast('REBA borrado.'); EVAL.recargar(); })
      .catch(function (e) { DR.toast(e.message, 'error'); });
  };
};
