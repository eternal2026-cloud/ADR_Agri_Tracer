/* ============================================================================
 * resumen.js — DRILL-DOWN DEL TIEMPO DE CICLO
 * Ámbito: todas las semanas, una semana o un día. En cada ámbito:
 *   promedio por fundo (con «Minutos por tramo» arriba) → toca el resumen → por lote
 *   → toca un lote (o un fundo en la tabla) → muestras individuales.
 * ==========================================================================*/
var VISTAS = window.VISTAS || {};

/** nivel: 'general' | 'semana' | 'dia' | 'lotes' | 'muestras'. lote: undefined = todos los lotes del fundo. */
var RES = { nivel: 'general', semana: null, dia: null, fundo: null, lote: undefined, fundoLotes: '', umbral: 480, meta: 120 };

RES.cargarUmbral = function () {
  return sb.from('parametros').select('valor').eq('clave', 'UMBRAL_TIEMPO_CICLO_MIN').single().then(function (r) {
    RES.umbral = r.data ? Number(r.data.valor) : 480;
    return RES.umbral;
  }).catch(function () { return RES.umbral; });
};

/** Meta de tiempo de ciclo: solo se dibuja como referencia en los gráficos, no excluye datos. */
RES.cargarMeta = function () {
  return sb.from('parametros').select('valor').eq('clave', 'META_TIEMPO_CICLO_MIN').maybeSingle().then(function (r) {
    var v = r.data ? Number(r.data.valor) : 0;
    RES.meta = v > 0 ? v : 120;
    return RES.meta;
  }).catch(function () { return RES.meta; });
};

