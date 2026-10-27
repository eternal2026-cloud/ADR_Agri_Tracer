-- 0053: Tiempo de ciclo Uva unificado — APK (Android) + Integra (iPhone / web) + Planta
--
--   · uva_ciclos: un registro por pallet (ID del celular, nunca se repite):
--       UV-EQ-xxxx-…  APK (llega por su Apps Script → rpc_uva_desde_apk, con token de Vault)
--       UV-IN-xxxx-…  Integra campo (campo/uva/ → rpc_uva_guardar_campo)
--       UV-PL-…       iniciado en planta (planta/uva-recepcion/ → rpc_uva_planta_iniciar)
--     La parte de campo se guarda tal como la arma el celular (registro + etapas, el mismo paquete
--     que la APK manda a su hoja) y solo la escribe su origen. La parte de planta (5 marcas de hora,
--     planta, línea) solo la escribe Planta. Así una subida tardía de la APK nunca borra lo de planta.
--   · Ámbito: Campo (sin continuar) · Ciclo completo (campo continuado en planta) · Planta (iniciado en planta).
--   · Planta solo puede continuar ciclos del mismo día (hora de Lima) que ya tengan placa.
--   · uva_catalogo: zona · fundo · lote · variedad (el de fábrica de la APK). parametros.UVA_CONFIG: campaña,
--     plantas, líneas y estándares de traslado.
--   · Accesos: campo.uva (campo.uva.registrar) y planta.uva (planta.uva.recepcion).
--
-- Revertir: drop table uva_ciclos, uva_catalogo; drop de las funciones fn_uva_* / rpc_uva_*;
--   delete from parametros where clave = 'UVA_CONFIG'; delete from vault.secrets where name = 'uva_apk_token'.

-- ================================================================ tablas
create table if not exists public.uva_catalogo (
  id bigint generated always as identity primary key,
  zona text not null,
  fundo text not null,
  lote text not null,
  variedad text not null default '',
  activo boolean not null default true,
  unique (fundo, lote)
);

