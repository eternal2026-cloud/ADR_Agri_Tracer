/* ============================================================================
 * resumen.js — DRILL-DOWN DEL TIEMPO DE CICLO
 * Ámbito: todas las semanas, una semana o un día. En cada ámbito:
 *   promedio por fundo (con «Minutos por tramo» arriba) → toca el resumen → por lote
 *   → toca un lote → muestras individuales.
 *   La tabla «Promedio por fundo» es dinámica (como una TD): fundo › grupo de lote (2 letras,
 *   en mayúsculas: CA, VA…) › lote normalizado; cada nivel con su propio promedio y un botón
 *   para copiarla con formato y pegarla en un correo de Outlook.
 *   El filtro de fundo (RES.fundoPiv) acota «Minutos por tramo», la tabla dinámica y el gráfico;
 *   se conserva al cambiar de semana o de día.
 * ==========================================================================*/
var VISTAS = window.VISTAS || {};

/** nivel: 'general' | 'semana' | 'dia' | 'lotes' | 'muestras'. lote: undefined = todos los lotes del fundo. */
var RES = { nivel: 'general', semana: null, dia: null, fundo: null, lote: undefined, loteNorm: null, fundoLotes: '', fundoPiv: '', umbral: 480, meta: 120, pivAbiertos: {} };

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
  RES.iniciarVivo();
  return Promise.all([RES.cargarUmbral(), RES.cargarMeta()]).then(function () {
    return RES.repintar(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

/* ------------------------------------------------ EN VIVO
 * Los ciclos en curso cuentan junto con los cerrados (sus tramos ya completados). Cada 20 s se
 * revisa si hubo cambios en ciclos_cosecha y, si los hubo, se vuelve a pintar la vista actual
 * sin animaciones y en la misma posición. Google Sheets no cambia: sigue su propia configuración. */
RES.firma = function () {
  return sb.from('ciclos_cosecha').select('actualizado_en', { count: 'exact' }).order('actualizado_en', { ascending: false }).limit(1)
    .then(function (r) { if (r.error) throw new Error(r.error.message); return r.count + '|' + (r.data && r.data[0] ? r.data[0].actualizado_en : ''); });
};
RES.iniciarVivo = function () {
  RES.firma().then(function (f) { RES._firma = f; }).catch(function () { /* sin señal */ });
  if (RES._timer) return;
  var ocupado = false;
  var tic = function () {
    if (ocupado || DR.vista !== 'resumen' || document.visibilityState !== 'visible' || !RES._firma) return;
    ocupado = true;
    RES.firma().then(function (f) {
      if (f === RES._firma || DR.vista !== 'resumen') return;
      RES._firma = f;
      var cont = DR.$('#contenido'), y = cont.scrollTop, anima = DR.anima;
      DR.anima = false;
      return RES.repintar(cont).then(function () { DR.anima = anima; cont.scrollTop = y; }, function () { DR.anima = anima; });
    }).catch(function () { /* sin señal: se reintenta */ }).then(function () { ocupado = false; });
  };
  RES._timer = setInterval(tic, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tic(); });
};
RES.repintar = function (cont) {
  if (RES.nivel === 'lotes') return RES.renderLotes(cont);
  if (RES.nivel === 'muestras') return RES.renderMuestras(cont);
  return RES.renderPivot(cont);
};
RES.vivoTxt = function (n) {
  return '<span class="en-vivo">EN VIVO</span>' + (n ? ' <span class="nota-vivo">incluye ' + n + ' ciclo(s) en curso</span>' : '');
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
RES.irMuestras = function (fundo, lote) { RES.ir('muestras', { fundo: fundo, lote: lote, loteNorm: null }); };
/** Muestras de un lote normalizado de la tabla dinámica («Ca 3», «CA3 » → CA3). */
RES.irMuestrasNorm = function (fundo, loteNorm) { RES.ir('muestras', { fundo: fundo, lote: undefined, loteNorm: loteNorm }); };

RES.fechaTxt = function (d) { return d ? d.substring(8, 10) + '/' + d.substring(5, 7) + '/' + d.substring(0, 4) : ''; };
RES.ambitoTxt = function () { return RES.dia ? 'Día ' + RES.fechaTxt(RES.dia) : (RES.semana ? 'Semana ' + RES.semana : 'Todas las semanas'); };
/** Ámbito más el fundo filtrado, para títulos y la copia a Outlook. */
RES.ambitoFundoTxt = function () { return RES.ambitoTxt() + (RES.fundoPiv ? ' · ' + RES.fundoPiv : ''); };
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

/** Selectores de semana, de día y de fundo del encabezado. */
RES.selectores = function (semanas, dias, fundos) {
  return '<div class="res-selectores">' +
    '<select id="selSemana" aria-label="Semana"><option value="">Todas las semanas</option>' + semanas.map(function (s) {
      return '<option value="' + s + '"' + (s === RES.semana ? ' selected' : '') + '>Semana ' + s + '</option>';
    }).join('') + '</select>' +
    '<select id="selDia" aria-label="Día"><option value="">' + (RES.dia ? 'Ver todas las semanas' : 'Ver un día…') + '</option>' + dias.map(function (d) {
      return '<option value="' + d + '"' + (d === RES.dia ? ' selected' : '') + '>' + RES.fechaTxt(d) + '</option>';
    }).join('') + '</select>' +
    '<select id="selFundoPiv" aria-label="Fundo"><option value="">Todos los fundos</option>' + fundos.map(function (f) {
      return '<option value="' + DR.esc(f) + '"' + (f === RES.fundoPiv ? ' selected' : '') + '>' + DR.esc(f) + '</option>';
    }).join('') + '</select></div>';
};
RES.enlazarSelectores = function () {
  DR.$('#selSemana').onchange = function () { if (this.value) RES.irSemana(Number(this.value)); else RES.irGeneral(); };
  DR.$('#selDia').onchange = function () { if (this.value) RES.irDia(this.value); else RES.irGeneral(); };
  DR.$('#selFundoPiv').onchange = function () { RES.ir(RES.nivel, { fundoPiv: this.value }); };
};

/** «Minutos por tramo» del ámbito (fila Total general); al tocarlo se abre el resumen por lote. */
RES.tramosHtml = function (total) {
  var tramos = CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, v: total[c.clave] }; })
    .filter(function (x) { return x.v !== null && x.v !== undefined; });
  var meta = RES.meta, t = total.t_ciclo_total;
  return '<section class="panel entra res-tramos clicable" id="resTramos" role="button" tabindex="0">' +
    '<h2>Minutos por tramo · ' + DR.esc(RES.ambitoFundoTxt()) + '</h2>' +
    '<div class="sub">' + RES.vivoTxt(total.n_en_curso) + '<br>Promedio de cada tramo de los ciclos cerrados y de los tramos ya completados de los ciclos en curso (sin los que superan el umbral). Toca para ver el resumen por lote.</div>' +
    '<div class="kpis">' +
      UI.kpi('Tiempo de ciclo', t === null ? '—' : DR.num(t, 0) + '<small>min</small>', (t === null ? 'Aún sin ciclos cerrados' : DR.num(total.tiempo_horas, 2) + ' horas') + ' · meta ' + DR.num(meta, 0) + ' min', t !== null && t <= meta ? '#76B729' : '#EF7C3B') +
      UI.kpi('Ciclos válidos', DR.num(total.n_muestras), (total.n_en_curso ? '+ ' + total.n_en_curso + ' en curso · ' : '') + 'Umbral: ' + DR.num(RES.umbral) + ' min', '#0097CE') +
    '</div>' + UI.barrasTramos(tramos) +
    '<div class="res-ver">Ver resumen por lote' + DR.ICONOS.chevron + '</div></section>';
};

