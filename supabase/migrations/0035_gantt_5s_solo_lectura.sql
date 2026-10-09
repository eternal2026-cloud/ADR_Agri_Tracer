-- 0035 — Gantt 5S de solo lectura para todos los que tienen acceso a Auditoría 5S.
-- La pestaña la ve cualquiera con acceso al módulo (antes pedía el acceso «gestion.5s.gantt»);
-- marcar cumplimiento pasa a ser solo de administradores (antes también captura).
-- Lectura: las políticas de 0027/0028 ya permiten select a admin, captura y visor.

-- p_marcas: [{ area_id, cumplido: true | false | null }] — null quita la marca manual.
create or replace function public.rpc_s5_gantt_marcar(p_programa integer, p_marcas jsonb, p_semana date default null, p_nota text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v public.s5_gantt_programas; v_grupo text; x jsonb; v_area integer; v_n integer := 0; v_sem date;
begin
  perform public.exigir_rol('admin');
  select * into v from public.s5_gantt_programas where id = p_programa;
  if v.id is null then raise exception 'No existe la auditoría programada.'; end if;
  if jsonb_typeof(p_marcas) is distinct from 'array' then raise exception 'Se esperaba la lista de áreas.'; end if;
  v_sem := case when p_semana is null then null else p_semana - (extract(isodow from p_semana)::int - 1) end;

  for x in select * from jsonb_array_elements(p_marcas) loop
    v_area := nullif(x->>'area_id', '')::integer;
    if not exists (select 1 from public.s5_gantt_areas where grupo_id = v.grupo_id and area_id = v_area) then
      raise exception 'El área % no está entre las áreas a cumplir de este grupo.', coalesce(x->>'area_id', '?');
    end if;
    if x->'cumplido' is null or jsonb_typeof(x->'cumplido') = 'null' then
      delete from public.s5_gantt_cumplimientos where programa_id = v.id and area_id = v_area;
    else
      insert into public.s5_gantt_cumplimientos (programa_id, area_id, cumplido, semana, nota, marcado_por, marcado_en)
      values (v.id, v_area, (x->>'cumplido')::boolean, case when (x->>'cumplido')::boolean then coalesce(v_sem, v.semana_inicio) end,
              nullif(btrim(p_nota), ''), auth.uid(), now())
      on conflict (programa_id, area_id) do update set
        cumplido = excluded.cumplido, semana = excluded.semana, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_en = excluded.marcado_en;
    end if;
    v_n := v_n + 1;
  end loop;

  select nombre into v_grupo from public.s5_gantt_grupos where id = v.grupo_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Gantt: cumplimiento marcado',
            v_grupo || ' · ' || v.numero_auditoria || '° auditoría · ' || v_n || ' área(s)');
  return v_n;
end;
$$;

grant execute on function public.rpc_s5_gantt_marcar(integer, jsonb, date, text) to authenticated;
