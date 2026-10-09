/* ============================================================================
 * xl-dibujos.js — FOTOS Y FIGURAS DE UN EXCEL (.xlsx)
 * Lee las imágenes de cada hoja directamente del dibujo del archivo (xl/drawings):
 * flotantes, agrupadas, recortadas y las «imagen en celda» de Excel 365. Las figuras
 * que se dibujan encima en Excel (flechas, círculos, rectángulos, líneas, llamadas,
 * cuadros de texto, trazos a mano o una imagen pegada encima) se pintan sobre la foto
 * que tienen debajo, para que no se pierdan al subirla a la app.
 *
 * XLD.fotos(buf) → { 'Hoja': { 'fila|col': [Foto] } } (fila y col de la esquina
 * superior izquierda, desde 1). Foto = { blob, final, editada, figuras }:
 *   blob  → la imagen tal como está guardada (para reconocerla por huella),
 *   final → la que se sube: con recorte y figuras aplicados (o la misma blob).
 * ==========================================================================*/
var XLD = { LADO_MAX: 2400 };

/* ------------------------------------------------------------ XML */
XLD.hijos = function (el, nombre) {
  return el ? Array.prototype.filter.call(el.children, function (c) { return !nombre || c.localName === nombre; }) : [];
};
XLD.hijo = function (el, nombre) { return XLD.hijos(el, nombre)[0] || null; };
XLD.num = function (el, attr, def) {
  var v = el ? el.getAttribute(attr) : null;
  return v === null || v === '' || isNaN(Number(v)) ? def : Number(v);
};
XLD.attrR = function (el, nombre) {
  return el ? (el.getAttribute('r:' + nombre) || el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', nombre)) : null;
};

/* ------------------------------------------------------------ colores */
XLD.TEMA = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5',
  accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
XLD.PRESET = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', lime: '00FF00', blue: '0000FF', yellow: 'FFFF00',
  orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080', darkRed: '8B0000', darkBlue: '00008B', darkGreen: '006400' };

XLD.tema = function (doc) {
  var t = Object.assign({}, XLD.TEMA), cs = AV.porNombre(doc, 'clrScheme')[0];
  XLD.hijos(cs).forEach(function (c) {
    var v = c.firstElementChild;
    if (v) t[c.localName] = v.getAttribute('lastClr') || v.getAttribute('val') || t[c.localName];
  });
  t.tx1 = t.dk1; t.bg1 = t.lt1; t.tx2 = t.dk2; t.bg2 = t.lt2;
  return t;
};

XLD.hsl = function (r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    h /= 6;
  }
  return [h, s, l];
};
XLD.rgb = function (h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  var f = function (t) {
    t = t < 0 ? t + 1 : (t > 1 ? t - 1 : t);
    return t < 1 / 6 ? p + (q - p) * 6 * t : (t < 1 / 2 ? q : (t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p));
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};

/** Color de un contenedor (solidFill, fillRef, lnRef…) → 'rgba(…)' o null. */
XLD.color = function (cont, tema) {
  var c = XLD.hijos(cont).filter(function (x) { return /Clr$/.test(x.localName); })[0];
  if (!c) return null;
  var hex = null, v = c.getAttribute('val');
  if (c.localName === 'srgbClr') hex = v;
  else if (c.localName === 'schemeClr') hex = tema[v] || '000000';
  else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000');
  else if (c.localName === 'prstClr') hex = XLD.PRESET[v] || '000000';
  else if (c.localName === 'scrgbClr') {
    hex = ['r', 'g', 'b'].map(function (k) { return ('0' + Math.round(XLD.num(c, k, 0) / 100000 * 255).toString(16)).slice(-2); }).join('');
  }
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  var rgb = [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)], a = 1;
  XLD.hijos(c).forEach(function (m) {
    var k = XLD.num(m, 'val', 100000) / 100000, h;
    if (m.localName === 'alpha') a = k;
    else if (m.localName === 'lumMod' || m.localName === 'lumOff') {
      h = XLD.hsl(rgb[0], rgb[1], rgb[2]);
      h[2] = Math.max(0, Math.min(1, m.localName === 'lumMod' ? h[2] * k : h[2] + k));
      rgb = XLD.rgb(h[0], h[1], h[2]);
    } else if (m.localName === 'shade') rgb = rgb.map(function (x) { return x * k; });
    else if (m.localName === 'tint') rgb = rgb.map(function (x) { return x + (255 - x) * (1 - k); });
  });
  return 'rgba(' + rgb.map(function (x) { return Math.round(Math.max(0, Math.min(255, x))); }).join(',') + ',' + a + ')';
};

