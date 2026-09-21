/* ============================================================================
 * evolucion.js — GRÁFICO DE LÍNEAS «EVOLUCIÓN SEMANAL» (Resumen de tiempos)
 * Filtro por tiempo de operación (total del ciclo o un tramo) y por fundo:
 * cada fundo elegido se agrega como una línea con su color y su leyenda.
 * Datos: fn_evolucion_semanal (misma regla que el resumen: cerrados y bajo
 * el umbral). Animado con anime.js (las líneas se dibujan al entrar).
 * ==========================================================================*/
var EVO = { datos: null, campo: 't_ciclo_total', fundos: null, _cargando: null };

/** Paleta categórica validada (modo oscuro, contraste ≥ 3:1 sobre el panel). El color sigue al fundo, no al orden. */
EVO.COLORES = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'];
EVO.COLOR_TODOS = '#B7A99C';
EVO.TODOS = '__todos__';
EVO.MAX = 8;

EVO.campos = function () {
  return [{ clave: 't_ciclo_total', titulo: 'Tiempo de ciclo total' }].concat(CAMPOS_RESUMEN);
};
EVO.tituloCampo = function () {
  return (EVO.campos().filter(function (c) { return c.clave === EVO.campo; })[0] || {}).titulo || '';
};

EVO.cargar = function () {
  if (EVO.datos) return Promise.resolve(EVO.datos);
  if (!EVO._cargando) {
    EVO._cargando = AT.rpc('fn_evolucion_semanal').then(function (filas) {
      EVO.datos = filas || [];
      return EVO.datos;
    }).catch(function (e) { EVO._cargando = null; throw e; });
  }
  return EVO._cargando;
};

/** Fundos con datos, en orden alfabético (define su color de forma estable). */
EVO.listaFundos = function () {
  var l = [];
  (EVO.datos || []).forEach(function (f) { if (f.fundo && l.indexOf(f.fundo) < 0) l.push(f.fundo); });
  return l.sort();
};
EVO.color = function (fundo) {
  if (fundo === EVO.TODOS) return EVO.COLOR_TODOS;
  var i = EVO.listaFundos().indexOf(fundo);
  return EVO.COLORES[(i < 0 ? 0 : i) % EVO.COLORES.length];
};
EVO.nombre = function (fundo) { return fundo === EVO.TODOS ? 'Todos los fundos' : fundo; };

/** Semanas en orden cronológico (por su primera fecha, para que el cambio de año no desordene). */
EVO.semanas = function () {
  var mapa = {};
  (EVO.datos || []).forEach(function (f) {
    if (!mapa[f.semana] || f.desde < mapa[f.semana]) mapa[f.semana] = f.desde;
  });
  return Object.keys(mapa).map(Number).sort(function (a, b) { return mapa[a] < mapa[b] ? -1 : (mapa[a] > mapa[b] ? 1 : a - b); })
    .map(function (s) { return { semana: s, desde: mapa[s] }; });
};

/** Valor de un fundo (o promedio ponderado de todos) en una semana; null si no hubo muestras. */
EVO.valor = function (fundo, semana) {
  var filas = (EVO.datos || []).filter(function (f) {
    return f.semana === semana && (fundo === EVO.TODOS || f.fundo === fundo) && f[EVO.campo] !== null && f[EVO.campo] !== undefined;
  });
  if (!filas.length) return null;
  var s = 0, n = 0;
  filas.forEach(function (f) { var k = Number(f.n_muestras) || 1; s += Number(f[EVO.campo]) * k; n += k; });
  return n ? { v: s / n, n: n } : null;
};

EVO.seleccionInicial = function () {
  var todos = EVO.listaFundos();
  var mios = (typeof CAPTURA !== 'undefined' && CAPTURA.misFundos) ? CAPTURA.misFundos().filter(function (f) { return todos.indexOf(f) > -1; }) : [];
  if (mios.length) return mios.slice(0, EVO.MAX);
  var total = {};
  (EVO.datos || []).forEach(function (f) { total[f.fundo] = (total[f.fundo] || 0) + Number(f.n_muestras || 0); });
  return todos.slice().sort(function (a, b) { return total[b] - total[a]; }).slice(0, 3);
};

