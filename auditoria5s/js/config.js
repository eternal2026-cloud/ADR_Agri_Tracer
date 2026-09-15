/* ============================================================================
 * config.js — CATÁLOGO 5S (solo administradores)
 * Cultivos (campaña, planta, ícono y color), plazo de corrección, áreas y
 * zonas por cultivo, textos del CHECK LIST y gestión de auditorías
 * (reabrir / anular). Nada se borra: se desactiva, para no romper el historial.
 * ==========================================================================*/
var CAT = { cultivo: null, area: null, auditorias: [], abiertos: {} };

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
    if (!CAT.cultivo || !S5.cultivo(CAT.cultivo)) CAT.cultivo = S5.cultivoId() || (S5.cultivos[0] || {}).id || null;
    if (!CAT.area || !S5.area(CAT.area)) {
      var conZonas = CAT.cultivo ? S5.areasDe(CAT.cultivo, true) : [];
      CAT.area = (conZonas[0] || S5.areas[0] || {}).id || null;
    }
  });
};

CAT.refrescar = function () {
  var cont = DR.$('#contenido'), y = cont.scrollTop;
  return CAT.cargar().then(function () { CAT.pintar(false); cont.scrollTop = y; }).catch(function (e) { DR.toast(e.message, 'error'); });
};

CAT.opcionesIcono = function (actual) {
  return S5.ICONOS_CULTIVO.map(function (i) { return '<option value="' + i.id + '"' + (i.id === actual ? ' selected' : '') + '>' + i.t + '</option>'; }).join('');
};

CAT.camposCultivo = function (c) {
  c = c || {};
  return '<div class="campo"><label>Nombre</label><input data-c="nombre" value="' + DR.esc(c.nombre || '') + '" placeholder="Ej. Palta" autocomplete="off"></div>' +
    '<div class="campo"><label>Campaña vigente</label><input data-c="campana" value="' + DR.esc(c.campana || '') + '" placeholder="Ej. Uva 2026 - 2027" autocomplete="off"></div>' +
    '<div class="campo"><label>Planta</label><input data-c="planta" value="' + DR.esc(c.planta || '') + '" placeholder="Ej. Planta Don Carlos" autocomplete="off"></div>' +
    '<div class="campo"><label>Ícono</label><select data-c="icono">' + CAT.opcionesIcono(c.icono || 'hoja') + '</select></div>' +
    '<div class="campo"><label>Color</label><input type="color" data-c="color" value="' + DR.esc((c.color || '#76B729').toLowerCase()) + '"></div>';
};

CAT.leerCampos = function (raiz) {
  var p = {};
  DR.$$('[data-c]', raiz).forEach(function (el) { p[el.getAttribute('data-c')] = el.value.trim(); });
  return p;
};

