/* ============================================================================
 * config.js — CATÁLOGO 5S (solo administradores)
 * Parámetros (plazo de corrección, campaña, planta), áreas y zonas numeradas,
 * textos del CHECK LIST y gestión de auditorías (reabrir / anular).
 * Nada se borra: se desactiva, para no romper el historial.
 * ==========================================================================*/
var CAT = { area: null, auditorias: [], abiertos: {} };

VISTAS.catalogo = function (cont) {
  if (!AT.esAdmin()) {
    cont.innerHTML = UI.encabezado('Auditoría 5S', 'Catálogo', '') + UI.panel('Sin acceso', '', '<div class="aviso alerta">Esta sección es solo para administradores.</div>');
    DR.entrarPaneles('#contenido');
    return;
  }
  CAT.cargar().then(function () { CAT.pintar(true); }).catch(function (e) { UI.error(cont, e); });
};

CAT.cargar = function () {
  return Promise.all([
    S5.cargar(true),
    sb.from('s5_auditorias').select('*').order('creado_en', { ascending: false }).limit(40)
  ]).then(function (r) {
    if (r[1].error) throw new Error(r[1].error.message);
    CAT.auditorias = r[1].data || [];
    if (!CAT.area || !S5.area(CAT.area)) CAT.area = S5.areas.length ? S5.areas[0].id : null;
  });
};

CAT.refrescar = function () {
  var cont = DR.$('#contenido'), y = cont.scrollTop;
  return CAT.cargar().then(function () { CAT.pintar(false); cont.scrollTop = y; }).catch(function (e) { DR.toast(e.message, 'error'); });
};

