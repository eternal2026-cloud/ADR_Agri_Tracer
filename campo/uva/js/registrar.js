/* ============================================================================
 * registrar.js — CAPTURA SECUENCIAL POR ETAPAS (mismo diseño que Integra Operaciones ·
 * ciclos/captura.js): lista de pallets → asistente de 8 etapas → pantalla de cierre.
 *  · Se ve UNA etapa a la vez, con el selector de pasos arriba (8 círculos y barra de avance).
 *  · Cada hora tiene su botón «Ahora»; el botón grande inferior siempre dice qué toca marcar.
 *  · Al marcar el fin de una etapa el asistente se queda en ella: el supervisor decide a
 *    cuál pasar (botón «Siguiente» o los pasos de arriba).
 *  · Cosecha, traslado de jaba y armado se toman en paralelo (cualquiera en cualquier orden).
 *    Desde el lecturado, cada etapa se habilita cuando termina aquella de la que depende.
 *  · Sin código de pallet no se pasa de la etapa Cosecha.
 *  · Datos obligatorios para terminar una etapa: N° de jabas (armado), N° de zunchos
 *    (enzunchado), N° total de pallets y de pallets cargados (portabin) y planta (traslado).
 *  · Desde la lista, cada pallet en curso tiene «Marcar … ahora» para registrar sin entrar.
 * Todo se guarda en el equipo en cada cambio (borrador) y sube solo a Integra (la misma base de la APK).
 * ==========================================================================*/

var REG = { vista: 'lista', id: null, idx: 0, filtro: '', _pct: 0 };

/** Campos propios de algunas etapas (columnas de la BD): [campo, rótulo, tipo, ejemplo, obligatorio para terminarla]. */
REG.EXTRAS = {
  arm: [['jabas', 'N° jabas', 'number', '45', true]],
  enz: [['zunchos', 'N° de zunchos', 'number', '3', true]],
  por: [['palletsTot', 'N° total de pallets', 'number', '14', true], ['palletsCarg', 'N° total de pallets cargados', 'number', '14', true]],
  car: [['placa', 'Placa de camión', 'text', 'CCV39']],
  tra: [['planta', 'Planta destino', 'planta', '', true]]
};
/** Dato obligatorio que aún falta para terminar la etapa ([campo, rótulo…]) o null. */
REG.faltaParaFin = function (r, e) {
  return (REG.EXTRAS[e.id] || []).filter(function (f) {
    return f[4] && (f[2] === 'number' ? !(Number(r[f[0]]) > 0) : !String(r[f[0]] || '').trim());
  })[0] || null;
};
/** Toma lo escrito en los campos de la etapa aunque aún no hayan perdido el foco. */
REG.leerExtras = function (r) {
  DR.$$('[data-x]').forEach(function (inp) { var k = inp.getAttribute('data-x'); r[k] = k === 'placa' ? inp.value.trim().toUpperCase() : inp.value; });
};

/* ------------------------------------------------ horas */
/** HH:MM escrito a mano → ISO. Referencia: el inicio de la etapa (para el fin) o el fin
 *  de la etapa previa (para el inicio). Si queda más de 6 h antes, es del día siguiente;
 *  si queda poco antes se respeta para que la validación lo marque. */
REG.horaAISO = function (r, etapa, campo, hhmm) {
  if (!hhmm) return '';
  var e = TC.E[etapa], x = r.etapas[etapa], ref = null;
  if (campo === 'fin' && x.ini) ref = new Date(x.ini);
  else {
    var d0 = e.dep;
    while (d0 && !ref) { var y = r.etapas[d0]; ref = y.fin ? new Date(y.fin) : (y.ini ? new Date(y.ini) : null); d0 = TC.E[d0].dep; }
  }
  var p = hhmm.split(':'), d;
  if (ref) {
    d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), +p[0], +p[1], 0);
    if (ref - d > 6 * 3600000) d.setDate(d.getDate() + 1);
  } else {
    var f = r.fecha.split('-');
    d = new Date(+f[0], +f[1] - 1, +f[2], +p[0], +p[1], 0);
  }
  return d.toISOString();
};

/** Etapa que toca ahora: la primera en curso o, si no hay, la primera habilitada que no terminó
 *  (-1 si el ciclo está completo). */
REG.proxima = function (r) {
  var libre = -1;
  for (var i = 0; i < TC.ETAPAS.length; i++) {
    var e = TC.ETAPAS[i], x = r.etapas[e.id];
    if (x.ini && !x.fin) return i;
    if (libre < 0 && !x.fin && !TC.bloqueada(r, e)) libre = i;
  }
  return libre;
};
/** Siguiente hora vacía (la que marcaría «Ahora» desde la lista). */
REG.siguienteHora = function (r) {
  if (r.estado === 'cerrado') return null;
  var i = REG.proxima(r);
  if (i < 0) return null;
  var e = TC.ETAPAS[i];
  return { e: e, campo: r.etapas[e.id].ini ? 'fin' : 'ini' };
};
REG.rotHora = function (e, campo) { return (campo === 'ini' ? 'Inicio' : 'Fin') + ' ' + e.nombre.toLowerCase(); };
REG.subtitulo = function (r) { return [r.fundo, r.variedad, r.grupo].filter(Boolean).map(DR.esc).join(' · '); };
REG.datosOrigen = function (r) { return !!(r.fundo && r.lote); };
/** Con fundo, lote y código de pallet ya se puede pasar a las demás etapas. */
REG.listo = function (r) { return REG.datosOrigen(r) && !!String(r.pallet || '').trim(); };

