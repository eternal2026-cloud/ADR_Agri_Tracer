/* ============================================================================
 * faq.js — PREGUNTAS FRECUENTES CON UVI (estilo Supervisores / Inspectores de Calidad)
 * Todo el contenido va dentro de la app: se consulta sin señal.
 * ==========================================================================*/

var FAQ = { cat: 'todas', texto: '' };

FAQ.CATS = [['todas', 'Todas'], ['uso', 'Uso de la app'], ['etapas', 'Etapas del ciclo'], ['calc', 'Cálculos y metas'], ['sheets', 'Integra y APK']];

FAQ.LISTA = [
  /* ---------- uso ---------- */
  { c: 'uso', p: '¿La app funciona sin internet?',
    r: '<p>Sí. Todo se guarda en el equipo: puedes registrar, usar el cronómetro y consultar estas preguntas sin señal.</p><p>Internet solo se usa para subir a Integra, y la app lo hace sola cuando vuelve la señal.</p>' },
  { c: 'uso', p: '¿Cómo elijo fundo y lote?',
    r: '<p>Elige el <b>fundo</b> (los fundos y lotes vienen del catálogo de Integra). La zona no se elige: sale sola del fundo y viaja a la BD. Al escribir o elegir el <b>lote</b>, la app completa sola el fundo, la <b>variedad</b> y el <b>color</b> desde el catálogo.</p><p>Si el lote no está en el catálogo se guarda igual, con un aviso; el administrador puede actualizar el catálogo en <b>Config → Catálogo de lotes</b>.</p>' },
  { c: 'uso', p: '¿Puedo seguir varios pallets a la vez?',
    r: '<p>Sí. Cada <b>Nuevo pallet</b> es un registro aparte. En <b>Inicio → En curso</b> ves todos los pallets abiertos con su etapa actual y cronómetro; toca uno para seguir registrándolo.</p>' },
  { c: 'uso', p: '¿Se pierde lo que llené si salgo de la app?',
    r: '<p>No. Cada cambio se guarda como <b>borrador</b>. El cronómetro sigue corriendo aunque cierres la app: se calcula con la hora de inicio guardada.</p>' },
  { c: 'uso', p: '¿Puedo corregir un registro ya cerrado?',
    r: '<p>Sí. En <b>Registros</b> tócalo y elige <b>Editar registro</b>. Vuelve a borrador; al cerrarlo de nuevo se actualiza en Integra <b>sin duplicarse</b>.</p>' },
  { c: 'uso', p: '¿Qué significan Borrador, Por subir y Sincronizado?',
    r: '<ul><li><b>Borrador:</b> aún no lo cierras.</li><li><b>Por subir:</b> cerrado, esperando señal.</li><li><b>Sincronizado:</b> ya está en Integra.</li><li><b>Error al subir:</b> Integra lo rechazó (por ejemplo, sin acceso o fuera de horario); se reintenta en la próxima subida.</li></ul>' },
  { c: 'uso', p: '¿Puedo sacar los datos sin Google Sheets?',
    r: '<p>Sí. En <b>Registros → Exportar CSV (BD)</b> se descarga un archivo que abre en Excel con <b>las mismas columnas de la hoja BD</b> de «T. de ciclo - Uva 26-27» (respeta los filtros). Con <b>Sólo resumen</b> ves los promedios por fundo y lote.</p>' },

  /* ---------- etapas ---------- */
  { c: 'etapas', p: '¿Qué mide cada etapa?',
    r: '<ol><li><b>Cosecha</b> de la pasada (con el código de pallet).</li><li><b>Traslado de jaba a pallet.</b></li><li><b>Armado de pallet</b> (N° de jabas, obligatorio). Cosecha, traslado de jaba y armado se toman en paralelo.</li><li><b>Lecturado</b>: se habilita después del armado.</li><li><b>Enzunchado</b> (N° de zunchos, obligatorio).</li><li><b>Portabin</b> (N° total de pallets y de pallets cargados, obligatorios).</li><li><b>Carga</b> (placa).</li><li><b>Traslado a planta</b> (planta destino).</li></ol>' },
  { c: 'etapas', p: '¿Por qué una etapa aparece bloqueada?',
    r: '<p>Sin <b>código de pallet</b> no se pasa de la etapa Cosecha. Cosecha, traslado de jaba y armado se pueden tomar a la vez. Desde ahí cada etapa se habilita cuando termina la anterior: <b>Lecturado y todo lo que sigue se habilita después del armado de pallet</b>.</p><p>Al marcar el fin de una etapa la app se queda en ella; tú eliges a cuál pasar.</p>' },
  { c: 'etapas', p: '¿Cómo uso Iniciar y Terminar?',
    r: '<p>Toca <b>Iniciar</b> en el momento exacto en que empieza la etapa y <b>Terminar</b> cuando acaba. Se guarda la hora del celular: no hay que escribirla.</p>' },
  { c: 'etapas', p: 'Me olvidé de marcar a tiempo, ¿qué hago?',
    r: '<p>Escribe la hora correcta en <b>Inicio</b> o <b>Fin</b>. La hora queda marcada como <b>editado</b>. Si una hora queda muy atrás de la anterior (ej. 00:20 después de 23:50) la app entiende que es el <b>día siguiente</b>.</p><p>Desde el lecturado, si una etapa empieza antes de que termine la anterior, la app lo marca en rojo: corrige la hora o explica el motivo en el <b>comentario</b> de la etapa.</p>' },
  { c: 'etapas', p: '¿Para qué es el comentario y la causa de demora?',
    r: '<p>Cada etapa tiene su <b>comentario</b> y una <b>causa de demora</b> (falta de camión, de portabin, de personal…). Con las causas el dashboard arma el <b>Pareto de demoras</b> para saber qué atacar primero.</p>' },
  { c: 'etapas', p: '¿Por qué vibra o me llega una notificación?',
    r: '<p>Cuando una etapa supera su meta o un pallet espera más de lo permitido entre etapas, el celular avisa (aunque la app esté en segundo plano). Se activa o desactiva en <b>Config → Metas</b>.</p>' },

  /* ---------- cálculos ---------- */
  { c: 'calc', p: '¿Cómo se calcula el tiempo de ciclo?',
    r: '<p>Igual que el tiempo de ciclo de arándano de Integra y que la hoja BD:</p><ul><li><b>Tiempo de etapa</b> = fin − inicio.</li><li><b>Espera</b> = inicio de la etapa − fin de la etapa anterior.</li><li><b>Ciclo total</b> = fin del traslado a planta − inicio de cosecha (solo con las 8 etapas completas).</li><li><b>Conformación de carga</b> = esperas y tiempos de lecturado, enzunchado, portabin y carga + espera del traslado.</li><li><b>Semana</b> = NÚM.DE.SEMANA de Excel.</li></ul>' },
  { c: 'calc', p: '¿Qué es una espera?',
    r: '<p>Es el tiempo entre el fin de una etapa y el inicio de la siguiente (pallet detenido). Aparece en gris en las barras. En uva, la mayor parte del tiempo perdido suele estar en las esperas.</p>' },
  { c: 'calc', p: '¿Qué es un ciclo atípico?',
    r: '<p>Un ciclo de más de 480 min (8 h), igual que en Integra. Se guarda, pero no entra en los promedios para no distorsionarlos.</p>' },
  { c: 'calc', p: '¿De dónde salen las metas?',
    r: '<p>Se configuran en <b>Config → Metas</b>: una por etapa, la espera máxima entre etapas, la conformación de carga y el ciclo total. Las que vienen cargadas son <b>referenciales</b>: ajústalas a las oficiales.</p><p>El traslado a planta usa el <b>estándar de cada fundo a cada planta</b> que trae el archivo de permisos; si lo supera, el celular avisa.</p>' },

  /* ---------- Integra y la APK ---------- */
  { c: 'sheets', p: '¿En qué se diferencia de la APK?',
    r: '<p>Es la <b>misma toma de tiempos</b> (8 etapas, mismas metas y cálculos), pensada para los <b>iPhone</b> y la web. Se entra con tu usuario de Integra, no hay que vincular nada.</p><p>Las dos son válidas y siguen funcionando: la APK sigue subiendo a su Google Sheet y además Integra recibe sus registros.</p>' },
  { c: 'sheets', p: '¿Quién marca la llegada del camión: campo o planta?',
    r: '<p><b>Cualquiera de los dos.</b> El fin de la etapa 8 (Traslado a planta) es la llegada del camión y vale la <b>primera</b> marca. Si la marcó planta, aquí se completa sola (dice «marcada en planta») apenas haya señal.</p><p>Si alguno la corrige a mano, vale la corrección.</p>' },
  { c: 'sheets', p: '¿Se duplican o chocan los datos con la APK?',
    r: '<p>No. Cada pallet tiene un <b>ID único</b>: <b>UV-IN-…</b> los de Integra y <b>UV-EQ-…</b> los de la APK. Si se reenvía, se reemplaza el mismo registro, nunca se duplica.</p>' },
  { c: 'sheets', p: '¿Qué pasa con la placa del camión?',
    r: '<p>Con la placa (etapa Carga), <b>Planta</b> puede encontrar el pallet ese mismo día y continuarlo: llegada del camión, recepción, descarga y abastecimiento a líneas. Así queda la trazabilidad completa (ámbito <b>Ciclo completo</b>).</p>' },
  { c: 'sheets', p: '¿Dónde se ven los datos?',
    r: '<p>En la Google Sheet de Integra, pestañas <b>UVA_Registros</b> y <b>UVA_Etapas</b> (misma estructura de la hoja de la APK, con la columna <b>Ámbito</b>: Campo, Ciclo completo o Planta).</p>' }
];

