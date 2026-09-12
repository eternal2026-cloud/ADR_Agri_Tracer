/* ============================================================================
 * datos.js — LISTA DE REUBICACIÓN (ahora contra Supabase, con caché local
 * para mala conexión en campo) + cola de auditoría de escaneos.
 * Mantiene la misma API que usan escaner.js/vistas.js sin cambios.
 * ==========================================================================*/

var DATOS = {
  CLAVE_CACHE: 'drReub.cache.v1',
  CLAVE_HIST: 'drReub.historial.v1',
  CLAVE_COLA: 'drReub.colaEscaneos.v1',
  CLAVE_DISPOSITIVO: 'drReub.dispositivoId.v1',
  lista: null,
  indice: {},
  error: null,
  _oyentes: []
};

/* ------------------------------ normalización ------------------------------ */
DATOS.normalizar = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
};

/** Clave única del documento: DNI con ceros a la izquierda (Excel suele borrarlos). */
DATOS.claveDoc = function (v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
  var compacto = s.replace(/[\s.\-]/g, '');
  if (/^\d+$/.test(compacto)) return compacto.length < 8 ? ('00000000' + compacto).slice(-8) : compacto;
  return DATOS.normalizar(s).replace(/[^A-Z0-9]/g, '');
};

DATOS.comparar = function (a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
};

/* ------------------------------ almacenamiento local ------------------------------ */
DATOS._leer = function (clave) {
  try { var t = localStorage.getItem(clave); return t ? JSON.parse(t) : null; } catch (e) { return null; }
};
DATOS._guardar = function (clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; }
};
DATOS._borrar = function (clave) {
  try { localStorage.removeItem(clave); } catch (e) { /* nada */ }
};

DATOS.idDispositivo = function () {
  var id = DATOS._leer(DATOS.CLAVE_DISPOSITIVO);
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); DATOS._guardar(DATOS.CLAVE_DISPOSITIVO, id); }
  return id;
};

DATOS.alCambiar = function (fn) { DATOS._oyentes.push(fn); };
DATOS._avisar = function () { DATOS._oyentes.forEach(function (fn) { fn(DATOS.lista); }); };

DATOS.aplicar = function (filas, origen) {
  var lista = { filas: filas, meta: { origen: origen, fecha: new Date().toISOString() } };
  DATOS.lista = lista;
  DATOS.error = null;
  DATOS.indice = {};
  filas.forEach(function (f) { f._n = DATOS.normalizar(f.nombre); DATOS.indice[f.dni] = f; });
  DATOS._avisar();
  return lista;
};

/* ------------------------------ fuente: Supabase ------------------------------ */
DATOS.cargarDesdeServidor = function () {
  return sb.from('reub_personal').select('dni,nombre,linea,lado,labor,obs').eq('activo', true).then(function (r) {
    if (r.error) throw new Error(r.error.message || 'No se pudo consultar la lista de reubicación.');
    var filas = r.data.map(function (f) {
      return { dni: DATOS.claveDoc(f.dni), nombre: f.nombre || '', linea: f.linea || '', lado: f.lado || '', labor: f.labor || '', obs: f.obs || '' };
    });
    DATOS._guardar(DATOS.CLAVE_CACHE, filas);
    return DATOS.aplicar(filas, 'servidor');
  });
};

DATOS.cargarInicial = function () {
  return DATOS.cargarDesdeServidor().catch(function (err) {
    var copia = DATOS._leer(DATOS.CLAVE_CACHE);
    if (copia && copia.length) {
      var l = DATOS.aplicar(copia, 'cache_local');
      l.meta.sinConexion = true;
      return l;
    }
    DATOS.lista = null; DATOS.indice = {}; DATOS.error = err.message; DATOS._avisar();
    throw err;
  });
};

/** Botón "Actualizar lista" en la pestaña Datos: fuerza releer del servidor. */
DATOS.refrescar = function () { return DATOS.cargarDesdeServidor(); };

/* ------------------------------ importar Excel (solo admin) ------------------------------ */
DATOS.LIB_XLSX = 'vendor/xlsx.full.min.js';

