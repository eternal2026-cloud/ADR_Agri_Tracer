/* ============================================================================
 * avance.js — EXCEL DE AVANCE: ACTUALIZAR UNA AUDITORÍA DESDE EL EXCEL
 * El auditor elige la auditoría y sube un Excel con la misma estructura que la
 * descarga de Observaciones (hojas por área + hoja BD). Antes de aplicar se
 * muestra todo lo que cambia:
 *   · Hoja BD → fecha, tipo, campaña y planta de la auditoría; nombre de cada
 *     zona (SUB ÁREA) y puntajes de cada ítem (rpc_s5_importar_avance).
 *   · Hojas de observaciones del área → texto, acción correctiva, notas « // »
 *     (cada nota nueva es un seguimiento), estado, fecha de cierre y fotos
 *     nuevas en las celdas Antes / Después (rpc_s5_obs_actualizar). Una fila sin
 *     N° conocido y con foto «Antes» se registra como observación nueva.
 * Fotos: lee las que flotan sobre la celda (ExcelJS) y las «imagen en celda» de
 * Excel 365 (richData, leídas del .xlsx). Se comparan por huella (dHash) con las
 * de la app y solo se suben las que no estén ya.
 * ==========================================================================*/
var AV = { auds: [], aud: null, archivo: null, plan: null, huellas: {} };

AV.ESTRUCTURA_BD = ['fecha', 'campana', 'planta', 'n auditoria', 'tipo auditoria', 'area', 'n zona', 'sub area', 'zona', 's'];

