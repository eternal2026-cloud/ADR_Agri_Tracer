/* ============================================================================
 * admin-usuarios — Alta, restablecimiento de clave y edición de usuarios.
 * Reemplaza a api/admin-*.js de Vercel: la clave secreta de Supabase ya viene
 * incluida en las Edge Functions, así que no hay variables que configurar.
 * Solo un admin activo puede llamarla (se valida el JWT de su sesión).
 *
 * POST { accion: 'crear', usuario, nombre, area, rol, password? }
 * POST { accion: 'reset', id }
 * POST { accion: 'actualizar', id, rol?, activo?, nombre?, area? }
 * ==========================================================================*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

function claveSecreta(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (k) return k;
  } catch (_) { /* sin claves nuevas: usar la legacy */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const DOMINIO = '@agritracer.interno';
const ROLES = ['admin', 'captura', 'visor'];

/** Misma normalización que AT.usuarioAEmail en el cliente. */
function normalizarUsuario(s: unknown): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '.');
}

/** Clave temporal fácil de dictar: 4 letras + 4 dígitos sin caracteres ambiguos (ej. KMPT-4829). */
function claveTemporal(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ', digitos = '23456789';
  const r = crypto.getRandomValues(new Uint32Array(8));
  let s = '';
  for (let i = 0; i < 4; i++) s += letras[r[i] % letras.length];
  s += '-';
  for (let i = 4; i < 8; i++) s += digitos[r[i] % digitos.length];
  return s;
}

type Perfil = { id: string; usuario: string; nombre: string; rol: string; activo: boolean };

const anotar = (sb: SupabaseClient, yo: Perfil, accion: string, detalle: string) =>
  sb.from('bitacora').insert({ usuario_id: yo.id, modulo: 'USUARIOS', accion, detalle });

async function crear(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const usuario = normalizarUsuario(b.usuario);
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    return responder({ error: 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto o guion (sin espacios ni tildes).' }, 400);
  }
  const nombre = String(b.nombre || '').trim();
  if (!nombre) return responder({ error: 'Escribe el nombre de la persona.' }, 400);
  const rol = ROLES.includes(String(b.rol)) ? String(b.rol) : 'visor';
  const propia = String(b.password || '');
  if (propia && propia.length < 6) return responder({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
  const password = propia || claveTemporal();

  const { data: existe } = await sb.from('perfiles').select('id').eq('usuario', usuario).maybeSingle();
  if (existe) return responder({ error: `El usuario "${usuario}" ya existe. Elige otro nombre de usuario.` }, 409);

  const { data: nuevo, error } = await sb.auth.admin.createUser({
    email: usuario + DOMINIO, password, email_confirm: true, user_metadata: { usuario, nombre },
  });
  if (error || !nuevo.user) {
    const msg = error ? error.message : 'No se pudo crear la cuenta.';
    return responder({ error: /already|registered|exists/i.test(msg) ? `El usuario "${usuario}" ya existe.` : msg }, 400);
  }

  const { error: insErr } = await sb.from('perfiles').insert({
    id: nuevo.user.id, usuario, nombre, area: String(b.area || '').trim(), rol, activo: true, debe_cambiar_password: true,
  });
  if (insErr) {
    await sb.auth.admin.deleteUser(nuevo.user.id).catch(() => {});
    return responder({ error: insErr.message }, 400);
  }
  await anotar(sb, yo, 'Usuario creado', `${usuario} (${rol})`);
  return responder({ ok: true, usuario, nombre, rol, password });
}

async function reset(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const id = String(b.id || '');
  const { data: p } = await sb.from('perfiles').select('id,usuario,nombre,rol').eq('id', id).maybeSingle();
  if (!p) return responder({ error: 'Usuario no encontrado.' }, 404);
  const password = claveTemporal();
  const { error } = await sb.auth.admin.updateUserById(id, { password });
  if (error) return responder({ error: error.message }, 400);
  await sb.from('perfiles').update({ debe_cambiar_password: true }).eq('id', id);
  await anotar(sb, yo, 'Clave restablecida', p.usuario);
  return responder({ ok: true, usuario: p.usuario, nombre: p.nombre, rol: p.rol, password });
}

async function actualizar(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const id = String(b.id || '');
  const { data: p } = await sb.from('perfiles').select('*').eq('id', id).maybeSingle();
  if (!p) return responder({ error: 'Usuario no encontrado.' }, 404);

  const cambios: Record<string, unknown> = {};
  if (b.rol !== undefined) {
    if (!ROLES.includes(String(b.rol))) return responder({ error: 'Rol no válido.' }, 400);
    cambios.rol = String(b.rol);
  }
  if (b.activo !== undefined) cambios.activo = !!b.activo;
  if (b.nombre !== undefined) cambios.nombre = String(b.nombre).trim() || p.nombre;
  if (b.area !== undefined) cambios.area = String(b.area).trim();
  if (id === yo.id && (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin'))) {
    return responder({ error: 'No puedes quitarte a ti mismo el acceso de administrador.' }, 400);
  }

  // Desactivar también bloquea el inicio de sesión (no solo la fila de perfil).
  if ('activo' in cambios && cambios.activo !== p.activo) {
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: cambios.activo ? 'none' : '876000h' });
    if (error) return responder({ error: error.message }, 400);
  }
  const { data, error } = await sb.from('perfiles').update(cambios).eq('id', id).select().single();
  if (error) return responder({ error: error.message }, 400);
  await anotar(sb, yo, 'Usuario actualizado', `${p.usuario} · ${JSON.stringify(cambios)}`);
  return responder({ ok: true, perfil: data });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), { auth: { persistSession: false, autoRefreshToken: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return responder({ error: 'Falta la sesión. Vuelve a iniciar sesión.' }, 401);
    const { data: u, error: uErr } = await sb.auth.getUser(jwt);
    if (uErr || !u || !u.user) return responder({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);
    const { data: yo } = await sb.from('perfiles').select('id,usuario,nombre,rol,activo').eq('id', u.user.id).maybeSingle();
    if (!yo || !yo.activo || yo.rol !== 'admin') return responder({ error: 'Solo un administrador puede gestionar usuarios.' }, 403);

    const b = await req.json().catch(() => ({}));
    if (b.accion === 'crear') return await crear(sb, yo as Perfil, b);
    if (b.accion === 'reset') return await reset(sb, yo as Perfil, b);
    if (b.accion === 'actualizar') return await actualizar(sb, yo as Perfil, b);
    return responder({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return responder({ error: (e && (e as Error).message) || 'Error de servidor.' }, 500);
  }
});
