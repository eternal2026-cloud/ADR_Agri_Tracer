-- 0073: Cantidades con decimales (ej. 8.5 bandejas, 12.5 jabas)
--
--   · Estudio TOP: top_tiempos.envases integer → numeric(8,2); rpc_top_guardar_tiempo lo lee como numeric.
--   · Tiempos de ciclo Arándano: N° de jabas, desglose por presentación y N° de pallets → numeric(8,2);
--     rpc_agregar_etapa los lee como numeric.
--   · Tiempos de ciclo Uva: los guarda en registro (jsonb), no necesita cambio de base.
--   Los valores enteros que ya existen no cambian (12 → 12.00).
--
-- Revertir: alter ... type integer using round(col)::integer y recrear las dos funciones de 0060 / 0041.

alter table public.top_tiempos alter column envases type numeric(8,2);

alter table public.ciclos_cosecha
  alter column num_jabas      type numeric(8,2),
  alter column num_jabas_2    type numeric(8,2),
  alter column num_pallets    type numeric(8,2),
  alter column jabas_bandeja  type numeric(8,2),
  alter column jabas_jarra    type numeric(8,2),
  alter column jabas_bulk     type numeric(8,2),
  alter column jabas2_bandeja type numeric(8,2),
  alter column jabas2_jarra   type numeric(8,2),
  alter column jabas2_bulk    type numeric(8,2);

create or replace function public.rpc_top_guardar_tiempo(p jsonb)
returns public.top_tiempos language plpgsql security definer set search_path = public as $$
declare
  v public.top_tiempos; v_id bigint := nullif(p->>'id', '')::bigint; v_eval uuid := (p->>'evaluacion_id')::uuid;
  v_act smallint := (p->>'actividad_id')::smallint; v_fin timestamptz := nullif(p->>'fin', '')::timestamptz;
  v_env numeric := round(nullif(replace(p->>'envases', ',', '.'), '')::numeric, 2);
begin
  perform public.exigir_rol('admin', 'captura');
  if v_id is not null then
    select evaluacion_id, case when p ? 'envases' then v_env else envases end into v_eval, v_env from public.top_tiempos where id = v_id;
  end if;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede registrar tiempos.'; end if;
  if v_act = 4 and v_fin is not null and v_env is null then
    raise exception 'Indica la cantidad de envases (bandejas o jarras) de la cosecha.';
  end if;
  if v_act <> 4 then v_env := null; end if;
  if v_id is null then
    insert into public.top_tiempos (evaluacion_id, actividad_id, inicio, fin, nota, envases)
    values (v_eval, v_act, (p->>'inicio')::timestamptz, v_fin, nullif(trim(p->>'nota'), ''), v_env)
    returning * into v;
  else
    update public.top_tiempos set actividad_id = v_act, inicio = (p->>'inicio')::timestamptz,
      fin = v_fin, nota = nullif(trim(p->>'nota'), ''), envases = v_env
    where id = v_id returning * into v;
  end if;
  return v;
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
      num_jabas     = coalesce((p_datos->>'num_jabas')::numeric, num_jabas),
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
      num_jabas          = coalesce((p_datos->>'num_jabas')::numeric, num_jabas),
      obs_jaba           = coalesce(p_datos->>'obs_jaba', obs_jaba),
      jabas_bandeja      = coalesce((p_datos->>'jabas_bandeja')::numeric, jabas_bandeja),
      jabas_jarra        = coalesce((p_datos->>'jabas_jarra')::numeric, jabas_jarra),
      jabas_bulk         = coalesce((p_datos->>'jabas_bulk')::numeric, jabas_bulk),
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
      num_jabas_2        = coalesce((p_datos->>'num_jabas_2')::numeric, num_jabas_2),
      obs_jabas_2        = coalesce(p_datos->>'obs_jabas_2', obs_jabas_2),
      inicio_descarga_ca = coalesce((p_datos->>'inicio_descarga_ca')::timestamptz, inicio_descarga_ca),
      fin_descarga_ca    = coalesce((p_datos->>'fin_descarga_ca')::timestamptz, fin_descarga_ca),
      num_pallets        = coalesce((p_datos->>'num_pallets')::numeric, num_pallets),
      presentaciones     = coalesce(p_datos->>'presentaciones', presentaciones),
      placa_camion       = coalesce(p_datos->>'placa_camion', placa_camion),
      jabas2_bandeja     = coalesce((p_datos->>'jabas2_bandeja')::numeric, jabas2_bandeja),
      jabas2_jarra       = coalesce((p_datos->>'jabas2_jarra')::numeric, jabas2_jarra),
      jabas2_bulk        = coalesce((p_datos->>'jabas2_bulk')::numeric, jabas2_bulk),
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
      obs_traslado_planta = coalesce(p_datos->>'obs_traslado_planta', obs_traslado_planta),
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
