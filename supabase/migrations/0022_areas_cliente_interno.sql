-- 0022: Áreas propias de Satisfacción del cliente interno + área del evaluador + sugerencias obligatorias
--
--   · sci_areas: catálogo de áreas SOLO de Cliente interno (Config → Áreas). Permite separar lo que
--     en 5S es una sola área (p. ej. Producción → Producción Cítricos, Producción Arándano,
--     Producción Uva Limpieza). Auditoría 5S sigue con s5_areas, sin cambios.
--     Se crea con los mismos id de s5_areas y el nombre que se veía en Cliente interno, así las
--     encuestas y los permisos ya asignados siguen apuntando a la misma área.
--   · sci_areas.alias: nombres anteriores y el nombre de 5S, para que el importador de Excel las reconozca.
--   · perfiles.sci_area: área a la que pertenece el usuario (área evaluadora de sus encuestas).
--   · sci_encuestas.mejoras_items: mejora escrita para cada ítem con desacuerdo ({"3": "…"}).
--   · rpc_sci_guardar_encuesta exige las tres sugerencias y esas mejoras (registros desde la app).

-- ================================================================ catálogo propio
create table if not exists public.sci_areas (
  id serial primary key,
  nombre text not null check (btrim(nombre) <> ''),
  alias text[] not null default '{}',
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists sci_areas_nombre_uidx on public.sci_areas (lower(nombre));

insert into public.sci_areas (id, nombre, alias, orden, activo)
select a.id, coalesce(a.nombre_ci, a.nombre),
       array(select distinct x from unnest(a.alias || case when a.nombre_ci is not null then array[a.nombre] else '{}'::text[] end) x
             where lower(x) <> lower(coalesce(a.nombre_ci, a.nombre))),
       a.orden, a.activo
from public.s5_areas a
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.sci_areas', 'id'), greatest((select max(id) from public.sci_areas), 1));

alter table public.sci_encuestas drop constraint if exists sci_encuestas_area_evaluada_id_fkey;
alter table public.sci_encuestas drop constraint if exists sci_encuestas_area_evaluadora_id_fkey;
alter table public.sci_encuestas add constraint sci_encuestas_area_evaluada_id_fkey foreign key (area_evaluada_id) references public.sci_areas(id);
alter table public.sci_encuestas add constraint sci_encuestas_area_evaluadora_id_fkey foreign key (area_evaluadora_id) references public.sci_areas(id);

-- El nombre propio de 0021 ya vive en sci_areas.
drop function if exists public.rpc_sci_nombre_area(integer, text);
alter table public.s5_areas drop column if exists nombre_ci;

/** Al renombrar, el nombre anterior pasa a alias. */
create or replace function public.fn_sci_area_alias()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    new.alias := array(select distinct a from unnest(array_append(coalesce(old.alias, '{}'), old.nombre)) a
                       where lower(a) <> lower(new.nombre));
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_sci_area_alias() from public, anon, authenticated;
drop trigger if exists trg_sci_area_alias on public.sci_areas;
create trigger trg_sci_area_alias before insert or update on public.sci_areas
  for each row execute function public.fn_sci_area_alias();

/** Solo admin. Crear ({nombre}) o editar ({id, nombre?, activo?, orden?}). */
create or replace function public.rpc_sci_guardar_area(p jsonb)
returns public.sci_areas language plpgsql security definer set search_path = public as $$
declare v public.sci_areas; v_nombre text := btrim(coalesce(p->>'nombre', '')); v_antes text;
begin
  perform public.exigir_rol('admin');
  if v_nombre <> '' and exists (select 1 from public.sci_areas a
       where a.id is distinct from nullif(p->>'id', '')::integer
         and (lower(a.nombre) = lower(v_nombre) or exists (select 1 from unnest(a.alias) x where lower(x) = lower(v_nombre)))) then
    raise exception 'Ya existe un área «%» (o es el nombre anterior de otra).', v_nombre;
  end if;
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    select nombre into v_antes from public.sci_areas where id = (p->>'id')::integer;
    update public.sci_areas set
      nombre = coalesce(nullif(v_nombre, ''), nombre),
      orden = coalesce(nullif(p->>'orden', '')::integer, orden),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el área.'; end if;
  else
    if v_nombre = '' then raise exception 'Escribe el nombre del área.'; end if;
    insert into public.sci_areas (nombre, orden) values (v_nombre, coalesce((select max(orden) + 1 from public.sci_areas), 1))
      returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', case when v_antes is null then 'Área creada' else 'Área editada' end,
            coalesce(v_antes || ' → ', '') || v.nombre || case when v.activo then '' else ' (desactivada)' end);
  return v;
