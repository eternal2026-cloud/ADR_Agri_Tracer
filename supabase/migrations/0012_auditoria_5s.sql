-- 0012: Módulo Auditoría 5S (checklist por zona, observaciones con fotos y seguimiento)
--
-- Réplica del proceso manual de los Excel «TERCERA AUDITORIA 5S - <ÁREA>.xlsx»:
--   · CHECK LIST: 26 ítems repartidos en 5 S (5-5-6-5-5), puntaje 0/1/2 por ítem (la hoja BD
--     también trae 0.5 y 1.5). % de cada S = SUMA / (n° de ítems × 2);
--     calificación de la zona = promedio de las 5 S.
--   · BD: una fila por zona y S → fn_s5_bd() devuelve exactamente esas columnas.
--   · Observaciones: libres por zona, N° correlativo por zona (continúa entre
--     auditorías), foto Antes/Después y los estados de la hoja «Hoja5».
--     Los seguimientos (antes « // » dentro del texto) van a s5_seguimientos y
--     pueden sobrescribir puntajes dejando historial (puntaje_original intacto).
--   · Plazo de corrección: S5_DIAS_CORRECCION días desde la fecha de la auditoría
--     para el rol captura; un admin corrige sin límite.
-- Escritura solo por RPC (security definer + exigir_rol); lectura por RLS.

-- ================================================================ utilidades
create or replace function public.fn_hoy_lima()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Lima')::date;
$$;

create or replace function public.fn_s5_madurez(p numeric)
returns text language sql immutable set search_path = public as $$
  select case when p is null then null
              when p >= 0.90 then 'EXCELENTE'
              when p >= 0.75 then 'BIEN'
              when p >= 0.65 then 'REGULAR'
              else 'CRÍTICO' end;
$$;

-- ================================================================ catálogo
create table if not exists public.s5_areas (
  id serial primary key,
  nombre text not null unique check (btrim(nombre) <> ''),
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.s5_zonas (
  id serial primary key,
  area_id integer not null references public.s5_areas(id),
  numero integer not null check (numero between 1 and 99),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (area_id, numero)
);

-- numero hasta 6: la hoja BD tiene las columnas de ítem 1…6.
create table if not exists public.s5_items (
  id serial primary key,
  s smallint not null check (s between 1 and 5),
  numero smallint not null check (numero between 1 and 6),
  texto text not null check (btrim(texto) <> ''),
  activo boolean not null default true,
  unique (s, numero)
);

-- ================================================================ auditorías
create sequence if not exists public.s5_auditorias_codigo_seq;

create table if not exists public.s5_auditorias (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  area_id integer not null references public.s5_areas(id),
  numero_auditoria integer not null check (numero_auditoria between 1 and 99),
  tipo text not null check (tipo in ('Opinada', 'Inopinada')),
  fecha date not null,
  semana integer,
  campana text not null,
  planta text not null,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'cerrada', 'anulada')),
  motivo_anulacion text,
  auditor text,
  cerrada_en timestamptz,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists s5_auditorias_numero_uidx
  on public.s5_auditorias (area_id, campana, numero_auditoria) where estado <> 'anulada';
create index if not exists s5_auditorias_estado_idx on public.s5_auditorias (estado, fecha desc);

create or replace function public.fn_s5_auditoria_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is null then
    new.codigo := 'A5S-' || lpad(nextval('public.s5_auditorias_codigo_seq')::text, 5, '0');
  end if;
  new.semana := extract(week from new.fecha)::int;  -- WEEKNUM(fecha, 21) de la hoja BD
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_s5_auditoria_antes on public.s5_auditorias;
create trigger trg_s5_auditoria_antes before insert or update on public.s5_auditorias
  for each row execute function public.fn_s5_auditoria_antes();

create table if not exists public.s5_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.s5_auditorias(id),
  zona_id integer not null references public.s5_zonas(id),
  estado text not null default 'en_curso' check (estado in ('en_curso', 'completa')),
  completada_en timestamptz,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (auditoria_id, zona_id)
);

create table if not exists public.s5_puntajes (
  evaluacion_id uuid not null references public.s5_evaluaciones(id),
  item_id integer not null references public.s5_items(id),
  puntaje numeric(3,1) not null check (puntaje in (0, 0.5, 1, 1.5, 2)),
  puntaje_original numeric(3,1) not null check (puntaje_original in (0, 0.5, 1, 1.5, 2)),
  corregido_por uuid references public.perfiles(id),
  corregido_en timestamptz,
  motivo_correccion text,
  observacion_id uuid,
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now(),
  primary key (evaluacion_id, item_id)
);

-- id lo genera el celular: reintentar un guardado no duplica la observación.
create table if not exists public.s5_observaciones (
  id uuid primary key,
  auditoria_id uuid not null references public.s5_auditorias(id),
  zona_id integer not null references public.s5_zonas(id),
  numero integer not null,
  fecha_registro date not null,
  semana integer,
  s_referencia smallint check (s_referencia between 1 and 5),
  descripcion text not null check (btrim(descripcion) <> ''),
  accion_correctiva text,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación')),
  fecha_cierre date,
  foto_antes text not null,
  foto_despues text,
  auditor text,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);
