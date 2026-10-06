/* ============================================================================
 * panel-fotos.js — PANEL LATERAL DE EVIDENCIA MIENTRAS SE PUNTÚA UNA ZONA
 * En el checklist (y en el resumen de la zona) aparece una pestaña «Fotos» en el
 * borde derecho. Abre un panel con las observaciones de la zona o de toda el
 * área y sus fotos Antes / Después, para puntuar con la evidencia a la vista.
 * Desde el panel se agregan fotos «Antes» a una observación ya registrada
 * (rpc_s5_obs_actualizar, sin plazo: solo suma evidencia) o se registra una nueva.
 * «Cargar pendientes de una auditoría pasada» (obs-pasadas.js) sube el Excel manual.
 * En pantallas anchas el panel no tapa el checklist: se puede puntuar con él abierto.
 * ==========================================================================*/
var PFOT = { abierto: false, alcance: 'zona', subiendo: {} };

PFOT.deZona = function (o) { return AUD.zona && o.zona_id === AUD.zona.id; };

/** Primero la zona actual, luego las abiertas y las más recientes. */
PFOT.lista = function () {
  if (!AUD.aud || !AUD.zona) return [];
  var abierta = function (o) { return S5.ABIERTOS.indexOf(o.estado) > -1 ? 0 : 1; };
  return AUD.obsArea.filter(function (o) { return PFOT.alcance === 'area' || PFOT.deZona(o); }).slice().sort(function (x, y) {
    return (PFOT.deZona(x) ? 0 : 1) - (PFOT.deZona(y) ? 0 : 1) || abierta(x) - abierta(y) ||
      String(y.fecha_registro).localeCompare(String(x.fecha_registro)) || y.numero - x.numero;
  });
};

PFOT.ponerPestana = function () {
  if (!AUD.aud || !AUD.zona) return;
  var b = DR.$('#pfTab');
  if (!b) {
    b = document.createElement('button');
    b.id = 'pfTab';
    b.type = 'button';
    b.className = 'pf-tab';
    b.setAttribute('aria-label', 'Ver fotos de las observaciones del área');
    b.onclick = PFOT.abrir;
    document.body.appendChild(b);
    if (DR.anima) anime({ targets: b, translateX: [60, 0], opacity: [0, 1], duration: 450, easing: 'easeOutCubic' });
  }
  var n = AUD.obsArea.filter(PFOT.deZona).reduce(function (t, o) { return t + S5.fotosDe(o, 'antes').length + S5.fotosDe(o, 'despues').length; }, 0);
  b.innerHTML = FOTOS.ICONO + '<span>Fotos</span>' + (n ? '<i>' + n + '</i>' : '');
};

PFOT.quitar = function () {
  ['#pfTab', '#panelFotos'].forEach(function (s) { var el = DR.$(s); if (el) el.remove(); });
  PFOT.abierto = false;
};

PFOT.abrir = function () {
  var p = DR.$('#panelFotos');
  if (!p) {
    p = document.createElement('aside');
    p.id = 'panelFotos';
    p.setAttribute('aria-label', 'Fotos de observaciones');
    p.innerHTML = '<div class="pf-velo"></div><div class="pf-cuerpo" id="pfCuerpo"></div>';
    document.body.appendChild(p);
    DR.$('.pf-velo', p).onclick = PFOT.cerrar;
  }
  p.classList.remove('oculto');
  PFOT.abierto = true;
  PFOT.pintar();
  if (DR.anima) {
    anime.remove('#pfCuerpo');
    anime({ targets: '#pfCuerpo', translateX: ['100%', '0%'], duration: 420, easing: 'easeOutCubic' });
    anime({ targets: '#panelFotos .pf-velo', opacity: [0, 1], duration: 250, easing: 'linear' });
  }
};

PFOT.cerrar = function () {
  var p = DR.$('#panelFotos');
  PFOT.abierto = false;
  if (!p) return;
  if (!DR.anima) { p.classList.add('oculto'); return; }
  anime({ targets: '#pfCuerpo', translateX: '100%', duration: 280, easing: 'easeInCubic', complete: function () { p.classList.add('oculto'); } });
};

/** Vuelve a pintar el panel (si está abierto) y la pestaña tras un cambio en las observaciones. */
PFOT.refrescar = function () {
  if (!DR.$('#pfTab')) return;
  PFOT.ponerPestana();
  if (PFOT.abierto) PFOT.pintar();
};

