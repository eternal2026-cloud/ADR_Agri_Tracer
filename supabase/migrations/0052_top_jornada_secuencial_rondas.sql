-- 0052: Estudio TOP — jornada fija, etapas secuenciales con tiempo muerto, etapas nuevas
--       con sustento y rondas de estándares / REBA (3 por día)
--
--   · Inicio y fin de jornada dejan de ser actividades: son marcas fijas de la evaluación
--     (top_evaluaciones.jornada_inicio / jornada_fin, rpc_top_guardar_jornada). Las actividades
--     3 «Inicio de jornada» y 11 «Fin de jornada» se desactivan; sus tomas pasadas se convierten
--     en tiempo muerto (lo que transcurre antes de la primera etapa).
--   · Las etapas vuelven a ser secuenciales. Entre el fin de una y el inicio de la siguiente la
--     app abre sola «Tiempo muerto» (actividad 20, clase espera), que se puede anotar.
--   · Etapas nuevas: el auxiliar crea una etapa distinta a las del catálogo con su sustento
--     (rpc_top_crear_actividad). Queda en el catálogo para todos, con quién y por qué la creó.
--   · Estándares: hasta 3 rondas por evaluación (top_cumplimiento.ronda 1-3).
--   · REBA: hasta 3 por evaluación. Ergonomía y encuesta siguen en 1 por evaluación
--     (= 1 por cosechador y día, índice top_evaluaciones_cosechador_dia).
--
-- Revertir: restaurar rpc_top_guardar_cumplimiento(uuid, jsonb) y rpc_top_guardar_reba de 0046,
--   volver la PK de top_cumplimiento a (evaluacion_id, item_id) tras borrar las rondas 2-3,
--   activar las actividades 3 y 11 y quitar las columnas jornada_* y sustento/creado_*.

-- ================================================================ jornada fija
alter table public.top_evaluaciones add column if not exists jornada_inicio timestamptz;
alter table public.top_evaluaciones add column if not exists jornada_fin timestamptz;

-- ================================================================ catálogo: tiempo muerto y etapas nuevas
alter table public.top_actividades add column if not exists sustento text;
alter table public.top_actividades add column if not exists creado_por uuid references public.perfiles(id);
alter table public.top_actividades add column if not exists creado_txt text;
alter table public.top_actividades add column if not exists creado_en timestamptz;
create sequence if not exists public.top_actividades_nuevas_seq start 100;

insert into public.top_actividades (id, nombre, clase, orden) values (20, 'Tiempo muerto', 'espera', 20)
on conflict (id) do nothing;

-- Tomas pasadas de «Inicio de jornada»: la marca pasa a la evaluación y el tramo, a tiempo muerto.
update public.top_evaluaciones e set jornada_inicio = x.ini
  from (select evaluacion_id, min(inicio) ini from public.top_tiempos where actividad_id = 3 group by 1) x
 where x.evaluacion_id = e.id and e.jornada_inicio is null;
update public.top_evaluaciones e set jornada_fin = x.fin
  from (select evaluacion_id, max(coalesce(fin, inicio)) fin from public.top_tiempos where actividad_id = 11 group by 1) x
 where x.evaluacion_id = e.id and e.jornada_fin is null;
delete from public.top_tiempos where actividad_id in (3, 11) and fin is null;
update public.top_tiempos set actividad_id = 20, nota = coalesce(nota, 'Registrado como «Inicio de jornada»')
 where actividad_id = 3;
update public.top_tiempos set actividad_id = 20, nota = coalesce(nota, 'Registrado como «Fin de jornada»')
 where actividad_id = 11;
update public.top_actividades set activo = false where id in (3, 11);

-- ================================================================ rondas de estándares
alter table public.top_cumplimiento add column if not exists ronda smallint not null default 1;
alter table public.top_cumplimiento drop constraint if exists top_cumplimiento_ronda_check;
alter table public.top_cumplimiento add constraint top_cumplimiento_ronda_check check (ronda between 1 and 3);
alter table public.top_cumplimiento drop constraint if exists top_cumplimiento_pkey;
alter table public.top_cumplimiento add primary key (evaluacion_id, item_id, ronda);

-- ================================================================ funciones
create or replace function public.rpc_top_guardar_jornada(p_eval uuid, p_inicio timestamptz, p_fin timestamptz)
returns public.top_evaluaciones language plpgsql security definer set search_path = public as $$
declare v public.top_evaluaciones;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede registrar la jornada.'; end if;
  if p_inicio is not null and p_fin is not null and p_fin < p_inicio then raise exception 'El fin de jornada no puede ser antes del inicio.'; end if;
  update public.top_evaluaciones set jornada_inicio = p_inicio, jornada_fin = p_fin, actualizado_en = now()
   where id = p_eval returning * into v;
  return v;
end;
$$;