DATOS.COLUMNAS = [
  { id: 'dni',    prueba: /\bDNI\b|DOCUMENTO|CARNE|^DOC\b|^NRO\.? ?DOC/ },
  { id: 'linea',  prueba: /LINEA/ },
  { id: 'lado',   prueba: /\bLADO\b/ },
  { id: 'labor',  prueba: /LABOR|PUESTO|ACTIVIDAD|FUNCION|TAREA/ },
  { id: 'obs',    prueba: /OBSERV|COMENTARIO|\bNOTA/ },
  { id: 'nombre', prueba: /NOMBRE|APELLIDO|TRABAJADOR|COLABORADOR/ }
];

DATOS.detectarColumnas = function (fila) {
  var mapa = {}, n = 0;
  (fila || []).forEach(function (celda, i) {
    var t = DATOS.normalizar(celda);
    if (!t || t.length > 40) return;
    for (var k = 0; k < DATOS.COLUMNAS.length; k++) {
      var c = DATOS.COLUMNAS[k];
      if (c.prueba.test(t)) { if (mapa[c.id] === undefined) { mapa[c.id] = i; n++; } break; }
    }
  });
  return { mapa: mapa, n: n };
};

DATOS.leerLibro = function (buffer, nombreArchivo) {
  var libro = XLSX.read(buffer, { type: 'array' });
  var hojas = libro.SheetNames.slice().sort(function (a, b) { return (/REUBIC/i.test(b) ? 1 : 0) - (/REUBIC/i.test(a) ? 1 : 0); });

  var elegido = null;
  for (var s = 0; s < hojas.length && !elegido; s++) {
    var filas = XLSX.utils.sheet_to_json(libro.Sheets[hojas[s]], { header: 1, raw: false, defval: '', blankrows: false });
    for (var r = 0; r < Math.min(filas.length, 25); r++) {
      var det = DATOS.detectarColumnas(filas[r]);
      if (det.mapa.dni !== undefined && det.n >= 3) { elegido = { hoja: hojas[s], filas: filas, fila: r, mapa: det.mapa }; break; }
    }
  }
  if (!elegido) throw new Error('No encontré los encabezados. El Excel debe tener las columnas DNI, NOMBRE, LÍNEA, LADO y LABOR.');

  var m = elegido.mapa;
  var valor = function (f, k) {
    if (m[k] === undefined) return '';
    var v = f[m[k]];
    return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
  };

  var lista = [], vistos = {}, sinDoc = 0, duplicados = [], incompletos = 0;
  for (var i = elegido.fila + 1; i < elegido.filas.length; i++) {
    var f = elegido.filas[i];
    var reg = { dni: DATOS.claveDoc(valor(f, 'dni')), nombre: valor(f, 'nombre'), linea: valor(f, 'linea'), lado: valor(f, 'lado'), labor: valor(f, 'labor'), obs: valor(f, 'obs') };
    if (!reg.dni && !reg.nombre && !reg.linea && !reg.lado && !reg.labor) continue;
    if (!reg.dni) { sinDoc++; continue; }
    if (vistos[reg.dni]) { duplicados.push(reg.dni); continue; }
    if (!reg.nombre || !reg.linea || !reg.lado || !reg.labor) incompletos++;
    vistos[reg.dni] = true;
    lista.push(reg);
  }
  if (!lista.length) throw new Error('El archivo no tiene trabajadores con DNI debajo de los encabezados.');

  var avisos = [];
  var nombres = { nombre: 'NOMBRE', linea: 'LÍNEA A REUBICAR', lado: 'LADO A REUBICAR', labor: 'LABOR A REUBICAR' };
  Object.keys(nombres).forEach(function (k) { if (m[k] === undefined) avisos.push('No se encontró la columna ' + nombres[k] + '.'); });
  if (sinDoc) avisos.push(sinDoc + ' fila(s) sin DNI fueron omitidas.');
  if (duplicados.length) avisos.push(duplicados.length + ' DNI repetido(s); se usó la primera fila: ' + duplicados.slice(0, 5).join(', ') + (duplicados.length > 5 ? '…' : ''));
  if (incompletos) avisos.push(incompletos + ' trabajador(es) con datos incompletos.');

  return { filas: lista, meta: { archivo: nombreArchivo, hoja: elegido.hoja, fecha: new Date().toISOString(), avisos: avisos } };
};