/** Relleno, contorno y texto de una figura: spPr manda; si no, el estilo (fillRef, lnRef, fontRef). */
XLD.estilo = function (sp, tema, esLinea) {
  var pr = XLD.hijo(sp, 'spPr'), st = XLD.hijo(sp, 'style');
  var ref = function (nombre) {
    var r = XLD.hijo(st, nombre);
    return r && r.getAttribute('idx') !== '0' ? XLD.color(r, tema) : null;
  };
  var relleno = function (el) {
    var f = XLD.hijos(el).filter(function (x) { return /^(noFill|solidFill|gradFill|pattFill|blipFill)$/.test(x.localName); })[0];
    if (!f) return undefined;
    if (f.localName === 'solidFill') return XLD.color(f, tema);
    if (f.localName === 'gradFill') { var gs = AV.porNombre(f, 'gs')[0]; return gs ? XLD.color(gs, tema) : null; }
    if (f.localName === 'pattFill') return XLD.color(XLD.hijo(f, 'fgClr'), tema);
    return null;
  };
  var fondo = esLinea ? null : relleno(pr);
  if (fondo === undefined) fondo = ref('fillRef');
  var ln = XLD.hijo(pr, 'ln'), trazo = relleno(ln);
  if (trazo === undefined) trazo = ref('lnRef');
  var punta = function (nombre) {
    var e = XLD.hijo(ln, nombre), t = e && e.getAttribute('type');
    return t && t !== 'none' ? { tipo: t, w: e.getAttribute('w') || 'med', len: e.getAttribute('len') || 'med' } : null;
  };
  var dash = XLD.hijo(ln, 'prstDash');
  return { fondo: fondo, trazo: trazo, ancho: XLD.num(ln, 'w', 9525), guion: dash ? dash.getAttribute('val') : 'solid',
    inicio: punta('headEnd'), fin: punta('tailEnd'), texto: ref('fontRef') };
};

/* ------------------------------------------------------------ geometría de la hoja (EMU) */
XLD.pxAncho = function (w) { return Math.floor(((256 * w + Math.floor(128 / 7)) / 256) * 7); };
XLD.hoja = function (doc) {
  var fmt = AV.porNombre(doc, 'sheetFormatPr')[0];
  var defCol = XLD.pxAncho(XLD.num(fmt, 'defaultColWidth', XLD.num(fmt, 'baseColWidth', 8) + 1.140625)) * 9525;
  var defFila = XLD.num(fmt, 'defaultRowHeight', 15) * 12700;
  var cols = {}, filas = {};
  AV.porNombre(doc, 'col').forEach(function (c) {
    var w = c.getAttribute('hidden') === '1' ? 0 : XLD.pxAncho(XLD.num(c, 'width', 8.43)) * 9525;
    for (var i = XLD.num(c, 'min', 1); i <= Math.min(XLD.num(c, 'max', 1), 16384); i++) cols[i - 1] = w;
  });
  AV.porNombre(doc, 'row').forEach(function (r) {
    var ht = r.getAttribute('hidden') === '1' ? 0 : (r.getAttribute('ht') ? XLD.num(r, 'ht', 15) * 12700 : null);
    if (ht !== null) filas[XLD.num(r, 'r', 1) - 1] = ht;
  });
  var acumulado = function (tam, def) {
    var pre = [0];
    var hasta = function (n) { while (pre.length <= n) { var k = pre.length - 1; pre.push(pre[k] + (tam[k] !== undefined ? tam[k] : def)); } return pre[n]; };
    var indice = function (pos) {
      var n = 0;
      while (n < 1048575 && hasta(n + 1) <= pos) n++;
      return n;
    };
    return { pos: hasta, indice: indice };
  };
  return { col: acumulado(cols, defCol), fila: acumulado(filas, defFila) };
};

XLD.rectAncla = function (an, g) {
  var n = function (el, nombre) { var v = Number((XLD.hijo(el, nombre) || {}).textContent || 0); return isNaN(v) ? 0 : v; };
  var punto = function (el) {
    return { x: g.col.pos(Math.max(0, n(el, 'col'))) + n(el, 'colOff'), y: g.fila.pos(Math.max(0, n(el, 'row'))) + n(el, 'rowOff') };
  };
  var ext = XLD.hijo(an, 'ext'), desde;
  if (an.localName === 'twoCellAnchor') {
    var a = punto(XLD.hijo(an, 'from')), b = punto(XLD.hijo(an, 'to'));
    return { x: a.x, y: a.y, w: Math.max(0, b.x - a.x), h: Math.max(0, b.y - a.y) };
  }
  desde = an.localName === 'oneCellAnchor' ? punto(XLD.hijo(an, 'from')) : { x: XLD.num(XLD.hijo(an, 'pos'), 'x', 0), y: XLD.num(XLD.hijo(an, 'pos'), 'y', 0) };
  return { x: desde.x, y: desde.y, w: XLD.num(ext, 'cx', 0), h: XLD.num(ext, 'cy', 0) };
};

