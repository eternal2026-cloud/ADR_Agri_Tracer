/* ============================================================================
 * encuesta.js — PESTAÑA «ENCUESTA»: REGISTRO DESDE LA APP (registros futuros)
 * Asistente de 4 pasos pensado para el celular:
 *   1. Datos generales · 2. Evaluación (10 ítems) · 3. Sugerencias · 4. Resumen.
 * El borrador vive en el dispositivo hasta guardarlo (sobrevive a cerrar la app).
 * El id lo genera el celular: reintentar el guardado no duplica.
 * ==========================================================================*/
var ENC = { CLAVE: 'agritracer.sci.borrador', paso: 1, b: null };
ENC.PASOS = ['Datos', 'Evaluación', 'Sugerencias', 'Resumen'];

ENC.nuevo = function () {
  var cul = SCI.cultivo(SCI.cultivoFiltro()) || SCI.cultivos.filter(function (c) { return c.activo; })[0] || {};
  var plantas = SCI.misPlantas(), areas = SCI.misAreas();
  return {
    id: SCI.uuid(), cultivo_id: cul.id || '', campana: cul.campana || '', fecha: SCI.hoy(),
    area_evaluada_id: areas.length === 1 ? String(areas[0]) : '', area_evaluadora_id: '', sub_area: '',
    planta: plantas.length === 1 ? plantas[0] : '', cargo: '', evaluador: '',
    respuestas: {}, aspectos_valorados: '', aspectos_mejorar: '', recomendaciones: ''
  };
};
ENC.leer = function () {
  try { return JSON.parse(SCI.leerLocal(ENC.CLAVE) || 'null'); } catch (e) { return null; }
};
ENC.guardarLocal = function () { SCI.escribirLocal(ENC.CLAVE, JSON.stringify(ENC.b)); };
ENC.descartar = function () { SCI.escribirLocal(ENC.CLAVE, null); ENC.b = null; ENC.paso = 1; };

VISTAS.encuesta = function (cont) {
  if (!AT.puedeCapturar()) { DR.ir('resultados'); return; }
  if (!ENC.b) ENC.b = ENC.leer() || ENC.nuevo();
  ENC.pintar(cont);
};

ENC.respuestasLista = function () {
  return Object.keys(ENC.b.respuestas).map(function (k) { return { item: Number(k), puntaje: Number(ENC.b.respuestas[k]) }; })
    .sort(function (a, b) { return a.item - b.item; });
};

ENC.faltanDatos = function () {
  var b = ENC.b, x = [];
  if (!b.cultivo_id) x.push('cultivo');
  if (!String(b.campana || '').trim()) x.push('campaña');
  if (!b.fecha) x.push('fecha');
  if (!b.area_evaluada_id) x.push('área evaluada');
  if (!b.area_evaluadora_id) x.push('área evaluadora');
  if (b.area_evaluada_id && b.area_evaluada_id === b.area_evaluadora_id) x.push('áreas distintas (un área no se evalúa a sí misma)');
  if (SCI.misPlantas().length && SCI.misPlantas().indexOf(String(b.planta || '').toUpperCase()) < 0) x.push('planta (una de las tuyas: ' + SCI.misPlantas().join(', ') + ')');
  if (b.area_evaluada_id && SCI.misAreas().length && SCI.misAreas().indexOf(Number(b.area_evaluada_id)) < 0) x.push('un área a evaluar que tengas asignada');
  return x;
};
ENC.faltanItems = function () {
  return SCI.items.filter(function (i) { return !(i.id in ENC.b.respuestas); }).map(function (i) { return i.id; });
};

