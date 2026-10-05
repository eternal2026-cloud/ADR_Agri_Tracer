/* ============================================================================
 * recordatorio-5s — Envía por correo el recordatorio HTML de auditorías 5S
 * programadas en el Gantt y anota el envío en s5_gantt_programas y bitacora.
 * Solo admin o captura activos (se valida el JWT de su sesión).
 *
 * POST { programas: number[], para: string[], cc?: string[], asunto: string, html: string }
 * POST { accion: 'estado' } → { configurado: boolean, proveedor }
 * POST { accion: 'anotar', …mismos campos } → solo registra (se envió desde Outlook/Gmail).
 *
 * Proveedor (secretos de la función en Supabase → Edge Functions → Secrets), en este orden:
 *   · Gmail: GMAIL_USER (cuenta@gmail.com) y GMAIL_APP_PASSWORD (contraseña de aplicación
 *     de 16 letras; exige verificación en dos pasos). Opcional CORREO_NOMBRE («Integra 5S»).
 *   · Microsoft 365 (Graph): MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (app con Mail.Send) y MS_REMITENTE.
 *   · Resend: RESEND_API_KEY y CORREO_REMITENTE («Integra 5S <5s@tu-dominio.com>»).
 *   · SMTP genérico (puerto 465 SSL): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y opcional CORREO_REMITENTE.
 * El correo incluido de Supabase no sirve: solo envía correos de Auth y solo al equipo del proyecto.
 * Sin secretos responde { sin_config: true } y la app ofrece copiar el correo.
 * ==========================================================================*/
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

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

const env = (k: string) => (Deno.env.get(k) || '').trim();
function proveedor(): 'graph' | 'resend' | 'gmail' | 'smtp' | null {
  if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) return 'gmail';
  if (env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('MS_REMITENTE')) return 'graph';
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) return 'smtp';
  return null;
}

const CORREO = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
function correos(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  return [...new Set(lista.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))];
}

async function enviar(para: string[], cc: string[], asunto: string, html: string, responderA: string | null) {
  const prov = proveedor();
  if (prov === 'graph') {
    const tk = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env('MS_TENANT_ID'))}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    }).then((r) => r.json()).catch(() => ({}));
    if (!tk.access_token) throw new Error('Microsoft rechazó la credencial: ' + (tk.error_description || tk.error || 'sin token'));
    const dir = (a: string) => ({ emailAddress: { address: a } });
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env('MS_REMITENTE'))}/sendMail`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tk.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: asunto, body: { contentType: 'HTML', content: html },
          toRecipients: para.map(dir), ccRecipients: cc.map(dir), replyTo: responderA ? [dir(responderA)] : [],
        },
        saveToSentItems: true,
      }),
    });
    if (r.status !== 202) throw new Error('Microsoft: ' + ((await r.text()).slice(0, 300)));
    return;
  }
  if (prov === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('CORREO_REMITENTE') || 'Integra 5S <onboarding@resend.dev>',
        to: para, cc: cc.length ? cc : undefined, subject: asunto, html,
        reply_to: responderA || undefined,
      }),
    });
    if (!r.ok) throw new Error(`Resend: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  const gmail = prov === 'gmail';
  const usuario = gmail ? env('GMAIL_USER') : env('SMTP_USER');
  const puerto = gmail ? 465 : Number(env('SMTP_PORT') || 465);
  const t = nodemailer.createTransport({
    host: gmail ? 'smtp.gmail.com' : env('SMTP_HOST'), port: puerto, secure: puerto === 465,
    auth: { user: usuario, pass: gmail ? env('GMAIL_APP_PASSWORD').replace(/\s+/g, '') : env('SMTP_PASS') },
  });
  await t.sendMail({
    from: (!gmail && env('CORREO_REMITENTE')) || `${env('CORREO_NOMBRE') || 'Integra 5S · Don Ricardo'} <${usuario}>`,
    to: para.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: asunto, html,
    replyTo: responderA || undefined,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return responder({ error: 'Tu sesión venció. Vuelve a ingresar.' }, 401);
  const { data: yo } = await sb.from('perfiles').select('id,usuario,nombre,rol,activo,correo').eq('id', u.user.id).maybeSingle();
  if (!yo || !yo.activo || !['admin', 'captura'].includes(yo.rol)) {
    return responder({ error: 'Solo administradores o auditores pueden enviar recordatorios.' }, 403);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch (_) { return responder({ error: 'Solicitud no válida.' }, 400); }

  if (b.accion === 'estado') return responder({ configurado: !!proveedor(), proveedor: proveedor() });

  const para = correos(b.para), cc = correos(b.cc);
  const malos = [...para, ...cc].filter((c) => !CORREO.test(c));
  if (!para.length) return responder({ error: 'Escribe al menos un correo destinatario.' }, 400);
  if (malos.length) return responder({ error: `Correo no válido: ${malos.join(', ')}` }, 400);
  if (para.length + cc.length > 30) return responder({ error: 'Máximo 30 destinatarios por envío.' }, 400);
  const asunto = String(b.asunto || '').trim().slice(0, 200);
  const html = String(b.html || '');
  if (!asunto) return responder({ error: 'Escribe el asunto del correo.' }, 400);
  if (!html || html.length > 200000) return responder({ error: 'El contenido del correo está vacío o es demasiado grande.' }, 400);
  const programas = (Array.isArray(b.programas) ? b.programas : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!programas.length) return responder({ error: 'Marca al menos una auditoría programada.' }, 400);

  // 'anotar': el usuario lo envió desde su propio correo (copiar y pegar); solo se registra.
  const soloAnotar = b.accion === 'anotar';
  if (!soloAnotar) {
    if (!proveedor()) {
      return responder({ error: 'El envío de correos aún no está configurado en Supabase.', sin_config: true }, 503);
    }
    try {
      await enviar(para, cc, asunto, html, yo.correo && CORREO.test(yo.correo) ? yo.correo : null);
    } catch (e) {
      return responder({ error: `No se pudo enviar el correo. ${(e as Error).message}` }, 502);
    }
  }

  const destino = [...para, ...cc].join(', ').slice(0, 500);
  const { data: progs } = await sb.from('s5_gantt_programas').select('id,recordatorios').in('id', programas);
  for (const p of progs || []) {
    await sb.from('s5_gantt_programas')
      .update({ recordatorios: (p.recordatorios || 0) + 1, ultimo_recordatorio: new Date().toISOString(), ultimo_destino: destino })
      .eq('id', p.id);
  }
  await sb.from('bitacora').insert({
    usuario_id: yo.id, modulo: 'AUDITORIA_5S', accion: soloAnotar ? 'Gantt: recordatorio enviado desde correo propio' : 'Gantt: recordatorio enviado',
    detalle: `${asunto} → ${destino} (${programas.length} programada(s))`,
  });
  return responder({ ok: true, enviados: para.length + cc.length });
});
