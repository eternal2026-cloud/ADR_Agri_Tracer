/* ============================================================================
 * api/admin-crear-usuario.js — Función serverless de Vercel (Node).
 * Usa la service_role key (SOLO en servidor, nunca en el cliente) para crear
 * la cuenta en Supabase Auth + su fila en perfiles. Verifica que quien llama
 * ya sea admin antes de hacer nada.
 * ==========================================================================*/
const { createClient } = require('@supabase/supabase-js');

function passwordTemporal() {
  return Math.random().toString(36).slice(-4).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Falta el token de sesión.' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) return res.status(500).json({ error: 'Variables de entorno de Supabase no configuradas en Vercel.' });

    const sbUsuario = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: userData, error: userErr } = await sbUsuario.auth.getUser();
    if (userErr || !userData.user) return res.status(401).json({ error: 'Sesión no válida.' });

    const { data: perfil, error: perfilErr } = await sbUsuario.from('perfiles').select('rol').eq('id', userData.user.id).single();
    if (perfilErr || !perfil || perfil.rol !== 'admin') return res.status(403).json({ error: 'No autorizado: se requiere rol de administrador.' });

    const body = req.body || {};
    const usuario = String(body.usuario || '').trim().toLowerCase();
    if (!usuario) return res.status(400).json({ error: 'El usuario es obligatorio.' });

    const email = usuario.replace(/\s+/g, '.') + '@agritracer.interno';
    const clave = passwordTemporal();

    const sbAdmin = createClient(supabaseUrl, serviceKey);
    const { data: nuevo, error: crearErr } = await sbAdmin.auth.admin.createUser({ email, password: clave, email_confirm: true });
    if (crearErr) return res.status(400).json({ error: crearErr.message });

    const rol = body.rol === 'admin' ? 'admin' : (body.rol === 'captura' ? 'captura' : 'visor');
    const { error: insertErr } = await sbAdmin.from('perfiles').insert({
      id: nuevo.user.id, usuario: usuario, nombre: body.nombre || usuario, area: body.area || '',
      rol: rol, activo: true, debe_cambiar_password: true
    });
    if (insertErr) {
      await sbAdmin.auth.admin.deleteUser(nuevo.user.id).catch(function () {});
      return res.status(400).json({ error: insertErr.message });
    }

    return res.status(200).json({ ok: true, passwordTemporal: clave });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'Error de servidor.' });
  }
};