create table if not exists public.uva_ciclos (
  id text primary key check (id ~ '^UV-[A-Z0-9-]+$'),
  origen text not null check (origen in ('apk', 'integra', 'planta')),
  -- campo (dueño: APK o Integra campo)
  registrador text,
  dispositivo text,
  usuario_id uuid references auth.users(id),
  registro jsonb not null default '{}'::jsonb,
  etapas jsonb not null default '[]'::jsonb,
  fecha date,
  semana int,
  campana text,
  zona text, fundo text, lote text, variedad text, grupo text, pallet text,
  placa text,
  planta text,
  estado text,
  ini_cosecha timestamptz,
  fin_carga timestamptz,
  fin_traslado timestamptz,
  campo_recibido timestamptz,
  eliminado boolean not null default false,
  -- planta (dueño: Planta)
  vinculado boolean not null default false,
  planta_destino text,
  linea text,
  hora_llegada timestamptz,
  hora_recepcion timestamptz,
  ini_descarga timestamptz,
  fin_descarga timestamptz,
  ini_abastecimiento timestamptz,
  planta_detalle jsonb not null default '{}'::jsonb,   -- {"lleg": {"causa": "", "com": "", "editado": false}, …}
  planta_obs text,
  planta_usuario_id uuid references auth.users(id),
  planta_usuario text,
  planta_inicio timestamptz,
  planta_actualizado timestamptz,
  -- calculados (fn_uva_calcular), minutos con decimales
  t_espera_recepcion numeric,
  t_espera_descarga numeric,
  t_descarga numeric,
  t_espera_abastecimiento numeric,
  t_en_planta numeric,
  t_llegada_desde_carga numeric,
  t_ciclo_completo numeric,
  ambito text not null default 'Campo',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists uva_ciclos_fecha_idx on public.uva_ciclos (fecha);
create index if not exists uva_ciclos_placa_idx on public.uva_ciclos (upper(placa));

-- ================================================================ parámetros, catálogo y token
insert into public.parametros (clave, valor, descripcion) values
  ('UVA_CONFIG', '{"campana":"UVA 26-27","plantas":["LOS MOLINOS","DON CARLOS","YANCAY"],"lineas":[],"traslados":[]}',
   'Tiempo de ciclo Uva: campaña, plantas, líneas de abastecimiento y estándares de traslado [{zona, fundo, planta, min}].')
on conflict (clave) do nothing;

insert into public.uva_catalogo (zona, fundo, lote, variedad) values
  ('ALTA','LA PAUSA','PU1','AUTUMN CRISP'), ('ALTA','LA PAUSA','PU10','AUTUMN CRISP'), ('ALTA','LA PAUSA','PU11','AUTUMN CRISP'),
  ('ALTA','LA PAUSA','PU12','AUTUMN CRISP'), ('ALTA','LA PAUSA','PU2','AUTUMN CRISP'), ('ALTA','LA PAUSA','PU3','AUTUMN CRISP'),
  ('ALTA','LA PAUSA','PU4','AUTUMN CRISP'), ('ALTA','LA QUEBRADA','QU10','AUTUMN CRISP'), ('ALTA','LA QUEBRADA','QU11','MIDNIGHT BEAUTY'),
  ('ALTA','LA QUEBRADA','QU12','MIDNIGHT BEAUTY'), ('ALTA','LA QUEBRADA','QU13','AUTUMN CRISP'), ('ALTA','LA QUEBRADA','QU4','AUTUMN CRISP'),
  ('ALTA','LA QUEBRADA','QU8','RUBY RUSH'), ('ALTA','LA QUEBRADA','QU9','RUBY RUSH'), ('ALTA','LA UNIÓN','UU1','TIMCO'),
  ('ALTA','LA UNIÓN','UU11','COTTON CANDY'), ('ALTA','LA UNIÓN','UU2','COTTON CANDY'), ('ALTA','LA UNIÓN','UU5','SWEET GLOBE'),
  ('ALTA','LA UNIÓN','UU6','SWEET GLOBE'), ('ALTA','LA UNIÓN','UU7','COTTON CANDY'), ('ALTA','SANTA ROSA','RU12','AUTUMN CRISP'),
  ('ALTA','SANTA ROSA','RU15','AUTUMN CRISP'), ('ALTA','SANTA ROSA','RU6','MUSCAT BEAUTY'), ('ALTA','YANCAY','YU11','AUTUMN CRISP'),
  ('ALTA','YANCAY','YU13','RUBY RUSH'), ('ALTA','YANCAY','YU17','AUTUMN CRISP'), ('ALTA','YANCAY','YU5','AUTUMN CRISP'),
  ('BAJA','DON CARLOS','CU12','AUTUMN CRISP'), ('BAJA','DON CARLOS','CU13','AUTUMN CRISP'), ('BAJA','DON CARLOS','CU16','SWEET CELEBRATION'),
  ('BAJA','DON CARLOS','CU4','SWEET CELEBRATION'), ('BAJA','DON CARLOS','CU8','AUTUMN CRISP'), ('BAJA','DON CARLOS','CU9','SABLE'),
  ('BAJA','EL ALTO','AU1','AUTUMN CRISP'), ('BAJA','EL ALTO','AU11','AUTUMN CRISP'), ('BAJA','EL ALTO','AU2','AUTUMN CRISP'),
  ('BAJA','EL ALTO','AU4','ALLISON'), ('BAJA','EL ALTO','AU7','ALLISON'), ('BAJA','EL ALTO','AU9','MIDNIGHT BEAUTY'),
  ('BAJA','EL TUNAL','TU1','SWEET CELEBRATION'), ('BAJA','EL TUNAL','TU11','JACK''S SALUTE'), ('BAJA','EL TUNAL','TU12','JACK''S SALUTE'),
  ('BAJA','EL TUNAL','TU13','TIMCO'), ('BAJA','EL TUNAL','TU4','TIMPSON'), ('BAJA','EL TUNAL','TU6','JACK''S SALUTE'),
  ('BAJA','LA MÁQUINA','MU1','AUTUMN CRISP'), ('BAJA','LA MÁQUINA','MU10','AUTUMN CRISP'), ('BAJA','LA MÁQUINA','MU12','SWEET CELEBRATION'),
  ('BAJA','LA MÁQUINA','MU2','AUTUMN CRISP'), ('BAJA','LA MÁQUINA','MU3','SWEET CELEBRATION'), ('BAJA','LA MÁQUINA','MU4','SWEET CELEBRATION'),
  ('BAJA','LA MÁQUINA','MU6','SWEET CELEBRATION'), ('BAJA','LA MÁQUINA','MU7','SABLE'), ('BAJA','LA MÁQUINA','MU8','SABLE'),
  ('VILLACURI','CASA CHICA','HU24','AUTUMN CRISP'), ('VILLACURI','CASA CHICA','HU25','AUTUMN CRISP')
on conflict (fundo, lote) do nothing;

-- Token con el que el Apps Script de la APK escribe aquí (se crea una sola vez; el admin lo ve en Integra).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'uva_apk_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'uva_apk_token',
      'Token del Apps Script de la APK Tiempo Ciclo Uva para enviar registros a Integra');
  end if;
