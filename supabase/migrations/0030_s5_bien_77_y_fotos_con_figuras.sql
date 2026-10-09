-- 0030: Auditoría 5S · escala BIEN desde 77 % y fotos con figuras desde el Excel de avance
--
--   · fn_s5_madurez: EXCELENTE ≥ 90 % · BIEN ≥ 77 % · REGULAR ≥ 65 % · resto CRÍTICO.
--   · rpc_s5_obs_actualizar acepta reemplazar_antes / reemplazar_despues: [{ de, a }].
--     Si en el Excel se dibujan figuras (flechas, círculos, textos) sobre una foto que
--     la app ya tiene, se sube la foto con las figuras y reemplaza a la original en su
--     mismo lugar (no se suma como foto aparte).

create or replace function public.fn_s5_madurez(p numeric)
returns text language sql immutable set search_path = public as $$
  select case when p is null then null
              when p >= 0.90 then 'EXCELENTE'
              when p >= 0.77 then 'BIEN'
              when p >= 0.65 then 'REGULAR'
              else 'CRÍTICO' end;
$$;

create or replace function public.rpc_s5_obs_actualizar(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias;
  v_antes text[]; v_despues text[]; v_desc text; v_accion text; v_estado text; v_cierre date;
  v_notas text[]; v_detalle text[] := '{}'; v_origen text; v_textos boolean; v_n integer; v_anterior text;
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
  select coalesce(array_agg(btrim(t)), '{}') into v_notas
    from jsonb_array_elements_text(case when jsonb_typeof(p->'notas') = 'array' then p->'notas' else '[]'::jsonb end) t
   where btrim(t) <> '';

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

  if cardinality(v_detalle) = 0 and (v_estado is null or v_estado = o.estado) and cardinality(v_notas) = 0 then
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
      when coalesce(v_estado, estado) = 'Pendiente' then null
      else fecha_cierre end,
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = o.id
  returning * into o;

  -- Historial: un seguimiento con el cambio de estado y las fotos (sin nota, para que el Excel no
  -- sume texto a la acción correctiva) y uno por cada nota nueva, igual que « // » en el Excel.
  if v_anterior <> o.estado or cardinality(v_antes) + cardinality(v_despues) + v_nr > 0 or cardinality(v_notas) = 0 then
    insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, usuario_id, usuario_nombre)
      values (o.id, v_anterior, o.estado, null, (v_despues || v_antes || v_reemp)[1], v_despues || v_antes || v_reemp, auth.uid(), public.fn_s5_mi_nombre());
  end if;
  for v_n in 1 .. cardinality(v_notas) loop
    insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, usuario_id, usuario_nombre)
      values (o.id, o.estado, o.estado, v_notas[v_n], auth.uid(), public.fn_s5_mi_nombre());
  end loop;

  if v_anterior <> o.estado then v_detalle := v_detalle || (v_anterior || ' → ' || o.estado); end if;
  if cardinality(v_notas) > 0 then v_detalle := v_detalle || (cardinality(v_notas) || ' nota(s)'); end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación actualizada · ' || v_origen,
            coalesce(a.codigo || ' · ', '') || 'obs N° ' || o.numero || ' · zona ' || o.zona_id || ' · ' || array_to_string(v_detalle, ', '));
  return o;
end;
$$;
revoke all on function public.rpc_s5_obs_actualizar(jsonb) from public, anon;
grant execute on function public.rpc_s5_obs_actualizar(jsonb) to authenticated;
