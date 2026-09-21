-- 0023: Áreas de Cliente interno — renombrar varias a la vez y reusar nombres anteriores
--
--   · rpc_sci_guardar_areas: guarda en una sola transacción todos los nombres editados en
--     Config → Áreas ([{id, nombre}, …]). O se guardan todos o ninguno. Admite intercambios
--     (A ↔ B) y cadenas (A toma el nombre de B, B uno nuevo).
--   · Un nombre que solo es el nombre ANTERIOR (alias) de otra área ya no bloquea: pasa al
--     área que lo toma y se quita del historial de la otra. Antes daba
--     «Ya existe un área «PCP» (o es el nombre anterior de otra)». Solo afecta a Satisfacción
--     del cliente interno (sci_areas); Auditoría 5S (s5_areas) no cambia.
--   · Los mensajes de error empiezan con el nombre actual del área entre «», para que la
--     pantalla marque la fila con el problema.

-- ================================================================ alias
/** Al renombrar, el nombre anterior pasa a alias. Los nombres provisorios «~tmp~…» del
    guardado múltiple no se guardan como alias. */
create or replace function public.fn_sci_area_alias()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    new.alias := array(select distinct a from unnest(array_append(coalesce(old.alias, '{}'), old.nombre)) a
                       where lower(a) <> lower(new.nombre) and a not like '~tmp~%');
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_sci_area_alias() from public, anon, authenticated;

/** Ningún alias puede ser el nombre actual de un área: el nombre pasó a quien lo usa hoy. */
create or replace function public.fn_sci_limpiar_alias()
returns void language sql security definer set search_path = public as $$
  update public.sci_areas a
     set alias = array(select x from unnest(a.alias) x
                       where not exists (select 1 from public.sci_areas b where lower(b.nombre) = lower(x)))
   where exists (select 1 from unnest(a.alias) x
                 join public.sci_areas b on lower(b.nombre) = lower(x));
$$;
revoke execute on function public.fn_sci_limpiar_alias() from public, anon, authenticated;

-- ================================================================ un área
/** Solo admin. Crear ({nombre}) o editar ({id, nombre?, activo?, orden?}). */
create or replace function public.rpc_sci_guardar_area(p jsonb)
returns public.sci_areas language plpgsql security definer set search_path = public as $$
declare v public.sci_areas; v_nombre text := btrim(coalesce(p->>'nombre', '')); v_antes text; v_otra text;
begin
  perform public.exigir_rol('admin');
  if v_nombre <> '' then
    select a.nombre into v_otra from public.sci_areas a
     where a.id is distinct from nullif(p->>'id', '')::integer and lower(a.nombre) = lower(v_nombre);
    if v_otra is not null then
      raise exception 'Ya existe un área «%».', v_otra;
    end if;
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
  perform public.fn_sci_limpiar_alias();
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', case when v_antes is null then 'Área creada' else 'Área editada' end,
            coalesce(v_antes || ' → ', '') || v.nombre || case when v.activo then '' else ' (desactivada)' end);
  select * into v from public.sci_areas where id = v.id;
  return v;
end;
$$;
revoke execute on function public.rpc_sci_guardar_area(jsonb) from public, anon;
grant execute on function public.rpc_sci_guardar_area(jsonb) to authenticated;

-- ================================================================ varias áreas
/** Solo admin. Renombra varias áreas en una transacción: p = [{id, nombre}, …].
    Las validaciones miran el estado final, así un intercambio A ↔ B es válido. */
create or replace function public.rpc_sci_guardar_areas(p jsonb)
returns setof public.sci_areas language plpgsql security definer set search_path = public as $$
declare
  v_ids integer[]; v_nombres text[]; v_antes text[];
  v_problema text; v_detalle text;
begin
  perform public.exigir_rol('admin');
  if jsonb_typeof(p) is distinct from 'array' then raise exception 'Faltan los cambios a guardar.'; end if;
  if exists (select 1 from jsonb_array_elements(p) x where coalesce(x->>'id', '') !~ '^[0-9]+$') then
    raise exception 'Hay un cambio sin área.';
  end if;

  -- Cambios reales (se ignoran los que dejan el nombre igual), en el orden recibido.
  select array_agg(c.id order by c.ord), array_agg(c.nombre order by c.ord), array_agg(a.nombre order by c.ord)
    into v_ids, v_nombres, v_antes
  from (select (x->>'id')::integer as id, btrim(coalesce(x->>'nombre', '')) as nombre, ord
          from jsonb_array_elements(p) with ordinality as t(x, ord)) c
  left join public.sci_areas a on a.id = c.id
  where a.id is null or a.nombre is distinct from c.nombre;

  if v_ids is null then return; end if;

  select string_agg(id::text, ', ') into v_problema
    from unnest(v_ids, v_antes) as t(id, antes) where antes is null;
  if v_problema is not null then raise exception 'No existe el área %.', v_problema; end if;

  select antes into v_problema from unnest(v_ids, v_antes) as t(id, antes)
   group by id, antes having count(*) > 1 limit 1;
  if v_problema is not null then raise exception '«%»: aparece dos veces en los cambios.', v_problema; end if;

  select antes into v_problema from unnest(v_nombres, v_antes) as t(nombre, antes) where nombre = '' limit 1;
  if v_problema is not null then raise exception '«%»: escribe el nuevo nombre.', v_problema; end if;

  select string_agg('«' || antes || '»', ' y ') into v_problema
  from unnest(v_nombres, v_antes) as t(nombre, antes)
  where lower(nombre) in (select lower(n) from unnest(v_nombres) n group by lower(n) having count(*) > 1);
  if v_problema is not null then raise exception '% quedarían con el mismo nombre.', v_problema; end if;

  select '«' || t.antes || '»: el nombre «' || t.nombre || '» ya lo usa el área «' || a.nombre || '».'
    into v_problema
  from unnest(v_nombres, v_antes) as t(nombre, antes)
  join public.sci_areas a on lower(a.nombre) = lower(t.nombre) and not (a.id = any (v_ids))
  limit 1;
  if v_problema is not null then raise exception '%', v_problema; end if;

  -- Dos pasadas: el índice único de nombre no es diferible y un intercambio chocaría a mitad.
  update public.sci_areas set nombre = '~tmp~' || id where id = any (v_ids);
  update public.sci_areas a set nombre = t.nombre
    from unnest(v_ids, v_nombres) as t(id, nombre) where a.id = t.id;
  perform public.fn_sci_limpiar_alias();

  select string_agg(antes || ' → ' || nombre, ' · ') into v_detalle from unnest(v_antes, v_nombres) as t(antes, nombre);
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Áreas renombradas', v_detalle);

  return query select * from public.sci_areas where id = any (v_ids) order by orden, nombre;
end;
$$;
revoke execute on function public.rpc_sci_guardar_areas(jsonb) from public, anon;
grant execute on function public.rpc_sci_guardar_areas(jsonb) to authenticated;