/* ------------------------------------------------------------ panel */
EVO.panelHtml = function () {
  return UI.panel('Evolución semanal por fundo', 'Promedio de cada semana (solo ciclos cerrados bajo el umbral). Elige el tiempo de operación y los fundos a comparar.',
    '<div id="evoCuerpo"><div class="vacio">Cargando evolución…</div></div>');
};

EVO.montar = function () {
  var caja = DR.$('#evoCuerpo');
  if (!caja) return;
  EVO.cargar().then(function () {
    if (!DR.$('#evoCuerpo')) return;
    if (!EVO.datos.length) { caja.innerHTML = '<div class="vacio">Todavía no hay semanas con ciclos cerrados.</div>'; return; }
    var fundos = EVO.listaFundos();
    if (!EVO.fundos) EVO.fundos = EVO.seleccionInicial();
    EVO.fundos = EVO.fundos.filter(function (f) { return f === EVO.TODOS || fundos.indexOf(f) > -1; });

    var chips = [EVO.TODOS].concat(fundos).map(function (f) {
      var on = EVO.fundos.indexOf(f) > -1;
      return '<button type="button" class="evo-chip' + (on ? ' activo' : '') + '" data-evo-fundo="' + DR.esc(f) + '" style="--c:' + EVO.color(f) + '" aria-pressed="' + on + '">' +
        '<i class="' + (f === EVO.TODOS ? 'punteada' : '') + '"></i><span>' + DR.esc(EVO.nombre(f)) + '</span></button>';
    }).join('');

    caja.innerHTML =
      '<div class="evo-filtros">' +
        '<div class="campo"><label for="evoCampo">Tiempo de operación</label><select id="evoCampo">' +
          EVO.campos().map(function (c) { return '<option value="' + c.clave + '"' + (c.clave === EVO.campo ? ' selected' : '') + '>' + DR.esc(c.titulo) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="campo ancho"><label>Fundos <small>(toca para agregar o quitar · máx. ' + EVO.MAX + ')</small></label><div class="evo-chips" role="group" aria-label="Fundos del gráfico">' + chips + '</div></div>' +
      '</div>' +
      '<div class="evo-grafico" id="evoGrafico"></div>' +
      '<details class="evo-tabla"><summary>Ver los datos en tabla</summary><div id="evoTabla"></div></details>';

    DR.$('#evoCampo').onchange = function () { EVO.campo = this.value; EVO.dibujar(true); };
    DR.$$('[data-evo-fundo]', caja).forEach(function (b) {
      b.onclick = function () {
        var f = this.getAttribute('data-evo-fundo'), i = EVO.fundos.indexOf(f);
        if (i > -1) EVO.fundos.splice(i, 1);
        else if (EVO.fundos.length >= EVO.MAX) { DR.toast('Máximo ' + EVO.MAX + ' líneas a la vez: quita un fundo primero.', 'info'); return; }
        else EVO.fundos.push(f);
        this.classList.toggle('activo', i < 0);
        this.setAttribute('aria-pressed', String(i < 0));
        if (DR.anima) anime({ targets: this, scale: [0.92, 1], duration: 320, easing: 'easeOutBack' });
        EVO.dibujar(true);
      };
    });
    EVO.dibujar(true);
  }).catch(function (e) {
    if (DR.$('#evoCuerpo')) DR.$('#evoCuerpo').innerHTML = '<div class="aviso alerta">' + DR.esc(e.message) + '</div>';
  });
};

/* ------------------------------------------------------------ gráfico SVG */
EVO.escalaY = function (max) {
  if (!(max > 0)) return { max: 10, paso: 2 };
  var bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / mag;
  var paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max * 1.05 / paso) * paso, paso: paso };
};

