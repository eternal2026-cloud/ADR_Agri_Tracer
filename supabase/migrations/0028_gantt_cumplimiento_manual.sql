-- 0028: Gantt 5S · cumplimiento marcado a mano y grupos sin cruce con Integra
--
--   · Las auditorías anteriores se hicieron en Excel: el cumplimiento de cada área
--     se puede marcar a mano (s5_gantt_cumplimientos) y esa marca manda sobre lo
--     que se calcule desde Integra.
--   · s5_gantt_grupos.auto_integra: si es false, el grupo no se cruza con las
--     auditorías registradas en Integra (solo cuentan las marcas manuales).
--     Servicios Generales no tiene cultivo: se crea con auto_integra = false.
--   · Corrección del Excel: la marca de L10 (S39) era la auditoría de Servicios
--     Generales, no la de Arándano → Arándano 1° auditoría dura solo la S37.

alter table public.s5_gantt_grupos add column if not exists auto_integra boolean not null default true;
update public.s5_gantt_grupos set auto_integra = false where nombre = 'Servicios Generales';

update public.s5_gantt_programas p set semanas = 1
from public.s5_gantt_grupos g
where g.id = p.grupo_id and g.nombre = 'Arándano' and p.numero_auditoria = 1 and p.semana_inicio = '2026-09-07';

create table if not exists public.s5_gantt_cumplimientos (
  programa_id integer not null references public.s5_gantt_programas(id) on delete cascade,
  area_id integer not null references public.s5_areas(id),
  cumplido boolean not null,
  semana date check (semana is null or extract(isodow from semana) = 1),
  nota text,
  marcado_por uuid references public.perfiles(id),
  marcado_en timestamptz not null default now(),
  primary key (programa_id, area_id)
);

-- ================================================================ lectura
drop function if exists public.fn_s5_gantt();
create or replace function public.fn_s5_gantt()
returns table (
  programa_id integer, grupo_id integer, numero_auditoria integer, semana_inicio date, semanas smallint,
  fecha_fin date, estado text, nota text, recordatorios integer, ultimo_recordatorio timestamptz, ultimo_destino text,
  area_id integer, area text, auditoria_id uuid, codigo text, fecha date, estado_auditoria text, pct numeric,
  manual boolean, manual_cumplido boolean, manual_semana date, manual_nota text, manual_por text, manual_en timestamptz
) language sql stable set search_path = public as $$
  select p.id, p.grupo_id, p.numero_auditoria, p.semana_inicio, p.semanas,
         (p.semana_inicio + p.semanas * 7 - 1), p.estado, p.nota, p.recordatorios, p.ultimo_recordatorio, p.ultimo_destino,
         ar.id, ar.nombre, au.id, au.codigo, au.fecha, au.estado,
         (select avg(v) from public.fn_s5_resumen(au.id) r, unnest(array[r.p1, r.p2, r.p3, r.p4, r.p5]) v),
         m.programa_id is not null, m.cumplido, m.semana, m.nota, pf.nombre, m.marcado_en
  from public.s5_gantt_programas p
  join public.s5_gantt_grupos g on g.id = p.grupo_id
  join public.s5_gantt_areas ga on ga.grupo_id = g.id
  join public.s5_areas ar on ar.id = ga.area_id
  left join public.s5_gantt_cumplimientos m on m.programa_id = p.id and m.area_id = ar.id
  left join public.perfiles pf on pf.id = m.marcado_por
  left join lateral (
    -- Por semana: desde la semana anterior al inicio hasta 2 semanas después del fin.
    select a.id, a.codigo, a.fecha, a.estado
    from public.s5_auditorias a
    where g.auto_integra and a.cultivo_id = g.cultivo_id and a.area_id = ar.id and a.estado <> 'anulada'
      and (nullif(btrim(g.planta), '') is null or a.planta ilike '%' || btrim(g.planta) || '%')
      and a.fecha between p.semana_inicio - 7 and p.semana_inicio + p.semanas * 7 - 1 + 14
    order by (a.estado = 'cerrada') desc, abs(a.fecha - p.semana_inicio), a.fecha
    limit 1
  ) au on true
  order by g.orden, p.numero_auditoria, ar.orden;
$$;