/* ------------------------------------------------------------ recorrido del dibujo */
XLD.xfrm = function (el) {
  var pr = XLD.hijo(el, 'spPr') || XLD.hijo(el, 'grpSpPr');
  return XLD.hijo(pr, 'xfrm');
};

/** Elementos (fotos y figuras) de un dibujo, con su rectángulo absoluto en EMU y en orden de dibujo. */
XLD.elementos = function (doc, g, rels, tema) {
  var lista = [];
  // mc:AlternateContent → su contenido (la tinta de «Dibujar» no se puede leer: se usa su imagen de respaldo).
  var resolver = function (el) {
    if (el.localName !== 'AlternateContent') return [el];
    var eleccion = XLD.hijo(el, 'Choice');
    var usar = eleccion && !AV.porNombre(eleccion, 'contentPart').length ? eleccion : XLD.hijo(el, 'Fallback');
    return XLD.hijos(usar).reduce(function (t, c) { return t.concat(resolver(c)); }, []);
  };
  var agregar = function (el, R) {
    var nombre = el.localName, xf = XLD.xfrm(el);
    var base = { rect: R, tema: tema, rot: XLD.num(xf, 'rot', 0) / 60000, flipH: !!(xf && xf.getAttribute('flipH') === '1'), flipV: !!(xf && xf.getAttribute('flipV') === '1'), el: el };
    if (nombre === 'grpSp') {
      var off = XLD.hijo(xf, 'off'), chOff = XLD.hijo(xf, 'chOff'), chExt = XLD.hijo(xf, 'chExt');
      var cx = XLD.num(chExt, 'cx', 0), cy = XLD.num(chExt, 'cy', 0);
      var ox = XLD.num(chOff, 'x', XLD.num(off, 'x', 0)), oy = XLD.num(chOff, 'y', XLD.num(off, 'y', 0));
      XLD.hijos(el).reduce(function (t, c) { return t.concat(resolver(c)); }, []).forEach(function (c) {
        if (!/^(pic|sp|cxnSp|grpSp)$/.test(c.localName)) return;
        var cxf = XLD.xfrm(c), co = XLD.hijo(cxf, 'off'), ce = XLD.hijo(cxf, 'ext');
        if (!co || !ce || !cx || !cy) { agregar(c, R); return; }
        var sx = R.w / cx, sy = R.h / cy;
        agregar(c, { x: R.x + (XLD.num(co, 'x', 0) - ox) * sx, y: R.y + (XLD.num(co, 'y', 0) - oy) * sy, w: XLD.num(ce, 'cx', 0) * sx, h: XLD.num(ce, 'cy', 0) * sy });
      });
      return;
    }
    if (nombre === 'pic') {
      var blip = AV.porNombre(el, 'blip')[0], media = rels[XLD.attrR(blip, 'embed')];
      if (!media) return;
      var src = AV.porNombre(XLD.hijo(el, 'blipFill'), 'srcRect')[0];
      base.tipo = 'foto';
      base.media = media;
      base.recorte = { l: XLD.num(src, 'l', 0) / 100000, t: XLD.num(src, 't', 0) / 100000, r: XLD.num(src, 'r', 0) / 100000, b: XLD.num(src, 'b', 0) / 100000 };
      lista.push(base);
      return;
    }
    if (nombre === 'sp' || nombre === 'cxnSp') {
      var geo = AV.porNombre(XLD.hijo(el, 'spPr'), 'prstGeom')[0], cust = AV.porNombre(XLD.hijo(el, 'spPr'), 'custGeom')[0];
      base.tipo = 'figura';
      base.prst = geo ? geo.getAttribute('prst') : (cust ? 'cust' : 'rect');
      base.ajustes = {};
      AV.porNombre(geo, 'gd').forEach(function (gd) {
        var m = String(gd.getAttribute('fmla') || '').match(/^val\s+(-?\d+)/);
        if (m) base.ajustes[gd.getAttribute('name')] = Number(m[1]);
      });
      base.cust = cust;
      base.ext = XLD.hijo(xf, 'ext');
      base.linea = nombre === 'cxnSp' || /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(base.prst);
      base.estilo = XLD.estilo(el, tema, base.linea);
      base.txt = XLD.hijo(el, 'txBody');
      lista.push(base);
    }
  };
  XLD.hijos(doc.documentElement).forEach(function (an) {
    if (!/Anchor$/.test(an.localName)) return;
    var R = XLD.rectAncla(an, g);
    XLD.hijos(an).reduce(function (t, c) { return t.concat(resolver(c)); }, []).forEach(function (c) {
      if (/^(pic|sp|cxnSp|grpSp)$/.test(c.localName)) agregar(c, R);
    });
  });
  return lista;
};

