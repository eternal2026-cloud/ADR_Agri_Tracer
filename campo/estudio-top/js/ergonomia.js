/* ============================================================================
 * ergonomia.js — HOJA «CHECK LIST ERGONOMIA» (entrevista al cosechador TOP)
 * SI / NO / NS-NC por pregunta. En «Síntomas debidos a la postura» se muestra
 * el diagrama corporal de la hoja y, si hay dolor, cuándo aparece.
 * ==========================================================================*/
var ERGO = { resp: {}, dolor: {} };

ERGO.clave = function () { return 'ergo.' + EVAL.ev.id; };

ERGO.pintar = function (cont) {
  var g = EVAL.d.ergo || {}, b = TOP.leer(ERGO.clave(), null);
  ERGO.resp = JSON.parse(JSON.stringify((b || g).respuestas || {}));
  ERGO.dolor = JSON.parse(JSON.stringify((b || g).dolor || {}));
  // Un borrador viejo puede traer preguntas de secciones retiradas (4 a 7): no se suben.
  Object.keys(ERGO.resp).forEach(function (c) { if (!ERGO.malo(c)) delete ERGO.resp[c]; });
  ERGO.sucio = !!b;
  var edita = TOP.puedeEditar(EVAL.ev), dis = edita ? '' : ' disabled';
  var h = '<div class="aviso entra" style="margin-bottom:14px"><b>1 vez por día.</b> Pregunta al cosechador y marca su respuesta. <b>NS</b> = no sabe / no contesta.</div>';
  TOP.ERGO.forEach(function (s, i) {
    h += '<section class="panel entra"><div class="panel-cab"><h2>' + DR.esc(s.t) + '</h2><span class="pill gris" data-ergo-conteo="' + i + '"></span></div>' +
      (s.nota ? '<div class="sub">' + DR.esc(s.nota) + '</div>' : '') +
      (s.dolor ? '<div class="top-fig-marco claro"><img class="top-fig" src="img/ergonomia-cuerpo.jpg" alt="Diagrama corporal con las zonas de dolor numeradas" loading="lazy"></div>' : '') +
      '<div class="top-ergo">' + s.items.map(function (it) {
        var v = ERGO.resp[it[0]];
        return '<div class="top-ergo-item" data-preg="' + it[0] + '"><div class="top-ergo-txt"><span>' + it[0] + '</span>' + DR.esc(it[1]) + '</div>' +
          '<div class="top-ergo-btns">' + [['SI', 'Sí'], ['NO', 'No'], ['NS', 'NS']].map(function (o) {
            return '<button type="button" class="top-ergo-btn' + (v === o[0] ? ' activo' : '') + (v === o[0] && o[0] === it[2] ? ' malo' : '') + '" data-r="' + o[0] + '"' + dis + '>' + o[1] + '</button>';
          }).join('') + '</div>' +
          (s.dolor ? '<div class="top-momentos' + (v === 'SI' ? '' : ' oculto') + '">' + TOP.MOMENTOS.map(function (m) {
            var on = (ERGO.dolor[it[0]] || []).indexOf(m[0]) > -1;
            return '<button type="button" class="opcion' + (on ? ' activa' : '') + '" data-m="' + m[0] + '"' + dis + '>' + m[1] + '</button>';
          }).join('') + '</div>' : '') + '</div>';
      }).join('') + '</div></section>';
  });
  h += '<div id="ergoBarra"></div>';
  cont.innerHTML = h;
  DR.entrarPaneles('#' + cont.id);

  DR.$$('[data-preg]', cont).forEach(function (el) {
    var c = el.getAttribute('data-preg'), malo = ERGO.malo(c);
    DR.$$('[data-r]', el).forEach(function (bt) {
      bt.onclick = function () {
        var v = this.getAttribute('data-r');
        ERGO.resp[c] = ERGO.resp[c] === v ? undefined : v;
        if (ERGO.resp[c] === undefined) delete ERGO.resp[c];
        DR.$$('[data-r]', el).forEach(function (o) {
          var on = o.getAttribute('data-r') === ERGO.resp[c];
          o.classList.toggle('activo', on);
          o.classList.toggle('malo', on && ERGO.resp[c] === malo);
        });
        var mom = DR.$('.top-momentos', el);
        if (mom) mom.classList.toggle('oculto', ERGO.resp[c] !== 'SI');
        if (ERGO.resp[c] !== 'SI') delete ERGO.dolor[c];
        DR.vibrar(12); ERGO.cambio();
      };
    });
    DR.$$('[data-m]', el).forEach(function (bt) {
      bt.onclick = function () {
        var m = Number(this.getAttribute('data-m')), l = ERGO.dolor[c] = ERGO.dolor[c] || [], i = l.indexOf(m);
        if (i > -1) l.splice(i, 1); else l.push(m);
        this.classList.toggle('activa', i < 0);
        ERGO.cambio();
      };
    });
  });
  ERGO.barra();
};

ERGO.malo = function (c) {
  var r = null;
  TOP.ERGO.forEach(function (s) { s.items.forEach(function (it) { if (it[0] === c) r = it[2]; }); });
  return r;
};

ERGO.cambio = function () {
  TOP.escribir(ERGO.clave(), { respuestas: ERGO.resp, dolor: ERGO.dolor });
  ERGO.sucio = true;
  ERGO.barra();
};

ERGO.barra = function () {
  TOP.ERGO.forEach(function (s, i) {
    var n = s.items.filter(function (it) { return ERGO.resp[it[0]]; }).length, p = DR.$('[data-ergo-conteo="' + i + '"]');
    if (p) { p.textContent = n + '/' + s.items.length; p.className = 'pill ' + (n === s.items.length ? 'verde' : 'gris'); }
  });
  var b = DR.$('#ergoBarra');
  if (!b || !TOP.puedeEditar(EVAL.ev)) return;
  var n = Object.keys(ERGO.resp).length;
  b.innerHTML = '<div class="top-guardar"><span>' + n + ' de ' + TOP.ergoTotal() + ' respuestas' + (ERGO.sucio ? ' · <b>sin guardar</b>' : ' · guardado') + '</span>' +
    '<button type="button" class="btn verde" id="btnGuardarErgo"' + (ERGO.sucio ? '' : ' disabled') + '>Guardar checklist</button></div>';
  DR.$('#btnGuardarErgo').onclick = function () {
    var btn = this;
    btn.classList.add('cargando');
    AT.rpc('rpc_top_guardar_ergonomia', { p_eval: EVAL.ev.id, p_respuestas: ERGO.resp, p_dolor: ERGO.dolor }).then(function () {
      TOP.escribir(ERGO.clave(), null);
      ERGO.sucio = false;
      DR.toast('Checklist ergonómico guardado.');
      DR.sonar(true);
      EVAL.recargar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message + ' El borrador queda en el celular.', 'error'); });
  };
};