create index if not exists s5_observaciones_zona_idx on public.s5_observaciones (zona_id, numero);
create index if not exists s5_observaciones_auditoria_idx on public.s5_observaciones (auditoria_id);
create index if not exists s5_observaciones_estado_idx on public.s5_observaciones (estado);
alter table public.s5_puntajes drop constraint if exists s5_puntajes_observacion_fk;
alter table public.s5_puntajes add constraint s5_puntajes_observacion_fk
  foreign key (observacion_id) references public.s5_observaciones(id);

create table if not exists public.s5_seguimientos (
  id bigserial primary key,
  observacion_id uuid not null references public.s5_observaciones(id),
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  nota text,
  foto text,
  cambios_puntaje jsonb not null default '[]'::jsonb,
  usuario_id uuid references public.perfiles(id),
  usuario_nombre text
);
create index if not exists s5_seguimientos_obs_idx on public.s5_seguimientos (observacion_id, fecha);

-- ================================================================ parámetros
create or replace function public.fn_asegurar_parametros()
returns void language sql security definer set search_path = public as $$
  insert into public.parametros (clave, valor, descripcion) values
    ('UMBRAL_TIEMPO_CICLO_MIN', '480', 'Minutos máximos de un ciclo completo; por encima se excluye del promedio por posible error de digitación.'),
    ('SHEETS_SYNC_MINUTOS', '60', 'Cada cuántos minutos se sincroniza el espejo de auditoría en Google Sheets.'),
    ('ULTIMA_SYNC_SHEETS', '', 'Marca de tiempo de la última sincronización exitosa hacia Sheets.'),
    ('ULTIMO_ERROR_SYNC_SHEETS', '', 'Último error de sincronización hacia Sheets (vacío si todo bien).'),
    ('SHEETS_ID', '', 'ID o enlace de la Google Sheet destino (compartida como Editor con la cuenta de servicio).'),
    ('GOOGLE_SA_EMAIL', '', 'Correo de la cuenta de servicio de Google cargada (dato público, no es secreto).'),
    ('ULTIMO_INTENTO_SYNC_SHEETS', '', 'Marca de tiempo del último intento de sincronización (exitoso o no).'),
    ('S5_DIAS_CORRECCION', '3', 'Auditoría 5S: días desde la fecha de auditoría en que un auditor puede corregir puntajes; después solo un administrador.'),
    ('S5_CAMPANA', 'Arándano 2025', 'Auditoría 5S: campaña que se propone al iniciar una auditoría.'),
    ('S5_PLANTA', 'Planta Don Carlos', 'Auditoría 5S: planta que se propone al iniciar una auditoría.')
  on conflict (clave) do nothing;
$$;
revoke execute on function public.fn_asegurar_parametros() from public, anon, authenticated;
select public.fn_asegurar_parametros();

create or replace function public.fn_s5_dias_correccion()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(coalesce(nullif((select valor from public.parametros where clave = 'S5_DIAS_CORRECCION'), '')::integer, 3), 0);
$$;

create or replace function public.fn_s5_mi_nombre()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nombre, usuario) from public.perfiles where id = auth.uid();
$$;

-- ================================================================ lecturas (invoker: respetan RLS)
/** Hoja BD: una fila por zona y S. Las columnas extra van al final. */
create or replace function public.fn_s5_bd()
returns table (
  fecha date, campana text, planta text, semana integer, numero_auditoria integer, tipo_auditoria text,
  area text, numero_zona integer, sub_area text, zona text, s text,
  i1 numeric, i2 numeric, i3 numeric, i4 numeric, i5 numeric, i6 numeric, suma numeric, puntaje numeric,
  codigo text, estado_auditoria text, estado_zona text
) language sql stable set search_path = public as $$
  select a.fecha, a.campana, a.planta, a.semana, a.numero_auditoria, a.tipo,
         ar.nombre, z.numero, z.nombre, z.numero || '. ' || z.nombre, i.s || 'S',
         max(p.puntaje) filter (where i.numero = 1), max(p.puntaje) filter (where i.numero = 2),
         max(p.puntaje) filter (where i.numero = 3), max(p.puntaje) filter (where i.numero = 4),
         max(p.puntaje) filter (where i.numero = 5), max(p.puntaje) filter (where i.numero = 6),
         sum(p.puntaje), sum(p.puntaje) / (count(*) * 2),
         a.codigo, a.estado, e.estado
  from public.s5_puntajes p
  join public.s5_items i on i.id = p.item_id
  join public.s5_evaluaciones e on e.id = p.evaluacion_id
  join public.s5_auditorias a on a.id = e.auditoria_id
  join public.s5_zonas z on z.id = e.zona_id
  join public.s5_areas ar on ar.id = a.area_id
  where a.estado <> 'anulada'
  group by a.id, e.id, z.id, ar.id, i.s
  order by ar.orden, a.fecha, a.numero_auditoria, z.numero, i.s;
$$;

