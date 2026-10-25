/* ============================================================================
 * datos.js — CATÁLOGOS, CÁLCULOS Y CARGA DEL ESTUDIO DE COSECHADOR TOP
 * Namespace TOP. Los catálogos de actividades y de ítems de estándar viven en
 * Supabase (migración 0046); REBA y el checklist ergonómico se definen aquí,
 * igual que en «FORMATO REBA Y CHECKLIST ERGONOMÍA - COSECHA ARÁNDANO.xlsx».
 * ==========================================================================*/
var TOP = { actividades: [], items: [], listas: { fundo: [] } };

FOTOS.BUCKET = 'estudio-top';
FOTOS.MAX = 3;

/** Clases de actividad: qué parte de la jornada agrega valor y cuál se puede reducir. */
TOP.CLASES = {
  productiva: { t: 'Productiva', c: '#76B729', d: 'Agrega valor: cosecha.' },
  soporte: { t: 'Soporte necesario', c: '#0097CE', d: 'Necesaria, pero se puede acortar o estandarizar.' },
  espera: { t: 'Espera / eliminable', c: '#EF7C3B', d: 'No agrega valor: candidata a eliminar o reducir.' },
  personal: { t: 'Personal', c: '#A89A8C', d: 'Necesidades del trabajador (almuerzo, SSHH).' }
};
TOP.ORDEN_CLASES = ['productiva', 'soporte', 'espera', 'personal'];

