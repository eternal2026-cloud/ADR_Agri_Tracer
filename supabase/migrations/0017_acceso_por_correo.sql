-- 0017: Ingreso con correo corporativo + PIN del Bot Don Ricardo
--
--   · Los usuarios ingresan con su correo corporativo (dominios en CORREO_DOMINIOS) y
--     un PIN de un solo uso (Supabase Auth OTP). El correo lo arma y lo envía la Edge
--     Function correo-bot (Send Email Hook) por Microsoft Graph, con el diseño Don Ricardo.
--   · Solo la cuenta «admin» sigue con usuario y contraseña.
--   · perfiles.correo: correo corporativo del usuario (null en la cuenta admin).
--   · Se eliminan las cuentas de prueba (ronald, juanito, luis). Sus registros se
--     conservan: el autor queda en blanco y la bitácora guarda el usuario como texto.

-- ================================================================ perfiles
alter table public.perfiles add column if not exists correo text;
create unique index if not exists perfiles_correo_uidx on public.perfiles (lower(correo)) where correo is not null;

-- ================================================================ parámetros del bot
create or replace function public.fn_asegurar_parametros()
returns void language sql security definer set search_path = public as $$
  insert into public.parametros (clave, valor, descripcion) values
    ('UMBRAL_TIEMPO_CICLO_MIN', '480', 'Minutos máximos de un ciclo completo; por encima se excluye del promedio por posible error de digitación.'),
    ('SHEETS_SYNC_MINUTOS', '60', 'Cada cuántos minutos se sincroniza el espejo de auditoría en Google Sheets.'),
    ('ULTIMA_SYNC_SHEETS', '', 'Marca de tiempo de la última sincronización exitosa hacia Sheets.'),
    ('ULTIMO_ERROR_SYNC_SHEETS', '', 'Último error de sincronización hacia Sheets (vacío si todo bien).'),
    ('SHEETS_ID', '', 'ID o enlace de la Google Sheet destino (compartida como Editor con la cuenta de servicio).'),
    ('GOOGLE_SA_EMAIL', '', 'Correo de la cuenta de servicio de Google cargada (dato público, no es secreto).'),
    ('ULTIMO_INTENTO_SYNC_SHEETS', '', 'Marca de tiempo del último intento de sincronización (exitoso o no).'),
    ('S5_DIAS_CORRECCION', '3', 'Auditoría 5S: días desde la fecha de auditoría en que un auditor puede corregir puntajes; después solo un administrador.'),
    ('CORREO_DOMINIOS', 'adr.com.pe', 'Dominios de correo corporativo que pueden ingresar con PIN (separados por coma).'),
    ('CORREO_REMITENTE', 'rhaya@adr.com.pe', 'Buzón de Microsoft 365 desde el que el Bot Don Ricardo envía los PIN (la app de Entra ID debe tener Mail.Send sobre él).'),
    ('CORREO_NOMBRE_BOT', 'Bot Don Ricardo · Gestión de Procesos', 'Nombre con el que firma el bot en los correos.'),
    ('APP_URL', '', 'Dirección pública de AgriTracer para el botón de los correos (ej. https://agritracer.vercel.app). Vacío = sin botón.')
  on conflict (clave) do nothing;
$$;
revoke execute on function public.fn_asegurar_parametros() from public, anon, authenticated;
select public.fn_asegurar_parametros();

/** Dominios permitidos: la pantalla de ingreso los muestra antes de iniciar sesión. */
create or replace function public.fn_correo_dominios()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(d) from unnest(regexp_split_to_array(lower(btrim(valor)), '[,;\s]+')) d where d <> ''),
    array['adr.com.pe'])
  from public.parametros where clave = 'CORREO_DOMINIOS';
$$;
revoke execute on function public.fn_correo_dominios() from public;
grant execute on function public.fn_correo_dominios() to anon, authenticated;

-- ================================================================ cuentas de prueba
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.perfiles where usuario in ('ronald', 'juanito', 'luis') and rol <> 'admin';
  if v_ids is null then return; end if;

  update public.bitacora b set usuario_txt = coalesce(b.usuario_txt, p.usuario), usuario_id = null
    from public.perfiles p where p.id = b.usuario_id and b.usuario_id = any(v_ids);
  update public.parametros set actualizado_por = null where actualizado_por = any(v_ids);
  update public.ciclos_cosecha set creado_por = null where creado_por = any(v_ids);
  update public.ciclos_cosecha set actualizado_por = null where actualizado_por = any(v_ids);
  update public.reub_personal set actualizado_por = null where actualizado_por = any(v_ids);
  update public.reub_escaneos set perfil_id = null where perfil_id = any(v_ids);
  update public.s5_auditorias set creado_por = null where creado_por = any(v_ids);
  update public.s5_auditorias set actualizado_por = null where actualizado_por = any(v_ids);
  update public.s5_evaluaciones set creado_por = null where creado_por = any(v_ids);
  update public.s5_puntajes set corregido_por = null where corregido_por = any(v_ids);
  update public.s5_puntajes set actualizado_por = null where actualizado_por = any(v_ids);
  update public.s5_observaciones set creado_por = null where creado_por = any(v_ids);
  update public.s5_observaciones set actualizado_por = null where actualizado_por = any(v_ids);
  update public.s5_seguimientos set usuario_id = null where usuario_id = any(v_ids);
  update public.mp_revisiones set creado_por = null where creado_por = any(v_ids);
  update public.mp_revisiones set actualizado_por = null where actualizado_por = any(v_ids);
  update public.mp_ot set revisado_por = null where revisado_por = any(v_ids);
  update public.sci_encuestas set creado_por = null where creado_por = any(v_ids);
  update public.sci_encuestas set actualizado_por = null where actualizado_por = any(v_ids);

  insert into public.bitacora (usuario_txt, modulo, accion, detalle)
    values ('migración 0017', 'USUARIOS', 'Cuentas de prueba eliminadas', 'ronald, juanito, luis · el acceso pasa a correo corporativo + PIN');
  delete from auth.users where id = any(v_ids);  -- perfiles se borra en cascada
end $$;
