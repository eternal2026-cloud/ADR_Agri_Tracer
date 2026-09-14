-- 0010: Parámetros autorreparables.
--
-- Incidente 2026-09-14: la tabla parametros quedó vacía (borrado externo a la
-- app). Los guardados del panel hacían UPDATE sobre filas inexistentes → 0 filas
-- afectadas, sin error, y la hoja de Google "nunca tenía enlace".
-- · fn_asegurar_parametros() recrea las claves faltantes con sus valores por defecto.
-- · La llaman el estado del panel, el disparador del cron y la carga de credencial.
-- · Se restauran el enlace de la hoja y el correo de la cuenta de servicio
--   (leído dentro de la BD desde Vault; la clave privada no sale de Postgres).

create or replace function public.fn_asegurar_parametros()
returns void language sql security definer set search_path = public as $$
  insert into public.parametros (clave, valor, descripcion) values
    ('UMBRAL_TIEMPO_CICLO_MIN', '480', 'Minutos máximos de un ciclo completo; por encima se excluye del promedio por posible error de digitación.'),
    ('SHEETS_SYNC_MINUTOS', '60', 'Cada cuántos minutos se sincroniza el espejo de auditoría en Google Sheets.'),
    ('ULTIMA_SYNC_SHEETS', '', 'Marca de tiempo de la última sincronización exitosa hacia Sheets.'),
    ('ULTIMO_ERROR_SYNC_SHEETS', '', 'Último error de sincronización hacia Sheets (vacío si todo bien).'),
    ('SHEETS_ID', '', 'ID o enlace de la Google Sheet destino (compartida como Editor con la cuenta de servicio).'),
    ('GOOGLE_SA_EMAIL', '', 'Correo de la cuenta de servicio de Google cargada (dato público, no es secreto).'),
    ('ULTIMO_INTENTO_SYNC_SHEETS', '', 'Marca de tiempo del último intento de sincronización (exitoso o no).')
  on conflict (clave) do nothing;
$$;
revoke execute on function public.fn_asegurar_parametros() from public, anon, authenticated;

create or replace function public.rpc_estado_sync_sheets()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'admin' then raise exception 'No autorizado'; end if;
  perform public.fn_asegurar_parametros();
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

create or replace function public.fn_disparar_sync_sheets()
returns void language plpgsql security definer set search_path = public as $$
declare v_min integer; v_intento timestamptz; v_token text;
begin
  perform public.fn_asegurar_parametros();
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

  perform public.fn_asegurar_parametros();
  update public.parametros set valor = j->>'client_email', actualizado_en = now() where clave = 'GOOGLE_SA_EMAIL';
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SHEETS', 'Credencial de Google cargada', j->>'client_email');
  return j->>'client_email';
end;
$$;
revoke execute on function public.fn_interna_guardar_credencial_google(text) from public, anon, authenticated;

-- Restauración de los valores perdidos.
select public.fn_asegurar_parametros();
update public.parametros set valor = 'https://docs.google.com/spreadsheets/d/1PqpBclpkoRzfk1sf_EovO0jDozGEAZ93vV99bIMtemI/edit', actualizado_en = now()
  where clave = 'SHEETS_ID' and valor = '';
update public.parametros
  set valor = coalesce((select decrypted_secret::jsonb->>'client_email' from vault.decrypted_secrets where name = 'google_service_account'), ''),
      actualizado_en = now()
  where clave = 'GOOGLE_SA_EMAIL' and valor = '';
