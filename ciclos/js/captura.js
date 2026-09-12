/* ============================================================================
 * captura.js — TARJETAS DE CICLO, BOTÓN-RELOJ, CÓDIGO DE CICLO, LOTE
 * ==========================================================================*/
var CAPTURA = { tarjetas: [], seq: 0, listas: { fundo: [], variedad: [], calibre: [], presentacion: [], tareadora: [] } };

/** Cada etapa: campoCierre = el campo cuya presencia marca la etapa como completa. */
var ETAPAS = [
  { id: 'jabero', titulo: 'Jabero', campoCierre: 'fin_jabero', campos: [
    { clave: 'inicio_jabero', tipo: 'hora', label: 'Inicio jabero' },
    { clave: 'fin_jabero', tipo: 'hora', label: 'Fin jabero' },
    { clave: 'num_jabas', tipo: 'numero', label: 'N° de jabas' },
    { clave: 'obs_jaba', tipo: 'texto', label: 'Observación de jaba' }
  ] },
  { id: 'motocarga', titulo: 'Motocarga', campoCierre: 'fin_carga_moto', campos: [
    { clave: 'placa', tipo: 'texto', label: 'Placa motocarga' },
    { clave: 'hora_llegada_moto', tipo: 'hora', label: 'Llegada de motocarga' },
    { clave: 'inicio_carga_moto', tipo: 'hora', label: 'Inicio carga a motocarga' },
    { clave: 'fin_carga_moto', tipo: 'hora', label: 'Fin carga a motocarga' }
  ] },
  { id: 'traslado_ca', titulo: 'Traslado a C. Acopio', campoCierre: 'fin_traslado_ca', campos: [
    { clave: 'inicio_traslado_ca', tipo: 'hora', label: 'Inicio traslado a C.A.' },
    { clave: 'fin_traslado_ca', tipo: 'hora', label: 'Fin traslado a C.A.' }
  ] },
  { id: 'descarga_ca', titulo: 'Descarga y Armado en C.A.', campoCierre: 'fin_descarga_ca', campos: [
    { clave: 'num_jabas_2', tipo: 'numero', label: 'N° de jabas (2)' },
    { clave: 'obs_jabas_2', tipo: 'texto', label: 'Observación de jabas (2)' },
    { clave: 'inicio_descarga_ca', tipo: 'hora', label: 'Inicio descarga y armado' },
    { clave: 'fin_descarga_ca', tipo: 'hora', label: 'Fin descarga y armado' },
    { clave: 'num_pallets', tipo: 'numero', label: 'N° de pallets' },
    { clave: 'presentaciones', tipo: 'lista', lista: 'presentacion', label: 'Presentaciones' },
    { clave: 'placa_camion', tipo: 'texto', label: 'Placa de camión' }
  ] },
  { id: 'carga_camion', titulo: 'Carga al Camión', campoCierre: 'fin_carga_camion', campos: [
    { clave: 'inicio_carga_camion', tipo: 'hora', label: 'Inicio carga al camión' },
    { clave: 'fin_carga_camion', tipo: 'hora', label: 'Fin carga al camión' }
  ] },
  { id: 'traslado_planta', titulo: 'Traslado a Planta', campoCierre: 'fin_traslado_planta', campos: [
    { clave: 'inicio_traslado_planta', tipo: 'hora', label: 'Inicio traslado a planta' },
    { clave: 'fin_traslado_planta', tipo: 'hora', label: 'Fin traslado a planta' },
    { clave: 'obs_cs', tipo: 'texto', label: 'Observación Casa Sombra' },
    { clave: 'tareadora', tipo: 'lista', lista: 'tareadora', label: 'Tareadora' },
    { clave: 'obs_ca', tipo: 'texto', label: 'Observación C. Acopio' }
  ] }
];

var CAMPOS_COSECHA = [
  { clave: 'fecha', tipo: 'fecha', label: 'Fecha' },
  { clave: 'fundo', tipo: 'lista', lista: 'fundo', label: 'Fundo' },
  { clave: 'lote', tipo: 'texto', label: 'Lote' },
  { clave: 'lider', tipo: 'texto', label: 'Líder de grupo' },
  { clave: 'presentacion', tipo: 'lista', lista: 'presentacion', label: 'Presentación' },
  { clave: 'variedad', tipo: 'lista', lista: 'variedad', label: 'Variedad' },
  { clave: 'calibre', tipo: 'lista', lista: 'calibre', label: 'Calibre' },
  { clave: 'inicio_cosecha', tipo: 'hora', label: 'Inicio cosecha' },
  { clave: 'fin_cosecha', tipo: 'hora', label: 'Fin cosecha' }
];