VISTAS.resumen = function (cont) {
  Promise.all([RES.cargarUmbral(), RES.cargarMeta()]).then(function () {
    if (RES.nivel === 'lotes') return RES.renderLotes(cont);
    if (RES.nivel === 'muestras') return RES.renderMuestras(cont);
    return RES.renderPivot(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

RES.ir = function (nivel, cambios) {
  Object.keys(cambios || {}).forEach(function (k) { RES[k] = cambios[k]; });
  RES.nivel = nivel;
  DR.ir('resumen');
};
RES.irGeneral = function () { RES.ir('general', { semana: null, dia: null, fundo: null, lote: undefined }); };
RES.irSemana = function (semana) { RES.ir('semana', { semana: semana, dia: null, fundo: null, lote: undefined }); };
RES.irDia = function (dia) { RES.ir('dia', { dia: dia, semana: null, fundo: null, lote: undefined }); };
RES.irAmbito = function () { if (RES.dia) RES.irDia(RES.dia); else if (RES.semana) RES.irSemana(RES.semana); else RES.irGeneral(); };
RES.irLotes = function () { RES.ir('lotes', { fundo: null, lote: undefined }); };
RES.irMuestras = function (fundo, lote) { RES.ir('muestras', { fundo: fundo, lote: lote }); };

RES.fechaTxt = function (d) { return d ? d.substring(8, 10) + '/' + d.substring(5, 7) + '/' + d.substring(0, 4) : ''; };
RES.ambitoTxt = function () { return RES.dia ? 'Día ' + RES.fechaTxt(RES.dia) : (RES.semana ? 'Semana ' + RES.semana : 'Todas las semanas'); };
RES.nombreLote = function (lote) { return lote ? 'Lote ' + lote : 'Sin lote'; };

/** Migas: [{ texto, fn }] (la última sin fn). */
RES.migas = function (pasos) {
  RES._migas = pasos;
  return UI.migas(pasos.map(function (p) { return { texto: p.texto, accion: !!p.fn }; }));
};
RES.pasosAmbito = function (actual) {
  var p = [{ texto: 'Todas las semanas', fn: RES.irGeneral }];
  if (RES.semana) p.push({ texto: 'Semana ' + RES.semana, fn: RES.irAmbito });
  if (RES.dia) p.push({ texto: 'Día ' + RES.fechaTxt(RES.dia), fn: RES.irAmbito });
  if (actual) p[p.length - 1].fn = null;
  return p;
};
RES.enlazarMigas = function (cont) {
  DR.$$('[data-miga]', cont).forEach(function (b) {
    var p = RES._migas[Number(b.getAttribute('data-miga'))];
    if (p && p.fn) b.onclick = p.fn;
  });
};

/** Selectores de semana y de día del encabezado. */
RES.selectores = function (semanas, dias) {
  return '<div class="res-selectores">' +
    '<select id="selSemana" aria-label="Semana"><option value="">Todas las semanas</option>' + semanas.map(function (s) {
      return '<option value="' + s + '"' + (s === RES.semana ? ' selected' : '') + '>Semana ' + s + '</option>';
    }).join('') + '</select>' +
    '<select id="selDia" aria-label="Día"><option value="">' + (RES.dia ? 'Ver todas las semanas' : 'Ver un día…') + '</option>' + dias.map(function (d) {
      return '<option value="' + d + '"' + (d === RES.dia ? ' selected' : '') + '>' + RES.fechaTxt(d) + '</option>';
    }).join('') + '</select></div>';
};
RES.enlazarSelectores = function () {
  DR.$('#selSemana').onchange = function () { if (this.value) RES.irSemana(Number(this.value)); else RES.irGeneral(); };
  DR.$('#selDia').onchange = function () { if (this.value) RES.irDia(this.value); else RES.irGeneral(); };
};

/** «Minutos por tramo» del ámbito (fila Total general); al tocarlo se abre el resumen por lote. */
RES.tramosHtml = function (total) {
  var tramos = CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, v: total[c.clave] }; })
    .filter(function (x) { return x.v !== null && x.v !== undefined; });
  var meta = RES.meta, t = total.t_ciclo_total;
  return '<section class="panel entra res-tramos clicable" id="resTramos" role="button" tabindex="0">' +
    '<h2>Minutos por tramo · ' + DR.esc(RES.ambitoTxt()) + '</h2>' +
    '<div class="sub">Promedio de cada tramo de los ciclos cerrados (sin los que superan el umbral). Toca para ver el resumen por lote.</div>' +
    '<div class="kpis">' +
      UI.kpi('Tiempo de ciclo', DR.num(t, 0) + '<small>min</small>', DR.num(total.tiempo_horas, 2) + ' horas · meta ' + DR.num(meta, 0) + ' min', t <= meta ? '#76B729' : '#EF7C3B') +
      UI.kpi('Ciclos válidos', DR.num(total.n_muestras), 'Umbral: ' + DR.num(RES.umbral) + ' min', '#0097CE') +
    '</div>' + UI.barrasTramos(tramos) +
    '<div class="res-ver">Ver resumen por lote' + DR.ICONOS.chevron + '</div></section>';
};

/* ============================================================ PROMEDIO POR FUNDO (todas / semana / día) */
RES.renderPivot = function (cont) {
  Promise.all([AT.rpc('fn_semanas_disponibles'), AT.rpc('fn_dias_disponibles').catch(function () { return []; })]).then(function (r) {
    var semanas = r[0] || [], dias = r[1] || [];
    if (RES.nivel === 'semana') {
      if (!semanas.length) { RES.irGeneral(); return; }
      if (semanas.indexOf(RES.semana) < 0) RES.semana = semanas[semanas.length - 1];
    }
    if (RES.nivel === 'dia' && !RES.dia) { RES.irGeneral(); return; }
    if (RES.nivel === 'dia' && dias.indexOf(RES.dia) < 0) dias = [RES.dia].concat(dias);
    var datos = RES.nivel === 'dia' ? AT.rpc('fn_resumen_dia', { p_fecha: RES.dia })
      : RES.nivel === 'semana' ? AT.rpc('fn_resumen_semana', { p_semana: RES.semana }) : AT.rpc('fn_resumen_general');
    return datos.then(function (filas) { RES.pintarPivot(cont, filas || [], semanas, dias); });
  }).catch(function (e) { UI.error(cont, e); });
};

RES.pintarPivot = function (cont, filas, semanas, dias) {
  var general = RES.nivel === 'general';
  if (general && !filas.length) {
    cont.innerHTML = UI.encabezado('Toma de tiempos · Arándano', 'Resumen general', 'Todavía no hay ciclos cerrados registrados.') +
      UI.panel('Sin datos', '', '<div class="aviso">Registra el primer ciclo desde la pestaña <b>Captura</b>, o importa la hoja BD del Excel a la tabla <code>ciclos_cosecha</code>.</div>');
    DR.entrarPaneles('#contenido'); return;
  }
  var total = filas.filter(function (f) { return f.fundo === 'Total general'; })[0] || { fundo: 'Total general', n_muestras: 0, t_ciclo_total: null, tiempo_horas: null };
  var fundos = filas.filter(function (f) { return f.fundo !== 'Total general'; }).sort(function (a, b) { return b.t_ciclo_total - a.t_ciclo_total; });
  var titulo = general ? 'Promedio general' : RES.ambitoTxt();
  var texto = general ? 'Todas las semanas registradas, agrupado por fundo.'
    : 'Promedio de cada tramo agrupado por fundo. Los registros que superan el umbral se excluyen del cálculo.';

  var h = RES.migas(RES.pasosAmbito(true)) + UI.encabezado('Toma de tiempos · Arándano', titulo, texto, RES.selectores(semanas, dias));
  // El tiempo de ciclo y las muestras válidas van en el panel «Minutos por tramo».
  if (general) {
    h += '<div class="kpis">' +
      UI.kpi('Fundos', DR.num(fundos.length), 'Con datos registrados', '#B7A99C') +
      UI.kpi('Semanas', DR.num(semanas.length), semanas.length ? ('De la ' + semanas[0] + ' a la ' + semanas[semanas.length - 1]) : '', '#EF7C3B') +
      '</div>';
  }

  if (!total.n_muestras) {
    h += UI.panel('Sin ciclos cerrados', '', '<div class="vacio">No hay ciclos cerrados bajo el umbral en ' + DR.esc(RES.ambitoTxt().toLowerCase()) + '.</div>');
  } else {
    h += RES.tramosHtml(total);
    fundos.forEach(function (f, i) { f._idx = i; f._clic = true; });
    h += UI.panel(general ? 'Promedio por fundo (todas las semanas)' : 'Promedio por fundo · ' + RES.ambitoTxt(), fundos.length + ' fundo(s) · toca una fila para ver sus muestras',
      UI.tabla(UI.columnasResumen(), fundos.concat([total]), function (f) { return f.fundo === 'Total general' ? 'fila-total' : 'clicable'; }));
    var barras = fundos.map(function (f) { return { etq: f.fundo, valor: f.t_ciclo_total, dec: 1 }; });
    h += UI.panel('Tiempo de ciclo total por fundo', 'La línea punteada marca la meta (' + DR.num(RES.meta) + ' min).', GRAFICO.barrasFundo(barras, RES.meta));
  }
  if (general) h += EVO.panelHtml();

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  GRAFICO.animarBarrasFundo();
  UI.animarBarrasTramos(cont);
  if (general) EVO.montar();

  RES.enlazarSelectores();
  RES.enlazarMigas(cont);
  var res = DR.$('#resTramos');
  if (res) {
    res.onclick = RES.irLotes;
    res.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); RES.irLotes(); } };
  }
  DR.$$('tbody tr.clicable', cont).forEach(function (tr) {
    tr.onclick = function () { RES.irMuestras(fundos[Number(this.getAttribute('data-idx'))].fundo); };
  });
};

