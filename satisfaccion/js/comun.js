/* ============================================================================
 * comun.js — NÚCLEO DEL MÓDULO SATISFACCIÓN DEL CLIENTE INTERNO
 * Fórmulas (iguales a la plantilla y a fn_sci_resultados):
 *   · ítem: Totalmente en desacuerdo 4 % · En desacuerdo 6,5 % · De acuerdo 8,5 % · Totalmente de acuerdo 10 %
 *   · resultado de la encuesta = suma de los 10 ítems
 *   · % de un criterio = suma de sus ítems / (n° de ítems × 10)
 *   · consolidado (grupo, área o planta) = promedio por encuesta
 * Áreas: catálogo s5_areas (compartido con 5S). Planta: código del fundo (PDC, PLM…).
 * ==========================================================================*/
var VISTAS = {};
var SCI = {
  cultivos: [], areas: [], fundos: [], items: [], _carga: null,
  CLAVE_CULTIVO: 'agritracer.sci.cultivo',
  CRITERIOS: IMP_SCI.CRITERIOS,
  ESCALA: IMP_SCI.ESCALA,
  COLOR_ESCALA: { 4: '#E5484D', 6.5: '#EF7C3B', 8.5: '#0097CE', 10: '#76B729' },
  CARGOS: ['Jefe', 'Coordinador', 'Analista', 'Supervisor'],
  // Nombre de la planta en este módulo cuando no es el del fundo de campo
  // (el fundo La Máquina tiene su planta en Los Molinos; «La Máquina» queda solo para campo).
  NOMBRE_PLANTA: { PLM: 'Los Molinos' },
  SUB_AREAS: ['Limpieza', 'Packing', 'Pesado', 'Etiquetado'],
  // Semáforo del resultado (solo visual).
  UMBRAL_BIEN: 85, UMBRAL_REGULAR: 70
};

/* ------------------------------------------------------------ catálogo */
SCI.cargar = function (forzar) {
  if (SCI._carga && !forzar) return SCI._carga;
  SCI._carga = Promise.all([
    sb.from('s5_cultivos').select('id,nombre,icono,color,campana,activo,orden').order('orden').order('nombre'),
    sb.from('s5_areas').select('id,nombre,nombre_ci,alias,activo,orden').order('orden').order('nombre'),
    sb.from('listas_maestras').select('valor,codigo,activo,orden').eq('tipo', 'fundo').order('orden').order('valor'),
    sb.from('sci_items').select('*').order('id')
  ]).then(function (r) {
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    SCI.cultivos = r[0].data || [];
    // En este módulo el área se muestra con su nombre legal (Config → Áreas); el de 5S y los
    // anteriores quedan como alias para reconocerlos al importar Excel.
    SCI.areas = (r[1].data || []).map(function (x) {
      return { id: x.id, nombre: x.nombre_ci || x.nombre, nombre_5s: x.nombre, alias: (x.alias || []).concat(x.nombre_ci ? [x.nombre] : []), activo: x.activo, orden: x.orden };
    });
    SCI.fundos = r[2].data || [];
    SCI.items = r[3].data || [];
    if (!SCI.items.length) throw new Error('Falta aplicar la migración 0016 (Satisfacción del cliente interno) en Supabase.');
  }).catch(function (e) { SCI._carga = null; throw e; });
  return SCI._carga;
};

SCI.cultivo = function (id) { return SCI.cultivos.filter(function (c) { return c.id === Number(id); })[0] || null; };
SCI.cultivoPorNombre = function (n) {
  return SCI.cultivos.filter(function (c) { return IMP_SCI.norm(c.nombre) === IMP_SCI.norm(n); })[0] || null;
};
SCI.area = function (id) { return SCI.areas.filter(function (a) { return a.id === Number(id); })[0] || null; };
SCI.areasActivas = function () { return SCI.areas.filter(function (a) { return a.activo; }); };
SCI.item = function (n) { return SCI.items.filter(function (i) { return i.id === Number(n); })[0] || null; };

/** Plantas elegibles: código del fundo (DON CARLOS → PDC) y las conocidas de la plantilla. */
SCI.plantas = function () {
  var lista = [];
  SCI.fundos.forEach(function (f) {
    var cod = (f.codigo || '').trim().toUpperCase();
    if (cod && f.activo && !lista.some(function (p) { return p.codigo === cod; })) lista.push({ codigo: cod, fundo: SCI.NOMBRE_PLANTA[cod] || f.valor });
  });
  IMP_SCI.PLANTAS.forEach(function (c) { if (!lista.some(function (p) { return p.codigo === c; })) lista.push({ codigo: c, fundo: SCI.NOMBRE_PLANTA[c] || '' }); });
  return lista;
};

