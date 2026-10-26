-- ============================================================================
-- 0048 · Estudio TOP: encuesta de factores de rendimiento y borrado de evaluaciones
--   · top_encuestas: «ENCUESTA AL COSECHADOR · FACTORES DE RENDIMIENTO» (10 preguntas),
--     una por evaluación. Como la evaluación es una por cosechador y día, la encuesta
--     queda registrada 1 vez por día (índice único top_evaluaciones_cosechador_dia).
--   · rpc_top_borrar_evaluacion: borra de verdad una evaluación con todo su detalle
--     (además de «anular»). Devuelve las rutas de fotos para quitarlas del bucket.
--   · Política de borrado en el bucket estudio-top para admin/captura.
--
-- Revertir:
--   drop function if exists public.rpc_top_guardar_encuesta(uuid, jsonb), public.rpc_top_borrar_evaluacion(uuid);
--   drop table if exists public.top_encuestas;
--   drop index if exists public.top_evaluaciones_cosechador_dia;
--   drop policy if exists top_fotos_borrar on storage.objects;
-- ============================================================================

create table if not exists public.top_encuestas (
  evaluacion_id uuid primary key references public.top_evaluaciones(id) on delete cascade,
  acepto boolean not null default true,
  respuestas jsonb not null default '{}'::jsonb,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.top_encuestas enable row level security;
drop policy if exists top_encuestas_leer on public.top_encuestas;
create policy top_encuestas_leer on public.top_encuestas for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor') and public.fn_tiene_acceso('campo.top'));
revoke insert, update, delete on public.top_encuestas from anon, authenticated;
drop trigger if exists trg_top_encuesta_acceso on public.top_encuestas;
create trigger trg_top_encuesta_acceso before insert or update on public.top_encuestas
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');

-- Una evaluación (y por tanto una encuesta) por cosechador y día; las anuladas no cuentan.
create unique index if not exists top_evaluaciones_cosechador_dia
  on public.top_evaluaciones (cosechador_id, fecha) where not anulada and cosechador_id is not null;

create or replace function public.rpc_top_guardar_encuesta(p_eval uuid, p jsonb)
returns public.top_encuestas language plpgsql security definer set search_path = public as $$
declare v public.top_encuestas;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  insert into public.top_encuestas (evaluacion_id, acepto, respuestas, actualizado_en)
  values (p_eval, coalesce((p->>'acepto')::boolean, true), coalesce(p->'respuestas', '{}'::jsonb), now())
  on conflict (evaluacion_id) do update set acepto = excluded.acepto, respuestas = excluded.respuestas, actualizado_en = now()
  returning * into v;
  return v;
end;
$$;

/** Borra la evaluación y todo su detalle (cascada). Devuelve las rutas de fotos a quitar del bucket. */
create or replace function public.rpc_top_borrar_evaluacion(p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v public.top_evaluaciones; v_fotos text[];
begin
  perform public.exigir_rol('admin', 'captura');
  select * into v from public.top_evaluaciones where id = p_id;
  if v.id is null then raise exception 'La evaluación ya no existe.'; end if;
  if public.rol_actual() <> 'admin' and v.evaluador_id is distinct from auth.uid() then
    raise exception 'Solo quien creó la evaluación (o un admin) puede borrarla.';
  end if;
  select coalesce(array_agg(f), '{}') into v_fotos from (
    select unnest(fotos) f from public.top_cumplimiento where evaluacion_id = p_id
    union all select unnest(fotos) from public.top_reba where evaluacion_id = p_id) x;
  delete from public.top_evaluaciones where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'ESTUDIO_TOP', 'Evaluación borrada', v.codigo || ' · ' || v.cosechador || ' · ' || v.fecha);
  return v_fotos;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['rpc_top_guardar_encuesta(uuid, jsonb)', 'rpc_top_borrar_evaluacion(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

drop policy if exists top_fotos_borrar on storage.objects;
create policy top_fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'estudio-top' and public.rol_actual() in ('admin', 'captura'));
