-- ============================================================================
-- 0054 · Tiempo de ciclo Uva: la LLEGADA DEL CAMIÓN la marca campo o planta (cualquiera)
--
-- Es el mismo momento: fin de la etapa 8 de campo «Traslado a planta» = marca «Llegada del
-- camión» de planta. Una sola hora compartida en hora_llegada:
--   · Vale la PRIMERA marca (campo o planta). Un «Ahora» del otro lado no la pisa.
--   · Una CORRECCIÓN (el que la marcó la cambia, o planta la edita a mano) sí la reemplaza.
--   · llegada_campo guarda lo último que mandó campo (para saber si campo la cambió) y
--     llegada_por quién puso la hora vigente ('campo' | 'planta').
--   · Campo puede marcarla aunque planta aún no continúe el ciclo; al continuarlo ya está.
--   · Integra campo recibe la de planta (rpc_uva_guardar_campo y rpc_uva_campo_llegadas) y
--     completa su etapa 8. La APK no recibe nada (su Apps Script solo envía): su marca cuenta
--     si llega primero o si la corrige.
--   · fin_traslado (campo) = la llegada vigente; si no hay, la de campo.
-- ============================================================================

alter table public.uva_ciclos add column if not exists llegada_campo timestamptz;
alter table public.uva_ciclos add column if not exists llegada_por text check (llegada_por in ('campo', 'planta'));

-- ================================================================ cálculos (+ fin_traslado)
create or replace function public.fn_uva_calcular()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.origen <> 'planta' then new.fin_traslado := coalesce(new.hora_llegada, new.llegada_campo); end if;
  new.t_espera_recepcion := public.fn_uva_min(new.hora_llegada, new.hora_recepcion);
  new.t_espera_descarga := public.fn_uva_min(new.hora_recepcion, new.ini_descarga);
  new.t_descarga := public.fn_uva_min(new.ini_descarga, new.fin_descarga);
  new.t_espera_abastecimiento := public.fn_uva_min(new.fin_descarga, new.ini_abastecimiento);
  new.t_en_planta := public.fn_uva_min(new.hora_llegada, new.ini_abastecimiento);
  new.t_llegada_desde_carga := case when new.vinculado then public.fn_uva_min(new.fin_carga, new.hora_llegada) end;
  new.t_ciclo_completo := case when new.vinculado then public.fn_uva_min(new.ini_cosecha, new.ini_abastecimiento) end;
  new.ambito := case when new.origen = 'planta' then 'Planta' when new.vinculado then 'Ciclo completo' else 'Campo' end;
  if new.origen = 'planta' then
    new.fecha := coalesce(new.fecha, (coalesce(new.hora_llegada, new.planta_inicio, now()) at time zone 'America/Lima')::date);
  end if;
  if new.fecha is not null then new.semana := public.weeknum_excel_sistema1(new.fecha); end if;
  new.actualizado_en := now();
  return new;
end;
$$;
revoke execute on function public.fn_uva_calcular() from public, anon, authenticated;

