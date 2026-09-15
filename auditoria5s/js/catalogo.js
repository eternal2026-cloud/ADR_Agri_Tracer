/* ============================================================================
 * catalogo.js — NÚCLEO DE AUDITORÍA 5S: cultivos, catálogo, parámetros y fórmulas
 * Cada cultivo (Arándano, Uva, Cítrico…) tiene su campaña, su planta y sus zonas
 * por área; los puntajes nunca se mezclan entre cultivos.
 * Fórmulas del CHECK LIST del Excel:
 *   % de una S = SUMA / (n° de ítems × 2) · total de la zona = promedio de las 5 S
 *   madurez: ≥ 90 % EXCELENTE · ≥ 75 % BIEN · ≥ 65 % REGULAR · resto CRÍTICO
 * ==========================================================================*/
var VISTAS = {};

var S5 = {
  cultivos: [], areas: [], zonas: [], items: [], parametros: {}, _carga: null, _cultivo: null,
  CLAVE_CULTIVO: 'agritracer.5s.cultivo',
  NOMBRES: { 1: 'Seleccionar', 2: 'Ordenar', 3: 'Limpieza', 4: 'Estandarización', 5: 'Disciplina' },
  COLORES: { 1: '#76B729', 2: '#0097CE', 3: '#EF7C3B', 4: '#E8B04A', 5: '#D9622B' },
  ESTADOS: ['Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación'],
  ABIERTOS: ['Pendiente', 'En ejecución', 'Stand By'],
  PILL_ESTADO: { 'Pendiente': 'rojo', 'En ejecución': 'naranja', 'Cerrado': 'verde', 'Cancelado': 'gris', 'Stand By': 'azul', 'Recomendación': 'azul' },
  COLOR_ESTADO: { 'Pendiente': '#F06A6E', 'En ejecución': '#EF7C3B', 'Cerrado': '#76B729', 'Cancelado': '#A89A8C', 'Stand By': '#0097CE', 'Recomendación': '#4FC3F0' },
  PILL_MADUREZ: { 'EXCELENTE': 'verde', 'BIEN': 'azul', 'REGULAR': 'naranja', 'CRÍTICO': 'rojo' },
  PUNTOS: [{ v: 0, t: 'No cumple' }, { v: 1, t: 'Parcial' }, { v: 1.5, t: '' }, { v: 2, t: 'Cumple' }],
  ICONOS_CULTIVO: [{ id: 'arandano', t: 'Arándano' }, { id: 'uva', t: 'Uva' }, { id: 'citrico', t: 'Cítrico' }, { id: 'hoja', t: 'Otro cultivo' }]
};

/* ------------------------------------------------ catálogo */
S5.cargar = function (forzar) {
  if (S5._carga && !forzar) return S5._carga;
  S5._carga = Promise.all([
    sb.from('s5_cultivos').select('*').order('orden').order('nombre'),
    sb.from('s5_areas').select('*').order('orden').order('nombre'),
    sb.from('s5_zonas').select('*').order('cultivo_id').order('area_id').order('numero'),
    sb.from('s5_items').select('*').order('s').order('numero'),
    sb.from('parametros').select('clave,valor').in('clave', ['S5_DIAS_CORRECCION'])
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    S5.cultivos = r[0].data || [];
    S5.areas = r[1].data || [];
    S5.zonas = r[2].data || [];
    S5.items = r[3].data || [];
    S5.parametros = {};
    (r[4].data || []).forEach(function (p) { S5.parametros[p.clave] = p.valor; });
    if (!S5.items.length) throw new Error('El checklist 5S está vacío. Falta aplicar las migraciones 0012 y 0013 en Supabase.');
    if (!S5.cultivos.length) throw new Error('No hay cultivos registrados. Falta aplicar la migración 0013 en Supabase.');
  }).catch(function (e) { S5._carga = null; throw e; });
  return S5._carga;
};

S5.cultivo = function (id) { return S5.cultivos.filter(function (c) { return c.id === Number(id); })[0] || null; };
S5.area = function (id) { return S5.areas.filter(function (a) { return a.id === Number(id); })[0] || null; };
S5.zona = function (id) { return S5.zonas.filter(function (z) { return z.id === Number(id); })[0] || null; };
S5.item = function (id) { return S5.items.filter(function (i) { return i.id === Number(id); })[0] || null; };
S5.cultivosActivos = function () { return S5.cultivos.filter(function (c) { return c.activo; }); };

