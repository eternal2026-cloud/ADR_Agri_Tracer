-- ============================================================================
-- 0047 · Estudio TOP: maestro de cosechadores, material real y lotes en cosecha
--   · top_cosechadores: lista de cosechadores TOP (DNI, nombre, fundo, líder) que se
--     carga desde Excel (plantilla descargable en la app); en la evaluación se elige
--     de la lista en vez de digitar nombre y DNI.
--   · top_evaluaciones.material: presentación real de Tiempos de ciclo (JARRA 0.5 KG,
--     BANDEJA 2.0-5.0 KG, BULK 3.5…). presentacion queda como la familia del estándar:
--     JARRA* → JARRA; bandeja y bulk (cosecha a granel) → BANDEJA.
--   · top_evaluaciones.cosechador_id y variedad.
--   · fn_top_lotes_en_cosecha(p_dias): lotes con ciclos recientes, su material y variedad
--     (security definer: el evaluador ve dónde se cosecha aunque solo vea sus propios ciclos).
--
-- Revertir:
--   drop function if exists public.fn_top_lotes_en_cosecha(int), public.rpc_top_importar_cosechadores(jsonb),
--     public.rpc_top_estado_cosechador(bigint, boolean), public.fn_top_familia(text);
--   alter table public.top_evaluaciones drop column if exists material, drop column if exists cosechador_id,
--     drop column if exists variedad;
--   drop table if exists public.top_cosechadores;
--   (y volver a crear rpc_top_guardar_evaluacion de 0046)
-- ============================================================================

