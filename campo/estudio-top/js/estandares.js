/* ============================================================================
 * estandares.js — CHECKLIST DE ESTÁNDARES (INSTRUCTIVO · LUP · FORMATO)
 * Por ítem: Cumple / No cumple / No aplica, observación, «cómo lo hace el TOP»
 * (el estándar descubierto que alimenta la Propuesta) y hasta 3 fotos.
 * Cada toque queda en un borrador local; «Guardar» sube fotos y respuestas.
 * ==========================================================================*/
var EST = { estado: {}, abierto: null };

EST.TIPOS = [
  { k: 'INSTRUCTIVO', t: 'Instructivo', d: 'Pasos del instructivo de cosecha' },
  { k: 'LUP', t: 'LUP · Guía para la cosecha', d: 'Lección de un punto' },
  { k: 'FORMATO', t: 'Formato · Puesto de trabajo', d: 'Herramientas, materiales y prohibiciones' }
];
EST.RES = [{ v: 'C', t: 'Cumple', c: 'verde' }, { v: 'NC', t: 'No cumple', c: 'rojo' }, { v: 'NA', t: 'No aplica', c: 'gris' }];

EST.claveBorrador = function () { return 'est.' + EVAL.ev.id; };

/** Estado inicial: lo guardado en Supabase y, encima, el borrador local sin subir. */
EST.preparar = function () {
  var e = {};
  EVAL.d.cump.forEach(function (c) {
    e[c.item_id] = { resultado: c.resultado, observacion: c.observacion || '', practica_top: c.practica_top || '',
      fotos: (c.fotos || []).map(function (r) { return { ruta: r }; }) };
  });
  var b = TOP.leer(EST.claveBorrador(), null);
  if (b) Object.keys(b).forEach(function (k) {
    var g = e[k] || { fotos: [] };
    e[k] = { resultado: b[k].resultado, observacion: b[k].observacion, practica_top: b[k].practica_top, fotos: g.fotos };
  });
  EST.estado = e;
  EST.sucio = !!b;
};
EST.guardarBorrador = function () {
  var b = {};
  Object.keys(EST.estado).forEach(function (k) {
    var x = EST.estado[k];
    b[k] = { resultado: x.resultado || null, observacion: x.observacion || '', practica_top: x.practica_top || '' };
  });
  TOP.escribir(EST.claveBorrador(), b);
  EST.sucio = true;
  EST.pintarBarra();
};

EST.pintar = function (cont) {
  EST.preparar();
  EST.render(cont);
};

/** Dibuja la lista con el estado actual (sin volver a leerlo): al abrir/cerrar un ítem se conserva el scroll. */
EST.render = function (cont) {
  var scroll = DR.$('#contenido').scrollTop;
  var edita = TOP.puedeEditar(EVAL.ev), items = TOP.itemsDe(EVAL.ev.presentacion);
  var h = '<div class="aviso entra" style="margin-bottom:14px">Presentación <b>' + DR.esc(EVAL.ev.presentacion) + '</b>. Si el TOP lo hace distinto, ' +
    'anota <b>cómo lo hace</b>: esa práctica sustenta la actualización del estándar.</div>';
  EST.TIPOS.forEach(function (tp) {
    var lista = items.filter(function (i) { return i.tipo === tp.k; });
    if (!lista.length) return;
    h += '<section class="panel entra"><div class="panel-cab"><div><h2>' + DR.esc(tp.t) + '</h2><div class="sub">' + DR.esc(lista[0].estandar) + '</div></div>' +
      '<span class="pill gris" data-conteo="' + tp.k + '"></span></div><div class="top-items">' +
      lista.map(function (it) { return EST.itemHtml(it, edita); }).join('') + '</div></section>';
  });
  h += '<div id="estBarra"></div>';
  cont.innerHTML = h;
  if (EST._dibujado === EVAL.ev.id) DR.$$('.entra', cont).forEach(function (n) { n.style.opacity = 1; n.style.transform = 'none'; });
  else DR.entrarPaneles('#' + cont.id);
  EST._dibujado = EVAL.ev.id;
  EST.enlazar(cont, edita);
  FOTOS.pintar(cont);
  EST.pintarBarra();
  DR.$('#contenido').scrollTop = scroll;
};

EST.itemHtml = function (it, edita) {
  var x = EST.estado[it.id] || {}, abierto = EST.abierto === it.id;
  var tieneNota = x.observacion || x.practica_top || (x.fotos && x.fotos.length);
  return '<div class="top-item' + (x.resultado ? ' r-' + x.resultado : '') + '" data-item="' + it.id + '">' +
    '<div class="top-item-fila"><span class="top-item-num">' + DR.esc(it.numero || '•') + '</span>' +
    '<span class="top-item-txt">' + DR.esc(it.descripcion) + '</span></div>' +
    '<div class="top-res">' + EST.RES.map(function (r) {
      return '<button type="button" class="top-res-btn ' + r.c + (x.resultado === r.v ? ' activo' : '') + '" data-res="' + r.v + '"' + (edita ? '' : ' disabled') + '>' + r.t + '</button>';
    }).join('') +
    '<button type="button" class="top-res-mas' + (tieneNota ? ' con' : '') + '" data-abrir="' + it.id + '" aria-label="Observación, práctica TOP y fotos">' +
    (tieneNota ? '✎' : '+') + '</button></div>' +
    (abierto ? '<div class="top-item-det form">' +
      '<div class="campo ancho"><label>Cómo lo hace el TOP <em>estándar descubierto</em></label><textarea data-det="practica_top" rows="2"' + (edita ? '' : ' disabled') +
        ' placeholder="Ej. coge 4 bayas por mano y las deja en la jarra sin girarla…">' + DR.esc(x.practica_top) + '</textarea></div>' +
      '<div class="campo ancho"><label>Observación</label><textarea data-det="observacion" rows="2"' + (edita ? '' : ' disabled') + '>' + DR.esc(x.observacion) + '</textarea></div>' +
      '<div class="campo ancho"><label>Evidencia</label>' + (edita ? FOTOS.campoMultiHtml('fotoItem' + it.id, 'Agregar foto', 'Hasta 3', 3) : FOTOS.galeriaHtml((x.fotos || []).map(function (f) { return f.ruta; })) || '<span class="ayuda-campo">Sin fotos.</span>') + '</div>' +
    '</div>' : '') + '</div>';
};

