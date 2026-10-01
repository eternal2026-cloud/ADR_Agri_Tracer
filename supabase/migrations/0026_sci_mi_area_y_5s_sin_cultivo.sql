-- 0026: Cliente interno por área evaluada · 5S sin cultivo («-») · fotos de apoyo y Excel de avance
--
--   · sci_encuestas: el admin ve todas; los demás solo las evaluaciones HECHAS A SU ÁREA
--     (area_evaluada_id = perfiles.sci_area). Sin área asignada no ven ninguna.
--     Reemplaza la regla de 0025 («solo las que registré»).
--   · s5_cultivos: nuevo ícono «servicios» y cultivo «-» para áreas sin cultivo asociado
--     (Servicios Generales). Sus zonas, auditorías y observaciones pasan a «-».
--   · Fotos por observación: hasta 6 «Antes» y 6 «Después» (antes 3) para no perder las que
--     vienen del Excel de avance.
--   · rpc_s5_obs_actualizar: agrega fotos (panel lateral del checklist) y aplica cambios de
--     texto, estado, notas y fecha de cierre (Excel de avance), dejando seguimiento.
--   · rpc_s5_importar_avance: actualiza cabecera, nombres de zona y puntajes de UNA auditoría
--     desde la hoja BD del Excel (misma estructura que la descarga).

-- ================================================================ Cliente interno: mi área
/** Área (sci_areas) a la que pertenece el usuario en sesión; null si no tiene. */
create or replace function public.fn_sci_mi_area()
returns integer language sql stable security definer set search_path = public as $$
  select sci_area from public.perfiles where id = auth.uid();
$$;
revoke all on function public.fn_sci_mi_area() from public, anon;
grant execute on function public.fn_sci_mi_area() to authenticated;

drop policy if exists sci_encuestas_select on public.sci_encuestas;
create policy sci_encuestas_select on public.sci_encuestas for select to authenticated
  using (public.rol_actual() = 'admin'
         or (public.rol_actual() in ('captura', 'visor') and area_evaluada_id = (select public.fn_sci_mi_area())));

create index if not exists sci_encuestas_area_evaluada_idx on public.sci_encuestas (area_evaluada_id);

-- ================================================================ 5S: cultivo «-»
alter table public.s5_cultivos drop constraint if exists s5_cultivos_icono_check;
alter table public.s5_cultivos add constraint s5_cultivos_icono_check
  check (icono in ('arandano', 'uva', 'citrico', 'hoja', 'servicios'));

do $$
declare
  v_area integer; v_cul integer; v_campana text; v_planta text; v_choque text;
begin
  select id into v_area from public.s5_areas
   where translate(lower(nombre), 'áéíóú', 'aeiou') ~ '(servicios?\s*generales|^ss\.?\s*gg\.?$)'
   order by activo desc, id limit 1;

  if v_area is not null then
    select a.campana, a.planta into v_campana, v_planta from public.s5_auditorias a
     where a.area_id = v_area and a.estado <> 'anulada' order by a.fecha desc, a.creado_en desc limit 1;
  end if;

  insert into public.s5_cultivos (nombre, icono, color, campana, planta, orden)
  values ('-', 'servicios', '#8C7B6B', coalesce(v_campana, 'Servicios ' || extract(year from now())::int),
          coalesce(v_planta, 'Planta Don Carlos'), coalesce((select max(orden) + 1 from public.s5_cultivos), 99))
  on conflict (nombre) do update set icono = 'servicios';
  select id into v_cul from public.s5_cultivos where nombre = '-';

  if v_area is null then
    raise notice 'No se encontró el área Servicios Generales: el cultivo «-» se creó vacío.';
    return;
  end if;

  -- Si el área tiene zonas en varios cultivos con el mismo N°, no se pueden juntar solas.
  select string_agg(distinct z.numero::text, ', ') into v_choque
  from public.s5_zonas z
  where z.area_id = v_area
    and exists (select 1 from public.s5_zonas z2 where z2.area_id = v_area and z2.numero = z.numero and z2.id <> z.id);
  if v_choque is not null then
    raise exception 'Servicios Generales tiene zonas repetidas entre cultivos (N° %). Renumera una antes de aplicar esta migración.', v_choque;
  end if;

  update public.s5_zonas set cultivo_id = v_cul where area_id = v_area and cultivo_id <> v_cul;
  update public.s5_auditorias set cultivo_id = v_cul where area_id = v_area and cultivo_id <> v_cul;
  -- trg_s5_obs_normalizar vuelve a tomar área y cultivo de la zona.
  update public.s5_observaciones set cultivo_id = v_cul where area_id = v_area and cultivo_id <> v_cul;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (null, 'AUDITORIA_5S', 'Área sin cultivo', 'Servicios Generales pasa al cultivo «-»');
