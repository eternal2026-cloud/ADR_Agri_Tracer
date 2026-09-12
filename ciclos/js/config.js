/* ============================================================================
 * config.js — PANEL DE ADMINISTRACIÓN: UMBRAL, LISTAS MAESTRAS, USUARIOS
 * ==========================================================================*/

VISTAS.config = function (cont) {
  if (!AT.esAdmin()) {
    cont.innerHTML = UI.encabezado('Configuración', 'Configuración', '') +
      UI.panel('Sin acceso', '', '<div class="aviso alerta">Esta sección es solo para administradores.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  Promise.all([
    sb.from('parametros').select('*'),
    sb.from('listas_maestras').select('*').order('tipo').order('orden'),
    sb.from('perfiles').select('*').order('creado_en')
  ]).then(function (r) {
    if (r[0].error) throw new Error(r[0].error.message);
    var parametros = {}; (r[0].data || []).forEach(function (p) { parametros[p.clave] = p.valor; });
    CONFIG.render(cont, parametros, r[1].data || [], r[2].data || []);
  }).catch(function (e) { UI.error(cont, e); });
};

var CONFIG = {};

CONFIG.TIPOS = ['fundo', 'variedad', 'calibre', 'presentacion', 'tareadora'];
CONFIG.TITULOS = { fundo: 'Fundos', variedad: 'Variedades', calibre: 'Calibres', presentacion: 'Presentaciones', tareadora: 'Tareadoras' };

CONFIG.render = function (cont, parametros, listas, usuarios) {
  var h = UI.encabezado('Configuración', 'Panel de administración', 'Umbral de calidad de datos, listas maestras y usuarios con acceso.');

  h += UI.panel('Umbral de calidad de datos', 'Tiempos de ciclo por encima de este valor se excluyen de los promedios (se asume error de digitación).',
    '<div class="form" id="formUmbral"><div class="campo"><label>Umbral (minutos)</label><input type="number" min="1" data-campo="valor" value="' + DR.esc(parametros.UMBRAL_TIEMPO_CICLO_MIN || 480) + '"></div></div>' +
    '<div class="acciones"><button class="btn" id="btnGuardarUmbral">Guardar</button></div>');

  var cuerpoListas = CONFIG.TIPOS.map(function (tipo) {
    var items = listas.filter(function (l) { return l.tipo === tipo; });
    return '<div style="margin-bottom:16px"><b style="font-size:12.5px;letter-spacing:.06em">' + CONFIG.TITULOS[tipo] + '</b>' +
      '<div class="chips" style="margin-top:8px;flex-wrap:wrap">' + items.map(function (it) {
        return '<span class="filtro' + (it.activo ? ' activo' : '') + '" data-lista-id="' + it.id + '" data-lista-activo="' + it.activo + '" style="cursor:pointer">' +
          DR.esc(it.valor) + (it.activo ? '' : ' (inactivo)') + '</span>';
      }).join('') + '</div>' +
      '<div class="form" style="margin-top:8px"><div class="campo"><input placeholder="Agregar a ' + CONFIG.TITULOS[tipo].toLowerCase() + '… (Enter)" data-nuevo-lista="' + tipo + '"></div></div></div>';
  }).join('');
  h += UI.panel('Listas maestras', 'Valores que aparecen como desplegable en Captura de Datos. Toca un valor para activarlo/desactivarlo.', cuerpoListas);

  h += UI.panel('Usuarios con acceso', usuarios.length + ' usuario(s)',
    '<div class="form" id="formUsuario">' +
    '<div class="campo"><label>Usuario</label><input data-campo="usuario" placeholder="ej. calidad.campo"></div>' +
    '<div class="campo"><label>Nombre</label><input data-campo="nombre"></div>' +
    '<div class="campo"><label>Área</label><input data-campo="area"></div>' +
    '<div class="campo"><label>Rol</label><select data-campo="rol"><option value="captura">Captura (campo)</option><option value="visor">Visor (solo lectura)</option><option value="admin">Administrador</option></select></div>' +
    '</div><div class="acciones"><button class="btn verde" id="btnCrearUsuario">Crear usuario</button></div>' +
    UI.tabla([
      { t: 'Usuario', k: 'usuario' }, { t: 'Nombre', k: 'nombre' }, { t: 'Área', k: 'area' },
      { t: 'Rol', r: function (f) { return UI.pill(f.rol, { admin: 'naranja', captura: 'azul', visor: 'gris' }); } },
      { t: 'Activo', r: function (f) { return UI.pill(f.activo); } },
      { t: '', r: function (f) {
        return '<button class="btn sec mini" data-reset="' + f.id + '">Restablecer clave</button> ' +
          '<button class="btn sec mini" data-toggle="' + f.id + '" data-activo="' + f.activo + '">' + (f.activo ? 'Desactivar' : 'Activar') + '</button>';
      } }
    ], usuarios));

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  CONFIG.enlazar(cont);
};

CONFIG.enlazar = function (cont) {
  DR.$('#btnGuardarUmbral').onclick = function () {
    var v = UI.leerForm('formUmbral').valor;
    var btn = this; btn.disabled = true;
    sb.from('parametros').update({ valor: v, actualizado_en: new Date().toISOString() }).eq('clave', 'UMBRAL_TIEMPO_CICLO_MIN').then(function (r) {
      if (r.error) throw new Error(r.error.message);
      DR.toast('Umbral actualizado.');
      DR.ir('config');
    }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
  };

  DR.$$('[data-lista-id]', cont).forEach(function (chip) {
    chip.onclick = function () {
      var id = this.getAttribute('data-lista-id'), activo = this.getAttribute('data-lista-activo') === 'true';
      sb.from('listas_maestras').update({ activo: !activo }).eq('id', id).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        DR.ir('config');
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });

  DR.$$('[data-nuevo-lista]', cont).forEach(function (inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !this.value.trim()) return;
      var tipo = this.getAttribute('data-nuevo-lista'), valor = this.value.trim();
      sb.from('listas_maestras').insert({ tipo: tipo, valor: valor, activo: true, orden: 999 }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        DR.toast('Agregado a ' + tipo + '.');
        DR.ir('config');
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    });
  });

  DR.$('#btnCrearUsuario').onclick = function () {
    var reg = UI.leerForm('formUsuario');
    if (!reg.usuario) { DR.toast('Escribe el nombre de usuario.', 'error'); return; }
    var btn = this; btn.disabled = true;
    AT.llamarApi('/api/admin-crear-usuario', reg).then(function (r) {
      DR.toast('Usuario creado. Contraseña temporal: ' + r.passwordTemporal, 'ok');
      DR.ir('config');
    }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
  };

  DR.$$('[data-reset]', cont).forEach(function (b) {
    b.onclick = function () {
      AT.llamarApi('/api/admin-reset-password', { id: this.getAttribute('data-reset') }).then(function (r) {
        DR.toast('Contraseña temporal: ' + r.passwordTemporal, 'ok');
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });

  DR.$$('[data-toggle]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-toggle'), activo = this.getAttribute('data-activo') === 'true';
      sb.from('perfiles').update({ activo: !activo }).eq('id', id).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        DR.ir('config');
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });
};