/* ------------------------------------------------------------ lectura del libro */
XLD.fotos = function (buf) {
  var z = AV.zip(buf), salida = {};
  return Promise.all([
    z.xml('xl/workbook.xml'), z.xml('xl/_rels/workbook.xml.rels'), z.xml('xl/theme/theme1.xml'), AV.imagenesEnCelda(buf)
  ]).then(function (d) {
    var relLibro = AV.relaciones(d[1], 'xl/'), tema = d[2] ? XLD.tema(d[2]) : Object.assign({}, XLD.TEMA), enCelda = d[3];
    return Promise.all(AV.porNombre(d[0], 'sheet').map(function (h) {
      var nombre = h.getAttribute('name'), ruta = relLibro[XLD.attrR(h, 'id')];
      if (!ruta) return null;
      var dir = ruta.replace(/[^\/]+$/, ''), relRuta = dir + '_rels/' + ruta.split('/').pop() + '.rels';
      return Promise.all([z.xml(ruta), z.xml(relRuta)]).then(function (s) {
        if (!s[0]) return;
        var g = XLD.hoja(s[0]), relHoja = AV.relaciones(s[1], dir);
        var dib = AV.porNombre(s[0], 'drawing')[0], rutaDib = dib ? relHoja[XLD.attrR(dib, 'id')] : null;
        var celdas = enCelda[nombre] || {};
        var cargarDibujo = rutaDib ? Promise.all([z.xml(rutaDib), z.xml(rutaDib.replace(/[^\/]+$/, '') + '_rels/' + rutaDib.split('/').pop() + '.rels')]) : Promise.resolve([null, null]);
        return cargarDibujo.then(function (dd) {
          var elems = dd[0] ? XLD.elementos(dd[0], g, AV.relaciones(dd[1], rutaDib.replace(/[^\/]+$/, '')), tema) : [];
          // Las «imagen en celda» ocupan su celda; las figuras encima también se les pintan.
          Object.keys(celdas).forEach(function (clave) {
            var p = clave.split('|').map(Number), x = g.col.pos(p[1] - 1), y = g.fila.pos(p[0] - 1);
            celdas[clave].forEach(function (blob) {
              elems.unshift({ tipo: 'foto', enCelda: true, blob: blob, rect: { x: x, y: y, w: g.col.pos(p[1]) - x, h: g.fila.pos(p[0]) - y }, recorte: { l: 0, t: 0, r: 0, b: 0 } });
            });
          });
          return XLD.armar(elems, g, z).then(function (fotos) { if (fotos.length) salida[nombre] = XLD.porCelda(fotos, g); });
        });
      });
    }));
  }).then(function () { return salida; });
};

XLD.area = function (r) { return Math.max(0, r.w) * Math.max(0, r.h); };
XLD.cruce = function (a, b) {
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
XLD.contiene = function (r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };

/** Reparte las figuras sobre las fotos que tienen debajo y arma cada Foto. */
XLD.armar = function (elems, g, z) {
  var fotos = elems.filter(function (e) { return e.tipo === 'foto'; });
  // Una imagen pequeña pegada encima de una foto más grande es una figura más (sticker, flecha en PNG…).
  var base = fotos.filter(function (p) {
    return !fotos.some(function (q) { return q !== p && !p.enCelda && XLD.area(q.rect) > XLD.area(p.rect) * 1.5 && XLD.cruce(p.rect, q.rect) >= XLD.area(p.rect) * 0.9; });
  });
  base.forEach(function (p) { p.encima = []; });
  // Si hay fotos encimadas (p. ej. una que quedó al borrar una fila), la figura va con la que se ve
  // arriba: la última dibujada antes que ella.
  var orden = function (p) { return elems.indexOf(p); };
  elems.forEach(function (e, ie) {
    if (base.indexOf(e) > -1) return;
    var r = e.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var debajo = base.filter(function (p) { return XLD.contiene(p.rect, cx, cy); })
      .sort(function (a, b) { return (orden(a) < ie) - (orden(b) < ie) || orden(a) - orden(b); }).pop();
    if (!debajo) {
      var caja = { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 };
      debajo = base.map(function (p) { return { p: p, c: XLD.cruce(caja, p.rect) }; }).filter(function (x) { return x.c > 0; })
        .sort(function (a, b) { return b.c - a.c; }).map(function (x) { return x.p; })[0];
    }
    if (debajo) debajo.encima.push(e);
  });
  return Promise.all(base.map(function (p) {
    var leer = p.blob ? Promise.resolve(p.blob) : z.leer(p.media).then(function (b) { return b ? new Blob([b], { type: AV.mime(p.media.split('.').pop()) }) : null; });
    return leer.then(function (blob) {
      if (!blob) return null;
      p.blob = blob;
      var rc = p.recorte, recortada = rc.l + rc.t + rc.r + rc.b > 0.001;
      if (!p.encima.length && !recortada) return { blob: blob, final: blob, editada: false, figuras: 0, p: p };
      return Promise.all(p.encima.filter(function (e) { return e.tipo === 'foto'; }).map(function (e) {
        return z.leer(e.media).then(function (b) { e.blob = b ? new Blob([b], { type: AV.mime(e.media.split('.').pop()) }) : null; });
      })).then(function () {
        return XLD.componer(p);
      }).then(function (final) {
        return { blob: blob, final: final || blob, editada: !!final, figuras: p.encima.length, p: p };
      });
    });
  })).then(function (r) { return r.filter(Boolean); });
};

XLD.porCelda = function (fotos, g) {
  var salida = {};
  fotos.sort(function (a, b) { return a.p.rect.y - b.p.rect.y || a.p.rect.x - b.p.rect.x; }).forEach(function (f) {
    var r = f.p.rect, clave = (g.fila.indice(r.y + 1) + 1) + '|' + (g.col.indice(r.x + 1) + 1);
    delete f.p;
    (salida[clave] = salida[clave] || []).push(f);
  });
  return salida;
};

/* ------------------------------------------------------------ pintar foto + figuras */
XLD.imagen = function (blob) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(blob), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
};

