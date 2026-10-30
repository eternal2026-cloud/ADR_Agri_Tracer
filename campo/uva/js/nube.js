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
  't_espera_recepcion,t_espera_descarga,t_descarga,t_espera_abastecimiento,t_en_planta,t_ciclo_completo,actualizado_en,eliminado,fusionado_en';

/** Trae los ciclos de la base (máx. una vez cada 15 s salvo forzar). Nunca falla: sin señal queda la copia. */
NUBE.cargar = function (forzar) {
  if (NUBE.cargando) return NUBE.cargando;
  if (!forzar && NUBE._t && Date.now() - NUBE._t < 15000) return Promise.resolve(NUBE.filas);
  if (!SHEETS.configurado() || !SHEETS.hayRed()) return Promise.resolve(NUBE.filas);
  // También los que Integra unió a otro por N° de pallet (eliminado + fusionado_en): este equipo adopta el ID vigente.
  var q = sb.from('uva_ciclos').select(NUBE.COLS);
  q = NUBE._viejo ? q.eq('eliminado', false) : q.or('eliminado.eq.false,fusionado_en.not.is.null');
  NUBE.cargando = q
    .order('fecha', { ascending: false }).limit(3000).then(function (r) {
      NUBE.cargando = null;
      if (r.error && /fusionado_en/.test(r.error.message)) { NUBE.COLS = NUBE.COLS.replace(',eliminado,fusionado_en', ''); NUBE._viejo = true; return NUBE.cargar(true); }
      if (r.error) { NUBE.error = r.error.message; return NUBE.filas; }
      NUBE.error = ''; NUBE._t = Date.now();
      var datos = r.data || [];
      datos.filter(function (f) { return f.fusionado_en && TC.obtener(f.id); }).forEach(function (f) { TC.renombrar(f.id, f.fusionado_en); });
      NUBE.filas = datos.filter(function (f) { return !f.eliminado; }).map(NUBE.aRegistro);
      NUBE.adoptar(NUBE.filas);
      NUBE.hora = new Date().toISOString();
      DR.guardar('tcu.nube', NUBE.filas); DR.guardar('tcu.nubeHora', NUBE.hora);
      return NUBE.filas;
    }, function (e) { NUBE.cargando = null; NUBE.error = String(e && e.message || e); return NUBE.filas; });
  return NUBE.cargando;
};

/**
 * Lo que otra persona llenó en un ciclo que también está en este equipo (ej. el auxiliar de carga
 * subió las etapas 7 y 8) se junta aquí dato por dato, por hora de toma. No cambia «por subir».
 */
NUBE.adoptar = function (filas) {
  var porId = {};
  filas.forEach(function (n) { porId[n.id] = n; });
  TC.registros().forEach(function (l) {
    var n = porId[l.id];
    if (n && n.origen === 'integra' && TC.fusionar(l, n)) TC.guardarRegistro(l, true);
  });
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
    cargaTot: txt(g.cargaTot), cargaCarg: txt(g.cargaCarg), t: g.marcas && typeof g.marcas === 'object' ? g.marcas : {}, union: g.union === true || undefined,
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
    (NUBE.puedeContinuar(r) ? '<button class="btn verde bloque" id="hSeguir" type="button" style="margin-bottom:8px">' + (r.estado === 'cerrado' ? 'Corregir este pallet en este equipo' : 'Continuar este pallet en este equipo') + '</button>' +
      '<p class="ayuda-campo" style="margin:-2px 0 10px">Los dos equipos pueden seguirlo a la vez (ej. el auxiliar desde la carga), aunque estén sin señal: Integra junta lo de ambos y, si los dos cambian la misma hora, vale la que se tomó después.</p>' : '') +
    '<button class="btn bloque" id="hCerrar" type="button">Cerrar</button>', function () {
      DR.$('#hCerrar').onclick = DR.cerrarHoja;
      if (DR.$('#hSeguir')) DR.$('#hSeguir').onclick = function () { DR.cerrarHoja(); NUBE.continuar(r); };
    });
};

/** Pallets de Integra (la APK escribe en su propia hoja) de cualquier persona: si se ven aquí, el usuario
 *  tiene asignado su fundo (la base filtra igual al leer y al guardar). Los cerrados, para corregirlos. */
NUBE.puedeContinuar = function (r) {
  return !TC.obtener(r.id) && r.origen === 'integra' && !!AT.perfil && (!PERM.soloPropios() || PERM.esMio(r));
};
/** Copia el pallet de Integra a este equipo (ya «subido»: no se reenvía hasta que se marque algo) y lo abre. */
NUBE.continuar = function (r) {
  var ahora = new Date().toISOString(), base = TC.nuevo(), local = {};
  Object.keys(base).forEach(function (k) { local[k] = r[k] !== undefined ? r[k] : base[k]; });
  local.etapas = JSON.parse(JSON.stringify(r.etapas));
  local.t = JSON.parse(JSON.stringify(r.t || {}));
  if (r.union) local.union = true;
  local.estado = r.estado === 'cerrado' ? 'cerrado' : 'borrador';
  local.creado = r.creado || ahora;
  local.actualizado = ahora; local.subidoMod = ahora; local.subido = ahora; local.error = '';
  TC.guardarRegistro(local, true);
  DR.toast('Pallet ' + TC.titulo(local) + ' traído a este equipo' + (local.estado === 'cerrado' ? ': toca «Corregir una etapa».' : ': sigue con la siguiente etapa.'), 'ok');
  REG.abrir(local.id);
};

/** Abre el pallet: si está en este equipo se edita; si no, se ve (solo lectura). */
NUBE.abrir = function (id) {
  if (TC.obtener(id)) { REG.abrir(id); return; }
  var r = NUBE.todos().filter(function (x) { return x.id === id; })[0];
  if (r) NUBE.verDetalle(r);
};
