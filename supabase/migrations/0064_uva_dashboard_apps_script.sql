-- 0064: Uva — el dashboard de Apps Script (hoja de la APK) lee Integra en tiempo real
--
-- El Apps Script de la APK ya reenvía a Integra con el token de Vault «uva_apk_token» (propiedad
-- INTEGRA_TOKEN). Con el mismo token ahora también LEE uva_ciclos (APK + Integra + Planta) para su
-- dashboard, en vez de depender del IMPORTRANGE de UVA_Registros:
--   · rpc_uva_dashboard_marca(token): marca de cambios (última actualización + n° de filas), barata,
--     el dashboard la consulta cada 15 s y solo recarga si cambió.
--   · rpc_uva_dashboard(token, desde): las filas (sin eliminados) desde «desde» (por defecto 180 días).
-- Solo lectura. Sin el token correcto no devuelve nada.

create or replace function public.fn_uva_token_ok(p_token text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'uva_apk_token';
  return v_token is not null and coalesce(p_token, '') = v_token;
end;
$$;
revoke execute on function public.fn_uva_token_ok(text) from public, anon, authenticated;

create or replace function public.rpc_uva_dashboard_marca(p_token text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_uva_token_ok(p_token) then raise exception 'Token no válido.'; end if;
  return (select coalesce(to_char(max(actualizado_en), 'YYYYMMDDHH24MISSUS'), '0') || '-' || count(*) from public.uva_ciclos);
end;
$$;
revoke execute on function public.rpc_uva_dashboard_marca(text) from public;
grant execute on function public.rpc_uva_dashboard_marca(text) to anon, authenticated;

create or replace function public.rpc_uva_dashboard(p_token text, p_desde date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_desde date := coalesce(p_desde, (now() at time zone 'America/Lima')::date - 180);
begin
  if not public.fn_uva_token_ok(p_token) then raise exception 'Token no válido.'; end if;
  return jsonb_build_object(
    'marca', (select coalesce(to_char(max(actualizado_en), 'YYYYMMDDHH24MISSUS'), '0') || '-' || count(*) from public.uva_ciclos),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'origen', c.origen, 'ambito', c.ambito, 'registrador', c.registrador,
        'dispositivo', c.dispositivo, 'registro', c.registro, 'etapas', c.etapas, 'fecha', c.fecha, 'semana', c.semana,
        'campana', c.campana, 'zona', c.zona, 'fundo', c.fundo, 'lote', c.lote, 'variedad', c.variedad, 'grupo', c.grupo,
        'pallet', c.pallet, 'placa', c.placa, 'planta', c.planta, 'planta_destino', c.planta_destino, 'linea', c.linea,
        'estado', c.estado, 'vinculado', c.vinculado, 'campo_recibido', c.campo_recibido, 'hora_llegada', c.hora_llegada,
        'llegada_por', c.llegada_por, 'planta_usuario', c.planta_usuario, 'planta_inicio', c.planta_inicio,
        't_en_planta', c.t_en_planta, 't_ciclo_completo', c.t_ciclo_completo, 'actualizado_en', c.actualizado_en)
        order by c.fecha, c.creado_en)
      from public.uva_ciclos c
      where not c.eliminado and (c.fecha is null or c.fecha >= v_desde)
    ), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_uva_dashboard(text, date) from public;
grant execute on function public.rpc_uva_dashboard(text, date) to anon, authenticated;
