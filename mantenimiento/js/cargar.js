/* ============================================================================
 * cargar.js — PESTAÑA «CARGAR»: EXCEL DEL PLAN → NUEVA REVISIÓN
 * El archivo se lee en el dispositivo, se muestra la tabla dinámica para
 * contrastarla con Hoja1 y recién al confirmar se crea la revisión.
 * Cada carga es una revisión nueva (el histórico se acumula).
 * ==========================================================================*/
var CARGA = { excel: null, archivo: '', id: null };

VISTAS.cargar = function (cont) {
  if (!AT.puedeCapturar()) {
    cont.innerHTML = UI.encabezado('Plan de mantenimiento', 'Cargar plan', '') +
      UI.panel('Sin acceso', '', '<div class="aviso alerta">Tu usuario es de solo lectura.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  CARGA.excel = null;
  cont.innerHTML = UI.encabezado('Plan de mantenimiento', 'Cargar plan del mes',
    'Sube el Excel del plan. Se toma la hoja con nombre de mes (p. ej. MARZO) y cada carga crea una revisión nueva.') +
    UI.panel('Archivo Excel', '',
      '<label class="zona-carga" id="zonaPlan"><input type="file" accept=".xlsx,.xls,.xlsm" id="inpPlan">' + DR.ICONOS.subir +
      '<b>Elegir archivo Excel</b><span>Se revisa en este dispositivo antes de crear la revisión.</span></label>' +
      '<div id="planVista"></div>');
  DR.entrarPaneles('#contenido');
  DR.$('#inpPlan').onchange = CARGA.leer;
};

CARGA.leer = function () {
  var archivo = this.files && this.files[0];
  this.value = '';
  if (!archivo) return;
  var zona = DR.$('#zonaPlan');
  zona.classList.add('cargando');
  Promise.all([DR.cargarScript(IMP_MP.LIB), archivo.arrayBuffer()]).then(function (r) {
    var libro = XLSX.read(new Uint8Array(r[1]), { type: 'array' });
    CARGA.excel = IMP_MP.leerLibro(XLSX, libro);
    CARGA.archivo = archivo.name;
    CARGA.id = null;
    zona.classList.remove('cargando');
    CARGA.pintarVista();
  }).catch(function (e) {
    zona.classList.remove('cargando');
    DR.$('#planVista').innerHTML = '<div class="aviso alerta" style="margin-top:12px">' + DR.esc(e.message) + '</div>';
    DR.toast(e.message, 'error');
  });
};

CARGA.pintarVista = function () {
  var x = CARGA.excel, pv = MP.pivote(x.filas);
  var encargados = MP.porEncargado(x.filas).map(function (e) { return e.responsable; }).sort();
  var item = function (bien, titulo, detalle) {
    return '<div class="check-item ' + (bien ? 'ok' : 'no') + '"><i>' + (bien ? DR.ICONOS.checkChico : DR.ICONOS.alertaChico) + '</i><div><b>' + titulo + '</b><span>' + detalle + '</span></div></div>';
  };
  var avisos = x.avisos.length
    ? '<div class="aviso alerta" style="margin-top:10px"><b>' + x.avisos.length + ' aviso(s)</b><ul>' +
      x.avisos.slice(0, 8).map(function (a) { return '<li>' + DR.esc(a) + '</li>'; }).join('') +
      (x.avisos.length > 8 ? '<li>… y ' + (x.avisos.length - 8) + ' más.</li>' : '') + '</ul></div>'
    : '';
  var opMes = MP.MESES.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === x.mes ? ' selected' : '') + '>' + m + '</option>'; }).join('');

  DR.$('#planVista').innerHTML = '<div class="check-lista" style="margin-top:14px">' +
      item(true, 'Hoja «' + DR.esc(x.hoja) + '»', DR.esc(CARGA.archivo)) +
      item(true, x.filas.length + ' OT', pv.plantas.length + ' planta(s) · ' + encargados.length + ' encargado(s): ' + DR.esc(encargados.join(', '))) +
    '</div>' + avisos +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo"><label for="planMes">Mes</label><select id="planMes">' + opMes + '</select></div>' +
      '<div class="campo"><label for="planAnio">Año</label><input id="planAnio" type="number" min="2000" max="2100" value="' + x.anio + '"></div>' +
    '</div>' +
    '<div class="sep-titulo">Tabla dinámica (compárala con Hoja1)</div>' + CARGA.tablaHtml(pv) +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnCrearRevision">Crear revisión de ' + DR.esc(MP.MESES[x.mes - 1]) + '</button></div>';
  DR.$('#planMes').onchange = function () {
    DR.$('#btnCrearRevision').textContent = 'Crear revisión de ' + MP.MESES[Number(this.value) - 1];
  };
  DR.$('#btnCrearRevision').onclick = CARGA.crear;
};

CARGA.tablaHtml = function (pv) {
  var h = '<div class="tabla-cont"><table class="mp-tabla"><thead><tr><th>Etiquetas de fila</th><th class="num">Cuenta de # OT</th></tr></thead><tbody>';
  pv.plantas.forEach(function (p) {
    h += '<tr class="mp-fila-planta"><td>' + DR.esc(p.planta) + '</td><td class="num">' + p.n + '</td></tr>';
    p.lista.forEach(function (r) { h += '<tr><td class="mp-sangria">' + DR.esc(r.responsable) + '</td><td class="num">' + r.n + '</td></tr>'; });
  });
  return h + '<tr class="fila-total"><td>Total general</td><td class="num">' + pv.total.n + '</td></tr></tbody></table></div>';
};

CARGA.crear = function () {
  var x = CARGA.excel, btn = this;
  if (!x) return;
  var mes = Number(DR.$('#planMes').value), anio = Number(DR.$('#planAnio').value);
  if (!anio || anio < 2000 || anio > 2100) { DR.toast('Escribe un año válido.', 'error'); return; }
  if (!CARGA.id) CARGA.id = MP.uuid();  // mismo id en reintentos: no duplica
  var id = CARGA.id;
  MP.accion(btn, 'rpc_mp_crear_revision', { p: {
    id: id, mes: mes, anio: anio, hoja: x.hoja, archivo: CARGA.archivo,
    filas: x.filas.map(function (f) {
      return { fila: f.fila, num_ot: f.num_ot, planta: f.planta, responsable: f.responsable, ubicacion: f.ubicacion || null,
        sub_equipo: f.sub_equipo || null, descripcion: f.descripcion || null, personas: f.personas || null,
        f_ini_plan: f.f_ini_plan || null, f_fin_plan: f.f_fin_plan || null, f_ini_real: f.f_ini_real || null,
        f_fin_real: f.f_fin_real || null, obs_excel: f.obs_excel || null };
    })
  } }).then(function (r) {
    DR.toast('Revisión ' + r.codigo + ' creada con ' + r.total_ot + ' OT.');
    CARGA.excel = null;
    CARGA.id = null;
    REV.abrir(r.id);
  }).catch(function () { /* MP.accion ya avisó */ });
};
