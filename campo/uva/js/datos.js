/* ============================================================================
 * datos.js — CONFIGURACIÓN, REGISTROS Y CÁLCULOS DEL TIEMPO DE CICLO DE UVA
 * Misma lógica que el tiempo de ciclo de arándano de Integra Operaciones
 * (SITIO_AGRITRACER · ciclos, trigger 0002_ciclos_cosecha.sql):
 *   · tiempo de etapa = fin − inicio (min)
 *   · espera = inicio de la etapa − fin de la etapa de la que depende (min); en las etapas en
 *     paralelo (traslado de jaba ↔ cosecha) 0 si se cruzan y, si no, la distancia absoluta
 *   · ciclo total = llegada a planta − el inicio más temprano de las etapas
 *   · el ciclo total solo se llena cuando todas las etapas están completas
 *   · semana = WEEKNUM(fecha) de Excel (semana que empieza en domingo)
 *   · ciclos atípicos (> 480 min) no entran en los promedios
 * Etapas y fórmulas de «T. de ciclo - Uva 26-27.xlsx» (hoja BD, Tabla3):
 *   T. CONFORMACIÓN DE CARGA = espera lecturado + lecturado + espera enzunchado +
 *   enzunchado + espera portabin + portabin + espera carga + carga + espera traslado.
 * Todo se guarda en el equipo (localStorage) y se sube luego a Google Sheets.
 * ==========================================================================*/

var TC = {};

/**
 * Las 8 etapas, en el orden de la BD (el color sigue a la etapa, nunca al ranking).
 * dep: etapa que debe terminar antes (habilita la etapa y define su espera).
 * libre: se puede marcar sin esperar a su etapa previa. Cosecha, traslado de jaba y armado
 *        corren en paralelo; desde el lecturado el orden es obligatorio.
 * sinEspera: el armado de pallet corre en paralelo al traslado de jabas; la BD no mide su espera.
 */
TC.ETAPAS = [
  { id: 'cos', n: 1, nombre: 'Cosecha', dep: null, color: 'var(--e1)', desc: 'Cosecha de la pasada en el lote hasta completar las jabas.' },
  { id: 'tja', n: 2, nombre: 'Traslado de jaba a pallet', dep: 'cos', libre: true, color: 'var(--e2)', desc: 'Traslado de las jabas cosechadas al punto de armado. Puede ir en paralelo a la cosecha y al armado.' },
  { id: 'arm', n: 3, nombre: 'Armado de pallet', dep: 'cos', libre: true, sinEspera: true, color: 'var(--e3)', desc: 'Armado del pallet. Puede ir en paralelo a la cosecha y al traslado de jabas.' },
  { id: 'lec', n: 4, nombre: 'Lecturado', dep: 'arm', color: 'var(--e4)', desc: 'Lectura de códigos del pallet. Se habilita después del armado.' },
  { id: 'enz', n: 5, nombre: 'Enzunchado', dep: 'lec', color: 'var(--e5)', desc: 'Colocación de zunchos al pallet.' },
  { id: 'por', n: 6, nombre: 'Portabin', dep: 'enz', color: 'var(--e6)', desc: 'Movimiento del pallet con portabin hasta la zona de carga.' },
  { id: 'car', n: 7, nombre: 'Carga', dep: 'por', color: 'var(--e7)', desc: 'Carga del pallet al camión.' },
  { id: 'tra', n: 8, nombre: 'Traslado a planta', dep: 'car', color: 'var(--e8)', desc: 'Del fundo a la planta de proceso.' }
];
/** Nombre corto para el selector de pasos (8 en una fila del celular). */
TC.CORTO = { cos: 'Cosecha', tja: 'Tr. jaba', arm: 'Armado', lec: 'Lectura', enz: 'Zuncho', por: 'Portabin', car: 'Carga', tra: 'Planta' };
TC.E = {};
TC.ETAPAS.forEach(function (e, i) { TC.E[e.id] = e; e.i = i; e.corto = TC.CORTO[e.id]; });
/** Etapas que suman en la conformación de carga (con su espera previa). */
TC.CONFORMACION = ['lec', 'enz', 'por', 'car'];

