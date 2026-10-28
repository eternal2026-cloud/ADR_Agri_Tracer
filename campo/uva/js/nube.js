/* ============================================================================
 * nube.js — LOS REGISTROS DE INTEGRA (uva_ciclos), NO SOLO LOS DEL EQUIPO
 * Registros y Resumen leían solo lo guardado en cada celular: con el mismo usuario en
 * tres equipos se veían tres listas distintas. Aquí se trae uva_ciclos (APK UV-EQ-,
 * Integra UV-IN- y Planta UV-PL-), filtrado en la base por rol, fundos asignados y
 * «solo sus ciclos» (Config › Usuarios, igual que Arándano), y se une con lo del equipo
 * que aún no se subió. Sin señal se usa la última copia guardada en el equipo.
 * Cada fila de la base se convierte al mismo formato del registro local (TC.nuevo),
 * así TC.calcular sirve para los dos; la parte de planta va en r.pl.
 * ==========================================================================*/

var NUBE = { filas: DR.leer('tcu.nube', []), hora: DR.leer('tcu.nubeHora', ''), cargando: null, error: '' };

NUBE.COLS = 'id,origen,ambito,registrador,dispositivo,usuario_id,registro,etapas,fecha,campana,zona,fundo,lote,variedad,grupo,pallet,placa,' +
  'planta,planta_destino,linea,estado,vinculado,hora_llegada,hora_recepcion,ini_descarga,fin_descarga,ini_abastecimiento,planta_usuario,' +
  't_espera_recepcion,t_espera_descarga,t_descarga,t_espera_abastecimiento,t_en_planta,t_ciclo_completo,actualizado_en';

/** Trae los ciclos de la base (máx. una vez cada 15 s salvo forzar). Nunca falla: sin señal queda la copia. */
NUBE.cargar = function (forzar) {
  if (NUBE.cargando) return NUBE.cargando;
  if (!forzar && NUBE._t && Date.now() - NUBE._t < 15000) return Promise.resolve(NUBE.filas);
  if (!SHEETS.configurado() || !SHEETS.hayRed()) return Promise.resolve(NUBE.filas);
  NUBE.cargando = sb.from('uva_ciclos').select(NUBE.COLS).eq('eliminado', false)
    .order('fecha', { ascending: false }).limit(3000).then(function (r) {
      NUBE.cargando = null;
      if (r.error) { NUBE.error = r.error.message; return NUBE.filas; }
      NUBE.error = ''; NUBE._t = Date.now();
      NUBE.filas = (r.data || []).map(NUBE.aRegistro);
      NUBE.hora = new Date().toISOString();
      DR.guardar('tcu.nube', NUBE.filas); DR.guardar('tcu.nubeHora', NUBE.hora);
      return NUBE.filas;
    }, function (e) { NUBE.cargando = null; NUBE.error = String(e && e.message || e); return NUBE.filas; });
  return NUBE.cargando;
};

