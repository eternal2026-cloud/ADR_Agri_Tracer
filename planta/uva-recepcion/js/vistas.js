/* ============================================================================
 * vistas.js — #hoy (en vivo: buscar por placa, continuar o iniciar) y #reg/<id> (5 marcas)
 * ==========================================================================*/
var VIS = { filtro: '' };

VIS.chipOrigen = function (r) {
  var c = r.origen === 'apk' ? 'azul' : r.origen === 'integra' ? 'verde' : 'naranja';
  return '<span class="pill ' + c + '">' + PL.origenTxt(r) + '</span>';
};
VIS.chipAmbito = function (r) {
  var a = PL.ambito(r);
  return '<span class="pill ' + (a === 'Ciclo completo' ? 'verde' : a === 'Planta' ? 'naranja' : 'gris') + '">' + a + '</span>';
};
VIS.progreso = function (r) {
  return '<div class="pl-prog">' + PL.MARCAS.map(function (m) {
    return '<i title="' + DR.esc(m.nombre) + '" style="' + (r[m.k] ? 'background:' + m.color : '') + '"></i>';
  }).join('') + '</div>';
};

/* ================================================================ HOY */
VIS.hoy = function (c) {
  var puede = AT.puedeCapturar() && AT.tieneAcceso('planta.uva.recepcion');
  var pintar = function () {
    var l = PL.listas(VIS.filtro);
    var tarjetaCampo = function (r) {
      return '<article class="pl-tarjeta entra"><div class="pl-tarjeta-cab"><b class="pl-placa">' + DR.esc(r.placa) + '</b>' + VIS.chipOrigen(r) + '</div>' +
        '<div class="pl-dato">' + DR.esc([r.fundo, r.lote, r.variedad].filter(Boolean).join(' · ') || 'Sin lote') + (r.pallet ? ' · Pallet <b>' + DR.esc(r.pallet) + '</b>' : '') + '</div>' +
        '<div class="pl-sub">' + DR.esc(r.registrador || '') + ' · ' + (r.fin_carga ? 'Carga terminó ' + PL.horaCorta(r.fin_carga) : DR.esc(r.etapa_actual || r.estado || '')) +
          (r.planta ? ' · ' + DR.esc(r.planta) : '') + (r.hora_llegada ? ' · <b>Llegó ' + PL.horaCorta(r.hora_llegada) + '</b> (marcado en campo)' : '') + '</div>' +
        (puede ? '<button class="btn verde chico" data-continuar="' + DR.esc(r.id) + '" type="button">Continuar en planta</button>' : '') + '</article>';
    };
    var tarjetaPlanta = function (r) {
      var sig = PL.siguiente(r);
      return '<a class="pl-tarjeta entra" href="#reg/' + encodeURIComponent(r.id) + '"><div class="pl-tarjeta-cab"><b class="pl-placa">' + DR.esc(r.placa || '—') + '</b>' + VIS.chipAmbito(r) + '</div>' +
        '<div class="pl-dato">' + DR.esc(r.planta_destino || r.planta || '') + (r.linea ? ' · Línea ' + DR.esc(r.linea) : '') +
          (r.vinculado ? ' · ' + DR.esc([r.fundo, r.lote].filter(Boolean).join(' ')) + (r.pallet ? ' · Pallet ' + DR.esc(r.pallet) : '') : '') + '</div>' +
        VIS.progreso(r) + '<div class="pl-sub">' + (sig ? 'Sigue: <b>' + sig.nombre + '</b>' : 'Completo · en planta ' + UI.dur(PL.calcular(r).t_en_planta)) + '</div></a>';
    };
    DR.$('#plListas').innerHTML =
      '<h3 class="pl-titulo">En planta hoy (' + l.enPlanta.length + ')</h3>' +
      (l.enPlanta.length ? l.enPlanta.map(tarjetaPlanta).join('') : '<div class="vacio">Aún no hay camiones en planta hoy.</div>') +
      '<h3 class="pl-titulo">Ciclos de campo en vivo (' + l.porContinuar.length + ')</h3>' +
      '<p class="ayuda-campo">Pallets de hoy con placa (APK o Integra) que aún no se continúan en planta. Elige el del camión que llegó.</p>' +
      (l.porContinuar.length ? l.porContinuar.map(tarjetaCampo).join('') : '<div class="vacio">' + (VIS.filtro ? 'Ningún ciclo de hoy con esa placa.' : 'No hay ciclos de campo de hoy con placa.') + '</div>');
    DR.$$('[data-continuar]').forEach(function (b) { b.onclick = function () { VIS.continuar(PL.regs[b.getAttribute('data-continuar')]); }; });
    DR.entrarPaneles('#plListas');
  };

  c.innerHTML = '<div class="vista angosta">' +
    UI.encabezado('Ingeniería · Planta', 'Recepción Uva', 'Continúa por la placa un ciclo de campo de hoy, o inicia uno desde planta.') +
    '<div class="pl-buscar entra"><input id="plPlaca" placeholder="Buscar placa (ej. ABC123)" autocomplete="off" autocapitalize="characters" value="' + DR.esc(VIS.filtro) + '">' +
      '<button class="btn sec" id="plRecargar" type="button" title="Actualizar">↻</button></div>' +
    (puede ? '<button class="btn azul grande pl-nuevo entra" id="plNuevo" type="button">+ Nuevo en planta (sin ciclo de campo)</button>' : '') +
    '<div id="plListas"><div class="vacio">Cargando…</div></div></div>';
  DR.$('#plPlaca').oninput = function () { VIS.filtro = this.value.toUpperCase(); pintar(); };
  DR.$('#plRecargar').onclick = function () { cargar(true); };
  if (DR.$('#plNuevo')) DR.$('#plNuevo').onclick = VIS.nuevo;
  var cargar = function (aviso) {
    PL.cargarHoy().then(pintar, function (e) { pintar(); if (aviso || !PL.esRed(e.message)) DR.toast(PL.esRed(e.message) ? 'Sin señal: se muestra lo guardado en el equipo.' : e.message, 'error'); });
  };
  pintar();
  cargar(false);
  PL.alCambiar = pintar;
  clearInterval(VIS._t);
  VIS._t = setInterval(function () { if (navigator.onLine && document.visibilityState === 'visible' && DR.vista === 'hoy') cargar(false); }, 20000);
};

