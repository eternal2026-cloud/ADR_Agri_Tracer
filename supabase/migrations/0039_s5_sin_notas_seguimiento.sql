-- 0039: Auditoría 5S · sin notas de seguimiento
--
-- La observación solo lleva Observación y Acción correctiva. Las notas de seguimiento se sumaban a
-- la acción con « // » en la tabla, el Excel y Sheets, y causaban confusión y reproceso.
--   · Las notas existentes se borran (copia en s5_notas_respaldo). Se conservan «Registro inicial»
--     y el motivo de las correcciones de puntaje (sustento obligatorio de la corrección).
--   · rpc_s5_seguimiento: la nota solo se guarda si el seguimiento corrige puntajes.
--   · rpc_s5_obs_actualizar / rpc_s5_importar_obs_pasada: ya no crean notas (la celda «Acción
--     correctiva» del Excel entra completa como acción). rpc_s5_obs_actualizar además borra la
--     fecha de cierre al reabrir, igual que rpc_s5_seguimiento (0038).
--   · Se retira rpc_s5_editar_nota_seguimiento (0038).

create table if not exists public.s5_notas_respaldo (
  seguimiento_id bigint primary key, observacion_id uuid not null, nota text not null,
  fecha timestamptz, respaldado_en timestamptz not null default now()
);
alter table public.s5_notas_respaldo enable row level security;

insert into public.s5_notas_respaldo (seguimiento_id, observacion_id, nota, fecha)
select id, observacion_id, nota, fecha from public.s5_seguimientos
 where nota is not null and not (nota = 'Registro inicial' and estado_anterior is null)
   and coalesce(jsonb_array_length(cambios_puntaje), 0) = 0
on conflict (seguimiento_id) do nothing;

update public.s5_seguimientos set nota = null
 where id in (select seguimiento_id from public.s5_notas_respaldo);

drop function if exists public.rpc_s5_editar_nota_seguimiento(bigint, text);

