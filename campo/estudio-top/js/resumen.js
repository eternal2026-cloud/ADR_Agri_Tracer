/* ============================================================================
 * resumen.js — RESUMEN DEL ESTUDIO TOP
 * Tiempo estándar por actividad (mediana TOP + suplemento), distribución de la
 * jornada (productivo / soporte / espera / personal), cumplimiento por ítem con
 * las prácticas TOP, REBA y checklist ergonómico. Desde aquí se exporta el
 * Excel y el informe técnico en PDF.
 * ==========================================================================*/
var RES = { D: null, A: null };

RES.filtro = function () {
  var f = TOP.leer('filtro', null);
  if (!f) f = { desde: TOP.localDe(new Date(Date.now() - 90 * 86400000)).substring(0, 10), hasta: '', presentacion: '', fundo: '', suplemento: 10 };
  return f;
};

RES.pintar = function (cont) {
  var f = RES.filtro();
  TOP.cargarCatalogos().then(function () {
    cont.innerHTML = '<div class="vista">' + UI.encabezado('Ingeniería · Campo › Estudio TOP', 'Resumen del estudio',
      'Sustento técnico para actualizar el estándar de cosecha a partir del personal TOP.',
      '<div class="acciones" style="margin-top:0"><button type="button" class="btn sec chico" id="btnExcel">Excel</button>' +
      '<button type="button" class="btn azul chico" id="btnPdf">Informe PDF</button></div>') +
      '<section class="panel entra"><div class="form" id="frmFiltro">' +
      '<div class="campo"><label>Desde</label><input type="date" data-campo="desde" value="' + DR.esc(f.desde) + '"></div>' +
      '<div class="campo"><label>Hasta</label><input type="date" data-campo="hasta" value="' + DR.esc(f.hasta) + '"></div>' +
      '<div class="campo"><label>Estándar</label><select data-campo="presentacion"><option value="">Jarra y granel</option>' + ['JARRA', 'BANDEJA'].map(function (p) {
        return '<option value="' + p + '"' + (f.presentacion === p ? ' selected' : '') + '>' + (p === 'JARRA' ? 'Jarra cosechera' : 'Granel (bandeja y bulk)') + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label>Material</label><select data-campo="material"><option value="">Todos</option>' + TOP.listas.material.map(function (m) {
        return '<option value="' + DR.esc(m) + '"' + (f.material === m ? ' selected' : '') + '>' + DR.esc(TOP.materialTxt(m)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label>Fundo</label><select data-campo="fundo"><option value="">Todos</option>' + TOP.misFundos().map(function (x) {
        return '<option' + (f.fundo === x ? ' selected' : '') + '>' + DR.esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label>Suplemento % <em>fatiga y necesidades</em></label><input type="number" min="0" max="50" step="1" data-campo="suplemento" value="' + DR.esc(f.suplemento) + '"></div>' +
      '</div></section><div id="resCuerpo"><div class="vacio">Cargando información…</div></div></div>';
    DR.entrarPaneles('#contenido');
    DR.$$('#frmFiltro [data-campo]').forEach(function (el) {
      el.onchange = function () { var nf = UI.leerForm('frmFiltro'); TOP.escribir('filtro', nf); RES.cargar(nf); };
    });
    DR.$('#btnExcel').onclick = function () { RES.exportar('excel', this); };
    DR.$('#btnPdf').onclick = function () { RES.exportar('pdf', this); };
    RES.cargar(f);
  }).catch(function (e) { UI.error(cont, e); });
};

RES.exportar = function (tipo, btn) {
  if (!RES.D) return;
  btn.classList.add('cargando');
  (tipo === 'excel' ? REPORTE.excel(RES.D, RES.A) : REPORTE.pdf(RES.D, RES.A))
    .catch(function (e) { DR.toast(e.message, 'error'); })
    .then(function () { btn.classList.remove('cargando'); });
};

RES.cargar = function (f) {
  var c = DR.$('#resCuerpo');
  c.innerHTML = '<div class="vacio">Cargando información…</div>';
  TOP.cargarDatos(f).then(function (D) {
    RES.D = D;
    RES.A = TOP.analizar(D, f.suplemento);
    RES.dibujar(c, D, RES.A, f);
  }).catch(function (e) { UI.error(c, e); });
};

/** Barras horizontales de duración (segundos) con el estilo de ciclos/js/grafico.js. */
RES.barras = function (items) {
  var max = items.reduce(function (m, i) { return Math.max(m, i.valor || 0, i.marca || 0); }, 0) * 1.05 || 1;
  return '<div class="gf-barras">' + items.map(function (it) {
    return '<div class="gf-fila"><div class="gf-nombre">' + DR.esc(it.etq) + (it.sub ? '<small>' + DR.esc(it.sub) + '</small>' : '') + '</div>' +
      '<div class="gf-pista">' + (it.marca ? '<span class="gf-meta" style="left:' + (it.marca / max * 100).toFixed(1) + '%"></span>' : '') +
      '<span class="gf-barra" style="width:' + ((it.valor || 0) / max * 100).toFixed(1) + '%;background:' + (it.color || 'linear-gradient(90deg,#0097CE,#76B729)') + '"></span></div>' +
      '<div class="gf-cifra">' + (it.texto || TOP.seg(it.valor)) + '</div></div>';
  }).join('') + '</div>';
};

RES.dibujar = function (c, D, A, f) {
  if (!D.evals.length) { c.innerHTML = '<div class="panel entra"><div class="vacio">No hay evaluaciones TOP para este filtro.</div></div>'; DR.entrarPaneles('#resCuerpo'); return; }
  var cosechadores = {};
  D.evals.forEach(function (e) { cosechadores[e.cosechador] = true; });
  var esp = A.clases.filter(function (x) { return x.clase === 'espera'; })[0], prod = A.clases.filter(function (x) { return x.clase === 'productiva'; })[0];
  var h = '<div class="kpis entra">' +
    UI.kpi('Cosechadores TOP', DR.num(Object.keys(cosechadores).length), D.evals.length + ' evaluaciones', '#0097CE') +
    UI.kpi('Tomas de tiempo', DR.num(D.tiempos.length), A.jornadas.length + ' jornadas medidas', '#76B729') +
    UI.kpi('Tiempo productivo', prod.pct ? DR.num(prod.pct, 0) + '<small>%</small>' : '—', esp.pct ? DR.num(esp.pct, 0) + '% en esperas eliminables' : 'del tiempo medido', '#76B729') +
    UI.kpi('Cumplimiento', A.cumplimiento === null ? '—' : DR.num(A.cumplimiento, 0) + '<small>%</small>', 'de los estándares actuales', '#EF7C3B') +
    UI.kpi('REBA promedio', A.reba.n ? DR.num(A.reba.prom.prom, 1) : '—', A.reba.n ? A.reba.n + ' posturas · máx. ' + A.reba.prom.max : 'sin evaluaciones', '#E5484D') +
    '</div>';

  // 1. Tiempo estándar por actividad.
  var acts = A.actividades.filter(function (x) { return x.n; });
  h += UI.panel('Tiempo estándar por actividad', 'Mediana de las tomas TOP × (1 + ' + (Number(f.suplemento) || 0) + '% de suplemento). La línea es el estándar propuesto.',
    acts.length ? RES.barras(acts.map(function (x) {
      return { etq: x.actividad.nombre, sub: x.n + ' tomas · ' + TOP.CLASES[x.actividad.clase].t, valor: x.prom, marca: x.estandar, color: TOP.CLASES[x.actividad.clase].c,
        texto: TOP.seg(x.prom) + ' <small>prom.</small>' };
    })) + UI.tabla([
      { t: 'Actividad', r: function (x) {
        return '<span class="top-punto" style="background:' + TOP.CLASES[x.actividad.clase].c + '"></span>' + DR.esc(x.actividad.nombre) +
          (x.actividad.sustento ? '<br><small class="ayuda-campo">Etapa nueva: ' + DR.esc(x.actividad.sustento) + '</small>' : '');
      } },
      { t: 'Tomas', k: 'n', num: true }, { t: 'TOP', k: 'nEval', num: true },
      { t: 'Promedio', num: true, r: function (x) { return TOP.seg(x.prom); } },
      { t: 'Mediana', num: true, r: function (x) { return TOP.seg(x.med); } },
      { t: 'P25 – P75', num: true, r: function (x) { return TOP.seg(x.p25) + ' – ' + TOP.seg(x.p75); } },
      { t: 'Mín – Máx', num: true, r: function (x) { return TOP.seg(x.min) + ' – ' + TOP.seg(x.max); } },
      { t: 'CV', num: true, r: function (x) { return DR.num(x.cv, 0) + '%'; } },
      { t: 'Estándar', num: true, r: function (x) { return '<b>' + TOP.seg(x.estandar) + '</b>'; } }
    ], acts) : '<div class="vacio">Aún no hay tomas de tiempo cerradas.</div>');

  // 2. Distribución de la jornada.
  h += UI.panel('¿En qué se va la jornada del TOP?', 'Promedio por jornada evaluada. Lo naranja es tiempo que el estándar debería eliminar o reducir.',
    A.jornadas.length ? '<div class="top-apilada">' + A.clases.filter(function (x) { return x.pct; }).map(function (x) {
      return '<span style="width:' + x.pct.toFixed(2) + '%;background:' + TOP.CLASES[x.clase].c + '" title="' + DR.esc(TOP.CLASES[x.clase].t) + '">' + (x.pct >= 9 ? DR.num(x.pct, 0) + '%' : '') + '</span>';
    }).join('') + '</div><div class="top-leyenda">' + A.clases.map(function (x) {
      return '<div><span class="top-punto" style="background:' + TOP.CLASES[x.clase].c + '"></span><b>' + DR.esc(TOP.CLASES[x.clase].t) + '</b> ' +
        DR.num(x.pct, 1) + '% · ' + TOP.segTexto(x.promJornada) + ' por jornada<small>' + DR.esc(TOP.CLASES[x.clase].d) + '</small></div>';
    }).join('') + '</div>' : '<div class="vacio">Sin jornadas medidas.</div>');

  // 3. Cumplimiento por ítem.
  var items = A.items.slice().sort(function (a, b) { return (a.pct === null ? 101 : a.pct) - (b.pct === null ? 101 : b.pct); });
  h += UI.panel('Cumplimiento de estándares por los TOP', 'Ordenado de menor a mayor cumplimiento. Bajo 80%: los TOP lo hacen distinto y el estándar debería revisarse.',
    items.length ? '<div class="top-cump">' + items.map(function (x) {
      var col = x.pct === null ? '#A89A8C' : (x.pct < 50 ? '#E5484D' : (x.pct < 80 ? '#EF7C3B' : '#76B729'));
      return '<div class="top-cump-item"><div class="top-cump-cab"><span class="pill gris">' + DR.esc(x.item.tipo + ' · ' + x.item.presentacion) + '</span>' +
        '<b style="color:' + col + '">' + (x.pct === null ? 'N/A' : DR.num(x.pct, 0) + '%') + '</b></div>' +
        '<div class="top-cump-txt">' + DR.esc(x.item.descripcion) + '</div>' +
        '<div class="lc-pista"><span class="lc-barra" style="width:' + (x.pct || 0).toFixed(1) + '%;background:' + col + '"></span></div>' +
        '<div class="top-cump-pie">' + x.C + ' cumplen · ' + x.NC + ' no cumplen · ' + x.NA + ' no aplica</div>' +
        (x.practicas.length ? '<div class="top-practicas"><b>Cómo lo hacen los TOP:</b>' + x.practicas.map(function (p) {
          return '<span>«' + DR.esc(p.t) + '»' + (p.n > 1 ? ' ×' + p.n : '') + '</span>'; }).join('') + '</div>' : '') +
        (x.fotos.length ? FOTOS.galeriaHtml(x.fotos.slice(0, 6)) : '') + '</div>';
    }).join('') + '</div>' : '<div class="vacio">Aún no hay estándares evaluados.</div>');

  // 4. REBA.
  if (A.reba.n) {
    h += UI.panel('Riesgo ergonómico REBA', A.reba.n + ' posturas evaluadas. Puntaje final promedio ' + DR.num(A.reba.prom.prom, 1) + ' (mediana ' + DR.num(A.reba.prom.med, 1) + ').',
      RES.barras(TOP.RIESGOS.map(function (r, i) {
        return { etq: r.t, sub: r.accion, valor: A.reba.niveles[i], color: r.c, texto: A.reba.niveles[i] + ' <small>(' + DR.num(A.reba.niveles[i] / A.reba.n * 100, 0) + '%)</small>' };
      })) + '<div class="sep-titulo">Exigencia por segmento corporal</div>' +
      RES.barras(A.reba.segmentos.map(function (s) {
        return { etq: s.t, sub: s.nMax + ' en la peor posición', valor: (s.prom || 0) / s.max * 100, color: '#EF7C3B', texto: DR.num(s.prom, 1) + ' <small>de ' + s.max + '</small>' };
      })) + (A.reba.porActividad.length ? UI.tabla([
        { t: 'Actividad', r: function (x) { return DR.esc(x.actividad.nombre); } }, { t: 'Posturas', k: 'n', num: true },
        { t: 'Promedio', num: true, r: function (x) { return DR.num(x.est.prom, 1); } }, { t: 'Máximo', k: 'max', num: true },
        { t: 'Riesgo máx.', r: function (x) { var nv = TOP.rebaNivel(x.max); return '<span class="top-reba-chip" style="background:' + TOP.RIESGOS[nv].c + '">' + TOP.RIESGOS[nv].t + '</span>'; } }
      ], A.reba.porActividad) : ''));
  }

  // 5. Ergonomía.
  if (A.ergo.n) {
    var dolor = A.ergo.secciones.filter(function (s) { return s.dolor; })[0];
    h += UI.panel('Checklist ergonómico', A.ergo.n + ' entrevistas. % desfavorable = respuestas que indican un problema.',
      RES.barras(A.ergo.secciones.map(function (s) {
        return { etq: s.t, valor: s.desfav || 0, color: (s.desfav || 0) >= 50 ? '#E5484D' : ((s.desfav || 0) >= 25 ? '#EF7C3B' : '#76B729'), texto: s.desfav === null ? '—' : DR.num(s.desfav, 0) + '%' };
      })) + '<div class="sep-titulo">Zonas con dolor</div><div class="grid-2"><div class="top-fig-marco claro"><img class="top-fig" src="img/ergonomia-cuerpo.jpg" alt="Diagrama corporal"></div><div>' +
      RES.barras(dolor.items.filter(function (i) { return i.SI; }).sort(function (a, b) { return b.SI - a.SI; }).map(function (i) {
        var mom = TOP.MOMENTOS.filter(function (m, k) { return i.momentos[k]; }).map(function (m) { return m[1].toLowerCase() + ' ' + i.momentos[m[0] - 1]; }).join(', ');
        return { etq: i.c + ' ' + i.t, sub: mom, valor: i.SI, color: '#E5484D', texto: i.SI + ' <small>de ' + A.ergo.n + '</small>' };
      })) + (dolor.items.some(function (i) { return i.SI; }) ? '' : '<div class="vacio">Ningún TOP reportó dolor.</div>') + '</div></div>' +
      '<div class="sep-titulo">Preguntas con más respuestas desfavorables</div>' + UI.tabla([
        { t: 'Pregunta', r: function (i) { return '<b>' + i.c + '</b> ' + DR.esc(i.t); } },
        { t: 'Sí', k: 'SI', num: true }, { t: 'No', k: 'NO', num: true }, { t: 'NS', k: 'NS', num: true },
        { t: 'Desfavorable', num: true, r: function (i) { return i.desfav === null ? '—' : DR.num(i.desfav, 0) + '%'; } }
      ], A.ergo.secciones.reduce(function (l, s) { return l.concat(s.items); }, []).filter(function (i) { return i.desfav; })
        .sort(function (a, b) { return b.desfav - a.desfav; }).slice(0, 12)));
  }

  if (A.enc.n || A.enc.noAcepto) h += RES.panelEncuesta(A.enc);

  h += UI.panel('Evaluaciones incluidas', '', UI.tabla([
    { t: 'Código', k: 'codigo' }, { t: 'Fecha', r: function (e) { return TOP.fecha(e.fecha); } }, { t: 'Cosechador', k: 'cosechador' },
    { t: 'Fundo', k: 'fundo' }, { t: 'Lote', k: 'lote' }, { t: 'Material', r: function (e) { return DR.esc(TOP.materialTxt(e.material || e.presentacion)); } }, { t: 'Líder', k: 'lider' }
  ], D.evals.map(function (e) { e._clic = true; return e; })));
  c.innerHTML = h;
  DR.entrarPaneles('#resCuerpo');
  FOTOS.pintar(c);
  DR.$$('tr[data-clic]', c).forEach(function (tr, i) { tr.onclick = function () { location.hash = '#evaluar/' + D.evals[i].id; }; });
};

/** Encuesta de factores de rendimiento: distribuciones, factores que quitan tiempo y respuestas abiertas. */
RES.panelEncuesta = function (E) {
  var barrasDist = function (l) {
    return RES.barras(l.map(function (o) { return { etq: o.t, valor: o.n, color: '#0097CE', texto: o.n + ' <small>(' + (E.n ? DR.num(o.n / E.n * 100, 0) : 0) + '%)</small>' }; }));
  };
  var lista = function (titulo, l) {
    if (!l.length) return '';
    return '<div class="sep-titulo">' + titulo + ' <small>(' + l.length + ')</small></div><div class="top-voces">' + l.map(function (x) {
      return '<div>«' + DR.esc(x.t) + '»<small>' + DR.esc(x.quien) + '</small></div>';
    }).join('') + '</div>';
  };
  return UI.panel('Encuesta de factores de rendimiento', E.n + ' encuestas respondidas' + (E.noAcepto ? ' · ' + E.noAcepto + ' no aceptaron' : '') +
    '. Lo que dicen los propios TOP sobre su método, el tiempo perdido y sus trucos.',
    (E.factores.length ? '<div class="sep-titulo">¿Qué les quita más tiempo? <small>1º = 3 pts · 2º = 2 · 3º = 1</small></div>' +
      RES.barras(E.factores.map(function (f) {
        return { etq: f.t, sub: f.menciones + ' menciones (1º ' + f.pos[0] + ' · 2º ' + f.pos[1] + ' · 3º ' + f.pos[2] + ')', valor: f.puntos, color: '#EF7C3B', texto: f.puntos + ' <small>pts</small>' };
      })) : '') +
    '<div class="grid-2"><div><div class="sep-titulo">Experiencia</div>' + barrasDist(E.p1) + '</div>' +
    '<div><div class="sep-titulo">¿Hace algo distinto a la capacitación?</div>' + barrasDist(E.p3) + '</div>' +
    '<div><div class="sep-titulo">¿Dónde rinde más?</div>' + barrasDist(E.p4) + '</div>' +
    '<div><div class="sep-titulo">¿Cómo aprendió?</div>' + barrasDist(E.p8) + '</div></div>' +
    lista('Trucos para cosechar más rápido cuidando la fruta', E.trucos) +
    lista('Qué hacen distinto a lo enseñado', E.distinto) +
    lista('Cómo trabajan una planta', E.metodo) +
    lista('Qué cambiarían del puesto, herramienta o instructivo', E.mejoras) +
    lista('Cómo resuelven el tiempo perdido', E.resuelve) +
    lista('Granel: qué facilita o complica', E.granel) +
    lista('Jarra: qué facilita o complica', E.jarra) +
    lista('Otros factores de tiempo perdido', E.otros));
};

TOP.rebaNivel = function (f) { return f <= 1 ? 0 : (f <= 3 ? 1 : (f <= 7 ? 2 : (f <= 10 ? 3 : 4))); };
