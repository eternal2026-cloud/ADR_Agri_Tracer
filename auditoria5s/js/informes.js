/* ============================================================================
 * informes.js — INFORMES DESCARGABLES DE AUDITORÍA 5S (se arman en el celular)
 *   · Excel de Observaciones con el formato manual de los Excel por área:
 *     «Evidencia Fotográfica», colores #5B9BD5 / #BDD7EE, Roboto 10, altos y
 *     anchos originales, formato condicional por estado, filtros y fotos
 *     Antes/Después incrustadas. Una hoja por área + hoja BD (19 columnas).
 *   · PDF por fechas: resultado por S, gráfico radar, detalle por área o zona,
 *     paleta y logo Don Ricardo · Ingeniería de Procesos.
 * Librerías locales cargadas bajo demanda: vendor/exceljs.min.js y
 * vendor/jspdf.umd.min.js. Los puntajes nunca mezclan cultivos.
 * ==========================================================================*/
var INF = {
  PALETA: ['#0097CE', '#EF7C3B', '#76B729', '#5D4835', '#D9622B', '#E8B04A'],
  MADUREZ: { 'EXCELENTE': '#76B729', 'BIEN': '#0097CE', 'REGULAR': '#EF7C3B', 'CRÍTICO': '#E5484D' },
  MAX_FECHAS: 6,
  // Colores del Excel manual (tema Office: accent1 #5B9BD5, filas accent1 al 60 %).
  XL: {
    cabecera: 'FF5B9BD5', fila: 'FFBDD7EE',
    estados: [
      ['Pendiente', 'FF9DC3E6', null], ['En ejecución', 'FFED7D31', 'FFFFFFFF'], ['Cancelado', 'FFFF0000', 'FFFFFFFF'],
      ['Cerrado', 'FF92D050', 'FFFFFFFF'], ['Recomendación', 'FFFFC000', 'FFFFFFFF']
    ]
  }
};

/* ------------------------------------------------------------ utilidades */
INF.jsPDF = function () {
  return DR.cargarScript('../vendor/jspdf.umd.min.js').then(function () {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('No se pudo cargar el generador de PDF.');
    return window.jspdf.jsPDF;
  });
};
INF.excelJS = function () {
  return DR.cargarScript('../vendor/exceljs.min.js').then(function () {
    if (!window.ExcelJS) throw new Error('No se pudo cargar el generador de Excel.');
    return window.ExcelJS;
  });
};

INF.descargar = function (blob, nombre) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 5000);
};

INF.nombreArchivo = function (partes, ext) {
  return partes.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.' + ext;
};

/** Ejecuta fn sobre items con n tareas en paralelo. */
INF.enLotes = function (items, n, fn) {
  var i = 0;
  var trabajador = function () {
    if (i >= items.length) return Promise.resolve();
    var item = items[i++];
    return Promise.resolve(fn(item)).then(trabajador, trabajador);
  };
  var hilos = [];
  for (var k = 0; k < Math.min(n, items.length); k++) hilos.push(trabajador());
  return Promise.all(hilos);
};