/* ============================================================ PROMEDIO POR FUNDO (todas / semana / día) */
RES.renderPivot = function (cont) {
  return Promise.all([AT.rpc('fn_semanas_disponibles'), AT.rpc('fn_dias_disponibles').catch(function () { return []; })]).then(function (r) {
    var semanas = r[0] || [], dias = r[1] || [];
    if (RES.nivel === 'semana') {
      if (!semanas.length) { RES.irGeneral(); return; }
      if (semanas.indexOf(RES.semana) < 0) RES.semana = semanas[semanas.length - 1];
    }
    if (RES.nivel === 'dia' && !RES.dia) { RES.irGeneral(); return; }
    if (RES.nivel === 'dia' && dias.indexOf(RES.dia) < 0) dias = [RES.dia].concat(dias);
    var datos = AT.rpc('fn_resumen_pivot_vivo', { p_semana: RES.nivel === 'semana' ? RES.semana : null, p_fecha: RES.nivel === 'dia' ? RES.dia : null });
    return datos.then(function (filas) { RES.pintarPivot(cont, filas || [], semanas, dias); });
  }).catch(function (e) { UI.error(cont, e); });
};

RES.pintarPivot = function (cont, filas, semanas, dias) {
  var general = RES.nivel === 'general';
  var todos = RES.arbolPivot(filas);
  var nombres = todos.map(function (f) { return f.fundo; }).sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
  if (RES.fundoPiv && nombres.indexOf(RES.fundoPiv) < 0) nombres.push(RES.fundoPiv);
  // Con un fundo elegido, su fila hace de «Total general» (mismas columnas que el nivel 0).
  var fundos = RES.fundoPiv ? todos.filter(function (f) { return f.fundo === RES.fundoPiv; }) : todos;
  var vacio = { n_muestras: 0, n_en_curso: 0, t_ciclo_total: null, tiempo_horas: null };
  var total = Object.assign({}, RES.fundoPiv ? (fundos[0] || vacio) : (filas.filter(function (f) { return f.nivel === 0; })[0] || vacio));
  total.fundo = 'Total general';
  if (general && !todos.length) {
    cont.innerHTML = UI.encabezado('Toma de tiempos · Arándano', 'Resumen general', 'Todavía no hay ciclos cerrados registrados.') +
      UI.panel('Sin datos', '', '<div class="aviso">Registra el primer ciclo desde la pestaña <b>Captura</b>, o importa la hoja BD del Excel a la tabla <code>ciclos_cosecha</code>.</div>');
    DR.entrarPaneles('#contenido'); return;
  }
  var titulo = general ? 'Promedio general' : RES.ambitoTxt();
  var texto = general ? 'Todas las semanas registradas, agrupado por fundo.'
    : 'Promedio de cada tramo agrupado por fundo. Los registros que superan el umbral se excluyen del cálculo.';

  var h = RES.migas(RES.pasosAmbito(true)) + UI.encabezado('Toma de tiempos · Arándano', titulo, texto, RES.selectores(semanas, dias, nombres));
  // El tiempo de ciclo y las muestras válidas van en el panel «Minutos por tramo».
  if (general) {
    h += '<div class="kpis">' +
      UI.kpi('Fundos', DR.num(todos.length), 'Con datos registrados', '#B7A99C') +
      UI.kpi('Semanas', DR.num(semanas.length), semanas.length ? ('De la ' + semanas[0] + ' a la ' + semanas[semanas.length - 1]) : '', '#EF7C3B') +
      '</div>';
  }

  if (!total.n_muestras && !total.n_en_curso) {
    h += UI.panel('Sin ciclos', '', '<div class="vacio">No hay ciclos (cerrados ni en curso) bajo el umbral en ' + DR.esc(RES.ambitoTxt().toLowerCase()) +
      (RES.fundoPiv ? ' para el fundo ' + DR.esc(RES.fundoPiv) : '') + '.</div>');
  } else {
    h += RES.tramosHtml(total);
    h += UI.panel((general ? 'Promedio por fundo (todas las semanas)' : 'Promedio por fundo · ' + RES.ambitoTxt()) + (RES.fundoPiv ? ' · ' + RES.fundoPiv : ''),
      fundos.length + ' fundo(s) · toca un fundo para abrir sus grupos de lote, un grupo para verlo lote a lote y un lote para ver sus muestras',
      '<div class="piv-barra"><button type="button" class="btn sec chico" id="pivAbrir">Expandir todo</button>' +
      '<button type="button" class="btn sec chico" id="pivCerrar">Contraer todo</button>' +
      '<button type="button" class="btn verde chico" id="pivCopiar">' + RES.ICONO_COPIAR + '<span>Copiar tabla</span></button></div>' +
      '<div id="pivTabla"></div>');
    var barras = fundos.filter(function (f) { return f.t_ciclo_total !== null; }).map(function (f) { return { etq: f.fundo, valor: f.t_ciclo_total, dec: 1 }; });
    h += UI.panel('Tiempo de ciclo total por fundo', 'La línea punteada marca la meta (' + DR.num(RES.meta) + ' min).', GRAFICO.barrasFundo(barras, RES.meta));
  }
  if (general) h += EVO.panelHtml();

  cont.innerHTML = h;
  DR.entrarPaneles('#contenido');
  GRAFICO.animarBarrasFundo();
  UI.animarBarrasTramos(cont);
  if (general) EVO.montar();
  if (DR.$('#pivTabla')) RES.montarPivot(fundos, total);

  RES.enlazarSelectores();
  RES.enlazarMigas(cont);
  var res = DR.$('#resTramos');
  if (res) {
    // El resumen por lote abre con el mismo fundo filtrado.
    var abrirLotes = function () { RES.fundoLotes = RES.fundoPiv; RES.irLotes(); };
    res.onclick = abrirLotes;
    res.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirLotes(); } };
  }
};