/** % por S, total de zona (promedio de las 5 S) y madurez. p_auditoria null = todas. */
create or replace function public.fn_s5_resumen(p_auditoria uuid default null)
returns table (
  auditoria_id uuid, codigo text, fecha date, semana integer, numero_auditoria integer, tipo text,
  estado_auditoria text, area_id integer, area text, evaluacion_id uuid, zona_id integer, numero_zona integer,
  zona text, estado_zona text, p1 numeric, p2 numeric, p3 numeric, p4 numeric, p5 numeric, total numeric, madurez text
) language sql stable set search_path = public as $$
  with por_s as (
    select pe.id as ev_id, it.s, sum(pu.puntaje) / (count(*) * 2) as pct
    from public.s5_evaluaciones pe
    join public.s5_puntajes pu on pu.evaluacion_id = pe.id
    join public.s5_items it on it.id = pu.item_id
    where p_auditoria is null or pe.auditoria_id = p_auditoria
    group by pe.id, it.s
  ), ev as (
    select ev_id,
           max(pct) filter (where s = 1) as p1, max(pct) filter (where s = 2) as p2,
           max(pct) filter (where s = 3) as p3, max(pct) filter (where s = 4) as p4,
           max(pct) filter (where s = 5) as p5,
           case when count(*) = 5 then avg(pct) end as total
    from por_s group by ev_id
  )
  select a.id, a.codigo, a.fecha, a.semana, a.numero_auditoria, a.tipo, a.estado, ar.id, ar.nombre,
         e.id, z.id, z.numero, z.nombre, e.estado, ev.p1, ev.p2, ev.p3, ev.p4, ev.p5, ev.total,
         public.fn_s5_madurez(ev.total)
  from public.s5_evaluaciones e
  join public.s5_auditorias a on a.id = e.auditoria_id
  join public.s5_zonas z on z.id = e.zona_id
  join public.s5_areas ar on ar.id = a.area_id
  left join ev on ev.ev_id = e.id
  where a.estado <> 'anulada' and (p_auditoria is null or a.id = p_auditoria)
  order by a.fecha desc, ar.orden, a.numero_auditoria, z.numero;
$$;

