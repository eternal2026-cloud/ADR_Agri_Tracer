/* ============================================================================
 * admin-usuarios — Alta y edición de usuarios (solo un admin activo).
 * Los usuarios ingresan con su correo corporativo y un PIN que envía el Bot Don
 * Ricardo (sin contraseña). Solo la cuenta «admin» mantiene usuario y contraseña.
 * La clave secreta de Supabase ya viene incluida en las Edge Functions.
 *
 * POST { accion: 'crear', correo, nombre, area, rol }   → alta + correo de bienvenida
 * POST { accion: 'bienvenida', id }                      → reenvía el correo de acceso
 * POST { accion: 'prueba_correo', correo? }              → correo de prueba con un PIN ficticio
 * POST { accion: 'reset', id }                           → nueva clave (solo cuentas con contraseña)
 * POST { accion: 'actualizar', id, rol?, activo?, nombre?, area? }
 * ==========================================================================*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  claveSecreta, dominioPermitido, enviarCorreo, leerAjustes, normalizarCorreo, plantillaBienvenida, plantillaPin,
} from '../_shared/correo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'captura', 'visor'];
const NOMBRE_ROL: Record<string, string> = { admin: 'Administrador', captura: 'Captura en campo', visor: 'Solo consulta' };

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

type Perfil = { id: string; usuario: string; nombre: string; rol: string; activo: boolean; correo?: string | null };

const anotar = (sb: SupabaseClient, yo: Perfil, accion: string, detalle: string) =>
  sb.from('bitacora').insert({ usuario_id: yo.id, modulo: 'USUARIOS', accion, detalle });

/** Envía la bienvenida; si el correo falla el alta igual queda hecha y se devuelve el motivo. */
async function bienvenida(sb: SupabaseClient, p: { nombre: string; correo: string; rol: string }): Promise<string> {
  try {
    const ajustes = await leerAjustes(sb);
    const { asunto, html } = plantillaBienvenida({ nombre: p.nombre, correo: p.correo, rol: NOMBRE_ROL[p.rol] || p.rol, appUrl: ajustes.appUrl });
    await enviarCorreo(ajustes, p.correo, asunto, html);
    return '';
  } catch (e) {
    return (e as Error).message || String(e);
  }
}

async function crear(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const ajustes = await leerAjustes(sb);
  const correo = normalizarCorreo(b.correo);
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(correo)) return responder({ error: 'Escribe un correo válido.' }, 400);
  if (!dominioPermitido(correo, ajustes.dominios)) {
    return responder({ error: 'Solo se aceptan correos corporativos (' + ajustes.dominios.map((d) => '@' + d).join(', ') + ').' }, 400);
  }
  const nombre = String(b.nombre || '').trim();
  if (!nombre) return responder({ error: 'Escribe el nombre de la persona.' }, 400);
  const rol = ROLES.includes(String(b.rol)) ? String(b.rol) : 'visor';

  const { data: existe } = await sb.from('perfiles').select('id').eq('correo', correo).maybeSingle();
  if (existe) return responder({ error: `El correo ${correo} ya tiene acceso.` }, 409);

  // Sin contraseña: la cuenta solo entra con el PIN que llega al correo.
  const { data: nuevo, error } = await sb.auth.admin.createUser({ email: correo, email_confirm: true, user_metadata: { nombre } });
  if (error || !nuevo.user) {
    const msg = error ? error.message : 'No se pudo crear la cuenta.';
    return responder({ error: /already|registered|exists/i.test(msg) ? `El correo ${correo} ya está registrado.` : msg }, 400);
  }
  const { error: insErr } = await sb.from('perfiles').insert({
    id: nuevo.user.id, usuario: correo, correo, nombre, area: String(b.area || '').trim(), rol, activo: true, debe_cambiar_password: false,
  });
  if (insErr) {
    await sb.auth.admin.deleteUser(nuevo.user.id).catch(() => {});
    return responder({ error: insErr.message }, 400);
  }
  await anotar(sb, yo, 'Usuario creado', `${correo} (${rol})`);
  const errorCorreo = await bienvenida(sb, { nombre, correo, rol });
  return responder({ ok: true, correo, nombre, rol, correo_enviado: !errorCorreo, error_correo: errorCorreo });
}

async function reenviar(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const { data: p } = await sb.from('perfiles').select('id,nombre,rol,correo,activo').eq('id', String(b.id || '')).maybeSingle();
  if (!p || !p.correo) return responder({ error: 'Ese usuario no ingresa por correo.' }, 400);
  if (!p.activo) return responder({ error: 'Reactiva al usuario antes de reenviarle el acceso.' }, 400);
  const errorCorreo = await bienvenida(sb, { nombre: p.nombre, correo: p.correo, rol: p.rol });
  if (errorCorreo) return responder({ error: errorCorreo }, 502);
  await anotar(sb, yo, 'Acceso reenviado', p.correo);
  return responder({ ok: true, correo: p.correo });
}

async function prueba(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const ajustes = await leerAjustes(sb);
  const correo = normalizarCorreo(b.correo) || ajustes.remitente;
  if (!dominioPermitido(correo, ajustes.dominios)) return responder({ error: 'El correo de prueba debe ser corporativo.' }, 400);
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const { asunto, html } = plantillaPin({ nombre: yo.nombre.split(/\s+/)[0], pin, minutos: 10, appUrl: ajustes.appUrl });
  try {
    await enviarCorreo(ajustes, correo, '[Prueba] ' + asunto, html);
  } catch (e) {
    return responder({ error: (e as Error).message }, 502);
  }
  await anotar(sb, yo, 'Correo de prueba', correo);
  return responder({ ok: true, correo, remitente: ajustes.remitente });
}

async function reset(sb: SupabaseClient, yo: Perfil, b: Record<string, unknown>) {
  const id = String(b.id || '');
  const { data: p } = await sb.from('perfiles').select('id,usuario,nombre,rol,correo').eq('id', id).maybeSingle();
  if (!p) return responder({ error: 'Usuario no encontrado.' }, 404);
  if (p.correo) return responder({ error: 'Este usuario ingresa con PIN por correo: no tiene contraseña.' }, 400);
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
    const { data: yo } = await sb.from('perfiles').select('id,usuario,nombre,rol,activo,correo').eq('id', u.user.id).maybeSingle();
    if (!yo || !yo.activo || yo.rol !== 'admin') return responder({ error: 'Solo un administrador puede gestionar usuarios.' }, 403);

    const b = await req.json().catch(() => ({}));
    if (b.accion === 'crear') return await crear(sb, yo as Perfil, b);
    if (b.accion === 'bienvenida') return await reenviar(sb, yo as Perfil, b);
    if (b.accion === 'prueba_correo') return await prueba(sb, yo as Perfil, b);
    if (b.accion === 'reset') return await reset(sb, yo as Perfil, b);
    if (b.accion === 'actualizar') return await actualizar(sb, yo as Perfil, b);
    return responder({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return responder({ error: (e && (e as Error).message) || 'Error de servidor.' }, 500);
  }
});