end;
$$;
revoke execute on function public.rpc_sci_guardar_area(jsonb) from public, anon;
grant execute on function public.rpc_sci_guardar_area(jsonb) to authenticated;

alter table public.sci_areas enable row level security;
drop policy if exists sci_areas_select on public.sci_areas;
create policy sci_areas_select on public.sci_areas for select to authenticated using (public.rol_actual() in ('admin', 'captura', 'visor'));
revoke insert, update, delete, truncate on public.sci_areas from anon, authenticated;
drop trigger if exists trg_bloquear_truncate on public.sci_areas;
create trigger trg_bloquear_truncate before truncate on public.sci_areas for each statement execute function public.fn_bloquear_vaciado();
drop trigger if exists trg_sci_bloquear_borrado on public.sci_areas;
create trigger trg_sci_bloquear_borrado before delete on public.sci_areas for each row execute function public.fn_sci_bloquear_borrado();

-- ================================================================ área del evaluador y mejoras por ítem
alter table public.perfiles add column if not exists sci_area integer references public.sci_areas(id);
alter table public.sci_encuestas add column if not exists mejoras_items jsonb not null default '{}'::jsonb;

drop function if exists public.rpc_sci_permisos(uuid, text[], integer[]);
create or replace function public.rpc_sci_permisos(p_perfil uuid, p_plantas text[], p_areas integer[], p_area_propia integer)
returns public.perfiles language plpgsql security definer set search_path = public as $$
declare v public.perfiles; v_plantas text[]; v_areas integer[]; v_propia public.sci_areas;
begin
  perform public.exigir_rol('admin');
  select coalesce(array_agg(distinct upper(btrim(x))) filter (where btrim(x) <> ''), '{}') into v_plantas
    from unnest(coalesce(p_plantas, '{}')) x;
  select coalesce(array_agg(distinct a.id), '{}') into v_areas
    from public.sci_areas a where a.id = any (coalesce(p_areas, '{}'));
  if p_area_propia is not null then
    select * into v_propia from public.sci_areas where id = p_area_propia;
    if v_propia.id is null then raise exception 'No existe el área del usuario.'; end if;
    if v_propia.id = any (v_areas) then raise exception 'Un área no se evalúa a sí misma: quita «%» de las áreas a evaluar.', v_propia.nombre; end if;
  end if;
  update public.perfiles set sci_plantas = v_plantas, sci_areas = v_areas, sci_area = v_propia.id
    where id = p_perfil returning * into v;
  if v.id is null then raise exception 'Usuario no encontrado.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Permisos de evaluación',
            v.usuario || ' · su área: ' || coalesce(v_propia.nombre, 'sin asignar') ||
            ' · plantas: ' || coalesce(nullif(array_to_string(v_plantas, ', '), ''), 'todas') ||
            ' · evalúa: ' || coalesce(nullif((select string_agg(nombre, ', ' order by nombre) from public.sci_areas where id = any (v_areas)), ''), 'todas'));
  return v;
end;
$$;
revoke execute on function public.rpc_sci_permisos(uuid, text[], integer[], integer) from public, anon;
grant execute on function public.rpc_sci_permisos(uuid, text[], integer[], integer) to authenticated;

create or replace function public.fn_sci_permisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.perfiles;
begin
  if auth.uid() is null or new.origen <> 'app' then return new; end if;
  select * into p from public.perfiles where id = auth.uid();
  if p.id is null or p.rol = 'admin' then return new; end if;
  if cardinality(p.sci_plantas) > 0 and (new.planta is null or not (new.planta = any (p.sci_plantas))) then
    raise exception 'No tienes asignada la planta «%». Elige una de tus plantas: %.',
      coalesce(new.planta, 'Sin planta'), array_to_string(p.sci_plantas, ', ');
  end if;
  if cardinality(p.sci_areas) > 0 and not (new.area_evaluada_id = any (p.sci_areas)) then
    raise exception 'No tienes asignada esa área para evaluar. Pide a un administrador que te la asigne.';
  end if;
  if p.sci_area is not null and new.area_evaluadora_id <> p.sci_area then
    raise exception 'Tu área evaluadora es la que te asignó el administrador.';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_sci_permisos() from public, anon, authenticated;