/* ------------------------------------------------------------ utilidades de celdas */
AV.valor = function (c) {
  var v = c && typeof c === 'object' && 'value' in c ? c.value : c;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    return null; // error (#VALUE! de una imagen en celda) o fórmula sin resultado
  }
  return v === undefined ? null : v;
};
AV.texto = function (v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return AV.iso(v) || '';
  return String(v).replace(/\r\n?/g, '\n').trim();
};
/** Para comparar encabezados y nombres: sin tildes, minúsculas, solo letras y números. */
AV.norm = function (v) {
  return AV.texto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
};
/** Para comparar textos largos: espacios y saltos de línea no cuentan como cambio. */
AV.blando = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
AV.iso = function (v) {
  var d = null, m;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number' && v > 20000 && v < 80000) d = new Date(Math.round((v - 25569) * 86400000));
  else if ((m = String(v || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) return m[3] + '-' + S5._p(+m[2]) + '-' + S5._p(+m[1]);
  else if ((m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if (!d || isNaN(d.getTime())) return null;
  return d.getUTCFullYear() + '-' + S5._p(d.getUTCMonth() + 1) + '-' + S5._p(d.getUTCDate());
};
AV.numero = function (v) {
  if (v === null || v === undefined || v === '') return null;
  var n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return isNaN(n) ? NaN : n;
};
AV.estado = function (v) {
  var t = AV.norm(v);
  if (!t) return null;
  return S5.ESTADOS.filter(function (e) { return AV.norm(e) === t; })[0] || undefined;
};

/* ------------------------------------------------------------ zip mínimo (imágenes en celda) */
/** Lector de .xlsx (zip) sin librerías: índice central + DecompressionStream('deflate-raw'). */
AV.zip = function (buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), ent = {}, i;
  for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) break;
  if (i < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  for (var k = 0, n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true); k < n; k++) {
    var ln = dv.getUint16(p + 28, true);
    ent[dec.decode(u8.subarray(p + 46, p + 46 + ln))] = { met: dv.getUint16(p + 10, true), comp: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + ln + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  var leer = function (nombre) {
    var e = ent[nombre];
    if (!e) return Promise.resolve(null);
    var ini = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), datos = u8.slice(ini, ini + e.comp);
    if (e.met === 0) return Promise.resolve(datos);
    if (typeof DecompressionStream === 'undefined') return Promise.resolve(null);
    return new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  };
  return {
    existe: function (nombre) { return !!ent[nombre]; },
    leer: leer,
    xml: function (nombre) {
      return leer(nombre).then(function (b) { return b ? new DOMParser().parseFromString(dec.decode(b), 'application/xml') : null; });
    }
  };
};

AV.porNombre = function (doc, nombre) { return doc ? Array.prototype.slice.call(doc.getElementsByTagNameNS('*', nombre)) : []; };
AV.relaciones = function (doc, base) {
  var m = {};
  AV.porNombre(doc, 'Relationship').forEach(function (r) {
    var t = r.getAttribute('Target') || '', partes = (t.charAt(0) === '/' ? t.substring(1) : base + t).split('/'), ruta = [];
    partes.forEach(function (x) { if (x === '..') ruta.pop(); else if (x && x !== '.') ruta.push(x); });
    m[r.getAttribute('Id')] = ruta.join('/');
  });
  return m;
};
AV.columna = function (ref) {
  var letras = String(ref).match(/^[A-Z]+/)[0], n = 0;
  for (var i = 0; i < letras.length; i++) n = n * 26 + letras.charCodeAt(i) - 64;
  return n;
};
AV.mime = function (ext) {
  ext = String(ext || '').toLowerCase().replace('.', '');
  return ext === 'jpg' ? 'image/jpeg' : 'image/' + (ext || 'png');
};

/** «Imagen en celda» de Excel 365 → { 'Hoja': { 'fila|col': [Blob] } }. Si el archivo no las tiene, {}. */
AV.imagenesEnCelda = function (buf) {
  var z, salida = {};
  try { z = AV.zip(buf); } catch (e) { return Promise.resolve(salida); }
  if (!z.existe('xl/richData/rdrichvalue.xml')) return Promise.resolve(salida);
  return Promise.all([
    z.xml('xl/workbook.xml'), z.xml('xl/_rels/workbook.xml.rels'), z.xml('xl/metadata.xml'),
    z.xml('xl/richData/rdrichvaluestructure.xml'), z.xml('xl/richData/rdrichvalue.xml'),
    z.xml('xl/richData/richValueRel.xml'), z.xml('xl/richData/_rels/richValueRel.xml.rels')
  ]).then(function (d) {
    var relLibro = AV.relaciones(d[1], 'xl/'), relImg = AV.relaciones(d[6], 'xl/richData/');
    // vm (1-based) → bloque de valueMetadata → bloque de futureMetadata → índice del valor enriquecido
    var futuros = AV.porNombre(d[2], 'futureMetadata').filter(function (f) { return f.getAttribute('name') === 'XLRICHVALUE'; })[0];
    var rvb = futuros ? AV.porNombre(futuros, 'rvb').map(function (x) { return Number(x.getAttribute('i')); }) : [];
    var vmeta = AV.porNombre(d[2], 'valueMetadata')[0];
    var bloques = vmeta ? AV.porNombre(vmeta, 'bk').map(function (bk) { var rc = AV.porNombre(bk, 'rc')[0]; return rc ? Number(rc.getAttribute('v')) : 0; }) : [];
    var estructuras = AV.porNombre(d[3], 's').map(function (s) {
      return AV.porNombre(s, 'k').map(function (k) { return k.getAttribute('n'); }).indexOf('_rvRel:LocalImageIdentifier');
    });
    var valores = AV.porNombre(d[4], 'rv').map(function (rv) {
      var pos = estructuras[Number(rv.getAttribute('s'))], vs = AV.porNombre(rv, 'v');
      return pos > -1 && vs[pos] ? Number(vs[pos].textContent) : null;
    });
    var rels = AV.porNombre(d[5], 'rel').map(function (r) {
      return relImg[r.getAttribute('r:id') || r.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
    });
    var imagenDe = function (vm) {
      var b = bloques[vm - 1], idx = rvb.length ? rvb[b !== undefined ? b : vm - 1] : vm - 1;
      var rel = valores[idx !== undefined ? idx : vm - 1];
      return rel !== null && rel !== undefined ? rels[rel] : null;
    };
    var hojas = AV.porNombre(d[0], 'sheet');
    return Promise.all(hojas.map(function (h) {
      var nombre = h.getAttribute('name'), ruta = relLibro[h.getAttribute('r:id') || h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
      if (!ruta) return null;
      return z.xml(ruta).then(function (doc) {
        var celdas = AV.porNombre(doc, 'c').filter(function (c) { return c.getAttribute('vm'); });
        return Promise.all(celdas.map(function (c) {
          var media = imagenDe(Number(c.getAttribute('vm')));
          if (!media) return null;
          return z.leer(media).then(function (bytes) {
            if (!bytes) return;
            var ref = c.getAttribute('r'), clave = Number(ref.match(/\d+$/)[0]) + '|' + AV.columna(ref);
            var hoja = salida[nombre] = salida[nombre] || {};
            (hoja[clave] = hoja[clave] || []).push(new Blob([bytes], { type: AV.mime(media.split('.').pop()) }));
          });
        }));
      });
    }));
  }).then(function () { return salida; }).catch(function () { return salida; });
};

/** Fotos flotantes de una hoja (ExcelJS) → { 'fila|col': [Blob] } ordenadas de arriba a abajo. */
AV.imagenesFlotantes = function (wb, ws) {
  var salida = {}, lista = [];
  (ws.getImages ? ws.getImages() : []).forEach(function (im) {
    var tl = im.range && im.range.tl, med = wb.getImage(im.imageId);
    if (!tl || !med) return;
    var fila = (tl.nativeRow !== undefined ? tl.nativeRow : Math.floor(tl.row)) + 1;
    var col = (tl.nativeCol !== undefined ? tl.nativeCol : Math.floor(tl.col)) + 1;
    var datos = med.buffer || (med.base64 ? Uint8Array.from(atob(String(med.base64).replace(/^data:[^,]*,/, '')), function (ch) { return ch.charCodeAt(0); }) : null);
    if (!datos) return;
    lista.push({ clave: fila + '|' + col, orden: (tl.nativeRowOff || 0) * 10 + (tl.nativeColOff || 0) / 1e6, blob: new Blob([datos], { type: AV.mime(med.extension) }) });
  });
  lista.sort(function (a, b) { return a.orden - b.orden; }).forEach(function (x) { (salida[x.clave] = salida[x.clave] || []).push(x.blob); });
  return salida;
};

/** Todas las fotos del libro → { 'Hoja': { 'fila|col': [Foto] } } (ver XLD.fotos). Si el dibujo no se
    puede leer, se usa ExcelJS + imágenes en celda, sin figuras. */
AV.fotosDelLibro = function (buf, wb) {
  return XLD.fotos(buf).catch(function () { return null; }).then(function (r) {
    if (r) return r;
    return AV.imagenesEnCelda(buf).then(function (enCelda) {
      var salida = {};
      wb.eachSheet(function (ws) {
        var hoja = {}, flot = AV.imagenesFlotantes(wb, ws), cel = enCelda[ws.name] || {};
        [flot, cel].forEach(function (m) {
          Object.keys(m).forEach(function (k) { hoja[k] = (hoja[k] || []).concat(m[k].map(AV.comoFoto)); });
        });
        salida[ws.name] = hoja;
      });
      return salida;
    });
  });
};
AV.comoFoto = function (f) { return f instanceof Blob ? { blob: f, final: f, editada: false, figuras: 0 } : f; };

/* ------------------------------------------------------------ huella de foto (dHash 9×8) */
AV.huella = function (blob) {
  var dibujar = function (fuente) {
    var c = document.createElement('canvas');
    c.width = 9; c.height = 8;
    var g = c.getContext('2d');
    g.drawImage(fuente, 0, 0, 9, 8);
    var px = g.getImageData(0, 0, 9, 8).data, bits = '';
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var i = (y * 9 + x) * 4, j = i + 4;
      bits += (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) > (px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11) ? '1' : '0';
    }
    return bits;
  };
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(blob), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); try { resolve(dibujar(img)); } catch (e) { resolve(null); } };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
};
AV.distancia = function (a, b) {
  var d = 0;
  for (var i = 0; i < 64; i++) if (a.charAt(i) !== b.charAt(i)) d++;
  return d;
};
AV.huellaRuta = function (ruta) {
  if (!AV.huellas[ruta]) {
    AV.huellas[ruta] = sb.storage.from(FOTOS.BUCKET).download(ruta).then(function (r) {
      return r.error || !r.data ? null : AV.huella(r.data);
    }).catch(function () { return null; });
  }
  return AV.huellas[ruta];
};
/**
 * Compara las fotos de una celda del Excel con las de la app.
 *   fotos  → [Foto] de la celda (o Blobs);
 *   rutas  → fotos que la observación ya tiene (mismo tipo);
 *   ajenas → [{ ruta, o }] fotos de otras observaciones: si una foto del Excel es una de ellas, quedó
 *            en esta fila por error (p. ej. al borrar la fila de arriba) y NO se agrega.
 * → { nuevas: [Blob], reemplazos: [{ de, blob }], deOtras: [obs], sobran, ilegibles }.
 * Una foto que la app ya tiene pero que en el Excel lleva figuras encima (o recorte) la reemplaza.
 */
AV.fotosNuevas = function (fotos, rutas, ajenas) {
  fotos = (fotos || []).map(AV.comoFoto);
  ajenas = ajenas || [];
  var vacio = { nuevas: [], reemplazos: [], deOtras: [], sobran: 0, ilegibles: 0 };
  if (!fotos.length) return Promise.resolve(vacio);
  return Promise.all([
    Promise.all(fotos.map(function (f) { return AV.huella(f.blob); })),
    Promise.all(fotos.map(function (f) { return f.editada ? AV.huella(f.final) : null; })),
    Promise.all(rutas.map(AV.huellaRuta)),
    Promise.all(ajenas.map(function (a) { return AV.huellaRuta(a.ruta); }))
  ]).then(function (r) {
    var hs = r[0], hf = r[1], ha = r[3], ilegibles = hs.filter(function (h) { return !h; }).length;
    var propias = rutas.map(function (ruta, i) { return { ruta: ruta, h: r[2][i] }; }).filter(function (x) { return x.h; });
    var minimo = function (h, lista) {
      return lista.reduce(function (m, x, j) { var d = x ? AV.distancia(x, h) : 99; return d < m.d ? { d: d, j: j } : m; }, { d: 99, j: -1 });
    };
    var deOtras = [], dueno = {}, reemplazos = [], nuevas = [], vistas = [];
    // 1) Foto de otra observación (más parecida a una ajena que a cualquiera propia): no es de esta fila.
    var quedan = [];
    fotos.forEach(function (f, i) {
      if (!hs[i]) return;
      var aj = minimo(hs[i], ha), pr = minimo(hs[i], propias.map(function (x) { return x.h; }));
      if (aj.d <= 6 && aj.d < pr.d) { if (deOtras.indexOf(ajenas[aj.j].o) < 0) deOtras.push(ajenas[aj.j].o); return; }
      quedan.push(i);
    });
    // 2) Fotos que la app ya tiene: se emparejan de la más parecida a la menos, una con una.
    var pares = [];
    quedan.forEach(function (i) { propias.forEach(function (x, j) { var d = AV.distancia(x.h, hs[i]); if (d <= 10) pares.push({ i: i, j: j, d: d }); }); });
    pares.sort(function (a, b) { return a.d - b.d; }).forEach(function (p) {
      if (dueno['f' + p.i] !== undefined || dueno['p' + p.j] !== undefined) return;
      dueno['f' + p.i] = p.j; dueno['p' + p.j] = p.i;
      var f = fotos[p.i], x = propias[p.j];
      if (f.editada && hf[p.i] && AV.distancia(x.h, hf[p.i]) > 2) reemplazos.push({ de: x.ruta, blob: f.final });
    });
    // 3) El resto son nuevas (sin repetir dentro de la celda).
    quedan.forEach(function (i) {
      if (dueno['f' + i] !== undefined) { vistas.push(hs[i]); return; }
      if (vistas.some(function (v) { return AV.distancia(v, hs[i]) <= 4; })) return;
      vistas.push(hs[i]);
      nuevas.push(fotos[i].final);
    });
    var cupo = Math.max(0, FOTOS.MAX - rutas.length);
    return { nuevas: nuevas.slice(0, cupo), reemplazos: reemplazos, deOtras: deOtras, sobran: Math.max(0, nuevas.length - cupo), ilegibles: ilegibles };
  });
};

/* ------------------------------------------------------------ hoja: elegir auditoría y archivo */
/** opc.auditoria: la auditoría abierta (se preselecciona). */
AV.abrir = function (opc) {
  opc = opc || {};
  var culId = opc.auditoria ? opc.auditoria.cultivo_id : S5.cultivoId(), cul = S5.cultivo(culId);
  AV.archivo = null;
  AV.plan = null;
  UI.abrirHoja('<div class="asa"></div><div class="vacio">Cargando auditorías…</div>', { fija: true });
  sb.from('s5_auditorias').select('*').eq('cultivo_id', culId).neq('estado', 'anulada')
    .order('fecha', { ascending: false }).order('numero_auditoria', { ascending: false }).limit(300).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      AV.auds = r.data || [];
      var sel = opc.auditoria ? opc.auditoria.id : '';
      UI.abrirHoja('<div class="asa"></div>' +
        '<div class="res-estado" style="color:#7FD3F2">' + DR.ICONOS.subir + '<span>Excel de avance</span></div>' +
        '<div class="res-nombre">' + S5.iconoCultivo(cul, 26) + ' ' + DR.esc(cul ? cul.nombre : '') + '</div>' +
        '<div class="res-dni" style="letter-spacing:0">Sube el Excel con la misma estructura que «Descargar Excel» de Observaciones (hojas del área + hoja BD). ' +
          'Antes de aplicar verás qué cambia: puntajes, nombres de zona, datos de la auditoría y observaciones (textos, estado, notas y fotos nuevas).</div>' +
        '<div class="form" style="margin-top:14px">' +
          '<div class="campo ancho"><label for="avAud">Auditoría a actualizar<em>obligatorio</em></label><select id="avAud">' +
            '<option value="">Elige la auditoría</option>' + AV.auds.map(function (a) {
              var bloqueada = a.estado === 'cerrada' && !AT.esAdmin();
              return '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + (bloqueada ? ' disabled' : '') + '>' +
                DR.esc(((S5.area(a.area_id) || {}).nombre || '—') + ' · N° ' + a.numero_auditoria + ' · ' + S5.fecha(a.fecha) + ' · ' + a.codigo +
                  (a.estado === 'cerrada' ? ' · cerrada' + (bloqueada ? ' (solo admin)' : '') : '')) + '</option>';
            }).join('') + '</select>' +
            '<div class="ayuda-campo">Las cerradas solo las actualiza un administrador: el puntaje queda como corrección y se conserva el original.</div></div>' +
          '<div class="campo ancho"><label>Archivo Excel (.xlsx)<em>obligatorio</em></label>' +
            '<label class="foto-carga" id="avArchivoZona"><input type="file" id="avArchivo" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
            '<span class="foto-prev">' + DR.ICONOS.subir + '</span><span class="foto-txt"><b>Elegir archivo</b><span>Excel de avance de la auditoría</span></span></label></div>' +
        '</div>' +
        '<div class="acciones"><button type="button" class="btn sec" id="avCancelar">Cancelar</button>' +
        '<button type="button" class="btn azul" id="avRevisar" style="flex:1">Revisar cambios</button></div>', { fija: true });
      DR.$('#avCancelar').onclick = UI.cerrarHoja;
      DR.$('#avArchivo').onchange = function () {
        AV.archivo = this.files && this.files[0] ? this.files[0] : null;
        DR.$('#avArchivoZona').classList.toggle('lista', !!AV.archivo);
        DR.$('#avArchivoZona .foto-txt b').textContent = AV.archivo ? AV.archivo.name : 'Elegir archivo';
        DR.$('#avArchivoZona .foto-txt span').textContent = AV.archivo ? DR.num(AV.archivo.size / 1024) + ' KB · toca para cambiarlo' : 'Excel de avance de la auditoría';
      };
      DR.$('#avRevisar').onclick = function () {
        var a = AV.auds.filter(function (x) { return x.id === DR.$('#avAud').value; })[0], btn = this;
        if (!a) { DR.toast('Elige la auditoría a actualizar.', 'error'); return; }
        if (!AV.archivo) { DR.toast('Elige el archivo Excel.', 'error'); return; }
        btn.disabled = true;
        btn.classList.add('cargando');
        btn.textContent = 'Leyendo Excel…';
        AV.aud = a;
        AV.analizar(a, AV.archivo, function (t) { btn.textContent = t; }).then(function (plan) {
          AV.plan = plan;
          AV.pintarPlan();
        }).catch(function (e) {
          btn.disabled = false;
          btn.classList.remove('cargando');
          btn.textContent = 'Revisar cambios';
          DR.toast(e.message, 'error');
        });
      };
    }).catch(function (e) { UI.cerrarHoja(); DR.toast(e.message, 'error'); });
};