/* ============================================================ TABLA DINÁMICA (fundo › grupo de lote › lote) */
RES.ICONO_COPIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>';

/** Igual que fn_lote_normalizado (0042): mayúsculas, sin espacios, sin ceros tras las letras. */
RES.normLote = function (lote) {
  var l = String(lote || '').replace(/\s+/g, '').toUpperCase().replace(/^([A-Z]+)0+(\d)/, '$1$2');
  return l || null;
};

/** Filas de fn_resumen_pivot_vivo (nivel 1 fundo, 2 grupo, 3 lote) → fundos con hijos, del más lento al más rápido. */
RES.arbolPivot = function (filas) {
  var natural = function (a, b) {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b, 'es', { numeric: true });
  };
  var fundos = filas.filter(function (f) { return f.nivel === 1; })
    .sort(function (a, b) { return (b.t_ciclo_total || 0) - (a.t_ciclo_total || 0); });
  fundos.forEach(function (f) {
    f.hijos = filas.filter(function (g) { return g.nivel === 2 && g.fundo === f.fundo; }).sort(function (a, b) { return natural(a.grupo, b.grupo); });
    f.hijos.forEach(function (g) {
      g.hijos = g.grupo === null ? [] : filas.filter(function (l) { return l.nivel === 3 && l.fundo === f.fundo && l.grupo === g.grupo; })
        .sort(function (a, b) { return natural(a.lote, b.lote); });
    });
  });
  return fundos;
};