/* ------------------------------------------------ navegación */
VISTAS.registrar = function (cont) {
  var r = REG.id ? (TC.obtener(REG.id) || (REG.nuevoReg && REG.nuevoReg.id === REG.id ? REG.nuevoReg : null)) : null;
  if (REG.vista === 'wiz' && r) return REG.pintarWiz(cont, r, 0);
  if (REG.vista === 'fin' && r) return REG.pintarFin(cont, r);
  REG.pintarLista(cont);
};
/** Abre un pallet (o uno nuevo con id null) en la etapa que toca (o en la etapa idx). */
REG.abrir = function (id, idx) {
  var r = id ? TC.obtener(id) : null;
  if (!r) { r = TC.nuevo(); REG.nuevoReg = r; }
  REG.id = r.id;
  if (r.estado === 'cerrado') REG.vista = 'fin';
  else {
    REG.vista = 'wiz'; var p = REG.proxima(r);
    REG.idx = !REG.listo(r) ? 0 : idx !== undefined ? idx : p < 0 ? TC.ETAPAS.length - 1 : p;
  }
  REG._pct = 0;
  APP.ir('registrar');
};
REG.aLista = function () { REG.vista = 'lista'; REG.id = null; APP.ir('registrar'); };

REG.guardar = function (r) {
  TC.guardarRegistro(r);
  if (REG.nuevoReg && REG.nuevoReg.id === r.id) REG.nuevoReg = null;
  APP.estado(); SHEETS.pronto();
};

/* ================================================ LISTA DE PALLETS */
/** soloVer === true: pallet de otro equipo (sin «Marcar … ahora»; se abre en solo lectura). */
REG.tarjetaHtml = function (r, i, l, soloVer) {
  var idx = REG.proxima(r), et = idx > -1 ? TC.ETAPAS[idx] : null, cerrado = r.estado === 'cerrado';
  var seg = TC.ETAPAS.map(function (e, i) {
    var x = r.etapas[e.id];
    return '<i class="' + (x.fin ? 'hecho' : (i === idx || (x.ini && !x.fin) ? 'actual' : '')) + '" style="--c:' + e.color + '"></i>';
  }).join('');
  var sig = soloVer === true ? null : REG.siguienteHora(r), c = TC.calcular(r), color = et ? et.color : 'var(--dr-verde)';
  var vivo = et && r.etapas[et.id].ini && !r.etapas[et.id].fin;
  var pie = cerrado ? '<span><b>Cerrado</b> · ' + (c.total !== null ? DR.num(c.total, 0) + ' min de ciclo' : 'ver detalle') + '</span>'
    : et ? '<span>Etapa ' + (idx + 1) + ' de 8 · ' + (vivo ? 'En curso: ' : 'Siguiente: ') + '<b>' + et.nombre + '</b></span>'
    : '<span><b>Etapas completas</b> · falta cerrar</span>';
  return '<div class="ciclo-item' + (sig ? ' con-rapido' : '') + '" style="--c:' + color + '">' +
    '<button type="button" class="ciclo-card" data-id="' + r.id + '">' +
      '<div class="cc-top"><span class="cc-id">' + (r.placa ? '<span class="cc-placa">' + DR.esc(r.placa) + '</span>' : '') +
        '<span class="cc-codigo">' + DR.esc(TC.titulo(r)) + '</span></span><span class="cc-hace">' +
        (vivo ? '<span class="vivo" data-ini="' + r.etapas[et.id].ini + '">' + DR.crono(r.etapas[et.id].ini) + '</span>' : DR.hace(r.actualizado)) + '</span></div>' +
      '<div class="cc-sub">' + (REG.subtitulo(r) || 'Sin fundo') + (soloVer === true ? ' · ' + DR.esc(r.registrador || '—') + ' · equipo ' + DR.esc(r.dispositivo || (NUBE.ORIGEN[r.origen] || '')) : '') + '</div>' +
      '<div class="cc-pasos">' + seg + '</div>' +
      '<div class="cc-sig">' + pie + DR.ICO.adelante + '</div></button>' +
    (sig ? '<button type="button" class="cc-rapido" data-rapido="' + r.id + '">' + DR.ICO.reloj +
      '<span>Marcar <b>' + DR.esc(REG.rotHora(sig.e, sig.campo).toLowerCase()) + '</b> ahora</span></button>' : '') +
  '</div>';
};
/** Enlaza tarjetas y «Marcar … ahora» dentro de un contenedor. */
REG.enlazarTarjetas = function (raiz, repintar) {
  DR.$$('.ciclo-card', raiz).forEach(function (b) { b.onclick = function () { REG.abrir(b.getAttribute('data-id')); }; });
  DR.$$('.cc-rapido', raiz).forEach(function (b) {
    b.onclick = function () {
      var r = TC.obtener(b.getAttribute('data-rapido')), sig = r && REG.siguienteHora(r);
      if (!sig) return;
      if (!REG.listo(r) && !(sig.e.id === 'cos' && REG.datosOrigen(r))) { DR.toast('Completa fundo, lote y código de pallet en la etapa Cosecha.', 'info'); REG.abrir(r.id); return; }
      var falta = sig.campo === 'fin' && REG.faltaParaFin(r, sig.e);
      if (falta) { DR.toast('Antes de terminar ' + sig.e.nombre.toLowerCase() + ' indica: ' + falta[1] + '.', 'info'); REG.abrir(r.id, sig.e.i); return; }
      r.etapas[sig.e.id][sig.campo] = new Date().toISOString();
      DR.vibrar(25); REG.guardar(r); ALERTAS.sync(r);
      DR.toast(REG.rotHora(sig.e, sig.campo) + ' · ' + DR.hhmm(r.etapas[sig.e.id][sig.campo]) + ' guardado.', 'ok');
      if (DR.anima) anime({ targets: b, scale: [0.94, 1], duration: 380, easing: 'easeOutBack' });
      setTimeout(repintar, DR.anima ? 260 : 0);
    };
  });
};

/**
 * Lista de Registrar (también hace lo que era Inicio): saludo, iniciar pallet, cifras de hoy,
 * pallets en curso de ESTE equipo (se marcan aquí) y los en curso de los DEMÁS equipos y la APK
 * (de Integra: antes no se veían y parecían perdidos; se pueden continuar en este equipo).
 */
