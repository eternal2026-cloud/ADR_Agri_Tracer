-- 0034: Tiempo de ciclo — Resumen por día y por lote
--
--   · fn_dias_disponibles: días con ciclos cerrados (para «Ver un día…» en Resumen).
--   · fn_resumen_dia(p_fecha): misma forma que fn_resumen_semana, para un solo día.
--   · fn_resumen_lotes(p_semana, p_fecha): promedios por fundo y lote (todas las semanas, una
--     semana o un día), con la misma regla del umbral; n_excluidos = cerrados sobre el umbral.
--   Igual que las demás funciones de resumen: security invoker (respeta RLS de ciclos_cosecha).

create or replace function public.fn_dias_disponibles()
returns setof date language sql stable set search_path = public as $$
  select distinct fecha from public.ciclos_cosecha where cerrado and fecha is not null order by 1 desc limit 120;
$$;

create or replace function public.fn_resumen_dia(p_fecha date)
returns table (
  fundo text, n_muestras bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  ), validas as (
    select c.* from public.ciclos_cosecha c, umbral
    where c.fecha = p_fecha and c.cerrado and c.t_ciclo_total is not null and c.t_ciclo_total <= umbral.v
  )
  select fundo, count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas group by fundo
  union all
  select 'Total general', count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas;
$$;

create or replace function public.fn_resumen_lotes(p_semana integer default null, p_fecha date default null)
returns table (
  fundo text, lote text, n_muestras bigint, n_excluidos bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  ), cerrados as (
    select c.*, c.t_ciclo_total <= umbral.v as valida from public.ciclos_cosecha c, umbral
    where c.cerrado and c.t_ciclo_total is not null
      and (p_semana is null or c.semana = p_semana)
      and (p_fecha is null or c.fecha = p_fecha)
  )
  select fundo, nullif(btrim(lote), ''), count(*) filter (where valida), count(*) filter (where not valida),
         avg(t_cosecha) filter (where valida), avg(t_espera_jabero) filter (where valida), avg(t_jabero) filter (where valida),
         avg(t_estadia_cs) filter (where valida), avg(t_carga_moto) filter (where valida), avg(t_espera_traslado) filter (where valida),
         avg(t_traslado_ca) filter (where valida), avg(t_espera_descarga) filter (where valida), avg(t_descarga_ca) filter (where valida),
         avg(t_estadia_ca) filter (where valida), avg(t_carga_camion) filter (where valida),
         avg(t_espera_traslado_planta) filter (where valida), avg(t_traslado_planta) filter (where valida),
         avg(t_ciclo_total) filter (where valida), avg(t_ciclo_total) filter (where valida) / 60
  from cerrados group by fundo, nullif(btrim(lote), '')
  order by 18 desc nulls last;
$$;

revoke execute on function public.fn_dias_disponibles() from public, anon;
revoke execute on function public.fn_resumen_dia(date) from public, anon;
revoke execute on function public.fn_resumen_lotes(integer, date) from public, anon;
grant execute on function public.fn_dias_disponibles() to authenticated, service_role;
grant execute on function public.fn_resumen_dia(date) to authenticated, service_role;
grant execute on function public.fn_resumen_lotes(integer, date) to authenticated, service_role;
