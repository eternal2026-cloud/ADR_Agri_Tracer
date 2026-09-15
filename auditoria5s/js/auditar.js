/* ============================================================================
 * auditar.js — AUDITORÍA 5S SECUENCIAL (móvil)
 * Flujo: auditorías en curso del cultivo → nueva (cultivo → área → zonas, con
 * opción de agregar áreas y zonas antes de iniciar) → N° de zona →
 * 1S → 2S → 3S → 4S → 5S (los pasos son tocables para regresar) → resumen de
 * la zona → siguiente zona → cerrar auditoría.
 * Cada S se guarda en el servidor al continuar; cada toque queda además en el
 * celular (localStorage) para recuperar puntajes si se va la señal o se
 * cierra la app. Una zona completa solo se reescribe el mismo día; después,
 * los puntajes se corrigen con un seguimiento de observación (con historial).
 * ==========================================================================*/
var AUD = {
  vista: 'lista', abiertas: [], recientes: [], evals: [], pendiente: null, nueva: null,
  aud: null, resumen: [], obsArea: [], zona: null, evaluacion: null, puntajes: {}, detalle: {},
  borrador: {}, s: 1, sucio: false, guardando: false, insistir: false, _pct: 0
};
AUD.PREF = 'agritracer.5s.preferencias';

AUD.puedeSalir = function () {
  if (AUD.vista !== 'zona' || !AUD.sucio) return true;
  return window.confirm('Hay puntajes de ' + AUD.s + 'S sin guardar. Quedan en este celular y se recuperan al volver, pero aún no están en el sistema. ¿Salir igual?');
};
AUD.salir = function () { AUD.quitarBarra(); AUD.vista = 'lista'; AUD.sucio = false; };

window.addEventListener('beforeunload', function (e) {
  if (AUD.vista === 'zona' && AUD.sucio) { e.preventDefault(); e.returnValue = ''; }
});

VISTAS.auditar = function (cont) {
  if (!AT.puedeCapturar()) {
    cont.innerHTML = UI.encabezado('Auditoría 5S', 'Auditar', '') +
      UI.panel('Sin permiso', '', '<div class="aviso alerta">Tu cuenta es de solo consulta. Pide a un administrador el rol «Captura en campo» para auditar.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  S5.cargar().then(function () {
    if (!AUD.pendiente) { AUD.pintarLista(); return; }
    var id = AUD.pendiente;
    AUD.pendiente = null;
    return sb.from('s5_auditorias').select('*').eq('id', id).single().then(function (r) {
      if (r.error) throw new Error(r.error.message);
      AUD.abrirAuditoria(r.data);
    });
  }).catch(function (e) { UI.error(cont, e); });
};

/** Texto «Arándano · Producción · A5S-00003 · N° 3» para cabeceras. */
AUD.etiqueta = function (a) {
  return [(S5.cultivo(a.cultivo_id) || {}).nombre, (S5.area(a.area_id) || {}).nombre, a.codigo, 'N° ' + a.numero_auditoria].filter(Boolean).join(' · ');
};

/* ============================================================ LISTA DE AUDITORÍAS */
AUD.pintarLista = function () {
  var cont = DR.$('#contenido'), cul = S5.cultivoActual();
  AUD.vista = 'lista'; AUD.aud = null; AUD.zona = null; AUD.sucio = false;
  AUD.quitarBarra();
  cont.scrollTop = 0;
  cont.innerHTML = UI.encabezado('Auditoría 5S', 'Auditorías', 'Elige el cultivo, inicia una auditoría por área o continúa una en curso. Cada zona se evalúa S por S, igual que el CHECK LIST.') +
    S5.selectorCultivoHtml() +
    '<button class="btn verde grande entra" id="btnNuevaAud" type="button">' + DR.ICONOS.mas + '<span>Nueva auditoría' + (cul ? ' de ' + DR.esc(cul.nombre) : '') + '</span></button>' +
    '<div id="listaAud" style="margin-top:16px"><div class="vacio">Cargando auditorías…</div></div>';
  DR.entrarPaneles('#contenido');
  S5.enlazarSelectorCultivo(cont, AUD.pintarLista);
  DR.$('#btnNuevaAud').onclick = function () { DR.desbloquearAudio(); AUD.pintarNueva(); };
  AUD.cargarLista().then(AUD.pintarTarjetas).catch(function (e) {
    var l = DR.$('#listaAud');
    if (l) l.innerHTML = '<div class="aviso alerta">' + DR.esc(e.message) + '</div>';
  });
};

AUD.cargarLista = function () {
  var cul = S5.cultivoId();
  return Promise.all([
    sb.from('s5_auditorias').select('*').eq('cultivo_id', cul).eq('estado', 'en_curso').order('actualizado_en', { ascending: false }).limit(100),
    sb.from('s5_auditorias').select('*').eq('cultivo_id', cul).eq('estado', 'cerrada').order('cerrada_en', { ascending: false }).limit(8)
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    AUD.abiertas = r[0].data || [];
    AUD.recientes = r[1].error ? [] : (r[1].data || []);
    var ids = AUD.abiertas.concat(AUD.recientes).map(function (a) { return a.id; });
    if (!ids.length) { AUD.evals = []; return; }
    return sb.from('s5_evaluaciones').select('auditoria_id,zona_id,estado').in('auditoria_id', ids).then(function (e) {
      if (e.error) throw new Error(e.error.message);
      AUD.evals = e.data || [];
    });
  });
};

AUD.tarjetaHtml = function (a) {
  var area = S5.area(a.area_id) || {}, zonas = S5.zonasDe(a.area_id, false, a.cultivo_id);
  var ev = AUD.evals.filter(function (e) { return e.auditoria_id === a.id; });
  var estadoDe = function (z) { var e = ev.filter(function (x) { return x.zona_id === z.id; })[0]; return e ? e.estado : ''; };
  var hechas = zonas.filter(function (z) { return estadoDe(z) === 'completa'; }).length;
  var seg = zonas.map(function (z) {
    var st = estadoDe(z);
    return '<i class="' + (st === 'completa' ? 'hecho' : (st ? 'actual' : '')) + '"></i>';
  }).join('');
  return '<button type="button" class="ciclo-card entra" data-aud="' + a.id + '" style="--c:' + (a.estado === 'cerrada' ? '#76B729' : '#EF7C3B') + '">' +
    '<div class="cc-top"><span class="cc-codigo">' + DR.esc(area.nombre || '—') + '</span><span class="cc-hace">' + DR.hace(a.actualizado_en) + '</span></div>' +
    '<div class="cc-sub">' + DR.esc(a.codigo) + ' · N° ' + a.numero_auditoria + ' · ' + DR.esc(a.tipo) + ' · ' + S5.fecha(a.fecha) + ' · ' + DR.esc(a.campana) + '</div>' +
    '<div class="cc-pasos" style="grid-template-columns:repeat(' + Math.max(zonas.length, 1) + ',1fr)">' + seg + '</div>' +
    '<div class="cc-sig"><span>' + (a.estado === 'cerrada' ? '<b>Cerrada</b> · ' : '') + hechas + ' de ' + zonas.length + ' zonas completas</span>' + DR.ICONOS.chevron + '</div></button>';
};