-- ---------------------------------------------------------------- rpc_s5_seguimiento
create or replace function public.rpc_s5_seguimiento(p_observacion uuid, p_estado text, p_nota text DEFAULT NULL::text, p_foto text DEFAULT NULL::text, p_cambios jsonb DEFAULT '[]'::jsonb, p_fotos jsonb DEFAULT '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; e public.s5_evaluaciones; it public.s5_items; z public.s5_zonas;
  x jsonb; v_estado text; v_anterior text; v_actual numeric; v_nuevo numeric; v_limite date; v_ref text;
  v_cambios jsonb := '[]'::jsonb; v_lista jsonb := coalesce(p_cambios, '[]'::jsonb); v_nota text := nullif(btrim(p_nota), '');
  v_nuevas text[]; v_despues text[]; v_n integer;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into o from public.s5_observaciones where id = p_observacion for update;
  if o.id is null then raise exception 'No existe la observación.'; end if;
  select * into z from public.s5_zonas where id = o.zona_id;
  if o.auditoria_id is not null then
    select * into a from public.s5_auditorias where id = o.auditoria_id;
    if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  end if;
  v_ref := coalesce(a.codigo, z.numero || '. ' || z.nombre);

  v_anterior := o.estado;
  v_estado := coalesce(nullif(p_estado, ''), o.estado);
  if v_estado not in ('Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación') then
    raise exception 'Estado inválido: %.', v_estado;
  end if;
  if jsonb_typeof(v_lista) <> 'array' then raise exception 'Se esperaba la lista de cambios de puntaje.'; end if;
  -- Sin notas de seguimiento: solo el motivo de una corrección de puntaje.
  if jsonb_array_length(v_lista) = 0 then v_nota := null; end if;
  v_nuevas := public.fn_s5_fotos(p_fotos, p_foto, 6);

  if jsonb_array_length(v_lista) > 0 then
    v_limite := o.fecha_registro + public.fn_s5_dias_correccion();
    if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > v_limite then
      raise exception 'El plazo para corregir puntajes de la obs. N° % venció el % (% días desde el registro). Pide a un administrador que lo corrija.',
        o.numero, to_char(v_limite, 'DD/MM/YYYY'), public.fn_s5_dias_correccion();
    end if;
    select * into e from public.fn_s5_evaluacion_de_obs(o.id);
    if e.id is null then raise exception 'Esta zona aún no tiene puntajes en una auditoría (%).', v_ref; end if;

    for x in select value from jsonb_array_elements(v_lista) loop
      if coalesce(x->>'item_id', '') !~ '^[0-9]+$' or coalesce(x->>'puntaje', '') !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'Cambio de puntaje inválido: %.', x;
      end if;
      v_nuevo := (x->>'puntaje')::numeric;
      if v_nuevo not in (0, 0.5, 1, 1.5, 2) then raise exception 'Puntaje inválido: %.', v_nuevo; end if;
      select * into it from public.s5_items where id = (x->>'item_id')::integer;
      if it.id is null then raise exception 'Ítem inexistente: %.', x->>'item_id'; end if;
      select puntaje into v_actual from public.s5_puntajes where evaluacion_id = e.id and item_id = it.id for update;
      if not found then raise exception 'El ítem %S-% no fue puntuado en esa auditoría.', it.s, it.numero; end if;
      if v_actual <> v_nuevo then
        update public.s5_puntajes set
          puntaje = v_nuevo, corregido_por = auth.uid(), corregido_en = now(), observacion_id = o.id,
          motivo_correccion = left('Obs. N° ' || o.numero || coalesce(': ' || v_nota, ''), 500),
          actualizado_por = auth.uid(), actualizado_en = now()
        where evaluacion_id = e.id and item_id = it.id;
        v_cambios := v_cambios || jsonb_build_object('item_id', it.id, 's', it.s, 'numero', it.numero, 'antes', v_actual, 'despues', v_nuevo);
      end if;
    end loop;
  end if;

  if v_estado = v_anterior and cardinality(v_nuevas) = 0 and jsonb_array_length(v_cambios) = 0 then
    raise exception 'No hay cambios que registrar.';
  end if;

  v_despues := o.fotos_despues || v_nuevas;
  v_n := coalesce(array_length(v_despues, 1), 0);
  if v_n > 6 then v_despues := v_despues[v_n - 5 : v_n]; end if;

  update public.s5_observaciones set
    estado = v_estado,
    fecha_cierre = case when v_estado = 'Cerrado' then coalesce(fecha_cierre, public.fn_hoy_lima())
                        when v_estado = 'Cancelado' then fecha_cierre else null end,
    fotos_despues = v_despues,
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = o.id returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, cambios_puntaje, usuario_id, usuario_nombre)
    values (o.id, v_anterior, v_estado, v_nota, v_nuevas[1], v_nuevas, v_cambios, auth.uid(), public.fn_s5_mi_nombre());
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Seguimiento', v_ref || ' · obs N° ' || o.numero || ' · ' || v_anterior || ' → ' || v_estado ||
            case when jsonb_array_length(v_cambios) > 0 then ' · ' || jsonb_array_length(v_cambios) || ' puntaje(s) corregido(s)' else '' end);

  return jsonb_build_object('observacion', to_jsonb(o), 'cambios', v_cambios,
    'evaluacion', case when e.id is not null then public.fn_s5_estado_evaluacion(e.id) end);
end;
$$;

