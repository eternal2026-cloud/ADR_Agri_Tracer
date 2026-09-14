-- 0007: Sincronización automática hacia Google Sheets + etapa "cosecha" editable
--
-- Piezas:
--   · Vault guarda la clave JSON de la cuenta de servicio ('google_service_account')
--     y un token interno ('sync_sheets_token') con el que pg_cron llama a la Edge
--     Function sync-sheets. Ningún cliente (anon/authenticated) puede leerlos.
--   · pg_cron revisa cada 5 min; pg_net dispara la función solo si ya pasaron
--     SHEETS_SYNC_MINUTOS desde el último intento y hay hoja + credencial.
--   · rpc_agregar_etapa ahora acepta 'cosecha' (completar fin de cosecha o
--     corregir los datos de cabecera de un ciclo ya iniciado).

create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into public.parametros (clave, valor, descripcion) values
  ('SHEETS_ID', '', 'ID o enlace de la Google Sheet destino (compartida como Editor con la cuenta de servicio).'),
  ('GOOGLE_SA_EMAIL', '', 'Correo de la cuenta de servicio de Google cargada (dato público, no es secreto).'),
  ('ULTIMO_INTENTO_SYNC_SHEETS', '', 'Marca de tiempo del último intento de sincronización (exitoso o no).')
on conflict (clave) do nothing;

-- Token interno cron -> Edge Function (se crea una sola vez).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sync_sheets_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sync_sheets_token',
      'Token interno con el que pg_cron invoca la Edge Function sync-sheets');
  end if;
end $$;

-- ---------------------------------------------------------------- secretos (solo service_role)
create or replace function public.fn_secreto_sync(p_nombre text)
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_nombre and p_nombre in ('google_service_account', 'sync_sheets_token');
$$;
revoke execute on function public.fn_secreto_sync(text) from public, anon, authenticated;
grant execute on function public.fn_secreto_sync(text) to service_role;

-- Valida y guarda la clave JSON en Vault. Interna: la exponen rpc_guardar_credencial_google (admin).
create or replace function public.fn_interna_guardar_credencial_google(p_json text)
returns text language plpgsql security definer set search_path = public as $$
declare j jsonb; v_id uuid;
begin
  begin
    j := p_json::jsonb;
  exception when others then
    raise exception 'El archivo no es un JSON válido.';
  end;
  if j->>'type' is distinct from 'service_account'
     or coalesce(j->>'client_email', '') = ''
     or coalesce(j->>'private_key', '') not like '-----BEGIN PRIVATE KEY-----%' then
    raise exception 'El JSON no es una clave de cuenta de servicio de Google (faltan type, client_email o private_key).';
  end if;

  select id into v_id from vault.secrets where name = 'google_service_account';
  if v_id is null then
    perform vault.create_secret(p_json, 'google_service_account', 'Clave JSON de la cuenta de servicio de Google (sync a Sheets)');
  else
    perform vault.update_secret(v_id, p_json);
  end if;

  update public.parametros set valor = j->>'client_email', actualizado_en = now() where clave = 'GOOGLE_SA_EMAIL';
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SHEETS', 'Credencial de Google cargada', j->>'client_email');
  return j->>'client_email';
end;
$$;
revoke execute on function public.fn_interna_guardar_credencial_google(text) from public, anon, authenticated;

create or replace function public.rpc_guardar_credencial_google(p_json text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'admin' then raise exception 'No autorizado'; end if;
  return public.fn_interna_guardar_credencial_google(p_json);
end;
$$;
revoke execute on function public.rpc_guardar_credencial_google(text) from public, anon;
grant execute on function public.rpc_guardar_credencial_google(text) to authenticated;

-- Estado para el panel de Configuración (sin exponer secretos).
create or replace function public.rpc_estado_sync_sheets()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'admin' then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    'tiene_credencial', exists (select 1 from vault.secrets where name = 'google_service_account'),
    'sa_email',       (select valor from public.parametros where clave = 'GOOGLE_SA_EMAIL'),
    'sheet_id',       (select valor from public.parametros where clave = 'SHEETS_ID'),
    'minutos',        (select valor from public.parametros where clave = 'SHEETS_SYNC_MINUTOS'),
    'ultima_sync',    (select valor from public.parametros where clave = 'ULTIMA_SYNC_SHEETS'),
    'ultimo_error',   (select valor from public.parametros where clave = 'ULTIMO_ERROR_SYNC_SHEETS'),
    'ultimo_intento', (select valor from public.parametros where clave = 'ULTIMO_INTENTO_SYNC_SHEETS'),
    'cron_activo',    exists (select 1 from cron.job where jobname = 'agritracer-sync-sheets' and active)
  );
end;
$$;
revoke execute on function public.rpc_estado_sync_sheets() from public, anon;
grant execute on function public.rpc_estado_sync_sheets() to authenticated;

-- ---------------------------------------------------------------- disparador periódico
create or replace function public.fn_disparar_sync_sheets()
returns void language plpgsql security definer set search_path = public as $$
declare v_min integer; v_intento timestamptz; v_token text;
begin
  if coalesce((select valor from public.parametros where clave = 'SHEETS_ID'), '') = '' then return; end if;
  if not exists (select 1 from vault.secrets where name = 'google_service_account') then return; end if;

  v_min := greatest(coalesce(nullif((select valor from public.parametros where clave = 'SHEETS_SYNC_MINUTOS'), '')::integer, 60), 5);
  v_intento := nullif((select valor from public.parametros where clave = 'ULTIMO_INTENTO_SYNC_SHEETS'), '')::timestamptz;
  if v_intento is not null and now() - v_intento < make_interval(mins => v_min) - interval '1 minute' then return; end if;

  update public.parametros set valor = now()::text, actualizado_en = now() where clave = 'ULTIMO_INTENTO_SYNC_SHEETS';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'sync_sheets_token';

  perform net.http_post(
    url := 'https://ptsvriudoilsyofgccsb.supabase.co/functions/v1/sync-sheets',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-token', v_token),
    body := jsonb_build_object('origen', 'cron'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.fn_disparar_sync_sheets() from public, anon, authenticated;

select cron.schedule('agritracer-sync-sheets', '*/5 * * * *', 'select public.fn_disparar_sync_sheets()');

-- La Edge Function (service_role) lee los resúmenes para la pestaña Resumen_Semanal.
grant execute on function public.fn_semanas_disponibles() to service_role;
grant execute on function public.fn_resumen_semana(integer) to service_role;
grant execute on function public.fn_resumen_general() to service_role;

-- ---------------------------------------------------------------- etapa cosecha editable
create or replace function public.rpc_agregar_etapa(p_codigo text, p_etapa text, p_datos jsonb)
returns public.ciclos_cosecha language plpgsql security definer set search_path = public as $$
declare v_fila public.ciclos_cosecha;
begin
  if public.rol_actual() not in ('admin','captura') then raise exception 'No autorizado'; end if;

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
