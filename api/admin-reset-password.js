/* ============================================================================
 * api/admin-reset-password.js — Función serverless de Vercel (Node).
 * Restablece la contraseña de un usuario existente (service_role, solo servidor).
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

    const id = (req.body || {}).id;
    if (!id) return res.status(400).json({ error: 'Falta el id del usuario.' });

    const clave = passwordTemporal();
    const sbAdmin = createClient(supabaseUrl, serviceKey);
    const { error: updErr } = await sbAdmin.auth.admin.updateUserById(id, { password: clave });
    if (updErr) return res.status(400).json({ error: updErr.message });
    await sbAdmin.from('perfiles').update({ debe_cambiar_password: true }).eq('id', id);

    return res.status(200).json({ ok: true, passwordTemporal: clave });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'Error de servidor.' });
  }
};
