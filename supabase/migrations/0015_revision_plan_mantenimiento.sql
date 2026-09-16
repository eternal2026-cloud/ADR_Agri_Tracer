-- 0015: Módulo Revisión del Plan de Mantenimiento
--
-- Réplica del proceso manual del Excel «Plan de <mes>.xlsx»:
--   · La hoja del mes (MARZO, ABRIL…) trae una OT por fila: # OT, PLANTA, RESPONSABLE,
--     UBICACIÓN, SUB-EQUIPOS, DESCRIPCIÓN, PERSONAS y las 4 fechas plan/real.
--   · Hoja1 es una tabla dinámica Planta > Responsable con N° de OT, OBSERVA y NO CONFORMIDAD.
--   · Cada carga del Excel es una revisión independiente (mp_revisiones) con sus OT (mp_ot).
--     El hallazgo (observación y/o no conformidad, hasta 3 fotos) vive en la fila de la OT:
--     nada pasa de una revisión a otra.
--   · Resultado = 100 % − 0,5 % por cada no conformidad (3 NC → 98,5 %), por encargado
--     (consolidado entre plantas) y global de la revisión.
--   · Los checks de revisión campo por campo son solo ayuda visual en el dispositivo: no se guardan.
-- Escritura solo por RPC (security definer + exigir_rol); lectura por RLS.

-- ================================================================ utilidades
create or replace function public.fn_mp_puntaje(p_nc bigint)
returns numeric language sql immutable set search_path = public as $$
  select greatest(0::numeric, 100 - 0.5 * coalesce(p_nc, 0));
$$;

-- ================================================================ tablas
create sequence if not exists public.mp_revisiones_codigo_seq;

-- id lo genera el celular: reintentar la carga no duplica la revisión.
create table if not exists public.mp_revisiones (
  id uuid primary key,
  codigo text unique,
  mes smallint not null check (mes between 1 and 12),
  anio integer not null check (anio between 2000 and 2100),
  hoja text not null,
  archivo text,
  total_ot integer not null default 0,
  fecha_revision date not null default public.fn_hoy_lima(),
  estado text not null default 'en_curso' check (estado in ('en_curso', 'cerrada', 'anulada')),
  motivo_anulacion text,
  revisor text,
  cerrada_en timestamptz,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);
create index if not exists mp_revisiones_estado_idx on public.mp_revisiones (estado, anio desc, mes desc);

create or replace function public.fn_mp_revision_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is null then
    new.codigo := 'RPM-' || lpad(nextval('public.mp_revisiones_codigo_seq')::text, 5, '0');
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_mp_revision_antes on public.mp_revisiones;
create trigger trg_mp_revision_antes before insert or update on public.mp_revisiones
  for each row execute function public.fn_mp_revision_antes();

create table if not exists public.mp_ot (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.mp_revisiones(id),
  fila integer not null,
  num_ot text not null check (btrim(num_ot) <> ''),
  planta text not null check (btrim(planta) <> ''),
  responsable text not null check (btrim(responsable) <> ''),
  ubicacion text,
  sub_equipo text,
  descripcion text,
  personas text,
  f_ini_plan date,
  f_fin_plan date,
  f_ini_real date,
  f_fin_real date,
  obs_excel text,
  -- hallazgo de la revisión
  observacion text,
  no_conformidad text,
  fotos text[] not null default '{}' check (cardinality(fotos) <= 3),
  fecha_hallazgo date,
  revisado_por uuid references public.perfiles(id),
  revisado_nombre text,
  revisado_en timestamptz,
  unique (revision_id, fila)
);
create index if not exists mp_ot_revision_idx on public.mp_ot (revision_id, planta, responsable);

-- ================================================================ lecturas (invoker: respetan RLS)
/** Tabla dinámica de una revisión: Planta > Responsable con N° de OT, observaciones y NC. */
create or replace function public.fn_mp_tabla(p_revision uuid)
returns table (planta text, responsable text, total_ot bigint, n_obs bigint, n_nc bigint)
language sql stable set search_path = public as $$
  select o.planta, o.responsable, count(*),
         count(*) filter (where o.observacion is not null),
         count(*) filter (where o.no_conformidad is not null)
  from public.mp_ot o
  where o.revision_id = p_revision
  group by o.planta, o.responsable
  order by o.planta, o.responsable;
$$;

/** Resultado por encargado (consolidado entre plantas). p_revision null = todas las no anuladas. */
create or replace function public.fn_mp_resultados(p_revision uuid default null)
returns table (
  revision_id uuid, codigo text, mes smallint, anio integer, fecha_revision date, estado text,
  responsable text, plantas text, total_ot bigint, n_obs bigint, n_nc bigint, resultado numeric
) language sql stable set search_path = public as $$
  select r.id, r.codigo, r.mes, r.anio, r.fecha_revision, r.estado, o.responsable,
         string_agg(distinct o.planta, ', '),
         count(*),
         count(*) filter (where o.observacion is not null),
         count(*) filter (where o.no_conformidad is not null),
         public.fn_mp_puntaje(count(*) filter (where o.no_conformidad is not null))
  from public.mp_revisiones r
  join public.mp_ot o on o.revision_id = r.id
  where r.estado <> 'anulada' and (p_revision is null or r.id = p_revision)
  group by r.id, o.responsable
  order by r.anio desc, r.mes desc, r.creado_en desc, o.responsable;