AUD.pintarTarjetas = function () {
  var cont = DR.$('#listaAud'), cul = S5.cultivoActual();
  if (!cont) return;
  var h = '<div class="conteo">En curso · ' + AUD.abiertas.length + '</div>' +
    (AUD.abiertas.length ? AUD.abiertas.map(AUD.tarjetaHtml).join('')
      : '<div class="vacio">No hay auditorías de ' + DR.esc(cul ? cul.nombre : '') + ' en curso. Inicia una con el botón verde.</div>');
  if (AUD.recientes.length) h += '<div class="conteo" style="margin-top:18px">Cerradas recientemente · ' + AUD.recientes.length + '</div>' + AUD.recientes.map(AUD.tarjetaHtml).join('');
  cont.innerHTML = h;
  DR.$$('[data-aud]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-aud');
      var a = AUD.abiertas.concat(AUD.recientes).filter(function (x) { return x.id === id; })[0];
      if (a) AUD.abrirAuditoria(a);
    };
  });
  DR.entrarPaneles('#listaAud');
};

/* ============================================================ NUEVA AUDITORÍA */
AUD.prefsDe = function (cultivoId) { return (S5.leerLocal(AUD.PREF) || {})[cultivoId] || {}; };

AUD.pintarNueva = function () {
  var cont = DR.$('#contenido'), cul = S5.cultivoActual();
  AUD.vista = 'nueva';
  AUD.nueva = { cultivo_id: cul ? cul.id : null, area_id: '', tipo: null, fecha: S5.hoy(), numero: '', campana: null, planta: null };
  cont.scrollTop = 0;
  cont.innerHTML =
    '<div class="wiz-cab"><button type="button" class="wiz-volver" id="btnVolverLista">' + DR.ICONOS.atras + '<span>Auditorías</span></button>' +
    '<div class="wiz-id"><b>Nueva auditoría</b><span>El código se asigna al iniciar</span></div></div>' +
    '<section class="etapa entra" style="--c:#EF7C3B"><div class="etapa-cab"><span class="etapa-num">Cabecera del CHECK LIST</span><h2>¿Qué vas a auditar?</h2></div>' +
    '<div id="nuevaCuerpo"></div></section>' +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnIniciarAud">' + DR.ICONOS.checkChico + '<span>Iniciar auditoría</span></button></div>';
  DR.entrarPaneles('#contenido');
  DR.$('#btnVolverLista').onclick = AUD.pintarLista;
  DR.$('#btnIniciarAud').onclick = AUD.iniciar;
  AUD.pintarCabeceraNueva();
};

/** Guarda lo escrito antes de volver a pintar la cabecera (al cambiar cultivo o área). */
AUD.leerNueva = function () {
  var n = AUD.nueva;
  if (DR.$('#inpFechaAud')) n.fecha = DR.$('#inpFechaAud').value;
  if (DR.$('#inpNumAud')) n.numero = DR.$('#inpNumAud').value;
  if (DR.$('#inpCampana')) n.campana = DR.$('#inpCampana').value;
  if (DR.$('#inpPlanta')) n.planta = DR.$('#inpPlanta').value;
};

AUD.pintarCabeceraNueva = function () {
  var n = AUD.nueva, cul = S5.cultivo(n.cultivo_id), cuerpo = DR.$('#nuevaCuerpo');
  if (!cuerpo) return;
  var prefs = cul ? AUD.prefsDe(cul.id) : {};
  if (!n.tipo) n.tipo = prefs.tipo || 'Inopinada';
  if (n.campana === null) n.campana = prefs.campana || (cul && cul.campana) || '';
  if (n.planta === null) n.planta = prefs.planta || (cul && cul.planta) || '';
  var areas = cul ? S5.areasDe(cul.id) : [];
  if (n.area_id && !areas.some(function (a) { return a.id === Number(n.area_id); })) n.area_id = '';
  var area = n.area_id ? S5.area(n.area_id) : null, zonas = area ? S5.zonasDe(area.id, false, cul.id) : [];

  cuerpo.innerHTML = '<div class="datos">' +
    '<div class="campo ancho"><label>1 · Cultivo<em>obligatorio</em></label><div class="opciones" id="opCultivo">' + S5.cultivosActivos().map(function (c) {
      return '<button type="button" class="opcion con-ico' + (cul && c.id === cul.id ? ' activa' : '') + '" data-valor="' + c.id + '" style="--c:' + c.color + '">' + S5.iconoCultivo(c, 24) + DR.esc(c.nombre) + '</button>';
    }).join('') + '</div></div>' +
    (cul ? '<div class="campo ancho"><label>2 · Área<em>obligatorio</em></label><div class="opciones" id="opArea">' + areas.map(function (a) {
      return '<button type="button" class="opcion' + (area && a.id === area.id ? ' activa' : '') + '" data-valor="' + a.id + '">' + DR.esc(a.nombre) + '<small>' + S5.zonasDe(a.id, false, cul.id).length + ' zonas</small></button>';
    }).join('') + '<button type="button" class="opcion agregar" id="btnAgregarArea">+ Agregar área</button></div>' +
      (areas.length ? '' : '<div class="ayuda-campo">' + DR.esc(cul.nombre) + ' aún no tiene áreas con zonas. Agrega la primera.</div>') + '</div>' : '') +
    (area ? '<div class="campo ancho"><label>3 · Zonas que se evaluarán en ' + DR.esc(area.nombre) + '</label>' +
      '<div class="zonas-previa">' + zonas.map(function (z) { return '<span>' + DR.esc(S5.nombreZona(z)) + '</span>'; }).join('') + '</div>' +
      '<div><button type="button" class="btn sec chico" id="btnAgregarZonas" style="margin-top:8px">+ Agregar zonas</button></div></div>' : '') +
    '<div class="campo ancho"><label>Tipo de auditoría</label><div class="opciones" id="opTipo">' + ['Opinada', 'Inopinada'].map(function (t) {
      return '<button type="button" class="opcion' + (t === n.tipo ? ' activa' : '') + '" data-valor="' + t + '">' + t + '</button>';
    }).join('') + '</div></div>' +
    '<div class="campo"><label for="inpNumAud">N° de auditoría</label><input id="inpNumAud" type="number" inputmode="numeric" min="1" max="99" placeholder="Auto" value="' + DR.esc(n.numero) + '">' +
      '<div class="ayuda-campo" id="ayudaNum">Se sugiere al elegir el área.</div></div>' +
    '<div class="campo"><label for="inpFechaAud">Fecha</label><input id="inpFechaAud" type="date" value="' + DR.esc(n.fecha) + '" max="' + S5.hoy() + '"></div>' +
    '<div class="campo"><label for="inpCampana">Campaña</label><input id="inpCampana" autocomplete="off" value="' + DR.esc(n.campana) + '"></div>' +
    '<div class="campo"><label for="inpPlanta">Planta</label><input id="inpPlanta" autocomplete="off" value="' + DR.esc(n.planta) + '"></div>' +
  '</div>';

  OBS.chips('#opCultivo', function (v) {
    AUD.leerNueva();
    n.cultivo_id = Number(v); n.area_id = ''; n.numero = ''; n.tipo = null; n.campana = null; n.planta = null;
    S5.fijarCultivo(v);
    AUD.pintarCabeceraNueva();
  });
  OBS.chips('#opArea', function (v) { AUD.leerNueva(); n.area_id = v; n.numero = ''; AUD.pintarCabeceraNueva(); });
  OBS.chips('#opTipo', function (v) { n.tipo = v; });
  if (DR.$('#btnAgregarArea')) DR.$('#btnAgregarArea').onclick = function () {
    AUD.leerNueva();
    AUD.hojaAgregar({ cultivo: cul, alListo: function (areaId) { n.area_id = areaId; n.numero = ''; AUD.pintarCabeceraNueva(); } });
  };
  if (DR.$('#btnAgregarZonas')) DR.$('#btnAgregarZonas').onclick = function () {
    AUD.leerNueva();
    AUD.hojaAgregar({ cultivo: cul, area: area, alListo: function () { AUD.pintarCabeceraNueva(); } });
  };
  DR.$('#inpCampana').onchange = function () { n.campana = this.value; AUD.sugerirNumero(); };
  if (area && !n.numero) AUD.sugerirNumero();
};