/** Zonas de un área; si se indica cultivo, solo las de ese cultivo. */
S5.zonasDe = function (areaId, todas, cultivoId) {
  return S5.zonas.filter(function (z) {
    return z.area_id === Number(areaId) && (cultivoId === undefined || cultivoId === null || z.cultivo_id === Number(cultivoId)) && (todas || z.activo);
  });
};
/** Áreas que tienen zonas para un cultivo. */
S5.areasDe = function (cultivoId, todas) {
  return S5.areas.filter(function (a) {
    return (todas || a.activo) && S5.zonas.some(function (z) { return z.area_id === a.id && z.cultivo_id === Number(cultivoId) && (todas || z.activo); });
  });
};
S5.itemsDe = function (s, todos) {
  return S5.items.filter(function (i) { return i.s === Number(s) && (todos || i.activo); });
};
S5.nombreZona = function (z) { return z ? z.numero + '. ' + z.nombre : '—'; };
S5.diasCorreccion = function () {
  var n = parseInt(S5.parametros.S5_DIAS_CORRECCION, 10);
  return isNaN(n) ? 3 : Math.max(n, 0);
};

/* ------------------------------------------------ cultivo en uso (se recuerda en el celular) */
S5.cultivoActual = function () {
  var c = S5.cultivo(S5._cultivo || S5.leerLocal(S5.CLAVE_CULTIVO));
  if (!c || !c.activo) c = S5.cultivosActivos()[0] || S5.cultivos[0] || null;
  S5._cultivo = c ? c.id : null;
  return c;
};
S5.cultivoId = function () { var c = S5.cultivoActual(); return c ? c.id : null; };
S5.fijarCultivo = function (id) {
  S5._cultivo = Number(id);
  S5.escribirLocal(S5.CLAVE_CULTIVO, Number(id));
};

/** Íconos SVG de cultivo (autónomos: sirven en pantalla y para el PDF). */
S5.iconoSvg = function (icono, color, tam) {
  var c = color || '#76B729', t = tam || 28, hoja = '#76B729', cuerpo;
  if (icono === 'arandano') {
    cuerpo = '<path d="M36 13c5-7 14-8 19-4-5 5-12 7-19 4z" fill="' + hoja + '"/>' +
      '<circle cx="42" cy="41" r="14" fill="' + c + '" opacity=".8"/>' +
      '<circle cx="24" cy="37" r="16" fill="' + c + '"/>' +
      '<circle cx="18" cy="31" r="4.5" fill="#fff" opacity=".28"/>' +
      '<path d="M18.5 25l3 1.6 2.5-3.6 2.5 3.6 3-1.6-1 4.2h-9z" fill="#1B2347" opacity=".78"/>' +
      '<path d="M41 31.6l2.4 1.3 2-2.9 2 2.9 2.4-1.3-.8 3.3h-7.2z" fill="#1B2347" opacity=".62"/>';
  } else if (icono === 'uva') {
    cuerpo = '<path d="M33 4v10" stroke="#5D4835" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M34 10c5-6 14-7 19-3-5 5-13 7-19 3z" fill="' + hoja + '"/>' +
      [[19, 22], [33, 22], [47, 22], [26, 34], [40, 34], [33, 46], [19, 34], [47, 34], [26, 46], [40, 46], [33, 57]]
        .filter(function (p, i) { return i < 6 || i === 10; })
        .map(function (p) {
          return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="' + c + '"/><circle cx="' + (p[0] - 2.4) + '" cy="' + (p[1] - 2.4) + '" r="1.8" fill="#fff" opacity=".35"/>';
        }).join('');
  } else if (icono === 'citrico') {
    cuerpo = '<path d="M34 13c3-7 11-9 16-7-2 6-9 9-16 7z" fill="' + hoja + '"/>' +
      '<circle cx="32" cy="36" r="23" fill="' + c + '"/>' +
      '<circle cx="32" cy="36" r="18" fill="#FFE2BF"/>' +
      '<path d="M32 18v36M14 36h36M19.3 23.3l25.4 25.4M44.7 23.3L19.3 48.7" stroke="' + c + '" stroke-width="2.6" opacity=".85"/>' +
      '<circle cx="32" cy="36" r="3.5" fill="#FFF4E6"/>';
  } else {
    cuerpo = '<path d="M11 53C11 28 27 12 53 11c0 26-15 42-42 42z" fill="' + c + '"/>' +
      '<path d="M13 51L43 21" stroke="#fff" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>';
  }
  return '<svg class="cultivo-ico" width="' + t + '" height="' + t + '" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + cuerpo + '</svg>';
};
S5.iconoCultivo = function (c, tam) { return c ? S5.iconoSvg(c.icono, c.color, tam) : ''; };

