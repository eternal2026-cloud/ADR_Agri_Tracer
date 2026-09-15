/* ============================================================================
 * observaciones.js — HOJA «OBSERVACIONES» DEL EXCEL, CON SEGUIMIENTO
 * Registro libre por zona (foto «Antes» obligatoria), lista con filtros,
 * detalle con línea de tiempo y seguimiento: nuevo estado, nota, foto
 * «Después» y sobrescritura del puntaje en formato checklist, dentro del plazo
 * (S5_DIAS_CORRECCION) o por un administrador. Todo queda en s5_seguimientos.
 * ==========================================================================*/
var OBS = { filtros: { estado: 'abiertas', area: '', zona: '', auditoria: '' }, lista: [], auds: {}, form: null, seg: null, LIMITE: 150 };

VISTAS.observaciones = function (cont) {
  S5.cargar().then(OBS.cargar).then(function () { OBS.pintar(true); }).catch(function (e) { UI.error(cont, e); });
};

OBS.cargar = function () {
  return Promise.all([
    sb.from('s5_auditorias').select('id,codigo,area_id,numero_auditoria,tipo,fecha,estado,campana').order('fecha', { ascending: false }).limit(1000),
    sb.from('s5_observaciones').select('*').order('fecha_registro', { ascending: false }).order('numero', { ascending: false }).limit(2000)
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    if (r[1].error) throw new Error(r[1].error.message);
    OBS.auds = {};
    (r[0].data || []).forEach(function (a) { OBS.auds[a.id] = a; });
    OBS.lista = (r[1].data || []).filter(function (o) { var a = OBS.auds[o.auditoria_id]; return a && a.estado !== 'anulada'; });
  });
};

OBS.buscar = function (id) { return OBS.lista.filter(function (o) { return o.id === id; })[0] || null; };
OBS.audDe = function (o) { return o.s5_auditorias || OBS.auds[o.auditoria_id] || {}; };

OBS.reemplazar = function (o) {
  var i = OBS.lista.map(function (x) { return x.id; }).indexOf(o.id);
  if (i > -1) OBS.lista[i] = o; else OBS.lista.unshift(o);
  if (DR.vista === 'observaciones') OBS.pintar(false);
};

OBS.coincide = function (o, sinEstado) {
  var f = OBS.filtros, a = OBS.audDe(o);
  if (f.area && String(a.area_id) !== String(f.area)) return false;
  if (f.zona && String(o.zona_id) !== String(f.zona)) return false;
  if (f.auditoria && o.auditoria_id !== f.auditoria) return false;
  if (sinEstado || f.estado === 'todas') return true;
  if (f.estado === 'abiertas') return S5.ABIERTOS.indexOf(o.estado) > -1;
  return o.estado === f.estado;
};

/** Selección única en un grupo de .opcion; alElegir(valor). */
OBS.chips = function (sel, alElegir) {
  var grupo = DR.$(sel);
  if (!grupo) return;
  grupo.onclick = function (ev) {
    var b = ev.target.closest('.opcion');
    if (!b) return;
    DR.$$('.opcion', grupo).forEach(function (x) { x.classList.toggle('activa', x === b); });
    if (DR.anima) anime({ targets: b, scale: [0.9, 1], duration: 300, easing: 'easeOutBack' });
    alElegir(b.getAttribute('data-valor'));
  };
};

/** % por S con los ítems puntuados (misma fórmula que fn_s5_bd, aunque el catálogo haya cambiado). */
OBS.porS = function (puntajes) {
  var acc = {}, r = {}, pcts = [];
  Object.keys(puntajes).forEach(function (k) {
    var it = S5.item(k);
    if (!it || puntajes[k] === undefined || puntajes[k] === null) return;
    acc[it.s] = acc[it.s] || { suma: 0, n: 0 };
    acc[it.s].suma += Number(puntajes[k]);
    acc[it.s].n++;
  });
  for (var s = 1; s <= 5; s++) {
    r[s] = acc[s] ? acc[s].suma / (acc[s].n * 2) : null;
    if (r[s] !== null) pcts.push(r[s]);
  }
  r.total = pcts.length === 5 ? S5.promedio(pcts) : null;
  return r;
};