VIS.opcionesPlanta = function (sel) {
  var pl = PL.config().plantas || [];
  if (sel && pl.indexOf(sel) < 0) pl = pl.concat([sel]);
  return pl.map(function (p) { return '<option' + (p === sel ? ' selected' : '') + '>' + DR.esc(p) + '</option>'; }).join('');
};
VIS.listaLineas = function () {
  var l = (PL.config().lineas || []).slice();
  Object.keys(PL.regs).forEach(function (id) { var x = PL.regs[id].linea; if (x && l.indexOf(x) < 0) l.push(x); });
  return '<datalist id="plLineas">' + l.map(function (x) { return '<option value="' + DR.esc(x) + '">'; }).join('') + '</datalist>';
};

/** Continuar en planta un ciclo de campo (necesita señal: el servidor confirma que nadie más lo tomó). */
VIS.continuar = function (r) {
  if (!r) return;
  UI.abrirHoja('<h3>Continuar en planta</h3><p class="ayuda-campo">Placa <b>' + DR.esc(r.placa) + '</b> · ' + DR.esc([r.fundo, r.lote, r.variedad].filter(Boolean).join(' · ')) +
      (r.pallet ? ' · Pallet ' + DR.esc(r.pallet) : '') + ' · registrado en ' + PL.origenTxt(r) + ' por ' + DR.esc(r.registrador || '—') + '.</p>' +
    '<div class="campo"><label for="hPlanta">Planta</label><select id="hPlanta">' + VIS.opcionesPlanta(r.planta) + '</select></div>' +
    '<div class="campo"><label for="hLinea">Línea de abastecimiento</label><input id="hLinea" list="plLineas" maxlength="40" placeholder="ej. Línea 3">' + VIS.listaLineas() + '</div>' +
    '<div class="acciones"><button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn verde" id="hSi" type="button">Continuar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  DR.$('#hSi').onclick = function () {
    if (!navigator.onLine) { DR.toast('Para continuar un ciclo de campo se necesita señal (Integra confirma que nadie más lo tomó).', 'error'); return; }
    var b = this; b.disabled = true;
    AT.rpc('rpc_uva_planta_iniciar', { p: { id_campo: r.id, planta: DR.$('#hPlanta').value, linea: DR.$('#hLinea').value } }).then(function (f) {
      PL.ponerFila(f); PL.guardarCache(); UI.cerrarHoja();
      DR.toast(f.hora_llegada ? 'Ciclo vinculado: campo ya marcó la llegada (' + PL.horaCorta(f.hora_llegada) + ').' : 'Ciclo vinculado: marca la llegada del camión.', 'ok');
      location.hash = '#reg/' + encodeURIComponent(f.id);
    }, function (e) { b.disabled = false; DR.toast(e.message, 'error'); });
  };
};

