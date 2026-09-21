-- 0019: Evolución semanal de tiempos de ciclo + plantas y áreas permitidas en Cliente interno
--
--   · fn_evolucion_semanal: promedio de cada tiempo de operación por semana y fundo, con la
--     misma regla que el resumen (ciclos cerrados y por debajo del umbral). Alimenta el
--     gráfico de líneas «Evolución semanal» del Resumen de tiempos de ciclo.
--   · perfiles.sci_plantas / perfiles.sci_areas: plantas y áreas que un usuario puede evaluar
--     en Satisfacción del cliente interno (vacío = todas). Las asigna un administrador desde
--     el módulo (pestaña Evaluadores) con rpc_sci_permisos. El trigger trg_sci_permisos lo
--     hace cumplir al registrar desde la app (el histórico importado de Excel no se toca).

-- ================================================================ evolución semanal
create or replace function public.fn_evolucion_semanal()
returns table (
  semana integer, desde date, fundo text, n_muestras bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric
) language sql stable set search_path = public as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave = 'UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  ), validas as (
    select c.* from public.ciclos_cosecha c, umbral
    where c.cerrado and c.semana is not null and c.t_ciclo_total is not null and c.t_ciclo_total <= umbral.v
  )
  select semana, min(fecha), fundo, count(*)::bigint,
         avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total)
  from validas group by semana, fundo
  order by 2, 3;
$$;
revoke execute on function public.fn_evolucion_semanal() from public, anon;
grant execute on function public.fn_evolucion_semanal() to authenticated, service_role;

-- ================================================================ permisos de Cliente interno
alter table public.perfiles add column if not exists sci_plantas text[] not null default '{}';
alter table public.perfiles add column if not exists sci_areas integer[] not null default '{}';

create or replace function public.rpc_sci_permisos(p_perfil uuid, p_plantas text[], p_areas integer[])
returns public.perfiles language plpgsql security definer set search_path = public as $$
declare v public.perfiles; v_plantas text[]; v_areas integer[];
begin
  perform public.exigir_rol('admin');
  select coalesce(array_agg(distinct upper(btrim(x))) filter (where btrim(x) <> ''), '{}') into v_plantas
    from unnest(coalesce(p_plantas, '{}')) x;
  select coalesce(array_agg(distinct a.id), '{}') into v_areas
    from public.s5_areas a where a.id = any (coalesce(p_areas, '{}'));
  update public.perfiles set sci_plantas = v_plantas, sci_areas = v_areas where id = p_perfil returning * into v;
  if v.id is null then raise exception 'Usuario no encontrado.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Permisos de evaluación',
            v.usuario || ' · plantas: ' || coalesce(nullif(array_to_string(v_plantas, ', '), ''), 'todas') ||
            ' · áreas: ' || coalesce(nullif((select string_agg(nombre, ', ' order by nombre) from public.s5_areas where id = any (v_areas)), ''), 'todas'));
  return v;
end;
$$;
revoke execute on function public.rpc_sci_permisos(uuid, text[], integer[]) from public, anon;
grant execute on function public.rpc_sci_permisos(uuid, text[], integer[]) to authenticated;

create or replace function public.fn_sci_permisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.perfiles;
begin
  if auth.uid() is null or new.origen <> 'app' then return new; end if;
  select * into p from public.perfiles where id = auth.uid();
  if p.id is null or p.rol = 'admin' then return new; end if;
  if cardinality(p.sci_plantas) > 0 and (new.planta is null or not (new.planta = any (p.sci_plantas))) then
    raise exception 'No tienes asignada la planta «%». Elige una de tus plantas: %.',
      coalesce(new.planta, 'Sin planta'), array_to_string(p.sci_plantas, ', ');
  end if;
  if cardinality(p.sci_areas) > 0 and not (new.area_evaluada_id = any (p.sci_areas)) then
    raise exception 'No tienes asignada esa área para evaluar. Pide a un administrador que te la asigne.';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_sci_permisos() from public, anon, authenticated;

-- Se llama «trg_sci_permisos» para dispararse después de trg_sci_encuesta_antes (orden alfabético),
-- que normaliza la planta a mayúsculas.
drop trigger if exists trg_sci_permisos on public.sci_encuestas;
create trigger trg_sci_permisos before insert or update on public.sci_encuestas
  for each row execute function public.fn_sci_permisos();