/* ============================================================ LISTA */
OBS.pintar = function (animar) {
  var cont = DR.$('#contenido'), f = OBS.filtros;
  if (DR.vista !== 'observaciones' || !cont) return;
  var base = OBS.lista.filter(function (o) { return OBS.coincide(o, true); });
  var visibles = base.filter(function (o) { return OBS.coincide(o); });
  var cuenta = function (fn) { return base.filter(fn).length; };
  var chips = [{ id: 'abiertas', t: 'Abiertas', n: cuenta(function (o) { return S5.ABIERTOS.indexOf(o.estado) > -1; }) }]
    .concat(S5.ESTADOS.map(function (e) { return { id: e, t: e, n: cuenta(function (o) { return o.estado === e; }) }; }))
    .concat([{ id: 'todas', t: 'Todas', n: base.length }]);
  var auds = Object.keys(OBS.auds).map(function (k) { return OBS.auds[k]; })
    .filter(function (a) { return a.estado !== 'anulada' && (!f.area || String(a.area_id) === String(f.area)); });
  var op = function (valor, texto, actual) {
    return '<option value="' + DR.esc(valor) + '"' + (String(valor) === String(actual) ? ' selected' : '') + '>' + DR.esc(texto) + '</option>';
  };

  cont.innerHTML = UI.encabezado('Auditoría 5S', 'Observaciones', 'Sustento de los puntajes. Registra el seguimiento de cada hallazgo y, si ya se levantó dentro del plazo, corrige el puntaje del checklist.') +
    '<div class="filtros5s entra">' +
      '<select id="fArea" aria-label="Área">' + op('', 'Todas las áreas', f.area) + S5.areas.map(function (a) { return op(a.id, a.nombre, f.area); }).join('') + '</select>' +
      '<select id="fZona" aria-label="Zona"' + (f.area ? '' : ' disabled') + '>' + op('', f.area ? 'Todas las zonas' : 'Zona: elige un área', f.zona) +
        (f.area ? S5.zonasDe(f.area, true).map(function (z) { return op(z.id, S5.nombreZona(z), f.zona); }).join('') : '') + '</select>' +
      '<select id="fAud" aria-label="Auditoría">' + op('', 'Todas las auditorías', f.auditoria) + auds.map(function (a) {
        return op(a.id, a.codigo + ' · ' + ((S5.area(a.area_id) || {}).nombre || '') + ' N° ' + a.numero_auditoria, f.auditoria);
      }).join('') + '</select>' +
    '</div>' +
    '<div class="chips entra">' + chips.map(function (c) {
      return '<button type="button" class="filtro' + (f.estado === c.id ? ' activo' : '') + '" data-estado="' + DR.esc(c.id) + '">' + DR.esc(c.t) + '<small>' + c.n + '</small></button>';
    }).join('') + '</div>' +
    '<div class="conteo">' + visibles.length + ' observación(es)' + (visibles.length > OBS.LIMITE ? ' · se muestran las ' + OBS.LIMITE + ' más recientes' : '') + '</div>' +
    '<div id="listaObs">' + (visibles.length ? visibles.slice(0, OBS.LIMITE).map(OBS.tarjetaHtml).join('')
      : '<div class="vacio">' + (OBS.lista.length ? 'Ninguna observación coincide con los filtros.' : 'Aún no hay observaciones. Se registran desde Auditar, dentro de cada zona.') + '</div>') + '</div>';

  if (animar) DR.entrarPaneles('#contenido');
  FOTOS.pintar('#listaObs');
  DR.$('#fArea').onchange = function () { f.area = this.value; f.zona = ''; f.auditoria = ''; OBS.pintar(false); };
  DR.$('#fZona').onchange = function () { f.zona = this.value; OBS.pintar(false); };
  DR.$('#fAud').onchange = function () { f.auditoria = this.value; OBS.pintar(false); };
  DR.$$('[data-estado]', cont).forEach(function (b) { b.onclick = function () { f.estado = this.getAttribute('data-estado'); OBS.pintar(false); }; });
  DR.$$('[data-obs]', cont).forEach(function (b) {
    b.onclick = function () { var o = OBS.buscar(this.getAttribute('data-obs')); if (o) OBS.abrirDetalle(o); };
  });
};

