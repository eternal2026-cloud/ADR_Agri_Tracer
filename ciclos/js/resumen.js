/* ============================================================================
 * resumen.js — DRILL-DOWN: PROMEDIO GENERAL → POR SEMANA → POR MUESTRA
 * ==========================================================================*/
var VISTAS = window.VISTAS || {};

var RES = { nivel: 'general', semana: null, fundo: null, umbral: 480 };

RES.cargarUmbral = function () {
  return sb.from('parametros').select('valor').eq('clave', 'UMBRAL_TIEMPO_CICLO_MIN').single().then(function (r) {
    RES.umbral = r.data ? Number(r.data.valor) : 480;
    return RES.umbral;
  }).catch(function () { return RES.umbral; });
};

VISTAS.resumen = function (cont) {
  RES.cargarUmbral().then(function () {
    if (RES.nivel === 'semana') return RES.renderSemana(cont);
    if (RES.nivel === 'muestras') return RES.renderMuestras(cont);
    return RES.renderGeneral(cont);
  }).catch(function (e) { UI.error(cont, e); });
};

RES.irGeneral = function () { RES.nivel = 'general'; RES.semana = null; RES.fundo = null; DR.ir('resumen'); };
RES.irSemana = function (semana) { RES.nivel = 'semana'; RES.semana = semana; RES.fundo = null; DR.ir('resumen'); };
RES.irMuestras = function (semana, fundo) { RES.nivel = 'muestras'; RES.semana = semana; RES.fundo = fundo; DR.ir('resumen'); };

RES.renderGeneral = function (cont) {
  Promise.all([AT.rpc('fn_resumen_general'), AT.rpc('fn_semanas_disponibles')]).then(function (r) {
    var filas = r[0] || [], semanas = r[1] || [];
    if (!filas.length) {
      cont.innerHTML = UI.encabezado('Tiempos de ciclo', 'Resumen general', 'Todavía no hay ciclos cerrados registrados.') +
        UI.panel('Sin datos', '', '<div class="aviso">Registra el primer ciclo desde la pestaña <b>Captura</b>, o importa la hoja BD del Excel a la tabla <code>ciclos_cosecha</code>.</div>');
      DR.entrarPaneles('#contenido'); return;
    }
    var total = filas.filter(function (f) { return f.fundo === 'Total general'; })[0];
    var fundos = filas.filter(function (f) { return f.fundo !== 'Total general'; }).sort(function (a, b) { return b.t_ciclo_total - a.t_ciclo_total; });

    var sel = '<select id="selSemanaIr"><option value="">Ver una semana…</option>' + semanas.map(function (s) { return '<option value="' + s + '">Semana ' + s + '</option>'; }).join('') + '</select>';

    var h = UI.migas([{ texto: 'Todas las semanas' }]) +
      UI.encabezado('Tiempos de ciclo', 'Promedio general', 'Todas las semanas registradas, agrupado por fundo. Toca un fundo para ver sus muestras individuales.', sel);

    h += '<div class="kpis">' +
      UI.kpi('Tiempo de ciclo promedio', DR.num(total.t_ciclo_total, 1) + ' min', DR.num(total.tiempo_horas, 2) + ' h en promedio', '#579BCB') +
      UI.kpi('Muestras válidas', DR.num(total.n_muestras), 'Umbral actual: ' + DR.num(RES.umbral) + ' min', '#8FBD38') +
      UI.kpi('Fundos', DR.num(fundos.length), 'Con datos registrados', '#B7A99C') +
      UI.kpi('Semanas', DR.num(semanas.length), semanas.length ? ('De la ' + semanas[0] + ' a la ' + semanas[semanas.length - 1]) : '', '#E37E3B') +
      '</div>';

    fundos.forEach(function (f, i) { f._idx = i; f._clic = true; });
    h += UI.panel('Promedio por fundo (todas las semanas)', fundos.length + ' fundo(s) · toca una fila para ver el detalle',
      UI.tabla(UI.columnasResumen(), fundos.concat([total]), function (f) { return f.fundo === 'Total general' ? 'fila-total' : 'clicable'; }));

    var barras = fundos.map(function (f) { return { etq: f.fundo, valor: f.t_ciclo_total, dec: 1 }; });
    h += UI.panel('Tiempo de ciclo total por fundo', 'La línea punteada marca el umbral configurado.', GRAFICO.barrasFundo(barras, RES.umbral));

    cont.innerHTML = h;
    DR.entrarPaneles('#contenido');
    GRAFICO.animarBarrasFundo();

    DR.$('#selSemanaIr').onchange = function () { if (this.value) RES.irSemana(Number(this.value)); };
    DR.$$('tbody tr.clicable', cont).forEach(function (tr) {
      tr.onclick = function () { RES.irMuestras(null, fundos[Number(this.getAttribute('data-idx'))].fundo); };
    });
  }).catch(function (e) { UI.error(cont, e); });
};

