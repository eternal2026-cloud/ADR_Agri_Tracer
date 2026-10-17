-- 0042: Tiempo de ciclo — «solo sus ciclos» por usuario + tabla dinámica del Resumen
--
--   · perfiles.ciclos_solo_propios: true = el usuario solo ve los ciclos que él creó
--     (creado_por = su id); false = ve todos (así quedan los usuarios que ya existen).
--     Los administradores siempre ven todo. Se aplica en la RLS de ciclos_cosecha, así que
--     Captura, Resumen y todas las funciones security invoker lo heredan solas.
--     Los fundos asignados (perfiles.fundos, 0018) siguen igual: se suman a este filtro.
--     sync-sheets usa service_role (no pasa por RLS): la hoja sigue recibiendo todo.
--   · fn_lote_normalizado / fn_grupo_lote: «Ca 3», «ca3 », «CA03» → lote CA3, grupo CA
--     (mayúsculas, sin espacios, sin ceros a la izquierda; grupo = 1 o 2 letras iniciales).
--   · fn_resumen_pivot_vivo: mismos promedios que fn_resumen_lotes_vivo, pero por
--     fundo › grupo de lote › lote normalizado (grouping sets: cada nivel con su promedio
--     exacto, no promedio de promedios) + fila Total general.

alter table public.perfiles add column if not exists ciclos_solo_propios boolean not null default false;

create or replace function public.fn_ciclos_ver_todos()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.rol = 'admin' or not p.ciclos_solo_propios
    from public.perfiles p where p.id = auth.uid() and p.activo
  ), false);
$$;
revoke execute on function public.fn_ciclos_ver_todos() from public, anon;
grant execute on function public.fn_ciclos_ver_todos() to authenticated;

drop policy if exists ciclos_select on public.ciclos_cosecha;
create policy ciclos_select on public.ciclos_cosecha for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor')
         and ((select public.fn_ciclos_ver_todos()) or creado_por = (select auth.uid())));

create index if not exists ciclos_creado_por_idx on public.ciclos_cosecha (creado_por);

create or replace function public.fn_lote_normalizado(p_lote text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(upper(regexp_replace(coalesce(p_lote, ''), '\s+', '', 'g')), '^([A-Z]+)0+(\d)', '\1\2'), '');
$$;

create or replace function public.fn_grupo_lote(p_lote text)
returns text language sql immutable set search_path = public as $$
  select case when public.fn_lote_normalizado(p_lote) is null then null
              else coalesce(substring(public.fn_lote_normalizado(p_lote) from '^[A-Z]{1,2}'), 'Otros') end;
$$;

create or replace function public.fn_resumen_pivot_vivo(p_semana integer default null, p_fecha date default null)
returns table (
  nivel integer, fundo text, grupo text, lote text,
  n_muestras bigint, n_en_curso bigint, n_excluidos bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with v as (
    select (s.c).*, s.en_curso, s.valida,
           public.fn_grupo_lote((s.c).lote) as g, public.fn_lote_normalizado((s.c).lote) as l
    from public.fn_ciclos_vivo(p_semana, p_fecha) s
    where s.en_curso or (s.c).t_ciclo_total is not null
  )
  -- nivel: 0 = total general, 1 = fundo, 2 = grupo de lote, 3 = lote
  select 3 - grouping(fundo) - grouping(g) - grouping(l), fundo, g, l,
         count(*) filter (where valida and not en_curso), count(*) filter (where valida and en_curso), count(*) filter (where not valida),
         avg(t_cosecha) filter (where valida), avg(t_espera_jabero) filter (where valida), avg(t_jabero) filter (where valida),
         avg(t_estadia_cs) filter (where valida), avg(t_carga_moto) filter (where valida), avg(t_espera_traslado) filter (where valida),
         avg(t_traslado_ca) filter (where valida), avg(t_espera_descarga) filter (where valida), avg(t_descarga_ca) filter (where valida),
         avg(t_estadia_ca) filter (where valida), avg(t_carga_camion) filter (where valida),
         avg(t_espera_traslado_planta) filter (where valida), avg(t_traslado_planta) filter (where valida),
         avg(t_ciclo_total) filter (where valida and not en_curso), avg(t_ciclo_total) filter (where valida and not en_curso) / 60
  from v group by grouping sets ((), (fundo), (fundo, g), (fundo, g, l));
$$;

revoke execute on function public.fn_lote_normalizado(text) from public, anon;
revoke execute on function public.fn_grupo_lote(text) from public, anon;
revoke execute on function public.fn_resumen_pivot_vivo(integer, date) from public, anon;
grant execute on function public.fn_lote_normalizado(text) to authenticated, service_role;
grant execute on function public.fn_grupo_lote(text) to authenticated, service_role;
grant execute on function public.fn_resumen_pivot_vivo(integer, date) to authenticated, service_role;
