/* ============================================================================
 * catalogo.js — ZONA · FUNDO · LOTE · VARIEDAD (Uva 26-27)
 * Base: «Zona - fundo - lote - variedad.xlsx» (Hoja3), limpiada: sin espacios
 * sobrantes y con la variedad unificada («AUTUMNCRISP» → «AUTUMN CRISP», como en
 * la BD de tiempos de ciclo). Se puede reemplazar desde Config → Catálogo de lotes
 * pegando un CSV «Zona;Fundo;Lote;Variedad»; el reemplazo queda guardado en el equipo.
 * ==========================================================================*/

var CAT = {};

/** [zona, fundo, lote, variedad] */
CAT.BASE = [
  ["ALTA", "LA PAUSA", "PU1", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU10", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU11", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU12", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU2", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU3", "AUTUMN CRISP"],
  ["ALTA", "LA PAUSA", "PU4", "AUTUMN CRISP"],
  ["ALTA", "LA QUEBRADA", "QU10", "AUTUMN CRISP"],
  ["ALTA", "LA QUEBRADA", "QU11", "MIDNIGHT BEAUTY"],
  ["ALTA", "LA QUEBRADA", "QU12", "MIDNIGHT BEAUTY"],
  ["ALTA", "LA QUEBRADA", "QU13", "AUTUMN CRISP"],
  ["ALTA", "LA QUEBRADA", "QU4", "AUTUMN CRISP"],
  ["ALTA", "LA QUEBRADA", "QU8", "RUBY RUSH"],
  ["ALTA", "LA QUEBRADA", "QU9", "RUBY RUSH"],
  ["ALTA", "LA UNIÓN", "UU1", "TIMCO"],
  ["ALTA", "LA UNIÓN", "UU11", "COTTON CANDY"],
  ["ALTA", "LA UNIÓN", "UU2", "COTTON CANDY"],
  ["ALTA", "LA UNIÓN", "UU5", "SWEET GLOBE"],
  ["ALTA", "LA UNIÓN", "UU6", "SWEET GLOBE"],
  ["ALTA", "LA UNIÓN", "UU7", "COTTON CANDY"],
  ["ALTA", "SANTA ROSA", "RU12", "AUTUMN CRISP"],
  ["ALTA", "SANTA ROSA", "RU15", "AUTUMN CRISP"],
  ["ALTA", "SANTA ROSA", "RU6", "MUSCAT BEAUTY"],
  ["ALTA", "YANCAY", "YU11", "AUTUMN CRISP"],
  ["ALTA", "YANCAY", "YU13", "RUBY RUSH"],
  ["ALTA", "YANCAY", "YU17", "AUTUMN CRISP"],
  ["ALTA", "YANCAY", "YU5", "AUTUMN CRISP"],
  ["BAJA", "DON CARLOS", "CU12", "AUTUMN CRISP"],
  ["BAJA", "DON CARLOS", "CU13", "AUTUMN CRISP"],
  ["BAJA", "DON CARLOS", "CU16", "SWEET CELEBRATION"],
  ["BAJA", "DON CARLOS", "CU4", "SWEET CELEBRATION"],
  ["BAJA", "DON CARLOS", "CU8", "AUTUMN CRISP"],
  ["BAJA", "DON CARLOS", "CU9", "SABLE"],
  ["BAJA", "EL ALTO", "AU1", "AUTUMN CRISP"],
  ["BAJA", "EL ALTO", "AU11", "AUTUMN CRISP"],
  ["BAJA", "EL ALTO", "AU2", "AUTUMN CRISP"],
  ["BAJA", "EL ALTO", "AU4", "ALLISON"],
  ["BAJA", "EL ALTO", "AU7", "ALLISON"],
  ["BAJA", "EL ALTO", "AU9", "MIDNIGHT BEAUTY"],
  ["BAJA", "EL TUNAL", "TU1", "SWEET CELEBRATION"],
  ["BAJA", "EL TUNAL", "TU11", "JACK'S SALUTE"],
  ["BAJA", "EL TUNAL", "TU12", "JACK'S SALUTE"],
  ["BAJA", "EL TUNAL", "TU13", "TIMCO"],
  ["BAJA", "EL TUNAL", "TU4", "TIMPSON"],
  ["BAJA", "EL TUNAL", "TU6", "JACK'S SALUTE"],
  ["BAJA", "LA MÁQUINA", "MU1", "AUTUMN CRISP"],
  ["BAJA", "LA MÁQUINA", "MU10", "AUTUMN CRISP"],
  ["BAJA", "LA MÁQUINA", "MU12", "SWEET CELEBRATION"],
  ["BAJA", "LA MÁQUINA", "MU2", "AUTUMN CRISP"],
  ["BAJA", "LA MÁQUINA", "MU3", "SWEET CELEBRATION"],
  ["BAJA", "LA MÁQUINA", "MU4", "SWEET CELEBRATION"],
  ["BAJA", "LA MÁQUINA", "MU6", "SWEET CELEBRATION"],
  ["BAJA", "LA MÁQUINA", "MU7", "SABLE"],
  ["BAJA", "LA MÁQUINA", "MU8", "SABLE"],
  ["VILLACURI", "CASA CHICA", "HU24", "AUTUMN CRISP"],
  ["VILLACURI", "CASA CHICA", "HU25", "AUTUMN CRISP"]
];

/** Color comercial por variedad (se propone al elegir el lote; editable en el registro). */
CAT.COLORES = ['ROJA', 'BLANCA', 'NEGRA'];
CAT.COLOR_VARIEDAD = {
  'ALLISON': 'ROJA', 'RUBY RUSH': 'ROJA', 'SWEET CELEBRATION': 'ROJA', 'TIMCO': 'ROJA', "JACK'S SALUTE": 'ROJA',
  'AUTUMN CRISP': 'BLANCA', 'TIMPSON': 'BLANCA', 'COTTON CANDY': 'BLANCA', 'SWEET GLOBE': 'BLANCA',
  'MIDNIGHT BEAUTY': 'NEGRA', 'SABLE': 'NEGRA', 'MUSCAT BEAUTY': 'NEGRA'
};

/** Plantas destino del traslado (columna PLANTA de la BD). */
CAT.PLANTAS = ['LOS MOLINOS', 'DON CARLOS', 'YANCAY'];

/** Causas de espera / demora (para el Pareto del dashboard). */
CAT.CAUSAS = ['Falta de camión', 'Falta de portabin', 'Falta de personal', 'Esperando lecturador', 'Esperando zunchos / insumos',
  'Pallet incompleto', 'Montacargas ocupado', 'Camino / acceso', 'Lluvia / clima', 'Falla de equipo', 'Otra'];

CAT.limpiar = function (s) { return CAT.reparar(String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase()); };

/**
 * Repara tildes dañadas por una codificación equivocada («LA UNI�N», «LA UNIÃ“N» → «LA UNIÓN»):
 * busca en el catálogo un nombre que coincida letra por letra salvo en los caracteres dañados.
 */
CAT.reparar = function (s) {
  s = String(s || '');
  if (!/[�ÃÂ]/.test(s)) return s;
  s = s.replace(/[ÃÂ][\s\S]/g, '�');  // «Ã“» = UTF-8 leído como Windows-1252: un solo carácter original
  var re = new RegExp('^' + s.split('�').map(function (p) { return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('.') + '$');
  var nombres = [];
  CAT.BASE.forEach(function (f) { nombres.push(f[0], f[1], f[3]); });
  return nombres.filter(function (n) { return re.test(n); })[0] || s;
};
CAT.normVariedad = function (v) { v = CAT.limpiar(v); return v === 'AUTUMNCRISP' ? 'AUTUMN CRISP' : v; };

/** Catálogo vigente: el de los permisos del administrador (solo sus lotes), el reemplazado en Config o el de fábrica. */
CAT.filas = function () {
  var perm = typeof PERM !== 'undefined' && PERM.catalogo();
  if (perm) return perm;
  var p = DR.leer('tcu.catalogo', null);
  return Array.isArray(p) && p.length ? p : CAT.BASE;
};
CAT.unicos = function (l) { var o = []; l.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; };
CAT.zonas = function () { return CAT.unicos(CAT.filas().map(function (f) { return f[0]; })); };
CAT.fundos = function (zona) { return CAT.unicos(CAT.filas().filter(function (f) { return !zona || f[0] === zona; }).map(function (f) { return f[1]; })).sort(); };
CAT.lotes = function (zona, fundo) {
  return CAT.filas().filter(function (f) { return (!zona || f[0] === zona) && (!fundo || f[1] === fundo); })
    .map(function (f) { return f[2]; }).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
};
CAT.variedades = function () {
  return CAT.unicos(CAT.filas().map(function (f) { return f[3]; }).concat(Object.keys(CAT.COLOR_VARIEDAD))).sort();
};
/** Fila del catálogo para un lote (dentro del fundo si se indica). */
CAT.lote = function (lote, fundo) {
  lote = CAT.limpiar(lote);
  return CAT.filas().filter(function (f) { return f[2] === lote && (!fundo || f[1] === fundo); })[0] || null;
};
CAT.zonaDeFundo = function (fundo) { var f = CAT.filas().filter(function (x) { return x[1] === fundo; })[0]; return f ? f[0] : ''; };
CAT.colorDe = function (variedad) { return CAT.COLOR_VARIEDAD[CAT.normVariedad(variedad)] || ''; };

/** CSV/TSV pegado («Zona;Fundo;Lote;Variedad», con o sin encabezado) → filas limpias. */
CAT.desdeTexto = function (txt) {
  var filas = [];
  String(txt || '').split(/\r?\n/).forEach(function (lin) {
    var c = lin.split(/[;\t,]/).map(CAT.limpiar);
    if (c.length < 4 || !c[0] || !c[2] || c[0] === 'ZONA') return;
    filas.push([c[0], c[1], c[2], CAT.normVariedad(c[3])]);
  });
  return filas;
};