CAPTURA.cargarListas = function () {
  return sb.from('listas_maestras').select('tipo,valor').eq('activo', true).order('orden').then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var m = { fundo: [], variedad: [], calibre: [], presentacion: [], tareadora: [] };
    (r.data || []).forEach(function (f) { if (!m[f.tipo]) m[f.tipo] = []; m[f.tipo].push(f.valor); });
    CAPTURA.listas = m;
  });
};

CAPTURA.proximaEtapa = function (fila) {
  for (var i = 0; i < ETAPAS.length; i++) if (!fila[ETAPAS[i].campoCierre]) return ETAPAS[i];
  return null;
};

CAPTURA.ahoraLocal = function () {
  var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};
CAPTURA.aIso = function (v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };

VISTAS.captura = function (cont) {
  if (!AT.puedeCapturar()) {
    cont.innerHTML = UI.encabezado('Tiempos de ciclo', 'Captura de datos', '') +
      UI.panel('Sin permiso', '', '<div class="aviso alerta">Tu cuenta no tiene permiso de captura en campo. Pide a un administrador que te lo habilite.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  var listo = (CAPTURA.listas.fundo.length ? Promise.resolve() : CAPTURA.cargarListas());
  listo.then(function () { CAPTURA.render(cont); }).catch(function (e) { UI.error(cont, e); });
};

CAPTURA.render = function (cont) {
  var h = UI.encabezado('Tiempos de ciclo', 'Captura de datos', 'Registra el inicio de un ciclo o continúa uno que ya está en curso en otra estación.');
  h += '<div class="acciones" style="margin-bottom:14px">' +
    '<button class="btn verde" id="btnNuevoCiclo">+ Nuevo ciclo (Cosecha)</button>' +
    '<button class="btn sec" id="btnBuscarCiclo">Continuar un ciclo abierto</button></div>';
  h += '<div id="buscarPanel" class="panel oculto"><h2>Buscar ciclo abierto</h2>' +
    '<div class="form"><div class="campo"><label>Código (ej. C-000123)</label><input id="inpCodigo" placeholder="C-000123"></div></div>' +
    '<div class="acciones"><button class="btn azul" id="btnBuscarCodigo">Buscar por código</button><button class="btn sec" id="btnVerAbiertos">Ver ciclos abiertos</button></div>' +
    '<div id="abiertosLista" style="margin-top:12px"></div></div>';
  h += '<div id="tarjetas"></div>';
  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');

  DR.$('#btnNuevoCiclo').onclick = CAPTURA.agregarTarjetaNueva;
  DR.$('#btnBuscarCiclo').onclick = function () { DR.$('#buscarPanel').classList.toggle('oculto'); };
  DR.$('#btnBuscarCodigo').onclick = CAPTURA.buscarPorCodigo;
  DR.$('#btnVerAbiertos').onclick = CAPTURA.listarAbiertos;
  CAPTURA.pintarTarjetas();
};

CAPTURA.agregarTarjetaNueva = function () {
  CAPTURA.tarjetas.push({ id: ++CAPTURA.seq, tipo: 'nuevo', guardado: false, campos: { fecha: new Date().toISOString().substring(0, 10) } });
  CAPTURA.pintarTarjetas();
};

CAPTURA.buscarPorCodigo = function () {
  var codigo = DR.$('#inpCodigo').value.trim().toUpperCase();
  if (!codigo) return;
  sb.from('ciclos_cosecha').select('*').eq('codigo', codigo).eq('cerrado', false).maybeSingle().then(function (r) {
    if (r.error) throw new Error(r.error.message);
    if (!r.data) { DR.toast('No se encontró un ciclo abierto con ese código.', 'error'); return; }
    CAPTURA.agregarTarjetaEtapa(r.data);
  }).catch(function (e) { DR.toast(e.message, 'error'); });
};

CAPTURA.listarAbiertos = function () {
  sb.from('ciclos_cosecha').select('codigo,fundo,lote,fecha,semana').eq('cerrado', false).order('fecha', { ascending: false }).limit(30).then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var filas = r.data || [];
    var cont = DR.$('#abiertosLista');
    if (!filas.length) { cont.innerHTML = '<div class="vacio">No hay ciclos abiertos.</div>'; return; }
    cont.innerHTML = UI.tabla([
      { t: 'Código', k: 'codigo' }, { t: 'Fundo', k: 'fundo' }, { t: 'Lote', k: 'lote' },
      { t: 'Fecha', r: function (f) { return DR.fechaHora(f.fecha).split(' ')[0]; } }
    ], filas, function () { return 'clicable'; });
    DR.$$('tbody tr', cont).forEach(function (tr, i) {
      tr.onclick = function () {
        sb.from('ciclos_cosecha').select('*').eq('codigo', filas[i].codigo).single().then(function (r2) {
          if (r2.error) throw new Error(r2.error.message);
          CAPTURA.agregarTarjetaEtapa(r2.data);
        }).catch(function (e) { DR.toast(e.message, 'error'); });
      };
    });
  }).catch(function (e) { DR.toast(e.message, 'error'); });
};