/** Foto recortada y con sus figuras → Blob JPEG (null si el navegador no puede leerla). */
XLD.componer = function (p) {
  return Promise.all([XLD.imagen(p.blob)].concat(p.encima.map(function (e) { return e.blob ? XLD.imagen(e.blob) : null; }))).then(function (imgs) {
    var img = imgs[0];
    if (!img || !img.naturalWidth) return null;
    var rc = p.recorte, nw = img.naturalWidth, nh = img.naturalHeight;
    var sx = rc.l * nw, sy = rc.t * nh, sw = Math.max(1, nw * (1 - rc.l - rc.r)), sh = Math.max(1, nh * (1 - rc.t - rc.b));
    var R = p.rect;
    if (p.enCelda) { // Excel la encaja en la celda sin deformarla
      var e = Math.min(R.w / sw, R.h / sh);
      R = { x: R.x + (R.w - sw * e) / 2, y: R.y + (R.h - sh * e) / 2, w: sw * e, h: sh * e };
    }
    if (!R.w || !R.h) return null;
    var k = Math.min(sw / R.w, sh / R.h);
    if (Math.max(R.w, R.h) * k > XLD.LADO_MAX) k = XLD.LADO_MAX / Math.max(R.w, R.h);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(R.w * k));
    c.height = Math.max(1, Math.round(R.h * k));
    var g = c.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    p.encima.forEach(function (e, i) {
      g.save();
      try { XLD.pintar(g, e, imgs[i + 1], R, k); } catch (err) { /* una figura rara no debe impedir la foto */ }
      g.restore();
    });
    return new Promise(function (resolve) { c.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.9); });
  });
};

XLD.GUIONES = { dash: [4, 3], sysDash: [3, 1], dot: [1, 1], sysDot: [1, 1], dashDot: [4, 3, 1, 3], lgDash: [8, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1] };

XLD.pintar = function (g, e, img, R, k) {
  var x = (e.rect.x - R.x) * k, y = (e.rect.y - R.y) * k, w = e.rect.w * k, h = e.rect.h * k;
  if (e.tipo === 'foto') {
    if (!img) return;
    var rc = e.recorte, nw = img.naturalWidth, nh = img.naturalHeight;
    g.drawImage(img, rc.l * nw, rc.t * nh, Math.max(1, nw * (1 - rc.l - rc.r)), Math.max(1, nh * (1 - rc.t - rc.b)), x, y, w, h);
    return;
  }
  var st = e.estilo, grosor = Math.max(1, st.ancho * k);
  g.lineWidth = grosor;
  g.lineJoin = 'round';
  g.lineCap = st.guion === 'solid' ? 'round' : 'butt';
  if (XLD.GUIONES[st.guion]) g.setLineDash(XLD.GUIONES[st.guion].map(function (v) { return v * grosor; }));
  g.strokeStyle = st.trazo || 'rgba(0,0,0,0)';
  g.fillStyle = st.fondo || 'rgba(0,0,0,0)';

  if (e.linea) {
    var cx = x + w / 2, cy = y + h / 2, a = e.rot * Math.PI / 180;
    var gira = function (px, py) { return [cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a)]; };
    var p1 = gira(e.flipH ? x + w : x, e.flipV ? y + h : y), p2 = gira(e.flipH ? x : x + w, e.flipV ? y : y + h);
    if (!st.trazo) return;
    g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
    g.setLineDash([]);
    if (st.inicio) XLD.punta(g, p2, p1, st.inicio, grosor, st.trazo);
    if (st.fin) XLD.punta(g, p1, p2, st.fin, grosor, st.trazo);
    return;
  }

  g.translate(x + w / 2, y + h / 2);
  if (e.rot) g.rotate(e.rot * Math.PI / 180);
  g.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  g.translate(-w / 2, -h / 2);
  var conocida = XLD.trazar(g, e, w, h, k);
  if (conocida) {
    if (st.fondo) g.fill();
    if (st.trazo) g.stroke();
  } else if (st.trazo || st.fondo) { // forma que no se reconoce: su contorno, sin tapar la foto
    g.beginPath(); g.rect(0, 0, w, h);
    g.strokeStyle = st.trazo || st.fondo;
    g.stroke();
  }
  g.setLineDash([]);
  if (e.flipH || e.flipV) { g.translate(w / 2, h / 2); g.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1); g.translate(-w / 2, -h / 2); }
  if (e.txt) XLD.texto(g, e, w, h, k);
};