INF.fechaExcel = function (f) {
  var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

INF.svgAPng = function (svg, ancho, alto, escala) {
  escala = escala || 2;
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = Math.round(ancho * escala);
      c.height = Math.round(alto * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = function () { reject(new Error('No se pudo dibujar un gráfico del informe.')); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
};

/* ------------------------------------------------------------ gráfico radar (SVG) */
/** series: [{ nombre, color, valores: {1..5: 0–1}, total }]. opc.claro para fondo blanco (PDF). */
INF.radarSvg = function (series, opc) {
  opc = opc || {};
  var W = opc.ancho || 520, H = opc.alto || 440, conLeyenda = series.length > 1;
  var cx = W / 2, cy = conLeyenda ? H * 0.43 : H * 0.5, R = Math.min(W * 0.3, (conLeyenda ? H * 0.3 : H * 0.34));
  var claro = !!opc.claro, tinta = claro ? '#3B2F25' : '#D6CABE', malla = claro ? '#DDD5CC' : '#4A3E34', fondoNum = claro ? '#FFFFFF' : '#1D1713';
  var ang = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / 5; };
  var pt = function (i, v) { return [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v]; };
  var poli = function (v) { return [0, 1, 2, 3, 4].map(function (i) { var p = pt(i, v); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); };
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Helvetica, Arial, sans-serif">';
  if (claro) s += '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';
  [0.25, 0.5, 0.75, 1].forEach(function (v) {
    s += '<polygon points="' + poli(v) + '" fill="none" stroke="' + malla + '" stroke-width="1"/>';
  });
  s += '<polygon points="' + poli(0.9) + '" fill="none" stroke="#76B729" stroke-width="1.2" stroke-dasharray="5 4" opacity=".8"/>';
  s += '<polygon points="' + poli(0.75) + '" fill="none" stroke="#EF7C3B" stroke-width="1.2" stroke-dasharray="5 4" opacity=".8"/>';
  [0, 1, 2, 3, 4].forEach(function (i) {
    var p = pt(i, 1);
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="' + malla + '" stroke-width="1"/>';
  });
  [0.25, 0.5, 0.75, 1].forEach(function (v) {
    s += '<text x="' + (cx + 4) + '" y="' + (cy - R * v - 3).toFixed(1) + '" font-size="10" fill="' + tinta + '" opacity=".6">' + (v * 100) + '%</text>';
  });
  [0, 1, 2, 3, 4].forEach(function (i) {
    var p = pt(i, 1.2), cos = Math.cos(ang(i)), ancla = Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end');
    var dy = Math.sin(ang(i)) > 0.5 ? 10 : (Math.sin(ang(i)) < -0.5 ? -12 : 0);
    s += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy).toFixed(1) + '" text-anchor="' + ancla + '" font-size="15" font-weight="bold" fill="' + S5.COLORES[i + 1] + '">' + (i + 1) + 'S</text>';
    s += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy + 15).toFixed(1) + '" text-anchor="' + ancla + '" font-size="12" fill="' + tinta + '">' + S5.NOMBRES[i + 1] + '</text>';
  });
  series.forEach(function (se) {
    var pts = [0, 1, 2, 3, 4].map(function (i) { var v = se.valores[i + 1]; return pt(i, v === null || v === undefined ? 0 : Math.max(0, Math.min(1, Number(v)))); });
    s += '<polygon points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="' + se.color + '" fill-opacity="' + (series.length > 2 ? 0.1 : 0.18) + '" stroke="' + se.color + '" stroke-width="2.6" stroke-linejoin="round"/>';
    pts.forEach(function (p) { s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.8" fill="' + se.color + '" stroke="' + fondoNum + '" stroke-width="1.5"/>'; });
    if (series.length === 1) {
      pts.forEach(function (p, i) {
        var v = se.valores[i + 1];
        if (v === null || v === undefined) return;
        s += '<text x="' + (p[0] + (Math.cos(ang(i)) >= 0 ? 8 : -8)).toFixed(1) + '" y="' + (p[1] - 7).toFixed(1) + '" text-anchor="' + (Math.cos(ang(i)) >= 0 ? 'start' : 'end') +
          '" font-size="12" font-weight="bold" fill="' + tinta + '">' + S5.pct(v) + '</text>';
      });
    }
  });
  if (conLeyenda) {
    var col = Math.min(3, series.length), anchoCol = (W - 40) / col, y0 = H * 0.43 + R * 1.2 + 44;
    series.forEach(function (se, k) {
      var x = 20 + (k % col) * anchoCol, y = y0 + Math.floor(k / col) * 22;
      s += '<rect x="' + x + '" y="' + (y - 10) + '" width="12" height="12" rx="3" fill="' + se.color + '"/>';
      s += '<text x="' + (x + 18) + '" y="' + y + '" font-size="12.5" fill="' + tinta + '">' + esc(se.nombre) + (se.total !== undefined && se.total !== null ? ' · ' + S5.pct(se.total) : '') + '</text>';
    });
  }
  s += '<text x="' + (W - 12) + '" y="16" text-anchor="end" font-size="10" fill="' + tinta + '" opacity=".75">— — 90% EXCELENTE · — — 75% BIEN</text>';
  return s + '</svg>';
};

/* ------------------------------------------------------------ datos para el PDF */
/** filas: fn_s5_resumen de UN cultivo. Devuelve un grupo por fecha con sus auditorías. */
INF.agruparPorFecha = function (filas, areaId, fechas) {
  var grupos = {};
  filas.forEach(function (f) {
    if (fechas.indexOf(f.fecha) < 0 || (areaId && f.area_id !== Number(areaId))) return;
    var g = grupos[f.fecha] = grupos[f.fecha] || { fecha: f.fecha, semana: f.semana, auditorias: {}, zonas: [] };
    var a = g.auditorias[f.auditoria_id] = g.auditorias[f.auditoria_id] || {
      id: f.auditoria_id, codigo: f.codigo, area_id: f.area_id, area: f.area, numero_auditoria: f.numero_auditoria, tipo: f.tipo,
      campana: f.campana, planta: f.planta, zonas: []
    };
    a.zonas.push(f);
    g.zonas.push(f);
  });
  var porS = function (zonas) {
    var r = {}, todos = [];
    for (var s = 1; s <= 5; s++) {
      var vals = zonas.map(function (z) { return z['p' + s]; });
      r[s] = S5.promedio(vals);
      todos = todos.concat(vals);
    }
    r.total = S5.promedio(todos);
    return r;
  };
  return Object.keys(grupos).sort().map(function (k) {
    var g = grupos[k];
    g.lista = Object.keys(g.auditorias).map(function (id) {
      var a = g.auditorias[id];
      a.porS = porS(a.zonas);
      return a;
    }).sort(function (x, y) { return ((S5.area(x.area_id) || {}).orden || 0) - ((S5.area(y.area_id) || {}).orden || 0); });
    g.porS = porS(g.zonas);
    return g;
  });
};

/* ------------------------------------------------------------ PDF de resultados */
/** opc: { cultivo, area (obj o null), grupos (agruparPorFecha), obs: [{auditoria_id, estado}] } */
INF.pdfResultados = function (opc) {
  var cul = opc.cultivo, grupos = opc.grupos;
  var series = grupos.map(function (g, i) { return { nombre: S5.fecha(g.fecha), color: INF.PALETA[i % INF.PALETA.length], valores: g.porS, total: g.porS.total }; });
  var RW = 640, RH = grupos.length > 1 ? 600 : 520;

  return Promise.all([
    INF.jsPDF(),
    INF.svgAPng(INF.radarSvg(series, { claro: true, ancho: RW, alto: RH }), RW, RH, 2),
    INF.svgAPng(DR.marcaSvg(650), 650, 300, 1),
    INF.svgAPng(S5.iconoCultivo(cul, 64), 64, 64, 4)
  ]).then(function (r) {
    var JsPDF = r[0], radar = r[1], logo = r[2], icono = r[3];
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var W = 210, H = 297, M = 14, ANCHO = W - 2 * M, y = 0;
    var MARRON = '#5D4835', TEXTO = '#2B2119', GRIS = '#7A6D62', LINEA = '#E3DCD5', FONDO = '#F7F2EC';
    var hex = function (c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; };
    var color = function (fn, c) { var v = hex(c); doc[fn](v[0], v[1], v[2]); };
    var fuente = function (estilo, tam, c) { doc.setFont('helvetica', estilo); doc.setFontSize(tam); color('setTextColor', c || TEXTO); };

    var encabezado = function () {
      doc.addImage(logo, 'PNG', M, 8.5, 23, 10.6);
      fuente('bold', 12.5, MARRON);
      doc.text('DON RICARDO', M + 26, 14);
      var x = M + 26;
      fuente('normal', 6.5, GRIS); doc.text('– A ', x, 18.2); x += doc.getTextWidth('– A ');
      fuente('bold', 6.5, '#EF7C3B'); doc.text('FRUTURA', x, 18.2); x += doc.getTextWidth('FRUTURA');
      fuente('normal', 6.5, GRIS); doc.text(' COMPANY –', x, 18.2);
      fuente('bold', 7.5, '#EF7C3B'); doc.text('INGENIERÍA DE PROCESOS', W - M, 12.2, { align: 'right' });
      fuente('bold', 13, MARRON); doc.text('Informe de Auditoría 5S', W - M, 18.4, { align: 'right' });
      ['#0097CE', '#EF7C3B', '#76B729'].forEach(function (c, i) { color('setFillColor', c); doc.rect(M + i * ANCHO / 3, 22.5, ANCHO / 3, 1.1, 'F'); });
      return 30;
    };
    var espacio = function (h) { if (y + h > H - 16) { doc.addPage(); y = encabezado(); } };
    var titulo = function (t) {
      espacio(14);
      color('setFillColor', '#EF7C3B'); doc.rect(M, y - 3.6, 1.4, 4.6, 'F');
      fuente('bold', 11, MARRON); doc.text(t, M + 3.5, y);
      y += 5;
    };
    var celda = function (v, x, w, al, yy, h) {
      var s = String(v === null || v === undefined || v === '' ? '—' : v);
      var lineas = doc.splitTextToSize(s, w - 3);
      s = lineas[0] + (lineas.length > 1 ? '…' : '');
      var ty = yy + h / 2 + 1.1;
      if (al === 'center') doc.text(s, x + w / 2, ty, { align: 'center' });
      else if (al === 'right') doc.text(s, x + w - 1.5, ty, { align: 'right' });
      else doc.text(s, x + 1.5, ty);
    };
    /** cols: [{t, w, al}] · filas: [{celdas, fills, bold}] */
    var tabla = function (cols, filas) {
      var h = 7, total = cols.reduce(function (a, c) { return a + c.w; }, 0);
      var cabecera = function () {
        color('setFillColor', MARRON); doc.rect(M, y, total, h, 'F');
        fuente('bold', 8, '#FFFFFF');
        var x = M;
        cols.forEach(function (c) { celda(c.t, x, c.w, c.al || 'left', y, h); x += c.w; });
        y += h;
      };
      espacio(h * 2 + 2);
      cabecera();
      filas.forEach(function (f, i) {
        if (y + h > H - 16) { doc.addPage(); y = encabezado(); cabecera(); }
        if (i % 2) { color('setFillColor', FONDO); doc.rect(M, y, total, h, 'F'); }
        var x = M;
        cols.forEach(function (c, j) {
          var fill = f.fills && f.fills[j];
          if (fill) { color('setFillColor', fill); doc.roundedRect(x + 0.8, y + 1, c.w - 1.6, h - 2, 1.2, 1.2, 'F'); }
          fuente(f.bold || (fill ? true : false) ? 'bold' : 'normal', fill ? 7.2 : 8.2, fill ? '#FFFFFF' : TEXTO);
          celda(f.celdas[j], x, c.w, c.al || 'left', y, h);
          x += c.w;
        });
        color('setDrawColor', LINEA); doc.setLineWidth(0.2); doc.line(M, y + h, M + total, y + h);
        y += h;
      });
      y += 4;
    };
    var filaMadurez = function (p) { return { t: S5.madurez(p) || '—', fill: INF.MADUREZ[S5.madurez(p)] || null }; };

    /* ---- portada / datos generales */
    y = encabezado();
    doc.addImage(icono, 'PNG', M, y - 1, 14, 14);
    fuente('bold', 17, TEXTO); doc.text(cul.nombre, M + 17, y + 5.5);
    var campanas = [], plantas = [];
    grupos.forEach(function (g) { g.lista.forEach(function (a) { if (campanas.indexOf(a.campana) < 0) campanas.push(a.campana); if (plantas.indexOf(a.planta) < 0) plantas.push(a.planta); }); });
    fuente('normal', 9, GRIS);
    doc.text('Campaña: ' + campanas.join(', ') + '   ·   Planta: ' + plantas.join(', '), M + 17, y + 10.5);
    y += 18;
    fuente('normal', 9, TEXTO);
    doc.text('Área: ' + (opc.area ? opc.area.nombre : 'Todas las áreas') + '   ·   Fechas de auditoría: ' + grupos.map(function (g) { return S5.fecha(g.fecha); }).join(', '), M, y);
    y += 5;
    fuente('normal', 8, GRIS);
    var ahora = new Date();
    doc.text('Generado el ' + S5.fecha(S5.hoy()) + ' a las ' + S5._p(ahora.getHours()) + ':' + S5._p(ahora.getMinutes()) +
      ((AT.perfil && AT.perfil.nombre) ? ' por ' + AT.perfil.nombre : '') + ' · AgriTracer', M, y);
    y += 7;

    /* ---- tarjetas por fecha */
    var n = grupos.length, gap = 3, wk = (ANCHO - gap * (n - 1)) / n;
    grupos.forEach(function (g, i) {
      var x = M + i * (wk + gap), c = INF.PALETA[i % INF.PALETA.length], m = S5.madurez(g.porS.total);
      color('setFillColor', FONDO); doc.roundedRect(x, y, wk, 22, 2, 2, 'F');
      color('setFillColor', c); doc.rect(x, y, wk, 1.3, 'F');
      fuente('bold', 8, GRIS); doc.text(S5.fecha(g.fecha) + ' · sem. ' + g.semana, x + 3, y + 6);
      fuente('bold', n > 3 ? 13 : 17, TEXTO); doc.text(S5.pct(g.porS.total), x + 3, y + 14.5);
      if (m) {
        fuente('bold', 6.5, '#FFFFFF');
        var tw = doc.getTextWidth(m) + 4;
        color('setFillColor', INF.MADUREZ[m]); doc.roundedRect(x + 3, y + 16.5, Math.min(tw, wk - 6), 4, 1.5, 1.5, 'F');
        doc.text(m, x + 5, y + 19.4);
      }
    });
    y += 28;

    /* ---- radar */
    titulo('Gráfico radar de puntaje por S');
    var anchoR = 128, altoR = anchoR * RH / RW;
    espacio(altoR + 4);
    doc.addImage(radar, 'PNG', M + (ANCHO - anchoR) / 2, y, anchoR, altoR);
    y += altoR + 4;

    /* ---- resultado por S (columnas = fechas) */
    titulo('Resultado por S');
    var wEt = 52, wF = (ANCHO - wEt) / n;
    var colsS = [{ t: 'S', w: wEt }].concat(grupos.map(function (g) { return { t: S5.fecha(g.fecha), w: wF, al: 'center' }; }));
    var filasS = [1, 2, 3, 4, 5].map(function (s) {
      return { celdas: [s + 'S · ' + S5.NOMBRES[s]].concat(grupos.map(function (g) { return S5.pct(g.porS[s]); })) };
    });
    filasS.push({ bold: true, celdas: ['Total (promedio PUNTAJE %)'].concat(grupos.map(function (g) { return S5.pct(g.porS.total); })) });
    filasS.push({
      celdas: ['Madurez'].concat(grupos.map(function (g) { return filaMadurez(g.porS.total).t; })),
      fills: [null].concat(grupos.map(function (g) { return filaMadurez(g.porS.total).fill; }))
    });
    tabla(colsS, filasS);
    espacio(8);
    fuente('normal', 7.5, GRIS);
    doc.text('Escala de madurez: EXCELENTE 90% a 100% · BIEN 75% a 89% · REGULAR 65% a 74% · CRÍTICO menos de 65%. % de cada S = suma de puntajes / (n° de ítems × 2).', M, y, { maxWidth: ANCHO });
    y += 9;

    /* ---- detalle por fecha */
    grupos.forEach(function (g) {
      titulo('Detalle del ' + S5.fecha(g.fecha) + ' (semana ' + g.semana + ')');
      var cols, filas;
      if (opc.area) {
        cols = [{ t: 'N°', w: 9, al: 'center' }, { t: 'Zona', w: 55 }].concat([1, 2, 3, 4, 5].map(function (s) { return { t: s + 'S', w: 14, al: 'center' }; }))
          .concat([{ t: 'Total', w: 20, al: 'center' }, { t: 'Madurez', w: 28, al: 'center' }]);
        filas = g.zonas.slice().sort(function (a, b) { return a.numero_zona - b.numero_zona; }).map(function (z) {
          var m = filaMadurez(z.total);
          return { celdas: [z.numero_zona, z.zona, S5.pct(z.p1), S5.pct(z.p2), S5.pct(z.p3), S5.pct(z.p4), S5.pct(z.p5), S5.pct(z.total), m.t], fills: [null, null, null, null, null, null, null, null, m.fill] };
        });
      } else {
        cols = [{ t: 'Área', w: 44 }, { t: 'N° aud.', w: 14, al: 'center' }, { t: 'Zonas', w: 12, al: 'center' }].concat([1, 2, 3, 4, 5].map(function (s) { return { t: s + 'S', w: 14, al: 'center' }; }))
          .concat([{ t: 'Total', w: 18, al: 'center' }, { t: 'Madurez', w: 24, al: 'center' }]);
        filas = g.lista.map(function (a) {
          var m = filaMadurez(a.porS.total);
          return { celdas: [a.area, a.numero_auditoria, a.zonas.length, S5.pct(a.porS[1]), S5.pct(a.porS[2]), S5.pct(a.porS[3]), S5.pct(a.porS[4]), S5.pct(a.porS[5]), S5.pct(a.porS.total), m.t], fills: [null, null, null, null, null, null, null, null, null, m.fill] };
        });
      }
      var mg = filaMadurez(g.porS.total);
      filas.push({ bold: true, celdas: ['Promedio'].concat(cols.slice(1).map(function (c, j) {
        var k = j + 1, idxS = opc.area ? k - 1 : k - 2;
        if (c.t === 'Total') return S5.pct(g.porS.total);
        if (c.t === 'Madurez') return mg.t;
        return idxS >= 1 && idxS <= 5 ? S5.pct(g.porS[idxS]) : '';
      })), fills: cols.map(function (c) { return c.t === 'Madurez' ? mg.fill : null; }) });
      tabla(cols, filas);

      var ids = g.lista.map(function (a) { return a.id; }), conteo = {}, totalObs = 0;
      (opc.obs || []).forEach(function (o) { if (ids.indexOf(o.auditoria_id) > -1) { conteo[o.estado] = (conteo[o.estado] || 0) + 1; totalObs++; } });
      espacio(8);
      fuente('normal', 8.5, TEXTO);
      doc.text('Observaciones registradas: ' + totalObs + (totalObs ? ' · ' + S5.ESTADOS.filter(function (e) { return conteo[e]; }).map(function (e) { return e + ' ' + conteo[e]; }).join(' · ') : ''), M, y);
      y += 9;
    });

    /* ---- pie en todas las páginas */
    var paginas = doc.internal.getNumberOfPages();
    for (var p = 1; p <= paginas; p++) {
      doc.setPage(p);
      color('setDrawColor', LINEA); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
      fuente('normal', 7.5, GRIS);
      doc.text('AgriTracer · Ingeniería de Procesos · Don Ricardo', M, H - 6.5);
      doc.text(cul.nombre + (opc.area ? ' · ' + opc.area.nombre : ''), W / 2, H - 6.5, { align: 'center' });
      doc.text('Página ' + p + ' de ' + paginas, W - M, H - 6.5, { align: 'right' });
    }
    return doc.output('blob');
  });
};

/* ------------------------------------------------------------ Excel de observaciones (formato manual) */
/** Notas de seguimiento por observación (el Excel manual las concatenaba con « // »). */
INF.notasDe = function (ids) {
  var mapa = {}, lotes = [];
  for (var i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));
  return Promise.all(lotes.map(function (lote) {
    return sb.from('s5_seguimientos').select('observacion_id,nota,fecha').in('observacion_id', lote).order('fecha').then(function (r) {
      if (r.error) throw new Error(r.error.message);
      (r.data || []).forEach(function (s) {
        if (!s.nota || s.nota === 'Registro inicial') return;
        (mapa[s.observacion_id] = mapa[s.observacion_id] || []).push(s.nota);
      });
    });
  })).then(function () { return mapa; });
};

/** Descarga una foto del bucket privado y la reduce para incrustarla en el Excel. */
INF.fotoParaExcel = function (ruta) {
  return sb.storage.from(FOTOS.BUCKET).download(ruta).then(function (r) {
    if (r.error || !r.data) return null;
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(r.data), img = new Image();
      img.onload = function () {
        var esc = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * esc));
        c.height = Math.max(1, Math.round(img.naturalHeight * esc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', 0.72), w: c.width, h: c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }).catch(function () { return null; });
};

INF.nombreHoja = function (texto, usados) {
  var base = String(texto).replace(/[\[\]:*?\/\\]/g, ' ').trim().substring(0, 31) || 'Hoja', nombre = base, k = 2;
  while (usados.indexOf(nombre.toLowerCase()) > -1) { nombre = base.substring(0, 28) + ' ' + k; k++; }
  usados.push(nombre.toLowerCase());
  return nombre;
};

/** opc: { cultivo, obs (ya filtradas), auds: {id: auditoría}, areaId, alProgreso(texto) } → Blob .xlsx */
INF.excelObservaciones = function (opc) {
  var progreso = opc.alProgreso || function () {};
  var ExcelJS, notas, bd;
  progreso('Preparando Excel…');
  return INF.excelJS().then(function (lib) {
    ExcelJS = lib;
    return Promise.all([
      INF.notasDe(opc.obs.map(function (o) { return o.id; })),
      AT.rpc('fn_s5_bd', { p_cultivo: opc.cultivo.id, p_area: opc.areaId ? Number(opc.areaId) : null })
    ]);
  }).then(function (r) {
    notas = r[0];
    bd = r[1] || [];
    var wb = new ExcelJS.Workbook();
    wb.creator = 'AgriTracer · Ingeniería de Procesos · Don Ricardo';
    wb.created = new Date();
    var usados = [], fotos = [], porArea = {};
    opc.obs.forEach(function (o) {
      var a = opc.auds[o.auditoria_id] || {};
      (porArea[a.area_id] = porArea[a.area_id] || []).push(o);
    });
    var areas = S5.areas.filter(function (a) { return porArea[a.id]; });
    var blanco = { argb: 'FFFFFFFF' }, fino = { style: 'thin', color: { argb: 'FF000000' } }, medio = { style: 'medium', color: { argb: 'FF000000' } };
    var relleno = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; };
    var fuenteCab = { name: 'Calibri', size: 12, bold: true, color: blanco };

    areas.forEach(function (area) {
      var lista = porArea[area.id].slice().sort(function (x, y) {
        return ((S5.zona(x.zona_id) || {}).numero || 0) - ((S5.zona(y.zona_id) || {}).numero || 0) || x.numero - y.numero;
      });
      var ws = wb.addWorksheet(INF.nombreHoja(areas.length === 1 ? 'Observaciones' : area.nombre, usados), {
        views: [{ state: 'frozen', ySplit: 2, showGridLines: false, zoomScale: 71 }],
        pageSetup: { paperSize: 9, orientation: 'portrait' }
      });
      ws.columns = [5.44, 8.55, 13.11, 13.11, 31.55, 32.55, 14.89, 14, 34.89, 34.89].map(function (w) { return { width: w }; });

      ws.mergeCells('I1:J1');
      var c1 = ws.getCell('I1');
      c1.value = 'Evidencia Fotográfica';
      c1.font = fuenteCab;
      c1.fill = relleno(INF.XL.cabecera);
      c1.alignment = { horizontal: 'center', vertical: 'middle' };
      c1.border = { top: fino, left: fino, bottom: fino, right: fino };
      ws.getRow(1).height = 20.85;

      var r2 = ws.getRow(2);
      ['N°', 'Semana', 'Fecha de Registro', 'Zona', 'Observaciones', 'Acción correctiva', 'Estado', 'Fecha de cierre', 'Antes', 'Después'].forEach(function (t, i) {
        var c = r2.getCell(i + 1);
        c.value = t;
        c.font = fuenteCab;
        c.fill = relleno(INF.XL.cabecera);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = { left: fino, right: fino };
      });
      r2.height = 34.35;

      lista.forEach(function (o, k) {
        var fila = ws.getRow(3 + k), zona = S5.zona(o.zona_id) || {};
        var accion = [o.accion_correctiva].concat(notas[o.id] || []).filter(Boolean).join(' // ');
        var valores = [o.numero, o.semana, INF.fechaExcel(o.fecha_registro), zona.nombre || '', o.descripcion, accion, o.estado, INF.fechaExcel(o.fecha_cierre), null, null];
        valores.forEach(function (v, i) {
          var c = fila.getCell(i + 1), al = { vertical: 'middle' }, b = {};
          c.value = v;
          c.font = { name: 'Roboto', size: 10, bold: i === 6 };
          c.fill = relleno(INF.XL.fila);
          if ([0, 1, 2, 3, 6, 7].indexOf(i) > -1) al.horizontal = 'center';
          if (i === 3 || i === 4 || i === 5) al.wrapText = true;
          c.alignment = al;
          if (i === 2 || i === 7) c.numFmt = 'dd/mm/yyyy';
          if (i === 0) b.left = medio;
          if (i === 9) b.right = medio;
          if (k === 0) b.top = medio;
          if (k === lista.length - 1) b.bottom = medio;
          c.border = b;
        });
        fila.height = 148.5;
        if (o.foto_antes) fotos.push({ ws: ws, ruta: o.foto_antes, col: 8, fila: 3 + k });
        if (o.foto_despues) fotos.push({ ws: ws, ruta: o.foto_despues, col: 9, fila: 3 + k });
      });

      var ultima = 2 + lista.length;
      ws.autoFilter = 'A2:J' + ultima;
      ws.addConditionalFormatting({
        ref: 'G3:G' + ultima,
        rules: INF.XL.estados.map(function (e, i) {
          var estilo = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: e[1] } } };
          if (e[2]) estilo.font = { color: { argb: e[2] } };
          return { type: 'containsText', operator: 'containsText', text: e[0], priority: i + 1, style: estilo };
        })
      });
    });

    var hechas = 0;
    if (fotos.length) progreso('Fotos 0 de ' + fotos.length + '…');
    return INF.enLotes(fotos, 4, function (t) {
      return INF.fotoParaExcel(t.ruta).then(function (img) {
        hechas++;
        progreso('Fotos ' + hechas + ' de ' + fotos.length + '…');
        if (!img) return;
        // Celda de foto ≈ 250 × 198 px (ancho 34.89, alto 148.5 pt): la imagen se centra con margen.
        var id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
        var esc = Math.min(236 / img.w, 186 / img.h), w = Math.round(img.w * esc), h = Math.round(img.h * esc);
        t.ws.addImage(id, { tl: { col: t.col + (250 - w) / 2 / 250, row: t.fila - 1 + (198 - h) / 2 / 198 }, ext: { width: w, height: h }, editAs: 'oneCell' });
      });
    }).then(function () {
      var audIds = {};
      Object.keys(opc.auds).forEach(function (k) { audIds[k] = true; });
      var filas = bd.filter(function (f) { return audIds[f.auditoria_id]; });
      var ws = wb.addWorksheet(INF.nombreHoja('BD', usados), { views: [{ state: 'frozen', ySplit: 1 }] });
      var titulos = ['FECHA', 'CAMPAÑA', 'PLANTA', 'SEMANA', 'N° AUDITORIA', 'TIPO AUDITORIA', 'ÁREA', 'N° ZONA', 'SUB ÁREA', 'ZONA', 'S', '1', '2', '3', '4', '5', '6', 'SUMA', 'PUNTAJE %'];
      var anchos = [12, 16, 18, 9, 13, 15, 22, 9, 28, 30, 6, 5, 5, 5, 5, 5, 5, 8, 11];
      ws.columns = titulos.map(function (t, i) { return { header: t, width: anchos[i] }; });
      ws.getRow(1).eachCell(function (c) {
        c.font = { name: 'Calibri', size: 11, bold: true, color: blanco };
        c.fill = relleno(INF.XL.cabecera);
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      filas.forEach(function (f) {
        var num = function (v) { return v === null || v === undefined ? null : Number(v); };
        ws.addRow([INF.fechaExcel(f.fecha), f.campana, f.planta, f.semana, f.numero_auditoria, f.tipo_auditoria, f.area, f.numero_zona, f.sub_area, f.zona, f.s,
          num(f.i1), num(f.i2), num(f.i3), num(f.i4), num(f.i5), num(f.i6), num(f.suma), num(f.puntaje)]);
      });
      ws.getColumn(1).numFmt = 'dd/mm/yyyy';
      ws.getColumn(19).numFmt = '0%';
      ws.autoFilter = 'A1:S' + Math.max(1, filas.length + 1);
      progreso('Guardando archivo…');
      return wb.xlsx.writeBuffer();
    });
  }).then(function (buffer) {
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  });
};
