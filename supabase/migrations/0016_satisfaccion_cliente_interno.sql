-- 0016: Satisfacción del Cliente Interno + Toma de tiempos por cultivo
--
-- Réplica de los Excel «Encuesta NPS - <Área evaluada> - <Evaluador>.xlsx» (hoja ENCUESTA):
--   · 10 ítems en 4 criterios: Atención y trato (1-2), Tiempo de respuesta (3-4),
--     Comunicación (5-6) y Calidad de servicio (7-10).
--   · Escala por ítem: Totalmente en desacuerdo 4 % · En desacuerdo 6,5 % ·
--     De acuerdo 8,5 % · Totalmente de acuerdo 10 %. Resultado = suma de los 10 ítems.
--   · % de un criterio = suma de sus ítems / (n° de ítems × 10).
--   · Consolidado de un área evaluada = promedio por encuesta (lo calcula la app).
--   · Validado contra la presentación «Evaluación Cliente Interno - Manejo de Información»:
--     Despacho 69 %, PDC Limpieza 91 %, PDC Packing 84,5 %, PLM Limpieza 77 %, PLM Packing 57 %.
-- Histórico acumulable como Tiempos de Ciclo: rpc_sci_importar es repetible (no duplica,
-- nunca toca lo registrado en la app) y rpc_sci_guardar_encuesta registra desde la app.
-- Las áreas son las de s5_areas (compartidas con 5S) y la planta es el código del fundo.

-- ================================================================ catálogos compartidos
alter table public.listas_maestras add column if not exists codigo text;
update public.listas_maestras l set codigo = v.codigo
from (values ('DON CARLOS', 'PDC'), ('LA MAQUINA', 'PLM'), ('YANCAY', 'PYA')) as v(valor, codigo)
where l.tipo = 'fundo' and upper(l.valor) = v.valor and l.codigo is null;

-- Áreas evaluadoras de la Hoja2 de la plantilla.
update public.s5_areas set activo = true where nombre = 'Ingeniería';
insert into public.s5_areas (nombre, orden) values ('PCP', 11) on conflict (nombre) do nothing;

-- ================================================================ criterios e ítems
create table if not exists public.sci_criterios (
  id smallint primary key,
  nombre text not null unique,
  orden smallint not null
);
insert into public.sci_criterios (id, nombre, orden) values
  (1, 'Atención y trato', 1), (2, 'Tiempo de respuesta', 2), (3, 'Comunicación', 3), (4, 'Calidad de servicio', 4)
on conflict (id) do nothing;

create table if not exists public.sci_items (
  id smallint primary key check (id between 1 and 10),
  criterio_id smallint not null references public.sci_criterios(id),
  texto text not null,
  activo boolean not null default true
);
insert into public.sci_items (id, criterio_id, texto) values
  (1, 1, 'El personal del área brinda un trato cordial, respetuoso y tiene disposición para ayudar'),
  (2, 1, 'El personal muestra iniciativa para mejorar el servicio.'),
  (3, 2, 'El tiempo de respuesta a mis solicitudes es adecuado.'),
  (4, 2, 'El área cumple con las respuestas y soluciones dentro de los plazos establecidos.'),
  (5, 3, 'El área comunica de manera oportuna, efectiva y la información requerida es recibida por los canales adecuados.'),
  (6, 3, 'El área comunica de forma transparente, explica el motivo de decisiones y cambios importantes.'),
  (7, 4, 'El producto/ servicio cumple con lo que se espera de acuerdo con los requerimientos definidos.'),
  (8, 4, 'Los entregables/servicio del área requieren pocas o ninguna corrección posterior.'),
  (9, 4, 'Las soluciones que recibo son correctas, confiables y se mantienen en el tiempo.'),
  (10, 4, 'El área demuestra conocimiento, competencia y dominio de los procesos que gestiona.')
on conflict (id) do nothing;

