/* ============================================================================
 * resultados.js — PESTAÑA «RESULTADOS»
 * Por revisión: KPIs, resultado por encargado (consolidado entre plantas),
 * detalle de hallazgos con el formato del correo y el histórico por encargado.
 * «Copiar resumen» deja el texto y las tablas listos para pegar en Outlook.
 * ==========================================================================*/
var RES_MP = { revId: null, HISTORICO: 12 };

VISTAS.resultados = function (cont) {
  Promise.all([MP.revisiones(false), AT.rpc('fn_mp_resultados', { p_revision: null })]).then(function (r) {
    var revs = r[0], filas = r[1] || [];
    if (!revs.length) {
      cont.innerHTML = UI.encabezado('Plan de mantenimiento', 'Resultados', '') +
        UI.panel('Sin revisiones', '', '<div class="vacio">Aún no se ha cargado ningún plan.</div>' +
          (AT.puedeCapturar() ? '<div class="acciones"><button type="button" class="btn verde grande" id="btnIrCargar">' + DR.ICONOS.subir + 'Cargar plan</button></div>' : ''));
      DR.entrarPaneles('#contenido');
      if (DR.$('#btnIrCargar')) DR.$('#btnIrCargar').onclick = function () { DR.ir('cargar'); };
      return;
    }
    if (!revs.some(function (v) { return v.id === RES_MP.revId; })) RES_MP.revId = revs[0].id;
    var rev = revs.filter(function (v) { return v.id === RES_MP.revId; })[0];
    return MP.ots(rev.id, true).then(function (hallazgos) { RES_MP.pintar(cont, revs, filas, rev, hallazgos); });
  }).catch(function (e) { UI.error(cont, e); });
};

/** Filas del correo: una por observación y una por no conformidad (NC primero). */
RES_MP.detalle = function (rev, ots) {
  var lista = [];
  ['no_conformidad', 'observacion'].forEach(function (k) {
    ots.forEach(function (o) {
      if (o[k]) lista.push({ mes: MP.MESES[rev.mes - 1], fecha: MP.fecha(o.fecha_hallazgo), tipo: k === 'no_conformidad' ? 'No conformidad' : 'Observación',
        detalle: o[k], ot: o.num_ot, planta: o.planta, supervisor: o.responsable, fotos: o.fotos || [] });
    });
  });
  return lista;
};

