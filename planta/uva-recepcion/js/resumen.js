/* ============================================================================
 * resumen.js — RESUMEN DE RECEPCIÓN UVA (planta), réplica del Resumen de campo sin el mapa
 * (las plantas no tienen polígonos). Datos: rpc_uva_planta_resumen (0063), últimos 120 días,
 * ciclos continuados en planta o iniciados allí.
 *   · Filtros: semana, día, planta, línea.
 *   · KPI: tiempo en planta, registros, fin de carga → llegada, ciclo completo.
 *   · Minutos por tramo (traslado desde la carga + tramos de planta; esperas punteadas).
 *   · Tiempo promedio por planta, línea, placa, fundo, origen, hora de llegada o día; «Ver tabla».
 *   · Causas de demora marcadas en planta (cuántas veces).
 *   · Tabla dinámica planta › día › camión (expandir, contraer, copiar a Outlook / Excel).
 *   · Evolución: líneas por planta del tiempo en planta o de un tramo, por día o semana.
 *   Tiempos en planta > 480 min (atípicos) o negativos no promedian.
 * ==========================================================================*/
var PR = { filas: null, hoy: null, error: '', hora: null, abiertos: {}, verTabla: false, ATIPICO: 480, CACHE: 'integra.uvapl.resumen' };
PR.f = (function () { try { return JSON.parse(localStorage.getItem('integra.uvapl.resumen.f')) || {}; } catch (e) { return {}; } })();
['semana', 'dia', 'planta', 'linea'].forEach(function (k) { if (PR.f[k] === undefined) PR.f[k] = ''; });
PR.f.dim = PR.f.dim || 'planta';
PR.f.met = PR.f.met || 't_en_planta';
PR.f.eje = PR.f.eje || 'dia';
PR.guardarF = function () { try { localStorage.setItem('integra.uvapl.resumen.f', JSON.stringify(PR.f)); } catch (e) { /* sin almacenamiento */ } };

/** Tramos en orden del proceso: [clave, nombre, corto, espera]. */
PR.TRAMOS = [
  ['t_llegada_desde_carga', 'Fin de carga → llegada a planta', 'Traslado', false],
  ['t_espera_recepcion', 'Espera de recepción', 'Esp. recep.', true],
  ['t_espera_descarga', 'Espera de descarga', 'Esp. desc.', true],
  ['t_descarga', 'Descarga', 'Descarga', false],
  ['t_espera_abastecimiento', 'Espera de abastecimiento a línea', 'Esp. abast.', true]
];
PR.METRICAS = [['t_en_planta', 'Tiempo en planta (llegada → abastecimiento)'], ['t_ciclo_completo', 'Ciclo completo (cosecha → abastecimiento)']]
  .concat(PR.TRAMOS.map(function (t) { return [t[0], t[1]]; }));
PR.DIMS = [['planta', 'Planta'], ['linea', 'Línea'], ['placa', 'Placa'], ['fundo', 'Fundo'], ['origen', 'Origen'], ['franja', 'Hora de llegada'], ['fecha', 'Día']];
PR.COLORES = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#9085E9'];

PR.fecha = function (d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; };
PR.horaLima = function (iso) { var d = new Date(iso); return isNaN(d) ? null : d.getHours(); };
PR.valor = function (r, k) {
  var v = r[k];
  if (v === null || v === undefined || v === '' || isNaN(v)) return null;
  v = Number(v);
  if (v < 0 || (k !== 't_ciclo_completo' && v > PR.ATIPICO)) return null;
  return v;
};
PR.dimValor = function (r, d) {
  if (d === 'origen') return PL.origenTxt(r);
  if (d === 'franja') { var h = r.hora_llegada ? PR.horaLima(r.hora_llegada) : null; return h === null ? 'Sin llegada' : PL.pad(h) + ':00 – ' + PL.pad(h) + ':59'; }
  if (d === 'fecha') return r.fecha || 'Sin fecha';
  if (d === 'linea') return r.linea ? 'Línea ' + r.linea : 'Sin línea';
  return r[d] || 'Sin ' + PR.dimNombre(d).toLowerCase();
};
PR.dimNombre = function (d) { return (PR.DIMS.filter(function (x) { return x[0] === d; })[0] || [d, d])[1]; };

