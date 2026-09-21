/* ============================================================================
 * pptx.js — PRESENTACIÓN «EVALUACIÓN CLIENTE INTERNO - <ÁREA>» (PptxGenJS)
 * Réplica automática de la presentación manual (16:9, 20 × 11,25 in):
 *   1 Portada · 2 Objetivo · 3 Estructura de la encuesta · 4 RESULTADOS
 *   5 Matriz de evaluaciones + Ponderado · 6 Consolidado (radar + sugerencias)
 *   7… Una diapositiva por planta con hasta 2 grupos evaluadores (radar nativo
 *   editable + Aspectos valorados / por mejorar / Recomendaciones) · Gracias.
 * Librería local vendor/pptxgen.bundle.js (se carga solo al generar).
 * PPT.construir no usa el DOM: se prueba en Node.
 * ==========================================================================*/
(function (raiz) {
  var PPT = {
    LIB: '../vendor/pptxgen.bundle.js',
    BASE: 'plantilla/',
    W: 20, H: 11.25,
    FUENTE: 'Calibri',
    C: { marron: '614533', marron2: '8A5132', tinta: '3B2F25', fondo: 'F4F7EE', titulo: 'B9DB9E', cabecera: '92C35A',
      borde: 'D5DCC8', blanco: 'FFFFFF', morado: '4B2DB5', gris: '6F6259' },
    // Proporción ancho/alto de las imágenes de la plantilla.
    IMG: { portada: 1.731, encuesta: 1.122, equipo: 1.460, criterios: 1.236, resultados: 1.107, logo: 1.770, gracias: 1.246 },
    SUG: [['aspectos_valorados', 'Aspectos Valorados'], ['aspectos_mejorar', 'Aspectos por Mejorar'], ['recomendaciones', 'Recomendaciones']]
  };

  var pctTxt = function (v) { return v === null || v === undefined || isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1) + ' %'; };
  var fechaTxt = function (f) { var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };

  PPT.img = function (nombre) { return PPT.BASE + nombre + (nombre === 'logo' || nombre === 'resultados' ? '.png' : '.jpg'); };
  /** Imagen ajustada dentro de una caja (sin deformar), centrada. */
  PPT.imagen = function (s, nombre, x, y, w, h) {
    var r = PPT.IMG[nombre], iw = w, ih = w / r;
    if (ih > h) { ih = h; iw = h * r; }
    s.addImage({ path: PPT.img(nombre), x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
  };
  PPT.logo = function (s, x, y, w) { s.addImage({ path: PPT.img('logo'), x: x, y: y, w: w, h: w / PPT.IMG.logo }); };

  /** Textos de sugerencias de varias encuestas, sin repetir. */
  PPT.textos = function (filas, campo) {
    var vistos = {}, lista = [];
    filas.forEach(function (f) {
      var t = String(f[campo] || '').trim(), k = norm(t);
      if (t && !vistos[k]) { vistos[k] = true; lista.push(t.charAt(0).toUpperCase() + t.slice(1)); }
    });
    return lista;
  };

  PPT.titulo = function (s, texto) {
    s.addText(texto, { x: 0.3, y: 0.3, w: 14, h: 1.3, fontFace: PPT.FUENTE, fontSize: 54, bold: true, color: PPT.C.marron });
    PPT.logo(s, 16.9, 0.2, 2.9);
    s.addShape('rect', { x: 0, y: 11.0, w: PPT.W, h: 0.25, fill: { color: PPT.C.marron }, line: { color: PPT.C.marron } });
  };

  /** Barra verde con el título de las diapositivas de resultados. */
  PPT.barraResultado = function (s, area) {
    s.background = { color: PPT.C.fondo };
    s.addShape('roundRect', { x: 0.3, y: 0.3, w: 15.9, h: 1.05, fill: { color: PPT.C.titulo }, line: { color: PPT.C.titulo }, rectRadius: 0.08 });
    s.addText('Resultado Satisfacción del Cliente Interno - ' + area, {
      x: 0.5, y: 0.3, w: 15.6, h: 1.05, fontFace: PPT.FUENTE, fontSize: 34, bold: true, color: '111111', valign: 'middle', fit: 'shrink'
    });
    PPT.logo(s, 16.9, 0.2, 2.9);
  };

  /**
   * Radar nativo (editable en PowerPoint) con los 4 criterios en %. El valor va dentro de la
   * etiqueta del eje: las etiquetas de datos del radar se montan sobre los nombres de los ejes.
   */
  PPT.radar = function (pptx, s, criterios, nombre, x, y, w, h) {
    var nombres = ['Atención y trato', 'Tiempo de respuesta', 'Comunicación', 'Calidad de servicio'];
    var etiquetas = nombres.map(function (n, i) { return n + '\n' + pctTxt(criterios[i + 1]); });
    var valores = [1, 2, 3, 4].map(function (c) { var v = criterios[c]; return v === null || v === undefined ? 0 : Math.round(v * 10) / 1000; });
    s.addChart(pptx.ChartType.radar, [{ name: nombre, labels: etiquetas, values: valores }], {
      x: x, y: y, w: w, h: h, radarStyle: 'marker',
      chartColors: ['7F7F7F'], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 8,
      showLegend: false, showValue: false,
      catAxisLabelColor: PPT.C.morado, catAxisLabelFontSize: 16, catAxisLabelFontFace: PPT.FUENTE, catAxisLabelFontBold: true,
      valAxisMinVal: 0, valAxisMaxVal: 1, valAxisHidden: true, valAxisLabelFormatCode: '0%',
      valGridLine: { color: 'DDDDEE', size: 0.75 }
    });
  };

  /**
   * Tabla Aspectos valorados / por mejorar / Recomendaciones.
   * porGrupo: una fila por grupo evaluador con su nombre en la primera columna (consolidado).
   */
  PPT.tablaSugerencias = function (s, grupos, x, y, w, porGrupo, fs) {
    fs = fs || 16;
    var estiloCab = { bold: true, fill: { color: PPT.C.cabecera }, color: '111111', align: 'center', valign: 'middle' };
    var cab = (porGrupo ? [{ text: 'Grupo evaluador', options: estiloCab }] : []).concat(PPT.SUG.map(function (c) {
      return { text: c[1], options: estiloCab };
    }));
    var filas = [cab];
    var bloques = porGrupo ? grupos.map(function (g) { return { nombre: g.grupo, filas: g.filas }; })
      : [{ filas: grupos.reduce(function (a, g) { return a.concat(g.filas); }, []) }];
    bloques.forEach(function (b) {
      var celdas = PPT.SUG.map(function (c) { return PPT.textos(b.filas, c[0]).join('\n') || '—'; });
      if (celdas.every(function (t) { return t === '—'; })) return;
      filas.push((porGrupo ? [{ text: b.nombre, options: { bold: true, valign: 'top', color: PPT.C.marron } }] : [])
        .concat(celdas.map(function (t) { return { text: t, options: { valign: 'top' } }; })));
    });
    if (filas.length === 1) {
      filas.push(cab.map(function (c, i) { return { text: i === 0 ? 'Sin sugerencias registradas.' : '', options: { color: PPT.C.gris } }; }));
    }
    var colW = porGrupo ? [w * 0.19, w * 0.27, w * 0.27, w * 0.27] : [w / 3, w / 3, w / 3];
    s.addTable(filas, {
      x: x, y: y, w: w, colW: colW, fontFace: PPT.FUENTE, fontSize: fs, color: '222222',
      fill: { color: PPT.C.blanco }, border: { type: 'solid', pt: 0.75, color: PPT.C.borde }, margin: 0.08, autoPage: false
    });
  };

  /* ------------------------------------------------------------ diapositivas */
  PPT.portada = function (pptx, ctx) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    PPT.logo(s, 0.6, 0.5, 3.4);
    s.addShape('roundRect', { x: 1.24, y: 3.02, w: 7.41, h: 1.81, fill: { color: PPT.C.marron2 }, line: { color: PPT.C.marron2 }, rectRadius: 0.9 });
    s.addText('Evaluación', { x: 1.24, y: 3.02, w: 7.41, h: 1.81, fontFace: PPT.FUENTE, fontSize: 72, bold: true, color: PPT.C.blanco, align: 'center', valign: 'middle' });
    s.addText([
      { text: 'Cliente Interno', options: { fontSize: 72, bold: true, breakLine: true } },
      { text: 'Área: ' + ctx.area, options: { fontSize: 40, bold: true } }
    ], { x: 0.48, y: 5.1, w: 9.4, h: 2.8, fontFace: PPT.FUENTE, color: PPT.C.marron, align: 'center', valign: 'top', fit: 'shrink' });
    var periodo = [ctx.cultivo, ctx.campana, ctx.desde ? fechaTxt(ctx.desde) + (ctx.hasta && ctx.hasta !== ctx.desde ? ' al ' + fechaTxt(ctx.hasta) : '') : '']
      .filter(Boolean).join(' · ');
    s.addText(periodo, { x: 0.48, y: 8.3, w: 9.4, h: 0.6, fontFace: PPT.FUENTE, fontSize: 20, color: PPT.C.gris, align: 'center' });
    s.addText('Ingeniería de Procesos · Don Ricardo', { x: 0.48, y: 9.9, w: 9.4, h: 0.5, fontFace: PPT.FUENTE, fontSize: 16, color: PPT.C.gris, align: 'center' });
    PPT.imagen(s, 'portada', 10.1, 2.0, 9.6, 7.9);
  };

  PPT.objetivo = function (pptx) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    s.addShape('rect', { x: 0, y: 0, w: 6.67, h: 11.0, fill: { color: PPT.C.marron }, line: { color: PPT.C.marron } });
    PPT.imagen(s, 'encuesta', 0.29, 2.79, 6.1, 5.44);
    s.addText('Objetivo', { x: 8.41, y: 0.9, w: 7.3, h: 1.5, fontFace: PPT.FUENTE, fontSize: 88, bold: true, color: PPT.C.marron });
    s.addText([
      'Evaluar la calidad del servicio interno de las diferentes áreas en base a los criterios de la encuesta.',
      'Diagnosticar el nivel de desempeño del área en la prestación de servicios internos.',
      'Identificar oportunidades de mejora y fortalecer la satisfacción de los usuarios.'
    ].map(function (t) { return { text: t, options: { bullet: { code: '25CF' }, breakLine: true, paraSpaceAfter: 18 } }; }), {
      x: 8.9, y: 3.1, w: 10.2, h: 4.8, fontFace: PPT.FUENTE, fontSize: 26, color: PPT.C.tinta, valign: 'top'
    });
    PPT.logo(s, 16.9, 0.2, 2.9);
    s.addShape('rect', { x: 0, y: 11.0, w: PPT.W, h: 0.25, fill: { color: PPT.C.marron }, line: { color: PPT.C.marron } });
  };

  PPT.estructura = function (pptx, items) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    PPT.titulo(s, 'Estructura de encuesta');
    s.addText([
      { text: 'La encuesta de satisfacción está estructurada en 10 ítems de evaluación, agrupados en criterios específicos que permiten identificar áreas críticas y priorizar acciones de mejora.', options: { breakLine: true, paraSpaceAfter: 16 } },
      { text: 'La evaluación es realizada por el jefe o responsable de cada área, quien deberá completar la totalidad de la encuesta.', options: { breakLine: true, paraSpaceAfter: 16 } },
      { text: 'Cada ítem vale entre 4 % y 10 %; el resultado es la suma de los 10 ítems (100 % = todos «Totalmente de acuerdo»).' }
    ], { x: 0.9, y: 2.1, w: 7.6, h: 5.4, fontFace: PPT.FUENTE, fontSize: 21, color: '775949', valign: 'top' });
    var esc = [['Totalmente en desacuerdo', '4.0 %', 'F4CCCC'], ['En desacuerdo', '6.5 %', 'FCE5CD'], ['De acuerdo', '8.5 %', 'D9EAD3'], ['Totalmente de acuerdo', '10.0 %', 'B6D7A8']];
    s.addTable([
      esc.map(function (e) { return { text: e[0], options: { bold: true, fill: { color: e[2] }, align: 'center', valign: 'middle' } }; }),
      esc.map(function (e) { return { text: e[1], options: { align: 'center', bold: true } }; })
    ], { x: 0.9, y: 7.9, w: 7.6, colW: [1.9, 1.9, 1.9, 1.9], fontFace: PPT.FUENTE, fontSize: 14, color: '222222', border: { type: 'solid', pt: 0.75, color: PPT.C.borde } });

    var criterios = [['Atención y trato', [1, 2]], ['Tiempo de respuesta', [3, 4]], ['Comunicación', [5, 6]], ['Calidad de servicio', [7, 8, 9, 10]]];
    var filas = [[
      { text: 'Criterio', options: { bold: true, fill: { color: PPT.C.cabecera } } },
      { text: 'N°', options: { bold: true, fill: { color: PPT.C.cabecera }, align: 'center' } },
      { text: 'Ítem', options: { bold: true, fill: { color: PPT.C.cabecera } } }
    ]];
    criterios.forEach(function (c) {
      c[1].forEach(function (n, k) {
        var it = items.filter(function (i) { return Number(i.id) === n; })[0];
        var fila = [];
        if (k === 0) fila.push({ text: c[0], options: { rowspan: c[1].length, bold: true, fill: { color: 'E2F0D9' }, valign: 'middle', align: 'center' } });
        fila.push({ text: String(n), options: { align: 'center', valign: 'middle' } });
        fila.push({ text: it ? it.texto : '', options: { valign: 'middle' } });
        filas.push(fila);
      });
    });
    s.addTable(filas, { x: 9.3, y: 1.9, w: 10.2, colW: [2.4, 0.7, 7.1], fontFace: PPT.FUENTE, fontSize: 14, color: '222222',
      border: { type: 'solid', pt: 0.75, color: PPT.C.borde }, margin: 0.08, rowH: 0.78 });
  };

  PPT.separador = function (pptx) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    PPT.logo(s, 0.3, 0.3, 2.9);
    s.addShape('rect', { x: 12.25, y: 0, w: 7.75, h: 11.0, fill: { color: PPT.C.marron }, line: { color: PPT.C.marron } });
    s.addShape('ellipse', { x: 13.47, y: 2.97, w: 5.31, h: 5.31, fill: { color: PPT.C.blanco }, line: { color: PPT.C.blanco } });
    PPT.imagen(s, 'resultados', 13.9, 3.4, 4.45, 4.45);
    s.addText('RESULTADOS', { x: 0.65, y: 4.5, w: 11, h: 1.9, fontFace: PPT.FUENTE, fontSize: 115, bold: true, color: PPT.C.marron });
    s.addShape('rect', { x: 0, y: 11.0, w: PPT.W, h: 0.25, fill: { color: PPT.C.marron }, line: { color: PPT.C.marron } });
  };

  PPT.matriz = function (pptx, ctx) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    PPT.titulo(s, 'Matriz de evaluaciones');
    var grupos = ctx.grupos;
    var cab = { bold: true, color: '1F2F6B', fill: { color: 'E8F0FB' }, align: 'center', valign: 'middle' };
    // Fila de plantas (PDC, PLM…) sobre los grupos evaluadores.
    var plantas = [];
    grupos.forEach(function (g) {
      var ult = plantas[plantas.length - 1];
      if (ult && ult.planta === g.planta) ult.n++; else plantas.push({ planta: g.planta, n: 1 });
    });
    var filaPlanta = [{ text: '', options: { fill: { color: PPT.C.blanco }, border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: PPT.C.borde }, { type: 'none' }] } }]
      .concat(plantas.map(function (p) {
        return { text: p.planta || '', options: { colspan: p.n, bold: true, fontSize: 24, align: 'center', color: PPT.C.marron,
          fill: { color: p.planta ? 'F6EFE9' : PPT.C.blanco } } };
      }));
    var filaCab = [{ text: 'Área Evaluada', options: cab }].concat(grupos.map(function (g) { return { text: g.grupo + (g.n > 1 ? ' (' + g.n + ')' : ''), options: cab }; }));
    var filaVal = [{ text: ctx.area, options: { bold: true, valign: 'middle' } }].concat(grupos.map(function (g) {
      return { text: pctTxt(g.total), options: { align: 'center', valign: 'middle' } };
    }));
    var anchoArea = 3.6, anchoCol = Math.min(2.6, (18.4 - anchoArea) / Math.max(grupos.length, 1));
    var ancho = anchoArea + anchoCol * grupos.length;
    s.addTable([filaPlanta, filaCab, filaVal], {
      x: (PPT.W - ancho) / 2, y: 2.3, w: ancho, colW: [anchoArea].concat(grupos.map(function () { return anchoCol; })),
      rowH: [0.6, 1.1, 0.9], fontFace: PPT.FUENTE, fontSize: grupos.length > 7 ? 15 : 20, color: '111111',
      border: { type: 'solid', pt: 0.75, color: PPT.C.borde }, margin: 0.06
    });
    s.addTable([
      [{ text: 'Área', options: cab }, { text: 'Ponderado', options: cab }],
      [{ text: ctx.area, options: { bold: true } }, { text: pctTxt(ctx.consolidado.total), options: { align: 'center', bold: true } }]
    ], { x: 7.3, y: 6.3, w: 5.4, colW: [3.2, 2.2], rowH: [0.8, 0.8], fontFace: PPT.FUENTE, fontSize: 22, color: '111111',
      border: { type: 'solid', pt: 0.75, color: PPT.C.borde }, valign: 'middle' });
    s.addText('Ponderado = promedio de las ' + ctx.consolidado.n + ' encuesta(s) del periodo. Los grupos con varias encuestas muestran su promedio (n).', {
      x: 1.0, y: 8.1, w: 12.5, h: 0.6, fontFace: PPT.FUENTE, fontSize: 14, color: PPT.C.gris, italic: true
    });
    PPT.imagen(s, 'criterios', 14.9, 7.1, 4.7, 3.85);
  };

  PPT.consolidado = function (pptx, ctx) {
    var s = pptx.addSlide();
    PPT.barraResultado(s, ctx.area);
    s.addShape('rect', { x: 0.75, y: 1.65, w: 1.6, h: 1.05, fill: { color: PPT.C.blanco }, line: { color: PPT.C.marron, width: 1.5 } });
    s.addText('Puntaje Ponderado', { x: 0.75, y: 1.65, w: 1.6, h: 1.05, fontFace: PPT.FUENTE, fontSize: 18, bold: true, color: '7A1F1F', align: 'center', valign: 'middle' });
    s.addShape('rect', { x: 2.35, y: 1.65, w: 3.0, h: 1.05, fill: { color: PPT.C.blanco }, line: { color: PPT.C.marron, width: 1.5 } });
    s.addText(pctTxt(ctx.consolidado.total), { x: 2.35, y: 1.65, w: 3.0, h: 1.05, fontFace: PPT.FUENTE, fontSize: 44, bold: true, color: '111111', align: 'center', valign: 'middle' });
    PPT.cajaRadar(pptx, s, ctx.consolidado.criterios, ctx.area, 0.25, 2.95, 9.1, 7.9, null);
    PPT.tablaSugerencias(s, ctx.grupos, 9.7, 1.65, 10.0, true, ctx.grupos.length > 6 ? 11 : (ctx.grupos.length > 4 ? 12 : 14));
    PPT.imagen(s, 'equipo', 15.8, 8.0, 4.0, 3.0);
  };

  /** Caja «EVALUACIÓN CRITERIO» con el radar; titulo opcional arriba (desplegable del PBI). */
  PPT.cajaRadar = function (pptx, s, criterios, nombre, x, y, w, h, titulo) {
    var top = y;
    if (titulo) {
      s.addShape('rect', { x: x, y: y, w: w, h: 0.75, fill: { color: PPT.C.blanco }, line: { color: '111111', width: 1 } });
      s.addText(titulo, { x: x + 0.2, y: y, w: w - 0.4, h: 0.75, fontFace: PPT.FUENTE, fontSize: 22, color: '111111', valign: 'middle', fit: 'shrink' });
      top = y + 0.75;
    }
    s.addShape('rect', { x: x, y: top, w: w, h: h - (top - y), fill: { color: PPT.C.blanco }, line: { color: '111111', width: 1 } });
    s.addShape('rect', { x: x, y: top, w: w, h: 0.5, fill: { color: PPT.C.cabecera }, line: { color: PPT.C.cabecera } });
    s.addText('EVALUACIÓN CRITERIO', { x: x, y: top, w: w, h: 0.5, fontFace: PPT.FUENTE, fontSize: 18, bold: true, color: PPT.C.blanco, align: 'center', valign: 'middle' });
    PPT.radar(pptx, s, criterios, nombre, x + 0.3, top + 0.65, w - 0.6, h - (top - y) - 0.8);
  };

  /** Una diapositiva con hasta 2 grupos evaluadores. */
  PPT.grupos = function (pptx, ctx, par) {
    var s = pptx.addSlide();
    PPT.barraResultado(s, ctx.area);
    par.forEach(function (g, i) {
      var x = i === 0 ? 0.6 : 10.4, w = 9.0;
      var rotulo = (g.planta ? g.planta + ' – ' : '') + g.grupo.replace(/^[A-Z]{2,4} - /, '').replace(/^Prod\. /, 'Producción ');
      s.addText(rotulo.toUpperCase(), { x: x, y: 1.55, w: w, h: 0.55, fontFace: PPT.FUENTE, fontSize: 22, bold: true, color: PPT.C.marron, align: 'center' });
      PPT.cajaRadar(pptx, s, g.criterios, g.grupo, x + 0.8, 2.15, w - 1.6, 5.35, g.grupo + '   ·   ' + pctTxt(g.total) + (g.n > 1 ? '   (' + g.n + ' encuestas)' : ''));
      PPT.tablaSugerencias(s, [g], x, 7.7, w, false, 15);
    });
  };

  PPT.gracias = function (pptx) {
    var s = pptx.addSlide();
    s.background = { color: PPT.C.blanco };
    s.addImage({ path: PPT.img('gracias'), x: 5.97, y: 0, w: 14.03, h: 11.25 });
    PPT.logo(s, 0.6, 0.8, 4.2);
  };

  /** ctx: { area, cultivo, campana, desde, hasta, filas, consolidado, grupos }, items: sci_items. */
  PPT.construir = function (PptxGenJS, ctx, items) {
    var pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'DR_16_9', width: PPT.W, height: PPT.H });
    pptx.layout = 'DR_16_9';
    pptx.author = 'Integra · Ingeniería de Procesos';
    pptx.company = 'Don Ricardo';
    pptx.title = 'Evaluación Cliente Interno - ' + ctx.area;
    PPT.portada(pptx, ctx);
    PPT.objetivo(pptx);
    PPT.estructura(pptx, items);
    PPT.separador(pptx);
    PPT.matriz(pptx, ctx);
    PPT.consolidado(pptx, ctx);
    // Grupos con planta: una diapositiva por planta (paginada de 2 en 2); sin planta, de 2 en 2.
    var bloques = [], actual = null;
    ctx.grupos.forEach(function (g) {
      if (!actual || actual.planta !== g.planta || actual.lista.length === 2) { actual = { planta: g.planta, lista: [] }; bloques.push(actual); }
      actual.lista.push(g);
    });
    bloques.forEach(function (b) { PPT.grupos(pptx, ctx, b.lista); });
    PPT.gracias(pptx);
    return pptx;
  };

  PPT.nombre = function (ctx) {
    return ['Presentación Evaluación Cliente Interno', ctx.area, ctx.cultivo, ctx.campana].filter(Boolean).join(' - ')
      .replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pptx';
  };

  /** Navegador: carga la librería, arma y descarga. */
  PPT.generar = function (ctx) {
    return DR.cargarScript(PPT.LIB).then(function () {
      if (!window.PptxGenJS) throw new Error('No se pudo cargar el generador de PowerPoint.');
      return PPT.construir(window.PptxGenJS, ctx, SCI.items).writeFile({ fileName: PPT.nombre(ctx) });
    });
  };

  raiz.PPT = PPT;
  if (typeof module !== 'undefined' && module.exports) module.exports = PPT;
})(typeof window !== 'undefined' ? window : globalThis);