-- ---------------------------------------------------------------- rpc_s5_obs_actualizar
create or replace function public.rpc_s5_obs_actualizar(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias;
  v_antes text[]; v_despues text[]; v_desc text; v_accion text; v_estado text; v_cierre date;
  v_detalle text[] := '{}'; v_origen text; v_textos boolean; v_anterior text;
  v_r jsonb; v_de text; v_a text; v_fa text[]; v_fd text[]; v_reemp text[] := '{}'; v_nr integer := 0;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  select * into o from public.s5_observaciones where id = (p->>'id')::uuid for update;
  if o.id is null then raise exception 'No existe la observación.'; end if;
  if o.auditoria_id is not null then
    select * into a from public.s5_auditorias where id = o.auditoria_id;
    if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  end if;
  v_origen := case when p->>'origen' = 'excel' then 'Excel de avance' else 'Panel de fotos' end;

  v_antes := public.fn_s5_fotos(p->'fotos_antes', null, 6);
  v_despues := public.fn_s5_fotos(p->'fotos_despues', null, 6);
  v_desc := nullif(btrim(p->>'descripcion'), '');
  v_accion := case when p ? 'accion_correctiva' then coalesce(btrim(p->>'accion_correctiva'), '') end;
  v_estado := nullif(btrim(p->>'estado'), '');
  if v_estado is not null and v_estado not in ('Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación') then
    raise exception 'Estado inválido en la obs. N° %: %.', o.numero, v_estado;
  end if;

  v_textos := (v_desc is not null and v_desc <> o.descripcion)
           or (v_accion is not null and v_accion is distinct from coalesce(o.accion_correctiva, ''));
  if v_textos and public.rol_actual() is distinct from 'admin'
     and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
    raise exception 'La obs. N° % ya no admite cambios de texto (plazo vencido). Pide a un administrador que lo haga.', o.numero;
  end if;

  if cardinality(v_antes) > 0 then
    select coalesce(array_agg(f), '{}') into v_antes from unnest(v_antes) f where not (f = any (o.fotos_antes));
    if coalesce(array_length(o.fotos_antes, 1), 0) + cardinality(v_antes) > 6 then
      raise exception 'La obs. N° % ya tiene % foto(s) «Antes»: el máximo es 6.', o.numero, coalesce(array_length(o.fotos_antes, 1), 0);
    end if;
    if cardinality(v_antes) > 0 then v_detalle := v_detalle || (cardinality(v_antes) || ' foto(s) «Antes»'); end if;
  end if;
  if cardinality(v_despues) > 0 then
    select coalesce(array_agg(f), '{}') into v_despues from unnest(v_despues) f where not (f = any (o.fotos_despues));
    if coalesce(array_length(o.fotos_despues, 1), 0) + cardinality(v_despues) > 6 then
      raise exception 'La obs. N° % ya tiene % foto(s) «Después»: el máximo es 6.', o.numero, coalesce(array_length(o.fotos_despues, 1), 0);
    end if;
    if cardinality(v_despues) > 0 then v_detalle := v_detalle || (cardinality(v_despues) || ' foto(s) «Después»'); end if;
  end if;
  -- Reemplazos: la misma foto, ahora con figuras dibujadas en el Excel. Ocupa el lugar de la original.
  v_fa := o.fotos_antes;
  v_fd := o.fotos_despues;
  for v_r in select value from jsonb_array_elements(case when jsonb_typeof(p->'reemplazar_antes') = 'array' then p->'reemplazar_antes' else '[]'::jsonb end) loop
    v_de := btrim(coalesce(v_r->>'de', '')); v_a := btrim(coalesce(v_r->>'a', ''));
    if v_de <> '' and v_a <> '' and v_de = any (v_fa) and not (v_a = any (v_fa)) then
      v_fa := array_replace(v_fa, v_de, v_a); v_reemp := v_reemp || v_a; v_nr := v_nr + 1;
    end if;
  end loop;
  for v_r in select value from jsonb_array_elements(case when jsonb_typeof(p->'reemplazar_despues') = 'array' then p->'reemplazar_despues' else '[]'::jsonb end) loop
    v_de := btrim(coalesce(v_r->>'de', '')); v_a := btrim(coalesce(v_r->>'a', ''));
    if v_de <> '' and v_a <> '' and v_de = any (v_fd) and not (v_a = any (v_fd)) then
      v_fd := array_replace(v_fd, v_de, v_a); v_reemp := v_reemp || v_a; v_nr := v_nr + 1;
    end if;
  end loop;
  if v_nr > 0 then v_detalle := v_detalle || (v_nr || ' foto(s) con figuras'); end if;

  if v_desc is not null and v_desc <> o.descripcion then v_detalle := v_detalle || 'observación'::text; end if;
  if v_accion is not null and v_accion is distinct from coalesce(o.accion_correctiva, '') then v_detalle := v_detalle || 'acción correctiva'::text; end if;

  if p ? 'fecha_cierre' then
    v_cierre := case when coalesce(p->>'fecha_cierre', '') ~ '^\d{4}-\d{2}-\d{2}' then (p->>'fecha_cierre')::date end;
    if v_cierre is distinct from o.fecha_cierre then v_detalle := v_detalle || 'fecha de cierre'::text; end if;
  end if;

  if cardinality(v_detalle) = 0 and (v_estado is null or v_estado = o.estado) then
    return o;
  end if;

  v_anterior := o.estado;
  update public.s5_observaciones set
    descripcion = coalesce(v_desc, descripcion),
    accion_correctiva = case when v_accion is null then accion_correctiva else nullif(v_accion, '') end,
    fotos_antes = v_fa || v_antes,
    fotos_despues = v_fd || v_despues,
    estado = coalesce(v_estado, estado),
    fecha_cierre = case
      when p ? 'fecha_cierre' then v_cierre
      when coalesce(v_estado, estado) = 'Cerrado' then coalesce(fecha_cierre, public.fn_hoy_lima())
      when coalesce(v_estado, estado) = 'Cancelado' then fecha_cierre
      else null end,
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = o.id
  returning * into o;

  -- Historial: un seguimiento con el cambio de estado y las fotos (sin nota).
  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, usuario_id, usuario_nombre)
    values (o.id, v_anterior, o.estado, null, (v_despues || v_antes || v_reemp)[1], v_despues || v_antes || v_reemp, auth.uid(), public.fn_s5_mi_nombre());

  if v_anterior <> o.estado then v_detalle := v_detalle || (v_anterior || ' → ' || o.estado); end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación actualizada · ' || v_origen,
            coalesce(a.codigo || ' · ', '') || 'obs N° ' || o.numero || ' · zona ' || o.zona_id || ' · ' || array_to_string(v_detalle, ', '));
  return o;