/** Metas referenciales (min). Se ajustan en Config → Metas. */
TC.METAS_BASE = { cos: 10, tja: 5, arm: 20, lec: 3, enz: 3, por: 6, car: 4, tra: 25, espera: 10, conformacion: 60, total: 120 };
TC.ATIPICO = 480;

/* ------------------------------ configuración ------------------------------ */
TC.cfg = DR.leer('tcu.cfg', null) || {};
TC.cfg.usuario = TC.cfg.usuario || '';
TC.cfg.dispositivo = TC.cfg.dispositivo || ('IN-' + Math.random().toString(36).slice(2, 6).toUpperCase());
TC.cfg.sheets = TC.cfg.sheets || { url: '', clave: '', auto: true, ultimaSubida: '' };
// Siempre en vivo: todo cambio se sube a Integra en cuanto hay señal (antes se podía apagar y
// los pallets en proceso o sin iniciar quedaban solo en el celular).
TC.cfg.sheets.enVivo = true;
// IDs eliminados en el equipo que ya estaban en Sheets: se borran allá en la próxima subida.
TC.cfg.bajas = TC.cfg.bajas || [];
TC.cfg.metas = TC.cfg.metas || {};
Object.keys(TC.METAS_BASE).forEach(function (k) { if (TC.cfg.metas[k] === undefined) TC.cfg.metas[k] = TC.METAS_BASE[k]; });
TC.cfg.campana = TC.cfg.campana || 'UVA 26-27';
TC.cfg.grupos = TC.cfg.grupos || [];
if (TC.cfg.alertas === undefined) TC.cfg.alertas = true;
TC.cfg.ultimo = TC.cfg.ultimo || { zona: '', fundo: '', grupo: '', planta: '' };
TC.guardarCfg = function () { DR.guardar('tcu.cfg', TC.cfg); };
TC.guardarCfg();

/** WEEKNUM(fecha) de Excel (tipo 1): la semana 1 contiene el 1 de enero y empieza en domingo. */
TC.semana = function (iso) {
  if (!iso) return '';
  var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), ene = new Date(+p[0], 0, 1);
  return Math.floor((Math.round((d - ene) / 864e5) + ene.getDay()) / 7) + 1;
};

/** Grupos / líderes: los de Config más los ya usados en el equipo. */
TC.grupos = function () {
  return CAT.unicos(TC.cfg.grupos.concat(TC.registros().map(function (r) { return r.grupo; }))).sort();
};

/* ------------------------------ registros ------------------------------ */
TC._regs = DR.leer('tcu.registros', []);
// Registros guardados con el catálogo de la v1.0.0 (tildes dañadas, «LA UNI�N»): se reparan al abrir.
TC._regs.forEach(function (r) { ['zona', 'fundo', 'variedad'].forEach(function (k) { if (r[k]) r[k] = CAT.reparar(r[k]); }); });
TC.registros = function () { return TC._regs; };
TC.obtener = function (id) { return TC._regs.filter(function (r) { return r.id === id; })[0] || null; };
TC.persistir = function () { return DR.guardar('tcu.registros', TC._regs); };
TC.guardarRegistro = function (r, sinTocarFecha) {
  if (!sinTocarFecha) r.actualizado = new Date().toISOString();
  var i = TC._regs.findIndex(function (x) { return x.id === r.id; });
  if (i < 0) TC._regs.unshift(r); else TC._regs[i] = r;
  TC.persistir();
  if (!sinTocarFecha && window.SHEETS) SHEETS.pronto();
};
TC.eliminar = function (id) {
  var r = TC.obtener(id);
  if (r && r.subidoMod) { TC.cfg.bajas.push({ id: r.id, registrador: r.registrador, dispositivo: r.dispositivo }); TC.guardarCfg(); }
  TC._regs = TC._regs.filter(function (x) { return x.id !== id; });
  TC.persistir();
  if (window.SHEETS) SHEETS.pronto();
};

