-- 0033: Tiempo de ciclo — comentario en cada etapa, placa del camión en «Carga al camión» y meta
--
--   · Comentario en las etapas que no tenían: obs_cosecha, obs_moto, obs_traslado_ca, obs_camion.
--   · La placa del camión se registra en la etapa «Carga al camión» (la de «Descarga» se sigue
--     aceptando para ciclos en curso con la versión anterior de la app).
--   · META_TIEMPO_CICLO_MIN (120): línea de meta en el gráfico de tiempo de ciclo total. Solo se
--     muestra; no excluye datos (eso lo sigue haciendo UMBRAL_TIEMPO_CICLO_MIN).

alter table public.ciclos_cosecha
  add column if not exists obs_cosecha text,
  add column if not exists obs_moto text,
  add column if not exists obs_traslado_ca text,
  add column if not exists obs_camion text;

insert into public.parametros (clave, valor, descripcion) values
  ('META_TIEMPO_CICLO_MIN', '120', 'Meta de tiempo de ciclo total en minutos: línea de referencia en el gráfico (no excluye datos).')
on conflict (clave) do nothing;

create or replace function public.rpc_iniciar_ciclo(p jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  perform public.exigir_rol('admin', 'captura');

  insert into public.ciclos_cosecha (
    fecha, fundo, lote, lider, presentacion, variedad, calibre,
    inicio_cosecha, fin_cosecha, obs_cosecha, creado_por, actualizado_por
  ) values (
    (p->>'fecha')::date, p->>'fundo', p->>'lote', p->>'lider', p->>'presentacion', p->>'variedad', p->>'calibre',
    (p->>'inicio_cosecha')::timestamptz, (p->>'fin_cosecha')::timestamptz, p->>'obs_cosecha', auth.uid(), auth.uid()
  ) returning * into v_fila;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'CICLOS', 'Iniciado', v_fila.codigo);
  return v_fila;
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
      obs_cosecha    = coalesce(p_datos->>'obs_cosecha', obs_cosecha),
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
      obs_moto           = coalesce(p_datos->>'obs_moto', obs_moto),
      actualizado_por = auth.uid()
    where codigo = p_codigo returning * into v_fila;

  elsif p_etapa = 'traslado_ca' then
    update public.ciclos_cosecha set
      inicio_traslado_ca = coalesce((p_datos->>'inicio_traslado_ca')::timestamptz, inicio_traslado_ca),
      fin_traslado_ca    = coalesce((p_datos->>'fin_traslado_ca')::timestamptz, fin_traslado_ca),
      obs_traslado_ca    = coalesce(p_datos->>'obs_traslado_ca', obs_traslado_ca),
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
      placa_camion        = coalesce(p_datos->>'placa_camion', placa_camion),
      obs_camion          = coalesce(p_datos->>'obs_camion', obs_camion),
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

revoke execute on function public.rpc_iniciar_ciclo(jsonb) from public, anon;
revoke execute on function public.rpc_agregar_etapa(text, text, jsonb) from public, anon;
grant execute on function public.rpc_iniciar_ciclo(jsonb) to authenticated;
grant execute on function public.rpc_agregar_etapa(text, text, jsonb) to authenticated;