/** Promedio de cada tramo y del tiempo en planta, cada uno con su propio n. */
PR.resumir = function (l) {
  var o = { n: l.length, completos: 0, prom: {}, nk: {} };
  ['t_en_planta', 't_ciclo_completo'].concat(PR.TRAMOS.map(function (t) { return t[0]; })).forEach(function (k) {
    var s = 0, n = 0;
    l.forEach(function (r) { var v = PR.valor(r, k); if (v !== null) { s += v; n++; } });
    o.prom[k] = n ? s / n : null; o.nk[k] = n;
  });
  o.completos = o.nk.t_en_planta;
  return o;
};

/* ------------------------------------------------ datos */
PR.leerCache = function () {
  try { var c = JSON.parse(localStorage.getItem(PR.CACHE)); if (c) { PR.filas = c.filas; PR.hoy = c.hoy; PR.hora = c.hora; } } catch (e) { /* sin copia */ }
};
PR.cargar = function () {
  return AT.rpc('rpc_uva_planta_resumen', { p_desde: null }).then(function (d) {
    PR.filas = (d && d.filas) || []; PR.hoy = d && d.hoy; PR.hora = new Date().toISOString(); PR.error = '';
    try { localStorage.setItem(PR.CACHE, JSON.stringify({ filas: PR.filas, hoy: PR.hoy, hora: PR.hora })); } catch (e) { /* lleno */ }
  }, function (e) { PR.error = e.message || String(e); });
};
PR.filtrar = function (l) {
  return l.filter(function (r) {
    if (PR.f.dia) { if (r.fecha !== PR.f.dia) return false; }
    else if (PR.f.semana && String(r.semana) !== String(PR.f.semana)) return false;
    if (PR.f.planta && r.planta !== PR.f.planta) return false;
    if (PR.f.linea && String(r.linea || '') !== PR.f.linea) return false;
    return true;
  });
};
PR.unicos = function (a) { var o = {}; a.forEach(function (x) { if (x !== null && x !== undefined && x !== '') o[x] = true; }); return Object.keys(o); };

/* ================================================================ VISTA */
VIS.resumen = function (c) {
  if (!PR.filas) PR.leerCache();
  PR.pintar(c);
  PR.cargar().then(function () { if (DR.vista === 'resumen') PR.pintar(c, true); });
  clearInterval(VIS._t);
  VIS._t = setInterval(function () {
    if (DR.vista !== 'resumen' || !navigator.onLine || document.visibilityState !== 'visible' || DR.$('#hoja:not(.oculto)')) return;
    var antes = JSON.stringify(PR.filas);
    PR.cargar().then(function () { if (DR.vista === 'resumen' && JSON.stringify(PR.filas) !== antes) PR.pintar(c, true); });
  }, 60000);
};

