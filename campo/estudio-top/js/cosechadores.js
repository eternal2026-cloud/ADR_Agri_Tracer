/* ============================================================================
 * cosechadores.js — MAESTRO DE COSECHADORES TOP (carga por Excel)
 * Plantilla descargable (DNI · NOMBRES Y APELLIDOS · FUNDO · LÍDER), importación
 * con vista previa y lista con buscador. En la evaluación se elige de esta lista:
 * así nadie digita nombres ni DNI en campo.
 * ==========================================================================*/
var COS = { previa: null };

COS.COLUMNAS = [
  { k: 'dni', t: 'DNI', alias: ['dni', 'documento', 'nro documento', 'n documento', 'doc'] },
  { k: 'nombre', t: 'NOMBRES Y APELLIDOS', alias: ['nombres y apellidos', 'nombre', 'nombres', 'apellidos y nombres', 'trabajador', 'cosechador'] },
  { k: 'fundo', t: 'FUNDO', alias: ['fundo'] },
  { k: 'lider', t: 'LÍDER', alias: ['lider', 'líder', 'lider de grupo', 'supervisor'] }
];

COS.puedeCargar = function () { return AT.puedeCapturar() && AT.tieneAcceso('campo.top.evaluar'); };

COS.pintar = function (cont) {
  TOP.cargarCosechadores(true).then(function (lista) {
    var activos = lista.filter(function (c) { return c.activo; }).length;
    var h = '<div class="vista">' +
      '<div class="migas"><button type="button" id="cosVolver">Evaluaciones</button><span class="sep">›</span><button type="button" disabled>Cosechadores TOP</button></div>' +
      UI.encabezado('Estudio TOP › Evaluar', 'Cosechadores TOP', 'Lista que se usa al evaluar: se elige el nombre y el DNI y el líder se completan solos.') +
      '<div class="kpis entra">' + UI.kpi('Activos', DR.num(activos), lista.length - activos ? (lista.length - activos) + ' inactivos' : 'en la lista', '#76B729') + '</div>' +
      (COS.puedeCargar() ? '<section class="panel entra top-carga"><h2>Cargar desde Excel</h2>' +
        '<div class="sub">1) Descarga la plantilla · 2) Pega la lista (DNI y nombres; fundo y líder opcionales) · 3) Súbela aquí. ' +
        'Si el DNI ya existe se actualiza; no se borra a nadie.</div>' +
        '<div class="top-carga-pasos"><button type="button" class="btn sec" id="btnPlantilla">' + DR.ICONOS.subir.replace('M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5', 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5') + 'Descargar plantilla</button>' +
        '<label class="btn verde" for="archCos">' + DR.ICONOS.subir + 'Subir Excel</label><input type="file" id="archCos" accept=".xlsx" class="oculto"></div>' +
        '<div id="cosPrevia"></div></section>' : '') +
      '<section class="panel entra"><div class="panel-cab"><h2>Lista</h2></div>' +
      '<input type="search" id="cosBuscar" placeholder="Buscar por nombre, DNI, fundo o líder" autocomplete="off" style="margin:8px 0 12px">' +
      '<div id="cosLista"></div></section></div>';
    cont.innerHTML = h;
    DR.entrarPaneles('#contenido');
    DR.$('#cosVolver').onclick = function () { location.hash = '#evaluar'; };
    if (DR.$('#btnPlantilla')) {
      DR.$('#btnPlantilla').onclick = function () { COS.plantilla(this); };
      DR.$('#archCos').onchange = function () { var a = this.files && this.files[0]; this.value = ''; if (a) COS.leer(a); };
    }
    DR.$('#cosBuscar').oninput = function () { COS.lista(this.value); };
    COS.lista('');
  }).catch(function (e) { UI.error(cont, e); });
};

COS.lista = function (q) {
  var t = TOP.norm(q), l = (TOP.cosechadores || []).filter(function (c) {
    return !t || TOP.norm([c.nombre, c.dni, c.fundo, c.lider].join(' ')).indexOf(t) > -1;
  });
  var puede = COS.puedeCargar();
  DR.$('#cosLista').innerHTML = !TOP.cosechadores.length ? '<div class="vacio">Aún no hay cosechadores. Descarga la plantilla y súbela con la lista.</div>' :
    (l.length ? '<div class="top-cos-lista">' + l.slice(0, 200).map(function (c) {
      return '<div class="top-cos' + (c.activo ? '' : ' inactivo') + '"><span class="top-avatar">' + DR.esc(COS.iniciales(c.nombre)) + '</span>' +
        '<div><b>' + DR.esc(c.nombre) + '</b><small>DNI ' + DR.esc(c.dni) + (c.fundo ? ' · ' + DR.esc(c.fundo) : '') + (c.lider ? ' · Líder ' + DR.esc(c.lider) : '') + '</small></div>' +
        (puede ? '<button type="button" class="btn mini sec" data-cos-estado="' + c.id + '" data-activo="' + (c.activo ? '0' : '1') + '">' + (c.activo ? 'Desactivar' : 'Activar') + '</button>' : '') + '</div>';
    }).join('') + '</div>' + (l.length > 200 ? '<div class="ayuda-campo">Mostrando 200 de ' + l.length + '. Usa el buscador.</div>' : '') :
      '<div class="vacio">Nadie coincide con la búsqueda.</div>');
  DR.$$('[data-cos-estado]').forEach(function (b) {
    b.onclick = function () {
      b.classList.add('cargando');
      AT.rpc('rpc_top_estado_cosechador', { p_id: Number(b.getAttribute('data-cos-estado')), p_activo: b.getAttribute('data-activo') === '1' })
        .then(function () { return TOP.cargarCosechadores(true); }).then(function () { COS.lista(DR.$('#cosBuscar').value); })
        .catch(function (e) { b.classList.remove('cargando'); DR.toast(e.message, 'error'); });
    };
  });
};
COS.iniciales = function (n) {
  return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
};

/** Plantilla con encabezados, ejemplo, lista de fundos y una hoja de instrucciones. */
COS.plantilla = function (btn) {
  btn.classList.add('cargando');
  REPORTE.lib('../../vendor/exceljs.min.js', 'ExcelJS').then(function (ExcelJS) {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Cosechadores', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ header: 'DNI', key: 'dni', width: 14 }, { header: 'NOMBRES Y APELLIDOS', key: 'nombre', width: 42 },
      { header: 'FUNDO', key: 'fundo', width: 18 }, { header: 'LÍDER', key: 'lider', width: 32 }];
    var cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0097CE' } };
    ws.getColumn('dni').numFmt = '@';
    // Fila de ejemplo en gris (se ignora al importar si se deja tal cual).
    var ej = ws.addRow({ dni: '00000000', nombre: 'EJEMPLO PÉREZ GARCÍA, JUAN', fundo: TOP.listas.fundo[0] || 'LA MAQUINA', lider: 'NOMBRE DEL LÍDER' });
    ej.font = { italic: true, color: { argb: 'FF8A7D70' } };
    var fundos = '"' + TOP.listas.fundo.join(',') + '"';
    for (var i = 2; i <= 1500; i++) {
      ws.getCell('A' + i).numFmt = '@';
      if (fundos.length < 250) ws.getCell('C' + i).dataValidation = { type: 'list', allowBlank: true, formulae: [fundos] };
    }
    var ins = wb.addWorksheet('Instrucciones');
    ins.getColumn(1).width = 100;
    ['Cómo llenar la plantilla de cosechadores TOP', '',
      '1. Una fila por cosechador TOP. DNI y NOMBRES Y APELLIDOS son obligatorios.',
      '2. El DNI se guarda como texto: conserva los ceros a la izquierda (ej. 04567890).',
      '3. FUNDO y LÍDER son opcionales; el líder aparece solo al elegir al cosechador en la evaluación.',
      '4. Puedes borrar la fila de ejemplo (DNI 00000000); si la dejas, se ignora.',
      '5. Si un DNI ya existe en Integra se actualizan sus datos; nadie se borra.',
      '6. Guarda como .xlsx y súbelo en Estudio TOP › Evaluar › Cosechadores › Subir Excel.'
    ].forEach(function (t, i) { var r = ins.addRow([t]); if (!i) r.font = { bold: true, size: 13 }; });
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    REPORTE.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Plantilla_Cosechadores_TOP.xlsx');
    DR.toast('Plantilla descargada.');
  }).catch(function (e) { DR.toast(e.message, 'error'); }).then(function () { btn.classList.remove('cargando'); });
};

