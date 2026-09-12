/* ============================================================================
 * vistas.js — RENDERIZADO DE CADA PESTAÑA (Escanear / Personal / Datos)
 * Adaptado de REUBICACION_FOTOCHECK: la única vista que cambia de fondo es
 * "Datos", que ahora lee/escribe contra Supabase en vez de Excel/localStorage.
 * ==========================================================================*/

var UI = {};

UI.kpi = function (id, etq, color) {
  return '<div class="kpi" style="--acento:' + color + '"><div class="etq">' + DR.esc(etq) + '</div><div class="val" id="' + id + '">0</div></div>';
};
UI.pill = function (texto, color) { return '<span class="pill ' + (color || 'gris') + '">' + DR.esc(texto) + '</span>'; };
UI.barras = function (items, color) {
  var max = 0;
  items.forEach(function (i) { max = Math.max(max, i.valor); });
  if (!max) return '<div class="vacio">Sin datos para graficar.</div>';
  return items.map(function (i) {
    return '<div class="barra-fila"><div>' + DR.esc(i.etq) + '</div>' +
      '<div class="barra-pista"><div class="barra-valor" data-ancho="' + (i.valor / max * 100) + '" style="background:' + (i.color || color) + '"></div></div>' +
      '<div class="barra-cifra">' + DR.num(i.valor) + '</div></div>';
  }).join('');
};
UI.animarBarras = function (raiz) {
  DR.$$('.barra-valor', raiz).forEach(function (b, i) {
    var w = b.getAttribute('data-ancho') + '%';
    if (DR.anima) anime({ targets: b, width: [0, w], duration: 900, delay: 200 + i * 60, easing: 'easeOutQuart' });
    else b.style.width = w;
  });
};
UI.iniciales = function (nombre) {
  var partes = String(nombre || '').split(',');
  var ap = (partes[0] || '').trim().split(/\s+/);
  var no = (partes[1] || '').trim().split(/\s+/);
  var a = ap[0] ? ap[0].charAt(0) : '';
  var b = no[0] ? no[0].charAt(0) : (ap[1] ? ap[1].charAt(0) : '');
  return (a + b).toUpperCase() || '·';
};

var VISTAS = {};

/* ============================================================================
 * ESCANEAR — historial de lecturas
 * ==========================================================================*/
VISTAS.escaner = function () { VISTAS.pintarHistorial(); };

VISTAS.pintarHistorial = function () {
  var h = DATOS.historial(), cont = DR.$('#histLista');
  DR.$('#histSub').textContent = h.length ? h.length + ' lectura(s) en este celular' : 'Aún no has escaneado a nadie';
  DR.$('#btnBorrarHist').classList.toggle('oculto', !h.length);
  if (!h.length) { cont.innerHTML = '<div class="vacio">Los fotochecks que escanees aparecerán aquí.</div>'; return; }
  cont.innerHTML = h.slice(0, 15).map(function (r) {
    var detalle = r.ok ? [RESULTADO.valorLinea(r.linea) ? 'Línea ' + RESULTADO.valorLinea(r.linea) : '', r.lado, r.labor].filter(Boolean).join(' · ')
      : (r.dni ? 'DNI ' + r.dni : DR.recortar(r.leido, 40));
    return '<button class="hist" type="button" data-dni="' + DR.esc(r.dni || '') + '">' +
      '<span class="hist-marca ' + (r.ok ? 'ok' : 'no') + '">' + (r.ok ? DR.ICONOS.checkChico : DR.ICONOS.alertaChico) + '</span>' +
      '<span class="hist-cuerpo"><span class="hist-nombre">' + DR.esc(r.ok ? r.nombre : 'No está en la lista') + '</span>' +
      '<span class="hist-det">' + DR.esc(detalle) + '</span></span>' +
      '<span class="hist-hora">' + DR.hora(r.t) + '</span></button>';
  }).join('');
};

/* ============================================================================
 * PERSONAL — búsqueda y filtros
 * ==========================================================================*/
VISTAS.filtro = { linea: '', q: '' };

VISTAS.personal = function () {
  var kpis = DR.$('#perKpis'), chips = DR.$('#perChips'), distrib = DR.$('#perDistrib');
  if (!DATOS.lista) {
    kpis.innerHTML = ''; chips.innerHTML = ''; distrib.classList.add('oculto');
    DR.$('#perLista').innerHTML = VISTAS.sinLista();
    return;
  }
  var lineas = DATOS.agrupar('linea');
  var labores = DATOS.agrupar('labor');
  if (VISTAS.filtro.linea && !lineas.some(function (l) { return l.etq === VISTAS.filtro.linea; })) VISTAS.filtro.linea = '';

  kpis.innerHTML = UI.kpi('kpiPersonas', 'Personas', '#579BCB') + UI.kpi('kpiLineas', 'Líneas', '#E37E3B') + UI.kpi('kpiLabores', 'Labores', '#8FBD38');
  DR.contar(DR.$('#kpiPersonas'), DATOS.lista.filas.length);
  DR.contar(DR.$('#kpiLineas'), lineas.length);
  DR.contar(DR.$('#kpiLabores'), labores.length);

  chips.innerHTML = '<button class="filtro' + (VISTAS.filtro.linea ? '' : ' activo') + '" data-linea="" type="button">Todas<small>' + DATOS.lista.filas.length + '</small></button>' +
    lineas.map(function (l) { return '<button class="filtro' + (VISTAS.filtro.linea === l.etq ? ' activo' : '') + '" data-linea="' + DR.esc(l.etq) + '" type="button">' + DR.esc(l.etq) + '<small>' + l.valor + '</small></button>'; }).join('');

  distrib.classList.remove('oculto');
  DR.$('#perBarras').innerHTML = UI.barras(lineas, '#579BCB');
  UI.animarBarras(distrib);

  DR.$('#inpBuscar').value = VISTAS.filtro.q;
  VISTAS.filtrarPersonal();
};