OBS.tarjetaHtml = function (o) {
  var a = OBS.audDe(o), z = S5.zona(o.zona_id), area = S5.area(a.area_id) || {};
  var abierta = S5.ABIERTOS.indexOf(o.estado) > -1;
  return '<button type="button" class="obs-card" data-obs="' + o.id + '" style="--c:' + (S5.COLOR_ESTADO[o.estado] || '#A89A8C') + '">' +
    '<img class="foto-mini" alt="" data-foto="' + DR.esc(o.foto_antes) + '">' +
    '<span class="obs-cuerpo"><span class="obs-top"><b>N° ' + o.numero + ' · ' + DR.esc(S5.nombreZona(z)) + '</b>' + S5.pillEstado(o.estado) + '</span>' +
    '<span class="obs-texto">' + DR.esc(DR.recortar(o.descripcion, 140)) + '</span>' +
    '<span class="obs-det">' + [area.nombre, a.codigo, S5.fecha(o.fecha_registro)].filter(Boolean).map(DR.esc).join(' · ') +
      (abierta ? ' · hace ' + S5.diasDesde(o.fecha_registro) + ' d' : '') + '</span></span></button>';
};

/** Hoja con una lista de observaciones (p. ej. abiertas de auditorías anteriores de una zona). */
OBS.hojaLista = function (titulo, lista, opc) {
  UI.abrirHoja('<div class="asa"></div><div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.alerta + '<span>' + DR.esc(titulo) + '</span></div>' +
    '<div id="hojaObsLista" style="margin-top:14px">' + lista.map(OBS.tarjetaHtml).join('') + '</div>' +
    '<button type="button" class="res-cerrar-sec" id="btnCerrarLista">Cerrar</button>');
  FOTOS.pintar('#hojaObsLista');
  DR.$('#btnCerrarLista').onclick = UI.cerrarHoja;
  DR.$$('[data-obs]', DR.$('#hojaObsLista')).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-obs'), o = lista.filter(function (x) { return x.id === id; })[0];
      if (o) OBS.abrirDetalle(o, opc);
    };
  });
};

/* ============================================================ DETALLE */
OBS.abrirDetalle = function (o, opc) {
  opc = opc || {};
  UI.abrirHoja('<div class="asa"></div><div class="vacio">Cargando observación…</div>');
  Promise.all([
    sb.from('s5_observaciones').select('*').eq('id', o.id).single(),
    sb.from('s5_auditorias').select('*').eq('id', o.auditoria_id).single(),
    sb.from('s5_seguimientos').select('*').eq('observacion_id', o.id).order('fecha')
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    OBS.pintarDetalle(r[0].data, r[1].data, r[2].data || [], opc);
  }).catch(function (e) { UI.cerrarHoja(); DR.toast(e.message, 'error'); });
};

