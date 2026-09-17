/* ============================================================================
 * config.js — PANEL DE ADMINISTRACIÓN: USUARIOS · LISTAS · GOOGLE SHEETS · AJUSTES
 * Usuarios (correo corporativo + PIN del Bot Don Ricardo) y sincronización pasan por Edge Functions de Supabase
 * (admin-usuarios, sync-sheets): no dependen de variables en Vercel.
 * ==========================================================================*/

var CONFIG = { tab: 'usuarios', parametros: {}, listas: [], usuarios: [], sync: null, rolNuevo: 'captura' };

CONFIG.TABS = [
  { id: 'usuarios', t: 'Usuarios', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><path d="M17 8v6M14 11h6"/></svg>' },
  { id: 'listas', t: 'Listas', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>' },
  { id: 'sheets', t: 'Sheets', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9h16M4 14.5h16M10 9v11.5"/></svg>' },
  { id: 'ajustes', t: 'Ajustes', ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18" cy="6" r="2"/><circle cx="15" cy="18" r="2"/></svg>' }
];
CONFIG.TIPOS = ['fundo', 'variedad', 'calibre', 'presentacion', 'tareadora'];
CONFIG.TITULOS = { fundo: 'Fundos', variedad: 'Variedades', calibre: 'Calibres', presentacion: 'Presentaciones', tareadora: 'Tareadoras' };
CONFIG.SINGULAR = { fundo: 'fundo', variedad: 'variedad', calibre: 'calibre', presentacion: 'presentación', tareadora: 'tareadora' };
CONFIG.ROLES = [
  { id: 'captura', c: '#76B729', t: 'Captura en campo', d: 'Registra tiempos de ciclo desde el celular y ve el resumen.' },
  { id: 'visor', c: '#0097CE', t: 'Solo consulta', d: 'Ve el resumen y los gráficos. No puede registrar ni cambiar datos.' },
  { id: 'admin', c: '#EF7C3B', t: 'Administrador', d: 'Todo lo anterior, más usuarios, listas, Google Sheets y la lista de reubicación.' }
];
CONFIG.NOMBRE_ROL = { admin: 'Administrador', captura: 'Captura en campo', visor: 'Solo consulta' };

VISTAS.config = function (cont) {
  if (!AT.esAdmin()) {
    cont.innerHTML = UI.encabezado('Configuración', 'Configuración', '') +
      UI.panel('Sin acceso', '', '<div class="aviso alerta">Esta sección es solo para administradores.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  CONFIG.cargar().then(function () { CONFIG.render(cont); }).catch(function (e) { UI.error(cont, e); });
};

CONFIG.cargar = function () {
  return Promise.all([
    sb.from('parametros').select('*'),
    sb.from('listas_maestras').select('*').order('tipo').order('orden').order('valor'),
    sb.from('perfiles').select('*').order('creado_en'),
    AT.rpc('rpc_estado_sync_sheets').catch(function (e) { return { _error: e.message }; }),
    AT.cargarDominios()
  ]).then(function (r) {
    [0, 1, 2].forEach(function (i) { if (r[i].error) throw new Error(r[i].error.message); });
    CONFIG.parametros = {};
    (r[0].data || []).forEach(function (p) { CONFIG.parametros[p.clave] = p.valor; });
    CONFIG.listas = r[1].data || [];
    CONFIG.usuarios = r[2].data || [];
    CONFIG.sync = r[3] || {};
  });
};

CONFIG.refrescar = function () {
  return CONFIG.cargar().then(CONFIG.pintarTab).catch(function (e) { DR.toast(e.message, 'error'); });
};

CONFIG.render = function (cont) {
  cont.innerHTML = UI.encabezado('Configuración', 'Panel de administración', 'Da acceso a tu equipo, ajusta las opciones de captura y conecta el espejo en Google Sheets.') +
    '<div class="segmentos entra" role="tablist">' + CONFIG.TABS.map(function (t) {
      return '<button type="button" role="tab" class="segmento' + (t.id === CONFIG.tab ? ' activo' : '') + '" data-tab="' + t.id + '">' + t.ico + '<span>' + t.t + '</span></button>';
    }).join('') + '</div><div id="cfgCuerpo"></div>';
  DR.$$('.segmento', cont).forEach(function (b) {
    b.onclick = function () {
      var yo = this;
      CONFIG.tab = yo.getAttribute('data-tab');
      DR.$$('.segmento', cont).forEach(function (s) { s.classList.toggle('activo', s === yo); });
      try { history.replaceState(null, '', '#' + CONFIG.tab); } catch (e) { /* sin history */ }
      CONFIG.pintarTab();
    };
  });
  DR.entrarPaneles('#contenido');
  CONFIG.pintarTab();
};

CONFIG.pintarTab = function () {
  var c = DR.$('#cfgCuerpo');
  if (!c) return;
  var fn = { usuarios: CONFIG.tabUsuarios, listas: CONFIG.tabListas, sheets: CONFIG.tabSheets, ajustes: CONFIG.tabAjustes }[CONFIG.tab] || CONFIG.tabUsuarios;
  fn(c);
  DR.entrarPaneles('#cfgCuerpo');
};

/* ============================================================ USUARIOS */
CONFIG.iniciales = function (texto) {
  var p = String(texto || '?').trim().split(/\s+/);
  return DR.esc(((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '')).toUpperCase();
};

/**
 * Los usuarios ingresan con su correo corporativo y un PIN que envía el Bot Don Ricardo
 * (sin contraseña). Solo la cuenta «admin» mantiene usuario y contraseña.
 */
CONFIG.tabUsuarios = function (c) {
  var dominios = AT.DOMINIOS.map(function (d) { return '@' + d; }).join(', ');
  var guia = '<ol class="guia">' +
    '<li><b>1</b><div><strong>Crea el usuario aquí abajo</strong><span>Escribe su nombre, su correo corporativo (' + DR.esc(dominios) + ') y elige qué podrá hacer.</span></div></li>' +
    '<li><b>2</b><div><strong>El Bot Don Ricardo le avisa</strong><span>Le llega un correo de bienvenida con los pasos para ingresar. No hay contraseñas que compartir.</span></div></li>' +
    '<li><b>3</b><div><strong>Ingreso con PIN</strong><span>Abre esta página, escribe su correo y recibe un PIN de 6 dígitos que vence en unos minutos.</span></div></li></ol>';

  var roles = '<div class="roles">' + CONFIG.ROLES.map(function (r) {
    return '<button type="button" class="rol-op' + (r.id === CONFIG.rolNuevo ? ' activo' : '') + '" data-rol="' + r.id + '" style="--c:' + r.c + '"><i></i><div><b>' + r.t + '</b><span>' + r.d + '</span></div></button>';
  }).join('') + '</div>';

  var form = '<div class="form">' +
    '<div class="campo ancho"><label for="nuNombre">Nombre completo</label><input id="nuNombre" placeholder="Ej. Juan Pérez Quispe" autocomplete="off"></div>' +
    '<div class="campo"><label for="nuCorreo">Correo corporativo</label><input id="nuCorreo" type="email" inputmode="email" placeholder="nombre@' + DR.esc(AT.DOMINIOS[0]) + '" autocapitalize="none" autocomplete="off" spellcheck="false"></div>' +
    '<div class="campo"><label for="nuArea">Área (opcional)</label><input id="nuArea" placeholder="Ej. Calidad campo" autocomplete="off"></div>' +
    '<div class="campo ancho"><label>¿Qué podrá hacer?</label>' + roles + '</div>' +
    '</div><div class="acciones"><button type="button" class="btn verde grande" id="btnCrearUsuario">' + DR.ICONOS.mas + '<span>Dar acceso y enviar bienvenida</span></button></div>';

  var yo = AT.perfil ? AT.perfil.id : '';
  var lista = CONFIG.usuarios.map(function (u) {
    var pills = UI.pill(CONFIG.NOMBRE_ROL[u.rol] || u.rol, { 'Administrador': 'naranja', 'Captura en campo': 'verde', 'Solo consulta': 'azul' }) +
      (u.correo ? ' <span class="pill azul">Correo + PIN</span>' : ' <span class="pill gris">Usuario y contraseña</span>') +
      (u.activo ? '' : ' <span class="pill rojo">Desactivado</span>') +
      (u.id === yo ? ' <span class="pill gris">Tú</span>' : '');
    var selector = '<select data-rol-de="' + u.id + '"' + (u.id === yo ? ' disabled' : '') + ' aria-label="Rol de ' + DR.esc(u.nombre) + '">' +
      CONFIG.ROLES.map(function (r) { return '<option value="' + r.id + '"' + (r.id === u.rol ? ' selected' : '') + '>' + r.t + '</option>'; }).join('') + '</select>';
    var ultimo = u.ultimo_acceso ? 'Último ingreso ' + DR.hace(u.ultimo_acceso) : 'Aún no ingresa';
    return '<div class="usuario-card' + (u.activo ? '' : ' inactivo') + '"><div class="ini">' + CONFIG.iniciales(u.nombre || u.usuario) + '</div>' +
      '<div class="u-cuerpo"><div class="u-nombre">' + DR.esc(u.nombre) + '</div>' +
      '<div class="u-det">' + DR.esc(u.correo || u.usuario) + (u.area ? ' · ' + DR.esc(u.area) : '') + ' · ' + DR.esc(ultimo) + '</div><div class="u-pills">' + pills + '</div></div>' +
      '<div class="u-acciones">' + selector +
        (u.correo
          ? '<button type="button" class="btn sec chico" data-reenviar="' + u.id + '"' + (u.activo ? '' : ' disabled') + '>Reenviar acceso</button>'
          : '<button type="button" class="btn sec chico" data-reset="' + u.id + '">Nueva contraseña</button>') +
        (u.id === yo ? '' : '<button type="button" class="btn sec chico" data-activo-de="' + u.id + '" data-activo="' + u.activo + '">' + (u.activo ? 'Desactivar' : 'Reactivar') + '</button>') +
      '</div></div>';
  }).join('');

  c.innerHTML = UI.panel('Cómo dar acceso a una persona', '', guia) +
    UI.panel('Nuevo usuario', '', form) +
    UI.panel('Usuarios con acceso', CONFIG.usuarios.length + ' usuario(s)', lista || '<div class="vacio">Sin usuarios.</div>') +
    CONFIG.panelBot();

  DR.$$('.rol-op', c).forEach(function (b) {
    b.onclick = function () {
      var yo2 = this;
      CONFIG.rolNuevo = yo2.getAttribute('data-rol');
      DR.$$('.rol-op', c).forEach(function (x) { x.classList.toggle('activo', x === yo2); });
      if (DR.anima) anime({ targets: yo2, scale: [0.97, 1], duration: 300, easing: 'easeOutBack' });
    };
  });
  DR.$('#btnCrearUsuario').onclick = CONFIG.crearUsuario;
  CONFIG.enlazarBot(c);

  DR.$$('[data-reenviar]', c).forEach(function (b) {
    b.onclick = function () {
      var u = CONFIG.buscarUsuario(this.getAttribute('data-reenviar')), btn = this;
      if (!u) return;
      btn.disabled = true;
      AT.llamarFuncion('admin-usuarios', { accion: 'bienvenida', id: u.id }).then(function (r) {
        DR.toast('Correo de acceso enviado a ' + r.correo + '.');
        btn.disabled = false;
      }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
    };
  });
  DR.$$('[data-reset]', c).forEach(function (b) {
    b.onclick = function () {
      var u = CONFIG.buscarUsuario(this.getAttribute('data-reset'));
      if (!u || !window.confirm('¿Generar una nueva contraseña para ' + u.nombre + '? La actual dejará de funcionar.')) return;
      var btn = this; btn.disabled = true;
      AT.llamarFuncion('admin-usuarios', { accion: 'reset', id: u.id }).then(function (r) {
        CONFIG.mostrarClave(r);
        return CONFIG.refrescar();
      }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
    };
  });
  DR.$$('[data-activo-de]', c).forEach(function (b) {
    b.onclick = function () {
      var u = CONFIG.buscarUsuario(this.getAttribute('data-activo-de')), activar = this.getAttribute('data-activo') !== 'true';
      if (!u) return;
      if (!activar && !window.confirm('¿Desactivar a ' + u.nombre + '? No podrá volver a ingresar hasta que lo reactives.')) return;
      var btn = this; btn.disabled = true;
      AT.llamarFuncion('admin-usuarios', { accion: 'actualizar', id: u.id, activo: activar }).then(function () {
        DR.toast(u.nombre + (activar ? ' fue reactivado.' : ' fue desactivado.'));
        return CONFIG.refrescar();
      }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
    };
  });
  DR.$$('[data-rol-de]', c).forEach(function (s) {
    s.onchange = function () {
      var u = CONFIG.buscarUsuario(this.getAttribute('data-rol-de')), rol = this.value;
      AT.llamarFuncion('admin-usuarios', { accion: 'actualizar', id: u.id, rol: rol }).then(function () {
        DR.toast(u.nombre + ' ahora es: ' + CONFIG.NOMBRE_ROL[rol] + '.');
        return CONFIG.refrescar();
      }).catch(function (e) { DR.toast(e.message, 'error'); CONFIG.refrescar(); });
    };
  });
};

CONFIG.buscarUsuario = function (id) { return CONFIG.usuarios.filter(function (u) { return u.id === id; })[0]; };

CONFIG.crearUsuario = function () {
  var nombre = DR.$('#nuNombre').value.trim(), correo = DR.$('#nuCorreo').value.trim().toLowerCase();
  if (!nombre) { DR.toast('Escribe el nombre de la persona.', 'error'); DR.$('#nuNombre').focus(); return; }
  if (!AT.correoValido(correo)) {
    DR.toast('Escribe su correo corporativo (' + AT.DOMINIOS.map(function (d) { return '@' + d; }).join(', ') + ').', 'error');
    DR.$('#nuCorreo').focus();
    return;
  }
  var btn = this;
  btn.disabled = true;
  btn.classList.add('cargando');
  AT.llamarFuncion('admin-usuarios', {
    accion: 'crear', nombre: nombre, correo: correo, area: DR.$('#nuArea').value.trim(), rol: CONFIG.rolNuevo
  }).then(function (r) {
    CONFIG.mostrarAlta(r);
    return CONFIG.refrescar();
  }).catch(function (e) {
    DR.toast(e.message, 'error');
    btn.disabled = false;
    btn.classList.remove('cargando');
  });
};

/** Resultado del alta: si el correo de bienvenida no salió, se explica y se puede reenviar después. */
CONFIG.mostrarAlta = function (r) {
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado">' + (r.correo_enviado ? DR.ICONOS.check : DR.ICONOS.alerta) + '<span>Usuario creado</span></div>' +
    '<div class="res-nombre">' + DR.esc(r.nombre) + '</div>' +
    '<div class="res-dni">' + DR.esc(CONFIG.NOMBRE_ROL[r.rol] || '') + '</div>' +
    '<div class="cred">' +
      '<div class="cred-fila"><span>Correo</span><b>' + DR.esc(r.correo) + '</b></div>' +
      '<div class="cred-fila"><span>Ingreso</span><b>Correo + PIN</b></div></div>' +
    (r.correo_enviado
      ? '<div class="aviso ok">El Bot Don Ricardo le envió la bienvenida con los pasos para ingresar.</div>'
      : '<div class="aviso alerta"><b>El usuario quedó creado, pero no salió el correo de bienvenida.</b><br>' + DR.esc(r.error_correo) +
        '<br>Revisa el panel «Correo del Bot Don Ricardo» y luego usa «Reenviar acceso». Igual puede ingresar escribiendo su correo en la página de inicio.</div>') +
    '<button type="button" class="res-cerrar-sec" id="btnCerrarHoja">Listo</button>', { fija: true });
  DR.$('#btnCerrarHoja').onclick = UI.cerrarHoja;
  DR.vibrar(40);
};

/** Solo para la cuenta con contraseña (admin). */
CONFIG.mostrarClave = function (r) {
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado">' + DR.ICONOS.check + '<span>Contraseña restablecida</span></div>' +
    '<div class="res-nombre">' + DR.esc(r.nombre) + '</div>' +
    '<div class="cred">' +
      '<div class="cred-fila"><span>Usuario</span><b>' + DR.esc(r.usuario) + '</b></div>' +
      '<div class="cred-fila"><span>Contraseña temporal</span><b class="clave">' + DR.esc(r.password) + '</b></div></div>' +
    '<div class="aviso alerta">Anótala ahora: <b>no se vuelve a mostrar</b>. Al ingresar se pedirá crear una propia.</div>' +
    '<div class="acciones"><button type="button" class="btn azul" id="btnCopiarCred" style="flex:1">Copiar</button></div>' +
    '<button type="button" class="res-cerrar-sec" id="btnCerrarHoja">Listo</button>', { fija: true });
  DR.$('#btnCopiarCred').onclick = function () {
    UI.copiar(r.password).then(function () { DR.toast('Contraseña copiada.'); }).catch(function () { DR.toast('No se pudo copiar; anótala a mano.', 'error'); });
  };
  DR.$('#btnCerrarHoja').onclick = UI.cerrarHoja;
};

/* ------------------------------------------------------------ correo del bot */
CONFIG.panelBot = function () {
  var p = CONFIG.parametros;
  var campo = function (id, etiqueta, valor, extra, ayuda) {
    return '<div class="campo"><label for="' + id + '">' + etiqueta + '</label><input id="' + id + '" value="' + DR.esc(valor || '') + '"' + (extra || '') + '>' +
      (ayuda ? '<div class="ayuda-campo">' + ayuda + '</div>' : '') + '</div>';
  };
  return UI.panel('Correo del Bot Don Ricardo', 'Buzón de Microsoft 365 desde el que salen los PIN y las bienvenidas (envío por Microsoft Graph).',
    '<div class="form">' +
      campo('botRemitente', 'Buzón remitente', p.CORREO_REMITENTE, ' type="email" autocapitalize="none" spellcheck="false"', 'La app de Entra ID debe tener permiso Mail.Send sobre este buzón.') +
      campo('botNombre', 'Nombre del bot', p.CORREO_NOMBRE_BOT, '', '') +
      campo('botDominios', 'Dominios permitidos', p.CORREO_DOMINIOS, ' autocapitalize="none" spellcheck="false"', 'Separados por coma (ej. adr.com.pe).') +
      campo('botUrl', 'Dirección de AgriTracer', p.APP_URL || location.origin, ' type="url" autocapitalize="none" spellcheck="false"', 'Para el botón «Abrir AgriTracer» de los correos.') +
    '</div><div class="acciones"><button type="button" class="btn" id="btnGuardarBot">Guardar</button></div>' +
    '<div class="sep-titulo">Probar el envío</div>' +
    '<div class="lista-add"><input id="botPrueba" type="email" placeholder="correo@' + DR.esc(AT.DOMINIOS[0]) + '" value="' + DR.esc(p.CORREO_REMITENTE || '') + '" autocapitalize="none" spellcheck="false">' +
    '<button type="button" class="btn chico azul" id="btnProbarBot">Enviar correo de prueba</button></div>' +
    '<div id="botEstado"></div>');
};

CONFIG.enlazarBot = function (c) {
  DR.$('#btnGuardarBot', c).onclick = function () {
    var btn = this;
    var dominios = DR.$('#botDominios').value.toLowerCase().split(/[,;\s]+/).map(function (d) { return d.replace(/^@/, ''); }).filter(Boolean);
    var remitente = DR.$('#botRemitente').value.trim().toLowerCase();
    if (!dominios.length) { DR.toast('Escribe al menos un dominio.', 'error'); return; }
    if (!/^[^@\s]+@[^@\s]+$/.test(remitente)) { DR.toast('Escribe el buzón remitente.', 'error'); return; }
    btn.disabled = true;
    Promise.all([
      CONFIG.guardarParametro('CORREO_REMITENTE', remitente),
      CONFIG.guardarParametro('CORREO_NOMBRE_BOT', DR.$('#botNombre').value.trim() || 'Bot Don Ricardo · Gestión de Procesos'),
      CONFIG.guardarParametro('CORREO_DOMINIOS', dominios.join(', ')),
      CONFIG.guardarParametro('APP_URL', DR.$('#botUrl').value.trim().replace(/\/+$/, ''))
    ]).then(function () {
      DR.toast('Datos del bot guardados.');
      return AT.cargarDominios();
    }).then(CONFIG.refrescar).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
  };
  DR.$('#btnProbarBot', c).onclick = function () {
    var btn = this, correo = DR.$('#botPrueba').value.trim().toLowerCase(), estado = DR.$('#botEstado');
    btn.disabled = true;
    btn.classList.add('cargando');
    AT.llamarFuncion('admin-usuarios', { accion: 'prueba_correo', correo: correo }).then(function (r) {
      estado.innerHTML = '<div class="aviso ok" style="margin-top:10px">Correo de prueba enviado a <b>' + DR.esc(r.correo) + '</b> desde <b>' + DR.esc(r.remitente) + '</b>. Revisa la bandeja (y el correo no deseado).</div>';
    }).catch(function (e) {
      estado.innerHTML = '<div class="aviso alerta" style="margin-top:10px"><b>No salió el correo.</b><br>' + DR.esc(e.message) + '</div>';
    }).then(function () { btn.disabled = false; btn.classList.remove('cargando'); });
  };
};

/* ============================================================ LISTAS */
CONFIG.tabListas = function (c) {
  c.innerHTML = CONFIG.TIPOS.map(function (tipo) {
    var items = CONFIG.listas.filter(function (l) { return l.tipo === tipo; });
    var activos = items.filter(function (l) { return l.activo; }).length;
    return UI.panel(CONFIG.TITULOS[tipo], activos + ' visible(s) en captura · toca una opción para ocultarla o mostrarla',
      '<div class="opciones">' + (items.length ? items.map(function (it) {
        return '<button type="button" class="opcion' + (it.activo ? ' activa' : ' inactiva') + '" data-lista-id="' + it.id + '" data-lista-activo="' + it.activo + '" style="--c:#76B729">' + DR.esc(it.valor) + '</button>';
      }).join('') : '<span class="nota-vacia">Todavía no hay opciones.</span>') + '</div>' +
      '<div class="lista-add"><input placeholder="Nueva ' + CONFIG.SINGULAR[tipo] + '…" data-nuevo-lista="' + tipo + '" autocomplete="off">' +
      '<button type="button" class="btn chico" data-agregar-lista="' + tipo + '">Agregar</button></div>');
  }).join('') + CONFIG.panelCodigosPlanta();
  CONFIG.enlazarCodigosPlanta(c);

  DR.$$('[data-lista-id]', c).forEach(function (chip) {
    chip.onclick = function () {
      var id = this.getAttribute('data-lista-id'), activo = this.getAttribute('data-lista-activo') === 'true';
      sb.from('listas_maestras').update({ activo: !activo }).eq('id', id).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        if (typeof CAPTURA !== 'undefined') CAPTURA.listas.fundo = [];
        return CONFIG.refrescar();
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });
  var agregar = function (tipo) {
    var inp = DR.$('[data-nuevo-lista="' + tipo + '"]', c), valor = inp.value.trim();
    if (!valor) { inp.focus(); return; }
    sb.from('listas_maestras').insert({ tipo: tipo, valor: valor, activo: true, orden: 999 }).then(function (r) {
      if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? '«' + valor + '» ya existe en ' + CONFIG.TITULOS[tipo].toLowerCase() + '.' : r.error.message);
      DR.toast('«' + valor + '» agregado a ' + CONFIG.TITULOS[tipo].toLowerCase() + '.');
      if (typeof CAPTURA !== 'undefined') CAPTURA.listas.fundo = [];
      return CONFIG.refrescar();
    }).catch(function (e) { DR.toast(e.message, 'error'); });
  };
  DR.$$('[data-agregar-lista]', c).forEach(function (b) { b.onclick = function () { agregar(this.getAttribute('data-agregar-lista')); }; });
  DR.$$('[data-nuevo-lista]', c).forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') agregar(this.getAttribute('data-nuevo-lista')); });
  });
};

/**
 * Código de planta de cada fundo (DON CARLOS → PDC). Lo usa Satisfacción del cliente
 * interno para separar los resultados por planta y sugerirla desde el nombre del Excel.
 */
CONFIG.panelCodigosPlanta = function () {
  var fundos = CONFIG.listas.filter(function (l) { return l.tipo === 'fundo'; });
  return UI.panel('Códigos de planta', 'Abreviatura de cada fundo (p. ej. PDC, PLM). Se usa en Satisfacción del cliente interno.',
    fundos.length ? '<div class="form">' + fundos.map(function (f) {
      return '<div class="campo"><label for="cod_' + f.id + '">' + DR.esc(f.valor) + '</label>' +
        '<input id="cod_' + f.id + '" data-codigo-fundo="' + f.id + '" value="' + DR.esc(f.codigo || '') + '" maxlength="8" autocapitalize="characters" placeholder="Sin código"></div>';
    }).join('') + '</div>' : '<span class="nota-vacia">Todavía no hay fundos.</span>');
};
CONFIG.enlazarCodigosPlanta = function (c) {
  DR.$$('[data-codigo-fundo]', c).forEach(function (inp) {
    inp.onchange = function () {
      var codigo = this.value.trim().toUpperCase() || null;
      this.value = codigo || '';
      sb.from('listas_maestras').update({ codigo: codigo }).eq('id', this.getAttribute('data-codigo-fundo')).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        DR.toast(codigo ? 'Código ' + codigo + ' guardado.' : 'Código quitado.');
        return CONFIG.refrescar();
      }).catch(function (e) { DR.toast(e.message, 'error'); });
    };
  });
};

/* ============================================================ GOOGLE SHEETS */
CONFIG.urlHoja = function (valor) {
  var v = String(valor || '').trim();
  if (!v) return '';
  return /^https?:\/\//.test(v) ? v : 'https://docs.google.com/spreadsheets/d/' + v + '/edit';
};

CONFIG.tabSheets = function (c) {
  var s = CONFIG.sync || {};
  if (s._error) { c.innerHTML = UI.panel('Google Sheets', '', '<div class="aviso alerta">' + DR.esc(s._error) + '</div>'); return; }

  var email = s.sa_email || '', tieneHoja = !!String(s.sheet_id || '').trim();
  var item = function (bien, titulo, detalle) {
    return '<div class="check-item ' + (bien ? 'ok' : 'no') + '"><i>' + (bien ? DR.ICONOS.checkChico : DR.ICONOS.alertaChico) + '</i><div><b>' + titulo + '</b><span>' + detalle + '</span></div></div>';
  };
  var frec = function (m) { m = Number(m); return m < 60 ? 'cada ' + m + ' min' : (m === 1440 ? 'una vez al día' : 'cada ' + (m / 60) + ' h'); };

  var estado = '<div class="check-lista">' +
    item(s.tiene_credencial, 'Credencial de Google', s.tiene_credencial ? 'Cargada · ' + DR.esc(email) : 'Falta subir la clave JSON de la cuenta de servicio (último panel).') +
    item(tieneHoja, 'Hoja destino', tieneHoja ? '<a href="' + DR.esc(CONFIG.urlHoja(s.sheet_id)) + '" target="_blank" rel="noopener">Abrir la Google Sheet ↗</a>' : 'Falta pegar el enlace de la hoja.') +
    item(s.cron_activo, 'Sincronización automática', s.cron_activo ? 'Programada ' + frec(s.minutos || 60) + '; se ejecuta cuando la credencial y la hoja están listas.' : 'El programador no está activo.') +
    item(!!s.ultima_sync && !s.ultimo_error, 'Última sincronización', s.ultima_sync ? DR.fechaHora(s.ultima_sync) + ' · ' + DR.hace(s.ultima_sync) : 'Todavía no se ha sincronizado.') +
    '</div>' + (s.ultimo_error ? '<div class="aviso alerta" style="margin-top:12px"><b>Último error:</b> ' + DR.esc(s.ultimo_error) + '</div>' : '');

  var pasos = '<ol class="guia">' +
    '<li><b>1</b><div><strong>Sube la clave JSON</strong><span>El archivo que descargaste de Google Cloud (cuenta de servicio). Usa el último panel de esta página.</span></div></li>' +
    '<li><b>2</b><div><strong>Crea una Google Sheet y compártela como Editor con este correo</strong><span><a href="https://sheets.new" target="_blank" rel="noopener">Crear hoja nueva ↗</a> → botón «Compartir» → pega el correo → rol Editor.</span>' +
      (email ? '<div class="copiable"><code>' + DR.esc(email) + '</code><button type="button" class="btn sec mini" id="btnCopiarSa">Copiar</button></div>' : '<span class="ayuda-campo">El correo aparece aquí cuando subas la clave.</span>') + '</div></li>' +
    '<li><b>3</b><div><strong>Pega el enlace de la hoja y guarda</strong><span>Se sincroniza al instante y luego sola, con la frecuencia que elijas.</span></div></li></ol>';

  var form = '<div class="form"><div class="campo ancho"><label for="inpHoja">Enlace de la Google Sheet</label>' +
    '<input id="inpHoja" placeholder="https://docs.google.com/spreadsheets/d/…" value="' + DR.esc(s.sheet_id || '') + '" autocomplete="off" spellcheck="false"></div>' +
    '<div class="campo"><label for="selMinutos">Frecuencia</label><select id="selMinutos">' + [15, 30, 60, 120, 240, 720, 1440].map(function (m) {
      return '<option value="' + m + '"' + (String(m) === String(s.minutos) ? ' selected' : '') + '>' + frec(m).replace(/^./, function (x) { return x.toUpperCase(); }) + '</option>';
    }).join('') + '</select></div></div>' +
    '<div class="acciones"><button type="button" class="btn" id="btnGuardarHoja">Guardar</button>' +
    '<button type="button" class="btn azul" id="btnSyncAhora"' + (s.tiene_credencial && tieneHoja ? '' : ' disabled') + '>Sincronizar ahora</button></div>' +
    '<div id="syncResultado"></div>';

  var zona = function (titulo, detalle) {
    return '<label class="zona-carga"><input type="file" accept=".json,application/json" id="inpCredencial">' + DR.ICONOS.subir + '<b>' + titulo + '</b><span>' + detalle + '</span></label>';
  };
  var cred = s.tiene_credencial
    ? '<div class="aviso ok">Credencial guardada y cifrada en Supabase Vault. Solo súbela de nuevo si generas una clave nueva en Google Cloud.</div><div style="margin-top:12px">' + zona('Reemplazar clave JSON', 'Archivo .json de la cuenta de servicio') + '</div>'
    : zona('Subir clave JSON', 'Google Cloud → Cuentas de servicio → Claves → archivo .json') +
      '<div class="ayuda" style="text-align:left">Se guarda cifrada en Supabase Vault: nunca queda en el código, en GitHub ni en este celular.</div>';

  c.innerHTML = UI.panel('Estado del espejo', 'La app escribe las pestañas Ciclos_BD, Resumen_Semanal, Personal_Reubicacion, Auditoria_Escaneos, 5S_BD, 5S_Observaciones, 5S_Resumen, PM_Revisiones, PM_Hallazgos, PM_Resultados y Sync_Info. Tus otras pestañas no se tocan.', estado) +
    (s.tiene_credencial && tieneHoja && s.ultima_sync ? '' : UI.panel('Cómo conectarla (una sola vez)', '', pasos)) +
    UI.panel('Hoja destino y frecuencia', '', form) +
    UI.panel('Credencial de Google', '', cred);

  if (DR.$('#btnCopiarSa')) DR.$('#btnCopiarSa').onclick = function () { UI.copiar(email).then(function () { DR.toast('Correo copiado.'); }); };
  DR.$('#btnGuardarHoja').onclick = CONFIG.guardarHoja;
  DR.$('#btnSyncAhora').onclick = CONFIG.sincronizar;
  DR.$('#inpCredencial').onchange = CONFIG.subirCredencial;
};

/** Upsert: si la fila del parámetro no existe la crea (un UPDATE sobre una fila inexistente "funciona" sin guardar nada). */
CONFIG.guardarParametro = function (clave, valor) {
  return sb.from('parametros').upsert({ clave: clave, valor: String(valor), actualizado_en: new Date().toISOString() }, { onConflict: 'clave' })
    .select('clave,valor').then(function (r) {
      if (r.error) throw new Error(r.error.message);
      if (!r.data || !r.data.length || r.data[0].valor !== String(valor)) throw new Error('No se pudo guardar «' + clave + '». Verifica que tu usuario sea administrador.');
      return r.data[0];
    });
};

CONFIG.guardarHoja = function () {
  var enlace = DR.$('#inpHoja').value.trim(), minutos = DR.$('#selMinutos').value;
  if (enlace && !/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(enlace) && !/^[\w-]{25,}$/.test(enlace)) {
    DR.toast('Ese enlace no parece de Google Sheets. Cópialo desde la barra del navegador con la hoja abierta.', 'error');
    return;
  }
  var btn = this; btn.disabled = true;
  Promise.all([
    CONFIG.guardarParametro('SHEETS_ID', enlace),
    CONFIG.guardarParametro('SHEETS_SYNC_MINUTOS', minutos)
  ]).then(function () {
    DR.toast('Configuración guardada.');
    return CONFIG.refrescar();
  }).then(function () {
    var s = CONFIG.sync || {};
    if (enlace && s.tiene_credencial) CONFIG.sincronizar();
  }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
};

CONFIG.sincronizar = function () {
  var btn = DR.$('#btnSyncAhora');
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }
  var mostrar = function (html) {
    var el = DR.$('#syncResultado');
    if (el) { el.innerHTML = html; if (DR.anima) anime({ targets: el, opacity: [0, 1], translateY: [8, 0], duration: 400, easing: 'easeOutQuad' }); }
  };
  AT.llamarFuncion('sync-sheets', {}).then(function (r) {
    return CONFIG.refrescar().then(function () {
      var f = r.filas || {};
      mostrar('<div class="aviso ok" style="margin-top:12px"><b>Listo: «' + DR.esc(r.hoja) + '» actualizada.</b><br>' +
        DR.num(f.ciclos) + ' ciclos · ' + DR.num(f.resumen) + ' filas de resumen · ' + DR.num(f.personal) + ' personas · ' + DR.num(f.escaneos) + ' escaneos' +
        (f.s5_bd !== undefined ? ' · ' + DR.num(f.s5_bd) + ' filas 5S · ' + DR.num(f.s5_observaciones) + ' observaciones 5S' : '') + '.' +
        (r.s5 && r.s5 !== 'OK' ? '<br>Auditoría 5S: ' + DR.esc(r.s5) : '') + '</div>');
      DR.toast('Google Sheet sincronizada.');
    });
  }).catch(function (e) {
    return CONFIG.refrescar().then(function () {
      mostrar('<div class="aviso alerta" style="margin-top:12px"><b>No se pudo sincronizar.</b><br>' + DR.esc(e.message) + '</div>');
    });
  });
};

CONFIG.subirCredencial = function () {
  var archivo = this.files && this.files[0];
  if (!archivo) return;
  if (archivo.size > 20000) { DR.toast('El archivo es demasiado grande para ser una clave de cuenta de servicio.', 'error'); return; }
  var zona = this.closest('.zona-carga');
  zona.classList.add('cargando');
  archivo.text().then(function (texto) {
    var j;
    try { j = JSON.parse(texto); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
    if (j.type !== 'service_account' || !j.client_email || !j.private_key) throw new Error('Ese JSON no es una clave de cuenta de servicio de Google.');
    return AT.rpc('rpc_guardar_credencial_google', { p_json: texto });
  }).then(function (email) {
    DR.toast('Credencial guardada: ' + email);
    return CONFIG.refrescar();
  }).catch(function (e) {
    zona.classList.remove('cargando');
    DR.toast(e.message, 'error');
  });
};

/* ============================================================ IMPORTAR EXCEL HISTÓRICO */
CONFIG.leerExcel = function () {
  var archivo = this.files && this.files[0];
  if (!archivo) return;
  var zona = DR.$('#zonaExcel');
  zona.classList.add('cargando');
  Promise.all([DR.cargarScript('../reubicacion/vendor/xlsx.full.min.js'), archivo.arrayBuffer()]).then(function (r) {
    var libro = XLSX.read(new Uint8Array(r[1]), { type: 'array' });
    CONFIG.excel = IMPORTAR_EXCEL.leerLibro(XLSX, libro);
    zona.classList.remove('cargando');
    CONFIG.pintarVistaExcel(CONFIG.excel, archivo.name);
  }).catch(function (e) {
    zona.classList.remove('cargando');
    DR.toast(e.message, 'error');
  });
};

CONFIG.pintarVistaExcel = function (res, nombreArchivo) {
  var s = res.resumen;
  var item = function (bien, titulo, detalle) {
    return '<div class="check-item ' + (bien ? 'ok' : 'no') + '"><i>' + (bien ? DR.ICONOS.checkChico : DR.ICONOS.alertaChico) + '</i><div><b>' + titulo + '</b><span>' + detalle + '</span></div></div>';
  };
  var fundos = Object.keys(s.fundos).sort().map(function (f) { return DR.esc(f) + ' (' + s.fundos[f] + ')'; }).join(', ');
  var avisos = res.avisos.length
    ? '<div class="aviso alerta" style="margin-top:10px"><b>' + res.avisos.length + ' aviso(s)</b><ul>' +
      res.avisos.slice(0, 8).map(function (a) { return '<li>' + DR.esc(a) + '</li>'; }).join('') +
      (res.avisos.length > 8 ? '<li>… y ' + (res.avisos.length - 8) + ' más.</li>' : '') + '</ul></div>'
    : '';
  DR.$('#excelVista').innerHTML = '<div class="check-lista" style="margin-top:12px">' +
    item(s.total > 0, 'Hoja «' + DR.esc(res.hoja) + '» de ' + DR.esc(nombreArchivo), s.total + ' ciclos · del ' + DR.esc(s.desde) + ' al ' + DR.esc(s.hasta)) +
    item(true, 'Fundos', fundos || '—') +
    item(s.difieren === 0, 'Tiempos de ciclo', s.coinciden + ' coinciden con los del Excel' + (s.difieren ? ' · ' + s.difieren + ' difieren' : '') + (s.sinTotal ? ' · ' + s.sinTotal + ' incompletos' : '')) +
    '</div>' + avisos +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnImportarExcel"' + (s.total ? '' : ' disabled') + '>Importar ' + s.total + ' ciclos</button></div>' +
    '<div id="excelResultado"></div>';
  DR.$('#btnImportarExcel').onclick = CONFIG.importarExcel;
  DR.entrarPaneles('#excelVista');
};

/** Envía en lotes de 100 filas. Reimportar el mismo Excel actualiza, no duplica. */
CONFIG.importarExcel = function () {
  var filas = CONFIG.excel.filas.map(IMPORTAR_EXCEL.paraEnviar), btn = this, i = 0;
  var total = { nuevos: 0, actualizados: 0, protegidos: 0, omitidos: 0 };
  btn.disabled = true;
  var siguiente = function () {
    if (i >= filas.length) return Promise.resolve();
    var lote = filas.slice(i, i + 100);
    i += lote.length;
    btn.textContent = 'Importando… ' + i + ' / ' + filas.length;
    return AT.rpc('rpc_importar_ciclos_excel', { p_filas: lote }).then(function (r) {
      Object.keys(total).forEach(function (k) { total[k] += (r && r[k]) || 0; });
      return siguiente();
    });
  };
  siguiente().then(function () {
    btn.textContent = 'Importación terminada';
    DR.$('#excelResultado').innerHTML = '<div class="aviso ok" style="margin-top:12px"><b>Listo.</b> ' +
      total.nuevos + ' nuevos · ' + total.actualizados + ' actualizados' +
      (total.protegidos ? ' · ' + total.protegidos + ' sin tocar (capturados en la app)' : '') +
      (total.omitidos ? ' · ' + total.omitidos + ' omitidos' : '') +
      '.<br>Ya se ven en Resumen; la Google Sheet se actualiza en la próxima sincronización.</div>';
    if (typeof CAPTURA !== 'undefined') CAPTURA.listas.fundo = [];
    DR.toast('Excel importado.');
  }).catch(function (e) {
    btn.disabled = false;
    btn.textContent = 'Reintentar importación';
    DR.toast('No se completó: ' + e.message, 'error');
  });
};

/* ============================================================ PAPELERA DE CICLOS */
CONFIG.cargarPapelera = function () {
  var cont = DR.$('#papeleraLista');
  if (!cont) return;
  sb.from('ciclos_papelera').select('id,codigo,ciclo,motivo,eliminado_en').order('eliminado_en', { ascending: false }).limit(50).then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var filas = r.data || [];
    if (!filas.length) { cont.innerHTML = '<div class="vacio">La papelera está vacía.</div>'; return; }
    cont.innerHTML = filas.map(function (p) {
      var c = p.ciclo || {};
      var sub = [c.fundo, c.lote ? 'Lote ' + c.lote : '', c.fecha].filter(Boolean).map(DR.esc).join(' · ');
      return '<div class="papelera-item"><div class="u-cuerpo"><div class="u-nombre">' + DR.esc(p.codigo) + '</div>' +
        '<div class="u-det">' + sub + '</div><div class="u-det">' + DR.esc(p.motivo || '') + ' · ' + DR.hace(p.eliminado_en) + '</div></div>' +
        '<button type="button" class="btn sec chico" data-restaurar="' + p.id + '">Restaurar</button></div>';
    }).join('');
    DR.$$('[data-restaurar]', cont).forEach(function (b) {
      b.onclick = function () {
        var btn = this;
        btn.disabled = true;
        AT.rpc('rpc_restaurar_ciclo', { p_id: Number(btn.getAttribute('data-restaurar')) }).then(function (res) {
          DR.toast('Ciclo ' + res.codigo + ' restaurado.');
          CONFIG.cargarPapelera();
        }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
      };
    });
  }).catch(function (e) { cont.innerHTML = '<div class="aviso alerta">' + DR.esc(e.message) + '</div>'; });
};

/* ============================================================ AJUSTES */
CONFIG.tabAjustes = function (c) {
  c.innerHTML = UI.panel('Umbral de calidad de datos', 'Los ciclos que superen estos minutos se excluyen de los promedios (se asume un error de digitación). Se siguen mostrando tachados en el detalle.',
    '<div class="form"><div class="campo"><label for="inpUmbral">Umbral (minutos)</label><input id="inpUmbral" type="number" inputmode="numeric" min="1" value="' + DR.esc(CONFIG.parametros.UMBRAL_TIEMPO_CICLO_MIN || 480) + '"></div></div>' +
    '<div class="acciones"><button type="button" class="btn" id="btnGuardarUmbral">Guardar</button></div>') +
    UI.panel('Importar histórico desde Excel', 'Carga o actualiza los ciclos del archivo «5.1. TIEMPO DE CICLO ACTUALIZADO.xlsx» (hoja BD). Puedes repetirlo cada vez que el Excel tenga filas nuevas: no duplica y nunca modifica ciclos capturados en la app.',
      '<label class="zona-carga" id="zonaExcel"><input type="file" accept=".xlsx,.xls" id="inpExcel">' + DR.ICONOS.subir +
      '<b>Elegir archivo Excel</b><span>Se revisa en este dispositivo y te muestra un resumen antes de importar.</span></label><div id="excelVista"></div>') +
    UI.panel('Papelera de ciclos', 'Los ciclos eliminados quedan aquí y se pueden restaurar. Si alguien borra ciclos directamente en Supabase, también llegan aquí.',
      '<div id="papeleraLista"><div class="vacio">Cargando…</div></div>');
  DR.$('#inpExcel').onchange = CONFIG.leerExcel;
  CONFIG.cargarPapelera();
  DR.$('#btnGuardarUmbral').onclick = function () {
    var v = Number(DR.$('#inpUmbral').value);
    if (!v || v < 1) { DR.toast('Escribe un número de minutos válido.', 'error'); return; }
    var btn = this; btn.disabled = true;
    CONFIG.guardarParametro('UMBRAL_TIEMPO_CICLO_MIN', Math.round(v)).then(function () {
      DR.toast('Umbral actualizado.');
      return CONFIG.refrescar();
    }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
  };
};
