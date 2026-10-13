-- 0038: Auditoría 5S · notas de seguimiento editables y fecha de cierre coherente
--
--   · rpc_s5_editar_nota_seguimiento: corrige o vacía la nota de un seguimiento. La tabla y el
--     Excel muestran «Acción correctiva // nota // …», así que una nota vieja ya no queda fija.
--     Mismo permiso que editar la observación (admin, o captura dentro del plazo). Queda en bitácora
--     con el texto anterior. La nota «Registro inicial» no se toca.
--   · rpc_s5_seguimiento: la fecha de cierre solo queda en Cerrado (y se conserva en Cancelado);
--     al reabrir (En ejecución, Stand By, …) se borra. Antes solo se borraba al volver a Pendiente.
--   · Limpieza de las observaciones abiertas que se quedaron con fecha de cierre.

create or replace function public.rpc_s5_editar_nota_seguimiento(p_seguimiento bigint, p_nota text)
returns public.s5_seguimientos language plpgsql security definer set search_path = public as $$
declare s public.s5_seguimientos; o public.s5_observaciones; a public.s5_auditorias; v_nota text := nullif(btrim(p_nota), ''); v_antes text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into s from public.s5_seguimientos where id = p_seguimiento for update;
  if s.id is null then raise exception 'No existe el seguimiento.'; end if;
  if s.nota = 'Registro inicial' and s.estado_anterior is null then raise exception 'El registro inicial no se edita.'; end if;
  select * into o from public.s5_observaciones where id = s.observacion_id;
  if o.auditoria_id is not null then
    select * into a from public.s5_auditorias where id = o.auditoria_id;
    if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  end if;
  if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
    raise exception 'La observación N° % ya no se puede editar (plazo vencido). Pide a un administrador que corrija la nota.', o.numero;
  end if;
  if v_nota is not distinct from s.nota then return s; end if;
  v_antes := s.nota;
  -- El movimiento no se borra (fn_s5_bloquear_borrado conserva el historial): solo cambia la nota.
  update public.s5_seguimientos set nota = v_nota where id = s.id returning * into s;
  update public.s5_observaciones set actualizado_por = auth.uid(), actualizado_en = now() where id = o.id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Nota de seguimiento editada',
            left('obs N° ' || o.numero || ' · zona ' || o.zona_id || ' · antes: «' || coalesce(v_antes, '') || '» · ahora: «' || coalesce(v_nota, '') || '»', 1000));
  return s;
end;
$$;
grant execute on function public.rpc_s5_editar_nota_seguimiento(bigint, text) to authenticated;

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

  if v_estado = v_anterior and v_nota is null and cardinality(v_nuevas) = 0 and jsonb_array_length(v_cambios) = 0 then
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

update public.s5_observaciones set fecha_cierre = null
 where fecha_cierre is not null and estado not in ('Cerrado', 'Cancelado');