CAPTURA.agregarTarjetaEtapa = function (fila) {
  var etapa = CAPTURA.proximaEtapa(fila);
  if (!etapa) { DR.toast('Este ciclo ya está cerrado.', 'info'); return; }
  CAPTURA.tarjetas.push({ id: ++CAPTURA.seq, tipo: 'etapa', guardado: false, fila: fila, etapa: etapa, campos: {} });
  CAPTURA.pintarTarjetas();
};

CAPTURA.quitar = function (id) { CAPTURA.tarjetas = CAPTURA.tarjetas.filter(function (t) { return t.id !== id; }); CAPTURA.pintarTarjetas(); };

CAPTURA.campoHtml = function (campo, valor) {
  if (campo.tipo === 'hora') {
    return '<div class="tc-hora-fila"><div class="campo"><label>' + campo.label + '</label><input type="datetime-local" data-campo="' + campo.clave + '" value="' + (valor || '') + '"></div>' +
      '<button type="button" class="boton-reloj" data-objetivo="' + campo.clave + '" title="Usar hora actual">' + DR.ICONOS.reloj + '</button></div>';
  }
  if (campo.tipo === 'fecha') return '<div class="campo"><label>' + campo.label + '</label><input type="date" data-campo="' + campo.clave + '" value="' + (valor || '') + '"></div>';
  if (campo.tipo === 'numero') return '<div class="campo"><label>' + campo.label + '</label><input type="number" data-campo="' + campo.clave + '" value="' + (valor || '') + '"></div>';
  if (campo.tipo === 'lista') {
    var opciones = CAPTURA.listas[campo.lista] || [];
    return '<div class="campo"><label>' + campo.label + '</label><select data-campo="' + campo.clave + '"><option value="">—</option>' +
      opciones.map(function (o) { return '<option value="' + DR.esc(o) + '"' + (o === valor ? ' selected' : '') + '>' + DR.esc(o) + '</option>'; }).join('') + '</select></div>';
  }
  return '<div class="campo"><label>' + campo.label + '</label><input data-campo="' + campo.clave + '" value="' + DR.esc(valor || '') + '"></div>';
};

CAPTURA.pintarTarjetas = function () {
  var cont = DR.$('#tarjetas');
  if (!cont) return;
  if (!CAPTURA.tarjetas.length) { cont.innerHTML = '<div class="vacio">No hay tarjetas en esta sesión. Usa los botones de arriba para empezar.</div>'; CAPTURA.pintarBarra(); return; }

  cont.innerHTML = CAPTURA.tarjetas.map(function (t) {
    if (t.tipo === 'nuevo') {
      var camposHtml = CAMPOS_COSECHA.map(function (c) { return CAPTURA.campoHtml(c, t.campos[c.clave]); }).join('');
      return '<div class="tarjeta-ciclo" data-id="' + t.id + '"><div class="tc-cab"><span class="tc-codigo">' + (t.guardado ? t.resultado.codigo : 'Nuevo ciclo') + '</span>' +
        '<span class="tc-fundo">Cosecha</span><button class="tc-cerrar" data-quitar="' + t.id + '">✕</button></div>' +
        '<div class="tc-cuerpo"><div class="form">' + camposHtml + '</div></div>' +
        '<div class="tc-pie">' + (t.guardado
          ? '<div class="aviso ok">Guardado. Código: <b>' + t.resultado.codigo + '</b> — anótalo en la jaba/pallet.</div>'
          : '<button class="btn verde" data-guardar="' + t.id + '">Guardar e iniciar ciclo</button>') + '</div></div>';
    }
    var camposEtapa = t.etapa.campos.map(function (c) { return CAPTURA.campoHtml(c, t.campos[c.clave]); }).join('');
    return '<div class="tarjeta-ciclo" data-id="' + t.id + '"><div class="tc-cab"><span class="tc-codigo">' + t.fila.codigo + '</span>' +
      '<span class="tc-fundo">' + DR.esc(t.fila.fundo) + ' · ' + DR.esc(t.fila.lote || '') + ' · ' + t.etapa.titulo + '</span>' +
      '<button class="tc-cerrar" data-quitar="' + t.id + '">✕</button></div>' +
      '<div class="tc-cuerpo"><div class="form">' + camposEtapa + '</div></div>' +
      '<div class="tc-pie">' + (t.guardado
        ? '<div class="aviso ok">Etapa "' + t.etapa.titulo + '" guardada.</div>'
        : '<button class="btn verde" data-guardar="' + t.id + '">Guardar etapa</button>') + '</div></div>';
  }).join('');

  DR.$$('.boton-reloj', cont).forEach(function (b) {
    b.onclick = function () {
      var inp = DR.$('input[data-campo="' + this.getAttribute('data-objetivo') + '"]', this.closest('.tc-cuerpo'));
      if (inp) inp.value = CAPTURA.ahoraLocal();
      this.classList.add('tocado');
      if (DR.anima) anime({ targets: this, scale: [1, 1.15, 1], duration: 340, easing: 'easeOutQuad' });
    };
  });
  DR.$$('[data-quitar]', cont).forEach(function (b) { b.onclick = function () { CAPTURA.quitar(Number(this.getAttribute('data-quitar'))); }; });
  DR.$$('[data-guardar]', cont).forEach(function (b) { b.onclick = function () { CAPTURA.guardarTarjeta(Number(this.getAttribute('data-guardar')), this); }; });

  DR.entrarPaneles('#tarjetas');
  CAPTURA.pintarBarra();
};