create table if not exists public.top_cosechadores (
  id bigserial primary key,
  dni text not null unique,
  nombre text not null,
  fundo text,
  lider text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists top_cosechadores_nombre_idx on public.top_cosechadores (nombre);

alter table public.top_evaluaciones
  add column if not exists material text,
  add column if not exists variedad text,
  add column if not exists cosechador_id bigint references public.top_cosechadores(id);

-- Las evaluaciones ya registradas toman como material su familia.
update public.top_evaluaciones set material = case when presentacion = 'JARRA' then 'JARRA 0.5 KG' else 'BANDEJA' end where material is null;

alter table public.top_cosechadores enable row level security;
drop policy if exists top_cosechadores_leer on public.top_cosechadores;
create policy top_cosechadores_leer on public.top_cosechadores for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor') and public.fn_tiene_acceso('campo.top'));
revoke insert, update, delete on public.top_cosechadores from anon, authenticated;

/** Familia del estándar para un material: JARRA* → JARRA; bandeja y bulk (granel) → BANDEJA. */
create or replace function public.fn_top_familia(p_material text)
returns text language sql immutable set search_path = public as $$
  select case when upper(coalesce(p_material, '')) like 'JARRA%' then 'JARRA' else 'BANDEJA' end;
$$;

/** p_filas: [{ dni, nombre, fundo, lider }]. Inserta o actualiza por DNI. Devuelve { nuevos, actualizados }. */
create or replace function public.rpc_top_importar_cosechadores(p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nuevos int := 0; v_total int := 0;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_tiene_acceso('campo.top.evaluar') then
    raise exception 'No tienes acceso a «Estudio TOP · Evaluar».';
  end if;
  select count(distinct trim(x->>'dni')) into v_nuevos from jsonb_array_elements(p_filas) x
   where nullif(trim(x->>'dni'), '') is not null
     and not exists (select 1 from public.top_cosechadores c where c.dni = trim(x->>'dni'));
  insert into public.top_cosechadores (dni, nombre, fundo, lider, activo, actualizado_en)
  select distinct on (trim(x->>'dni')) trim(x->>'dni'), upper(trim(x->>'nombre')), nullif(upper(trim(x->>'fundo')), ''),
         nullif(upper(trim(x->>'lider')), ''), true, now()
  from jsonb_array_elements(p_filas) x
  where nullif(trim(x->>'dni'), '') is not null and nullif(trim(x->>'nombre'), '') is not null
  on conflict (dni) do update set nombre = excluded.nombre, fundo = coalesce(excluded.fundo, top_cosechadores.fundo),
    lider = coalesce(excluded.lider, top_cosechadores.lider), activo = true, actualizado_en = now();
  get diagnostics v_total = row_count;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'ESTUDIO_TOP', 'Cosechadores importados', v_total || ' filas (' || v_nuevos || ' nuevos)');
  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', greatest(v_total - v_nuevos, 0));
end;
$$;

create or replace function public.rpc_top_estado_cosechador(p_id bigint, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_tiene_acceso('campo.top.evaluar') then raise exception 'No tienes acceso a «Estudio TOP · Evaluar».'; end if;
  update public.top_cosechadores set activo = p_activo, actualizado_en = now() where id = p_id;
end;
$$;

/** Lotes con ciclos de cosecha en los últimos p_dias: material y variedad más frecuentes. */
create or replace function public.fn_top_lotes_en_cosecha(p_dias int default 7)
returns table (fundo text, lote text, material text, variedad text, ultima date, ciclos bigint)
language sql stable security definer set search_path = public as $$
  select c.fundo, c.lote,
         mode() within group (order by c.presentacion) as material,
         mode() within group (order by c.variedad) as variedad,
         max(c.fecha) as ultima, count(*) as ciclos
  from public.ciclos_cosecha c
  where public.rol_actual() in ('admin', 'captura', 'visor')
    and c.fecha >= (now() at time zone 'America/Lima')::date - greatest(p_dias, 0)
    and c.lote is not null and c.fundo is not null
    and coalesce(c.cultivo, 'Arándano') = 'Arándano'
  group by c.fundo, c.lote;
$$;

-- Guardar evaluación: ahora con material, variedad y cosechador del maestro.
create or replace function public.rpc_top_guardar_evaluacion(p jsonb)
returns public.top_evaluaciones language plpgsql security definer set search_path = public as $$
declare v public.top_evaluaciones; v_id uuid := nullif(p->>'id', '')::uuid;
        v_cos public.top_cosechadores; v_nombre text; v_dni text; v_lider text; v_material text;
begin
  perform public.exigir_rol('admin', 'captura');
  if nullif(p->>'cosechador_id', '') is not null then
    select * into v_cos from public.top_cosechadores where id = (p->>'cosechador_id')::bigint;
  end if;
  v_nombre := coalesce(v_cos.nombre, nullif(trim(p->>'cosechador'), ''));
  v_dni := coalesce(v_cos.dni, nullif(trim(p->>'dni'), ''));
  v_lider := coalesce(nullif(trim(p->>'lider'), ''), v_cos.lider);
  v_material := coalesce(nullif(trim(p->>'material'), ''), case when p->>'presentacion' = 'JARRA' then 'JARRA 0.5 KG' else 'BANDEJA' end);
  if v_nombre is null then raise exception 'Elige al cosechador TOP.'; end if;
  if nullif(p->>'fundo', '') is not null and not public.fn_fundo_permitido(p->>'fundo') then
    raise exception 'No tienes asignado el fundo %.', p->>'fundo';
  end if;
  if v_id is null then
    insert into public.top_evaluaciones (fecha, fundo, lote, presentacion, material, variedad, cosechador, cosechador_id, dni, lider, labor,
                                         herramienta, observaciones, evaluador_id, evaluador_txt)
    values (coalesce(nullif(p->>'fecha', '')::date, (now() at time zone 'America/Lima')::date), nullif(p->>'fundo', ''),
            upper(nullif(trim(p->>'lote'), '')), public.fn_top_familia(v_material), upper(v_material), nullif(upper(trim(p->>'variedad')), ''),
            v_nombre, v_cos.id, v_dni, v_lider, coalesce(nullif(trim(p->>'labor'), ''), 'Cosecha de arándano'),
            nullif(trim(p->>'herramienta'), ''), nullif(trim(p->>'observaciones'), ''), auth.uid(),
            (select nombre from public.perfiles where id = auth.uid()))
    returning * into v;
    insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'Evaluación creada', v.codigo || ' · ' || v.cosechador);
  else
    if not public.fn_top_puede_editar(v_id) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
    update public.top_evaluaciones set
      fecha = coalesce(nullif(p->>'fecha', '')::date, fecha), fundo = nullif(p->>'fundo', ''), lote = upper(nullif(trim(p->>'lote'), '')),
      material = upper(v_material), presentacion = public.fn_top_familia(v_material), variedad = nullif(upper(trim(p->>'variedad')), ''),
      cosechador = v_nombre, cosechador_id = v_cos.id, dni = v_dni, lider = v_lider,
      labor = coalesce(nullif(trim(p->>'labor'), ''), labor),
      herramienta = nullif(trim(p->>'herramienta'), ''), observaciones = nullif(trim(p->>'observaciones'), ''), actualizado_en = now()
    where id = v_id returning * into v;
  end if;
  return v;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['rpc_top_importar_cosechadores(jsonb)', 'rpc_top_estado_cosechador(bigint, boolean)',
                           'fn_top_lotes_en_cosecha(int)', 'rpc_top_guardar_evaluacion(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
