/* ============================================================================
 * gantt.js — CRONOGRAMA DE AUDITORÍAS 5S (réplica de «Gantt - Plan de trabajo.xlsx»)
 *   · Cronograma: semanas ISO en el eje horizontal y una barra por auditoría
 *     programada de cada grupo (Cítricos, Arándano, Uva PDC, Uva PLM…).
 *     Un toque en la barra (o en la fila de la lista) la marca para el recordatorio.
 *   · Áreas por cultivo: áreas que deben auditarse en cada grupo y si ya
 *     cumplieron cada auditoría (fn_s5_gantt, ventana de la migración 0027).
 *   · Recordatorio: correo HTML a los destinatarios que se escriban, enviado
 *     por la Edge Function «recordatorio-5s»; si el envío no está configurado,
 *     se copia el correo con formato y se abre el correo del celular/PC.
 * Editar grupos, áreas y fechas: solo administradores.
 * ==========================================================================*/
var GANTT = {
  grupos: [], areas: {}, programas: [], filas: [], sel: {}, vista: 'cronograma', correoListo: null,
  CLAVE_DESTINOS: 'agritracer.5s.gantt.destinos',
  ESTADOS: {
    'Cumplido': { c: '#76B729', pill: 'verde' }, 'Atrasado': { c: '#E5484D', pill: 'rojo' },
    'En curso': { c: '#0097CE', pill: 'azul' }, 'Próximo': { c: '#E8B04A', pill: 'naranja' },
    'Programado': { c: '#A89A8C', pill: 'gris' }, 'Cancelado': { c: '#6B5D51', pill: 'gris' }
  },
  MESES: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'],
  ICO_CORREO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>'
};

VISTAS.gantt = function (cont) {
  GANTT.cargar().then(function () { GANTT.pintar(cont); }).catch(function (e) { UI.error(cont, e); });
};

GANTT.cargar = function () {
  return Promise.all([
    S5.cargar(),
    sb.from('s5_gantt_grupos').select('*').order('orden').order('nombre'),
    sb.from('s5_gantt_areas').select('*'),
    sb.from('s5_gantt_programas').select('*').order('semana_inicio'),
    AT.rpc('fn_s5_gantt')
  ]).then(function (r) {
    [r[1], r[2], r[3]].forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    GANTT.grupos = r[1].data || [];
    GANTT.areas = {};
    (r[2].data || []).forEach(function (x) { (GANTT.areas[x.grupo_id] = GANTT.areas[x.grupo_id] || []).push(x.area_id); });
    GANTT.programas = (r[3].data || []).filter(function (p) { return GANTT.grupo(p.grupo_id); });
    GANTT.filas = r[4] || [];
    Object.keys(GANTT.sel).forEach(function (id) { if (!GANTT.prog(id)) delete GANTT.sel[id]; });
  });
};

GANTT.grupo = function (id) { return GANTT.grupos.filter(function (g) { return g.id === Number(id); })[0] || null; };
GANTT.prog = function (id) { return GANTT.programas.filter(function (p) { return p.id === Number(id); })[0] || null; };
GANTT.areasDe = function (grupoId) {
  var ids = GANTT.areas[grupoId] || [];
  return S5.areas.filter(function (a) { return ids.indexOf(a.id) > -1; });
};

/* ------------------------------------------------------------ fechas y semanas ISO */
GANTT.lunes = function (f) { return S5.sumarDias(f, -((new Date(S5._utc(f)).getUTCDay() + 6) % 7)); };
GANTT.semana = function (f) {
  var d = new Date(S5._utc(f));
  d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7);
  var ene4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - ene4) / 86400000 - 3 + (ene4.getUTCDay() + 6) % 7) / 7);
};
/** Año ISO de la semana (el del jueves de esa semana). */
GANTT.anioIso = function (f) { return Number(S5.sumarDias(GANTT.lunes(f), 3).substring(0, 4)); };
/** Lunes de la semana ISO n del año. */
GANTT.lunesDeSemana = function (anio, n) { return S5.sumarDias(GANTT.lunes(anio + '-01-04'), (n - 1) * 7); };
GANTT.fin = function (p) { return S5.sumarDias(p.semana_inicio, p.semanas * 7 - 1); };
/** El día de la auditoría no es fijo: todo se expresa en semanas ISO. */
GANTT.textoSemanas = function (p) {
  var a = GANTT.semana(p.semana_inicio), b = GANTT.semana(S5.sumarDias(p.semana_inicio, (p.semanas - 1) * 7));
  var anio = GANTT.anioIso(p.semana_inicio);
  return 'Semana ' + a + (p.semanas > 1 ? '–' + b : '') + (anio !== GANTT.anioIso(S5.hoy()) ? ' de ' + anio : '');
};
GANTT.rango = function (p) { return 'lun ' + S5.fecha(p.semana_inicio).substring(0, 5) + ' a dom ' + S5.fecha(GANTT.fin(p)); };

/* ------------------------------------------------------------ cumplimiento */
/**
 * { total, hechas, areas: [{ area, fila|null, manual|null, hecho }], estado } de una auditoría programada.
 * La marca manual (auditorías hechas en Excel) manda sobre lo registrado en Integra; los grupos con
 * auto_integra = false (p. ej. Servicios Generales, sin cultivo) solo cuentan marcas manuales.
 */
GANTT.detalle = function (p) {
  var filas = GANTT.filas.filter(function (f) { return f.programa_id === p.id; });
  var areas = GANTT.areasDe(p.grupo_id).map(function (a) {
    var fa = filas.filter(function (f) { return f.area_id === a.id; })[0] || {};
    var manual = fa.manual ? { cumplido: fa.manual_cumplido, semana: fa.manual_semana, nota: fa.manual_nota, por: fa.manual_por, en: fa.manual_en } : null;
    var fila = fa.auditoria_id ? fa : null;
    return { area: a, fila: fila, manual: manual, hecho: manual ? !!manual.cumplido : !!fila };
  });
  var hechas = areas.filter(function (x) { return x.hecho; }).length, hoy = S5.hoy(), fin = GANTT.fin(p), estado;
  if (p.estado === 'Cancelado') estado = 'Cancelado';
  else if (areas.length && hechas === areas.length) estado = 'Cumplido';
  else if (hoy > fin) estado = 'Atrasado';
  else if (hoy >= p.semana_inicio) estado = 'En curso';
  else if (S5.diasDesde(p.semana_inicio) >= -14) estado = 'Próximo';
  else estado = 'Programado';
  return { total: areas.length, hechas: hechas, areas: areas, estado: estado };
};
/** El cultivo «-» (icono servicios) es «Sin cultivo». */
GANTT.nombreCultivo = function (c) { return !c ? '—' : (c.icono === 'servicios' || c.nombre === '-' ? 'Sin cultivo' : c.nombre); };
GANTT.pillEstado = function (e) { return '<span class="pill ' + GANTT.ESTADOS[e].pill + '">' + e + '</span>'; };
GANTT.nombreProg = function (p) { var g = GANTT.grupo(p.grupo_id); return (g ? g.nombre : '—') + ' · ' + p.numero_auditoria + '° auditoría'; };