S5.selectorCultivoHtml = function () {
  var actual = S5.cultivoActual();
  return '<div class="cultivos-bar entra" role="tablist" aria-label="Cultivo">' + S5.cultivosActivos().map(function (c) {
    return '<button type="button" role="tab" class="cultivo-chip' + (actual && c.id === actual.id ? ' activo' : '') + '" data-cultivo-sel="' + c.id + '" style="--c:' + c.color + '">' +
      S5.iconoCultivo(c, 26) + '<span>' + DR.esc(c.nombre) + '</span></button>';
  }).join('') + '</div>';
};
S5.enlazarSelectorCultivo = function (raiz, alCambiar) {
  DR.$$('[data-cultivo-sel]', raiz).forEach(function (b) {
    b.onclick = function () {
      var id = Number(this.getAttribute('data-cultivo-sel'));
      if (id === S5.cultivoId()) return;
      S5.fijarCultivo(id);
      alCambiar(S5.cultivo(id));
    };
  });
};

/* ------------------------------------------------ fórmulas del CHECK LIST */
/** Una S a partir de {item_id: puntaje}. pct es null mientras falte algún ítem activo. */
S5.calcularS = function (puntajes, s) {
  var items = S5.itemsDe(s), suma = 0, n = 0;
  items.forEach(function (it) {
    var v = puntajes[it.id];
    if (v !== undefined && v !== null && v !== '') { suma += Number(v); n++; }
  });
  return { suma: suma, n: n, total: items.length, max: items.length * 2, pct: (n && n === items.length) ? suma / (n * 2) : null };
};

S5.calcularZona = function (puntajes) {
  var res = { completas: 0, total: null }, pcts = [];
  for (var s = 1; s <= 5; s++) {
    res[s] = S5.calcularS(puntajes, s);
    if (res[s].pct !== null) pcts.push(res[s].pct);
  }
  res.completas = pcts.length;
  if (pcts.length === 5) res.total = S5.promedio(pcts);
  return res;
};

S5.promedio = function (valores) {
  var v = valores.filter(function (x) { return x !== null && x !== undefined && x !== '' && !isNaN(x); }).map(Number);
  return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
};

S5.madurez = function (p) {
  if (p === null || p === undefined || p === '' || isNaN(p)) return '';
  p = Math.round(Number(p) * 1e6) / 1e6;
  return p >= 0.9 ? 'EXCELENTE' : (p >= 0.75 ? 'BIEN' : (p >= 0.65 ? 'REGULAR' : 'CRÍTICO'));
};

/* ------------------------------------------------ formato */
S5.pct = function (p) {
  if (p === null || p === undefined || p === '' || isNaN(p)) return '—';
  var v = Math.round(Number(p) * 1000) / 10;
  return DR.num(v, v % 1 ? 1 : 0) + '%';
};
S5.numPuntaje = function (v) { return v === null || v === undefined || v === '' ? '—' : String(Number(v)); };
S5.pillMadurez = function (p) {
  var m = S5.madurez(p);
  return m ? '<span class="pill ' + S5.PILL_MADUREZ[m] + '">' + m + '</span>' : '';
};
S5.pillEstado = function (e) { return '<span class="pill ' + (S5.PILL_ESTADO[e] || 'gris') + '">' + DR.esc(e) + '</span>'; };

/* ------------------------------------------------ fechas (AAAA-MM-DD, hora del celular) */
S5._p = function (n) { return (n < 10 ? '0' : '') + n; };
S5.hoy = function () { var d = new Date(); return d.getFullYear() + '-' + S5._p(d.getMonth() + 1) + '-' + S5._p(d.getDate()); };
S5._utc = function (f) {
  var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
};
S5.fecha = function (f) {
  var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (f ? String(f) : '—');
};
S5.sumarDias = function (f, n) {
  var t = S5._utc(f);
  return isNaN(t) ? f : new Date(t + n * 86400000).toISOString().substring(0, 10);
};
S5.diasDesde = function (f) {
  var t = S5._utc(f);
  return isNaN(t) ? 0 : Math.round((S5._utc(S5.hoy()) - t) / 86400000);
};
S5.limiteCorreccion = function (aud) { return S5.sumarDias(aud.fecha, S5.diasCorreccion()); };
S5.enPlazo = function (aud) { return S5.hoy() <= S5.limiteCorreccion(aud); };
S5.puedeCorregir = function (aud) { return AT.puedeCapturar() && (AT.esAdmin() || S5.enPlazo(aud)); };