CAPTURA.pintarBarra = function () {
  var pendientes = CAPTURA.tarjetas.filter(function (t) { return !t.guardado; });
  var existente = DR.$('#barraCiclos');
  if (pendientes.length < 2) { if (existente) existente.remove(); return; }
  if (!existente) { existente = document.createElement('div'); existente.id = 'barraCiclos'; document.body.appendChild(existente); }
  existente.innerHTML = '<button class="btn azul" id="btnGuardarTodo">Guardar todas las pendientes (' + pendientes.length + ')</button>';
  DR.$('#btnGuardarTodo').onclick = CAPTURA.guardarTodo;
};

CAPTURA.leerCamposTarjeta = function (elTarjeta) {
  var obj = {};
  DR.$$('[data-campo]', elTarjeta).forEach(function (el) { obj[el.getAttribute('data-campo')] = el.value; });
  return obj;
};

CAPTURA.guardarTarjeta = function (id, btn) {
  var t = CAPTURA.tarjetas.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  var el = btn.closest('.tarjeta-ciclo');
  var valores = CAPTURA.leerCamposTarjeta(el);
  t.campos = valores;
  btn.disabled = true;

  var promesa;
  if (t.tipo === 'nuevo') {
    if (!valores.fundo) { DR.toast('Selecciona el fundo.', 'error'); btn.disabled = false; return; }
    promesa = AT.rpc('rpc_iniciar_ciclo', { p: {
      fecha: valores.fecha || new Date().toISOString().substring(0, 10),
      fundo: valores.fundo, lote: valores.lote, lider: valores.lider, presentacion: valores.presentacion,
      variedad: valores.variedad, calibre: valores.calibre,
      inicio_cosecha: CAPTURA.aIso(valores.inicio_cosecha), fin_cosecha: CAPTURA.aIso(valores.fin_cosecha)
    } });
  } else {
    var datos = {};
    t.etapa.campos.forEach(function (c) {
      var v = valores[c.clave];
      datos[c.clave] = c.tipo === 'hora' ? CAPTURA.aIso(v) : (c.tipo === 'numero' ? (v === '' ? null : Number(v)) : v);
    });
    promesa = AT.rpc('rpc_agregar_etapa', { p_codigo: t.fila.codigo, p_etapa: t.etapa.id, p_datos: datos });
  }

  promesa.then(function (resultado) {
    t.guardado = true; t.resultado = resultado;
    DR.toast(t.tipo === 'nuevo' ? 'Ciclo iniciado: ' + resultado.codigo : 'Etapa guardada.');
    CAPTURA.pintarTarjetas();
  }).catch(function (e) { DR.toast(e.message, 'error'); btn.disabled = false; });
};

CAPTURA.guardarTodo = function () {
  var pendientes = CAPTURA.tarjetas.filter(function (t) { return !t.guardado; });
  var i = 0;
  function siguiente() {
    if (i >= pendientes.length) { DR.toast('Listo.'); return; }
    var t = pendientes[i++];
    var btn = DR.$('.tarjeta-ciclo[data-id="' + t.id + '"] [data-guardar]');
    if (btn) CAPTURA.guardarTarjeta(t.id, btn);
    setTimeout(siguiente, 320);
  }
  siguiente();
};