ENC.pintar = function (cont) {
  cont = cont || DR.$('#contenido');
  var b = ENC.b, paso = ENC.paso;
  var pasos = '<div class="sci-pasos entra">' + ENC.PASOS.map(function (t, i) {
    var n = i + 1, hecho = (n === 1 && !ENC.faltanDatos().length) || (n === 2 && !ENC.faltanItems().length) || (n === 3 && n < paso);
    return '<button type="button" class="sci-paso' + (n === paso ? ' activo' : '') + (hecho ? ' hecho' : '') + '" data-paso="' + n + '"><i>' + n + '</i><span>' + t + '</span></button>';
  }).join('') + '</div>';
  var cuerpo = [null, ENC.pasoDatos, ENC.pasoItems, ENC.pasoSugerencias, ENC.pasoResumen][paso]();
  var calc = IMP_SCI.calcular(ENC.respuestasLista());
  cont.innerHTML = UI.encabezado('Cliente interno', 'Nueva encuesta',
    'Encuesta de satisfacción del cliente interno. Se guarda en este dispositivo hasta que la registres.',
    '<div class="sci-marcador" title="Resultado parcial"><b>' + DR.num(calc.total, 1) + ' %</b><span>' + ENC.respuestasLista().length + '/10 ítems</span></div>') +
    pasos + cuerpo +
    '<div class="acciones">' +
      (paso > 1 ? '<button type="button" class="btn sec" id="btnAnterior">' + DR.ICONOS.atras + 'Anterior</button>' : '') +
      (paso < 4 ? '<button type="button" class="btn verde" id="btnSiguiente">Continuar</button>' : '') +
      '<button type="button" class="btn-peligro" id="btnDescartar">Descartar borrador</button>' +
    '</div>';
  DR.entrarPaneles('#contenido');

  DR.$$('[data-paso]', cont).forEach(function (el) { el.onclick = function () { ENC.ir(Number(this.getAttribute('data-paso'))); }; });
  if (DR.$('#btnAnterior')) DR.$('#btnAnterior').onclick = function () { ENC.ir(paso - 1); };
  if (DR.$('#btnSiguiente')) DR.$('#btnSiguiente').onclick = function () { ENC.ir(paso + 1, true); };
  DR.$('#btnDescartar').onclick = function () {
    if (!window.confirm('¿Descartar la encuesta que estás llenando?')) return;
    ENC.descartar();
    ENC.b = ENC.nuevo();
    ENC.pintar(cont);
  };
  // Campos de texto y selects del borrador.
  DR.$$('[data-enc]', cont).forEach(function (el) {
    var guardar = function () {
      var k = el.getAttribute('data-enc');
      b[k] = el.value;
      if (k === 'cultivo_id') {
        var c = SCI.cultivo(el.value);
        if (c && c.campana) { b.campana = c.campana; if (DR.$('[data-enc="campana"]')) DR.$('[data-enc="campana"]').value = c.campana; }
      }
      ENC.guardarLocal();
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', guardar);
  });
  DR.$$('[data-opcion]', cont).forEach(function (el) {
    el.onclick = function () {
      var k = this.getAttribute('data-opcion'), v = this.getAttribute('data-valor');
      b[k] = b[k] === v ? '' : v;
      ENC.guardarLocal();
      ENC.pintar(cont);
    };
  });
  DR.$$('[data-item]', cont).forEach(function (el) {
    el.onclick = function () {
      b.respuestas[this.getAttribute('data-item')] = Number(this.getAttribute('data-valor'));
      ENC.guardarLocal();
      var fila = this.parentNode;
      DR.$$('.opcion', fila).forEach(function (o) { o.classList.toggle('activa', o === el); });
      fila.parentNode.classList.add('respondido');
      var calc = IMP_SCI.calcular(ENC.respuestasLista());
      DR.$('.sci-marcador b').textContent = DR.num(calc.total, 1) + ' %';
      DR.$('.sci-marcador span').textContent = ENC.respuestasLista().length + '/10 ítems';
      DR.vibrar(12);
    };
  });
  if (DR.$('#btnGuardarEncuesta')) DR.$('#btnGuardarEncuesta').onclick = ENC.guardar;
};

ENC.ir = function (paso, validar) {
  if (validar && ENC.paso === 1 && ENC.faltanDatos().length) { DR.toast('Falta: ' + ENC.faltanDatos().join(', ') + '.', 'error'); return; }
  if (validar && ENC.paso === 2 && ENC.faltanItems().length) { DR.toast('Responde los ítems: ' + ENC.faltanItems().join(', ') + '.', 'error'); return; }
  ENC.paso = Math.max(1, Math.min(4, paso));
  DR.$('#contenido').scrollTop = 0;
  ENC.pintar();
};

ENC.pasoDatos = function () {
  var b = ENC.b;
  var chips = function (campo, lista) {
    return '<div class="opciones">' + lista.map(function (v) {
      return '<button type="button" class="opcion' + (b[campo] === v ? ' activa' : '') + '" data-opcion="' + campo + '" data-valor="' + DR.esc(v) + '">' + DR.esc(v) + '</button>';
    }).join('') + '</div>';
  };
  return UI.panel('1. Datos generales', 'Quién evalúa, a qué área y cuándo.',
    '<div class="form">' +
      '<div class="campo"><label for="encCultivo">Cultivo</label><select id="encCultivo" data-enc="cultivo_id">' + SCI.opcionesCultivos(b.cultivo_id, 'Elegir…') + '</select></div>' +
      '<div class="campo"><label for="encCampana">Campaña</label><input id="encCampana" data-enc="campana" value="' + DR.esc(b.campana) + '" placeholder="Uva 2025 - 2026"></div>' +
      '<div class="campo"><label for="encFecha">Fecha</label><input id="encFecha" type="date" data-enc="fecha" max="' + SCI.hoy() + '" value="' + DR.esc(b.fecha) + '"></div>' +
      '<div class="campo"><label for="encEvaluada">Área a evaluar</label><select id="encEvaluada" data-enc="area_evaluada_id">' + SCI.opcionesAreas(b.area_evaluada_id, 'Elegir…', SCI.misAreas()) + '</select></div>' +
      '<div class="campo"><label for="encEvaluadora">Área evaluadora</label><select id="encEvaluadora" data-enc="area_evaluadora_id">' + SCI.opcionesAreas(b.area_evaluadora_id, 'Elegir…') + '</select></div>' +
      '<div class="campo"><label for="encPlanta">Planta</label><select id="encPlanta" data-enc="planta">' + SCI.opcionesPlantas(b.planta, SCI.misPlantas()) + '</select></div>' +
      '<div class="campo"><label for="encSub">Sub-área evaluadora <small>(opcional)</small></label><input id="encSub" data-enc="sub_area" list="dlSubEnc" value="' + DR.esc(b.sub_area) + '" placeholder="Limpieza, Packing…">' + SCI.datalistSubAreas('dlSubEnc') + '</div>' +
      '<div class="campo"><label for="encEvaluador">Nombre del evaluador <small>(opcional)</small></label><input id="encEvaluador" data-enc="evaluador" value="' + DR.esc(b.evaluador) + '"></div>' +
      '<div class="campo ancho"><label>Cargo</label>' + chips('cargo', SCI.CARGOS) + '</div>' +
    '</div>' +
    '<div class="aviso" style="margin-top:12px">La planta y la sub-área separan los resultados en la presentación (p. ej. «PDC - Prod. Limpieza»).</div>');
};

ENC.pasoItems = function () {
  var b = ENC.b, h = '';
  SCI.CRITERIOS.forEach(function (c) {
    h += '<div class="sep-titulo">' + DR.esc(c.t) + '</div>';
    c.items.forEach(function (n) {
      var it = SCI.item(n), actual = b.respuestas[n];
      h += '<div class="sci-item' + (actual !== undefined ? ' respondido' : '') + '"><div class="sci-item-txt"><b>' + n + '</b><span>' + DR.esc(it ? it.texto : '') + '</span></div>' +
        '<div class="opciones sci-escala">' + SCI.ESCALA.map(function (e) {
          return '<button type="button" class="opcion' + (Number(actual) === e.v ? ' activa' : '') + '" style="--c:' + SCI.COLOR_ESCALA[e.v] + '" data-item="' + n + '" data-valor="' + e.v + '">' +
            DR.esc(e.t) + '<small>' + DR.num(e.v, 1) + '%</small></button>';
        }).join('') + '</div></div>';
    });
  });
  return UI.panel('2. Evaluación del servicio', 'Marca una opción por ítem. Cada ítem vale entre 4 % y 10 %.', h);
};

ENC.pasoSugerencias = function () {
  var b = ENC.b;
  var area = function (k, t) {
    return '<div class="campo ancho"><label for="enc_' + k + '">' + t + '</label><textarea id="enc_' + k + '" data-enc="' + k + '" rows="3">' + DR.esc(b[k]) + '</textarea></div>';
  };
  return UI.panel('3. Sugerencias (opcional)', 'Aparecen en la presentación como Aspectos valorados, por mejorar y Recomendaciones.',
    '<div class="form">' +
      area('aspectos_valorados', '¿Qué aspectos valoras más del servicio del área evaluada?') +
      area('aspectos_mejorar', '¿Qué aspectos consideras que el área evaluada debería mejorar?') +
      area('recomendaciones', '¿Tienes alguna sugerencia específica para mejorar la coordinación entre tu área y el área evaluada?') +
    '</div>');
};

ENC.pasoResumen = function () {
  var b = ENC.b, calc = IMP_SCI.calcular(ENC.respuestasLista());
  var faltan = ENC.faltanDatos().map(function (x) { return 'Falta ' + x + '.'; })
    .concat(ENC.faltanItems().length ? ['Faltan los ítems ' + ENC.faltanItems().join(', ') + '.'] : []);
  var ae = SCI.area(b.area_evaluada_id), ao = SCI.area(b.area_evaluadora_id), cul = SCI.cultivo(b.cultivo_id);
  var grupo = ao ? SCI.grupo(ao.nombre, b.sub_area, b.planta, cul && cul.nombre) : '—';
  return UI.panel('4. Resumen', '', '<div class="sci-resumen">' +
      '<div class="sci-radar-caja">' + SCI.radarSvg([{ nombre: grupo, color: '#76B729', criterios: calc.criterios }]) + '</div>' +
      '<div><div class="sci-kpi-grande" style="--c:' + SCI.colorPct(calc.total) + '"><span>Resultado</span><b>' + SCI.pct(calc.total) + '</b></div>' +
      '<div class="dato-fila"><span>Área evaluada</span><b>' + DR.esc(ae ? ae.nombre : '—') + '</b></div>' +
      '<div class="dato-fila"><span>Evaluador</span><b>' + DR.esc(grupo) + (b.cargo ? ' · ' + DR.esc(b.cargo) : '') + '</b></div>' +
      '<div class="dato-fila"><span>Cultivo · campaña</span><b>' + DR.esc((cul ? cul.nombre : '—') + ' · ' + b.campana) + '</b></div>' +
      '<div class="dato-fila"><span>Fecha</span><b>' + DR.esc(SCI.fecha(b.fecha)) + '</b></div>' +
      SCI.CRITERIOS.map(function (c) { return '<div class="dato-fila"><span>' + DR.esc(c.t) + '</span><b>' + SCI.pct(calc.criterios[c.id]) + '</b></div>'; }).join('') +
      '</div></div>' +
    (faltan.length ? '<div class="aviso alerta" style="margin-top:12px"><ul>' + faltan.map(function (x) { return '<li>' + DR.esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
    '<div class="acciones"><button type="button" class="btn verde grande" id="btnGuardarEncuesta"' + (faltan.length ? ' disabled' : '') + '>' + DR.ICONOS.checkChico + 'Registrar encuesta</button></div>');
};

ENC.guardar = function () {
  var b = ENC.b;
  SCI.accion(this, 'rpc_sci_guardar_encuesta', { p: {
    id: b.id, cultivo_id: Number(b.cultivo_id), campana: String(b.campana).trim(), fecha: b.fecha,
    area_evaluada_id: Number(b.area_evaluada_id), area_evaluadora_id: Number(b.area_evaluadora_id),
    sub_area: b.sub_area || null, planta: b.planta || null, cargo: b.cargo || null, evaluador: b.evaluador || null,
    aspectos_valorados: b.aspectos_valorados, aspectos_mejorar: b.aspectos_mejorar, recomendaciones: b.recomendaciones,
    respuestas: ENC.respuestasLista()
  } }).then(function (r) {
    DR.toast('Encuesta ' + r.codigo + ' registrada: ' + DR.num(r.resultado, 1) + ' %.');
    DR.sonar(true);
    ENC.descartar();
    DR.ir('resultados');
  }).catch(function () { /* SCI.accion ya avisó */ });
};
