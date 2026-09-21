/* ============================================================================
 * supabase-cliente.js — CONEXIÓN A SUPABASE, SESIÓN Y HELPERS DE RPC
 * Namespace AT ("Integra"). Requiere vendor/supabase.min.js cargado antes.
 * ==========================================================================*/

var SB_URL = 'https://ptsvriudoilsyofgccsb.supabase.co';
var SB_KEY = 'sb_publishable_KHQw7vcXdXtF5RTGpPiviA_ACKnslLS';
var SB_DOMINIO_INTERNO = '@agritracer.interno'; // dominio técnico: los usuarios no tienen correo real

var sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

var AT = { perfil: null };

/** Misma normalización que la Edge Function admin-usuarios (sin tildes, espacios → punto). */
AT.usuarioAEmail = function (usuario) {
  return String(usuario || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, '.') + SB_DOMINIO_INTERNO;
};

/** Login: mismo mensaje genérico exista o no el usuario (Supabase ya lo garantiza). */
AT.login = function (usuario, password) {
  return sb.auth.signInWithPassword({ email: AT.usuarioAEmail(usuario), password: password })
    .then(function (r) {
      if (r.error) throw new Error(/banned/i.test(r.error.message) ? 'Este usuario está desactivado. Contacta al administrador.' : 'Usuario o contraseña incorrectos.');
      return AT.cargarPerfil();
    });
};

AT.logout = function () {
  return sb.auth.signOut().then(function () { AT.perfil = null; });
};

AT.cargarPerfil = function () {
  return sb.auth.getUser().then(function (r) {
    if (r.error || !r.data.user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
    return sb.from('perfiles').select('*').eq('id', r.data.user.id).single();
  }).then(function (r) {
    if (r.error || !r.data) throw new Error('No se encontró el perfil de este usuario.');
    if (!r.data.activo) throw new Error('Este usuario está desactivado. Contacta al administrador.');
    AT.perfil = r.data;
    return r.data;
  });
};

/** Para cualquier página al cargar: si hay sesión válida trae el perfil, si no devuelve null (sin lanzar). */
AT.sesionInicial = function () {
  return sb.auth.getSession().then(function (r) {
    if (!r.data.session) return null;
    return AT.cargarPerfil().catch(function () { return null; });
  });
};

/** Redirige a `destino` si no hay sesión válida; si la hay, resuelve con el perfil. */
AT.requiereSesion = function (destino) {
  return AT.sesionInicial().then(function (perfil) {
    if (!perfil) { location.href = destino || '/'; return Promise.reject(new Error('Sin sesión')); }
    return perfil;
  });
};

AT.esAdmin = function () { return !!(AT.perfil && AT.perfil.rol === 'admin'); };
AT.puedeCapturar = function () { return !!(AT.perfil && (AT.perfil.rol === 'admin' || AT.perfil.rol === 'captura')); };

/** Llama una función Postgres (fn_/rpc_) vía PostgREST; lanza Error con mensaje legible. */
AT.rpc = function (nombre, args) {
  return sb.rpc(nombre, args || {}).then(function (r) {
    if (r.error) throw new Error(r.error.message || 'Error de servidor.');
    return r.data;
  });
};

AT.tabla = function (nombre) { return sb.from(nombre); };

/** Token JWT de la sesión actual, para llamar a las Edge Functions. */
AT.tokenAcceso = function () {
  return sb.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : null; });
};

/** Llama a una Edge Function de Supabase (admin-usuarios, sync-sheets) con la sesión del usuario. */
AT.llamarFuncion = function (nombre, body) {
  return AT.tokenAcceso().then(function (token) {
    if (!token) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
    return fetch(SB_URL + '/functions/v1/' + nombre, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SB_KEY },
      body: JSON.stringify(body || {})
    });
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok || j.ok === false) throw new Error(j.error || 'Error de servidor (' + r.status + ').');
      return j;
    });
  });
};
