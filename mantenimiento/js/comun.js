/* ============================================================================
 * comun.js — NÚCLEO DEL MÓDULO REVISIÓN DEL PLAN DE MANTENIMIENTO
 * Resultado = 100 % − 0,5 % por cada no conformidad (igual que en fn_mp_puntaje).
 * Los checks campo por campo son solo ayuda visual: viven en este dispositivo
 * (localStorage) y se borran al cerrar la revisión.
 * ==========================================================================*/
var VISTAS = {};
var MP = { DESCUENTO_NC: 0.5, BUCKET: 'plan-mantenimiento' };
FOTOS.BUCKET = MP.BUCKET;

MP.MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Campos que el revisor contrasta en cada OT (orden de la hoja del Excel). */
MP.CAMPOS = [
  { k: 'num_ot', t: '# OT' },
  { k: 'descripcion', t: 'Descripción' },
  { k: 'sub_equipo', t: 'Sub equipo' },
  { k: 'personas', t: 'Personas' },
  { k: 'f_ini_plan', t: 'Inicio plan', fecha: true },
  { k: 'f_fin_plan', t: 'Fin plan', fecha: true },
  { k: 'f_ini_real', t: 'Inicio real', fecha: true },
  { k: 'f_fin_real', t: 'Fin real', fecha: true }
];

MP.puntaje = function (nc) { return Math.max(0, 100 - MP.DESCUENTO_NC * (Number(nc) || 0)); };
MP.pct = function (v) { return DR.num(v, 1) + '%'; };
MP.pillPuntaje = function (v) {
  var clase = v >= 100 ? 'verde' : (v >= 98.5 ? 'naranja' : 'rojo');
  return '<span class="pill ' + clase + '">' + MP.pct(v) + '</span>';
};
MP.pillEstado = function (e) {
  return UI.pill({ en_curso: 'En curso', cerrada: 'Cerrada', anulada: 'Anulada' }[e] || e,
    { 'En curso': 'azul', 'Cerrada': 'verde', 'Anulada': 'rojo' });
};
MP.etiqueta = function (r) { return MP.MESES[r.mes - 1] + ' ' + r.anio; };
MP.fecha = function (f) {
  var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (f ? String(f) : '');
};
MP.valor = function (ot, c) { return c.fecha ? MP.fecha(ot[c.k]) : (ot[c.k] || ''); };
MP.tieneHallazgo = function (ot) { return !!(ot.observacion || ot.no_conformidad); };

MP.uuid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).substring(1); }).join('');
  return h.substring(0, 8) + '-' + h.substring(8, 12) + '-' + h.substring(12, 16) + '-' + h.substring(16, 20) + '-' + h.substring(20);
};

/* ------------------------------------------------------------ checks locales */
MP.claveChecks = function (revId) { return 'mp_checks_' + revId; };
MP.leerChecks = function (revId) {
  try { return JSON.parse(localStorage.getItem(MP.claveChecks(revId)) || '{}') || {}; } catch (e) { return {}; }
};
MP.guardarChecks = function (revId, checks) {
  try { localStorage.setItem(MP.claveChecks(revId), JSON.stringify(checks)); } catch (e) { /* sin almacenamiento */ }
};
MP.borrarChecks = function (revId) {
  try { localStorage.removeItem(MP.claveChecks(revId)); } catch (e) { /* sin almacenamiento */ }
};
MP.otCompleta = function (checks, ot) { return (checks[ot.id] || []).length >= MP.CAMPOS.length; };

/* ------------------------------------------------------------ datos */
MP.revisiones = function (incluirAnuladas) {
  var q = sb.from('mp_revisiones').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }).order('creado_en', { ascending: false }).limit(200);
  if (!incluirAnuladas) q = q.neq('estado', 'anulada');
  return q.then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; });
};
MP.revision = function (id) {
  return sb.from('mp_revisiones').select('*').eq('id', id).maybeSingle().then(function (r) {
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new Error('No existe la revisión.');
    return r.data;
  });
};
/** OT de una revisión, paginadas (PostgREST corta en 1000). */
MP.ots = function (revId, soloHallazgos) {
  var todas = [];
  var pagina = function (desde) {
    var q = sb.from('mp_ot').select('*').eq('revision_id', revId).order('fila').range(desde, desde + 999);
    if (soloHallazgos) q = q.or('observacion.not.is.null,no_conformidad.not.is.null');
    return q.then(function (r) {
      if (r.error) throw new Error(r.error.message);
      todas = todas.concat(r.data || []);
      return (r.data || []).length === 1000 ? pagina(desde + 1000) : todas;
    });
  };
  return pagina(0);
};

/** Tabla dinámica Planta > Responsable (como Hoja1 del Excel). */
MP.pivote = function (ots, checks) {
  var mapa = {}, plantas = [], total = { n: 0, obs: 0, nc: 0, ok: 0 };
  var sumar = function (g, ot) {
    g.n++;
    if (ot.observacion) g.obs++;
    if (ot.no_conformidad) g.nc++;
    if (checks && MP.otCompleta(checks, ot)) g.ok++;
  };
  ots.forEach(function (ot) {
    var p = mapa[ot.planta];
    if (!p) { p = mapa[ot.planta] = { planta: ot.planta, n: 0, obs: 0, nc: 0, ok: 0, resp: {}, lista: [] }; plantas.push(p); }
    var r = p.resp[ot.responsable];
    if (!r) { r = p.resp[ot.responsable] = { responsable: ot.responsable, n: 0, obs: 0, nc: 0, ok: 0 }; p.lista.push(r); }
    sumar(p, ot); sumar(r, ot); sumar(total, ot);
  });
  var orden = function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); };
  plantas.sort(function (a, b) { return orden(a.planta, b.planta); });
  plantas.forEach(function (p) { p.lista.sort(function (a, b) { return orden(a.responsable, b.responsable); }); });
  return { plantas: plantas, total: total };
};

/** Resultado por encargado consolidado entre plantas. */
MP.porEncargado = function (ots) {
  var mapa = {}, lista = [];
  ots.forEach(function (ot) {
    var e = mapa[ot.responsable];
    if (!e) { e = mapa[ot.responsable] = { responsable: ot.responsable, plantas: [], n: 0, obs: 0, nc: 0 }; lista.push(e); }
    if (e.plantas.indexOf(ot.planta) < 0) e.plantas.push(ot.planta);
    e.n++;
    if (ot.observacion) e.obs++;
    if (ot.no_conformidad) e.nc++;
  });
  lista.forEach(function (e) { e.plantas.sort(); e.resultado = MP.puntaje(e.nc); });
  return lista.sort(function (a, b) { return a.resultado - b.resultado || (a.responsable < b.responsable ? -1 : 1); });
};

/** Ejecuta una RPC desde un botón (lo deshabilita mientras tanto). */
MP.accion = function (btn, nombre, args, ok) {
  btn.disabled = true;
  btn.classList.add('cargando');
  return AT.rpc(nombre, args).then(function (r) {
    if (ok) DR.toast(ok);
    return r;
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    DR.toast(e.message, 'error');
    throw e;
  });
};
