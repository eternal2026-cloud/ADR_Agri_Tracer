-- 0005: Funciones de resumen/drill-down (Calculo.gs en SQL) + RPCs de escritura

-- ---------------------------------------------------------------- resumen/drill-down
create or replace function public.fn_semanas_disponibles()
returns setof integer language sql stable as $$
  select distinct semana from public.ciclos_cosecha where semana is not null order by 1;
$$;

create or replace function public.fn_resumen_semana(p_semana integer)
returns table (
  fundo text, n_muestras bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  ), validas as (
    select c.* from public.ciclos_cosecha c, umbral
    where c.semana = p_semana and c.cerrado and c.t_ciclo_total is not null and c.t_ciclo_total <= umbral.v
  )
  select fundo, count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas group by fundo
  union all
  select 'Total general', count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas;
$$;

-- Nivel 1: general (todas las semanas), misma forma que fn_resumen_semana.
create or replace function public.fn_resumen_general()
returns table (
  fundo text, n_muestras bigint,
  t_cosecha numeric, t_espera_jabero numeric, t_jabero numeric, t_estadia_cs numeric,
  t_carga_moto numeric, t_espera_traslado numeric, t_traslado_ca numeric,
  t_espera_descarga numeric, t_descarga_ca numeric, t_estadia_ca numeric,
  t_carga_camion numeric, t_espera_traslado_planta numeric, t_traslado_planta numeric,
  t_ciclo_total numeric, tiempo_horas numeric
) language sql stable as $$
  with umbral as (
    select coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'), 480) v
  ), validas as (
    select c.* from public.ciclos_cosecha c, umbral
    where c.cerrado and c.t_ciclo_total is not null and c.t_ciclo_total <= umbral.v
  )
  select fundo, count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas group by fundo
  union all
  select 'Total general', count(*)::bigint, avg(t_cosecha), avg(t_espera_jabero), avg(t_jabero), avg(t_estadia_cs),
         avg(t_carga_moto), avg(t_espera_traslado), avg(t_traslado_ca), avg(t_espera_descarga),
         avg(t_descarga_ca), avg(t_estadia_ca), avg(t_carga_camion), avg(t_espera_traslado_planta),
         avg(t_traslado_planta), avg(t_ciclo_total), avg(t_ciclo_total)/60
  from validas;
$$;

-- Registros excluidos por umbral (se muestran, nunca se borran).
create or replace function public.fn_ciclos_excluidos(p_semana integer)
returns setof public.ciclos_cosecha language sql stable as $$
  select c.* from public.ciclos_cosecha c
  where c.semana = p_semana and c.cerrado and c.t_ciclo_total is not null
    and c.t_ciclo_total > coalesce((select valor::numeric from public.parametros where clave='UMBRAL_TIEMPO_CICLO_MIN'),480)
  order by c.t_ciclo_total desc;
$$;

grant execute on function public.fn_semanas_disponibles() to authenticated;
grant execute on function public.fn_resumen_semana(integer) to authenticated;
grant execute on function public.fn_resumen_general() to authenticated;
grant execute on function public.fn_ciclos_excluidos(integer) to authenticated;

-- ---------------------------------------------------------------- captura de ciclos
create or replace function public.rpc_iniciar_ciclo(p jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  if public.rol_actual() not in ('admin','captura') then raise exception 'No autorizado'; end if;

  insert into public.ciclos_cosecha (
    fecha, fundo, lote, lider, presentacion, variedad, calibre,
    inicio_cosecha, fin_cosecha, creado_por, actualizado_por
  ) values (
    (p->>'fecha')::date, p->>'fundo', p->>'lote', p->>'lider', p->>'presentacion', p->>'variedad', p->>'calibre',
    (p->>'inicio_cosecha')::timestamptz, (p->>'fin_cosecha')::timestamptz, auth.uid(), auth.uid()
  ) returning * into v_fila;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'CICLOS', 'Iniciado', v_fila.codigo);
  return v_fila;
end;
$$;