REG.pintarLista = function (cont) {
  REG.vista = 'lista'; REG.quitarBarra();
  var hoy = DR.hoyISO(), antes = NUBE.hora, nombre = (TC.cfg.usuario || '').split(' ')[0];
  var o = RES.resumir(NUBE.todos().filter(function (r) { return r.fecha === hoy; }));
  cont.innerHTML = '<div class="vista">' +
    '<div class="saludo entra"><div id="uviInicio" class="uvi-caja">' + MASCOTA.svg() + '</div><div><h1>¡Hola, ' + DR.esc(nombre) + '!</h1>' +
      '<p id="fraseInicio">' + MASCOTA.FRASES[0] + '</p></div></div>' +
    '<button class="btn verde bloque grande entra" id="btnNuevoPallet" type="button">' + DR.ICO.mas + '<span>Iniciar nuevo pallet</span></button>' +
    '<div class="kpis entra" style="margin-top:14px"><div class="kpi"><b>' + o.n + '</b><span>Cerrados hoy (todos)</span></div>' +
      '<div class="kpi"><b>' + (o.prom !== null ? DR.num(o.prom, 1) : '—') + '</b><span>Ciclo prom. hoy (min)</span></div>' +
      '<div class="kpi"><b>' + (o.pctMeta !== null ? DR.num(o.pctMeta) + '%' : '—') + '</b><span>Dentro de meta</span></div></div>' +
    '<div id="syncLista" class="entra"></div>' +
    '<div class="buscador entra" style="margin-top:14px">' + DR.ICO.lupa + '<input id="inBuscar" type="search" placeholder="Buscar lote, fundo, placa o grupo…" autocomplete="off" value="' + DR.esc(REG.filtro) + '"></div>' +
    '<div id="listaPallets"></div></div>';
  var pintar = function () {
    var q = DR.sinTildes(REG.filtro || '');
    var coincide = function (r) { return !q || DR.sinTildes([r.lote, r.fundo, r.placa, r.grupo, r.variedad, r.pallet, r.registrador].join(' ')).indexOf(q) > -1; };
    var locales = TC.registros().filter(coincide);
    var curso = locales.filter(function (r) { return r.estado !== 'cerrado'; });
    var cerr = locales.filter(function (r) { return r.estado === 'cerrado' && r.fecha === hoy; });
    var otros = NUBE.todos().filter(function (r) { return !r.local && r.origen !== 'planta' && r.estado !== 'cerrado' && coincide(r); });
    var pend = TC.registros().filter(TC.pendiente).length;
    DR.$('#syncLista').innerHTML = '<div class="aviso' + (pend ? ' alerta' : ' ok') + '">' +
      (pend ? '<b>' + pend + '</b> cambio(s) por subir: se suben solos apenas hay señal.' : 'Todo lo de este equipo ya está en Integra.') +
      (NUBE.hora ? ' Última lectura de Integra: ' + DR.hace(NUBE.hora) + '.' : '') + '</div>';
    DR.$('#listaPallets').innerHTML =
      '<div class="sep-titulo">En curso en este equipo (' + curso.length + ')</div>' + (curso.length ? curso.map(REG.tarjetaHtml).join('') : '<div class="vacio">No hay pallets en curso en este equipo.</div>') +
      '<div class="sep-titulo">En curso en otros equipos (' + otros.length + ')</div>' +
      (otros.length ? '<div id="otrosPallets">' + otros.map(function (r) { return REG.tarjetaHtml(r, 0, null, true); }).join('') + '</div>'
        : '<div class="vacio">' + (NUBE.hora ? 'Ningún otro equipo tiene pallets en curso.' : 'Conéctate para ver los pallets de los demás equipos.') + '</div>') +
      (cerr.length ? '<div class="sep-titulo">Cerrados hoy en este equipo (' + cerr.length + ')</div>' + cerr.map(REG.tarjetaHtml).join('') : '');
    REG.enlazarTarjetas(DR.$('#listaPallets'), pintar);
    // Los de otros equipos se abren en solo lectura (con «Continuar en este equipo» si se puede).
    DR.$$('#otrosPallets .ciclo-card').forEach(function (b) { b.onclick = function () { NUBE.abrir(b.getAttribute('data-id')); }; });
  };
  pintar();
  NUBE.cargar().then(function () { if (DR.vista === 'registrar' && REG.vista === 'lista' && NUBE.hora !== antes) pintar(); });
  DR.$('#btnNuevoPallet').onclick = function () { REG.abrir(null); };
  DR.$('#inBuscar').oninput = function () { REG.filtro = this.value; pintar(); };
  DR.$('#uviInicio').onclick = function () { MASCOTA.saltar(DR.$('#uviInicio svg')); DR.$('#fraseInicio').innerHTML = MASCOTA.siguienteFrase(); };
  REG.reloj();
  DR.entrarPaneles('#contenido');
};

/** Cronómetros en vivo (tarjetas y etapa abierta). */
REG.reloj = function () {
  clearInterval(DR._tick);
  DR._tick = setInterval(function () { DR.$$('.vivo[data-ini]').forEach(function (d) { d.textContent = DR.crono(d.getAttribute('data-ini')); }); }, 1000);
};

/* ================================================ ASISTENTE POR ETAPAS */
REG.pasosHtml = function (r) {
  var prox = REG.proxima(r);
  return TC.ETAPAS.map(function (e, i) {
    var x = r.etapas[e.id], hecho = !!x.fin, actual = i === REG.idx;
    var accesible = actual || hecho || !TC.bloqueada(r, e) || i === prox;
    if (!REG.listo(r) && i > 0) accesible = false;
    return '<button type="button" class="paso' + (hecho ? ' hecho' : '') + (actual ? ' actual' : '') + (x.ini && !x.fin ? ' corriendo' : '') + '" data-paso="' + i + '" style="--c:' + e.color + '"' +
      (accesible ? '' : ' disabled') + ' aria-label="' + e.nombre + '"><i>' + (hecho && !actual ? DR.ICO.check : (i + 1)) + '</i><span>' + e.corto + '</span></button>';
  }).join('');
};