-- ================================================================ RPC: marcar cumplimiento (admin y auditores)
-- p_marcas: [{ area_id, cumplido: true | false | null }] — null quita la marca manual.
create or replace function public.rpc_s5_gantt_marcar(p_programa integer, p_marcas jsonb, p_semana date default null, p_nota text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_programas; v_grupo text; x jsonb; v_area integer; v_n integer := 0; v_sem date;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into v from public.s5_gantt_programas where id = p_programa;
  if v.id is null then raise exception 'No existe la auditoría programada.'; end if;
  if jsonb_typeof(p_marcas) is distinct from 'array' then raise exception 'Se esperaba la lista de áreas.'; end if;
  v_sem := case when p_semana is null then null else p_semana - (extract(isodow from p_semana)::int - 1) end;

  for x in select * from jsonb_array_elements(p_marcas) loop
    v_area := nullif(x->>'area_id', '')::integer;
    if not exists (select 1 from public.s5_gantt_areas where grupo_id = v.grupo_id and area_id = v_area) then
      raise exception 'El área % no está entre las áreas a cumplir de este grupo.', coalesce(x->>'area_id', '?');
    end if;
    if x->'cumplido' is null or jsonb_typeof(x->'cumplido') = 'null' then
      delete from public.s5_gantt_cumplimientos where programa_id = v.id and area_id = v_area;
    else
      insert into public.s5_gantt_cumplimientos (programa_id, area_id, cumplido, semana, nota, marcado_por, marcado_en)
      values (v.id, v_area, (x->>'cumplido')::boolean, case when (x->>'cumplido')::boolean then coalesce(v_sem, v.semana_inicio) end,
              nullif(btrim(p_nota), ''), auth.uid(), now())
      on conflict (programa_id, area_id) do update set
        cumplido = excluded.cumplido, semana = excluded.semana, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_en = excluded.marcado_en;
    end if;
    v_n := v_n + 1;
  end loop;

  select nombre into v_grupo from public.s5_gantt_grupos where id = v.grupo_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Gantt: cumplimiento marcado',
            v_grupo || ' · ' || v.numero_auditoria || '° auditoría · ' || v_n || ' área(s)');
  return v_n;
end;
$$;

-- ================================================================ RPC: grupo con auto_integra
create or replace function public.rpc_s5_gantt_guardar_grupo(p jsonb)
returns public.s5_gantt_grupos language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_grupos; v_id integer := nullif(p->>'id', '')::integer; v_areas integer[];
begin
  perform public.exigir_rol('admin');
  if nullif(btrim(p->>'nombre'), '') is null then raise exception 'Escribe el nombre del grupo (ej. Uva PLM).'; end if;
  if not exists (select 1 from public.s5_cultivos where id = nullif(p->>'cultivo_id', '')::integer) then
    raise exception 'Elige el cultivo del grupo (o «Sin cultivo»).';
  end if;
  if v_id is null then
    insert into public.s5_gantt_grupos (nombre, cultivo_id, planta, color, orden, auto_integra)
    values (btrim(p->>'nombre'), (p->>'cultivo_id')::integer, nullif(btrim(p->>'planta'), ''),
            coalesce(nullif(p->>'color', ''), '#76B729'),
            coalesce(nullif(p->>'orden', '')::integer, (select coalesce(max(orden), 0) + 1 from public.s5_gantt_grupos)),
            coalesce((p->>'auto_integra')::boolean, true))
    returning * into v;
  else
    update public.s5_gantt_grupos set
      nombre = btrim(p->>'nombre'), cultivo_id = (p->>'cultivo_id')::integer, planta = nullif(btrim(p->>'planta'), ''),
      color = coalesce(nullif(p->>'color', ''), color), activo = coalesce((p->>'activo')::boolean, activo),
      auto_integra = coalesce((p->>'auto_integra')::boolean, auto_integra)
    where id = v_id returning * into v;
    if v.id is null then raise exception 'No existe el grupo.'; end if;
  end if;
  if jsonb_typeof(p->'areas') = 'array' then
    select array_agg(distinct (x)::integer) into v_areas from jsonb_array_elements_text(p->'areas') x;
    delete from public.s5_gantt_areas where grupo_id = v.id and area_id <> all (coalesce(v_areas, '{}'));
    insert into public.s5_gantt_areas (grupo_id, area_id)
    select v.id, a.id from public.s5_areas a where a.id = any (coalesce(v_areas, '{}')) on conflict do nothing;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Gantt: grupo guardado', v.nombre);
  return v;
end;
$$;

-- ================================================================ seguridad
alter table public.s5_gantt_cumplimientos enable row level security;
drop policy if exists s5_gantt_cumplimientos_select on public.s5_gantt_cumplimientos;
create policy s5_gantt_cumplimientos_select on public.s5_gantt_cumplimientos for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor'));
revoke insert, update, delete, truncate on public.s5_gantt_cumplimientos from anon, authenticated;

revoke execute on function public.fn_s5_gantt() from public, anon;
grant execute on function public.fn_s5_gantt() to authenticated, service_role;
revoke execute on function public.rpc_s5_gantt_marcar(integer, jsonb, date, text) from public, anon;
grant execute on function public.rpc_s5_gantt_marcar(integer, jsonb, date, text) to authenticated;