-- p_etapa in ('jabero','motocarga','traslado_ca','descarga_ca','carga_camion','traslado_planta')
-- Cada rama solo toca las columnas de esa etapa (allowlist explícita, sin SQL dinámico).
create or replace function public.rpc_agregar_etapa(p_codigo text, p_etapa text, p_datos jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  if public.rol_actual() not in ('admin','captura') then raise exception 'No autorizado'; end if;

  if p_etapa = 'jabero' then
    update public.ciclos_cosecha set
      inicio_jabero = coalesce((p_datos->>'inicio_jabero')::timestamptz, inicio_jabero),
      fin_jabero    = coalesce((p_datos->>'fin_jabero')::timestamptz, fin_jabero),
      num_jabas     = coalesce((p_datos->>'num_jabas')::integer, num_jabas),
      obs_jaba      = coalesce(p_datos->>'obs_jaba', obs_jaba),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'motocarga' then
    update public.ciclos_cosecha set
      placa              = coalesce(p_datos->>'placa', placa),
      hora_llegada_moto  = coalesce((p_datos->>'hora_llegada_moto')::timestamptz, hora_llegada_moto),
      inicio_carga_moto  = coalesce((p_datos->>'inicio_carga_moto')::timestamptz, inicio_carga_moto),
      fin_carga_moto     = coalesce((p_datos->>'fin_carga_moto')::timestamptz, fin_carga_moto),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'traslado_ca' then
    update public.ciclos_cosecha set
      inicio_traslado_ca = coalesce((p_datos->>'inicio_traslado_ca')::timestamptz, inicio_traslado_ca),
      fin_traslado_ca    = coalesce((p_datos->>'fin_traslado_ca')::timestamptz, fin_traslado_ca),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'descarga_ca' then
    update public.ciclos_cosecha set
      num_jabas_2       = coalesce((p_datos->>'num_jabas_2')::integer, num_jabas_2),
      obs_jabas_2       = coalesce(p_datos->>'obs_jabas_2', obs_jabas_2),
      inicio_descarga_ca = coalesce((p_datos->>'inicio_descarga_ca')::timestamptz, inicio_descarga_ca),
      fin_descarga_ca    = coalesce((p_datos->>'fin_descarga_ca')::timestamptz, fin_descarga_ca),
      num_pallets       = coalesce((p_datos->>'num_pallets')::integer, num_pallets),
      presentaciones    = coalesce(p_datos->>'presentaciones', presentaciones),
      placa_camion      = coalesce(p_datos->>'placa_camion', placa_camion),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'carga_camion' then
    update public.ciclos_cosecha set
      inicio_carga_camion = coalesce((p_datos->>'inicio_carga_camion')::timestamptz, inicio_carga_camion),
      fin_carga_camion    = coalesce((p_datos->>'fin_carga_camion')::timestamptz, fin_carga_camion),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'traslado_planta' then
    update public.ciclos_cosecha set
      inicio_traslado_planta = coalesce((p_datos->>'inicio_traslado_planta')::timestamptz, inicio_traslado_planta),
      fin_traslado_planta    = coalesce((p_datos->>'fin_traslado_planta')::timestamptz, fin_traslado_planta),
      obs_cs    = coalesce(p_datos->>'obs_cs', obs_cs),
      tareadora = coalesce(p_datos->>'tareadora', tareadora),
      obs_ca    = coalesce(p_datos->>'obs_ca', obs_ca),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  else
    raise exception 'Etapa desconocida: %', p_etapa;
  end if;

  if v_fila.id is null then raise exception 'Ciclo % no encontrado', p_codigo; end if;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'CICLOS', 'Etapa agregada: ' || p_etapa, p_codigo);
  return v_fila;
end;
$$;

create or replace function public.rpc_guardar_lote_ciclos(p_filas jsonb)
returns setof public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
begin
  if public.rol_actual() not in ('admin','captura') then raise exception 'No autorizado'; end if;
  return query select public.rpc_iniciar_ciclo(f) from jsonb_array_elements(p_filas) f;
end;
$$;

grant execute on function public.rpc_iniciar_ciclo(jsonb) to authenticated;
grant execute on function public.rpc_agregar_etapa(text, text, jsonb) to authenticated;
grant execute on function public.rpc_guardar_lote_ciclos(jsonb) to authenticated;