CAT.pintar = function (animar) {
  var cont = DR.$('#contenido');
  if (DR.vista !== 'catalogo' || !cont) return;
  var p = S5.parametros, area = S5.area(CAT.area), zonas = area ? S5.zonasDe(area.id, true) : [];

  var h = UI.encabezado('Auditoría 5S', 'Catálogo', 'Áreas, zonas numeradas y textos del CHECK LIST. Nada se borra: desactiva lo que ya no aplica para conservar el historial.');

  h += UI.panel('Parámetros', 'Se proponen al iniciar una auditoría y controlan el plazo de corrección de puntajes.',
    '<div class="form">' +
      '<div class="campo"><label for="catDias">Días para corregir puntajes</label><input id="catDias" type="number" inputmode="numeric" min="0" max="60" value="' + S5.diasCorreccion() + '">' +
        '<div class="ayuda-campo">Contados desde la fecha de la auditoría. Pasado el plazo, solo un administrador corrige.</div></div>' +
      '<div class="campo"><label for="catCampana">Campaña</label><input id="catCampana" autocomplete="off" value="' + DR.esc(p.S5_CAMPANA || '') + '"></div>' +
      '<div class="campo"><label for="catPlanta">Planta</label><input id="catPlanta" autocomplete="off" value="' + DR.esc(p.S5_PLANTA || '') + '"></div>' +
    '</div><div class="acciones"><button type="button" class="btn" id="catGuardarParam">Guardar parámetros</button></div>');

  h += UI.panel('Áreas y zonas', 'Elige un área para editar sus zonas. Cambiar el nombre o número de una zona también cambia su historial en BD y Google Sheets.',
    '<div class="opciones" id="catAreas">' + S5.areas.map(function (a) {
      return '<button type="button" class="opcion' + (a.id === CAT.area ? ' activa' : '') + (a.activo ? '' : ' inactiva') + '" data-valor="' + a.id + '">' +
        DR.esc(a.nombre) + '<small>' + S5.zonasDe(a.id, true).length + '</small></button>';
    }).join('') + '</div>' +
    (area
      ? '<div class="fila-cat area-cat"><input id="catAreaNombre" value="' + DR.esc(area.nombre) + '" aria-label="Nombre del área">' +
          '<div class="fila-acc"><button type="button" class="btn sec chico" id="catAreaActiva">' + (area.activo ? 'Desactivar área' : 'Activar área') + '</button>' +
          '<button type="button" class="btn chico" id="catAreaGuardar">Guardar nombre</button></div></div>' +
        '<div class="sep-titulo">Zonas de ' + DR.esc(area.nombre) + '</div>' +
        (zonas.length ? zonas.map(function (z) {
          return '<div class="fila-cat' + (z.activo ? '' : ' inactiva') + '" data-zona-fila="' + z.id + '">' +
            '<input type="number" inputmode="numeric" min="1" max="99" value="' + z.numero + '" data-zn aria-label="Número de zona">' +
            '<input value="' + DR.esc(z.nombre) + '" data-zt aria-label="Nombre de la zona">' +
            '<div class="fila-acc"><button type="button" class="btn sec chico" data-zona-activa="' + z.id + '">' + (z.activo ? 'Desactivar' : 'Activar') + '</button>' +
            '<button type="button" class="btn chico" data-zona-guardar="' + z.id + '">Guardar</button></div></div>';
        }).join('') : '<div class="vacio">Esta área aún no tiene zonas.</div>') +
        '<div class="lista-add"><input id="catNuevaZona" placeholder="Nueva zona (se numera sola)…" autocomplete="off"><button type="button" class="btn chico" id="catAgregarZona">Agregar</button></div>'
      : '') +
    '<div class="sep-titulo">Nueva área</div><div class="lista-add"><input id="catNuevaArea" placeholder="Ej. Ingeniería" autocomplete="off"><button type="button" class="btn chico" id="catAgregarArea">Agregar área</button></div>');

  h += UI.panel('Checklist (CHECK LIST)', 'Máximo 6 ítems por S (columnas 1–6 de la hoja BD). Un ítem desactivado deja de pedirse en las evaluaciones nuevas.',
    [1, 2, 3, 4, 5].map(function (s) {
      var items = S5.itemsDe(s, true);
      return '<details class="grupo-s" data-s="' + s + '" style="--c:' + S5.COLORES[s] + '"' + (CAT.abiertos[s] ? ' open' : '') + '>' +
        '<summary><span>' + s + 'S · ' + S5.NOMBRES[s] + '</span><b>' + items.filter(function (i) { return i.activo; }).length + ' activos</b></summary>' +
        items.map(function (it) {
          return '<div class="fila-cat item-cat' + (it.activo ? '' : ' inactiva') + '"><span class="item5s-num" style="--c:' + S5.COLORES[s] + '">' + it.numero + '</span>' +
            '<textarea rows="2" data-it="' + it.id + '" aria-label="Texto del ítem ' + s + 'S-' + it.numero + '">' + DR.esc(it.texto) + '</textarea>' +
            '<div class="fila-acc"><button type="button" class="btn sec chico" data-item-activo="' + it.id + '">' + (it.activo ? 'Desactivar' : 'Activar') + '</button>' +
            '<button type="button" class="btn chico" data-item-guardar="' + it.id + '">Guardar</button></div></div>';
        }).join('') +
        (items.length < 6 ? '<div class="lista-add"><input data-nuevo-item="' + s + '" placeholder="Nuevo ítem de ' + s + 'S…" autocomplete="off">' +
          '<button type="button" class="btn chico" data-agregar-item="' + s + '">Agregar</button></div>' : '') +
        '</details>';
    }).join(''));

  h += UI.panel('Auditorías', 'Reabre una auditoría cerrada o anula una de prueba: deja de contar en Resultados y en Google Sheets, pero no se borra.',
    CAT.auditorias.length ? CAT.auditorias.map(function (a) {
      var pill = a.estado === 'anulada' ? '<span class="pill rojo">Anulada</span>' : (a.estado === 'cerrada' ? '<span class="pill verde">Cerrada</span>' : '<span class="pill naranja">En curso</span>');
      return '<div class="papelera-item"><div class="u-cuerpo"><div class="u-nombre">' + DR.esc(a.codigo) + ' · ' + DR.esc((S5.area(a.area_id) || {}).nombre || '') + ' N° ' + a.numero_auditoria + '</div>' +
        '<div class="u-det">' + S5.fecha(a.fecha) + ' · ' + DR.esc(a.campana) + (a.auditor ? ' · ' + DR.esc(a.auditor) : '') + '</div>' +
        '<div class="u-pills">' + pill + (a.motivo_anulacion ? ' <span class="u-det">' + DR.esc(a.motivo_anulacion) + '</span>' : '') + '</div></div>' +
        (a.estado === 'cerrada' ? '<button type="button" class="btn sec chico" data-reabrir="' + a.id + '">Reabrir</button>' : '') +
        (a.estado !== 'anulada' ? '<button type="button" class="btn sec chico" data-anular="' + a.id + '">Anular</button>' : '') + '</div>';
    }).join('') : '<div class="vacio">Sin auditorías.</div>');

  cont.innerHTML = h;
  if (animar) DR.entrarPaneles('#contenido');

  DR.$('#catGuardarParam').onclick = CAT.guardarParametros;
  OBS.chips('#catAreas', function (v) { CAT.area = Number(v); CAT.pintar(false); });
  DR.$('#catAgregarArea').onclick = function () {
    var inp = DR.$('#catNuevaArea'), nombre = inp.value.trim();
    if (!nombre) { inp.focus(); return; }
    CAT.rpc(this, 'rpc_s5_guardar_area', { nombre: nombre }, 'Área «' + nombre + '» agregada.');
  };
  if (area) {
    DR.$('#catAreaGuardar').onclick = function () { CAT.rpc(this, 'rpc_s5_guardar_area', { id: area.id, nombre: DR.$('#catAreaNombre').value.trim() }, 'Área actualizada.'); };
    DR.$('#catAreaActiva').onclick = function () { CAT.rpc(this, 'rpc_s5_guardar_area', { id: area.id, activo: !area.activo }, area.activo ? 'Área desactivada.' : 'Área activada.'); };
    DR.$('#catAgregarZona').onclick = function () {
      var inp = DR.$('#catNuevaZona'), nombre = inp.value.trim();
      if (!nombre) { inp.focus(); return; }
      CAT.rpc(this, 'rpc_s5_guardar_zona', { area_id: area.id, nombre: nombre }, 'Zona «' + nombre + '» agregada.');
    };
  }
  DR.$$('[data-zona-guardar]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = Number(this.getAttribute('data-zona-guardar')), fila = DR.$('[data-zona-fila="' + id + '"]');
      CAT.rpc(this, 'rpc_s5_guardar_zona', { id: id, numero: Number(DR.$('[data-zn]', fila).value), nombre: DR.$('[data-zt]', fila).value.trim() }, 'Zona guardada.');
    };
  });
  DR.$$('[data-zona-activa]', cont).forEach(function (b) {
    b.onclick = function () {
      var z = S5.zona(this.getAttribute('data-zona-activa'));
      CAT.rpc(this, 'rpc_s5_guardar_zona', { id: z.id, activo: !z.activo }, z.activo ? 'Zona desactivada.' : 'Zona activada.');
    };
  });
  DR.$$('[data-item-guardar]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-item-guardar');
      CAT.rpc(this, 'rpc_s5_guardar_item', { id: Number(id), texto: DR.$('[data-it="' + id + '"]').value.trim() }, 'Ítem guardado.');
    };
  });
  DR.$$('[data-item-activo]', cont).forEach(function (b) {
    b.onclick = function () {
      var it = S5.item(this.getAttribute('data-item-activo'));
      CAT.rpc(this, 'rpc_s5_guardar_item', { id: it.id, activo: !it.activo }, it.activo ? 'Ítem desactivado.' : 'Ítem activado.');
    };
  });
  DR.$$('[data-agregar-item]', cont).forEach(function (b) {
    b.onclick = function () {
      var s = this.getAttribute('data-agregar-item'), inp = DR.$('[data-nuevo-item="' + s + '"]'), texto = inp.value.trim();
      if (!texto) { inp.focus(); return; }
      CAT.rpc(this, 'rpc_s5_guardar_item', { s: Number(s), texto: texto }, 'Ítem agregado a ' + s + 'S.');
    };
  });
  DR.$$('details.grupo-s', cont).forEach(function (d) {
    d.addEventListener('toggle', function () { CAT.abiertos[d.getAttribute('data-s')] = d.open; });
  });
  DR.$$('[data-reabrir]', cont).forEach(function (b) {
    b.onclick = function () {
      var btn = this;
      if (!window.confirm('¿Reabrir la auditoría? Se podrá volver a puntuar el día de la auditoría y cerrarla de nuevo.')) return;
      btn.disabled = true;
      AT.rpc('rpc_s5_reabrir_auditoria', { p_auditoria: btn.getAttribute('data-reabrir') }).then(function (a) {
        DR.toast('Auditoría ' + a.codigo + ' reabierta.');
        return CAT.refrescar();
      }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
    };
  });
  DR.$$('[data-anular]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = this.getAttribute('data-anular');
      CAT.confirmarAnular(CAT.auditorias.filter(function (a) { return a.id === id; })[0]);
    };
  });
};

