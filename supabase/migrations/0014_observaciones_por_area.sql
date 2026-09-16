-- ============================================================================
-- 0014 · Observaciones 5S por área
--   · La observación vive en la zona/área y persiste entre auditorías.
--     `auditoria_id` pasa a ser opcional: solo indica en qué auditoría nació.
--   · Hasta 3 fotos «Antes» y 3 «Después» (arrays); `foto_antes`/`foto_despues`
--     se conservan como foto principal para Google Sheets y el Excel manual.
--   · El plazo de corrección se mide siempre desde `fecha_registro`.
-- ============================================================================

-- ---------------------------------------------------------------- columnas
alter table public.s5_observaciones
  add column if not exists area_id integer references public.s5_areas(id),
  add column if not exists cultivo_id integer references public.s5_cultivos(id),
  add column if not exists fotos_antes text[] not null default '{}',
  add column if not exists fotos_despues text[] not null default '{}';

alter table public.s5_seguimientos
  add column if not exists fotos text[] not null default '{}';

-- ---------------------------------------------------------------- backfill
update public.s5_observaciones o set
  area_id = z.area_id,
  cultivo_id = z.cultivo_id,
  fotos_antes = case when coalesce(array_length(o.fotos_antes, 1), 0) > 0 then o.fotos_antes
                     when coalesce(o.foto_antes, '') <> '' then array[o.foto_antes]
                     else '{}'::text[] end,
  fotos_despues = case when coalesce(array_length(o.fotos_despues, 1), 0) > 0 then o.fotos_despues
                       when coalesce(o.foto_despues, '') <> '' then array[o.foto_despues]
                       else '{}'::text[] end
from public.s5_zonas z
where z.id = o.zona_id
  and (o.area_id is null or o.cultivo_id is null or coalesce(array_length(o.fotos_antes, 1), 0) = 0);

update public.s5_seguimientos s set fotos = array[s.foto]
  where coalesce(array_length(s.fotos, 1), 0) = 0 and coalesce(s.foto, '') <> '';

alter table public.s5_observaciones alter column area_id set not null;
alter table public.s5_observaciones alter column cultivo_id set not null;
alter table public.s5_observaciones alter column auditoria_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 's5_observaciones_fotos_antes_chk') then
    alter table public.s5_observaciones
      add constraint s5_observaciones_fotos_antes_chk check (cardinality(fotos_antes) between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 's5_observaciones_fotos_despues_chk') then
    alter table public.s5_observaciones
      add constraint s5_observaciones_fotos_despues_chk check (cardinality(fotos_despues) <= 3);
  end if;
end $$;

create index if not exists s5_observaciones_area_idx on public.s5_observaciones (cultivo_id, area_id, estado);

-- ------------------------------------------------- normalización automática
/** Deriva área y cultivo de la zona y mantiene la foto principal alineada con el array. */
create or replace function public.fn_s5_obs_normalizar()
returns trigger language plpgsql security definer set search_path = public as $$
declare z public.s5_zonas;
begin
  select * into z from public.s5_zonas where id = new.zona_id;
  if z.id is null then raise exception 'La zona de la observación no existe.'; end if;
  new.area_id := z.area_id;
  new.cultivo_id := z.cultivo_id;

  if coalesce(array_length(new.fotos_antes, 1), 0) = 0 and coalesce(new.foto_antes, '') <> '' then
    new.fotos_antes := array[new.foto_antes];
  end if;
  new.foto_antes := new.fotos_antes[1];

  if coalesce(array_length(new.fotos_despues, 1), 0) = 0 and coalesce(new.foto_despues, '') <> '' then
    new.fotos_despues := array[new.foto_despues];
  end if;
  new.foto_despues := new.fotos_despues[1];
  return new;
end;
$$;

drop trigger if exists trg_s5_obs_normalizar on public.s5_observaciones;
create trigger trg_s5_obs_normalizar before insert or update on public.s5_observaciones
  for each row execute function public.fn_s5_obs_normalizar();

-- --------------------------------------------------------------- utilidades
/** Lista de rutas de foto que viene del cliente (array jsonb o texto suelto), recortada a p_max. */
create or replace function public.fn_s5_fotos(p jsonb, p_texto text, p_max integer default 3)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(
    case when jsonb_typeof(p) = 'array' then (
      select array_agg(v) from (
        select btrim(value) v from jsonb_array_elements_text(p) where btrim(value) <> '' limit p_max
      ) t
    ) end,
    case when coalesce(btrim(p_texto), '') <> '' then array[btrim(p_texto)] end,
    '{}'::text[]);
