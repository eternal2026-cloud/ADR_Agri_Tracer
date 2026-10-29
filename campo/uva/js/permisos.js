/* ============================================================================
 * permisos.js — CATÁLOGO Y PARÁMETROS DESDE INTEGRA (reemplaza el JSON firmado de la APK)
 * En la APK el administrador emite un archivo de permisos por perfil. En Integra quien
 * registra ya entra con su usuario y sus accesos (Config › Accesos), así que el catálogo
 * zona · fundo · lote · variedad (tabla uva_catalogo), las plantas, las líneas, la campaña
 * y los estándares de traslado (parametros.UVA_CONFIG) se leen de la base con rpc_uva_config
 * y se guardan en el equipo para trabajar sin señal. Mismas funciones que la APK (PERM.*).
 * ==========================================================================*/

var PERM = { CLAVE: 'tcu.integra' };

PERM.datos = function () { return DR.leer(PERM.CLAVE, null); };
PERM.activo = function () { return !!PERM.datos(); };
PERM.catalogo = function () {
  var p = PERM.datos();
  return p && Array.isArray(p.catalogo) && p.catalogo.length ? p.catalogo : null;
};
PERM.lideresAcum = function () { var p = PERM.datos(); return p && Array.isArray(p.lideres) ? p.lideres : []; };

PERM.fundos = function () { return CAT.fundos(''); };
PERM.zonaDe = function (fundo) { return CAT.zonaDeFundo(fundo); };
PERM.plantas = function () {
  var p = PERM.datos();
  return p && Array.isArray(p.plantas) && p.plantas.length ? p.plantas.map(CAT.limpiar) : CAT.PLANTAS;
};

/** Líderes para el contexto del pallet (zona · fundo · lote). Sin lista → [] (se escribe libre). */
PERM.lideres = function (zona, fundo, lote) {
  var vale = function (v, x) { return !v || CAT.limpiar(v) === x; };
  return CAT.unicos(PERM.lideresAcum().filter(function (l) {
    var lotes = (l.lotes || []).map(CAT.limpiar);
    return vale(l.zona, zona) && vale(l.fundo, fundo) && (!lotes.length || lotes.indexOf(lote) > -1);
  }).map(function (l) { return CAT.limpiar(l.nombre); })).sort();
};

/** Estándar de traslado (min) del fundo a la planta: el más específico que aplique (igual que la APK). */
PERM.estandarTraslado = function (zona, fundo, planta) {
  var p = PERM.datos(), l = p && Array.isArray(p.traslados) ? p.traslados : [];
  var nivel = function (t) {
    var z = CAT.limpiar(t.zona), f = CAT.limpiar(t.fundo), pl = CAT.limpiar(t.planta);
    if ((z && z !== zona) || (f && f !== fundo) || (pl && pl !== planta)) return -1;
    return (f ? 4 : 0) + (pl ? 2 : 0) + (z ? 1 : 0);
  };
  var mejor = null, n = -1;
  l.forEach(function (t) { var k = nivel(t); if (k > n && Number(t.min) > 0) { n = k; mejor = Number(t.min); } });
  return mejor;
};

PERM.nombrePerfil = function () { return 'Integra'; };
PERM.traza = function () { return { perfil: 'Integra', version: '', firma: '', hash: '' }; };

/** Trae catálogo y parámetros de Integra. Sin señal se sigue con lo guardado en el equipo. */
PERM.cargar = function () {
  return sb.rpc('rpc_uva_config').then(function (r) {
    if (r.error || !r.data) throw new Error((r.error && r.error.message) || 'Sin datos.');
    var c = r.data.config || {};
    var p = {
      actualizado: new Date().toISOString(),
      // + los lotes digitados en este equipo que aún no llegan a Integra (CAT.agregarLote).
      catalogo: (r.data.catalogo || []).map(function (f) { return [CAT.limpiar(f[0]), CAT.limpiar(f[1]), CAT.limpiar(f[2]), CAT.normVariedad(f[3])]; })
        .concat((TC.cfg.lotesNuevos || []).filter(function (n) { return !(r.data.catalogo || []).some(function (f) { return CAT.limpiar(f[1]) === n[1] && CAT.limpiar(f[2]) === n[2]; }); })),
      plantas: Array.isArray(c.plantas) ? c.plantas : [],
      lineas: Array.isArray(c.lineas) ? c.lineas : [],
      lideres: Array.isArray(c.lideres) ? c.lideres : [],
      traslados: Array.isArray(c.traslados) ? c.traslados : [],
      campana: c.campana || ''
    };
    DR.guardar(PERM.CLAVE, p);
    if (p.campana) { TC.cfg.campana = CAT.limpiar(p.campana); TC.guardarCfg(); }
    return p;
  });
};
