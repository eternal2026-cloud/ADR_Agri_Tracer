/* ============================================================================
 * sync-sheets — Espejo de auditoría: Supabase → Google Sheets.
 * La invoca pg_cron (header x-sync-token, ver migración 0007) o un admin desde
 * Configuración → Google Sheets (JWT de su sesión). Sobrescribe solo sus
 * pestañas: Ciclos_BD, Resumen_Semanal, Personal_Reubicacion,
 * Auditoria_Escaneos, 5S_BD, 5S_Observaciones, 5S_Resumen, PM_Revisiones,
 * PM_Hallazgos, PM_Resultados, SCI_BD, SCI_Resultados y Sync_Info;
 * cualquier otra pestaña de la hoja se respeta.
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

/** formulas: la pestaña se escribe con USER_ENTERED (miniaturas =IMAGE); altoFila y anchos en píxeles. */
type Pestana = { titulo: string; valores: unknown[][]; formulas?: boolean; altoFila?: number; anchos?: [number, number][] };

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
    if (p.altoFila && p.valores.length > 1) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: pr.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: p.valores.length },
          properties: { pixelSize: p.altoFila }, fields: 'pixelSize',
        },
      });
    }
    for (const [col, px] of p.anchos || []) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: pr.sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
          properties: { pixelSize: px }, fields: 'pixelSize',
        },
      });
    }
  }
  await gapi(token, saEmail, 'POST', `${id}:batchUpdate`, { requests });
  await gapi(token, saEmail, 'POST', `${id}/values:batchClear`, { ranges: pestanas.map((p) => `'${p.titulo}'`) });
  // Solo las pestañas con fórmulas usan USER_ENTERED (sus textos llegan escapados); el resto sigue en RAW.
  const grupos: [string, Pestana[]][] = [['RAW', pestanas.filter((p) => !p.formulas)], ['USER_ENTERED', pestanas.filter((p) => p.formulas)]];
  for (const [modo, grupo] of grupos) {
    if (!grupo.length) continue;
    await gapi(token, saEmail, 'POST', `${id}/values:batchUpdate`, {
      valueInputOption: modo,
      data: grupo.map((p) => ({ range: `'${p.titulo}'!A1`, values: p.valores })),
    });
  }
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

/** RPC que devuelve filas, paginada (PostgREST corta en 1000). */
async function leerRpc(sb: SupabaseClient, nombre: string, maximo = 50000): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let desde = 0; desde < maximo; desde += 1000) {
    const { data, error } = await sb.rpc(nombre, {}).range(desde, desde + 999);
    if (error) throw new Error(nombre + ': ' + error.message);
    const lote = (data || []) as Fila[];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

const fijarParametro = (sb: SupabaseClient, clave: string, valor: string) =>
  sb.from('parametros').update({ valor, actualizado_en: new Date().toISOString() }).eq('clave', clave);

/* ------------------------------------------------------------ Auditoría 5S */
type S5Datos = {
  bd: Fila[]; resumen: Fila[]; obs: Fila[]; auds: Map<string, Fila>; zonas: Map<number, Fila>; areas: Map<number, Fila>;
  cultivos: Map<number, Fila>; segs: Map<string, Fila[]>; fotos: Map<string, string>; fotosError: string;
};

/** URLs firmadas por 7 días del bucket privado; se renuevan en cada sincronización. */
async function firmarFotos(sb: SupabaseClient, rutas: string[], bucket = 'auditoria-5s'): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicas = [...new Set(rutas.filter(Boolean))];
  for (let i = 0; i < unicas.length; i += 100) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(unicas.slice(i, i + 100), 7 * 24 * 3600);
    if (error) throw new Error(error.message);
    (data || []).forEach((d: Fila) => { if (d.signedUrl && d.path) mapa.set(d.path, d.signedUrl); });
  }
  return mapa;
}

