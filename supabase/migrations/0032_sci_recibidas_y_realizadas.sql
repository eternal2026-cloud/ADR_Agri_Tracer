-- 0032: Cliente interno — evaluaciones recibidas y realizadas, con quién las hizo
--
--   · sci_encuestas (RLS): además de las evaluaciones HECHAS A SU ÁREA (0026), cada usuario ve
--     las que HIZO SU ÁREA (area_evaluadora_id = su área) y las que registró él mismo
--     (creado_por). El admin sigue viendo todas. sci_respuestas hereda la regla.
--   · fn_sci_resultados devuelve también registrado_por (usuario que la registró en la app)
--     y creado_por, para el selector Recibidas / Realizadas por mi área / Realizadas por mí.

drop policy if exists sci_encuestas_select on public.sci_encuestas;
create policy sci_encuestas_select on public.sci_encuestas for select to authenticated
  using (public.rol_actual() = 'admin'
         or (public.rol_actual() in ('captura', 'visor')
             and (area_evaluada_id = (select public.fn_sci_mi_area())
                  or area_evaluadora_id = (select public.fn_sci_mi_area())
                  or creado_por = (select auth.uid()))));

create index if not exists sci_encuestas_area_evaluadora_idx on public.sci_encuestas (area_evaluadora_id);
create index if not exists sci_encuestas_creado_por_idx on public.sci_encuestas (creado_por);

drop function if exists public.fn_sci_resultados(integer, integer, date, date);
create function public.fn_sci_resultados(
  p_cultivo integer default null, p_area_evaluada integer default null, p_desde date default null, p_hasta date default null)
returns table (
  id uuid, codigo text, cultivo_id integer, cultivo text, campana text, fecha date, semana integer,
  area_evaluada_id integer, area_evaluada text, area_evaluadora_id integer, area_evaluadora text,
  sub_area text, planta text, grupo text, cargo text, evaluador text,
  p_atencion numeric, p_tiempo numeric, p_comunicacion numeric, p_calidad numeric, resultado numeric,
  aspectos_valorados text, aspectos_mejorar text, recomendaciones text, origen text, archivo text, creado_en timestamptz,
  registrado_por text, creado_por uuid)
language sql stable set search_path = public as $$
  with crit as (
    select r.encuesta_id, i.criterio_id, sum(r.puntaje) / (count(*) * 10) * 100 as pct
    from public.sci_respuestas r join public.sci_items i on i.id = r.item_id
    group by r.encuesta_id, i.criterio_id
  )
  select e.id, e.codigo, c.id, c.nombre, e.campana, e.fecha, e.semana,
         ae.id, ae.nombre, ao.id, ao.nombre, e.sub_area, e.planta,
         public.fn_sci_grupo(ao.nombre, e.sub_area, e.planta, c.nombre), e.cargo, e.evaluador,
         max(k.pct) filter (where k.criterio_id = 1), max(k.pct) filter (where k.criterio_id = 2),
         max(k.pct) filter (where k.criterio_id = 3), max(k.pct) filter (where k.criterio_id = 4),
         e.resultado, e.aspectos_valorados, e.aspectos_mejorar, e.recomendaciones, e.origen, e.archivo, e.creado_en,
         e.registrado_por, e.creado_por
  from public.sci_encuestas e
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.sci_areas ae on ae.id = e.area_evaluada_id
  join public.sci_areas ao on ao.id = e.area_evaluadora_id
  left join crit k on k.encuesta_id = e.id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
    and (p_desde is null or e.fecha >= p_desde)
    and (p_hasta is null or e.fecha <= p_hasta)
  group by e.id, c.id, ae.id, ao.id
  order by e.fecha desc, ae.nombre, e.planta nulls last, ao.nombre, e.sub_area;
$$;
revoke execute on function public.fn_sci_resultados(integer, integer, date, date) from public, anon;
grant execute on function public.fn_sci_resultados(integer, integer, date, date) to authenticated, service_role;