RES_MP.pintar = function (cont, revs, filas, rev, hallazgos) {
  var enc = filas.filter(function (f) { return f.revision_id === rev.id; })
    .map(function (f) { return { responsable: f.responsable, plantas: f.plantas, n: Number(f.total_ot), obs: Number(f.n_obs), nc: Number(f.n_nc), resultado: Number(f.resultado) }; })
    .sort(function (a, b) { return a.resultado - b.resultado || (a.responsable < b.responsable ? -1 : 1); });
  var tot = { n: 0, obs: 0, nc: 0 };
  enc.forEach(function (e) { tot.n += e.n; tot.obs += e.obs; tot.nc += e.nc; });
  var global = MP.puntaje(tot.nc), det = RES_MP.detalle(rev, hallazgos);
  RES_MP.actual = { rev: rev, enc: enc, tot: tot, det: det };

  var opciones = revs.map(function (v) {
    return '<option value="' + v.id + '"' + (v.id === rev.id ? ' selected' : '') + '>' + DR.esc(MP.etiqueta(v) + ' · ' + v.codigo + (v.estado === 'en_curso' ? ' (en curso)' : '')) + '</option>';
  }).join('');

  var barras = enc.map(function (e) {
    var color = e.resultado >= 100 ? '#76B729' : (e.resultado >= 98.5 ? '#EF7C3B' : '#E5484D');
    // La barra muestra el tramo 90–100 % para que medio punto se note.
    var ancho = Math.max(4, Math.min(100, (e.resultado - 90) * 10));
    return '<div class="barra-fila"><div>' + DR.esc(e.responsable) + '</div><div class="barra-pista"><div class="barra-valor" style="width:' + ancho + '%;background:' + color + '"></div></div>' +
      '<div class="barra-cifra">' + MP.pct(e.resultado) + '</div></div>';
  }).join('');

  var tablaEnc = UI.tabla([
    { t: 'Encargado', r: function (e) { return '<b>' + DR.esc(e.responsable) + '</b>'; } },
    { t: 'Plantas', k: 'plantas' },
    { t: '# OT', k: 'n', num: true },
    { t: 'Observaciones', num: true, r: function (e) { return e.obs || ''; } },
    { t: 'No conformidades', num: true, r: function (e) { return e.nc || ''; } },
    { t: 'Resultado', num: true, r: function (e) { return MP.pillPuntaje(e.resultado); } }
  ], enc);

  var tablaDet = det.length ? UI.tabla([
    { t: 'Mes', k: 'mes' },
    { t: 'Fecha', k: 'fecha' },
    { t: 'Hallazgo', r: function (d) { return '<span class="' + (d.tipo === 'No conformidad' ? 'mp-rojo' : 'mp-ambar') + '">' + d.tipo + '</span>'; } },
    { t: 'Detalle', r: function (d) { return '<div class="mp-detalle">' + DR.esc(d.detalle) + '</div>'; } },
    { t: 'OT', k: 'ot' },
    { t: 'Planta', k: 'planta' },
    { t: 'Supervisor', k: 'supervisor' },
    { t: 'Fotos', r: function (d) { return FOTOS.galeriaHtml(d.fotos, 'foto-grupo chico'); } }
  ], det) : '<div class="vacio">Sin observaciones ni no conformidades en esta revisión.</div>';

  cont.innerHTML = UI.encabezado('Plan de mantenimiento', 'Resultados',
    'Cada no conformidad descuenta ' + DR.num(MP.DESCUENTO_NC, 1) + ' % al encargado. El resultado por encargado suma todas sus plantas.') +
    '<section class="panel entra"><div class="form">' +
      '<div class="campo ancho"><label for="resRev">Revisión</label><select id="resRev">' + opciones + '</select></div></div></section>' +
    '<div class="kpis entra">' +
      UI.kpi('OT revisadas', tot.n, rev.codigo + ' · ' + MP.fecha(rev.fecha_revision), '#0097CE') +
      UI.kpi('Observaciones', tot.obs, '', '#E8B04A') +
      UI.kpi('No conformidades', tot.nc, '', '#E5484D') +
      UI.kpi('Resultado ' + MP.MESES[rev.mes - 1], MP.pct(global), rev.estado === 'en_curso' ? 'Revisión en curso' : 'Revisión cerrada', '#76B729') +
    '</div>' +
    UI.panel('Resultado por encargado', 'Ordenado de menor a mayor resultado.', barras + '<div style="margin-top:14px">' + tablaEnc + '</div>' +
      '<div class="acciones"><button type="button" class="btn verde" id="btnCopiarResumen">Copiar resumen para correo</button>' +
      '<button type="button" class="btn sec" id="btnIrRevision">Abrir revisión</button></div>') +
    UI.panel('Detalle de hallazgos', det.length + ' registro(s).', tablaDet) +
    UI.panel('Histórico por encargado', 'Resultado de las últimas ' + RES_MP.HISTORICO + ' revisiones (no se arrastran hallazgos entre revisiones).', RES_MP.historicoHtml(revs, filas));

  DR.entrarPaneles('#contenido');
  FOTOS.pintar(cont);
  DR.$('#resRev').onchange = function () {
    RES_MP.revId = this.value;
    cont.innerHTML = '<div class="vacio">Cargando resultados…</div>';
    VISTAS.resultados(cont);
  };
  DR.$('#btnIrRevision').onclick = function () { REV.abrir(rev.id); };
  DR.$('#btnCopiarResumen').onclick = RES_MP.copiar;
};

RES_MP.historicoHtml = function (revs, filas) {
  var cols = revs.slice(0, RES_MP.HISTORICO).reverse(), mapa = {}, nombres = [];
  filas.forEach(function (f) {
    if (!mapa[f.responsable]) { mapa[f.responsable] = {}; nombres.push(f.responsable); }
    mapa[f.responsable][f.revision_id] = Number(f.resultado);
  });
  nombres.sort();
  var etiqueta = function (v) { return MP.MESES[v.mes - 1].substring(0, 3) + ' ' + String(v.anio).substring(2); };
  var h = '<div class="tabla-cont"><table class="mp-tabla"><thead><tr><th>Encargado</th>' +
    cols.map(function (v) { return '<th class="num" title="' + DR.esc(v.codigo) + '">' + DR.esc(etiqueta(v)) + '</th>'; }).join('') + '</tr></thead><tbody>';
  nombres.forEach(function (n) {
    h += '<tr><td>' + DR.esc(n) + '</td>' + cols.map(function (v) {
      var x = mapa[n][v.id];
      return '<td class="num">' + (x === undefined ? '—' : MP.pillPuntaje(x)) + '</td>';
    }).join('') + '</tr>';
  });
  return h + '</tbody></table></div>';
};

