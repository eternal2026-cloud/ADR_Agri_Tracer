/* ============================================================================
 * encuesta.js — ENCUESTA AL COSECHADOR · FACTORES DE RENDIMIENTO
 * (ENCUESTA_FACTORES_RENDIMIENTO_COSECHA_ARANDANO.xlsx). Una por evaluación, es
 * decir, una por cosechador y día. Máx. 5 minutos: casi todo con toques; en las
 * abiertas se anotan palabras clave (el dictado del teclado del celular sirve).
 * Fecha, código (DNI), fundo/lote y variedad salen de la evaluación.
 * ==========================================================================*/
var ENC = { r: {}, acepto: true };

ENC.OP = {
  presentaciones: [['GRANEL', 'Granel'], ['JARRA', 'Jarra'], ['AMBAS', 'Ambas']],
  momento: [['ALMUERZO', 'Almuerzo'], ['FIN', 'Fin de jornada'], ['OTRO', 'Otro']],
  p1: [['<1', 'Menos de 1 campaña'], ['1-2', '1 a 2 campañas'], ['3-5', '3 a 5 campañas'], ['>5', 'Más de 5 campañas']],
  p3: [['SI', 'Sí'], ['PARTE', 'En parte'], ['NO', 'No']],
  p4: [['GRANEL', 'Granel'], ['JARRA', 'Jarra'], ['IGUAL', 'Igual en ambas'], ['NA', 'No aplica (solo trabaja una)']],
  p6: [[1, 'Esperar envases o bandejas'], [2, 'Traslados'], [3, 'Uso del tamiz'], [4, 'Calidad de la planta'],
    [5, 'Calibre o estado de la fruta'], [6, 'Indicaciones del supervisor'], [7, 'Calor'], [8, 'Otro']],
  p8: [['CAPACITACION', 'Capacitación de la empresa'], ['COMPANERO', 'Un compañero'], ['CUENTA', 'Por mi cuenta'], ['OTRA', 'Otra campaña o empresa']]
};
ENC.BLOQUES = [
  { t: 'Experiencia', p: [{ n: 1, k: 'p1', t: '¿Cuántas campañas lleva cosechando arándano?', tipo: 'una' }] },
  { t: 'Método de trabajo', p: [
    { n: 2, k: 'p2', t: 'Cuénteme cómo trabaja una planta: por dónde empieza y cómo avanza.', tipo: 'texto', ej: 'Ej. empieza abajo, rodea la planta, termina adentro' },
    { n: 3, k: 'p3', t: '¿Hace algo distinto a lo que le enseñaron en la capacitación?', tipo: 'una', sigue: { si: ['SI', 'PARTE'], k: 'p3_que', t: '¿En qué?' } }] },
  { t: 'Presentación', p: [
    { n: 4, k: 'p4', t: '¿En cuál presentación siente que rinde más?', tipo: 'una' },
    { n: 5, k: 'p5', t: '¿Qué le facilita o le complica cada una?', tipo: 'dos', campos: [['p5_granel', 'Granel'], ['p5_jarra', 'Jarra']] }] },
  { t: 'Tiempo perdido', p: [
    { n: 6, k: 'p6', t: 'De esta lista, ¿cuáles 3 le quitan más tiempo? Toca en orden de importancia.', tipo: 'orden' },
    { n: 7, k: 'p7', t: 'Cuando pasa eso, ¿cómo lo resuelve usted?', tipo: 'texto' }] },
  { t: 'Aprendizaje', p: [{ n: 8, k: 'p8', t: '¿Cómo aprendió a cosechar como lo hace hoy?', tipo: 'una' }] },
  { t: 'Trucos y mejoras', p: [
    { n: 9, k: 'p9', t: '¿Qué costumbre o truco suyo le ayuda a cosechar más rápido o con menos esfuerzo, cuidando la fruta?', tipo: 'texto' },
    { n: 10, k: 'p10', t: 'Si pudiera cambiar una cosa del puesto, la herramienta o el instructivo, ¿qué sería?', tipo: 'texto' }] }
];
ENC.etiqueta = function (k, v) {
  var o = (ENC.OP[k] || []).filter(function (x) { return String(x[0]) === String(v); })[0];
  return o ? o[1] : (v || '');
};

ENC.clave = function () { return 'enc.' + EVAL.ev.id; };