/** Llama una RPC de catálogo con {p}, avisa y vuelve a pintar conservando el scroll. */
CAT.rpc = function (btn, nombre, p, mensaje) {
  btn.disabled = true;
  return AT.rpc(nombre, { p: p }).then(function () {
    DR.toast(mensaje);
    return CAT.refrescar();
  }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
};

/** Upsert: si la fila del parámetro no existe la crea (mismo criterio que Config → Sheets). */
CAT.guardarParametro = function (clave, valor) {
  return sb.from('parametros').upsert({ clave: clave, valor: String(valor), actualizado_en: new Date().toISOString() }, { onConflict: 'clave' })
    .select('clave,valor').then(function (r) {
      if (r.error) throw new Error(r.error.message);
      if (!r.data || !r.data.length || r.data[0].valor !== String(valor)) throw new Error('No se pudo guardar «' + clave + '».');
      return r.data[0];
    });
};

CAT.guardarParametros = function () {
  var btn = this, dias = parseInt(DR.$('#catDias').value, 10), campana = DR.$('#catCampana').value.trim(), planta = DR.$('#catPlanta').value.trim();
  if (isNaN(dias) || dias < 0 || dias > 60) { DR.toast('Escribe un número de días entre 0 y 60.', 'error'); return; }
  if (!campana || !planta) { DR.toast('Completa la campaña y la planta.', 'error'); return; }
  btn.disabled = true;
  Promise.all([
    CAT.guardarParametro('S5_DIAS_CORRECCION', dias),
    CAT.guardarParametro('S5_CAMPANA', campana),
    CAT.guardarParametro('S5_PLANTA', planta)
  ]).then(function () {
    DR.toast('Parámetros guardados.');
    return CAT.refrescar();
  }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
};

CAT.confirmarAnular = function (a) {
  if (!a) return;
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#FFA3A3">' + DR.ICONOS.alerta + '<span>Anular auditoría</span></div>' +
    '<div class="res-nombre">' + DR.esc(a.codigo) + '</div>' +
    '<div class="res-dni">' + DR.esc((S5.area(a.area_id) || {}).nombre || '') + ' · N° ' + a.numero_auditoria + ' · ' + S5.fecha(a.fecha) + '</div>' +
    '<div class="aviso" style="margin-top:14px">Deja de contar en Resultados y en Google Sheets y libera su N° de auditoría. Sus puntajes, observaciones y fotos se conservan.</div>' +
    '<div class="campo" style="margin-top:14px"><label for="inpMotivoAnular">Motivo</label><input id="inpMotivoAnular" value="Auditoría de prueba" autocomplete="off"></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="btnNoAnular" style="flex:1">Cancelar</button>' +
    '<button type="button" class="btn btn-rojo" id="btnSiAnular" style="flex:1">Anular</button></div>');
  DR.$('#btnNoAnular').onclick = UI.cerrarHoja;
  DR.$('#btnSiAnular').onclick = function () {
    var btn = this;
    btn.disabled = true;
    AT.rpc('rpc_s5_anular_auditoria', { p_auditoria: a.id, p_motivo: DR.$('#inpMotivoAnular').value }).then(function () {
      UI.cerrarHoja();
      DR.toast('Auditoría ' + a.codigo + ' anulada.');
      return CAT.refrescar();
    }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
  };
};