PR.pintar = function (c, quieto) {
  var y = c.scrollTop, todos = PR.filas || [];
  if (!PR.filas) { c.innerHTML = '<div class="vista">' + VIS.pestanas('resumen') + '<div class="vacio">Cargando el resumen…</div></div>'; return; }
  var semanas = PR.unicos(todos.map(function (r) { return r.semana; })).sort(function (a, b) { return b - a; });
  var dias = PR.unicos(todos.filter(function (r) { return !PR.f.semana || String(r.semana) === String(PR.f.semana); }).map(function (r) { return r.fecha; })).sort().reverse();
  var plantas = PR.unicos(todos.map(function (r) { return r.planta; })).sort();
  var lineas = PR.unicos(todos.filter(function (r) { return !PR.f.planta || r.planta === PR.f.planta; }).map(function (r) { return r.linea; }))
    .sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
  var l = PR.filtrar(todos), o = PR.resumir(l);
  var opt = function (v, t, sel) { return '<option value="' + DR.esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  var ambito = (PR.f.dia ? 'Día ' + PR.fecha(PR.f.dia) : (PR.f.semana ? 'Semana ' + PR.f.semana : 'Últimos 120 días')) +
    [PR.f.planta, PR.f.linea ? 'Línea ' + PR.f.linea : ''].filter(Boolean).map(function (x) { return ' · ' + x; }).join('');
  var e = quieto ? '' : ' entra';
  var kp = function (k) { return o.prom[k] === null ? '—' : UI.mmss(o.prom[k]) + '<small>min:seg</small>'; };
  var tramos = PR.TRAMOS.filter(function (t) { return o.prom[t[0]] !== null; }).map(function (t) { return { t: t[1], v: o.prom[t[0]], espera: t[3] }; });

  c.innerHTML = '<div class="vista">' + VIS.pestanas('resumen') +
    UI.encabezado('Ingeniería · Planta · en vivo', 'Resumen · ' + ambito,
      'Camiones recibidos en planta (ciclos continuados en planta o iniciados allí).' + (PR.hora ? ' Actualizado ' + DR.hace(PR.hora) + '.' : '')) +
    (PR.error ? '<div class="aviso alerta">No se pudo leer Integra (' + DR.esc(PR.error) + '). Se muestra la última copia del equipo.</div>' : '') +
    '<div class="res-selectores' + e + '" style="margin-bottom:14px">' +
      '<select id="prSemana" aria-label="Semana">' + opt('', 'Todas las semanas', PR.f.semana) + semanas.map(function (s) { return opt(s, 'Semana ' + s, PR.f.semana); }).join('') + '</select>' +
      '<select id="prDia" aria-label="Día">' + opt('', 'Todos los días', PR.f.dia) + dias.map(function (d) { return opt(d, PR.fecha(d) + '/' + d.slice(0, 4), PR.f.dia); }).join('') + '</select>' +
      '<select id="prPlanta" aria-label="Planta">' + opt('', 'Todas las plantas', PR.f.planta) + plantas.map(function (p) { return opt(p, p, PR.f.planta); }).join('') + '</select>' +
      '<select id="prLinea" aria-label="Línea">' + opt('', 'Todas las líneas', PR.f.linea) + lineas.map(function (x) { return opt(x, 'Línea ' + x, PR.f.linea); }).join('') + '</select>' +
    '</div>' +
    '<div class="kpis' + e + '">' +
      UI.kpi('Tiempo en planta', kp('t_en_planta'), 'Llegada → abastecimiento · ' + o.nk.t_en_planta + ' completo(s)', '#76B729') +
      UI.kpi('Registros', DR.num(o.n), (o.n - o.completos) + ' aún sin abastecimiento', '#0097CE') +
      UI.kpi('Fin de carga → llegada', kp('t_llegada_desde_carga'), o.nk.t_llegada_desde_carga + ' con datos de campo', '#EF7C3B') +
      UI.kpi('Ciclo completo', kp('t_ciclo_completo'), 'Inicio de cosecha → abastecimiento', '#7A3E8E') +
    '</div>' +
    '<section class="panel' + e + '"><h2>Minutos por tramo · ' + DR.esc(ambito) + '</h2>' +
      '<div class="sub">Promedio de cada tramo (min:seg). Fila punteada = espera (camión detenido). Cada tramo promedia los registros que lo tienen completo; los de más de ' + PR.ATIPICO + ' min no cuentan.</div>' +
      (tramos.length ? UI.barrasTramos(tramos) : '<div class="vacio">Aún no hay tramos completos.</div>') + '</section>' +
    '<section class="panel' + e + '"><div class="gr-cab"><div><h2>Tiempo promedio por ' + DR.esc(PR.dimNombre(PR.f.dim).toLowerCase()) + '</h2>' +
      '<div class="sub">Tiempo en planta promedio, de mayor a menor. Toca una barra para ver el detalle; «Ver tabla» muestra cada tramo.</div></div>' +
      '<div class="gr-acc" role="group" aria-label="Agrupar por">' + PR.DIMS.map(function (d) {
        return '<button type="button" data-dim="' + d[0] + '" class="' + (d[0] === PR.f.dim ? 'activo' : '') + '">' + d[1] + '</button>'; }).join('') +
      '<button type="button" class="gr-tabla' + (PR.verTabla ? ' activo' : '') + '" id="prVerTabla">' + (PR.verTabla ? 'Ver gráfico' : 'Ver tabla') + '</button></div></div>' +
      '<div id="prGrupo"></div></section>' +
    '<section class="panel' + e + '"><h2>Causas de demora</h2><div class="sub">Veces que se marcó cada causa en «Causa / nota» de una marca de planta.</div>' + PR.causasHtml(l) + '</section>' +
    '<section class="panel' + e + '"><h2>Promedio por planta · ' + DR.esc(ambito) + '</h2>' +
      '<div class="sub">Tabla dinámica (min:seg): toca una planta para ver sus días y un día para ver sus camiones. Columnas en cursiva = esperas.</div>' +
      '<div class="piv-barra"><button class="btn sec chico" id="prAbrir" type="button">Expandir todo</button><button class="btn sec chico" id="prCerrar" type="button">Contraer todo</button>' +
      '<button class="btn verde chico" id="prCopiar" type="button">Copiar tabla</button></div>' +
      '<div class="tabla-cont piv" id="prPiv">' + PR.pivotHtml(l) + '</div></section>' +
    '<section class="panel' + e + '"><h2>Evolución</h2><div class="sub">Una línea por planta (máx. 6) y el promedio de todas, por día o por semana.</div>' +
      '<div id="prEvo">' + PR.evoHtml(l) + '</div></section>' +
  '</div>';

  if (!quieto) DR.entrarPaneles('#contenido'); else c.scrollTop = y;
  var cambiar = function (k, v) {
    PR.f[k] = v;
    if (k === 'semana') PR.f.dia = '';
    if (k === 'planta') PR.f.linea = '';
    PR.guardarF(); PR.pintar(c, true);
  };
  DR.$('#prSemana').onchange = function () { cambiar('semana', this.value); };
  DR.$('#prDia').onchange = function () { cambiar('dia', this.value); };
  DR.$('#prPlanta').onchange = function () { cambiar('planta', this.value); };
  DR.$('#prLinea').onchange = function () { cambiar('linea', this.value); };
  DR.$$('[data-dim]', c).forEach(function (b) { b.onclick = function () { cambiar('dim', b.getAttribute('data-dim')); }; });
  DR.$('#prVerTabla').onclick = function () { PR.verTabla = !PR.verTabla; PR.pintar(c, true); };
  DR.$$('[data-piv]', c).forEach(function (tr) { tr.onclick = function () { var k = tr.getAttribute('data-piv'); PR.abiertos[k] = !PR.abiertos[k]; PR.pintar(c, true); }; });
  DR.$$('[data-reg]', c).forEach(function (tr) { tr.onclick = function () { location.hash = '#reg/' + encodeURIComponent(tr.getAttribute('data-reg')); }; });
  DR.$('#prAbrir').onclick = function () { l.forEach(function (r) { var p = r.planta || 'Sin planta'; PR.abiertos[p] = true; PR.abiertos[p + '|' + (r.fecha || '')] = true; }); PR.pintar(c, true); };
  DR.$('#prCerrar').onclick = function () { PR.abiertos = {}; PR.pintar(c, true); };
  DR.$('#prCopiar').onclick = PR.copiar;
  DR.$('#prMet').onchange = function () { cambiar('met', this.value); };
  DR.$$('[data-eje]', c).forEach(function (b) { b.onclick = function () { cambiar('eje', b.getAttribute('data-eje')); }; });
  PR.montarGrupo(l);
};

/* ------------------------------------------------ tiempo promedio por … */
PR.montarGrupo = function (l) {
  var caja = DR.$('#prGrupo'), d = PR.f.dim, g = {};
  l.forEach(function (r) { var k = PR.dimValor(r, d); (g[k] = g[k] || []).push(r); });
  var items = Object.keys(g).map(function (k) { return { k: k, o: PR.resumir(g[k]) }; });
  if (!items.length) { caja.innerHTML = '<div class="vacio">Sin registros con estos filtros.</div>'; return; }
  var tp = function (x) { return x.o.prom.t_en_planta === null ? -1 : x.o.prom.t_en_planta; };
  if (d === 'franja' || d === 'fecha') items.sort(function (a, b) { return a.k.localeCompare(b.k); }); else items.sort(function (a, b) { return tp(b) - tp(a); });
  if (PR.verTabla) {
    caja.innerHTML = '<div class="tabla-cont piv"><table><thead><tr><th>' + DR.esc(PR.dimNombre(d)) + '</th><th>Reg.</th>' +
      PR.TRAMOS.map(function (t) { return '<th title="' + DR.esc(t[1]) + '"' + (t[3] ? ' style="font-style:italic"' : '') + '>' + DR.esc(t[2]) + '</th>'; }).join('') + '<th>En planta</th></tr></thead><tbody>' +
      items.map(function (x) {
        return '<tr><td class="piv-etq">' + DR.esc(d === 'fecha' ? PR.fecha(x.k) : x.k) + '</td><td class="num">' + x.o.n + '</td>' +
          PR.TRAMOS.map(function (t) { return '<td class="num"' + (t[3] ? ' style="font-style:italic"' : '') + '>' + UI.mmss(x.o.prom[t[0]]) + '</td>'; }).join('') +
          '<td class="num"><b>' + UI.mmss(x.o.prom.t_en_planta) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    return;
  }
  var vis = items.slice(0, 30).map(function (x) {
    var v = x.o.prom.t_en_planta, etq = d === 'fecha' ? PR.fecha(x.k) : x.k;
    return { etq: etq, sub: x.o.n + ' registro(s)' + (x.o.n - x.o.completos ? ' · ' + (x.o.n - x.o.completos) + ' sin abastecimiento' : ''), valor: v,
      tip: '<b>' + DR.esc(etq) + '</b><br>Tiempo en planta: <b>' + (v === null ? 'sin completos' : UI.dur(v)) + '</b>' +
        PR.TRAMOS.filter(function (t) { return x.o.prom[t[0]] !== null; }).map(function (t) { return '<br>' + DR.esc(t[1]) + ': ' + UI.mmss(x.o.prom[t[0]]); }).join('') +
        '<br>' + x.o.n + ' registro(s)' };
  });
  caja.innerHTML = GRAFICO.barras(vis, 0) + (items.length > 30 ? '<div class="gf-nota">Se muestran 30 de ' + items.length + '. «Ver tabla» los lista todos.</div>' : '');
  GRAFICO.montar(caja, vis);
};

/* ------------------------------------------------ causas de demora */
PR.causasHtml = function (l) {
  var n = {}, tot = 0;
  l.forEach(function (r) {
    var det = r.planta_detalle || {};
    Object.keys(det).forEach(function (k) { var ca = det[k] && det[k].causa; if (ca) { n[ca] = (n[ca] || 0) + 1; tot++; } });
  });
  var ks = Object.keys(n).sort(function (a, b) { return n[b] - n[a]; });
  if (!ks.length) return '<div class="vacio">No se marcaron causas de demora con estos filtros.</div>';
  var max = n[ks[0]];
  return ks.map(function (k) {
    return '<div class="gf-fila"><div class="gf-nombre">' + DR.esc(k) + '</div><div class="gf-pista"><span class="gf-barra sobre" style="width:' + (n[k] / max * 100).toFixed(1) + '%"></span></div>' +
      '<div class="gf-cifra">' + n[k] + ' <small>' + Math.round(n[k] / tot * 100) + '%</small></div></div>';
  }).join('');
};

/* ------------------------------------------------ tabla dinámica planta › día › camión */
PR.pivotHtml = function (l) {
  if (!l.length) return '<div class="vacio">Sin registros con estos filtros.</div>';
  var celdas = function (o) {
    return PR.TRAMOS.map(function (t) { return '<td class="num"' + (t[3] ? ' style="font-style:italic"' : '') + '>' + UI.mmss(o.prom[t[0]]) + '</td>'; }).join('') +
      '<td class="num"><b>' + UI.mmss(o.prom.t_en_planta) + '</b></td><td class="num">' + UI.mmss(o.prom.t_ciclo_completo) + '</td>';
  };
  var por = {};
  l.forEach(function (r) { var p = r.planta || 'Sin planta'; por[p] = por[p] || {}; (por[p][r.fecha || ''] = por[p][r.fecha || ''] || []).push(r); });
  var h = '<table><thead><tr><th>Planta › día › camión</th><th>Reg.</th>' +
    PR.TRAMOS.map(function (t) { return '<th title="' + DR.esc(t[1]) + '"' + (t[3] ? ' style="font-style:italic"' : '') + '>' + DR.esc(t[2]) + '</th>'; }).join('') +
    '<th>En planta</th><th>Ciclo completo</th></tr></thead><tbody>';
  Object.keys(por).sort().forEach(function (p) {
    var todos = []; Object.keys(por[p]).forEach(function (d) { todos = todos.concat(por[p][d]); });
    var ab = PR.abiertos[p];
    h += '<tr class="piv-n1" data-piv="' + DR.esc(p) + '" style="cursor:pointer"><td class="piv-etq"><b>' + (ab ? '▾ ' : '▸ ') + DR.esc(p) + '</b></td><td class="num">' + todos.length + '</td>' + celdas(PR.resumir(todos)) + '</tr>';
    if (!ab) return;
    Object.keys(por[p]).sort().reverse().forEach(function (d) {
      var k = p + '|' + d, ad = PR.abiertos[k], regs = por[p][d];
      h += '<tr class="piv-n2" data-piv="' + DR.esc(k) + '" style="cursor:pointer"><td class="piv-etq" style="padding-left:22px">' + (ad ? '▾ ' : '▸ ') + PR.fecha(d) + '</td><td class="num">' + regs.length + '</td>' + celdas(PR.resumir(regs)) + '</tr>';
      if (ad) regs.forEach(function (r) {
        h += '<tr class="piv-ciclo" data-reg="' + DR.esc(r.id) + '" style="cursor:pointer"><td class="piv-etq">' + PL.horaCorta(r.hora_llegada) + ' · ' + DR.esc(r.placa || '—') +
          (r.linea ? ' · L' + DR.esc(r.linea) : '') + (r.pallet ? ' · P' + DR.esc(r.pallet) : '') + '</td><td class="num">' + DR.esc(PL.origenTxt(r)) + '</td>' + celdas(PR.resumir([r])) + '</tr>';
      });
    });
  });
  return h + '<tr class="fila-total"><td class="piv-etq"><b>Total general</b></td><td class="num">' + l.length + '</td>' + celdas(PR.resumir(l)) + '</tr></tbody></table>';
};
PR.copiar = function () {
  var t = DR.$('#prPiv table');
  if (!t) return;
  var limpio = function (s) { return s.replace(/[▸▾] /g, ''); };
  var html = '<table border="1" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">' + limpio(t.innerHTML.replace(/ data-[a-z-]+="[^"]*"/g, '').replace(/ style="[^"]*"/g, '')) + '</table>';
  var texto = DR.$$('tr', t).map(function (tr) { return DR.$$('th,td', tr).map(function (x) { return limpio(x.textContent).trim(); }).join('\t'); }).join('\n');
  UI.copiarHtml(html, texto).then(function () { DR.toast('Tabla copiada: pégala en Outlook o Excel.', 'ok'); }, function () { DR.toast('No se pudo copiar.', 'error'); });
};

/* ------------------------------------------------ evolución (líneas por planta) */
PR.evoHtml = function (l) {
  var met = PR.METRICAS.filter(function (m) { return m[0] === PR.f.met; })[0] || PR.METRICAS[0];
  var ctl = '<div class="res-selectores" style="margin-bottom:8px"><select id="prMet" aria-label="Métrica">' +
    PR.METRICAS.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === met[0] ? ' selected' : '') + '>' + DR.esc(m[1]) + '</option>'; }).join('') + '</select>' +
    '<div class="gr-acc" style="margin:0">' + [['dia', 'Por día'], ['semana', 'Por semana']].map(function (x) {
      return '<button type="button" data-eje="' + x[0] + '" class="' + (PR.f.eje === x[0] ? 'activo' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
  var clave = function (r) { return PR.f.eje === 'semana' ? String(r.semana || 0).padStart(2, '0') : r.fecha; };
  var acc = {}, xsO = {};
  l.forEach(function (r) {
    var v = PR.valor(r, met[0]); if (v === null || !clave(r)) return;
    var k = clave(r); xsO[k] = true;
    [r.planta || 'Sin planta', '__todas'].forEach(function (s) { acc[s] = acc[s] || {}; var a = acc[s][k] = acc[s][k] || [0, 0]; a[0] += v; a[1]++; });
  });
  var xs = Object.keys(xsO).sort();
  if (!xs.length) return ctl + '<div class="vacio">Sin datos de «' + DR.esc(met[1]) + '» con estos filtros.</div>';
  var series = Object.keys(acc).filter(function (s) { return s !== '__todas'; }).sort().slice(0, PR.COLORES.length);
  var lineas = series.map(function (s, i) { return { s: s, c: PR.COLORES[i], v: acc[s] }; });
  if (series.length > 1) lineas.push({ s: 'Todas las plantas', c: '#B7A99C', v: acc.__todas, punteada: true });
  var vals = [];
  lineas.forEach(function (ln) { xs.forEach(function (k) { if (ln.v[k]) vals.push(ln.v[k][0] / ln.v[k][1]); }); });
  var maxV = Math.max.apply(null, vals.concat([0.1])) * 1.1;
  var W = 640, H = 240, ml = 44, mr = 12, mt = 12, mb = 30, iw = W - ml - mr, ih = H - mt - mb;
  var X = function (i) { return ml + (xs.length === 1 ? iw / 2 : i * iw / (xs.length - 1)); };
  var Y = function (v) { return mt + ih - v / maxV * ih; };
  var svg = '<svg class="evo-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de ' + DR.esc(met[1]) + '">';
  for (var g = 0; g <= 4; g++) {
    var gv = maxV * g / 4;
    svg += '<line class="evo-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '"/>' +
      '<text class="evo-eje" x="' + (ml - 6) + '" y="' + (Y(gv) + 4).toFixed(1) + '" text-anchor="end">' + UI.mmss(gv) + '</text>';
  }
  var paso = Math.max(1, Math.ceil(xs.length / 8));
  xs.forEach(function (k, i) {
    if (i % paso === 0 || i === xs.length - 1) svg += '<text class="evo-eje" x="' + X(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + (PR.f.eje === 'semana' ? 'S' + Number(k) : PR.fecha(k)) + '</text>';
  });
  lineas.forEach(function (ln) {
    var d = '', pts = '';
    xs.forEach(function (k, i) {
      var a = ln.v[k]; if (!a) return;
      var v = a[0] / a[1];
      d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      pts += '<circle class="evo-punto" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.5" fill="' + ln.c + '"><title>' +
        DR.esc(ln.s + ' · ' + (PR.f.eje === 'semana' ? 'Semana ' + Number(k) : PR.fecha(k)) + ': ' + UI.mmss(v) + ' min:seg · ' + a[1] + ' registro(s)') + '</title></circle>';
    });
    svg += '<path class="evo-linea' + (ln.punteada ? ' punteada' : '') + '" d="' + d + '" stroke="' + ln.c + '"/>' + pts;
  });
  svg += '</svg>';
  return ctl + '<div class="evo-leyenda">' + lineas.map(function (ln) { return '<span><i class="' + (ln.punteada ? 'punteada' : '') + '" style="--c:' + ln.c + '"></i>' + DR.esc(ln.s) + '</span>'; }).join('') + '</div>' + svg;
};
