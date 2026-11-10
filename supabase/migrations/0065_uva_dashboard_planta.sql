-- 0065: Uva — el dashboard de Apps Script recibe también la parte de PLANTA de cada ciclo
-- (marcas, tramos, causas de demora y de dónde salió la llegada) para su vista «Planta».
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
        'estado', c.estado, 'vinculado', c.vinculado, 'campo_recibido', c.campo_recibido, 'fin_carga', c.fin_carga,
        'hora_llegada', c.hora_llegada, 'llegada_por', c.llegada_por, 'llegada_ref', c.llegada_ref,
        'hora_recepcion', c.hora_recepcion, 'ini_descarga', c.ini_descarga, 'fin_descarga', c.fin_descarga,
        'ini_abastecimiento', c.ini_abastecimiento,
        't_llegada_desde_carga', public.fn_uva_min(c.fin_carga, c.hora_llegada),
        't_espera_recepcion', c.t_espera_recepcion, 't_espera_descarga', c.t_espera_descarga, 't_descarga', c.t_descarga,
        't_espera_abastecimiento', c.t_espera_abastecimiento, 't_en_planta', c.t_en_planta, 't_ciclo_completo', c.t_ciclo_completo,
        'planta_detalle', c.planta_detalle, 'planta_obs', c.planta_obs, 'planta_usuario', c.planta_usuario,
        'planta_inicio', c.planta_inicio, 'actualizado_en', c.actualizado_en)
        order by c.fecha, c.creado_en)
      from public.uva_ciclos c
      where not c.eliminado and (c.fecha is null or c.fecha >= v_desde)
    ), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_uva_dashboard(text, date) from public;
grant execute on function public.rpc_uva_dashboard(text, date) to anon, authenticated;

-- Permisos de la APK desde Integra: el modal «Permisos» del dashboard arma los perfiles con los usuarios
-- que tienen Tiempo de ciclo Uva (campo.uva) y sus fundos asignados (Config › Usuarios). Sin fundos = todos.
create or replace function public.rpc_uva_permisos_integra(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_uva_token_ok(p_token) then raise exception 'Token no válido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('usuario', p.usuario, 'nombre', p.nombre, 'rol', p.rol,
      'fundos', case when p.rol = 'admin' then '[]'::jsonb else to_jsonb(coalesce(p.fundos, '{}')) end,
      'solo_propios', p.uva_solo_propios) order by p.nombre)
    from public.perfiles p
    where p.activo and p.rol in ('admin', 'captura')
      and (p.rol = 'admin' or p.accesos is null or exists (select 1 from unnest(p.accesos) a where a = 'campo.uva' or a like 'campo.uva.%'))
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.rpc_uva_permisos_integra(text) from public;
grant execute on function public.rpc_uva_permisos_integra(text) to anon, authenticated;