/* ------------------------------------------------------------ lectura y comparación */
AV.analizar = function (aud, archivo, progreso) {
  var area = S5.area(aud.area_id) || {}, buf, wb, enCelda;
  var plan = { aud: aud, cabecera: {}, cabTxt: [], zonas: [], obs: [], avisos: [], otras: 0 };
  return archivo.arrayBuffer().then(function (b) {
    buf = b;
    return INF.excelJS();
  }).then(function (ExcelJS) {
    wb = new ExcelJS.Workbook();
    return wb.xlsx.load(buf).catch(function () { throw new Error('No se pudo leer el archivo. ¿Es un Excel .xlsx?'); });
  }).then(function () {
    progreso('Leyendo fotos y figuras…');
    return AV.fotosDelLibro(buf, wb);
  }).then(function (f) {
    enCelda = f;
    progreso('Comparando con la app…');
    return Promise.all([
      AT.rpc('fn_s5_bd', { p_cultivo: aud.cultivo_id, p_area: aud.area_id }),
      sb.from('s5_observaciones').select('*, s5_auditorias(estado)').eq('cultivo_id', aud.cultivo_id).eq('area_id', aud.area_id).limit(3000)
    ]);
  }).then(function (r) {
    if (r[1].error) throw new Error(r[1].error.message);
    var bd = (r[0] || []).filter(function (f) { return f.auditoria_id === aud.id; });
    var obs = (r[1].data || []).filter(function (o) { return !o.s5_auditorias || o.s5_auditorias.estado !== 'anulada'; });
    AV.leerBD(wb, aud, area, bd, plan);
    return INF.notasDe(obs.map(function (o) { return o.id; })).then(function (notas) {
      return AV.leerObservaciones(wb, enCelda, aud, area, obs, notas, plan, progreso);
    });
  }).then(function () {
    if (!plan.hojaBD && !plan.hojasObs) throw new Error('El Excel no tiene la hoja BD ni hojas de Observaciones con la estructura de la descarga.');
    return plan;
  });
};

