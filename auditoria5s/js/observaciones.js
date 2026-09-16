/* ============================================================================
 * observaciones.js — HOJA «OBSERVACIONES» DEL EXCEL, CON SEGUIMIENTO
 * Siempre de UN cultivo. Registro libre por zona (foto «Antes» obligatoria),
 * vista en tarjetas o en tabla con el formato del Excel manual, descarga del
 * Excel con ese formato, detalle con línea de tiempo y seguimiento: nuevo
 * estado, nota, foto «Después» y sobrescritura del puntaje en formato
 * checklist dentro del plazo (S5_DIAS_CORRECCION) o por un administrador.
 * ==========================================================================*/
var OBS = {
  filtros: { estado: 'abiertas', area: '', zona: '', auditoria: '', vista: S5.leerLocal('agritracer.5s.vistaObs') || 'tarjetas' },
  lista: [], auds: {}, notas: {}, notasPedidas: {}, form: null, seg: null, LIMITE: 150,
  // Colores de estado del formato condicional del Excel manual.
  COLOR_XL: { 'Pendiente': ['#9DC3E6', '#14100C'], 'En ejecución': ['#ED7D31', '#FFFFFF'], 'Cancelado': ['#FF0000', '#FFFFFF'],
    'Cerrado': ['#92D050', '#FFFFFF'], 'Recomendación': ['#FFC000', '#FFFFFF'], 'Stand By': ['#BDD7EE', '#14100C'] }
};

VISTAS.observaciones = function (cont) {
  S5.cargar().then(OBS.cargar).then(function () { OBS.pintar(true); }).catch(function (e) { UI.error(cont, e); });
};

OBS.cargar = function () {
  return Promise.all([
    sb.from('s5_auditorias').select('id,codigo,cultivo_id,area_id,numero_auditoria,tipo,fecha,estado,campana').order('fecha', { ascending: false }).limit(2000),
    sb.from('s5_observaciones').select('*').order('fecha_registro', { ascending: false }).order('numero', { ascending: false }).limit(3000)
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    if (r[1].error) throw new Error(r[1].error.message);
    OBS.auds = {};
    (r[0].data || []).forEach(function (a) { OBS.auds[a.id] = a; });
    // La observación vive en la zona: sin auditoría de origen también cuenta; con una anulada, no.
    OBS.lista = (r[1].data || []).filter(function (o) {
      if (!o.auditoria_id) return true;
      var a = OBS.auds[o.auditoria_id];
      return a && a.estado !== 'anulada';
    });
  });
};

OBS.buscar = function (id) { return OBS.lista.filter(function (o) { return o.id === id; })[0] || null; };
/** Auditoría de origen (puede no existir: las registradas fuera de una auditoría). */
OBS.audDe = function (o) { return o.s5_auditorias || OBS.auds[o.auditoria_id] || {}; };

OBS.reemplazar = function (o) {
  var i = OBS.lista.map(function (x) { return x.id; }).indexOf(o.id);
  if (i > -1) OBS.lista[i] = o; else OBS.lista.unshift(o);
  delete OBS.notasPedidas[o.id];
  if (DR.vista === 'observaciones') OBS.pintar(false);
};

OBS.coincide = function (o, sinEstado) {
  var f = OBS.filtros;
  if (S5.cultivoDeObs(o) !== S5.cultivoId()) return false;
  if (f.area && String(S5.areaDeObs(o)) !== String(f.area)) return false;
  if (f.zona && String(o.zona_id) !== String(f.zona)) return false;
  if (f.auditoria && o.auditoria_id !== f.auditoria) return false;
  if (sinEstado || f.estado === 'todas') return true;
  if (f.estado === 'abiertas') return S5.ABIERTOS.indexOf(o.estado) > -1;
  return o.estado === f.estado;
};