RES.renderSemana = function (cont) {
  AT.rpc('fn_semanas_disponibles').then(function (semanas) {
    if (!semanas.length) { RES.irGeneral(); return; }
    var semana = semanas.indexOf(RES.semana) > -1 ? RES.semana : semanas[semanas.length - 1];
    RES.semana = semana;

    return AT.rpc('fn_resumen_semana', { p_semana: semana }).then(function (filas) {
      filas = filas || [];
      var total = filas.filter(function (f) { return f.fundo === 'Total general'; })[0] || { fundo: 'Total general', n_muestras: 0, t_ciclo_total: 0, tiempo_horas: 0 };
      var fundos = filas.filter(function (f) { return f.fundo !== 'Total general'; }).sort(function (a, b) { return b.t_ciclo_total - a.t_ciclo_total; });

      var sel = '<select id="selSemana">' + semanas.map(function (s) { return '<option value="' + s + '"' + (s === semana ? ' selected' : '') + '>Semana ' + s + '</option>'; }).join('') + '</select>';

      var h = UI.migas([{ texto: 'Todas las semanas', accion: true }, { texto: 'Semana ' + semana }]) +
        UI.encabezado('Tiempos de ciclo', 'Semana ' + semana, 'Promedio de cada tramo agrupado por fundo. Los registros que superan el umbral se excluyen del cálculo.', sel);

      h += '<div class="kpis">' +
        UI.kpi('Tiempo de ciclo promedio', DR.num(total.t_ciclo_total, 1) + ' min', DR.num(total.tiempo_horas, 2) + ' h', '#579BCB') +
        UI.kpi('Muestras válidas', DR.num(total.n_muestras), 'Umbral: ' + DR.num(RES.umbral) + ' min', '#8FBD38') +
        UI.kpi('Fundos con datos', DR.num(fundos.length), 'En esta semana', '#B7A99C') +
        '</div>';

      fundos.forEach(function (f, i) { f._idx = i; f._clic = true; });
      h += UI.panel('Resumen por fundo', fundos.length + ' fundo(s) · toca una fila para ver las muestras',
        UI.tabla(UI.columnasResumen(), fundos.concat([total]), function (f) { return f.fundo === 'Total general' ? 'fila-total' : 'clicable'; }));

      var barras = fundos.map(function (f) { return { etq: f.fundo, valor: f.t_ciclo_total, dec: 1 }; });
      h += UI.panel('Tiempo de ciclo total por fundo', 'La línea punteada marca el umbral configurado (' + DR.num(RES.umbral) + ' min).', GRAFICO.barrasFundo(barras, RES.umbral));

      cont.innerHTML = h;
      DR.entrarPaneles('#contenido');
      GRAFICO.animarBarrasFundo();

      DR.$('#selSemana').onchange = function () { RES.irSemana(Number(this.value)); };
      DR.$$('[data-miga]', cont).forEach(function (b) { b.onclick = RES.irGeneral; });
      DR.$$('tbody tr.clicable', cont).forEach(function (tr) {
        tr.onclick = function () { RES.irMuestras(semana, fundos[Number(this.getAttribute('data-idx'))].fundo); };
      });
    });
  }).catch(function (e) { UI.error(cont, e); });
};

RES.renderMuestras = function (cont) {
  var q = sb.from('ciclos_cosecha').select('*').eq('fundo', RES.fundo).eq('cerrado', true).order('fecha', { ascending: false });
  if (RES.semana) q = q.eq('semana', RES.semana);

  q.then(function (r) {
    if (r.error) throw new Error(r.error.message);
    var filas = r.data || [];
    var migas = [{ texto: 'Todas las semanas', accion: true }];
    if (RES.semana) migas.push({ texto: 'Semana ' + RES.semana, accion: true });
    migas.push({ texto: RES.fundo });

    var validas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total <= RES.umbral; });
    var excluidas = filas.filter(function (f) { return f.t_ciclo_total !== null && f.t_ciclo_total > RES.umbral; });
    var promedio = validas.length ? validas.reduce(function (s, f) { return s + Number(f.t_ciclo_total); }, 0) / validas.length : 0;

    var h = UI.migas(migas) + UI.encabezado('Tiempos de ciclo', RES.fundo, (RES.semana ? 'Semana ' + RES.semana + ' · ' : 'Todas las semanas · ') + filas.length + ' registro(s)');

    h += '<div class="kpis">' +
      UI.kpi('Promedio válido', DR.num(promedio, 1) + ' min', validas.length + ' muestra(s)', '#579BCB') +
      UI.kpi('Excluidas por umbral', DR.num(excluidas.length), 'Umbral: ' + DR.num(RES.umbral) + ' min', excluidas.length ? '#B94A02' : '#8FBD38') +
      '</div>';

    var cols = [
      { t: 'Fecha', r: function (f) { return DR.fechaHora(f.fecha).split(' ')[0]; } },
      { t: 'Código', k: 'codigo' }, { t: 'Lote', k: 'lote' }, { t: 'Líder', k: 'lider' },
      { t: 'Variedad', k: 'variedad' }, { t: 'Calibre', k: 'calibre' }
    ].concat(CAMPOS_RESUMEN.map(function (c) { return { t: c.titulo, num: true, r: function (f) { return DR.num(f[c.clave], 1); } }; }))
      .concat([{ t: 'Total ciclo (min)', num: true, r: function (f) { return '<b>' + DR.num(f.t_ciclo_total, 1) + '</b>'; } }]);

    h += UI.panel('Muestras', filas.length + ' registro(s) · las tachadas en rojo se excluyeron del promedio por superar el umbral',
      UI.tabla(cols, filas, function (f) {
        if (f.t_ciclo_total !== null && f.t_ciclo_total > RES.umbral) return 'fila-excluida';
        if (f.t_ciclo_total !== null && f.t_ciclo_total >= RES.umbral * 0.85) return 'fila-cerca';
        return '';
      }));

    cont.innerHTML = h;
    DR.entrarPaneles('#contenido');
    DR.$$('[data-miga]', cont).forEach(function (b, i) {
      b.onclick = function () { if (i === 0) RES.irGeneral(); else RES.irSemana(RES.semana); };
    });
  }).catch(function (e) { UI.error(cont, e); });
};
