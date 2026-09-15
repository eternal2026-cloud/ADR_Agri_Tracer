/* ============================================================================
 * fotos.js — EVIDENCIA FOTOGRÁFICA (Antes / Después) EN SUPABASE STORAGE
 * La cámara del celular se abre con <input capture>; la foto se reduce a
 * ≤ 1600 px en JPEG antes de subir (≈ 200–400 KB en lugar de varios MB).
 * El bucket es privado: para mostrarlas se piden URLs firmadas temporales.
 * ==========================================================================*/
var FOTOS = { BUCKET: 'auditoria-5s', cache: {} };

FOTOS.ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>';

FOTOS.campoHtml = function (id, titulo, detalle) {
  return '<label class="foto-carga" id="' + id + 'Zona"><input type="file" accept="image/*" capture="environment" id="' + id + '">' +
    '<span class="foto-prev">' + FOTOS.ICONO + '</span><span class="foto-txt"><b>' + titulo + '</b><span>' + detalle + '</span></span></label>';
};

/** Enlaza un campo de foto: al elegir, comprime y guarda el Blob en estado.blob (y olvida la ruta ya subida). */
FOTOS.enlazar = function (id, estado) {
  var inp = DR.$('#' + id), zona = DR.$('#' + id + 'Zona');
  if (!inp) return;
  inp.onchange = function () {
    var archivo = this.files && this.files[0];
    if (!archivo) return;
    zona.classList.add('cargando');
    FOTOS.comprimir(archivo).then(function (blob) {
      estado.blob = blob;
      estado.ruta = null;
      if (estado.url) URL.revokeObjectURL(estado.url);
      estado.url = URL.createObjectURL(blob);
      DR.$('.foto-prev', zona).innerHTML = '<img alt="" src="' + estado.url + '">';
      DR.$('.foto-txt span', zona).textContent = DR.num(blob.size / 1024) + ' KB · toca para cambiarla';
      zona.classList.remove('cargando');
      zona.classList.add('lista');
      DR.vibrar(25);
    }).catch(function (e) {
      zona.classList.remove('cargando');
      DR.toast(e.message, 'error');
    });
  };
};

FOTOS.comprimir = function (archivo, lado, calidad) {
  lado = lado || 1600;
  calidad = calidad || 0.75;
  return new Promise(function (resolve, reject) {
    if (archivo.type && !/^image\//.test(archivo.type)) { reject(new Error('El archivo elegido no es una imagen.')); return; }
    var url = URL.createObjectURL(archivo), img = new Image();
    img.onload = function () {
      var esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * esc));
      c.height = Math.max(1, Math.round(img.naturalHeight * esc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('No se pudo procesar la foto.')); }, 'image/jpeg', calidad);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto. Tómala de nuevo.')); };
    img.src = url;
  });
};

/** Sube estado.blob a `ruta` una sola vez: si ya se subió (reintento), devuelve la ruta guardada. */
FOTOS.subir = function (estado, ruta) {
  if (estado.ruta) return Promise.resolve(estado.ruta);
  if (!estado.blob) return Promise.resolve(null);
  return sb.storage.from(FOTOS.BUCKET).upload(ruta, estado.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
    .then(function (r) {
      if (r.error && !/exist|duplicate/i.test(r.error.message || '')) throw new Error(r.error.message);
      estado.ruta = ruta;
      return ruta;
    }, function (e) { throw e; })
    .catch(function (e) { throw new Error('No se subió la foto (' + (e.message || 'sin conexión') + '). Revisa la señal y reintenta.'); });
};

/** URLs firmadas por 1 h, en lote y con caché. */
FOTOS.firmar = function (rutas) {
  var ahora = Date.now(), vistas = {};
  var faltan = rutas.filter(function (r) {
    if (!r || vistas[r]) return false;
    vistas[r] = true;
    return !FOTOS.cache[r] || FOTOS.cache[r].vence < ahora;
  });
  if (!faltan.length) return Promise.resolve();
  return sb.storage.from(FOTOS.BUCKET).createSignedUrls(faltan, 3600).then(function (r) {
    if (r.error) throw new Error(r.error.message);
    (r.data || []).forEach(function (x) {
      if (x.signedUrl && x.path) FOTOS.cache[x.path] = { url: x.signedUrl, vence: ahora + 50 * 60000 };
    });
  });
};

/** Completa los <img data-foto="ruta"> de un contenedor; [data-ver] abre la foto grande. */
FOTOS.pintar = function (raiz) {
  var cont = typeof raiz === 'string' ? DR.$(raiz) : raiz;
  if (!cont) return;
  var imgs = DR.$$('img[data-foto]', cont);
  FOTOS.firmar(imgs.map(function (i) { return i.getAttribute('data-foto'); })).then(function () {
    imgs.forEach(function (i) {
      var c = FOTOS.cache[i.getAttribute('data-foto')];
      if (c) { i.src = c.url; i.classList.add('cargada'); }
    });
  }).catch(function () { /* sin miniaturas: el texto sigue visible */ });
  DR.$$('[data-ver]', cont).forEach(function (el) {
    el.onclick = function (ev) { ev.stopPropagation(); FOTOS.ver(this.getAttribute('data-ver')); };
  });
};

FOTOS.ver = function (ruta) {
  var visor = DR.$('#visorFoto');
  if (!visor) {
    visor = document.createElement('div');
    visor.id = 'visorFoto';
    visor.onclick = function () { visor.classList.add('oculto'); };
    document.body.appendChild(visor);
  }
  visor.innerHTML = '<div class="vacio">Cargando foto…</div>';
  visor.classList.remove('oculto');
  FOTOS.firmar([ruta]).then(function () {
    var c = FOTOS.cache[ruta];
    visor.innerHTML = c ? '<img alt="Evidencia" src="' + c.url + '"><span>Toca para cerrar</span>' : '<div class="vacio">No se pudo cargar la foto.</div>';
  }).catch(function (e) { visor.innerHTML = '<div class="vacio">' + DR.esc(e.message) + '</div>'; });
};
