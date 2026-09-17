/* ============================================================================
 * correo-bot — «Send Email Hook» de Supabase Auth.
 * Cuando alguien pide un PIN (signInWithOtp), Supabase llama a esta función en
 * lugar de enviar su correo genérico: aquí se arma el correo con el diseño Don
 * Ricardo y lo envía el Bot Don Ricardo · Gestión de Procesos por Microsoft Graph.
 * Se despliega con --no-verify-jwt: la autenticidad se valida con la firma del
 * hook (secreto SEND_EMAIL_HOOK_SECRET, formato «v1,whsec_…»).
 * Solo envía a correos de los dominios de CORREO_DOMINIOS.
 * ==========================================================================*/
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { claveSecreta, dominioPermitido, enviarCorreo, leerAjustes, normalizarCorreo, plantillaPin } from '../_shared/correo.ts';

const MINUTOS_PIN = Number(Deno.env.get('PIN_MINUTOS') || 10);

const error = (http_code: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code, message } }), { status: http_code, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return error(405, 'Método no permitido.');
  const cuerpo = await req.text();
  const secreto = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') || '').replace(/^v1,whsec_/, '');
  if (!secreto) return error(500, 'El hook de correo no tiene secreto configurado.');

  let datos: { user: { email: string; user_metadata?: Record<string, unknown> }; email_data: { token: string; email_action_type: string } };
  try {
    datos = new Webhook(secreto).verify(cuerpo, Object.fromEntries(req.headers)) as typeof datos;
  } catch (_) {
    return error(401, 'Firma del hook inválida.');
  }

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), { auth: { persistSession: false, autoRefreshToken: false } });
    const ajustes = await leerAjustes(sb);
    const correo = normalizarCorreo(datos.user.email);
    if (!dominioPermitido(correo, ajustes.dominios)) {
      return error(403, 'Solo se permiten correos corporativos (' + ajustes.dominios.map((d) => '@' + d).join(', ') + ').');
    }
    const { data: perfil } = await sb.from('perfiles').select('nombre,activo').eq('correo', correo).maybeSingle();
    if (!perfil || !perfil.activo) return error(403, 'Este correo no tiene acceso activo. Pídelo al administrador.');

    const pin = String(datos.email_data.token || '');
    if (!/^\d{6,10}$/.test(pin)) return error(400, 'Tipo de correo no soportado: ' + datos.email_data.email_action_type);

    const nombre = String(perfil.nombre || '').split(/\s+/)[0];
    const { asunto, html } = plantillaPin({ nombre, pin, minutos: MINUTOS_PIN, appUrl: ajustes.appUrl });
    await enviarCorreo(ajustes, correo, asunto, html);
    await sb.from('bitacora').insert({ usuario_txt: correo, modulo: 'ACCESO', accion: 'PIN enviado', detalle: datos.email_data.email_action_type });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return error(500, (e as Error).message || 'No se pudo enviar el PIN.');
  }
});