end $$;

-- ================================================================ cálculos
create or replace function public.fn_uva_min(a timestamptz, b timestamptz)
returns numeric language sql immutable as $$
  select case when a is null or b is null then null else round(extract(epoch from (b - a)) / 60.0, 2) end;
$$;

create or replace function public.fn_uva_calcular()
returns trigger language plpgsql set search_path = public as $$
begin
  new.t_espera_recepcion := public.fn_uva_min(new.hora_llegada, new.hora_recepcion);
  new.t_espera_descarga := public.fn_uva_min(new.hora_recepcion, new.ini_descarga);
  new.t_descarga := public.fn_uva_min(new.ini_descarga, new.fin_descarga);
  new.t_espera_abastecimiento := public.fn_uva_min(new.fin_descarga, new.ini_abastecimiento);
  new.t_en_planta := public.fn_uva_min(new.hora_llegada, new.ini_abastecimiento);
  new.t_llegada_desde_carga := case when new.vinculado then public.fn_uva_min(new.fin_carga, new.hora_llegada) end;
  new.t_ciclo_completo := case when new.vinculado then public.fn_uva_min(new.ini_cosecha, new.ini_abastecimiento) end;
  new.ambito := case when new.origen = 'planta' then 'Planta' when new.vinculado then 'Ciclo completo' else 'Campo' end;
  if new.origen = 'planta' then
    new.fecha := coalesce(new.fecha, (coalesce(new.hora_llegada, new.planta_inicio, now()) at time zone 'America/Lima')::date);
  end if;
  if new.fecha is not null then new.semana := public.weeknum_excel_sistema1(new.fecha); end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_uva_calcular on public.uva_ciclos;
create trigger trg_uva_calcular before insert or update on public.uva_ciclos
  for each row execute function public.fn_uva_calcular();

-- ================================================================ RLS: solo lectura
alter table public.uva_ciclos enable row level security;
alter table public.uva_catalogo enable row level security;
drop policy if exists uva_ciclos_leer on public.uva_ciclos;
create policy uva_ciclos_leer on public.uva_ciclos for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor') and (public.fn_tiene_acceso('campo.uva') or public.fn_tiene_acceso('planta.uva')));
drop policy if exists uva_catalogo_leer on public.uva_catalogo;
create policy uva_catalogo_leer on public.uva_catalogo for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor'));
revoke insert, update, delete on public.uva_ciclos from anon, authenticated;
revoke insert, update, delete on public.uva_catalogo from anon, authenticated;
revoke select on public.uva_ciclos from anon;
revoke select on public.uva_catalogo from anon;