REG.horaHtml = function (r, e, campo, deshab) {
  var x = r.etapas[e.id], v = x[campo];
  return '<div class="hora' + (v ? ' llena' : '') + '" data-hora="' + e.id + '|' + campo + '">' +
    '<div class="hora-info"><label>' + DR.ICO.check + '<span>' + REG.rotHora(e, campo) + (v && x.editado ? ' · editado' : '') + (v && campo === 'fin' && x.porPlanta ? ' · marcada en planta' : '') + '</span></label>' +
      '<input type="time" data-e="' + e.id + '" data-f="' + campo + '" value="' + DR.hhmm(v) + '"' + (deshab ? ' disabled' : '') + '></div>' +
    '<button type="button" class="hora-ahora" data-ahora="' + e.id + '|' + campo + '"' + (deshab ? ' disabled' : '') + '>' + DR.ICO.reloj + '<span>Ahora</span></button>' +
    '<div class="hora-aviso" data-aviso="' + e.id + '|' + campo + '"></div></div>';
};

/** Datos del origen (van en la etapa 1, como en Integra: fundo, lote… y luego los tiempos de cosecha).
 *  La zona no se muestra: sale del fundo. Con permisos, solo los fundos/lotes del perfil y sus líderes. */
REG.origenHtml = function (r) {
  var opt = function (v, sel) { return '<option' + (v === sel ? ' selected' : '') + '>' + DR.esc(v) + '</option>'; };
  var fundos = PERM.fundos().slice(); if (r.fundo && fundos.indexOf(r.fundo) < 0) fundos.unshift(r.fundo);
  var lotes = CAT.filas().filter(function (f) { return r.fundo ? f[1] === r.fundo : fundos.indexOf(f[1]) > -1; })
    .map(function (f) { return f[2]; }).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
  var lideres = PERM.lideres(r.zona, r.fundo, r.lote);
  if (r.grupo && lideres.length && lideres.indexOf(r.grupo) < 0) lideres.unshift(r.grupo);
  var grupo = lideres.length
    ? '<select id="inGrupo"><option value="">— Elegir —</option>' + lideres.map(function (g) { return opt(g, r.grupo); }).join('') + '</select>'
    : '<input id="inGrupo" list="dlGrupos" maxlength="50" autocomplete="off" value="' + DR.esc(r.grupo) + '" placeholder="ej. TOMÁS MENDOZA">' +
      '<datalist id="dlGrupos">' + TC.grupos().map(function (g) { return '<option value="' + DR.esc(g) + '">'; }).join('') + '</datalist>';
  return '<div class="datos">' +
    '<div class="campo"><label for="inFundo">Fundo<em>obligatorio</em></label><select id="inFundo"><option value="">— Elegir —</option>' + fundos.map(function (f) { return opt(f, r.fundo); }).join('') + '</select></div>' +
    '<div class="campo"><label for="inLote">Lote<em>obligatorio</em></label><input id="inLote" list="dlLotes" maxlength="12" autocomplete="off" value="' + DR.esc(r.lote) + '" placeholder="ej. YU8">' +
      '<datalist id="dlLotes">' + lotes.map(function (l) { return '<option value="' + DR.esc(l) + '">'; }).join('') + '</datalist></div>' +
    '<div class="campo ancho"><label for="inPallet">Código de pallet<em>obligatorio</em></label><input id="inPallet" maxlength="20" autocomplete="off" value="' + DR.esc(r.pallet) + '" placeholder="Sin el código no se pasa a otra etapa"></div>' +
    '<div class="campo"><label for="inVariedad">Variedad</label><input id="inVariedad" list="dlVar" maxlength="40" autocomplete="off" value="' + DR.esc(r.variedad) + '">' +
      '<datalist id="dlVar">' + CAT.variedades().map(function (v) { return '<option value="' + DR.esc(v) + '">'; }).join('') + '</datalist></div>' +
    '<div class="campo"><label>Color</label><div class="opciones" id="selColor">' + CAT.COLORES.map(function (c) {
      return '<button type="button" class="opcion' + (r.color === c ? ' activa' : '') + '" data-c="' + c + '">' + c + '</button>'; }).join('') + '</div></div>' +
    '<div class="campo"><label for="inFecha">Fecha · semana <b id="outSemana">' + TC.semana(r.fecha) + '</b></label><input type="date" id="inFecha" value="' + r.fecha + '"></div>' +
    '<div class="campo"><label for="inGrupo">Grupo (líder)<em>obligatorio</em></label>' + grupo + '</div>' +
    '<div class="campo ancho"><label>Pasada</label><div class="opciones" id="selPasada">' + REG.PASADAS.map(function (n) {
      return '<button type="button" class="opcion' + (String(r.pasada) === String(n) ? ' activa' : '') + '" data-p="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
    '<div class="ancho" id="avisoLote"></div>' +
  '</div>';
};
REG.PASADAS = [1, 2, 3, 4, 5, 6];

REG.extrasHtml = function (r, e) {
  var l = REG.EXTRAS[e.id] || [];
  if (!l.length) return '';
  return '<div class="sep-titulo">Datos de la etapa</div><div class="datos">' + l.map(function (f) {
    if (f[2] === 'planta') return '<div class="campo ancho"><label>' + f[1] + '<em>obligatorio</em></label><div class="opciones" data-x-opc="planta">' +
      PERM.plantas().map(function (p) { return '<button type="button" class="opcion' + (r.planta === p ? ' activa' : '') + '" data-valor="' + DR.esc(p) + '">' + DR.esc(p) + '</button>'; }).join('') + '</div></div>';
    return '<div class="campo"><label>' + f[1] + (f[4] ? '<em>obligatorio</em>' : '') + '</label><input data-x="' + f[0] + '" type="' + (f[2] === 'number' ? 'number' : 'text') + '" inputmode="' + (f[2] === 'number' ? 'numeric' : 'text') + '" min="0" maxlength="12" placeholder="' + f[3] + '" value="' + DR.esc(r[f[0]]) + '"' + (f[0] === 'placa' ? ' style="text-transform:uppercase"' : '') + '></div>';
  }).join('') + '</div>';
};

REG.notaHtml = function (r, e) {
  var x = r.etapas[e.id];
  return '<div class="sep-titulo">Comentario de la etapa</div><div class="datos">' +
    '<div class="campo ancho"><label>Causa de demora</label><select data-causa="' + e.id + '"><option value="">Sin demora</option>' +
      CAT.CAUSAS.map(function (q) { return '<option' + (q === x.causa ? ' selected' : '') + '>' + DR.esc(q) + '</option>'; }).join('') + '</select></div>' +
    '<div class="campo ancho"><label>Comentario</label><textarea data-com="' + e.id + '" maxlength="200" placeholder="Qué pasó en esta etapa">' + DR.esc(x.com) + '</textarea></div></div>';
};

REG.pintarWiz = function (cont, r, direccion) {
  var e = TC.ETAPAS[REG.idx], x = r.etapas[e.id], c = TC.calcular(r), k = c.etapas[e.id];
  var prox = REG.proxima(r), bloq = TC.bloqueada(r, e) || (!REG.listo(r) && REG.idx > 0);
  var pct = prox < 0 ? 100 : Math.round(TC.ETAPAS.filter(function (y) { return r.etapas[y.id].fin; }).length / (TC.ETAPAS.length) * 100);
  var vivo = x.ini && !x.fin;
  var espera = k.espera !== null && e.libre && k.espera < 0 ? '<span class="pill">En paralelo con ' + DR.esc(TC.E[e.dep].nombre) + '</span>'
    : k.espera !== null ? '<span class="pill' + (k.espera < 0 ? ' rojo' : (k.espera > (TC.cfg.metas.espera || 1e9) ? ' naranja' : '')) + '">Espera desde ' + DR.esc(TC.E[e.dep].corto) + ': ' + DR.dur(k.espera) + '</span>' : '';
  var estado = x.fin ? '<span class="pill verde">Completada · ' + DR.dur(k.min) + (k.meta ? (k.min <= k.meta ? ' · en meta' : ' · sobre meta ' + k.meta + ' min') : '') + '</span>'
    : vivo ? '<span class="pill azul">En curso · <b class="vivo" data-ini="' + x.ini + '">' + DR.crono(x.ini) + '</b>' + (k.meta ? ' · meta ' + k.meta + ' min' : '') + '</span>'
    : bloq ? '<span class="pill">' + (!REG.listo(r) ? 'Se habilita al completar fundo, lote y código de pallet' : 'Se habilita al terminar ' + DR.esc(TC.E[e.dep].nombre)) + '</span>' : '';

  var horas = '<div class="horas">' + REG.horaHtml(r, e, 'ini', bloq) + REG.horaHtml(r, e, 'fin', bloq || !x.ini) + '</div>';
  var cuerpo = (e.id === 'cos' ? REG.origenHtml(r) + '<div class="sep-titulo">Tiempos de cosecha</div>' + horas : horas + REG.extrasHtml(r, e)) + REG.notaHtml(r, e);

  REG.quitarBarra();
  cont.innerHTML = '<div class="vista">' +
    '<div class="wiz-cab"><button type="button" class="wiz-volver" id="btnVolver">' + DR.ICO.atras + '<span>Pallets</span></button>' +
      '<div class="wiz-id"><b>' + DR.esc(r.lote ? TC.titulo(r) : 'Nuevo pallet') + '</b><span>' + (REG.subtitulo(r) || 'Elige zona, fundo y lote') + '</span></div></div>' +
    '<div class="pasos"><div class="pasos-pista"><div class="pasos-relleno" id="pasosRelleno" style="width:' + REG._pct + '%"></div></div>' + REG.pasosHtml(r) + '</div>' +
    '<section class="etapa" id="etapaCard" style="--c:' + e.color + '">' +
      '<div class="etapa-cab"><span class="etapa-num">Etapa ' + (REG.idx + 1) + ' de 8</span><h2>' + e.nombre + '</h2><p class="etapa-desc">' + e.desc + '</p>' +
        '<div class="pills">' + estado + espera + '</div></div>' + cuerpo +
      '<div class="avisos" id="avisosEtapa"></div></section>' +
    '<div class="resumen-ciclo entra-no"><div><b>' + (c.total !== null ? DR.num(c.total, 0) : DR.num(c.suma + Math.max(0, c.esperas), 0)) + '</b><span>' + (c.total !== null ? 'Ciclo total (min)' : 'Acumulado (min)') + '</span></div>' +
      '<div><b>' + (c.conformacion !== null ? DR.num(c.conformacion, 0) : '—') + '</b><span>Conformación</span></div><div><b>' + DR.num(c.esperas, 0) + '</b><span>Esperas (min)</span></div></div>' +
    TC.barra(c) +
    '<div class="zona-peligro"><button type="button" class="btn-peligro" id="btnEliminar">Eliminar este pallet</button></div></div>';

  REG.ponerBarra(r, e, bloq);
  REG.enlazarWiz(cont, r, e);
  REG.revisar(r, e);
  REG.reloj();
  if (direccion) cont.scrollTop = 0;
  var relleno = DR.$('#pasosRelleno');
  if (!DR.anima) { relleno.style.width = pct + '%'; REG._pct = pct; return; }
  anime({ targets: relleno, width: pct + '%', duration: 750, easing: 'easeOutCubic' });
  REG._pct = pct;
  if (direccion) {
    anime({ targets: '#etapaCard', opacity: [0, 1], translateX: [44 * direccion, 0], duration: 420, easing: 'easeOutCubic' });
    anime({ targets: '#etapaCard .hora, #etapaCard .campo, #etapaCard .sep-titulo', opacity: [0, 1], translateY: [12, 0], duration: 380, delay: anime.stagger(35, { start: 140 }), easing: 'easeOutQuad' });
    anime({ targets: '.paso.actual i', scale: [0.55, 1], duration: 700, easing: 'easeOutElastic(1, .55)' });
  }
};

/** Avisos en línea: espera negativa, fin antes del inicio, datos que faltan. */
REG.revisar = function (r, e) {
  var x = r.etapas[e.id], pf = TC.finPrevio(r, e);
  var poner = function (campo, txt) { var a = DR.$('[data-aviso="' + e.id + '|' + campo + '"]'); if (a) { a.textContent = txt; a.parentNode.classList.toggle('con-aviso', !!txt); } };
  poner('ini', pf && !e.libre && x.ini && new Date(x.ini) < new Date(pf)
    ? 'Empieza antes de terminar ' + TC.E[e.dep].nombre + ' (' + DR.hhmm(pf) + ').' + (String(x.com || '').trim() ? ' Explicado en el comentario.' : ' Corrige la hora o explica el motivo en el comentario.') : '');
  poner('fin', x.ini && x.fin && new Date(x.fin) < new Date(x.ini) ? 'El fin es anterior al inicio.' : '');
  var av = DR.$('#avisosEtapa');
  if (av && e.id === 'cos') {
    var f = r.lote ? CAT.lote(r.lote, r.fundo) : null;
    DR.$('#avisoLote').innerHTML = r.lote && !f ? '<div class="aviso">El lote ' + DR.esc(r.lote) + ' no está en el catálogo de ' + DR.esc(r.fundo || 'ese fundo') + '. Se guarda igual; revisa la variedad.</div>' : '';
  }
};

/** Botón grande inferior: siempre dice qué toca hacer. */
REG.ponerBarra = function (r, e, bloq) {
  var b = document.createElement('div'); b.id = 'barraAccion';
  var x = r.etapas[e.id], prox = REG.proxima(r), modo, txt, ico = '';
  if (e.id === 'cos' && !REG.datosOrigen(r)) { modo = 'origen'; txt = 'Elige fundo y lote'; }
  else if (bloq && !REG.listo(r)) { modo = 'pallet'; txt = 'Escribe el código de pallet'; }
  else if (bloq) { modo = 'ir'; txt = 'Ir a ' + TC.ETAPAS[Math.max(0, prox)].nombre; ico = DR.ICO.adelante; }
  else if (!x.ini) { modo = 'ini'; txt = 'Marcar inicio de ' + e.nombre.toLowerCase(); ico = DR.ICO.play; }
  else if (!x.fin) { modo = 'fin'; txt = 'Marcar fin de ' + e.nombre.toLowerCase(); ico = DR.ICO.stop; }
  else if (!REG.listo(r)) { modo = 'pallet'; txt = 'Escribe el código de pallet'; }
  else if (prox > -1) { modo = 'ir'; txt = 'Siguiente: ' + TC.ETAPAS[prox].nombre; ico = DR.ICO.adelante; }
  else { modo = 'cerrar'; txt = 'Cerrar registro'; ico = DR.ICO.check; }
  b.innerHTML = '<button type="button" class="btn grande ' + (modo === 'fin' ? 'naranja' : modo === 'cerrar' ? 'verde' : 'primario') + '" id="btnAccion" data-modo="' + modo + '" style="--c:' + e.color + '">' + ico + '<span>' + DR.esc(txt) + '</span></button>';
  document.body.appendChild(b);
  DR.$('#contenido').classList.add('con-barra');
  DR.$('#btnAccion').onclick = function () {
    var m = this.getAttribute('data-modo');
    if (m === 'origen') { var z = DR.$('#inFundo').value ? DR.$('#inLote') : DR.$('#inFundo'); z.scrollIntoView({ behavior: 'smooth', block: 'center' }); z.focus(); DR.toast('Primero elige fundo y lote.', 'info'); return; }
    if (m === 'pallet') { REG.irPallet(r); return; }
    if (m === 'ini' || m === 'fin') { REG.marcar(r, e, m); return; }
    if (m === 'ir') { REG.irEtapa(r, Math.max(0, REG.proxima(r))); return; }
    if (m === 'cerrar') REG.cerrar(r);
  };
  if (DR.anima) anime({ targets: b, translateY: [40, 0], opacity: [0, 1], duration: 380, easing: 'easeOutCubic' });
};
REG.quitarBarra = function () {
  var b = DR.$('#barraAccion'); if (b) b.remove();
  var c = DR.$('#contenido'); if (c) c.classList.remove('con-barra');
};

/** Lleva al campo «Código de pallet» de la etapa Cosecha. */
REG.irPallet = function (r) {
  if (REG.idx !== 0) REG.irEtapa(r, 0);
  var p = DR.$('#inPallet');
  if (p) { p.scrollIntoView({ behavior: 'smooth', block: 'center' }); p.focus(); }
  DR.toast('Escribe el código de pallet para pasar a otra etapa.', 'info');
};

REG.irEtapa = function (r, i) {
  var dir = i > REG.idx ? 1 : -1;
  REG.idx = i;
  REG.pintarWiz(DR.$('#contenido'), r, dir);
};

/** «Ahora» o botón grande: marca la hora del celular y guarda. Al terminar una etapa se queda
 *  en ella; el supervisor decide luego a qué etapa pasar. */
REG.marcar = function (r, e, campo) {
  if (!REG.datosOrigen(r)) { DR.toast('Primero elige fundo y lote.', 'info'); return; }
  if (e.id !== 'cos' && !REG.listo(r)) { REG.irPallet(r); return; }
  if (campo === 'fin') {
    REG.leerExtras(r);
    var falta = REG.faltaParaFin(r, e);
    if (falta) {
      DR.toast('Antes de terminar ' + e.nombre.toLowerCase() + ' indica: ' + falta[1] + '.', 'error');
      var c = DR.$('[data-x="' + falta[0] + '"]') || DR.$('[data-x-opc="' + falta[0] + '"]');
      if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (c.focus) c.focus(); }
      return;
    }
  }
  r.etapas[e.id][campo] = new Date().toISOString();
  r.etapas[e.id].editado = false;
  if (campo === 'fin') delete r.etapas[e.id].porPlanta;
  DR.vibrar(25);
  REG.guardar(r); ALERTAS.sync(r);
  DR.toast(REG.rotHora(e, campo) + ' · ' + DR.hhmm(r.etapas[e.id][campo]) + ' guardado.', 'ok');
  var fila = DR.$('[data-hora="' + e.id + '|' + campo + '"]');
  if (fila && DR.anima) anime({ targets: fila, scale: [0.96, 1], duration: 420, easing: 'easeOutBack' });
  if (campo === 'fin' && e.id === 'arm') DR.toast('Pallet armado: Lecturado habilitado.', 'info');
  REG.pintarWiz(DR.$('#contenido'), r, 0);
};

REG.cerrar = function (r) {
  var prob = TC.validar(r, true);
  if (prob) {
    DR.toast(prob, 'error');
    // «Falta completar la etapa 3 · …», «… (etapa Portabin).» o datos del origen (etapa Cosecha).
    var m = /etapa (\d)/.exec(prob), n = /\(etapa ([^)]+)\)/.exec(prob), en = n && TC.ETAPAS.filter(function (x) { return x.nombre === n[1]; })[0];
    var i = m ? +m[1] - 1 : en ? en.i : /pallets cargados/.test(prob) ? TC.E.por.i : /fundo|lote|variedad|grupo/i.test(prob) ? 0 : REG.idx;
    if (i !== REG.idx) REG.irEtapa(r, i); else REG.pintarWiz(DR.$('#contenido'), r, 0);
    DR.$('#avisosEtapa').innerHTML = '<div class="aviso alerta">' + DR.esc(prob) + '</div>';
    return;
  }
  r.estado = 'cerrado'; r.cerrado = new Date().toISOString(); r.error = '';
  REG.guardar(r); ALERTAS.sync(r); SHEETS.auto();
  REG.vista = 'fin';
  REG.pintarFin(DR.$('#contenido'), r);
};