$$;

-- ================================================================ RPC: revisión
create or replace function public.rpc_mp_crear_revision(p jsonb)
returns public.mp_revisiones language plpgsql security definer set search_path = public as $$
declare
  v public.mp_revisiones; v_id uuid; v_mes integer; v_anio integer; v_n integer;
begin
  perform public.exigir_rol('admin', 'captura');

  v_id := nullif(p->>'id', '')::uuid;
  if v_id is null then raise exception 'Falta el identificador de la revisión.'; end if;
  select * into v from public.mp_revisiones where id = v_id;
  if v.id is not null then return v; end if;  -- reintento: ya se creó

  v_mes := nullif(p->>'mes', '')::integer;
  v_anio := nullif(p->>'anio', '')::integer;
  if v_mes is null or v_mes not between 1 and 12 then raise exception 'Mes inválido.'; end if;
  if v_anio is null or v_anio not between 2000 and 2100 then raise exception 'Año inválido.'; end if;
  if jsonb_typeof(p->'filas') is distinct from 'array' or jsonb_array_length(p->'filas') = 0 then
    raise exception 'El archivo no trae OT para revisar.';
  end if;
  if jsonb_array_length(p->'filas') > 5000 then raise exception 'Máximo 5000 OT por revisión.'; end if;

  insert into public.mp_revisiones (id, mes, anio, hoja, archivo, revisor, creado_por, actualizado_por)
  values (v_id, v_mes, v_anio, coalesce(nullif(btrim(p->>'hoja'), ''), '—'), nullif(btrim(p->>'archivo'), ''),
          public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into v;

  insert into public.mp_ot (revision_id, fila, num_ot, planta, responsable, ubicacion, sub_equipo, descripcion,
                            personas, f_ini_plan, f_fin_plan, f_ini_real, f_fin_real, obs_excel)
  select v.id, x.fila, btrim(x.num_ot),
         upper(regexp_replace(btrim(coalesce(nullif(btrim(x.planta), ''), 'SIN PLANTA')), '\s+', ' ', 'g')),
         upper(regexp_replace(btrim(x.responsable), '\s+', ' ', 'g')),
         nullif(btrim(x.ubicacion), ''), nullif(btrim(x.sub_equipo), ''), nullif(btrim(x.descripcion), ''),
         nullif(btrim(x.personas), ''),
         nullif(x.f_ini_plan, '')::date, nullif(x.f_fin_plan, '')::date,
         nullif(x.f_ini_real, '')::date, nullif(x.f_fin_real, '')::date,
         nullif(btrim(x.obs_excel), '')
  from jsonb_to_recordset(p->'filas') as x(
    fila integer, num_ot text, planta text, responsable text, ubicacion text, sub_equipo text, descripcion text,
    personas text, f_ini_plan text, f_fin_plan text, f_ini_real text, f_fin_real text, obs_excel text)
  where coalesce(btrim(x.num_ot), '') <> '' and coalesce(btrim(x.responsable), '') <> '';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguna fila tiene # OT y RESPONSABLE.'; end if;

  update public.mp_revisiones set total_ot = v_n where id = v.id returning * into v;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'REVISION_PLAN_MTTO', 'Revisión creada', v.codigo || ' · ' || v.hoja || ' ' || v.anio || ' · ' || v_n || ' OT');
  return v;
end;
$$;

create or replace function public.rpc_mp_guardar_hallazgo(p jsonb)
returns public.mp_ot language plpgsql security definer set search_path = public as $$
declare
  o public.mp_ot; r public.mp_revisiones; v_obs text; v_nc text; v_fotos text[];
begin
  perform public.exigir_rol('admin', 'captura');
  select * into o from public.mp_ot where id = nullif(p->>'ot_id', '')::uuid for update;
  if o.id is null then raise exception 'No existe la OT.'; end if;
  select * into r from public.mp_revisiones where id = o.revision_id;
  if r.estado <> 'en_curso' then raise exception 'La revisión % está %: no admite cambios.', r.codigo, r.estado; end if;

  v_obs := nullif(btrim(p->>'observacion'), '');
  v_nc := nullif(btrim(p->>'no_conformidad'), '');
  v_fotos := case when jsonb_typeof(p->'fotos') = 'array'
                  then array(select jsonb_array_elements_text(p->'fotos'))
                  else '{}'::text[] end;
  if cardinality(v_fotos) > 3 then raise exception 'Máximo 3 fotos por OT.'; end if;
  if exists (select 1 from unnest(v_fotos) f where f not like 'rpm/' || r.id || '/%') then
    raise exception 'Ruta de foto inválida.';
  end if;
  if v_obs is null and v_nc is null and cardinality(v_fotos) > 0 then
    raise exception 'Escribe la observación o la no conformidad que sustentan las fotos.';
  end if;

  update public.mp_ot set
    observacion = v_obs,
    no_conformidad = v_nc,
    fotos = v_fotos,
    fecha_hallazgo = case when v_obs is null and v_nc is null then null else coalesce(fecha_hallazgo, public.fn_hoy_lima()) end,
    revisado_por = auth.uid(),
    revisado_nombre = public.fn_s5_mi_nombre(),
    revisado_en = now()
  where id = o.id returning * into o;
  update public.mp_revisiones set actualizado_por = auth.uid() where id = r.id;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'REVISION_PLAN_MTTO',
            case when v_obs is null and v_nc is null then 'Hallazgo quitado' else 'Hallazgo guardado' end,
            r.codigo || ' · OT ' || o.num_ot || ' · ' || o.responsable ||
            case when v_nc is not null then ' · NC' else '' end || case when v_obs is not null then ' · OBS' else '' end);
  return o;