-- ================================================================ ayudas internas
/** Rol de captura + acceso + horario (con 30 min de tolerancia, igual que fn_exigir_acceso). */
create or replace function public.fn_uva_exigir(p_clave text, p_nombre text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_fuera text;
begin
  if coalesce(public.rol_actual()::text, '') not in ('admin', 'captura') then raise exception 'No autorizado'; end if;
  if not public.fn_tiene_acceso(p_clave) then
    raise exception 'No tienes acceso a «%». Pide a un administrador que te lo asigne en Usuarios.', p_nombre;
  end if;
  v_fuera := public.fn_fuera_de_horario(p_clave, 30);
  if v_fuera is not null then
    raise exception 'Fuera de tu horario para «%»: puedes registrar %. Si necesitas más tiempo, pide al administrador que lo cambie en Config › Accesos.', p_nombre, v_fuera;
  end if;
end;
$$;
revoke execute on function public.fn_uva_exigir(text, text) from public, anon, authenticated;

create or replace function public.fn_uva_ts(p text)
returns timestamptz language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then return null;
end;
$$;

/** Hora de una etapa de campo del paquete (n = 1…8, k = inicio | fin). */
create or replace function public.fn_uva_hora_etapa(p_etapas jsonb, p_n int, p_k text)
returns timestamptz language sql immutable as $$
  select public.fn_uva_ts(e->>p_k) from jsonb_array_elements(coalesce(p_etapas, '[]'::jsonb)) e where (e->>'n')::int = p_n limit 1;
$$;

/**
 * Guarda la parte de campo de un paquete (el mismo que la APK manda a su hoja:
 * {registrador, dispositivo, registro: {...}, etapas: [...]}). Nunca toca la parte de planta.
 */
create or replace function public.fn_uva_aplicar_campo(p jsonb, p_origen text, p_usuario uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r jsonb := p->'registro';
  et jsonb := coalesce(p->'etapas', '[]'::jsonb);
  v_id text := r->>'id';
  v_reg text := coalesce(p->>'registrador', r->>'registrador', '');
  v_disp text := coalesce(p->>'dispositivo', r->>'dispositivo', '');
  x public.uva_ciclos;
  M text;
begin
  if r is null or coalesce(v_id, '') = '' then raise exception 'Solicitud no válida: falta el registro.'; end if;
  if v_id !~ '^UV-[A-Z0-9-]+$' then raise exception 'ID no válido: %', v_id; end if;
  select * into x from public.uva_ciclos where id = v_id;
  if found then
    if x.origen <> p_origen then raise exception 'El registro % ya existe con otro origen (%). No se sobrescribe.', v_id, x.origen; end if;
    if p_origen = 'apk' and (x.registrador is distinct from v_reg or x.dispositivo is distinct from v_disp) then
      raise exception 'El registro % ya fue enviado por % (%). No se sobrescribe.', v_id, x.registrador, x.dispositivo;
    end if;
    if p_origen = 'integra' and x.usuario_id is distinct from p_usuario and coalesce(public.rol_actual()::text, '') <> 'admin' then
      raise exception 'El registro % es de otro usuario. No se sobrescribe.', v_id;
    end if;
  end if;

  insert into public.uva_ciclos as c (id, origen, registrador, dispositivo, usuario_id, registro, etapas, fecha, campana, zona, fundo, lote,
    variedad, grupo, pallet, placa, planta, estado, ini_cosecha, fin_carga, fin_traslado, campo_recibido, eliminado)
  values (v_id, p_origen, v_reg, v_disp, p_usuario, r, et,
    case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end,
    r->>'campana', upper(btrim(r->>'zona')), upper(btrim(r->>'fundo')), upper(btrim(r->>'lote')), upper(btrim(r->>'variedad')),
    upper(btrim(r->>'grupo')), btrim(r->>'pallet'), nullif(upper(regexp_replace(coalesce(r->>'placa', ''), '\s+', '', 'g')), ''),
    upper(btrim(r->>'planta')), r->>'estado',
    public.fn_uva_hora_etapa(et, 1, 'inicio'), public.fn_uva_hora_etapa(et, 7, 'fin'), public.fn_uva_hora_etapa(et, 8, 'fin'), now(), false)
  on conflict (id) do update set
    registrador = excluded.registrador, dispositivo = excluded.dispositivo,
    usuario_id = coalesce(c.usuario_id, excluded.usuario_id),
    registro = excluded.registro, etapas = excluded.etapas, fecha = excluded.fecha, campana = excluded.campana,
    zona = excluded.zona, fundo = excluded.fundo, lote = excluded.lote, variedad = excluded.variedad, grupo = excluded.grupo,
    pallet = excluded.pallet, placa = excluded.placa, planta = excluded.planta, estado = excluded.estado,
    ini_cosecha = excluded.ini_cosecha, fin_carga = excluded.fin_carga, fin_traslado = excluded.fin_traslado,
    campo_recibido = excluded.campo_recibido, eliminado = false;
  return v_id;
end;
$$;
revoke execute on function public.fn_uva_aplicar_campo(jsonb, text, uuid) from public, anon, authenticated;

/** Quita un registro de campo. Si Planta ya lo continuó, se conserva (la trazabilidad no se pierde). */
create or replace function public.fn_uva_quitar_campo(p_id text, p_origen text)
returns text language plpgsql security definer set search_path = public as $$
declare x public.uva_ciclos;
begin
  select * into x from public.uva_ciclos where id = p_id;
  if not found then return 'no existe'; end if;
  if x.origen <> p_origen then raise exception 'El registro % no es de este origen.', p_id; end if;
  if x.vinculado then return 'se conserva: ya fue continuado en planta'; end if;
  update public.uva_ciclos set eliminado = true where id = p_id;
  return 'eliminado';
end;
$$;
revoke execute on function public.fn_uva_quitar_campo(text, text) from public, anon, authenticated;

-- ================================================================ APK (Apps Script, sin sesión: token de Vault)
create or replace function public.rpc_uva_desde_apk(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_token text; v_id text; v_res text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'uva_apk_token';
  if v_token is null or coalesce(p_token, '') <> v_token then raise exception 'Token no válido.'; end if;
  if p_payload->>'accion' = 'eliminar' then
    v_res := public.fn_uva_quitar_campo(p_payload->>'id', 'apk');
    return jsonb_build_object('ok', true, 'id', p_payload->>'id', 'resultado', v_res);
  end if;
  v_id := public.fn_uva_aplicar_campo(p_payload, 'apk', null);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke execute on function public.rpc_uva_desde_apk(text, jsonb) from public;
grant execute on function public.rpc_uva_desde_apk(text, jsonb) to anon, authenticated;

/** Token para pegar en el Apps Script de la APK (solo administradores). */
create or replace function public.rpc_uva_token_apk()
returns text language plpgsql security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'admin' then raise exception 'No autorizado'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'uva_apk_token');
end;
$$;
revoke execute on function public.rpc_uva_token_apk() from public, anon;
grant execute on function public.rpc_uva_token_apk() to authenticated;

-- ================================================================ Integra campo
create or replace function public.rpc_uva_guardar_campo(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  perform public.fn_uva_exigir('campo.uva', 'Tiempo de ciclo Uva');
  if coalesce(p_payload->'registro'->>'id', '') !~ '^UV-IN-' then raise exception 'Los registros de Integra empiezan con UV-IN-.'; end if;
  if p_payload->>'accion' = 'eliminar' then
    return jsonb_build_object('ok', true, 'resultado', public.fn_uva_quitar_campo(p_payload->'registro'->>'id', 'integra'));
  end if;
  v_id := public.fn_uva_aplicar_campo(p_payload, 'integra', auth.uid());
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke execute on function public.rpc_uva_guardar_campo(jsonb) from public, anon;
grant execute on function public.rpc_uva_guardar_campo(jsonb) to authenticated;

/** Catálogo y parámetros para los celulares (se guardan en el equipo para trabajar sin señal). */
create or replace function public.rpc_uva_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'config', coalesce((select valor::jsonb from public.parametros where clave = 'UVA_CONFIG'), '{}'::jsonb),
    'catalogo', coalesce((select jsonb_agg(jsonb_build_array(zona, fundo, lote, variedad) order by zona, fundo, lote)
                          from public.uva_catalogo where activo), '[]'::jsonb))
  where public.rol_actual() is not null;
$$;
revoke execute on function public.rpc_uva_config() from public, anon;
grant execute on function public.rpc_uva_config() to authenticated;

-- ================================================================ Planta
/** Fila resumida para las tarjetas de planta. */
create or replace function public.fn_uva_fila(c public.uva_ciclos)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'origen', c.origen, 'ambito', c.ambito, 'fecha', c.fecha, 'placa', c.placa,
    'fundo', c.fundo, 'lote', c.lote, 'variedad', c.variedad, 'grupo', c.grupo, 'pallet', c.pallet, 'planta', c.planta,
    'registrador', c.registrador, 'estado', c.estado, 'etapa_actual', c.registro->>'etapaActual', 'situacion', c.registro->>'situacion',
    'jabas', c.registro->>'jabas', 'pallets_carg', c.registro->>'palletsCarg', 'pallets_tot', c.registro->>'palletsTot',
    'ini_cosecha', c.ini_cosecha, 'fin_carga', c.fin_carga, 'fin_traslado', c.fin_traslado, 'campo_recibido', c.campo_recibido,
    'min_total', c.registro->>'minTotal', 'etapas', c.etapas,
    'vinculado', c.vinculado, 'planta_destino', c.planta_destino, 'linea', c.linea,
    'hora_llegada', c.hora_llegada, 'hora_recepcion', c.hora_recepcion, 'ini_descarga', c.ini_descarga,
    'fin_descarga', c.fin_descarga, 'ini_abastecimiento', c.ini_abastecimiento, 'planta_detalle', c.planta_detalle,
    'planta_obs', c.planta_obs, 'planta_usuario', c.planta_usuario, 'planta_inicio', c.planta_inicio,
    't_espera_recepcion', c.t_espera_recepcion, 't_espera_descarga', c.t_espera_descarga, 't_descarga', c.t_descarga,
    't_espera_abastecimiento', c.t_espera_abastecimiento, 't_en_planta', c.t_en_planta,
    't_llegada_desde_carga', c.t_llegada_desde_carga, 't_ciclo_completo', c.t_ciclo_completo);
$$;

/**
 * Lo del día (hora de Lima) para Planta: ciclos de campo con placa (para continuar) y los ya
 * trabajados en planta. p_placa filtra por placa (contiene, sin espacios).
 */
create or replace function public.rpc_uva_planta_hoy(p_placa text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Lima')::date; v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.fn_tiene_acceso('planta.uva') then raise exception 'No autorizado'; end if;
  return jsonb_build_object('hoy', v_hoy, 'filas', coalesce((
    select jsonb_agg(public.fn_uva_fila(c) order by coalesce(c.fin_carga, c.planta_inicio, c.creado_en) desc)
    from public.uva_ciclos c
    where not c.eliminado
      and (c.fecha = v_hoy or (c.planta_inicio at time zone 'America/Lima')::date = v_hoy)
      and (c.placa is not null or c.origen = 'planta')
      and (v_placa = '' or regexp_replace(coalesce(c.placa, ''), '[^A-Z0-9]', '', 'g') like '%' || v_placa || '%')
  ), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_uva_planta_hoy(text) from public, anon;
grant execute on function public.rpc_uva_planta_hoy(text) to authenticated;

/** Un registro (para la pantalla de planta). */
create or replace function public.rpc_uva_planta_uno(p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.uva_ciclos;
begin
  if not public.fn_tiene_acceso('planta.uva') then raise exception 'No autorizado'; end if;
  select * into c from public.uva_ciclos where id = p_id and not eliminado;
  if not found then return null; end if;
  return public.fn_uva_fila(c);
end;
$$;
revoke execute on function public.rpc_uva_planta_uno(text) from public, anon;
grant execute on function public.rpc_uva_planta_uno(text) to authenticated;

/**
 * Continuar en planta un ciclo de campo del día (p.id_campo) o iniciar uno nuevo (p.id_nuevo 'UV-PL-…', placa).
 * Idempotente: el celular puede reenviarlo sin duplicar (cola sin señal).
 */
create or replace function public.rpc_uva_planta_iniciar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_nombre text := (select nombre from public.perfiles where id = auth.uid());
  c public.uva_ciclos;
  v_id text;
begin
  perform public.fn_uva_exigir('planta.uva', 'Recepción Uva (planta)');
  if coalesce(p->>'id_campo', '') <> '' then
    select * into c from public.uva_ciclos where id = p->>'id_campo' for update;
    if not found or c.eliminado then raise exception 'Ese ciclo de campo ya no existe.'; end if;
    if c.origen = 'planta' then raise exception 'Ese registro ya es de planta.'; end if;
    if c.vinculado then
      if c.planta_usuario_id is not distinct from auth.uid() then return public.fn_uva_fila(c); end if;
      raise exception 'Ese ciclo ya lo continuó % en planta.', coalesce(c.planta_usuario, 'otra persona');
    end if;
    if c.fecha is distinct from v_hoy then raise exception 'Solo se continúan en planta los ciclos del mismo día.'; end if;
    if c.placa is null then raise exception 'El ciclo de campo aún no tiene placa de camión.'; end if;
    update public.uva_ciclos set vinculado = true, planta_destino = coalesce(nullif(upper(btrim(p->>'planta')), ''), planta),
      linea = nullif(btrim(p->>'linea'), ''), planta_usuario_id = auth.uid(), planta_usuario = v_nombre,
      planta_inicio = now(), planta_actualizado = now()
    where id = c.id returning * into c;
    insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'UVA_PLANTA', 'Continuar ciclo de campo', c.id);
    return public.fn_uva_fila(c);
  end if;

  v_id := p->>'id_nuevo';
  if coalesce(v_id, '') !~ '^UV-PL-[A-Z0-9-]+$' then raise exception 'ID nuevo no válido.'; end if;
  if coalesce(btrim(p->>'placa'), '') = '' then raise exception 'Indica la placa del camión.'; end if;
  select * into c from public.uva_ciclos where id = v_id;
  if found then return public.fn_uva_fila(c); end if;
  insert into public.uva_ciclos (id, origen, registrador, dispositivo, placa, planta, planta_destino, linea, fundo,
    planta_usuario_id, planta_usuario, planta_inicio, planta_actualizado, campana, estado)
  values (v_id, 'planta', v_nombre, 'INTEGRA', upper(regexp_replace(p->>'placa', '\s+', '', 'g')), upper(btrim(p->>'planta')),
    upper(btrim(p->>'planta')), nullif(btrim(p->>'linea'), ''), nullif(upper(btrim(p->>'fundo')), ''),
    auth.uid(), v_nombre, coalesce(public.fn_uva_ts(p->>'creado'), now()), now(),
    (select valor::jsonb->>'campana' from public.parametros where clave = 'UVA_CONFIG'), 'En proceso')
  returning * into c;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'UVA_PLANTA', 'Nuevo en planta', v_id);
  return public.fn_uva_fila(c);
end;
$$;
revoke execute on function public.rpc_uva_planta_iniciar(jsonb) from public, anon;
grant execute on function public.rpc_uva_planta_iniciar(jsonb) to authenticated;

/**
 * Guarda horas y datos de planta. Solo cambia las claves que llegan (varias personas pueden
 * marcar distintas horas del mismo camión sin pisarse). Hora vacía ('') = borrar esa marca.
 */
create or replace function public.rpc_uva_planta_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.uva_ciclos; k text;
begin
  perform public.fn_uva_exigir('planta.uva', 'Recepción Uva (planta)');
  select * into c from public.uva_ciclos where id = p->>'id' for update;
  if not found or c.eliminado then raise exception 'El registro ya no existe.'; end if;
  if c.origen <> 'planta' and not c.vinculado then raise exception 'Primero continúa el ciclo en planta.'; end if;
  foreach k in array array['hora_llegada', 'hora_recepcion', 'ini_descarga', 'fin_descarga', 'ini_abastecimiento'] loop
    if p ? k then
      execute format('update public.uva_ciclos set %I = $1 where id = $2', k) using public.fn_uva_ts(p->>k), c.id;
    end if;
  end loop;
  update public.uva_ciclos set
    planta_destino = case when p ? 'planta' then nullif(upper(btrim(p->>'planta')), '') else planta_destino end,
    planta = case when origen = 'planta' and p ? 'planta' then nullif(upper(btrim(p->>'planta')), '') else planta end,
    linea = case when p ? 'linea' then nullif(btrim(p->>'linea'), '') else linea end,
    placa = case when origen = 'planta' and p ? 'placa' then nullif(upper(regexp_replace(p->>'placa', '\s+', '', 'g')), '') else placa end,
    planta_obs = case when p ? 'obs' then nullif(btrim(p->>'obs'), '') else planta_obs end,
    planta_detalle = case when jsonb_typeof(p->'detalle') = 'object' then planta_detalle || (p->'detalle') else planta_detalle end,
    planta_actualizado = now()
  where id = c.id;
  update public.uva_ciclos set estado = case when ini_abastecimiento is not null then 'Cerrado' else 'En proceso' end
    where id = c.id and origen = 'planta';
  select * into c from public.uva_ciclos where id = c.id;
  return public.fn_uva_fila(c);
end;
$$;
revoke execute on function public.rpc_uva_planta_guardar(jsonb) from public, anon;
grant execute on function public.rpc_uva_planta_guardar(jsonb) to authenticated;

/** Deshacer en planta: un ciclo de campo vuelve a ser solo Campo; uno iniciado en planta se anula. */
create or replace function public.rpc_uva_planta_quitar(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.uva_ciclos;
begin
  perform public.fn_uva_exigir('planta.uva', 'Recepción Uva (planta)');
  select * into c from public.uva_ciclos where id = p_id for update;
  if not found then return; end if;
  if c.planta_usuario_id is distinct from auth.uid() and public.rol_actual() <> 'admin' then
    raise exception 'Solo quien lo registró en planta (o un administrador) puede quitarlo.';
  end if;
  if c.origen = 'planta' then
    update public.uva_ciclos set eliminado = true where id = p_id;
  else
    update public.uva_ciclos set vinculado = false, planta_destino = null, linea = null, hora_llegada = null, hora_recepcion = null,
      ini_descarga = null, fin_descarga = null, ini_abastecimiento = null, planta_detalle = '{}'::jsonb, planta_obs = null,
      planta_usuario_id = null, planta_usuario = null, planta_inicio = null, planta_actualizado = null
    where id = p_id;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'UVA_PLANTA', 'Quitar de planta', p_id);
end;
$$;
revoke execute on function public.rpc_uva_planta_quitar(text) from public, anon;
grant execute on function public.rpc_uva_planta_quitar(text) to authenticated;

revoke execute on function public.fn_uva_calcular() from public, anon, authenticated;
revoke execute on function public.fn_uva_fila(public.uva_ciclos) from public, anon;

-- Funciones auxiliares con search_path fijo (aviso del linter de Supabase).
alter function public.fn_uva_min(timestamptz, timestamptz) set search_path = public;
alter function public.fn_uva_ts(text) set search_path = public;
alter function public.fn_uva_hora_etapa(jsonb, int, text) set search_path = public;
alter function public.fn_uva_fila(public.uva_ciclos) set search_path = public;