OBS.pintarDetalle = function (o, a, segs, opc) {
  var z = S5.zona(o.zona_id) || {}, area = S5.area(a.area_id) || {};
  var puede = AT.puedeCapturar() && a.estado !== 'anulada';
  var editable = puede && (AT.esAdmin() || S5.hoy() <= S5.sumarDias(o.fecha_registro, S5.diasCorreccion()));
  var figura = function (titulo, ruta) {
    return ruta
      ? '<figure><img alt="Foto ' + titulo + '" data-foto="' + DR.esc(ruta) + '" data-ver="' + DR.esc(ruta) + '"><figcaption>' + titulo + '</figcaption></figure>'
      : '<figure class="sin-foto"><span>' + FOTOS.ICONO + 'Sin foto</span><figcaption>' + titulo + '</figcaption></figure>';
  };
  var linea = segs.map(function (sg) {
    var cambios = (sg.cambios_puntaje || []).map(function (c) {
      return c.s + 'S-' + c.numero + ': ' + S5.numPuntaje(c.antes) + ' → ' + S5.numPuntaje(c.despues);
    }).join(' · ');
    var foto = sg.foto && sg.foto !== o.foto_antes ? '<img class="foto-mini" alt="" data-foto="' + DR.esc(sg.foto) + '" data-ver="' + DR.esc(sg.foto) + '">' : '';
    return '<li style="--c:' + (S5.COLOR_ESTADO[sg.estado_nuevo] || '#A89A8C') + '">' +
      '<span class="lt-fecha">' + DR.fechaHora(sg.fecha) + (sg.usuario_nombre ? ' · ' + DR.esc(sg.usuario_nombre) : '') + '</span>' +
      '<b>' + (sg.estado_anterior && sg.estado_anterior !== sg.estado_nuevo ? DR.esc(sg.estado_anterior) + ' → ' : '') + DR.esc(sg.estado_nuevo) + '</b>' +
      (sg.nota ? '<span>' + DR.esc(sg.nota) + '</span>' : '') +
      (cambios ? '<span class="lt-cambio">Puntaje corregido · ' + DR.esc(cambios) + '</span>' : '') + foto + '</li>';
  }).join('');

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="obs-cab">' + S5.pillEstado(o.estado) + '<span>' + DR.esc(a.codigo) + ' · Auditoría N° ' + a.numero_auditoria + '</span></div>' +
    '<div class="res-nombre">Observación N° ' + o.numero + '</div>' +
    '<div class="res-dni">' + DR.esc(area.nombre || '') + ' · ' + DR.esc(S5.nombreZona(z)) + (o.s_referencia ? ' · ' + o.s_referencia + 'S ' + S5.NOMBRES[o.s_referencia] : '') + '</div>' +
    '<div class="fotos-par">' + figura('Antes', o.foto_antes) + figura('Después', o.foto_despues) + '</div>' +
    '<div class="res-obs"><b>Observación</b>' + DR.esc(o.descripcion) + '</div>' +
    (o.accion_correctiva ? '<div class="res-obs accion"><b>Acción correctiva</b>' + DR.esc(o.accion_correctiva) + '</div>' : '') +
    '<div class="dato-fila"><span>Fecha de registro</span><b>' + S5.fecha(o.fecha_registro) + ' · semana ' + DR.esc(o.semana) + '</b></div>' +
    '<div class="dato-fila"><span>Fecha de cierre</span><b>' + (o.fecha_cierre ? S5.fecha(o.fecha_cierre) : '—') + '</b></div>' +
    '<div class="dato-fila"><span>Auditor</span><b>' + DR.esc(o.auditor || '—') + '</b></div>' +
    '<div class="sep-titulo">Seguimiento</div><ul class="linea-tiempo">' + (linea || '<li>Sin movimientos.</li>') + '</ul>' +
    '<div class="acciones">' +
      (puede ? '<button type="button" class="btn verde" id="btnSeguimiento" style="flex:1">Registrar seguimiento</button>' : '') +
      (editable ? '<button type="button" class="btn sec" id="btnEditarObs">Editar</button>' : '') + '</div>' +
    '<button type="button" class="res-cerrar-sec" id="btnCerrarObs">Cerrar</button>');
  FOTOS.pintar('#hojaTarjeta');
  DR.$('#btnCerrarObs').onclick = UI.cerrarHoja;
  if (DR.$('#btnSeguimiento')) DR.$('#btnSeguimiento').onclick = function () { OBS.abrirSeguimiento(o, a, opc); };
  if (DR.$('#btnEditarObs')) DR.$('#btnEditarObs').onclick = function () {
    OBS.abrirFormulario({ auditoria: a, zona: z, observacion: o, alGuardar: function (n) {
      if (opc.alCambiar) opc.alCambiar(n);
      OBS.abrirDetalle(n, opc);
    } });
  };
};