end $$;

-- ================================================================ fotos: hasta 6 por tipo
alter table public.s5_observaciones drop constraint if exists s5_observaciones_fotos_antes_chk;
alter table public.s5_observaciones add constraint s5_observaciones_fotos_antes_chk check (cardinality(fotos_antes) between 1 and 6);
alter table public.s5_observaciones drop constraint if exists s5_observaciones_fotos_despues_chk;
alter table public.s5_observaciones add constraint s5_observaciones_fotos_despues_chk check (cardinality(fotos_despues) <= 6);

create or replace function public.fn_s5_fotos(p jsonb, p_texto text, p_max integer default 6)
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

-- Igual que 0014, con 6 fotos por tipo.
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

-- Igual que 0014, con 6 fotos «Después» (se conservan las 6 más recientes).
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

-- ================================================================ RPC: actualizar observación
/** p: { id, fotos_antes: [rutas nuevas], fotos_despues: [rutas nuevas], descripcion?, accion_correctiva?,
        estado?, fecha_cierre? ('' = sin fecha), notas: [texto], origen: 'panel' | 'excel' }
    Agregar fotos, cambiar estado y añadir notas no tienen plazo (como un seguimiento). Cambiar los
    textos sí: para el rol captura, dentro de S5_DIAS_CORRECCION días desde el registro. */
create or replace function public.rpc_s5_obs_actualizar(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias;
  v_antes text[]; v_despues text[]; v_desc text; v_accion text; v_estado text; v_cierre date;
  v_notas text[]; v_detalle text[] := '{}'; v_origen text; v_textos boolean; v_n integer; v_anterior text;
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
    fotos_antes = fotos_antes || v_antes,
    fotos_despues = fotos_despues || v_despues,
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
  if v_anterior <> o.estado or cardinality(v_antes) + cardinality(v_despues) > 0 or cardinality(v_notas) = 0 then
    insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, fotos, usuario_id, usuario_nombre)
      values (o.id, v_anterior, o.estado, null, (v_despues || v_antes)[1], v_despues || v_antes, auth.uid(), public.fn_s5_mi_nombre());
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

-- ================================================================ RPC: Excel de avance
/** Actualiza UNA auditoría con la hoja BD del Excel (misma estructura que la descarga).
    p: { cabecera: {fecha, tipo, campana, planta} (solo lo que cambió),
         zonas: [{ numero, nombre, puntajes: [{s, numero, puntaje}] }] }
    · Zona por N° dentro del área y cultivo de la auditoría: si el nombre cambió se renombra;
      si no existe se crea.
    · En curso: los puntajes se escriben como originales (igual que puntuar en la app) y la zona
      queda completa cuando tiene las 5 S.
    · Cerrada: solo un admin; el puntaje cambia como corrección (se conserva el original). */
