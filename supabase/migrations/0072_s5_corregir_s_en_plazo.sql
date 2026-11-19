-- 0072 · Auditoría 5S: «Corregir una S» libre dentro del plazo de corrección.
-- Antes: solo con la auditoría en curso y, si la zona ya estaba completa, solo el mismo día.
-- Ahora: un auditor (captura) puede sobrescribir los puntajes de una S directamente —sin
-- observación ni sustento— hasta fecha de la auditoría + S5_DIAS_CORRECCION (3 por defecto),
-- aunque la auditoría ya esté cerrada. El administrador puede siempre. Nunca en anuladas.

create or replace function public.rpc_s5_guardar_s(p_auditoria uuid, p_zona integer, p_s integer, p_puntajes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.s5_auditorias; z public.s5_zonas; e public.s5_evaluaciones; v_faltan text; v_invalidos text; v_limite date;
begin
  perform public.exigir_rol('admin', 'captura');
  if p_s is null or p_s not between 1 and 5 then raise exception 'S inválida: %.', p_s; end if;

  select * into a from public.s5_auditorias where id = p_auditoria;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  select * into z from public.s5_zonas where id = p_zona;
  if z.id is null or z.area_id <> a.area_id or z.cultivo_id <> a.cultivo_id then
    raise exception 'La zona no pertenece al área y cultivo de esta auditoría.';
  end if;
  if jsonb_typeof(p_puntajes) is distinct from 'array' then raise exception 'Se esperaba la lista de puntajes.'; end if;

  select string_agg(format('%s=%s', coalesce(x->>'item_id', '?'), coalesce(x->>'puntaje', '?')), ', ') into v_invalidos
  from jsonb_array_elements(p_puntajes) x
  left join public.s5_items i
    on i.id = case when x->>'item_id' ~ '^[0-9]+$' then (x->>'item_id')::integer end
  where i.id is null or i.s <> p_s
     or case when x->>'puntaje' ~ '^[0-9]+(\.[0-9]+)?$' then (x->>'puntaje')::numeric not in (0, 0.5, 1, 1.5, 2) else true end;
  if v_invalidos is not null then raise exception 'Puntajes inválidos para %S: %.', p_s, v_invalidos; end if;

  select string_agg(i.numero::text, ', ' order by i.numero) into v_faltan
  from public.s5_items i
  where i.s = p_s and i.activo
    and not exists (select 1 from jsonb_array_elements(p_puntajes) x where x->>'item_id' = i.id::text);
  if v_faltan is not null then raise exception 'Falta puntuar en %S los ítems: %.', p_s, v_faltan; end if;

  insert into public.s5_evaluaciones (auditoria_id, zona_id, creado_por) values (a.id, z.id, auth.uid())
    on conflict (auditoria_id, zona_id) do nothing;
  select * into e from public.s5_evaluaciones where auditoria_id = a.id and zona_id = z.id for update;

  -- Llenar una zona pendiente de una auditoría en curso no tiene plazo; corregir (zona completa
  -- o auditoría cerrada) sí: hasta fecha + S5_DIAS_CORRECCION, salvo el administrador.
  v_limite := a.fecha + public.fn_s5_dias_correccion();
  if (e.estado = 'completa' or a.estado <> 'en_curso')
     and public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > v_limite then
    raise exception 'El plazo para corregir la auditoría % venció el % (% días). Pide a un administrador que lo corrija.',
      a.codigo, to_char(v_limite, 'DD/MM/YYYY'), public.fn_s5_dias_correccion();
  end if;

  insert into public.s5_puntajes (evaluacion_id, item_id, puntaje, puntaje_original, actualizado_por)
  select distinct on ((x->>'item_id')::integer) e.id, (x->>'item_id')::integer, (x->>'puntaje')::numeric, (x->>'puntaje')::numeric, auth.uid()
  from jsonb_array_elements(p_puntajes) x
  on conflict (evaluacion_id, item_id) do update set
    puntaje = excluded.puntaje, puntaje_original = excluded.puntaje,
    corregido_por = null, corregido_en = null, motivo_correccion = null, observacion_id = null,
    actualizado_por = auth.uid(), actualizado_en = now();

  update public.s5_evaluaciones set actualizado_en = now() where id = e.id;
  update public.s5_auditorias set actualizado_por = auth.uid() where id = a.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S',
            case when e.estado = 'completa' or a.estado <> 'en_curso' then 'Corrección ' else 'Puntajes ' end || p_s || 'S',
            a.codigo || ' · zona ' || z.numero);
  return public.fn_s5_estado_evaluacion(e.id);
end;
$$;

create or replace function public.rpc_s5_completar_zona(p_evaluacion uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.s5_evaluaciones; a public.s5_auditorias; v jsonb; v_faltan text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into e from public.s5_evaluaciones where id = p_evaluacion for update;
  if e.id is null then raise exception 'No existe la evaluación.'; end if;
  select * into a from public.s5_auditorias where id = e.auditoria_id;
  if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  if a.estado <> 'en_curso' and public.rol_actual() is distinct from 'admin'
     and public.fn_hoy_lima() > a.fecha + public.fn_s5_dias_correccion() then
    raise exception 'El plazo para corregir la auditoría % ya venció.', a.codigo;
  end if;

  v := public.fn_s5_estado_evaluacion(e.id);
  select string_agg(g || 'S', ', ' order by g) into v_faltan
  from generate_series(1, 5) g where not ((v->'completas') @> to_jsonb(g));
  if v_faltan is not null then raise exception 'Faltan S por evaluar: %.', v_faltan; end if;

  update public.s5_evaluaciones set estado = 'completa', completada_en = coalesce(completada_en, now()), actualizado_en = now()
    where id = e.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Zona completada', a.codigo || ' · ' || round(((v->>'total')::numeric) * 100, 1) || '%');
  return public.fn_s5_estado_evaluacion(e.id);
end;
$$;
