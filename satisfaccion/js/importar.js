/* ============================================================================
 * importar.js — LECTURA DE LOS EXCEL DE SATISFACCIÓN DEL CLIENTE INTERNO
 * Sin DOM (se prueba en Node). Acepta dos formatos:
 *   · La encuesta «Encuesta NPS - <Área evaluada> - <Evaluador>.xlsx» (hoja ENCUESTA).
 *     Hay dos variantes (ítems en filas 16-25 o 17-26 cuando existe la fila Cargo):
 *     los ítems se ubican por el N° 1-10 de la columna D y la escala por los rótulos
 *     «Totalmente en desacuerdo … Totalmente de acuerdo», nunca por filas fijas.
 *   · La BD en formato largo que descarga la app (una fila por ítem), para subir
 *     un histórico ya consolidado.
 * La planta (PDC, PLM…) y la sub-área evaluadora (Limpieza, Packing…) no están
 * dentro del Excel: se sugieren desde el nombre del archivo y se corrigen en la vista previa.
 * ==========================================================================*/
(function (raiz) {
  var IMP = { LIB: '../reubicacion/vendor/xlsx.full.min.js' };

  /** Escala de la plantilla: puntaje (% del ítem) y texto. */
  IMP.ESCALA = [
    { v: 4, t: 'Totalmente en desacuerdo', clave: 'TOTALMENTEENDESACUERDO' },
    { v: 6.5, t: 'En desacuerdo', clave: 'ENDESACUERDO' },
    { v: 8.5, t: 'De acuerdo', clave: 'DEACUERDO' },
    { v: 10, t: 'Totalmente de acuerdo', clave: 'TOTALMENTEDEACUERDO' }
  ];
  /** Criterios y sus ítems (igual que sci_items). */
  IMP.CRITERIOS = [
    { id: 1, t: 'Atención y trato', corto: 'Atención y trato', items: [1, 2] },
    { id: 2, t: 'Tiempo de respuesta', corto: 'Tiempo de respuesta', items: [3, 4] },
    { id: 3, t: 'Comunicación', corto: 'Comunicación', items: [5, 6] },
    { id: 4, t: 'Calidad de servicio', corto: 'Calidad de servicio', items: [7, 8, 9, 10] }
  ];
  IMP.PLANTAS = ['PDC', 'PLM', 'PYA', 'PCCH'];
  IMP.SUB_AREAS = [
    { re: /^LIMP?IEZA$/, t: 'Limpieza' },
    { re: /^PACKING$/, t: 'Packing' },
    { re: /^PESADO$/, t: 'Pesado' },
    { re: /^ETIQUETADO$/, t: 'Etiquetado' }
  ];
  /** Nombres del Excel que no coinciden tal cual con el catálogo de áreas. */
  IMP.SINONIMOS = {
    'INGENIERIA DE PROCESOS': 'Ingeniería', 'INGENIERIA': 'Ingeniería',
    'PRODUCCION FRIO': 'Frío', 'AREA DE FRIO': 'Frío', 'FRIO': 'Frío',
    'MANEJO DE INFORMACION': 'Manejo de Información', 'SANITIZACION': 'Sanitización',
    'PRODUCCION': 'Producción'
  };

  IMP.norm = function (s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  };
  IMP.clave = function (s) { return IMP.norm(s).replace(/[^A-Z0-9]/g, ''); };
  IMP.texto = function (v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    return String(v).replace(/\s+/g, ' ').trim();
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /** Serial de Excel, Date o texto (dd/mm/aaaa · aaaa-mm-dd) → 'AAAA-MM-DD'. */
  IMP.aFecha = function (v) {
    var m;
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null;
      var d = new Date(Math.round((v - 25569) * 86400) * 1000);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    var s = String(v).trim();
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  };

  /** «Uva 2025-2026» → «Uva 2025 - 2026»; «Arandano 2026» → «Arándano 2026». */
  IMP.normalizarCampana = function (s) {
    var t = IMP.texto(s).replace(/\s*-\s*/g, ' - ');
    return t.replace(/^arandano/i, 'Arándano').replace(/^uva/i, 'Uva').replace(/^citrico/i, 'Cítrico');
  };

  /* ------------------------------------------------------------ cálculo */
  /** respuestas: [{item, puntaje}] → { total, criterios: {1..4: % 0-100 o null} }. */
  IMP.calcular = function (respuestas) {
    var mapa = {}, total = 0;
    (respuestas || []).forEach(function (r) { mapa[r.item] = Number(r.puntaje); total += Number(r.puntaje) || 0; });
    var criterios = {};
    IMP.CRITERIOS.forEach(function (c) {
      var suma = 0, n = 0;
      c.items.forEach(function (i) { if (mapa[i] !== undefined && !isNaN(mapa[i])) { suma += mapa[i]; n++; } });
      criterios[c.id] = n === c.items.length ? Math.round(suma / (n * 10) * 10000) / 100 : null;
    });
    return { total: Math.round(total * 100) / 100, criterios: criterios };
  };

  /* ------------------------------------------------------------ catálogos */
  /** Texto del Excel → área del catálogo ({id, nombre}) o null. */
  IMP.buscarArea = function (texto, areas) {
    var t = IMP.norm(texto).replace(/\(.*?\)/g, ' ');
    IMP.PLANTAS.forEach(function (p) { t = t.replace(new RegExp('\\b' + p + '\\b', 'g'), ' '); });
    t = t.replace(/\s*-\s*(ARANDANO|UVA|CITRICO)\b.*$/, '').replace(/^AREA DE\s+/, '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    // Nombre actual o uno anterior (alias): las áreas se pueden renombrar a su nombre legal en Config → Áreas.
    var porNombre = function (n) {
      var k = IMP.norm(n);
      return areas.filter(function (a) { return IMP.norm(a.nombre) === k; })[0] ||
        areas.filter(function (a) { return (a.alias || []).some(function (x) { return IMP.norm(x) === k; }); })[0] || null;
    };
    if (IMP.SINONIMOS[t] && porNombre(IMP.SINONIMOS[t])) return porNombre(IMP.SINONIMOS[t]);
    var exacta = porNombre(t);
    if (exacta) return exacta;
    var mejor = null;
    var largoMejor = 0;
    areas.forEach(function (a) {
      [a.nombre].concat(a.alias || []).forEach(function (nom) {
        var n = IMP.norm(nom);
        if (n && t.indexOf(n) > -1 && n.length > largoMejor) { mejor = a; largoMejor = n.length; }
      });
    });
    return mejor;
  };

  /** Cultivo por campaña y, si no, por la carpeta del archivo. */
  IMP.inferirCultivo = function (campana, ruta) {
    var t = IMP.norm(campana) + ' ';
    var d = IMP.norm(ruta);
    var de = function (s) { return /\bUVA\b/.test(s) ? 'Uva' : (/ARANDANO/.test(s) ? 'Arándano' : (/CITRIC/.test(s) ? 'Cítrico' : null)); };
    return de(t) || de(d);
  };

  /** Planta y sub-área sugeridas por el nombre del archivo. */
  IMP.inferirDelNombre = function (nombre, plantas) {
    var base = IMP.norm(String(nombre || '').replace(/\.[^.]+$/, '')).replace(/\(\d+\)/g, ' ');
    var codigos = (plantas && plantas.length ? plantas : IMP.PLANTAS);
    var planta = null;
    codigos.forEach(function (p) { if (!planta && new RegExp('\\b' + IMP.norm(p) + '\\b').test(base)) planta = p; });
    // El evaluador es el último tramo: «… - Limpieza PDC» o «… _ Producción Arandano».
    var tramos = base.split(/\s+-\s+|\s*_\s*/);
    var evaluador = tramos.length >= 3 || /_/.test(base) ? tramos[tramos.length - 1] : '';
    var sub = null;
    evaluador.split(/\s+/).forEach(function (w) {
      IMP.SUB_AREAS.forEach(function (s) { if (!sub && s.re.test(w)) sub = s.t; });
    });
    return { planta: planta, sub_area: sub };
  };

  /* ------------------------------------------------------------ lectura */
  var celda = function (m, r, c) { return m[r] ? m[r][c] : null; };
  var textoCelda = function (m, r, c) { return IMP.texto(celda(m, r, c)); };

  /** Primer valor no vacío a la derecha de una etiqueta. */
  var derecha = function (m, r, c) {
    var fila = m[r] || [];
    for (var j = c + 1; j < Math.min(fila.length, c + 12); j++) {
      if (fila[j] !== null && fila[j] !== undefined && String(fila[j]).trim() !== '') return fila[j];
    }
    return null;
  };

  /** Busca etiquetas del encabezado (primeras 20 filas). */
  var etiquetas = function (m) {
    var res = {};
    var mapa = { AREAAEVALUAR: 'area_evaluada', FECHA: 'fecha', CAMPANA: 'campana', AREAEVALUADORA: 'area_evaluadora',
      CARGO: 'cargo', RESULTADO: 'resultado', EVALUADOR: 'evaluador', NOMBRE: 'evaluador' };
    for (var r = 0; r < Math.min(m.length, 20); r++) {
      (m[r] || []).forEach(function (v, c) {
        var k = mapa[IMP.clave(v)];
        if (k && !(k in res)) res[k] = { r: r, c: c, v: derecha(m, r, c) };
      });
    }
    return res;
  };

  /** ¿La matriz es una hoja ENCUESTA? */
  IMP.esEncuesta = function (m) {
    for (var r = 0; r < Math.min(m.length, 6); r++) {
      if ((m[r] || []).some(function (v) { return /ENCUESTA DE SATISFACCION/.test(IMP.norm(v)); })) return true;
    }
    return false;
  };

  /** Columnas de la escala según los rótulos de la fila de encabezado de la tabla. */
  var columnasEscala = function (m) {
    for (var r = 0; r < Math.min(m.length, 40); r++) {
      var cols = {};
      (m[r] || []).forEach(function (v, c) {
        var k = IMP.clave(v);
        IMP.ESCALA.forEach(function (e) { if (k === e.clave && !(e.v in cols)) cols[e.v] = c; });
      });
      if (Object.keys(cols).length === 4) return { fila: r, cols: cols };
    }
    return null;
  };

  /** Hoja ENCUESTA → encuesta con respuestas, sugerencias, avisos y errores. */
  IMP.leerEncuesta = function (m, archivo, ruta) {
    var enc = { tipo: 'encuesta', archivo: archivo, ruta: ruta || archivo, avisos: [], errores: [], respuestas: [] };
    var et = etiquetas(m);
    var val = function (k) { return et[k] ? et[k].v : null; };
    enc.area_evaluada_txt = IMP.texto(val('area_evaluada'));
    enc.area_evaluadora_txt = IMP.texto(val('area_evaluadora'));
    enc.fecha = IMP.aFecha(val('fecha'));
    enc.campana = IMP.normalizarCampana(val('campana'));
    enc.cargo = IMP.texto(val('cargo'));
    enc.evaluador = et.evaluador && et.evaluador.r > 8 ? IMP.texto(val('evaluador')) : '';
    var l4 = val('resultado');
    enc.resultado_excel = typeof l4 === 'number' ? Math.round(l4 * 10000) / 100 : null;

    var esc = columnasEscala(m);
    if (!esc) {
      enc.errores.push('No se encontró la tabla de evaluación (Totalmente en desacuerdo … Totalmente de acuerdo).');
      return enc;
    }
    var vistos = {};
    for (var r = esc.fila + 1; r < Math.min(m.length, esc.fila + 30); r++) {
      var n = celda(m, r, 3);
      n = typeof n === 'number' ? n : Number(String(n === null || n === undefined ? '' : n).trim());
      if (!(n >= 1 && n <= 10 && Math.floor(n) === n) || vistos[n]) continue;
      if (!textoCelda(m, r, 4)) continue;
      vistos[n] = true;
      var marcas = IMP.ESCALA.filter(function (e) { return /^X$/i.test(IMP.texto(celda(m, r, esc.cols[e.v]))); });
      if (marcas.length === 1) enc.respuestas.push({ item: n, puntaje: marcas[0].v });
      else if (!marcas.length) enc.errores.push('Ítem ' + n + ' sin respuesta.');
      else enc.errores.push('Ítem ' + n + ' con ' + marcas.length + ' respuestas marcadas.');
    }
    for (var i = 1; i <= 10; i++) if (!vistos[i]) enc.errores.push('No se encontró el ítem ' + i + '.');

    // Sugerencias: el texto va debajo de cada pregunta, hasta la siguiente pregunta.
    var preguntas = [
      { k: 'aspectos_valorados', re: /VALORAS/ },
      { k: 'aspectos_mejorar', re: /DEBERIA MEJORAR/ },
      { k: 'recomendaciones', re: /SUGERENCIA ESPECIFICA/ }
    ];
    var filaPregunta = function (rr) {
      var t = IMP.norm((m[rr] || []).map(IMP.texto).join(' '));
      for (var q = 0; q < preguntas.length; q++) if (preguntas[q].re.test(t) && /\?/.test(t)) return preguntas[q];
      return null;
    };
    var actual = null;
    for (var s = esc.fila + 11; s < m.length; s++) {
      var p = filaPregunta(s);
      if (p) { actual = p; enc[p.k] = enc[p.k] || ''; continue; }
      if (!actual) continue;
      var texto = (m[s] || []).map(IMP.texto).filter(Boolean).join(' ').trim();
      if (texto) enc[actual.k] = (enc[actual.k] ? enc[actual.k] + ' ' : '') + texto;
    }
    preguntas.forEach(function (p) { enc[p.k] = (enc[p.k] || '').trim(); });

    var calc = IMP.calcular(enc.respuestas);
    enc.total = calc.total;
    enc.criterios = calc.criterios;
    if (!enc.errores.length && enc.resultado_excel !== null && Math.abs(enc.resultado_excel - enc.total) > 0.05) {
      enc.avisos.push('El resultado del Excel (' + enc.resultado_excel + ' %) no coincide con el calculado (' + enc.total + ' %).');
    }
    if (!enc.fecha) enc.errores.push('Falta la fecha de la encuesta.');
    if (!enc.area_evaluada_txt) enc.errores.push('Falta el área a evaluar.');
    if (!enc.area_evaluadora_txt) enc.errores.push('Falta el área evaluadora.');
    return enc;
  };

  /* ------------------------------------------------------------ BD en formato largo */
  IMP.COLUMNAS_BD = {
    SEMANA: 'semana', CAMPANA: 'campana', CULTIVO: 'cultivo', PLANTA: 'planta', FECHA: 'fecha',
    AREAEVALUADA: 'area_evaluada', AREAEVALUADORA: 'area_evaluadora', SUBAREA: 'sub_area', CARGO: 'cargo',
    EVALUADOR: 'evaluador', ITEM: 'item', ITEMS: 'item', RESPUESTA: 'respuesta', PUNTAJEITEM: 'puntaje',
    PUNTAJE: 'puntaje', CODIGO: 'codigo', ASPECTOSVALORADOS: 'aspectos_valorados',
    ASPECTOSPORMEJORAR: 'aspectos_mejorar', RECOMENDACIONES: 'recomendaciones'
  };

  IMP.esBD = function (m) { return IMP.cabeceraBD(m) !== null; };
  IMP.cabeceraBD = function (m) {
    for (var r = 0; r < Math.min(m.length, 5); r++) {
      var mapa = {};
      (m[r] || []).forEach(function (v, c) { var k = IMP.COLUMNAS_BD[IMP.clave(v)]; if (k && !(k in mapa)) mapa[k] = c; });
      if ('item' in mapa && 'area_evaluada' in mapa && 'area_evaluadora' in mapa && 'fecha' in mapa && ('respuesta' in mapa || 'puntaje' in mapa)) {
        return { fila: r, mapa: mapa };
      }
    }
    return null;
  };

  /** Una fila por ítem → encuestas agrupadas por código (o por evaluación si no hay código). */
  IMP.leerBD = function (m, archivo) {
    var cab = IMP.cabeceraBD(m), grupos = {}, orden = [];
    var porTexto = {};
    IMP.ESCALA.forEach(function (e) { porTexto[e.clave] = e.v; });
    for (var r = cab.fila + 1; r < m.length; r++) {
      var fila = m[r];
      if (!fila || !fila.some(function (v) { return v !== null && String(v).trim() !== ''; })) continue;
      var f = {};
      Object.keys(cab.mapa).forEach(function (k) { f[k] = fila[cab.mapa[k]]; });
      var fecha = IMP.aFecha(f.fecha);
      var llave = IMP.texto(f.codigo) || [IMP.texto(f.cultivo), IMP.texto(f.area_evaluada), IMP.texto(f.area_evaluadora),
        IMP.texto(f.sub_area), IMP.texto(f.planta), fecha].join('|');
      var g = grupos[llave];
      if (!g) {
        g = grupos[llave] = {
          tipo: 'encuesta', archivo: archivo + ' · ' + (IMP.texto(f.codigo) || 'fila ' + (r + 1)), ruta: archivo,
          avisos: [], errores: [], respuestas: [], fecha: fecha,
          campana: IMP.normalizarCampana(f.campana), cultivo_txt: IMP.texto(f.cultivo),
          area_evaluada_txt: IMP.texto(f.area_evaluada), area_evaluadora_txt: IMP.texto(f.area_evaluadora),
          sub_area: IMP.texto(f.sub_area) || null, planta: IMP.texto(f.planta).toUpperCase() || null,
          cargo: IMP.texto(f.cargo), evaluador: IMP.texto(f.evaluador),
          aspectos_valorados: IMP.texto(f.aspectos_valorados), aspectos_mejorar: IMP.texto(f.aspectos_mejorar),
          recomendaciones: IMP.texto(f.recomendaciones), desdeBD: true
        };
        orden.push(g);
        if (!fecha) g.errores.push('Fila ' + (r + 1) + ': fecha inválida.');
      }
      var item = Number(f.item), p = Number(f.puntaje);
      if (!isNaN(p) && p > 0 && p <= 0.1) p = Math.round(p * 1000) / 10;  // 0.085 → 8.5
      if ([4, 6.5, 8.5, 10].indexOf(p) < 0) p = porTexto[IMP.clave(f.respuesta)];
      if (!(item >= 1 && item <= 10) || p === undefined) { g.errores.push('Fila ' + (r + 1) + ': ítem o respuesta inválidos.'); continue; }
      if (g.respuestas.some(function (x) { return x.item === item; })) { g.errores.push('Ítem ' + item + ' repetido.'); continue; }
      g.respuestas.push({ item: item, puntaje: p });
    }
    orden.forEach(function (g) {
      g.respuestas.sort(function (a, b) { return a.item - b.item; });
      if (g.respuestas.length !== 10 && !g.errores.length) g.errores.push('Tiene ' + g.respuestas.length + ' de 10 ítems.');
      var calc = IMP.calcular(g.respuestas);
      g.total = calc.total;
      g.criterios = calc.criterios;
    });
    return orden;
  };

  /* ------------------------------------------------------------ libro completo */
  /**
   * Libro de SheetJS → lista de encuestas (1 por archivo de encuesta, o varias si es la BD).
   * ctx: { ruta, plantas: ['PDC', …] }.
   */
  IMP.leerLibro = function (XLSX, libro, archivo, ctx) {
    ctx = ctx || {};
    // La columna D debe ser el índice 3 aunque la hoja empiece en B2: se lee siempre desde A1.
    var matriz = function (n) {
      var hoja = libro.Sheets[n];
      if (!hoja || !hoja['!ref']) return [];
      var rango = XLSX.utils.decode_range(hoja['!ref']);
      rango.s.r = 0;
      rango.s.c = 0;
      return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null, range: rango });
    };
    var nombres = libro.SheetNames.slice();
    // Primero la hoja ENCUESTA; si no, cualquier hoja con el título de la encuesta; si no, una BD.
    nombres.sort(function (a, b) { return (IMP.clave(b) === 'ENCUESTA') - (IMP.clave(a) === 'ENCUESTA'); });
    for (var i = 0; i < nombres.length; i++) {
      var m = matriz(nombres[i]);
      if (IMP.esEncuesta(m)) {
        var enc = IMP.leerEncuesta(m, archivo, ctx.ruta);
        var inf = IMP.inferirDelNombre(archivo, ctx.plantas);
        enc.planta = inf.planta;
        enc.sub_area = inf.sub_area;
        enc.cultivo_txt = IMP.inferirCultivo(enc.campana, ctx.ruta || archivo);
        return [enc];
      }
    }
    for (var j = 0; j < nombres.length; j++) {
      var mb = matriz(nombres[j]);
      if (IMP.esBD(mb)) return IMP.leerBD(mb, archivo);
    }
    throw new Error('«' + archivo + '» no tiene la hoja ENCUESTA ni una BD de satisfacción. Hojas: ' + libro.SheetNames.join(', ') + '.');
  };

  /**
   * Huella del contenido para detectar el mismo Excel copiado en dos carpetas (p. ej. Despacho en
   * Arándano y en Uva). No usa las sugerencias: las copias suelen diferir solo en una errata.
   */
  IMP.huella = function (enc) {
    return [IMP.norm(enc.area_evaluada_txt), IMP.norm(enc.area_evaluadora_txt), enc.fecha, enc.planta || '', enc.sub_area || '',
      enc.respuestas.map(function (r) { return r.item + ':' + r.puntaje; }).join(',')].join('|');
  };

  raiz.IMP_SCI = IMP;
  if (typeof module !== 'undefined' && module.exports) module.exports = IMP;
})(typeof window !== 'undefined' ? window : globalThis);
