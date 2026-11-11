-- 0068: Reubicación — nueva plantilla.
--   · Lado pasa de IZQUIERDO/DERECHO a A/B.
--   · Nuevas columnas SUPERVISOR y CLASIFICACIÓN (AR alto, MR mediano, BR bajo rendimiento).
--   · Línea: LÍNEA 1–6; si la labor es LIMPIEZA, LÍNEA 1–16 (lo valida la plantilla y la app).
--   · Se borran los registros anteriores (lista de prueba y sus escaneos).

delete from public.reub_escaneos;
delete from public.reub_personal;

alter table public.reub_personal drop constraint if exists reub_personal_lado_check;
alter table public.reub_personal add constraint reub_personal_lado_check check (lado in ('A','B') or lado is null);

alter table public.reub_personal add column if not exists supervisor text;
alter table public.reub_personal add column if not exists clasificacion text;
alter table public.reub_personal drop constraint if exists reub_personal_clasificacion_check;
alter table public.reub_personal add constraint reub_personal_clasificacion_check check (clasificacion in ('AR','MR','BR') or clasificacion is null);

create or replace function public.rpc_guardar_personal_fila(p jsonb)
returns public.reub_personal language plpgsql security definer set search_path = public as $$
declare v_fila public.reub_personal;
begin
  perform public.exigir_rol('admin');
  insert into public.reub_personal (dni, nombre, linea, lado, labor, supervisor, clasificacion, obs, activo, actualizado_por)
  values (p->>'dni', p->>'nombre', p->>'linea', nullif(p->>'lado',''), p->>'labor', p->>'supervisor', nullif(p->>'clasificacion',''), p->>'obs', true, auth.uid())
  on conflict (dni) do update set
    nombre = excluded.nombre, linea = excluded.linea, lado = excluded.lado, labor = excluded.labor,
    supervisor = excluded.supervisor, clasificacion = excluded.clasificacion, obs = excluded.obs, activo = true,
    actualizado_por = auth.uid(), actualizado_en = now()
  returning * into v_fila;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(),'REUBICACION','Fila guardada', v_fila.dni);
  return v_fila;
end;
$$;

create or replace function public.rpc_reemplazar_personal_lote(p_filas jsonb)
returns table (insertados integer, desactivados integer) language plpgsql security definer set search_path = public as $$
declare v_ins integer; v_desact integer;
begin
  perform public.exigir_rol('admin');

  with datos as (
    select f->>'dni' dni, f->>'nombre' nombre, f->>'linea' linea, nullif(f->>'lado','') lado, f->>'labor' labor,
           f->>'supervisor' supervisor, nullif(f->>'clasificacion','') clasificacion, f->>'obs' obs
    from jsonb_array_elements(p_filas) f
    where coalesce(f->>'dni','') <> ''
  ), up as (
    insert into public.reub_personal (dni, nombre, linea, lado, labor, supervisor, clasificacion, obs, activo, actualizado_por)
    select dni, nombre, linea, lado, labor, supervisor, clasificacion, obs, true, auth.uid() from datos
    on conflict (dni) do update set
      nombre = excluded.nombre, linea = excluded.linea, lado = excluded.lado, labor = excluded.labor,
      supervisor = excluded.supervisor, clasificacion = excluded.clasificacion, obs = excluded.obs, activo = true,
      actualizado_por = auth.uid(), actualizado_en = now()
    returning 1
  )
  select count(*) into v_ins from up;

  update public.reub_personal set activo = false, actualizado_por = auth.uid(), actualizado_en = now()
  where activo = true and dni not in (select f->>'dni' from jsonb_array_elements(p_filas) f);
  get diagnostics v_desact = row_count;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'REUBICACION', 'Reemplazo de lote', v_ins || ' actualizados/insertados, ' || v_desact || ' desactivados');
  return query select v_ins, v_desact;
end;
$$;

revoke execute on function public.rpc_guardar_personal_fila(jsonb) from public, anon;
revoke execute on function public.rpc_reemplazar_personal_lote(jsonb) from public, anon;
grant execute on function public.rpc_guardar_personal_fila(jsonb) to authenticated;
grant execute on function public.rpc_reemplazar_personal_lote(jsonb) to authenticated;
