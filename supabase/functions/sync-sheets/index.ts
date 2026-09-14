/* ============================================================================
 * sync-sheets — Espejo de auditoría: Supabase → Google Sheets.
 * La invoca pg_cron (header x-sync-token, ver migración 0007) o un admin desde
 * Configuración → Google Sheets (JWT de su sesión). Sobrescribe solo sus
 * pestañas: Ciclos_BD, Resumen_Semanal, Personal_Reubicacion,
 * Auditoria_Escaneos y Sync_Info; cualquier otra pestaña de la hoja se respeta.
 * La clave de la cuenta de servicio vive en Vault, nunca en el código.
 * ==========================================================================*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
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

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ------------------------------------------------------------ formato de celdas */
const FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const fechaHora = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : FMT.format(d);
};
const num = (v: unknown, dec = 2) => (v === null || v === undefined || v === '') ? '' : Math.round(Number(v) * 10 ** dec) / 10 ** dec;
const txt = (v: unknown) => (v === null || v === undefined) ? '' : String(v);

type Fila = Record<string, any>;
type Col = [string, (f: Fila) => unknown];
const TS = (k: string, t: string): Col => [t, (f) => fechaHora(f[k])];
const TX = (k: string, t: string): Col => [t, (f) => txt(f[k])];
const NU = (k: string, t: string, d = 2): Col => [t, (f) => num(f[k], d)];

const TRAMOS: [string, string][] = [
  ['t_cosecha', 'Cosecha'], ['t_espera_jabero', 'Espera Jabero'], ['t_jabero', 'Jabero'],
  ['t_estadia_cs', 'Estadía C. Sombra'], ['t_carga_moto', 'Carga Motocarga'], ['t_espera_traslado', 'Espera Traslado a C.A.'],
  ['t_traslado_ca', 'Traslado a C.A.'], ['t_espera_descarga', 'Espera Descarga/Armado'], ['t_descarga_ca', 'Descarga y Armado'],
  ['t_estadia_ca', 'Estadía en C.A.'], ['t_carga_camion', 'Carga al Camión'], ['t_espera_traslado_planta', 'Espera Traslado a Planta'],
  ['t_traslado_planta', 'Traslado a Planta'],
];

const tabla = (cols: Col[], filas: Fila[]) => [cols.map((c) => c[0]), ...filas.map((f) => cols.map((c) => c[1](f)))];

/* ------------------------------------------------------------ Google */
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenGoogle(sa: { client_email: string; private_key: string }): Promise<string> {
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const cuerpo = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  })));
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, enc.encode(cab + '.' + cuerpo)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cab + '.' + cuerpo + '.' + b64url(firma) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Google rechazó la credencial: ' + (j.error_description || j.error || ('HTTP ' + r.status)));
  return j.access_token;
}

function extraerIdHoja(valor: string): string {
  const v = String(valor || '').trim();
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : v;
}

async function gapi(token: string, saEmail: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
    if (r.status === 403 || r.status === 404) {
      throw new Error(`Google Sheets (${r.status}): ${msg}. Verifica que el enlace sea correcto y que la hoja esté compartida como Editor con ${saEmail}.`);
    }
    throw new Error('Google Sheets: ' + msg);
  }
  return j;
}

type Pestana = { titulo: string; valores: unknown[][] };

