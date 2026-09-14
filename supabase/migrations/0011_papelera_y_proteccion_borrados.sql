-- 0011: Eliminación segura de ciclos (papelera restaurable) y protección contra borrados.
--
-- Contexto: el 2026-09-14 se vaciaron tablas desde fuera de la app al intentar
-- quitar datos de prueba y se perdió la configuración.
-- · Todo ciclo borrado (desde la app o directo en Supabase) se copia a
--   ciclos_papelera y se puede restaurar.
-- · TRUNCATE queda bloqueado en las tablas principales.
-- · parametros y bitacora no admiten DELETE (configuración y auditoría).
-- · rpc_eliminar_ciclo / rpc_restaurar_ciclo: solo admin.

create table if not exists public.ciclos_papelera (
  id bigserial primary key,
  codigo text,
  ciclo jsonb not null,
  motivo text,
  eliminado_por uuid references public.perfiles(id) on delete set null,
  eliminado_en timestamptz not null default now()
);
alter table public.ciclos_papelera enable row level security;
drop policy if exists papelera_select_admin on public.ciclos_papelera;
create policy papelera_select_admin on public.ciclos_papelera for select
  to authenticated using (public.rol_actual() = 'admin');
revoke insert, update, delete on public.ciclos_papelera from anon, authenticated;

-- ---------------------------------------------------------------- copia a papelera
create or replace function public.fn_ciclo_a_papelera()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ciclos_papelera (codigo, ciclo, motivo, eliminado_por)
  values (old.codigo, to_jsonb(old),
          coalesce(nullif(current_setting('agritracer.motivo', true), ''), 'Borrado directo en la base de datos (fuera de la app)'),
          (select id from public.perfiles where id = auth.uid()));
  return old;
end;
$$;
drop trigger if exists trg_ciclos_a_papelera on public.ciclos_cosecha;
create trigger trg_ciclos_a_papelera after delete on public.ciclos_cosecha
  for each row execute function public.fn_ciclo_a_papelera();

-- ---------------------------------------------------------------- bloqueos
create or replace function public.fn_bloquear_vaciado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Vaciar la tabla % está bloqueado para proteger los datos. Para quitar datos de prueba usa la app: Captura → abrir el ciclo → Eliminar (va a la papelera).', tg_table_name;
end;
$$;

create or replace function public.fn_bloquear_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'No se pueden eliminar filas de %: %', tg_table_name,
    case tg_table_name when 'parametros' then 'es la configuración de la app; cambia el valor desde Configuración.'
                       else 'es el registro de auditoría.' end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['ciclos_cosecha', 'parametros', 'listas_maestras', 'bitacora', 'perfiles', 'reub_personal', 'ciclos_papelera'] loop
    execute format('drop trigger if exists trg_bloquear_truncate on public.%I', t);
    execute format('create trigger trg_bloquear_truncate before truncate on public.%I for each statement execute function public.fn_bloquear_vaciado()', t);
  end loop;
  foreach t in array array['parametros', 'bitacora'] loop
    execute format('drop trigger if exists trg_bloquear_borrado on public.%I', t);
    execute format('create trigger trg_bloquear_borrado before delete on public.%I for each row execute function public.fn_bloquear_borrado()', t);
  end loop;
end $$;

revoke execute on function public.fn_ciclo_a_papelera() from public, anon, authenticated;
revoke execute on function public.fn_bloquear_vaciado() from public, anon, authenticated;
revoke execute on function public.fn_bloquear_borrado() from public, anon, authenticated;

-- ---------------------------------------------------------------- RPC
create or replace function public.rpc_eliminar_ciclo(p_codigo text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.ciclos_cosecha; v_motivo text := coalesce(nullif(trim(p_motivo), ''), 'Dato de prueba');
begin
  perform public.exigir_rol('admin');
  select * into v from public.ciclos_cosecha where codigo = p_codigo;
  if v.id is null then raise exception 'No existe el ciclo %.', p_codigo; end if;
  if v.origen = 'excel' then
    raise exception 'El ciclo % viene del Excel histórico: corrígelo en el Excel y vuelve a importarlo.', p_codigo;
  end if;
  perform set_config('agritracer.motivo', v_motivo, true);
  delete from public.ciclos_cosecha where id = v.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'CICLOS', 'Ciclo eliminado (papelera)', p_codigo || ' · ' || v_motivo);
  return jsonb_build_object('codigo', p_codigo);
end;
$$;

create or replace function public.rpc_restaurar_ciclo(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p public.ciclos_papelera; v_fila public.ciclos_cosecha;
begin
  perform public.exigir_rol('admin');
  select * into v_p from public.ciclos_papelera where id = p_id;
  if v_p.id is null then raise exception 'Ese registro ya no está en la papelera.'; end if;
  v_fila := jsonb_populate_record(null::public.ciclos_cosecha, v_p.ciclo);
  if exists (select 1 from public.ciclos_cosecha where id = v_fila.id or codigo = v_fila.codigo) then
    raise exception 'El ciclo % ya existe; no se puede restaurar encima.', v_p.codigo;
  end if;
  v_fila.origen := coalesce(v_fila.origen, 'app');
  insert into public.ciclos_cosecha select v_fila.*;
  delete from public.ciclos_papelera where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'CICLOS', 'Ciclo restaurado', v_p.codigo);
  return jsonb_build_object('codigo', v_p.codigo);
end;
$$;

revoke execute on function public.rpc_eliminar_ciclo(text, text) from public, anon;
revoke execute on function public.rpc_restaurar_ciclo(bigint) from public, anon;
grant execute on function public.rpc_eliminar_ciclo(text, text) to authenticated;
grant execute on function public.rpc_restaurar_ciclo(bigint) to authenticated;
