-- 0060: Estudio TOP · cantidad de envases (bandejas o jarras) en la etapa Cosecha
--
--   · top_tiempos.envases: envases llenados durante esa toma de Cosecha (actividad 4).
--   · rpc_top_guardar_tiempo exige envases al cerrar (fin no nulo) una toma de Cosecha.
--     Si el cliente no manda la clave «envases» al actualizar, se conserva el valor guardado.
--     Las tomas antiguas quedan sin envases y solo se piden cuando alguien las corrige.
--
-- Revertir: recrear rpc_top_guardar_tiempo de 0046 y
--   alter table public.top_tiempos drop column envases;

alter table public.top_tiempos add column if not exists envases integer check (envases is null or envases between 0 and 5000);
comment on column public.top_tiempos.envases is 'Envases (bandejas o jarras) llenados en la toma de Cosecha (0060).';

create or replace function public.rpc_top_guardar_tiempo(p jsonb)
returns public.top_tiempos language plpgsql security definer set search_path = public as $$
declare
  v public.top_tiempos; v_id bigint := nullif(p->>'id', '')::bigint; v_eval uuid := (p->>'evaluacion_id')::uuid;
  v_act smallint := (p->>'actividad_id')::smallint; v_fin timestamptz := nullif(p->>'fin', '')::timestamptz;
  v_env integer := nullif(p->>'envases', '')::integer;
begin
  perform public.exigir_rol('admin', 'captura');
  if v_id is not null then
    select evaluacion_id, case when p ? 'envases' then v_env else envases end into v_eval, v_env from public.top_tiempos where id = v_id;
  end if;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede registrar tiempos.'; end if;
  if v_act = 4 and v_fin is not null and v_env is null then
    raise exception 'Indica la cantidad de envases (bandejas o jarras) de la cosecha.';
  end if;
  if v_act <> 4 then v_env := null; end if;
  if v_id is null then
    insert into public.top_tiempos (evaluacion_id, actividad_id, inicio, fin, nota, envases)
    values (v_eval, v_act, (p->>'inicio')::timestamptz, v_fin, nullif(trim(p->>'nota'), ''), v_env)
    returning * into v;
  else
    update public.top_tiempos set actividad_id = v_act, inicio = (p->>'inicio')::timestamptz,
      fin = v_fin, nota = nullif(trim(p->>'nota'), ''), envases = v_env
    where id = v_id returning * into v;
  end if;
  return v;
end;
$$;