TC.nuevo = function () {
  var u = TC.cfg.ultimo, ahora = new Date().toISOString(), etapas = {};
  TC.ETAPAS.forEach(function (e) { etapas[e.id] = { ini: '', fin: '', com: '', causa: '', editado: false }; });
  // La zona no se elige en la app: sale del fundo en el catálogo vigente (el del perfil de permisos, si hay).
  var fundo = u.fundo && PERM.fundos().indexOf(u.fundo) > -1 ? u.fundo : '';
  return {
    id: 'UV-' + TC.cfg.dispositivo + '-' + Date.now().toString(36).toUpperCase(),
    campana: TC.cfg.campana, fecha: DR.hoyISO(), zona: PERM.zonaDe(fundo), fundo: fundo, lote: '', sublote: '-', pasada: '',
    color: '', variedad: '', grupo: u.grupo || '', pallet: '',
    jabas: '', zunchos: '', placa: '', palletsTot: '', palletsCarg: '', planta: u.planta || '',
    etapas: etapas, observacion: '', estado: 'borrador',
    registrador: TC.cfg.usuario, dispositivo: TC.cfg.dispositivo, creado: ahora, actualizado: ahora, subidoMod: '', error: ''
  };
};

/** Meta de la etapa (min). El traslado usa el estándar fundo → planta del JSON de permisos si existe. */
TC.metaEtapa = function (r, e) {
  if (e.id === 'tra') { var std = PERM.estandarTraslado(r.zona, r.fundo, r.planta); if (std) return std; }
  return Number(TC.cfg.metas[e.id]) || 0;
};

/** Fin de la etapa de la que depende (habilita la etapa y marca el inicio de su espera). */
TC.finPrevio = function (r, e) { return e.dep ? (r.etapas[e.dep].fin || '') : ''; };

/** Minutos por etapa, esperas, conformación de carga, ciclo total y cumplimiento de metas. */
TC.calcular = function (r) {
  var m = TC.cfg.metas, red = function (v) { return v === null ? null : Math.round(v * 10) / 10; };
  var res = { etapas: {}, esperas: 0, suma: 0, total: null, conformacion: null, completas: 0, lenta: null, mayorEspera: null, meta: m.total };
  TC.ETAPAS.forEach(function (e) {
    var x = r.etapas[e.id] || {}, min = DR.minutos(x.ini, x.fin), pf = TC.finPrevio(r, e);
    // En secuencia: inicio − fin de la previa. En paralelo (libre): 0 si se cruzan; si no, distancia absoluta.
    var espera = e.sinEspera ? null : e.libre && e.dep ? TC.esperaParalela(r.etapas[e.dep], x) : (pf && x.ini ? DR.minutos(pf, x.ini) : null);
    res.etapas[e.id] = { min: min, espera: espera, meta: TC.metaEtapa(r, e) };
    if (min !== null) { res.suma += min; res.completas++; if (!res.lenta || min > res.etapas[res.lenta].min) res.lenta = e.id; }
    if (espera !== null) {
      res.esperas += espera;
      if (!res.mayorEspera || espera > res.etapas[res.mayorEspera].espera) res.mayorEspera = e.id;
    }
  });
  // Conformación de carga (columna AR de la BD): solo con todas sus piezas.
  var conf = 0, ok = true;
  TC.CONFORMACION.forEach(function (id) {
    var k = res.etapas[id];
    if (k.min === null || k.espera === null) ok = false; else conf += k.min + k.espera;
  });
  if (ok && res.etapas.tra.espera !== null) res.conformacion = red(conf + res.etapas.tra.espera);
  if (res.completas === TC.ETAPAS.length) res.total = DR.minutos(TC.inicioCiclo(r), r.etapas.tra.fin);
  res.esperas = red(res.esperas);
  res.suma = red(res.suma);
  res.enMeta = res.total !== null && m.total > 0 ? res.total <= m.total : null;
  res.atipico = res.total !== null && res.total > TC.ATIPICO;
  return res;
};

/**
 * Hora imposible (se bloquea al escribirla o marcarla): el fin de una etapa antes de su inicio.
 * El orden ENTRE etapas no se bloquea: cosecha, traslado de jaba y armado corren en paralelo
 * (la cosecha no tiene que ser la primera); en las etapas en secuencia (desde el lecturado) una
 * espera negativa se pide explicar en el comentario (TC.validar). Devuelve el texto o ''.
 */
