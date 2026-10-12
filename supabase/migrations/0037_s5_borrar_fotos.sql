-- 0037: Auditoría 5S · borrar fotos «Antes» / «Después» de una observación
--
--   · fn_s5_obs_normalizar: al vaciar fotos_antes / fotos_despues ya no se repone la foto
--     principal anterior (solo se usa como respaldo al insertar o si cambia foto_antes).
--   · rpc_s5_obs_quitar_foto: borra una foto (Antes o Después) desde el detalle o el panel
--     de fotos, sin plazo (queda en bitácora). El archivo se conserva en Storage.
--   · rpc_s5_guardar_observacion (editar): la lista de fotos «Antes» que manda la app manda,
--     aunque quede vacía.
--   · fotos_quitadas: rutas borradas. El Excel de avance las reconoce y no las vuelve a subir.

alter table public.s5_observaciones add column if not exists fotos_quitadas text[] not null default '{}';

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
  return new;
end;
$$;

create or replace function public.rpc_s5_obs_quitar_foto(p_observacion uuid, p_ruta text)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare o public.s5_observaciones; a public.s5_auditorias; v_tipo text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into o from public.s5_observaciones where id = p_observacion for update;
  if o.id is null then raise exception 'No existe la observación.'; end if;
  if o.auditoria_id is not null then
    select * into a from public.s5_auditorias where id = o.auditoria_id;
    if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  end if;
  if coalesce(btrim(p_ruta), '') = '' then raise exception 'Falta la foto a borrar.'; end if;
  if p_ruta = any (o.fotos_antes) then v_tipo := 'Antes';
  elsif p_ruta = any (o.fotos_despues) then v_tipo := 'Después';
  else return o; -- ya se borró (otro equipo o doble toque)
  end if;

  update public.s5_observaciones set
    fotos_antes = array_remove(fotos_antes, p_ruta),
    fotos_despues = array_remove(fotos_despues, p_ruta),
    fotos_quitadas = case when p_ruta = any (fotos_quitadas) then fotos_quitadas else fotos_quitadas || p_ruta end,
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = o.id returning * into o;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Foto de observación eliminada',
            coalesce(a.codigo || ' · ', '') || 'obs N° ' || o.numero || ' · zona ' || o.zona_id || ' · «' || v_tipo || '» · ' || p_ruta);
  return o;
end;
$$;
revoke all on function public.rpc_s5_obs_quitar_foto(uuid, text) from public, anon;
grant execute on function public.rpc_s5_obs_quitar_foto(uuid, text) to authenticated;

-- Igual que 0026; al editar, fotos_antes (si viene) reemplaza la lista aunque quede vacía.
create or replace function public.rpc_s5_guardar_observacion(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_sref smallint; v_fecha date;
  v_antes text[]; v_despues text[]; v_quitadas text[];
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  v_id := (p->>'id')::uuid;
  if coalesce(btrim(p->>'descripcion'), '') = '' then raise exception 'Describe la observación.'; end if;
  v_sref := case when coalesce(p->>'s_referencia', '') ~ '^[1-5]$' then (p->>'s_referencia')::smallint end;
  v_antes := public.fn_s5_fotos(p->'fotos_antes', p->>'foto_antes', 6);
  v_despues := public.fn_s5_fotos(p->'fotos_despues', p->>'foto_despues', 6);

  if coalesce(p->>'auditoria_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select * into a from public.s5_auditorias where id = (p->>'auditoria_id')::uuid;
    if a.id is null or a.estado = 'anulada' then raise exception 'La auditoría no existe o está anulada.'; end if;
  end if;

  select * into o from public.s5_observaciones where id = v_id for update;
  if o.id is not null then
    if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
      raise exception 'La observación N° % ya no se puede editar (plazo vencido). Registra un seguimiento.', o.numero;
    end if;
    if a.id is not null and o.auditoria_id is not null and a.id <> o.auditoria_id then
      raise exception 'La observación N° % ya pertenece a otra auditoría.', o.numero;
    end if;
    if coalesce(jsonb_typeof(p->'fotos_antes'), '') <> 'array' and cardinality(v_antes) = 0 then v_antes := o.fotos_antes; end if;
    if coalesce(jsonb_typeof(p->'fotos_despues'), '') <> 'array' and cardinality(v_despues) = 0 then v_despues := o.fotos_despues; end if;
    select coalesce(array_agg(f), '{}') into v_quitadas
      from unnest(o.fotos_antes || o.fotos_despues) f
     where not (f = any (v_antes || v_despues)) and not (f = any (o.fotos_quitadas));
    update public.s5_observaciones set
      descripcion = btrim(p->>'descripcion'),
      accion_correctiva = nullif(btrim(p->>'accion_correctiva'), ''),
      s_referencia = v_sref,
      auditoria_id = coalesce(auditoria_id, a.id),
      fotos_antes = v_antes,
      fotos_despues = v_despues,
      fotos_quitadas = fotos_quitadas || v_quitadas,
      actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id returning * into o;
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AUDITORIA_5S', 'Observación editada', 'N° ' || o.numero || ' · zona ' || o.zona_id ||
              case when cardinality(v_quitadas) > 0 then ' · ' || cardinality(v_quitadas) || ' foto(s) eliminada(s)' else '' end);
    return o;
  end if;

  select * into z from public.s5_zonas where id = case when coalesce(p->>'zona_id', '') ~ '^[0-9]+$' then (p->>'zona_id')::integer end;
  if z.id is null then raise exception 'Elige la zona de la observación.'; end if;
  if not z.activo then raise exception 'La zona % está desactivada.', z.nombre; end if;
  if a.id is not null and (z.area_id <> a.area_id or z.cultivo_id <> a.cultivo_id) then
    raise exception 'La zona no pertenece al área y cultivo de esta auditoría.';
  end if;
  if cardinality(v_antes) = 0 then raise exception 'Toma la foto «Antes» de la observación.'; end if;
  v_estado := coalesce(nullif(p->>'estado', ''), 'Pendiente');
  if v_estado not in ('Pendiente', 'Recomendación') then
    raise exception 'Una observación nueva empieza como Pendiente o Recomendación.';
  end if;
  v_fecha := coalesce(a.fecha, public.fn_hoy_lima());

  perform pg_advisory_xact_lock(hashtext('s5_observaciones_zona'), z.id);
  select coalesce(max(o2.numero), 0) + 1 into v_num
  from public.s5_observaciones o2
  left join public.s5_auditorias a2 on a2.id = o2.auditoria_id
  where o2.zona_id = z.id and coalesce(a2.estado, 'suelta') <> 'anulada';

  insert into public.s5_observaciones (id, auditoria_id, zona_id, numero, fecha_registro, semana, s_referencia,
    descripcion, accion_correctiva, estado, fotos_antes, fotos_despues, auditor, creado_por, actualizado_por)
  values (v_id, a.id, z.id, v_num, v_fecha, public.weeknum_excel_sistema1(v_fecha), v_sref,
    btrim(p->>'descripcion'), nullif(btrim(p->>'accion_correctiva'), ''), v_estado, v_antes, v_despues,
    public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, usuario_id, usuario_nombre)
    values (o.id, null, o.estado, 'Registro inicial', o.foto_antes, o.fotos_antes, auth.uid(), o.auditor);
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación registrada',
            coalesce(a.codigo || ' · ', '') || z.numero || '. ' || z.nombre || ' · N° ' || v_num);
  return o;
end;
$$;
grant execute on function public.rpc_s5_guardar_observacion(jsonb) to authenticated;