async function leerS5(sb: SupabaseClient): Promise<S5Datos> {
  const [bd, resumen, obs, auds, zonas, areas, segs, cultivos] = await Promise.all([
    leerRpc(sb, 'fn_s5_bd'),
    leerRpc(sb, 'fn_s5_resumen'),
    leerTodo(sb, 's5_observaciones', [['fecha_registro', true], ['zona_id', true], ['numero', true]]),
    leerTodo(sb, 's5_auditorias', [['fecha', true]]),
    leerTodo(sb, 's5_zonas', [['id', true]]),
    leerTodo(sb, 's5_areas', [['id', true]]),
    leerTodo(sb, 's5_seguimientos', [['fecha', true]]),
    leerTodo(sb, 's5_cultivos', [['orden', true]]),
  ]);
  const mapaAuds = new Map<string, Fila>(auds.map((a) => [a.id, a]));
  // La observación vive en la zona/área: sin auditoría también cuenta; con auditoría anulada, no.
  const validas = obs.filter((o) => {
    if (!o.auditoria_id) return true;
    const a = mapaAuds.get(o.auditoria_id);
    return a && a.estado !== 'anulada';
  });
  const porObs = new Map<string, Fila[]>();
  segs.forEach((s) => { const l = porObs.get(s.observacion_id) || []; l.push(s); porObs.set(s.observacion_id, l); });
  let fotos = new Map<string, string>();
  let fotosError = '';
  try {
    fotos = await firmarFotos(sb, validas.flatMap((o) => [
      ...((o.fotos_antes || []) as string[]), ...((o.fotos_despues || []) as string[]), o.foto_antes, o.foto_despues,
    ]));
  } catch (e) { fotosError = (e as Error).message || String(e); }
  return {
    bd, resumen, obs: validas, auds: mapaAuds, segs: porObs, fotos, fotosError,
    zonas: new Map<number, Fila>(zonas.map((z) => [z.id, z])), areas: new Map<number, Fila>(areas.map((a) => [a.id, a])),
    cultivos: new Map<number, Fila>(cultivos.map((c) => [c.id, c])),
  };
}