TC.horaImposible = function (r) {
  for (var i = 0; i < TC.ETAPAS.length; i++) {
    var e = TC.ETAPAS[i], x = r.etapas[e.id];
    if (x.ini && x.fin && new Date(x.fin) < new Date(x.ini)) return 'En ' + e.nombre + ' el fin (' + DR.hhmm(x.fin) + ') es anterior al inicio (' + DR.hhmm(x.ini) + ').';
  }
  return '';
};

/**
 * Espera de una etapa en paralelo respecto a su etapa previa (ej. traslado de jaba ↔ cosecha):
 * si los dos tramos se cruzan no hay espera (0); si no, la distancia absoluta entre ellos
 * (antes o después). null si aún no se puede saber.
 */
TC.esperaParalela = function (d, x) {
  if (!d.ini || !x.ini) return null;
  var dI = new Date(d.ini).getTime(), dF = d.fin ? new Date(d.fin).getTime() : null;
  var xI = new Date(x.ini).getTime(), xF = x.fin ? new Date(x.fin).getTime() : null, ms;
  if (xI >= dI) ms = dF === null || xI <= dF ? 0 : xI - dF;   // empezó durante la previa (cruce) o después de que terminó
  else ms = xF === null || xF >= dI ? 0 : dI - xF;              // empezó antes: cruce, o terminó antes de que empiece la previa
  return Math.round(ms / 6000) / 10;
};

/** Inicio del ciclo: la hora de inicio más temprana de las 8 etapas (la cosecha no siempre es la primera). */
TC.inicioCiclo = function (r) {
  var min = '';
  TC.ETAPAS.forEach(function (e) { var v = r.etapas[e.id].ini; if (v && (!min || new Date(v) < new Date(min))) min = v; });
  return min;
};

/** Valida datos y orden de horas. Devuelve el texto del problema o ''. */
TC.validar = function (r, paraCerrar) {
  var imposible = TC.horaImposible(r);
  if (imposible) return imposible;
  if (paraCerrar) {
    if (!r.fundo) return 'Elige el fundo.';
    if (!r.lote) return 'Escribe o elige el lote.';
    if (!String(r.pallet || '').trim()) return 'Escribe el código de pallet (etapa Cosecha).';
    if (!r.variedad) return 'Indica la variedad.';
    if (!r.grupo) return 'Indica el grupo (líder).';
  }
  for (var i = 0; i < TC.ETAPAS.length; i++) {
    var e = TC.ETAPAS[i], x = r.etapas[e.id], pf = TC.finPrevio(r, e);
    if (paraCerrar && (!x.ini || !x.fin)) return 'Falta completar la etapa ' + e.n + ' · ' + e.nombre + '.';
    if (x.ini && x.fin && new Date(x.fin) < new Date(x.ini)) return 'En ' + e.nombre + ' la hora de fin es anterior al inicio.';
    // Espera negativa: solo se acepta si el supervisor explica el motivo en el comentario de la etapa
    // (las etapas en paralelo, hasta el armado, pueden empezar antes de que termine la cosecha).
    if (pf && !e.libre && x.ini && new Date(x.ini) < new Date(pf) && !String(x.com || '').trim())
      return e.nombre + ' empieza antes de que termine ' + TC.E[e.dep].nombre + '. Corrige la hora o explica el motivo en el comentario de la etapa.';
  }
  if (paraCerrar) {
    if (!(Number(r.jabas) > 0)) return 'Indica el N° de jabas del pallet (etapa Armado de pallet).';
    if (!(Number(r.zunchos) > 0)) return 'Indica el N° de zunchos (etapa Enzunchado).';
    if (!(Number(r.palletsTot) > 0) || !(Number(r.palletsCarg) > 0)) return 'Indica el N° total de pallets y de pallets cargados (etapa Portabin).';
    if (!String(r.placa).trim()) return 'Indica la placa del camión (etapa Carga).';
    if (!r.planta) return 'Indica la planta destino (etapa Traslado a planta).';
  }
  if (r.palletsTot && r.palletsCarg && Number(r.palletsCarg) > Number(r.palletsTot)) return 'Los pallets cargados no pueden ser más que los pallets totales.';
  return '';
};