VISTAS.filtrarPersonal = function () {
  var cont = DR.$('#perLista');
  if (!DATOS.lista) return;
  var q = DATOS.normalizar(VISTAS.filtro.q), qNum = q.replace(/\D/g, ''), fl = VISTAS.filtro.linea;
  var res = DATOS.lista.filas.filter(function (f) {
    if (fl && f.linea !== fl) return false;
    if (!q) return true;
    return (f._n || '').indexOf(q) >= 0 || (qNum && f.dni.indexOf(qNum) >= 0);
  }).sort(function (a, b) { return DATOS.comparar(a.linea, b.linea) || DATOS.comparar(a.lado, b.lado) || DATOS.comparar(a.nombre, b.nombre); });

  if (!res.length) { cont.innerHTML = '<div class="vacio">No hay coincidencias para esa búsqueda.</div>'; return; }
  var MAX = 150;
  cont.innerHTML = '<div class="conteo">' + DR.num(res.length) + ' trabajador(es)</div>' +
    res.slice(0, MAX).map(function (f) {
      return '<button class="persona" type="button" data-dni="' + DR.esc(f.dni) + '">' +
        '<span class="ini">' + DR.esc(UI.iniciales(f.nombre)) + '</span>' +
        '<span class="persona-cuerpo"><span class="persona-nombre">' + DR.esc(f.nombre || 'Sin nombre') + '</span>' +
        '<span class="persona-dni">DNI ' + DR.esc(f.dni) + '</span>' +
        '<span class="etiquetas">' + (f.linea ? '<span class="tag linea">' + DR.esc(f.linea) + '</span>' : '') +
        (f.lado ? '<span class="tag lado">' + DR.esc(f.lado) + '</span>' : '') + (f.labor ? '<span class="tag labor">' + DR.esc(f.labor) + '</span>' : '') +
        '</span></span>' + DR.ICONOS.chevron + '</button>';
    }).join('') +
    (res.length > MAX ? '<div class="vacio">Mostrando ' + MAX + ' de ' + DR.num(res.length) + '. Escribe para afinar la búsqueda.</div>' : '');

  if (DR.anima) anime({ targets: DR.$$('.persona', cont).slice(0, 12), opacity: [0, 1], translateY: [12, 0], duration: 420, delay: anime.stagger(35), easing: 'easeOutQuad' });
};

VISTAS.sinLista = function () {
  return '<div class="panel"><div class="aviso alerta"><b>No hay una lista cargada.</b><br>' + (DATOS.error ? DR.esc(DATOS.error) + '<br>' : '') +
    'Entra a la pestaña <b>Datos</b> para revisar la conexión.</div></div>';
};

/* ============================================================================
 * DATOS — fuente actual + actualizar/subir (solo admin puede escribir)
 * ==========================================================================*/
VISTAS.datos = function () {
  var panel = DR.$('#datFuente'), l = DATOS.lista;
  var origenTxt = { servidor: UI.pill('En línea', 'verde'), cache_local: UI.pill('Copia sin conexión', 'naranja') };
  var fila = function (etq, valor) { return '<div class="dato-fila"><span>' + etq + '</span><b>' + DR.esc(valor) + '</b></div>'; };

  if (!l) {
    panel.innerHTML = '<h2>Lista actual</h2><div class="sub">Es la que se usa al escanear</div>' +
      '<div class="aviso alerta"><b>Sin lista disponible.</b><br>' + (DATOS.error ? DR.esc(DATOS.error) : 'Revisa tu conexión e intenta de nuevo.') + '</div>' +
      '<div class="acciones"><button class="btn sec" id="btnRefrescarLista">Reintentar</button></div>';
  } else {
    panel.innerHTML = '<div class="panel-cab"><div><h2>Lista actual</h2><div class="sub">Es la que se usa al escanear</div></div>' + (origenTxt[l.meta.origen] || '') + '</div>' +
      fila('Trabajadores activos', DR.num(l.filas.length)) +
      fila(l.meta.origen === 'servidor' ? 'Actualizada' : 'Última copia', DR.fechaHora(l.meta.fecha)) +
      '<div class="acciones"><button class="btn sec" id="btnRefrescarLista">Actualizar ahora</button></div>';
  }

  var panelAdmin = DR.$('#datAdmin');
  if (!AT.esAdmin()) {
    panelAdmin.innerHTML = '<h2>Actualizar lista</h2><div class="sub">Solo un administrador puede reemplazar el roster.</div>' +
      '<div class="aviso">Inicia sesión como administrador desde <a href="../">la puerta de entrada</a> para subir un Excel nuevo.</div>';
    return;
  }

  panelAdmin.innerHTML = '<h2>Actualizar lista (reemplaza el roster completo)</h2>' +
    '<div class="sub">Formatos aceptados: .xlsx, .xls o .csv — los DNI que no vengan en el archivo se marcan inactivos, nunca se borran.</div>' +
    '<label class="zona-carga" id="zonaCarga">' +
    '<input type="file" id="inpArchivo" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' +
    '<b id="zonaTitulo">Subir Excel</b><span id="zonaTexto">Toca para elegir el archivo</span></label>' +
    '<div class="acciones"><a class="btn sec" href="plantilla/PLANTILLA_REUBICACION.xlsx" download>Descargar plantilla</a></div>';

  VISTAS.enlazarAdminDatos();
};