/** Texto de la escala para un puntaje (4 · 6,5 · 8,5 · 10). */
create or replace function public.fn_sci_respuesta(p_puntaje numeric)
returns text language sql immutable set search_path = public as $$
  select case p_puntaje when 4 then 'Totalmente en desacuerdo' when 6.5 then 'En desacuerdo'
                        when 8.5 then 'De acuerdo' when 10 then 'Totalmente de acuerdo' end;
$$;

/** Rótulo del grupo evaluador, como en la presentación: «PDC - Prod. Limpieza», «Despacho», «Producción Arándano». */
create or replace function public.fn_sci_grupo(p_evaluadora text, p_sub text, p_planta text, p_cultivo text)
returns text language sql immutable set search_path = public as $$
  select case
    when nullif(btrim(p_sub), '') is not null then
      coalesce(nullif(btrim(p_planta), '') || ' - ', '') ||
      case when p_evaluadora = 'Producción' then 'Prod.' else p_evaluadora end || ' ' || btrim(p_sub)
    when nullif(btrim(p_planta), '') is not null then btrim(p_planta) || ' - ' || p_evaluadora
    when p_evaluadora = 'Producción' then 'Producción ' || coalesce(p_cultivo, '')
    else p_evaluadora
  end;
$$;

-- ================================================================ encuestas
create sequence if not exists public.sci_encuestas_codigo_seq;

create table if not exists public.sci_encuestas (
  id uuid primary key,
  codigo text unique,
  cultivo_id integer not null references public.s5_cultivos(id),
  campana text not null check (btrim(campana) <> ''),
  fecha date not null,
  semana integer,
  area_evaluada_id integer not null references public.s5_areas(id),
  area_evaluadora_id integer not null references public.s5_areas(id),
  sub_area text,
  planta text,
  cargo text,
  evaluador text,
  aspectos_valorados text,
  aspectos_mejorar text,
  recomendaciones text,
  resultado numeric,
  origen text not null default 'app' check (origen in ('app', 'excel')),
  archivo text,
  clave text not null,
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  motivo_anulacion text,
  registrado_por text,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);
-- Un Excel importado se identifica por su clave: reimportar lo actualiza (aunque esté anulado, no lo revive).
create unique index if not exists sci_encuestas_clave_excel_uidx on public.sci_encuestas (clave) where origen = 'excel';
create index if not exists sci_encuestas_filtro_idx on public.sci_encuestas (area_evaluada_id, cultivo_id, fecha desc);
create index if not exists sci_encuestas_clave_idx on public.sci_encuestas (clave);

create table if not exists public.sci_respuestas (
  encuesta_id uuid not null references public.sci_encuestas(id),
  item_id smallint not null references public.sci_items(id),
  puntaje numeric not null check (puntaje in (4, 6.5, 8.5, 10)),
  primary key (encuesta_id, item_id)
);

create or replace function public.fn_sci_clave(p_cultivo integer, p_evaluada integer, p_evaluadora integer,
                                               p_sub text, p_planta text, p_fecha date)
returns text language sql immutable set search_path = public as $$
  select p_cultivo || '|' || p_evaluada || '|' || p_evaluadora || '|' ||
         lower(coalesce(btrim(p_sub), '')) || '|' || upper(coalesce(btrim(p_planta), '')) || '|' ||
         to_char(p_fecha, 'YYYY-MM-DD');
$$;

create or replace function public.fn_sci_encuesta_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is null then
    new.codigo := 'SCI-' || lpad(nextval('public.sci_encuestas_codigo_seq')::text, 5, '0');
  end if;
  new.campana := regexp_replace(btrim(new.campana), '\s*-\s*', ' - ', 'g');
  new.sub_area := nullif(btrim(new.sub_area), '');
  new.planta := upper(nullif(btrim(new.planta), ''));
  new.semana := public.weeknum_excel_sistema1(new.fecha);
  new.clave := public.fn_sci_clave(new.cultivo_id, new.area_evaluada_id, new.area_evaluadora_id, new.sub_area, new.planta, new.fecha);
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_sci_encuesta_antes on public.sci_encuestas;
create trigger trg_sci_encuesta_antes before insert or update on public.sci_encuestas
  for each row execute function public.fn_sci_encuesta_antes();

