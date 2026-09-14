-- 0008: Cierra la ejecución anónima de las RPC de escritura y hace las
-- validaciones de rol a prueba de NULL.
--
-- Problema detectado por el advisor de Supabase: los privilegios por defecto
-- otorgan EXECUTE a anon en cada función nueva ("revoke from public" no lo
-- quita). Para anon (o una cuenta sin perfil activo) rol_actual() es NULL, y
-- "NULL not in (...)" / "NULL <> 'admin'" NO lanzaban la excepción.
-- Solución: exigir_rol() convierte NULL en "No autorizado", se revoca anon y
-- rol_actual() ignora perfiles desactivados (efecto inmediato al desactivar).

drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;

create or replace function public.rol_actual()
returns public.rol_app language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo;
$$;

create or replace function public.exigir_rol(variadic p_roles text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.rol_actual()::text, '') <> all (p_roles) then
    raise exception 'No autorizado';
  end if;
end;
$$;
revoke execute on function public.exigir_rol(text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- ciclos
create or replace function public.rpc_iniciar_ciclo(p jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  perform public.exigir_rol('admin', 'captura');

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

create or replace function public.rpc_guardar_lote_ciclos(p_filas jsonb)
returns setof public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin', 'captura');
  return query select public.rpc_iniciar_ciclo(f) from jsonb_array_elements(p_filas) f;
end;
$$;

create or replace function public.rpc_agregar_etapa(p_codigo text, p_etapa text, p_datos jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  perform public.exigir_rol('admin', 'captura');

  if p_etapa = 'cosecha' then
    update public.ciclos_cosecha set
      fecha          = coalesce(nullif(p_datos->>'fecha', '')::date, fecha),
      fundo          = coalesce(nullif(p_datos->>'fundo', ''), fundo),
      lote           = coalesce(p_datos->>'lote', lote),
      lider          = coalesce(p_datos->>'lider', lider),
      presentacion   = coalesce(p_datos->>'presentacion', presentacion),
      variedad       = coalesce(p_datos->>'variedad', variedad),
      calibre        = coalesce(p_datos->>'calibre', calibre),
      inicio_cosecha = coalesce((p_datos->>'inicio_cosecha')::timestamptz, inicio_cosecha),
      fin_cosecha    = coalesce((p_datos->>'fin_cosecha')::timestamptz, fin_cosecha),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'jabero' then
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
      num_jabas_2        = coalesce((p_datos->>'num_jabas_2')::integer, num_jabas_2),
      obs_jabas_2        = coalesce(p_datos->>'obs_jabas_2', obs_jabas_2),
      inicio_descarga_ca = coalesce((p_datos->>'inicio_descarga_ca')::timestamptz, inicio_descarga_ca),
      fin_descarga_ca    = coalesce((p_datos->>'fin_descarga_ca')::timestamptz, fin_descarga_ca),
      num_pallets        = coalesce((p_datos->>'num_pallets')::integer, num_pallets),
      presentaciones     = coalesce(p_datos->>'presentaciones', presentaciones),
      placa_camion       = coalesce(p_datos->>'placa_camion', placa_camion),
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
    values (auth.uid(), 'CICLOS', 'Etapa guardada: ' || p_etapa, p_codigo);
  return v_fila;
end;
$$;

-- ---------------------------------------------------------------- reubicación
create or replace function public.rpc_guardar_personal_fila(p jsonb)
returns public.reub_personal language plpgsql security definer set search_path = public as $$
declare v_fila public.reub_personal;
begin
  perform public.exigir_rol('admin');
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

create or replace function public.rpc_reemplazar_personal_lote(p_filas jsonb)
returns table (insertados integer, desactivados integer) language plpgsql security definer set search_path = public as $$
declare v_ins integer; v_desact integer;
begin
  perform public.exigir_rol('admin');

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

-- ---------------------------------------------------------------- grants
revoke execute on function public.rpc_iniciar_ciclo(jsonb) from public, anon;
revoke execute on function public.rpc_guardar_lote_ciclos(jsonb) from public, anon;
revoke execute on function public.rpc_agregar_etapa(text, text, jsonb) from public, anon;
revoke execute on function public.rpc_guardar_personal_fila(jsonb) from public, anon;
revoke execute on function public.rpc_reemplazar_personal_lote(jsonb) from public, anon;
revoke execute on function public.rpc_marcar_password_cambiada() from public, anon;
grant execute on function public.rpc_iniciar_ciclo(jsonb) to authenticated;
grant execute on function public.rpc_guardar_lote_ciclos(jsonb) to authenticated;
grant execute on function public.rpc_agregar_etapa(text, text, jsonb) to authenticated;
grant execute on function public.rpc_guardar_personal_fila(jsonb) to authenticated;
grant execute on function public.rpc_reemplazar_personal_lote(jsonb) to authenticated;
grant execute on function public.rpc_marcar_password_cambiada() to authenticated;
-- rol_actual sigue disponible para anon: la política de lectura de reub_personal la usa.
-- rpc_registrar_escaneo sigue disponible para anon a propósito (escaneo sin login).