/** Fila de uva_ciclos → registro con la forma de TC.nuevo (+ origen, ámbito y la parte de planta). */
NUBE.aRegistro = function (f) {
  var g = f.registro || {}, etapas = {};
  TC.ETAPAS.forEach(function (e) { etapas[e.id] = { ini: '', fin: '', com: '', causa: '', editado: false }; });
  (Array.isArray(f.etapas) ? f.etapas : []).forEach(function (x) {
    var e = TC.E[x.id] || TC.ETAPAS[Number(x.n) - 1];
    if (!e) return;
    etapas[e.id] = { ini: x.inicio || '', fin: x.fin || '', com: x.comentario || '', causa: x.causa || '', editado: x.editado === 'Sí' };
  });
  var txt = function (v) { return v === null || v === undefined ? '' : String(v); };
  return {
    id: f.id, origen: f.origen, ambito: f.ambito || 'Campo', nube: true,
    campana: f.campana || g.campana || '', fecha: f.fecha || '', zona: CAT.limpiar(f.zona || g.zona), fundo: CAT.limpiar(f.fundo || g.fundo),
    lote: CAT.limpiar(f.lote || g.lote), sublote: txt(g.sublote) || '-', pasada: txt(g.pasada), color: txt(g.color),
    variedad: CAT.normVariedad(f.variedad || g.variedad), grupo: CAT.limpiar(f.grupo || g.grupo), pallet: txt(f.pallet || g.pallet),
    jabas: txt(g.jabas), zunchos: txt(g.zunchos), placa: txt(f.placa || g.placa), palletsTot: txt(g.palletsTot), palletsCarg: txt(g.palletsCarg),
    planta: CAT.limpiar(f.planta_destino || f.planta || g.planta), observacion: txt(g.observacion),
    // «Cerrado» en campo, o en planta cuando el camión ya abasteció.
    estado: /cerrad/i.test(f.estado || g.estado || '') ? 'cerrado' : 'borrador',
    registrador: f.registrador || f.planta_usuario || '', dispositivo: f.dispositivo || '', usuario_id: f.usuario_id,
    creado: g.creado || '', actualizado: f.actualizado_en || '', etapas: etapas,
    pl: {
      vinculado: !!f.vinculado, linea: f.linea || '', usuario: f.planta_usuario || '',
      llegada: f.hora_llegada, recepcion: f.hora_recepcion, iniDescarga: f.ini_descarga, finDescarga: f.fin_descarga, iniAbast: f.ini_abastecimiento,
      espRecepcion: NUBE.n(f.t_espera_recepcion), espDescarga: NUBE.n(f.t_espera_descarga), descarga: NUBE.n(f.t_descarga),
      espAbast: NUBE.n(f.t_espera_abastecimiento), enPlanta: NUBE.n(f.t_en_planta), cicloCompleto: NUBE.n(f.t_ciclo_completo)
    }
  };
};
NUBE.n = function (v) { return v === null || v === undefined || v === '' ? null : Number(v); };

/**
 * Lista unida: todo lo de la base + lo del equipo que aún no está allá o tiene cambios sin subir
 * (en ese caso manda lo del equipo, con la parte de planta que ya tenga la base).
 */
NUBE.todos = function () {
  var porId = {}, lista = [];
  NUBE.filas.forEach(function (r) { porId[r.id] = r; lista.push(r); });
  TC.registros().forEach(function (l) {
    var n = porId[l.id];
    if (n && !TC.pendiente(l)) { n.local = true; return; }
    var copia = Object.assign({}, l, { origen: 'integra', ambito: n ? n.ambito : 'Campo', local: true, sinSubir: TC.pendiente(l), pl: n ? n.pl : null });
    if (n) lista[lista.indexOf(n)] = copia; else lista.push(copia);
  });
  return lista.sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || '') || String(b.creado || b.actualizado).localeCompare(String(a.creado || a.actualizado)); });
};

NUBE.ORIGEN = { apk: 'APK', integra: 'Integra', planta: 'Planta' };
/** [texto, clase] del estado para la lista unida. */
NUBE.etiqueta = function (r) {
  if (r.local && (r.sinSubir || !r.nube)) return TC.etiquetaEstado(r);
  var o = NUBE.ORIGEN[r.origen] || r.origen;
  if (r.estado === 'cerrado') return [o + ' · ' + (r.ambito === 'Campo' ? 'cerrado' : r.ambito), 'subido'];
  return [o + ' · en proceso', ''];
};

