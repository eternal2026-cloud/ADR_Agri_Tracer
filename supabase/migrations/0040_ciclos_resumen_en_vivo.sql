-- 0040: Tiempo de ciclo — Resumen en vivo (cerrados + en curso juntos)
--
--   La pantalla Resumen deja de esperar a que el ciclo se cierre: los tramos ya completados de
--   los ciclos en curso entran a los promedios junto con los cerrados.
--   · Tramos: promedio de cerrados válidos + en curso (los en curso que ya pasan el umbral
--     sumando sus tramos se excluyen, igual que un cerrado sobre el umbral).
--   · t_ciclo_total / tiempo_horas: solo cerrados (un ciclo en curso todavía no tiene total).
--   · n_muestras = cerrados válidos; n_en_curso = en curso incluidos.
--   fn_resumen_general / fn_resumen_semana NO cambian: Google Sheets sigue con solo cerrados.
--   fn_dias_disponibles ahora incluye días con ciclos en curso (solo lo usa la app).

create or replace function public.fn_dias_disponibles()
returns setof date language sql stable set search_path = public as $$
  select distinct fecha from public.ciclos_cosecha where fecha is not null order by 1 desc limit 120;
$$;

-- Ciclos del ámbito (todas las semanas, una semana o un día) que cuentan en el resumen en vivo.
create or replace function public.fn_ciclos_vivo(p_semana integer default null, p_fecha date default null)
returns table (c public.ciclos_cosecha, en_curso boolean, valida boolean)
language sql stable set search_path = public as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  )
  select x, not x.cerrado,
         case when x.cerrado then x.t_ciclo_total is not null and x.t_ciclo_total <= umbral.v
              else coalesce(x.t_cosecha,0) + coalesce(x.t_espera_jabero,0) + coalesce(x.t_jabero,0) + coalesce(x.t_estadia_cs,0)
                 + coalesce(x.t_carga_moto,0) + coalesce(x.t_espera_traslado,0) + coalesce(x.t_traslado_ca,0)
                 + coalesce(x.t_espera_descarga,0) + coalesce(x.t_descarga_ca,0) + coalesce(x.t_estadia_ca,0)
                 + coalesce(x.t_carga_camion,0) + coalesce(x.t_espera_traslado_planta,0) + coalesce(x.t_traslado_planta,0) <= umbral.v
         end
  from public.ciclos_cosecha x, umbral
  where (x.cerrado or x.origen = 'app')
    and (p_semana is null or x.semana = p_semana)
    and (p_fecha is null or x.fecha = p_fecha);
$$;

create or replace function public.fn_resumen_vivo(p_semana integer default null, p_fecha date default null)
returns table (
  fundo text, n_muestras bigint, n_en_curso bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with v as (
    select (s.c).*, s.en_curso from public.fn_ciclos_vivo(p_semana, p_fecha) s where s.valida
  ), g as (
    select v.fundo as grupo, v.* from v
    union all
    select 'Total general', v.* from v
  )
  select grupo, count(*) filter (where not en_curso), count(*) filter (where en_curso),
         avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total) filter (where not en_curso), avg(t_ciclo_total) filter (where not en_curso) / 60
  from g group by grupo;
$$;

create or replace function public.fn_resumen_lotes_vivo(p_semana integer default null, p_fecha date default null)
returns table (
  fundo text, lote text, n_muestras bigint, n_en_curso bigint, n_excluidos bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with v as (
    select (s.c).*, s.en_curso, s.valida from public.fn_ciclos_vivo(p_semana, p_fecha) s
    where s.en_curso or (s.c).t_ciclo_total is not null
  )
  select fundo, nullif(btrim(lote), ''),
         count(*) filter (where valida and not en_curso), count(*) filter (where valida and en_curso), count(*) filter (where not valida),
         avg(t_cosecha) filter (where valida), avg(t_espera_jabero) filter (where valida), avg(t_jabero) filter (where valida),
         avg(t_estadia_cs) filter (where valida), avg(t_carga_moto) filter (where valida), avg(t_espera_traslado) filter (where valida),
         avg(t_traslado_ca) filter (where valida), avg(t_espera_descarga) filter (where valida), avg(t_descarga_ca) filter (where valida),
         avg(t_estadia_ca) filter (where valida), avg(t_carga_camion) filter (where valida),
         avg(t_espera_traslado_planta) filter (where valida), avg(t_traslado_planta) filter (where valida),
         avg(t_ciclo_total) filter (where valida and not en_curso), avg(t_ciclo_total) filter (where valida and not en_curso) / 60
  from v group by fundo, nullif(btrim(lote), '')
  order by 19 desc nulls last;
$$;

revoke execute on function public.fn_ciclos_vivo(integer, date) from public, anon;
revoke execute on function public.fn_resumen_vivo(integer, date) from public, anon;
revoke execute on function public.fn_resumen_lotes_vivo(integer, date) from public, anon;
grant execute on function public.fn_ciclos_vivo(integer, date) to authenticated, service_role;
grant execute on function public.fn_resumen_vivo(integer, date) to authenticated, service_role;
grant execute on function public.fn_resumen_lotes_vivo(integer, date) to authenticated, service_role;
