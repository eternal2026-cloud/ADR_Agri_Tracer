-- 0027: Auditoría 5S · Gantt (cronograma de auditorías por cultivo y áreas que deben cumplirse)
--
-- Réplica de «Gantt - Plan de trabajo.xlsx»:
--   · Hoja «Gantt 5S»: por grupo (Cítricos, Arándano, Uva PDC, Uva PLM…) la 1°, 2° y 3°
--     auditoría con su semana ISO programada → s5_gantt_programas.
--   · Hoja «Hoja1»: áreas que se auditan en cada grupo → s5_gantt_areas.
--   · Un grupo apunta a un cultivo de s5_cultivos; si tiene planta, solo cuentan las
--     auditorías de esa planta (así Uva PDC y Uva PLM no se mezclan).
--   · Todo va por semana ISO: el día de la auditoría no es fijo. semana_inicio es el
--     lunes de la semana programada y semanas la duración de la ventana.
--   · Cumplimiento: un área cumple una auditoría programada si tiene una auditoría
--     (no anulada) del mismo cultivo y área cuya semana va desde la semana anterior
--     al inicio hasta 2 semanas después del fin de la ventana.
--   · Recordatorios por correo: la Edge Function «recordatorio-5s» los envía y anota
--     recordatorios / ultimo_recordatorio / ultimo_destino.
-- Escritura solo por RPC (admin); lectura por RLS.

-- ================================================================ tablas
create table if not exists public.s5_gantt_grupos (
  id serial primary key,
  nombre text not null unique check (btrim(nombre) <> ''),
  cultivo_id integer not null references public.s5_cultivos(id),
  planta text,
  color text not null default '#76B729' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.s5_gantt_areas (
  grupo_id integer not null references public.s5_gantt_grupos(id) on delete cascade,
  area_id integer not null references public.s5_areas(id),
  primary key (grupo_id, area_id)
);

-- semana_inicio: lunes de la semana ISO programada; semanas: duración de la ventana.
create table if not exists public.s5_gantt_programas (
  id serial primary key,
  grupo_id integer not null references public.s5_gantt_grupos(id) on delete cascade,
  numero_auditoria integer not null check (numero_auditoria between 1 and 99),
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),
  semanas smallint not null default 1 check (semanas between 1 and 12),
  estado text not null default 'Programado' check (estado in ('Programado', 'Cancelado')),
  nota text,
  recordatorios integer not null default 0,
  ultimo_recordatorio timestamptz,
  ultimo_destino text,
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now(),
  unique (grupo_id, numero_auditoria)
);
create index if not exists s5_gantt_programas_semana_idx on public.s5_gantt_programas (semana_inicio);

-- ================================================================ semilla (Excel «Gantt 5S» y «Hoja1»)
insert into public.s5_gantt_grupos (nombre, cultivo_id, color, orden)
select g.nombre, c.id, g.color, g.orden
from (values ('Cítricos', 'Cítrico', '#EF7C3B', 1), ('Arándano', 'Arándano', '#4B5FA8', 2),
             ('Uva PDC', 'Uva', '#7A3E8E', 3), ('Uva PLM', 'Uva', '#B05FC7', 4),
             ('Servicios Generales', '-', '#8C7B6B', 5)) as g(nombre, cultivo, color, orden)
join public.s5_cultivos c on c.nombre = g.cultivo
on conflict (nombre) do nothing;

insert into public.s5_gantt_areas (grupo_id, area_id)
select g.id, a.id
from (values
  ('Cítricos', 'Producción'), ('Cítricos', 'Frío'), ('Cítricos', 'Mantenimiento'), ('Cítricos', 'Manejo de Información'),
  ('Cítricos', 'Calidad'), ('Cítricos', 'Despacho'), ('Cítricos', 'Sanitización'),
  ('Arándano', 'Producción'), ('Arándano', 'Frío'), ('Arándano', 'Mantenimiento'), ('Arándano', 'Manejo de Información'),
  ('Arándano', 'Calidad'), ('Arándano', 'Despacho'), ('Arándano', 'Sanitización'),
  ('Uva PDC', 'Producción'), ('Uva PDC', 'Frío'), ('Uva PDC', 'Limpieza'), ('Uva PDC', 'Mantenimiento'),
  ('Uva PDC', 'Manejo de Información'), ('Uva PDC', 'Calidad'), ('Uva PDC', 'Despacho'), ('Uva PDC', 'Sanitización'),
  ('Uva PLM', 'Producción'), ('Uva PLM', 'Frío'), ('Uva PLM', 'Limpieza'), ('Uva PLM', 'Mantenimiento'),
  ('Uva PLM', 'Manejo de Información'), ('Uva PLM', 'Calidad'), ('Uva PLM', 'Despacho'), ('Uva PLM', 'Sanitización'),
  ('Servicios Generales', 'Servicios Generales')
) as x(grupo, area)
join public.s5_gantt_grupos g on g.nombre = x.grupo
join public.s5_areas a on a.nombre = x.area
on conflict do nothing;