$$;

/** Evaluación cuyo checklist sustenta una observación: la de su auditoría de origen o, si nació
    suelta, la última auditoría no anulada de esa zona. */
create or replace function public.fn_s5_evaluacion_de_obs(p_observacion uuid)
returns public.s5_evaluaciones language sql stable security definer set search_path = public as $$
  select e.* from public.s5_evaluaciones e
    join public.s5_auditorias au on au.id = e.auditoria_id
    join public.s5_observaciones o on o.zona_id = e.zona_id and o.id = p_observacion
   where au.estado <> 'anulada'
     and (o.auditoria_id is null or e.auditoria_id = o.auditoria_id)
   order by au.fecha desc, au.creado_en desc
   limit 1;
$$;

-- ==================================================== RPC: guardar observación
create or replace function public.rpc_s5_guardar_observacion(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_sref smallint; v_fecha date;
  v_antes text[]; v_despues text[];
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  v_id := (p->>'id')::uuid;
  if coalesce(btrim(p->>'descripcion'), '') = '' then raise exception 'Describe la observación.'; end if;
  v_sref := case when coalesce(p->>'s_referencia', '') ~ '^[1-5]$' then (p->>'s_referencia')::smallint end;
  v_antes := public.fn_s5_fotos(p->'fotos_antes', p->>'foto_antes', 3);
  v_despues := public.fn_s5_fotos(p->'fotos_despues', p->>'foto_despues', 3);

  -- auditoría de origen (opcional)
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
    update public.s5_observaciones set
      descripcion = btrim(p->>'descripcion'),
      accion_correctiva = nullif(btrim(p->>'accion_correctiva'), ''),
      s_referencia = v_sref,
      auditoria_id = coalesce(auditoria_id, a.id),
      fotos_antes = case when cardinality(v_antes) > 0 then v_antes else fotos_antes end,
      fotos_despues = case when cardinality(v_despues) > 0 then v_despues else fotos_despues end,
      actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id returning * into o;
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AUDITORIA_5S', 'Observación editada', 'N° ' || o.numero || ' · zona ' || o.zona_id);
    return o;
  end if;

  -- alta
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

-- ========================================================= RPC: seguimiento
/** Seguimiento: cambia estado, agrega nota y fotos «Después» y, opcionalmente, sobrescribe
    puntajes con historial. El plazo corre desde la fecha de registro de la observación. */
drop function if exists public.rpc_s5_seguimiento(uuid, text, text, text, jsonb);
create or replace function public.rpc_s5_seguimiento(p_observacion uuid, p_estado text, p_nota text default null,
                                                     p_foto text default null, p_cambios jsonb default '[]'::jsonb,
                                                     p_fotos jsonb default '[]'::jsonb)
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
  v_nuevas := public.fn_s5_fotos(p_fotos, p_foto, 3);

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

  -- las fotos «Después» se acumulan; se conservan las 3 más recientes
  v_despues := o.fotos_despues || v_nuevas;
  v_n := coalesce(array_length(v_despues, 1), 0);
  if v_n > 3 then v_despues := v_despues[v_n - 2 : v_n]; end if;

  update public.s5_observaciones set
    estado = v_estado,
    fecha_cierre = case when v_estado = 'Cerrado' then coalesce(fecha_cierre, public.fn_hoy_lima())
                        when v_estado = 'Pendiente' then null else fecha_cierre end,
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

-- ------------------------------------------------------------------ permisos
revoke all on function public.fn_s5_fotos(jsonb, text, integer) from public, anon;
revoke all on function public.fn_s5_evaluacion_de_obs(uuid) from public, anon;
revoke all on function public.fn_s5_obs_normalizar() from public, anon;
revoke all on function public.rpc_s5_seguimiento(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.fn_s5_evaluacion_de_obs(uuid) to authenticated;
grant execute on function public.rpc_s5_guardar_observacion(jsonb) to authenticated;
grant execute on function public.rpc_s5_seguimiento(uuid, text, text, text, jsonb, jsonb) to authenticated;
