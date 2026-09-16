/* ============================================================================
 * cargar.js — PESTAÑA «CARGAR HISTÓRICO»: EXCEL → BD ACUMULABLE
 * Se eligen varios Excel (o una carpeta completa) y se leen en el dispositivo.
 * La vista previa permite corregir cultivo, campaña, fecha, áreas, sub-área y
 * planta antes de importar. Importar es repetible: la BD no duplica (misma
 * clave → se actualiza) y nunca pisa lo registrado en la app.
 * ==========================================================================*/
var CARGA = { filas: [], LOTE: 150 };

VISTAS.cargar = function (cont) {
  if (!AT.puedeCapturar()) {
    cont.innerHTML = UI.encabezado('Cliente interno', 'Cargar histórico', '') +
      UI.panel('Sin acceso', '', '<div class="aviso alerta">Tu usuario es de solo lectura.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  cont.innerHTML = UI.encabezado('Cliente interno', 'Cargar histórico',
    'Sube las encuestas en Excel (formato «Encuesta NPS») o la BD descargada de esta app. Puedes repetir la carga cuando haya archivos nuevos: no se duplica nada.') +
    UI.panel('Archivos', 'Se revisan en este dispositivo antes de guardar.',
      '<div class="grid-2">' +
        '<label class="zona-carga" id="zonaArchivos"><input type="file" accept=".xlsx,.xlsm,.xls" multiple id="inpArchivos">' + DR.ICONOS.subir +
          '<b>Elegir archivos Excel</b><span>Puedes marcar varios a la vez.</span></label>' +
        '<label class="zona-carga" id="zonaCarpeta"><input type="file" webkitdirectory directory multiple id="inpCarpeta">' + DR.ICONOS.subir +
          '<b>Elegir una carpeta</b><span>Toma todos los Excel de sus subcarpetas (p. ej. «6. Satisfacción al cliente interno»).</span></label>' +
      '</div><div id="cargaVista"></div>');
  DR.entrarPaneles('#contenido');
  DR.$('#inpArchivos').onchange = CARGA.leer;
  DR.$('#inpCarpeta').onchange = CARGA.leer;
  if (CARGA.filas.length) CARGA.pintar();
};

CARGA.leer = function () {
  var archivos = Array.prototype.slice.call(this.files || []).filter(function (f) {
    return /\.xls[xm]?$/i.test(f.name) && f.name.indexOf('~$') !== 0;
  });
  this.value = '';
  if (!archivos.length) { DR.toast('No se encontraron archivos Excel.', 'error'); return; }
  var zonas = DR.$$('.zona-carga');
  zonas.forEach(function (z) { z.classList.add('cargando'); });
  var errores = [], encuestas = [];
  DR.cargarScript(IMP_SCI.LIB).then(function () {
    return archivos.reduce(function (p, archivo) {
      return p.then(function () { return archivo.arrayBuffer(); }).then(function (buf) {
        var libro = XLSX.read(new Uint8Array(buf), { type: 'array' });
        var ruta = archivo.webkitRelativePath || archivo.name;
        IMP_SCI.leerLibro(XLSX, libro, archivo.name, { ruta: ruta, plantas: SCI.codigosPlanta() })
          .forEach(function (e) { encuestas.push(e); });
      }).catch(function (e) { errores.push(e.message); });
    }, Promise.resolve());
  }).then(function () {
    zonas.forEach(function (z) { z.classList.remove('cargando'); });
    CARGA.filas = CARGA.preparar(encuestas);
    CARGA.erroresLectura = errores;
    CARGA.resultado = null;
    CARGA.pintar();
  }).catch(function (e) {
    zonas.forEach(function (z) { z.classList.remove('cargando'); });
    DR.toast(e.message, 'error');
  });
};

/** Resuelve catálogos, completa la campaña y marca duplicados. */
CARGA.preparar = function (encuestas) {
  var huellas = {};
  return encuestas.map(function (e, i) {
    var cul = SCI.cultivoPorNombre(e.cultivo_txt);
    var ae = IMP_SCI.buscarArea(e.area_evaluada_txt, SCI.areas);
    var ao = IMP_SCI.buscarArea(e.area_evaluadora_txt, SCI.areas);
    var f = {
      idx: i, enc: e, marcada: !e.errores.length, avisos: e.avisos.slice(),
      cultivo_id: cul ? cul.id : '', campana: e.campana, fecha: e.fecha || '',
      area_evaluada_id: ae ? ae.id : '', area_evaluadora_id: ao ? ao.id : '',
      sub_area: e.sub_area || '', planta: e.planta || ''
    };
    if (!f.campana && cul && cul.campana) {
      f.campana = cul.campana;
      f.avisos.push('Sin campaña en el Excel: se usa «' + cul.campana + '».');
    }
    if (e.area_evaluada_txt && !ae) f.avisos.push('Área evaluada «' + e.area_evaluada_txt + '» no está en el catálogo.');
    if (e.area_evaluadora_txt && !ao) f.avisos.push('Área evaluadora «' + e.area_evaluadora_txt + '» no está en el catálogo.');
    var h = IMP_SCI.huella(e);
    if (huellas[h]) {
      f.marcada = false;
      f.duplicado = huellas[h];
      f.avisos.push('Mismo contenido que «' + huellas[h] + '»: se omite (márcala si es otra evaluación).');
    } else {
      huellas[h] = e.ruta;
    }
    return f;
  });
};

/** Campos obligatorios que faltan (además de los errores de lectura). */
CARGA.faltantes = function (f) {
  var x = [];
  if (!f.cultivo_id) x.push('cultivo');
  if (!String(f.campana || '').trim()) x.push('campaña');
  if (!f.fecha) x.push('fecha');
  if (!f.area_evaluada_id) x.push('área evaluada');
  if (!f.area_evaluadora_id) x.push('área evaluadora');
  return x;
};
CARGA.valida = function (f) { return !f.enc.errores.length && !CARGA.faltantes(f).length; };

CARGA.pintar = function () {
  var vista = DR.$('#cargaVista');
  if (!vista) return;
  var filas = CARGA.filas, lista = filas.filter(function (f) { return f.marcada && CARGA.valida(f); });
  var conError = filas.filter(function (f) { return f.enc.errores.length; }).length;
  var duplicados = filas.filter(function (f) { return f.duplicado; }).length;
  var item = function (bien, titulo, detalle) {
    return '<div class="check-item ' + (bien ? 'ok' : 'no') + '"><i>' + (bien ? DR.ICONOS.checkChico : DR.ICONOS.alertaChico) + '</i><div><b>' + titulo + '</b><span>' + detalle + '</span></div></div>';
  };
  var lectura = (CARGA.erroresLectura || []).length
    ? '<div class="aviso alerta" style="margin-top:10px"><b>' + CARGA.erroresLectura.length + ' archivo(s) no se pudieron leer</b><ul>' +
      CARGA.erroresLectura.map(function (a) { return '<li>' + DR.esc(a) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var h = '<div class="check-lista" style="margin-top:14px">' +
    item(true, filas.length + ' encuesta(s) leída(s)', lista.length + ' lista(s) para importar') +
    item(!conError, conError + ' con errores', conError ? 'No se importan hasta corregir el Excel.' : 'Todas las respuestas están completas.') +
    item(!duplicados, duplicados + ' posible(s) duplicado(s)', duplicados ? 'Mismo contenido en dos archivos (p. ej. Despacho en Arándano y en Uva).' : 'Sin archivos repetidos.') +
    '</div>' + lectura;

  if (CARGA.resultado) h += CARGA.resultadoHtml(CARGA.resultado);

  h += '<div class="sep-titulo">Vista previa (corrige antes de importar)</div>' +
    '<div class="tabla-cont"><table class="sci-previa"><thead><tr>' +
    '<th><input type="checkbox" id="chkTodas" aria-label="Marcar todas"></th><th>Archivo</th><th>Cultivo</th><th>Campaña</th><th>Fecha</th>' +
    '<th>Área evaluada</th><th>Área evaluadora</th><th>Sub-área</th><th>Planta</th>' +
    SCI.CRITERIOS.map(function (c) { return '<th class="num">' + DR.esc(c.t) + '</th>'; }).join('') +
    '<th class="num">Resultado</th><th>Revisión</th></tr></thead><tbody>' +
    filas.map(CARGA.filaHtml).join('') + '</tbody></table></div>' +
    SCI.datalistSubAreas('dlSubAreas') +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnImportar"' + (lista.length ? '' : ' disabled') + '>' +
    'Importar ' + lista.length + ' encuesta(s)</button></div>';
  vista.innerHTML = h;

  DR.$('#chkTodas').checked = filas.length > 0 && filas.every(function (f) { return f.marcada || !CARGA.valida(f); });
  DR.$('#chkTodas').onchange = function () {
    var v = this.checked;
    filas.forEach(function (f) { f.marcada = v && CARGA.valida(f); });
    CARGA.pintar();
  };
  DR.$$('[data-f]', vista).forEach(function (el) {
    el.onchange = function () {
      var f = filas[Number(this.getAttribute('data-f'))], campo = this.getAttribute('data-campo');
      if (campo === 'marcada') f.marcada = this.checked;
      else f[campo] = this.type === 'number' ? Number(this.value) : this.value;
      if (campo === 'cultivo_id' && !String(f.campana || '').trim()) {
        var c = SCI.cultivo(f.cultivo_id);
        if (c && c.campana) f.campana = c.campana;
      }
      if (campo !== 'marcada' && CARGA.valida(f) && !f.duplicado) f.marcada = true;
      CARGA.pintar();
    };
  });
  DR.$('#btnImportar').onclick = CARGA.importar;
};

CARGA.filaHtml = function (f, i) {
  var e = f.enc, faltan = CARGA.faltantes(f), valida = CARGA.valida(f);
  var sel = function (campo, opciones) { return '<select data-f="' + i + '" data-campo="' + campo + '">' + opciones + '</select>'; };
  var inp = function (campo, tipo, extra) {
    return '<input data-f="' + i + '" data-campo="' + campo + '" type="' + tipo + '" value="' + DR.esc(f[campo] || '') + '"' + (extra || '') + '>';
  };
  var notas = e.errores.map(function (x) { return '<li class="mp-rojo">' + DR.esc(x) + '</li>'; })
    .concat(faltan.map(function (x) { return '<li class="mp-rojo">Falta ' + x + '.</li>'; }))
    .concat(f.avisos.map(function (x) { return '<li class="mp-ambar">' + DR.esc(x) + '</li>'; }));
  return '<tr class="' + (valida ? '' : 'sci-invalida') + (f.duplicado ? ' sci-duplicada' : '') + '">' +
    '<td><input type="checkbox" data-f="' + i + '" data-campo="marcada"' + (f.marcada && valida ? ' checked' : '') + (valida ? '' : ' disabled') + '></td>' +
    '<td class="sci-archivo" title="' + DR.esc(e.ruta) + '">' + DR.esc(e.archivo) + '</td>' +
    '<td>' + sel('cultivo_id', SCI.opcionesCultivos(f.cultivo_id, 'Elegir…')) + '</td>' +
    '<td>' + inp('campana', 'text', ' size="14"') + '</td>' +
    '<td>' + inp('fecha', 'date', ' max="' + SCI.hoy() + '"') + '</td>' +
    '<td>' + sel('area_evaluada_id', SCI.opcionesAreas(f.area_evaluada_id, 'Elegir…')) + '</td>' +
    '<td>' + sel('area_evaluadora_id', SCI.opcionesAreas(f.area_evaluadora_id, 'Elegir…')) + '</td>' +
    '<td>' + inp('sub_area', 'text', ' list="dlSubAreas" size="9" placeholder="—"') + '</td>' +
    '<td>' + sel('planta', SCI.opcionesPlantas(f.planta)) + '</td>' +
    SCI.CRITERIOS.map(function (c) { return '<td class="num">' + SCI.pct(e.criterios ? e.criterios[c.id] : null) + '</td>'; }).join('') +
    '<td class="num">' + (e.errores.length ? '—' : SCI.pillPct(e.total)) + '</td>' +
    '<td class="sci-notas">' + (notas.length ? '<ul>' + notas.join('') + '</ul>' : '<span class="sci-ok">OK</span>') + '</td></tr>';
};

CARGA.importar = function () {
  var btn = this;
  var lista = CARGA.filas.filter(function (f) { return f.marcada && CARGA.valida(f); });
  if (!lista.length) return;
  var payload = lista.map(function (f) {
    var e = f.enc;
    return {
      cultivo_id: Number(f.cultivo_id), campana: String(f.campana).trim(), fecha: f.fecha,
      area_evaluada_id: Number(f.area_evaluada_id), area_evaluadora_id: Number(f.area_evaluadora_id),
      sub_area: String(f.sub_area || '').trim() || null, planta: f.planta || null,
      cargo: e.cargo || null, evaluador: e.evaluador || null,
      aspectos_valorados: e.aspectos_valorados || null, aspectos_mejorar: e.aspectos_mejorar || null,
      recomendaciones: e.recomendaciones || null, archivo: e.ruta, respuestas: e.respuestas
    };
  });
  var total = { creadas: 0, actualizadas: 0, omitidas: 0, detalle: [] };
  var lotes = [];
  for (var i = 0; i < payload.length; i += CARGA.LOTE) lotes.push(payload.slice(i, i + CARGA.LOTE));
  btn.disabled = true;
  btn.classList.add('cargando');
  lotes.reduce(function (p, lote, k) {
    return p.then(function () {
      btn.textContent = 'Importando lote ' + (k + 1) + ' de ' + lotes.length + '…';
      return AT.rpc('rpc_sci_importar', { p_filas: lote });
    }).then(function (r) {
      total.creadas += r.creadas; total.actualizadas += r.actualizadas; total.omitidas += r.omitidas;
      total.detalle = total.detalle.concat(r.detalle || []);
    });
  }, Promise.resolve()).then(function () {
    CARGA.resultado = total;
    lista.forEach(function (f) { f.marcada = false; });
    DR.toast(total.creadas + ' nuevas · ' + total.actualizadas + ' actualizadas · ' + total.omitidas + ' omitidas.');
    CARGA.pintar();
  }).catch(function (e) {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Reintentar importación';
    DR.toast(e.message, 'error');
  });
};

CARGA.resultadoHtml = function (r) {
  return '<div class="aviso ok" style="margin-top:12px"><b>Importación terminada:</b> ' + r.creadas + ' nuevas, ' + r.actualizadas +
    ' actualizadas y ' + r.omitidas + ' omitidas.' +
    (r.detalle.length ? '<ul>' + r.detalle.map(function (d) { return '<li>' + DR.esc(d.archivo + ': ' + d.motivo) + '</li>'; }).join('') + '</ul>' : '') +
    '<div class="acciones"><button type="button" class="btn azul chico" onclick="DR.ir(\'resultados\')">Ver resultados</button></div></div>';
};