/** Filas visibles según lo abierto (RES.pivAbiertos sobrevive al refresco en vivo). */
RES.pivVisibles = function (fundos, total) {
  var vis = [];
  fundos.forEach(function (f) {
    var kf = 'f|' + f.fundo;
    vis.push({ f: f, nivel: 1, etq: f.fundo, clave: kf, hijos: f.hijos.length, abierto: !!RES.pivAbiertos[kf] });
    if (!RES.pivAbiertos[kf]) return;
    f.hijos.forEach(function (g) {
      var kg = 'g|' + f.fundo + '|' + g.grupo;
      vis.push({ f: g, nivel: 2, etq: g.grupo === null ? 'Sin lote' : 'Lotes ' + g.grupo, nota: g.hijos.length ? g.hijos.length + ' lote(s)' : '',
        clave: kg, hijos: g.hijos.length, abierto: !!RES.pivAbiertos[kg] });
      if (!RES.pivAbiertos[kg]) return;
      g.hijos.forEach(function (l) { vis.push({ f: l, nivel: 3, etq: l.lote }); });
    });
  });
  vis.push({ f: total, nivel: 0, etq: 'Total general' });
  return vis;
};

RES.pivNum = function (v, dec) { return v === null || v === undefined ? '—' : DR.num(v, dec); };
RES.pivColumnas = function () {
  return [{ t: 'N° muestras', r: function (f) { return DR.num(f.n_muestras); }, nota: function (f) { return f.n_en_curso ? '+' + f.n_en_curso + ' en curso' : ''; } }]
    .concat(CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, r: function (f) { return RES.pivNum(f[c.clave], 1); } }; }))
    .concat([{ t: 'Total ciclo (min)', fuerte: true, r: function (f) { return RES.pivNum(f.t_ciclo_total, 1); } },
      { t: 'Horas', r: function (f) { return RES.pivNum(f.tiempo_horas, 2); } }]);
};