/* ============================================================ RESUMEN PARA CORREO */
RES_MP.copiar = function () {
  var a = RES_MP.actual, rev = a.rev, mes = MP.MESES[rev.mes - 1], global = MP.pct(MP.puntaje(a.tot.nc));
  var titulo = 'PLAN DE MANTENIMIENTO MES DE ' + mes.toUpperCase() + ' ' + rev.anio;
  var intro = 'Comparto el detalle de los hallazgos en la revisión del Plan de Mantenimiento del mes de ' + mes + '. Se ha encontrado un total de ' +
    a.tot.obs + ' observaciones y ' + a.tot.nc + ' no conformidades.';
  var tablaTxt = function (cab, filas) { return [cab].concat(filas).map(function (f) { return f.join('\t'); }).join('\n'); };
  var cabEnc = ['Encargado', 'Plantas', '# OT', 'Observaciones', 'No conformidades', 'Resultado'];
  var filasEnc = a.enc.map(function (e) { return [e.responsable, e.plantas, e.n, e.obs, e.nc, MP.pct(e.resultado)]; });
  var cabDet = ['Mes', 'Fecha', 'Hallazgo', 'Detalle', 'OT', 'Planta', 'Supervisor'];
  var filasDet = a.det.map(function (d) { return [d.mes, d.fecha, d.tipo, d.detalle, d.ot, d.planta, d.supervisor]; });

  var texto = titulo + '\n\n' + intro + '\n\n' +
    tablaTxt(['Hallazgos', 'Cantidad'], [['Observación', a.tot.obs], ['No conformidad', a.tot.nc]]) + '\n\n' +
    'Resultado ' + mes + '\t' + global + '\n\n' +
    tablaTxt(cabEnc, filasEnc) + (filasDet.length ? '\n\n' + tablaTxt(cabDet, filasDet) : '') + '\n';

  var th = 'style="background:#5B9BD5;color:#fff;border:1px solid #9DC3E6;padding:4px 8px;font-weight:bold"';
  var td = 'style="border:1px solid #9DC3E6;padding:4px 8px"';
  var tablaHtml = function (cab, filas, colorFn) {
    return '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt"><tr>' +
      cab.map(function (c) { return '<th ' + th + '>' + DR.esc(c) + '</th>'; }).join('') + '</tr>' +
      filas.map(function (f) {
        return '<tr>' + f.map(function (c, i) {
          var color = colorFn ? colorFn(f, i) : '';
          return '<td ' + td.replace('"', '"' + (color ? 'color:' + color + ';' : '')) + '>' + DR.esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';
  };
  var html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">' +
    '<p><b>' + DR.esc(titulo) + '</b></p><p>' + DR.esc(intro) + '</p>' +
    tablaHtml(['Hallazgos', 'Cantidad'], [['Observación', a.tot.obs], ['No conformidad', a.tot.nc]]) + '<br>' +
    '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt"><tr><td style="border:1px solid #000;padding:4px 8px"><b>Resultado ' + DR.esc(mes) +
    '</b></td><td style="border:1px solid #000;padding:4px 16px"><b>' + DR.esc(global) + '</b></td></tr></table><br>' +
    tablaHtml(cabEnc, filasEnc) + '<br>' +
    (filasDet.length ? tablaHtml(cabDet, filasDet, function (f, i) { return i === 2 ? (f[2] === 'No conformidad' ? '#FF0000' : '#C65911') : ''; }) : '') +
    '</div>';

  var ok = function () { DR.toast('Resumen copiado: pégalo en el correo.'); };
  var fallo = function (e) { DR.toast((e && e.message) || 'No se pudo copiar.', 'error'); };
  if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
    navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([texto], { type: 'text/plain' })
    })]).then(ok).catch(function () { UI.copiar(texto).then(ok, fallo); });
  } else {
    UI.copiar(texto).then(ok, fallo);
  }
};