end;
$$;

-- ---------------------------------------------------------------- rpc_s5_importar_obs_pasada
create or replace function public.rpc_s5_importar_obs_pasada(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_fecha date; v_cierre date; v_desc text; v_dup integer;
  v_antes text[]; v_despues text[];
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  v_id := (p->>'id')::uuid;
  if exists (select 1 from public.s5_observaciones where id = v_id) then raise exception 'La observación ya fue registrada.'; end if;
  v_desc := btrim(coalesce(p->>'descripcion', ''));
  if v_desc = '' then raise exception 'Falta el texto de la observación.'; end if;

  select * into z from public.s5_zonas where id = case when coalesce(p->>'zona_id', '') ~ '^[0-9]+$' then (p->>'zona_id')::integer end;
  if z.id is null then raise exception 'La zona no existe.'; end if;
  if not z.activo then raise exception 'La zona % está desactivada.', z.nombre; end if;

  if coalesce(p->>'fecha_registro', '') !~ '^\d{4}-\d{2}-\d{2}' then raise exception 'Falta la fecha de registro.'; end if;
  v_fecha := (p->>'fecha_registro')::date;
  if v_fecha > public.fn_hoy_lima() then raise exception 'La fecha de registro % está en el futuro.', to_char(v_fecha, 'DD/MM/YYYY'); end if;

  v_estado := coalesce(nullif(btrim(p->>'estado'), ''), 'Pendiente');
  if v_estado not in ('Pendiente', 'En ejecución', 'Cerrado', 'Cancelado', 'Stand By', 'Recomendación') then
    raise exception 'Estado inválido: %.', v_estado;
  end if;
  v_cierre := case when coalesce(p->>'fecha_cierre', '') ~ '^\d{4}-\d{2}-\d{2}' then (p->>'fecha_cierre')::date end;
  if v_estado = 'Pendiente' then v_cierre := null; end if;
  v_antes := public.fn_s5_fotos(p->'fotos_antes', null, 6);
  v_despues := public.fn_s5_fotos(p->'fotos_despues', null, 6);

  perform pg_advisory_xact_lock(hashtext('s5_observaciones_zona'), z.id);
  select o2.numero into v_dup
  from public.s5_observaciones o2
  left join public.s5_auditorias a2 on a2.id = o2.auditoria_id
  where o2.zona_id = z.id and coalesce(a2.estado, 'suelta') <> 'anulada'
    and lower(regexp_replace(o2.descripcion, '\s+', ' ', 'g')) = lower(regexp_replace(v_desc, '\s+', ' ', 'g'))
  limit 1;
  if v_dup is not null then raise exception 'La zona % ya tiene esta observación (N° %).', z.nombre, v_dup; end if;

  v_num := case when coalesce(p->>'numero', '') ~ '^[0-9]+$' and (p->>'numero')::integer > 0 then (p->>'numero')::integer end;
  if v_num is null or exists (
    select 1 from public.s5_observaciones o2 left join public.s5_auditorias a2 on a2.id = o2.auditoria_id
    where o2.zona_id = z.id and o2.numero = v_num and coalesce(a2.estado, 'suelta') <> 'anulada'
  ) then
    select coalesce(max(o2.numero), 0) + 1 into v_num
    from public.s5_observaciones o2
    left join public.s5_auditorias a2 on a2.id = o2.auditoria_id
    where o2.zona_id = z.id and coalesce(a2.estado, 'suelta') <> 'anulada';
  end if;

  insert into public.s5_observaciones (id, auditoria_id, zona_id, numero, fecha_registro, semana, descripcion, accion_correctiva,
    estado, fecha_cierre, fotos_antes, fotos_despues, importada, auditor, creado_por, actualizado_por)
  values (v_id, null, z.id, v_num, v_fecha, public.weeknum_excel_sistema1(v_fecha), v_desc, nullif(btrim(p->>'accion_correctiva'), ''),
    v_estado, v_cierre, v_antes, v_despues, true, public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, usuario_id, usuario_nombre)
    values (o.id, null, o.estado, 'Registro inicial', o.foto_antes, o.fotos_antes, auth.uid(), o.auditor);

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación de auditoría pasada',
            z.numero || '. ' || z.nombre || ' · N° ' || v_num || ' · ' || to_char(v_fecha, 'DD/MM/YYYY') || ' · ' || v_estado);
  return o;