/* ============================================================ REGISTRO / EDICIÓN */
OBS.abrirFormulario = function (opc) {
  var o = opc.observacion || null, a = opc.auditoria, z = opc.zona;
  var st = OBS.form = { id: o ? o.id : S5.uuid(), foto: {}, estado: 'Pendiente', s: o ? o.s_referencia : (opc.s || null) };
  var chipsS = [{ v: '', t: 'Ninguna' }].concat([1, 2, 3, 4, 5].map(function (s) { return { v: s, t: s + 'S' }; }));

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + FOTOS.ICONO + '<span>' + (o ? 'Editar observación N° ' + o.numero : 'Nueva observación') + '</span></div>' +
    '<div class="res-nombre">' + DR.esc(S5.nombreZona(z)) + '</div>' +
    '<div class="res-dni">' + DR.esc((S5.area(a.area_id) || {}).nombre || '') + ' · ' + DR.esc(a.codigo) + ' · Auditoría N° ' + a.numero_auditoria + '</div>' +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo ancho"><label for="obsDesc">Observación<em>obligatorio</em></label>' +
        '<textarea id="obsDesc" rows="3" placeholder="Ej. Jabas con precintos sin identificar ni delimitar.">' + DR.esc(o ? o.descripcion : '') + '</textarea></div>' +
      '<div class="campo ancho"><label for="obsAccion">Acción correctiva</label>' +
        '<textarea id="obsAccion" rows="2" placeholder="Ej. Rotular la jaba con el formato estandarizado.">' + DR.esc(o ? (o.accion_correctiva || '') : '') + '</textarea></div>' +
      (o ? '' : '<div class="campo ancho"><label>Estado inicial</label><div class="opciones" id="obsEstado">' +
        ['Pendiente', 'Recomendación'].map(function (e) {
          return '<button type="button" class="opcion' + (e === st.estado ? ' activa' : '') + '" data-valor="' + e + '" style="--c:' + S5.COLOR_ESTADO[e] + '">' + e + '</button>';
        }).join('') + '</div><div class="ayuda-campo">Pendiente: no cumple. Recomendación: mejora sugerida, no descuenta.</div></div>') +
      '<div class="campo ancho"><label>S relacionada (opcional)</label><div class="opciones" id="obsS">' + chipsS.map(function (c) {
        return '<button type="button" class="opcion' + (String(c.v) === String(st.s || '') ? ' activa' : '') + '" data-valor="' + c.v + '" style="--c:' + (c.v ? S5.COLORES[c.v] : '#A89A8C') + '">' + c.t + '</button>';
      }).join('') + '</div><div class="ayuda-campo">Solo sirve para ubicar el ítem si luego corriges el puntaje.</div></div>' +
      '<div class="campo ancho"><label>Foto «Antes»' + (o ? '' : '<em>obligatoria</em>') + '</label>' +
        FOTOS.campoHtml('obsFoto', o ? 'Reemplazar foto' : 'Tomar foto', o ? 'Opcional: deja la actual si está bien' : 'Evidencia del hallazgo') + '</div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="obsCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="obsGuardar" style="flex:1">' + (o ? 'Guardar cambios' : 'Registrar observación') + '</button></div>', { fija: true });

  if (o && o.foto_antes) {
    DR.$('#obsFotoZona .foto-prev').innerHTML = '<img alt="" data-foto="' + DR.esc(o.foto_antes) + '">';
    FOTOS.pintar('#obsFotoZona');
  }
  FOTOS.enlazar('obsFoto', st.foto);
  OBS.chips('#obsEstado', function (v) { st.estado = v; });
  OBS.chips('#obsS', function (v) { st.s = v ? Number(v) : null; });
  DR.$('#obsCancelar').onclick = function () {
    if (o) OBS.abrirDetalle(o); else UI.cerrarHoja();
  };
  DR.$('#obsGuardar').onclick = function () {
    var btn = this, desc = DR.$('#obsDesc').value.trim();
    if (!desc) { DR.toast('Describe la observación.', 'error'); DR.$('#obsDesc').focus(); return; }
    if (!o && !st.foto.blob && !st.foto.ruta) {
      DR.toast('Toma la foto «Antes»: es el sustento del hallazgo.', 'error');
      DR.$('#obsFotoZona').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    DR.desbloquearAudio();
    btn.disabled = true;
    btn.classList.add('cargando');
    btn.textContent = st.foto.blob && !st.foto.ruta ? 'Subiendo foto…' : 'Guardando…';
    var ruta = a.codigo + '/' + z.numero + '/' + st.id + '-antes' + (o ? '-' + Date.now() : '') + '.jpg';
    FOTOS.subir(st.foto, ruta).then(function (subida) {
      btn.textContent = 'Guardando…';
      return AT.rpc('rpc_s5_guardar_observacion', { p: {
        id: st.id, auditoria_id: a.id, zona_id: z.id, descripcion: desc, accion_correctiva: DR.$('#obsAccion').value.trim(),
        estado: st.estado, s_referencia: st.s || null, foto_antes: subida || (o ? o.foto_antes : '')
      } });
    }).then(function (nueva) {
      DR.vibrar(40);
      DR.sonar(true);
      DR.toast(o ? 'Observación N° ' + nueva.numero + ' actualizada.' : 'Observación N° ' + nueva.numero + ' registrada.');
      if (!o) UI.cerrarHoja();
      OBS.reemplazar(nueva);
      if (opc.alGuardar) opc.alGuardar(nueva);
    }).catch(function (e) {
      btn.disabled = false;
      btn.classList.remove('cargando');
      btn.textContent = 'Reintentar';
      DR.toast('No se guardó: ' + e.message, 'error');
    });
  };
};