ENC.pintar = function (cont) {
  var g = EVAL.d.enc, b = TOP.leer(ENC.clave(), null), ev = EVAL.ev;
  var base = b || (g ? { acepto: g.acepto, r: g.respuestas } : null);
  ENC.r = JSON.parse(JSON.stringify((base && base.r) || {}));
  ENC.acepto = base ? base.acepto !== false : true;
  ENC.sucio = !!b;
  // La presentación sale del material de la evaluación (se puede cambiar a «Ambas»).
  if (!ENC.r.presentaciones) ENC.r.presentaciones = TOP.familia(ev.material || ev.presentacion) === 'JARRA' ? 'JARRA' : 'GRANEL';
  ENC.edita = TOP.puedeEditar(ev);
  ENC.dibujar(cont);
};

ENC.dibujar = function (cont) {
  var ev = EVAL.ev, r = ENC.r, dis = ENC.edita ? '' : ' disabled', scroll = DR.$('#contenido').scrollTop;
  var chips = function (k, extra) {
    return '<div class="opciones top-enc-ops">' + ENC.OP[k].map(function (o) {
      return '<button type="button" class="opcion' + (String(r[k]) === String(o[0]) ? ' activa' : '') + '" data-enc="' + k + '" data-v="' + DR.esc(o[0]) + '"' + dis + '>' + DR.esc(o[1]) + '</button>';
    }).join('') + '</div>' + (extra || '');
  };
  var texto = function (k, ph) {
    return '<textarea class="top-enc-txt" data-enc-txt="' + k + '" rows="2" placeholder="' + DR.esc(ph || 'Palabras clave…') + '"' + dis + '>' + DR.esc(r[k]) + '</textarea>';
  };
  var h = '<section class="panel entra top-enc-cab"><div class="top-enc-datos">' +
      '<span><small>Fecha</small>' + TOP.fecha(ev.fecha) + '</span><span><small>Código</small>' + DR.esc(ev.dni || ev.codigo) + '</span>' +
      '<span><small>Fundo / lote</small>' + DR.esc([ev.fundo, ev.lote].filter(Boolean).join(' / ') || '—') + '</span><span><small>Variedad</small>' + DR.esc(ev.variedad || '—') + '</span></div>' +
      '<div class="ayuda-campo" style="margin:8px 0 0"><b>1 vez por día</b> por cosechador.</div>' +
      '<div class="top-enc-intro">«Estamos estudiando cómo se trabaja mejor la cosecha para mejorar los instructivos y las herramientas. ' +
      'No es una evaluación y no hay respuestas buenas o malas.»</div>' +
      '<div class="top-enc-fila"><b>¿Aceptó responder?</b><div class="opciones">' +
      '<button type="button" class="opcion' + (ENC.acepto ? ' activa' : '') + '" data-acepto="1"' + dis + '>Sí</button>' +
      '<button type="button" class="opcion' + (!ENC.acepto ? ' activa' : '') + '" data-acepto="0"' + dis + ' style="--c:var(--dr-naranja)">No</button></div></div>';
  if (!ENC.acepto) {
    h += '<div class="aviso alerta" style="margin-top:12px">El cosechador no aceptó: se guarda solo eso y se cierra la encuesta.</div></section>';
  } else {
    h += '<div class="top-enc-fila"><b>Presentación(es) que trabaja</b>' + chips('presentaciones') + '</div>' +
      '<div class="top-enc-fila"><b>Momento de aplicación</b>' + chips('momento', r.momento === 'OTRO' ? '<input data-enc-txt="momento_otro" maxlength="60" placeholder="¿Cuál?" value="' + DR.esc(r.momento_otro) + '"' + dis + ' style="margin-top:8px">' : '') + '</div></section>';
    ENC.BLOQUES.forEach(function (bl) {
      h += '<section class="panel entra"><div class="top-enc-bloque">' + DR.esc(bl.t) + '</div>' + bl.p.map(function (p) {
        var cuerpo = '';
        if (p.tipo === 'una') cuerpo = chips(p.k, p.sigue && p.sigue.si.indexOf(r[p.k]) > -1 ? '<label class="top-enc-sub">' + p.sigue.t + '</label>' + texto(p.sigue.k) : '');
        else if (p.tipo === 'texto') cuerpo = texto(p.k, p.ej);
        else if (p.tipo === 'dos') cuerpo = p.campos.map(function (c) { return '<label class="top-enc-sub">' + c[1] + '</label>' + texto(c[0]); }).join('');
        else if (p.tipo === 'orden') {
          var orden = r.p6 || [];
          cuerpo = '<div class="top-enc-orden">' + ENC.OP.p6.map(function (o) {
            var i = orden.indexOf(o[0]);
            return '<button type="button" class="top-enc-factor' + (i > -1 ? ' activo' : '') + '" data-factor="' + o[0] + '"' + dis + '>' +
              '<span class="top-enc-rango">' + (i > -1 ? (i + 1) + 'º' : o[0]) + '</span>' + DR.esc(o[1]) + '</button>';
          }).join('') + '</div>' + (orden.indexOf(8) > -1 ? '<input data-enc-txt="p6_otro" maxlength="80" placeholder="Otro: ¿cuál?" value="' + DR.esc(r.p6_otro) + '"' + dis + ' style="margin-top:8px">' : '');
        }
        return '<div class="top-enc-preg"><div class="top-enc-q"><span>' + p.n + '</span>' + DR.esc(p.t) + '</div>' + cuerpo + '</div>';
      }).join('') + '</section>';
    });
    h += '<section class="panel entra"><div class="top-enc-bloque">Observaciones del auxiliar</div>' + texto('obs', 'Opcional') + '</section>';
  }
  h += '<div id="encBarra"></div>';
  cont.innerHTML = h;
  if (ENC._dibujado === ev.id) DR.$$('.entra', cont).forEach(function (n) { n.style.opacity = 1; n.style.transform = 'none'; });
  else DR.entrarPaneles('#' + cont.id);
  ENC._dibujado = ev.id;
  DR.$('#contenido').scrollTop = scroll;

  DR.$$('[data-acepto]', cont).forEach(function (b) {
    b.onclick = function () { ENC.acepto = b.getAttribute('data-acepto') === '1'; ENC.cambio(); ENC.dibujar(cont); };
  });
  DR.$$('[data-enc]', cont).forEach(function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-enc'), v = b.getAttribute('data-v');
      r[k] = String(r[k]) === v ? undefined : v;
      if (r[k] === undefined) delete r[k];
      DR.vibrar(12); ENC.cambio(); ENC.dibujar(cont);
    };
  });
  DR.$$('[data-factor]', cont).forEach(function (b) {
    b.onclick = function () {
      var f = Number(b.getAttribute('data-factor')), l = r.p6 = r.p6 || [], i = l.indexOf(f);
      if (i > -1) l.splice(i, 1);
      else if (l.length >= 3) { DR.toast('Ya hay 3 elegidos: toca uno para quitarlo.', 'info'); return; }
      else l.push(f);
      DR.vibrar(12); ENC.cambio(); ENC.dibujar(cont);
    };
  });
  DR.$$('[data-enc-txt]', cont).forEach(function (t) {
    t.oninput = function () { r[t.getAttribute('data-enc-txt')] = t.value; ENC.cambio(true); };
  });
  ENC.barra();
};

