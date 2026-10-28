/* ============================================================================
 * vistas.js — REGISTROS (filtros zona · fundo · lote · variedad ·
 * grupo · planta, «Sólo resumen», CSV formato BD) Y CONFIG (con los permisos del admin).
 * Registros (y Registrar · Resumen) muestran lo de Integra (nube.js: todos los equipos, la APK y Planta,
 * según los permisos) más lo del equipo que aún no se sube; antes cada celular veía solo lo suyo.
 * ==========================================================================*/

/** Promedios de un conjunto de registros cerrados (los atípicos > 480 min no promedian). */
var RES = {};
RES.resumir = function (lista) {
  var cer = lista.filter(function (r) { return r.estado === 'cerrado'; });
  var o = { n: cer.length, atipicos: 0, total: 0, nTotal: 0, conf: 0, nConf: 0, enMeta: 0, nMeta: 0, esperas: 0, etapas: {} };
  TC.ETAPAS.forEach(function (e) { o.etapas[e.id] = { s: 0, n: 0, se: 0, ne: 0 }; });
  cer.forEach(function (r) {
    var c = TC.calcular(r);
    if (c.atipico) { o.atipicos++; return; }
    if (c.total !== null) { o.total += c.total; o.nTotal++; o.esperas += c.esperas; }
    if (c.conformacion !== null) { o.conf += c.conformacion; o.nConf++; }
    if (c.enMeta !== null) { o.nMeta++; if (c.enMeta) o.enMeta++; }
    TC.ETAPAS.forEach(function (e) {
      var k = c.etapas[e.id], x = o.etapas[e.id];
      if (k.min !== null) { x.s += k.min; x.n++; }
      if (k.espera !== null) { x.se += k.espera; x.ne++; }
    });
  });
  o.prom = o.nTotal ? o.total / o.nTotal : null;
  o.promConf = o.nConf ? o.conf / o.nConf : null;
  o.promEsperas = o.nTotal ? o.esperas / o.nTotal : 0;
  o.pctMeta = o.nMeta ? o.enMeta / o.nMeta * 100 : null;
  o.lenta = null; o.mayorEspera = null;
  TC.ETAPAS.forEach(function (e) {
    var x = o.etapas[e.id]; x.prom = x.n ? x.s / x.n : null; x.promEsp = x.ne ? x.se / x.ne : null;
    if (x.prom !== null && (!o.lenta || x.prom > o.etapas[o.lenta].prom)) o.lenta = e.id;
    if (x.promEsp !== null && (!o.mayorEspera || x.promEsp > o.etapas[o.mayorEspera].promEsp)) o.mayorEspera = e.id;
  });
  return o;
};
RES.barra = function (o) {
  var c = { etapas: {} };
  TC.ETAPAS.forEach(function (e) { c.etapas[e.id] = { min: o.etapas[e.id].prom, espera: o.etapas[e.id].promEsp }; });
  return TC.barra(c);
};
RES.nombreEtapa = function (id) { return id ? TC.E[id].nombre : '—'; };

/* ================================ REGISTROS ================================ */
var FIL = DR.leer('tcu.filtros', null) || {};
['zona', 'fundo', 'lote', 'variedad', 'grupo', 'planta', 'desde', 'hasta', 'estado'].forEach(function (k) { if (FIL[k] === undefined) FIL[k] = ''; });
if (FIL.resumen === undefined) FIL.resumen = false;

RES.filtrar = function () {
  return NUBE.todos().filter(function (r) {
    if (FIL.zona && r.zona !== FIL.zona) return false;
    if (FIL.fundo && r.fundo !== FIL.fundo) return false;
    if (FIL.lote && r.lote !== FIL.lote) return false;
    if (FIL.variedad && r.variedad !== FIL.variedad) return false;
    if (FIL.grupo && r.grupo !== FIL.grupo) return false;
    if (FIL.planta && r.planta !== FIL.planta) return false;
    if (FIL.desde && r.fecha < FIL.desde) return false;
    if (FIL.hasta && r.fecha > FIL.hasta) return false;
    var sinSubir = !!r.local && (!r.nube || !!r.sinSubir) && TC.pendiente(r);
    if (FIL.estado === 'borrador' && r.estado !== 'borrador') return false;
    if (FIL.estado === 'pendiente' && !sinSubir) return false;
    if (FIL.estado === 'subido' && !(r.estado === 'cerrado' && !sinSubir)) return false;
    if (FIL.estado === 'mios' && !r.local) return false;
    return true;
  });
};