EST.enlazar = function (cont, edita) {
  DR.$$('[data-item]', cont).forEach(function (el) {
    var id = Number(el.getAttribute('data-item'));
    DR.$$('[data-res]', el).forEach(function (b) {
      b.onclick = function () {
        var x = EST.estado[id] = EST.estado[id] || { fotos: [] }, v = this.getAttribute('data-res');
        x.resultado = x.resultado === v ? null : v;
        DR.vibrar(15);
        DR.$$('[data-res]', el).forEach(function (o) { o.classList.toggle('activo', o.getAttribute('data-res') === x.resultado); });
        el.className = 'top-item' + (x.resultado ? ' r-' + x.resultado : '');
        // «No cumple» abre el detalle: es justo lo que interesa documentar.
        EST.guardarBorrador();
        if (x.resultado === 'NC' && EST.abierto !== id) { EST.abierto = id; EST.render(DR.$('#seccion')); }
      };
    });
    var mas = DR.$('[data-abrir]', el);
    if (mas) mas.onclick = function () { EST.abierto = EST.abierto === id ? null : id; EST.render(DR.$('#seccion')); };
    EST.enlazarDetalle(el, id, edita);
  });
};


EST.enlazarDetalle = function (el, id, edita) {
  DR.$$('[data-det]', el).forEach(function (t) {
    t.oninput = function () {
      var x = EST.estado[id] = EST.estado[id] || { fotos: [] };
      x[this.getAttribute('data-det')] = this.value;
      EST.guardarBorrador();
    };
  });
  if (edita && DR.$('#fotoItem' + id, el)) {
    var x = EST.estado[id] = EST.estado[id] || { fotos: [] };
    x.fotos = x.fotos || [];
    FOTOS.enlazarLista('fotoItem' + id, x.fotos, 3, function () { EST.sucio = true; EST.fotosNuevas = true; EST.pintarBarra(); });
  }
};

EST.pintarBarra = function () {
  var items = TOP.itemsDe(EVAL.ev.presentacion), resp = items.filter(function (i) { return EST.estado[i.id] && EST.estado[i.id].resultado; }).length;
  EST.TIPOS.forEach(function (tp) {
    var l = items.filter(function (i) { return i.tipo === tp.k; }), n = l.filter(function (i) { return EST.estado[i.id] && EST.estado[i.id].resultado; }).length;
    var p = DR.$('[data-conteo="' + tp.k + '"]');
    if (p) { p.textContent = n + '/' + l.length; p.className = 'pill ' + (n === l.length ? 'verde' : 'gris'); }
  });
  var b = DR.$('#estBarra');
  if (!b || !TOP.puedeEditar(EVAL.ev)) return;
  b.innerHTML = '<div class="top-guardar"><span>' + resp + ' de ' + items.length + ' ítems marcados' + (EST.sucio ? ' · <b>sin guardar</b>' : ' · guardado') + '</span>' +
    '<button type="button" class="btn verde" id="btnGuardarEst"' + (EST.sucio ? '' : ' disabled') + '>Guardar estándares</button></div>';
  DR.$('#btnGuardarEst').onclick = EST.guardar;
};

EST.guardar = function () {
  var btn = DR.$('#btnGuardarEst'), ev = EVAL.ev;
  btn.classList.add('cargando');
  btn.textContent = 'Guardando…';
  var ids = Object.keys(EST.estado);
  Promise.all(ids.map(function (k) {
    var x = EST.estado[k];
    return FOTOS.subirLista(x.fotos || [], 'eval/' + ev.id + '/item-' + k).then(function (rutas) {
      return { item_id: Number(k), resultado: x.resultado || null, observacion: x.observacion || '', practica_top: x.practica_top || '', fotos: rutas };
    });
  })).then(function (filas) {
    filas = filas.filter(function (f) { return f.resultado || f.observacion || f.practica_top || f.fotos.length; });
    return AT.rpc('rpc_top_guardar_cumplimiento', { p_eval: ev.id, p_items: filas });
  }).then(function () {
    TOP.escribir(EST.claveBorrador(), null);
    EST.sucio = false;
    DR.toast('Estándares guardados.');
    DR.sonar(true);
    EVAL.recargar();
  }).catch(function (e) {
    btn.classList.remove('cargando');
    btn.textContent = 'Guardar estándares';
    DR.toast(e.message + ' El borrador queda en el celular.', 'error');
  });
};