VISTAS.subirArchivo = function (archivo) {
  if (!archivo) return;
  var zona = DR.$('#zonaCarga');
  zona.classList.add('cargando');
  DR.$('#zonaTitulo').textContent = 'Leyendo archivo…';
  DR.$('#zonaTexto').textContent = archivo.name;

  DR.cargarScript(DATOS.LIB_XLSX).then(function () {
    return new Promise(function (resolve, reject) {
      var lector = new FileReader();
      lector.onload = function () { resolve(lector.result); };
      lector.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      lector.readAsArrayBuffer(archivo);
    });
  }).then(function (buffer) {
    var lista = DATOS.leerLibro(buffer, archivo.name);
    DR.$('#zonaTitulo').textContent = 'Subiendo ' + lista.filas.length + ' registro(s)…';
    return DATOS.subirLote(lista.filas).then(function (res) {
      var msg = 'Lista actualizada: ' + (res ? (res.insertados + ' actualizados/insertados, ' + res.desactivados + ' desactivados') : lista.filas.length + ' registros');
      DR.toast(msg);
      if (lista.meta.avisos && lista.meta.avisos.length) DR.toast(lista.meta.avisos[0], 'info');
      VISTAS.datos();
    });
  }).catch(function (e) { DR.toast(e.message, 'error'); }).then(function () {
    zona.classList.remove('cargando');
    DR.$('#zonaTitulo').textContent = 'Subir Excel';
    DR.$('#zonaTexto').textContent = 'Toca para elegir el archivo';
    var inp = DR.$('#inpArchivo'); if (inp) inp.value = '';
  });
};

VISTAS.enlazarAdminDatos = function () {
  var inp = DR.$('#inpArchivo');
  if (inp) inp.addEventListener('change', function () { VISTAS.subirArchivo(this.files && this.files[0]); });
  var zona = DR.$('#zonaCarga');
  if (!zona) return;
  ['dragenter', 'dragover'].forEach(function (t) { zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.add('arrastre'); }); });
  ['dragleave', 'drop'].forEach(function (t) { zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.remove('arrastre'); }); });
  zona.addEventListener('drop', function (ev) { VISTAS.subirArchivo(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]); });
};

/* ============================================================================
 * EVENTOS
 * ==========================================================================*/
VISTAS.enlazar = function () {
  DR.$('#histLista').addEventListener('click', function (ev) {
    var b = ev.target.closest('.hist');
    if (!b) return;
    var dni = b.getAttribute('data-dni');
    if (!dni) return;
    RESULTADO.mostrar(DATOS.buscar(dni), 'lista');
  });
  DR.$('#btnBorrarHist').addEventListener('click', function () {
    if (!window.confirm('¿Borrar el historial de escaneos de este celular?')) return;
    DATOS.borrarHistorial(); VISTAS.pintarHistorial();
  });

  var espera = null;
  DR.$('#inpBuscar').addEventListener('input', function () {
    var v = this.value; clearTimeout(espera);
    espera = setTimeout(function () { VISTAS.filtro.q = v; VISTAS.filtrarPersonal(); }, 140);
  });
  DR.$('#perChips').addEventListener('click', function (ev) {
    var b = ev.target.closest('.filtro');
    if (!b) return;
    VISTAS.filtro.linea = b.getAttribute('data-linea');
    DR.$$('.filtro', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
    VISTAS.filtrarPersonal();
  });
  DR.$('#perLista').addEventListener('click', function (ev) {
    var b = ev.target.closest('.persona');
    if (b) RESULTADO.mostrar(DATOS.buscar(b.getAttribute('data-dni')), 'lista');
  });

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-ir]');
    if (b) DR.ir(b.getAttribute('data-ir'));
    var r = ev.target.closest('#btnRefrescarLista');
    if (r) {
      r.disabled = true;
      DATOS.refrescar().then(function () { DR.toast('Lista actualizada.'); }).catch(function (e) { DR.toast(e.message, 'error'); }).then(function () { VISTAS.datos(); });
    }
  });
};