end;
$$;

create or replace function public.rpc_mp_cerrar_revision(p_revision uuid)
returns public.mp_revisiones language plpgsql security definer set search_path = public as $$
declare r public.mp_revisiones;
begin
  perform public.exigir_rol('admin', 'captura');
  update public.mp_revisiones set estado = 'cerrada', cerrada_en = now(), actualizado_por = auth.uid()
    where id = p_revision and estado = 'en_curso' returning * into r;
  if r.id is null then raise exception 'Solo se cierra una revisión en curso.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'REVISION_PLAN_MTTO', 'Revisión cerrada', r.codigo);
  return r;
end;
$$;

create or replace function public.rpc_mp_reabrir_revision(p_revision uuid)
returns public.mp_revisiones language plpgsql security definer set search_path = public as $$
declare r public.mp_revisiones;
begin
  perform public.exigir_rol('admin');
  update public.mp_revisiones set estado = 'en_curso', cerrada_en = null, actualizado_por = auth.uid()
    where id = p_revision and estado = 'cerrada' returning * into r;
  if r.id is null then raise exception 'Solo se reabre una revisión cerrada.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'REVISION_PLAN_MTTO', 'Revisión reabierta', r.codigo);
  return r;
end;
$$;

create or replace function public.rpc_mp_anular_revision(p_revision uuid, p_motivo text)
returns public.mp_revisiones language plpgsql security definer set search_path = public as $$
declare r public.mp_revisiones; v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Revisión de prueba');
begin
  perform public.exigir_rol('admin');
  update public.mp_revisiones set estado = 'anulada', motivo_anulacion = v_motivo, actualizado_por = auth.uid()
    where id = p_revision and estado <> 'anulada' returning * into r;
  if r.id is null then raise exception 'No existe la revisión o ya está anulada.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'REVISION_PLAN_MTTO', 'Revisión anulada', r.codigo || ' · ' || v_motivo);
  return r;
end;
$$;

-- ================================================================ RLS y protecciones
do $$
declare t text;
begin
  foreach t in array array['mp_revisiones', 'mp_ot'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rol_actual() in (''admin'', ''captura'', ''visor''))', t || '_select', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists trg_bloquear_truncate on public.%I', t);
    execute format('create trigger trg_bloquear_truncate before truncate on public.%I for each statement execute function public.fn_bloquear_vaciado()', t);
  end loop;
end $$;

create or replace function public.fn_mp_bloquear_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'No se eliminan filas de %: anula la revisión desde la app; el historial se conserva.', tg_table_name;
end;
$$;
revoke execute on function public.fn_mp_bloquear_borrado() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['mp_revisiones', 'mp_ot'] loop
    execute format('drop trigger if exists trg_mp_bloquear_borrado on public.%I', t);
    execute format('create trigger trg_mp_bloquear_borrado before delete on public.%I for each row execute function public.fn_mp_bloquear_borrado()', t);
  end loop;
end $$;

-- ================================================================ fotos (Storage privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-mantenimiento', 'plan-mantenimiento', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mp_fotos_insertar on storage.objects;
create policy mp_fotos_insertar on storage.objects for insert to authenticated
  with check (bucket_id = 'plan-mantenimiento' and public.rol_actual() in ('admin', 'captura'));
drop policy if exists mp_fotos_leer on storage.objects;
create policy mp_fotos_leer on storage.objects for select to authenticated
  using (bucket_id = 'plan-mantenimiento' and public.rol_actual() in ('admin', 'captura', 'visor'));

-- ================================================================ permisos de funciones
revoke execute on function public.fn_mp_revision_antes() from public, anon, authenticated;
revoke execute on function public.fn_mp_puntaje(bigint) from public, anon;
revoke execute on function public.fn_mp_tabla(uuid) from public, anon;
revoke execute on function public.fn_mp_resultados(uuid) from public, anon;
grant execute on function public.fn_mp_puntaje(bigint) to authenticated, service_role;
grant execute on function public.fn_mp_tabla(uuid) to authenticated, service_role;
grant execute on function public.fn_mp_resultados(uuid) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'rpc_mp_crear_revision(jsonb)', 'rpc_mp_guardar_hallazgo(jsonb)', 'rpc_mp_cerrar_revision(uuid)',
    'rpc_mp_reabrir_revision(uuid)', 'rpc_mp_anular_revision(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