create or replace function public.rpc_top_crear_actividad(p_nombre text, p_clase text, p_sustento text)
returns public.top_actividades language plpgsql security definer set search_path = public as $$
declare v public.top_actividades; v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_tiene_acceso('campo.top.evaluar') then raise exception 'No tienes acceso a Estudio TOP · Evaluar.'; end if;
  if length(v_nombre) < 3 then raise exception 'Escribe el nombre de la etapa.'; end if;
  if length(trim(coalesce(p_sustento, ''))) < 15 then raise exception 'Explica por qué hace falta esta etapa (mínimo 15 caracteres).'; end if;
  if coalesce(p_clase, '') not in ('productiva', 'soporte', 'espera', 'personal') then raise exception 'Elige el tipo de etapa.'; end if;
  select * into v from public.top_actividades where lower(nombre) = lower(v_nombre);
  if found then
    if v.activo then raise exception 'Ya existe la etapa «%»: elígela de la lista.', v.nombre; end if;
    raise exception 'La etapa «%» existe pero está desactivada.', v.nombre;
  end if;
  insert into public.top_actividades (id, nombre, clase, orden, sustento, creado_por, creado_txt, creado_en)
  values (nextval('public.top_actividades_nuevas_seq'), v_nombre, p_clase, 900, trim(p_sustento), auth.uid(),
          (select nombre from public.perfiles where id = auth.uid()), now())
  returning * into v;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'ESTUDIO_TOP', 'Etapa nueva', v.nombre || ' — ' || v.sustento);
  return v;
end;
$$;

drop function if exists public.rpc_top_guardar_cumplimiento(uuid, jsonb);
/** p_items: [{ item_id, resultado, observacion, practica_top, fotos: [] }] de la ronda p_ronda (1-3). */
create or replace function public.rpc_top_guardar_cumplimiento(p_eval uuid, p_items jsonb, p_ronda smallint default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  if coalesce(p_ronda, 1) not between 1 and 3 then raise exception 'Los estándares se evalúan hasta 3 veces por día.'; end if;
  insert into public.top_cumplimiento (evaluacion_id, item_id, ronda, resultado, observacion, practica_top, fotos, actualizado_en)
  select p_eval, (x->>'item_id')::int, coalesce(p_ronda, 1), nullif(x->>'resultado', ''), nullif(trim(x->>'observacion'), ''), nullif(trim(x->>'practica_top'), ''),
         coalesce(array(select jsonb_array_elements_text(coalesce(x->'fotos', '[]'::jsonb))), '{}'), now()
  from jsonb_array_elements(p_items) x
  on conflict (evaluacion_id, item_id, ronda) do update set resultado = excluded.resultado, observacion = excluded.observacion,
    practica_top = excluded.practica_top, fotos = excluded.fotos, actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.rpc_top_guardar_reba(p jsonb)
returns public.top_reba language plpgsql security definer set search_path = public as $$
declare v public.top_reba; v_id bigint := nullif(p->>'id', '')::bigint; v_eval uuid := (p->>'evaluacion_id')::uuid;
begin
  perform public.exigir_rol('admin', 'captura');
  if v_id is not null then select evaluacion_id into v_eval from public.top_reba where id = v_id; end if;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  if v_id is null then
    if (select count(*) from public.top_reba where evaluacion_id = v_eval) >= 3 then
      raise exception 'El REBA se evalúa hasta 3 veces por día: corrige uno de los registrados.';
    end if;
    insert into public.top_reba (evaluacion_id, cuello, tronco, piernas, brazo, antebrazo, muneca) values (v_eval, 1, 1, 1, 1, 1, 1)
    returning id into v_id;
  end if;
  update public.top_reba set
    actividad_id = nullif(p->>'actividad_id', '')::smallint, momento = nullif(trim(p->>'momento'), ''),
    cuello = (p->>'cuello')::smallint, cuello_mod = coalesce((p->>'cuello_mod')::boolean, false),
    tronco = (p->>'tronco')::smallint, tronco_mod = coalesce((p->>'tronco_mod')::boolean, false),
    piernas = (p->>'piernas')::smallint, piernas_mod = coalesce((p->>'piernas_mod')::smallint, 0),
    carga = coalesce((p->>'carga')::smallint, 0), carga_brusca = coalesce((p->>'carga_brusca')::boolean, false),
    brazo = (p->>'brazo')::smallint, brazo_elevado = coalesce((p->>'brazo_elevado')::boolean, false),
    brazo_apoyo = coalesce((p->>'brazo_apoyo')::boolean, false), antebrazo = (p->>'antebrazo')::smallint,
    muneca = (p->>'muneca')::smallint, muneca_mod = coalesce((p->>'muneca_mod')::boolean, false),
    agarre = coalesce((p->>'agarre')::smallint, 0), act_estatica = coalesce((p->>'act_estatica')::boolean, false),
    act_repetitiva = coalesce((p->>'act_repetitiva')::boolean, false), act_inestable = coalesce((p->>'act_inestable')::boolean, false),
    fotos = coalesce(array(select jsonb_array_elements_text(coalesce(p->'fotos', '[]'::jsonb))), '{}'),
    observacion = nullif(trim(p->>'observacion'), '')
  where id = v_id returning * into v;
  return v;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['rpc_top_guardar_jornada(uuid, timestamptz, timestamptz)', 'rpc_top_crear_actividad(text, text, text)',
                           'rpc_top_guardar_cumplimiento(uuid, jsonb, smallint)', 'rpc_top_guardar_reba(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
