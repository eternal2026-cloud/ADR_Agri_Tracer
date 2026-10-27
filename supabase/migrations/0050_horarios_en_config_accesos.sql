-- 0050: El horario de uso pasa a Config › Accesos (uno por módulo, igual para todo el personal)
--
--   · parametros.HORARIOS_ACCESO (texto JSON): { "<módulo>": { "desde": "07:00", "hasta": "18:00" }, … }
--     con el id de módulo de AT.ACCESOS. Módulo ausente = todo el día. Hora de Lima; desde > hasta
--     cruza la medianoche. Los administradores no tienen horario.
--   · fn_fuera_de_horario lee ese parámetro en lugar de perfiles.horarios (0049). La columna
--     perfiles.horarios queda sin uso (estaba vacía en todos los usuarios).
--   · fn_exigir_acceso: igual que 0049 (horario al registrar, 30 min de tolerancia); el aviso apunta a Config › Accesos.
--
-- Revertir: volver a crear fn_fuera_de_horario de 0049; delete from parametros where clave = 'HORARIOS_ACCESO'.

insert into public.parametros (clave, valor, descripcion)
values ('HORARIOS_ACCESO', '{}', 'Horario de uso por módulo (Config › Accesos). {} = todo el día.')
on conflict (clave) do nothing;

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

create or replace function public.fn_exigir_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clave text := tg_argv[0]; v_nombre text := tg_argv[1]; v_fuera text;
begin
  -- Sin usuario (cron, sincronizaciones, service_role): no aplica.
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'sci_encuestas' then
    v_clave := case when new.origen = 'excel' then 'gestion.sci.cargar' else 'gestion.sci.encuesta' end;
  end if;
  if not public.fn_tiene_acceso(v_clave) then
    raise exception 'No tienes acceso a «%». Pide a un administrador que te lo asigne en Usuarios.', v_nombre;
  end if;
  v_fuera := public.fn_fuera_de_horario(v_clave, 30);
  if v_fuera is not null then
    raise exception 'Fuera de tu horario para «%»: puedes registrar %. Si necesitas más tiempo, pide al administrador que lo cambie en Config › Accesos.', v_nombre, v_fuera;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_exigir_acceso() from public, anon, authenticated;
