/* ============================================================================
 * obs-pasadas.js — OBSERVACIONES DE AUDITORÍAS PASADAS (EXCEL MANUAL)
 * Desde el panel lateral de fotos (panel-fotos.js): para empezar a auditar en la
 * app cuando las auditorías anteriores se hicieron a mano. Se sube el Excel de
 * Observaciones (mismo formato que «Descargar Excel»: N°, Semana, Fecha de
 * Registro, Zona, Observaciones, Acción correctiva, Estado, Fecha de cierre,
 * Antes, Después) y sus observaciones del área se registran sin auditoría, con
 * la fecha, el N° y el estado del Excel (rpc_s5_importar_obs_pasada).
 * Por defecto solo las abiertas (Pendiente, En ejecución, Stand By). Las que ya
 * están en la zona (mismo texto) no se repiten. Las fotos son opcionales.
 * Usa los lectores de celdas e imágenes de avance.js (AV).
 * ==========================================================================*/
var OPAS = { archivo: null, plan: null, todas: false };

OPAS.abrir = function () {
  var a = AUD.aud, area = S5.area(a.area_id) || {}, cul = S5.cultivo(a.cultivo_id);
  OPAS.archivo = null;
  OPAS.plan = null;
  OPAS.todas = false;
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.subir + '<span>Auditoría pasada · Excel</span></div>' +
    '<div class="res-nombre">' + S5.iconoCultivo(cul, 26) + ' ' + DR.esc(area.nombre || '') + '</div>' +
    '<div class="res-dni" style="letter-spacing:0">Sube el Excel de Observaciones de una auditoría hecha a mano (mismo formato que «Descargar Excel»). ' +
      'Las observaciones del área se cargan con su fecha, N° y estado para darles seguimiento aquí. Las que ya están en la app no se repiten.</div>' +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo ancho"><label>Archivo Excel (.xlsx)<em>obligatorio</em></label>' +
        '<label class="foto-carga" id="opArchivoZona"><input type="file" id="opArchivo" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
        '<span class="foto-prev">' + DR.ICONOS.subir + '</span><span class="foto-txt"><b>Elegir archivo</b><span>Observaciones de la auditoría pasada</span></span></label></div>' +
      '<div class="campo"><label for="opFecha">Fecha de la auditoría</label><input id="opFecha" type="date" max="' + S5.hoy() + '">' +
        '<div class="ayuda-campo">Solo para las filas sin «Fecha de Registro».</div></div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="opCancelar">Cancelar</button>' +
    '<button type="button" class="btn azul" id="opRevisar" style="flex:1">Revisar observaciones</button></div>', { fija: true });

  DR.$('#opCancelar').onclick = UI.cerrarHoja;
  DR.$('#opArchivo').onchange = function () {
    OPAS.archivo = this.files && this.files[0] ? this.files[0] : null;
    DR.$('#opArchivoZona').classList.toggle('lista', !!OPAS.archivo);
    DR.$('#opArchivoZona .foto-txt b').textContent = OPAS.archivo ? OPAS.archivo.name : 'Elegir archivo';
    DR.$('#opArchivoZona .foto-txt span').textContent = OPAS.archivo ? DR.num(OPAS.archivo.size / 1024) + ' KB · toca para cambiarlo' : 'Observaciones de la auditoría pasada';
  };
  DR.$('#opRevisar').onclick = function () {
    var btn = this;
    if (!OPAS.archivo) { DR.toast('Elige el archivo Excel.', 'error'); return; }
    btn.disabled = true;
    btn.classList.add('cargando');
    btn.textContent = 'Leyendo Excel…';
    OPAS.analizar(OPAS.archivo, DR.$('#opFecha').value || null, function (t) { btn.textContent = t; }).then(function (plan) {
      OPAS.plan = plan;
      OPAS.pintarPlan();
    }).catch(function (e) {
      btn.disabled = false;
      btn.classList.remove('cargando');
      btn.textContent = 'Revisar observaciones';
      DR.toast(e.message, 'error');
    });
  };
};

/* ------------------------------------------------------------ lectura */
OPAS.clave = function (zonaId, texto) { return zonaId + '|' + AV.blando(texto).toLowerCase(); };

