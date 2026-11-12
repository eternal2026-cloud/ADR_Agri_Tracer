-- ============================================================================
-- 0069 · Estudio TOP · el admin edita nombre y categoría de las etapas
-- Las tomas (top_tiempos), REBA y propuestas guardan solo actividad_id: al
-- cambiar el catálogo, todos los registros pasados (Resumen, Excel, Sheets)
-- salen con el nombre y la categoría nuevos.
-- Protegidas: Tiempo muerto (20) e Inicio/Fin de jornada (3, 11) no se editan;
-- Cosecha (4) puede cambiar de nombre pero sigue siendo productiva.
--
-- Revertir:
--   drop function if exists public.rpc_top_editar_actividad(smallint, text, text);
--   update public.top_actividades set nombre = 'Rectificación de fruta en CS', clase = 'soporte' where id = 6;
--   update public.top_actividades set nombre = 'Rectificación - remanente', clase = 'soporte' where id = 9;
--   update public.top_actividades set nombre = 'Reunión con la líder' where id = 17;
-- ============================================================================

create or replace function public.rpc_top_editar_actividad(p_id smallint, p_nombre text, p_clase text)
returns public.top_actividades
language plpgsql security definer set search_path = public as $$
declare
  v public.top_actividades;
  v_antes public.top_actividades;
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  perform public.exigir_rol('admin');
  select * into v_antes from public.top_actividades where id = p_id;
  if not found then raise exception 'La etapa ya no existe.'; end if;
  if p_id in (3, 11, 20) then raise exception 'Esta etapa es fija y no se puede editar.'; end if;
  if length(v_nombre) < 3 then raise exception 'Escribe el nombre de la etapa.'; end if;
  if coalesce(p_clase, '') not in ('productiva', 'soporte', 'espera', 'personal') then raise exception 'Elige la categoría.'; end if;
  if p_id = 4 and p_clase <> 'productiva' then raise exception 'Cosecha siempre es productiva.'; end if;
  if exists (select 1 from public.top_actividades where lower(nombre) = lower(v_nombre) and id <> p_id) then
    raise exception 'Ya existe otra etapa llamada «%».', v_nombre;
  end if;
  update public.top_actividades set nombre = v_nombre, clase = p_clase where id = p_id returning * into v;
  if v_antes.nombre <> v.nombre or v_antes.clase <> v.clase then
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'ESTUDIO_TOP', 'Etapa editada',
              v_antes.nombre || ' (' || v_antes.clase || ') → ' || v.nombre || ' (' || v.clase || ')');
  end if;
  return v;
end;
$$;

revoke all on function public.rpc_top_editar_actividad(smallint, text, text) from public, anon;
grant execute on function public.rpc_top_editar_actividad(smallint, text, text) to authenticated;

-- Pedido de Ingeniería (12/11/2026).
update public.top_actividades set nombre = 'Rectificación de fruta observada', clase = 'espera' where id = 6;
update public.top_actividades set nombre = 'Rectificación de fruta remanente', clase = 'espera' where id = 9;
update public.top_actividades set nombre = 'Reunión con líder de grupo' where id = 17;