/* ------------------------------------------------------------ pantalla */
GANTT.pintar = function (cont) {
  var admin = AT.esAdmin();
  var h = UI.encabezado('Auditoría 5S', 'Gantt', 'Cronograma de auditorías por cultivo y semana (el día se coordina dentro de la semana). Toca una barra para marcarla y enviar un recordatorio por correo.') +
    '<div class="opciones gt-vistas entra">' +
      '<button type="button" class="opcion' + (GANTT.vista === 'cronograma' ? ' activa' : '') + '" data-gvista="cronograma" style="--c:#0097CE">Cronograma</button>' +
      '<button type="button" class="opcion' + (GANTT.vista === 'areas' ? ' activa' : '') + '" data-gvista="areas" style="--c:#76B729">Áreas por cultivo</button>' +
    '</div>';
  if (!GANTT.grupos.length) {
    h += UI.panel('Sin cronograma', '', '<div class="aviso">Aún no hay grupos en el Gantt. Falta aplicar la migración 0027 en Supabase' +
      (admin ? ' o crear un grupo.' : '.') + '</div>' + (admin ? '<div class="acciones"><button type="button" class="btn verde chico" id="gtNuevoGrupo">' + DR.ICONOS.mas + '<span>Nuevo grupo</span></button></div>' : ''));
  } else {
    h += GANTT.vista === 'areas' ? GANTT.areasHtml() : GANTT.cronogramaHtml();
  }
  cont.innerHTML = h + '<div id="gtBarraSel"></div>';
  DR.entrarPaneles('#contenido');
  GANTT.enlazar(cont);
  GANTT.pintarSeleccion();
  var hoy = DR.$('.gt-tabla th.hoy', cont), caja = DR.$('.gt-cont', cont);
  if (hoy && caja) caja.scrollLeft = Math.max(0, hoy.offsetLeft - 220);
};

GANTT.refrescar = function () {
  var cont = DR.$('#contenido');
  return GANTT.cargar().then(function () { if (DR.vista === 'gantt') GANTT.pintar(cont); });
};

GANTT.cronogramaHtml = function () {
  var progs = GANTT.programas;
  var kpi = { Cumplido: 0, Atrasado: 0, 'En curso': 0, Próximo: 0 };
  progs.forEach(function (p) { var e = GANTT.detalle(p).estado; if (kpi[e] !== undefined) kpi[e]++; });
  var h = '<div class="kpis">' +
    UI.kpi('Programadas', DR.num(progs.length), GANTT.grupos.length + ' grupos', '#0097CE') +
    UI.kpi('Cumplidas', DR.num(kpi.Cumplido), 'todas sus áreas cumplidas', '#76B729') +
    UI.kpi('Atrasadas', DR.num(kpi.Atrasado), 'semana vencida con áreas pendientes', '#E5484D') +
    UI.kpi('Próximas', DR.num(kpi['En curso'] + kpi.Próximo), 'esta semana o en las 2 siguientes', '#E8B04A') +
  '</div>';

  if (!progs.length) return h + UI.panel('Cronograma', '', '<div class="aviso">No hay auditorías programadas.</div>' + GANTT.botonesAdmin());

  // Columnas: una por semana, desde el primer lunes hasta el último fin (+1 semana de aire).
  var ini = S5.sumarDias(progs.reduce(function (m, p) { return p.semana_inicio < m ? p.semana_inicio : m; }, progs[0].semana_inicio), -7);
  var finMax = progs.reduce(function (m, p) { var f = GANTT.fin(p); return f > m ? f : m; }, GANTT.fin(progs[0]));
  var semanas = [], lunesHoy = GANTT.lunes(S5.hoy());
  for (var f = ini; f <= S5.sumarDias(finMax, 7); f = S5.sumarDias(f, 7)) semanas.push(f);

  var meses = [];
  semanas.forEach(function (s) {
    var clave = s.substring(0, 7), u = meses[meses.length - 1];
    if (u && u.clave === clave) u.n++; else meses.push({ clave: clave, n: 1 });
  });
  var tabla = '<table class="gt-tabla"><thead><tr><th class="gt-fijo" rowspan="2">Grupo · Auditoría</th>' +
    meses.map(function (m) {
      return '<th class="gt-mes" colspan="' + m.n + '">' + GANTT.MESES[Number(m.clave.substring(5, 7)) - 1] + '-' + m.clave.substring(2, 4) + '</th>';
    }).join('') + '</tr><tr>' +
    semanas.map(function (s) {
      return '<th class="gt-sem' + (s === lunesHoy ? ' hoy' : '') + '" title="' + S5.fecha(s) + '">S' + S5._p(GANTT.semana(s)) + '</th>';
    }).join('') + '</tr></thead><tbody>';

  GANTT.grupos.forEach(function (g) {
    var suyos = progs.filter(function (p) { return p.grupo_id === g.id; }).sort(function (a, b) { return a.numero_auditoria - b.numero_auditoria; });
    if (!suyos.length) return;
    suyos.forEach(function (p, i) {
      var d = GANTT.detalle(p), est = GANTT.ESTADOS[d.estado], sel = !!GANTT.sel[p.id];
      tabla += '<tr class="' + (i === 0 ? 'gt-primera' : '') + '"><th class="gt-fijo" scope="row" style="--c:' + g.color + '">' +
        (i === 0 ? '<b>' + DR.esc(g.nombre) + '</b>' : '') + '<span>' + p.numero_auditoria + '° Auditoría</span></th>';
      for (var k = 0; k < semanas.length; k++) {
        var s = semanas[k];
        if (s === p.semana_inicio) {
          tabla += '<td class="gt-celda' + (s === lunesHoy ? ' hoy' : '') + '" colspan="' + p.semanas + '">' +
            '<button type="button" class="gt-barra' + (sel ? ' sel' : '') + '" data-gprog="' + p.id + '" style="--c:' + g.color + ';--e:' + est.c + '"' +
            ' aria-pressed="' + sel + '" title="' + DR.esc(GANTT.nombreProg(p) + ' · ' + GANTT.rango(p) + ' · ' + d.estado) + '">' +
            (sel ? DR.ICONOS.checkChico : '') + '<span>' + d.hechas + '/' + d.total + '</span></button></td>';
          k += p.semanas - 1;
        } else {
          tabla += '<td class="gt-celda' + (s === lunesHoy ? ' hoy' : '') + '"></td>';
        }
      }
      tabla += '</tr>';
    });
  });
  tabla += '</tbody></table>';

  h += '<section class="panel entra"><div class="panel-cab"><div><h2>Cronograma consolidado</h2>' +
    '<div class="sub">Eje horizontal = semanas ISO · la cifra es áreas cumplidas / áreas a cumplir · la columna resaltada es esta semana</div></div></div>' +
    '<div class="gt-cont">' + tabla + '</div>' +
    '<div class="gt-leyenda">' + ['Cumplido', 'En curso', 'Próximo', 'Atrasado', 'Programado', 'Cancelado'].map(function (e) {
      return '<span><i style="background:' + GANTT.ESTADOS[e].c + '"></i>' + e + '</span>';
    }).join('') + '</div>' + GANTT.botonesAdmin() + '</section>';

  // Lista: la misma información, cómoda en celular, con casilla para marcar.
  var orden = progs.slice().sort(function (a, b) { return a.semana_inicio < b.semana_inicio ? -1 : (a.semana_inicio > b.semana_inicio ? 1 : a.grupo_id - b.grupo_id); });
  h += UI.panel('Auditorías programadas', 'Marca una o varias y toca «Enviar recordatorio».',
    '<div class="gt-lista">' + orden.map(function (p) {
      var g = GANTT.grupo(p.grupo_id), d = GANTT.detalle(p), sel = !!GANTT.sel[p.id];
      return '<div class="gt-item' + (sel ? ' sel' : '') + '" style="--c:' + g.color + '">' +
        '<button type="button" class="gt-check' + (sel ? ' sel' : '') + '" data-gprog="' + p.id + '" aria-pressed="' + sel + '" aria-label="Marcar ' + DR.esc(GANTT.nombreProg(p)) + '">' + DR.ICONOS.checkChico + '</button>' +
        '<div class="gt-item-cuerpo" data-gprog="' + p.id + '"><b>' + DR.esc(g.nombre) + ' · ' + p.numero_auditoria + '° auditoría</b>' +
          '<span>' + GANTT.textoSemanas(p) + ' · ' + GANTT.rango(p) + '</span>' +
          '<span>' + d.hechas + ' de ' + d.total + ' áreas cumplidas' + (p.nota ? ' · ' + DR.esc(p.nota) : '') + '</span>' +
          (p.ultimo_recordatorio ? '<span class="gt-recordado">' + GANTT.ICO_CORREO + 'Recordado ' + DR.hace(p.ultimo_recordatorio) + ' · ' + p.recordatorios + ' envío(s)</span>' : '') +
        '</div><div class="gt-item-der">' + GANTT.pillEstado(d.estado) +
          (AT.puedeCapturar() ? '<button type="button" class="btn sec mini" data-gmarcar="' + p.id + '">Cumplimiento</button>' : '') +
          (AT.esAdmin() ? '<button type="button" class="btn sec mini" data-geditar="' + p.id + '">Editar</button>' : '') + '</div></div>';
    }).join('') + '</div>');
  return h;
};