OPAS.analizar = function (archivo, fechaDefecto, progreso) {
  var a = AUD.aud, area = S5.area(a.area_id) || {}, buf, wb, enCelda, filas = [];
  var plan = { filas: [], avisos: [], otras: 0, hojas: 0 };
  var zonasArea = S5.zonasDe(a.area_id, true, a.cultivo_id);
  var buscarZona = function (txt) {
    var t = String(txt || '').trim(), num = t.match(/^(\d+)\s*(?:[.\-)]|$)/), n = AV.norm(t.replace(/^\s*\d+\s*[.\-)]?\s*/, ''));
    return (n && zonasArea.filter(function (z) { return AV.norm(z.nombre) === n; })[0]) ||
      (num && zonasArea.filter(function (z) { return z.numero === Number(num[1]); })[0]) || null;
  };

  return archivo.arrayBuffer().then(function (b) {
    buf = b;
    return Promise.all([INF.excelJS(), AV.imagenesEnCelda(buf)]);
  }).then(function (r) {
    enCelda = r[1];
    wb = new r[0].Workbook();
    return wb.xlsx.load(buf).catch(function () { throw new Error('No se pudo leer el archivo. ¿Es un Excel .xlsx?'); });
  }).then(function () {
    wb.eachSheet(function (ws) {
      var t = AV.titulos(ws, ['zona', 'observaciones', 'estado']);
      if (!t) return;
      var c = t.col;
      if (!c.area) {
        // Hoja con nombre de otra área conocida: no es de esta.
        var otra = S5.areas.filter(function (x) { return AV.norm(x.nombre) === AV.norm(ws.name); })[0];
        if (otra && otra.id !== area.id) { plan.otras++; return; }
      }
      plan.hojas++;
      var flot = AV.imagenesFlotantes(wb, ws), celdaImg = enCelda[ws.name] || {};
      var fotosDe = function (fila, col) { return col ? (flot[fila + '|' + col] || []).concat(celdaImg[fila + '|' + col] || []) : []; };
      var val = function (f, k) { return c[k] ? AV.valor(f.getCell(c[k])) : null; };

      for (var n = t.fila + 1; n <= ws.rowCount; n++) {
        var f = ws.getRow(n), desc = AV.texto(val(f, 'observaciones')), zonaTxt = AV.texto(val(f, 'zona'));
        if (!desc && !zonaTxt) continue;
        if (c.area && AV.norm(val(f, 'area')) && AV.norm(val(f, 'area')) !== AV.norm(area.nombre)) { plan.otras++; continue; }
        var ref = '«' + ws.name + '» fila ' + n;
        if (!desc) { plan.avisos.push(ref + ': sin texto de observación. Se omite.'); continue; }
        var z = buscarZona(zonaTxt);
        if (!z) { plan.avisos.push(ref + ': la zona «' + zonaTxt + '» no existe en ' + area.nombre + '. Agrégala o corrige el nombre.'); continue; }
        if (!z.activo) { plan.avisos.push(ref + ': la zona ' + S5.nombreZona(z) + ' está desactivada. Se omite.'); continue; }
        var estadoTxt = AV.texto(val(f, 'estado')), estado = AV.estado(estadoTxt);
        if (estado === undefined) { plan.avisos.push(ref + ': estado «' + estadoTxt + '» no reconocido; se carga como Pendiente.'); estado = null; }
        var fecha = AV.iso(val(f, 'fecha de registro'));
        if (fecha && fecha > S5.hoy()) { plan.avisos.push(ref + ': la fecha ' + S5.fecha(fecha) + ' está en el futuro. Se omite.'); continue; }
        // «Acción // nota // nota»: la primera parte es la acción y el resto, notas de seguimiento.
        var partes = AV.texto(val(f, 'accion correctiva')).split(/\s*\/\/\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
        filas.push({ ref: ref, z: z, num: AV.numero(val(f, 'n')), desc: desc, accion: partes[0] || '', notas: partes.slice(1),
          estado: estado || 'Pendiente', fecha: fecha, sinFecha: !fecha, cierre: AV.iso(val(f, 'fecha de cierre')),
          fAntes: fotosDe(n, c.antes), fDespues: fotosDe(n, c.despues) });
      }
    });
    if (!plan.hojas) throw new Error('El Excel no tiene hojas de Observaciones (títulos Zona, Observaciones y Estado).');
    progreso('Comparando con la app…');
    return sb.from('s5_observaciones').select('zona_id,numero,descripcion, s5_auditorias(estado)').eq('cultivo_id', a.cultivo_id).eq('area_id', a.area_id).limit(5000);
  }).then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var existentes = {};
    (r.data || []).forEach(function (o) {
      if (!o.s5_auditorias || o.s5_auditorias.estado !== 'anulada') existentes[OPAS.clave(o.zona_id, o.descripcion)] = o.numero;
    });
    var vistas = {};
    filas.forEach(function (x) {
      var k = OPAS.clave(x.z.id, x.desc);
      if (existentes[k] !== undefined) { x.yaEsta = existentes[k]; return; }
      if (vistas[k]) { plan.avisos.push(x.ref + ': repite una observación de ' + vistas[k] + '. Se omite.'); x.repetida = true; return; }
      vistas[k] = x.ref;
      if (x.sinFecha) {
        if (fechaDefecto) x.fecha = fechaDefecto;
        else { x.fecha = S5.hoy(); plan.avisos.push(x.ref + ': sin fecha de registro; se usa hoy (puedes indicar la fecha de la auditoría).'); }
      }
    });
    var hechas = 0, nuevas = filas.filter(function (x) { return x.yaEsta === undefined && !x.repetida; });
    return INF.enLotes(nuevas, 3, function (x) {
      return Promise.all([AV.fotosNuevas(x.fAntes, []), AV.fotosNuevas(x.fDespues, [])]).then(function (f) {
        x.fotosAntes = f[0].nuevas;
        x.fotosDespues = f[1].nuevas;
        if (f[0].ilegibles || f[1].ilegibles) plan.avisos.push(x.ref + ': ' + (f[0].ilegibles + f[1].ilegibles) + ' imagen(es) en un formato que el navegador no lee (p. ej. EMF). Pégalas como JPG o PNG.');
        hechas++;
        progreso('Revisando fotos ' + hechas + ' de ' + nuevas.length + '…');
      });
    }).then(function () {
      plan.filas = filas.filter(function (x) { return !x.repetida; });
      plan.filas.forEach(function (x) { x.elegida = x.yaEsta === undefined && S5.ABIERTOS.indexOf(x.estado) > -1; });
      return plan;
    });
  });
};