/* ------------------------------------------------ almacenamiento local e identificadores */
S5.leerLocal = function (clave) {
  try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
};
S5.escribirLocal = function (clave, valor) {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) { /* sin almacenamiento */ }
};
S5.uuid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).substring(1); }).join('');
  return h.substring(0, 8) + '-' + h.substring(8, 12) + '-' + h.substring(12, 16) + '-' + h.substring(16, 20) + '-' + h.substring(20);
};

/* ------------------------------------------------ ítem del checklist con control de puntaje */
S5.itemHtml = function (it, valor, opc) {
  opc = opc || {};
  var tiene = valor !== undefined && valor !== null && valor !== '';
  var botones = S5.PUNTOS.map(function (p) {
    var activa = tiene && Number(valor) === p.v;
    return '<button type="button" class="pt' + (p.v === 1.5 ? ' medio' : '') + (activa ? ' activa' : '') + '" data-v="' + p.v + '" role="radio" aria-checked="' + activa + '"' +
      ' aria-label="' + p.v + (p.t ? ' · ' + p.t : '') + '"' + (opc.soloLectura ? ' disabled' : '') + '><span>' + p.v + '</span>' + (p.t ? '<small>' + p.t + '</small>' : '') + '</button>';
  }).join('');
  return '<div class="item5s' + (tiene ? ' lleno' : '') + '" data-item="' + it.id + '" style="--c:' + (opc.color || S5.COLORES[it.s]) + '">' +
    '<span class="item5s-num">' + it.numero + '</span>' +
    '<div class="item5s-texto">' + DR.esc(it.texto) + (opc.nota ? '<span class="item5s-nota">' + opc.nota + '</span>' : '') +
    '<span class="cambio" data-cambio="' + it.id + '"></span></div>' +
    '<div class="puntaje" role="radiogroup" aria-label="Puntaje del ítem ' + it.numero + '">' + botones + '</div></div>';
};

/** Delegación de toques en los controles 0 · 1 · 1.5 · 2. alCambiar(item_id, valor). */
S5.enlazarPuntajes = function (raiz, alCambiar) {
  DR.$$('.puntaje', raiz).forEach(function (grupo) {
    grupo.onclick = function (ev) {
      var b = ev.target.closest('.pt');
      if (!b || b.disabled) return;
      var fila = this.closest('.item5s'), v = Number(b.getAttribute('data-v'));
      DR.$$('.pt', this).forEach(function (x) {
        x.classList.toggle('activa', x === b);
        x.setAttribute('aria-checked', x === b ? 'true' : 'false');
      });
      fila.classList.add('lleno');
      fila.classList.remove('falta');
      DR.vibrar(15);
      if (DR.anima) anime({ targets: b, scale: [0.88, 1], duration: 320, easing: 'easeOutBack' });
      alCambiar(Number(fila.getAttribute('data-item')), v);
    };
  });
};

/** Barras horizontales por S (mismo estilo que el cierre de ciclo). */
S5.barrasS = function (porS) {
  return [1, 2, 3, 4, 5].map(function (s) {
    var p = porS[s];
    var ancho = p === null || p === undefined ? 0 : Math.round(Number(p) * 100);
    return '<div class="barra-fila"><div>' + s + 'S · ' + S5.NOMBRES[s] + '</div>' +
      '<div class="barra-pista"><div class="barra-valor" data-ancho="' + ancho + '" style="background:' + S5.COLORES[s] + '"></div></div>' +
      '<div class="barra-cifra">' + S5.pct(p) + '</div></div>';
  }).join('');
};
S5.animarBarras = function (raiz) {
  DR.$$('.barra-valor', raiz).forEach(function (b, i) {
    var w = b.getAttribute('data-ancho') + '%';
    if (DR.anima) anime({ targets: b, width: [0, w], duration: 800, delay: 150 + i * 60, easing: 'easeOutCubic' });
    else b.style.width = w;
  });
};
