-- 0066: Uva — dos ciclos iniciados por separado NUNCA se unen
--
-- La unión por N° de pallet de 0057/0058 juntaba cualquier par de ciclos de Integra con el mismo N° de
-- pallet, fecha y fundo. Los N° de pallet se repiten entre grupos (0002, 0004…) y el 11/11 juntó 4 pallets
-- distintos de EL TUNAL en uno solo. En toda la historia, ninguna de las 19 uniones vino del botón «Unirse».
--
-- Ahora solo se une cuando uno de los dos ciclos se creó con «Unirse a un pallet por su N°» (registro.union
-- = true): el auxiliar que CONTINÚA un pallet sin señal y no lo encontró en la lista. Continuar un ciclo
-- que sí aparece en la lista usa el mismo ID y no necesita unión. Todo lo demás queda igual que en 0058.
create or replace function public.fn_uva_aplicar_campo(p jsonb, p_origen text, p_usuario uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r jsonb := p->'registro';
  et jsonb := coalesce(p->'etapas', '[]'::jsonb);
  v_id text := r->>'id';
  v_reg text := coalesce(p->>'registrador', r->>'registrador', '');
  v_disp text := coalesce(p->>'dispositivo', r->>'dispositivo', '');
  v_fin timestamptz;
  v_lleg timestamptz;
  v_por text;
  v_pal text;
  v_fecha date;
  v_fundo text;
  v_union boolean := coalesce(r->>'union', '') = 'true';
  v_todos boolean := p_origen <> 'integra' or public.fn_uva_ver_todos();
  v_f jsonb;
  x public.uva_ciclos;
  y public.uva_ciclos;
  s public.uva_ciclos;
  o public.uva_ciclos;
  hay boolean;
  n int := 0;
begin
  if r is null or coalesce(v_id, '') = '' then raise exception 'Solicitud no válida: falta el registro.'; end if;
  if v_id !~ '^UV-[A-Z0-9-]+$' then raise exception 'ID no válido: %', v_id; end if;
  select * into x from public.uva_ciclos where id = v_id for update;
  hay := found;
  while hay and x.fusionado_en is not null and n < 5 loop
    v_id := x.fusionado_en; n := n + 1;
    select * into x from public.uva_ciclos where id = v_id for update;
    hay := found;
  end loop;
  -- Eliminado en Integra (no unido): la copia de otro celular no lo revive.
  if hay and x.eliminado and x.fusionado_en is null then return v_id; end if;
  if hay then
    if x.origen <> p_origen then raise exception 'El registro % ya existe con otro origen (%). No se sobrescribe.', v_id, x.origen; end if;
    if p_origen = 'apk' and (x.registrador is distinct from v_reg or x.dispositivo is distinct from v_disp) then
      raise exception 'El registro % ya fue enviado por % (%). No se sobrescribe.', v_id, x.registrador, x.dispositivo;
    end if;
    if p_origen = 'integra' and coalesce(btrim(x.fundo), '') <> '' and not public.fn_uva_fundo_permitido(x.fundo) then
      raise exception 'El ciclo % es del fundo «%», que no tienes asignado. No se sobrescribe.', v_id, x.fundo;
    end if;
    if not v_todos and x.usuario_id is distinct from p_usuario then return v_id; end if;
    v_union := v_union or coalesce(x.registro->>'union', '') = 'true';
  end if;

  if p_origen = 'integra' then
    -- Unión por N° de pallet SOLO para un ciclo creado con «Unirse» (o con un ciclo así): mismo N°, fecha y fundo.
    v_pal := public.fn_uva_pallet_llave(r->>'pallet');
    v_fecha := case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end;
    v_fundo := public.fn_txt_llave(coalesce(nullif(r->>'fundo', ''), x.fundo));
    if v_pal is not null and v_fecha is not null then
      select * into y from public.uva_ciclos c
      where c.origen = 'integra' and not c.eliminado and c.fusionado_en is null and c.id <> v_id
        and public.fn_uva_pallet_llave(c.pallet) = v_pal and c.fecha = v_fecha
        and (v_union or coalesce(c.registro->>'union', '') = 'true')
        and (v_fundo is null or public.fn_txt_llave(c.fundo) is null or public.fn_txt_llave(c.fundo) = v_fundo)
        and (coalesce(btrim(c.fundo), '') = '' or public.fn_uva_fundo_permitido(c.fundo))
        and (v_todos or c.usuario_id = p_usuario)
      order by c.creado_en limit 1 for update;
      if found then
        if not hay then
          x := y; hay := true; v_id := y.id;
        elsif not (x.vinculado and y.vinculado) then
          if x.vinculado or (not y.vinculado and x.creado_en <= y.creado_en) then s := x; o := y; else s := y; o := x; end if;
          v_f := public.fn_uva_fusionar(s.registro, s.etapas, o.registro, o.etapas);
          update public.uva_ciclos set eliminado = true, fusionado_en = s.id where id = o.id;
          update public.uva_ciclos set registro = v_f->'registro', etapas = v_f->'etapas' where id = s.id;
          select * into x from public.uva_ciclos where id = s.id;
          v_id := s.id;
        end if;
      end if;
    end if;
    r := jsonb_set(r, '{id}', to_jsonb(v_id));
    if hay then
      v_f := public.fn_uva_fusionar(x.registro, x.etapas, r, et);
    else
      v_f := public.fn_uva_fusionar('{}'::jsonb, '[]'::jsonb, r, et);
    end if;
    r := v_f->'registro'; et := v_f->'etapas';
  end if;
  v_fin := public.fn_uva_hora_etapa(et, 8, 'fin');

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
    registrador = case when c.origen = 'integra' then coalesce(nullif(c.registrador, ''), excluded.registrador) else excluded.registrador end,
    dispositivo = case when c.origen = 'integra' then coalesce(nullif(c.dispositivo, ''), excluded.dispositivo) else excluded.dispositivo end,
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
