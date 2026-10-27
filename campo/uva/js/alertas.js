/* ============================================================================
 * alertas.js — AVISOS CUANDO UNA ETAPA O UNA ESPERA SUPERA SU META
 * (el traslado a planta usa el estándar fundo → planta del JSON de permisos, si lo trae)
 * · En la APK: notificaciones locales programadas (@capacitor/local-notifications).
 *   Al iniciar una etapa se programa el aviso para «inicio + meta»; al terminarla se
 *   cancela y se programa el de espera de las etapas que habilita («fin + meta de
 *   espera»). Suenan aunque la app esté en segundo plano o la pantalla apagada.
 * · Con la app abierta (también en PC): revisión cada 30 s con vibración y aviso.
 * ==========================================================================*/

var ALERTAS = { vistos: {} };

ALERTAS.plugin = function () { return DR.nativo ? DR.plugin('LocalNotifications') : null; };

/** ID numérico estable por registro + etapa (+10 para el aviso de espera). */
ALERTAS.idNum = function (regId, i, espera) {
  var h = 0;
  for (var k = 0; k < regId.length; k++) h = (h * 31 + regId.charCodeAt(k)) % 50000000;
  return h * 20 + (espera ? 10 : 0) + i;
};

ALERTAS.permiso = function () {
  var P = ALERTAS.plugin();
  if (!P || !TC.cfg.alertas) return;
  P.checkPermissions().then(function (s) { if (s.display !== 'granted') return P.requestPermissions(); }).catch(function () {});
};

/** Avisos pendientes de un registro: [{i, espera, at, titulo, texto}]. */
ALERTAS.calcular = function (r) {
  var l = [], m = TC.cfg.metas;
  if (r.estado === 'cerrado') return l;
  TC.ETAPAS.forEach(function (e, i) {
    var x = r.etapas[e.id], meta = TC.metaEtapa(r, e), pf = TC.finPrevio(r, e);
    if (x.ini && !x.fin && meta)
      l.push({ i: i, espera: false, at: new Date(new Date(x.ini).getTime() + meta * 60000), titulo: e.nombre + ' supera la meta',
        texto: TC.titulo(r) + ': ' + e.nombre + ' lleva más de ' + meta + ' min.' });
    if (!x.ini && pf && !e.sinEspera && Number(m.espera))
      l.push({ i: i, espera: true, at: new Date(new Date(pf).getTime() + Number(m.espera) * 60000), titulo: 'Espera larga antes de ' + e.nombre,
        texto: TC.titulo(r) + ': esperando ' + e.nombre + ' más de ' + m.espera + ' min.' });
  });
  return l;
};

/** Reprograma las notificaciones de un registro (llamar tras cada cambio de horas). */
ALERTAS.sync = function (r) {
  var P = ALERTAS.plugin();
  if (!P) return;
  var todos = [];
  TC.ETAPAS.forEach(function (e, i) { todos.push({ id: ALERTAS.idNum(r.id, i, false) }, { id: ALERTAS.idNum(r.id, i, true) }); });
  P.cancel({ notifications: todos }).catch(function () {}).then(function () {
    if (!TC.cfg.alertas) return;
    var ahora = Date.now();
    var nuevos = ALERTAS.calcular(r).filter(function (a) { return a.at.getTime() > ahora; }).map(function (a) {
      return { id: ALERTAS.idNum(r.id, a.i, a.espera), title: a.titulo, body: a.texto, schedule: { at: a.at, allowWhileIdle: true }, extra: { id: r.id } };
    });
    if (nuevos.length) return P.schedule({ notifications: nuevos });
  }).catch(function () {});
};

/** Revisión con la app abierta: vibra y avisa una sola vez por etapa vencida. */
ALERTAS.revisar = function () {
  if (!TC.cfg.alertas) return;
  var ahora = Date.now();
  TC.registros().forEach(function (r) {
    if (!TC.enProceso(r)) return;
    ALERTAS.calcular(r).forEach(function (a) {
      var k = r.id + '|' + a.i + '|' + a.espera + '|' + a.at.getTime();
      if (a.at.getTime() <= ahora && !ALERTAS.vistos[k]) {
        ALERTAS.vistos[k] = 1;
        DR.vibrar([200, 120, 200]);
        DR.toast('⚠ ' + a.texto, 'error');
      }
    });
  });
};

/** Al tocar una notificación se abre ese registro. */
ALERTAS.iniciar = function () {
  var P = ALERTAS.plugin();
  if (P) {
    ALERTAS.permiso();
    P.addListener('localNotificationActionPerformed', function (ev) {
      var id = ev && ev.notification && ev.notification.extra && ev.notification.extra.id;
      if (id && TC.obtener(id)) REG.abrir(id);
    });
    TC.registros().forEach(function (r) { if (TC.enProceso(r)) ALERTAS.sync(r); });
  }
  // Lo ya vencido al abrir la app no se repite como aviso.
  var ahora = Date.now();
  TC.registros().forEach(function (r) {
    if (TC.enProceso(r)) ALERTAS.calcular(r).forEach(function (a) { if (a.at.getTime() <= ahora) ALERTAS.vistos[r.id + '|' + a.i + '|' + a.espera + '|' + a.at.getTime()] = 1; });
  });
  setInterval(ALERTAS.revisar, 30000);
};