/** Un borrador «en proceso» ya tiene al menos una etapa iniciada. */
TC.enProceso = function (r) { return r.estado !== 'cerrado' && TC.ETAPAS.some(function (e) { return r.etapas[e.id].ini; }); };
/** Todo lo guardado en el equipo que cambió desde su última subida (también borradores y en proceso). */
TC.pendiente = function (r) { return r.subidoMod !== r.actualizado; };
/** Etapa bloqueada: su etapa previa aún no termina (ej. Lecturado se habilita después del armado).
 *  Las etapas libres (traslado de jaba y armado) nunca se bloquean. */
TC.bloqueada = function (r, e) { return !!e.dep && !e.libre && !r.etapas[e.dep].fin && !r.etapas[e.id].ini; };

/** Dónde está el pallet ahora: etapa en curso (la más avanzada) o la siguiente que espera. */
TC.situacion = function (r) {
  var curso = null, espera = null;
  TC.ETAPAS.forEach(function (e) {
    var x = r.etapas[e.id];
    if (x.ini && !x.fin) curso = { etapa: e.nombre, id: e.id, n: e.n, estado: 'En curso', desde: x.ini };
    else if (!x.ini && !espera && !TC.bloqueada(r, e)) espera = { etapa: e.nombre, id: e.id, n: e.n, estado: e.dep ? 'Esperando' : 'Sin iniciar', desde: TC.finPrevio(r, e) };
  });
  if (curso) return curso;
  if (espera) return espera;
  return { etapa: 'Ciclo completo', id: '', n: 9, estado: 'Completo', desde: r.etapas.tra.fin };
};
TC.etiquetaEstado = function (r) {
  if (r.estado !== 'cerrado') {
    var arriba = r.subidoMod === r.actualizado;
    if (TC.enProceso(r)) return arriba ? ['En proceso · en vivo', 'subido'] : ['En proceso · por subir', ''];
    return arriba ? ['Borrador · en Integra', 'subido'] : ['Borrador · por subir', ''];
  }
  if (r.error && r.subidoMod !== r.actualizado) return ['Error al subir', 'error'];
  return r.subidoMod === r.actualizado ? ['Sincronizado', 'subido'] : ['Por subir', 'cerrado'];
};
/** Nombre corto del registro: «YU8-B · P2 · ALLISON». */
TC.titulo = function (r) {
  return (r.lote || 'Sin lote') + (r.sublote && r.sublote !== '-' ? '-' + r.sublote : '') + (r.pasada ? ' · P' + r.pasada : '') + (r.pallet ? ' · Pallet ' + r.pallet : '');
};

/** Barra apilada de un registro: cada etapa con su espera justo antes (gris rayado), en el orden del proceso. */
TC.ESPERA_FONDO = 'repeating-linear-gradient(135deg,var(--espera) 0 3px,#D5DCE3 3px 6px)';
TC.barra = function (c) {
  var partes = [];
  TC.ETAPAS.forEach(function (e) {
    var k = c.etapas[e.id], w = k.espera;
    if (w > 0) partes.push([w, TC.ESPERA_FONDO, 'Espera antes de ' + e.nombre.toLowerCase()]);
    partes.push([k.min || 0, e.color, e.nombre]);
  });
  var tot = partes.reduce(function (s, p) { return s + p[0]; }, 0);
  if (!tot) return '<div class="barra"></div>';
  return '<div class="barra">' + partes.filter(function (p) { return p[0] > 0; }).map(function (p) {
    return '<span title="' + p[2] + ': ' + DR.dur(p[0]) + '" style="width:' + (p[0] / tot * 100) + '%;background:' + p[1] + '"></span>';
  }).join('') + '</div>';
};
TC.leyenda = function () {
  return '<div class="leyenda">' + TC.ETAPAS.map(function (e) { return '<span><i style="background:' + e.color + '"></i>' + e.n + '. ' + e.nombre + '</span>'; }).join('') +
    '<span><i style="background:' + TC.ESPERA_FONDO + '"></i>Espera entre etapas</span></div>';
};
