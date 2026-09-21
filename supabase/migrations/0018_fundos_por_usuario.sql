-- 0018: Fundos asignados por usuario + vuelta al ingreso con usuario y contraseña
--
--   · El acceso con correo corporativo + PIN (0017) se retiró en la app: todos vuelven a
--     entrar con usuario y contraseña. Lo que dejó 0017 en la base (perfiles.correo,
--     parámetros CORREO_*) no molesta y se deja; las cuentas de prueba borradas no vuelven.
--   · perfiles.fundos: fundos en los que el usuario puede registrar ciclos.
--     Vacío = todos (así quedan los usuarios que ya existen). Los administradores
--     siempre pueden con todos.
--   · El trigger trg_ciclo_fundo_permitido lo hace cumplir en la base, para cualquier
--     RPC que cree o modifique ciclos: un usuario de captura no puede crear un ciclo
--     en un fundo que no tiene, ni tocar ciclos de otro fundo, ni mover uno a otro fundo.
--     Cualquier usuario puede seguir el ciclo que abrió otro, si es de su fundo.

alter table public.perfiles add column if not exists fundos text[] not null default '{}';

create or replace function public.fn_fundo_permitido(p_fundo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.rol = 'admin' or cardinality(p.fundos) = 0 or p_fundo = any (p.fundos)
    from public.perfiles p where p.id = auth.uid() and p.activo
  ), false);
$$;
revoke execute on function public.fn_fundo_permitido(text) from public, anon;
grant execute on function public.fn_fundo_permitido(text) to authenticated;

create or replace function public.fn_ciclo_fundo_permitido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sin usuario (cron, sincronizaciones, service_role): no aplica.
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and old.fundo is not null and not public.fn_fundo_permitido(old.fundo) then
    raise exception 'El ciclo % es del fundo «%», que no tienes asignado. Pide a un administrador que te lo asigne.', old.codigo, old.fundo;
  end if;
  if (tg_op = 'INSERT' or new.fundo is distinct from old.fundo)
     and new.fundo is not null and not public.fn_fundo_permitido(new.fundo) then
    raise exception 'No tienes asignado el fundo «%». Elige uno de tus fundos o pide a un administrador que te lo asigne.', new.fundo;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_ciclo_fundo_permitido() from public, anon, authenticated;

drop trigger if exists trg_ciclo_fundo_permitido on public.ciclos_cosecha;
create trigger trg_ciclo_fundo_permitido before insert or update on public.ciclos_cosecha
  for each row execute function public.fn_ciclo_fundo_permitido();
