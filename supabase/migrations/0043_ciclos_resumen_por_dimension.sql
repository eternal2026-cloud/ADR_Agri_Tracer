-- 0043: Tiempo de ciclo — gráfico «Tiempo promedio por …» del Resumen
--
--   fn_resumen_dim_vivo: mismos promedios que fn_resumen_pivot_vivo (cerrados + tramos ya
--   completados de los en curso, sin los que superan el umbral), agrupados por una sola
--   dimensión: variedad, lider, calibre o placa (en mayúsculas y sin espacios sobrantes).
--   p_fundo acota a un fundo (filtro «Fundo» del Resumen). Fundo, grupo y lote ya salen de
--   fn_resumen_pivot_vivo, así que aquí no se repiten.

create or replace function public.fn_resumen_dim_vivo(p_semana integer default null, p_fecha date default null,
                                                      p_fundo text default null, p_dim text default 'variedad')
returns table (
  clave text, n_muestras bigint, n_en_curso bigint, n_excluidos bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable set search_path = public as $$
  with v as (
    select (s.c).*, s.en_curso, s.valida,
           nullif(upper(btrim(case p_dim when 'lider' then (s.c).lider when 'calibre' then (s.c).calibre
                                         when 'placa' then (s.c).placa else (s.c).variedad end)), '') as k
    from public.fn_ciclos_vivo(p_semana, p_fecha) s
    where (s.en_curso or (s.c).t_ciclo_total is not null)
      and (p_fundo is null or (s.c).fundo = p_fundo)
  )
  select k,
         count(*) filter (where valida and not en_curso), count(*) filter (where valida and en_curso), count(*) filter (where not valida),
         avg(t_cosecha) filter (where valida), avg(t_espera_jabero) filter (where valida), avg(t_jabero) filter (where valida),
         avg(t_estadia_cs) filter (where valida), avg(t_carga_moto) filter (where valida), avg(t_espera_traslado) filter (where valida),
         avg(t_traslado_ca) filter (where valida), avg(t_espera_descarga) filter (where valida), avg(t_descarga_ca) filter (where valida),
         avg(t_estadia_ca) filter (where valida), avg(t_carga_camion) filter (where valida),
         avg(t_espera_traslado_planta) filter (where valida), avg(t_traslado_planta) filter (where valida),
         avg(t_ciclo_total) filter (where valida and not en_curso), avg(t_ciclo_total) filter (where valida and not en_curso) / 60
  from v group by k;
$$;

revoke execute on function public.fn_resumen_dim_vivo(integer, date, text, text) from public, anon;
grant execute on function public.fn_resumen_dim_vivo(integer, date, text, text) to authenticated, service_role;
