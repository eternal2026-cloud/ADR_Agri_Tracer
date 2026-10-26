/* ============================================================================
 * propuesta.js — PROPUESTA DE ACTUALIZACIÓN DEL ESTÁNDAR
 * Sugerencias calculadas con los datos TOP (pasos que no siguen, esperas,
 * tiempos estándar, riesgo REBA) → se convierten en propuestas con su sustento.
 * Una propuesta: mantener / modificar / eliminar / nuevo / reducir. Solo un
 * administrador la aprueba.
 * ==========================================================================*/
var PROP = { lista: [] };

PROP.TIPOS = { mantener: ['Mantener', 'gris'], modificar: ['Modificar', 'azul'], eliminar: ['Eliminar', 'rojo'], nuevo: ['Nuevo', 'verde'], reducir: ['Reducir tiempo', 'naranja'] };
PROP.AMBITOS = { estandar: 'Paso del estándar', actividad: 'Actividad / tiempo', ergonomia: 'Ergonomía', otro: 'Otro' };
PROP.ESTADOS = { borrador: ['Borrador', 'gris'], aprobada: ['Aprobada', 'verde'], descartada: ['Descartada', 'rojo'] };

PROP.pintar = function (cont) {
  var f = RES.filtro();
  Promise.all([TOP.cargarDatos(f), sb.from('top_propuestas').select('*').order('creado_en', { ascending: false })]).then(function (r) {
    if (r[1].error) throw new Error(r[1].error.message);
    RES.D = r[0];
    RES.A = TOP.analizar(r[0], f.suplemento);
    PROP.lista = r[1].data;
    PROP.dibujar(cont, f);
  }).catch(function (e) { UI.error(cont, e); });
};

PROP.puedeProponer = function () { return AT.puedeCapturar() && AT.tieneAcceso('campo.top.propuesta'); };