VISTAS.ayuda = function (cont) {
  cont.innerHTML = '<div class="vista">' +
    '<div class="enc entra"><div class="eti">Ayuda</div><h1>Preguntas frecuentes</h1><p>Toca una pregunta para ver la respuesta.</p></div>' +
    '<div class="faq-cab entra"><div class="flota" id="uviFaq">' + MASCOTA.svg() + '</div><div class="globo" id="globoUvi">' + MASCOTA.FRASES[0] + '</div></div>' +
    '<div class="buscador entra">' + DR.ICO.lupa + '<input type="search" id="faqBuscar" placeholder="Buscar: espera, meta, clave…" value="' + DR.esc(FAQ.texto) + '"></div>' +
    '<div class="cats entra" id="faqCats">' + FAQ.CATS.map(function (c) {
      return '<button type="button" class="opcion' + (FAQ.cat === c[0] ? ' activa' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div><div id="faqLista" class="entra"></div></div>';

  var pintar = function () {
    var q = DR.sinTildes(FAQ.texto.trim());
    var l = FAQ.LISTA.filter(function (x) {
      if (FAQ.cat !== 'todas' && x.c !== FAQ.cat) return false;
      return !q || DR.sinTildes(x.p + ' ' + x.r.replace(/<[^>]+>/g, '')).indexOf(q) > -1;
    });
    DR.$('#faqLista').innerHTML = l.length ? l.map(function (x) {
      return '<div class="pregunta"><button type="button"><span class="q">?</span><span>' + DR.esc(x.p) + '</span>' + DR.ICO.chevron + '</button>' +
        '<div class="respuesta">' + x.r + '</div></div>';
    }).join('') : '<div class="vacio">No encontré esa pregunta. Prueba con otra palabra.</div>';
    DR.$$('#faqLista .pregunta>button').forEach(function (b) {
      b.onclick = function () {
        var p = b.parentNode, abrir = !p.classList.contains('abierta');
        DR.$$('#faqLista .pregunta.abierta').forEach(function (x) { x.classList.remove('abierta'); });
        p.classList.toggle('abierta', abrir);
        DR.vibrar(8);
        if (abrir && DR.anima) anime({ targets: p.querySelector('.respuesta'), opacity: [0, 1], translateY: [-6, 0], duration: 300, easing: 'easeOutQuad' });
      };
    });
  };
  pintar();
  DR.$('#faqBuscar').oninput = function () { FAQ.texto = this.value; pintar(); };
  DR.$$('#faqCats .opcion').forEach(function (b) {
    b.onclick = function () {
      FAQ.cat = b.getAttribute('data-cat');
      DR.$$('#faqCats .opcion').forEach(function (x) { x.classList.toggle('activa', x === b); });
      pintar();
    };
  });
  DR.$('#uviFaq').onclick = function () {
    MASCOTA.saltar(DR.$('#uviFaq svg'));
    var g = DR.$('#globoUvi');
    g.innerHTML = MASCOTA.siguienteFrase();
    if (DR.anima) anime({ targets: g, scale: [0.94, 1], opacity: [0.4, 1], duration: 380, easing: 'easeOutBack' });
  };
  DR.entrarPaneles('#contenido');
};
