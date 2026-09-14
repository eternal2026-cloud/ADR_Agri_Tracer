/* ============================================================================
 * ui.js — HELPERS DE RENDER COMPARTIDOS (Resumen, Captura, Configuración)
 * ==========================================================================*/
var UI = {};

/** Tramos de tiempo del pivot, mismo orden que Postgres/Excel. */
var CAMPOS_RESUMEN = [
  { clave: 't_cosecha', titulo: 'Cosecha' },
  { clave: 't_espera_jabero', titulo: 'Espera Jabero' },
  { clave: 't_jabero', titulo: 'Jabero' },
  { clave: 't_estadia_cs', titulo: 'Estadía C. Sombra' },
  { clave: 't_carga_moto', titulo: 'Carga Motocarga' },
  { clave: 't_espera_traslado', titulo: 'Espera Traslado a C.A.' },
  { clave: 't_traslado_ca', titulo: 'Traslado a C.A.' },
  { clave: 't_espera_descarga', titulo: 'Espera Descarga/Armado' },
  { clave: 't_descarga_ca', titulo: 'Descarga y Armado' },
  { clave: 't_estadia_ca', titulo: 'Estadía en C.A.' },
  { clave: 't_carga_camion', titulo: 'Carga al Camión' },
  { clave: 't_espera_traslado_planta', titulo: 'Espera Traslado a Planta' },
  { clave: 't_traslado_planta', titulo: 'Traslado a Planta' }
];

UI.kpi = function (etq, val, nota, color) {
  return '<div class="kpi" style="--acento:' + (color || '#0097CE') + '"><div class="etq">' + DR.esc(etq) + '</div>' +
    '<div class="val">' + val + '</div>' + (nota ? '<div class="nota">' + nota + '</div>' : '') + '</div>';
};
UI.panel = function (titulo, sub, cuerpo) {
  return '<section class="panel entra"><h2>' + DR.esc(titulo) + '</h2>' + (sub ? '<div class="sub">' + DR.esc(sub) + '</div>' : '') + cuerpo + '</section>';
};

/** Hoja inferior (bottom sheet). opc.fija: no se cierra al tocar el velo (p. ej. credenciales). */
UI.abrirHoja = function (html, opc) {
  var hoja = DR.$('#hoja');
  if (!hoja) {
    hoja = document.createElement('div');
    hoja.id = 'hoja';
    hoja.innerHTML = '<div id="hojaVelo"></div><div id="hojaTarjeta" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(hoja);
  }
  DR.$('#hojaVelo').onclick = (opc && opc.fija) ? null : UI.cerrarHoja;
  DR.$('#hojaTarjeta').innerHTML = html;
  hoja.classList.remove('oculto');
  if (DR.anima) {
    anime.remove(['#hojaVelo', '#hojaTarjeta']);
    anime({ targets: '#hojaVelo', opacity: [0, 1], duration: 260, easing: 'linear' });
    anime({ targets: '#hojaTarjeta', translateY: ['100%', '0%'], duration: 480, easing: 'easeOutCubic' });
  }
};
UI.cerrarHoja = function () {
  var hoja = DR.$('#hoja');
  if (!hoja) return;
  if (!DR.anima) { hoja.classList.add('oculto'); return; }
  anime({ targets: '#hojaVelo', opacity: 0, duration: 220, easing: 'linear' });
  anime({ targets: '#hojaTarjeta', translateY: '100%', duration: 300, easing: 'easeInCubic', complete: function () { hoja.classList.add('oculto'); } });
};

/** Copia texto al portapapeles (con alternativa para navegadores sin Clipboard API). */
UI.copiar = function (texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  return new Promise(function (resolve, reject) {
    var t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { if (document.execCommand('copy')) resolve(); else reject(new Error('No se pudo copiar.')); } catch (e) { reject(e); }
    document.body.removeChild(t);
  });
};
UI.tabla = function (columnas, filas, claseFilaFn) {
  if (!filas.length) return '<div class="vacio">No hay registros para este filtro.</div>';
  var h = '<div class="tabla-cont"><table><thead><tr>';
  columnas.forEach(function (c) { h += '<th>' + DR.esc(c.t) + '</th>'; });
  h += '</tr></thead><tbody>';
  filas.forEach(function (f) {
    var clase = claseFilaFn ? claseFilaFn(f) : '';
    h += '<tr class="' + clase + '"' + (f._clic ? ' data-clic="1"' : '') + (f._idx !== undefined ? ' data-idx="' + f._idx + '"' : '') + '>';
    columnas.forEach(function (c) {
      var v = c.r ? c.r(f) : DR.esc(f[c.k]);
      h += '<td class="' + (c.num ? 'num' : '') + '">' + (v === '' || v === undefined || v === null ? '—' : v) + '</td>';
    });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
};
UI.pill = function (texto, mapa) {
  mapa = mapa || {};
  var etiqueta = texto === true ? 'Sí' : (texto === false ? 'No' : (texto || '—'));
  var clase = texto === true ? 'verde' : (texto === false ? 'gris' : (mapa[texto] || 'gris'));
  return '<span class="pill ' + clase + '">' + DR.esc(etiqueta) + '</span>';
};
UI.leerForm = function (idForm) {
  var obj = {};
  DR.$$('#' + idForm + ' [data-campo]').forEach(function (el) { obj[el.getAttribute('data-campo')] = el.type === 'checkbox' ? el.checked : el.value; });
  return obj;
};
UI.encabezado = function (ruta, titulo, texto, extra) {
  return '<div class="encabezado"><div><div class="ruta">' + DR.esc(ruta) + '</div><h1>' + DR.esc(titulo) + '</h1>' +
    (texto ? '<p>' + DR.esc(texto) + '</p>' : '') + '</div><div>' + (extra || '') + '</div></div>';
};
UI.migas = function (pasos) {
  return '<div class="migas">' + pasos.map(function (p, i) {
    var sep = i > 0 ? '<span class="sep">›</span>' : '';
    return sep + (p.accion ? '<button type="button" data-miga="' + i + '">' + DR.esc(p.texto) + '</button>' : '<button type="button" disabled>' + DR.esc(p.texto) + '</button>');
  }).join('') + '</div>';
};
UI.error = function (cont, err) {
  cont.innerHTML = '<div class="panel"><div class="aviso alerta"><b>No se pudo cargar la información.</b><br>' + DR.esc(err && err.message ? err.message : err) + '</div></div>';
};

/* ---- columnas comunes del pivot (Resumen y Muestras las reutilizan) ---- */
UI.columnasResumen = function () {
  return [{ t: 'Fundo', k: 'fundo' }, { t: 'N° muestras', k: 'n_muestras', num: true }]
    .concat(CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, num: true, r: function (f) { return DR.num(f[c.clave], 1); } }; }))
    .concat([
      { t: 'Total ciclo (min)', num: true, r: function (f) { return '<b>' + DR.num(f.t_ciclo_total, 1) + '</b>'; } },
      { t: 'Horas', num: true, r: function (f) { return DR.num(f.tiempo_horas, 2); } }
    ]);
};
