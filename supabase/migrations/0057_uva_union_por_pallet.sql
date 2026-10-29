-- 0057: Tiempo de ciclo Uva — varias personas en el mismo ciclo (sin señal) y lotes nuevos
--
--   · Cualquier usuario con el FUNDO asignado (Config › Usuarios › Fundos; admin o sin fundos = todos)
--     puede continuar y editar un ciclo de Integra de otra persona. Antes solo su autor o un admin.
--   · Unión sin pisarse: cada dato del paquete trae en registro.marcas la HORA EN QUE SE TOMÓ en el
--     celular («cos.ini», «car.fin», «pallet», «placa»…). Al guardar se combinan el ciclo guardado y
--     el que llega, dato por dato: vale el que se tomó después (no el que se subió después). Un dato
--     vacío sin marca nunca borra uno guardado. Así el que sube tarde las etapas 1–6 no borra las 7–8
--     del auxiliar, ni al revés.
--   · Unión por N° de pallet: si llega un ciclo con el mismo código de pallet y fecha (±1 día) que otro
--     ciclo de Integra, se juntan en el más antiguo (o en el que Planta ya continuó). El otro queda
--     eliminado con fusionado_en = el que sobrevive; si su celular vuelve a subirlo, se redirige.
--     La respuesta devuelve el ciclo combinado (fila) para que el celular lo adopte.
--   · registrador / dispositivo / usuario_id quedan con quien lo inició; registro.editadoPor = el último.
--   · Lotes: se agregan al catálogo los lotes de Uva del mapa (campo/uva/data/lotes_uva.geojson) cuyo
--     fundo ya existe, y rpc_uva_lote_nuevo guarda los lotes que se digitan en el celular.
--
-- Revertir: volver a crear fn_uva_aplicar_campo de 0056 y rpc_uva_guardar_campo de 0055;
--   drop function fn_uva_gana, fn_uva_fusionar, fn_uva_pallet_llave, rpc_uva_lote_nuevo;
--   alter table uva_ciclos drop column fusionado_en.

alter table public.uva_ciclos add column if not exists fusionado_en text;
create index if not exists uva_ciclos_pallet_idx on public.uva_ciclos (upper(regexp_replace(coalesce(pallet, ''), '\s+', '', 'g')), fecha)
  where origen = 'integra' and not eliminado;

create or replace function public.fn_uva_pallet_llave(p text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '');
$$;

