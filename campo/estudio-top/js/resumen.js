/* ============================================================================
 * resumen.js — RESUMEN DEL ESTUDIO TOP
 * Resultados por cosechador (cada persona pesa igual): tiempo productivo,
 * cumplimiento por documento del estándar, REBA con tarjetas por cosechador
 * (filtro al tocar, como en Power BI), checklist ergonómico con los aspectos
 * más desfavorables y la encuesta. Desde aquí se exporta el Excel y el PDF.
 * ==========================================================================*/
var RES = { D: null, A: null, base: null, claveBase: '', rebaSel: '', rebaNivel: null };

/** Suplemento del tiempo estándar: ya no se muestra en el Resumen, pero lo usan la Propuesta y los reportes. */
RES.SUPLEMENTO = 10;
/** «Exigencia por segmento corporal» quedó oculta (PPT de mejoras); el cálculo se conserva. */
RES.MOSTRAR_SEGMENTOS = false;

RES.filtro = function () {
  var f = TOP.leer('filtro', null);
  if (!f) f = { desde: TOP.localDe(new Date(Date.now() - 90 * 86400000)).substring(0, 10), hasta: '', presentacion: '', fundo: '' };
  if (f.suplemento === undefined || f.suplemento === '') f.suplemento = RES.SUPLEMENTO;
  delete f.material;
  return f;
};