-- ================================================================ lecturas (invoker: respetan RLS)
/** Una fila por encuesta activa con el % de cada criterio (0-100) y el resultado. */
create or replace function public.fn_sci_resultados(
  p_cultivo integer default null, p_area_evaluada integer default null,
  p_desde date default null, p_hasta date default null)
returns table (
  id uuid, codigo text, cultivo_id integer, cultivo text, campana text, fecha date, semana integer,
  area_evaluada_id integer, area_evaluada text, area_evaluadora_id integer, area_evaluadora text,
  sub_area text, planta text, grupo text, cargo text, evaluador text,
  p_atencion numeric, p_tiempo numeric, p_comunicacion numeric, p_calidad numeric, resultado numeric,
  aspectos_valorados text, aspectos_mejorar text, recomendaciones text, origen text, archivo text, creado_en timestamptz
) language sql stable set search_path = public as $$
  with crit as (
    select r.encuesta_id, i.criterio_id, sum(r.puntaje) / (count(*) * 10) * 100 as pct
    from public.sci_respuestas r join public.sci_items i on i.id = r.item_id
    group by r.encuesta_id, i.criterio_id
  )
  select e.id, e.codigo, c.id, c.nombre, e.campana, e.fecha, e.semana,
         ae.id, ae.nombre, ao.id, ao.nombre, e.sub_area, e.planta,
         public.fn_sci_grupo(ao.nombre, e.sub_area, e.planta, c.nombre), e.cargo, e.evaluador,
         max(k.pct) filter (where k.criterio_id = 1), max(k.pct) filter (where k.criterio_id = 2),
         max(k.pct) filter (where k.criterio_id = 3), max(k.pct) filter (where k.criterio_id = 4),
         e.resultado, e.aspectos_valorados, e.aspectos_mejorar, e.recomendaciones, e.origen, e.archivo, e.creado_en
  from public.sci_encuestas e
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.s5_areas ae on ae.id = e.area_evaluada_id
  join public.s5_areas ao on ao.id = e.area_evaluadora_id
  left join crit k on k.encuesta_id = e.id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
    and (p_desde is null or e.fecha >= p_desde)
    and (p_hasta is null or e.fecha <= p_hasta)
  group by e.id, c.id, ae.id, ao.id
  order by e.fecha desc, ae.nombre, e.planta nulls last, ao.nombre, e.sub_area;
$$;

/** Formato largo (una fila por ítem) para Power BI, Sheets y el Excel descargable. */
create or replace function public.fn_sci_bd(p_cultivo integer default null, p_area_evaluada integer default null)
returns table (
  semana integer, campana text, cultivo text, planta text, fecha date, area_evaluada text, area_evaluadora text,
  sub_area text, grupo_evaluador text, cargo text, item smallint, pregunta text, criterio text,
  respuesta text, puntaje_item numeric, resultado_encuesta numeric, codigo text, origen text
) language sql stable set search_path = public as $$
  select e.semana, e.campana, c.nombre, e.planta, e.fecha, ae.nombre, ao.nombre, e.sub_area,
         public.fn_sci_grupo(ao.nombre, e.sub_area, e.planta, c.nombre), e.cargo,
         i.id, i.texto, k.nombre, public.fn_sci_respuesta(r.puntaje), r.puntaje / 100, e.resultado / 100,
         e.codigo, e.origen
  from public.sci_encuestas e
  join public.sci_respuestas r on r.encuesta_id = e.id
  join public.sci_items i on i.id = r.item_id
  join public.sci_criterios k on k.id = i.criterio_id
  join public.s5_cultivos c on c.id = e.cultivo_id
  join public.s5_areas ae on ae.id = e.area_evaluada_id
  join public.s5_areas ao on ao.id = e.area_evaluadora_id
  where e.estado = 'activa'
    and (p_cultivo is null or e.cultivo_id = p_cultivo)
    and (p_area_evaluada is null or e.area_evaluada_id = p_area_evaluada)
  order by e.fecha, e.codigo, i.id;