REG.enlazarWiz = function (cont, r, e) {
  var guardar = function () { REG.guardar(r); };
  DR.$('#btnVolver').onclick = function () { REG.aLista(); };
  DR.$$('.paso', cont).forEach(function (p) {
    p.onclick = function () { var i = +p.getAttribute('data-paso'); if (i !== REG.idx) REG.irEtapa(r, i); };
  });
  DR.$$('.hora-ahora', cont).forEach(function (b) {
    b.onclick = function () { var p = b.getAttribute('data-ahora').split('|'); REG.marcar(r, TC.E[p[0]], p[1]); };
  });
  DR.$$('.hora input[type=time]', cont).forEach(function (inp) {
    inp.onchange = function () {
      var id = inp.getAttribute('data-e'), f = inp.getAttribute('data-f');
      REG.leerExtras(r);
      var falta = f === 'fin' && inp.value && REG.faltaParaFin(r, TC.E[id]);
      if (falta) { DR.toast('Antes de terminar ' + TC.E[id].nombre.toLowerCase() + ' indica: ' + falta[1] + '.', 'error'); inp.value = DR.hhmm(r.etapas[id].fin); return; }
      r.etapas[id][f] = REG.horaAISO(r, id, f, inp.value);
      r.etapas[id].editado = true;
      if (f === 'fin' || !inp.value) delete r.etapas[id].porPlanta;
      if (f === 'ini' && !inp.value) r.etapas[id].fin = '';
      guardar(); ALERTAS.sync(r);
      REG.pintarWiz(cont, r, 0);
    };
  });
  DR.$$('[data-causa]', cont).forEach(function (s) { s.onchange = function () { r.etapas[e.id].causa = s.value; guardar(); }; });
  DR.$$('[data-com]', cont).forEach(function (t) {
    t.oninput = function () { r.etapas[e.id].com = t.value; guardar(); };
    t.onchange = function () { REG.revisar(r, e); };
  });
  DR.$$('[data-x]', cont).forEach(function (inp) {
    inp.onchange = function () { var k = inp.getAttribute('data-x'); r[k] = k === 'placa' ? inp.value.trim().toUpperCase() : inp.value; inp.value = r[k]; guardar(); };
  });
  DR.$$('[data-x-opc="planta"] .opcion', cont).forEach(function (b) {
    b.onclick = function () {
      r.planta = b.getAttribute('data-valor'); TC.cfg.ultimo.planta = r.planta; TC.guardarCfg(); guardar();
      DR.$$('[data-x-opc="planta"] .opcion', cont).forEach(function (o) { o.classList.toggle('activa', o === b); });
    };
  });
  DR.$('#btnEliminar').onclick = function () {
    DR.confirmar('Eliminar pallet', 'Se borra del equipo y, si ya se subió, también de Integra en la próxima subida.', 'Eliminar', function () {
      r.estado = 'cerrado'; ALERTAS.sync(r);
      if (TC.obtener(r.id)) TC.eliminar(r.id);
      DR.toast('Pallet eliminado.', 'info'); REG.aLista();
    }, true);
  };
  if (e.id !== 'cos') return;

  /* ---------- datos del origen (etapa 1) ---------- */
  var repintar = function () { REG.pintarWiz(cont, r, 0); };
  /** Si hay lista de líderes para el nuevo fundo/lote y el grupo elegido no está en ella, se limpia. */
  var revisarGrupo = function () {
    var l = PERM.lideres(r.zona, r.fundo, r.lote);
    if (r.grupo && l.length && l.indexOf(r.grupo) < 0) r.grupo = '';
  };
  DR.$('#inFundo').onchange = function () {
    r.fundo = this.value; r.zona = PERM.zonaDe(r.fundo);
    if (r.lote && !CAT.lote(r.lote, r.fundo)) r.lote = '';
    revisarGrupo();
    TC.cfg.ultimo.fundo = r.fundo; TC.cfg.ultimo.zona = r.zona; TC.guardarCfg(); guardar(); repintar();
  };
  DR.$('#inLote').onchange = function () {
    var lote = CAT.limpiar(this.value), f = CAT.lote(lote, r.fundo) || CAT.lote(lote);
    if (lote && !f && PERM.catalogo()) {
      DR.toast('El lote ' + lote + ' no está en tus permisos' + (r.fundo ? ' para ' + r.fundo : '') + '.', 'error'); this.value = r.lote; return;
    }
    r.lote = lote;
    // El lote del catálogo define zona, fundo, variedad y color.
    if (f) { r.zona = f[0]; r.fundo = f[1]; r.variedad = f[3]; r.color = CAT.colorDe(f[3]) || r.color; }
    revisarGrupo();
    guardar(); repintar();
  };
  DR.$('#inVariedad').onchange = function () { r.variedad = CAT.normVariedad(this.value); var c = CAT.colorDe(r.variedad); if (c) r.color = c; guardar(); repintar(); };
  DR.$$('#selColor .opcion').forEach(function (b) {
    b.onclick = function () { r.color = b.getAttribute('data-c'); guardar(); DR.$$('#selColor .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); }); };
  });
  DR.$$('#selPasada .opcion').forEach(function (b) {
    b.onclick = function () { r.pasada = b.getAttribute('data-p'); guardar(); DR.$$('#selPasada .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); }); };
  });
  DR.$('#inFecha').onchange = function () { r.fecha = this.value || DR.hoyISO(); DR.$('#outSemana').textContent = TC.semana(r.fecha); guardar(); };
  DR.$('#inGrupo').onchange = function () { r.grupo = CAT.limpiar(this.value); this.value = r.grupo; TC.cfg.ultimo.grupo = r.grupo; TC.guardarCfg(); guardar(); };
  DR.$('#inPallet').onchange = function () { r.pallet = this.value.trim().toUpperCase(); this.value = r.pallet; guardar(); repintar(); };
};

/* ================================================ CIERRE */
REG.pintarFin = function (cont, r) {
  REG.quitarBarra();
  cont.scrollTop = 0;
  var c = TC.calcular(r), max = 1;
  TC.ETAPAS.forEach(function (e) { var k = c.etapas[e.id]; max = Math.max(max, (k.min || 0) + Math.max(0, k.espera || 0)); });
  var barras = TC.ETAPAS.map(function (e) {
    var k = c.etapas[e.id], w = Math.max(0, k.espera || 0), t = k.min || 0;
    return '<div class="tramo"><div class="tramo-cab"><span><i style="background:' + e.color + '"></i>' + e.n + '. ' + e.nombre + '</span><b>' + DR.num(t, 0) + ' min' +
      (k.espera !== null ? ' <small>' + (k.espera < 0 ? '· espera ' + DR.num(k.espera, 0) : '+ ' + DR.num(w, 0) + ' espera') + '</small>' : '') + '</b></div>' +
      '<div class="tramo-barra">' + (w ? '<span class="barra-valor" data-ancho="' + (w / max * 100) + '" style="background:var(--espera)"></span>' : '') +
      '<span class="barra-valor" data-ancho="' + (t / max * 100) + '" style="background:' + e.color + '"></span></div></div>';
  }).join('');
  cont.innerHTML = '<div class="vista">' +
    '<div class="fin-ciclo"><svg class="fin-check" viewBox="0 0 120 120" aria-hidden="true"><circle class="fin-aro" cx="60" cy="60" r="52"/><path class="fin-trazo" d="M37 62l15 15 32-34"/></svg>' +
      '<div class="ruta">Pallet cerrado</div><h1>' + DR.esc(TC.titulo(r)) + '</h1><p>' + REG.subtitulo(r) + '</p></div>' +
    '<div class="kpis"><div class="kpi"><b id="finTotal">' + (c.total !== null ? DR.num(c.total, 0) : '—') + '</b><span>Ciclo total (min)</span></div>' +
      '<div class="kpi"><b>' + (c.conformacion !== null ? DR.num(c.conformacion, 0) : '—') + '</b><span>Conformación (min)</span></div>' +
      '<div class="kpi"><b>' + TC.semana(r.fecha) + '</b><span>Semana · ' + DR.fechaCorta(r.fecha) + '</span></div></div>' +
    (c.enMeta !== null ? '<div class="aviso ' + (c.enMeta ? 'ok' : 'alerta') + '" style="margin:-4px 0 12px">' + (c.enMeta ? '✓ Ciclo dentro de la meta' : '⚠ Ciclo por encima de la meta') + ' de ' + c.meta + ' min.</div>' : '') +
    '<div class="tarjeta"><h2>Minutos por etapa</h2><p class="ayuda-campo" style="margin:0 0 10px">Gris: espera antes de la etapa · color: tiempo de la etapa.</p>' + barras + '</div>' +
    '<div class="acciones-fin"><button type="button" class="btn verde grande" id="btnOtro">' + DR.ICO.mas + '<span>Iniciar otro pallet</span></button>' +
      '<button type="button" class="btn" id="btnFinLista">Ver pallets en curso</button>' +
      '<button type="button" class="btn" id="btnCorregir">Corregir una etapa</button></div></div>';
  DR.$('#btnOtro').onclick = function () { REG.abrir(null); };
  DR.$('#btnFinLista').onclick = REG.aLista;
  DR.$('#btnCorregir').onclick = function () {
    DR.confirmar('Corregir pallet', 'El registro vuelve a <b>borrador</b>. Al cerrarlo de nuevo se actualiza en Integra sin duplicarse.', 'Corregir', function () {
      r.estado = 'borrador'; REG.guardar(r); REG.vista = 'wiz'; REG.idx = 0; REG._pct = 0; APP.ir('registrar');
    });
  };
  DR.vibrar([40, 60, 90]);
  if (!DR.anima) { DR.$$('.barra-valor', cont).forEach(function (b) { b.style.width = b.getAttribute('data-ancho') + '%'; }); return; }
  anime({ targets: '.fin-check', scale: [0.4, 1], opacity: [0, 1], duration: 800, easing: 'easeOutElastic(1, .6)' });
  anime({ targets: '.fin-trazo', strokeDashoffset: [anime.setDashoffset, 0], duration: 700, delay: 250, easing: 'easeInOutQuad' });
  anime({ targets: '.fin-ciclo .ruta, .fin-ciclo h1, .fin-ciclo p, .kpi, .tarjeta, .acciones-fin .btn', opacity: [0, 1], translateY: [14, 0], duration: 500, delay: anime.stagger(60, { start: 350 }), easing: 'easeOutQuad' });
  DR.$$('.barra-valor', cont).forEach(function (b, i) { anime({ targets: b, width: [0, b.getAttribute('data-ancho') + '%'], duration: 800, delay: 600 + i * 40, easing: 'easeOutCubic' }); });
  if (c.total !== null) DR.contar(DR.$('#finTotal'), Math.round(c.total));
};
