-- 0049: Horario de acceso por usuario y módulo (Config → Usuarios → Accesos)
--
--   · perfiles.horarios: { "<módulo>": { "desde": "07:00", "hasta": "18:00" }, … } con el id de
--     módulo de AT.ACCESOS (campo.arandano, campo.uva, campo.top, gestion.5s…). NULL o módulo
--     ausente = todo el día. Hora de Lima. Si desde > hasta, el horario cruza la medianoche.
--     Sugeridos en la app: Arándano 07:00–18:00 · Uva 06:00–18:00. Los administradores no tienen horario.
--   · fn_fuera_de_horario(clave, tolerancia_min): NULL si está dentro; si no, el texto del horario
--     («de 07:00 a 18:00»). La tolerancia alarga el cierre para que suban los registros hechos
--     justo antes (señal lenta, ciclo que se termina de guardar).
--   · fn_exigir_acceso: además del acceso, exige el horario al registrar (30 min de tolerancia).
--     La pantalla bloquea la entrada fuera de horario; la lectura no se restringe en la base.
--
-- Revertir:
--   restaurar fn_exigir_acceso de 0024; drop function public.fn_fuera_de_horario(text, int);
--   alter table public.perfiles drop column horarios;

alter table public.perfiles add column if not exists horarios jsonb;

create or replace function public.fn_fuera_de_horario(p_clave text, p_tolerancia_min int default 0)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_rol text; v_h jsonb; r record;
  v_ahora time := (now() at time zone 'America/Lima')::time;
  v_desde time; v_hasta time; v_dentro boolean;
begin
  select p.rol, p.horarios into v_rol, v_h from public.perfiles p where p.id = auth.uid();
  if v_rol is null or v_rol = 'admin' or v_h is null or jsonb_typeof(v_h) <> 'object' then return null; end if;
  for r in select key, value from jsonb_each(v_h) loop
    if p_clave = r.key or p_clave like r.key || '.%' then
      begin
        v_desde := (r.value->>'desde')::time;
        v_hasta := (r.value->>'hasta')::time;
      exception when others then continue; -- horario mal escrito: no bloquea
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
    raise exception 'Fuera de tu horario para «%»: puedes registrar %. Si necesitas más tiempo, pide al administrador que lo cambie en Usuarios › Accesos.', v_nombre, v_fuera;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_exigir_acceso() from public, anon, authenticated;
