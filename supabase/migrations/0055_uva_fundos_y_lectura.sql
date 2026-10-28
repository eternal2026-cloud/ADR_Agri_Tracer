-- 0055: Tiempo de ciclo Uva — mismos permisos que Arándano (Config › Usuarios) y lectura desde la base
--
--   · Antes, Registros de campo/uva mostraba solo lo guardado en cada celular: tres equipos con el mismo
--     usuario veían tres listas distintas. Ahora Registros y Resumen leen uva_ciclos (todos los orígenes:
--     APK, Integra y Planta) y solo suman lo del equipo que aún no se subió.
--   · Fundos asignados (perfiles.fundos) y «solo sus ciclos» (perfiles.ciclos_solo_propios) valen también
--     para Uva: en la lectura (RLS), en el catálogo que baja al celular y al guardar.
--     Los nombres se comparan sin tildes ni espacios sobrantes: «LA MAQUINA» (lista de Arándano) = «LA MÁQUINA» (catálogo Uva).
--
-- Revertir: volver a crear la política uva_ciclos_leer y rpc_uva_config / rpc_uva_guardar_campo de 0053;
--   drop function fn_txt_llave, fn_uva_fundo_permitido.

create or replace function public.fn_txt_llave(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(translate(upper(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), 'ÁÀÄÉÈËÍÌÏÓÒÖÚÙÜ', 'AAAEEEIIIOOOUUU'), '');
$$;

/** Fundo permitido para el usuario (admin o sin fundos asignados = todos), sin importar tildes. */
create or replace function public.fn_uva_fundo_permitido(p_fundo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.rol = 'admin' or cardinality(p.fundos) = 0
        or exists (select 1 from unnest(p.fundos) f where public.fn_txt_llave(f) = public.fn_txt_llave(p_fundo))
    from public.perfiles p where p.id = auth.uid() and p.activo
  ), false);
$$;
revoke execute on function public.fn_uva_fundo_permitido(text) from public, anon;
grant execute on function public.fn_uva_fundo_permitido(text) to authenticated;

-- Lectura: rol + acceso al módulo + fundo asignado + «solo sus ciclos» (lo que inició o continuó en planta).
drop policy if exists uva_ciclos_leer on public.uva_ciclos;
create policy uva_ciclos_leer on public.uva_ciclos for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor')
         and (public.fn_tiene_acceso('campo.uva') or public.fn_tiene_acceso('planta.uva'))
         and (fundo is null or public.fn_uva_fundo_permitido(fundo))
         and ((select public.fn_ciclos_ver_todos()) or usuario_id = (select auth.uid()) or planta_usuario_id = (select auth.uid())));

/** Catálogo y parámetros para los celulares: solo los lotes de los fundos asignados. */
create or replace function public.rpc_uva_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'config', coalesce((select valor::jsonb from public.parametros where clave = 'UVA_CONFIG'), '{}'::jsonb),
    'catalogo', coalesce((select jsonb_agg(jsonb_build_array(zona, fundo, lote, variedad) order by zona, fundo, lote)
                          from public.uva_catalogo where activo and public.fn_uva_fundo_permitido(fundo)), '[]'::jsonb),
    'fundos_asignados', coalesce((select to_jsonb(p.fundos) from public.perfiles p where p.id = auth.uid() and p.rol <> 'admin'), '[]'::jsonb),
    'solo_propios', not public.fn_ciclos_ver_todos())
  where public.rol_actual() is not null;
$$;

create or replace function public.rpc_uva_guardar_campo(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; c public.uva_ciclos; v_fundo text := p_payload->'registro'->>'fundo';
begin
  perform public.fn_uva_exigir('campo.uva', 'Tiempo de ciclo Uva');
  if coalesce(p_payload->'registro'->>'id', '') !~ '^UV-IN-' then raise exception 'Los registros de Integra empiezan con UV-IN-.'; end if;
  if p_payload->>'accion' = 'eliminar' then
    return jsonb_build_object('ok', true, 'resultado', public.fn_uva_quitar_campo(p_payload->'registro'->>'id', 'integra'));
  end if;
  if coalesce(btrim(v_fundo), '') <> '' and not public.fn_uva_fundo_permitido(v_fundo) then
    raise exception 'No tienes asignado el fundo «%». Pide a un administrador que te lo asigne en Config › Usuarios › Fundos.', v_fundo;
  end if;
  v_id := public.fn_uva_aplicar_campo(p_payload, 'integra', auth.uid());
  select * into c from public.uva_ciclos where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'llegada', c.hora_llegada, 'llegada_por', c.llegada_por,
    'planta', coalesce(c.planta_destino, c.planta));
end;
$$;
revoke execute on function public.rpc_uva_guardar_campo(jsonb) from public, anon;
grant execute on function public.rpc_uva_guardar_campo(jsonb) to authenticated;