/** Nuevo desde planta: funciona sin señal (se envía cuando vuelva). */
VIS.nuevo = function () {
  UI.abrirHoja('<h3>Nuevo en planta</h3><p class="ayuda-campo">Para camiones sin ciclo de campo registrado. Su ámbito será <b>Planta</b>.</p>' +
    '<div class="campo"><label for="hPlaca">Placa del camión</label><input id="hPlaca" maxlength="12" autocapitalize="characters" placeholder="ABC123" value="' + DR.esc(VIS.filtro) + '"></div>' +
    '<div class="campo"><label for="hPlanta">Planta</label><select id="hPlanta">' + VIS.opcionesPlanta('') + '</select></div>' +
    '<div class="campo"><label for="hLinea">Línea de abastecimiento</label><input id="hLinea" list="plLineas" maxlength="40" placeholder="ej. Línea 3">' + VIS.listaLineas() + '</div>' +
    '<label class="chk"><input type="checkbox" id="hYa" checked> Marcar ahora la llegada del camión</label>' +
    '<div class="acciones"><button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn azul" id="hSi" type="button">Iniciar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  DR.$('#hSi').onclick = function () {
    var placa = DR.$('#hPlaca').value.toUpperCase().replace(/\s+/g, '');
    if (!placa) { DR.toast('Escribe la placa del camión.', 'error'); return; }
    var id = PL.nuevoId(), ahora = new Date().toISOString(), ya = DR.$('#hYa').checked;
    var p = { id_nuevo: id, placa: placa, planta: DR.$('#hPlanta').value, linea: DR.$('#hLinea').value, creado: ahora };
    PL.ponerFila({ id: id, origen: 'planta', placa: placa, planta: p.planta, planta_destino: p.planta, linea: p.linea, fecha: PL.hoyISO(),
      planta_inicio: ahora, planta_usuario: AT.perfil.nombre, registrador: AT.perfil.nombre, planta_detalle: {}, vinculado: false, _nuevo: true,
      hora_llegada: ya ? ahora : null });
    PL.guardarCache();
    PL.encolar('iniciar', p);
    if (ya) PL.encolar('guardar', { id: id, hora_llegada: ahora });
    UI.cerrarHoja();
    location.hash = '#reg/' + encodeURIComponent(id);
  };
};