/** Selección única en un grupo de .opcion (los botones .agregar no son opciones); alElegir(valor). */
OBS.chips = function (sel, alElegir) {
  var grupo = DR.$(sel);
  if (!grupo) return;
  grupo.onclick = function (ev) {
    var b = ev.target.closest('.opcion');
    if (!b || b.classList.contains('agregar')) return;
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
  var cont = DR.$('#contenido'), f = OBS.filtros, cul = S5.cultivoActual();
  if (DR.vista !== 'observaciones' || !cont) return;
  var base = OBS.lista.filter(function (o) { return OBS.coincide(o, true); });
  var visibles = base.filter(function (o) { return OBS.coincide(o); });
  var cuenta = function (fn) { return base.filter(fn).length; };
  var chips = [{ id: 'abiertas', t: 'Abiertas', n: cuenta(function (o) { return S5.ABIERTOS.indexOf(o.estado) > -1; }) }]
    .concat(S5.ESTADOS.map(function (e) { return { id: e, t: e, n: cuenta(function (o) { return o.estado === e; }) }; }))
    .concat([{ id: 'todas', t: 'Todas', n: base.length }]);
  var auds = Object.keys(OBS.auds).map(function (k) { return OBS.auds[k]; }).filter(function (a) {
    return a.estado !== 'anulada' && a.cultivo_id === S5.cultivoId() && (!f.area || String(a.area_id) === String(f.area));
  });
  var op = function (valor, texto, actual) {
    return '<option value="' + DR.esc(valor) + '"' + (String(valor) === String(actual) ? ' selected' : '') + '>' + DR.esc(texto) + '</option>';
  };
  var muestra = visibles.slice(0, OBS.LIMITE);

  cont.innerHTML = UI.encabezado('Auditoría 5S', 'Observaciones', 'Sustento de los puntajes. Registra el seguimiento de cada hallazgo y, si ya se levantó dentro del plazo, corrige el puntaje del checklist.') +
    S5.selectorCultivoHtml() +
    '<div class="filtros5s entra">' +
      '<select id="fArea" aria-label="Área">' + op('', 'Todas las áreas', f.area) + (cul ? S5.areasDe(cul.id, true) : []).map(function (a) { return op(a.id, a.nombre, f.area); }).join('') + '</select>' +
      '<select id="fZona" aria-label="Zona"' + (f.area ? '' : ' disabled') + '>' + op('', f.area ? 'Todas las zonas' : 'Zona: elige un área', f.zona) +
        (f.area && cul ? S5.zonasDe(f.area, true, cul.id).map(function (z) { return op(z.id, S5.nombreZona(z), f.zona); }).join('') : '') + '</select>' +
      '<select id="fAud" aria-label="Auditoría">' + op('', 'Todas las auditorías', f.auditoria) + auds.map(function (a) {
        return op(a.id, a.codigo + ' · ' + ((S5.area(a.area_id) || {}).nombre || '') + ' N° ' + a.numero_auditoria + ' · ' + S5.fecha(a.fecha), f.auditoria);
      }).join('') + '</select>' +
    '</div>' +
    '<div class="chips entra">' + chips.map(function (c) {
      return '<button type="button" class="filtro' + (f.estado === c.id ? ' activo' : '') + '" data-estado="' + DR.esc(c.id) + '">' + DR.esc(c.t) + '<small>' + c.n + '</small></button>';
    }).join('') + '</div>' +
    '<div class="obs-herramientas"><div class="vista-toggle" role="tablist">' +
      '<button type="button" data-vista-obs="tarjetas"' + (f.vista === 'tarjetas' ? ' class="activo"' : '') + '>Tarjetas</button>' +
      '<button type="button" data-vista-obs="tabla"' + (f.vista === 'tabla' ? ' class="activo"' : '') + '>Tabla</button></div>' +
      (AT.puedeCapturar() ? '<button type="button" class="btn verde chico" id="btnNuevaObs">' + FOTOS.ICONO + '<span>Nueva observación</span></button>' : '') +
      '<button type="button" class="btn azul chico" id="btnExcelObs"' + (visibles.length ? '' : ' disabled') + '>' + DR.ICONOS.subir + '<span>Descargar Excel</span></button></div>' +
    '<div class="conteo">' + visibles.length + ' observación(es) de ' + DR.esc(cul ? cul.nombre : '') + (visibles.length > OBS.LIMITE ? ' · se muestran las ' + OBS.LIMITE + ' más recientes (el Excel incluye todas)' : '') + '</div>' +
    '<div id="listaObs">' + (visibles.length
      ? (f.vista === 'tabla' ? OBS.tablaHtml(muestra) : muestra.map(OBS.tarjetaHtml).join(''))
      : '<div class="vacio">' + (base.length ? 'Ninguna observación coincide con los filtros.' : 'Aún no hay observaciones de este cultivo. Se registran desde Auditar, dentro de cada zona, o con «Nueva observación».') + '</div>') + '</div>';

  if (animar) DR.entrarPaneles('#contenido');
  FOTOS.pintar('#listaObs');
  S5.enlazarSelectorCultivo(cont, function () { f.area = ''; f.zona = ''; f.auditoria = ''; OBS.pintar(true); });
  DR.$('#fArea').onchange = function () { f.area = this.value; f.zona = ''; f.auditoria = ''; OBS.pintar(false); };
  DR.$('#fZona').onchange = function () { f.zona = this.value; OBS.pintar(false); };
  DR.$('#fAud').onchange = function () { f.auditoria = this.value; OBS.pintar(false); };
  DR.$$('[data-estado]', cont).forEach(function (b) { b.onclick = function () { f.estado = this.getAttribute('data-estado'); OBS.pintar(false); }; });
  DR.$$('[data-vista-obs]', cont).forEach(function (b) {
    b.onclick = function () { f.vista = this.getAttribute('data-vista-obs'); S5.escribirLocal('agritracer.5s.vistaObs', f.vista); OBS.pintar(false); };
  });
  DR.$('#btnExcelObs').onclick = OBS.descargarExcel;
  if (DR.$('#btnNuevaObs')) DR.$('#btnNuevaObs').onclick = function () { OBS.abrirFormulario({ areaId: f.area, zonaId: f.zona }); };
  DR.$$('[data-obs]', cont).forEach(function (b) {
    b.onclick = function () { var o = OBS.buscar(this.getAttribute('data-obs')); if (o) OBS.abrirDetalle(o); };
  });
  if (f.vista === 'tabla' && muestra.length) OBS.completarNotas(muestra);
};

OBS.tarjetaHtml = function (o) {
  var a = OBS.audDe(o), z = S5.zona(o.zona_id), area = S5.area(S5.areaDeObs(o)) || {};
  var abierta = S5.ABIERTOS.indexOf(o.estado) > -1, fotos = S5.fotosDe(o, 'antes');
  return '<button type="button" class="obs-card" data-obs="' + o.id + '" style="--c:' + (S5.COLOR_ESTADO[o.estado] || '#A89A8C') + '">' +
    '<span class="foto-con-n">' + (fotos.length > 1 ? '<i>' + fotos.length + '</i>' : '') +
    '<img class="foto-mini" alt="" data-foto="' + DR.esc(fotos[0] || '') + '"></span>' +
    '<span class="obs-cuerpo"><span class="obs-top"><b>N° ' + o.numero + ' · ' + DR.esc(S5.nombreZona(z)) + '</b>' + S5.pillEstado(o.estado) + '</span>' +
    '<span class="obs-texto">' + DR.esc(DR.recortar(o.descripcion, 140)) + '</span>' +
    '<span class="obs-det">' + [area.nombre, a.codigo, S5.fecha(o.fecha_registro)].filter(Boolean).map(DR.esc).join(' · ') +
      (abierta ? ' · hace ' + S5.diasDesde(o.fecha_registro) + ' d' : '') + '</span></span></button>';
};

/** Tabla con las columnas de la hoja Observaciones del Excel (+ Área cuando se ven todas). */
OBS.tablaHtml = function (lista) {
  var conArea = !OBS.filtros.area;
  var titulos = ['N°', 'Semana', 'Fecha de Registro'].concat(conArea ? ['Área'] : []).concat(['Zona', 'Observaciones', 'Acción correctiva', 'Estado', 'Fecha de cierre', 'Antes', 'Después']);
  var foto = function (o, tipo) { return FOTOS.galeriaHtml(S5.fotosDe(o, tipo), 'foto-celda'); };
  return '<div class="tabla-cont tabla-obs-cont"><table class="tabla-obs"><thead><tr>' + titulos.map(function (t) { return '<th>' + t + '</th>'; }).join('') + '</tr></thead><tbody>' +
    lista.map(function (o) {
      var z = S5.zona(o.zona_id) || {}, col = OBS.COLOR_XL[o.estado] || ['#A89A8C', '#FFFFFF'];
      return '<tr data-obs="' + o.id + '"><td class="centro">' + o.numero + '</td><td class="centro">' + DR.esc(o.semana) + '</td><td class="centro">' + S5.fecha(o.fecha_registro) + '</td>' +
        (conArea ? '<td class="centro">' + DR.esc((S5.area(S5.areaDeObs(o)) || {}).nombre || '') + '</td>' : '') +
        '<td class="centro">' + DR.esc(z.nombre || '') + '</td>' +
        '<td class="txt">' + DR.esc(o.descripcion) + '</td>' +
        '<td class="txt" data-accion="' + o.id + '">' + DR.esc(OBS.accionConNotas(o)) + '</td>' +
        '<td class="centro"><span class="estado-xl" style="background:' + col[0] + ';color:' + col[1] + '">' + DR.esc(o.estado) + '</span></td>' +
        '<td class="centro">' + (o.fecha_cierre ? S5.fecha(o.fecha_cierre) : '') + '</td>' +
        '<td class="foto">' + foto(o, 'antes') + '</td><td class="foto">' + foto(o, 'despues') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
};

/** «Acción correctiva // nota de seguimiento // …», como se escribía en el Excel. */
OBS.accionConNotas = function (o) {
  return [o.accion_correctiva].concat(OBS.notas[o.id] || []).filter(Boolean).join(' // ');
};

OBS.completarNotas = function (lista) {
  var faltan = lista.filter(function (o) { return !OBS.notasPedidas[o.id]; }).map(function (o) { return o.id; });
  if (!faltan.length) return;
  faltan.forEach(function (id) { OBS.notasPedidas[id] = true; });
  INF.notasDe(faltan).then(function (mapa) {
    faltan.forEach(function (id) {
      OBS.notas[id] = mapa[id] || [];
      var td = DR.$('[data-accion="' + id + '"]'), o = OBS.buscar(id);
      if (td && o) td.textContent = OBS.accionConNotas(o);
    });
  }).catch(function () { faltan.forEach(function (id) { delete OBS.notasPedidas[id]; }); });
};

OBS.descargarExcel = function () {
  var btn = this, cul = S5.cultivoActual(), f = OBS.filtros, original = btn.innerHTML;
  var lista = OBS.lista.filter(function (o) { return OBS.coincide(o); });
  if (!cul || !lista.length) { DR.toast('No hay observaciones con estos filtros.', 'error'); return; }
  // Auditorías del área y cultivo filtrados (también las sin observaciones) para la hoja BD.
  var auds = {};
  Object.keys(OBS.auds).forEach(function (k) {
    var a = OBS.auds[k];
    if (a.estado !== 'anulada' && a.cultivo_id === cul.id && (!f.area || String(a.area_id) === String(f.area)) && (!f.auditoria || a.id === f.auditoria)) auds[k] = a;
  });
  // El Excel agrupa por el área de la observación, no por la de su auditoría.
  btn.disabled = true;
  INF.excelObservaciones({ cultivo: cul, obs: lista, auds: auds, areaId: f.area || null, alProgreso: function (t) { btn.textContent = t; } }).then(function (blob) {
    var area = f.area ? (S5.area(f.area) || {}).nombre : 'Todas las áreas';
    INF.descargar(blob, INF.nombreArchivo(['Auditoría 5S', cul.nombre, area, 'Observaciones', S5.fecha(S5.hoy()).replace(/\//g, '-')], 'xlsx'));
    DR.toast('Excel descargado: ' + lista.length + ' observación(es).');
  }).catch(function (e) {
    DR.toast('No se generó el Excel: ' + e.message, 'error');
  }).then(function () {
    btn.disabled = false;
    btn.innerHTML = original;
  });
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
    o.auditoria_id ? sb.from('s5_auditorias').select('*').eq('id', o.auditoria_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('s5_seguimientos').select('*').eq('observacion_id', o.id).order('fecha')
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    OBS.pintarDetalle(r[0].data, r[1].data, r[2].data || [], opc);
  }).catch(function (e) { UI.cerrarHoja(); DR.toast(e.message, 'error'); });
};

OBS.pintarDetalle = function (o, a, segs, opc) {
  a = a || {};
  var z = S5.zona(o.zona_id) || {}, area = S5.area(S5.areaDeObs(o)) || {}, cul = S5.cultivo(S5.cultivoDeObs(o));
  var puede = AT.puedeCapturar() && a.estado !== 'anulada';
  var editable = puede && (AT.esAdmin() || S5.enPlazoObs(o));
  var figura = function (titulo, tipo) {
    var fotos = S5.fotosDe(o, tipo);
    return fotos.length
      ? '<figure>' + FOTOS.galeriaHtml(fotos, 'foto-grupo') + '<figcaption>' + titulo + (fotos.length > 1 ? ' (' + fotos.length + ')' : '') + '</figcaption></figure>'
      : '<figure class="sin-foto"><span>' + FOTOS.ICONO + 'Sin foto</span><figcaption>' + titulo + '</figcaption></figure>';
  };
  var linea = segs.map(function (sg) {
    var cambios = (sg.cambios_puntaje || []).map(function (c) {
      return c.s + 'S-' + c.numero + ': ' + S5.numPuntaje(c.antes) + ' → ' + S5.numPuntaje(c.despues);
    }).join(' · ');
    var suyas = (sg.fotos && sg.fotos.length ? sg.fotos : [sg.foto]).filter(function (r) { return r && S5.fotosDe(o, 'antes').indexOf(r) < 0; });
    var foto = suyas.length ? FOTOS.galeriaHtml(suyas, 'foto-grupo chico') : '';
    return '<li style="--c:' + (S5.COLOR_ESTADO[sg.estado_nuevo] || '#A89A8C') + '">' +
      '<span class="lt-fecha">' + DR.fechaHora(sg.fecha) + (sg.usuario_nombre ? ' · ' + DR.esc(sg.usuario_nombre) : '') + '</span>' +
      '<b>' + (sg.estado_anterior && sg.estado_anterior !== sg.estado_nuevo ? DR.esc(sg.estado_anterior) + ' → ' : '') + DR.esc(sg.estado_nuevo) + '</b>' +
      (sg.nota ? '<span>' + DR.esc(sg.nota) + '</span>' : '') +
      (cambios ? '<span class="lt-cambio">Puntaje corregido · ' + DR.esc(cambios) + '</span>' : '') + foto + '</li>';
  }).join('');

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="obs-cab">' + S5.pillEstado(o.estado) +
      '<span>' + (a.codigo ? DR.esc(a.codigo) + ' · Auditoría N° ' + a.numero_auditoria : 'Registrada fuera de una auditoría') + '</span></div>' +
    '<div class="res-nombre">Observación N° ' + o.numero + '</div>' +
    '<div class="res-dni" style="letter-spacing:.02em">' + DR.esc([cul ? cul.nombre : '', area.nombre, S5.nombreZona(z)].filter(Boolean).join(' · ')) + (o.s_referencia ? ' · ' + o.s_referencia + 'S ' + S5.NOMBRES[o.s_referencia] : '') + '</div>' +
    '<div class="fotos-par">' + figura('Antes', 'antes') + figura('Después', 'despues') + '</div>' +
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
  var o = opc.observacion || null;
  var a = opc.auditoria || (o && o.auditoria_id ? OBS.auds[o.auditoria_id] : null) || null;
  var cul = S5.cultivoActual();
  var z = opc.zona || (o ? S5.zona(o.zona_id) : null) || (opc.zonaId ? S5.zona(opc.zonaId) : null) || null;
  // Sin auditoría y sin zona fija se elige área y zona: la observación vive en la zona.
  var libre = !a && !opc.zona;
  var st = OBS.form = {
    id: o ? o.id : S5.uuid(), fotos: [], estado: 'Pendiente', s: o ? o.s_referencia : (opc.s || null),
    areaId: (z ? z.area_id : null) || opc.areaId || '', zonaId: z ? z.id : ''
  };
  if (o) st.fotos = S5.fotosDe(o, 'antes').map(function (r) { return { ruta: r }; });
  var chipsS = [{ v: '', t: 'Ninguna' }].concat([1, 2, 3, 4, 5].map(function (s) { return { v: s, t: s + 'S' }; }));
  var op = function (valor, texto, actual) {
    return '<option value="' + DR.esc(valor) + '"' + (String(valor) === String(actual) ? ' selected' : '') + '>' + DR.esc(texto) + '</option>';
  };
  var zonasDe = function (areaId) { return areaId && cul ? S5.zonasDe(areaId, false, cul.id) : []; };

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + FOTOS.ICONO + '<span>' + (o ? 'Editar observación N° ' + o.numero : 'Nueva observación') + '</span></div>' +
    '<div class="res-nombre">' + DR.esc(z ? S5.nombreZona(z) : (cul ? cul.nombre : 'Observación')) + '</div>' +
    '<div class="res-dni" style="letter-spacing:.02em">' + DR.esc(a ? AUD.etiqueta(a) : (cul ? cul.nombre + ' · sin auditoría (queda en la zona)' : '')) + '</div>' +
    '<div class="form" style="margin-top:14px">' +
      (libre ? '<div class="campo ancho"><label for="obsArea">Área<em>obligatorio</em></label>' +
        '<select id="obsArea">' + op('', 'Elige el área', st.areaId) +
        (cul ? S5.areasDe(cul.id) : []).map(function (x) { return op(x.id, x.nombre, st.areaId); }).join('') + '</select></div>' +
        '<div class="campo ancho"><label for="obsZona">Zona<em>obligatorio</em></label>' +
        '<select id="obsZona"' + (st.areaId ? '' : ' disabled') + '>' + op('', st.areaId ? 'Elige la zona' : 'Primero elige el área', st.zonaId) +
        zonasDe(st.areaId).map(function (x) { return op(x.id, S5.nombreZona(x), st.zonaId); }).join('') + '</select></div>' : '') +
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
      '<div class="campo ancho"><label>Fotos «Antes»' + (o ? '' : '<em>obligatorio</em>') + '</label>' +
        FOTOS.campoMultiHtml('obsFoto', 'Agregar foto', 'Evidencia del hallazgo · hasta ' + FOTOS.MAX) + '</div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="obsCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="obsGuardar" style="flex:1">' + (o ? 'Guardar cambios' : 'Registrar observación') + '</button></div>', { fija: true });

  FOTOS.enlazarLista('obsFoto', st.fotos, FOTOS.MAX);
  if (libre) {
    DR.$('#obsArea').onchange = function () {
      st.areaId = this.value;
      st.zonaId = '';
      var sel = DR.$('#obsZona');
      sel.disabled = !st.areaId;
      sel.innerHTML = op('', st.areaId ? 'Elige la zona' : 'Primero elige el área', '') +
        zonasDe(st.areaId).map(function (x) { return op(x.id, S5.nombreZona(x), ''); }).join('');
    };
    DR.$('#obsZona').onchange = function () { st.zonaId = this.value; };
  }
  OBS.chips('#obsEstado', function (v) { st.estado = v; });
  OBS.chips('#obsS', function (v) { st.s = v ? Number(v) : null; });
  DR.$('#obsCancelar').onclick = function () {
    if (o) OBS.abrirDetalle(o); else UI.cerrarHoja();
  };
  DR.$('#obsGuardar').onclick = function () {
    var btn = this, desc = DR.$('#obsDesc').value.trim();
    var zonaId = z ? z.id : Number(st.zonaId);
    if (!zonaId) { DR.toast('Elige el área y la zona de la observación.', 'error'); return; }
    if (!desc) { DR.toast('Describe la observación.', 'error'); DR.$('#obsDesc').focus(); return; }
    if (!st.fotos.length) {
      DR.toast('Toma la foto «Antes»: es el sustento del hallazgo.', 'error');
      DR.$('#obsFotoZona').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    DR.desbloquearAudio();
    btn.disabled = true;
    btn.classList.add('cargando');
    btn.textContent = st.fotos.some(function (f) { return !f.ruta; }) ? 'Subiendo fotos…' : 'Guardando…';
    // La ruta ya no depende de la auditoría: la observación vive en la zona.
    var base = 'obs/' + (cul ? cul.id : 0) + '/' + zonaId + '/' + st.id + '-antes';
    FOTOS.subirLista(st.fotos, base).then(function (rutas) {
      btn.textContent = 'Guardando…';
      return AT.rpc('rpc_s5_guardar_observacion', { p: {
        id: st.id, auditoria_id: a ? a.id : null, zona_id: zonaId, descripcion: desc, accion_correctiva: DR.$('#obsAccion').value.trim(),
        estado: st.estado, s_referencia: st.s || null, fotos_antes: rutas
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
  var st = OBS.seg = { o: o, a: a || null, z: z, opc: opc || {}, estado: o.estado, fotos: [], corregir: false, cargado: false, ev: null, puntajes: {}, detalle: {}, nuevos: {} };
  var limite = S5.limiteObs(o), enPlazo = S5.enPlazoObs(o), puedeCorregir = AT.esAdmin() || enPlazo;
  var ayudaPlazo = enPlazo
    ? 'Disponible hasta el ' + S5.fecha(limite) + ' (' + S5.diasCorreccion() + ' días desde el registro).'
    : (AT.esAdmin() ? 'El plazo venció el ' + S5.fecha(limite) + '; como administrador puedes corregir igual.'
      : 'El plazo venció el ' + S5.fecha(limite) + '. Pide a un administrador que lo corrija.');

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.reloj + '<span>Seguimiento</span></div>' +
    '<div class="res-nombre">Obs. N° ' + o.numero + ' · ' + DR.esc(S5.nombreZona(z)) + '</div>' +
    '<div class="res-dni" style="letter-spacing:0">' + DR.esc(DR.recortar(o.descripcion, 120)) + '</div>' +
    '<div class="campo" style="margin-top:16px"><label>Nuevo estado</label><div class="opciones" id="segEstados">' + S5.ESTADOS.map(function (e) {
      return '<button type="button" class="opcion' + (e === o.estado ? ' activa' : '') + '" data-valor="' + e + '" style="--c:' + S5.COLOR_ESTADO[e] + '">' + e + '</button>';
    }).join('') + '</div><div class="ayuda-campo" id="segAyudaEstado"></div></div>' +
    '<div class="campo" style="margin-top:12px"><label for="segNota">Nota del seguimiento</label>' +
      '<textarea id="segNota" rows="3" placeholder="Ej. Se colocó el rótulo estandarizado en las jabas."></textarea></div>' +
    '<div class="campo" style="margin-top:12px"><label>Fotos «Después» (opcional)</label>' +
      FOTOS.campoMultiHtml('segFoto', 'Agregar foto después', 'Evidencia del levantamiento · hasta ' + FOTOS.MAX) + '</div>' +
    '<div class="corregir5s">' +
      '<label class="interruptor' + (puedeCorregir ? '' : ' bloqueado') + '"><input type="checkbox" id="segCorregir"' + (puedeCorregir ? '' : ' disabled') + '><i></i>' +
      '<span><b>Corregir puntaje del checklist</b><small>' + ayudaPlazo + '</small></span></label>' +
      '<div id="segChecklist" class="oculto"></div></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="segCancelar">Cancelar</button>' +
    '<button type="button" class="btn verde" id="segGuardar" style="flex:1">Guardar seguimiento</button></div>', { fija: true });

  FOTOS.enlazarLista('segFoto', st.fotos, FOTOS.MAX);
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
  // Con auditoría de origen se corrige la suya; si nació suelta, la última auditoría de la zona.
  sb.from('s5_evaluaciones').select('id,estado,auditoria_id,s5_auditorias(codigo,fecha,estado)').eq('zona_id', st.o.zona_id).then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var evs = (r.data || []).filter(function (e) { return !e.s5_auditorias || e.s5_auditorias.estado !== 'anulada'; });
    if (st.a && st.a.id) evs = evs.filter(function (e) { return e.auditoria_id === st.a.id; });
    evs.sort(function (x, y) { return String((y.s5_auditorias || {}).fecha || '').localeCompare(String((x.s5_auditorias || {}).fecha || '')); });
    st.ev = evs[0] || null;
    if (st.ev && st.ev.s5_auditorias) st.evAud = st.ev.s5_auditorias;
    return st.ev ? sb.from('s5_puntajes').select('*').eq('evaluacion_id', st.ev.id) : null;
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
    c.innerHTML = '<div class="aviso alerta" style="margin-top:10px">Esta zona todavía no tiene puntajes' +
      (st.a && st.a.codigo ? ' en la auditoría ' + DR.esc(st.a.codigo) : ' en ninguna auditoría') + '. Complétala desde Auditar.</div>';
    return;
  }
  var abrir = st.o.s_referencia || 1;
  c.innerHTML = '<div class="ayuda-campo" style="margin:12px 2px">Se corrige el checklist de ' +
      DR.esc((st.evAud && st.evAud.codigo) || (st.a && st.a.codigo) || 'la última auditoría de la zona') +
      '. Toca el nuevo puntaje del ítem que ya cumple: se conserva el original y este seguimiento queda como sustento.</div>' +
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
  if (st.estado === st.o.estado && !nota && !st.fotos.length && !cambios.length) {
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
  btn.textContent = st.fotos.some(function (f) { return !f.ruta; }) ? 'Subiendo fotos…' : 'Guardando…';
  var base = 'obs/' + (S5.cultivoDeObs(st.o) || 0) + '/' + st.o.zona_id + '/' + st.o.id + '-despues';
  FOTOS.subirLista(st.fotos, base).then(function (rutas) {
    btn.textContent = 'Guardando…';
    return AT.rpc('rpc_s5_seguimiento', { p_observacion: st.o.id, p_estado: st.estado, p_nota: nota || null, p_foto: null, p_cambios: cambios, p_fotos: rutas });
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