ENC.respondidas = function () {
  var r = ENC.r, n = 0;
  ['p1', 'p2', 'p3', 'p4', 'p7', 'p8', 'p9', 'p10'].forEach(function (k) { if (r[k] && String(r[k]).trim()) n++; });
  if ((r.p5_granel || '').trim() || (r.p5_jarra || '').trim()) n++;
  if (r.p6 && r.p6.length) n++;
  return n;
};

ENC.cambio = function (soloBarra) {
  TOP.escribir(ENC.clave(), { acepto: ENC.acepto, r: ENC.r });
  ENC.sucio = true;
  if (soloBarra) ENC.barra();
};

ENC.barra = function () {
  var b = DR.$('#encBarra');
  if (!b || !ENC.edita) return;
  b.innerHTML = '<div class="top-guardar"><span>' + (ENC.acepto ? ENC.respondidas() + ' de 10 preguntas' : 'No aceptó responder') +
    (ENC.sucio ? ' · <b>sin guardar</b>' : ' · guardado') + '</span>' +
    '<button type="button" class="btn verde" id="btnGuardarEnc"' + (ENC.sucio ? '' : ' disabled') + '>Guardar encuesta</button></div>';
  DR.$('#btnGuardarEnc').onclick = function () {
    var btn = this, r = {};
    // Solo respuestas con contenido; los textos se recortan.
    Object.keys(ENC.r).forEach(function (k) {
      var v = ENC.r[k];
      if (typeof v === 'string') v = v.trim();
      if (v !== '' && v !== undefined && !(Array.isArray(v) && !v.length)) r[k] = v;
    });
    btn.classList.add('cargando');
    AT.rpc('rpc_top_guardar_encuesta', { p_eval: EVAL.ev.id, p: { acepto: ENC.acepto, respuestas: ENC.acepto ? r : {} } }).then(function () {
      TOP.escribir(ENC.clave(), null);
      ENC.sucio = false;
      DR.toast('Encuesta guardada.');
      DR.sonar(true);
      EVAL.recargar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message + ' El borrador queda en el celular.', 'error'); });
  };
};