/* ================================================================ REGISTRO */
VIS.registro = function (c, id) {
  var pintar = function () {
    var r = PL.regs[id];
    if (!r) { c.innerHTML = '<div class="vista angosta"><div class="vacio">No se encontró el registro.</div><a class="btn sec" href="#hoy">Volver</a></div>'; return; }
    var puede = AT.puedeCapturar() && AT.tieneAcceso('planta.uva.recepcion');
    var k = PL.calcular(r), det = r.planta_detalle || {}, sig = PL.siguiente(r);
    var campo = '';
    if (r.vinculado) {
      var et = Array.isArray(r.etapas) ? r.etapas : [];
      campo = UI.panel('Campo (' + PL.origenTxt(r) + ')', [r.fundo, r.lote, r.variedad].filter(Boolean).join(' · ') + (r.pallet ? ' · Pallet ' + r.pallet : '') + ' · ' + (r.registrador || ''),
        '<div class="pl-campo">' + et.map(function (e) {
          return '<div><span>' + (e.n || '') + '. ' + DR.esc(e.etapa || PL.ETAPAS_CAMPO[(e.n || 1) - 1] || '') + '</span><b>' + PL.horaCorta(e.inicio) + ' – ' + PL.horaCorta(e.fin) + '</b><em>' + (e.minutos !== '' && e.minutos !== null && e.minutos !== undefined ? UI.dur(e.minutos) : '—') + '</em></div>';
        }).join('') + '</div>' +
        '<p class="ayuda-campo">Ciclo de campo: <b>' + (r.min_total ? UI.dur(r.min_total) : 'en proceso') + '</b>' +
          (k.t_llegada_desde_carga !== null ? ' · De fin de carga a llegada a planta: <b>' + UI.dur(k.t_llegada_desde_carga) + '</b>' : '') + '</p>');
    }
    var marcas = PL.MARCAS.map(function (m, i) {
      var v = r[m.k], d = det[m.d] || {}, previa = i ? r[PL.MARCAS[i - 1].k] : true;
      var activa = !v && previa && puede;
      return '<div class="pl-marca' + (v ? ' hecha' : '') + (sig && sig.k === m.k ? ' actual' : '') + '" style="--c:' + m.color + '">' +
        '<div class="pl-marca-cab"><span class="pl-n">' + (i + 1) + '</span><div><b>' + m.nombre + '</b>' +
          (v && m.k === 'hora_llegada' && r.llegada_por === 'campo' ? '<small>Marcada en campo (' + PL.origenTxt(r) + ')</small>' : '') +
          (d.causa || d.com ? '<small>' + DR.esc([d.causa, d.com].filter(Boolean).join(' · ')) + '</small>' : '') + '</div>' +
          '<span class="pl-hora">' + PL.hora(v) + '</span></div>' +
        (puede ? '<div class="pl-marca-btns">' +
          (activa ? '<button class="btn verde chico" data-ahora="' + m.k + '" type="button">Ahora</button>' : '') +
          (v || previa ? '<button class="btn sec chico" data-editar="' + m.k + '" type="button">' + (v ? 'Editar hora' : 'Hora manual') + '</button>' : '') +
          '<button class="btn sec chico" data-nota="' + m.d + '" type="button">Causa / nota</button></div>' : '') +
      '</div>';
    }).join('');
    var tramos = PL.TRAMOS.map(function (t) { return '<div><span>' + t[3] + '</span><b>' + UI.dur(k[t[0]]) + '</b></div>'; }).join('') +
      (r.vinculado ? '<div class="total"><span>Ciclo completo (inicio de cosecha → abastecimiento)</span><b>' + UI.dur(k.t_ciclo_completo) + '</b></div>' : '');

    c.innerHTML = '<div class="vista angosta">' +
      '<a class="campo-volver" href="#hoy">' + DR.ICONOS.atras + 'Hoy</a>' +
      '<div class="pl-tarjeta-cab entra" style="margin:6px 0 4px"><b class="pl-placa grande">' + DR.esc(r.placa || '—') + '</b>' + VIS.chipAmbito(r) + '</div>' +
      '<p class="ayuda-campo entra">' + DR.esc(r.planta_destino || r.planta || '') + (r.linea ? ' · Línea ' + DR.esc(r.linea) : '') + ' · ' + DR.esc(r.planta_usuario || '') +
        (puede ? ' · <a href="#" id="plDatos">Cambiar planta / línea</a>' : '') + '</p>' +
      UI.panel('Planta', sig ? 'Sigue: ' + sig.nombre : 'Las 5 marcas están completas', '<div class="pl-marcas">' + marcas + '</div>') +
      UI.panel('Tiempos en planta', 'Se calculan entre marcas (min:seg)', '<div class="pl-tramos">' + tramos + '</div>') +
      campo +
      (puede ? '<div class="acciones"><button class="btn btn-peligro" id="plQuitar" type="button">' + (r.origen === 'planta' ? 'Anular registro' : 'Quitar de planta (vuelve a Campo)') + '</button></div>' : '') +
    '</div>';

    DR.$$('[data-ahora]').forEach(function (b) { b.onclick = function () { VIS.marcar(r, b.getAttribute('data-ahora'), new Date().toISOString(), true); }; });
    DR.$$('[data-editar]').forEach(function (b) { b.onclick = function () { VIS.editarHora(r, b.getAttribute('data-editar')); }; });
    DR.$$('[data-nota]').forEach(function (b) { b.onclick = function () { VIS.nota(r, b.getAttribute('data-nota')); }; });
    if (DR.$('#plDatos')) DR.$('#plDatos').onclick = function (e) { e.preventDefault(); VIS.datos(r); };
    if (DR.$('#plQuitar')) DR.$('#plQuitar').onclick = function () { VIS.quitar(r); };
    DR.entrarPaneles('#contenido');
  };
  PL.alCambiar = pintar;
  pintar();
  if (navigator.onLine) PL.cargarUno(id).then(pintar, function () { /* sin señal: lo del equipo */ });
};