CAT.pintar = function (animar) {
  var cont = DR.$('#contenido');
  if (DR.vista !== 'catalogo' || !cont) return;
  var cul = S5.cultivo(CAT.cultivo), area = S5.area(CAT.area);
  var zonas = cul && area ? S5.zonasDe(area.id, true, cul.id) : [];

  var h = UI.encabezado('Auditoría 5S', 'Catálogo', 'Cultivos, áreas, zonas por cultivo y textos del CHECK LIST. Nada se borra: desactiva lo que ya no aplica para conservar el historial.');

  h += UI.panel('Plazo de corrección', 'Días desde la fecha de la auditoría en que un auditor puede corregir puntajes desde un seguimiento. Pasado el plazo, solo un administrador.',
    '<div class="form"><div class="campo"><label for="catDias">Días</label><input id="catDias" type="number" inputmode="numeric" min="0" max="60" value="' + S5.diasCorreccion() + '"></div></div>' +
    '<div class="acciones"><button type="button" class="btn" id="catGuardarParam">Guardar plazo</button></div>');

  h += UI.panel('Cultivos', 'Cada cultivo tiene su campaña, su planta y sus propias zonas por área. Los puntajes nunca se mezclan entre cultivos.',
    S5.cultivos.map(function (c) {
      var nZonas = S5.zonas.filter(function (z) { return z.cultivo_id === c.id && z.activo; }).length;
      return '<div class="cultivo-fila' + (c.activo ? '' : ' inactiva') + '" data-cultivo-fila="' + c.id + '">' + S5.iconoCultivo(c, 44) +
        '<div class="u-cuerpo"><div class="u-nombre">' + DR.esc(c.nombre) + (c.activo ? '' : ' <span class="pill rojo">Inactivo</span>') + '</div>' +
        '<div class="u-det">' + DR.esc(c.campana || 'Sin campaña') + ' · ' + DR.esc(c.planta || 'Sin planta') + ' · ' + nZonas + ' zonas activas</div></div>' +
        '<div class="form">' + CAT.camposCultivo(c) + '</div>' +
        '<div class="fila-acc"><button type="button" class="btn sec chico" data-cultivo-activo="' + c.id + '">' + (c.activo ? 'Desactivar' : 'Activar') + '</button>' +
        '<button type="button" class="btn chico" data-cultivo-guardar="' + c.id + '">Guardar</button></div></div>';
    }).join('') +
    '<div class="sep-titulo">Nuevo cultivo</div><div class="form" id="catNuevoCultivo">' + CAT.camposCultivo(null) + '</div>' +
    '<div class="acciones"><button type="button" class="btn" id="catAgregarCultivo">Agregar cultivo</button></div>');

  h += UI.panel('Áreas y zonas por cultivo', 'Elige el cultivo y el área. Cambiar el nombre o número de una zona también cambia su historial en BD y Google Sheets.',
    '<div class="opciones" id="catCultivos">' + S5.cultivos.map(function (c) {
      return '<button type="button" class="opcion con-ico' + (cul && c.id === cul.id ? ' activa' : '') + (c.activo ? '' : ' inactiva') + '" data-valor="' + c.id + '" style="--c:' + c.color + '">' +
        S5.iconoCultivo(c, 22) + DR.esc(c.nombre) + '</button>';
    }).join('') + '</div>' +
    '<div class="sep-titulo">Áreas · entre paréntesis, zonas de ' + DR.esc(cul ? cul.nombre : '') + '</div>' +
    '<div class="opciones" id="catAreas">' + S5.areas.map(function (a) {
      var n = cul ? S5.zonasDe(a.id, true, cul.id).length : 0;
      return '<button type="button" class="opcion' + (area && a.id === area.id ? ' activa' : '') + (a.activo ? '' : ' inactiva') + '" data-valor="' + a.id + '">' + DR.esc(a.nombre) + '<small>' + n + '</small></button>';
    }).join('') + '</div>' +
    (area
      ? '<div class="fila-cat area-cat"><input id="catAreaNombre" value="' + DR.esc(area.nombre) + '" aria-label="Nombre del área">' +
          '<div class="fila-acc"><button type="button" class="btn sec chico" id="catAreaActiva">' + (area.activo ? 'Desactivar área (todos los cultivos)' : 'Activar área') + '</button>' +
          '<button type="button" class="btn chico" id="catAreaGuardar">Guardar nombre</button></div></div>' +
        '<div class="sep-titulo">Zonas de ' + DR.esc(area.nombre) + ' · ' + DR.esc(cul ? cul.nombre : '') + '</div>' +
        (zonas.length ? zonas.map(function (z) {
          return '<div class="fila-cat' + (z.activo ? '' : ' inactiva') + '" data-zona-fila="' + z.id + '">' +
            '<input type="number" inputmode="numeric" min="1" max="99" value="' + z.numero + '" data-zn aria-label="Número de zona">' +
            '<input value="' + DR.esc(z.nombre) + '" data-zt aria-label="Nombre de la zona">' +
            '<div class="fila-acc"><button type="button" class="btn sec chico" data-zona-activa="' + z.id + '">' + (z.activo ? 'Desactivar' : 'Activar') + '</button>' +
            '<button type="button" class="btn chico" data-zona-guardar="' + z.id + '">Guardar</button></div></div>';
        }).join('') : '<div class="vacio">' + DR.esc(cul ? cul.nombre : 'Este cultivo') + ' no tiene zonas en esta área.</div>') +
        '<div class="campo" style="margin-top:10px"><label for="catNuevasZonas">Agregar zonas (una por línea)</label>' +
          '<textarea id="catNuevasZonas" rows="3" placeholder="Recepción&#10;Sala de proceso"></textarea></div>' +
        '<div class="acciones"><button type="button" class="btn chico" id="catAgregarZonas">Agregar zonas</button></div>'
      : '') +
    '<div class="sep-titulo">Nueva área</div><div class="lista-add"><input id="catNuevaArea" placeholder="Ej. Ingeniería" autocomplete="off"><button type="button" class="btn chico" id="catAgregarArea">Agregar área</button></div>');

  h += UI.panel('Checklist (CHECK LIST)', 'Igual para todos los cultivos. Máximo 6 ítems por S (columnas 1–6 de la hoja BD). Un ítem desactivado deja de pedirse en las evaluaciones nuevas.',
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
      return '<div class="papelera-item">' + S5.iconoCultivo(S5.cultivo(a.cultivo_id), 30) +
        '<div class="u-cuerpo"><div class="u-nombre">' + DR.esc(a.codigo) + ' · ' + DR.esc((S5.area(a.area_id) || {}).nombre || '') + ' N° ' + a.numero_auditoria + '</div>' +
        '<div class="u-det">' + DR.esc((S5.cultivo(a.cultivo_id) || {}).nombre || '') + ' · ' + S5.fecha(a.fecha) + ' · ' + DR.esc(a.campana) + (a.auditor ? ' · ' + DR.esc(a.auditor) : '') + '</div>' +
        '<div class="u-pills">' + pill + (a.motivo_anulacion ? ' <span class="u-det">' + DR.esc(a.motivo_anulacion) + '</span>' : '') + '</div></div>' +
        (a.estado === 'cerrada' ? '<button type="button" class="btn sec chico" data-reabrir="' + a.id + '">Reabrir</button>' : '') +
        (a.estado !== 'anulada' ? '<button type="button" class="btn sec chico" data-anular="' + a.id + '">Anular</button>' : '') + '</div>';
    }).join('') : '<div class="vacio">Sin auditorías.</div>');

  cont.innerHTML = h;
  if (animar) DR.entrarPaneles('#contenido');
  CAT.enlazar(cont, cul, area);
};