insert into public.s5_gantt_programas (grupo_id, numero_auditoria, semana_inicio, semanas, nota)
select g.id, p.numero, p.inicio::date, p.semanas, p.nota
from (values
  ('Cítricos', 1, '2026-08-03', 1, null), ('Cítricos', 2, '2026-09-07', 1, null),
  ('Cítricos', 3, '2026-09-28', 1, null),
  ('Arándano', 1, '2026-09-07', 3, null), ('Arándano', 2, '2026-10-05', 1, null),
  ('Arándano', 3, '2026-11-02', 1, null),
  ('Uva PDC', 1, '2026-10-26', 1, null), ('Uva PDC', 2, '2026-11-30', 1, null), ('Uva PDC', 3, '2026-12-28', 1, null),
  ('Uva PLM', 1, '2026-11-02', 1, null), ('Uva PLM', 2, '2026-12-07', 1, null), ('Uva PLM', 3, '2027-01-04', 1, null),
  ('Servicios Generales', 1, '2026-09-21', 1, null)
) as p(grupo, numero, inicio, semanas, nota)
join public.s5_gantt_grupos g on g.nombre = p.grupo
on conflict (grupo_id, numero_auditoria) do nothing;

-- ================================================================ lectura: cumplimiento por programa y área
create or replace function public.fn_s5_gantt()
returns table (
  programa_id integer, grupo_id integer, numero_auditoria integer, semana_inicio date, semanas smallint,
  fecha_fin date, estado text, nota text, recordatorios integer, ultimo_recordatorio timestamptz, ultimo_destino text,
  area_id integer, area text, auditoria_id uuid, codigo text, fecha date, estado_auditoria text, pct numeric
) language sql stable set search_path = public as $$
  select p.id, p.grupo_id, p.numero_auditoria, p.semana_inicio, p.semanas,
         (p.semana_inicio + p.semanas * 7 - 1), p.estado, p.nota, p.recordatorios, p.ultimo_recordatorio, p.ultimo_destino,
         ar.id, ar.nombre, au.id, au.codigo, au.fecha, au.estado,
         (select avg(v) from public.fn_s5_resumen(au.id) r, unnest(array[r.p1, r.p2, r.p3, r.p4, r.p5]) v)
  from public.s5_gantt_programas p
  join public.s5_gantt_grupos g on g.id = p.grupo_id
  join public.s5_gantt_areas ga on ga.grupo_id = g.id
  join public.s5_areas ar on ar.id = ga.area_id
  left join lateral (
    select a.id, a.codigo, a.fecha, a.estado
    from public.s5_auditorias a
    where a.cultivo_id = g.cultivo_id and a.area_id = ar.id and a.estado <> 'anulada'
      and (nullif(btrim(g.planta), '') is null or a.planta ilike '%' || btrim(g.planta) || '%')
      and a.fecha between p.semana_inicio - 7 and p.semana_inicio + p.semanas * 7 - 1 + 14
    order by (a.estado = 'cerrada') desc, abs(a.fecha - p.semana_inicio), a.fecha
    limit 1
  ) au on true
  order by g.orden, p.numero_auditoria, ar.orden;
$$;