-- ---------------------------------------------------------------- cuenta propia
create or replace function public.rpc_marcar_password_cambiada()
returns void language sql security definer set search_path = public as $$
  update public.perfiles set debe_cambiar_password = false where id = auth.uid();
$$;
grant execute on function public.rpc_marcar_password_cambiada() to authenticated;

-- ---------------------------------------------------------------- reubicación
create or replace function public.rpc_guardar_personal_fila(p jsonb)
returns public.reub_personal language plpgsql security definer set search_path = public as $$
declare v_fila public.reub_personal;
begin
  if public.rol_actual() <> 'admin' then raise exception 'No autorizado'; end if;
  insert into public.reub_personal (dni, nombre, linea, lado, labor, obs, activo, actualizado_por)
  values (p->>'dni', p->>'nombre', p->>'linea', p->>'lado', p->>'labor', p->>'obs', true, auth.uid())
  on conflict (dni) do update set
    nombre = excluded.nombre, linea = excluded.linea, lado = excluded.lado,
    labor = excluded.labor, obs = excluded.obs, activo = true,
    actualizado_por = auth.uid(), actualizado_en = now()
  returning * into v_fila;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(),'REUBICACION','Fila guardada', v_fila.dni);
  return v_fila;
end;
$$;

-- Reemplaza el roster completo: upsert de los DNI recibidos, baja lógica de los que no vienen.
create or replace function public.rpc_reemplazar_personal_lote(p_filas jsonb)
returns table (insertados integer, desactivados integer) language plpgsql security definer set search_path = public as $$
declare v_ins integer; v_desact integer;
begin
  if public.rol_actual() <> 'admin' then raise exception 'No autorizado'; end if;

  with datos as (
    select f->>'dni' dni, f->>'nombre' nombre, f->>'linea' linea, f->>'lado' lado, f->>'labor' labor, f->>'obs' obs
    from jsonb_array_elements(p_filas) f
    where coalesce(f->>'dni','') <> ''
  ), up as (
    insert into public.reub_personal (dni, nombre, linea, lado, labor, obs, activo, actualizado_por)
    select dni, nombre, linea, lado, labor, obs, true, auth.uid() from datos
    on conflict (dni) do update set
      nombre = excluded.nombre, linea = excluded.linea, lado = excluded.lado,
      labor = excluded.labor, obs = excluded.obs, activo = true,
      actualizado_por = auth.uid(), actualizado_en = now()
    returning 1
  )
  select count(*) into v_ins from up;

  update public.reub_personal set activo = false, actualizado_por = auth.uid(), actualizado_en = now()
  where activo = true and dni not in (select f->>'dni' from jsonb_array_elements(p_filas) f);
  get diagnostics v_desact = row_count;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'REUBICACION', 'Reemplazo de lote', v_ins || ' actualizados/insertados, ' || v_desact || ' desactivados');
  return query select v_ins, v_desact;
end;
$$;

grant execute on function public.rpc_guardar_personal_fila(jsonb) to authenticated;
grant execute on function public.rpc_reemplazar_personal_lote(jsonb) to authenticated;

-- Escaneo: sin login (fricción cero en campo), por eso también se otorga a anon.
create or replace function public.rpc_registrar_escaneo(p jsonb)
returns public.reub_escaneos language plpgsql security definer set search_path = public as $$
declare v_fila public.reub_escaneos;
begin
  insert into public.reub_escaneos (dni_leido, encontrado, nombre, linea, lado, labor, texto_crudo, origen, dispositivo_id, perfil_id)
  values (
    p->>'dni_leido', coalesce((p->>'encontrado')::boolean, false), p->>'nombre', p->>'linea', p->>'lado', p->>'labor',
    p->>'texto_crudo', coalesce(p->>'origen','escaner'), p->>'dispositivo_id', auth.uid()
  ) returning * into v_fila;
  return v_fila;
end;
$$;
grant execute on function public.rpc_registrar_escaneo(jsonb) to authenticated, anon;
