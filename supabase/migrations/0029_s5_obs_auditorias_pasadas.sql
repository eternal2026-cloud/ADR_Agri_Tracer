-- 0029: Auditoría 5S · observaciones de auditorías pasadas (Excel manual)
--
--   · Desde el panel lateral del checklist se sube el Excel de Observaciones de
--     una auditoría que se hizo a mano antes de usar Integra. Sus observaciones
--     (por defecto solo las abiertas) se registran sin auditoría, con la fecha
--     de registro, el N° y el estado del Excel, para darles seguimiento.
--   · s5_observaciones.importada: el Excel manual no siempre trae la foto
--     «Antes»; una observación importada puede quedar sin fotos.

alter table public.s5_observaciones add column if not exists importada boolean not null default false;
alter table public.s5_observaciones alter column foto_antes drop not null;
alter table public.s5_observaciones drop constraint if exists s5_observaciones_fotos_antes_chk;
alter table public.s5_observaciones add constraint s5_observaciones_fotos_antes_chk
  check (cardinality(fotos_antes) <= 6 and (importada or cardinality(fotos_antes) >= 1));

/** p: { id, zona_id, numero?, fecha_registro, descripcion, accion_correctiva?, estado?, fecha_cierre?,
 *       fotos_antes?, fotos_despues?, notas? } → la observación registrada. */
create or replace function public.rpc_s5_importar_obs_pasada(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_fecha date; v_cierre date; v_desc text; v_dup integer;
  v_antes text[]; v_despues text[]; v_nota text;
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
  -- La misma observación ya está en la zona (mismo texto, sin contar espacios ni mayúsculas).
  select o2.numero into v_dup
  from public.s5_observaciones o2
  left join public.s5_auditorias a2 on a2.id = o2.auditoria_id
  where o2.zona_id = z.id and coalesce(a2.estado, 'suelta') <> 'anulada'
    and lower(regexp_replace(o2.descripcion, '\s+', ' ', 'g')) = lower(regexp_replace(v_desc, '\s+', ' ', 'g'))
  limit 1;
  if v_dup is not null then raise exception 'La zona % ya tiene esta observación (N° %).', z.nombre, v_dup; end if;

  -- Se conserva el N° del Excel si está libre en la zona; si no, el siguiente.
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
  -- Las notas « // » del Excel quedan como seguimientos (sin cambio de estado).
  for v_nota in
    select btrim(t) from jsonb_array_elements_text(case when jsonb_typeof(p->'notas') = 'array' then p->'notas' else '[]'::jsonb end) t
    where btrim(t) <> ''
  loop
    insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, usuario_id, usuario_nombre)
      values (o.id, o.estado, o.estado, left(v_nota, 2000), auth.uid(), o.auditor);
  end loop;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación de auditoría pasada',
            z.numero || '. ' || z.nombre || ' · N° ' || v_num || ' · ' || to_char(v_fecha, 'DD/MM/YYYY') || ' · ' || v_estado);
  return o;
end;
$$;

revoke all on function public.rpc_s5_importar_obs_pasada(jsonb) from public, anon;
grant execute on function public.rpc_s5_importar_obs_pasada(jsonb) to authenticated;