XLD.punta = function (g, desde, hasta, punta, grosor, color) {
  var tam = { sm: 2, med: 3, lg: 5 }, largo = (tam[punta.len] || 3) * grosor, ancho = (tam[punta.w] || 3) * grosor / 2;
  var a = Math.atan2(hasta[1] - desde[1], hasta[0] - desde[0]), cos = Math.cos(a), sin = Math.sin(a);
  var px = function (l, t) { return [hasta[0] - cos * l - sin * t, hasta[1] - sin * l + cos * t]; };
  g.fillStyle = color; g.strokeStyle = color;
  g.beginPath();
  if (punta.tipo === 'oval') { g.ellipse(hasta[0], hasta[1], largo / 2, ancho, a, 0, Math.PI * 2); g.fill(); return; }
  var b1 = px(largo, ancho), b2 = px(largo, -ancho);
  if (punta.tipo === 'arrow') { g.moveTo(b1[0], b1[1]); g.lineTo(hasta[0], hasta[1]); g.lineTo(b2[0], b2[1]); g.stroke(); return; }
  g.moveTo(hasta[0], hasta[1]); g.lineTo(b1[0], b1[1]);
  if (punta.tipo === 'stealth') { var m = px(largo * 0.6, 0); g.lineTo(m[0], m[1]); }
  if (punta.tipo === 'diamond') { var d = px(largo * 2, 0); g.lineTo(d[0], d[1]); }
  g.lineTo(b2[0], b2[1]); g.closePath(); g.fill();
};

