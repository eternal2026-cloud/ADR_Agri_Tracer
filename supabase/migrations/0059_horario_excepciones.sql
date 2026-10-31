-- 0059: Excepciones al horario de uso (Config › Accesos)
--
--   · parametros.HORARIOS_ACCESO admite por módulo una lista opcional de usuarios (perfiles.id) que
--     entran todo el día aunque el módulo tenga horario:
--     { "campo.arandano": { "desde": "07:00", "hasta": "18:00", "excepciones": ["<uuid>", …] } }
--   · fn_fuera_de_horario: quien está en la lista de un módulo no tiene límite en ese módulo.
--     Igual que antes para todos los demás (hora de Lima, cruce de medianoche, admin sin horario).
--
-- Revertir: volver a crear fn_fuera_de_horario de 0050 (la clave "excepciones" queda sin efecto).

create or replace function public.fn_fuera_de_horario(p_clave text, p_tolerancia_min int default 0)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_rol text; v_h jsonb; r record;
  v_ahora time := (now() at time zone 'America/Lima')::time;
  v_desde time; v_hasta time; v_dentro boolean;
begin
  select p.rol into v_rol from public.perfiles p where p.id = auth.uid();
  if v_rol is null or v_rol = 'admin' then return null; end if;
  begin
    select valor::jsonb into v_h from public.parametros where clave = 'HORARIOS_ACCESO';
  exception when others then return null; -- JSON mal escrito: no bloquea
  end;
  if v_h is null or jsonb_typeof(v_h) <> 'object' then return null; end if;
  for r in select key, value from jsonb_each(v_h) loop
    if p_clave = r.key or p_clave like r.key || '.%' then
      -- Excepción: esta persona usa el módulo todo el día.
      if jsonb_typeof(r.value->'excepciones') = 'array' and (r.value->'excepciones') ? auth.uid()::text then continue; end if;
      begin
        v_desde := (r.value->>'desde')::time;
        v_hasta := (r.value->>'hasta')::time;
      exception when others then continue;
      end;
      if v_desde is null or v_hasta is null or v_desde = v_hasta then continue; end if;
      -- time + interval da la vuelta a la medianoche: 23:50 + 30 min = 00:20 (cruza, ver abajo).
      v_hasta := v_hasta + make_interval(mins => greatest(coalesce(p_tolerancia_min, 0), 0));
      v_dentro := case when v_desde < v_hasta then v_ahora >= v_desde and v_ahora < v_hasta
                       else v_ahora >= v_desde or v_ahora < v_hasta end;
      if not v_dentro then
        return 'de ' || (r.value->>'desde') || ' a ' || (r.value->>'hasta');
      end if;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.fn_fuera_de_horario(text, int) from public, anon;
grant execute on function public.fn_fuera_de_horario(text, int) to authenticated;