create or replace function public.rpc_s5_importar_avance(p_auditoria uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.s5_auditorias; z public.s5_zonas; e public.s5_evaluaciones; it public.s5_items;
  zx jsonb; px jsonb; c jsonb := coalesce(p->'cabecera', '{}'::jsonb);
  v_num integer; v_nombre text; v_pt numeric; v_actual numeric; v_estado jsonb;
  v_cab integer := 0; v_ren integer := 0; v_nuevas integer := 0; v_pts integer := 0; v_completas integer := 0;
  v_avisos text[] := '{}'; v_cerrada boolean;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into a from public.s5_auditorias where id = p_auditoria for update;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
  v_cerrada := a.estado = 'cerrada';
  if v_cerrada and public.rol_actual() is distinct from 'admin' then
    raise exception 'La auditoría % está cerrada: solo un administrador puede actualizarla con el Excel.', a.codigo;
  end if;

  -- cabecera
  if c ? 'fecha' and coalesce(c->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' and (c->>'fecha')::date <> a.fecha then
    if (c->>'fecha')::date > public.fn_hoy_lima() then raise exception 'La fecha de la auditoría no puede estar en el futuro.'; end if;
    update public.s5_auditorias set fecha = (c->>'fecha')::date where id = a.id; v_cab := v_cab + 1;
  end if;
  if c ? 'tipo' and c->>'tipo' in ('Opinada', 'Inopinada') and c->>'tipo' <> a.tipo then
    update public.s5_auditorias set tipo = c->>'tipo' where id = a.id; v_cab := v_cab + 1;
  end if;
  if nullif(btrim(c->>'campana'), '') is not null and btrim(c->>'campana') <> a.campana then
    if exists (select 1 from public.s5_auditorias where area_id = a.area_id and campana = btrim(c->>'campana')
               and numero_auditoria = a.numero_auditoria and estado <> 'anulada' and id <> a.id) then
      raise exception 'Ya existe la auditoría N° % del área en la campaña %.', a.numero_auditoria, btrim(c->>'campana');
    end if;
    update public.s5_auditorias set campana = btrim(c->>'campana') where id = a.id; v_cab := v_cab + 1;
  end if;
  if nullif(btrim(c->>'planta'), '') is not null and btrim(c->>'planta') <> a.planta then
    update public.s5_auditorias set planta = btrim(c->>'planta') where id = a.id; v_cab := v_cab + 1;
  end if;

  for zx in select value from jsonb_array_elements(coalesce(p->'zonas', '[]'::jsonb)) loop
    v_num := case when coalesce(zx->>'numero', '') ~ '^[0-9]+$' then (zx->>'numero')::integer end;
    v_nombre := nullif(btrim(zx->>'nombre'), '');
    if v_num is null or v_num not between 1 and 99 then
      v_avisos := v_avisos || ('Zona sin N° válido: ' || coalesce(v_nombre, '?')); continue;
    end if;

    select * into z from public.s5_zonas where cultivo_id = a.cultivo_id and area_id = a.area_id and numero = v_num;
    if z.id is null then
      if v_nombre is null then v_avisos := v_avisos || ('Zona N° ' || v_num || ' sin nombre: no se creó'); continue; end if;
      insert into public.s5_zonas (cultivo_id, area_id, numero, nombre) values (a.cultivo_id, a.area_id, v_num, v_nombre) returning * into z;
      v_nuevas := v_nuevas + 1;
    elsif v_nombre is not null and v_nombre <> z.nombre then
      update public.s5_zonas set nombre = v_nombre where id = z.id returning * into z;
      v_ren := v_ren + 1;
    end if;

    if jsonb_array_length(coalesce(zx->'puntajes', '[]'::jsonb)) = 0 then continue; end if;
    insert into public.s5_evaluaciones (auditoria_id, zona_id, creado_por) values (a.id, z.id, auth.uid())
      on conflict (auditoria_id, zona_id) do nothing;
    select * into e from public.s5_evaluaciones where auditoria_id = a.id and zona_id = z.id for update;

    for px in select value from jsonb_array_elements(zx->'puntajes') loop
      select * into it from public.s5_items
       where s = case when coalesce(px->>'s', '') ~ '^[1-5]$' then (px->>'s')::integer end
         and numero = case when coalesce(px->>'numero', '') ~ '^[1-6]$' then (px->>'numero')::integer end;
      if it.id is null then continue; end if;
      v_pt := case when coalesce(px->>'puntaje', '') ~ '^[0-9]+(\.[0-9]+)?$' then (px->>'puntaje')::numeric end;
      if v_pt is null or v_pt not in (0, 0.5, 1, 1.5, 2) then
        v_avisos := v_avisos || ('Zona ' || v_num || ' · ' || it.s || 'S-' || it.numero || ': puntaje inválido «' || coalesce(px->>'puntaje', '') || '»');
        continue;
      end if;
      select puntaje into v_actual from public.s5_puntajes where evaluacion_id = e.id and item_id = it.id;
      if found and v_actual = v_pt then continue; end if;
      if v_cerrada then
        if not found then
          insert into public.s5_puntajes (evaluacion_id, item_id, puntaje, puntaje_original, corregido_por, corregido_en, motivo_correccion, actualizado_por)
            values (e.id, it.id, v_pt, v_pt, auth.uid(), now(), 'Excel de avance', auth.uid());
        else
          update public.s5_puntajes set puntaje = v_pt, corregido_por = auth.uid(), corregido_en = now(),
            motivo_correccion = 'Excel de avance', actualizado_por = auth.uid(), actualizado_en = now()
          where evaluacion_id = e.id and item_id = it.id;
        end if;
      else
        insert into public.s5_puntajes (evaluacion_id, item_id, puntaje, puntaje_original, actualizado_por)
          values (e.id, it.id, v_pt, v_pt, auth.uid())
        on conflict (evaluacion_id, item_id) do update set
          puntaje = excluded.puntaje, puntaje_original = excluded.puntaje,
          corregido_por = null, corregido_en = null, motivo_correccion = null, observacion_id = null,
          actualizado_por = auth.uid(), actualizado_en = now();
      end if;
      v_pts := v_pts + 1;
    end loop;

    v_estado := public.fn_s5_estado_evaluacion(e.id);
    if jsonb_array_length(v_estado->'completas') = 5 and e.estado <> 'completa' then
      update public.s5_evaluaciones set estado = 'completa', completada_en = coalesce(completada_en, now()), actualizado_en = now() where id = e.id;
      v_completas := v_completas + 1;
    else
      update public.s5_evaluaciones set actualizado_en = now() where id = e.id;
    end if;
  end loop;

  update public.s5_auditorias set actualizado_por = auth.uid() where id = a.id returning * into a;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Excel de avance',
            a.codigo || ' · ' || v_pts || ' puntaje(s) · ' || v_ren || ' zona(s) renombrada(s) · ' || v_nuevas || ' nueva(s) · ' || v_cab || ' dato(s) de cabecera');
  return jsonb_build_object('auditoria', to_jsonb(a), 'puntajes', v_pts, 'renombradas', v_ren, 'zonas_nuevas', v_nuevas,
                            'cabecera', v_cab, 'completas', v_completas, 'avisos', to_jsonb(v_avisos));
end;
$$;

-- ------------------------------------------------------------------ permisos
revoke all on function public.fn_s5_fotos(jsonb, text, integer) from public, anon;
revoke all on function public.rpc_s5_obs_actualizar(jsonb) from public, anon;
revoke all on function public.rpc_s5_importar_avance(uuid, jsonb) from public, anon;
grant execute on function public.rpc_s5_guardar_observacion(jsonb) to authenticated;
grant execute on function public.rpc_s5_seguimiento(uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.rpc_s5_obs_actualizar(jsonb) to authenticated;
grant execute on function public.rpc_s5_importar_avance(uuid, jsonb) to authenticated;