/* ============================================================ SEGUIMIENTO + SOBRESCRITURA DE PUNTAJE */
OBS.abrirSeguimiento = function (o, a, opc) {
  var z = S5.zona(o.zona_id) || {};
  var st = OBS.seg = { o: o, a: a, z: z, opc: opc || {}, estado: o.estado, foto: {}, corregir: false, cargado: false, ev: null, puntajes: {}, detalle: {}, nuevos: {} };
  var limite = S5.limiteCorreccion(a), enPlazo = S5.enPlazo(a), puedeCorregir = AT.esAdmin() || enPlazo;
  var ayudaPlazo = enPlazo
    ? 'Disponible hasta el ' + S5.fecha(limite) + ' (' + S5.diasCorreccion() + ' días desde la auditoría).'
    : (AT.esAdmin() ? 'El plazo venció el ' + S5.fecha(limite) + '; como administrador puedes corregir igual.'
      : 'El plazo venció el ' + S5.fecha(limite) + '. Pide a un administrador que lo corrija.');

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.reloj + '<span>Seguimiento</span></div>' +
    '<div class="res-nombre">Obs. N° ' + o.numero + ' · ' + DR.esc(S5.nombreZona(z)) + '</div>' +
    '<div class="res-dni">' + DR.esc(DR.recortar(o.descripcion, 120)) + '</div>' +
    '<div class="campo" style="margin-top:16px"><label>Nuevo estado</label><div class="opciones" id="segEstados">' + S5.ESTADOS.map(function (e) {
      return '<button type="button" class="opcion' + (e === o.estado ? ' activa' : '') + '" data-valor="' + e + '" style="--c:' + S5.COLOR_ESTADO[e] + '">' + e + '</button>';
    }).join('') + '</div><div class="ayuda-campo" id="segAyudaEstado"></div></div>' +
    '<div class="campo" style="margin-top:12px"><label for="segNota">Nota del seguimiento</label>' +
      '<textarea id="segNota" rows="3" placeholder="Ej. Se colocó el rótulo estandarizado en las jabas."></textarea></div>' +
    '<div class="campo" style="margin-top:12px"><label>Foto «Después» (opcional)</label>' +
      FOTOS.campoHtml('segFoto', 'Tomar foto después', 'Evidencia del levantamiento') + '</div>' +
    '<div class="corregir5s">' +
      '<label class="interruptor' + (puedeCorregir ? '' : ' bloqueado') + '"><input type="checkbox" id="segCorregir"' + (puedeCorregir ? '' : ' disabled') + '><i></i>' +
      '<span><b>Corregir puntaje del checklist</b><small>' + ayudaPlazo + '</small></span></label>' +
      '<div id="segChecklist" class="oculto"></div></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="segCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="segGuardar" style="flex:1">Guardar seguimiento</button></div>', { fija: true });

  FOTOS.enlazar('segFoto', st.foto);
  OBS.chips('#segEstados', function (v) { st.estado = v; OBS.ayudaEstado(puedeCorregir); });
  DR.$('#segCorregir').onchange = function () {
    st.corregir = this.checked;
    DR.$('#segChecklist').classList.toggle('oculto', !st.corregir);
    if (st.corregir && !st.cargado) OBS.cargarChecklist();
    OBS.ayudaEstado(puedeCorregir);
    OBS.recalcular();
  };
  DR.$('#segCancelar').onclick = function () { OBS.abrirDetalle(o, opc); };
  DR.$('#segGuardar').onclick = OBS.guardarSeguimiento;
};