-- ================================================================ funciones de Cliente interno sobre sci_areas
create or replace function public.fn_sci_validar(p jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_faltan text; v_invalidos text;
begin
  if not exists (select 1 from public.s5_cultivos where id = nullif(p->>'cultivo_id', '')::integer) then
    raise exception 'Elige el cultivo.';
  end if;
  if coalesce(btrim(p->>'campana'), '') = '' then raise exception 'Falta la campaña.'; end if;
  if coalesce(p->>'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha de la encuesta.'; end if;
  if (p->>'fecha')::date > public.fn_hoy_lima() then raise exception 'La fecha no puede estar en el futuro.'; end if;
  if not exists (select 1 from public.sci_areas where id = nullif(p->>'area_evaluada_id', '')::integer) then
    raise exception 'Elige el área evaluada.';
  end if;
  if not exists (select 1 from public.sci_areas where id = nullif(p->>'area_evaluadora_id', '')::integer) then
    raise exception 'Elige el área evaluadora.';
  end if;
  if jsonb_typeof(p->'respuestas') is distinct from 'array' then raise exception 'Faltan las respuestas.'; end if;

  select string_agg(coalesce(x->>'item', '?') || '=' || coalesce(x->>'puntaje', '?'), ', ') into v_invalidos
  from jsonb_array_elements(p->'respuestas') x
  where coalesce(x->>'item', '') !~ '^([1-9]|10)$'
     or coalesce(x->>'puntaje', '') !~ '^[0-9]+(\.[0-9]+)?$'
     or (x->>'puntaje')::numeric not in (4, 6.5, 8.5, 10);
  if v_invalidos is not null then raise exception 'Respuestas inválidas: %.', v_invalidos; end if;

  select string_agg(i.id::text, ', ' order by i.id) into v_faltan
  from public.sci_items i
  where not exists (select 1 from jsonb_array_elements(p->'respuestas') x where (x->>'item')::integer = i.id);
  if v_faltan is not null then raise exception 'Falta responder los ítems: %.', v_faltan; end if;
  return p->'respuestas';
end;
$$;

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
         ae.id, ae.nombre, ao.id, ao.nombre, e.sub_area, e.planta,
         public.fn_sci_grupo(ao.nombre, e.sub_area, e.planta, c.nombre), e.cargo, e.evaluador,
         max(k.pct) filter (where k.criterio_id = 1), max(k.pct) filter (where k.criterio_id = 2),
         max(k.pct) filter (where k.criterio_id = 3), max(k.pct) filter (where k.criterio_id = 4),
         e.resultado, e.aspectos_valorados, e.aspectos_mejorar, e.recomendaciones, e.origen, e.archivo, e.creado_en
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

create or replace function public.fn_sci_bd(p_cultivo integer default null, p_area_evaluada integer default null)
returns table (
  semana integer, campana text, cultivo text, planta text, fecha date, area_evaluada text, area_evaluadora text,
  sub_area text, grupo_evaluador text, cargo text, item smallint, pregunta text, criterio text,
  respuesta text, puntaje_item numeric, resultado_encuesta numeric, codigo text, origen text
) language sql stable set search_path = public as $$
  select e.semana, e.campana, c.nombre, e.planta, e.fecha, ae.nombre, ao.nombre, e.sub_area,
         public.fn_sci_grupo(ao.nombre, e.sub_area, e.planta, c.nombre), e.cargo,
         i.id, i.texto, k.nombre, public.fn_sci_respuesta(r.puntaje), r.puntaje / 100, e.resultado / 100,
         e.codigo, e.origen
  from public.sci_encuestas e
  join public.sci_respuestas r on r.encuesta_id = e.id
  join public.sci_items i on i.id = r.item_id
  join public.sci_criterios k on k.id = i.criterio_id
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.sci_areas ae on ae.id = e.area_evaluada_id
  join public.sci_areas ao on ao.id = e.area_evaluadora_id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
  order by e.fecha, e.codigo, i.id;
$$;

create or replace function public.rpc_sci_guardar_encuesta(p jsonb)
returns public.sci_encuestas language plpgsql security definer set search_path = public as $$
declare v public.sci_encuestas; v_id uuid; v_clave text; v_falta text;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la encuesta.'; end if;
  v_id := (p->>'id')::uuid;
  perform public.fn_sci_validar(p);
  -- Sugerencias obligatorias (0022) y una mejora por cada ítem «En desacuerdo» o «Totalmente en desacuerdo».
  if coalesce(btrim(p->>'aspectos_valorados'), '') = '' then raise exception 'Escribe qué aspectos valoras del área evaluada.'; end if;
  if coalesce(btrim(p->>'aspectos_mejorar'), '') = '' then raise exception 'Escribe qué aspectos debería mejorar el área evaluada.'; end if;
  if coalesce(btrim(p->>'recomendaciones'), '') = '' then raise exception 'Escribe tu sugerencia para mejorar la coordinación entre las áreas.'; end if;
  select string_agg(x->>'item', ', ' order by (x->>'item')::integer) into v_falta
  from jsonb_array_elements(p->'respuestas') x
  where (x->>'puntaje')::numeric in (4, 6.5) and coalesce(btrim(p->'mejoras_items'->>(x->>'item')), '') = '';
  if v_falta is not null then raise exception 'Indica qué debe mejorar en los ítems con desacuerdo: %.', v_falta; end if;
  v_clave := public.fn_sci_clave((p->>'cultivo_id')::integer, (p->>'area_evaluada_id')::integer,
    (p->>'area_evaluadora_id')::integer, nullif(btrim(p->>'sub_area'), ''), upper(nullif(btrim(p->>'planta'), '')), (p->>'fecha')::date);

  select * into v from public.sci_encuestas where id = v_id for update;
  if v.id is not null then
    if v.origen <> 'app' or v.estado <> 'activa' then raise exception 'La encuesta % no se puede editar.', v.codigo; end if;
    if public.rol_actual() is distinct from 'admin' and v.creado_en::date < public.fn_hoy_lima() then
      raise exception 'La encuesta % solo la corrige un administrador después del día de registro.', v.codigo;
    end if;
  end if;
  if exists (select 1 from public.sci_encuestas where clave = v_clave and estado = 'activa' and id <> v_id) then
    raise exception 'Ya existe una encuesta de ese evaluador para esa área y fecha.';
  end if;

  if v.id is null then
    insert into public.sci_encuestas (id, cultivo_id, campana, fecha, area_evaluada_id, area_evaluadora_id, sub_area, planta,
      cargo, evaluador, aspectos_valorados, aspectos_mejorar, recomendaciones, mejoras_items, origen, clave, registrado_por, creado_por, actualizado_por)
    values (v_id, (p->>'cultivo_id')::integer, btrim(p->>'campana'), (p->>'fecha')::date,
      (p->>'area_evaluada_id')::integer, (p->>'area_evaluadora_id')::integer, p->>'sub_area', p->>'planta',
      nullif(btrim(p->>'cargo'), ''), nullif(btrim(p->>'evaluador'), ''),
      nullif(btrim(p->>'aspectos_valorados'), ''), nullif(btrim(p->>'aspectos_mejorar'), ''), nullif(btrim(p->>'recomendaciones'), ''),
      coalesce(p->'mejoras_items', '{}'::jsonb), 'app', v_clave, public.fn_s5_mi_nombre(), auth.uid(), auth.uid());
  else
    update public.sci_encuestas set
      cultivo_id = (p->>'cultivo_id')::integer, campana = btrim(p->>'campana'), fecha = (p->>'fecha')::date,
      area_evaluada_id = (p->>'area_evaluada_id')::integer, area_evaluadora_id = (p->>'area_evaluadora_id')::integer,
      sub_area = p->>'sub_area', planta = p->>'planta',
      cargo = nullif(btrim(p->>'cargo'), ''), evaluador = nullif(btrim(p->>'evaluador'), ''),
      aspectos_valorados = nullif(btrim(p->>'aspectos_valorados'), ''), aspectos_mejorar = nullif(btrim(p->>'aspectos_mejorar'), ''),
      recomendaciones = nullif(btrim(p->>'recomendaciones'), ''), mejoras_items = coalesce(p->'mejoras_items', '{}'::jsonb),
      actualizado_por = auth.uid()
    where id = v_id;
  end if;
  perform public.fn_sci_escribir_respuestas(v_id, p->'respuestas');
  select * into v from public.sci_encuestas where id = v_id;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Encuesta guardada', v.codigo || ' · ' || round(v.resultado, 1) || ' %');
  return v;
end;
$$;

revoke execute on function public.fn_sci_validar(jsonb) from public, anon, authenticated;
revoke execute on function public.fn_sci_resultados(integer, integer, date, date) from public, anon;
revoke execute on function public.fn_sci_bd(integer, integer) from public, anon;
grant execute on function public.fn_sci_resultados(integer, integer, date, date) to authenticated, service_role;
grant execute on function public.fn_sci_bd(integer, integer) to authenticated, service_role;
revoke execute on function public.rpc_sci_guardar_encuesta(jsonb) from public, anon;
grant execute on function public.rpc_sci_guardar_encuesta(jsonb) to authenticated;