/* ------------------------------------------------------------ plantas y áreas asignadas al usuario ([] = todas) */
SCI.misPlantas = function () { return AT.esAdmin() || !AT.perfil ? [] : (AT.perfil.sci_plantas || []); };
SCI.misAreas = function () { return AT.esAdmin() || !AT.perfil ? [] : (AT.perfil.sci_areas || []).map(Number); };
SCI.codigosPlanta = function () { return SCI.plantas().map(function (p) { return p.codigo; }); };

/* ------------------------------------------------------------ cultivo en uso (se recuerda en el celular) */
SCI.leerLocal = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
SCI.escribirLocal = function (k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
/** 0 = todos los cultivos. */
SCI.cultivoFiltro = function () {
  var v = SCI._cultivo !== undefined ? SCI._cultivo : Number(SCI.leerLocal(SCI.CLAVE_CULTIVO) || 0);
  if (v && !SCI.cultivo(v)) v = 0;
  SCI._cultivo = v;
  return v;
};
SCI.fijarCultivo = function (id) { SCI._cultivo = Number(id) || 0; SCI.escribirLocal(SCI.CLAVE_CULTIVO, String(SCI._cultivo)); };

SCI.selectorCultivoHtml = function (conTodos) {
  var actual = SCI.cultivoFiltro();
  var chips = conTodos ? ['<button type="button" class="cultivo-chip' + (!actual ? ' activo' : '') + '" data-cultivo-sel="0" style="--c:#B7A99C">' +
    DR.iconoCultivo('hoja', '#B7A99C', 26) + '<span>Todos</span></button>'] : [];
  SCI.cultivos.filter(function (c) { return c.activo; }).forEach(function (c) {
    chips.push('<button type="button" class="cultivo-chip' + (c.id === actual ? ' activo' : '') + '" data-cultivo-sel="' + c.id + '" style="--c:' + c.color + '">' +
      DR.iconoCultivo(c.icono, c.color, 26) + '<span>' + DR.esc(c.nombre) + '</span></button>');
  });
  return '<div class="cultivos-bar entra" role="tablist" aria-label="Cultivo">' + chips.join('') + '</div>';
};
SCI.enlazarSelectorCultivo = function (raiz, alCambiar) {
  DR.$$('[data-cultivo-sel]', raiz).forEach(function (b) {
    b.onclick = function () { SCI.fijarCultivo(this.getAttribute('data-cultivo-sel')); alCambiar(); };
  });
};

/* ------------------------------------------------------------ cálculos */
SCI.num = function (v) { return v === null || v === undefined || v === '' ? null : Number(v); };
SCI.pct = function (v, dec) { return v === null || v === undefined || isNaN(v) ? '—' : DR.num(v, dec === undefined ? 1 : dec) + ' %'; };
SCI.colorPct = function (v) {
  if (v === null || v === undefined) return '#A89A8C';
  return v >= SCI.UMBRAL_BIEN ? '#76B729' : (v >= SCI.UMBRAL_REGULAR ? '#EF7C3B' : '#E5484D');
};
SCI.pillPct = function (v) {
  var clase = v === null || v === undefined ? 'gris' : (v >= SCI.UMBRAL_BIEN ? 'verde' : (v >= SCI.UMBRAL_REGULAR ? 'naranja' : 'rojo'));
  return '<span class="pill ' + clase + '">' + SCI.pct(v) + '</span>';
};
SCI.textoEscala = function (p) { return (SCI.ESCALA.filter(function (e) { return e.v === Number(p); })[0] || {}).t || ''; };

/** Rótulo del grupo evaluador (igual que fn_sci_grupo). */
SCI.grupo = function (evaluadora, sub, planta, cultivo) {
  sub = (sub || '').trim(); planta = (planta || '').trim().toUpperCase();
  if (sub) return (planta ? planta + ' - ' : '') + (evaluadora === 'Producción' ? 'Prod.' : evaluadora) + ' ' + sub;
  if (planta) return planta + ' - ' + evaluadora;
  if (evaluadora === 'Producción') return 'Producción ' + (cultivo || '');
  return evaluadora || '—';
};

/** Fila de fn_sci_resultados → {criterios: {1..4}, total}. */
SCI.valores = function (f) {
  return { total: SCI.num(f.resultado), criterios: { 1: SCI.num(f.p_atencion), 2: SCI.num(f.p_tiempo), 3: SCI.num(f.p_comunicacion), 4: SCI.num(f.p_calidad) } };
};

/** Promedio por encuesta de una lista de filas de fn_sci_resultados. */
SCI.consolidar = function (filas) {
  var res = { n: filas.length, total: null, criterios: { 1: null, 2: null, 3: null, 4: null } };
  if (!filas.length) return res;
  var prom = function (fn) {
    var s = 0, n = 0;
    filas.forEach(function (f) { var v = fn(f); if (v !== null && !isNaN(v)) { s += v; n++; } });
    return n ? s / n : null;
  };
  res.total = prom(function (f) { return SCI.valores(f).total; });
  SCI.CRITERIOS.forEach(function (c) { res.criterios[c.id] = prom(function (f) { return SCI.valores(f).criterios[c.id]; }); });
  return res;
};

/** Agrupa filas por una clave conservando el orden de aparición. */
SCI.agrupar = function (filas, claveFn) {
  var mapa = {}, lista = [];
  filas.forEach(function (f) {
    var k = claveFn(f);
    if (!mapa[k]) { mapa[k] = { clave: k, filas: [] }; lista.push(mapa[k]); }
    mapa[k].filas.push(f);
  });
  return lista;
};

/** Textos de sugerencias de varias encuestas, sin repetir. */
SCI.unirTextos = function (filas, campo) {
  var vistos = {}, lista = [];
  filas.forEach(function (f) {
    var t = (f[campo] || '').trim();
    var k = IMP_SCI.norm(t);
    if (t && !vistos[k]) { vistos[k] = true; lista.push(t.charAt(0).toUpperCase() + t.slice(1)); }
  });
  return lista;
};

/** Orden de los grupos: con planta primero (por planta), luego el resto. */
SCI.ordenGrupos = function (a, b) {
  var pa = a.planta || '~', pb = b.planta || '~';
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.grupo < b.grupo ? -1 : (a.grupo > b.grupo ? 1 : 0);
};

/* ------------------------------------------------------------ datos */
SCI.resultados = function (cultivoId) {
  return AT.rpc('fn_sci_resultados', { p_cultivo: cultivoId || null, p_area_evaluada: null, p_desde: null, p_hasta: null });
};

/** fn_sci_bd paginada (PostgREST corta en 1000 filas). */
SCI.bd = function (cultivoId, areaId) {
  var todas = [];
  var pagina = function (desde) {
    return sb.rpc('fn_sci_bd', { p_cultivo: cultivoId || null, p_area_evaluada: areaId || null }).range(desde, desde + 999).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      todas = todas.concat(r.data || []);
      return (r.data || []).length === 1000 ? pagina(desde + 1000) : todas;
    });
  };
  return pagina(0);
};