/** Texto seguro para USER_ENTERED: lo que empieza con = + - @ no se interpreta como fórmula. */
const seguro = (v: unknown) => { const t = txt(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
const imagen = (url?: string) => (url ? `=IMAGE("${url.replace(/"/g, '%22')}")` : '');

function pestanasS5(d: S5Datos | null): Pestana[] {
  if (!d) return [];
  const aud = (f: Fila): Fila => d.auds.get(f.auditoria_id) || {};
  const segsDe = (f: Fila): Fila[] => d.segs.get(f.id) || [];
  /** Una columna =IMAGE por foto (hasta 3): «Antes», «Antes 2», «Antes 3». */
  const listaFotos = (f: Fila, campo: string, principal: string): string[] => {
    const l = ((f[campo] || []) as string[]).filter(Boolean);
    return l.length ? l : (f[principal] ? [f[principal] as string] : []);
  };
  const fotoCols = (titulo: string, campo: string, principal: string): Col[] =>
    [0, 1, 2].map((i) => [i ? `${titulo} ${i + 1}` : titulo, (f: Fila) => imagen(d.fotos.get(listaFotos(f, campo, principal)[i]))] as Col);

  // Mismos 19 encabezados que la hoja BD del Excel; las columnas extra (incluido CULTIVO, para no mezclar) van al final.
  const colsBd: Col[] = [
    TX('fecha', 'FECHA'), TX('campana', 'CAMPAÑA'), TX('planta', 'PLANTA'), NU('semana', 'SEMANA', 0), NU('numero_auditoria', 'N° AUDITORIA', 0),
    TX('tipo_auditoria', 'TIPO AUDITORIA'), TX('area', 'ÁREA'), NU('numero_zona', 'N° ZONA', 0), TX('sub_area', 'SUB ÁREA'), TX('zona', 'ZONA'), TX('s', 'S'),
    NU('i1', '1', 1), NU('i2', '2', 1), NU('i3', '3', 1), NU('i4', '4', 1), NU('i5', '5', 1), NU('i6', '6', 1),
    NU('suma', 'SUMA', 1), NU('puntaje', 'PUNTAJE %', 4),
    TX('codigo', 'CÓDIGO'), ['ESTADO AUDITORÍA', (f) => f.estado_auditoria === 'cerrada' ? 'Cerrada' : 'En curso'],
    ['ESTADO ZONA', (f) => f.estado_zona === 'completa' ? 'Completa' : 'En curso'], TX('cultivo', 'CULTIVO'),
  ];

  // Formato de la hoja Observaciones; los seguimientos se concatenan con « // » como en el Excel.
  const colsObs: Col[] = [
    ['N°', (f) => f.numero], ['Semana', (f) => f.semana ?? ''], ['Fecha de Registro', (f) => txt(f.fecha_registro)],
    ['Cultivo', (f) => seguro((d.cultivos.get(f.cultivo_id ?? aud(f).cultivo_id) || {}).nombre)],
    ['Área', (f) => seguro((d.areas.get(f.area_id ?? aud(f).area_id) || {}).nombre)], ['Zona', (f) => seguro((d.zonas.get(f.zona_id) || {}).nombre)],
    ['Observaciones', (f) => seguro(f.descripcion)],
    ['Acción correctiva', (f) => seguro([f.accion_correctiva, ...segsDe(f).map((s) => s.nota).filter((n) => n && n !== 'Registro inicial')].filter(Boolean).join(' // '))],
    ['Estado', (f) => txt(f.estado)], ['Fecha de cierre', (f) => txt(f.fecha_cierre)],
    ...fotoCols('Antes', 'fotos_antes', 'foto_antes'), ...fotoCols('Después', 'fotos_despues', 'foto_despues'),
    ['Código auditoría', (f) => txt(aud(f).codigo)], ['N° auditoría', (f) => aud(f).numero_auditoria ?? ''],
    ['S relacionada', (f) => f.s_referencia ? f.s_referencia + 'S' : ''], ['Auditor', (f) => seguro(f.auditor)],
    ['Correcciones de puntaje', (f) => segsDe(f).flatMap((s) => (s.cambios_puntaje || []).map((c: Fila) => `${c.s}S-${c.numero}: ${num(c.antes, 1)}→${num(c.despues, 1)}`)).join(' · ')],
    TS('actualizado_en', 'Actualizado'),
  ];

  const colsRes: Col[] = [
    TX('codigo', 'Código'), TX('cultivo', 'Cultivo'), TX('campana', 'Campaña'), TX('fecha', 'Fecha'), NU('semana', 'Semana', 0), TX('area', 'Área'), NU('numero_auditoria', 'N° auditoría', 0), TX('tipo', 'Tipo'),
    ['Estado auditoría', (f) => f.estado_auditoria === 'cerrada' ? 'Cerrada' : 'En curso'], NU('numero_zona', 'N° zona', 0), TX('zona', 'Zona'),
    ['Estado zona', (f) => f.estado_zona === 'completa' ? 'Completa' : 'En curso'],
    NU('p1', '1S %', 4), NU('p2', '2S %', 4), NU('p3', '3S %', 4), NU('p4', '4S %', 4), NU('p5', '5S %', 4), NU('total', 'Total %', 4), TX('madurez', 'Madurez'),
  ];

  return [
    { titulo: '5S_BD', valores: tabla(colsBd, d.bd) },
    { titulo: '5S_Observaciones', valores: tabla(colsObs, d.obs), formulas: true, altoFila: 110,
      anchos: [[6, 320], [7, 320], [10, 150], [11, 150], [12, 150], [13, 150], [14, 150], [15, 150]] },
    { titulo: '5S_Resumen', valores: tabla(colsRes, d.resumen) },
  ];
}

/* ------------------------------------------------------------ Revisión del plan de mantenimiento */
type MPDatos = { revs: Fila[]; hallazgos: Fila[]; resultados: Fila[]; fotos: Map<string, string>; fotosError: string };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

async function leerMP(sb: SupabaseClient): Promise<MPDatos> {
  const [revs, resultados] = await Promise.all([
    leerTodo(sb, 'mp_revisiones', [['anio', true], ['mes', true], ['creado_en', true]]),
    leerRpc(sb, 'fn_mp_resultados'),
  ]);
  const validas = new Set(revs.filter((r) => r.estado !== 'anulada').map((r) => r.id));
  // Solo las OT con hallazgo: el plan completo ya está en el Excel original.
  const hallazgos: Fila[] = [];
  for (let desde = 0; desde < 50000; desde += 1000) {
    const { data, error } = await sb.from('mp_ot').select('*')
      .or('observacion.not.is.null,no_conformidad.not.is.null')
      .order('revision_id').order('fila').range(desde, desde + 999);
    if (error) throw new Error('mp_ot: ' + error.message);
    hallazgos.push(...(data || []).filter((o: Fila) => validas.has(o.revision_id)));
    if (!data || data.length < 1000) break;
  }
  let fotos = new Map<string, string>();
  let fotosError = '';
  try {
    fotos = await firmarFotos(sb, hallazgos.flatMap((o) => (o.fotos || []) as string[]), 'plan-mantenimiento');
  } catch (e) { fotosError = (e as Error).message || String(e); }
  return { revs: revs.filter((r) => validas.has(r.id)), hallazgos, resultados, fotos, fotosError };
}

function pestanasMP(d: MPDatos | null): Pestana[] {
  if (!d) return [];
  const revs = new Map<string, Fila>(d.revs.map((r) => [r.id, r]));
  const rev = (f: Fila): Fila => revs.get(f.revision_id) || {};
  const mes = (r: Fila) => MESES[(Number(r.mes) || 1) - 1];
  const puntaje = (nc: number) => Math.max(0, 100 - 0.5 * nc);  // igual que fn_mp_puntaje

  const totales = new Map<string, { n: number; obs: number; nc: number }>();
  d.resultados.forEach((f) => {
    const t = totales.get(f.revision_id) || { n: 0, obs: 0, nc: 0 };
    t.n += Number(f.total_ot); t.obs += Number(f.n_obs); t.nc += Number(f.n_nc);
    totales.set(f.revision_id, t);
  });
  const tot = (f: Fila) => totales.get(f.id) || { n: 0, obs: 0, nc: 0 };

  const colsRev: Col[] = [
    TX('codigo', 'Código'), ['Mes', (f) => mes(f)], NU('anio', 'Año', 0), TX('hoja', 'Hoja'), TX('archivo', 'Archivo'),
    TX('fecha_revision', 'Fecha revisión'), TX('revisor', 'Revisor'),
    ['Estado', (f) => f.estado === 'cerrada' ? 'Cerrada' : 'En curso'],
    ['# OT', (f) => tot(f).n], ['Observaciones', (f) => tot(f).obs], ['No conformidades', (f) => tot(f).nc],
    ['Resultado %', (f) => puntaje(tot(f).nc)], TS('cerrada_en', 'Cerrada'), TS('actualizado_en', 'Actualizado'),
  ];

  // Formato del correo: una fila por no conformidad y otra por observación.
  const filasHall: Fila[] = [];
  for (const [k, tipo] of [['no_conformidad', 'No conformidad'], ['observacion', 'Observación']]) {
    d.hallazgos.forEach((o) => { if (o[k]) filasHall.push({ ...o, _tipo: tipo, _detalle: o[k] }); });
  }
  const colsHall: Col[] = [
    ['Código revisión', (f) => txt(rev(f).codigo)], ['Mes', (f) => mes(rev(f))], ['Año', (f) => rev(f).anio ?? ''],
    ['Fecha', (f) => txt(f.fecha_hallazgo)], ['Hallazgo', (f) => f._tipo], ['Detalle', (f) => seguro(f._detalle)],
    ['OT', (f) => seguro(f.num_ot)], ['Planta', (f) => seguro(f.planta)], ['Supervisor', (f) => seguro(f.responsable)],
    ['Sub equipo', (f) => seguro(f.sub_equipo)], ['Descripción OT', (f) => seguro(f.descripcion)],
    ...[0, 1, 2].map((i) => [i ? `Foto ${i + 1}` : 'Foto', (f: Fila) => imagen(d.fotos.get(((f.fotos || []) as string[])[i]))] as Col),
    ['Registrado por', (f) => seguro(f.revisado_nombre)], TS('revisado_en', 'Actualizado'),
  ];

  const colsRes: Col[] = [
    TX('codigo', 'Código'), ['Mes', (f) => mes(f)], NU('anio', 'Año', 0),
    ['Estado', (f) => f.estado === 'cerrada' ? 'Cerrada' : 'En curso'],
    TX('responsable', 'Encargado'), TX('plantas', 'Plantas'), NU('total_ot', '# OT', 0), NU('n_obs', 'Observaciones', 0),
    NU('n_nc', 'No conformidades', 0), NU('resultado', 'Resultado %', 1),
  ];

  return [
    { titulo: 'PM_Revisiones', valores: tabla(colsRev, d.revs) },
    { titulo: 'PM_Hallazgos', valores: tabla(colsHall, filasHall), formulas: true, altoFila: 90,
      anchos: [[5, 360], [10, 260], [11, 120], [12, 120], [13, 120]] },
    { titulo: 'PM_Resultados', valores: tabla(colsRes, d.resultados) },
  ];
}

/* ------------------------------------------------------------ Satisfacción del cliente interno */
type SCIDatos = { bd: Fila[]; resultados: Fila[] };

async function leerSCI(sb: SupabaseClient): Promise<SCIDatos> {
  const [bd, resultados] = await Promise.all([leerRpc(sb, 'fn_sci_bd'), leerRpc(sb, 'fn_sci_resultados')]);
  return { bd, resultados };
}

function pestanasSCI(d: SCIDatos | null): Pestana[] {
  if (!d) return [];
  const sug = new Map<string, Fila>(d.resultados.map((f) => [f.codigo, f]));
  const origen = (f: Fila) => f.origen === 'app' ? 'App' : 'Excel';
  // Mismo formato largo que la BD de Power BI (una fila por ítem) + sugerencias de la encuesta.
  const colsBD: Col[] = [
    NU('semana', 'Semana', 0), TX('campana', 'Campaña'), TX('cultivo', 'Cultivo'), TX('planta', 'Planta'), TX('fecha', 'Fecha'),
    TX('area_evaluada', 'Área evaluada'), TX('area_evaluadora', 'Área evaluadora'), TX('sub_area', 'Sub área'),
    TX('grupo_evaluador', 'Grupo evaluador'), TX('cargo', 'Cargo'), NU('item', 'Items', 0), TX('pregunta', 'Pregunta'),
    TX('criterio', 'Criterio'), TX('respuesta', 'Respuesta'), NU('puntaje_item', 'Puntaje ítem', 3),
    NU('resultado_encuesta', 'Resultado encuesta', 4), TX('codigo', 'Código'), ['Origen', origen],
    ['Aspectos valorados', (f) => txt((sug.get(f.codigo) || {}).aspectos_valorados)],
    ['Aspectos por mejorar', (f) => txt((sug.get(f.codigo) || {}).aspectos_mejorar)],
    ['Recomendaciones', (f) => txt((sug.get(f.codigo) || {}).recomendaciones)],
  ];
  const colsRes: Col[] = [
    TX('codigo', 'Código'), TX('fecha', 'Fecha'), NU('semana', 'Semana', 0), TX('cultivo', 'Cultivo'), TX('campana', 'Campaña'),
    TX('area_evaluada', 'Área evaluada'), TX('area_evaluadora', 'Área evaluadora'), TX('sub_area', 'Sub área'), TX('planta', 'Planta'),
    TX('grupo', 'Grupo evaluador'), TX('cargo', 'Cargo'), TX('evaluador', 'Evaluador'),
    NU('p_atencion', 'Atención y trato %', 2), NU('p_tiempo', 'Tiempo de respuesta %', 2), NU('p_comunicacion', 'Comunicación %', 2),
    NU('p_calidad', 'Calidad de servicio %', 2), NU('resultado', 'Resultado %', 2),
    TX('aspectos_valorados', 'Aspectos valorados'), TX('aspectos_mejorar', 'Aspectos por mejorar'), TX('recomendaciones', 'Recomendaciones'),
    ['Origen', origen], TX('archivo', 'Archivo'), TS('creado_en', 'Registrado'),
  ];
  return [
    { titulo: 'SCI_BD', valores: tabla(colsBD, d.bd) },
    { titulo: 'SCI_Resultados', valores: tabla(colsRes, d.resultados) },
  ];
}

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

    // Auditoría 5S: si falla, las demás pestañas se escriben igual y el motivo queda en Sync_Info.
    let s5: S5Datos | null = null;
    let s5Error = '';
    try { s5 = await leerS5(sb); } catch (e) { s5Error = (e as Error).message || String(e); }
    // Plan de mantenimiento: mismo aislamiento.
    let mp: MPDatos | null = null;
    let mpError = '';
    try { mp = await leerMP(sb); } catch (e) { mpError = (e as Error).message || String(e); }
    // Satisfacción del cliente interno: mismo aislamiento.
    let sci: SCIDatos | null = null;
    let sciError = '';
    try { sci = await leerSCI(sb); } catch (e) { sciError = (e as Error).message || String(e); }

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
      TX('cultivo', 'Cultivo'),
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
    const estadoS5 = s5 ? (s5.fotosError ? 'OK · fotos sin miniatura: ' + s5.fotosError : 'OK') : 'No sincronizada: ' + s5Error;
    const estadoMP = mp ? (mp.fotosError ? 'OK · fotos sin miniatura: ' + mp.fotosError : 'OK') : 'No sincronizada: ' + mpError;
    const estadoSCI = sci ? 'OK' : 'No sincronizada: ' + sciError;
    const pestanas: Pestana[] = [
      { titulo: 'Ciclos_BD', valores: tabla(colsCiclos, ciclos) },
      { titulo: 'Resumen_Semanal', valores: tabla(colsResumen, resumen) },
      { titulo: 'Personal_Reubicacion', valores: tabla(colsPersonal, personal) },
      { titulo: 'Auditoria_Escaneos', valores: tabla(colsEscaneos, escaneos) },
      ...pestanasS5(s5),
      ...pestanasMP(mp),
      ...pestanasSCI(sci),
      { titulo: 'Sync_Info', valores: [
        ['Dato', 'Valor'],
        ['Última sincronización (hora Lima)', fechaHora(ahora)],
        ['Origen', origen],
        ['Ciclos', ciclos.length], ['Filas de resumen', resumen.length],
        ['Personal', personal.length], ['Escaneos', escaneos.length],
        ['Umbral de tiempo de ciclo (min)', txt(parametros.UMBRAL_TIEMPO_CICLO_MIN)],
        ['Auditoría 5S · filas BD', s5 ? s5.bd.length : ''],
        ['Auditoría 5S · observaciones', s5 ? s5.obs.length : ''],
        ['Auditoría 5S · estado', estadoS5],
        ['Plan de mantenimiento · revisiones', mp ? mp.revs.length : ''],
        ['Plan de mantenimiento · hallazgos', mp ? mp.hallazgos.length : ''],
        ['Plan de mantenimiento · estado', estadoMP],
        ['Cliente interno · encuestas', sci ? sci.resultados.length : ''],
        ['Cliente interno · filas BD', sci ? sci.bd.length : ''],
        ['Cliente interno · estado', estadoSCI],
        ['Nota', 'Estas pestañas se sobrescriben en cada sincronización. Crea tus gráficos o tablas dinámicas en otras pestañas. Las miniaturas de 5S_Observaciones y PM_Hallazgos se renuevan en cada sincronización.'],
      ] },
    ];

    paso = 'escritura';
    const tituloHoja = await escribirHoja(token, saEmail, hojaId, pestanas);

    const filas = {
      ciclos: ciclos.length, resumen: resumen.length, personal: personal.length, escaneos: escaneos.length,
      s5_bd: s5 ? s5.bd.length : 0, s5_observaciones: s5 ? s5.obs.length : 0,
      mp_revisiones: mp ? mp.revs.length : 0, mp_hallazgos: mp ? mp.hallazgos.length : 0,
      sci_encuestas: sci ? sci.resultados.length : 0, sci_bd: sci ? sci.bd.length : 0,
    };
    await fijarParametro(sb, 'ULTIMA_SYNC_SHEETS', ahora);
    const parciales = [s5 ? '' : `Auditoría 5S: ${s5Error}`, mp ? '' : `Plan de mantenimiento: ${mpError}`,
      sci ? '' : `Cliente interno: ${sciError}`].filter(Boolean);
    await fijarParametro(sb, 'ULTIMO_ERROR_SYNC_SHEETS', parciales.length ? `${fechaHora(ahora)} · ${parciales.join(' · ')}` : '');
    await sb.from('bitacora').insert({ usuario_id: usuarioId, modulo: 'SHEETS', accion: 'Sincronización OK', detalle: `${origen} · ${JSON.stringify(filas)}` });
    return responder({ ok: true, hoja: tituloHoja, filas, origen, s5: estadoS5, mp: estadoMP, sci: estadoSCI, duracion_ms: Date.now() - inicio });
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    await fijarParametro(sb, 'ULTIMO_ERROR_SYNC_SHEETS', `${fechaHora(new Date().toISOString())} · ${msg}`);
    await sb.from('bitacora').insert({ usuario_id: usuarioId, modulo: 'SHEETS', accion: 'Error de sincronización', detalle: `${origen} · paso ${paso} · ${msg}`.slice(0, 900) });
    return responder({ ok: false, paso, credencial: paso === 'credencial' ? 'error' : 'ok', sa_email: saEmail, error: msg }, paso === 'credencial' ? 500 : 400);
  }
});