RES.opcion = function (v, t, sel) { return '<option value="' + DR.esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };

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
      '<div class="campo"><label>Presentación</label><select data-campo="presentacion">' +
        RES.opcion('', 'Todos', f.presentacion) + RES.opcion('JARRA', 'Jarra cosechera', f.presentacion) +
        RES.opcion('BANDEJA', 'Granel (bandeja y bulk)', f.presentacion) + RES.opcion('MIXTO', 'Mixto (jarra y granel)', f.presentacion) + '</select></div>' +
      '<div class="campo"><label>Kg</label><select data-campo="kg">' + RES.opcion('', 'Todos', f.kg || '') +
        TOP.kgOpciones().map(function (k) { return RES.opcion(k, k, f.kg); }).join('') + '</select></div>' +
      '<div class="campo"><label>Fundo</label><select data-campo="fundo">' + RES.opcion('', 'Todos', f.fundo) +
        TOP.misFundos().map(function (x) { return RES.opcion(x, x, f.fundo); }).join('') + '</select></div>' +
      '<div class="campo"><label>Semana</label><select data-campo="semana" data-dinamico><option value="">Todas</option></select></div>' +
      '<div class="campo"><label>Líder</label><select data-campo="lider" data-dinamico><option value="">Todos</option></select></div>' +
      '<div class="campo"><label>Cosechador TOP</label><select data-campo="cosechador" data-dinamico><option value="">Todos</option></select></div>' +
      '</div></section><div id="resCuerpo"><div class="vacio">Cargando información…</div></div></div>';
    DR.entrarPaneles('#contenido');
    DR.$$('#frmFiltro [data-campo]').forEach(function (el) {
      el.onchange = function () {
        var nf = UI.leerForm('frmFiltro');
        nf.suplemento = f.suplemento;
        f = nf;
        TOP.escribir('filtro', nf);
        RES.rebaSel = ''; RES.rebaNivel = null;
        RES.cargar(nf);
      };
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

/** Desde, Hasta, Presentación y Fundo van al servidor; Semana, Líder, Cosechador y Kg se filtran aquí. */
RES.cargar = function (f) {
  var c = DR.$('#resCuerpo');
  var clave = [f.desde, f.hasta, f.presentacion, f.fundo].join('|');
  var enCache = RES.base && RES.claveBase === clave;
  if (!enCache) c.innerHTML = '<div class="vacio">Cargando información…</div>';
  var pr = enCache ? Promise.resolve(RES.base) : TOP.cargarDatos(f);
  pr.then(function (base) {
    RES.base = base; RES.claveBase = clave;
    RES.llenarOpciones(base, f);
    RES.D = TOP.filtrarDatos(base, f);
    RES.D.filtro = f;
    RES.A = TOP.analizar(RES.D, f.suplemento);
    RES.dibujar(c, RES.D, RES.A, f);
  }).catch(function (e) { UI.error(c, e); });
};

/** Semanas, líderes y cosechadores que existen en el rango cargado. */
RES.llenarOpciones = function (base, f) {
  var sem = {}, lid = {}, cos = {};
  base.evals.forEach(function (e) {
    sem[TOP.semanaDe(e.fecha)] = true;
    if (e.lider) lid[e.lider] = true;
    cos[TOP.claveCos(e)] = e.cosechador || '—';
  });
  var llenar = function (campo, todos, ops) {
    var sel = DR.$('#frmFiltro [data-campo="' + campo + '"]');
    if (!sel) return;
    var actual = f[campo] || '';
    if (actual && !ops.some(function (o) { return o[0] === actual; })) ops.unshift([actual, ops.length ? actual : actual]);
    sel.innerHTML = RES.opcion('', todos, actual) + ops.map(function (o) { return RES.opcion(o[0], o[1], actual); }).join('');
  };
  llenar('semana', 'Todas', Object.keys(sem).filter(Boolean).sort().reverse().map(function (s) { return [s, TOP.semanaTxt(s)]; }));
  llenar('lider', 'Todos', Object.keys(lid).sort(function (a, b) { return a.localeCompare(b, 'es'); }).map(function (l) { return [l, l]; }));
  llenar('cosechador', 'Todos', Object.keys(cos).sort(function (a, b) { return cos[a].localeCompare(cos[b], 'es'); }).map(function (k) { return [k, cos[k]]; }));
};

/** Barras horizontales (segundos o %) con el estilo de ciclos/js/grafico.js. */
RES.barras = function (items) {
  var max = items.reduce(function (m, i) { return Math.max(m, i.valor || 0, i.marca || 0); }, 0) * 1.05 || 1;
  if (items.some(function (i) { return i.max; })) max = items[0].max;
  return '<div class="gf-barras">' + items.map(function (it) {
    return '<div class="gf-fila' + (it.clic ? ' res-clic' : '') + '"' + (it.clic ? ' ' + it.clic : '') + '><div class="gf-nombre">' + DR.esc(it.etq) + (it.sub ? '<small>' + DR.esc(it.sub) + '</small>' : '') + '</div>' +
      '<div class="gf-pista">' + (it.marca ? '<span class="gf-meta" style="left:' + (it.marca / max * 100).toFixed(1) + '%"></span>' : '') +
      '<span class="gf-barra" style="width:' + Math.min(100, (it.valor || 0) / max * 100).toFixed(1) + '%;background:' + (it.color || 'linear-gradient(90deg,#0097CE,#76B729)') + '"></span></div>' +
      '<div class="gf-cifra">' + (it.texto || TOP.seg(it.valor)) + '</div></div>';
  }).join('') + '</div>';
};

RES.colorCump = function (p) { return p === null || p === undefined ? '#A89A8C' : (p < 50 ? '#E5484D' : (p < 80 ? '#EF7C3B' : '#76B729')); };
RES.colorNC = function (p) { return p === null || p === undefined ? '#A89A8C' : (p > 50 ? '#E5484D' : (p > 20 ? '#EF7C3B' : '#76B729')); };
RES.pct = function (v) { return v === null || v === undefined ? '—' : DR.num(v, 0) + '%'; };
RES.presTxt = function (p) { return p === 'JARRA' ? 'Jarra' : (p === 'BANDEJA' ? 'Granel' : (p === 'MIXTO' ? 'Mixto (jarra y granel)' : 'Todas')); };

RES.dibujar = function (c, D, A, f) {
  if (!D.evals.length) { c.innerHTML = '<div class="panel entra"><div class="vacio">No hay evaluaciones TOP para este filtro.</div></div>'; DR.entrarPaneles('#resCuerpo'); return; }
  var K = A.kpi, nvReba = K.reba === null ? null : TOP.rebaNivel(K.reba);
  var h = '<div class="kpis entra">' +
    UI.kpi('Cosechadores TOP', DR.num(A.porCos.length), D.evals.length + ' evaluaciones', '#0097CE') +
    UI.kpi('Tiempo productivo', K.prod === null ? '—' : DR.num(K.prod, 0) + '<small>%</small>',
      K.prod === null ? 'sin jornadas medidas' : 'promedio de ' + K.nProd + ' cosechadores' + (K.espera ? ' · ' + DR.num(K.espera, 0) + '% en esperas' : ''), '#76B729') +
    UI.kpi('Cumplimiento', K.cump === null ? '—' : DR.num(K.cump, 0) + '<small>%</small>',
      K.cump === null ? 'sin estándares evaluados' : 'promedio de ' + K.nCump + ' cosechadores (sus rondas)', '#EF7C3B') +
    UI.kpi('REBA promedio', K.reba === null ? '—' : DR.num(K.reba, 1),
      K.reba === null ? 'sin evaluaciones' : '<b style="color:' + TOP.RIESGOS[nvReba].c + '">' + TOP.RIESGOS[nvReba].t + '</b> · ' + DR.esc(TOP.RIESGOS[nvReba].accion), '#E5484D') +
    '</div>';

  // 1. Tiempo por actividad: promedio del tiempo acumulado por jornada.
  var acts = A.actividades.filter(function (x) { return x.n; });
  h += UI.panel('Tiempo por actividad', 'Promedio del tiempo acumulado por jornada en cada actividad (suma de todos sus registros del día).',
    acts.length ? RES.barras(acts.map(function (x) {
      return { etq: x.actividad.nombre, sub: x.n + ' registros · ' + x.nJornadas + ' jornada' + (x.nJornadas === 1 ? '' : 's') + ' · ' + TOP.CLASES[x.actividad.clase].t,
        valor: x.acum, color: TOP.CLASES[x.actividad.clase].c, texto: TOP.seg(x.acum) + ' <small>prom.</small>' };
    })) : '<div class="vacio">Aún no hay registros de tiempo cerrados.</div>');

  // 2. Distribución de la jornada (sin cambios).
  h += UI.panel('¿En qué se va la jornada del TOP?', 'Promedio por jornada evaluada. Lo naranja es tiempo que el estándar debería eliminar o reducir.',
    A.jornadas.length ? '<div class="top-apilada">' + A.clases.filter(function (x) { return x.pct; }).map(function (x) {
      return '<span style="width:' + x.pct.toFixed(2) + '%;background:' + TOP.CLASES[x.clase].c + '" title="' + DR.esc(TOP.CLASES[x.clase].t) + '">' + (x.pct >= 9 ? DR.num(x.pct, 0) + '%' : '') + '</span>';
    }).join('') + '</div><div class="top-leyenda">' + A.clases.map(function (x) {
      return '<div><span class="top-punto" style="background:' + TOP.CLASES[x.clase].c + '"></span><b>' + DR.esc(TOP.CLASES[x.clase].t) + '</b> ' +
        DR.num(x.pct, 1) + '% · ' + TOP.segTexto(x.promJornada) + ' por jornada<small>' + DR.esc(TOP.CLASES[x.clase].d) + '</small></div>';
    }).join('') + '</div>' : '<div class="vacio">Sin jornadas medidas.</div>');

  // 3. Cumplimiento por documento del estándar, con detalle por actividad.
  h += UI.panel('Cumplimiento de estándares por los TOP', 'Presentación: ' + RES.presTxt(f.presentacion) +
    '. % por documento = promedio por cosechador. Toca «Ver detalle» para ver las actividades ordenadas por % de no cumplimiento.',
    A.docs.length ? '<div class="res-docs">' + A.docs.map(RES.docHtml).join('') + '</div>' : '<div class="vacio">Aún no hay estándares evaluados.</div>');

  // 4. REBA por cosechador.
  if (A.reba.n) h += '<section class="panel entra" id="panelReba">' + RES.rebaHtml(A, f) + '</section>';

  // 5. Checklist ergonómico con los aspectos más desfavorables por sección.
  if (A.ergo.n) {
    h += UI.panel('Checklist ergonómico', A.ergo.n + ' entrevistas. % desfavorable de la sección = promedio del % de cada pregunta (todas pesan igual).',
      A.ergo.secciones.map(function (s) {
        var col = function (v) { return (v || 0) >= 50 ? '#E5484D' : ((v || 0) >= 25 ? '#EF7C3B' : '#76B729'); };
        return '<div class="res-ergo">' + RES.barras([{ etq: s.t, valor: s.desfav || 0, max: 100, color: col(s.desfav), texto: '<b>' + RES.pct(s.desfav) + '</b>' }]) +
          '<div class="res-ergo-top"><div class="res-mini">' + (s.dolor ? 'Partes del cuerpo' : 'Aspectos') + ' con más % desfavorable</div>' +
          (s.peores.length ? RES.barras(s.peores.map(function (i) {
            var mom = s.dolor ? TOP.MOMENTOS.filter(function (m, k) { return i.momentos[k]; }).map(function (m) { return m[1].toLowerCase() + ' ' + i.momentos[m[0] - 1]; }).join(', ') : '';
            return { etq: i.c + ' ' + i.t, sub: 'Desfavorable = «' + (i.malo === 'SI' ? 'Sí' : 'No') + '» · ' + i[i.malo] + ' de ' + (i.SI + i.NO) + (mom ? ' · ' + mom : ''),
              valor: i.desfav, max: 100, color: col(i.desfav), texto: RES.pct(i.desfav) };
          })) : '<div class="vacio">Sin respuestas desfavorables.</div>') + '</div></div>';
      }).join(''));
  }

  if (A.enc.n || A.enc.noAcepto) h += RES.panelEncuesta(A.enc);

  h += UI.panel('Evaluaciones incluidas', '', UI.tabla([
    { t: 'Código', k: 'codigo' }, { t: 'Fecha', r: function (e) { return TOP.fecha(e.fecha); } },
    { t: 'Semana', r: function (e) { return Number(TOP.semanaDe(e.fecha).substring(6)) || '—'; } }, { t: 'Cosechador', k: 'cosechador' },
    { t: 'Fundo', k: 'fundo' }, { t: 'Lote', k: 'lote' }, { t: 'Material', r: function (e) { return DR.esc(TOP.materialTxt(e.material || e.presentacion)); } }, { t: 'Líder', k: 'lider' }
  ], D.evals.map(function (e) { e._clic = true; return e; })));
  c.innerHTML = h;
  DR.entrarPaneles('#resCuerpo');
  FOTOS.pintar(c);
  RES.enlazarReba();
  DR.$$('tr[data-clic]', c).forEach(function (tr, i) { tr.onclick = function () { location.hash = '#evaluar/' + D.evals[i].id; }; });
};

/** Tarjeta de un documento del estándar con su detalle desplegable. */
RES.docHtml = function (d) {
  var col = RES.colorCump(d.pct);
  return '<div class="res-doc"><div class="top-cump-cab"><div><b class="res-doc-tit">' + DR.esc(d.t) + '</b>' +
    '<div class="top-cump-pie">' + d.titulos.map(DR.esc).join(' · ') + ' · ' + d.nCos + ' cosechadores</div></div>' +
    '<b style="color:' + col + '">' + RES.pct(d.pct) + '</b></div>' +
    '<div class="lc-pista"><span class="lc-barra" style="width:' + (d.pct || 0).toFixed(1) + '%;background:' + col + '"></span></div>' +
    '<details class="res-det"><summary>Ver detalle · ' + d.items.length + (d.items.length === 1 ? ' actividad' : ' actividades') + '</summary><div class="top-cump">' + d.items.map(function (x) {
      var cnc = RES.colorNC(x.pctNC), extra = x.practicas.length || x.obs.length || x.fotos.length;
      return '<div class="top-cump-item"><div class="top-cump-cab"><span class="pill gris">' + DR.esc(x.item.presentacion === 'JARRA' ? 'Jarra' : 'Granel') +
        (x.item.numero ? ' · N° ' + DR.esc(x.item.numero) : '') + '</span>' +
        '<b style="color:' + cnc + '">' + (x.pctNC === null ? 'N/A' : DR.num(x.pctNC, 0) + '% <small>no cumple</small>') + '</b></div>' +
        '<div class="top-cump-txt">' + DR.esc(x.item.descripcion) + '</div>' +
        '<div class="lc-pista"><span class="lc-barra" style="width:' + (x.pctNC || 0).toFixed(1) + '%;background:' + cnc + '"></span></div>' +
        '<div class="top-cump-pie">' + x.C + ' cumplen · ' + x.NC + ' no cumplen · ' + x.NA + ' no aplica</div>' +
        (extra ? '<details class="res-det res-det-chico"><summary>Ver comentarios' + (x.fotos.length ? ' e imágenes' : '') + '</summary>' +
          (x.practicas.length ? '<div class="top-practicas"><b>Cómo lo hacen los TOP:</b>' + x.practicas.map(function (p) {
            return '<span>«' + DR.esc(p.t) + '»' + (p.n > 1 ? ' ×' + p.n : '') + '</span>'; }).join('') + '</div>' : '') +
          (x.obs.length ? '<div class="top-practicas res-obs"><b>Observaciones:</b>' + RES.contar(x.obs).map(function (p) {
            return '<span>«' + DR.esc(p.t) + '»' + (p.n > 1 ? ' ×' + p.n : '') + '</span>'; }).join('') + '</div>' : '') +
          (x.fotos.length ? FOTOS.galeriaHtml(x.fotos.slice(0, 9)) : '') + '</details>' : '') + '</div>';
    }).join('') + '</div></details></div>';
};
RES.contar = function (l) {
  var n = {};
  l.forEach(function (t) { t = String(t).trim(); if (t) n[t] = (n[t] || 0) + 1; });
  return Object.keys(n).map(function (t) { return { t: t, n: n[t] }; }).sort(function (a, b) { return b.n - a.n; });
};

/* ------------------------------------------------ REBA por cosechador (filtro al tocar) */
RES.figSeg = function (s) {
  return '<div class="res-reba-fig">' + (s.seg.img ? '<img src="' + s.seg.img + '" alt="' + DR.esc(s.t) + '">' : (s.seg.svg === 'brazo' ? TOP.svgBrazo() : '')) + '</div>';
};
RES.chipReba = function (v) {
  if (v === null || v === undefined) return '';
  var nv = TOP.rebaNivel(v);
  return '<span class="top-reba-chip" style="background:' + TOP.RIESGOS[nv].c + '">' + DR.num(v, 1) + ' · ' + TOP.RIESGOS[nv].t + '</span>';
};

RES.rebaHtml = function (A, f) {
  var cos = A.porCos.filter(function (c) { return c.rebaProm !== null; }), n = cos.length;
  // Promedio por presentación: el del filtro y, si se ven ambas, el de cada una.
  var porPres = { JARRA: [], BANDEJA: [] };
  cos.forEach(function (c) {
    c.reba.forEach(function (r) {
      var e = c.evals.filter(function (x) { return x.id === r.evaluacion_id; })[0];
      if (e && porPres[e.presentacion]) porPres[e.presentacion].push({ k: c.clave, v: r.puntaje_final });
    });
  });
  var promPres = function (p) {
    var porC = {};
    porPres[p].forEach(function (x) { (porC[x.k] = porC[x.k] || []).push(x.v); });
    return TOP.prom(Object.keys(porC).map(function (k) { return TOP.prom(porC[k]); }));
  };
  var ambos = f.presentacion !== 'JARRA' && f.presentacion !== 'BANDEJA';
  var h = '<h2>Riesgo ergonómico REBA</h2><div class="sub">' + n + ' cosechadores · ' + A.reba.n + ' posturas. Cada cosechador cuenta con el promedio de sus posturas.</div>' +
    '<div class="res-reba-prom"><div><span class="res-mini">Promedio · ' + DR.esc(RES.presTxt(f.presentacion)) + '</span>' + RES.chipReba(A.kpi.reba) + '</div>' +
    (ambos ? ['JARRA', 'BANDEJA'].map(function (p) { var v = promPres(p); return v === null ? '' : '<div><span class="res-mini">' + RES.presTxt(p) + '</span>' + RES.chipReba(v) + '</div>'; }).join('') : '') + '</div>' +
    RES.barras(TOP.RIESGOS.map(function (r, i) {
      var v = A.reba.nivelesCos[i];
      return { etq: r.t, sub: r.accion + (v ? ' · ' + (RES.rebaNivel === i ? 'ocultar' : 'ver') + ' cosechadores ' + (RES.rebaNivel === i ? '▲' : '▼') : ''), valor: v, color: r.c,
        clic: v ? 'data-nivel="' + i + '"' : '', texto: v + ' <small>(' + DR.num(n ? v / n * 100 : 0, 0) + '%)</small>' };
    }));
  if (RES.rebaNivel !== null) {
    var delNivel = cos.filter(function (c) { return c.rebaNivel === RES.rebaNivel; });
    h += '<div class="res-nivel-lista"><div class="res-mini">Cosechadores en riesgo ' + TOP.RIESGOS[RES.rebaNivel].t.toLowerCase() + '</div>' +
      delNivel.map(function (c) {
        return '<button type="button" class="res-nombre' + (RES.rebaSel === c.clave ? ' activo' : '') + '" data-cos="' + DR.esc(c.clave) + '">' + DR.esc(c.nombre) +
          ' <small>' + DR.num(c.rebaProm, 1) + '</small></button>';
      }).join('') + '</div>';
  }
  if (RES.MOSTRAR_SEGMENTOS) {
    h += '<div class="sep-titulo">Exigencia por segmento corporal</div>' + RES.barras(A.reba.segmentos.map(function (s) {
      return { etq: s.t, sub: s.nMax + ' en la peor posición', valor: (s.prom || 0) / s.max * 100, color: '#EF7C3B', texto: DR.num(s.prom, 1) + ' <small>de ' + s.max + '</small>' };
    }));
  }

  // Selector de nombres (como un segmentador de Power BI) y tarjetas.
  var sel = cos.filter(function (c) { return c.clave === RES.rebaSel; })[0];
  h += '<div class="sep-titulo">Postura con mayor riesgo por cosechador</div><div class="res-nombres">' + cos.map(function (c) {
    return '<button type="button" class="res-nombre' + (sel === c ? ' activo' : '') + '" data-cos="' + DR.esc(c.clave) + '">' + DR.esc(c.nombre) + '</button>';
  }).join('') + (sel ? '<button type="button" class="res-nombre res-limpiar" data-cos="">✕ Ver todos</button>' : '') + '</div>';
  if (sel) {
    // Una tarjeta por cada parte del cuerpo en riesgo de la persona elegida.
    h += '<div class="res-reba-grid">' + sel.segmentos.slice(0, 4).map(function (s, i) {
      return '<div class="res-reba-card' + (i === 0 ? ' peor' : '') + '"><div class="res-reba-cab"><b>' + DR.esc(sel.nombre) + '</b>' + RES.chipReba(sel.rebaProm) + '</div>' +
        '<div class="res-reba-cuerpo">' + RES.figSeg(s) + '<div><div class="res-reba-parte">' + (i + 1) + '. ' + DR.esc(s.t) + '</div>' +
        '<div class="res-reba-desc">' + DR.esc(s.desc) + '</div><div class="res-mini">Exigencia ' + DR.num(s.relProm * 100, 0) + '% del máximo · ' +
        sel.reba.length + ' postura' + (sel.reba.length === 1 ? '' : 's') + '</div></div></div></div>';
    }).join('') + '</div>' + (sel.reba.some(function (r) { return (r.fotos || []).length; }) ?
      '<div class="res-mini" style="margin-top:10px">Fotos de las posturas</div>' + FOTOS.galeriaHtml(sel.reba.reduce(function (l, r) { return l.concat(r.fotos || []); }, []).slice(0, 9)) : '');
  } else {
    h += '<div class="res-reba-grid">' + cos.slice().sort(function (a, b) { return b.rebaProm - a.rebaProm; }).map(function (c) {
      var s = c.segmentos[0];
      return '<button type="button" class="res-reba-card" data-cos="' + DR.esc(c.clave) + '"><div class="res-reba-cab"><b>' + DR.esc(c.nombre) + '</b>' + RES.chipReba(c.rebaProm) + '</div>' +
        (s ? '<div class="res-reba-cuerpo">' + RES.figSeg(s) + '<div><div class="res-reba-parte">' + DR.esc(s.t) + '</div><div class="res-reba-desc">' + DR.esc(s.desc) + '</div>' +
          (c.segmentos[1] ? '<div class="res-mini">Luego: ' + DR.esc(c.segmentos[1].t) + (c.segmentos[2] ? ', ' + DR.esc(c.segmentos[2].t) : '') + '</div>' : '') + '</div></div>' : '') + '</button>';
    }).join('') + '</div>';
  }
  return h;
};

RES.enlazarReba = function () {
  var p = DR.$('#panelReba');
  if (!p) return;
  DR.$$('[data-cos]', p).forEach(function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-cos');
      RES.rebaSel = RES.rebaSel === k ? '' : k;
      RES.repintarReba();
    };
  });
  DR.$$('[data-nivel]', p).forEach(function (b) {
    b.onclick = function () {
      var i = Number(b.getAttribute('data-nivel'));
      RES.rebaNivel = RES.rebaNivel === i ? null : i;
      RES.repintarReba();
    };
  });
};
RES.repintarReba = function () {
  var p = DR.$('#panelReba');
  p.innerHTML = RES.rebaHtml(RES.A, RES.D.filtro || {});
  FOTOS.pintar(p);
  RES.enlazarReba();
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
    (E.factores.length ? '<div class="sep-titulo">¿Qué les quita más tiempo?</div>' +
      RES.barras(E.factores.map(function (f) {
        return { etq: f.t, valor: f.puntos, color: '#EF7C3B', texto: f.puntos + ' <small>pts</small>' };
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