/* ------------------------------------------------------------ vista previa */
OPAS.cargables = function () {
  return OPAS.plan.filas.filter(function (x) { return x.yaEsta === undefined && (OPAS.todas || S5.ABIERTOS.indexOf(x.estado) > -1); });
};

OPAS.pintarPlan = function () {
  var plan = OPAS.plan, area = S5.area(AUD.aud.area_id) || {};
  var cargables = OPAS.cargables(), yaEstan = plan.filas.filter(function (x) { return x.yaEsta !== undefined; });
  var cerradas = plan.filas.filter(function (x) { return x.yaEsta === undefined && S5.ABIERTOS.indexOf(x.estado) < 0; });
  var elegidas = cargables.filter(function (x) { return x.elegida; });
  cargables.sort(function (x, y) { return x.z.numero - y.z.numero || (x.num || 0) - (y.num || 0); });

  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#F8B68A">' + DR.ICONOS.subir + '<span>Auditoría pasada · revisión</span></div>' +
    '<div class="res-nombre">' + DR.esc(area.nombre || '') + '</div>' +
    '<div class="res-dni" style="letter-spacing:0">' + DR.esc(OPAS.archivo ? OPAS.archivo.name : '') + '</div>' +
    '<div class="av-kpis">' +
      '<div><b>' + elegidas.length + '</b><span>por cargar</span></div>' +
      '<div><b>' + yaEstan.length + '</b><span>ya en la app</span></div>' +
      '<div><b>' + cerradas.length + '</b><span>cerradas u otras</span></div></div>' +
    (cerradas.length ? '<label class="op-todas"><input type="checkbox" id="opTodas"' + (OPAS.todas ? ' checked' : '') + '> Incluir también las ' + cerradas.length +
      ' cerradas, canceladas o recomendaciones (historial)</label>' : '') +
    (cargables.length ? '<div class="op-lista">' + cargables.map(function (x) {
      var i = plan.filas.indexOf(x), fotos = (x.fotosAntes || []).concat(x.fotosDespues || []);
      return '<label class="op-fila" style="--c:' + (S5.COLOR_ESTADO[x.estado] || '#A89A8C') + '"><input type="checkbox" data-op="' + i + '"' + (x.elegida ? ' checked' : '') + '>' +
        '<span class="op-cuerpo"><span class="obs-top"><b>' + DR.esc(S5.nombreZona(x.z)) + (x.num ? ' · N° ' + x.num : '') + '</b>' + S5.pillEstado(x.estado) + '</span>' +
        '<span class="op-desc">' + DR.esc(DR.recortar(x.desc, 180)) + '</span>' +
        '<small>' + S5.fecha(x.fecha) + (x.sinFecha ? ' (sin fecha en el Excel)' : '') + (x.accion ? ' · Acción: ' + DR.esc(DR.recortar(x.accion, 70)) : '') +
          (x.notas.length ? ' · ' + x.notas.length + ' nota(s)' : '') + (fotos.length ? '' : ' · sin fotos') + '</small>' +
        AV.miniaturas(fotos) + '</span></label>';
    }).join('') + '</div>' : '<div class="aviso ok" style="margin-top:12px">No hay observaciones nuevas para cargar' + (yaEstan.length ? ': las del Excel ya están en la app.' : '.') + '</div>') +
    (plan.otras ? '<div class="ayuda-campo" style="margin-top:8px">' + plan.otras + ' fila(s) u hoja(s) de otras áreas no se cargan.</div>' : '') +
    (plan.avisos.length ? '<div class="aviso alerta av-avisos"><b>Revisa</b><ul>' + plan.avisos.map(function (x) { return '<li>' + DR.esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
    '<div class="acciones"><button type="button" class="btn sec" id="opVolver">Volver</button>' +
    '<button type="button" class="btn verde" id="opAplicar" style="flex:1"' + (elegidas.length ? '' : ' disabled') + '>Cargar ' + elegidas.length + ' observación(es)</button></div>', { fija: true });

  DR.$('#opVolver').onclick = OPAS.abrir;
  if (DR.$('#opTodas')) DR.$('#opTodas').onchange = function () {
    OPAS.todas = this.checked;
    plan.filas.forEach(function (x) { if (x.yaEsta === undefined && S5.ABIERTOS.indexOf(x.estado) < 0) x.elegida = OPAS.todas; });
    OPAS.pintarPlan();
  };
  DR.$$('[data-op]').forEach(function (chk) {
    chk.onchange = function () {
      plan.filas[Number(this.getAttribute('data-op'))].elegida = this.checked;
      var n = OPAS.cargables().filter(function (x) { return x.elegida; }).length, btn = DR.$('#opAplicar');
      btn.disabled = !n;
      btn.textContent = 'Cargar ' + n + ' observación(es)';
      DR.$('.av-kpis b').textContent = n;
    };
  });
  DR.$('#opAplicar').onclick = OPAS.aplicar;
};

/* ------------------------------------------------------------ aplicación */
OPAS.aplicar = function () {
  var a = AUD.aud, lista = OPAS.cargables().filter(function (x) { return x.elegida; });
  var btn = DR.$('#opAplicar'), errores = [], hechas = 0, nuevas = [];
  btn.disabled = true;
  btn.classList.add('cargando');
  DR.$('#opVolver').disabled = true;
  // Una por una: si una falla, las demás siguen y al final se informa.
  lista.reduce(function (cadena, x) {
    return cadena.then(function () {
      hechas++;
      btn.textContent = 'Cargando ' + hechas + ' de ' + lista.length + '…';
      var id = S5.uuid(), base = 'obs/' + a.cultivo_id + '/' + x.z.id + '/' + id;
      return Promise.all([AV.subirFotos(x.fotosAntes || [], base + '-antes'), AV.subirFotos(x.fotosDespues || [], base + '-despues')]).then(function (rutas) {
        return AT.rpc('rpc_s5_importar_obs_pasada', { p: {
          id: id, zona_id: x.z.id, numero: x.num && x.num > 0 ? Math.round(x.num) : null, fecha_registro: x.fecha,
          descripcion: x.desc, accion_correctiva: x.accion, estado: x.estado, fecha_cierre: x.cierre || null,
          fotos_antes: rutas[0], fotos_despues: rutas[1], notas: x.notas
        } });
      }).then(function (o) { nuevas.push(o); }).catch(function (e) { errores.push(x.ref + ': ' + e.message); });
    });
  }, Promise.resolve()).then(function () {
    AUD.obsArea = AUD.obsArea.concat(nuevas);
    DR.vibrar(40);
    DR.sonar(!errores.length);
    DR.toast(nuevas.length + ' observación(es) de la auditoría pasada cargada(s).' + (errores.length ? ' ' + errores.length + ' con error.' : ''), errores.length ? 'error' : undefined);
    UI.abrirHoja('<div class="asa"></div>' +
      '<div class="res-estado" style="color:#B7E27C">' + DR.ICONOS.checkChico + '<span>Auditoría pasada cargada</span></div>' +
      '<div class="res-nombre">' + nuevas.length + ' de ' + lista.length + ' observación(es)</div>' +
      '<div class="res-dni" style="letter-spacing:0">Quedan como observaciones anteriores de cada zona: dales seguimiento desde el panel o la pestaña Observaciones.</div>' +
      (errores.length ? '<div class="aviso alerta av-avisos"><b>No se cargaron</b><ul>' + errores.map(function (t) { return '<li>' + DR.esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="acciones"><button type="button" class="btn verde" id="opListo" style="flex:1">Listo</button></div>', { fija: true });
    DR.$('#opListo').onclick = UI.cerrarHoja;
    // El aviso «observaciones abiertas anteriores» y el panel se actualizan sin perder puntajes sin guardar.
    if (AUD.vista === 'zona') AUD.pintarS(0);
    PFOT.refrescar();
  });
};
