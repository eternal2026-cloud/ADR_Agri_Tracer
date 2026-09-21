/* ============================================================================
 * evaluadores.js — PESTAÑA «EVALUADORES» (solo administradores)
 * Por cada usuario que registra encuestas: plantas y áreas que puede evaluar.
 * Sin marcar ninguna = todas. Se guarda con rpc_sci_permisos y la base lo hace
 * cumplir al registrar (trigger trg_sci_permisos, migración 0019).
 * ==========================================================================*/
var EVAL = { usuarios: [] };

VISTAS.evaluadores = function (cont) {
  if (!AT.esAdmin()) { DR.ir('resultados'); return; }
  sb.from('perfiles').select('id,usuario,nombre,area,rol,activo,sci_plantas,sci_areas').neq('rol', 'admin').order('nombre').then(function (r) {
    if (r.error) throw new Error(r.error.message);
    EVAL.usuarios = r.data || [];
    EVAL.pintar(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

EVAL.texto = function (lista, todas) { return lista && lista.length ? lista.join(' · ') : todas; };
EVAL.nombresAreas = function (ids) {
  return (ids || []).map(function (id) { var a = SCI.area(id); return a ? a.nombre : '#' + id; });
};

EVAL.pintar = function (cont) {
  var capturan = EVAL.usuarios.filter(function (u) { return u.rol === 'captura'; });
  var otros = EVAL.usuarios.filter(function (u) { return u.rol !== 'captura'; });
  var tarjeta = function (u) {
    return '<div class="usuario-card' + (u.activo ? '' : ' inactivo') + '"><div class="ini">' + DR.esc(((u.nombre || u.usuario || '?').trim()[0] || '?').toUpperCase()) + '</div>' +
      '<div class="u-cuerpo"><div class="u-nombre">' + DR.esc(u.nombre) + '</div>' +
      '<div class="u-det">' + DR.esc(u.usuario) + (u.area ? ' · ' + DR.esc(u.area) : '') + '</div>' +
      '<div class="u-pills"><span class="pill ' + ((u.sci_plantas || []).length ? 'azul' : 'gris') + '">Plantas: ' + DR.esc(EVAL.texto(u.sci_plantas, 'todas')) + '</span>' +
      ' <span class="pill ' + ((u.sci_areas || []).length ? 'azul' : 'gris') + '">Evalúa: ' + DR.esc(EVAL.texto(EVAL.nombresAreas(u.sci_areas), 'todas las áreas')) + '</span>' +
      (u.activo ? '' : ' <span class="pill rojo">Desactivado</span>') + '</div></div>' +
      '<div class="u-acciones"><button type="button" class="btn sec chico" data-permisos="' + u.id + '">Plantas y áreas</button></div></div>';
  };

  cont.innerHTML = UI.encabezado('Cliente interno', 'Evaluadores',
    'Define qué plantas y qué áreas puede evaluar cada usuario. Así solo ve esas opciones al registrar una encuesta y no se equivoca de planta o de área.') +
    UI.panel('Usuarios que registran encuestas', capturan.length + ' usuario(s) de captura · sin marcar nada = todas las plantas y áreas',
      capturan.length ? capturan.map(tarjeta).join('') : '<div class="vacio">No hay usuarios de captura. Créalos en Usuarios y configuración.</div>') +
    (otros.length ? UI.panel('Solo consulta', 'No registran encuestas; puedes dejarles la asignación lista por si cambian de rol.', otros.map(tarjeta).join('')) : '');
  DR.entrarPaneles('#contenido');

  DR.$$('[data-permisos]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-permisos');
      EVAL.editar(EVAL.usuarios.filter(function (u) { return u.id === id; })[0], cont);
    };
  });
};

EVAL.editar = function (u, cont) {
  if (!u) return;
  var plantas = (u.sci_plantas || []).slice(), areas = (u.sci_areas || []).map(Number);
  var chipsPlantas = SCI.plantas().map(function (p) {
    return '<button type="button" class="opcion' + (plantas.indexOf(p.codigo) > -1 ? ' activa' : '') + '" data-planta="' + DR.esc(p.codigo) + '">' +
      DR.esc(p.codigo) + (p.fundo ? '<small>' + DR.esc(p.fundo) + '</small>' : '') + '</button>';
  }).join('');
  var chipsAreas = SCI.areas.filter(function (a) { return a.activo || areas.indexOf(a.id) > -1; }).map(function (a) {
    return '<button type="button" class="opcion' + (areas.indexOf(a.id) > -1 ? ' activa' : '') + '" data-area="' + a.id + '">' + DR.esc(a.nombre) + '</button>';
  }).join('');

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-nombre">' + DR.esc(u.nombre) + '</div><div class="res-dni">Qué puede evaluar en Cliente interno</div>' +
    '<div class="sep-titulo" style="margin-top:16px">Plantas</div><div class="opciones" id="evPlantas">' + chipsPlantas + '</div>' +
    '<div class="sep-titulo" style="margin-top:16px">Áreas a evaluar</div><div class="opciones" id="evAreas">' + chipsAreas + '</div>' +
    '<div class="aviso" style="margin-top:14px">Solo verá las plantas y áreas marcadas al registrar una encuesta. <b>Sin marcar ninguna = todas.</b></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="evCancelar" style="flex:1">Cancelar</button>' +
    '<button type="button" class="btn verde" id="evGuardar" style="flex:1">Guardar</button></div>');

  var alternar = function (grupo, lista, attr, conv) {
    DR.$('#' + grupo).onclick = function (ev) {
      var op = ev.target.closest('.opcion');
      if (!op) return;
      var v = conv(op.getAttribute(attr)), i = lista.indexOf(v);
      if (i > -1) lista.splice(i, 1); else lista.push(v);
      op.classList.toggle('activa', i < 0);
      if (DR.anima) anime({ targets: op, scale: [0.9, 1], duration: 320, easing: 'easeOutBack' });
    };
  };
  alternar('evPlantas', plantas, 'data-planta', String);
  alternar('evAreas', areas, 'data-area', Number);
  DR.$('#evCancelar').onclick = UI.cerrarHoja;
  DR.$('#evGuardar').onclick = function () {
    SCI.accion(this, 'rpc_sci_permisos', { p_perfil: u.id, p_plantas: plantas, p_areas: areas }, 'Permisos de ' + u.nombre + ' guardados.').then(function () {
      UI.cerrarHoja();
      VISTAS.evaluadores(cont);
    }).catch(function () { /* SCI.accion ya avisó */ });
  };
};