/** Estado de una evaluación (interna: la devuelven las RPC). */
create or replace function public.fn_s5_estado_evaluacion(p_evaluacion uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with por_s as (
    select it.s, sum(pu.puntaje) as suma, count(*) as n,
           count(*) >= (select count(*) from public.s5_items i2 where i2.s = it.s and i2.activo) as completa
    from public.s5_puntajes pu join public.s5_items it on it.id = pu.item_id
    where pu.evaluacion_id = p_evaluacion
    group by it.s
  )
  select jsonb_build_object(
    'id', e.id, 'auditoria_id', e.auditoria_id, 'zona_id', e.zona_id, 'estado', e.estado,
    'porcentajes', coalesce((select jsonb_object_agg(s::text, suma / (n * 2)) from por_s), '{}'::jsonb),
    'completas', coalesce((select jsonb_agg(s order by s) from por_s where completa), '[]'::jsonb),
    'total', (select case when count(*) = 5 then avg(suma / (n * 2)) end from por_s where completa))
  from public.s5_evaluaciones e where e.id = p_evaluacion;
$$;

-- ================================================================ RPC: auditoría
create or replace function public.rpc_s5_iniciar_auditoria(p jsonb)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare
  v public.s5_auditorias; v_area public.s5_areas;
  v_tipo text; v_fecha date; v_campana text; v_planta text; v_num integer;
begin
  perform public.exigir_rol('admin', 'captura');
  perform public.fn_asegurar_parametros();

  select * into v_area from public.s5_areas where id = nullif(p->>'area_id', '')::integer;
  if v_area.id is null or not v_area.activo then raise exception 'Elige un área válida.'; end if;

  v_tipo := coalesce(nullif(p->>'tipo', ''), 'Inopinada');
  if v_tipo not in ('Opinada', 'Inopinada') then raise exception 'Tipo de auditoría inválido: %.', v_tipo; end if;

  v_fecha := coalesce(nullif(p->>'fecha', '')::date, public.fn_hoy_lima());
  if v_fecha > public.fn_hoy_lima() then raise exception 'La fecha de la auditoría no puede estar en el futuro.'; end if;

  v_campana := coalesce(nullif(btrim(p->>'campana'), ''), nullif((select valor from public.parametros where clave = 'S5_CAMPANA'), ''));
  v_planta := coalesce(nullif(btrim(p->>'planta'), ''), nullif((select valor from public.parametros where clave = 'S5_PLANTA'), ''));
  if v_campana is null or v_planta is null then raise exception 'Falta la campaña o la planta.'; end if;

  v_num := coalesce(nullif(p->>'numero_auditoria', '')::integer,
    (select coalesce(max(numero_auditoria), 0) + 1 from public.s5_auditorias
     where area_id = v_area.id and campana = v_campana and estado <> 'anulada'));
  if exists (select 1 from public.s5_auditorias where area_id = v_area.id and campana = v_campana
             and numero_auditoria = v_num and estado <> 'anulada') then
    raise exception 'Ya existe la auditoría N° % de % en la campaña %.', v_num, v_area.nombre, v_campana;
  end if;

  insert into public.s5_auditorias (area_id, numero_auditoria, tipo, fecha, campana, planta, auditor, creado_por, actualizado_por)
  values (v_area.id, v_num, v_tipo, v_fecha, v_campana, v_planta, public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into v;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Auditoría iniciada', v.codigo || ' · ' || v_area.nombre || ' N° ' || v_num);
  return v;
end;
$$;

create or replace function public.rpc_s5_guardar_s(p_auditoria uuid, p_zona integer, p_s integer, p_puntajes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.s5_auditorias; z public.s5_zonas; e public.s5_evaluaciones; v_faltan text; v_invalidos text;
begin
  perform public.exigir_rol('admin', 'captura');
  if p_s is null or p_s not between 1 and 5 then raise exception 'S inválida: %.', p_s; end if;

  select * into a from public.s5_auditorias where id = p_auditoria;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado <> 'en_curso' then
    raise exception 'La auditoría % está %: los puntajes se corrigen registrando un seguimiento en una observación.', a.codigo, a.estado;
  end if;
  select * into z from public.s5_zonas where id = p_zona;
  if z.id is null or z.area_id <> a.area_id then raise exception 'La zona no pertenece al área de esta auditoría.'; end if;
  if jsonb_typeof(p_puntajes) is distinct from 'array' then raise exception 'Se esperaba la lista de puntajes.'; end if;

  select string_agg(format('%s=%s', coalesce(x->>'item_id', '?'), coalesce(x->>'puntaje', '?')), ', ') into v_invalidos
  from jsonb_array_elements(p_puntajes) x
  left join public.s5_items i
    on i.id = case when x->>'item_id' ~ '^[0-9]+$' then (x->>'item_id')::integer end
  where i.id is null or i.s <> p_s
     or case when x->>'puntaje' ~ '^[0-9]+(\.[0-9]+)?$' then (x->>'puntaje')::numeric not in (0, 0.5, 1, 1.5, 2) else true end;
  if v_invalidos is not null then raise exception 'Puntajes inválidos para %S: %.', p_s, v_invalidos; end if;

  select string_agg(i.numero::text, ', ' order by i.numero) into v_faltan
  from public.s5_items i
  where i.s = p_s and i.activo
    and not exists (select 1 from jsonb_array_elements(p_puntajes) x where x->>'item_id' = i.id::text);
  if v_faltan is not null then raise exception 'Falta puntuar en %S los ítems: %.', p_s, v_faltan; end if;

  insert into public.s5_evaluaciones (auditoria_id, zona_id, creado_por) values (a.id, z.id, auth.uid())
    on conflict (auditoria_id, zona_id) do nothing;
  select * into e from public.s5_evaluaciones where auditoria_id = a.id and zona_id = z.id for update;

  -- Zona ya cerrada: solo se reescribe el mismo día de la auditoría; después, con seguimiento (deja historial).
  if e.estado = 'completa' and public.fn_hoy_lima() > a.fecha then
    raise exception 'La zona % ya se completó. Para cambiar un puntaje registra un seguimiento en una observación (queda el historial).', z.numero || '. ' || z.nombre;
  end if;

  insert into public.s5_puntajes (evaluacion_id, item_id, puntaje, puntaje_original, actualizado_por)
  select distinct on ((x->>'item_id')::integer) e.id, (x->>'item_id')::integer, (x->>'puntaje')::numeric, (x->>'puntaje')::numeric, auth.uid()
  from jsonb_array_elements(p_puntajes) x
  on conflict (evaluacion_id, item_id) do update set
    puntaje = excluded.puntaje, puntaje_original = excluded.puntaje,
    corregido_por = null, corregido_en = null, motivo_correccion = null, observacion_id = null,
    actualizado_por = auth.uid(), actualizado_en = now();

  update public.s5_evaluaciones set actualizado_en = now() where id = e.id;
  update public.s5_auditorias set actualizado_por = auth.uid() where id = a.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Puntajes ' || p_s || 'S', a.codigo || ' · zona ' || z.numero);
  return public.fn_s5_estado_evaluacion(e.id);
end;
$$;

create or replace function public.rpc_s5_completar_zona(p_evaluacion uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.s5_evaluaciones; a public.s5_auditorias; v jsonb; v_faltan text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into e from public.s5_evaluaciones where id = p_evaluacion for update;
  if e.id is null then raise exception 'No existe la evaluación.'; end if;
  select * into a from public.s5_auditorias where id = e.auditoria_id;
  if a.estado <> 'en_curso' then raise exception 'La auditoría % está %.', a.codigo, a.estado; end if;

  v := public.fn_s5_estado_evaluacion(e.id);
  select string_agg(g || 'S', ', ' order by g) into v_faltan
  from generate_series(1, 5) g where not ((v->'completas') @> to_jsonb(g));
  if v_faltan is not null then raise exception 'Faltan S por evaluar: %.', v_faltan; end if;

  update public.s5_evaluaciones set estado = 'completa', completada_en = coalesce(completada_en, now()), actualizado_en = now()
    where id = e.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Zona completada', a.codigo || ' · ' || round(((v->>'total')::numeric) * 100, 1) || '%');
  return public.fn_s5_estado_evaluacion(e.id);
end;
$$;

create or replace function public.rpc_s5_cerrar_auditoria(p_auditoria uuid)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare a public.s5_auditorias; v_faltan text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into a from public.s5_auditorias where id = p_auditoria for update;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado <> 'en_curso' then raise exception 'La auditoría % ya está %.', a.codigo, a.estado; end if;

  select string_agg(z.numero || '. ' || z.nombre, ', ' order by z.numero) into v_faltan
  from public.s5_zonas z
  where z.area_id = a.area_id and z.activo
    and not exists (select 1 from public.s5_evaluaciones e where e.auditoria_id = a.id and e.zona_id = z.id and e.estado = 'completa');
  if v_faltan is not null and public.rol_actual() is distinct from 'admin' then
    raise exception 'Faltan completar zonas: %. Un administrador puede cerrarla igual.', v_faltan;
  end if;

  update public.s5_auditorias set estado = 'cerrada', cerrada_en = now(), actualizado_por = auth.uid()
    where id = a.id returning * into a;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Auditoría cerrada', a.codigo || coalesce(' · sin: ' || v_faltan, ''));
  return a;
end;
$$;

create or replace function public.rpc_s5_reabrir_auditoria(p_auditoria uuid)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare a public.s5_auditorias;
begin
  perform public.exigir_rol('admin');
  update public.s5_auditorias set estado = 'en_curso', cerrada_en = null, actualizado_por = auth.uid()
    where id = p_auditoria and estado = 'cerrada' returning * into a;
  if a.id is null then raise exception 'Solo se reabre una auditoría cerrada.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Auditoría reabierta', a.codigo);
  return a;
end;
$$;

create or replace function public.rpc_s5_anular_auditoria(p_auditoria uuid, p_motivo text)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare a public.s5_auditorias; v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Auditoría de prueba');
begin
  perform public.exigir_rol('admin');
  update public.s5_auditorias set estado = 'anulada', motivo_anulacion = v_motivo, actualizado_por = auth.uid()
    where id = p_auditoria and estado <> 'anulada' returning * into a;
  if a.id is null then raise exception 'La auditoría no existe o ya está anulada.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Auditoría anulada', a.codigo || ' · ' || v_motivo);
  return a;
end;
$$;

-- ================================================================ RPC: observaciones
create or replace function public.rpc_s5_guardar_observacion(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_sref smallint;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  v_id := (p->>'id')::uuid;
  if coalesce(btrim(p->>'descripcion'), '') = '' then raise exception 'Describe la observación.'; end if;
  v_sref := case when coalesce(p->>'s_referencia', '') ~ '^[1-5]$' then (p->>'s_referencia')::smallint end;

  select * into o from public.s5_observaciones where id = v_id for update;
  if o.id is not null then
    if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
      raise exception 'La observación N° % ya no se puede editar (plazo vencido). Registra un seguimiento.', o.numero;
    end if;
    update public.s5_observaciones set
      descripcion = btrim(p->>'descripcion'),
      accion_correctiva = nullif(btrim(p->>'accion_correctiva'), ''),
      s_referencia = v_sref,
      foto_antes = coalesce(nullif(p->>'foto_antes', ''), foto_antes),
      actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id returning * into o;
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AUDITORIA_5S', 'Observación editada', 'N° ' || o.numero || ' · zona ' || o.zona_id);
    return o;
  end if;

  select * into a from public.s5_auditorias where id = case when coalesce(p->>'auditoria_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'auditoria_id')::uuid end;
  if a.id is null or a.estado = 'anulada' then raise exception 'La auditoría no existe o está anulada.'; end if;
  select * into z from public.s5_zonas where id = case when coalesce(p->>'zona_id', '') ~ '^[0-9]+$' then (p->>'zona_id')::integer end;
  if z.id is null or z.area_id <> a.area_id then raise exception 'La zona no pertenece al área de esta auditoría.'; end if;
  if coalesce(p->>'foto_antes', '') = '' then raise exception 'Toma la foto «Antes» de la observación.'; end if;
  v_estado := coalesce(nullif(p->>'estado', ''), 'Pendiente');
  if v_estado not in ('Pendiente', 'Recomendación') then
    raise exception 'Una observación nueva empieza como Pendiente o Recomendación.';
  end if;

  perform pg_advisory_xact_lock(hashtext('s5_observaciones_zona'), z.id);
  select coalesce(max(o2.numero), 0) + 1 into v_num
  from public.s5_observaciones o2 join public.s5_auditorias a2 on a2.id = o2.auditoria_id
  where o2.zona_id = z.id and a2.estado <> 'anulada';

  insert into public.s5_observaciones (id, auditoria_id, zona_id, numero, fecha_registro, semana, s_referencia,
    descripcion, accion_correctiva, estado, foto_antes, auditor, creado_por, actualizado_por)
  values (v_id, a.id, z.id, v_num, a.fecha, public.weeknum_excel_sistema1(a.fecha), v_sref,
    btrim(p->>'descripcion'), nullif(btrim(p->>'accion_correctiva'), ''), v_estado, p->>'foto_antes',
    public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, usuario_id, usuario_nombre)
    values (o.id, null, o.estado, 'Registro inicial', o.foto_antes, auth.uid(), o.auditor);
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación registrada', a.codigo || ' · ' || z.numero || '. ' || z.nombre || ' · N° ' || v_num);
  return o;
end;
$$;

/** Seguimiento: cambia estado, agrega nota/foto Después y, opcionalmente, sobrescribe puntajes con historial. */
create or replace function public.rpc_s5_seguimiento(p_observacion uuid, p_estado text, p_nota text default null,
                                                     p_foto text default null, p_cambios jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; e public.s5_evaluaciones; it public.s5_items;
  x jsonb; v_estado text; v_anterior text; v_actual numeric; v_nuevo numeric; v_limite date;
  v_cambios jsonb := '[]'::jsonb; v_lista jsonb := coalesce(p_cambios, '[]'::jsonb); v_nota text := nullif(btrim(p_nota), '');
begin
  perform public.exigir_rol('admin', 'captura');
  select * into o from public.s5_observaciones where id = p_observacion for update;
  if o.id is null then raise exception 'No existe la observación.'; end if;
  select * into a from public.s5_auditorias where id = o.auditoria_id;
  if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;

  v_anterior := o.estado;
  v_estado := coalesce(nullif(p_estado, ''), o.estado);
  if v_estado not in ('Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación') then
    raise exception 'Estado inválido: %.', v_estado;
  end if;
  if jsonb_typeof(v_lista) <> 'array' then raise exception 'Se esperaba la lista de cambios de puntaje.'; end if;

  if jsonb_array_length(v_lista) > 0 then
    v_limite := a.fecha + public.fn_s5_dias_correccion();
    if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > v_limite then
      raise exception 'El plazo para corregir puntajes de % venció el % (% días desde la auditoría). Pide a un administrador que lo corrija.',
        a.codigo, to_char(v_limite, 'DD/MM/YYYY'), public.fn_s5_dias_correccion();
    end if;
    select * into e from public.s5_evaluaciones where auditoria_id = a.id and zona_id = o.zona_id;
    if e.id is null then raise exception 'Esta zona aún no tiene puntajes en la auditoría %.', a.codigo; end if;

    for x in select value from jsonb_array_elements(v_lista) loop
      if coalesce(x->>'item_id', '') !~ '^[0-9]+$' or coalesce(x->>'puntaje', '') !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'Cambio de puntaje inválido: %.', x;
      end if;
      v_nuevo := (x->>'puntaje')::numeric;
      if v_nuevo not in (0, 0.5, 1, 1.5, 2) then raise exception 'Puntaje inválido: %.', v_nuevo; end if;
      select * into it from public.s5_items where id = (x->>'item_id')::integer;
      if it.id is null then raise exception 'Ítem inexistente: %.', x->>'item_id'; end if;
      select puntaje into v_actual from public.s5_puntajes where evaluacion_id = e.id and item_id = it.id for update;
      if not found then raise exception 'El ítem %S-% no fue puntuado en la auditoría %.', it.s, it.numero, a.codigo; end if;
      if v_actual <> v_nuevo then
        update public.s5_puntajes set
          puntaje = v_nuevo, corregido_por = auth.uid(), corregido_en = now(), observacion_id = o.id,
          motivo_correccion = left('Obs. N° ' || o.numero || coalesce(': ' || v_nota, ''), 500),
          actualizado_por = auth.uid(), actualizado_en = now()
        where evaluacion_id = e.id and item_id = it.id;
        v_cambios := v_cambios || jsonb_build_object('item_id', it.id, 's', it.s, 'numero', it.numero, 'antes', v_actual, 'despues', v_nuevo);
      end if;
    end loop;
  end if;

  if v_estado = v_anterior and v_nota is null and coalesce(p_foto, '') = '' and jsonb_array_length(v_cambios) = 0 then
    raise exception 'No hay cambios que registrar.';
  end if;

  update public.s5_observaciones set
    estado = v_estado,
    fecha_cierre = case when v_estado = 'Cerrado' then coalesce(fecha_cierre, public.fn_hoy_lima())
                        when v_estado = 'Pendiente' then null else fecha_cierre end,
    foto_despues = coalesce(nullif(p_foto, ''), foto_despues),
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = o.id returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, cambios_puntaje, usuario_id, usuario_nombre)
    values (o.id, v_anterior, v_estado, v_nota, nullif(p_foto, ''), v_cambios, auth.uid(), public.fn_s5_mi_nombre());
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Seguimiento', a.codigo || ' · obs N° ' || o.numero || ' · ' || v_anterior || ' → ' || v_estado ||
            case when jsonb_array_length(v_cambios) > 0 then ' · ' || jsonb_array_length(v_cambios) || ' puntaje(s) corregido(s)' else '' end);

  return jsonb_build_object('observacion', to_jsonb(o), 'cambios', v_cambios,
    'evaluacion', case when e.id is not null then public.fn_s5_estado_evaluacion(e.id) end);
end;
$$;

-- ================================================================ RPC: catálogo (admin)
create or replace function public.rpc_s5_guardar_area(p jsonb)
returns public.s5_areas language plpgsql security definer set search_path = public as $$
declare v public.s5_areas;
begin
  perform public.exigir_rol('admin');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    update public.s5_areas set
      nombre = coalesce(nullif(btrim(p->>'nombre'), ''), nombre),
      orden = coalesce(nullif(p->>'orden', '')::integer, orden),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el área.'; end if;
  else
    if coalesce(btrim(p->>'nombre'), '') = '' then raise exception 'Escribe el nombre del área.'; end if;
    insert into public.s5_areas (nombre, orden) values (btrim(p->>'nombre'), coalesce((select max(orden) + 1 from public.s5_areas), 1))
      returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Área guardada', v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ya existe un área con ese nombre.';
end;
$$;

create or replace function public.rpc_s5_guardar_zona(p jsonb)
returns public.s5_zonas language plpgsql security definer set search_path = public as $$
declare v public.s5_zonas;
begin
  perform public.exigir_rol('admin');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    update public.s5_zonas set
      numero = coalesce(nullif(p->>'numero', '')::integer, numero),
      nombre = coalesce(nullif(btrim(p->>'nombre'), ''), nombre),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe la zona.'; end if;
  else
    if coalesce(btrim(p->>'nombre'), '') = '' then raise exception 'Escribe el nombre de la zona.'; end if;
    if not exists (select 1 from public.s5_areas where id = nullif(p->>'area_id', '')::integer) then raise exception 'Elige el área.'; end if;
    insert into public.s5_zonas (area_id, numero, nombre)
    values ((p->>'area_id')::integer,
            coalesce(nullif(p->>'numero', '')::integer, (select coalesce(max(numero), 0) + 1 from public.s5_zonas where area_id = (p->>'area_id')::integer)),
            btrim(p->>'nombre'))
    returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Zona guardada', v.numero || '. ' || v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ese número de zona ya existe en el área.';
end;
$$;

create or replace function public.rpc_s5_guardar_item(p jsonb)
returns public.s5_items language plpgsql security definer set search_path = public as $$
declare v public.s5_items; v_s smallint; v_num smallint;
begin
  perform public.exigir_rol('admin');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    update public.s5_items set
      texto = coalesce(nullif(btrim(p->>'texto'), ''), texto),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el ítem.'; end if;
  else
    v_s := case when coalesce(p->>'s', '') ~ '^[1-5]$' then (p->>'s')::smallint end;
    if v_s is null then raise exception 'Elige la S del ítem.'; end if;
    if coalesce(btrim(p->>'texto'), '') = '' then raise exception 'Escribe el texto del ítem.'; end if;
    select coalesce(max(numero), 0) + 1 into v_num from public.s5_items where s = v_s;
    if v_num > 6 then raise exception 'Cada S admite hasta 6 ítems (columnas 1–6 de la hoja BD).'; end if;
    insert into public.s5_items (s, numero, texto) values (v_s, v_num, btrim(p->>'texto')) returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Ítem guardado', v.s || 'S-' || v.numero);
  return v;
end;
$$;

-- ================================================================ RLS y protecciones
do $$
declare t text;
begin
  foreach t in array array['s5_areas', 's5_zonas', 's5_items', 's5_auditorias', 's5_evaluaciones', 's5_puntajes', 's5_observaciones', 's5_seguimientos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rol_actual() in (''admin'', ''captura'', ''visor''))', t || '_select', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists trg_bloquear_truncate on public.%I', t);
    execute format('create trigger trg_bloquear_truncate before truncate on public.%I for each statement execute function public.fn_bloquear_vaciado()', t);
  end loop;
end $$;

create or replace function public.fn_s5_bloquear_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'No se eliminan filas de %: %', tg_table_name,
    case when tg_table_name in ('s5_areas', 's5_zonas', 's5_items') then 'desactívalo desde Auditoría 5S → Catálogo.'
         else 'anula la auditoría desde la app; el historial se conserva.' end;
end;
$$;
revoke execute on function public.fn_s5_bloquear_borrado() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['s5_areas', 's5_zonas', 's5_items', 's5_auditorias', 's5_evaluaciones', 's5_puntajes', 's5_observaciones', 's5_seguimientos'] loop
    execute format('drop trigger if exists trg_s5_bloquear_borrado on public.%I', t);
    execute format('create trigger trg_s5_bloquear_borrado before delete on public.%I for each row execute function public.fn_s5_bloquear_borrado()', t);
  end loop;
end $$;

-- ================================================================ fotos (Storage privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auditoria-5s', 'auditoria-5s', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists s5_fotos_insertar on storage.objects;
create policy s5_fotos_insertar on storage.objects for insert to authenticated
  with check (bucket_id = 'auditoria-5s' and public.rol_actual() in ('admin', 'captura'));
drop policy if exists s5_fotos_leer on storage.objects;
create policy s5_fotos_leer on storage.objects for select to authenticated
  using (bucket_id = 'auditoria-5s' and public.rol_actual() in ('admin', 'captura', 'visor'));

-- ================================================================ permisos de funciones
revoke execute on function public.fn_hoy_lima() from public, anon;
revoke execute on function public.fn_s5_madurez(numeric) from public, anon;
revoke execute on function public.fn_s5_auditoria_antes() from public, anon, authenticated;
revoke execute on function public.fn_s5_dias_correccion() from public, anon, authenticated;
revoke execute on function public.fn_s5_mi_nombre() from public, anon, authenticated;
revoke execute on function public.fn_s5_estado_evaluacion(uuid) from public, anon, authenticated;
revoke execute on function public.fn_s5_bd() from public, anon;
revoke execute on function public.fn_s5_resumen(uuid) from public, anon;
grant execute on function public.fn_hoy_lima() to authenticated, service_role;
grant execute on function public.fn_s5_madurez(numeric) to authenticated, service_role;
grant execute on function public.fn_s5_bd() to authenticated, service_role;
grant execute on function public.fn_s5_resumen(uuid) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'rpc_s5_iniciar_auditoria(jsonb)', 'rpc_s5_guardar_s(uuid, integer, integer, jsonb)', 'rpc_s5_completar_zona(uuid)',
    'rpc_s5_cerrar_auditoria(uuid)', 'rpc_s5_reabrir_auditoria(uuid)', 'rpc_s5_anular_auditoria(uuid, text)',
    'rpc_s5_guardar_observacion(jsonb)', 'rpc_s5_seguimiento(uuid, text, text, text, jsonb)',
    'rpc_s5_guardar_area(jsonb)', 'rpc_s5_guardar_zona(jsonb)', 'rpc_s5_guardar_item(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ================================================================ semilla (de los Excel de la tercera auditoría)
insert into public.s5_areas (nombre, orden, activo) values
  ('Producción', 1, true), ('Frío', 2, true), ('Mantenimiento', 3, true), ('Manejo de Información', 4, true),
  ('Calidad', 5, true), ('Despacho', 6, true), ('Ingeniería', 7, false), ('Sanitización', 8, true), ('Almacén', 9, false)
on conflict (nombre) do nothing;

insert into public.s5_zonas (area_id, numero, nombre)
select a.id, z.numero, z.nombre
from (values
  ('Producción', 1, 'Recepción y Gasificado'), ('Producción', 2, 'Pesado'), ('Producción', 3, 'Zona de Lavado de Jabas'),
  ('Producción', 4, 'Sellado'), ('Producción', 5, 'Mezzanine'), ('Producción', 6, 'Almacén de EPPS'),
  ('Frío', 1, 'Antecámara'), ('Frío', 2, 'Zona de pre enfriado'), ('Frío', 3, 'Túneles y cámaras'),
  ('Mantenimiento', 1, 'Oficina'), ('Mantenimiento', 2, 'SADEMA'), ('Mantenimiento', 3, 'Zona de carga'),
  ('Mantenimiento', 4, 'Almacén'), ('Mantenimiento', 5, 'Taller de soldadura y pintura'),
  ('Manejo de Información', 1, 'Estación pesado - Recepción'), ('Manejo de Información', 2, 'Estación Etiquetado - Pesado'),
  ('Manejo de Información', 3, 'Estación Etiquetado - Embalaje'), ('Manejo de Información', 4, 'Almacén Temporal'),
  ('Calidad', 1, 'Zona de inspección'),
  ('Despacho', 1, 'Oficina'), ('Despacho', 2, 'Sala de Despacho'), ('Despacho', 3, 'SENASA'),
  ('Sanitización', 1, 'Lavandería'), ('Sanitización', 2, 'Zona de Ingreso'), ('Sanitización', 3, 'Zonas de Proceso')
) as z(area, numero, nombre)
join public.s5_areas a on a.nombre = z.area
on conflict (area_id, numero) do nothing;

insert into public.s5_items (s, numero, texto) values
  (1, 1, 'Solo hay elementos necesarios para el trabajo (no existen elementos inutilizados, obsoletos, defectuosos).'),
  (1, 2, 'Los elementos estan en las cantidades necesarias (no hay acumulación en exceso)'),
  (1, 3, 'Los elementos innecesarios son retirados a la zona de merma, cuarentena o almacenamiento temporal.'),
  (1, 4, 'Los pasillos se encuentran libres de elementos innecesarios que permita realizar las actividades con normalidad y salvaguardando la seguridad.'),
  (1, 5, 'Existen objetos personales en la zona de trabajo.'),
  (2, 1, 'Se usan líneas trazadas en el piso para delimitar pasillos, áreas de trabajo, máquinas, equipos, mesas, muebles, estantes, etc.'),
  (2, 2, 'Se usan letreros y rótulos para identificar las áreas, sub áreas, zonas y estaciones; asi como también coincide el rótulo con lo almacenado.'),
  (2, 3, 'Los materiales, herramientas e insumos cuentan con un lugar asignado apropiado según la frecuencia de uso.'),
  (2, 4, 'Cada cajón, cajas de herramientas, nivel de muebles y racks tiene un listado actualizado de artículos necesarios e indica las cantidades permitidas.'),
  (2, 5, 'Los archivos físicos estan ordenados y clasificados de tal manera que agiliza el trabajo diario.'),
  (3, 1, 'Los pisos, paredes, tuberías y techo se encuentran libre de polvo acumulado, manchas, huecos etc.'),
  (3, 2, 'Las máquinas o equipos están limpios, libres de manchas de aceite, polvo o residuos.'),
  (3, 3, 'Los letreros, avisos, rótulos y planos se encuentran libre de polvo, manchas, roturas, despintados, entre otros.'),
  (3, 4, 'Existe y se cumple el cronograma de limpieza.'),
  (3, 5, 'Se cuenta con los elementos de limpieza y estan en optimas condiciones.'),
  (3, 6, 'Se tiene suficientes tachos de residuos debidamente identificados y se realiza una correcta segregación.'),
  (4, 1, 'Las áreas e instalaciones estan debidamente identificadas con los rótulos y letreros. (respetando las reglas de estandarización, en modelo, color y tamaño)'),
  (4, 2, 'Se cuenta con delimitación de acuerdo a colores estandarizados (zona de peligro, de tránsito, etc)'),
  (4, 3, 'Existen procedimientos, instructivos y formatos del área estandarizados vigentes, difundidos y puestos en práctica.'),
  (4, 4, 'Hay controles visuales en el lugar de trabajo como Guias de labor, Lups o estándares que facilitan el trabajo.'),
  (4, 5, 'El personal usa correctamente el uniforme de trabajo y EPP''s.'),
  (5, 1, 'El personal conoce la importancia de la implementación y se garantiza la continuidad de 5S.'),
  (5, 2, 'Se cumple con la subsanación de hallazgos (levantamiento de observaciones) realizado en conjunto con el personal.'),
  (5, 3, 'Se cuenta con el panel de 5 S y se encuentra actualizado.'),
  (5, 4, 'Existe la norma y el hábito para devolver las cosas al lugar donde se guardan.'),
  (5, 5, 'Se realiza el Barrido de 5S con el personal con la finalidad de que ellos sean participes y se comprometan en todo momento.')
on conflict (s, numero) do nothing;