/* ------------------------------------------------ almacenamiento local (borradores) */
TOP.leer = function (k, def) {
  try { var v = localStorage.getItem('integra.top.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
};
TOP.escribir = function (k, v) {
  try { if (v === null || v === undefined) localStorage.removeItem('integra.top.' + k); else localStorage.setItem('integra.top.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ }
};

/* ------------------------------------------------ fechas y duraciones (con segundos) */
TOP.pad = function (n) { return (n < 10 ? '0' : '') + n; };
TOP.localDe = function (d) {
  var p = TOP.pad;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};
TOP.hoy = function () { return TOP.localDe(new Date()).substring(0, 10); };
TOP.aIso = function (v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
TOP.aLocal = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : TOP.localDe(d); };
TOP.horaSeg = function (iso) { var l = TOP.aLocal(iso); return l ? l.substring(11, 19) : '—'; };
/** Segundos → «m:ss» o «h:mm:ss». */
TOP.seg = function (s) {
  if (s === null || s === undefined || s === '' || isNaN(s)) return '—';
  s = Math.round(Math.abs(Number(s)));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? h + ':' + TOP.pad(m) + ':' + TOP.pad(x) : m + ':' + TOP.pad(x);
};
/** Segundos → texto para leer: «45 s», «3 min 05 s», «1 h 12 min». */
TOP.segTexto = function (s) {
  if (s === null || s === undefined || isNaN(s)) return '—';
  s = Math.round(Number(s));
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + TOP.pad(s % 60) + ' s' : '');
  return Math.floor(s / 3600) + ' h ' + TOP.pad(Math.floor((s % 3600) / 60)) + ' min';
};
TOP.fecha = function (f) { return f ? f.substring(8, 10) + '/' + f.substring(5, 7) + '/' + f.substring(0, 4) : '—'; };

/* ------------------------------------------------ estadística */
TOP.cuantil = function (orden, q) {
  if (!orden.length) return null;
  var pos = (orden.length - 1) * q, b = Math.floor(pos), r = pos - b;
  return orden[b + 1] !== undefined ? orden[b] + r * (orden[b + 1] - orden[b]) : orden[b];
};
TOP.estadistica = function (valores) {
  var v = valores.filter(function (x) { return x !== null && x !== undefined && !isNaN(x); }).map(Number).sort(function (a, b) { return a - b; });
  if (!v.length) return { n: 0 };
  var suma = v.reduce(function (a, b) { return a + b; }, 0), prom = suma / v.length;
  var de = v.length > 1 ? Math.sqrt(v.reduce(function (a, b) { return a + (b - prom) * (b - prom); }, 0) / (v.length - 1)) : 0;
  return { n: v.length, suma: suma, prom: prom, med: TOP.cuantil(v, 0.5), p25: TOP.cuantil(v, 0.25), p75: TOP.cuantil(v, 0.75),
    min: v[0], max: v[v.length - 1], de: de, cv: prom ? de / prom * 100 : 0 };
};

/* ------------------------------------------------ REBA (hoja «CHECKLIST REBA») */
TOP.REBA_A = [[[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]], [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]], [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
  [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]], [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]]];
TOP.REBA_B = [[[1, 2, 2], [1, 2, 3]], [[1, 2, 3], [2, 3, 4]], [[3, 4, 5], [4, 5, 5]], [[4, 5, 5], [5, 6, 7]], [[6, 7, 8], [7, 8, 8]], [[7, 8, 8], [8, 9, 9]]];
TOP.REBA_C = [[1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7], [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8], [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9], [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9], [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11], [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11], [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12], [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12], [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]];
TOP.RIESGOS = [
  { t: 'Inapreciable', c: '#76B729', accion: 'No es necesaria actuación' },
  { t: 'Bajo', c: '#B5D33D', accion: 'Puede ser necesaria la actuación' },
  { t: 'Medio', c: '#E8B04A', accion: 'Es necesaria la actuación' },
  { t: 'Alto', c: '#EF7C3B', accion: 'Es necesaria la actuación cuanto antes' },
  { t: 'Muy alto', c: '#E5484D', accion: 'Es necesaria la actuación de inmediato' }
];

/** Mismo cálculo que fn_top_reba_puntaje (el servidor lo recalcula al guardar). */
TOP.rebaCalc = function (r) {
  var b = function (x) { return x ? 1 : 0; };
  var cu = Math.min(3, r.cuello + b(r.cuello_mod)), tr = Math.min(5, r.tronco + b(r.tronco_mod)), pi = Math.min(4, r.piernas + (r.piernas_mod || 0));
  var br = Math.max(1, Math.min(6, r.brazo + b(r.brazo_elevado) - b(r.brazo_apoyo))), mu = Math.min(3, r.muneca + b(r.muneca_mod));
  var a = TOP.REBA_A[tr - 1][cu - 1][pi - 1], bb = TOP.REBA_B[br - 1][r.antebrazo - 1][mu - 1];
  var pa = Math.min(12, a + (r.carga || 0) + b(r.carga_brusca)), pb = Math.min(12, bb + (r.agarre || 0));
  var c = TOP.REBA_C[pa - 1][pb - 1], f = c + b(r.act_estatica) + b(r.act_repetitiva) + b(r.act_inestable);
  var nv = f === 1 ? 0 : (f <= 3 ? 1 : (f <= 7 ? 2 : (f <= 10 ? 3 : 4)));
  return { tabla_a: a, puntaje_a: pa, tabla_b: bb, puntaje_b: pb, puntaje_c: c, puntaje_final: f, nivel: nv, riesgo: TOP.RIESGOS[nv].t };
};

/** Segmentos REBA con sus opciones, modificadores e imagen de la hoja. */
TOP.REBA_SEG = [
  { k: 'cuello', grupo: 'A', t: 'Cuello', img: 'img/reba-cuello.jpg',
    op: [{ v: 1, t: '0°–20° flexión' }, { v: 2, t: '>20° flexión o en extensión' }],
    mods: [{ k: 'cuello_mod', t: 'Rotación o inclinación lateral del cuello', v: '+1' }] },
  { k: 'tronco', grupo: 'A', t: 'Tronco', img: 'img/reba-tronco.jpg',
    op: [{ v: 1, t: '0° erguido' }, { v: 2, t: '0°–20° flexión o extensión' }, { v: 3, t: '20°–60° flexión o >20° extensión' }, { v: 4, t: '>60° flexión' }],
    mods: [{ k: 'tronco_mod', t: 'Rotación o inclinación lateral del tronco', v: '+1' }] },
  { k: 'piernas', grupo: 'A', t: 'Piernas', img: 'img/reba-piernas.jpg',
    op: [{ v: 1, t: 'Soporte bilateral, andando o sentado' }, { v: 2, t: 'Soporte unilateral, ligero o postura inestable' }],
    mods: [{ k: 'piernas_mod', t: 'Flexión de rodilla 30°–60°', v: '+1', valor: 1 }, { k: 'piernas_mod', t: 'Flexión de rodilla >60° (no aplica sentado)', v: '+2', valor: 2 }] },
  { k: 'carga', grupo: 'A', t: 'Carga / fuerza',
    op: [{ v: 0, t: '<5 kg' }, { v: 1, t: '5–10 kg' }, { v: 2, t: '>10 kg' }],
    mods: [{ k: 'carga_brusca', t: 'La fuerza se aplica rápida y brusca', v: '+1' }] },
  { k: 'brazo', grupo: 'B', t: 'Brazo (superior)', svg: 'brazo',
    op: [{ v: 1, t: '0°–20° flexión o extensión' }, { v: 2, t: '20°–45° flexión o >20° extensión' }, { v: 3, t: '45°–90° flexión' }, { v: 4, t: '>90° flexión' }],
    mods: [{ k: 'brazo_elevado', t: 'Hombro elevado o brazo rotado', v: '+1' }, { k: 'brazo_apoyo', t: 'Apoyo o postura a favor de la gravedad', v: '−1' }] },
  { k: 'antebrazo', grupo: 'B', t: 'Antebrazo', img: 'img/reba-antebrazo.jpg',
    op: [{ v: 1, t: '60°–100° flexión' }, { v: 2, t: '<60° o >100° flexión' }], mods: [] },
  { k: 'muneca', grupo: 'B', t: 'Muñeca', img: 'img/reba-muneca.jpg',
    op: [{ v: 1, t: '0°–15° flexión o extensión' }, { v: 2, t: '>15° flexión o extensión' }],
    mods: [{ k: 'muneca_mod', t: 'Desviación radial/cubital o torsión', v: '+1' }] },
  { k: 'agarre', grupo: 'B', t: 'Agarre',
    op: [{ v: 0, t: 'Bueno: firme y cómodo' }, { v: 1, t: 'Regular: aceptable pero no ideal' }, { v: 2, t: 'Malo: posible pero incómodo' }, { v: 3, t: 'Inaceptable: forzado o sin manija' }], mods: [] },
  { k: 'actividad', grupo: 'C', t: 'Actividad muscular', op: [],
    mods: [{ k: 'act_estatica', t: '¿Una o más partes del cuerpo permanecen estáticas? (>1 min)', v: '+1' },
      { k: 'act_repetitiva', t: '¿Existen movimientos repetitivos? (>4 veces/min)', v: '+1' },
      { k: 'act_inestable', t: '¿Cambios posturales importantes o posturas inestables?', v: '+1' }] }
];
TOP.REBA_VACIO = function () {
  return { cuello: 1, cuello_mod: false, tronco: 1, tronco_mod: false, piernas: 1, piernas_mod: 0, carga: 0, carga_brusca: false,
    brazo: 1, brazo_elevado: false, brazo_apoyo: false, antebrazo: 1, muneca: 1, muneca_mod: false, agarre: 0,
    act_estatica: false, act_repetitiva: false, act_inestable: false, actividad_id: 4, momento: '', observacion: '', fotos: [] };
};

/** Brazo superior: no viene dibujado en la hoja; esquema de zonas de flexión. */
TOP.svgBrazo = function () {
  var z = function (a1, a2, n, col) {
    var r = 108, cx = 130, cy = 70, rad = function (a) { return a * Math.PI / 180; };
    var x1 = cx + r * Math.sin(rad(a1)), y1 = cy + r * Math.cos(rad(a1)), x2 = cx + r * Math.sin(rad(a2)), y2 = cy + r * Math.cos(rad(a2));
    var m = (a1 + a2) / 2, tx = cx + 84 * Math.sin(rad(m)), ty = cy + 84 * Math.cos(rad(m));
    return '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 0,' + (a2 > a1 ? 0 : 1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z" fill="' + col + '" fill-opacity=".22" stroke="' + col + '" stroke-opacity=".6"/>' +
      '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="11" fill="#fff" stroke="#222"/><text x="' + tx.toFixed(1) + '" y="' + (ty + 4.5).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#222">' + n + '</text>';
  };
  return '<svg class="top-svg" viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zonas de flexión del brazo">' +
    '<rect width="260" height="200" fill="#fff"/>' +
    z(-20, 20, 1, '#76B729') + z(20, 45, 2, '#B5D33D') + z(-20, -45, 2, '#B5D33D') + z(45, 90, 3, '#E8B04A') + z(90, 160, 4, '#E5484D') +
    '<path d="M118 28c0-10 6-17 13-17s13 7 13 17-6 18-13 18-13-8-13-18z" fill="none" stroke="#222" stroke-width="2"/>' +
    '<path d="M122 46l-4 70 6 60M140 46l6 70-6 60" fill="none" stroke="#222" stroke-width="2"/>' +
    '<path d="M130 70l42 52" stroke="#222" stroke-width="5" stroke-linecap="round"/>' +
    '<text x="132" y="196" font-size="11" fill="#444">0°</text><text x="196" y="160" font-size="11" fill="#444">45°</text><text x="232" y="80" font-size="11" fill="#444">90°</text><text x="44" y="160" font-size="11" fill="#444">20° ext.</text>' +
    '</svg>';
};

/* ------------------------------------------------ checklist ergonómico (hoja «CHECK LIST ERGONOMIA»)
 * malo: la respuesta que indica un problema ergonómico (para el % desfavorable del Resumen). */
TOP.ERGO = [
  { t: '1. Puesto de trabajo', items: [
    ['1.1', 'Es adecuada la distancia entre sus ojos y el trabajo que realiza', 'NO'],
    ['1.2', 'Tiene espacio suficiente para variar la posición de piernas y rodillas', 'NO'],
    ['1.3', 'Puede apoyar los brazos', 'NO'],
    ['1.4', 'La altura de la herramienta, ¿es la adecuada a su estatura?', 'NO'],
    ['1.5', 'Levanta pesos superiores a 3 kg en su puesto de trabajo', 'SI'],
    ['1.6', 'En general, ¿dispone de espacio suficiente para realizar su trabajo con holgura?', 'NO'],
    ['1.7', 'Al finalizar la jornada laboral, ¿se siente cansado?', 'SI']] },
  { t: '2. Síntomas debidos a la postura', nota: 'Indique en cuál de estos lugares ha sentido dolor y cuándo.', dolor: true, items: [
    ['2.1', 'Nuca', 'SI'], ['2.2', 'Hombro izquierdo', 'SI'], ['2.3', 'Hombro derecho', 'SI'],
    ['2.4', 'Brazo y antebrazo izquierdo', 'SI'], ['2.5', 'Brazo y antebrazo derecho', 'SI'], ['2.6', 'Parte superior de la espalda', 'SI'],
    ['2.7', 'Mano y muñeca izquierda', 'SI'], ['2.8', 'Mano y muñeca derecha', 'SI'], ['2.9', 'Parte baja de la espalda', 'SI'],
    ['2.10', 'Posaderas', 'SI'], ['2.11', 'Muslos', 'SI'], ['2.12', 'Piernas', 'SI'], ['2.13', 'Tobillos', 'SI']] },
  { t: '3. Fatiga física', nota: 'Los esfuerzos realizados en el desarrollo de su trabajo son adecuados…', items: [
    ['3.1', '¿A su capacidad física?', 'NO'], ['3.2', '¿A la temperatura ambiental?', 'NO'], ['3.3', '¿A su edad?', 'NO'],
    ['3.4', '¿A su entrenamiento?', 'NO'], ['3.5', '¿Existen pausas establecidas?', 'NO']] },
  { t: '4. Carga mental', nota: 'Desde el punto de vista de la fatiga nerviosa.', items: [
    ['4.1', '¿Considera que su ritmo habitual de trabajo es adecuado?', 'NO'],
    ['4.2', '¿Cree que la actividad que se le exige es superior a la que puede realizar?', 'SI'],
    ['4.3', '¿La recuperación de la fatiga entre una jornada y la siguiente es suficiente?', 'NO'],
    ['4.4', '¿Su trabajo le permite desviar la atención, por unos instantes, para hacer o pensar otras cosas?', 'NO']] },
  { t: '5. Ritmo', items: [
    ['5.1', '¿Cree que el tiempo asignado a la tarea que realiza es el suficiente?', 'NO'],
    ['5.2', '¿Puede abandonar su trabajo por unos minutos sin necesidad de que le sustituyan?', 'NO'],
    ['5.3', '¿Existen comodines para sustituir cuando no se puede abandonar el puesto?', 'NO'],
    ['5.4', '¿Puede variar el ritmo de trabajo?', 'NO']] },
  { t: '6. Automatización', items: [
    ['6.1', '¿Su trabajo le permite aplicar sus habilidades?', 'NO'],
    ['6.2', '¿Su trabajo le permite aplicar sus conocimientos?', 'NO'],
    ['6.3', '¿Puede organizar el trabajo a su manera (p. ej. modificar el orden de las operaciones)?', 'NO'],
    ['6.4', '¿Puede intervenir en caso de error o incidente, para controlar y corregir su trabajo?', 'NO'],
    ['6.5', '¿Considera que su trabajo es variado?', 'NO'],
    ['6.6', '¿Están agotadas todas las posibilidades de hacer el trabajo más variado y estimulante?', 'SI'],
    ['6.7', '¿Puede rotar con otros puestos de trabajo?', 'NO']] },
  { t: '7. Jornada', items: [
    ['7.1', '¿El número y la duración total de las pausas es suficiente?', 'NO'],
    ['7.2', '¿Puede distribuir usted mismo estas pausas a lo largo de la jornada?', 'NO'],
    ['7.3.1', 'Considera adecuada la distribución del horario de trabajo', 'NO'],
    ['7.3.2', 'Considera adecuada la distribución de las horas de descanso', 'NO'],
    ['7.3.3', 'Considera adecuada la distribución de las horas extra', 'NO'],
    ['7.3.4', 'Considera adecuada la distribución de las pausas', 'NO']] },
  { t: '8. Traumatismos repetidos', items: [
    ['8.1', '¿Durante el día ha tenido sensaciones repetitivas de pesadez, calambres, pinchazos u hormigueo en una o ambas manos?', 'SI'],
    ['8.2', '¿Durante el día ha tenido sensaciones repetidas de hinchazón o molestias en algún antebrazo o codo?', 'SI'],
    ['8.3', '¿Durante el día ha tenido sensaciones repetidas de molestias o quemazón en los hombros?', 'SI'],
    ['8.4', '¿Alguna de estas alteraciones (pesadez, estremecimiento, inflamación o dolor) le ha hecho despertar mientras dormía?', 'SI'],
    ['8.5.1', 'Las molestias aparecen por la mañana', 'SI'],
    ['8.5.2', 'Las molestias aparecen por la tarde', 'SI'],
    ['8.5.3', 'Las molestias aparecen por la tarde - noche', 'SI'],
    ['8.5.4', 'Las molestias aparecen por la noche', 'SI']] }
];
TOP.MOMENTOS = [[1, 'Mañanas'], [2, 'Tardes'], [3, 'Noche'], [4, 'Varía según los días'], [5, 'Constantemente']];
TOP.ergoTotal = function () { return TOP.ERGO.reduce(function (n, s) { return n + s.items.length; }, 0); };

/* ------------------------------------------------ catálogos y datos */
TOP.cargarCatalogos = function () {
  if (TOP._cat) return TOP._cat;
  TOP._cat = Promise.all([
    sb.from('top_actividades').select('*').eq('activo', true).order('orden'),
    sb.from('top_estandar_items').select('*').eq('activo', true).order('presentacion').order('orden'),
    sb.from('listas_maestras').select('tipo,valor').eq('tipo', 'fundo').eq('activo', true).order('orden').order('valor')
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    TOP.actividades = r[0].data;
    TOP.items = r[1].data;
    TOP.listas.fundo = r[2].data.map(function (x) { return x.valor; });
  }).catch(function (e) { TOP._cat = null; throw e; });
  return TOP._cat;
};
TOP.actividad = function (id) { return TOP.actividades.filter(function (a) { return a.id === Number(id); })[0] || { nombre: '—', clase: 'soporte' }; };
TOP.item = function (id) { return TOP.items.filter(function (a) { return a.id === Number(id); })[0]; };
TOP.itemsDe = function (presentacion) { return TOP.items.filter(function (i) { return i.presentacion === presentacion; }); };

/** Fundos que puede usar este usuario (perfiles.fundos; vacío = todos). */
TOP.misFundos = function () {
  var m = AT.esAdmin() || !AT.perfil ? [] : (AT.perfil.fundos || []).filter(Boolean);
  var ops = TOP.listas.fundo.slice();
  return m.length ? ops.filter(function (f) { return m.indexOf(f) > -1; }).concat(m.filter(function (f) { return ops.indexOf(f) < 0; })) : ops;
};
TOP.puedeEditar = function (ev) {
  if (!ev || ev.anulada) return false;
  return AT.esAdmin() || (AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar') && ev.evaluador_id === AT.perfil.id);
};

/** Trae las filas de `tabla` de varias evaluaciones (en tandas para no alargar la URL). */
TOP.porEvaluaciones = function (tabla, ids) {
  if (!ids.length) return Promise.resolve([]);
  var tandas = [];
  for (var i = 0; i < ids.length; i += 120) tandas.push(ids.slice(i, i + 120));
  return Promise.all(tandas.map(function (t) { return sb.from(tabla).select('*').in('evaluacion_id', t); })).then(function (rs) {
    var filas = [];
    rs.forEach(function (r) { if (r.error) throw new Error(r.error.message); filas = filas.concat(r.data); });
    return filas;
  });
};

/** Evaluaciones vigentes de un filtro { desde, hasta, presentacion, fundo } con todo su detalle. */
TOP.cargarDatos = function (f) {
  f = f || {};
  var q = sb.from('top_evaluaciones').select('*').eq('anulada', false).order('fecha', { ascending: false }).limit(1000);
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hasta) q = q.lte('fecha', f.hasta);
  if (f.presentacion) q = q.eq('presentacion', f.presentacion);
  if (f.fundo) q = q.eq('fundo', f.fundo);
  return Promise.all([TOP.cargarCatalogos(), q]).then(function (r) {
    if (r[1].error) throw new Error(r[1].error.message);
    var evals = r[1].data, ids = evals.map(function (e) { return e.id; });
    return Promise.all([TOP.porEvaluaciones('top_tiempos', ids), TOP.porEvaluaciones('top_cumplimiento', ids),
      TOP.porEvaluaciones('top_reba', ids), TOP.porEvaluaciones('top_ergonomia', ids)]).then(function (d) {
      return { evals: evals, tiempos: d[0], cump: d[1], reba: d[2], ergo: d[3], filtro: f };
    });
  });
};

/* ------------------------------------------------ análisis (Resumen, Propuesta y reportes) */
TOP.analizar = function (D, suplemento) {
  var sup = (Number(suplemento) || 0) / 100, A = {};
  var cerrados = D.tiempos.filter(function (t) { return t.duracion_seg !== null && t.duracion_seg >= 0; });

  // Tiempos por actividad: cada toma es una muestra.
  A.actividades = TOP.actividades.map(function (a) {
    var muestras = cerrados.filter(function (t) { return t.actividad_id === a.id; });
    var est = TOP.estadistica(muestras.map(function (t) { return t.duracion_seg; }));
    var evals = {};
    muestras.forEach(function (t) { evals[t.evaluacion_id] = true; });
    est.actividad = a;
    est.nEval = Object.keys(evals).length;
    est.estandar = est.n ? Math.round(est.med * (1 + sup)) : null;
    return est;
  });

  // Jornada por evaluación: total por clase de actividad y su porcentaje.
  A.jornadas = D.evals.map(function (e) {
    var tot = { productiva: 0, soporte: 0, espera: 0, personal: 0 }, total = 0;
    cerrados.filter(function (t) { return t.evaluacion_id === e.id; }).forEach(function (t) {
      var c = TOP.actividad(t.actividad_id).clase;
      tot[c] += t.duracion_seg; total += t.duracion_seg;
    });
    return { ev: e, tot: tot, total: total };
  }).filter(function (j) { return j.total > 0; });
  A.clases = TOP.ORDEN_CLASES.map(function (c) {
    var suma = A.jornadas.reduce(function (s, j) { return s + j.tot[c]; }, 0), total = A.jornadas.reduce(function (s, j) { return s + j.total; }, 0);
    return { clase: c, suma: suma, pct: total ? suma / total * 100 : 0, promJornada: A.jornadas.length ? suma / A.jornadas.length : 0 };
  });

  // Cumplimiento por ítem.
  A.items = TOP.items.map(function (it) {
    var filas = D.cump.filter(function (c) { return c.item_id === it.id && c.resultado; });
    var n = { C: 0, NC: 0, NA: 0 };
    filas.forEach(function (c) { n[c.resultado]++; });
    var aplican = n.C + n.NC;
    var practicas = {};
    D.cump.filter(function (c) { return c.item_id === it.id && c.practica_top; }).forEach(function (c) { practicas[c.practica_top.trim()] = (practicas[c.practica_top.trim()] || 0) + 1; });
    return { item: it, C: n.C, NC: n.NC, NA: n.NA, total: filas.length, pct: aplican ? n.C / aplican * 100 : null,
      practicas: Object.keys(practicas).map(function (p) { return { t: p, n: practicas[p] }; }).sort(function (a, b) { return b.n - a.n; }),
      obs: D.cump.filter(function (c) { return c.item_id === it.id && c.observacion; }).map(function (c) { return c.observacion; }),
      fotos: D.cump.filter(function (c) { return c.item_id === it.id; }).reduce(function (l, c) { return l.concat(c.fotos || []); }, []) };
  }).filter(function (x) { return x.total > 0 || x.practicas.length; });
  var c = 0, nc = 0;
  A.items.forEach(function (x) { c += x.C; nc += x.NC; });
  A.cumplimiento = c + nc ? c / (c + nc) * 100 : null;

  // REBA.
  A.reba = { n: D.reba.length, niveles: [0, 0, 0, 0, 0], prom: TOP.estadistica(D.reba.map(function (r) { return r.puntaje_final; })) };
  D.reba.forEach(function (r) { if (r.nivel !== null) A.reba.niveles[r.nivel]++; });
  A.reba.segmentos = ['cuello', 'tronco', 'piernas', 'brazo', 'antebrazo', 'muneca'].map(function (k) {
    var seg = TOP.REBA_SEG.filter(function (s) { return s.k === k; })[0], max = seg.op[seg.op.length - 1].v;
    var est = TOP.estadistica(D.reba.map(function (r) { return r[k]; }));
    return { k: k, t: seg.t, prom: est.prom, max: max, nMax: D.reba.filter(function (r) { return r[k] === max; }).length };
  });
  A.reba.porActividad = TOP.actividades.map(function (a) {
    var filas = D.reba.filter(function (r) { return r.actividad_id === a.id; });
    return { actividad: a, n: filas.length, est: TOP.estadistica(filas.map(function (r) { return r.puntaje_final; })),
      max: filas.reduce(function (m, r) { return Math.max(m, r.puntaje_final || 0); }, 0) };
  }).filter(function (x) { return x.n; });

  // Ergonomía.
  var nErgo = D.ergo.length;
  A.ergo = { n: nErgo, secciones: TOP.ERGO.map(function (s) {
    var items = s.items.map(function (it) {
      var r = { SI: 0, NO: 0, NS: 0 };
      D.ergo.forEach(function (e) { var v = (e.respuestas || {})[it[0]]; if (r[v] !== undefined) r[v]++; });
      var resp = r.SI + r.NO, momentos = [0, 0, 0, 0, 0];
      if (s.dolor) D.ergo.forEach(function (e) { ((e.dolor || {})[it[0]] || []).forEach(function (m) { if (m >= 1 && m <= 5) momentos[m - 1]++; }); });
      return { c: it[0], t: it[1], malo: it[2], SI: r.SI, NO: r.NO, NS: r.NS, desfav: resp ? r[it[2]] / resp * 100 : null, momentos: momentos };
    });
    var resp = items.reduce(function (s2, i) { return s2 + i.SI + i.NO; }, 0), malos = items.reduce(function (s2, i) { return s2 + i[i.malo]; }, 0);
    return { t: s.t, dolor: !!s.dolor, items: items, desfav: resp ? malos / resp * 100 : null };
  }) };
  return A;
};

/** Sugerencias de actualización del estándar a partir de lo que hacen los TOP. */
TOP.sugerencias = function (A) {
  var s = [];
  A.items.forEach(function (x) {
    if (x.pct === null || (x.C + x.NC) < 1) return;
    var it = x.item, base = (x.C + x.NC) + ' TOP evaluados: ' + x.C + ' cumplen y ' + x.NC + ' no (' + DR.num(x.pct, 0) + '% de cumplimiento).';
    var prac = x.practicas.length ? ' Práctica observada en los TOP: «' + x.practicas[0].t + '»' + (x.practicas[0].n > 1 ? ' (' + x.practicas[0].n + ' casos)' : '') + '.' : '';
    if (x.pct < 50) {
      s.push({ ambito: 'estandar', tipo: x.practicas.length ? 'modificar' : 'eliminar', presentacion: it.presentacion, item_id: it.id,
        texto_actual: it.descripcion, texto_propuesto: x.practicas.length ? x.practicas[0].t : '',
        sustento: 'La mayoría de los TOP no sigue este paso. ' + base + prac, peso: 100 - x.pct });
    } else if (x.pct < 80) {
      s.push({ ambito: 'estandar', tipo: 'modificar', presentacion: it.presentacion, item_id: it.id, texto_actual: it.descripcion,
        texto_propuesto: x.practicas.length ? x.practicas[0].t : '', sustento: 'Cumplimiento parcial entre los TOP. ' + base + prac, peso: 80 - x.pct });
    } else if (x.practicas.length) {
      s.push({ ambito: 'estandar', tipo: 'modificar', presentacion: it.presentacion, item_id: it.id, texto_actual: it.descripcion,
        texto_propuesto: x.practicas[0].t, sustento: 'Los TOP cumplen el paso y además aplican una práctica que podría incorporarse. ' + base + prac, peso: 10 });
    }
  });
  A.actividades.forEach(function (x) {
    if (!x.n) return;
    var a = x.actividad, base = x.n + ' tomas en ' + x.nEval + ' TOP: mediana ' + TOP.seg(x.med) + ', promedio ' + TOP.seg(x.prom) +
      ', rango intercuartil ' + TOP.seg(x.p25) + '–' + TOP.seg(x.p75) + ' (CV ' + DR.num(x.cv, 0) + '%).';
    if (a.clase === 'espera') {
      s.push({ ambito: 'actividad', tipo: 'eliminar', actividad_id: a.id, texto_actual: a.nombre, tiempo_estandar_seg: 0,
        texto_propuesto: 'Eliminar la espera atacando su causa (abastecimiento, recojo o instrucciones a tiempo).',
        sustento: 'Actividad sin valor agregado registrada aun en el personal TOP. ' + base, peso: 50 + x.n });
    } else {
      s.push({ ambito: 'actividad', tipo: a.clase === 'soporte' && x.cv > 40 ? 'reducir' : 'mantener', actividad_id: a.id, texto_actual: a.nombre,
        tiempo_estandar_seg: x.estandar, texto_propuesto: 'Tiempo estándar: ' + TOP.seg(x.estandar) + ' (mediana TOP + suplemento).',
        sustento: (a.clase === 'soporte' && x.cv > 40 ? 'Alta variación entre TOP: estandarizar el método del más rápido. ' : 'Tiempo estándar sustentado en el personal TOP. ') + base, peso: 20 });
    }
  });
  if (A.reba.n) {
    var alto = A.reba.niveles[3] + A.reba.niveles[4];
    var peor = A.reba.segmentos.slice().sort(function (a, b) { return (b.prom || 0) / b.max - (a.prom || 0) / a.max; })[0];
    if (alto || (A.reba.prom.prom || 0) >= 4) {
      s.push({ ambito: 'ergonomia', tipo: 'nuevo', texto_actual: '',
        texto_propuesto: 'Incluir en el estándar la postura correcta de ' + peor.t.toLowerCase() + ' y pausas activas.',
        sustento: A.reba.n + ' evaluaciones REBA: ' + alto + ' en riesgo alto o muy alto; puntaje promedio ' + DR.num(A.reba.prom.prom, 1) +
          '. Segmento más exigido: ' + peor.t + ' (promedio ' + DR.num(peor.prom, 1) + ' de ' + peor.max + ').', peso: 60 + alto });
    }
  }
  return s.sort(function (a, b) { return b.peso - a.peso; });
};