SCI.uuid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).substring(1); }).join('');
  return h.substring(0, 8) + '-' + h.substring(8, 12) + '-' + h.substring(12, 16) + '-' + h.substring(16, 20) + '-' + h.substring(20);
};

SCI.hoy = function () {
  var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
SCI.fecha = function (f) {
  var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (f ? String(f) : '');
};

/** Ejecuta una RPC desde un botón (lo deshabilita mientras tanto). */
SCI.accion = function (btn, nombre, args, ok) {
  btn.disabled = true;
  btn.classList.add('cargando');
  return AT.rpc(nombre, args).then(function (r) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    if (ok) DR.toast(ok);
    return r;
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    DR.toast(e.message, 'error');
    throw e;
  });
};

/* ------------------------------------------------------------ opciones de formularios */
/** permitidas: ids de área a los que se limita la lista (vacío = todas). */
SCI.opcionesAreas = function (actual, vacio, permitidas) {
  permitidas = permitidas || [];
  return (vacio ? '<option value="">' + DR.esc(vacio) + '</option>' : '') + SCI.areas.filter(function (a) {
    return (a.activo && (!permitidas.length || permitidas.indexOf(a.id) > -1)) || a.id === Number(actual);
  }).map(function (a) {
    return '<option value="' + a.id + '"' + (a.id === Number(actual) ? ' selected' : '') + '>' + DR.esc(a.nombre) + '</option>';
  }).join('');
};
SCI.opcionesCultivos = function (actual, vacio) {
  return (vacio ? '<option value="">' + DR.esc(vacio) + '</option>' : '') + SCI.cultivos.filter(function (c) { return c.activo || c.id === Number(actual); }).map(function (c) {
    return '<option value="' + c.id + '"' + (c.id === Number(actual) ? ' selected' : '') + '>' + DR.esc(c.nombre) + '</option>';
  }).join('');
};
/** permitidas: códigos de planta a los que se limita la lista (vacío = todas, con «Sin planta»). */
SCI.opcionesPlantas = function (actual, permitidas) {
  actual = (actual || '').toUpperCase();
  permitidas = permitidas || [];
  var lista = SCI.plantas().filter(function (p) { return !permitidas.length || permitidas.indexOf(p.codigo) > -1 || p.codigo === actual; });
  if (actual && !lista.some(function (p) { return p.codigo === actual; })) lista.push({ codigo: actual, fundo: SCI.NOMBRE_PLANTA[actual] || '' });
  return (permitidas.length ? (actual ? '' : '<option value="">Elegir…</option>') : '<option value="">Sin planta</option>') + lista.map(function (p) {
    return '<option value="' + DR.esc(p.codigo) + '"' + (p.codigo === actual ? ' selected' : '') + '>' + DR.esc(p.codigo + (p.fundo ? ' · ' + p.fundo : '')) + '</option>';
  }).join('');
};
SCI.datalistSubAreas = function (id) {
  return '<datalist id="' + id + '">' + SCI.SUB_AREAS.map(function (s) { return '<option value="' + s + '">'; }).join('') + '</datalist>';
};