RES.montarPivot = function (fundos, total) {
  var caja = DR.$('#pivTabla'), cols = RES.pivColumnas(), vis;
  var pintar = function () {
    var x = caja.firstChild ? caja.firstChild.scrollLeft : 0;
    vis = RES.pivVisibles(fundos, total);
    var h = '<div class="tabla-cont piv"><table><thead><tr><th>Fundo › grupo › lote</th>' +
      cols.map(function (c) { return '<th>' + DR.esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>';
    vis.forEach(function (v, i) {
      var clase = v.nivel === 0 ? 'fila-total' : 'piv-n' + v.nivel + (v.hijos || v.nivel === 3 ? ' clicable' : '');
      var flecha = v.hijos ? '<span class="piv-flecha' + (v.abierto ? ' abierta' : '') + '">' + DR.ICONOS.chevron + '</span>' : '<span class="piv-flecha"></span>';
      h += '<tr class="' + clase + '" data-piv="' + i + '"><td class="piv-etq">' + (v.nivel ? flecha : '') + DR.esc(v.etq) +
        (v.nota ? ' <small>' + DR.esc(v.nota) + '</small>' : '') + '</td>' +
        cols.map(function (c) {
          var n = c.nota ? c.nota(v.f) : '';
          return '<td class="num">' + (c.fuerte ? '<b>' + c.r(v.f) + '</b>' : c.r(v.f)) + (n ? '<small class="piv-vivo">' + n + '</small>' : '') + '</td>';
        }).join('') + '</tr>';
    });
    caja.innerHTML = h + '</tbody></table></div>';
    caja.firstChild.scrollLeft = x;
    DR.$$('tr[data-piv]', caja).forEach(function (tr) {
      tr.onclick = function () {
        var v = vis[Number(this.getAttribute('data-piv'))];
        if (v.nivel === 3) { RES.irMuestrasNorm(v.f.fundo, v.f.lote); return; }
        if (!v.hijos) return;
        RES.pivAbiertos[v.clave] = !RES.pivAbiertos[v.clave];
        pintar();
      };
    });
  };
  pintar();
  DR.$('#pivAbrir').onclick = function () {
    fundos.forEach(function (f) {
      RES.pivAbiertos['f|' + f.fundo] = true;
      f.hijos.forEach(function (g) { if (g.hijos.length) RES.pivAbiertos['g|' + f.fundo + '|' + g.grupo] = true; });
    });
    pintar();
  };
  DR.$('#pivCerrar').onclick = function () { RES.pivAbiertos = {}; pintar(); };
  DR.$('#pivCopiar').onclick = function () {
    var c = RES.copiaPivot(vis, cols);
    UI.copiarHtml(c.html, c.texto).then(function () { DR.toast('Tabla copiada tal como está abierta. Pégala en el correo de Outlook (Ctrl+V).'); })
      .catch(function () { DR.toast('No se pudo copiar la tabla.', 'error'); });
  };
};

/** Tabla con estilos en línea (Outlook ignora las hojas de estilo), con las filas tal como están abiertas. */
RES.copiaPivot = function (vis, cols) {
  var fuente = 'font-family:Calibri,Arial,sans-serif;font-size:10pt;';
  var celda = 'border:1px solid #D9CFC4;padding:4px 8px;white-space:nowrap;' + fuente;
  var fondos = { 0: '#FBEBDD', 1: '#F3EDE6', 2: '#FFFFFF', 3: '#FFFFFF' };
  var sangria = { 0: 8, 1: 8, 2: 22, 3: 38 };
  var encabezados = ['Fundo › grupo › lote'].concat(cols.map(function (c) { return c.t; }));
  var titulo = 'Tiempo de ciclo · ' + RES.ambitoFundoTxt() + ' · promedio en minutos (meta ' + DR.num(RES.meta) + ' min, umbral ' + DR.num(RES.umbral) + ' min)';
  var h = '<p style="' + fuente + 'font-size:11pt;font-weight:bold;color:#3B3129;margin:0 0 6px">' + DR.esc(titulo) + '</p>' +
    '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;' + fuente + '"><tr>' +
    encabezados.map(function (t, i) {
      return '<th style="' + celda + 'background:#3B3129;color:#FFFFFF;font-weight:bold;text-align:' + (i ? 'right' : 'left') + '">' + DR.esc(t) + '</th>';
    }).join('') + '</tr>';
  var texto = titulo + '\n' + encabezados.join('\t') + '\n';
  vis.forEach(function (v) {
    var estilo = celda + (v.nivel <= 1 ? 'font-weight:bold;' : '') + (v.nivel === 0 ? 'border-top:2px solid #EF7C3B;' : '') + 'background:' + fondos[v.nivel] + ';';
    var t = v.f.t_ciclo_total;
    var color = t === null || t === undefined ? '' : (Number(t) <= RES.meta ? 'color:#3F7A12;' : 'color:#B94A02;');
    h += '<tr><td style="' + estilo + 'padding-left:' + sangria[v.nivel] + 'px">' + DR.esc(v.etq) + '</td>' +
      cols.map(function (c) {
        return '<td style="' + estilo + 'text-align:right;' + (c.fuerte ? 'font-weight:bold;' + color : '') + '">' + c.r(v.f) + '</td>';
      }).join('') + '</tr>';
    texto += [new Array(Math.max(v.nivel - 1, 0) + 1).join('  ') + v.etq].concat(cols.map(function (c) { return c.r(v.f); })).join('\t') + '\n';
  });
  return { html: h + '</table>', texto: texto };
};

/* ============================================================ RESUMEN POR LOTE */
RES.renderLotes = function (cont) {
  return AT.rpc('fn_resumen_lotes_vivo', { p_semana: RES.semana, p_fecha: RES.dia }).then(function (filas) {
    filas = filas || [];
    var fundos = filas.map(function (f) { return f.fundo; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; }).sort();
    if (RES.fundoLotes && fundos.indexOf(RES.fundoLotes) < 0) RES.fundoLotes = '';
    var lista = filas.filter(function (f) { return !RES.fundoLotes || f.fundo === RES.fundoLotes; });
    var sel = '<select id="selFundoLotes" aria-label="Fundo"><option value="">Todos los fundos</option>' + fundos.map(function (f) {
      return '<option value="' + DR.esc(f) + '"' + (f === RES.fundoLotes ? ' selected' : '') + '>' + DR.esc(f) + '</option>';
    }).join('') + '</select>';

    var h = RES.migas(RES.pasosAmbito(false).concat([{ texto: 'Por lote' }])) +
      UI.encabezado('Toma de tiempos · Arándano', 'Resumen por lote', RES.ambitoTxt() + ' · promedio de los ciclos cerrados y de los tramos ya completados de los en curso (sin los que superan el umbral). Toca un lote para ver sus muestras.', sel);
    lista.forEach(function (f, i) { f._i = i; });
    var nVivo = lista.reduce(function (a, f) { return a + Number(f.n_en_curso || 0); }, 0);
    h += '<div class="conteo">' + RES.vivoTxt(nVivo) + ' · ' + lista.length + ' lote(s) · meta ' + DR.num(RES.meta, 0) + ' min</div>' +
      (lista.length ? UI.lotesHtml(lista.map(function (f) {
        return { id: f._i, nombre: RES.nombreLote(f.lote) + (RES.fundoLotes ? '' : ' · ' + f.fundo), total: f.n_muestras ? Number(f.t_ciclo_total) : null,
          pie: f.n_muestras + ' ciclo(s)' + (f.n_en_curso ? ' · ' + f.n_en_curso + ' en curso' : '') + (f.n_excluidos ? ' · ' + f.n_excluidos + ' excluido(s)' : '') };
      }), RES.meta) : '<div class="vacio">No hay ciclos en ' + DR.esc(RES.ambitoTxt().toLowerCase()) + '.</div>');

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
  ['obs_jabas_2', 'Descarga'], ['obs_camion', 'Camión'], ['obs_traslado_planta', 'Traslado planta'], ['obs_cs', 'C. Sombra'], ['obs_ca', 'C. Acopio']];
RES.comentarios = function (f) {
  return RES.OBS.filter(function (o) { return f[o[0]] && String(f[o[0]]).trim(); })
    .map(function (o) { return '<b>' + o[1] + ':</b> ' + DR.esc(f[o[0]]); }).join('<br>');
};

RES.renderMuestras = function (cont) {
  var q = sb.from('ciclos_cosecha').select('*').eq('fundo', RES.fundo).or('cerrado.eq.true,origen.eq.app')
    .order('cerrado', { ascending: true }).order('fecha', { ascending: false });
  if (RES.semana) q = q.eq('semana', RES.semana);
  if (RES.dia) q = q.eq('fecha', RES.dia);
  if (RES.lote === null) q = q.or('lote.is.null,lote.eq.');
  else if (RES.lote !== undefined) q = q.eq('lote', RES.lote);

  return q.then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var filas = r.data || [], nVivo = filas.filter(function (f) { return !f.cerrado; }).length;
    if (RES.loteNorm) {
      filas = filas.filter(function (f) { return RES.normLote(f.lote) === RES.loteNorm; });
      nVivo = filas.filter(function (f) { return !f.cerrado; }).length;
    }
    var porLote = RES.lote !== undefined;
    var nombre = RES.fundo + (porLote ? ' · ' + RES.nombreLote(RES.lote) : (RES.loteNorm ? ' · ' + RES.nombreLote(RES.loteNorm) : ''));
    var pasos = RES.pasosAmbito(false);
    if (porLote) pasos.push({ texto: 'Por lote', fn: RES.irLotes });
    pasos.push({ texto: nombre });

    var validas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total <= RES.umbral; });
    var excluidas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total > RES.umbral; });
    var promedio = validas.length ? validas.reduce(function (s, f) { return s + Number(f.t_ciclo_total); }, 0) / validas.length : 0;

    var h = RES.migas(pasos) + UI.encabezado('Toma de tiempos · Arándano', nombre, RES.ambitoTxt() + ' · ' + filas.length + ' registro(s)') +
      '<div class="conteo">' + RES.vivoTxt(nVivo) + '</div>';

    h += '<div class="kpis">' +
      UI.kpi('Promedio válido', DR.num(promedio, 1) + ' min', validas.length + ' muestra(s) · meta ' + DR.num(RES.meta) + ' min', '#0097CE') +
      UI.kpi('Excluidas por umbral', DR.num(excluidas.length), 'Umbral: ' + DR.num(RES.umbral) + ' min', excluidas.length ? '#B94A02' : '#76B729') +
      '</div>';

    var cols = [
      { t: 'Fecha', r: function (f) { return DR.fechaHora(f.fecha).split(' ')[0]; } },
      { t: 'Código', r: function (f) { return DR.esc(f.codigo) + (f.cerrado ? '' : ' <span class="pill verde">en curso</span>'); } },
      { t: 'Placa', k: 'placa' }, { t: 'Lote', k: 'lote' }, { t: 'Líder', k: 'lider' },
      { t: 'Variedad', k: 'variedad' }, { t: 'Calibre', k: 'calibre' }
    ].concat(CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, num: true, r: function (f) { return DR.num(f[c.clave], 1); } }; }))
      .concat([{ t: 'Total ciclo (min)', num: true, r: function (f) { return f.cerrado ? '<b>' + DR.num(f.t_ciclo_total, 1) + '</b>' : 'en curso'; } },
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