/** Sube el resultado de leerLibro() a Supabase (reemplaza el roster completo). Requiere sesión admin. */
DATOS.subirLote = function (filas) {
  return AT.rpc('rpc_reemplazar_personal_lote', { p_filas: filas }).then(function (r) {
    var res = Array.isArray(r) ? r[0] : r;
    return DATOS.cargarDesdeServidor().then(function () { return res; });
  });
};

/* ------------------------------ búsqueda ------------------------------ */
DATOS.candidatos = function (texto) {
  var t = String(texto || '').trim(), c = [];
  var agregar = function (k) { if (k && c.indexOf(k) < 0) c.push(k); };
  var numeros = t.match(/\d+/g) || [];
  numeros.filter(function (n) { return n.length === 8; }).forEach(agregar);
  numeros.filter(function (n) { return n.length === 9; }).forEach(agregar);
  agregar(DATOS.claveDoc(t));
  numeros.filter(function (n) { return n.length > 9 && /^0+/.test(n); }).forEach(function (n) { agregar(n.slice(-8)); });
  numeros.filter(function (n) { return n.length >= 5 && n.length < 8; }).forEach(function (n) { agregar(DATOS.claveDoc(n)); });
  return c;
};

DATOS.buscar = function (texto) {
  var c = DATOS.candidatos(texto);
  for (var i = 0; i < c.length; i++) { if (DATOS.indice[c[i]]) return { ok: true, fila: DATOS.indice[c[i]], dni: c[i], leido: texto }; }
  var dni = '';
  for (var j = 0; j < c.length; j++) { if (/^\d{8,9}$/.test(c[j])) { dni = c[j]; break; } }
  return { ok: false, fila: null, dni: dni, leido: texto };
};

DATOS.agrupar = function (campo) {
  var m = {};
  (DATOS.lista ? DATOS.lista.filas : []).forEach(function (f) { var k = f[campo] || '(sin dato)'; m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).sort(DATOS.comparar).map(function (k) { return { etq: k, valor: m[k] }; });
};

/* ------------------------------ historial local + auditoría en servidor ------------------------------ */
DATOS.historial = function () { var h = DATOS._leer(DATOS.CLAVE_HIST); return Array.isArray(h) ? h : []; };

DATOS.registrar = function (res, origen) {
  var f = res.fila || {};
  var h = DATOS.historial();
  h.unshift({ ok: res.ok, dni: res.ok ? f.dni : res.dni, t: Date.now(), nombre: f.nombre || '', linea: f.linea || '', lado: f.lado || '', labor: f.labor || '', leido: res.ok ? '' : DR.recortar(res.leido, 60) });
  DATOS._guardar(DATOS.CLAVE_HIST, h.slice(0, 40));

  DATOS._registrarServidor({
    dni_leido: res.ok ? f.dni : (res.dni || ''), encontrado: !!res.ok,
    nombre: f.nombre || '', linea: f.linea || '', lado: f.lado || '', labor: f.labor || '',
    texto_crudo: String(res.leido || '').substring(0, 300),
    origen: origen === 'manual' ? 'manual' : 'escaner',
    dispositivo_id: DATOS.idDispositivo()
  });
};

DATOS._registrarServidor = function (payload) {
  return AT.rpc('rpc_registrar_escaneo', { p: payload }).catch(function () {
    var cola = DATOS._leer(DATOS.CLAVE_COLA) || [];
    cola.push(payload);
    DATOS._guardar(DATOS.CLAVE_COLA, cola.slice(-200));
  });
};

DATOS.vaciarCola = function () {
  var cola = DATOS._leer(DATOS.CLAVE_COLA) || [];
  if (!cola.length) return;
  var pendientes = cola.slice();
  DATOS._borrar(DATOS.CLAVE_COLA);
  pendientes.forEach(function (p) { DATOS._registrarServidor(p); });
};

window.addEventListener('online', function () { DATOS.vaciarCola(); });

DATOS.borrarHistorial = function () { DATOS._borrar(DATOS.CLAVE_HIST); };
