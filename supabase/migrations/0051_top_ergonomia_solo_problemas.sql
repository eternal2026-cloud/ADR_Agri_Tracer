-- 0051: Estudio TOP — checklist ergonómico solo con los problemas detectados
--
--   · Se mantienen 1. Puesto de trabajo, 2. Síntomas debidos a la postura, 3. Fatiga física y
--     8. Traumatismos repetidos. Se retiran 4. Carga mental, 5. Ritmo, 6. Automatización y 7. Jornada.
--   · Se borran de las evaluaciones pasadas las respuestas 4.x a 7.x (al aplicarla no había ninguna).
--   · rpc_top_guardar_ergonomia descarta esas claves aunque lleguen de un borrador viejo del celular.
--   · Tiempos en paralelo (varias etapas a la vez) no requiere cambios en la base: top_tiempos ya
--     admite varias tomas abiertas por evaluación.
--
-- Revertir: restaurar rpc_top_guardar_ergonomia de 0046 (las respuestas borradas no se recuperan).

update public.top_ergonomia
   set respuestas = (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(respuestas) where key !~ '^[4-7]\.'),
       dolor = (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(dolor) where key !~ '^[4-7]\.')
 where exists (select 1 from jsonb_object_keys(respuestas) k where k ~ '^[4-7]\.')
    or exists (select 1 from jsonb_object_keys(dolor) k where k ~ '^[4-7]\.');

create or replace function public.rpc_top_guardar_ergonomia(p_eval uuid, p_respuestas jsonb, p_dolor jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_resp jsonb; v_dolor jsonb;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_resp
    from jsonb_each(coalesce(p_respuestas, '{}')) where key !~ '^[4-7]\.';
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_dolor
    from jsonb_each(coalesce(p_dolor, '{}')) where key !~ '^[4-7]\.';
  insert into public.top_ergonomia (evaluacion_id, respuestas, dolor, actualizado_en)
  values (p_eval, v_resp, v_dolor, now())
  on conflict (evaluacion_id) do update set respuestas = excluded.respuestas, dolor = excluded.dolor, actualizado_en = now();
end;
$$;