-- ================================================================ campo (APK e Integra)
create or replace function public.fn_uva_aplicar_campo(p jsonb, p_origen text, p_usuario uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r jsonb := p->'registro';
  et jsonb := coalesce(p->'etapas', '[]'::jsonb);
  v_id text := r->>'id';
  v_reg text := coalesce(p->>'registrador', r->>'registrador', '');
  v_disp text := coalesce(p->>'dispositivo', r->>'dispositivo', '');
  v_fin timestamptz := public.fn_uva_hora_etapa(et, 8, 'fin');
  v_lleg timestamptz;
  v_por text;
  x public.uva_ciclos;
begin
  if r is null or coalesce(v_id, '') = '' then raise exception 'Solicitud no válida: falta el registro.'; end if;
  if v_id !~ '^UV-[A-Z0-9-]+$' then raise exception 'ID no válido: %', v_id; end if;
  select * into x from public.uva_ciclos where id = v_id for update;
  if found then
    if x.origen <> p_origen then raise exception 'El registro % ya existe con otro origen (%). No se sobrescribe.', v_id, x.origen; end if;
    if p_origen = 'apk' and (x.registrador is distinct from v_reg or x.dispositivo is distinct from v_disp) then
      raise exception 'El registro % ya fue enviado por % (%). No se sobrescribe.', v_id, x.registrador, x.dispositivo;
    end if;
    if p_origen = 'integra' and x.usuario_id is distinct from p_usuario and coalesce(public.rol_actual()::text, '') <> 'admin' then
      raise exception 'El registro % es de otro usuario. No se sobrescribe.', v_id;
    end if;
  end if;

  -- Llegada compartida: solo cuenta si campo CAMBIÓ su marca desde el último envío.
  v_lleg := x.hora_llegada; v_por := x.llegada_por;
  if v_fin is distinct from x.llegada_campo then
    if v_fin is null then
      if v_por = 'campo' then v_lleg := null; v_por := null; end if;
    elsif v_lleg is null or v_por = 'campo' or x.llegada_campo is not null then
      v_lleg := v_fin; v_por := 'campo';
    end if;
  end if;

  insert into public.uva_ciclos as c (id, origen, registrador, dispositivo, usuario_id, registro, etapas, fecha, campana, zona, fundo, lote,
    variedad, grupo, pallet, placa, planta, estado, ini_cosecha, fin_carga, fin_traslado, campo_recibido, eliminado,
    llegada_campo, hora_llegada, llegada_por)
  values (v_id, p_origen, v_reg, v_disp, p_usuario, r, et,
    case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end,
    r->>'campana', upper(btrim(r->>'zona')), upper(btrim(r->>'fundo')), upper(btrim(r->>'lote')), upper(btrim(r->>'variedad')),
    upper(btrim(r->>'grupo')), btrim(r->>'pallet'), nullif(upper(regexp_replace(coalesce(r->>'placa', ''), '\s+', '', 'g')), ''),
    upper(btrim(r->>'planta')), r->>'estado',
    public.fn_uva_hora_etapa(et, 1, 'inicio'), public.fn_uva_hora_etapa(et, 7, 'fin'), v_fin, now(), false,
    v_fin, v_lleg, v_por)
  on conflict (id) do update set
    registrador = excluded.registrador, dispositivo = excluded.dispositivo,
    usuario_id = coalesce(c.usuario_id, excluded.usuario_id),
    registro = excluded.registro, etapas = excluded.etapas, fecha = excluded.fecha, campana = excluded.campana,
    zona = excluded.zona, fundo = excluded.fundo, lote = excluded.lote, variedad = excluded.variedad, grupo = excluded.grupo,
    pallet = excluded.pallet, placa = excluded.placa, planta = excluded.planta, estado = excluded.estado,
    ini_cosecha = excluded.ini_cosecha, fin_carga = excluded.fin_carga,
    campo_recibido = excluded.campo_recibido, eliminado = false,
    llegada_campo = excluded.llegada_campo, hora_llegada = excluded.hora_llegada, llegada_por = excluded.llegada_por;
  return v_id;
end;
$$;
revoke execute on function public.fn_uva_aplicar_campo(jsonb, text, uuid) from public, anon, authenticated;

/** Integra campo: devuelve también la llegada vigente para completar la etapa 8 en el celular. */
create or replace function public.rpc_uva_guardar_campo(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; c public.uva_ciclos;
begin
  perform public.fn_uva_exigir('campo.uva', 'Tiempo de ciclo Uva');
  if coalesce(p_payload->'registro'->>'id', '') !~ '^UV-IN-' then raise exception 'Los registros de Integra empiezan con UV-IN-.'; end if;
  if p_payload->>'accion' = 'eliminar' then
    return jsonb_build_object('ok', true, 'resultado', public.fn_uva_quitar_campo(p_payload->'registro'->>'id', 'integra'));
  end if;
  v_id := public.fn_uva_aplicar_campo(p_payload, 'integra', auth.uid());
  select * into c from public.uva_ciclos where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'llegada', c.hora_llegada, 'llegada_por', c.llegada_por,
    'planta', coalesce(c.planta_destino, c.planta));
end;
$$;
revoke execute on function public.rpc_uva_guardar_campo(jsonb) from public, anon;
grant execute on function public.rpc_uva_guardar_campo(jsonb) to authenticated;

/** Integra campo: llegadas marcadas en planta de sus pallets en curso (consulta cada 2 min). */
create or replace function public.rpc_uva_campo_llegadas(p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.rol_actual() is null or not public.fn_tiene_acceso('campo.uva') then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'llegada', c.hora_llegada, 'llegada_por', c.llegada_por,
      'planta', coalesce(c.planta_destino, c.planta)))
    from public.uva_ciclos c
    where c.id = any(coalesce(p_ids, '{}')) and c.origen = 'integra' and not c.eliminado and c.hora_llegada is not null
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.rpc_uva_campo_llegadas(text[]) from public, anon;
grant execute on function public.rpc_uva_campo_llegadas(text[]) to authenticated;