/** Busca la fila de títulos (entre las 5 primeras) que tenga todas las claves; devuelve {fila, col: {clave: n}}. */
AV.titulos = function (ws, claves) {
  for (var f = 1; f <= Math.min(5, ws.rowCount); f++) {
    var col = {};
    ws.getRow(f).eachCell(function (c, n) { var k = AV.norm(AV.valor(c)); if (k && col[k] === undefined) col[k] = n; });
    if (claves.every(function (k) { return col[k] !== undefined; })) return { fila: f, col: col };
  }
  return null;
};

AV.leerBD = function (wb, aud, area, bd, plan) {
  var ws = null, t = null;
  wb.eachSheet(function (h) {
    if (ws) return;
    var x = AV.titulos(h, ['n zona', 's', 'n auditoria']);
    if (x) { ws = h; t = x; }
  });
  if (!ws) { plan.avisos.push('No se encontró la hoja BD: no se revisan puntajes ni datos de la auditoría.'); return; }
  plan.hojaBD = ws.name;
  var c = t.col, celda = function (fila, k) { return c[k] ? AV.valor(fila.getCell(c[k])) : null; };
  var filas = [];
  for (var n = t.fila + 1; n <= ws.rowCount; n++) {
    var f = ws.getRow(n), zona = AV.numero(celda(f, 'n zona')), s = String(AV.texto(celda(f, 's'))).match(/^([1-5])/);
    if (!zona || !s) continue;
    filas.push({ fila: n, area: AV.norm(celda(f, 'area')), num: AV.numero(celda(f, 'n auditoria')), zona: zona, s: Number(s[1]),
      sub: AV.texto(celda(f, 'sub area')), zonaTxt: AV.texto(celda(f, 'zona')), fecha: AV.iso(celda(f, 'fecha')),
      campana: AV.texto(celda(f, 'campana')), planta: AV.texto(celda(f, 'planta')), tipo: AV.texto(celda(f, 'tipo auditoria')),
      items: [1, 2, 3, 4, 5, 6].map(function (i) { return c[String(i)] ? AV.numero(AV.valor(f.getCell(c[String(i)]))) : null; }) });
  }
  // Filas del área de la auditoría; si el Excel trae una sola auditoría del área, se toma esa aunque su N° difiera.
  var delArea = filas.filter(function (x) { return !x.area || x.area === AV.norm(area.nombre); });
  var nums = [];
  delArea.forEach(function (x) { if (nums.indexOf(x.num) < 0) nums.push(x.num); });
  var elegidas = delArea.filter(function (x) { return x.num === aud.numero_auditoria; });
  if (!elegidas.length && nums.length === 1) {
    elegidas = delArea;
    plan.avisos.push('La hoja BD trae la auditoría N° ' + nums[0] + ': se aplica a la N° ' + aud.numero_auditoria + ' que elegiste.');
  }
  if (!elegidas.length) {
    plan.avisos.push(delArea.length ? 'La hoja BD no tiene filas de la auditoría N° ' + aud.numero_auditoria + ' (trae las N° ' + nums.join(', ') + ').'
      : 'La hoja BD no tiene filas del área ' + area.nombre + '.');
    return;
  }

  // cabecera: la toma de la primera fila
  var p = elegidas[0], tipo = /^in/i.test(p.tipo) ? 'Inopinada' : (/^op/i.test(p.tipo) ? 'Opinada' : null);
  var cambio = function (k, etiqueta, nuevo, actual, fmt) {
    if (nuevo && nuevo !== actual) { plan.cabecera[k] = nuevo; plan.cabTxt.push(etiqueta + ': ' + (fmt ? fmt(actual) : actual) + ' → ' + (fmt ? fmt(nuevo) : nuevo)); }
  };
  cambio('fecha', 'Fecha', p.fecha, aud.fecha, S5.fecha);
  cambio('tipo', 'Tipo', tipo, aud.tipo);
  cambio('campana', 'Campaña', p.campana, aud.campana);
  cambio('planta', 'Planta', p.planta, aud.planta);
  if (plan.cabecera.fecha && plan.cabecera.fecha > S5.hoy()) { delete plan.cabecera.fecha; plan.avisos.push('La fecha de la hoja BD está en el futuro: no se cambia.'); }

  // puntajes actuales por zona y S
  var actual = {};
  bd.forEach(function (b) { actual[b.numero_zona + '|' + parseInt(b.s, 10)] = b; });
  var porZona = {};
  elegidas.forEach(function (x) { (porZona[x.zona] = porZona[x.zona] || []).push(x); });
  Object.keys(porZona).map(Number).sort(function (a, b) { return a - b; }).forEach(function (num) {
    var lista = porZona[num], z = S5.zonas.filter(function (q) { return q.cultivo_id === aud.cultivo_id && q.area_id === aud.area_id && q.numero === num; })[0];
    var nombre = lista[0].sub || lista[0].zonaTxt.replace(/^\s*\d+\s*[.\-)]\s*/, '');
    var item = { numero: num, nombre: nombre, zona: z || null, renombrar: !!(z && nombre && AV.blando(nombre) !== AV.blando(z.nombre)), nueva: !z, puntajes: [] };
    lista.forEach(function (x) {
      var b = actual[num + '|' + x.s];
      x.items.forEach(function (v, i) {
        if (v === null) return;
        var it = S5.items.filter(function (q) { return q.s === x.s && q.numero === i + 1; })[0];
        if (!it) return;
        if (isNaN(v) || [0, 0.5, 1, 1.5, 2].indexOf(v) < 0) {
          plan.avisos.push('BD fila ' + x.fila + ' · zona ' + num + ' · ' + x.s + 'S-' + (i + 1) + ': puntaje «' + AV.texto(x.items[i]) + '» no válido (0, 0.5, 1, 1.5 o 2).');
          return;
        }
        var antes = b && b['i' + (i + 1)] !== null && b['i' + (i + 1)] !== undefined ? Number(b['i' + (i + 1)]) : null;
        if (antes !== v) item.puntajes.push({ s: x.s, numero: i + 1, puntaje: v, antes: antes });
      });
    });
    if (item.nueva && !nombre) { plan.avisos.push('La zona N° ' + num + ' no existe y no tiene nombre en la hoja BD: no se crea.'); return; }
    if (item.renombrar || item.nueva || item.puntajes.length) plan.zonas.push(item);
  });
};