OBS.ayudaEstado = function (puedeCorregir) {
  var st = OBS.seg, el = DR.$('#segAyudaEstado');
  if (!el) return;
  var cumple = (st.estado === 'En ejecución' || st.estado === 'Cerrado') && st.estado !== st.o.estado;
  el.textContent = cumple && puedeCorregir && !st.corregir ? '¿Ya cumple? Activa «Corregir puntaje del checklist» para sobrescribir el ítem.' : '';
};

OBS.cargarChecklist = function () {
  var st = OBS.seg, c = DR.$('#segChecklist');
  c.innerHTML = '<div class="vacio">Cargando checklist…</div>';
  sb.from('s5_evaluaciones').select('id,estado').eq('auditoria_id', st.a.id).eq('zona_id', st.o.zona_id).maybeSingle().then(function (r) {
    if (r.error) throw new Error(r.error.message);
    st.ev = r.data;
    return r.data ? sb.from('s5_puntajes').select('*').eq('evaluacion_id', r.data.id) : null;
  }).then(function (r) {
    if (r && r.error) throw new Error(r.error.message);
    st.puntajes = {};
    st.detalle = {};
    ((r && r.data) || []).forEach(function (p) { st.puntajes[p.item_id] = Number(p.puntaje); st.detalle[p.item_id] = p; });
    st.cargado = true;
    OBS.pintarChecklist();
  }).catch(function (e) { c.innerHTML = '<div class="aviso alerta">' + DR.esc(e.message) + '</div>'; });
};

OBS.pintarChecklist = function () {
  var st = OBS.seg, c = DR.$('#segChecklist');
  if (!c) return;
  if (!st.ev || !Object.keys(st.puntajes).length) {
    c.innerHTML = '<div class="aviso alerta" style="margin-top:10px">Esta zona todavía no tiene puntajes en la auditoría ' + DR.esc(st.a.codigo) + '. Complétala desde Auditar.</div>';
    return;
  }
  var abrir = st.o.s_referencia || 1;
  c.innerHTML = '<div class="ayuda-campo" style="margin:12px 2px">Toca el nuevo puntaje del ítem que ya cumple. Se conserva el puntaje original y este seguimiento queda como sustento.</div>' +
    '<div class="zona-total" id="segTotal"></div>' +
    [1, 2, 3, 4, 5].map(function (s) {
      var items = S5.itemsDe(s, true).filter(function (it) { return st.puntajes[it.id] !== undefined; });
      return '<details class="grupo-s" style="--c:' + S5.COLORES[s] + '"' + (s === abrir ? ' open' : '') + '>' +
        '<summary><span>' + s + 'S · ' + S5.NOMBRES[s] + '</span><b data-pct-s="' + s + '"></b></summary>' +
        '<div class="items5s">' + items.map(function (it) {
          var d = st.detalle[it.id];
          return S5.itemHtml(it, st.puntajes[it.id], { nota: d && d.corregido_en ? 'Original: ' + S5.numPuntaje(d.puntaje_original) + ' · ya corregido antes' : '' });
        }).join('') + '</div></details>';
    }).join('');
  S5.enlazarPuntajes(c, function (id, v) {
    if (v === st.puntajes[id]) delete st.nuevos[id]; else st.nuevos[id] = v;
    OBS.recalcular();
  });
  OBS.recalcular();
};