-- ================================================================ planta
create or replace function public.fn_uva_fila(c public.uva_ciclos)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'origen', c.origen, 'ambito', c.ambito, 'fecha', c.fecha, 'placa', c.placa,
    'fundo', c.fundo, 'lote', c.lote, 'variedad', c.variedad, 'grupo', c.grupo, 'pallet', c.pallet, 'planta', c.planta,
    'registrador', c.registrador, 'estado', c.estado, 'etapa_actual', c.registro->>'etapaActual', 'situacion', c.registro->>'situacion',
    'jabas', c.registro->>'jabas', 'pallets_carg', c.registro->>'palletsCarg', 'pallets_tot', c.registro->>'palletsTot',
    'ini_cosecha', c.ini_cosecha, 'fin_carga', c.fin_carga, 'fin_traslado', c.fin_traslado, 'campo_recibido', c.campo_recibido,
    'min_total', c.registro->>'minTotal', 'etapas', c.etapas,
    'vinculado', c.vinculado, 'planta_destino', c.planta_destino, 'linea', c.linea,
    'hora_llegada', c.hora_llegada, 'hora_recepcion', c.hora_recepcion, 'ini_descarga', c.ini_descarga,
    'fin_descarga', c.fin_descarga, 'ini_abastecimiento', c.ini_abastecimiento, 'planta_detalle', c.planta_detalle,
    'planta_obs', c.planta_obs, 'planta_usuario', c.planta_usuario, 'planta_inicio', c.planta_inicio,
    't_espera_recepcion', c.t_espera_recepcion, 't_espera_descarga', c.t_espera_descarga, 't_descarga', c.t_descarga,
    't_espera_abastecimiento', c.t_espera_abastecimiento, 't_en_planta', c.t_en_planta,
    't_llegada_desde_carga', c.t_llegada_desde_carga, 't_ciclo_completo', c.t_ciclo_completo)
  || jsonb_build_object('llegada_por', c.llegada_por, 'llegada_campo', c.llegada_campo);
$$;
revoke execute on function public.fn_uva_fila(public.uva_ciclos) from public, anon;

/**
 * Guarda horas y datos de planta (solo las claves que llegan). La llegada es compartida con campo:
 * con llegada_nueva = true (botón «Ahora» sobre una llegada vacía en el celular) no pisa una que
 * campo ya marcó; una hora editada a mano sí la reemplaza.
 */