/** Hoja de solo lectura para un pallet que no está en este equipo (otro celular, la APK o Planta). */
NUBE.verDetalle = function (r) {
  var c = TC.calcular(r), p = r.pl || {};
  var fila = function (t, a, b, min, espera) {
    return '<tr' + (espera ? ' class="fila-espera"' : '') + '><td>' + t + '</td><td class="n">' + (a ? DR.hhmm(a) : '') + (b ? '–' + DR.hhmm(b) : '') + '</td><td class="n">' + RSU.mmss(min) + '</td></tr>';
  };
  var filas = TC.ETAPAS.map(function (e) {
    var x = r.etapas[e.id], k = c.etapas[e.id];
    return (k.espera !== null ? fila('Espera antes de ' + e.nombre.toLowerCase(), '', '', k.espera, true) : '') +
      fila('<i style="background:' + e.color + '"></i>' + e.n + '. ' + DR.esc(e.nombre), x.ini, x.fin, k.min);
  }).join('');
  if (p.llegada || p.recepcion || p.iniDescarga) {
    filas += '<tr><td colspan="3" style="padding-top:12px;font-weight:600">Planta' + (p.linea ? ' · línea ' + DR.esc(p.linea) : '') + '</td></tr>' +
      fila('Espera de recepción', p.llegada, p.recepcion, p.espRecepcion, true) + fila('Espera de descarga', p.recepcion, p.iniDescarga, p.espDescarga, true) +
      fila('Descarga', p.iniDescarga, p.finDescarga, p.descarga) + fila('Espera de abastecimiento', p.finDescarga, p.iniAbast, p.espAbast, true);
  }
  DR.hoja('<h3>' + DR.esc(TC.titulo(r)) + '</h3>' +
    '<p style="color:var(--texto-2);font-size:13.5px">' + DR.fechaCorta(r.fecha) + ' · ' + DR.esc([r.zona, r.fundo, r.variedad, r.grupo].filter(Boolean).join(' · ')) +
      (r.placa ? ' · Placa ' + DR.esc(r.placa) : '') + (r.planta ? ' → ' + DR.esc(r.planta) : '') + '</p>' +
    '<p class="ayuda-campo">' + DR.esc(NUBE.etiqueta(r)[0]) + ' · registró ' + DR.esc(r.registrador || '—') + (r.dispositivo ? ' (' + DR.esc(r.dispositivo) + ')' : '') + ' · ' + DR.esc(r.id) + '</p>' +
    '<div style="max-height:52vh;overflow:auto"><table class="tabla"><tr><th>Tramo</th><th class="n">Hora</th><th class="n">min:seg</th></tr>' + filas + '</table></div>' +
    '<p style="margin:10px 0 14px"><b>Ciclo de campo: ' + RSU.mmss(c.total) + '</b>' + (p.cicloCompleto !== null && p.cicloCompleto !== undefined ? ' · Ciclo completo (hasta abastecimiento): <b>' + RSU.mmss(p.cicloCompleto) + '</b>' : '') + '</p>' +
    (NUBE.puedeContinuar(r) ? '<button class="btn verde bloque" id="hSeguir" type="button" style="margin-bottom:8px">Continuar este pallet en este equipo</button>' +
      '<p class="ayuda-campo" style="margin:-2px 0 10px">Úsalo si el otro celular ya no lo va a seguir (sin batería, cambio de turno). Si los dos lo siguen, vale el último cambio que llegue a Integra.</p>' : '') +
    '<button class="btn bloque" id="hCerrar" type="button">Cerrar</button>', function () {
      DR.$('#hCerrar').onclick = DR.cerrarHoja;
      if (DR.$('#hSeguir')) DR.$('#hSeguir').onclick = function () { DR.cerrarHoja(); NUBE.continuar(r); };
    });
};

/** Solo pallets de Integra (la APK escribe en su propia hoja) en curso, del mismo usuario o con rol admin (igual que la base). */
NUBE.puedeContinuar = function (r) {
  return !TC.obtener(r.id) && r.origen === 'integra' && r.estado !== 'cerrado' && !!AT.perfil &&
    (r.usuario_id === AT.perfil.id || AT.esAdmin());
};
/** Copia el pallet de Integra a este equipo (ya «subido»: no se reenvía hasta que se marque algo) y lo abre. */
NUBE.continuar = function (r) {
  var ahora = new Date().toISOString(), base = TC.nuevo(), local = {};
  Object.keys(base).forEach(function (k) { local[k] = r[k] !== undefined ? r[k] : base[k]; });
  local.etapas = JSON.parse(JSON.stringify(r.etapas));
  local.estado = 'borrador';
  local.creado = r.creado || ahora;
  local.actualizado = ahora; local.subidoMod = ahora; local.subido = ahora; local.error = '';
  TC.guardarRegistro(local, true);
  DR.toast('Pallet ' + TC.titulo(local) + ' traído a este equipo: sigue con la siguiente etapa.', 'ok');
  REG.abrir(local.id);
};

/** Abre el pallet: si está en este equipo se edita; si no, se ve (solo lectura). */
NUBE.abrir = function (id) {
  if (TC.obtener(id)) { REG.abrir(id); return; }
  var r = NUBE.todos().filter(function (x) { return x.id === id; })[0];
  if (r) NUBE.verDetalle(r);
};