AV.leerObservaciones = function (wb, fotosLibro, aud, area, obs, notas, plan, progreso) {
  var tareas = [], zonasArea = S5.zonasDe(aud.area_id, true, aud.cultivo_id);
  var buscarZona = function (txt) {
    var n = AV.norm(String(txt || '').replace(/^\s*\d+\s*[.\-)]\s*/, ''));
    return zonasArea.filter(function (z) { return AV.norm(z.nombre) === n; })[0] || null;
  };
  plan.hojasObs = 0;
  wb.eachSheet(function (ws) {
    var t = AV.titulos(ws, ['zona', 'observaciones', 'estado']);
    if (!t || ws.name === plan.hojaBD) return;
    var c = t.col, deHoja = AV.norm(ws.name), areaHoja = null;
    if (!c.area) {
      areaHoja = S5.areas.filter(function (a) { return AV.norm(a.nombre) === deHoja; })[0] || null;
      if (!areaHoja && (deHoja === 'observaciones' || deHoja.indexOf('observaciones') === 0)) areaHoja = area;
      if (!areaHoja) { plan.avisos.push('La hoja «' + ws.name + '» no corresponde a un área conocida: se omite.'); return; }
      if (areaHoja.id !== area.id) { plan.otras++; return; }
    }
    plan.hojasObs++;
    var fotosHoja = fotosLibro[ws.name] || {};
    var fotosDe = function (fila, col) { return col ? fotosHoja[fila + '|' + col] || [] : []; };
    var val = function (f, k) { return c[k] ? AV.valor(f.getCell(c[k])) : null; };

    for (var n = t.fila + 1; n <= ws.rowCount; n++) {
      var f = ws.getRow(n), desc = AV.texto(val(f, 'observaciones')), zonaTxt = AV.texto(val(f, 'zona')), num = AV.numero(val(f, 'n'));
      var fAntes = fotosDe(n, c.antes), fDespues = fotosDe(n, c.despues);
      if (!desc && !zonaTxt && !fAntes.length) continue;
      if (c.area && AV.norm(val(f, 'area')) && AV.norm(val(f, 'area')) !== AV.norm(area.nombre)) { plan.otras++; continue; }
      var z = buscarZona(zonaTxt), ref = '«' + ws.name + '» fila ' + n;
      if (!z) { plan.avisos.push(ref + ': la zona «' + zonaTxt + '» no existe en ' + area.nombre + '. Se omite.'); continue; }
      var o = num ? obs.filter(function (x) { return x.zona_id === z.id && x.numero === num; })[0] : null;
      tareas.push({ ref: ref, hoja: ws.name, fila: n, z: z, o: o || null, num: num, desc: desc, accion: AV.texto(val(f, 'accion correctiva')),
        estadoTxt: AV.texto(val(f, 'estado')), cierre: c['fecha de cierre'] ? AV.iso(val(f, 'fecha de cierre')) : undefined,
        fAntes: fAntes, fDespues: fDespues });
    }
  });

  // Observaciones de la app que faltan en el Excel entre las que sí están (filas borradas). Sus fotos y
  // las de las filas vecinas son las que pueden haber quedado sobre otra fila.
  var enExcel = tareas.filter(function (t) { return t.o; }).map(function (t) { return t.o; });
  var cerca = function (o, margen) {
    if (enExcel.indexOf(o) > -1) return false;
    var nums = enExcel.filter(function (x) { return x.zona_id === o.zona_id; }).map(function (x) { return x.numero; });
    return nums.length > 0 && o.numero > Math.min.apply(null, nums) - margen && o.numero < Math.max.apply(null, nums) + margen;
  };
  var faltan = obs.filter(function (o) { return cerca(o, 3); });
  faltan.filter(function (o) { return cerca(o, 0); }).forEach(function (o) {
    plan.avisos.push('N° ' + o.numero + ' · ' + S5.nombreZona(S5.zonas.filter(function (z) { return z.id === o.zona_id; })[0] || {}) +
      ': no figura en el Excel. Si borraste su fila, en la app sigue igual (el Excel de avance no elimina observaciones) y sus fotos no pasan a otra fila; si ya no corresponde, cámbiale el estado desde la app.');
  });
  var fotosDeObs = function (o) {
    return S5.fotosDe(o, 'antes').concat(S5.fotosDe(o, 'despues')).map(function (ruta) { return { ruta: ruta, o: o }; });
  };
  var deFaltantes = faltan.reduce(function (t, o) { return t.concat(fotosDeObs(o)); }, []);
  tareas.forEach(function (t) {
    var vecinas = tareas.filter(function (x) { return x !== t && x.o && x.o !== t.o && x.hoja === t.hoja && Math.abs(x.fila - t.fila) <= 2; });
    t.ajenas = deFaltantes.concat(vecinas.reduce(function (s, x) { return s.concat(fotosDeObs(x.o)); }, []))
      .filter(function (a) { return a.o !== t.o; });
  });

  var hechas = 0;
  return INF.enLotes(tareas, 3, function (t) {
    return AV.compararObs(t, aud, notas, plan).then(function () {
      hechas++;
      progreso('Revisando observaciones ' + hechas + ' de ' + tareas.length + '…');
    });
  });
};