/** Arma el trazo de la figura en coordenadas locales (0..w, 0..h). false si no se conoce la forma. */
XLD.trazar = function (g, e, w, h, k) {
  var aj = function (n, def) { return e.ajustes[n] !== undefined ? e.ajustes[n] / 100000 : def; };
  var ss = Math.min(w, h), poli = function (pts) { g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(function (p) { g.lineTo(p[0], p[1]); }); g.closePath(); };
  g.beginPath();
  switch (e.prst) {
    case 'rect': case 'flowChartProcess': case 'snip1Rect': case 'frame':
      g.rect(0, 0, w, h); return true;
    case 'roundRect': case 'flowChartAlternateProcess':
      var r = ss * aj('adj', 0.16667);
      if (g.roundRect) g.roundRect(0, 0, w, h, r); else g.rect(0, 0, w, h);
      return true;
    case 'ellipse': case 'flowChartConnector': case 'donut':
      g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return true;
    case 'triangle': case 'flowChartExtract':
      var t = w * aj('adj', 0.5); poli([[t, 0], [w, h], [0, h]]); return true;
    case 'rtTriangle': poli([[0, 0], [w, h], [0, h]]); return true;
    case 'diamond': case 'flowChartDecision': poli([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); return true;
    case 'parallelogram': var o = ss * aj('adj', 0.25); poli([[o, 0], [w, 0], [w - o, h], [0, h]]); return true;
    case 'trapezoid': var q = ss * aj('adj', 0.25); poli([[q, 0], [w - q, 0], [w, h], [0, h]]); return true;
    case 'pentagon': case 'homePlate': var hp = ss * aj('adj', 0.5); poli([[0, 0], [w - hp, 0], [w, h / 2], [w - hp, h], [0, h]]); return true;
    case 'chevron': var ch = ss * aj('adj', 0.5); poli([[0, 0], [w - ch, 0], [w, h / 2], [w - ch, h], [0, h], [ch, h / 2]]); return true;
    case 'plus': case 'mathPlus':
      var pc = ss * aj('adj', 0.25);
      poli([[pc, 0], [w - pc, 0], [w - pc, pc], [w, pc], [w, h - pc], [w - pc, h - pc], [w - pc, h], [pc, h], [pc, h - pc], [0, h - pc], [0, pc], [pc, pc]]);
      return true;
    case 'rightArrow': case 'leftArrow':
      var a1 = h * aj('adj1', 0.5), cab = w - ss * aj('adj2', 0.5), y1 = (h - a1) / 2, y2 = (h + a1) / 2;
      var pts = [[0, y1], [cab, y1], [cab, 0], [w, h / 2], [cab, h], [cab, y2], [0, y2]];
      poli(e.prst === 'leftArrow' ? pts.map(function (p) { return [w - p[0], p[1]]; }) : pts);
      return true;
    case 'downArrow': case 'upArrow':
      var b1 = w * aj('adj1', 0.5), cb = h - ss * aj('adj2', 0.5), x1 = (w - b1) / 2, x2 = (w + b1) / 2;
      var pv = [[x1, 0], [x2, 0], [x2, cb], [w, cb], [w / 2, h], [0, cb], [x1, cb]];
      poli(e.prst === 'upArrow' ? pv.map(function (p) { return [p[0], h - p[1]]; }) : pv);
      return true;
    case 'leftRightArrow':
      var lr = h * aj('adj1', 0.5), lc = ss * aj('adj2', 0.5);
      poli([[0, h / 2], [lc, 0], [lc, (h - lr) / 2], [w - lc, (h - lr) / 2], [w - lc, 0], [w, h / 2], [w - lc, h], [w - lc, (h + lr) / 2], [lc, (h + lr) / 2], [lc, h]]);
      return true;
    case 'upDownArrow':
      var ud = w * aj('adj1', 0.5), uc = ss * aj('adj2', 0.5);
      poli([[w / 2, 0], [w, uc], [(w + ud) / 2, uc], [(w + ud) / 2, h - uc], [w, h - uc], [w / 2, h], [0, h - uc], [(w - ud) / 2, h - uc], [(w - ud) / 2, uc], [0, uc]]);
      return true;
    case 'star5': case 'star4': case 'star6': case 'star8': case 'star10': case 'star12':
      var n = Number(e.prst.replace('star', '')), dentro = n === 4 ? 0.25 : (n === 5 ? 0.38 : 0.5), pe = [];
      for (var i = 0; i < n * 2; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? dentro : 0.5;
        pe.push([w / 2 + Math.cos(ang) * w * rr, h / 2 + Math.sin(ang) * h * rr]);
      }
      poli(pe); return true;
    case 'wedgeRectCallout': case 'wedgeRoundRectCallout': case 'wedgeEllipseCallout':
      var tx = w / 2 + w * aj('adj1', -0.20833), ty = h / 2 + h * aj('adj2', 0.625);
      if (e.prst === 'wedgeEllipseCallout') g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (e.prst === 'wedgeRoundRectCallout' && g.roundRect) g.roundRect(0, 0, w, h, ss * 0.16667);
      else g.rect(0, 0, w, h);
      var da = Math.atan2(ty - h / 2, tx - w / 2), base = ss * 0.12;
      g.moveTo(w / 2 + Math.cos(da + Math.PI / 2) * base, h / 2 + Math.sin(da + Math.PI / 2) * base);
      g.lineTo(tx, ty);
      g.lineTo(w / 2 + Math.cos(da - Math.PI / 2) * base, h / 2 + Math.sin(da - Math.PI / 2) * base);
      g.closePath();
      return true;
    case 'cust':
      return XLD.trazarLibre(g, e, w, h, k);
  }
  return false;
};

/** Forma libre o trazo a mano (custGeom). */
XLD.trazarLibre = function (g, e, w, h, k) {
  var paths = AV.porNombre(e.cust, 'path');
  if (!paths.length) return false;
  var cerrada = false, sinRelleno = true;
  paths.forEach(function (pa) {
    var pw = XLD.num(pa, 'w', XLD.num(e.ext, 'cx', 0)), ph = XLD.num(pa, 'h', XLD.num(e.ext, 'cy', 0));
    var fx = pw ? w / pw : k, fy = ph ? h / ph : k, actual = [0, 0];
    if (pa.getAttribute('fill') !== 'none') sinRelleno = false;
    var pt = function (el) { return [XLD.num(el, 'x', 0) * fx, XLD.num(el, 'y', 0) * fy]; };
    XLD.hijos(pa).forEach(function (c) {
      var pts = XLD.hijos(c, 'pt').map(pt);
      if (c.localName === 'moveTo' && pts[0]) { g.moveTo(pts[0][0], pts[0][1]); actual = pts[0]; }
      else if (c.localName === 'lnTo' && pts[0]) { g.lineTo(pts[0][0], pts[0][1]); actual = pts[0]; }
      else if (c.localName === 'cubicBezTo' && pts.length === 3) { g.bezierCurveTo(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]); actual = pts[2]; }
      else if (c.localName === 'quadBezTo' && pts.length === 2) { g.quadraticCurveTo(pts[0][0], pts[0][1], pts[1][0], pts[1][1]); actual = pts[1]; }
      else if (c.localName === 'arcTo') {
        var wr = XLD.num(c, 'wR', 0) * fx, hr = XLD.num(c, 'hR', 0) * fy, st = XLD.num(c, 'stAng', 0) / 60000 * Math.PI / 180, sw = XLD.num(c, 'swAng', 0) / 60000 * Math.PI / 180;
        var ccx = actual[0] - wr * Math.cos(st), ccy = actual[1] - hr * Math.sin(st);
        g.ellipse(ccx, ccy, Math.max(0, wr), Math.max(0, hr), 0, st, st + sw, sw < 0);
        actual = [ccx + wr * Math.cos(st + sw), ccy + hr * Math.sin(st + sw)];
      } else if (c.localName === 'close') { g.closePath(); cerrada = true; }
    });
  });
  if (!cerrada || sinRelleno) e.estilo.fondo = null; // un trazo abierto no se rellena
  return true;
};

