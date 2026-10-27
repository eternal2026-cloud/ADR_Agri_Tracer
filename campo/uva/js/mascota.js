/* ============================================================================
 * mascota.js — «UVI», LA UVA DE ADR (versión tiempo de ciclo)
 * Misma Uvi de Inspectores / Supervisores de Calidad, ahora con cronómetro en la
 * mano y cinta azul Integra. SVG puro: funciona sin señal.
 * ==========================================================================*/

var MASCOTA = {};

MASCOTA.svg = function (clase) {
  var atras = [[50, 84], [150, 84], [72, 58], [128, 58], [100, 50], [40, 130], [160, 130], [60, 176], [140, 176], [100, 196]];
  var uvas = atras.map(function (p) {
    return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="25" fill="url(#uvGrad)"/>' +
      '<ellipse cx="' + (p[0] - 8) + '" cy="' + (p[1] - 9) + '" rx="6" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 ' + (p[0] - 8) + ' ' + (p[1] - 9) + ')"/>';
  }).join('');
  return '<svg class="uvi ' + (clase || '') + '" viewBox="0 0 215 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Uvi, la uva de ADR">' +
    '<defs>' +
      '<radialGradient id="uvGrad" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#B56CD0"/><stop offset=".55" stop-color="#7A3E8E"/><stop offset="1" stop-color="#4A2157"/></radialGradient>' +
      '<radialGradient id="uvCuerpo" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#C47EDC"/><stop offset=".5" stop-color="#8A4BA0"/><stop offset="1" stop-color="#55255F"/></radialGradient>' +
    '</defs>' +
    '<path d="M100 40 C100 26 104 16 112 8" stroke="#6B4A2B" stroke-width="6" stroke-linecap="round" fill="none"/>' +
    '<path d="M106 18 C120 0 150 2 160 14 C146 30 120 32 106 18 Z" fill="#76B729"/><path d="M110 18 C126 14 140 14 154 14" stroke="#4E8A1A" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    uvas +
    // brazo izquierdo y mano
    '<path d="M50 150 C34 156 26 168 28 180" stroke="#55255F" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<circle cx="28" cy="184" r="8" fill="#fff" stroke="#55255F" stroke-width="3"/>' +
    // brazo derecho levantado con cronómetro
    '<g class="brazo-d"><path d="M158 140 C174 130 182 120 186 106" stroke="#55255F" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<rect x="180" y="52" width="10" height="7" rx="2" fill="#0A4F7A"/>' +
      '<circle cx="185" cy="80" r="21" fill="#fff" stroke="#0B6FA4" stroke-width="5"/>' +
      '<path d="M185 64 v3 M201 80 h-3 M185 96 v-3 M169 80 h3" stroke="#0A4F7A" stroke-width="2.4" stroke-linecap="round"/>' +
      '<g class="aguja"><path d="M185 80 L185 66" stroke="#EF7C3B" stroke-width="3" stroke-linecap="round"/></g>' +
      '<circle cx="185" cy="80" r="2.8" fill="#0A4F7A"/>' +
      '<circle cx="186" cy="104" r="8" fill="#fff" stroke="#55255F" stroke-width="3"/></g>' +
    // cuerpo
    '<circle cx="100" cy="128" r="62" fill="url(#uvCuerpo)"/>' +
    '<ellipse cx="74" cy="92" rx="16" ry="9" fill="#fff" opacity=".35" transform="rotate(-32 74 92)"/>' +
    '<ellipse cx="82" cy="196" rx="13" ry="7" fill="#3A1542"/><ellipse cx="118" cy="196" rx="13" ry="7" fill="#3A1542"/>' +
    '<g class="parpado"><ellipse cx="80" cy="118" rx="11" ry="13" fill="#fff"/><ellipse cx="120" cy="118" rx="11" ry="13" fill="#fff"/>' +
      '<circle cx="82" cy="121" r="6.5" fill="#1E0A24"/><circle cx="122" cy="121" r="6.5" fill="#1E0A24"/>' +
      '<circle cx="84.5" cy="118" r="2.3" fill="#fff"/><circle cx="124.5" cy="118" r="2.3" fill="#fff"/></g>' +
    '<path d="M70 100 q10 -6 19 -1 M111 99 q9 -5 19 1" stroke="#3A1542" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="66" cy="141" rx="9" ry="5.5" fill="#FF9DB0" opacity=".7"/><ellipse cx="134" cy="141" rx="9" ry="5.5" fill="#FF9DB0" opacity=".7"/>' +
    '<path d="M84 142 Q100 162 116 142 Z" fill="#3A1542"/><path d="M92 151 Q100 158 108 151 Q100 147 92 151 Z" fill="#FF7A93"/>' +
    // cinta azul Integra
    '<path d="M54 166 Q100 186 146 166 L142 178 Q100 196 58 178 Z" fill="#0B6FA4"/>' +
    '<text x="100" y="183" text-anchor="middle" font-family="Jost,Segoe UI,sans-serif" font-weight="700" font-size="12" fill="#fff" letter-spacing="2">ADR</text>' +
  '</svg>';
};

MASCOTA.FRASES = [
  '¡Hola! Soy <b>Uvi</b>. Te ayudo a medir el <b>tiempo de ciclo</b> de la uva: del lote a la planta.',
  'Toca <b>Iniciar</b> justo cuando empieza la etapa y <b>Terminar</b> cuando acaba. Yo llevo el cronómetro.',
  'Si te olvidaste de marcar, corrige la hora a mano: el ciclo se recalcula solo.',
  'El tiempo entre etapas también cuenta: lo verás como <b>espera</b>.',
  'Todo queda en el equipo. <b>No necesitas internet</b> para registrar.',
  'Cuando vuelva la señal, subo tus registros solita a Integra.',
  'La etapa más lenta es el <b>cuello de botella</b>: ahí está la mejora.',
  'Anota la <b>causa de demora</b> en cada etapa: así sabremos qué atacar primero.'
];
MASCOTA._i = 0;
MASCOTA.siguienteFrase = function () { MASCOTA._i = (MASCOTA._i + 1) % MASCOTA.FRASES.length; return MASCOTA.FRASES[MASCOTA._i]; };

MASCOTA.saltar = function (el) {
  DR.vibrar(12);
  if (!DR.anima || !el) return;
  anime.remove(el);
  anime({ targets: el, translateY: [0, -16, 0], rotate: [0, -6, 4, 0], duration: 700, easing: 'easeOutQuad' });
};