VISTAS.registros = function (cont) {
  var regs = NUBE.todos(), antes = NUBE.hora;
  var usados = function (k) { return CAT.unicos(regs.map(function (r) { return r[k]; })).sort(); };
  var opt = function (v, t, sel) { return '<option value="' + DR.esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  var sel = function (id, k, todos, lista) { return '<select id="' + id + '">' + opt('', todos, FIL[k]) + lista.map(function (v) { return opt(v, v, FIL[k]); }).join('') + '</select>'; };
  var zonas = CAT.unicos(CAT.zonas().concat(usados('zona'))).sort();
  var fundos = CAT.unicos(CAT.filas().filter(function (f) { return !FIL.zona || f[0] === FIL.zona; }).map(function (f) { return f[1]; })
    .concat(regs.filter(function (r) { return !FIL.zona || r.zona === FIL.zona; }).map(function (r) { return r.fundo; }))).sort();
  var lotes = CAT.unicos(regs.filter(function (r) { return !FIL.fundo || r.fundo === FIL.fundo; }).map(function (r) { return r.lote; })).sort();

  cont.innerHTML = '<div class="vista">' +
    '<div class="enc entra"><div class="eti">Registros</div><h1>Tiempos de ciclo</h1><p>Todos los pallets de Integra (APK, Integra y Planta) que tus permisos te dejan ver' +
      (NUBE.hora ? ' · actualizado ' + DR.hace(NUBE.hora) : '') + '. Filtra por zona, fundo, lote, variedad, grupo y planta.</p></div>' +
    (NUBE.error ? '<div class="aviso alerta entra">No se pudo leer Integra (' + DR.esc(NUBE.error) + '). Se muestra la última copia del equipo.</div>' : '') +
    '<div class="filtros entra">' +
      sel('fZona', 'zona', 'Todas las zonas', zonas) +
      sel('fFundo', 'fundo', 'Todos los fundos', fundos) +
      sel('fLote', 'lote', 'Todos los lotes', lotes) +
      sel('fVariedad', 'variedad', 'Todas las variedades', usados('variedad')) +
      sel('fGrupo', 'grupo', 'Todos los grupos', usados('grupo')) +
      sel('fPlanta', 'planta', 'Todas las plantas', CAT.unicos(PERM.plantas().concat(usados('planta')))) +
      '<select id="fEstado">' + opt('', 'Todos los estados', FIL.estado) + opt('borrador', 'Borradores', FIL.estado) + opt('pendiente', 'Por subir', FIL.estado) + opt('subido', 'Sincronizados', FIL.estado) + opt('mios', 'De este equipo', FIL.estado) + '</select>' +
      '<label class="chk"><input type="checkbox" id="fResumen"' + (FIL.resumen ? ' checked' : '') + '> Sólo resumen</label>' +
      '<input type="date" id="fDesde" value="' + FIL.desde + '" aria-label="Desde"><input type="date" id="fHasta" value="' + FIL.hasta + '" aria-label="Hasta">' +
    '</div>' +
    '<div class="kpis entra" id="kpisReg"></div>' +
    '<div class="tarjeta entra" id="etapasReg"></div>' +
    '<div class="botones entra" style="margin-bottom:14px"><button class="btn primario" id="btnSubir" type="button">' + DR.ICO.subir + 'Subir a Integra</button>' +
      '<button class="btn" id="btnCsv" type="button">' + DR.ICO.descargar + 'Exportar CSV (BD)</button></div>' +
    '<div id="listaReg" class="entra"></div></div>';

  var pintar = function () {
    var l = RES.filtrar(), o = RES.resumir(l);
    DR.$('#kpisReg').innerHTML = '<div class="kpi"><b>' + o.n + '</b><span>Cerrados (' + l.length + ' total)</span></div>' +
      '<div class="kpi"><b>' + (o.prom !== null ? DR.num(o.prom, 1) : '—') + '</b><span>Ciclo prom. (min)</span></div>' +
      '<div class="kpi"><b>' + (o.promConf !== null ? DR.num(o.promConf, 1) : '—') + '</b><span>Conformación (min)</span></div>';
    DR.$('#etapasReg').innerHTML = '<h2>Promedio por etapa</h2>' + (o.nTotal ? RES.barra(o) + TC.leyenda() +
      '<table class="tabla"><tr><th>Etapa</th><th class="n">Tiempo</th><th class="n">Espera previa</th></tr>' + TC.ETAPAS.map(function (e) {
        var x = o.etapas[e.id];
        return '<tr><td><i style="background:' + e.color + '"></i>' + e.n + '. ' + e.nombre + '</td><td class="n">' + DR.dur(x.prom) + '</td><td class="n">' + (x.promEsp !== null ? DR.dur(x.promEsp) : '—') + '</td></tr>';
      }).join('') + '</table>' + (o.atipicos ? '<div class="ayuda-campo">' + o.atipicos + ' ciclo(s) atípico(s) (> ' + TC.ATIPICO + ' min) fuera del promedio.</div>' : '')
      : '<div class="vacio">Sin registros cerrados con estos filtros.</div>');
    if (FIL.resumen) { DR.$('#listaReg').innerHTML = RES.tablaResumen(l); return; }
    DR.$('#listaReg').innerHTML = l.length ? l.map(function (r) {
      var c = TC.calcular(r), est = NUBE.etiqueta(r);
      return '<div class="reg" data-id="' + r.id + '"><div class="l1"><span>' + DR.esc(TC.titulo(r)) + ' · ' + DR.esc(r.fundo) + '</span>' +
        '<span class="estado ' + est[1] + '">' + est[0] + '</span></div>' +
        '<div class="l2">' + DR.fechaCorta(r.fecha) + ' · Sem ' + TC.semana(r.fecha) + ' · ' + DR.esc(r.variedad) + ' · ' + DR.esc(r.grupo) + (r.planta ? ' → ' + DR.esc(r.planta) : '') + '</div>' +
        '<div class="l2"><b style="color:var(--texto)">Ciclo: ' + DR.dur(c.total) + '</b> · ' + c.completas + '/8 etapas' + (c.enMeta === false ? ' · <span style="color:var(--alerta)">sobre meta</span>' : '') + '</div>' +
        (r.nube && !r.local ? '<div class="l2">Registró ' + DR.esc(r.registrador || '—') + (r.dispositivo ? ' · ' + DR.esc(r.dispositivo) : '') + '</div>' : '') +
        TC.barra(c) + (r.local && r.error && TC.pendiente(r) ? '<div class="aviso alerta">' + DR.esc(r.error) + '</div>' : '') + '</div>';
    }).join('') : '<div class="vacio">No hay registros con estos filtros.</div>';
    DR.$$('#listaReg .reg').forEach(function (d) { d.onclick = function () { NUBE.abrir(d.getAttribute('data-id')); }; });
  };
  pintar();
  NUBE.cargar().then(function () { if (DR.vista === 'registros' && NUBE.hora !== antes) APP.ir('registros', true); });

  var cambiar = function (k, v, repintarTodo) { FIL[k] = v; DR.guardar('tcu.filtros', FIL); if (repintarTodo) APP.ir('registros', true); else pintar(); };
  DR.$('#fZona').onchange = function () { FIL.fundo = ''; FIL.lote = ''; cambiar('zona', this.value, true); };
  DR.$('#fFundo').onchange = function () { FIL.lote = ''; cambiar('fundo', this.value, true); };
  [['fLote', 'lote'], ['fVariedad', 'variedad'], ['fGrupo', 'grupo'], ['fPlanta', 'planta'], ['fEstado', 'estado'], ['fDesde', 'desde'], ['fHasta', 'hasta']].forEach(function (p) {
    DR.$('#' + p[0]).onchange = function () { cambiar(p[1], this.value); };
  });
  DR.$('#fResumen').onchange = function () { cambiar('resumen', this.checked); };
  DR.$('#btnSubir').onclick = function () {
    var b = this; b.disabled = true;
    SHEETS.subir().then(function () { APP.ir('registros', true); }, function () { b.disabled = false; });
  };
  DR.$('#btnCsv').onclick = function () { RES.csv(RES.filtrar()); };
  DR.entrarPaneles('#contenido');
};

/** «Sólo resumen»: promedios por fundo · lote, sin el detalle de cada pallet. */
RES.tablaResumen = function (l) {
  var g = {};
  l.forEach(function (r) { if (r.estado === 'cerrado') { var k = r.fundo + '|' + r.lote; (g[k] = g[k] || []).push(r); } });
  var k = Object.keys(g).sort();
  if (!k.length) return '<div class="vacio">Sin registros cerrados con estos filtros.</div>';
  return '<div class="tarjeta"><h2>Resumen por fundo y lote</h2><div style="overflow-x:auto"><table class="tabla"><tr><th>Fundo · lote</th><th class="n">Pallets</th><th class="n">Ciclo</th><th class="n">Conform.</th><th class="n">Esperas</th><th class="n">En meta</th></tr>' +
    k.map(function (x) {
      var o = RES.resumir(g[x]), p = x.split('|');
      return '<tr><td>' + DR.esc(p[0]) + ' · <b>' + DR.esc(p[1]) + '</b></td><td class="n">' + o.n + '</td><td class="n">' + DR.num(o.prom, 1) + '</td><td class="n">' +
        (o.promConf !== null ? DR.num(o.promConf, 1) : '—') + '</td><td class="n">' + DR.num(o.promEsperas, 1) + '</td><td class="n">' + (o.pctMeta !== null ? DR.num(o.pctMeta) + '%' : '—') + '</td></tr>';
    }).join('') + '</table></div><div class="ayuda-campo">Minutos promedio por pallet.</div></div>';
};

/** Encabezado de la hoja BD de «T. de ciclo - Uva 26-27.xlsx», en el mismo orden. */
RES.CAB_BD = ['SEMANA', 'FECHA', 'CAMPAÑA', 'ZONA', 'FUNDO', 'LOTE', 'SUBLOTE', 'PASADA', 'COLOR', 'VARIEDAD', 'GRUPO',
  'INICIO COSECHA', 'FIN COSECHA', 'T. Cosecha', 'T. espera traslado de jaba', 'INICIO TRASLADO DE JABA', 'FIN TRASLADO DE JABA', 'T. traslado jaba a pallet',
  'INICIO ARMADO PALLET', 'FIN ARMADO PALLET', 'N° JABAS', 'T. armado pallet', 'T. espera lecturado', 'INICIO LECTURADO', 'FIN LECTURADO', 'T. Lecturado',
  'T. espera enzunchado', 'INICIO ENZUNCHADO', 'FIN ENZUNCHADO', 'T. enzunchado', 'N° de zunchos', 'T. espera portabin', 'INICIO PORTABIN', 'FIN PORTABIN', 'T. portabin',
  'T. espera carga', 'Placa de camión', 'INICIO CARGA', 'FIN CARGA', 'T. carga', 'N° pallet totales', 'N° de pallet cargados', 'T. espera traslado',
  'T. CONFORMACIÓN DE CARGA', 'INICIO TRASLADO', 'FIN TRASLADO', 'T. traslado', 'PLANTA'];

/** Fila en el orden de la BD (horas HH:MM, minutos con número). Compartida con el CSV. */
RES.filaBD = function (r, n) {
  var c = TC.calcular(r), E = r.etapas, k = c.etapas;
  var h = function (id, f) { return DR.hhmm(E[id][f]); };
  return [TC.semana(r.fecha), DR.fechaCorta(r.fecha), r.campana, r.zona, r.fundo, r.lote, r.sublote, r.pasada, r.color, r.variedad, r.grupo,
    h('cos', 'ini'), h('cos', 'fin'), n(k.cos.min), n(k.tja.espera), h('tja', 'ini'), h('tja', 'fin'), n(k.tja.min),
    h('arm', 'ini'), h('arm', 'fin'), r.jabas, n(k.arm.min), n(k.lec.espera), h('lec', 'ini'), h('lec', 'fin'), n(k.lec.min),
    n(k.enz.espera), h('enz', 'ini'), h('enz', 'fin'), n(k.enz.min), r.zunchos, n(k.por.espera), h('por', 'ini'), h('por', 'fin'), n(k.por.min),
    n(k.car.espera), r.placa, h('car', 'ini'), h('car', 'fin'), n(k.car.min), r.palletsTot, r.palletsCarg, n(k.tra.espera),
    n(c.conformacion), h('tra', 'ini'), h('tra', 'fin'), n(k.tra.min), r.planta];
};

/** CSV (abre en Excel): mismas columnas que la BD + ciclo, estado, comentarios y quién registró. */
RES.csv = function (l) {
  if (!l.length) { DR.toast('No hay registros para exportar.', 'error'); return; }
  var cab = RES.CAB_BD.concat(['T. CICLO TOTAL', 'EN META', 'ESTADO', 'ID', 'REGISTRADO POR', 'COMENTARIOS', 'OBSERVACIÓN']);
  var q = function (v) { v = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var n = function (v) { return v === null || v === undefined ? '' : String(v).replace('.', ','); };
  var filas = l.map(function (r) {
    var c = TC.calcular(r);
    var com = TC.ETAPAS.filter(function (e) { return r.etapas[e.id].com || r.etapas[e.id].causa; })
      .map(function (e) { var x = r.etapas[e.id]; return e.nombre + ': ' + [x.causa, x.com].filter(Boolean).join(' - '); }).join(' | ');
    return RES.filaBD(r, n).concat([n(c.total), c.enMeta === null ? '' : (c.enMeta ? 'Sí' : 'No'), NUBE.etiqueta(r)[0], r.id, r.registrador, com, r.observacion]).map(q).join(';');
  });
  DR.entregarArchivo('TiempoCiclo_Uva_' + DR.hoyISO() + '.csv', '﻿' + [cab.map(q).join(';')].concat(filas).join('\r\n'), 'text/csv;charset=utf-8')
    .then(function (donde) { DR.toast(l.length + ' registro(s) exportado(s): ' + donde, 'ok'); }, function (e) { DR.toast('No se pudo exportar: ' + e.message, 'error'); });
};

/* ================================ CONFIG ================================ */
VISTAS.config = function (cont) {
  var s = TC.cfg.sheets, m = TC.cfg.metas;
  var campoMeta = function (k, rot) { return '<div class="campo"><label>' + rot + '</label><input type="number" min="0" step="0.5" data-meta="' + k + '" value="' + (m[k] || 0) + '"></div>'; };
  var propio = !!DR.leer('tcu.catalogo', null), P = PERM.datos();
  var bloq = !!P;  // con permisos importados, lo que define el admin ya no se edita en el celular
  cont.innerHTML = '<div class="vista">' +
    '<div class="enc entra"><div class="eti">Configuración</div><h1>Config</h1></div>' +

    '<div class="tarjeta entra"><h2>Quién registra</h2><p><b>' + DR.esc(TC.cfg.usuario) + '</b> · equipo ' + DR.esc(TC.cfg.dispositivo) + '</p>' +
      '<p class="ayuda-campo" style="margin-top:2px">Tu nombre sale de tu usuario de Integra.</p></div>' +

    '<div class="tarjeta entra"><h2>Integra</h2>' +
      '<p class="ayuda-campo" style="margin-top:0">Los registros se guardan en el equipo y suben solos a Integra (en vivo mientras el pallet está en proceso). ' +
        'Allí se suman con los de la APK sin chocar: cada pallet tiene su propio ID (<b>UV-IN-…</b> aquí, <b>UV-EQ-…</b> en la APK).</p>' +
      '<ul class="ayuda-campo" style="margin:6px 0 10px 18px">' +
        '<li>' + CAT.filas().length + ' lote(s) en ' + PERM.fundos().length + ' fundo(s)</li>' +
        '<li>Plantas: ' + DR.esc(PERM.plantas().join(', ')) + '</li>' +
        '<li>' + (P && Array.isArray(P.traslados) ? P.traslados.length : 0) + ' estándar(es) de traslado fundo → planta</li>' +
        '<li>Catálogo actualizado: ' + (P && P.actualizado ? new Date(P.actualizado).toLocaleString('es-PE') : '—') + '</li></ul>' +
      '<div class="botones"><button class="btn" id="btnCatIntegra" type="button">Actualizar catálogo</button><button class="btn primario" id="btnSubirCfg" type="button">' + DR.ICO.subir + 'Subir ahora</button></div>' +
      '<p class="ayuda-campo">Siempre en vivo: cada cambio (borradores, pallets en proceso y cerrados) sube solo apenas hay señal; sin señal queda en el equipo y sube al volver.</p>' +
      '<div class="ayuda-campo" style="margin-top:8px">Última subida: ' + (s.ultimaSubida ? new Date(s.ultimaSubida).toLocaleString('es-PE') : '—') + '</div></div>' +

    (AT.esAdmin() ? '<div class="tarjeta entra"><h2>APK · Apps Script</h2><p class="ayuda-campo" style="margin-top:0">Para que la APK también envíe a Integra: en la hoja de la APK, menú <b>Tiempo de ciclo → Configurar Integra…</b> y pega este token.</p>' +
      '<div class="fila" style="grid-template-columns:1fr auto"><input id="cToken" readonly value="" placeholder="Toca Mostrar"><button class="btn" id="btnToken" type="button">Mostrar</button></div></div>' : '') +

    '<div class="tarjeta entra"><h2>Metas (min)</h2><p class="ayuda-campo" style="margin-top:0;margin-bottom:10px">Referenciales: ajústalas a las metas oficiales. Al superarlas el celular avisa.' +
      (P && Array.isArray(P.traslados) && P.traslados.length ? ' El traslado a planta usa el <b>estándar fundo → planta</b> de los permisos.' : '') + '</p>' +
      '<div class="fila">' + TC.ETAPAS.map(function (e) { return campoMeta(e.id, e.n + '. ' + e.nombre); }).join('') + '</div>' +
      '<div class="fila3">' + campoMeta('espera', 'Espera máx. entre etapas') + campoMeta('conformacion', 'Conformación de carga') + campoMeta('total', 'Ciclo total') + '</div>' +
      '<label class="chk"><input type="checkbox" id="cAlertas"' + (TC.cfg.alertas ? ' checked' : '') + '> Avisar (vibración / notificación) cuando una etapa o espera supere su meta</label>' +
      '<button class="btn primario" id="btnMetas" type="button">Guardar metas</button></div>' +

    (bloq ? '<div class="tarjeta entra"><h2>Campaña y líderes</h2><p>Campaña: <b>' + DR.esc(TC.cfg.campana) + '</b></p>' +
        '<p class="ayuda-campo">Los líderes se eligen por zona y lote desde la lista de Integra.</p></div>'
      : '<div class="tarjeta entra"><h2>Campaña y grupos</h2>' +
        '<div class="campo"><label for="cCampana">Campaña de los registros nuevos</label><input id="cCampana" maxlength="30" value="' + DR.esc(TC.cfg.campana) + '"></div>' +
        '<div class="campo"><label for="cGrupos">Grupos / líderes (uno por línea)</label><textarea id="cGrupos" rows="4">' + DR.esc(TC.cfg.grupos.join('\n')) + '</textarea></div>' +
        '<button class="btn primario" id="btnCampana" type="button">Guardar</button></div>') +

    '<div class="tarjeta entra"><h2>Catálogo de lotes</h2><p class="ayuda-campo" style="margin-top:0">' + CAT.filas().length + ' lotes · ' + CAT.fundos('').length + ' fundos' +
      (bloq ? ' (los de Integra). Los administra Ingeniería de Procesos.</p></div>' : propio ? ' (catálogo propio)' : ' (catálogo de fábrica)') + (bloq ? ''
      : '. Para reemplazarlo pega desde Excel las columnas <b>Zona · Fundo · Lote · Variedad</b>.</p>' +
      '<div class="campo"><textarea id="cCatalogo" rows="4" placeholder="ALTA&#9;LA PAUSA&#9;PU1&#9;AUTUMN CRISP"></textarea></div>' +
      '<div class="botones"><button class="btn primario" id="btnCatalogo" type="button">Reemplazar catálogo</button>' + (propio ? '<button class="btn" id="btnCatFabrica" type="button">Volver al de fábrica</button>' : '') + '</div></div>') +

    '<div class="tarjeta entra"><h2>Respaldo</h2><p class="ayuda-campo" style="margin-top:0;margin-bottom:10px">Copia de todos los registros del equipo en un archivo.</p>' +
      '<div class="botones"><button class="btn" id="btnExpJson" type="button">Exportar respaldo</button><label class="btn" style="cursor:pointer">Restaurar<input type="file" id="inJson" accept=".json,application/json" class="oculto"></label></div></div>' +
    '<p class="ayuda-campo" style="text-align:center">Tiempo de Ciclo Uva v' + DR.VERSION + ' · Integra · Don Ricardo</p>' +
  '</div>';

  DR.$('#btnSubirCfg').onclick = function () { SHEETS.subir().then(function () { APP.ir('config', true); }, function () {}); };
  DR.$('#btnCatIntegra').onclick = function () {
    PERM.cargar().then(function (p) { DR.toast('Catálogo actualizado: ' + p.catalogo.length + ' lotes.', 'ok'); APP.ir('config', true); },
      function (e) { DR.toast('No se pudo actualizar (' + e.message + '). Se sigue con el guardado en el equipo.', 'error'); });
  };
  if (DR.$('#btnToken')) DR.$('#btnToken').onclick = function () {
    AT.rpc('rpc_uva_token_apk').then(function (t) { var i = DR.$('#cToken'); i.value = t; i.select(); }, function (e) { DR.toast(e.message, 'error'); });
  };
  DR.$('#btnMetas').onclick = function () {
    DR.$$('[data-meta]').forEach(function (i) { m[i.getAttribute('data-meta')] = Math.max(0, Number(i.value) || 0); });
    TC.cfg.alertas = DR.$('#cAlertas').checked;
    TC.guardarCfg(); ALERTAS.permiso();
    TC.registros().forEach(function (r) { if (TC.enProceso(r)) ALERTAS.sync(r); });
    DR.toast('Metas guardadas. Se aplican a todos los cálculos.', 'ok');
  };
  if (DR.$('#btnCampana')) DR.$('#btnCampana').onclick = function () {
    var v = CAT.limpiar(DR.$('#cCampana').value);
    if (!v) { DR.toast('Escribe la campaña (ej. UVA 26-27).', 'error'); return; }
    TC.cfg.campana = v;
    TC.cfg.grupos = CAT.unicos(DR.$('#cGrupos').value.split(/\r?\n/).map(CAT.limpiar));
    TC.guardarCfg(); DR.toast('Guardado.', 'ok');
  };
  if (DR.$('#btnCatalogo')) DR.$('#btnCatalogo').onclick = function () {
    var f = CAT.desdeTexto(DR.$('#cCatalogo').value);
    if (f.length < 1) { DR.toast('No se reconocieron filas «Zona · Fundo · Lote · Variedad».', 'error'); return; }
    DR.confirmar('Reemplazar catálogo', 'Se usarán <b>' + f.length + '</b> lotes en lugar del catálogo actual. Los registros ya hechos no cambian.', 'Reemplazar', function () {
      DR.guardar('tcu.catalogo', f); DR.toast('Catálogo actualizado: ' + f.length + ' lotes.', 'ok'); APP.ir('config', true);
    });
  };
  if (DR.$('#btnCatFabrica')) DR.$('#btnCatFabrica').onclick = function () {
    try { localStorage.removeItem('tcu.catalogo'); } catch (e) { /* sin almacenamiento */ }
    DR.toast('Catálogo de fábrica restaurado.', 'ok'); APP.ir('config', true);
  };
  DR.$('#btnExpJson').onclick = function () {
    DR.entregarArchivo('Respaldo_TiempoCicloUva_' + DR.hoyISO() + '.json',
      JSON.stringify({ app: 'tiempo-ciclo-uva', version: DR.VERSION, fecha: new Date().toISOString(), registros: TC.registros() }, null, 1), 'application/json')
      .then(function (donde) { DR.toast('Respaldo guardado: ' + donde, 'ok'); }, function (e) { DR.toast('No se pudo guardar: ' + e.message, 'error'); });
  };
  DR.$('#inJson').onchange = function () {
    var f = this.files[0]; if (!f) return;
    var lector = new FileReader();
    lector.onload = function () {
      try {
        var d = JSON.parse(lector.result), n = 0;
        if (!d || !Array.isArray(d.registros)) throw new Error();
        d.registros.forEach(function (r) { if (r && r.id && r.etapas && r.etapas.cos && !TC.obtener(r.id)) { TC._regs.push(r); n++; } });
        TC._regs.sort(function (a, b) { return a.creado < b.creado ? 1 : -1; });
        TC.persistir(); DR.toast(n + ' registro(s) restaurado(s). Los que ya existían no se tocaron.', 'ok'); APP.estado();
      } catch (e) { DR.toast('El archivo no es un respaldo válido.', 'error'); }
    };
    lector.readAsText(f);
  };
  DR.entrarPaneles('#contenido');
};
