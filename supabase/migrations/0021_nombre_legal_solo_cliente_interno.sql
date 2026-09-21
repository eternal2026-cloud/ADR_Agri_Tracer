-- 0021: El nombre legal de las áreas (Config → Áreas) aplica solo a Satisfacción del cliente interno
--
--   · 0020 renombraba el área del catálogo compartido y el cambio llegaba también a Auditoría 5S.
--     5S se mantiene como se viene trabajando (su catálogo por cultivo, áreas y zonas).
--   · s5_areas.nombre_ci: nombre legal para Cliente interno (null = el mismo de 5S). Lo usan
--     fn_sci_resultados y fn_sci_bd, así que llega a la app, la presentación, el Excel de
--     Power BI y Google Sheets, también en las encuestas ya registradas.
--   · Los nombres anteriores de Cliente interno quedan en s5_areas.alias para que el importador
--     de Excel los siga reconociendo. El grupo «Prod. …» de Producción conserva su abreviatura.

alter table public.s5_areas add column if not exists nombre_ci text;

/** Solo admin. p_nombre vacío o igual al de 5S = sin nombre propio en Cliente interno. */
create or replace function public.rpc_sci_nombre_area(p_area integer, p_nombre text)
returns public.s5_areas language plpgsql security definer set search_path = public as $$
declare v public.s5_areas; v_nuevo text := nullif(btrim(coalesce(p_nombre, '')), ''); v_antes text;
begin
  perform public.exigir_rol('admin');
  select * into v from public.s5_areas where id = p_area for update;
  if v.id is null then raise exception 'No existe el área.'; end if;
  if v_nuevo is not null and lower(v_nuevo) = lower(v.nombre) then v_nuevo := null; end if;
  if v_nuevo is not null and exists (select 1 from public.s5_areas a where a.id <> v.id
       and lower(coalesce(a.nombre_ci, a.nombre)) = lower(v_nuevo)) then
    raise exception 'Ya hay otra área llamada «%» en Cliente interno.', v_nuevo;
  end if;
  v_antes := coalesce(v.nombre_ci, v.nombre);
  if coalesce(v_nuevo, v.nombre) = v_antes then return v; end if;
  -- update de solo nombre_ci/alias: el trigger de 0020 no actúa porque «nombre» no cambia.
  update public.s5_areas set
    nombre_ci = v_nuevo,
    alias = array(select distinct a from unnest(array_append(alias, v_antes)) a
                  where lower(a) <> lower(coalesce(v_nuevo, v.nombre)) and lower(a) <> lower(v.nombre))
  where id = v.id returning * into v;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Nombre legal de área', v_antes || ' → ' || coalesce(v_nuevo, v.nombre));
  return v;
end;
$$;
revoke execute on function public.rpc_sci_nombre_area(integer, text) from public, anon;
grant execute on function public.rpc_sci_nombre_area(integer, text) to authenticated;

create or replace function public.fn_sci_resultados(
  p_cultivo integer default null, p_area_evaluada integer default null,
  p_desde date default null, p_hasta date default null)
returns table (
  id uuid, codigo text, cultivo_id integer, cultivo text, campana text, fecha date, semana integer,
  area_evaluada_id integer, area_evaluada text, area_evaluadora_id integer, area_evaluadora text,
  sub_area text, planta text, grupo text, cargo text, evaluador text,
  p_atencion numeric, p_tiempo numeric, p_comunicacion numeric, p_calidad numeric, resultado numeric,
  aspectos_valorados text, aspectos_mejorar text, recomendaciones text, origen text, archivo text, creado_en timestamptz
) language sql stable set search_path = public as $$
  with crit as (
    select r.encuesta_id, i.criterio_id, sum(r.puntaje) / (count(*) * 10) * 100 as pct
    from public.sci_respuestas r join public.sci_items i on i.id = r.item_id
    group by r.encuesta_id, i.criterio_id
  )
  select e.id, e.codigo, c.id, c.nombre, e.campana, e.fecha, e.semana,
         ae.id, coalesce(ae.nombre_ci, ae.nombre), ao.id, coalesce(ao.nombre_ci, ao.nombre), e.sub_area, e.planta,
         public.fn_sci_grupo(case when ao.nombre = 'Producción' then ao.nombre else coalesce(ao.nombre_ci, ao.nombre) end, e.sub_area, e.planta, c.nombre), e.cargo, e.evaluador,
         max(k.pct) filter (where k.criterio_id = 1), max(k.pct) filter (where k.criterio_id = 2),
         max(k.pct) filter (where k.criterio_id = 3), max(k.pct) filter (where k.criterio_id = 4),
         e.resultado, e.aspectos_valorados, e.aspectos_mejorar, e.recomendaciones, e.origen, e.archivo, e.creado_en
  from public.sci_encuestas e
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.s5_areas ae on ae.id = e.area_evaluada_id
  join public.s5_areas ao on ao.id = e.area_evaluadora_id
  left join crit k on k.encuesta_id = e.id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
    and (p_desde is null or e.fecha >= p_desde)
    and (p_hasta is null or e.fecha <= p_hasta)
  group by e.id, c.id, ae.id, ao.id
  order by e.fecha desc, coalesce(ae.nombre_ci, ae.nombre), e.planta nulls last, ao.nombre, e.sub_area;
$$;

create or replace function public.fn_sci_bd(p_cultivo integer default null, p_area_evaluada integer default null)
returns table (
  semana integer, campana text, cultivo text, planta text, fecha date, area_evaluada text, area_evaluadora text,
  sub_area text, grupo_evaluador text, cargo text, item smallint, pregunta text, criterio text,
  respuesta text, puntaje_item numeric, resultado_encuesta numeric, codigo text, origen text
) language sql stable set search_path = public as $$
  select e.semana, e.campana, c.nombre, e.planta, e.fecha, coalesce(ae.nombre_ci, ae.nombre), coalesce(ao.nombre_ci, ao.nombre), e.sub_area,
         public.fn_sci_grupo(case when ao.nombre = 'Producción' then ao.nombre else coalesce(ao.nombre_ci, ao.nombre) end, e.sub_area, e.planta, c.nombre), e.cargo,
         i.id, i.texto, k.nombre, public.fn_sci_respuesta(r.puntaje), r.puntaje / 100, e.resultado / 100,
         e.codigo, e.origen
  from public.sci_encuestas e
  join public.sci_respuestas r on r.encuesta_id = e.id
  join public.sci_items i on i.id = r.item_id
  join public.sci_criterios k on k.id = i.criterio_id
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.s5_areas ae on ae.id = e.area_evaluada_id
  join public.s5_areas ao on ao.id = e.area_evaluadora_id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
  order by e.fecha, e.codigo, i.id;
$$;