PFOT.pintar = function () {
  var c = DR.$('#pfCuerpo');
  if (!c || !AUD.zona) return;
  var lista = PFOT.lista(), area = S5.area(AUD.aud.area_id) || {};
  var nZona = AUD.obsArea.filter(PFOT.deZona).length, nArea = AUD.obsArea.length;
  var puede = AT.puedeCapturar() && AUD.aud.estado !== 'anulada';

  c.innerHTML =
    '<div class="pf-cab"><div><span class="pf-ruta">Evidencia para puntuar · ' + DR.esc(area.nombre || '') + '</span>' +
      '<b>' + DR.esc(S5.nombreZona(AUD.zona)) + '</b></div>' +
      '<button type="button" class="pf-cerrar" id="pfCerrar" aria-label="Cerrar panel">✕</button></div>' +
    '<div class="vista-toggle pf-alcance" role="tablist">' +
      '<button type="button" data-alc="zona"' + (PFOT.alcance === 'zona' ? ' class="activo"' : '') + '>Esta zona · ' + nZona + '</button>' +
      '<button type="button" data-alc="area"' + (PFOT.alcance === 'area' ? ' class="activo"' : '') + '>Toda el área · ' + nArea + '</button></div>' +
    (puede ? '<button type="button" class="btn verde chico pf-nueva" id="pfNueva">' + FOTOS.ICONO + '<span>Nueva observación con foto</span></button>' +
      '<button type="button" class="btn sec chico pf-nueva" id="pfPasada">' + DR.ICONOS.subir + '<span>Cargar pendientes de una auditoría pasada (Excel)</span></button>' : '') +
    '<div id="pfLista">' + (lista.length ? lista.map(function (o) { return PFOT.tarjeta(o, puede); }).join('')
      : '<div class="vacio">' + (PFOT.alcance === 'zona' ? 'Esta zona no tiene observaciones. Mira «Toda el área» o registra una nueva.' : 'El área aún no tiene observaciones.') + '</div>') + '</div>';

  FOTOS.pintar(c);
  DR.$('#pfCerrar').onclick = PFOT.cerrar;
  DR.$$('[data-alc]', c).forEach(function (b) {
    b.onclick = function () { PFOT.alcance = this.getAttribute('data-alc'); PFOT.pintar(); };
  });
  if (DR.$('#pfNueva')) DR.$('#pfNueva').onclick = AUD.nuevaObservacion;
  if (DR.$('#pfPasada')) DR.$('#pfPasada').onclick = OPAS.abrir;
  DR.$$('[data-subir] input', c).forEach(function (inp) {
    inp.onchange = function () {
      var id = this.closest('[data-subir]').getAttribute('data-subir');
      var o = AUD.obsArea.filter(function (x) { return x.id === id; })[0], archivos = Array.prototype.slice.call(this.files || []);
      this.value = '';
      if (o && archivos.length) PFOT.subir(o, archivos);
    };
  });
  DR.$$('[data-detalle]', c).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-detalle'), o = AUD.obsArea.filter(function (x) { return x.id === id; })[0];
      if (o) OBS.abrirDetalle(o, { alCambiar: PFOT.alCambiar });
    };
  });
};

PFOT.tarjeta = function (o, puede) {
  var antes = S5.fotosDe(o, 'antes'), despues = S5.fotosDe(o, 'despues'), z = S5.zona(o.zona_id);
  var subiendo = PFOT.subiendo[o.id], lleno = antes.length >= FOTOS.MAX;
  return '<article class="pf-obs" style="--c:' + (S5.COLOR_ESTADO[o.estado] || '#A89A8C') + '">' +
    '<div class="obs-top"><b>N° ' + o.numero + (PFOT.deZona(o) ? '' : ' · ' + DR.esc(S5.nombreZona(z))) +
      (o.s_referencia ? ' · ' + o.s_referencia + 'S' : '') + (o.importada ? ' · auditoría pasada' : '') + '</b>' + S5.pillEstado(o.estado) + '</div>' +
    '<button type="button" class="pf-texto" data-detalle="' + o.id + '">' + DR.esc(DR.recortar(o.descripcion, 200)) + '</button>' +
    '<div class="pf-fotos"><span class="pf-etq">Antes · ' + antes.length + '</span>' + (FOTOS.galeriaHtml(antes, 'foto-grupo pf') || '<em>Sin fotos</em>') + '</div>' +
    (despues.length ? '<div class="pf-fotos"><span class="pf-etq">Después · ' + despues.length + '</span>' + FOTOS.galeriaHtml(despues, 'foto-grupo pf') + '</div>' : '') +
    (puede ? (lleno ? '<div class="ayuda-campo">Ya tiene ' + FOTOS.MAX + ' fotos «Antes» (el máximo).</div>'
      : '<label class="btn sec chico pf-subir' + (subiendo ? ' cargando' : '') + '" data-subir="' + o.id + '">' +
        '<input type="file" accept="image/*" capture="environment" multiple>' + FOTOS.ICONO +
        '<span>' + (subiendo ? 'Subiendo fotos…' : 'Agregar fotos') + '</span></label>') : '') +
  '</article>';
};

/** Comprime, sube y agrega las fotos como «Antes» de la observación (hasta FOTOS.MAX). */
PFOT.subir = function (o, archivos) {
  var cupo = FOTOS.MAX - S5.fotosDe(o, 'antes').length;
  if (cupo <= 0) { DR.toast('La observación N° ' + o.numero + ' ya tiene ' + FOTOS.MAX + ' fotos.', 'error'); return; }
  if (archivos.length > cupo) DR.toast('Solo caben ' + cupo + ' foto(s) más: se suben las primeras.', 'info');
  archivos = archivos.slice(0, cupo);
  PFOT.subiendo[o.id] = true;
  PFOT.pintar();
  var base = 'obs/' + (S5.cultivoDeObs(o) || 0) + '/' + o.zona_id + '/' + o.id + '-antes-extra';
  Promise.all(archivos.map(function (a) { return FOTOS.comprimir(a); })).then(function (blobs) {
    return FOTOS.subirLista(blobs.map(function (b) { return { blob: b, ruta: null }; }), base);
  }).then(function (rutas) {
    return AT.rpc('rpc_s5_obs_actualizar', { p: { id: o.id, fotos_antes: rutas, origen: 'panel' } });
  }).then(function (n) {
    DR.vibrar(40);
    DR.sonar(true);
    DR.toast(archivos.length + ' foto(s) agregada(s) a la observación N° ' + n.numero + '.');
    PFOT.alCambiar(n);
  }).catch(function (e) {
    DR.toast('No se subieron las fotos: ' + e.message, 'error');
  }).then(function () {
    delete PFOT.subiendo[o.id];
    PFOT.refrescar();
  });
};

PFOT.alCambiar = function (n) {
  AUD.obsArea.forEach(function (o, i) { if (o.id === n.id) AUD.obsArea[i] = n; });
  if (OBS.lista.length) OBS.reemplazar(n);
  PFOT.refrescar();
};