/** Guarda una marca (en el equipo y a la cola). Valida el orden con la marca anterior y la siguiente.
 *  ahora = botón «Ahora»: si campo ya marcó la llegada mientras tanto, el servidor conserva la de campo. */
VIS.marcar = function (r, k, iso, ahora) {
  var i = PL.MARCAS.findIndex(function (m) { return m.k === k; });
  var ant = i > 0 ? r[PL.MARCAS[i - 1].k] : null, sig = i < PL.MARCAS.length - 1 ? r[PL.MARCAS[i + 1].k] : null;
  if (iso && ant && new Date(iso) < new Date(ant)) { DR.toast(PL.MARCAS[i].nombre + ' no puede ser antes de ' + PL.MARCAS[i - 1].nombre + ' (' + PL.hora(ant) + ').', 'error'); return; }
  if (iso && sig && new Date(iso) > new Date(sig)) { DR.toast(PL.MARCAS[i].nombre + ' no puede ser después de ' + PL.MARCAS[i + 1].nombre + ' (' + PL.hora(sig) + ').', 'error'); return; }
  r[k] = iso || null;
  if (k === 'hora_llegada') r.llegada_por = iso ? 'planta' : null;
  PL.guardarCache();
  var p = { id: r.id }; p[k] = iso || '';
  if (ahora && k === 'hora_llegada') p.llegada_nueva = true;
  PL.encolar('guardar', p);
  DR.vibrar && DR.vibrar(15);
  if (PL.alCambiar) PL.alCambiar();
};

