-- 0020: Nombre legal de las áreas (Config → Áreas)
--
--   · Las áreas (s5_areas) son un solo catálogo para Auditoría 5S y Satisfacción del cliente
--     interno, y todo lo registrado apunta al área por su id: al renombrarla, el nombre nuevo
--     aparece en todas las pantallas, informes, presentaciones y Google Sheets, también en lo
--     ya registrado.
--   · s5_areas.alias guarda los nombres anteriores. Así el importador de Excel y quien escriba
--     el nombre viejo siguen encontrando el área (no se crea un área duplicada).

alter table public.s5_areas add column if not exists alias text[] not null default '{}';

create or replace function public.fn_s5_area_alias()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  if new.nombre is distinct from old.nombre then
    new.alias := array(
      select distinct a from unnest(array_append(coalesce(old.alias, '{}'), old.nombre)) a
      where lower(a) <> lower(new.nombre)
    );
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AREAS', 'Área renombrada', old.nombre || ' → ' || new.nombre);
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_s5_area_alias() from public, anon, authenticated;
drop trigger if exists trg_s5_area_alias on public.s5_areas;
create trigger trg_s5_area_alias before update on public.s5_areas
  for each row execute function public.fn_s5_area_alias();

/** Igual que en 0013, pero al crear también reconoce los nombres anteriores (alias) y no permite
 *  renombrar a un nombre que otra área ya usa como alias. */
create or replace function public.rpc_s5_guardar_area(p jsonb)
returns public.s5_areas language plpgsql security definer set search_path = public as $$
declare v public.s5_areas; v_nombre text := btrim(coalesce(p->>'nombre', ''));
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    perform public.exigir_rol('admin');
    if v_nombre <> '' and exists (select 1 from public.s5_areas a where a.id <> (p->>'id')::integer
                                  and exists (select 1 from unnest(a.alias) x where lower(x) = lower(v_nombre))) then
      raise exception '«%» es un nombre anterior de otra área. Usa otro nombre.', v_nombre;
    end if;
    update public.s5_areas set
      nombre = coalesce(nullif(v_nombre, ''), nombre),
      orden = coalesce(nullif(p->>'orden', '')::integer, orden),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el área.'; end if;
  else
    if v_nombre = '' then raise exception 'Escribe el nombre del área.'; end if;
    select * into v from public.s5_areas a
      where lower(a.nombre) = lower(v_nombre) or exists (select 1 from unnest(a.alias) x where lower(x) = lower(v_nombre))
      order by (lower(a.nombre) = lower(v_nombre)) desc limit 1;
    if v.id is not null then
      if not v.activo then raise exception 'El área % existe pero está desactivada. Pide a un administrador que la active.', v.nombre; end if;
      return v;
    end if;
    insert into public.s5_areas (nombre, orden) values (v_nombre, coalesce((select max(orden) + 1 from public.s5_areas), 1))
      returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AREAS', 'Área guardada', v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ya existe un área con ese nombre.';
end;
$$;
revoke execute on function public.rpc_s5_guardar_area(jsonb) from public, anon;
grant execute on function public.rpc_s5_guardar_area(jsonb) to authenticated;