GANTT.botonesAdmin = function () {
  if (!AT.esAdmin()) return '';
  return '<div class="acciones"><button type="button" class="btn verde chico" id="gtNuevoProg">' + DR.ICONOS.mas + '<span>Programar auditoría</span></button>' +
    '<button type="button" class="btn sec chico" id="gtNuevoGrupo">Nuevo grupo</button></div>';
};

GANTT.areasHtml = function () {
  var h = '';
  GANTT.grupos.forEach(function (g) {
    var cul = S5.cultivo(g.cultivo_id), areas = GANTT.areasDe(g.id);
    var progs = GANTT.programas.filter(function (p) { return p.grupo_id === g.id; }).sort(function (a, b) { return a.numero_auditoria - b.numero_auditoria; });
    var dets = progs.map(GANTT.detalle), hechas = 0, total = 0;
    dets.forEach(function (d) { if (d.estado !== 'Cancelado') { hechas += d.hechas; total += d.total; } });
    var cuerpo;
    if (!areas.length) cuerpo = '<div class="aviso alerta">Este grupo aún no tiene áreas a cumplir.</div>';
    else {
      cuerpo = '<div class="tabla-cont"><table class="gt-matriz"><thead><tr><th>Área</th>' + progs.map(function (p) {
        return '<th>' + p.numero_auditoria + '° · S' + S5._p(GANTT.semana(p.semana_inicio)) + '</th>';
      }).join('') + '</tr></thead><tbody>' + areas.map(function (a) {
        return '<tr><td>' + DR.esc(a.nombre) + '</td>' + progs.map(function (p, i) {
          var d = dets[i], x = d.areas.filter(function (y) { return y.area.id === a.id; })[0] || {}, f = x.fila, m = x.manual, c;
          if (m && m.cumplido) {
            c = '<span class="gt-ok">' + DR.ICONOS.checkChico + 'Cumplido</span><small>Marcado a mano' + (m.semana ? ' · S' + S5._p(GANTT.semana(m.semana)) : '') + '</small>';
          } else if (m) {
            c = '<span class="gt-falta">No cumplido</span><small>Marcado a mano</small>';
          } else if (f) {
            c = '<span class="gt-ok">' + DR.ICONOS.checkChico + 'S' + S5._p(GANTT.semana(f.fecha)) + '</span>' +
              '<small>Integra · ' + DR.esc(f.codigo) + (f.pct !== null && f.pct !== undefined ? ' · ' + S5.pct(f.pct) : '') + (f.estado_auditoria === 'en_curso' ? ' · en curso' : '') + '</small>';
          } else if (d.estado === 'Cancelado') c = '<span class="gt-nada">Cancelada</span>';
          else if (d.estado === 'Atrasado') c = '<span class="gt-falta">Pendiente · atrasada</span>';
          else c = '<span class="gt-nada">Por auditar</span>';
          return '<td>' + (AT.puedeCapturar()
            ? '<button type="button" class="gt-marca" data-gmarcar="' + p.id + '" data-garea="' + a.id + '" title="Marcar cumplimiento">' + c + '</button>'
            : c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    }
    h += '<section class="panel entra"><div class="panel-cab"><div><h2 style="color:' + g.color + '">' + DR.esc(g.nombre) + '</h2>' +
      '<div class="sub">' + DR.esc(GANTT.nombreCultivo(cul)) + (g.planta ? ' · ' + DR.esc(g.planta) : '') + ' · ' + areas.length + ' áreas a cumplir · ' +
      (g.auto_integra ? 'cuenta lo registrado en Integra y las marcas a mano' : 'solo marcas a mano') + ' · ' +
      (total ? Math.round(hechas / total * 100) + ' % de cumplimiento (' + hechas + ' de ' + total + ')' : 'sin auditorías programadas') + '</div></div>' +
      (AT.esAdmin() ? '<button type="button" class="btn sec mini" data-ggrupo="' + g.id + '">Editar</button>' : '') + '</div>' +
      '<div class="chips gt-chips">' + areas.map(function (a) { return '<span class="tag">' + DR.esc(a.nombre) + '</span>'; }).join('') + '</div>' +
      cuerpo + '</section>';
  });
  if (AT.esAdmin()) h += '<div class="acciones"><button type="button" class="btn sec chico" id="gtNuevoGrupo">' + DR.ICONOS.mas + '<span>Nuevo grupo</span></button></div>';
  return h;
};

/* ------------------------------------------------------------ selección */
GANTT.alternar = function (id) {
  id = Number(id);
  if (GANTT.sel[id]) delete GANTT.sel[id]; else GANTT.sel[id] = true;
  DR.vibrar(12);
  DR.$$('[data-gprog="' + id + '"]').forEach(function (b) {
    var on = !!GANTT.sel[id];
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', on);
    b.classList.toggle('sel', on);
    if (b.classList.contains('gt-barra')) {
      var ico = b.querySelector('svg');
      if (on && !ico) b.insertAdjacentHTML('afterbegin', DR.ICONOS.checkChico);
      if (!on && ico) ico.remove();
    }
    var item = b.closest('.gt-item');
    if (item) item.classList.toggle('sel', on);
  });
  GANTT.pintarSeleccion();
};

GANTT.seleccionados = function () {
  return Object.keys(GANTT.sel).map(GANTT.prog).filter(Boolean).sort(function (a, b) { return a.semana_inicio < b.semana_inicio ? -1 : 1; });
};

GANTT.pintarSeleccion = function () {
  var caja = DR.$('#gtBarraSel'), sel = GANTT.seleccionados();
  if (!caja) return;
  if (!sel.length || !AT.puedeCapturar()) { caja.innerHTML = ''; caja.className = ''; return; }
  caja.className = 'gt-barra-sel';
  caja.innerHTML = '<span><b>' + sel.length + '</b> marcada' + (sel.length > 1 ? 's' : '') + '</span>' +
    '<button type="button" class="btn sec chico" id="gtLimpiar">Quitar</button>' +
    '<button type="button" class="btn azul chico" id="gtRecordar">' + GANTT.ICO_CORREO + '<span>Enviar recordatorio</span></button>';
  DR.$('#gtLimpiar').onclick = function () { GANTT.sel = {}; GANTT.pintar(DR.$('#contenido')); };
  DR.$('#gtRecordar').onclick = GANTT.abrirCorreo;
};

GANTT.enlazar = function (cont) {
  DR.$$('[data-gvista]', cont).forEach(function (b) {
    b.onclick = function () { GANTT.vista = this.getAttribute('data-gvista'); GANTT.pintar(cont); };
  });
  DR.$$('[data-gprog]', cont).forEach(function (b) { b.onclick = function () { GANTT.alternar(this.getAttribute('data-gprog')); }; });
  DR.$$('[data-geditar]', cont).forEach(function (b) { b.onclick = function () { GANTT.editarPrograma(GANTT.prog(this.getAttribute('data-geditar'))); }; });
  DR.$$('[data-ggrupo]', cont).forEach(function (b) { b.onclick = function () { GANTT.editarGrupo(GANTT.grupo(this.getAttribute('data-ggrupo'))); }; });
  var np = DR.$('#gtNuevoProg', cont), ng = DR.$('#gtNuevoGrupo', cont);
  if (np) np.onclick = function () { GANTT.editarPrograma(null); };
  if (ng) ng.onclick = function () { GANTT.editarGrupo(null); };
  DR.$$('[data-gmarcar]', cont).forEach(function (b) {
    b.onclick = function () { GANTT.marcar(GANTT.prog(this.getAttribute('data-gmarcar')), Number(this.getAttribute('data-garea')) || null); };
  });
};

/* ------------------------------------------------------------ correo HTML */
GANTT.correoHtml = function (progs, mensaje) {
  var C = { azul: '#0097CE', naranja: '#EF7C3B', verde: '#76B729', marron: '#5D4835', crema: '#F7F3EE', borde: '#E6DED4', texto: '#3B2F25', gris: '#8A7B6E' };
  var esc = DR.esc, fuente = "Roboto,'Segoe UI',Arial,sans-serif";
  var url = location.origin + location.pathname.replace(/[^\/]*$/, '') + '#gantt';
  var tarjetas = progs.map(function (p) {
    var g = GANTT.grupo(p.grupo_id), d = GANTT.detalle(p), est = GANTT.ESTADOS[d.estado];
    var filas = d.areas.map(function (x) {
      var ok = x.hecho, txt;
      if (ok) {
        var sem = x.manual ? x.manual.semana : x.fila.fecha;
        txt = '&#10004; Cumplida' + (sem ? ' (semana ' + GANTT.semana(sem) + ')' : '');
      } else txt = x.manual ? 'No cumplida' : (d.estado === 'Atrasado' ? 'Pendiente (atrasada)' : 'Por auditar');
      return '<tr><td style="padding:7px 10px;border-top:1px solid ' + C.borde + ';font-size:14px;color:' + C.texto + '">' + esc(x.area.nombre) + '</td>' +
        '<td align="right" style="padding:7px 10px;border-top:1px solid ' + C.borde + ';font-size:13px;font-weight:600;color:' + (ok ? '#4C7A20' : (x.manual || d.estado === 'Atrasado' ? '#C0392B' : C.gris)) + '">' +
        txt + '</td></tr>';
    }).join('');
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;border:1px solid ' + C.borde + ';border-left:5px solid ' + g.color + ';border-radius:10px;border-collapse:separate">' +
      '<tr><td style="padding:14px 14px 10px 14px;font-family:' + fuente + '">' +
        '<div style="font-size:17px;font-weight:700;color:' + g.color + '">' + esc(g.nombre) + ' &middot; ' + p.numero_auditoria + '&deg; auditor&iacute;a</div>' +
        '<div style="font-size:14px;color:' + C.texto + ';margin-top:4px"><b>' + GANTT.textoSemanas(p) + '</b> &middot; ' + GANTT.rango(p) + '</div>' +
        '<div style="font-size:12.5px;color:' + C.gris + ';margin-top:2px">El d&iacute;a se coordina dentro de la semana.</div>' +
        '<div style="margin-top:8px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#FFFFFF;background:' + est.c + '">' + d.estado + '</span>' +
        '<span style="font-size:13px;color:' + C.gris + ';margin-left:8px">' + d.hechas + ' de ' + d.total + ' &aacute;reas cumplidas</span></div>' +
        (p.nota ? '<div style="font-size:13px;color:' + C.gris + ';margin-top:6px">' + esc(p.nota) + '</div>' : '') +
      '</td></tr><tr><td style="padding:0 4px 6px 4px;font-family:' + fuente + '"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' + filas + '</table></td></tr></table>';
  }).join('');
  var parrafos = String(mensaje || '').split(/\n{2,}/).map(function (t) {
    return t.trim() ? '<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55">' + esc(t.trim()).replace(/\n/g, '<br>') + '</p>' : '';
  }).join('');
  var firma = AT.perfil && AT.perfil.nombre ? esc(AT.perfil.nombre) : 'Gestión de Procesos';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<title>Recordatorio de auditor&iacute;a 5S</title></head><body style="margin:0;padding:0;background:' + C.crema + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:' + C.crema + '"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ' + C.borde + ';border-radius:14px;overflow:hidden">' +
    '<tr><td height="6" width="34%" style="background:' + C.azul + ';font-size:0;line-height:0">&nbsp;</td><td height="6" width="33%" style="background:' + C.naranja + ';font-size:0;line-height:0">&nbsp;</td><td height="6" width="33%" style="background:' + C.verde + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td colspan="3" style="padding:24px 28px 26px 28px;font-family:' + fuente + ';color:' + C.texto + '">' +
      '<div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:' + C.gris + '">Integra Operaciones &middot; Auditor&iacute;a 5S</div>' +
      '<h1 style="margin:6px 0 18px 0;font-size:23px;line-height:1.25;color:' + C.marron + ';font-weight:700">Recordatorio de auditor&iacute;a 5S</h1>' +
      parrafos + tarjetas +
      '<p style="margin:6px 0 0 0"><a href="' + esc(url) + '" style="display:inline-block;background:' + C.verde + ';color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:11px 24px;border-radius:10px">Ver el cronograma en Integra</a></p>' +
      '<div style="border-top:1px solid ' + C.borde + ';margin-top:24px;padding-top:14px;font-size:13px;line-height:1.5;color:' + C.marron + '"><b>' + firma + '</b><br>Ingenier&iacute;a de Procesos &middot; Don Ricardo</div>' +
    '</td></tr></table></td></tr></table></body></html>';
};

GANTT.asuntoPorDefecto = function (progs) {
  if (progs.length === 1) {
    var p = progs[0];
    return 'Recordatorio · ' + GANTT.nombreProg(p) + ' 5S · ' + GANTT.textoSemanas(p);
  }
  return 'Recordatorio · ' + progs.length + ' auditorías 5S programadas';
};
GANTT.mensajePorDefecto = function (progs) {
  var atrasadas = progs.some(function (p) { return GANTT.detalle(p).estado === 'Atrasado'; });
  return 'Estimados,\n\n' + (atrasadas
    ? 'Les recordamos que las siguientes auditorías 5S tienen áreas pendientes de auditar. Por favor coordinemos su ejecución a la brevedad.'
    : 'Les recordamos las siguientes auditorías 5S programadas. Por favor tener las áreas ordenadas y al personal responsable disponible.') +
    '\n\nSaludos.';
};

GANTT.abrirCorreo = function () {
  var progs = GANTT.seleccionados();
  if (!progs.length) return;
  var destinos = S5.leerLocal(GANTT.CLAVE_DESTINOS) || {};
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#7FD3F2">' + GANTT.ICO_CORREO + '<span>Recordatorio por correo</span></div>' +
    '<div class="res-dni" style="letter-spacing:0">' + progs.map(function (p) { return DR.esc(GANTT.nombreProg(p)) + ' · ' + GANTT.textoSemanas(p); }).join('<br>') + '</div>' +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo ancho"><label for="gcPara">Para<em>obligatorio</em></label>' +
        '<input id="gcPara" type="email" multiple inputmode="email" autocomplete="email" placeholder="correo@adr.com.pe, otro@adr.com.pe" value="' + DR.esc(destinos.para || '') + '">' +
        '<div class="ayuda-campo">Separa varios correos con coma.</div></div>' +
      '<div class="campo ancho"><label for="gcCc">Con copia (opcional)</label>' +
        '<input id="gcCc" type="email" multiple inputmode="email" placeholder="jefe@adr.com.pe" value="' + DR.esc(destinos.cc || '') + '"></div>' +
      '<div class="campo ancho"><label for="gcAsunto">Asunto</label><input id="gcAsunto" value="' + DR.esc(GANTT.asuntoPorDefecto(progs)) + '"></div>' +
      '<div class="campo ancho"><label for="gcMensaje">Mensaje</label><textarea id="gcMensaje" rows="5">' + DR.esc(GANTT.mensajePorDefecto(progs)) + '</textarea></div>' +
    '</div>' +
    '<div class="campo" style="margin-top:12px"><label>Vista previa del correo</label><iframe id="gcVista" class="gt-vista" title="Vista previa del correo"></iframe></div>' +
    '<div id="gcAviso"></div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="gcCancelar">Cancelar</button>' +
      '<button type="button" class="btn sec" id="gcCopiar">Abrir en mi correo</button>' +
      '<button type="button" class="btn azul" id="gcEnviar" style="flex:1">' + GANTT.ICO_CORREO + '<span>Enviar correo</span></button></div>', { fija: true });

  // Sin cuenta de envío configurada: el camino principal es abrir el correo propio.
  var modoManual = function () {
    GANTT.correoListo = false;
    DR.$('#gcEnviar').classList.add('oculto');
    DR.$('#gcCopiar').className = 'btn verde';
    DR.$('#gcCopiar').style.flex = '1';
    DR.$('#gcAviso').innerHTML = '<div class="aviso" style="margin-top:12px">El envío automático aún no está activado. ' +
      '<b>Abrir en mi correo</b> copia el recordatorio con su formato y abre tu Outlook/Gmail con los destinatarios y el asunto: solo pega (Ctrl+V) en el cuerpo y envía.</div>';
  };
  if (GANTT.correoListo === false) modoManual();
  else if (GANTT.correoListo === null) {
    AT.llamarFuncion('recordatorio-5s', { accion: 'estado' }).then(function (r) {
      GANTT.correoListo = !!r.configurado;
      if (!r.configurado && DR.$('#gcEnviar')) modoManual();
    }).catch(function () { /* se decide al intentar enviar */ });
  }

  var vista = function () { DR.$('#gcVista').srcdoc = GANTT.correoHtml(progs, DR.$('#gcMensaje').value); };
  vista();
  DR.$('#gcMensaje').oninput = vista;
  DR.$('#gcCancelar').onclick = UI.cerrarHoja;

  var datos = function () {
    var para = DR.$('#gcPara').value.trim(), cc = DR.$('#gcCc').value.trim();
    var lista = function (s) { return s.split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
    var malos = lista(para).concat(lista(cc)).filter(function (c) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c); });
    if (!lista(para).length) { DR.toast('Escribe al menos un correo en «Para».', 'error'); DR.$('#gcPara').focus(); return null; }
    if (malos.length) { DR.toast('Correo no válido: ' + malos.join(', '), 'error'); return null; }
    if (!DR.$('#gcAsunto').value.trim()) { DR.toast('Escribe el asunto.', 'error'); return null; }
    S5.escribirLocal(GANTT.CLAVE_DESTINOS, { para: para, cc: cc });
    return { programas: progs.map(function (p) { return p.id; }), para: lista(para), cc: lista(cc),
      asunto: DR.$('#gcAsunto').value.trim(), html: GANTT.correoHtml(progs, DR.$('#gcMensaje').value) };
  };
  var terminar = function (msg) {
    UI.cerrarHoja();
    DR.toast(msg);
    GANTT.sel = {};
    GANTT.refrescar();
  };

  DR.$('#gcEnviar').onclick = function () {
    var d = datos(), btn = this;
    if (!d) return;
    btn.classList.add('cargando');
    AT.llamarFuncion('recordatorio-5s', d).then(function (r) {
      terminar('Recordatorio enviado a ' + r.enviados + ' destinatario(s).');
    }).catch(function (e) {
      btn.classList.remove('cargando');
      if (/no está configurado/i.test(e.message)) modoManual();
      else DR.toast(e.message, 'error');
    });
  };

  DR.$('#gcCopiar').onclick = function () {
    var d = datos();
    if (!d) return;
    GANTT.copiarHtml(d.html).then(function () {
      var url = 'mailto:' + d.para.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent(d.asunto) +
        (d.cc.length ? '&cc=' + d.cc.map(encodeURIComponent).join(',') : '') +
        '&body=' + encodeURIComponent('(Pega aquí el recordatorio con Ctrl+V)');
      location.href = url;
      d.accion = 'anotar';
      AT.llamarFuncion('recordatorio-5s', d).catch(function () { /* el registro es opcional */ });
      terminar('Correo copiado con formato: pégalo en el cuerpo del mensaje y envíalo.');
    }).catch(function (e) { DR.toast('No se pudo copiar: ' + e.message, 'error'); });
  };
};

/** Copia el correo como HTML (se pega con formato en Outlook/Gmail); sin soporte, como texto. */
GANTT.copiarHtml = function (html) {
  if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([tmp.innerText], { type: 'text/plain' })
    })]);
  }
  return new Promise(function (resolve, reject) {
    var caja = document.createElement('div');
    caja.innerHTML = html;
    caja.style.position = 'fixed'; caja.style.left = '-9999px';
    document.body.appendChild(caja);
    var r = document.createRange(); r.selectNodeContents(caja);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    try { if (document.execCommand('copy')) resolve(); else reject(new Error('el navegador no lo permite')); } catch (e) { reject(e); }
    s.removeAllRanges();
    document.body.removeChild(caja);
  });
};