/* ------------------------------------------------------------ gráfico radar (4 criterios) */
/**
 * series: [{ nombre, color, criterios: {1..4: 0-100} }]. Ejes como en la presentación:
 * Atención y trato arriba, Tiempo de respuesta a la derecha, Comunicación abajo y Calidad a la izquierda.
 */
SCI.radarSvg = function (series, opc) {
  opc = opc || {};
  var W = opc.ancho || 360, H = opc.alto || 300, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.3;
  var claro = !!opc.claro, tinta = claro ? '#3B2F25' : '#D6CABE', malla = claro ? '#DDD5CC' : '#4A3E34';
  var ejes = [1, 2, 3, 4];
  var ang = function (i) { return -Math.PI / 2 + i * Math.PI / 2; };
  var pt = function (i, v) { return [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v]; };
  var poli = function (fn) { return ejes.map(function (c, i) { var p = pt(i, fn(c)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); };
  var s = '<svg class="sci-radar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Resultado por criterio" font-family="Jost, Helvetica, Arial, sans-serif">';
  [0.25, 0.5, 0.75, 1].forEach(function (v) { s += '<polygon points="' + poli(function () { return v; }) + '" fill="none" stroke="' + malla + '" stroke-width="1"/>'; });
  ejes.forEach(function (c, i) {
    var p = pt(i, 1), e = pt(i, 1.2), cos = Math.cos(ang(i)), sin = Math.sin(ang(i));
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="' + malla + '"/>';
    var ancla = Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end');
    var dy = sin < -0.5 ? -4 : (sin > 0.5 ? 14 : 4);
    var nombre = SCI.CRITERIOS[i].t.split(' ');
    var l1 = nombre.slice(0, Math.ceil(nombre.length / 2)).join(' '), l2 = nombre.slice(Math.ceil(nombre.length / 2)).join(' ');
    if (sin < -0.5 && l2) dy -= 13;
    s += '<text x="' + e[0].toFixed(1) + '" y="' + (e[1] + dy).toFixed(1) + '" text-anchor="' + ancla + '" font-size="12.5" fill="' + tinta + '">' +
      DR.esc(l1) + (l2 ? '<tspan x="' + e[0].toFixed(1) + '" dy="14">' + DR.esc(l2) + '</tspan>' : '') + '</text>';
  });
  series.forEach(function (se) {
    var val = function (c) { var v = se.criterios[c]; return v === null || v === undefined ? 0 : Math.max(0, Math.min(1, v / 100)); };
    s += '<polygon points="' + poli(val) + '" fill="' + se.color + '" fill-opacity="' + (series.length > 1 ? 0.12 : 0.22) + '" stroke="' + se.color + '" stroke-width="2.4" stroke-linejoin="round"/>';
    ejes.forEach(function (c, i) {
      var p = pt(i, val(c));
      s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="' + se.color + '"/>';
      if (series.length === 1 && se.criterios[c] !== null && se.criterios[c] !== undefined) {
        var cos = Math.cos(ang(i)), sin = Math.sin(ang(i));
        var tx = p[0] + (Math.abs(cos) < 0.2 ? 0 : (cos > 0 ? 8 : -8)), ty = p[1] + (sin < -0.5 ? -8 : (sin > 0.5 ? 16 : -6));
        s += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + (Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end')) +
          '" font-size="12.5" font-weight="600" fill="' + (claro ? '#4B2DB5' : '#C9B8FF') + '">' + DR.num(se.criterios[c], 1) + '%</text>';
      }
    });
  });
  return s + '</svg>';
};

/* ------------------------------------------------------------ descargas */
SCI.excelJS = function () {
  return DR.cargarScript('../vendor/exceljs.min.js').then(function () {
    if (!window.ExcelJS) throw new Error('No se pudo cargar el generador de Excel.');
    return window.ExcelJS;
  });
};
SCI.descargar = function (blob, nombre) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 5000);
};
SCI.nombreArchivo = function (partes, ext) {
  return partes.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.' + ext;
};