/** Texto de la figura: párrafos con ajuste de línea, alineación y anclaje vertical. */
XLD.texto = function (g, e, w, h, k) {
  var cuerpo = XLD.hijo(e.txt, 'bodyPr');
  var izq = XLD.num(cuerpo, 'lIns', 91440) * k, der = XLD.num(cuerpo, 'rIns', 91440) * k, arr = XLD.num(cuerpo, 'tIns', 45720) * k, aba = XLD.num(cuerpo, 'bIns', 45720) * k;
  var ancho = Math.max(1, w - izq - der), lineas = [], tema = e.tema || XLD.TEMA;
  XLD.hijos(e.txt, 'p').forEach(function (p) {
    var corridas = XLD.hijos(p).filter(function (c) { return /^(r|fld|br)$/.test(c.localName); });
    var pr = XLD.hijo(corridas.filter(function (c) { return c.localName !== 'br'; })[0], 'rPr') || XLD.hijo(p, 'endParaRPr');
    var tam = XLD.num(pr, 'sz', 1100) / 100 * 12700 * k;
    var color = (pr && XLD.color(XLD.hijo(pr, 'solidFill'), tema)) || e.estilo.texto || '#000000';
    var fuente = (pr && pr.getAttribute('b') === '1' ? 'bold ' : '') + (pr && pr.getAttribute('i') === '1' ? 'italic ' : '') + Math.max(1, tam) + 'px Calibri, Arial, sans-serif';
    var algn = (XLD.hijo(p, 'pPr') || { getAttribute: function () { return null; } }).getAttribute('algn') || 'l';
    var bloques = [''];
    corridas.forEach(function (c) {
      if (c.localName === 'br') bloques.push('');
      else bloques[bloques.length - 1] += (XLD.hijo(c, 't') || {}).textContent || '';
    });
    g.font = fuente;
    bloques.forEach(function (txt) {
      var palabras = txt.split(/\s+/), linea = '';
      if (!txt) { lineas.push({ t: '', f: fuente, c: color, a: algn, h: tam * 1.2 }); return; }
      palabras.forEach(function (pal) {
        var prueba = linea ? linea + ' ' + pal : pal;
        if (linea && g.measureText(prueba).width > ancho) { lineas.push({ t: linea, f: fuente, c: color, a: algn, h: tam * 1.2 }); linea = pal; }
        else linea = prueba;
      });
      lineas.push({ t: linea, f: fuente, c: color, a: algn, h: tam * 1.2 });
    });
  });
  if (!lineas.some(function (l) { return l.t; })) return;
  var total = lineas.reduce(function (s, l) { return s + l.h; }, 0), anc = cuerpo && cuerpo.getAttribute('anchor');
  var yy = anc === 'ctr' ? arr + (h - arr - aba - total) / 2 : (anc === 'b' ? h - aba - total : arr);
  g.textBaseline = 'top';
  lineas.forEach(function (l) {
    g.font = l.f;
    g.fillStyle = l.c;
    g.textAlign = l.a === 'ctr' ? 'center' : (l.a === 'r' ? 'right' : 'left');
    g.fillText(l.t, l.a === 'ctr' ? izq + ancho / 2 : (l.a === 'r' ? izq + ancho : izq), yy + l.h * 0.1);
    yy += l.h;
  });
};