-- ================================================================ RPC (solo administradores)
create or replace function public.rpc_s5_gantt_guardar_grupo(p jsonb)
returns public.s5_gantt_grupos language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_grupos; v_id integer := nullif(p->>'id', '')::integer; v_areas integer[];
begin
  perform public.exigir_rol('admin');
  if nullif(btrim(p->>'nombre'), '') is null then raise exception 'Escribe el nombre del grupo (ej. Uva PLM).'; end if;
  if not exists (select 1 from public.s5_cultivos where id = nullif(p->>'cultivo_id', '')::integer) then
    raise exception 'Elige el cultivo del grupo.';
  end if;
  if v_id is null then
    insert into public.s5_gantt_grupos (nombre, cultivo_id, planta, color, orden)
    values (btrim(p->>'nombre'), (p->>'cultivo_id')::integer, nullif(btrim(p->>'planta'), ''),
            coalesce(nullif(p->>'color', ''), '#76B729'),
            coalesce(nullif(p->>'orden', '')::integer, (select coalesce(max(orden), 0) + 1 from public.s5_gantt_grupos)))
    returning * into v;
  else
    update public.s5_gantt_grupos set
      nombre = btrim(p->>'nombre'), cultivo_id = (p->>'cultivo_id')::integer, planta = nullif(btrim(p->>'planta'), ''),
      color = coalesce(nullif(p->>'color', ''), color), activo = coalesce((p->>'activo')::boolean, activo)
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

create or replace function public.rpc_s5_gantt_guardar_programa(p jsonb)
returns public.s5_gantt_programas language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_programas; v_id integer := nullif(p->>'id', '')::integer; v_ini date; v_grupo text;
begin
  perform public.exigir_rol('admin');
  v_ini := nullif(p->>'semana_inicio', '')::date;
  if v_ini is null then raise exception 'Elige la semana programada.'; end if;
  v_ini := v_ini - (extract(isodow from v_ini)::int - 1);  -- siempre el lunes de esa semana
  if v_id is null then
    insert into public.s5_gantt_programas (grupo_id, numero_auditoria, semana_inicio, semanas, estado, nota, actualizado_por)
    values ((p->>'grupo_id')::integer, (p->>'numero_auditoria')::integer, v_ini, coalesce(nullif(p->>'semanas', '')::smallint, 1),
            coalesce(nullif(p->>'estado', ''), 'Programado'), nullif(btrim(p->>'nota'), ''), auth.uid())
    returning * into v;
  else
    update public.s5_gantt_programas set
      numero_auditoria = coalesce(nullif(p->>'numero_auditoria', '')::integer, numero_auditoria),
      semana_inicio = v_ini, semanas = coalesce(nullif(p->>'semanas', '')::smallint, semanas),
      estado = coalesce(nullif(p->>'estado', ''), estado), nota = nullif(btrim(p->>'nota'), ''),
      actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id returning * into v;
    if v.id is null then raise exception 'No existe la auditoría programada.'; end if;
  end if;
  select nombre into v_grupo from public.s5_gantt_grupos where id = v.grupo_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Gantt: programa guardado',
            v_grupo || ' · ' || v.numero_auditoria || '° auditoría · semana ' || extract(week from v.semana_inicio) || ' · ' || v.estado);
  return v;
exception when unique_violation then
  raise exception 'Ese grupo ya tiene programada la %° auditoría.', p->>'numero_auditoria';
end;
$$;

create or replace function public.rpc_s5_gantt_eliminar_programa(p_id integer)
returns void language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_programas; v_grupo text;
begin
  perform public.exigir_rol('admin');
  delete from public.s5_gantt_programas where id = p_id returning * into v;
  if v.id is null then raise exception 'No existe la auditoría programada.'; end if;
  select nombre into v_grupo from public.s5_gantt_grupos where id = v.grupo_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Gantt: programa eliminado', v_grupo || ' · ' || v.numero_auditoria || '° auditoría');
end;
$$;

-- ================================================================ seguridad
alter table public.s5_gantt_grupos enable row level security;
alter table public.s5_gantt_areas enable row level security;
alter table public.s5_gantt_programas enable row level security;
do $$
declare t text;
begin
  foreach t in array array['s5_gantt_grupos', 's5_gantt_areas', 's5_gantt_programas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rol_actual() in (''admin'', ''captura'', ''visor''))', t || '_select', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on function public.fn_s5_gantt() from public, anon;
grant execute on function public.fn_s5_gantt() to authenticated, service_role;
revoke execute on function public.rpc_s5_gantt_guardar_grupo(jsonb) from public, anon;
revoke execute on function public.rpc_s5_gantt_guardar_programa(jsonb) from public, anon;
revoke execute on function public.rpc_s5_gantt_eliminar_programa(integer) from public, anon;
grant execute on function public.rpc_s5_gantt_guardar_grupo(jsonb) to authenticated;
grant execute on function public.rpc_s5_gantt_guardar_programa(jsonb) to authenticated;
grant execute on function public.rpc_s5_gantt_eliminar_programa(integer) to authenticated;
