-- 0013: Auditoría 5S por cultivo (Arándano · Uva · Cítrico)
--
-- Corrección de lógica de 0012: cada cultivo tiene su campaña, su planta y sus
-- propias zonas por área (Producción de uva ≠ Producción de arándano), y los
-- puntajes nunca se mezclan entre cultivos.
--   · s5_cultivos: nombre, ícono, color, campaña y planta vigentes. Reemplaza a
--     los parámetros globales S5_CAMPANA / S5_PLANTA, que se eliminan.
--   · s5_zonas.cultivo_id: zonas por cultivo + área (N° único en ese par).
--   · s5_auditorias.cultivo_id: cada auditoría pertenece a un cultivo.
--   · Semilla verificada contra los 21 Excel de «Ejemplo/<CULTIVO>» (hoja BD,
--     última auditoría). Los 26 ítems del CHECK LIST son iguales en los 3 cultivos.
--   · Auditores (captura) pueden AGREGAR áreas y zonas al iniciar una auditoría;
--     renombrar, renumerar o desactivar sigue siendo solo de administradores.

-- ================================================================ cultivos
create table if not exists public.s5_cultivos (
  id serial primary key,
  nombre text not null unique check (btrim(nombre) <> ''),
  icono text not null default 'hoja' check (icono in ('arandano', 'uva', 'citrico', 'hoja')),
  color text not null default '#76B729' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  campana text,
  planta text,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.s5_cultivos (nombre, icono, color, campana, planta, orden) values
  ('Arándano', 'arandano', '#4B5FA8',
    coalesce((select nullif(valor, '') from public.parametros where clave = 'S5_CAMPANA'), 'Arándano 2025'),
    coalesce((select nullif(valor, '') from public.parametros where clave = 'S5_PLANTA'), 'Planta Don Carlos'), 1),
  ('Uva', 'uva', '#7A3E8E', 'Uva 2025 - 2026', 'Planta Don Carlos', 2),
  ('Cítrico', 'citrico', '#EF7C3B', 'Cítrico 2025', 'Planta Casa Chica', 3)
on conflict (nombre) do nothing;

-- ================================================================ zonas por cultivo
alter table public.s5_zonas add column if not exists cultivo_id integer references public.s5_cultivos(id);
update public.s5_zonas set cultivo_id = (select id from public.s5_cultivos where nombre = 'Arándano') where cultivo_id is null;
alter table public.s5_zonas alter column cultivo_id set not null;
alter table public.s5_zonas drop constraint if exists s5_zonas_area_id_numero_key;
alter table public.s5_zonas drop constraint if exists s5_zonas_cultivo_area_numero_key;
alter table public.s5_zonas add constraint s5_zonas_cultivo_area_numero_key unique (cultivo_id, area_id, numero);
create index if not exists s5_zonas_cultivo_idx on public.s5_zonas (cultivo_id, area_id);

-- ================================================================ auditorías por cultivo
alter table public.s5_auditorias add column if not exists cultivo_id integer references public.s5_cultivos(id);
update public.s5_auditorias set cultivo_id = (select id from public.s5_cultivos where nombre = 'Arándano') where cultivo_id is null;
alter table public.s5_auditorias alter column cultivo_id set not null;
drop index if exists public.s5_auditorias_numero_uidx;
create unique index s5_auditorias_numero_uidx
  on public.s5_auditorias (cultivo_id, area_id, campana, numero_auditoria) where estado <> 'anulada';
create index if not exists s5_auditorias_cultivo_idx on public.s5_auditorias (cultivo_id, fecha desc);

-- ================================================================ áreas y zonas verificadas
insert into public.s5_areas (nombre, orden) values ('Limpieza', 3) on conflict (nombre) do nothing;
update public.s5_areas a set orden = v.orden
from (values ('Producción', 1), ('Frío', 2), ('Limpieza', 3), ('Mantenimiento', 4), ('Manejo de Información', 5),
             ('Calidad', 6), ('Despacho', 7), ('Sanitización', 8), ('Ingeniería', 9), ('Almacén', 10)) as v(nombre, orden)
where a.nombre = v.nombre;

insert into public.s5_zonas (cultivo_id, area_id, numero, nombre)
select c.id, a.id, z.numero, z.nombre
from (values
  ('Uva', 'Frío', 1, 'Termometría'), ('Uva', 'Frío', 2, 'Túneles'), ('Uva', 'Frío', 3, 'Cámara de producto terminado'),
  ('Uva', 'Limpieza', 1, 'Recepción'), ('Uva', 'Limpieza', 2, 'Sala de Limpieza'), ('Uva', 'Limpieza', 3, 'Zona de granos'), ('Uva', 'Limpieza', 4, 'Gasificado'),
  ('Uva', 'Mantenimiento', 1, 'Oficina'), ('Uva', 'Mantenimiento', 2, 'Taller y Almacén'), ('Uva', 'Mantenimiento', 3, 'Estación de Carga'), ('Uva', 'Mantenimiento', 4, 'SADEMA'),
  ('Uva', 'Producción', 1, 'Precámara'), ('Uva', 'Producción', 2, 'Sala de Proceso'), ('Uva', 'Producción', 3, 'Paletizado'),
  ('Uva', 'Producción', 4, 'Mezzanine'), ('Uva', 'Producción', 5, 'Mercado Nacional'),
  ('Uva', 'Calidad', 1, 'Calidad Limpieza'), ('Uva', 'Calidad', 2, 'D-1'), ('Uva', 'Calidad', 3, 'Calidad Packing'),
  ('Uva', 'Manejo de Información', 1, 'Estación Limpieza'), ('Uva', 'Manejo de Información', 2, 'Estación Pesado'),
  ('Uva', 'Manejo de Información', 3, 'Estación Packing'), ('Uva', 'Manejo de Información', 4, 'Almacén Temporal'),
  ('Uva', 'Manejo de Información', 5, 'Zona de rendimiento'),
  ('Uva', 'Despacho', 1, 'Oficina'), ('Uva', 'Despacho', 2, 'Sala de Despacho'), ('Uva', 'Despacho', 3, 'SENASA'),
  ('Uva', 'Sanitización', 1, 'Lavandería'), ('Uva', 'Sanitización', 2, 'Zona de Ingreso - Limpieza'), ('Uva', 'Sanitización', 3, 'Zonas de Proceso'),
  ('Cítrico', 'Frío', 1, 'Oficina de Termometría'), ('Cítrico', 'Frío', 2, 'Zona de Enfriamiento'),
  ('Cítrico', 'Despacho', 1, 'Oficina de Despacho'), ('Cítrico', 'Despacho', 2, 'Sala de Despacho'), ('Cítrico', 'Despacho', 3, 'SENASA'),
  ('Cítrico', 'Producción', 1, 'Recepción'), ('Cítrico', 'Producción', 2, 'Zona de Volcado'), ('Cítrico', 'Producción', 3, 'Zona de Tratamiento'),
  ('Cítrico', 'Producción', 4, 'Sala de Proceso'), ('Cítrico', 'Producción', 5, 'Mezzanine'), ('Cítrico', 'Producción', 6, 'Mercado Nacional'),
  ('Cítrico', 'Producción', 7, 'Venta de Mercado Nacional'),
  ('Cítrico', 'Mantenimiento', 1, 'Oficina'), ('Cítrico', 'Mantenimiento', 2, 'Taller y Almacén'), ('Cítrico', 'Mantenimiento', 3, 'Estación frigorista'),
  ('Cítrico', 'Mantenimiento', 4, 'Estación de carga'),
  ('Cítrico', 'Calidad', 1, 'Zona de Inspección'),
  ('Cítrico', 'Manejo de Información', 1, 'Estación Etiquetado'), ('Cítrico', 'Manejo de Información', 2, 'Almacén Temporal')
) as z(cultivo, area, numero, nombre)
join public.s5_cultivos c on c.nombre = z.cultivo
join public.s5_areas a on a.nombre = z.area
on conflict (cultivo_id, area_id, numero) do nothing;

-- ================================================================ parámetros (campaña y planta pasan al cultivo)
create or replace function public.fn_asegurar_parametros()
returns void language sql security definer set search_path = public as $$
  insert into public.parametros (clave, valor, descripcion) values
    ('UMBRAL_TIEMPO_CICLO_MIN', '480', 'Minutos máximos de un ciclo completo; por encima se excluye del promedio por posible error de digitación.'),
    ('SHEETS_SYNC_MINUTOS', '60', 'Cada cuántos minutos se sincroniza el espejo de auditoría en Google Sheets.'),
    ('ULTIMA_SYNC_SHEETS', '', 'Marca de tiempo de la última sincronización exitosa hacia Sheets.'),
    ('ULTIMO_ERROR_SYNC_SHEETS', '', 'Último error de sincronización hacia Sheets (vacío si todo bien).'),
    ('SHEETS_ID', '', 'ID o enlace de la Google Sheet destino (compartida como Editor con la cuenta de servicio).'),
    ('GOOGLE_SA_EMAIL', '', 'Correo de la cuenta de servicio de Google cargada (dato público, no es secreto).'),
    ('ULTIMO_INTENTO_SYNC_SHEETS', '', 'Marca de tiempo del último intento de sincronización (exitoso o no).'),
    ('S5_DIAS_CORRECCION', '3', 'Auditoría 5S: días desde la fecha de auditoría en que un auditor puede corregir puntajes; después solo un administrador.')
  on conflict (clave) do nothing;
$$;
revoke execute on function public.fn_asegurar_parametros() from public, anon, authenticated;

alter table public.parametros disable trigger trg_bloquear_borrado;
delete from public.parametros where clave in ('S5_CAMPANA', 'S5_PLANTA');
alter table public.parametros enable trigger trg_bloquear_borrado;

-- ================================================================ lecturas
drop function if exists public.fn_s5_bd();
create or replace function public.fn_s5_bd(p_cultivo integer default null, p_area integer default null)
returns table (
  fecha date, campana text, planta text, semana integer, numero_auditoria integer, tipo_auditoria text,
  area text, numero_zona integer, sub_area text, zona text, s text,
  i1 numeric, i2 numeric, i3 numeric, i4 numeric, i5 numeric, i6 numeric, suma numeric, puntaje numeric,
  codigo text, estado_auditoria text, estado_zona text, cultivo_id integer, cultivo text, area_id integer, auditoria_id uuid
) language sql stable set search_path = public as $$
  select a.fecha, a.campana, a.planta, a.semana, a.numero_auditoria, a.tipo,
         ar.nombre, z.numero, z.nombre, z.numero || '. ' || z.nombre, i.s || 'S',
         max(p.puntaje) filter (where i.numero = 1), max(p.puntaje) filter (where i.numero = 2),
         max(p.puntaje) filter (where i.numero = 3), max(p.puntaje) filter (where i.numero = 4),
         max(p.puntaje) filter (where i.numero = 5), max(p.puntaje) filter (where i.numero = 6),
         sum(p.puntaje), sum(p.puntaje) / (count(*) * 2),
         a.codigo, a.estado, e.estado, c.id, c.nombre, ar.id, a.id
  from public.s5_puntajes p
  join public.s5_items i on i.id = p.item_id
  join public.s5_evaluaciones e on e.id = p.evaluacion_id
  join public.s5_auditorias a on a.id = e.auditoria_id
  join public.s5_zonas z on z.id = e.zona_id
  join public.s5_areas ar on ar.id = a.area_id
  join public.s5_cultivos c on c.id = a.cultivo_id
  where a.estado <> 'anulada'
    and (p_cultivo is null or a.cultivo_id = p_cultivo)
    and (p_area is null or a.area_id = p_area)
  group by a.id, e.id, z.id, ar.id, c.id, i.s
  order by c.orden, ar.orden, a.fecha, a.numero_auditoria, z.numero, i.s;
$$;

drop function if exists public.fn_s5_resumen(uuid);
create or replace function public.fn_s5_resumen(p_auditoria uuid default null, p_cultivo integer default null)
returns table (
  auditoria_id uuid, codigo text, fecha date, semana integer, numero_auditoria integer, tipo text,
  estado_auditoria text, area_id integer, area text, evaluacion_id uuid, zona_id integer, numero_zona integer,
  zona text, estado_zona text, p1 numeric, p2 numeric, p3 numeric, p4 numeric, p5 numeric, total numeric, madurez text,
  cultivo_id integer, cultivo text, campana text, planta text
) language sql stable set search_path = public as $$
  with por_s as (
    select pe.id as ev_id, it.s, sum(pu.puntaje) / (count(*) * 2) as pct
    from public.s5_evaluaciones pe
    join public.s5_auditorias pa on pa.id = pe.auditoria_id
    join public.s5_puntajes pu on pu.evaluacion_id = pe.id
    join public.s5_items it on it.id = pu.item_id
    where (p_auditoria is null or pe.auditoria_id = p_auditoria)
      and (p_cultivo is null or pa.cultivo_id = p_cultivo)
    group by pe.id, it.s
  ), ev as (
    select ev_id,
           max(pct) filter (where s = 1) as p1, max(pct) filter (where s = 2) as p2,
           max(pct) filter (where s = 3) as p3, max(pct) filter (where s = 4) as p4,
           max(pct) filter (where s = 5) as p5,
           case when count(*) = 5 then avg(pct) end as total
    from por_s group by ev_id
  )
  select a.id, a.codigo, a.fecha, a.semana, a.numero_auditoria, a.tipo, a.estado, ar.id, ar.nombre,
         e.id, z.id, z.numero, z.nombre, e.estado, ev.p1, ev.p2, ev.p3, ev.p4, ev.p5, ev.total,
         public.fn_s5_madurez(ev.total), c.id, c.nombre, a.campana, a.planta
  from public.s5_evaluaciones e
  join public.s5_auditorias a on a.id = e.auditoria_id
  join public.s5_zonas z on z.id = e.zona_id
  join public.s5_areas ar on ar.id = a.area_id
  join public.s5_cultivos c on c.id = a.cultivo_id
  left join ev on ev.ev_id = e.id
  where a.estado <> 'anulada'
    and (p_auditoria is null or a.id = p_auditoria)
    and (p_cultivo is null or a.cultivo_id = p_cultivo)
  order by a.fecha desc, ar.orden, a.numero_auditoria, z.numero;
$$;

-- ================================================================ RPC: auditoría (con cultivo)
create or replace function public.rpc_s5_iniciar_auditoria(p jsonb)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare
  v public.s5_auditorias; v_area public.s5_areas; v_cul public.s5_cultivos;
  v_tipo text; v_fecha date; v_campana text; v_planta text; v_num integer;
begin
  perform public.exigir_rol('admin', 'captura');

  -- Sin cultivo (versión anterior de la app) se asume Arándano, el único que existía.
  select * into v_cul from public.s5_cultivos
   where id = coalesce(nullif(p->>'cultivo_id', '')::integer, (select id from public.s5_cultivos where nombre = 'Arándano'));
  if v_cul.id is null or not v_cul.activo then raise exception 'Elige el cultivo a auditar.'; end if;

  select * into v_area from public.s5_areas where id = nullif(p->>'area_id', '')::integer;
  if v_area.id is null or not v_area.activo then raise exception 'Elige un área válida.'; end if;
  if not exists (select 1 from public.s5_zonas where cultivo_id = v_cul.id and area_id = v_area.id and activo) then
    raise exception 'El área % no tiene zonas activas para %. Agrégalas antes de iniciar.', v_area.nombre, v_cul.nombre;
  end if;

  v_tipo := coalesce(nullif(p->>'tipo', ''), 'Inopinada');
  if v_tipo not in ('Opinada', 'Inopinada') then raise exception 'Tipo de auditoría inválido: %.', v_tipo; end if;

  v_fecha := coalesce(nullif(p->>'fecha', '')::date, public.fn_hoy_lima());
  if v_fecha > public.fn_hoy_lima() then raise exception 'La fecha de la auditoría no puede estar en el futuro.'; end if;

  v_campana := coalesce(nullif(btrim(p->>'campana'), ''), nullif(btrim(v_cul.campana), ''));
  v_planta := coalesce(nullif(btrim(p->>'planta'), ''), nullif(btrim(v_cul.planta), ''));
  if v_campana is null or v_planta is null then raise exception 'Falta la campaña o la planta de %.', v_cul.nombre; end if;

  v_num := coalesce(nullif(p->>'numero_auditoria', '')::integer,
    (select coalesce(max(numero_auditoria), 0) + 1 from public.s5_auditorias
     where cultivo_id = v_cul.id and area_id = v_area.id and campana = v_campana and estado <> 'anulada'));
  if exists (select 1 from public.s5_auditorias where cultivo_id = v_cul.id and area_id = v_area.id and campana = v_campana
             and numero_auditoria = v_num and estado <> 'anulada') then
    raise exception 'Ya existe la auditoría N° % de % (%) en la campaña %.', v_num, v_area.nombre, v_cul.nombre, v_campana;
  end if;

  insert into public.s5_auditorias (cultivo_id, area_id, numero_auditoria, tipo, fecha, campana, planta, auditor, creado_por, actualizado_por)
  values (v_cul.id, v_area.id, v_num, v_tipo, v_fecha, v_campana, v_planta, public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into v;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Auditoría iniciada', v.codigo || ' · ' || v_cul.nombre || ' · ' || v_area.nombre || ' N° ' || v_num);
  return v;
end;
$$;

create or replace function public.rpc_s5_guardar_s(p_auditoria uuid, p_zona integer, p_s integer, p_puntajes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.s5_auditorias; z public.s5_zonas; e public.s5_evaluaciones; v_faltan text; v_invalidos text;
begin
  perform public.exigir_rol('admin', 'captura');
  if p_s is null or p_s not between 1 and 5 then raise exception 'S inválida: %.', p_s; end if;

  select * into a from public.s5_auditorias where id = p_auditoria;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado <> 'en_curso' then
    raise exception 'La auditoría % está %: los puntajes se corrigen registrando un seguimiento en una observación.', a.codigo, a.estado;
  end if;
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

  if e.estado = 'completa' and public.fn_hoy_lima() > a.fecha then
    raise exception 'La zona % ya se completó. Para cambiar un puntaje registra un seguimiento en una observación (queda el historial).', z.numero || '. ' || z.nombre;
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
    values (auth.uid(), 'AUDITORIA_5S', 'Puntajes ' || p_s || 'S', a.codigo || ' · zona ' || z.numero);
  return public.fn_s5_estado_evaluacion(e.id);
end;
$$;

create or replace function public.rpc_s5_cerrar_auditoria(p_auditoria uuid)
returns public.s5_auditorias language plpgsql security definer set search_path = public as $$
declare a public.s5_auditorias; v_faltan text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into a from public.s5_auditorias where id = p_auditoria for update;
  if a.id is null then raise exception 'No existe la auditoría.'; end if;
  if a.estado <> 'en_curso' then raise exception 'La auditoría % ya está %.', a.codigo, a.estado; end if;

  select string_agg(z.numero || '. ' || z.nombre, ', ' order by z.numero) into v_faltan
  from public.s5_zonas z
  where z.area_id = a.area_id and z.cultivo_id = a.cultivo_id and z.activo
    and not exists (select 1 from public.s5_evaluaciones e where e.auditoria_id = a.id and e.zona_id = z.id and e.estado = 'completa');
  if v_faltan is not null and public.rol_actual() is distinct from 'admin' then
    raise exception 'Faltan completar zonas: %. Un administrador puede cerrarla igual.', v_faltan;
  end if;

  update public.s5_auditorias set estado = 'cerrada', cerrada_en = now(), actualizado_por = auth.uid()
    where id = a.id returning * into a;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Auditoría cerrada', a.codigo || coalesce(' · sin: ' || v_faltan, ''));
  return a;
end;
$$;

create or replace function public.rpc_s5_guardar_observacion(p jsonb)
returns public.s5_observaciones language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; z public.s5_zonas;
  v_id uuid; v_num integer; v_estado text; v_sref smallint;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Falta el identificador de la observación.'; end if;
  v_id := (p->>'id')::uuid;
  if coalesce(btrim(p->>'descripcion'), '') = '' then raise exception 'Describe la observación.'; end if;
  v_sref := case when coalesce(p->>'s_referencia', '') ~ '^[1-5]$' then (p->>'s_referencia')::smallint end;

  select * into o from public.s5_observaciones where id = v_id for update;
  if o.id is not null then
    if public.rol_actual() is distinct from 'admin' and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
      raise exception 'La observación N° % ya no se puede editar (plazo vencido). Registra un seguimiento.', o.numero;
    end if;
    update public.s5_observaciones set
      descripcion = btrim(p->>'descripcion'),
      accion_correctiva = nullif(btrim(p->>'accion_correctiva'), ''),
      s_referencia = v_sref,
      foto_antes = coalesce(nullif(p->>'foto_antes', ''), foto_antes),
      actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id returning * into o;
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AUDITORIA_5S', 'Observación editada', 'N° ' || o.numero || ' · zona ' || o.zona_id);
    return o;
  end if;

  select * into a from public.s5_auditorias where id = case when coalesce(p->>'auditoria_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'auditoria_id')::uuid end;
  if a.id is null or a.estado = 'anulada' then raise exception 'La auditoría no existe o está anulada.'; end if;
  select * into z from public.s5_zonas where id = case when coalesce(p->>'zona_id', '') ~ '^[0-9]+$' then (p->>'zona_id')::integer end;
  if z.id is null or z.area_id <> a.area_id or z.cultivo_id <> a.cultivo_id then
    raise exception 'La zona no pertenece al área y cultivo de esta auditoría.';
  end if;
  if coalesce(p->>'foto_antes', '') = '' then raise exception 'Toma la foto «Antes» de la observación.'; end if;
  v_estado := coalesce(nullif(p->>'estado', ''), 'Pendiente');
  if v_estado not in ('Pendiente', 'Recomendación') then
    raise exception 'Una observación nueva empieza como Pendiente o Recomendación.';
  end if;

  perform pg_advisory_xact_lock(hashtext('s5_observaciones_zona'), z.id);
  select coalesce(max(o2.numero), 0) + 1 into v_num
  from public.s5_observaciones o2 join public.s5_auditorias a2 on a2.id = o2.auditoria_id
  where o2.zona_id = z.id and a2.estado <> 'anulada';

  insert into public.s5_observaciones (id, auditoria_id, zona_id, numero, fecha_registro, semana, s_referencia,
    descripcion, accion_correctiva, estado, foto_antes, auditor, creado_por, actualizado_por)
  values (v_id, a.id, z.id, v_num, a.fecha, public.weeknum_excel_sistema1(a.fecha), v_sref,
    btrim(p->>'descripcion'), nullif(btrim(p->>'accion_correctiva'), ''), v_estado, p->>'foto_antes',
    public.fn_s5_mi_nombre(), auth.uid(), auth.uid())
  returning * into o;

  insert into public.s5_seguimientos (observacion_id, estado_anterior, estado_nuevo, nota, foto, usuario_id, usuario_nombre)
    values (o.id, null, o.estado, 'Registro inicial', o.foto_antes, auth.uid(), o.auditor);
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación registrada', a.codigo || ' · ' || z.numero || '. ' || z.nombre || ' · N° ' || v_num);
  return o;
end;
$$;

-- ================================================================ RPC: catálogo
create or replace function public.rpc_s5_guardar_cultivo(p jsonb)
returns public.s5_cultivos language plpgsql security definer set search_path = public as $$
declare v public.s5_cultivos;
begin
  perform public.exigir_rol('admin');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    update public.s5_cultivos set
      nombre = coalesce(nullif(btrim(p->>'nombre'), ''), nombre),
      icono = coalesce(nullif(p->>'icono', ''), icono),
      color = coalesce(nullif(p->>'color', ''), color),
      campana = case when p ? 'campana' then nullif(btrim(p->>'campana'), '') else campana end,
      planta = case when p ? 'planta' then nullif(btrim(p->>'planta'), '') else planta end,
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el cultivo.'; end if;
  else
    if coalesce(btrim(p->>'nombre'), '') = '' then raise exception 'Escribe el nombre del cultivo.'; end if;
    insert into public.s5_cultivos (nombre, icono, color, campana, planta, orden)
    values (btrim(p->>'nombre'), coalesce(nullif(p->>'icono', ''), 'hoja'), coalesce(nullif(p->>'color', ''), '#76B729'),
            nullif(btrim(p->>'campana'), ''), nullif(btrim(p->>'planta'), ''), coalesce((select max(orden) + 1 from public.s5_cultivos), 1))
    returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Cultivo guardado', v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ya existe un cultivo con ese nombre.';
end;
$$;

/** Crear: admin o captura (desde «Nueva auditoría»). Renombrar, reordenar o desactivar: solo admin. */
create or replace function public.rpc_s5_guardar_area(p jsonb)
returns public.s5_areas language plpgsql security definer set search_path = public as $$
declare v public.s5_areas; v_nombre text := btrim(coalesce(p->>'nombre', ''));
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    perform public.exigir_rol('admin');
    update public.s5_areas set
      nombre = coalesce(nullif(v_nombre, ''), nombre),
      orden = coalesce(nullif(p->>'orden', '')::integer, orden),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe el área.'; end if;
  else
    if v_nombre = '' then raise exception 'Escribe el nombre del área.'; end if;
    select * into v from public.s5_areas where lower(nombre) = lower(v_nombre);
    if v.id is not null then
      if not v.activo then raise exception 'El área % existe pero está desactivada. Pide a un administrador que la active.', v.nombre; end if;
      return v;
    end if;
    insert into public.s5_areas (nombre, orden) values (v_nombre, coalesce((select max(orden) + 1 from public.s5_areas), 1))
      returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Área guardada', v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ya existe un área con ese nombre.';
end;
$$;

create or replace function public.rpc_s5_guardar_zona(p jsonb)
returns public.s5_zonas language plpgsql security definer set search_path = public as $$
declare v public.s5_zonas; v_cul integer; v_area integer;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(p->>'id', '') ~ '^[0-9]+$' then
    perform public.exigir_rol('admin');
    update public.s5_zonas set
      numero = coalesce(nullif(p->>'numero', '')::integer, numero),
      nombre = coalesce(nullif(btrim(p->>'nombre'), ''), nombre),
      activo = coalesce((p->>'activo')::boolean, activo)
    where id = (p->>'id')::integer returning * into v;
    if v.id is null then raise exception 'No existe la zona.'; end if;
  else
    v_cul := nullif(p->>'cultivo_id', '')::integer;
    v_area := nullif(p->>'area_id', '')::integer;
    if coalesce(btrim(p->>'nombre'), '') = '' then raise exception 'Escribe el nombre de la zona.'; end if;
    if not exists (select 1 from public.s5_cultivos where id = v_cul) then raise exception 'Elige el cultivo.'; end if;
    if not exists (select 1 from public.s5_areas where id = v_area) then raise exception 'Elige el área.'; end if;
    insert into public.s5_zonas (cultivo_id, area_id, numero, nombre)
    values (v_cul, v_area,
            coalesce(nullif(p->>'numero', '')::integer, (select coalesce(max(numero), 0) + 1 from public.s5_zonas where cultivo_id = v_cul and area_id = v_area)),
            btrim(p->>'nombre'))
    returning * into v;
  end if;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'AUDITORIA_5S', 'Zona guardada', v.numero || '. ' || v.nombre);
  return v;
exception when unique_violation then
  raise exception 'Ese número de zona ya existe en el área para este cultivo.';
end;
$$;

/** Agrega varias zonas (una por nombre) a un cultivo + área, numerándolas después de las existentes. */
create or replace function public.rpc_s5_agregar_zonas(p_cultivo integer, p_area integer, p_nombres jsonb)
returns setof public.s5_zonas language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_n integer := 0; v_area public.s5_areas; v_cul public.s5_cultivos;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into v_cul from public.s5_cultivos where id = p_cultivo;
  select * into v_area from public.s5_areas where id = p_area;
  if v_cul.id is null or v_area.id is null then raise exception 'Elige el cultivo y el área.'; end if;
  if not v_area.activo then raise exception 'El área % está desactivada.', v_area.nombre; end if;
  if jsonb_typeof(p_nombres) is distinct from 'array' then raise exception 'Se esperaba la lista de zonas.'; end if;

  perform pg_advisory_xact_lock(hashtext('s5_zonas'), p_cultivo * 1000 + p_area);
  for v_nombre in select distinct btrim(value) from jsonb_array_elements_text(p_nombres) where btrim(value) <> '' loop
    if not exists (select 1 from public.s5_zonas where cultivo_id = p_cultivo and area_id = p_area and lower(nombre) = lower(v_nombre)) then
      insert into public.s5_zonas (cultivo_id, area_id, numero, nombre)
      values (p_cultivo, p_area, (select coalesce(max(numero), 0) + 1 from public.s5_zonas where cultivo_id = p_cultivo and area_id = p_area), v_nombre);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 then
    insert into public.bitacora(usuario_id, modulo, accion, detalle)
      values (auth.uid(), 'AUDITORIA_5S', 'Zonas agregadas', v_cul.nombre || ' · ' || v_area.nombre || ' · ' || v_n);
  end if;
  return query select * from public.s5_zonas where cultivo_id = p_cultivo and area_id = p_area order by numero;
end;
$$;

-- ================================================================ protección y permisos
alter table public.s5_cultivos enable row level security;
drop policy if exists s5_cultivos_select on public.s5_cultivos;
create policy s5_cultivos_select on public.s5_cultivos for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor'));
revoke insert, update, delete, truncate on public.s5_cultivos from anon, authenticated;
drop trigger if exists trg_bloquear_truncate on public.s5_cultivos;
create trigger trg_bloquear_truncate before truncate on public.s5_cultivos for each statement execute function public.fn_bloquear_vaciado();

create or replace function public.fn_s5_bloquear_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'No se eliminan filas de %: %', tg_table_name,
    case when tg_table_name in ('s5_cultivos', 's5_areas', 's5_zonas', 's5_items') then 'desactívalo desde Auditoría 5S → Catálogo.'
         else 'anula la auditoría desde la app; el historial se conserva.' end;
end;
$$;
revoke execute on function public.fn_s5_bloquear_borrado() from public, anon, authenticated;
drop trigger if exists trg_s5_bloquear_borrado on public.s5_cultivos;
create trigger trg_s5_bloquear_borrado before delete on public.s5_cultivos for each row execute function public.fn_s5_bloquear_borrado();

revoke execute on function public.fn_s5_bd(integer, integer) from public, anon;
revoke execute on function public.fn_s5_resumen(uuid, integer) from public, anon;
grant execute on function public.fn_s5_bd(integer, integer) to authenticated, service_role;
grant execute on function public.fn_s5_resumen(uuid, integer) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array['rpc_s5_guardar_cultivo(jsonb)', 'rpc_s5_agregar_zonas(integer, integer, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