OBS.recalcular = function () {
  var st = OBS.seg;
  if (!st) return;
  var n = st.corregir ? Object.keys(st.nuevos).length : 0, btn = DR.$('#segGuardar');
  if (btn && !btn.disabled) btn.textContent = 'Guardar seguimiento' + (n ? ' · ' + n + ' puntaje(s)' : '');
  if (!st.cargado || !DR.$('#segTotal')) return;
  var mezcla = {};
  Object.keys(st.puntajes).forEach(function (k) { mezcla[k] = st.puntajes[k]; });
  Object.keys(st.nuevos).forEach(function (k) { mezcla[k] = st.nuevos[k]; });
  var antes = OBS.porS(st.puntajes), despues = OBS.porS(mezcla);
  for (var s = 1; s <= 5; s++) {
    var el = DR.$('[data-pct-s="' + s + '"]');
    if (el) el.innerHTML = antes[s] !== despues[s] ? S5.pct(antes[s]) + ' → <em>' + S5.pct(despues[s]) + '</em>' : S5.pct(despues[s]);
  }
  DR.$$('[data-cambio]', DR.$('#segChecklist')).forEach(function (el) {
    var id = el.getAttribute('data-cambio'), cambia = st.nuevos[id] !== undefined;
    el.textContent = cambia ? 'Corrección: ' + S5.numPuntaje(st.puntajes[id]) + ' → ' + S5.numPuntaje(st.nuevos[id]) : '';
    el.closest('.item5s').classList.toggle('cambiado', cambia);
  });
  DR.$('#segTotal').innerHTML = '<span>Calificación de la zona</span><b>' + S5.pct(antes.total) + (n ? ' → ' + S5.pct(despues.total) : '') + '</b>' +
    S5.pillMadurez(n ? despues.total : antes.total);
};

OBS.guardarSeguimiento = function () {
  var st = OBS.seg, btn = DR.$('#segGuardar'), nota = DR.$('#segNota').value.trim();
  var cambios = st.corregir ? Object.keys(st.nuevos).map(function (k) { return { item_id: Number(k), puntaje: st.nuevos[k] }; }) : [];
  if (st.estado === st.o.estado && !nota && !st.foto.blob && !cambios.length) {
    DR.toast('Elige un estado, escribe una nota, agrega la foto o corrige un puntaje.', 'error');
    return;
  }
  if (cambios.length && !nota) {
    DR.toast('Escribe en la nota por qué se corrige el puntaje: queda como sustento.', 'error');
    DR.$('#segNota').focus();
    return;
  }
  DR.desbloquearAudio();
  btn.disabled = true;
  btn.classList.add('cargando');
  btn.textContent = st.foto.blob && !st.foto.ruta ? 'Subiendo foto…' : 'Guardando…';
  var ruta = st.a.codigo + '/' + st.z.numero + '/' + st.o.id + '-despues-' + Date.now() + '.jpg';
  FOTOS.subir(st.foto, ruta).then(function (subida) {
    btn.textContent = 'Guardando…';
    return AT.rpc('rpc_s5_seguimiento', { p_observacion: st.o.id, p_estado: st.estado, p_nota: nota || null, p_foto: subida, p_cambios: cambios });
  }).then(function (res) {
    DR.vibrar(40);
    DR.sonar(true);
    DR.toast('Seguimiento guardado' + (res.cambios && res.cambios.length ? ' · ' + res.cambios.length + ' puntaje(s) corregido(s)' : '') + '.');
    OBS.reemplazar(res.observacion);
    if (st.opc.alCambiar) st.opc.alCambiar(res.observacion, res);
    OBS.abrirDetalle(res.observacion, st.opc);
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Reintentar';
    DR.toast('No se guardó: ' + e.message, 'error');
  });
};