/** Hoja para agregar un área (existente o nueva) con sus zonas, o más zonas a un área, para un cultivo. */
AUD.hojaAgregar = function (opc) {
  var cul = opc.cultivo, area = opc.area || null;
  var otras = area ? [] : S5.areas.filter(function (a) { return a.activo && !S5.zonasDe(a.id, true, cul.id).length; });
  var actuales = area ? S5.zonasDe(area.id, true, cul.id) : [];
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#B7E27C">' + S5.iconoCultivo(cul, 30) + '<span>' + (area ? 'Agregar zonas' : 'Agregar área') + ' · ' + DR.esc(cul.nombre) + '</span></div>' +
    '<div class="res-nombre">' + (area ? DR.esc(area.nombre) : 'Área para ' + DR.esc(cul.nombre)) + '</div>' +
    (area ? '<div class="res-dni" style="letter-spacing:0">Actuales: ' + (actuales.map(S5.nombreZona).map(DR.esc).join(' · ') || 'ninguna') + '</div>' : '') +
    '<div class="form" style="margin-top:14px">' +
      (area ? '' :
        (otras.length ? '<div class="campo ancho"><label for="agrAreaSel">Área existente sin zonas en ' + DR.esc(cul.nombre) + '</label><select id="agrAreaSel"><option value="">— Crear un área nueva —</option>' +
          otras.map(function (a) { return '<option value="' + a.id + '">' + DR.esc(a.nombre) + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="campo ancho" id="agrNuevaCampo"><label for="agrAreaNombre">Nombre del área nueva</label><input id="agrAreaNombre" placeholder="Ej. Limpieza" autocomplete="off"></div>') +
      '<div class="campo ancho"><label for="agrZonas">Zonas (una por línea)<em>obligatorio</em></label>' +
        '<textarea id="agrZonas" rows="5" placeholder="Recepción&#10;Sala de proceso&#10;Mezzanine"></textarea>' +
        '<div class="ayuda-campo">Se numeran en orden después de las existentes. Renombrar, renumerar o desactivar lo hace un administrador en Catálogo.</div></div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="agrCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="agrGuardar" style="flex:1">Guardar</button></div>', { fija: true });

  if (DR.$('#agrAreaSel')) DR.$('#agrAreaSel').onchange = function () { DR.$('#agrNuevaCampo').classList.toggle('oculto', !!this.value); };
  DR.$('#agrCancelar').onclick = UI.cerrarHoja;
  DR.$('#agrGuardar').onclick = function () {
    var btn = this;
    var nombres = DR.$('#agrZonas').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var areaId = area ? area.id : (DR.$('#agrAreaSel') && DR.$('#agrAreaSel').value ? Number(DR.$('#agrAreaSel').value) : null);
    var nombreArea = (area || areaId) ? '' : DR.$('#agrAreaNombre').value.trim();
    if (!area && !areaId && !nombreArea) { DR.toast('Elige un área existente o escribe el nombre de la nueva.', 'error'); return; }
    if (!nombres.length) { DR.toast('Escribe al menos una zona.', 'error'); DR.$('#agrZonas').focus(); return; }
    btn.disabled = true;
    btn.classList.add('cargando');
    var paso = areaId ? Promise.resolve(areaId) : AT.rpc('rpc_s5_guardar_area', { p: { nombre: nombreArea } }).then(function (a) { return a.id; });
    paso.then(function (id) {
      areaId = id;
      return AT.rpc('rpc_s5_agregar_zonas', { p_cultivo: cul.id, p_area: id, p_nombres: nombres });
    }).then(function () {
      return S5.cargar(true);
    }).then(function () {
      UI.cerrarHoja();
      DR.toast('Zonas guardadas en ' + ((S5.area(areaId) || {}).nombre || 'el área') + ' · ' + cul.nombre + '.');
      if (opc.alListo) opc.alListo(areaId);
    }).catch(function (e) {
      btn.disabled = false;
      btn.classList.remove('cargando');
      DR.toast(e.message, 'error');
    });
  };
};

AUD.sugerirNumero = function () {
  var n = AUD.nueva, ayuda = DR.$('#ayudaNum');
  if (!n || !n.area_id || !n.cultivo_id || !ayuda) return;
  var campana = DR.$('#inpCampana').value.trim();
  ayuda.textContent = 'Buscando la última auditoría…';
  sb.from('s5_auditorias').select('numero_auditoria,fecha').eq('cultivo_id', n.cultivo_id).eq('area_id', n.area_id).eq('campana', campana).neq('estado', 'anulada')
    .order('numero_auditoria', { ascending: false }).limit(1).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      var ult = (r.data || [])[0], inp = DR.$('#inpNumAud');
      if (!inp) return;
      inp.value = ult ? ult.numero_auditoria + 1 : 1;
      n.numero = inp.value;
      ayuda.textContent = ult ? 'La última de esta campaña fue la N° ' + ult.numero_auditoria + ' (' + S5.fecha(ult.fecha) + ').' : 'Primera auditoría del área en esta campaña.';
    }).catch(function () { if (ayuda) ayuda.textContent = 'Si lo dejas vacío se asigna solo.'; });
};

AUD.iniciar = function () {
  var n = AUD.nueva, btn = this;
  DR.desbloquearAudio();
  AUD.leerNueva();
  if (!n.cultivo_id) { DR.toast('Elige el cultivo.', 'error'); return; }
  if (!n.area_id) {
    DR.toast('Elige el área a auditar.', 'error');
    if (DR.anima) anime({ targets: '#opArea .opcion', translateY: [-8, 0], duration: 600, delay: anime.stagger(40), easing: 'easeOutBack' });
    return;
  }
  if (!S5.zonasDe(n.area_id, false, n.cultivo_id).length) { DR.toast('El área no tiene zonas activas para este cultivo. Agrégalas primero.', 'error'); return; }
  var p = {
    cultivo_id: Number(n.cultivo_id), area_id: Number(n.area_id), tipo: n.tipo, fecha: n.fecha || S5.hoy(),
    numero_auditoria: n.numero ? Number(n.numero) : null, campana: (n.campana || '').trim(), planta: (n.planta || '').trim()
  };
  if (!p.campana || !p.planta) { DR.toast('Completa la campaña y la planta.', 'error'); return; }
  btn.disabled = true;
  btn.classList.add('cargando');
  var prefs = S5.leerLocal(AUD.PREF) || {};
  prefs[p.cultivo_id] = { tipo: p.tipo, campana: p.campana, planta: p.planta };
  S5.escribirLocal(AUD.PREF, prefs);
  AT.rpc('rpc_s5_iniciar_auditoria', { p: p }).then(function (a) {
    DR.vibrar(40);
    DR.sonar(true);
    DR.toast('Auditoría ' + a.codigo + ' iniciada. Elige la primera zona.');
    AUD.abrirAuditoria(a);
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    DR.toast(e.message, 'error');
  });
};

/* ============================================================ ZONAS DE LA AUDITORÍA */
AUD.abrirAuditoria = function (a) {
  var cont = DR.$('#contenido');
  AUD.aud = a;
  AUD.vista = 'cargando';
  AUD.quitarBarra();
  if (a.cultivo_id && a.cultivo_id !== S5.cultivoId()) S5.fijarCultivo(a.cultivo_id);
  cont.innerHTML = '<div class="vacio">Cargando zonas…</div>';
  AUD.cargarAuditoria().then(AUD.pintarZonas).catch(function (e) { UI.error(cont, e); });
};

AUD.cargarAuditoria = function () {
  var a = AUD.aud, zonas = S5.zonasDe(a.area_id, true, a.cultivo_id).map(function (z) { return z.id; });
  return Promise.all([
    sb.from('s5_auditorias').select('*').eq('id', a.id).single(),
    AT.rpc('fn_s5_resumen', { p_auditoria: a.id }),
    zonas.length
      ? sb.from('s5_observaciones').select('*, s5_auditorias(codigo,numero_auditoria,area_id,cultivo_id,fecha,estado)').in('zona_id', zonas).order('numero')
      : Promise.resolve({ data: [] })
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    if (r[2].error) throw new Error(r[2].error.message);
    AUD.aud = r[0].data;
    AUD.resumen = r[1] || [];
    AUD.obsArea = (r[2].data || []).filter(function (o) { return !o.s5_auditorias || o.s5_auditorias.estado !== 'anulada'; });
  });
};

AUD.filaResumen = function (zonaId) { return AUD.resumen.filter(function (f) { return f.zona_id === zonaId; })[0] || null; };
AUD.obsPrevias = function (zonaId) {
  return AUD.obsArea.filter(function (o) { return o.zona_id === zonaId && o.auditoria_id !== AUD.aud.id && S5.ABIERTOS.indexOf(o.estado) > -1; });
};
AUD.obsAqui = function (zonaId) {
  return AUD.obsArea.filter(function (o) { return o.zona_id === zonaId && o.auditoria_id === AUD.aud.id; });
};
AUD.zonasVisibles = function () {
  var a = AUD.aud;
  return S5.zonasDe(a.area_id, true, a.cultivo_id).filter(function (z) { return z.activo || AUD.filaResumen(z.id); });
};

AUD.pintarZonas = function () {
  var cont = DR.$('#contenido'), a = AUD.aud, area = S5.area(a.area_id) || {}, cul = S5.cultivo(a.cultivo_id);
  AUD.vista = 'zonas'; AUD.zona = null; AUD.sucio = false;
  AUD.quitarBarra();
  cont.scrollTop = 0;
  var zonas = AUD.zonasVisibles(), completas = 0, pcts = [];
  var tarjetas = zonas.map(function (z) {
    var f = AUD.filaResumen(z.id), porS = f ? [f.p1, f.p2, f.p3, f.p4, f.p5] : [], hechas = porS.filter(function (p) { return p !== null && p !== undefined; });
    var completa = f && f.estado_zona === 'completa';
    if (completa) completas++;
    pcts = pcts.concat(hechas);
    var previas = AUD.obsPrevias(z.id).length, aqui = AUD.obsAqui(z.id).length;
    var estado = !f ? 'Sin evaluar' : (completa ? 'Completa' : hechas.length + ' de 5 S');
    return '<button type="button" class="zona-btn entra' + (completa ? ' completa' : '') + '" data-zona="' + z.id + '" style="--c:' + (completa ? '#76B729' : (f ? '#EF7C3B' : '#6B5D51')) + '">' +
      '<span class="zona-num">' + z.numero + '</span><span class="zona-nombre">' + DR.esc(z.nombre) + '</span>' +
      '<span class="zona-s">' + [1, 2, 3, 4, 5].map(function (s) {
        var p = porS[s - 1];
        return '<i' + (p !== null && p !== undefined ? ' style="background:' + S5.COLORES[s] + '"' : '') + '></i>';
      }).join('') + '</span>' +
      '<span class="zona-pie"><span>' + estado + '</span>' + (f && f.total !== null ? '<b>' + S5.pct(f.total) + '</b>' : '') + '</span>' +
      (f && f.total !== null ? S5.pillMadurez(f.total) : '') +
      (previas ? '<span class="zona-alerta">' + previas + ' obs. abierta(s) anteriores</span>' : '') +
      (aqui ? '<span class="zona-obs">' + aqui + ' obs. en esta auditoría</span>' : '') + '</button>';
  }).join('');
  var promedio = S5.promedio(pcts), enCurso = a.estado === 'en_curso', faltan = zonas.length - completas;

  cont.innerHTML =
    '<div class="wiz-cab"><button type="button" class="wiz-volver" id="btnVolverLista">' + DR.ICONOS.atras + '<span>Auditorías</span></button>' +
    S5.iconoCultivo(cul, 34) +
    '<div class="wiz-id"><b>' + DR.esc(area.nombre || '—') + '</b><span>' + DR.esc((cul || {}).nombre || '') + ' · ' + DR.esc(a.codigo) + ' · N° ' + a.numero_auditoria + ' · ' +
      DR.esc(a.tipo) + ' · ' + S5.fecha(a.fecha) + ' · semana ' + a.semana + '</span></div></div>' +
    '<div class="kpis">' +
      UI.kpi('Avance', completas + '<small>de ' + zonas.length + ' zonas</small>', faltan ? 'Faltan ' + faltan : 'Todas completas', '#EF7C3B') +
      UI.kpi('Puntaje del área', S5.pct(promedio), promedio !== null ? S5.madurez(promedio) + ' · promedio de las S evaluadas' : 'Aún sin puntajes', '#0097CE') +
    '</div>' +
    (enCurso ? '' : '<div class="aviso ok" style="margin-bottom:14px">Auditoría cerrada. Para cambiar un puntaje registra un seguimiento en la observación que lo sustenta.</div>') +
    '<div class="conteo">Elige el N° de zona</div><div class="zonas-grid">' + tarjetas + '</div>' +
    '<div class="acciones-fin" style="margin-top:18px">' +
      (enCurso ? '<button type="button" class="btn verde grande" id="btnCerrarAud"' + (faltan && !AT.esAdmin() ? ' disabled' : '') + '>' + DR.ICONOS.checkChico +
        '<span>' + (faltan ? 'Cerrar auditoría (faltan ' + faltan + ' zona' + (faltan > 1 ? 's' : '') + ')' : 'Cerrar auditoría') + '</span></button>' : '') +
      '<button type="button" class="btn sec" id="btnObsAud">Ver observaciones de esta auditoría</button>' +
      '<button type="button" class="btn sec" id="btnResAud">Ver resultados</button></div>';

  DR.entrarPaneles('#contenido');
  DR.$('#btnVolverLista').onclick = AUD.pintarLista;
  DR.$$('[data-zona]', cont).forEach(function (b) { b.onclick = function () { AUD.abrirZona(Number(this.getAttribute('data-zona'))); }; });
  if (DR.$('#btnCerrarAud')) DR.$('#btnCerrarAud').onclick = AUD.cerrarAuditoria;
  DR.$('#btnObsAud').onclick = function () {
    OBS.filtros.estado = 'todas'; OBS.filtros.area = String(a.area_id); OBS.filtros.zona = ''; OBS.filtros.auditoria = a.id;
    DR.ir('observaciones');
  };
  DR.$('#btnResAud').onclick = function () { RESUL.auditoria = a.id; DR.ir('resultados'); };
};

AUD.cerrarAuditoria = function () {
  var a = AUD.aud, faltan = AUD.zonasVisibles().filter(function (z) {
    var f = AUD.filaResumen(z.id);
    return z.activo && !(f && f.estado_zona === 'completa');
  });
  var msg = faltan.length
    ? 'Faltan ' + faltan.length + ' zona(s): ' + faltan.map(S5.nombreZona).join(', ') + '.\n¿Cerrar la auditoría igual?'
    : '¿Cerrar la auditoría ' + a.codigo + '? Después, los puntajes solo se corrigen con seguimiento de observaciones.';
  if (!window.confirm(msg)) return;
  var btn = this;
  btn.disabled = true;
  AT.rpc('rpc_s5_cerrar_auditoria', { p_auditoria: a.id }).then(function (cerrada) {
    DR.vibrar([40, 60, 90]);
    DR.toast('Auditoría ' + cerrada.codigo + ' cerrada.');
    AUD.abrirAuditoria(cerrada);
  }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
};

/* ============================================================ EVALUACIÓN DE UNA ZONA */
AUD.abrirZona = function (zonaId, sForzada) {
  var z = S5.zona(zonaId), cont = DR.$('#contenido');
  if (!z) return;
  AUD.zona = z;
  AUD.vista = 'cargando';
  cont.innerHTML = '<div class="vacio">Cargando checklist…</div>';
  AUD.cargarZona().then(function () {
    var ev = AUD.evaluacion;
    if (!AUD.editable() || (ev && ev.estado === 'completa' && !sForzada)) { AUD.pintarResumenZona(false); return; }
    AUD.s = sForzada || Math.min(AUD.primeraSPendiente(S5.calcularZona(AUD.puntajes)), 5);
    AUD._pct = 0;
    AUD.entrarS(1);
  }).catch(function (e) { UI.error(cont, e); });
};

AUD.cargarZona = function () {
  return sb.from('s5_evaluaciones').select('*').eq('auditoria_id', AUD.aud.id).eq('zona_id', AUD.zona.id).maybeSingle().then(function (r) {
    if (r.error) throw new Error(r.error.message);
    AUD.evaluacion = r.data;
    AUD.puntajes = {};
    AUD.detalle = {};
    if (!r.data) return;
    return sb.from('s5_puntajes').select('*').eq('evaluacion_id', r.data.id).then(function (p) {
      if (p.error) throw new Error(p.error.message);
      (p.data || []).forEach(function (x) { AUD.puntajes[x.item_id] = Number(x.puntaje); AUD.detalle[x.item_id] = x; });
    });
  });
};

/** Se puede puntuar: auditoría en curso y zona sin completar, o completada pero el mismo día de la auditoría. */
AUD.editable = function () {
  var e = AUD.evaluacion;
  return AUD.aud.estado === 'en_curso' && (!e || e.estado !== 'completa' || S5.hoy() <= AUD.aud.fecha);
};

AUD.primeraSPendiente = function (calc) {
  for (var s = 1; s <= 5; s++) if (calc[s].pct === null) return s;
  return 6;
};

AUD.claveBorrador = function () { return 'agritracer.5s.borrador.' + AUD.aud.id + '.' + AUD.zona.id; };

AUD.guardarBorradorLocal = function (itemId, valor) {
  var local = S5.leerLocal(AUD.claveBorrador()) || {};
  if (valor === AUD.puntajes[itemId]) delete local[itemId]; else local[itemId] = valor;
  S5.escribirLocal(AUD.claveBorrador(), Object.keys(local).length ? local : null);
};

AUD.limpiarBorradorLocal = function (items) {
  var local = S5.leerLocal(AUD.claveBorrador()) || {};
  items.forEach(function (it) { delete local[it.id]; });
  S5.escribirLocal(AUD.claveBorrador(), Object.keys(local).length ? local : null);
};

AUD.hayCambios = function () {
  return Object.keys(AUD.borrador).some(function (k) { return AUD.borrador[k] !== AUD.puntajes[k]; });
};

/** Prepara la S actual con lo guardado en el servidor + lo que quedó sin guardar en el celular. */
AUD.entrarS = function (direccion) {
  var local = S5.leerLocal(AUD.claveBorrador()) || {}, recuperados = 0;
  AUD.vista = 'zona';
  AUD.insistir = false;
  AUD.borrador = {};
  S5.itemsDe(AUD.s).forEach(function (it) {
    if (AUD.puntajes[it.id] !== undefined) AUD.borrador[it.id] = AUD.puntajes[it.id];
    if (local[it.id] !== undefined && local[it.id] !== AUD.puntajes[it.id]) { AUD.borrador[it.id] = local[it.id]; recuperados++; }
  });
  AUD.sucio = recuperados > 0;
  AUD.pintarS(direccion);
  if (recuperados) DR.toast('Recuperamos ' + recuperados + ' puntaje(s) de ' + AUD.s + 'S que no se guardaron. Revísalos y guarda.', 'info');
};

AUD.pasosHtml = function (calc) {
  var prox = AUD.primeraSPendiente(calc);
  return [1, 2, 3, 4, 5].map(function (s) {
    var hecha = calc[s].pct !== null, actual = s === AUD.s, accesible = hecha || actual || s <= prox;
    return '<button type="button" class="paso' + (hecha ? ' hecho' : '') + (actual ? ' actual' : '') + '" data-paso="' + s + '" style="--c:' + S5.COLORES[s] + '"' +
      (accesible ? '' : ' disabled') + ' aria-label="' + s + 'S ' + S5.NOMBRES[s] + '"><i>' + (hecha && !actual ? DR.ICONOS.checkChico : s + 'S') + '</i><span>' + S5.NOMBRES[s] + '</span></button>';
  }).join('');
};

AUD.textoObs = function () {
  var n = AUD.obsAqui(AUD.zona.id).length;
  return 'Observación de la zona' + (n ? ' · ' + n + ' registrada' + (n > 1 ? 's' : '') : '');
};

AUD.pintarS = function (direccion) {
  var cont = DR.$('#contenido'), s = AUD.s, z = AUD.zona, a = AUD.aud, color = S5.COLORES[s];
  var items = S5.itemsDe(s), calc = S5.calcularZona(AUD.puntajes);
  var prox = Math.min(AUD.primeraSPendiente(calc), 5), pct = calc.completas === 5 ? 100 : Math.round((prox - 1) / 4 * 100);
  var previas = AUD.obsPrevias(z.id), guardada = calc[s].pct !== null;

  cont.innerHTML =
    '<div class="wiz-cab"><button type="button" class="wiz-volver" id="btnVolverZonas">' + DR.ICONOS.atras + '<span>Zonas</span></button>' +
    '<div class="wiz-id"><b>' + DR.esc(S5.nombreZona(z)) + '</b><span>' + DR.esc(AUD.etiqueta(a)) + '</span></div></div>' +
    '<div class="pasos cinco"><div class="pasos-pista"><div class="pasos-relleno" id="pasosRelleno" style="width:' + AUD._pct + '%"></div></div>' + AUD.pasosHtml(calc) + '</div>' +
    (previas.length ? '<button type="button" class="aviso alerta aviso-btn" id="btnPrevias"><b>' + previas.length + ' observación(es) abierta(s)</b> de auditorías anteriores en esta zona. Toca para darles seguimiento.</button>' : '') +
    '<section class="etapa" id="etapaCard" style="--c:' + color + '">' +
      '<div class="etapa-cab"><span class="etapa-num">' + s + 'S · ' + items.length + ' ítems · 0 no cumple · 1 parcial · 2 cumple</span><h2>' + S5.NOMBRES[s] + '</h2>' +
      (guardada ? '<span class="pill verde">Guardada · puedes corregirla</span>' : '') + '</div>' +
      '<div class="subtotal" id="subtotalS"></div>' +
      '<div class="items5s">' + items.map(function (it) { return S5.itemHtml(it, AUD.borrador[it.id], { color: color }); }).join('') + '</div>' +
      '<div class="avisos oculto" id="avisosS"></div>' +
      '<button type="button" class="btn sec obs-add" id="btnObsZona">' + FOTOS.ICONO + '<span>' + AUD.textoObs() + '</span></button>' +
    '</section>';

  AUD.ponerBarra();
  AUD.enlazarS(cont);
  AUD.revisar();
  if (direccion) cont.scrollTop = 0;

  var relleno = DR.$('#pasosRelleno');
  if (!DR.anima) { relleno.style.width = pct + '%'; AUD._pct = pct; return; }
  anime({ targets: relleno, width: pct + '%', duration: 750, easing: 'easeOutCubic' });
  AUD._pct = pct;
  if (direccion) {
    anime({ targets: '#etapaCard', opacity: [0, 1], translateX: [44 * direccion, 0], duration: 420, easing: 'easeOutCubic' });
    anime({ targets: '#etapaCard .item5s', opacity: [0, 1], translateY: [12, 0], duration: 380, delay: anime.stagger(45, { start: 140 }), easing: 'easeOutQuad' });
    anime({ targets: '.paso.actual i', scale: [0.55, 1], duration: 700, easing: 'easeOutElastic(1, .55)' });
  }
};

AUD.enlazarS = function (cont) {
  DR.$('#btnVolverZonas').onclick = AUD.volverZonas;
  DR.$$('.paso', cont).forEach(function (p) {
    p.onclick = function () {
      var i = Number(this.getAttribute('data-paso'));
      if (i === AUD.s || !AUD.puedeSalir()) return;
      AUD.irS(i);
    };
  });
  S5.enlazarPuntajes(cont, function (id, v) {
    AUD.borrador[id] = v;
    AUD.guardarBorradorLocal(id, v);
    AUD.sucio = AUD.hayCambios();
    AUD.revisar();
  });
  DR.$('#btnObsZona').onclick = AUD.nuevaObservacion;
  if (DR.$('#btnPrevias')) DR.$('#btnPrevias').onclick = AUD.verPrevias;
};

AUD.revisar = function () {
  var s = AUD.s, items = S5.itemsDe(s), calc = S5.calcularS(AUD.borrador, s);
  var faltan = items.filter(function (it) { return AUD.borrador[it.id] === undefined; });
  var sub = DR.$('#subtotalS');
  if (sub) {
    sub.innerHTML = '<div><span>Puntaje ' + s + 'S</span><b>' + S5.numPuntaje(calc.suma) + ' / ' + calc.max + '</b></div>' +
      '<div class="subtotal-der">' + (calc.pct !== null ? '<b>' + S5.pct(calc.pct) + '</b>' + S5.pillMadurez(calc.pct) : '<span>' + faltan.length + ' ítem(s) por puntuar</span>') + '</div>';
  }
  DR.$$('#etapaCard .item5s').forEach(function (fila) {
    var id = fila.getAttribute('data-item');
    fila.classList.toggle('falta', AUD.insistir && AUD.borrador[id] === undefined);
    fila.classList.toggle('cambiado', AUD.puntajes[id] !== undefined && AUD.borrador[id] !== AUD.puntajes[id]);
  });

  var btn = DR.$('#btnAccion'), sec = DR.$('#btnGuardarSolo');
  if (!btn) return;
  sec.classList.toggle('oculto', !AUD.sucio || faltan.length > 0);
  var modo, html;
  if (faltan.length) {
    modo = 'faltan';
    html = '<span>Puntúa ' + (faltan.length === 1 ? 'el ítem ' + faltan[0].numero : faltan.length + ' ítems más') + '</span>';
  } else if (s === 5) {
    modo = 'cerrar';
    html = DR.ICONOS.checkChico + '<span>' + (AUD.sucio ? 'Guardar y cerrar zona' : 'Ver resumen de la zona') + '</span>';
  } else {
    modo = 'continuar';
    html = '<span>' + (AUD.sucio ? 'Guardar y continuar · ' : 'Continuar · ') + '<b>' + (s + 1) + 'S ' + S5.NOMBRES[s + 1] + '</b></span>' + DR.ICONOS.chevron;
  }
  btn.setAttribute('data-modo', modo);
  btn.className = 'btn grande accion-' + (modo === 'faltan' ? 'fundo' : 'continuar') + (AUD.guardando ? ' cargando' : '');
  btn.style.setProperty('--c', S5.COLORES[s]);
  btn.innerHTML = html;

  var avisos = DR.$('#avisosS');
  if (AUD.insistir && faltan.length) {
    avisos.innerHTML = '<b>Faltan ítems por puntuar</b><ul>' + faltan.map(function (it) { return '<li>' + it.numero + '. ' + DR.esc(DR.recortar(it.texto, 70)) + '</li>'; }).join('') + '</ul>';
    avisos.classList.remove('oculto');
  } else {
    avisos.classList.add('oculto');
  }
};

AUD.ponerBarra = function () {
  var barra = DR.$('#barraAccion'), nueva = !barra;
  if (nueva) { barra = document.createElement('div'); barra.id = 'barraAccion'; document.body.appendChild(barra); }
  barra.innerHTML = '<button type="button" class="btn sec oculto" id="btnGuardarSolo">Guardar</button><button type="button" class="btn grande" id="btnAccion"></button>';
  DR.$('#contenido').classList.add('con-barra');
  DR.$('#btnGuardarSolo').onclick = function () { AUD.guardarS({ avanzar: false }); };
  DR.$('#btnAccion').onclick = AUD.accionPrincipal;
  if (nueva && DR.anima) anime({ targets: barra, translateY: [70, 0], opacity: [0, 1], duration: 450, easing: 'easeOutCubic' });
};

AUD.quitarBarra = function () {
  var b = DR.$('#barraAccion');
  if (b) b.remove();
  var c = DR.$('#contenido');
  if (c) c.classList.remove('con-barra');
};

AUD.accionPrincipal = function () {
  DR.desbloquearAudio();
  if (AUD.guardando) return;
  if (DR.$('#btnAccion').getAttribute('data-modo') === 'faltan') {
    AUD.insistir = true;
    AUD.revisar();
    var primero = DR.$('#etapaCard .item5s.falta');
    if (primero) {
      primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (DR.anima) anime({ targets: primero, translateX: [-10, 10, -6, 0], duration: 420, easing: 'easeInOutSine' });
    }
    DR.vibrar([30, 40, 30]);
    return;
  }
  AUD.guardarS({ avanzar: true });
};

AUD.irS = function (i) {
  var dir = i >= AUD.s ? 1 : -1, card = DR.$('#etapaCard');
  if (!DR.anima || !card) { AUD.s = i; AUD.entrarS(dir); return; }
  anime.remove(card);
  anime({ targets: card, opacity: [1, 0], translateX: [0, -44 * dir], duration: 190, easing: 'easeInQuad',
    complete: function () { AUD.s = i; AUD.entrarS(dir); } });
};

AUD.guardarS = function (opc) {
  if (AUD.guardando) return;
  var s = AUD.s, items = S5.itemsDe(s);
  var yaGuardada = !AUD.sucio && S5.calcularS(AUD.puntajes, s).pct !== null;
  var promesa;
  if (yaGuardada) {
    promesa = Promise.resolve(null);
  } else {
    AUD.guardando = true;
    AUD.revisar();
    promesa = AT.rpc('rpc_s5_guardar_s', {
      p_auditoria: AUD.aud.id, p_zona: AUD.zona.id, p_s: s,
      p_puntajes: items.map(function (it) { return { item_id: it.id, puntaje: AUD.borrador[it.id] }; })
    });
  }

  promesa.then(function (estado) {
    if (estado) {
      items.forEach(function (it) {
        AUD.puntajes[it.id] = AUD.borrador[it.id];
        if (AUD.detalle[it.id]) { AUD.detalle[it.id].corregido_en = null; AUD.detalle[it.id].puntaje_original = AUD.borrador[it.id]; }
      });
      AUD.evaluacion = AUD.evaluacion || {};
      AUD.evaluacion.id = estado.id;
      AUD.evaluacion.estado = estado.estado;
      AUD.limpiarBorradorLocal(items);
      AUD.sucio = false;
      DR.vibrar(40);
      DR.sonar(true);
    }
    AUD.guardando = false;
    if (!opc.avanzar) { DR.toast(s + 'S guardada.'); AUD.pintarS(0); return; }
    if (s < 5) {
      if (estado) DR.toast(s + 'S guardada · ' + S5.pct(S5.calcularS(AUD.puntajes, s).pct) + '. Sigue ' + (s + 1) + 'S ' + S5.NOMBRES[s + 1] + '.');
      AUD.irS(s + 1);
      return;
    }
    var pendiente = AUD.primeraSPendiente(S5.calcularZona(AUD.puntajes));
    if (pendiente <= 5) { DR.toast('Falta completar ' + pendiente + 'S ' + S5.NOMBRES[pendiente] + '.', 'error'); AUD.irS(pendiente); return; }
    if (AUD.evaluacion.estado === 'completa') { AUD.pintarResumenZona(!!estado); return; }
    AUD.guardando = true;
    AUD.revisar();
    return AT.rpc('rpc_s5_completar_zona', { p_evaluacion: AUD.evaluacion.id }).then(function (fin) {
      AUD.guardando = false;
      AUD.evaluacion.estado = fin.estado;
      AUD.pintarResumenZona(true);
    });
  }).catch(function (err) {
    AUD.guardando = false;
    AUD.revisar();
    DR.vibrar([60, 40, 60]);
    DR.toast('No se guardó: ' + err.message, 'error');
  });
};

AUD.volverZonas = function () {
  if (!AUD.puedeSalir()) return;
  AUD.sucio = false;
  AUD.abrirAuditoria(AUD.aud);
};

/* ============================================================ OBSERVACIONES DESDE LA ZONA */
AUD.nuevaObservacion = function () {
  OBS.abrirFormulario({ auditoria: AUD.aud, zona: AUD.zona, s: AUD.vista === 'zona' ? AUD.s : null, alGuardar: function (o) {
    o.s5_auditorias = { codigo: AUD.aud.codigo, numero_auditoria: AUD.aud.numero_auditoria, area_id: AUD.aud.area_id, cultivo_id: AUD.aud.cultivo_id, fecha: AUD.aud.fecha, estado: AUD.aud.estado };
    AUD.obsArea.push(o);
    DR.$$('#btnObsZona span, #btnObsZona2 span').forEach(function (el) { el.textContent = AUD.textoObs(); });
  } });
};

AUD.verPrevias = function () {
  OBS.hojaLista('Abiertas de auditorías anteriores', AUD.obsPrevias(AUD.zona.id), { alCambiar: function (n) {
    AUD.obsArea.forEach(function (o, i) { if (o.id === n.id) { n.s5_auditorias = o.s5_auditorias; AUD.obsArea[i] = n; } });
  } });
};

/* ============================================================ RESUMEN DE LA ZONA */
AUD.pintarResumenZona = function (celebrar) {
  var cont = DR.$('#contenido'), a = AUD.aud, z = AUD.zona;
  AUD.vista = 'resumenZona';
  AUD.sucio = false;
  AUD.quitarBarra();
  cont.innerHTML = '<div class="vacio">Calculando…</div>';
  AT.rpc('fn_s5_resumen', { p_auditoria: a.id }).then(function (r) { AUD.resumen = r || []; }).catch(function () { /* se usa lo que había */ }).then(function () {
    if (AUD.vista !== 'resumenZona' || AUD.zona !== z) return;
    var porS = OBS.porS(AUD.puntajes), ev = AUD.evaluacion, completa = ev && ev.estado === 'completa';
    var aqui = AUD.obsAqui(z.id), editableHoy = a.estado === 'en_curso' && (!completa || S5.hoy() <= a.fecha);
    var siguiente = AUD.zonasVisibles().filter(function (x) {
      var f = AUD.filaResumen(x.id);
      return x.activo && x.id !== z.id && !(f && f.estado_zona === 'completa');
    })[0];
    var corregidos = Object.keys(AUD.detalle).filter(function (k) { return AUD.detalle[k].corregido_en; });
    var detalleS = [1, 2, 3, 4, 5].map(function (s) {
      var items = S5.itemsDe(s, true).filter(function (it) { return AUD.puntajes[it.id] !== undefined; });
      return '<details class="grupo-s" style="--c:' + S5.COLORES[s] + '"><summary><span>' + s + 'S · ' + S5.NOMBRES[s] + '</span><b>' + S5.pct(porS[s]) + '</b></summary>' +
        (items.length ? items.map(function (it) {
          var d = AUD.detalle[it.id], obs = d && d.observacion_id ? AUD.obsArea.filter(function (o) { return o.id === d.observacion_id; })[0] : null;
          return '<div class="item-lectura"><span class="item5s-num">' + it.numero + '</span><span>' + DR.esc(it.texto) +
            (d && d.corregido_en ? '<small>Corregido: ' + S5.numPuntaje(d.puntaje_original) + ' → ' + S5.numPuntaje(d.puntaje) + (obs ? ' · Obs. N° ' + obs.numero : '') + '</small>' : '') +
            '</span><b class="pt-lectura" data-v="' + S5.numPuntaje(AUD.puntajes[it.id]) + '">' + S5.numPuntaje(AUD.puntajes[it.id]) + '</b></div>';
        }).join('') : '<div class="vacio">Sin puntajes.</div>') + '</details>';
    }).join('');

    cont.scrollTop = 0;
    cont.innerHTML =
      '<div class="fin-ciclo">' +
        (celebrar ? '<svg class="fin-check" viewBox="0 0 120 120" aria-hidden="true"><circle class="fin-aro" cx="60" cy="60" r="52"/><path class="fin-trazo" d="M37 62l15 15 32-34"/></svg>' : '') +
        '<div class="ruta">' + (completa ? 'Zona completa' : 'Zona en curso') + '</div><h1>' + DR.esc(S5.nombreZona(z)) + '</h1>' +
        '<p>' + DR.esc(AUD.etiqueta(a)) + '</p></div>' +
      '<div class="kpis">' +
        UI.kpi('Calificación', S5.pct(porS.total), porS.total !== null ? S5.madurez(porS.total) + ' · promedio de las 5 S' : 'Faltan S por evaluar', '#76B729') +
        UI.kpi('Observaciones', DR.num(aqui.length), 'En esta auditoría · ' + AUD.obsPrevias(z.id).length + ' abiertas anteriores', '#EF7C3B') +
      '</div>' +
      UI.panel('Puntaje por S', 'SUMA / (n° de ítems × 2), igual que el CHECK LIST' + (corregidos.length ? ' · ' + corregidos.length + ' ítem(s) corregido(s) por seguimiento' : ''), S5.barrasS(porS)) +
      UI.panel('Checklist de la zona', 'Toca una S para ver cada ítem', detalleS) +
      '<div class="acciones-fin">' +
        (siguiente && a.estado === 'en_curso' ? '<button type="button" class="btn verde grande" id="btnSigZona"><span>Siguiente zona: <b>' + DR.esc(S5.nombreZona(siguiente)) + '</b></span>' + DR.ICONOS.chevron + '</button>' : '') +
        (a.estado !== 'anulada' ? '<button type="button" class="btn sec" id="btnObsZona2">' + FOTOS.ICONO + '<span>' + AUD.textoObs() + '</span></button>' : '') +
        '<button type="button" class="btn sec" id="btnVerZonas">Volver a zonas</button>' +
        (editableHoy ? '<button type="button" class="btn sec" id="btnCorregirS">Corregir una S</button>'
          : '<div class="ayuda">Para cambiar un puntaje registra un seguimiento en la observación que lo sustenta (pestaña Observaciones).</div>') +
      '</div>';

    S5.animarBarras(cont);
    if (DR.$('#btnSigZona')) DR.$('#btnSigZona').onclick = function () { AUD.abrirZona(siguiente.id); };
    if (DR.$('#btnObsZona2')) DR.$('#btnObsZona2').onclick = AUD.nuevaObservacion;
    DR.$('#btnVerZonas').onclick = function () { AUD.abrirAuditoria(a); };
    if (DR.$('#btnCorregirS')) DR.$('#btnCorregirS').onclick = function () { AUD.s = 1; AUD._pct = 0; AUD.entrarS(1); };
    if (celebrar) {
      DR.vibrar([40, 60, 90]);
      if (DR.anima) {
        anime({ targets: '.fin-check', scale: [0.4, 1], opacity: [0, 1], duration: 800, easing: 'easeOutElastic(1, .6)' });
        anime({ targets: '.fin-trazo', strokeDashoffset: [anime.setDashoffset, 0], duration: 700, delay: 250, easing: 'easeInOutQuad' });
      }
    }
    DR.entrarPaneles('#contenido');
  });
};