async function escribirHoja(token: string, saEmail: string, id: string, pestanas: Pestana[]): Promise<string> {
  const meta = await gapi(token, saEmail, 'GET', `${id}?fields=properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`);
  const props = new Map<string, any>((meta.sheets || []).map((s: any) => [s.properties.title, s.properties]));

  const faltan = pestanas.filter((p) => !props.has(p.titulo));
  if (faltan.length) {
    const r = await gapi(token, saEmail, 'POST', `${id}:batchUpdate`, {
      requests: faltan.map((p) => ({ addSheet: { properties: { title: p.titulo } } })),
    });
    (r.replies || []).forEach((rep: any) => props.set(rep.addSheet.properties.title, rep.addSheet.properties));
  }

  // Asegura tamaño de grilla (nunca la achica: no rompe gráficos del usuario), fija y resalta encabezado.
  const requests: unknown[] = [];
  for (const p of pestanas) {
    const pr = props.get(p.titulo);
    const cols = p.valores.reduce((m, v) => Math.max(m, v.length), 1);
    const gp = pr.gridProperties || {};
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: pr.sheetId, gridProperties: { rowCount: Math.max(gp.rowCount || 0, p.valores.length + 1), columnCount: Math.max(gp.columnCount || 0, cols), frozenRowCount: 1 } },
        fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: pr.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.36, green: 0.28, blue: 0.21 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    });
  }
  await gapi(token, saEmail, 'POST', `${id}:batchUpdate`, { requests });
  await gapi(token, saEmail, 'POST', `${id}/values:batchClear`, { ranges: pestanas.map((p) => `'${p.titulo}'`) });
  await gapi(token, saEmail, 'POST', `${id}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: pestanas.map((p) => ({ range: `'${p.titulo}'!A1`, values: p.valores })),
  });
  return (meta.properties && meta.properties.title) || id;
}

/* ------------------------------------------------------------ Supabase */
async function leerTodo(sb: SupabaseClient, nombre: string, orden: [string, boolean][], maximo = 50000): Promise<Fila[]> {
  const filas: Fila[] = [];
  const paso = 1000;
  for (let desde = 0; desde < maximo; desde += paso) {
    let q = sb.from(nombre).select('*').range(desde, desde + paso - 1);
    for (const [c, asc] of orden) q = q.order(c, { ascending: asc });
    const { data, error } = await q;
    if (error) throw new Error(nombre + ': ' + error.message);
    filas.push(...(data || []));
    if (!data || data.length < paso) break;
  }
  return filas;
}

async function rpc(sb: SupabaseClient, nombre: string, args?: Record<string, unknown>) {
  const { data, error } = await sb.rpc(nombre, args || {});
  if (error) throw new Error(nombre + ': ' + error.message);
  return data;
}

const fijarParametro = (sb: SupabaseClient, clave: string, valor: string) =>
  sb.from('parametros').update({ valor, actualizado_en: new Date().toISOString() }).eq('clave', clave);

/* ------------------------------------------------------------ handler */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);

  const inicio = Date.now();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), { auth: { persistSession: false, autoRefreshToken: false } });

  // --- Autorización: token interno de pg_cron o sesión de un admin activo.
  let origen = 'automática';
  let usuarioId: string | null = null;
  const tokenSync = req.headers.get('x-sync-token');
  if (tokenSync) {
    const esperado = await rpc(sb, 'fn_secreto_sync', { p_nombre: 'sync_sheets_token' }).catch(() => null);
    if (!esperado || !iguales(String(esperado), tokenSync)) return responder({ error: 'No autorizado.' }, 401);
  } else {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return responder({ error: 'No autorizado.' }, 401);
    const { data: u, error } = await sb.auth.getUser(jwt);
    if (error || !u || !u.user) return responder({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);
    const { data: p } = await sb.from('perfiles').select('rol,activo,usuario').eq('id', u.user.id).maybeSingle();
    if (!p || !p.activo || p.rol !== 'admin') return responder({ error: 'Solo un administrador puede sincronizar.' }, 403);
    origen = 'manual (' + p.usuario + ')';
    usuarioId = u.user.id;
    await fijarParametro(sb, 'ULTIMO_INTENTO_SYNC_SHEETS', new Date().toISOString());
  }

  let paso = 'credencial';
  let saEmail = '';
  try {
    const saTexto = await rpc(sb, 'fn_secreto_sync', { p_nombre: 'google_service_account' });
    if (!saTexto) throw new Error('No hay credencial de Google cargada (Configuración → Google Sheets).');
    const sa = JSON.parse(String(saTexto));
    saEmail = sa.client_email;
    const token = await tokenGoogle(sa);

    paso = 'hoja';
    const { data: prm } = await sb.from('parametros').select('clave,valor');
    const parametros: Record<string, string> = {};
    (prm || []).forEach((r: Fila) => { parametros[r.clave] = r.valor; });
    const hojaId = extraerIdHoja(parametros.SHEETS_ID);
    if (!hojaId) {
      throw new Error(`La credencial funciona, pero falta el enlace de la Google Sheet destino. Créala, compártela como Editor con ${saEmail} y pega su enlace en Configuración → Google Sheets.`);
    }

    paso = 'datos';
    const [perfiles, ciclos, personal, escaneos, semanas, general] = await Promise.all([
      leerTodo(sb, 'perfiles', [['creado_en', true]]),
      leerTodo(sb, 'ciclos_cosecha', [['fecha', true], ['codigo', true]]),
      leerTodo(sb, 'reub_personal', [['linea', true], ['nombre', true]]),
      leerTodo(sb, 'reub_escaneos', [['ocurrido_en', false]]),
      rpc(sb, 'fn_semanas_disponibles'),
      rpc(sb, 'fn_resumen_general'),
    ]);
    const usuarios = new Map<string, string>(perfiles.map((p) => [p.id, p.usuario]));
    const quien = (id: unknown) => usuarios.get(String(id)) || '';

    const resumen: Fila[] = [];
    for (const s of (semanas || []) as number[]) {
      const filas = (await rpc(sb, 'fn_resumen_semana', { p_semana: s })) as Fila[];
      (filas || []).forEach((f) => resumen.push({ ...f, _semana: s }));
    }
    ((general || []) as Fila[]).forEach((f) => resumen.push({ ...f, _semana: 'General' }));

    const colsCiclos: Col[] = [
      TX('fecha', 'Fecha'), NU('semana', 'Semana', 0), TX('codigo', 'Código'), TX('fundo', 'Fundo'), TX('lote', 'Lote'),
      TX('lider', 'Líder de grupo'), TX('presentacion', 'Presentación'), TX('variedad', 'Variedad'), TX('calibre', 'Calibre'),
      TS('inicio_cosecha', 'Inicio cosecha'), TS('fin_cosecha', 'Fin cosecha'),
      TS('inicio_jabero', 'Inicio jabero'), TS('fin_jabero', 'Fin jabero'), NU('num_jabas', 'N° jabas', 0), TX('obs_jaba', 'Obs. jaba'),
      TX('placa', 'Placa motocarga'), TS('hora_llegada_moto', 'Llegada motocarga'), TS('inicio_carga_moto', 'Inicio carga moto'), TS('fin_carga_moto', 'Fin carga moto'),
      TS('inicio_traslado_ca', 'Inicio traslado C.A.'), TS('fin_traslado_ca', 'Fin traslado C.A.'),
      NU('num_jabas_2', 'N° jabas (2)', 0), TX('obs_jabas_2', 'Obs. jabas (2)'),
      TS('inicio_descarga_ca', 'Inicio descarga C.A.'), TS('fin_descarga_ca', 'Fin descarga C.A.'),
      NU('num_pallets', 'N° pallets', 0), TX('presentaciones', 'Presentaciones'), TX('placa_camion', 'Placa camión'),
      TS('inicio_carga_camion', 'Inicio carga camión'), TS('fin_carga_camion', 'Fin carga camión'),
      TS('inicio_traslado_planta', 'Inicio traslado planta'), TS('fin_traslado_planta', 'Fin traslado planta'),
      TX('obs_cs', 'Obs. Casa Sombra'), TX('tareadora', 'Tareadora'), TX('obs_ca', 'Obs. C. Acopio'),
      ...TRAMOS.map(([k, t]) => NU(k, 'T. ' + t + ' (min)')),
      NU('t_ciclo_total', 'T. ciclo total (min)'),
      ['Horas', (f) => (f.t_ciclo_total === null || f.t_ciclo_total === undefined) ? '' : num(Number(f.t_ciclo_total) / 60)],
      ['Estado', (f) => f.cerrado ? 'Cerrado' : 'En curso'],
      ['Registrado por', (f) => quien(f.creado_por)], TS('creado_en', 'Creado'), TS('actualizado_en', 'Actualizado'),
    ];
    const colsResumen: Col[] = [
      ['Semana', (f) => f._semana], TX('fundo', 'Fundo'), NU('n_muestras', 'N° muestras', 0),
      ...TRAMOS.map(([k, t]) => NU(k, t + ' (min)')), NU('t_ciclo_total', 'Total ciclo (min)'), NU('tiempo_horas', 'Horas'),
    ];
    const colsPersonal: Col[] = [
      TX('dni', 'DNI'), TX('nombre', 'Nombre'), TX('linea', 'Línea'), TX('lado', 'Lado'), TX('labor', 'Labor'), TX('obs', 'Observación'),
      ['Activo', (f) => f.activo ? 'Sí' : 'No'], ['Actualizado por', (f) => quien(f.actualizado_por)], TS('actualizado_en', 'Actualizado'),
    ];
    const colsEscaneos: Col[] = [
      TS('ocurrido_en', 'Fecha y hora'), TX('dni_leido', 'DNI leído'), ['Encontrado', (f) => f.encontrado ? 'Sí' : 'No'],
      TX('nombre', 'Nombre'), TX('linea', 'Línea'), TX('lado', 'Lado'), TX('labor', 'Labor'), TX('origen', 'Origen'),
      TX('dispositivo_id', 'Dispositivo'), ['Usuario', (f) => quien(f.perfil_id)], TX('texto_crudo', 'Texto leído'),
    ];

    const ahora = new Date().toISOString();
    const pestanas: Pestana[] = [
      { titulo: 'Ciclos_BD', valores: tabla(colsCiclos, ciclos) },
      { titulo: 'Resumen_Semanal', valores: tabla(colsResumen, resumen) },
      { titulo: 'Personal_Reubicacion', valores: tabla(colsPersonal, personal) },
      { titulo: 'Auditoria_Escaneos', valores: tabla(colsEscaneos, escaneos) },
      { titulo: 'Sync_Info', valores: [
        ['Dato', 'Valor'],
        ['Última sincronización (hora Lima)', fechaHora(ahora)],
        ['Origen', origen],
        ['Ciclos', ciclos.length], ['Filas de resumen', resumen.length],
        ['Personal', personal.length], ['Escaneos', escaneos.length],
        ['Umbral de tiempo de ciclo (min)', txt(parametros.UMBRAL_TIEMPO_CICLO_MIN)],
        ['Nota', 'Estas pestañas se sobrescriben en cada sincronización. Crea tus gráficos o tablas dinámicas en otras pestañas.'],
      ] },
    ];

    paso = 'escritura';
    const tituloHoja = await escribirHoja(token, saEmail, hojaId, pestanas);

    const filas = { ciclos: ciclos.length, resumen: resumen.length, personal: personal.length, escaneos: escaneos.length };
    await fijarParametro(sb, 'ULTIMA_SYNC_SHEETS', ahora);
    await fijarParametro(sb, 'ULTIMO_ERROR_SYNC_SHEETS', '');
    await sb.from('bitacora').insert({ usuario_id: usuarioId, modulo: 'SHEETS', accion: 'Sincronización OK', detalle: `${origen} · ${JSON.stringify(filas)}` });
    return responder({ ok: true, hoja: tituloHoja, filas, origen, duracion_ms: Date.now() - inicio });
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    await fijarParametro(sb, 'ULTIMO_ERROR_SYNC_SHEETS', `${fechaHora(new Date().toISOString())} · ${msg}`);
    await sb.from('bitacora').insert({ usuario_id: usuarioId, modulo: 'SHEETS', accion: 'Error de sincronización', detalle: `${origen} · paso ${paso} · ${msg}`.slice(0, 900) });
    return responder({ ok: false, paso, credencial: paso === 'credencial' ? 'error' : 'ok', sa_email: saEmail, error: msg }, paso === 'credencial' ? 500 : 400);
  }
});
