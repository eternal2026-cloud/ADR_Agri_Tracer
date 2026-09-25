-- 0024: Accesos por usuario (grupos, módulos y funciones que puede ver)
--
--   · perfiles.accesos: lista de claves que el usuario puede ver, con la forma
--     grupo.modulo.funcion (catálogo en AT.ACCESOS, js/supabase-cliente.js):
--       campo.arandano.captura · campo.arandano.resumen · campo.uva
--       planta.reubicacion
--       gestion.5s.{auditar,observaciones,resultados}
--       gestion.mtto.{revisar,cargar,resultados}
--       gestion.sci.{encuesta,cargar,resultados}
--     NULL = acceso completo (así quedan los usuarios que ya existen, y los nuevos
--     módulos les aparecen solos). Los administradores siempre ven todo.
--   · fn_tiene_acceso(clave): true si la clave, o alguna de sus funciones, está asignada.
--     'gestion.5s' es true si tiene cualquier función de 5S.
--   · trg_*_acceso: la base lo hace cumplir al registrar (no solo la pantalla). Por
--     módulo; la separación fina por función (ej. Auditar vs Observaciones) es de la app.
--     La lectura (resultados) no se restringe en la base.

alter table public.perfiles add column if not exists accesos text[];

create or replace function public.fn_tiene_acceso(p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.rol = 'admin' or p.accesos is null
        or exists (select 1 from unnest(p.accesos) a where a = p_clave or a like p_clave || '.%')
    from public.perfiles p where p.id = auth.uid() and p.activo
  ), false);
$$;
revoke execute on function public.fn_tiene_acceso(text) from public, anon;
grant execute on function public.fn_tiene_acceso(text) to authenticated;

-- TG_ARGV[0] = clave exigida; en sci_encuestas depende del origen (encuesta o histórico).
create or replace function public.fn_exigir_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clave text := tg_argv[0]; v_nombre text := tg_argv[1];
begin
  -- Sin usuario (cron, sincronizaciones, service_role): no aplica.
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'sci_encuestas' then
    v_clave := case when new.origen = 'excel' then 'gestion.sci.cargar' else 'gestion.sci.encuesta' end;
  end if;
  if not public.fn_tiene_acceso(v_clave) then
    raise exception 'No tienes acceso a «%». Pide a un administrador que te lo asigne en Usuarios.', v_nombre;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_exigir_acceso() from public, anon, authenticated;

drop trigger if exists trg_ciclo_acceso on public.ciclos_cosecha;
create trigger trg_ciclo_acceso before insert or update on public.ciclos_cosecha
  for each row execute function public.fn_exigir_acceso('campo.arandano.captura', 'Captura de tiempos · Arándano');

drop trigger if exists trg_s5_auditoria_acceso on public.s5_auditorias;
create trigger trg_s5_auditoria_acceso before insert or update on public.s5_auditorias
  for each row execute function public.fn_exigir_acceso('gestion.5s', 'Auditoría 5S');
drop trigger if exists trg_s5_observacion_acceso on public.s5_observaciones;
create trigger trg_s5_observacion_acceso before insert or update on public.s5_observaciones
  for each row execute function public.fn_exigir_acceso('gestion.5s', 'Auditoría 5S');

drop trigger if exists trg_mp_revision_acceso on public.mp_revisiones;
create trigger trg_mp_revision_acceso before insert or update on public.mp_revisiones
  for each row execute function public.fn_exigir_acceso('gestion.mtto', 'Revisión plan de mantenimiento');
drop trigger if exists trg_mp_ot_acceso on public.mp_ot;
create trigger trg_mp_ot_acceso before insert or update on public.mp_ot
  for each row execute function public.fn_exigir_acceso('gestion.mtto', 'Revisión plan de mantenimiento');

drop trigger if exists trg_sci_acceso on public.sci_encuestas;
create trigger trg_sci_acceso before insert or update on public.sci_encuestas
  for each row execute function public.fn_exigir_acceso('gestion.sci', 'Satisfacción del cliente interno');