end;
$$;

-- ---------------------------------------------------------------- fecha de cierre: regla única
-- Solo Cerrado y Cancelado llevan fecha de cierre, venga el cambio de donde venga (app, Excel de
-- avance, auditorías pasadas).
create or replace function public.fn_s5_obs_normalizar()
returns trigger language plpgsql security definer set search_path = public as $$
declare z public.s5_zonas;
begin
  select * into z from public.s5_zonas where id = new.zona_id;
  if z.id is null then raise exception 'La zona de la observación no existe.'; end if;
  new.area_id := z.area_id;
  new.cultivo_id := z.cultivo_id;

  if coalesce(array_length(new.fotos_antes, 1), 0) = 0 and coalesce(new.foto_antes, '') <> ''
     and (tg_op = 'INSERT' or new.foto_antes is distinct from old.foto_antes) then
    new.fotos_antes := array[new.foto_antes];
  end if;
  new.foto_antes := new.fotos_antes[1];

  if coalesce(array_length(new.fotos_despues, 1), 0) = 0 and coalesce(new.foto_despues, '') <> ''
     and (tg_op = 'INSERT' or new.foto_despues is distinct from old.foto_despues) then
    new.fotos_despues := array[new.foto_despues];
  end if;
  new.foto_despues := new.fotos_despues[1];

  if new.estado not in ('Cerrado', 'Cancelado') then new.fecha_cierre := null; end if;
  return new;
end;
$$;

update public.s5_observaciones set fecha_cierre = null
 where fecha_cierre is not null and estado not in ('Cerrado', 'Cancelado');
