/* ============================================================================
 * correo.ts — Bot Don Ricardo · Gestión de Procesos
 * Plantillas HTML (colores oficiales Don Ricardo, firma del bot) y envío por
 * Microsoft Graph (OAuth de aplicación: el SMTP con usuario y contraseña de
 * Microsoft 365 se desactiva por defecto desde fines de 2026).
 *
 * Secretos de la Edge Function (Supabase → Edge Functions → Secrets):
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  (app de Entra ID con Mail.Send)
 * Parámetros (tabla parametros): CORREO_REMITENTE, CORREO_NOMBRE_BOT,
 *   CORREO_DOMINIOS, APP_URL.
 * Las imágenes van incrustadas (Content-ID), así que no dependen de una URL pública.
 * ==========================================================================*/
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { BCORP, LOGO_DR } from './imagenes.ts';

export const COLORES = {
  azul: '#0097CE', naranja: '#EF7C3B', verde: '#76B729', marron: '#5D4835', marronOscuro: '#3B2F25',
  crema: '#F7F3EE', borde: '#E6DED4', texto: '#3B2F25', gris: '#8A7B6E',
};

export type AjustesCorreo = { remitente: string; nombreBot: string; dominios: string[]; appUrl: string };

export function claveSecreta(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (k) return k;
  } catch (_) { /* sin claves nuevas: usar la legacy */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

export async function leerAjustes(sb: SupabaseClient): Promise<AjustesCorreo> {
  const { data } = await sb.from('parametros').select('clave,valor')
    .in('clave', ['CORREO_REMITENTE', 'CORREO_NOMBRE_BOT', 'CORREO_DOMINIOS', 'APP_URL']);
  const p: Record<string, string> = {};
  (data || []).forEach((r: { clave: string; valor: string }) => { p[r.clave] = (r.valor || '').trim(); });
  return {
    remitente: p.CORREO_REMITENTE || Deno.env.get('MS_REMITENTE') || '',
    nombreBot: p.CORREO_NOMBRE_BOT || 'Bot Don Ricardo · Gestión de Procesos',
    dominios: (p.CORREO_DOMINIOS || 'adr.com.pe').toLowerCase().split(/[,;\s]+/).filter(Boolean),
    appUrl: (p.APP_URL || '').replace(/\/+$/, ''),
  };
}

export function normalizarCorreo(s: unknown): string {
  return String(s || '').trim().toLowerCase();
}

export function dominioPermitido(correo: string, dominios: string[]): boolean {
  const m = normalizarCorreo(correo).match(/^[^@\s]+@([^@\s]+)$/);
  return !!m && dominios.includes(m[1]);
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------ plantillas */
/** Firma del bot, con la misma composición que la firma corporativa. */
export function firmaHtml(): string {
  const c = COLORES;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${c.borde};margin-top:28px">
    <tr>
      <td width="120" valign="middle" style="padding:20px 16px 4px 0">
        <img src="cid:logo-dr" width="120" alt="Don Ricardo" style="display:block;width:120px;height:auto;border:0">
      </td>
      <td valign="middle" style="padding:20px 10px 4px 10px;font-family:Roboto,'Segoe UI',Arial,sans-serif;color:${c.marron}">
        <div style="font-size:17px;font-weight:700;line-height:1.3">Bot Don Ricardo</div>
        <div style="font-size:13px;letter-spacing:.04em;line-height:1.4">GESTIÓN DE PROCESOS</div>
        <div style="font-size:12.5px;line-height:1.45;margin-top:8px">Caserío Santa Rosa A-77<br>San José de Los Molinos, Ica - Perú</div>
        <div style="font-size:13px;margin-top:6px"><a href="https://donricardo.com" style="color:${c.verde};text-decoration:none">Donricardo.com</a></div>
      </td>
      <td width="60" valign="middle" align="right" style="padding:20px 0 4px 10px">
        <img src="cid:bcorp" width="60" alt="Empresa B Certificada" style="display:block;width:60px;height:auto;border:0">
      </td>
    </tr>
  </table>`;
}

/** Estructura común: franja con los tres colores del isotipo, tarjeta blanca y firma. */
export function envolver(opc: { titulo: string; preheader: string; cuerpo: string }): string {
  const c = COLORES;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(opc.titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.crema}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opc.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${c.crema}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid ${c.borde};border-radius:14px;overflow:hidden">
      <tr>
        <td height="6" style="background:${c.azul};font-size:0;line-height:0" width="34%">&nbsp;</td>
        <td height="6" style="background:${c.naranja};font-size:0;line-height:0" width="33%">&nbsp;</td>
        <td height="6" style="background:${c.verde};font-size:0;line-height:0" width="33%">&nbsp;</td>
      </tr>
      <tr><td colspan="3" style="padding:26px 32px 30px 32px;font-family:Roboto,'Segoe UI',Arial,sans-serif;color:${c.texto}">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${c.gris}">AgriTracer · Ingeniería de Procesos</div>
        <h1 style="margin:6px 0 18px 0;font-size:24px;line-height:1.25;color:${c.marron};font-weight:700">${esc(opc.titulo)}</h1>
        ${opc.cuerpo}
        ${firmaHtml()}
      </td></tr>
    </table>
    <div style="max-width:560px;margin-top:14px;font-family:Roboto,'Segoe UI',Arial,sans-serif;font-size:11.5px;line-height:1.5;color:${c.gris}">
      Mensaje automático del Bot Don Ricardo. No respondas a este correo.
    </div>
  </td></tr>
</table></body></html>`;
}

/** Correo con el PIN de ingreso. */
export function plantillaPin(opc: { nombre?: string; pin: string; minutos: number; appUrl?: string }): { asunto: string; html: string } {
  const c = COLORES;
  const digitos = opc.pin.split('').map((d) =>
    `<td style="padding:0 3px"><div style="width:44px;height:56px;line-height:56px;text-align:center;font-size:30px;font-weight:700;color:${c.marronOscuro};background:${c.crema};border:1px solid ${c.borde};border-bottom:3px solid ${c.verde};border-radius:10px;font-family:Consolas,'Courier New',monospace">${esc(d)}</div></td>`).join('');
  const cuerpo = `
    <p style="margin:0 0 14px 0;font-size:15.5px;line-height:1.55">Hola${opc.nombre ? ' <b>' + esc(opc.nombre) + '</b>' : ''},</p>
    <p style="margin:0 0 20px 0;font-size:15.5px;line-height:1.55">Usa este PIN para ingresar a <b>AgriTracer · Don Ricardo</b>:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px auto"><tr>${digitos}</tr></table>
    <p style="margin:0 0 8px 0;font-size:14px;line-height:1.55;text-align:center;color:${c.gris}">Vence en <b style="color:${c.naranja}">${opc.minutos} minutos</b> y sirve una sola vez.</p>
    ${opc.appUrl ? `<p style="margin:18px 0 0 0;text-align:center"><a href="${esc(opc.appUrl)}" style="display:inline-block;background:${c.verde};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px">Abrir AgriTracer</a></p>` : ''}
    <div style="margin-top:22px;padding:12px 14px;border-left:3px solid ${c.azul};background:#EEF7FB;border-radius:8px;font-size:13px;line-height:1.5;color:${c.texto}">
      Si no intentaste ingresar, ignora este correo: sin el PIN nadie puede entrar con tu cuenta. Nunca compartas este código.
    </div>`;
  return {
    asunto: `${opc.pin} es tu PIN de AgriTracer`,
    html: envolver({ titulo: 'Tu PIN de ingreso', preheader: `PIN ${opc.pin} · vence en ${opc.minutos} minutos`, cuerpo }),
  };
}

/** Correo de bienvenida cuando un administrador da acceso. */
export function plantillaBienvenida(opc: { nombre: string; correo: string; rol: string; appUrl?: string }): { asunto: string; html: string } {
  const c = COLORES;
  const pasos = [
    `Abre ${opc.appUrl ? `<a href="${esc(opc.appUrl)}" style="color:${c.azul}">AgriTracer</a>` : 'AgriTracer'} y escribe tu correo corporativo <b>${esc(opc.correo)}</b>.`,
    'Te llegará un correo del Bot Don Ricardo con un PIN de 6 dígitos.',
    'Escribe el PIN y listo: no necesitas contraseña.',
  ].map((t, i) => `<tr><td valign="top" style="padding:0 12px 12px 0"><div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:${[c.azul, c.naranja, c.verde][i]};color:#FFFFFF;text-align:center;font-weight:700;font-size:14px">${i + 1}</div></td><td valign="top" style="padding:4px 0 12px 0;font-size:15px;line-height:1.5">${t}</td></tr>`).join('');
  const cuerpo = `
    <p style="margin:0 0 14px 0;font-size:15.5px;line-height:1.55">Hola <b>${esc(opc.nombre)}</b>,</p>
    <p style="margin:0 0 18px 0;font-size:15.5px;line-height:1.55">Ya tienes acceso a <b>AgriTracer · Don Ricardo</b> como <b>${esc(opc.rol)}</b>. Para ingresar:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">${pasos}</table>
    ${opc.appUrl ? `<p style="margin:12px 0 0 0"><a href="${esc(opc.appUrl)}" style="display:inline-block;background:${c.verde};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px">Ingresar a AgriTracer</a></p>` : ''}`;
  return { asunto: 'Tu acceso a AgriTracer · Don Ricardo', html: envolver({ titulo: 'Bienvenido a AgriTracer', preheader: 'Ingresa con tu correo corporativo y un PIN', cuerpo }) };
}

/* ------------------------------------------------------------ Microsoft Graph */
let tokenCache: { valor: string; vence: number } | null = null;

async function tokenGraph(): Promise<string> {
  if (tokenCache && tokenCache.vence > Date.now() + 60000) return tokenCache.valor;
  const tenant = Deno.env.get('MS_TENANT_ID'), cliente = Deno.env.get('MS_CLIENT_ID'), secreto = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenant || !cliente || !secreto) {
    throw new Error('Falta configurar el envío de correo (MS_TENANT_ID, MS_CLIENT_ID y MS_CLIENT_SECRET en los secretos de Supabase).');
  }
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cliente, client_secret: secreto, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Microsoft rechazó la credencial del bot: ' + (j.error_description || j.error || 'HTTP ' + r.status));
  tokenCache = { valor: j.access_token, vence: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
  return tokenCache.valor;
}

/** Envía un correo HTML desde el buzón del bot, con el logo y el sello B incrustados. */
export async function enviarCorreo(ajustes: AjustesCorreo, para: string, asunto: string, html: string): Promise<void> {
  if (!ajustes.remitente) throw new Error('Falta el parámetro CORREO_REMITENTE (buzón desde el que envía el bot).');
  const token = await tokenGraph();
  const adjunto = (id: string, nombre: string, base64: string) => ({
    '@odata.type': '#microsoft.graph.fileAttachment', name: nombre, contentType: 'image/png',
    contentBytes: base64, contentId: id, isInline: true,
  });
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ajustes.remitente)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: asunto,
        body: { contentType: 'HTML', content: html },
        from: { emailAddress: { address: ajustes.remitente, name: ajustes.nombreBot } },
        toRecipients: [{ emailAddress: { address: para } }],
        attachments: [adjunto('logo-dr', 'don-ricardo.png', LOGO_DR), adjunto('bcorp', 'empresa-b.png', BCORP)],
      },
      saveToSentItems: false,
    }),
  });
  if (r.status !== 202) {
    const j = await r.json().catch(() => ({}));
    throw new Error('Microsoft no envió el correo: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
  }
}