/* ============================================================ RESUMEN POR LOTE */
RES.renderLotes = function (cont) {
  AT.rpc('fn_resumen_lotes', { p_semana: RES.semana, p_fecha: RES.dia }).then(function (filas) {
    filas = filas || [];
    var fundos = filas.map(function (f) { return f.fundo; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; }).sort();
    if (RES.fundoLotes && fundos.indexOf(RES.fundoLotes) < 0) RES.fundoLotes = '';
    var lista = filas.filter(function (f) { return !RES.fundoLotes || f.fundo === RES.fundoLotes; });
    var sel = '<select id="selFundoLotes" aria-label="Fundo"><option value="">Todos los fundos</option>' + fundos.map(function (f) {
      return '<option value="' + DR.esc(f) + '"' + (f === RES.fundoLotes ? ' selected' : '') + '>' + DR.esc(f) + '</option>';
    }).join('') + '</select>';

    var h = RES.migas(RES.pasosAmbito(false).concat([{ texto: 'Por lote' }])) +
      UI.encabezado('Toma de tiempos · Arándano', 'Resumen por lote', RES.ambitoTxt() + ' · promedio de los ciclos cerrados (sin los que superan el umbral). Toca un lote para ver sus muestras.', sel);
    lista.forEach(function (f, i) { f._i = i; });
    h += '<div class="conteo">' + lista.length + ' lote(s) · meta ' + DR.num(RES.meta, 0) + ' min</div>' +
      (lista.length ? UI.lotesHtml(lista.map(function (f) {
        return { id: f._i, nombre: RES.nombreLote(f.lote) + (RES.fundoLotes ? '' : ' · ' + f.fundo), total: f.n_muestras ? Number(f.t_ciclo_total) : null,
          pie: f.n_muestras + ' ciclo(s)' + (f.n_excluidos ? ' · ' + f.n_excluidos + ' excluido(s)' : '') };
      }), RES.meta) : '<div class="vacio">No hay ciclos cerrados en ' + DR.esc(RES.ambitoTxt().toLowerCase()) + '.</div>');

    cont.innerHTML = h;
    DR.entrarPaneles('#contenido');
    RES.enlazarMigas(cont);
    DR.$('#selFundoLotes').onchange = function () { RES.fundoLotes = this.value; RES.renderLotes(cont); };
    DR.$$('[data-lote]', cont).forEach(function (b) {
      b.onclick = function () { var f = lista[Number(this.getAttribute('data-lote'))]; RES.irMuestras(f.fundo, f.lote); };
    });
  }).catch(function (e) { UI.error(cont, e); });
};