create or replace function public.rpc_uva_planta_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.uva_ciclos; k text; v timestamptz;
begin
  perform public.fn_uva_exigir('planta.uva', 'Recepción Uva (planta)');
  select * into c from public.uva_ciclos where id = p->>'id' for update;
  if not found or c.eliminado then raise exception 'El registro ya no existe.'; end if;
  if c.origen <> 'planta' and not c.vinculado then raise exception 'Primero continúa el ciclo en planta.'; end if;
  if p ? 'hora_llegada' and not (coalesce(p->>'llegada_nueva', '') = 'true' and c.hora_llegada is not null) then
    v := public.fn_uva_ts(p->>'hora_llegada');
    update public.uva_ciclos set hora_llegada = v, llegada_por = case when v is null then null else 'planta' end where id = c.id;
  end if;
  foreach k in array array['hora_recepcion', 'ini_descarga', 'fin_descarga', 'ini_abastecimiento'] loop
    if p ? k then
      execute format('update public.uva_ciclos set %I = $1 where id = $2', k) using public.fn_uva_ts(p->>k), c.id;
    end if;
  end loop;
  update public.uva_ciclos set
    planta_destino = case when p ? 'planta' then nullif(upper(btrim(p->>'planta')), '') else planta_destino end,
    planta = case when origen = 'planta' and p ? 'planta' then nullif(upper(btrim(p->>'planta')), '') else planta end,
    linea = case when p ? 'linea' then nullif(btrim(p->>'linea'), '') else linea end,
    placa = case when origen = 'planta' and p ? 'placa' then nullif(upper(regexp_replace(p->>'placa', '\s+', '', 'g')), '') else placa end,
    planta_obs = case when p ? 'obs' then nullif(btrim(p->>'obs'), '') else planta_obs end,
    planta_detalle = case when jsonb_typeof(p->'detalle') = 'object' then planta_detalle || (p->'detalle') else planta_detalle end,
    planta_actualizado = now()
  where id = c.id;
  update public.uva_ciclos set estado = case when ini_abastecimiento is not null then 'Cerrado' else 'En proceso' end
    where id = c.id and origen = 'planta';
  select * into c from public.uva_ciclos where id = c.id;
  return public.fn_uva_fila(c);
end;
$$;
revoke execute on function public.rpc_uva_planta_guardar(jsonb) from public, anon;
grant execute on function public.rpc_uva_planta_guardar(jsonb) to authenticated;

/** Deshacer en planta: un ciclo de campo vuelve a ser solo Campo (con la llegada que marcó campo, si hay). */
create or replace function public.rpc_uva_planta_quitar(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.uva_ciclos;
begin
  perform public.fn_uva_exigir('planta.uva', 'Recepción Uva (planta)');
  select * into c from public.uva_ciclos where id = p_id for update;
  if not found then return; end if;
  if c.planta_usuario_id is distinct from auth.uid() and public.rol_actual() <> 'admin' then
    raise exception 'Solo quien lo registró en planta (o un administrador) puede quitarlo.';
  end if;
  if c.origen = 'planta' then
    update public.uva_ciclos set eliminado = true where id = p_id;
  else
    update public.uva_ciclos set vinculado = false, planta_destino = null, linea = null,
      hora_llegada = llegada_campo, llegada_por = case when llegada_campo is not null then 'campo' end, hora_recepcion = null,
      ini_descarga = null, fin_descarga = null, ini_abastecimiento = null, planta_detalle = '{}'::jsonb, planta_obs = null,
      planta_usuario_id = null, planta_usuario = null, planta_inicio = null, planta_actualizado = null
    where id = p_id;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'UVA_PLANTA', 'Quitar de planta', p_id);
end;
$$;
revoke execute on function public.rpc_uva_planta_quitar(text) from public, anon;
grant execute on function public.rpc_uva_planta_quitar(text) to authenticated;

-- ================================================================ lo ya registrado
update public.uva_ciclos set llegada_campo = public.fn_uva_hora_etapa(etapas, 8, 'fin') where origen <> 'planta';
update public.uva_ciclos set llegada_por = 'planta' where hora_llegada is not null and llegada_por is null;
update public.uva_ciclos set hora_llegada = llegada_campo, llegada_por = 'campo'
  where origen <> 'planta' and hora_llegada is null and llegada_campo is not null;