/* ------------------------------------------------------------ edición (admin) */
GANTT.editarPrograma = function (p) {
  var gid = p ? p.grupo_id : (GANTT.grupos[0] || {}).id;
  var op = function (v, t, act) { return '<option value="' + v + '"' + (String(v) === String(act) ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  var estado = p ? p.estado : 'Programado';
  var base = p ? p.semana_inicio : GANTT.lunes(S5.hoy()), anioHoy = GANTT.anioIso(S5.hoy());
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#7FD3F2">' + DR.ICONOS.reloj + '<span>' + (p ? 'Editar auditoría programada' : 'Programar auditoría') + '</span></div>' +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo ancho"><label for="gpGrupo">Grupo</label><select id="gpGrupo"' + (p ? ' disabled' : '') + '>' +
        GANTT.grupos.map(function (g) { return op(g.id, g.nombre, gid); }).join('') + '</select></div>' +
      '<div class="campo"><label for="gpNum">N° de auditoría</label><input id="gpNum" type="number" min="1" max="99" inputmode="numeric" value="' +
        (p ? p.numero_auditoria : 1 + GANTT.programas.filter(function (x) { return x.grupo_id === gid; }).reduce(function (m, x) { return Math.max(m, x.numero_auditoria); }, 0)) + '"></div>' +
      '<div class="campo"><label for="gpSemanas">Duración (semanas)</label><input id="gpSemanas" type="number" min="1" max="12" inputmode="numeric" value="' + (p ? p.semanas : 1) + '"></div>' +
      '<div class="campo"><label for="gpSemana">Semana (ISO)</label><input id="gpSemana" type="number" min="1" max="53" inputmode="numeric" value="' + GANTT.semana(base) + '"></div>' +
      '<div class="campo"><label for="gpAnio">Año</label><select id="gpAnio">' + [anioHoy - 1, anioHoy, anioHoy + 1, anioHoy + 2].map(function (a) {
        return op(a, a, GANTT.anioIso(base));
      }).join('') + '</select></div>' +
      '<div class="campo ancho"><div class="ayuda-campo" id="gpAyuda"></div></div>' +
      '<div class="campo ancho"><label>Estado</label><div class="opciones" id="gpEstado">' + ['Programado', 'Cancelado'].map(function (e) {
        return '<button type="button" class="opcion' + (e === estado ? ' activa' : '') + '" data-valor="' + e + '" style="--c:' + (e === 'Cancelado' ? '#A89A8C' : '#0097CE') + '">' + e + '</button>';
      }).join('') + '</div></div>' +
      '<div class="campo ancho"><label for="gpNota">Nota (opcional)</label><input id="gpNota" maxlength="200" placeholder="Ej. Coordinar con el jefe de área" value="' + DR.esc(p ? (p.nota || '') : '') + '"></div>' +
    '</div>' +
    '<div class="acciones">' + (p ? '<button type="button" class="btn-peligro" id="gpBorrar">Eliminar</button>' : '') +
      '<button type="button" class="btn sec" id="gpCancelar">Cancelar</button>' +
      '<button type="button" class="btn verde" id="gpGuardar" style="flex:1">Guardar</button></div>', { fija: true });

  /** Lunes de la semana elegida, o null si el número no existe en ese año. */
  var lunesElegido = function () {
    var n = parseInt(DR.$('#gpSemana').value, 10), a = Number(DR.$('#gpAnio').value);
    if (!(n >= 1 && n <= 53)) return null;
    var f = GANTT.lunesDeSemana(a, n);
    return GANTT.anioIso(f) === a ? f : null;
  };
  var ayuda = function () {
    var f = lunesElegido(), sem = Number(DR.$('#gpSemanas').value) || 1;
    DR.$('#gpAyuda').textContent = f
      ? 'Semana ' + GANTT.semana(f) + (sem > 1 ? '–' + GANTT.semana(S5.sumarDias(f, (sem - 1) * 7)) : '') +
        ': lun ' + S5.fecha(f).substring(0, 5) + ' a dom ' + S5.fecha(S5.sumarDias(f, sem * 7 - 1)) + '. El día exacto se coordina dentro de la semana.'
      : 'Esa semana no existe en el año elegido.';
  };
  ayuda();
  DR.$('#gpSemana').oninput = ayuda;
  DR.$('#gpAnio').onchange = ayuda;
  DR.$('#gpSemanas').oninput = ayuda;
  DR.$$('#gpEstado .opcion').forEach(function (b) {
    b.onclick = function () { estado = this.getAttribute('data-valor'); DR.$$('#gpEstado .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); }); };
  });
  DR.$('#gpCancelar').onclick = UI.cerrarHoja;
  DR.$('#gpGuardar').onclick = function () {
    var btn = this, f = lunesElegido();
    if (!f) { DR.toast('Escribe una semana válida (1 a 52 o 53) para ese año.', 'error'); return; }
    btn.classList.add('cargando');
    AT.rpc('rpc_s5_gantt_guardar_programa', { p: {
      id: p ? p.id : null, grupo_id: Number(DR.$('#gpGrupo').value), numero_auditoria: Number(DR.$('#gpNum').value),
      semana_inicio: f, semanas: Number(DR.$('#gpSemanas').value) || 1, estado: estado, nota: DR.$('#gpNota').value
    } }).then(function () {
      UI.cerrarHoja();
      DR.toast('Cronograma actualizado.');
      return GANTT.refrescar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
  if (p) DR.$('#gpBorrar').onclick = function () {
    if (!window.confirm('¿Eliminar ' + GANTT.nombreProg(p) + ' del cronograma?')) return;
    AT.rpc('rpc_s5_gantt_eliminar_programa', { p_id: p.id }).then(function () {
      delete GANTT.sel[p.id];
      UI.cerrarHoja();
      DR.toast('Auditoría quitada del cronograma.');
      return GANTT.refrescar();
    }).catch(function (e) { DR.toast(e.message, 'error'); });
  };
};

GANTT.editarGrupo = function (g) {
  var marcadas = g ? (GANTT.areas[g.id] || []).slice() : [];
  var auto = g ? g.auto_integra !== false : true;
  var op = function (v, t, act) { return '<option value="' + v + '"' + (String(v) === String(act) ? ' selected' : '') + '>' + DR.esc(t) + '</option>'; };
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado" style="color:#B7E27C">' + DR.ICONOS.checkChico + '<span>' + (g ? 'Editar grupo' : 'Nuevo grupo') + '</span></div>' +
    '<div class="form" style="margin-top:14px">' +
      '<div class="campo"><label for="ggNombre">Nombre</label><input id="ggNombre" maxlength="60" placeholder="Ej. Uva PLM" value="' + DR.esc(g ? g.nombre : '') + '"></div>' +
      '<div class="campo"><label for="ggCultivo">Cultivo</label><select id="ggCultivo">' +
        S5.cultivos.map(function (c) { return op(c.id, GANTT.nombreCultivo(c), g ? g.cultivo_id : ''); }).join('') + '</select></div>' +
      '<div class="campo"><label for="ggPlanta">Planta (opcional)</label><input id="ggPlanta" maxlength="80" placeholder="Ej. Planta Don Carlos" value="' + DR.esc(g ? (g.planta || '') : '') + '">' +
        '<div class="ayuda-campo">Si la escribes, solo cuentan las auditorías de esa planta.</div></div>' +
      '<div class="campo"><label for="ggColor">Color</label><input id="ggColor" type="color" value="' + (g ? g.color : '#76B729') + '"></div>' +
      '<div class="campo ancho"><label>Cumplimiento</label><div class="opciones" id="ggAuto">' +
        [{ v: true, t: 'Integra + marcas a mano' }, { v: false, t: 'Solo marcas a mano' }].map(function (o) {
          return '<button type="button" class="opcion' + (o.v === auto ? ' activa' : '') + '" data-valor="' + o.v + '">' + o.t + '</button>';
        }).join('') + '</div><div class="ayuda-campo">«Solo marcas a mano»: no se cruza con las auditorías registradas en Integra (p. ej. Servicios Generales o auditorías hechas en Excel).</div></div>' +
      '<div class="campo ancho"><label>Áreas que deben cumplirse</label><div class="opciones" id="ggAreas">' +
        S5.areas.filter(function (a) { return a.activo || marcadas.indexOf(a.id) > -1; }).map(function (a) {
          return '<button type="button" class="opcion' + (marcadas.indexOf(a.id) > -1 ? ' activa' : '') + '" data-area="' + a.id + '">' + DR.esc(a.nombre) + '</button>';
        }).join('') + '</div></div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="ggCancelar">Cancelar</button>' +
      '<button type="button" class="btn verde" id="ggGuardar" style="flex:1">Guardar</button></div>', { fija: true });

  DR.$$('#ggAreas .opcion').forEach(function (b) {
    b.onclick = function () {
      var id = Number(this.getAttribute('data-area')), i = marcadas.indexOf(id);
      if (i > -1) marcadas.splice(i, 1); else marcadas.push(id);
      this.classList.toggle('activa', i < 0);
    };
  });
  DR.$$('#ggAuto .opcion').forEach(function (b) {
    b.onclick = function () { auto = this.getAttribute('data-valor') === 'true'; DR.$$('#ggAuto .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); }); };
  });
  DR.$('#ggCancelar').onclick = UI.cerrarHoja;
  DR.$('#ggGuardar').onclick = function () {
    var btn = this;
    btn.classList.add('cargando');
    AT.rpc('rpc_s5_gantt_guardar_grupo', { p: {
      id: g ? g.id : null, nombre: DR.$('#ggNombre').value, cultivo_id: Number(DR.$('#ggCultivo').value),
      planta: DR.$('#ggPlanta').value, color: DR.$('#ggColor').value.toUpperCase(), areas: marcadas, auto_integra: auto
    } }).then(function () {
      UI.cerrarHoja();
      DR.toast('Grupo guardado.');
      return GANTT.refrescar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
};

/* ------------------------------------------------------------ cumplimiento a mano */
/** Hoja para marcar a mano qué áreas cumplieron una auditoría programada (p. ej. las hechas en Excel). */
GANTT.marcar = function (p, areaFoco) {
  if (!p) return;
  var g = GANTT.grupo(p.grupo_id), d = GANTT.detalle(p), estado = {};
  // estado[área] = true (cumplido) · false (no cumplido) · null (sin marca)
  d.areas.forEach(function (x) { estado[x.area.id] = x.manual ? !!x.manual.cumplido : null; });
  var inicial = JSON.stringify(estado);
  var focoManual = (d.areas.filter(function (x) { return x.area.id === areaFoco && x.manual && x.manual.semana; })[0] || {}).manual;
  var base = focoManual ? focoManual.semana : p.semana_inicio, anioHoy = GANTT.anioIso(S5.hoy());
  var sinMarca = g.auto_integra ? 'Según Integra' : 'Sin marcar';
  var fila = function (x) {
    var auto = x.fila ? 'Integra: S' + S5._p(GANTT.semana(x.fila.fecha)) + ' · ' + DR.esc(x.fila.codigo) : (g.auto_integra ? 'Sin auditoría en Integra' : '');
    var por = x.manual ? 'Marcado por ' + DR.esc(x.manual.por || '—') + ' ' + DR.hace(x.manual.en) : '';
    return '<div class="gt-marca-fila' + (x.area.id === areaFoco ? ' foco' : '') + '">' +
      '<div><b>' + DR.esc(x.area.nombre) + '</b><small>' + [auto, por].filter(Boolean).join(' · ') + '</small></div>' +
      '<div class="opciones">' + [{ v: true, t: 'Cumplido', c: '#76B729' }, { v: false, t: 'No cumplido', c: '#E5484D' }, { v: null, t: sinMarca, c: '#A89A8C' }].map(function (o) {
        return '<button type="button" class="opcion chica' + (estado[x.area.id] === o.v ? ' activa' : '') + '" data-marea="' + x.area.id + '" data-valor="' + o.v + '" style="--c:' + o.c + '">' + o.t + '</button>';
      }).join('') + '</div></div>';
  };
  var op = function (v, t, act) { return '<option value="' + v + '"' + (String(v) === String(act) ? ' selected' : '') + '>' + t + '</option>'; };
  UI.abrirHoja('<div class="asa"></div>' +
    '<div class="res-estado">' + DR.ICONOS.checkChico + '<span>Cumplimiento a mano</span></div>' +
    '<div class="res-nombre" style="font-size:24px">' + DR.esc(GANTT.nombreProg(p)) + '</div>' +
    '<div class="res-dni" style="letter-spacing:0">' + GANTT.textoSemanas(p) + ' · ' + GANTT.rango(p) + '</div>' +
    '<div class="aviso" style="margin-top:12px">Marca las áreas que cumplieron esta auditoría (por ejemplo, las hechas en Excel). La marca a mano manda sobre lo registrado en Integra.</div>' +
    '<div class="acciones" style="margin-top:10px"><button type="button" class="btn sec chico" id="gmTodas">Todas cumplidas</button>' +
      '<button type="button" class="btn sec chico" id="gmNinguna">Quitar todas las marcas</button></div>' +
    '<div class="gt-marca-lista">' + d.areas.map(fila).join('') + '</div>' +
    '<div class="form" style="margin-top:12px">' +
      '<div class="campo"><label for="gmSemana">Semana en que se cumplió</label><input id="gmSemana" type="number" min="1" max="53" inputmode="numeric" value="' + GANTT.semana(base) + '"></div>' +
      '<div class="campo"><label for="gmAnio">Año</label><select id="gmAnio">' + [anioHoy - 1, anioHoy, anioHoy + 1].map(function (a) { return op(a, a, GANTT.anioIso(base)); }).join('') + '</select></div>' +
      '<div class="campo ancho"><label for="gmNota">Nota (opcional)</label><input id="gmNota" maxlength="200" placeholder="Ej. Auditoría registrada en Excel" value="' + DR.esc(focoManual && focoManual.nota ? focoManual.nota : '') + '"></div>' +
    '</div>' +
    '<div class="acciones"><button type="button" class="btn sec" id="gmCancelar">Cancelar</button>' +
      '<button type="button" class="btn verde" id="gmGuardar" style="flex:1">Guardar</button></div>', { fija: true });

  var leer = function (v) { return v === 'true' ? true : (v === 'false' ? false : null); };
  var pintarFila = function (id) {
    DR.$$('[data-marea="' + id + '"]').forEach(function (b) { b.classList.toggle('activa', estado[id] === leer(b.getAttribute('data-valor'))); });
  };
  DR.$$('[data-marea]').forEach(function (b) {
    b.onclick = function () { var id = Number(this.getAttribute('data-marea')); estado[id] = leer(this.getAttribute('data-valor')); pintarFila(id); };
  });
  DR.$('#gmTodas').onclick = function () { Object.keys(estado).forEach(function (id) { estado[id] = true; pintarFila(id); }); };
  DR.$('#gmNinguna').onclick = function () { Object.keys(estado).forEach(function (id) { estado[id] = null; pintarFila(id); }); };
  var foco = DR.$('.gt-marca-fila.foco');
  if (foco) foco.scrollIntoView({ block: 'center' });
  DR.$('#gmCancelar').onclick = UI.cerrarHoja;
  DR.$('#gmGuardar').onclick = function () {
    var btn = this, n = parseInt(DR.$('#gmSemana').value, 10), a = Number(DR.$('#gmAnio').value);
    var lunes = n >= 1 && n <= 53 ? GANTT.lunesDeSemana(a, n) : null;
    if (!lunes || GANTT.anioIso(lunes) !== a) { DR.toast('Escribe una semana válida para ese año.', 'error'); return; }
    var antes = JSON.parse(inicial);
    // Áreas que cambiaron, más las marcadas (así reciben la semana y la nota de este guardado).
    var marcas = Object.keys(estado).filter(function (id) { return estado[id] !== antes[id] || estado[id] !== null; })
      .map(function (id) { return { area_id: Number(id), cumplido: estado[id] }; });
    if (!marcas.length) { UI.cerrarHoja(); return; }
    btn.classList.add('cargando');
    AT.rpc('rpc_s5_gantt_marcar', { p_programa: p.id, p_marcas: marcas, p_semana: lunes, p_nota: DR.$('#gmNota').value }).then(function () {
      UI.cerrarHoja();
      DR.toast('Cumplimiento guardado.');
      return GANTT.refrescar();
    }).catch(function (e) { btn.classList.remove('cargando'); DR.toast(e.message, 'error'); });
  };
};