EVO.dibujar = function (animar) {
  var caja = DR.$('#evoGrafico');
  if (!caja) return;
  var semanas = EVO.semanas();
  var series = EVO.fundos.map(function (f) {
    return { fundo: f, color: EVO.color(f), puntos: semanas.map(function (s) { return EVO.valor(f, s.semana); }) };
  });
  EVO.tabla(semanas, series);
  if (!series.length) { caja.innerHTML = '<div class="vacio">Elige al menos un fundo para ver su evolución.</div>'; return; }

  var max = 0;
  series.forEach(function (s) { s.puntos.forEach(function (p) { if (p && p.v > max) max = p.v; }); });
  var esc = EVO.escalaY(max);
  var W = 720, H = 300, m = { t: 16, r: 56, b: 34, l: 46 };
  var aw = W - m.l - m.r, ah = H - m.t - m.b;
  var x = function (i) { return m.l + (semanas.length === 1 ? aw / 2 : aw * i / (semanas.length - 1)); };
  var y = function (v) { return m.t + ah - ah * v / esc.max; };

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="evo-svg" role="img" aria-label="' + DR.esc(EVO.tituloCampo() + ' por semana') + '">';
  for (var v = 0; v <= esc.max + 1e-9; v += esc.paso) {
    svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="evo-grid"/>' +
      '<text x="' + (m.l - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="evo-eje">' + DR.num(v, 0) + '</text>';
  }
  svg += '<text x="' + m.l + '" y="10" class="evo-eje">min</text>';
  var cada = Math.max(1, Math.ceil(semanas.length / 10));
  semanas.forEach(function (s, i) {
    if (i % cada && i !== semanas.length - 1) return;
    svg += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="evo-eje">S' + s.semana + '</text>';
  });
  svg += '<line id="evoCruz" class="evo-cruz" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ah) + '" style="opacity:0"/>';

  // Líneas: se cortan en las semanas sin muestras de ese fundo.
  series.forEach(function (s, k) {
    var d = '', antes = false;
    s.puntos.forEach(function (p, i) {
      if (!p) { antes = false; return; }
      d += (antes ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1);
      antes = true;
    });
    if (d) svg += '<path class="evo-linea' + (s.fundo === EVO.TODOS ? ' punteada' : '') + '" data-serie="' + k + '" d="' + d + '" stroke="' + s.color + '"/>';
  });
  series.forEach(function (s, k) {
    s.puntos.forEach(function (p, i) {
      if (p) svg += '<circle class="evo-punto" data-serie="' + k + '" data-i="' + i + '" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="' + s.color + '"/>';
    });
  });

  // Etiqueta directa al final de cada línea (último valor), separadas para que no se encimen.
  var finales = series.map(function (s) {
    for (var i = s.puntos.length - 1; i >= 0; i--) if (s.puntos[i]) return { s: s, i: i, y: y(s.puntos[i].v), v: s.puntos[i].v };
    return null;
  }).filter(Boolean).sort(function (a, b) { return a.y - b.y; });
  for (var j = 1; j < finales.length; j++) if (finales[j].y - finales[j - 1].y < 14) finales[j].y = finales[j - 1].y + 14;
  finales.forEach(function (f) {
    svg += '<text class="evo-final" x="' + (x(f.i) + 9).toFixed(1) + '" y="' + (f.y + 4).toFixed(1) + '"><tspan fill="' + f.s.color + '">●</tspan> ' + DR.num(f.v, 0) + '</text>';
  });

  svg += '<rect id="evoCaptura" x="' + m.l + '" y="' + m.t + '" width="' + aw + '" height="' + ah + '" fill="transparent"/></svg>';

  var leyenda = '<div class="evo-leyenda">' + series.map(function (s) {
    return '<span><i class="' + (s.fundo === EVO.TODOS ? 'punteada' : '') + '" style="--c:' + s.color + '"></i>' + DR.esc(EVO.nombre(s.fundo)) + '</span>';
  }).join('') + '</div>';
  caja.innerHTML = '<div class="evo-titulo">' + DR.esc(EVO.tituloCampo()) + ' · minutos por semana</div>' + leyenda +
    '<div class="evo-lienzo">' + svg + '<div class="evo-tip" id="evoTip" role="status"></div></div>';

  EVO.enlazarHover(semanas, series, x);
  EVO.animar(animar);
};

EVO.animar = function (animar) {
  var lineas = DR.$$('#evoGrafico .evo-linea'), puntos = DR.$$('#evoGrafico .evo-punto');
  if (!DR.anima || !animar) return;
  lineas.forEach(function (l, k) {
    var punteada = l.classList.contains('punteada');
    anime({ targets: l, strokeDashoffset: [anime.setDashoffset, 0], duration: 1100, delay: k * 140, easing: 'easeInOutQuad',
      complete: function () { l.style.strokeDasharray = punteada ? '6 5' : 'none'; } });
  });
  anime({ targets: puntos, opacity: [0, 1], r: [0, 4], duration: 420, delay: function (el) {
    return 500 + Number(el.getAttribute('data-serie')) * 140 + Number(el.getAttribute('data-i')) * 25;
  }, easing: 'easeOutBack' });
  anime({ targets: '#evoGrafico .evo-final, #evoGrafico .evo-leyenda span', opacity: [0, 1], translateX: [-6, 0], duration: 400, delay: anime.stagger(80, { start: 700 }), easing: 'easeOutQuad' });
};

/** Cruz vertical que se ajusta a la semana más cercana; el recuadro muestra todas las líneas en esa semana. */
EVO.enlazarHover = function (semanas, series, x) {
  var zona = DR.$('#evoCaptura'), svg = zona && zona.ownerSVGElement, tip = DR.$('#evoTip'), cruz = DR.$('#evoCruz');
  if (!zona) return;
  var mostrar = function (ev) {
    var r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) * (720 / r.width);
    var i = 0, mejor = Infinity;
    semanas.forEach(function (s, k) { var d = Math.abs(x(k) - vx); if (d < mejor) { mejor = d; i = k; } });
    cruz.setAttribute('x1', x(i)); cruz.setAttribute('x2', x(i)); cruz.style.opacity = 1;
    DR.$$('#evoGrafico .evo-punto').forEach(function (p) { p.classList.toggle('foco', Number(p.getAttribute('data-i')) === i); });

    tip.textContent = '';
    var cab = document.createElement('div');
    cab.className = 'evo-tip-cab';
    cab.textContent = 'Semana ' + semanas[i].semana;
    tip.appendChild(cab);
    series.map(function (s) { return { s: s, p: s.puntos[i] }; })
      .sort(function (a, b) { return (b.p ? b.p.v : -1) - (a.p ? a.p.v : -1); })
      .forEach(function (o) {
        var fila = document.createElement('div'), clave = document.createElement('i'), val = document.createElement('b'), nom = document.createElement('span');
        fila.className = 'evo-tip-fila';
        clave.style.setProperty('--c', o.s.color);
        if (o.s.fundo === EVO.TODOS) clave.className = 'punteada';
        val.textContent = o.p ? DR.num(o.p.v, 1) + ' min' : '—';
        nom.textContent = EVO.nombre(o.s.fundo) + (o.p ? ' · ' + o.p.n + ' muestra(s)' : ' · sin muestras');
        fila.appendChild(clave); fila.appendChild(val); fila.appendChild(nom);
        tip.appendChild(fila);
      });
    tip.classList.add('visible');
    var px = x(i) * r.width / 720, izq = px + 14;
    if (izq + tip.offsetWidth > r.width) izq = Math.max(0, px - tip.offsetWidth - 14);
    tip.style.left = izq + 'px';
  };
  var ocultar = function () {
    tip.classList.remove('visible');
    cruz.style.opacity = 0;
    DR.$$('#evoGrafico .evo-punto.foco').forEach(function (p) { p.classList.remove('foco'); });
  };
  zona.addEventListener('pointermove', mostrar);
  zona.addEventListener('pointerdown', mostrar);
  zona.addEventListener('pointerleave', ocultar);
};

EVO.tabla = function (semanas, series) {
  var t = DR.$('#evoTabla');
  if (!t) return;
  var cols = [{ t: 'Semana', r: function (f) { return 'S' + f.semana; } }].concat(series.map(function (s, k) {
    return { t: EVO.nombre(s.fundo), num: true, r: function (f) { var p = series[k].puntos[f._i]; return p ? DR.num(p.v, 1) : ''; } };
  }));
  t.innerHTML = UI.tabla(cols, semanas.map(function (s, i) { return { semana: s.semana, _i: i }; }).reverse());
};