/** Arma el cambio de una fila de observaciones (o el alta, si es nueva). */
AV.compararObs = function (t, aud, notas, plan) {
  var o = t.o, estado = AV.estado(t.estadoTxt);
  if (estado === undefined) plan.avisos.push(t.ref + ': estado «' + t.estadoTxt + '» no reconocido (' + S5.ESTADOS.join(', ') + '). No se cambia.');

  // «Acción // nota // nota»: la primera parte es la acción y el resto, notas de seguimiento.
  var partes = t.accion.split(/\s*\/\/\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  var previas = o ? (notas[o.id] || []) : [];
  var esNota = function (x) { return previas.some(function (p) { return AV.blando(p) === AV.blando(x); }); };
  var accion, notasExcel;
  if (o && !o.accion_correctiva && partes.length && esNota(partes[0])) { accion = ''; notasExcel = partes; }
  else { accion = partes[0] || ''; notasExcel = partes.slice(1); }
  var notasNuevas = notasExcel.filter(function (x) { return !esNota(x); });

  if (!o) {
    if (!t.desc) { plan.avisos.push(t.ref + ': fila sin texto de observación. Se omite.'); return Promise.resolve(); }
    return AV.fotosNuevas(t.fAntes, [], t.ajenas).then(function (fa) {
      AV.avisoAjenas(plan, t.ref + (t.num ? ' (N° ' + t.num + ')' : ''), fa);
      if (!fa.nuevas.length) {
        plan.avisos.push(t.ref + (t.num ? ' (N° ' + t.num + ')' : '') + ': no existe en la app y no tiene foto «Antes» propia en la celda: no se puede registrar.');
        return;
      }
      return AV.fotosNuevas(t.fDespues, [], t.ajenas).then(function (fd) {
        AV.avisoAjenas(plan, t.ref, fd);
        plan.obs.push({ tipo: 'nueva', ref: t.ref, z: t.z, num: t.num, desc: t.desc, accion: accion, notas: notasNuevas,
          estado: estado || 'Pendiente', cierre: t.cierre || null, fotosAntes: fa.nuevas, fotosDespues: fd.nuevas });
      });
    });
  }

  var cambios = [], p = { id: o.id, origen: 'excel' };
  var plazo = AT.esAdmin() || S5.enPlazoObs(o), bloqueados = [];
  if (t.desc && AV.blando(t.desc) !== AV.blando(o.descripcion)) {
    if (plazo) { p.descripcion = t.desc; cambios.push('Observación: «' + DR.recortar(t.desc, 90) + '»'); } else bloqueados.push('observación');
  }
  if (AV.blando(accion) !== AV.blando(o.accion_correctiva)) {
    if (plazo) { p.accion_correctiva = accion; cambios.push('Acción correctiva: ' + (accion ? '«' + DR.recortar(accion, 90) + '»' : '(vacía)')); } else bloqueados.push('acción correctiva');
  }
  if (bloqueados.length) plan.avisos.push(t.ref + ' (N° ' + o.numero + '): cambió ' + bloqueados.join(' y ') + ', pero el plazo para editar textos venció el ' + S5.fecha(S5.limiteObs(o)) + '. Solo un administrador puede hacerlo.');
  if (notasNuevas.length) { p.notas = notasNuevas; cambios.push(notasNuevas.length + ' nota(s) de seguimiento: ' + notasNuevas.map(function (x) { return '«' + DR.recortar(x, 60) + '»'; }).join(', ')); }
  if (estado && estado !== o.estado) { p.estado = estado; cambios.push('Estado: ' + o.estado + ' → ' + estado); }
  var estadoFinal = p.estado || o.estado;
  if (t.cierre !== undefined && (t.cierre || null) !== (o.fecha_cierre || null) && !(!t.cierre && estadoFinal === 'Cerrado')) {
    p.fecha_cierre = t.cierre || '';
    cambios.push('Fecha de cierre: ' + (o.fecha_cierre ? S5.fecha(o.fecha_cierre) : '—') + ' → ' + (t.cierre ? S5.fecha(t.cierre) : '—'));
  }

  var antesApp = S5.fotosDe(o, 'antes'), despuesApp = S5.fotosDe(o, 'despues');
  // Se comparan fotos si la celda trae más de las que tiene la app o alguna lleva figuras/recorte.
  var revisar = function (fotos, app) {
    return fotos.length > app.length || fotos.some(function (f) { return f.editada; }) ? AV.fotosNuevas(fotos, app, t.ajenas) : { nuevas: [], reemplazos: [], deOtras: [], sobran: 0 };
  };
  return Promise.all([revisar(t.fAntes, antesApp), revisar(t.fDespues, despuesApp)]).then(function (r) {
    AV.avisoAjenas(plan, t.ref + ' (N° ' + o.numero + ')', r[0]);
    AV.avisoAjenas(plan, t.ref + ' (N° ' + o.numero + ')', r[1]);
    if (r[0].nuevas.length) cambios.push('+' + r[0].nuevas.length + ' foto(s) «Antes»');
    if (r[1].nuevas.length) cambios.push('+' + r[1].nuevas.length + ' foto(s) «Después»');
    if (r[0].reemplazos.length) cambios.push(r[0].reemplazos.length + ' foto(s) «Antes» con figuras (reemplaza a la original)');
    if (r[1].reemplazos.length) cambios.push(r[1].reemplazos.length + ' foto(s) «Después» con figuras (reemplaza a la original)');
    if (r[0].sobran || r[1].sobran) plan.avisos.push(t.ref + ' (N° ' + o.numero + '): hay más fotos de las que caben (máximo ' + FOTOS.MAX + ' por tipo); se agregan las primeras.');
    if (r[0].ilegibles || r[1].ilegibles) plan.avisos.push(t.ref + ' (N° ' + o.numero + '): ' + ((r[0].ilegibles || 0) + (r[1].ilegibles || 0)) + ' imagen(es) en un formato que el navegador no lee (p. ej. EMF). Pégalas como JPG o PNG.');
    if (!cambios.length) return;
    plan.obs.push({ tipo: 'cambio', ref: t.ref, o: o, z: t.z, p: p, cambios: cambios, fotosAntes: r[0].nuevas, fotosDespues: r[1].nuevas,
      reemplazosAntes: r[0].reemplazos, reemplazosDespues: r[1].reemplazos });
  });
};

AV.avisoAjenas = function (plan, ref, r) {
  (r.deOtras || []).forEach(function (o) {
    plan.avisos.push(ref + ': una foto de la celda es de la N° ' + o.numero + ' (' + S5.nombreZona(S5.zonas.filter(function (z) { return z.id === o.zona_id; })[0] || {}) +
      '); quedó en esta fila por error (por ejemplo, al borrar una fila). No se agrega aquí.');
  });
};
/** Todas las fotos que el plan sube: nuevas y las que reemplazan (con figuras). */
AV.blobsDe = function (x) {
  return x.fotosAntes.concat(x.fotosDespues, (x.reemplazosAntes || []).concat(x.reemplazosDespues || []).map(function (r) { return r.blob; }));
};

/* ------------------------------------------------------------ vista previa y aplicación */
AV.hayCambios = function (plan) {
  return Object.keys(plan.cabecera).length > 0 || plan.zonas.length > 0 || plan.obs.length > 0;
};

AV.miniaturas = function (blobs) {
  return blobs.length ? '<span class="foto-grupo chico">' + blobs.map(function (b) { return '<img alt="" src="' + URL.createObjectURL(b) + '">'; }).join('') + '</span>' : '';
};

AV.pintarPlan = function () {
  var plan = AV.plan, a = plan.aud, area = S5.area(a.area_id) || {};
  var nPts = plan.zonas.reduce(function (t, z) { return t + z.puntajes.length; }, 0);
  var cambiosObs = plan.obs.filter(function (x) { return x.tipo === 'cambio'; }), nuevas = plan.obs.filter(function (x) { return x.tipo === 'nueva'; });
  var nFotos = plan.obs.reduce(function (t, x) { return t + AV.blobsDe(x).length; }, 0);
  var hay = AV.hayCambios(plan);
  var bloque = function (titulo, resumen, cuerpo) {
    return cuerpo ? '<details class="av-bloque"><summary><b>' + titulo + '</b><span>' + resumen + '</span></summary>' + cuerpo + '</details>'
      : '<div class="av-bloque"><div class="av-sin"><b>' + titulo + '</b><span>' + resumen + '</span></div></div>';
  };

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#7FD3F2">' + DR.ICONOS.subir + '<span>Excel de avance · revisión</span></div>' +
    '<div class="res-nombre">' + DR.esc(area.nombre || '') + ' · N° ' + a.numero_auditoria + '</div>' +
    '<div class="res-dni" style="letter-spacing:0">' + DR.esc(a.codigo + ' · ' + S5.fecha(a.fecha) + ' · ' + (AV.archivo ? AV.archivo.name : '')) + '</div>' +
    '<div class="av-kpis">' +
      '<div><b>' + nPts + '</b><span>puntaje(s)</span></div>' +
      '<div><b>' + (cambiosObs.length + nuevas.length) + '</b><span>observación(es)</span></div>' +
      '<div><b>' + nFotos + '</b><span>foto(s) a subir</span></div></div>' +
    bloque('Datos de la auditoría', plan.cabTxt.length ? plan.cabTxt.length + ' cambio(s)' : 'sin cambios',
      plan.cabTxt.length ? '<ul>' + plan.cabTxt.map(function (x) { return '<li>' + DR.esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    bloque('Zonas y puntajes', plan.zonas.length ? plan.zonas.length + ' zona(s) · ' + nPts + ' puntaje(s)' : 'sin cambios',
      plan.zonas.length ? '<ul>' + plan.zonas.map(function (z) {
        return '<li><b>' + z.numero + '. ' + DR.esc(z.nombre || (z.zona || {}).nombre || '') + '</b>' +
          (z.nueva ? ' <span class="pill verde">nueva</span>' : '') +
          (z.renombrar ? '<small>Nombre: ' + DR.esc(z.zona.nombre) + ' → ' + DR.esc(z.nombre) + '</small>' : '') +
          (z.puntajes.length ? '<small>' + z.puntajes.map(function (x) { return x.s + 'S-' + x.numero + ': ' + S5.numPuntaje(x.antes) + ' → ' + S5.numPuntaje(x.puntaje); }).join(' · ') + '</small>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
    bloque('Observaciones', (cambiosObs.length || nuevas.length) ? cambiosObs.length + ' con cambios · ' + nuevas.length + ' nueva(s)' : 'sin cambios',
      plan.obs.length ? '<ul>' + plan.obs.map(function (x) {
        return x.tipo === 'nueva'
          ? '<li><b>Nueva · ' + DR.esc(S5.nombreZona(x.z)) + '</b> <span class="pill verde">' + DR.esc(x.estado) + '</span><small>' + DR.esc(DR.recortar(x.desc, 140)) + '</small>' +
            (x.num ? '<small>En el Excel figura como N° ' + x.num + '; la app le asigna el siguiente N° de la zona.</small>' : '') + AV.miniaturas(AV.blobsDe(x)) + '</li>'
          : '<li><b>N° ' + x.o.numero + ' · ' + DR.esc(S5.nombreZona(x.z)) + '</b>' + x.cambios.map(function (t) { return '<small>' + DR.esc(t) + '</small>'; }).join('') +
            AV.miniaturas(AV.blobsDe(x)) + '</li>';
      }).join('') + '</ul>' : '') +
    (plan.otras ? '<div class="ayuda-campo" style="margin-top:8px">' + plan.otras + ' fila(s) u hoja(s) de otras áreas no se tocan.</div>' : '') +
    (plan.avisos.length ? '<div class="aviso alerta av-avisos"><b>Revisa</b><ul>' + plan.avisos.map(function (x) { return '<li>' + DR.esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
    (hay ? '' : '<div class="aviso ok" style="margin-top:12px">El Excel coincide con la app: no hay nada que actualizar.</div>') +
    '<div class="acciones"><button type="button" class="btn sec" id="avVolver">Volver</button>' +
    '<button type="button" class="btn verde" id="avAplicar" style="flex:1"' + (hay ? '' : ' disabled') + '>Aplicar cambios</button></div>', { fija: true });

  DR.$('#avVolver').onclick = function () { AV.abrir({ auditoria: a }); };
  DR.$('#avAplicar').onclick = AV.aplicar;
};

AV.subirFotos = function (blobs, base) {
  if (!blobs.length) return Promise.resolve([]);
  return Promise.all(blobs.map(function (b) { return FOTOS.comprimir(b); })).then(function (cs) {
    return FOTOS.subirLista(cs.map(function (b) { return { blob: b, ruta: null }; }), base);
  });
};

AV.aplicar = function () {
  var plan = AV.plan, a = plan.aud, btn = DR.$('#avAplicar'), errores = [], res = null, hechas = 0;
  btn.disabled = true;
  btn.classList.add('cargando');
  DR.$('#avVolver').disabled = true;
  var paso = function (t) { btn.textContent = t; };
  var inicio = Promise.resolve();
  if (Object.keys(plan.cabecera).length || plan.zonas.length) {
    paso('Guardando puntajes…');
    inicio = AT.rpc('rpc_s5_importar_avance', { p_auditoria: a.id, p: {
      cabecera: plan.cabecera,
      zonas: plan.zonas.map(function (z) {
        return { numero: z.numero, nombre: z.nombre, puntajes: z.puntajes.map(function (x) { return { s: x.s, numero: x.numero, puntaje: x.puntaje }; }) };
      })
    } }).then(function (r) { res = r; });
  }

  inicio.then(function () {
    // Una por una: si una falla, las demás siguen y al final se informa.
    return plan.obs.reduce(function (cadena, x) {
      return cadena.then(function () {
        hechas++;
        paso('Observaciones ' + hechas + ' de ' + plan.obs.length + '…');
        return (x.tipo === 'nueva' ? AV.aplicarNueva(x, a) : AV.aplicarCambio(x)).catch(function (e) {
          errores.push(x.ref + ': ' + e.message);
        });
      });
    }, Promise.resolve());
  }).then(function () {
    DR.vibrar(40);
    DR.sonar(!errores.length);
    var avisos = ((res && res.avisos) || []).concat(errores);
    DR.toast(errores.length ? 'Excel aplicado con ' + errores.length + ' error(es). Revisa el detalle.' : 'Auditoría ' + a.codigo + ' actualizada con el Excel.', errores.length ? 'error' : undefined);
    return S5.cargar(true).then(function () {
      UI.abrirHoja('<div class="asa"></div>' +
        '<div class="res-estado" style="color:#B7E27C">' + DR.ICONOS.checkChico + '<span>Excel aplicado</span></div>' +
        '<div class="res-nombre">' + DR.esc(a.codigo) + '</div>' +
        '<ul class="av-final">' +
          (res ? '<li>' + res.puntajes + ' puntaje(s) · ' + res.renombradas + ' zona(s) renombrada(s) · ' + res.zonas_nuevas + ' zona(s) nueva(s) · ' +
            res.cabecera + ' dato(s) de la auditoría' + (res.completas ? ' · ' + res.completas + ' zona(s) completada(s)' : '') + '</li>' : '') +
          '<li>' + (plan.obs.length - errores.length) + ' de ' + plan.obs.length + ' observación(es) actualizada(s) o registrada(s)</li></ul>' +
        (avisos.length ? '<div class="aviso alerta av-avisos"><b>Revisa</b><ul>' + avisos.map(function (t) { return '<li>' + DR.esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="acciones"><button type="button" class="btn verde" id="avVer" style="flex:1">Ver la auditoría</button></div>', { fija: true });
      DR.$('#avVer').onclick = function () {
        UI.cerrarHoja();
        if (DR.vista !== 'auditar') { AUD.pendiente = a.id; DR.ir('auditar'); return; }
        AUD.abrirAuditoria((res && res.auditoria) || a);
      };
    });
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Reintentar';
    DR.$('#avVolver').disabled = false;
    DR.toast('No se aplicó: ' + e.message, 'error');
  });
};

AV.aplicarCambio = function (x) {
  var base = 'obs/' + (S5.cultivoDeObs(x.o) || 0) + '/' + x.o.zona_id + '/' + x.o.id;
  var ra = x.reemplazosAntes || [], rd = x.reemplazosDespues || [];
  var blob = function (r) { return r.blob; };
  return Promise.all([
    AV.subirFotos(x.fotosAntes, base + '-antes-xl'), AV.subirFotos(x.fotosDespues, base + '-despues-xl'),
    AV.subirFotos(ra.map(blob), base + '-antes-fig'), AV.subirFotos(rd.map(blob), base + '-despues-fig')
  ]).then(function (r) {
    var p = Object.assign({}, x.p);
    if (r[0].length) p.fotos_antes = r[0];
    if (r[1].length) p.fotos_despues = r[1];
    if (r[2].length) p.reemplazar_antes = r[2].map(function (ruta, i) { return { de: ra[i].de, a: ruta }; });
    if (r[3].length) p.reemplazar_despues = r[3].map(function (ruta, i) { return { de: rd[i].de, a: ruta }; });
    return AT.rpc('rpc_s5_obs_actualizar', { p: p });
  }).then(function (n) { if (OBS.lista.length) OBS.reemplazar(n); });
};

AV.aplicarNueva = function (x, a) {
  var id = S5.uuid(), base = 'obs/' + a.cultivo_id + '/' + x.z.id + '/' + id;
  var inicial = x.estado === 'Recomendación' ? 'Recomendación' : 'Pendiente';
  return AV.subirFotos(x.fotosAntes, base + '-antes').then(function (rutas) {
    return AT.rpc('rpc_s5_guardar_observacion', { p: {
      id: id, auditoria_id: a.id, zona_id: x.z.id, descripcion: x.desc, accion_correctiva: x.accion, estado: inicial, fotos_antes: rutas
    } });
  }).then(function (o) {
    var resto = { id: o.id, origen: 'excel' };
    if (x.estado !== inicial) resto.estado = x.estado;
    if (x.notas.length) resto.notas = x.notas;
    if (x.cierre) resto.fecha_cierre = x.cierre;
    return AV.subirFotos(x.fotosDespues, base + '-despues').then(function (rutas) {
      if (rutas.length) resto.fotos_despues = rutas;
      return Object.keys(resto).length > 2 ? AT.rpc('rpc_s5_obs_actualizar', { p: resto }) : o;
    });
  }).then(function (n) { if (OBS.lista.length) OBS.reemplazar(n); });
};