PROP.dibujar = function (cont, f) {
  var sug = TOP.sugerencias(RES.A).filter(function (s) {
    // Oculta las sugerencias que ya tienen propuesta (mismo ítem o actividad).
    return !PROP.lista.some(function (p) {
      return p.estado !== 'descartada' && ((s.item_id && p.item_id === s.item_id) || (s.actividad_id && p.actividad_id === s.actividad_id && p.ambito === s.ambito) ||
        (!s.item_id && !s.actividad_id && s.texto_propuesto && p.texto_propuesto === s.texto_propuesto));
    });
  });
  PROP.sug = sug;
  var puede = PROP.puedeProponer();
  var h = '<div class="vista">' + UI.encabezado('Ingeniería · Campo › Estudio TOP', 'Propuesta de actualización',
    'Cambios al estándar de cosecha sustentados en lo que hacen los cosechadores TOP (' + RES.D.evals.length + ' evaluaciones desde ' + TOP.fecha(f.desde) + ').',
    puede ? '<button type="button" class="btn verde" id="btnNuevaProp">' + DR.ICONOS.mas + 'Nueva propuesta</button>' : '');

  h += UI.panel('Propuestas', PROP.lista.length ? 'Las aprobadas forman el nuevo estándar y salen en el informe PDF.' : 'Aún no hay propuestas: empieza por las sugerencias de abajo.',
    PROP.lista.length ? '<div class="top-props">' + PROP.lista.map(PROP.tarjeta).join('') + '</div>' : '');

  h += UI.panel('Sugerencias a partir de los datos', 'Calculadas con el filtro del Resumen. Revisa y conviértelas en propuesta.',
    sug.length ? '<div class="top-props">' + sug.map(function (s, i) {
      return '<div class="top-prop sug"><div class="top-prop-cab"><span class="pill ' + PROP.TIPOS[s.tipo][1] + '">' + PROP.TIPOS[s.tipo][0] + '</span>' +
        '<span class="pill gris">' + DR.esc(PROP.AMBITOS[s.ambito]) + (s.presentacion ? ' · ' + s.presentacion : '') + '</span></div>' +
        (s.texto_actual ? '<div class="top-prop-act">' + DR.esc(s.texto_actual) + '</div>' : '') +
        (s.texto_propuesto ? '<div class="top-prop-nuevo">→ ' + DR.esc(s.texto_propuesto) + '</div>' : '') +
        '<div class="top-prop-sust">' + DR.esc(s.sustento) + '</div>' +
        (puede ? '<div class="acciones"><button type="button" class="btn mini azul" data-sug="' + i + '">Crear propuesta</button></div>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="vacio">No hay sugerencias pendientes con los datos actuales.</div>');
  cont.innerHTML = h + '</div>';
  DR.entrarPaneles('#contenido');

  if (DR.$('#btnNuevaProp')) DR.$('#btnNuevaProp').onclick = function () { PROP.editar({ ambito: 'estandar', tipo: 'modificar' }); };
  DR.$$('[data-sug]', cont).forEach(function (b) { b.onclick = function () { PROP.editar(JSON.parse(JSON.stringify(sug[Number(b.getAttribute('data-sug'))]))); }; });
  DR.$$('[data-prop]', cont).forEach(function (b) {
    b.onclick = function () { PROP.editar(PROP.lista.filter(function (p) { return p.id === Number(b.getAttribute('data-prop')); })[0]); };
  });
};

PROP.tarjeta = function (p) {
  var t = PROP.TIPOS[p.tipo], es = PROP.ESTADOS[p.estado];
  var ref = p.actividad_id ? TOP.actividad(p.actividad_id).nombre : '';
  return '<button type="button" class="top-prop" data-prop="' + p.id + '"><div class="top-prop-cab"><span class="pill ' + t[1] + '">' + t[0] + '</span>' +
    '<span class="pill gris">' + DR.esc(PROP.AMBITOS[p.ambito]) + (p.presentacion ? ' · ' + p.presentacion : '') + '</span>' +
    '<span class="pill ' + es[1] + '">' + es[0] + '</span></div>' +
    (p.texto_actual || ref ? '<div class="top-prop-act">' + DR.esc(p.texto_actual || ref) + '</div>' : '') +
    (p.texto_propuesto ? '<div class="top-prop-nuevo">→ ' + DR.esc(p.texto_propuesto) + '</div>' : '') +
    (p.tiempo_estandar_seg !== null && p.tiempo_estandar_seg !== undefined ? '<div class="top-prop-nuevo">Tiempo estándar: <b>' + TOP.seg(p.tiempo_estandar_seg) + '</b></div>' : '') +
    (p.sustento ? '<div class="top-prop-sust">' + DR.esc(p.sustento) + '</div>' : '') + '</button>';
};

PROP.editar = function (p) {
  var puede = PROP.puedeProponer() && (!p.id || AT.esAdmin() || (p.creado_por === AT.perfil.id && p.estado === 'borrador'));
  var dis = puede ? '' : ' disabled';
  var opts = function (mapa, sel) { return Object.keys(mapa).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + DR.esc(Array.isArray(mapa[k]) ? mapa[k][0] : mapa[k]) + '</option>'; }).join(''); };
  UI.abrirHoja('<h2>' + (p.id ? 'Propuesta #' + p.id : 'Nueva propuesta') + '</h2><div class="form" id="frmProp" style="margin-top:12px">' +
    '<div class="campo"><label>Ámbito</label><select data-campo="ambito"' + dis + '>' + opts(PROP.AMBITOS, p.ambito) + '</select></div>' +
    '<div class="campo"><label>Tipo de cambio</label><select data-campo="tipo"' + dis + '>' + opts(PROP.TIPOS, p.tipo) + '</select></div>' +
    '<div class="campo"><label>Presentación</label><select data-campo="presentacion"' + dis + '><option value="">Ambas</option>' + ['JARRA', 'BANDEJA'].map(function (x) {
      return '<option' + (p.presentacion === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo ancho" id="campoItem"><label>Ítem del estándar</label><select data-campo="item_id"' + dis + '><option value="">—</option>' + TOP.items.map(function (i) {
      return '<option value="' + i.id + '"' + (p.item_id === i.id ? ' selected' : '') + '>' + DR.esc(i.presentacion + ' · ' + i.tipo + ' ' + (i.numero || '') + ' · ' + DR.recortar(i.descripcion, 70)) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo ancho" id="campoAct"><label>Actividad</label><select data-campo="actividad_id"' + dis + '><option value="">—</option>' + TOP.actividades.map(function (a) {
      return '<option value="' + a.id + '"' + (p.actividad_id === a.id ? ' selected' : '') + '>' + DR.esc(a.nombre) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo ancho"><label>Texto actual</label><textarea data-campo="texto_actual" rows="2"' + dis + '>' + DR.esc(p.texto_actual) + '</textarea></div>' +
    '<div class="campo ancho"><label>Texto propuesto</label><textarea data-campo="texto_propuesto" rows="2"' + dis + '>' + DR.esc(p.texto_propuesto) + '</textarea></div>' +
    '<div class="campo"><label>Tiempo estándar (m:ss) <em>opcional</em></label><input data-campo="tiempo" placeholder="Ej. 4:30" value="' + (p.tiempo_estandar_seg !== null && p.tiempo_estandar_seg !== undefined ? TOP.seg(p.tiempo_estandar_seg) : '') + '"' + dis + '></div>' +
    '<div class="campo ancho"><label>Sustento técnico <button type="button" class="btn mini sec" id="btnSustento"' + dis + '>Generar con los datos</button></label><textarea data-campo="sustento" rows="4"' + dis + '>' + DR.esc(p.sustento) + '</textarea></div>' +
    '</div><div class="acciones">' +
    (puede ? '<button type="button" class="btn verde" id="btnGuardarProp">Guardar</button>' : '') +
    (p.id && AT.esAdmin() && p.estado !== 'aprobada' ? '<button type="button" class="btn azul" data-estado="aprobada">Aprobar</button>' : '') +
    (p.id && (AT.esAdmin() || p.creado_por === AT.perfil.id) && p.estado !== 'descartada' && AT.puedeCapturar() ? '<button type="button" class="btn sec" data-estado="descartada">Descartar</button>' : '') +
    (p.id && AT.esAdmin() && p.estado !== 'borrador' ? '<button type="button" class="btn sec" data-estado="borrador">Volver a borrador</button>' : '') +
    '<button type="button" class="btn sec" onclick="UI.cerrarHoja()">Cerrar</button></div>');

  var form = DR.$('#frmProp');
  var verCampos = function () {
    var amb = DR.$('[data-campo="ambito"]', form).value;
    DR.$('#campoItem').classList.toggle('oculto', amb !== 'estandar');
    DR.$('#campoAct').classList.toggle('oculto', amb !== 'actividad');
  };
  DR.$('[data-campo="ambito"]', form).onchange = verCampos;
  verCampos();
  DR.$('[data-campo="item_id"]', form).onchange = function () {
    var it = TOP.item(this.value), ta = DR.$('[data-campo="texto_actual"]', form);
    if (it) { ta.value = it.descripcion; DR.$('[data-campo="presentacion"]', form).value = it.presentacion; }
  };
  DR.$('[data-campo="actividad_id"]', form).onchange = function () {
    var x = RES.A.actividades.filter(function (a) { return a.actividad.id === Number(this.value); }, this)[0];
    DR.$('[data-campo="texto_actual"]', form).value = x ? x.actividad.nombre : '';
    if (x && x.estandar) DR.$('[data-campo="tiempo"]', form).value = TOP.seg(x.estandar);
  };
  DR.$('#btnSustento').onclick = function () {
    var v = UI.leerForm('frmProp'), txt = PROP.sustentoDe(v);
    DR.$('[data-campo="sustento"]', form).value = txt || 'Sin datos TOP suficientes para este ítem o actividad con el filtro actual.';
  };
  if (DR.$('#btnGuardarProp')) DR.$('#btnGuardarProp').onclick = function () {
    var v = UI.leerForm('frmProp'), btn = this, seg = PROP.leerTiempo(v.tiempo);
    if (seg === false) { DR.toast('Tiempo estándar no válido: usa m:ss (ej. 4:30).', 'error'); return; }
    var q = { id: p.id || null, ambito: v.ambito, tipo: v.tipo, presentacion: v.presentacion, item_id: v.ambito === 'estandar' ? v.item_id : '',
      actividad_id: v.ambito === 'actividad' ? v.actividad_id : '', texto_actual: v.texto_actual, texto_propuesto: v.texto_propuesto,
      tiempo_estandar_seg: seg === null ? '' : String(seg), sustento: v.sustento };
    btn.classList.add('cargando');
    AT.rpc('rpc_top_guardar_propuesta', { p: q }).then(function () { UI.cerrarHoja(); DR.toast('Propuesta guardada.'); PROP.pintar(DR.$('#contenido')); })
      .catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
  DR.$$('[data-estado]').forEach(function (b) {
    b.onclick = function () {
      var es = this.getAttribute('data-estado');
      AT.rpc('rpc_top_estado_propuesta', { p_id: p.id, p_estado: es }).then(function () {
        UI.cerrarHoja(); DR.toast('Propuesta ' + PROP.ESTADOS[es][0].toLowerCase() + '.'); PROP.pintar(DR.$('#contenido'));
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });
};

/** «4:30» o «1:02:15» → segundos; vacío → null; inválido → false. */
PROP.leerTiempo = function (t) {
  t = String(t || '').trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return false;
  return t.split(':').reduce(function (s, x) { return s * 60 + Number(x); }, 0);
};

PROP.sustentoDe = function (v) {
  var A = RES.A;
  if (v.ambito === 'estandar' && v.item_id) {
    var x = A.items.filter(function (i) { return i.item.id === Number(v.item_id); })[0];
    if (!x) return '';
    return (x.C + x.NC + x.NA) + ' TOP evaluados: ' + x.C + ' cumplen, ' + x.NC + ' no cumplen y ' + x.NA + ' no aplica (' +
      (x.pct === null ? 'sin cumplimiento medible' : DR.num(x.pct, 0) + '% de cumplimiento') + ').' +
      (x.practicas.length ? ' Prácticas observadas: ' + x.practicas.map(function (p) { return '«' + p.t + '»' + (p.n > 1 ? ' (' + p.n + ')' : ''); }).join('; ') + '.' : '') +
      (x.obs.length ? ' Observaciones: ' + x.obs.slice(0, 3).join('; ') + '.' : '');
  }
  if (v.ambito === 'actividad' && v.actividad_id) {
    var a = A.actividades.filter(function (i) { return i.actividad.id === Number(v.actividad_id); })[0];
    if (!a || !a.n) return '';
    return a.n + ' tomas en ' + a.nEval + ' cosechadores TOP. Promedio ' + TOP.seg(a.prom) + ', mediana ' + TOP.seg(a.med) + ', P25–P75 ' +
      TOP.seg(a.p25) + '–' + TOP.seg(a.p75) + ', mín. ' + TOP.seg(a.min) + ', máx. ' + TOP.seg(a.max) + ' (CV ' + DR.num(a.cv, 0) + '%). ' +
      'Tiempo estándar = mediana × (1 + suplemento) = ' + TOP.seg(a.estandar) + '.';
  }
  if (v.ambito === 'ergonomia' && A.reba.n) {
    return A.reba.n + ' posturas REBA: promedio ' + DR.num(A.reba.prom.prom, 1) + ', máximo ' + A.reba.prom.max + '. Niveles: ' +
      TOP.RIESGOS.map(function (r, i) { return r.t.toLowerCase() + ' ' + A.reba.niveles[i]; }).join(', ') + '.';
  }
  return '';
};