CAT.enlazar = function (cont, cul, area) {
  DR.$('#catGuardarParam').onclick = CAT.guardarPlazo;

  DR.$$('[data-cultivo-guardar]', cont).forEach(function (b) {
    b.onclick = function () {
      var id = Number(this.getAttribute('data-cultivo-guardar')), p = CAT.leerCampos(DR.$('[data-cultivo-fila="' + id + '"]'));
      if (!p.nombre) { DR.toast('El cultivo necesita un nombre.', 'error'); return; }
      p.id = id;
      CAT.rpc(this, 'rpc_s5_guardar_cultivo', p, 'Cultivo «' + p.nombre + '» guardado.');
    };
  });
  DR.$$('[data-cultivo-activo]', cont).forEach(function (b) {
    b.onclick = function () {
      var c = S5.cultivo(this.getAttribute('data-cultivo-activo'));
      if (c.activo && S5.cultivosActivos().length === 1) { DR.toast('Debe quedar al menos un cultivo activo.', 'error'); return; }
      CAT.rpc(this, 'rpc_s5_guardar_cultivo', { id: c.id, activo: !c.activo }, c.activo ? 'Cultivo desactivado.' : 'Cultivo activado.');
    };
  });
  DR.$('#catAgregarCultivo').onclick = function () {
    var p = CAT.leerCampos(DR.$('#catNuevoCultivo'));
    if (!p.nombre) { DR.toast('Escribe el nombre del cultivo.', 'error'); return; }
    CAT.rpc(this, 'rpc_s5_guardar_cultivo', p, 'Cultivo «' + p.nombre + '» agregado. Ahora agrégale áreas y zonas.');
  };

  OBS.chips('#catCultivos', function (v) {
    CAT.cultivo = Number(v);
    if (!S5.zonasDe(CAT.area, true, CAT.cultivo).length) {
      var conZonas = S5.areasDe(CAT.cultivo, true);
      if (conZonas.length) CAT.area = conZonas[0].id;
    }
    CAT.pintar(false);
  });
  OBS.chips('#catAreas', function (v) { CAT.area = Number(v); CAT.pintar(false); });
  DR.$('#catAgregarArea').onclick = function () {
    var inp = DR.$('#catNuevaArea'), nombre = inp.value.trim();
    if (!nombre) { inp.focus(); return; }
    var btn = this;
    btn.disabled = true;
    AT.rpc('rpc_s5_guardar_area', { p: { nombre: nombre } }).then(function (a) {
      CAT.area = a.id;
      DR.toast('Área «' + a.nombre + '» lista. Agrégale zonas para ' + (cul ? cul.nombre : 'el cultivo') + '.');
      return CAT.refrescar();
    }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
  };
  if (area) {
    DR.$('#catAreaGuardar').onclick = function () { CAT.rpc(this, 'rpc_s5_guardar_area', { id: area.id, nombre: DR.$('#catAreaNombre').value.trim() }, 'Área actualizada.'); };
    DR.$('#catAreaActiva').onclick = function () {
      if (area.activo && !window.confirm('¿Desactivar «' + area.nombre + '»? Deja de ofrecerse para todos los cultivos.')) return;
      CAT.rpc(this, 'rpc_s5_guardar_area', { id: area.id, activo: !area.activo }, area.activo ? 'Área desactivada.' : 'Área activada.');
    };
    DR.$('#catAgregarZonas').onclick = function () {
      var nombres = DR.$('#catNuevasZonas').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!cul) return;
      if (!nombres.length) { DR.$('#catNuevasZonas').focus(); return; }
      var btn = this;
      btn.disabled = true;
      AT.rpc('rpc_s5_agregar_zonas', { p_cultivo: cul.id, p_area: area.id, p_nombres: nombres }).then(function () {
        DR.toast('Zonas agregadas a ' + area.nombre + ' · ' + cul.nombre + '.');
        return CAT.refrescar();
      }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
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

CAT.guardarPlazo = function () {
  var btn = this, dias = parseInt(DR.$('#catDias').value, 10);
  if (isNaN(dias) || dias < 0 || dias > 60) { DR.toast('Escribe un número de días entre 0 y 60.', 'error'); return; }
  btn.disabled = true;
  CAT.guardarParametro('S5_DIAS_CORRECCION', dias).then(function () {
    DR.toast('Plazo guardado: ' + dias + ' día(s).');
    return CAT.refrescar();
  }).catch(function (e) { btn.disabled = false; DR.toast(e.message, 'error'); });
};

CAT.confirmarAnular = function (a) {
  if (!a) return;
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#FFA3A3">' + DR.ICONOS.alerta + '<span>Anular auditoría</span></div>' +
    '<div class="res-nombre">' + DR.esc(a.codigo) + '</div>' +
    '<div class="res-dni" style="letter-spacing:.02em">' + DR.esc(AUD.etiqueta(a)) + ' · ' + S5.fecha(a.fecha) + '</div>' +
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