/** ¿Gana el dato b (que llega) sobre a (guardado)? Por la hora en que se tomó cada uno (ta, tb). */
create or replace function public.fn_uva_gana(va text, ta text, vb text, tb text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when coalesce(ta, '') <> '' and coalesce(tb, '') <> '' then
      public.fn_uva_ts(tb) > public.fn_uva_ts(ta) or (public.fn_uva_ts(tb) = public.fn_uva_ts(ta) and coalesce(va, '') = '' and coalesce(vb, '') <> '')
    when coalesce(tb, '') <> '' then true
    when coalesce(ta, '') <> '' then false
    else coalesce(va, '') = '' and coalesce(vb, '') <> ''
  end;
$$;

/**
 * Combina dos paquetes de campo (a = guardado, b = el que llega) dato por dato.
 * Devuelve {registro, etapas}. Los minutos de cada etapa se recalculan; el resto de los
 * cálculos los vuelve a mandar el celular al adoptar el ciclo combinado.
 */
create or replace function public.fn_uva_fusionar(a_reg jsonb, a_et jsonb, b_reg jsonb, b_et jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  am jsonb := coalesce(a_reg->'marcas', '{}'::jsonb);
  bm jsonb := coalesce(b_reg->'marcas', '{}'::jsonb);
  reg jsonb := coalesce(b_reg, '{}'::jsonb);
  m jsonb := '{}'::jsonb;
  et jsonb := '[]'::jsonb;
  k text; ea jsonb; eb jsonb; e jsonb; idx text; mk text; i int; c text[];
  campos text[][] := array[['inicio', 'ini'], ['fin', 'fin'], ['comentario', 'com'], ['causa', 'causa']];
begin
  a_reg := coalesce(a_reg, '{}'::jsonb);
  foreach k in array array['fecha', 'zona', 'fundo', 'lote', 'sublote', 'pasada', 'color', 'variedad', 'grupo', 'pallet', 'jabas', 'zunchos',
    'palletsTot', 'palletsCarg', 'cargaTot', 'cargaCarg', 'placa', 'planta', 'observacion', 'estado'] loop
    -- Estado sin marcas: manda el que llega, salvo que borre un «Cerrado» (al final se ajusta a las etapas).
    if k = 'estado' and not (am ? k) and not (bm ? k) then
      reg := jsonb_set(reg, '{estado}', to_jsonb(case when a_reg->>'estado' = 'Cerrado' then 'Cerrado' else coalesce(b_reg->>'estado', a_reg->>'estado', '') end));
    elsif public.fn_uva_gana(a_reg->>k, am->>k, b_reg->>k, bm->>k) then
      reg := jsonb_set(reg, array[k], coalesce(b_reg->k, '""'::jsonb));
      if bm ? k then m := m || jsonb_build_object(k, bm->k); end if;
    else
      reg := jsonb_set(reg, array[k], coalesce(a_reg->k, '""'::jsonb));
      if am ? k then m := m || jsonb_build_object(k, am->k); end if;
    end if;
  end loop;
  if a_reg ? 'creado' then reg := jsonb_set(reg, '{creado}', a_reg->'creado'); end if;
  -- «Unido por N° de pallet» (sin datos iniciales) deja de serlo al juntarse con un ciclo que sí los tiene.
  if a_reg ? 'id' and not (coalesce(a_reg->>'union', '') = 'true' and coalesce(b_reg->>'union', '') = 'true') then reg := reg - 'union'; end if;

  for i in 1..8 loop
    select x.value into ea from jsonb_array_elements(coalesce(a_et, '[]'::jsonb)) x where (x.value->>'n')::int = i limit 1;
    select x.value into eb from jsonb_array_elements(coalesce(b_et, '[]'::jsonb)) x where (x.value->>'n')::int = i limit 1;
    if ea is null and eb is null then continue; end if;
    e := coalesce(eb, ea);
    idx := coalesce(eb->>'id', ea->>'id', i::text);
    foreach c slice 1 in array campos loop
      mk := idx || '.' || c[2];
      if public.fn_uva_gana(ea->>c[1], am->>mk, eb->>c[1], bm->>mk) then
        e := jsonb_set(e, array[c[1]], coalesce(eb->c[1], '""'::jsonb));
        if bm ? mk then m := m || jsonb_build_object(mk, bm->mk); end if;
        if c[1] = 'fin' then e := jsonb_set(e, '{editado}', coalesce(eb->'editado', '""'::jsonb)); end if;
      else
        e := jsonb_set(e, array[c[1]], coalesce(ea->c[1], '""'::jsonb));
        if am ? mk then m := m || jsonb_build_object(mk, am->mk); end if;
        if c[1] = 'fin' then e := jsonb_set(e, '{editado}', coalesce(ea->'editado', '""'::jsonb)); end if;
      end if;
    end loop;
    e := jsonb_set(e, '{minutos}', coalesce(to_jsonb(round(public.fn_uva_min(public.fn_uva_ts(e->>'inicio'), public.fn_uva_ts(e->>'fin')), 1)), '""'::jsonb));
    et := et || jsonb_build_array(e);
    ea := null; eb := null;
  end loop;
  if coalesce(reg->>'estado', '') <> 'Cerrado' then
    reg := jsonb_set(reg, '{estado}', to_jsonb(case when exists (select 1 from jsonb_array_elements(et) z where coalesce(z.value->>'inicio', '') <> '')
      then 'En proceso' else 'Sin iniciar' end));
  end if;
  reg := jsonb_set(reg, '{marcas}', m);
  return jsonb_build_object('registro', reg, 'etapas', et);
end;
$$;

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
  -- Un ciclo que ya se unió a otro: se redirige al que sobrevivió.
  while hay and x.fusionado_en is not null and n < 5 loop
    v_id := x.fusionado_en; n := n + 1;
    select * into x from public.uva_ciclos where id = v_id for update;
    hay := found;
  end loop;
  if hay then
    if x.origen <> p_origen then raise exception 'El registro % ya existe con otro origen (%). No se sobrescribe.', v_id, x.origen; end if;
    if p_origen = 'apk' and (x.registrador is distinct from v_reg or x.dispositivo is distinct from v_disp) then
      raise exception 'El registro % ya fue enviado por % (%). No se sobrescribe.', v_id, x.registrador, x.dispositivo;
    end if;
    if p_origen = 'integra' and coalesce(btrim(x.fundo), '') <> '' and not public.fn_uva_fundo_permitido(x.fundo) then
      raise exception 'El ciclo % es del fundo «%», que no tienes asignado. No se sobrescribe.', v_id, x.fundo;
    end if;
  end if;

  if p_origen = 'integra' then
    -- Unión por N° de pallet + fecha (±1 día) con otro ciclo de Integra.
    v_pal := public.fn_uva_pallet_llave(r->>'pallet');
    v_fecha := case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end;
    if v_pal is not null and v_fecha is not null then
      select * into y from public.uva_ciclos c
      where c.origen = 'integra' and not c.eliminado and c.fusionado_en is null and c.id <> v_id
        and public.fn_uva_pallet_llave(c.pallet) = v_pal and c.fecha between v_fecha - 1 and v_fecha + 1
        and (coalesce(btrim(c.fundo), '') = '' or public.fn_uva_fundo_permitido(c.fundo))
      order by abs(c.fecha - v_fecha), c.creado_en limit 1 for update;
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
    -- Integra: queda quien inició el ciclo (otros pueden continuarlo). APK: el mismo equipo.
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

/** Integra campo: devuelve el ID vigente (puede ser otro si se unió por pallet) y el ciclo combinado. */
create or replace function public.rpc_uva_guardar_campo(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; c public.uva_ciclos; v_fundo text := p_payload->'registro'->>'fundo';
begin
  perform public.fn_uva_exigir('campo.uva', 'Tiempo de ciclo Uva');
  if coalesce(p_payload->'registro'->>'id', '') !~ '^UV-IN-' then raise exception 'Los registros de Integra empiezan con UV-IN-.'; end if;
  if p_payload->>'accion' = 'eliminar' then
    return jsonb_build_object('ok', true, 'resultado', public.fn_uva_quitar_campo(p_payload->'registro'->>'id', 'integra'));
  end if;
  if coalesce(btrim(v_fundo), '') <> '' and not public.fn_uva_fundo_permitido(v_fundo) then
    raise exception 'No tienes asignado el fundo «%». Pide a un administrador que te lo asigne en Config › Usuarios › Fundos.', v_fundo;
  end if;
  v_id := public.fn_uva_aplicar_campo(p_payload, 'integra', auth.uid());
  select * into c from public.uva_ciclos where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'llegada', c.hora_llegada, 'llegada_por', c.llegada_por,
    'planta', coalesce(c.planta_destino, c.planta),
    'fila', to_jsonb(c) - 'planta_detalle' - 'planta_obs');
end;
$$;
revoke execute on function public.rpc_uva_guardar_campo(jsonb) from public, anon;
grant execute on function public.rpc_uva_guardar_campo(jsonb) to authenticated;

/** Lote digitado en el celular que no estaba en el catálogo: queda guardado para todos (fundo asignado). */
create or replace function public.rpc_uva_lote_nuevo(p_fundo text, p_lote text, p_variedad text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_zona text; v_fundo text; v_lote text := upper(regexp_replace(btrim(coalesce(p_lote, '')), '\s+', '', 'g'));
begin
  perform public.fn_uva_exigir('campo.uva', 'Tiempo de ciclo Uva');
  if v_lote !~ '^[A-Z0-9-]{1,12}$' then raise exception 'Lote no válido: %', p_lote; end if;
  select zona, fundo into v_zona, v_fundo from public.uva_catalogo
  where public.fn_txt_llave(fundo) = public.fn_txt_llave(p_fundo) limit 1;
  if v_fundo is null then raise exception 'El fundo «%» no está en el catálogo de Uva.', p_fundo; end if;
  if not public.fn_uva_fundo_permitido(v_fundo) then raise exception 'No tienes asignado el fundo «%».', v_fundo; end if;
  insert into public.uva_catalogo (zona, fundo, lote, variedad)
  values (v_zona, v_fundo, v_lote, upper(btrim(coalesce(p_variedad, ''))))
  on conflict (fundo, lote) do update set activo = true,
    variedad = case when uva_catalogo.variedad = '' then excluded.variedad else uva_catalogo.variedad end;
  return jsonb_build_array(v_zona, v_fundo, v_lote, upper(btrim(coalesce(p_variedad, ''))));
end;
$$;
revoke execute on function public.rpc_uva_lote_nuevo(text, text, text) from public, anon;
grant execute on function public.rpc_uva_lote_nuevo(text, text, text) to authenticated;

-- Lotes de Uva del mapa (lotes_uva.geojson): fundo · lote · primera variedad. Solo fundos que ya están
-- en el catálogo (toma su zona y su nombre con tildes); los existentes no se tocan.
insert into public.uva_catalogo (zona, fundo, lote, variedad)
select f.zona, f.fundo, g.lote, g.variedad
from (values
  ('CASA CHICA','HU14','TEST PLOT UVA'),
  ('CASA CHICA','HU20','AUTUMN CRISP'),
  ('CASA CHICA','HU21','AUTUMN CRISP'),
  ('CASA CHICA','HU22','AUTUMN CRISP'),
  ('CASA CHICA','HU23','AUTUMN CRISP'),
  ('CASA CHICA','HU24','AUTUMN CRISP'),
  ('CASA CHICA','HU25','AUTUMN CRISP'),
  ('CASA CHICA','HU26','AUTUMN CRISP'),
  ('CASA CHICA','HU27','AUTUMN CRISP'),
  ('CASA CHICA','HU28','AUTUMN CRISP'),
  ('CASA CHICA','HU29','AUTUMN CRISP'),
  ('CASA CHICA','HU30','AUTUMN CRISP'),
  ('CASA CHICA','HU31','AUTUMN CRISP'),
  ('CASA CHICA','HU32','AUTUMN CRISP'),
  ('CASA CHICA','HU33','AUTUMN CRISP'),
  ('CASA CHICA','HU34','AUTUMN CRISP'),
  ('CASA CHICA','HU35','AUTUMN CRISP'),
  ('CASA CHICA','HU36','AUTUMN CRISP'),
  ('CASA CHICA','HU37','AUTUMN CRISP'),
  ('CASA CHICA','HU38','AUTUMN CRISP'),
  ('CASA CHICA','HU39','AUTUMN CRISP'),
  ('CASA CHICA','HU40','AUTUMN CRISP'),
  ('CASA CHICA','HU41','AUTUMN CRISP'),
  ('CASA CHICA','HU42','AUTUMN CRISP'),
  ('CASA CHICA','HU43','AUTUMN CRISP'),
  ('CASA CHICA','HU44','AUTUMN CRISP'),
  ('CASA CHICA','HU45','AUTUMN CRISP'),
  ('CASA CHICA','HU46','AUTUMN CRISP'),
  ('DON CARLOS','CU10','SABLE'),
  ('DON CARLOS','CU11','TIMPSON'),
  ('DON CARLOS','CU12','AUTUMN CRISP'),
  ('DON CARLOS','CU13','AUTUMN CRISP'),
  ('DON CARLOS','CU14','TIMPSON'),
  ('DON CARLOS','CU15','TIMPSON'),
  ('DON CARLOS','CU16','SWEET CELEBRATION'),
  ('DON CARLOS','CU4','SWEET CELEBRATION'),
  ('DON CARLOS','CU7','AUTUMN CRISP'),
  ('DON CARLOS','CU8','AUTUMN CRISP'),
  ('DON CARLOS','CU9','SABLE'),
  ('EL ALTO','AU1','AUTUMN CRISP'),
  ('EL ALTO','AU10','MAGENTA'),
  ('EL ALTO','AU11','AUTUMN CRISP'),
  ('EL ALTO','AU2','AUTUMN CRISP'),
  ('EL ALTO','AU3','AUTUMN CRISP'),
  ('EL ALTO','AU4','ALLISON'),
  ('EL ALTO','AU5','AUTUMN CRISP'),
  ('EL ALTO','AU6','AUTUMN CRISP'),
  ('EL ALTO','AU7','ALLISON'),
  ('EL ALTO','AU8','CANDY SNAPS'),
  ('EL ALTO','AU9','MIDNIGHT BEAUTY'),
  ('EL TUNAL','TU1','SWEET CELEBRATION'),
  ('EL TUNAL','TU10','AUTUMN CRISP'),
  ('EL TUNAL','TU11','JACK''S SALUTE'),
  ('EL TUNAL','TU12','JACK''S SALUTE'),
  ('EL TUNAL','TU13','TIMCO'),
  ('EL TUNAL','TU14','SABLE'),
  ('EL TUNAL','TU15','SABLE'),
  ('EL TUNAL','TU16','ALLISON'),
  ('EL TUNAL','TU17','ALLISON'),
  ('EL TUNAL','TU18','AUTUMN CRISP'),
  ('EL TUNAL','TU19','AUTUMN CRISP'),
  ('EL TUNAL','TU2','SWEET CELEBRATION'),
  ('EL TUNAL','TU20','SWEET GLOBE'),
  ('EL TUNAL','TU21','SWEET GLOBE'),
  ('EL TUNAL','TU3','TIMCO'),
  ('EL TUNAL','TU4','TIMPSON'),
  ('EL TUNAL','TU5','TIMPSON'),
  ('EL TUNAL','TU6','JACK''S SALUTE'),
  ('EL TUNAL','TU7','JACK''S SALUTE'),
  ('EL TUNAL','TU8','TIMCO'),
  ('EL TUNAL','TU9','AUTUMN CRISP'),
  ('LA MAQUINA','MU1','AUTUMN CRISP'),
  ('LA MAQUINA','MU10','AUTUMN CRISP'),
  ('LA MAQUINA','MU11','AUTUMN CRISP'),
  ('LA MAQUINA','MU12','SWEET CELEBRATION'),
  ('LA MAQUINA','MU13','AUTUMN CRISP'),
  ('LA MAQUINA','MU14','AUTUMN CRISP'),
  ('LA MAQUINA','MU2','AUTUMN CRISP'),
  ('LA MAQUINA','MU3','SWEET CELEBRATION'),
  ('LA MAQUINA','MU4','SWEET CELEBRATION'),
  ('LA MAQUINA','MU5','SWEET CELEBRATION'),
  ('LA MAQUINA','MU6','SWEET CELEBRATION'),
  ('LA MAQUINA','MU7','SABLE'),
  ('LA MAQUINA','MU8','SABLE'),
  ('LA MAQUINA','MU9','AUTUMN CRISP'),
  ('LA PAUSA','PU1','AUTUMN CRISP'),
  ('LA PAUSA','PU10','AUTUMN CRISP'),
  ('LA PAUSA','PU11','AUTUMN CRISP'),
  ('LA PAUSA','PU12','AUTUMN CRISP'),
  ('LA PAUSA','PU2','AUTUMN CRISP'),
  ('LA PAUSA','PU3','AUTUMN CRISP'),
  ('LA PAUSA','PU4','AUTUMN CRISP'),
  ('LA PAUSA','PU5','AUTUMN CRISP'),
  ('LA PAUSA','PU6','AUTUMN CRISP'),
  ('LA PAUSA','PU7','AUTUMN CRISP'),
  ('LA PAUSA','PU8','AUTUMN CRISP'),
  ('LA PAUSA','PU9','AUTUMN CRISP'),
  ('LA QUEBRADA','QU1','SWEET GLOBE'),
  ('LA QUEBRADA','QU10','AUTUMN CRISP'),
  ('LA QUEBRADA','QU11','MIDNIGHT BEAUTY'),
  ('LA QUEBRADA','QU11A','MIDNIGHT BEAUTY'),
  ('LA QUEBRADA','QU11B','MIDNIGHT BEAUTY'),
  ('LA QUEBRADA','QU12','MIDNIGHT BEAUTY'),
  ('LA QUEBRADA','QU13','AUTUMN CRISP'),
  ('LA QUEBRADA','QU14','AUTUMN CRISP'),
  ('LA QUEBRADA','QU15','TIMPSON'),
  ('LA QUEBRADA','QU16','TIMPSON'),
  ('LA QUEBRADA','QU17','TIMPSON'),
  ('LA QUEBRADA','QU18','TIMPSON'),
  ('LA QUEBRADA','QU2','AUTUMN CRISP'),
  ('LA QUEBRADA','QU3','AUTUMN CRISP'),
  ('LA QUEBRADA','QU4','AUTUMN CRISP'),
  ('LA QUEBRADA','QU5','AUTUMN CRISP'),
  ('LA QUEBRADA','QU6','AUTUMN CRISP'),
  ('LA QUEBRADA','QU7','AUTUMN CRISP'),
  ('LA QUEBRADA','QU8','RUBY RUSH'),
  ('LA QUEBRADA','QU9','RUBY RUSH'),
  ('LA UNION','UU1','TIMCO'),
  ('LA UNION','UU10','TIMPSON'),
  ('LA UNION','UU11','COTTON CANDY'),
  ('LA UNION','UU12','SWEET GLOBE'),
  ('LA UNION','UU13','AUTUMN CRISP'),
  ('LA UNION','UU14','AUTUMN CRISP'),
  ('LA UNION','UU15','AUTUMN CRISP'),
  ('LA UNION','UU16','AUTUMN CRISP'),
  ('LA UNION','UU17','APPLAUSE'),
  ('LA UNION','UU18','AUTUMN CRISP'),
  ('LA UNION','UU19','AUTUMN CRISP'),
  ('LA UNION','UU2','COTTON CANDY'),
  ('LA UNION','UU20','COTTON CANDY'),
  ('LA UNION','UU3','SWEET GLOBE'),
  ('LA UNION','UU4','TIMPSON'),
  ('LA UNION','UU5','SWEET GLOBE'),
  ('LA UNION','UU6','SWEET GLOBE'),
  ('LA UNION','UU7','COTTON CANDY'),
  ('LA UNION','UU8','TIMPSON'),
  ('LA UNION','UU9','TIMPSON'),
  ('SANTA ROSA','R13AB','CARLITA'),
  ('SANTA ROSA','R13AC','KELLY'),
  ('SANTA ROSA','R13AD','JH-DR3112'),
  ('SANTA ROSA','R13AE','SUGRA 61'),
  ('SANTA ROSA','R13AG','BEBOP'),
  ('SANTA ROSA','R13AH','SUNNY POP (ARD39)'),
  ('SANTA ROSA','R13AI','SUGRA 63'),
  ('SANTA ROSA','R13C','SUGRA 48 (EARLY ADORA)'),
  ('SANTA ROSA','R13E','SUGRA 49 (EARLY MIDNIGHT BEAUTY)'),
  ('SANTA ROSA','R13F','GG506 (EX GG1205)'),
  ('SANTA ROSA','R13G','SUGRA 51'),
  ('SANTA ROSA','R13H','K2-NAVSEL 4'),
  ('SANTA ROSA','R13I','SUGRA 62'),
  ('SANTA ROSA','R13J','SUGRA 55'),
  ('SANTA ROSA','R13K','GG701 (EX GG60)'),
  ('SANTA ROSA','R13L','SUGRA 53'),
  ('SANTA ROSA','R13M','GG703 (EX GG560)'),
  ('SANTA ROSA','R13O','CANDY HEARTS'),
  ('SANTA ROSA','R13P','SUGRA 54'),
  ('SANTA ROSA','R13Q','SUGRA 56'),
  ('SANTA ROSA','R13W','SUGRA 57'),
  ('SANTA ROSA','R13X','SUGRA 60'),
  ('SANTA ROSA','R13Y','ARRA FIRE CRUNCH (ARD35)'),
  ('SANTA ROSA','R13Z','HONEY POP (ARRA 33)'),
  ('SANTA ROSA','RU1','MUSCAT BEAUTY'),
  ('SANTA ROSA','RU10','AUTUMN CRISP'),
  ('SANTA ROSA','RU11','AUTUMN CRISP'),
  ('SANTA ROSA','RU12','AUTUMN CRISP'),
  ('SANTA ROSA','RU13','MUSCAT BEAUTY'),
  ('SANTA ROSA','RU15','AUTUMN CRISP'),
  ('SANTA ROSA','RU16','AUTUMN CRISP'),
  ('SANTA ROSA','RU2','AUTUMN CRISP'),
  ('SANTA ROSA','RU6','MUSCAT BEAUTY'),
  ('SANTA ROSA','RU7','SWEET GLOBE'),
  ('SANTA ROSA','RU8','AUTUMN CRISP'),
  ('SANTA ROSA','RU9','AUTUMN CRISP'),
  ('VIVERO','CP1','ADORA'),
  ('VIVERO','CP5','ADORA'),
  ('VIVERO','CV1','ADORA'),
  ('VIVERO','CV13','ADORA'),
  ('VIVERO','CV2','ADORA'),
  ('VIVERO','CV3','ADORA'),
  ('VIVERO','CV4','ADORA'),
  ('VIVERO','CV5','ADORA'),
  ('VIVERO','CV6','ADORA'),
  ('VIVERO','CV7','ADORA'),
  ('VIVERO','CV8','ADORA'),
  ('VIVERO','CV9','ADORA'),
  ('VIVERO','PLAV10','FREEDOM'),
  ('VIVERO','PLAV4','FREEDOM'),
  ('VIVERO','PLAV5','FREEDOM'),
  ('VIVERO','PLAV6','FREEDOM'),
  ('VIVERO','PLAV7','FREEDOM'),
  ('VIVERO','PLAV8','FREEDOM'),
  ('VIVERO','PLAV9','FREEDOM'),
  ('VIVERO','PLCP1','SALTE CREEK'),
  ('VIVERO','PLCP3','SALTE CREEK'),
  ('VIVERO','PLCV11','SALTE CREEK'),
  ('VIVERO','PLV2','SALTE CREEK'),
  ('VIVERO','V11','SALTE CREEK'),
  ('VIVERO','V12','SALTE CREEK'),
  ('YANCAY','YU1','ALLISON'),
  ('YANCAY','YU10','MUSCAT BEAUTY'),
  ('YANCAY','YU11','AUTUMN CRISP'),
  ('YANCAY','YU12','MUSCAT BEAUTY'),
  ('YANCAY','YU13','RUBY RUSH'),
  ('YANCAY','YU14','TIMCO'),
  ('YANCAY','YU16','AUTUMN CRISP'),
  ('YANCAY','YU17','AUTUMN CRISP'),
  ('YANCAY','YU18','AUTUMN CRISP'),
  ('YANCAY','YU2','ALLISON'),
  ('YANCAY','YU3','AUTUMN CRISP'),
  ('YANCAY','YU4','AUTUMN CRISP'),
  ('YANCAY','YU5','AUTUMN CRISP'),
  ('YANCAY','YU6','AUTUMN CRISP'),
  ('YANCAY','YU7','CANDY SNAPS'),
  ('YANCAY','YU8','ALLISON'),
  ('YANCAY','YU9','ALLISON')
) as g(fundo, lote, variedad)
join (select distinct on (public.fn_txt_llave(fundo)) zona, fundo from public.uva_catalogo order by public.fn_txt_llave(fundo), fundo) f
  on public.fn_txt_llave(f.fundo) = public.fn_txt_llave(g.fundo)
on conflict (fundo, lote) do nothing;