$$;

-- ================================================================ escritura
/** Valida la encuesta (jsonb) y devuelve las respuestas normalizadas. Uso interno. */
create or replace function public.fn_sci_validar(p jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_faltan text; v_invalidos text;
begin
  if not exists (select 1 from public.s5_cultivos where id = nullif(p->>'cultivo_id', '')::integer) then
    raise exception 'Elige el cultivo.';
  end if;
  if coalesce(btrim(p->>'campana'), '') = '' then raise exception 'Falta la campaña.'; end if;
  if coalesce(p->>'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha de la encuesta.'; end if;
  if (p->>'fecha')::date > public.fn_hoy_lima() then raise exception 'La fecha no puede estar en el futuro.'; end if;
  if not exists (select 1 from public.s5_areas where id = nullif(p->>'area_evaluada_id', '')::integer) then
    raise exception 'Elige el área evaluada.';
  end if;
  if not exists (select 1 from public.s5_areas where id = nullif(p->>'area_evaluadora_id', '')::integer) then
    raise exception 'Elige el área evaluadora.';
  end if;
  if jsonb_typeof(p->'respuestas') is distinct from 'array' then raise exception 'Faltan las respuestas.'; end if;

  select string_agg(coalesce(x->>'item', '?') || '=' || coalesce(x->>'puntaje', '?'), ', ') into v_invalidos
  from jsonb_array_elements(p->'respuestas') x
  where coalesce(x->>'item', '') !~ '^([1-9]|10)$'
     or coalesce(x->>'puntaje', '') !~ '^[0-9]+(\.[0-9]+)?$'
     or (x->>'puntaje')::numeric not in (4, 6.5, 8.5, 10);
  if v_invalidos is not null then raise exception 'Respuestas inválidas: %.', v_invalidos; end if;

  select string_agg(i.id::text, ', ' order by i.id) into v_faltan
  from public.sci_items i
  where not exists (select 1 from jsonb_array_elements(p->'respuestas') x where (x->>'item')::integer = i.id);
  if v_faltan is not null then raise exception 'Falta responder los ítems: %.', v_faltan; end if;
  return p->'respuestas';
end;
$$;

/** Crea o reemplaza las respuestas de una encuesta y recalcula su resultado. Uso interno. */
create or replace function public.fn_sci_escribir_respuestas(p_encuesta uuid, p_respuestas jsonb)
returns numeric language plpgsql set search_path = public as $$
declare v_total numeric;
begin
  insert into public.sci_respuestas (encuesta_id, item_id, puntaje)
  select distinct on ((x->>'item')::smallint) p_encuesta, (x->>'item')::smallint, (x->>'puntaje')::numeric
  from jsonb_array_elements(p_respuestas) x
  on conflict (encuesta_id, item_id) do update set puntaje = excluded.puntaje;
  select sum(puntaje) into v_total from public.sci_respuestas where encuesta_id = p_encuesta;
  update public.sci_encuestas set resultado = v_total where id = p_encuesta;
  return v_total;
end;
$$;

/**
 * Importa encuestas leídas de Excel (histórico repetible).
 * Por clave (cultivo | área evaluada | área evaluadora | sub-área | planta | fecha):
 *   · existe una importada → se actualiza (si está anulada se omite, no se revive);
 *   · existe una registrada en la app → se omite (la app manda);
 *   · no existe → se crea con origen 'excel'.
 */
create or replace function public.rpc_sci_importar(p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f jsonb; v_clave text; v_ex public.sci_encuestas; v_id uuid;
  v_creadas integer := 0; v_actualizadas integer := 0; v_omitidas integer := 0; v_detalle jsonb := '[]'::jsonb;
begin
  perform public.exigir_rol('admin', 'captura');
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay encuestas para importar.';
  end if;
  if jsonb_array_length(p_filas) > 2000 then raise exception 'Máximo 2000 encuestas por carga.'; end if;

  for f in select value from jsonb_array_elements(p_filas) loop
    perform public.fn_sci_validar(f);
    v_clave := public.fn_sci_clave((f->>'cultivo_id')::integer, (f->>'area_evaluada_id')::integer,
      (f->>'area_evaluadora_id')::integer, nullif(btrim(f->>'sub_area'), ''), upper(nullif(btrim(f->>'planta'), '')), (f->>'fecha')::date);

    select * into v_ex from public.sci_encuestas where clave = v_clave and origen = 'excel' for update;
    if v_ex.id is not null and v_ex.estado = 'anulada' then
      v_omitidas := v_omitidas + 1;
      v_detalle := v_detalle || jsonb_build_object('archivo', f->>'archivo', 'estado', 'omitida', 'motivo', 'Anulada ' || v_ex.codigo);
      continue;
    end if;
    if v_ex.id is null and exists (select 1 from public.sci_encuestas where clave = v_clave and origen = 'app' and estado = 'activa') then
      v_omitidas := v_omitidas + 1;
      v_detalle := v_detalle || jsonb_build_object('archivo', f->>'archivo', 'estado', 'omitida', 'motivo', 'Ya registrada en la app');
      continue;
    end if;

    if v_ex.id is not null then
      update public.sci_encuestas set
        campana = btrim(f->>'campana'),
        cargo = nullif(btrim(f->>'cargo'), ''),
        evaluador = nullif(btrim(f->>'evaluador'), ''),
        aspectos_valorados = nullif(btrim(f->>'aspectos_valorados'), ''),
        aspectos_mejorar = nullif(btrim(f->>'aspectos_mejorar'), ''),
        recomendaciones = nullif(btrim(f->>'recomendaciones'), ''),
        archivo = coalesce(nullif(btrim(f->>'archivo'), ''), archivo),
        actualizado_por = auth.uid()
      where id = v_ex.id;
      v_id := v_ex.id;
      v_actualizadas := v_actualizadas + 1;
    else
      insert into public.sci_encuestas (id, cultivo_id, campana, fecha, area_evaluada_id, area_evaluadora_id, sub_area, planta,
        cargo, evaluador, aspectos_valorados, aspectos_mejorar, recomendaciones, origen, archivo, clave,
        registrado_por, creado_por, actualizado_por)
      values (gen_random_uuid(), (f->>'cultivo_id')::integer, btrim(f->>'campana'), (f->>'fecha')::date,
        (f->>'area_evaluada_id')::integer, (f->>'area_evaluadora_id')::integer, f->>'sub_area', f->>'planta',
        nullif(btrim(f->>'cargo'), ''), nullif(btrim(f->>'evaluador'), ''),
        nullif(btrim(f->>'aspectos_valorados'), ''), nullif(btrim(f->>'aspectos_mejorar'), ''), nullif(btrim(f->>'recomendaciones'), ''),
        'excel', nullif(btrim(f->>'archivo'), ''), v_clave, public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
      returning id into v_id;
      v_creadas := v_creadas + 1;
    end if;
    perform public.fn_sci_escribir_respuestas(v_id, f->'respuestas');
  end loop;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Importación de Excel',
            v_creadas || ' creadas · ' || v_actualizadas || ' actualizadas · ' || v_omitidas || ' omitidas');
  return jsonb_build_object('creadas', v_creadas, 'actualizadas', v_actualizadas, 'omitidas', v_omitidas, 'detalle', v_detalle);
end;
$$;

/** Registra (o corrige el mismo día) una encuesta llenada en la app. El id lo genera el celular. */
create or replace function public.rpc_sci_guardar_encuesta(p jsonb)
returns public.sci_encuestas language plpgsql security definer set search_path = public as $$
declare v public.sci_encuestas; v_id uuid; v_clave text;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la encuesta.'; end if;
  v_id := (p->>'id')::uuid;
  perform public.fn_sci_validar(p);
  v_clave := public.fn_sci_clave((p->>'cultivo_id')::integer, (p->>'area_evaluada_id')::integer,
    (p->>'area_evaluadora_id')::integer, nullif(btrim(p->>'sub_area'), ''), upper(nullif(btrim(p->>'planta'), '')), (p->>'fecha')::date);

  select * into v from public.sci_encuestas where id = v_id for update;
  if v.id is not null then
    if v.origen <> 'app' or v.estado <> 'activa' then raise exception 'La encuesta % no se puede editar.', v.codigo; end if;
    if public.rol_actual() is distinct from 'admin' and v.creado_en::date < public.fn_hoy_lima() then
      raise exception 'La encuesta % solo la corrige un administrador después del día de registro.', v.codigo;
    end if;
  end if;
  if exists (select 1 from public.sci_encuestas where clave = v_clave and estado = 'activa' and id <> v_id) then
    raise exception 'Ya existe una encuesta de ese evaluador para esa área y fecha.';
  end if;

  if v.id is null then
    insert into public.sci_encuestas (id, cultivo_id, campana, fecha, area_evaluada_id, area_evaluadora_id, sub_area, planta,
      cargo, evaluador, aspectos_valorados, aspectos_mejorar, recomendaciones, origen, clave, registrado_por, creado_por, actualizado_por)
    values (v_id, (p->>'cultivo_id')::integer, btrim(p->>'campana'), (p->>'fecha')::date,
      (p->>'area_evaluada_id')::integer, (p->>'area_evaluadora_id')::integer, p->>'sub_area', p->>'planta',
      nullif(btrim(p->>'cargo'), ''), nullif(btrim(p->>'evaluador'), ''),
      nullif(btrim(p->>'aspectos_valorados'), ''), nullif(btrim(p->>'aspectos_mejorar'), ''), nullif(btrim(p->>'recomendaciones'), ''),
      'app', v_clave, public.fn_s5_mi_nombre(), auth.uid(), auth.uid());
  else
    update public.sci_encuestas set
      cultivo_id = (p->>'cultivo_id')::integer, campana = btrim(p->>'campana'), fecha = (p->>'fecha')::date,
      area_evaluada_id = (p->>'area_evaluada_id')::integer, area_evaluadora_id = (p->>'area_evaluadora_id')::integer,
      sub_area = p->>'sub_area', planta = p->>'planta',
      cargo = nullif(btrim(p->>'cargo'), ''), evaluador = nullif(btrim(p->>'evaluador'), ''),
      aspectos_valorados = nullif(btrim(p->>'aspectos_valorados'), ''), aspectos_mejorar = nullif(btrim(p->>'aspectos_mejorar'), ''),
      recomendaciones = nullif(btrim(p->>'recomendaciones'), ''), actualizado_por = auth.uid()
    where id = v_id;
  end if;
  perform public.fn_sci_escribir_respuestas(v_id, p->'respuestas');
  select * into v from public.sci_encuestas where id = v_id;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Encuesta guardada', v.codigo || ' · ' || round(v.resultado, 1) || ' %');
  return v;
end;
$$;

create or replace function public.rpc_sci_anular_encuesta(p_encuesta uuid, p_motivo text)
returns public.sci_encuestas language plpgsql security definer set search_path = public as $$
declare v public.sci_encuestas; v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Encuesta duplicada o de prueba');
begin
  perform public.exigir_rol('admin');
  update public.sci_encuestas set estado = 'anulada', motivo_anulacion = v_motivo, actualizado_por = auth.uid()
    where id = p_encuesta and estado = 'activa' returning * into v;
  if v.id is null then raise exception 'No existe la encuesta o ya está anulada.'; end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'SATISFACCION_CI', 'Encuesta anulada', v.codigo || ' · ' || v_motivo);
  return v;
end;
$$;

-- ================================================================ RLS y protecciones
do $$
declare t text;
begin
  foreach t in array array['sci_criterios', 'sci_items', 'sci_encuestas', 'sci_respuestas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rol_actual() in (''admin'', ''captura'', ''visor''))', t || '_select', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists trg_bloquear_truncate on public.%I', t);
    execute format('create trigger trg_bloquear_truncate before truncate on public.%I for each statement execute function public.fn_bloquear_vaciado()', t);
  end loop;
end $$;

create or replace function public.fn_sci_bloquear_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'No se eliminan filas de %: anula la encuesta desde la app; el historial se conserva.', tg_table_name;
end;
$$;
revoke execute on function public.fn_sci_bloquear_borrado() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['sci_criterios', 'sci_items', 'sci_encuestas', 'sci_respuestas'] loop
    execute format('drop trigger if exists trg_sci_bloquear_borrado on public.%I', t);
    execute format('create trigger trg_sci_bloquear_borrado before delete on public.%I for each row execute function public.fn_sci_bloquear_borrado()', t);
  end loop;
end $$;

-- ================================================================ Toma de tiempos por cultivo
-- Todo lo registrado hasta hoy es de arándano. El trigger cubre inserciones que no traen
-- el cultivo (captura actual, importador del Excel y restauración desde la papelera).
-- Con default en el ADD COLUMN las filas existentes toman el valor sin disparar triggers de actualización.
alter table public.ciclos_cosecha add column if not exists cultivo text not null default 'Arándano';
alter table public.ciclos_cosecha drop constraint if exists ciclos_cosecha_cultivo_check;
alter table public.ciclos_cosecha add constraint ciclos_cosecha_cultivo_check check (cultivo in ('Arándano', 'Uva'));
create index if not exists ciclos_cosecha_cultivo_idx on public.ciclos_cosecha (cultivo, fecha);

create or replace function public.fn_ciclo_cultivo_defecto()
returns trigger language plpgsql set search_path = public as $$
begin
  new.cultivo := coalesce(nullif(btrim(new.cultivo), ''), 'Arándano');
  return new;
end;
$$;
revoke execute on function public.fn_ciclo_cultivo_defecto() from public, anon, authenticated;
drop trigger if exists trg_ciclo_cultivo_defecto on public.ciclos_cosecha;
create trigger trg_ciclo_cultivo_defecto before insert on public.ciclos_cosecha
  for each row execute function public.fn_ciclo_cultivo_defecto();

-- ================================================================ permisos de funciones
revoke execute on function public.fn_sci_encuesta_antes() from public, anon, authenticated;
revoke execute on function public.fn_sci_validar(jsonb) from public, anon, authenticated;
revoke execute on function public.fn_sci_escribir_respuestas(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_sci_resultados(integer, integer, date, date) from public, anon;
revoke execute on function public.fn_sci_bd(integer, integer) from public, anon;
revoke execute on function public.fn_sci_respuesta(numeric) from public, anon;
revoke execute on function public.fn_sci_grupo(text, text, text, text) from public, anon;
revoke execute on function public.fn_sci_clave(integer, integer, integer, text, text, date) from public, anon;
grant execute on function public.fn_sci_resultados(integer, integer, date, date) to authenticated, service_role;
grant execute on function public.fn_sci_bd(integer, integer) to authenticated, service_role;
grant execute on function public.fn_sci_respuesta(numeric) to authenticated, service_role;
grant execute on function public.fn_sci_grupo(text, text, text, text) to authenticated, service_role;
grant execute on function public.fn_sci_clave(integer, integer, integer, text, text, date) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array['rpc_sci_importar(jsonb)', 'rpc_sci_guardar_encuesta(jsonb)', 'rpc_sci_anular_encuesta(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