VIS.editarHora = function (r, k) {
  var m = PL.MARCAS.filter(function (x) { return x.k === k; })[0], v = r[k];
  var base = v || r.hora_llegada || r.planta_inicio || new Date().toISOString();
  UI.abrirHoja('<h3>' + m.nombre + '</h3><div class="campo"><label for="hHora">Hora (con segundos)</label><input id="hHora" type="time" step="1" value="' + (v ? PL.hora(v) : PL.hora(new Date().toISOString())) + '"></div>' +
    '<div class="acciones">' + (v ? '<button class="btn btn-peligro" id="hBorrar" type="button">Borrar</button>' : '') +
    '<button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn verde" id="hSi" type="button">Guardar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  if (DR.$('#hBorrar')) DR.$('#hBorrar').onclick = function () { UI.cerrarHoja(); VIS.marcar(r, k, null); };
  DR.$('#hSi').onclick = function () {
    var iso = PL.deHora(base, DR.$('#hHora').value);
    if (!iso) { DR.toast('Escribe la hora.', 'error'); return; }
    UI.cerrarHoja(); VIS.marcar(r, k, iso);
    var d = (r.planta_detalle = r.planta_detalle || {}), dd = PL.MARCAS.filter(function (x) { return x.k === k; })[0].d;
    d[dd] = Object.assign({}, d[dd] || {}, { editado: true });
    var p = { id: r.id, detalle: {} }; p.detalle[dd] = d[dd];
    PL.guardarCache(); PL.encolar('guardar', p);
  };
};

VIS.nota = function (r, dd) {
  var m = PL.MARCAS.filter(function (x) { return x.d === dd; })[0], d = (r.planta_detalle || {})[dd] || {};
  UI.abrirHoja('<h3>' + m.nombre + '</h3>' +
    '<div class="campo"><label for="hCausa">Causa de demora</label><select id="hCausa"><option value="">— Sin demora —</option>' +
      PL.CAUSAS.map(function (x) { return '<option' + (x === d.causa ? ' selected' : '') + '>' + DR.esc(x) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo"><label for="hCom">Comentario</label><textarea id="hCom" rows="3" maxlength="300">' + DR.esc(d.com || '') + '</textarea></div>' +
    '<div class="acciones"><button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn verde" id="hSi" type="button">Guardar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  DR.$('#hSi').onclick = function () {
    var nuevo = Object.assign({}, d, { causa: DR.$('#hCausa').value, com: DR.$('#hCom').value.trim() });
    r.planta_detalle = r.planta_detalle || {}; r.planta_detalle[dd] = nuevo;
    var p = { id: r.id, detalle: {} }; p.detalle[dd] = nuevo;
    PL.guardarCache(); PL.encolar('guardar', p); UI.cerrarHoja();
    if (PL.alCambiar) PL.alCambiar();
  };
};

VIS.datos = function (r) {
  UI.abrirHoja('<h3>Planta y línea</h3>' +
    (r.origen === 'planta' ? '<div class="campo"><label for="hPlaca">Placa</label><input id="hPlaca" maxlength="12" value="' + DR.esc(r.placa || '') + '"></div>' : '') +
    '<div class="campo"><label for="hPlanta">Planta</label><select id="hPlanta">' + VIS.opcionesPlanta(r.planta_destino || r.planta) + '</select></div>' +
    '<div class="campo"><label for="hLinea">Línea de abastecimiento</label><input id="hLinea" list="plLineas" maxlength="40" value="' + DR.esc(r.linea || '') + '">' + VIS.listaLineas() + '</div>' +
    '<div class="campo"><label for="hObs">Observación</label><textarea id="hObs" rows="2" maxlength="300">' + DR.esc(r.planta_obs || '') + '</textarea></div>' +
    '<div class="acciones"><button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn verde" id="hSi" type="button">Guardar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  DR.$('#hSi').onclick = function () {
    var p = { id: r.id, planta: DR.$('#hPlanta').value, linea: DR.$('#hLinea').value, obs: DR.$('#hObs').value };
    r.planta_destino = p.planta; r.linea = p.linea; r.planta_obs = p.obs;
    if (DR.$('#hPlaca')) { p.placa = DR.$('#hPlaca').value.toUpperCase().replace(/\s+/g, ''); r.placa = p.placa; r.planta = p.planta; }
    PL.guardarCache(); PL.encolar('guardar', p); UI.cerrarHoja();
    if (PL.alCambiar) PL.alCambiar();
  };
};

VIS.quitar = function (r) {
  var txt = r.origen === 'planta' ? 'Se anula este registro de planta.' : 'Se borran las marcas de planta y el ciclo vuelve a ser solo de Campo (otro puede continuarlo).';
  UI.abrirHoja('<h3>¿Seguro?</h3><p class="ayuda-campo">' + txt + '</p><div class="acciones"><button class="btn sec" id="hNo" type="button">Cancelar</button><button class="btn btn-peligro" id="hSi" type="button">Sí, quitar</button></div>');
  DR.$('#hNo').onclick = UI.cerrarHoja;
  DR.$('#hSi').onclick = function () {
    if (!navigator.onLine) { DR.toast('Se necesita señal para quitarlo.', 'error'); return; }
    AT.rpc('rpc_uva_planta_quitar', { p_id: r.id }).then(function () {
      delete PL.regs[r.id]; PL.guardarCache(); UI.cerrarHoja(); DR.toast('Listo.', 'ok'); location.hash = '#hoy';
    }, function (e) { DR.toast(e.message, 'error'); });
  };
};