/* ============================================================ MUESTRAS (detalle) */
/** Comentarios de todas las etapas de un ciclo, en una sola celda. */
RES.OBS = [['obs_cosecha', 'Cosecha'], ['obs_jaba', 'Jabero'], ['obs_moto', 'Moto'], ['obs_traslado_ca', 'Traslado C.A.'],
  ['obs_jabas_2', 'Descarga'], ['obs_camion', 'Camión'], ['obs_cs', 'C. Sombra'], ['obs_ca', 'C. Acopio']];
RES.comentarios = function (f) {
  return RES.OBS.filter(function (o) { return f[o[0]] && String(f[o[0]]).trim(); })
    .map(function (o) { return '<b>' + o[1] + ':</b> ' + DR.esc(f[o[0]]); }).join('<br>');
};

RES.renderMuestras = function (cont) {
  var q = sb.from('ciclos_cosecha').select('*').eq('fundo', RES.fundo).eq('cerrado', true).order('fecha', { ascending: false });
  if (RES.semana) q = q.eq('semana', RES.semana);
  if (RES.dia) q = q.eq('fecha', RES.dia);
  if (RES.lote === null) q = q.or('lote.is.null,lote.eq.');
  else if (RES.lote !== undefined) q = q.eq('lote', RES.lote);

  q.then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var filas = r.data || [];
    var porLote = RES.lote !== undefined;
    var nombre = RES.fundo + (porLote ? ' · ' + RES.nombreLote(RES.lote) : '');
    var pasos = RES.pasosAmbito(false);
    if (porLote) pasos.push({ texto: 'Por lote', fn: RES.irLotes });
    pasos.push({ texto: nombre });

    var validas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total <= RES.umbral; });
    var excluidas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total > RES.umbral; });
    var promedio = validas.length ? validas.reduce(function (s, f) { return s + Number(f.t_ciclo_total); }, 0) / validas.length : 0;

    var h = RES.migas(pasos) + UI.encabezado('Toma de tiempos · Arándano', nombre, RES.ambitoTxt() + ' · ' + filas.length + ' registro(s)');

    h += '<div class="kpis">' +
      UI.kpi('Promedio válido', DR.num(promedio, 1) + ' min', validas.length + ' muestra(s) · meta ' + DR.num(RES.meta) + ' min', '#0097CE') +
      UI.kpi('Excluidas por umbral', DR.num(excluidas.length), 'Umbral: ' + DR.num(RES.umbral) + ' min', excluidas.length ? '#B94A02' : '#76B729') +
      '</div>';

    var cols = [
      { t: 'Fecha', r: function (f) { return DR.fechaHora(f.fecha).split(' ')[0]; } },
      { t: 'Código', k: 'codigo' }, { t: 'Lote', k: 'lote' }, { t: 'Líder', k: 'lider' },
      { t: 'Variedad', k: 'variedad' }, { t: 'Calibre', k: 'calibre' }
    ].concat(CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, num: true, r: function (f) { return DR.num(f[c.clave], 1); } }; }))
      .concat([{ t: 'Total ciclo (min)', num: true, r: function (f) { return '<b>' + DR.num(f.t_ciclo_total, 1) + '</b>'; } },
        { t: 'Comentarios', r: RES.comentarios }]);

    h += UI.panel('Muestras', filas.length + ' registro(s) · las tachadas en rojo se excluyeron del promedio por superar el umbral',
      UI.tabla(cols, filas, function (f) {
        if (f.t_ciclo_total !== null && f.t_ciclo_total > RES.umbral) return 'fila-excluida';
        if (f.t_ciclo_total !== null && f.t_ciclo_total >= RES.umbral * 0.85) return 'fila-cerca';
        return '';
      }));

    cont.innerHTML = h;
    DR.entrarPaneles('#contenido');
    RES.enlazarMigas(cont);
  }).catch(function (e) { UI.error(cont, e); });
};