/** Texto de una celda de ExcelJS (fórmulas, texto enriquecido, números). */
COS.texto = function (v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(function (x) { return x.text; }).join('');
    if (v.result !== undefined) return COS.texto(v.result);
    if (v.text !== undefined) return String(v.text);
  }
  return String(v).trim();
};

COS.leer = function (archivo) {
  var prev = DR.$('#cosPrevia');
  prev.innerHTML = '<div class="vacio">Leyendo el Excel…</div>';
  Promise.all([REPORTE.lib('../../vendor/exceljs.min.js', 'ExcelJS'), archivo.arrayBuffer()]).then(function (r) {
    var wb = new r[0].Workbook();
    return wb.xlsx.load(r[1]).then(function () { return wb; });
  }).then(function (wb) {
    // Primera hoja con una columna DNI y otra de nombre en sus 10 primeras filas.
    var res = null;
    wb.eachSheet(function (ws) {
      if (res) return;
      for (var f = 1; f <= Math.min(10, ws.rowCount); f++) {
        var mapa = {};
        ws.getRow(f).eachCell(function (c, col) {
          var t = TOP.norm(COS.texto(c.value)).replace(/[°º.]/g, '').trim();
          COS.COLUMNAS.forEach(function (k) { if (!mapa[k.k] && k.alias.some(function (a) { return TOP.norm(a) === t; })) mapa[k.k] = col; });
        });
        if (mapa.dni && mapa.nombre) { res = { ws: ws, fila: f, mapa: mapa }; break; }
      }
    });
    if (!res) throw new Error('No encontré las columnas DNI y NOMBRES Y APELLIDOS. Usa la plantilla.');
    var filas = [], errores = [], vistos = {}, fundos = TOP.listas.fundo;
    for (var i = res.fila + 1; i <= res.ws.rowCount; i++) {
      var row = res.ws.getRow(i), val = function (k) { return res.mapa[k] ? COS.texto(row.getCell(res.mapa[k]).value) : ''; };
      var dni = val('dni').replace(/\D/g, ''), nombre = val('nombre').replace(/\s+/g, ' ').trim();
      if (!dni && !nombre) continue;
      if (dni === '00000000' || /^ejemplo/i.test(nombre)) continue;
      if (dni && dni.length < 8) dni = ('00000000' + dni).slice(-8);   // Excel come los ceros a la izquierda
      if (!dni || !nombre) { errores.push('Fila ' + i + ': falta ' + (!dni ? 'el DNI' : 'el nombre')); continue; }
      if (vistos[dni]) { errores.push('Fila ' + i + ': DNI ' + dni + ' repetido (se usa la última)'); }
      var fundo = val('fundo').toUpperCase();
      if (fundo && fundos.indexOf(fundo) < 0) errores.push('Fila ' + i + ': fundo «' + fundo + '» no está en la lista (se guarda igual)');
      vistos[dni] = { dni: dni, nombre: nombre.toUpperCase(), fundo: fundo, lider: val('lider').toUpperCase() };
    }
    Object.keys(vistos).forEach(function (k) { filas.push(vistos[k]); });
    if (!filas.length) throw new Error('El Excel no tiene filas con DNI y nombre.');
    var existentes = {};
    (TOP.cosechadores || []).forEach(function (c) { existentes[c.dni] = true; });
    var nuevos = filas.filter(function (f) { return !existentes[f.dni]; }).length;
    COS.previa = filas;
    prev.innerHTML = '<div class="aviso ' + (errores.length ? 'alerta' : 'ok') + '" style="margin-top:12px"><b>' + filas.length + ' cosechadores</b> listos: ' +
      nuevos + ' nuevos y ' + (filas.length - nuevos) + ' para actualizar.' +
      (errores.length ? '<br>' + errores.slice(0, 6).map(DR.esc).join('<br>') + (errores.length > 6 ? '<br>… y ' + (errores.length - 6) + ' avisos más' : '') : '') + '</div>' +
      UI.tabla([{ t: 'DNI', k: 'dni' }, { t: 'Nombre', k: 'nombre' }, { t: 'Fundo', k: 'fundo' }, { t: 'Líder', k: 'lider' }], filas.slice(0, 8)) +
      (filas.length > 8 ? '<div class="ayuda-campo">… y ' + (filas.length - 8) + ' más.</div>' : '') +
      '<div class="acciones"><button type="button" class="btn verde" id="btnImportarCos">Cargar ' + filas.length + ' cosechadores</button>' +
      '<button type="button" class="btn sec" id="btnCancelarCos">Cancelar</button></div>';
    DR.$('#btnCancelarCos').onclick = function () { COS.previa = null; prev.innerHTML = ''; };
    DR.$('#btnImportarCos').onclick = function () {
      var b = this;
      b.classList.add('cargando');
      AT.rpc('rpc_top_importar_cosechadores', { p_filas: COS.previa }).then(function (x) {
        DR.toast('Cosechadores cargados: ' + x.nuevos + ' nuevos, ' + x.actualizados + ' actualizados.');
        DR.sonar(true);
        COS.pintar(DR.$('#contenido'));
      }).catch(function (e) { b.classList.remove('cargando'); DR.toast(e.message, 'error'); });
    };
  }).catch(function (e) { prev.innerHTML = '<div class="aviso alerta" style="margin-top:12px">' + DR.esc(e.message) + '</div>'; });
};
