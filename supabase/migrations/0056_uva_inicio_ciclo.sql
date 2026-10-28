-- 0056: Tiempo de ciclo Uva — el ciclo empieza en el inicio MÁS TEMPRANO de las 8 etapas
--
--   · Cosecha, traslado de jaba y armado corren en paralelo: la cosecha no siempre es la primera
--     marca. Antes el ciclo se medía desde el inicio de la cosecha; con una cosecha marcada
--     después del resto salía negativo (UV-IN-9PXX-MVSLHICJ: −2 min). Ahora ini_cosecha (columna
--     que usa t_ciclo_completo) = la hora de inicio más temprana de las etapas del paquete.
--   · Mismo criterio en el celular (TC.calcular); la espera de una etapa en paralelo es 0 si se
--     cruza con su etapa previa y, si no, la distancia absoluta entre ambas.
--
-- Revertir: volver a crear fn_uva_aplicar_campo de 0054 y drop function fn_uva_inicio_ciclo.

create or replace function public.fn_uva_inicio_ciclo(p_etapas jsonb)
returns timestamptz language sql immutable set search_path = public as $$
  select min(public.fn_uva_ts(e->>'inicio')) from jsonb_array_elements(coalesce(p_etapas, '[]'::jsonb)) e;
$$;

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
    public.fn_uva_inicio_ciclo(et), public.fn_uva_hora_etapa(et, 7, 'fin'), v_fin, now(), false,
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

-- Los ciclos ya guardados (el trigger recalcula t_ciclo_completo).
update public.uva_ciclos set ini_cosecha = public.fn_uva_inicio_ciclo(etapas)
where origen <> 'planta' and ini_cosecha is distinct from public.fn_uva_inicio_ciclo(etapas);
