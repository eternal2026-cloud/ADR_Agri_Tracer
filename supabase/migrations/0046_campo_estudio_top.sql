-- ============================================================================
-- 0046 · Ingeniería · Campo › Estudio de cosechador TOP (arándano)
-- Sustento técnico para actualizar los estándares de cosecha a partir del
-- personal TOP (todos los evaluados ya son TOP: no se registra producción).
--   · top_actividades     catálogo «LISTA Actividades» (Evaluación Líderes TOP.xlsx) con su clase
--   · top_estandar_items  checklist de las hojas «INSTRUCTIVO - LUP» y «FORMATO»
--   · top_evaluaciones    una evaluación = un cosechador TOP en un día/lote/presentación
--   · top_tiempos         toma de tiempo por actividad aislada (inicio/fin con segundos)
--   · top_cumplimiento    Cumple / No cumple / No aplica + «cómo lo hace el TOP» + fotos
--   · top_reba            hoja «CHECKLIST REBA»; el puntaje se recalcula aquí (tablas A, B, C)
--   · top_ergonomia       hoja «CHECK LIST ERGONOMIA» (SI/NO/NS-NC y momentos de dolor)
--   · top_propuestas      cambios propuestos al estándar con su sustento (los aprueba un admin)
-- Lectura por RLS (rol + acceso campo.top); escritura solo por rpc_top_* (security definer).
-- Fotos en el bucket privado «estudio-top».
--
-- Revertir:
--   drop table if exists public.top_propuestas, public.top_ergonomia, public.top_reba,
--     public.top_cumplimiento, public.top_tiempos, public.top_evaluaciones,
--     public.top_estandar_items, public.top_actividades cascade;
--   drop function if exists public.fn_top_reba_calcular() , public.fn_top_reba_puntaje(jsonb),
--     public.rpc_top_guardar_evaluacion(jsonb), public.rpc_top_anular_evaluacion(uuid, boolean),
--     public.rpc_top_guardar_tiempo(jsonb), public.rpc_top_borrar_tiempo(bigint),
--     public.rpc_top_guardar_cumplimiento(uuid, jsonb), public.rpc_top_guardar_reba(jsonb),
--     public.rpc_top_borrar_reba(bigint), public.rpc_top_guardar_ergonomia(uuid, jsonb, jsonb),
--     public.rpc_top_guardar_propuesta(jsonb), public.rpc_top_estado_propuesta(bigint, text),
--     public.fn_top_puede_editar(uuid);
--   drop policy if exists top_fotos_insertar on storage.objects;
--   drop policy if exists top_fotos_leer on storage.objects;
--   delete from storage.buckets where id = 'estudio-top';  -- solo si está vacío
-- ============================================================================

-- ================================================================ catálogos
create table if not exists public.top_actividades (
  id smallint primary key,
  nombre text not null unique,
  -- productiva: agrega valor · soporte: necesaria · espera: eliminable · personal: necesidad del trabajador
  clase text not null check (clase in ('productiva', 'soporte', 'espera', 'personal')),
  orden smallint not null default 0,
  activo boolean not null default true
);

insert into public.top_actividades (id, nombre, clase, orden) values
  (1, 'Charla de inicio de jornada', 'soporte', 1),
  (2, 'Abastecimiento y orden de materiales y herramientas', 'soporte', 2),
  (3, 'Inicio de jornada', 'soporte', 3),
  (4, 'Cosecha', 'productiva', 4),
  (5, 'Reabastecimiento y orden de materiales y herramientas', 'soporte', 5),
  (6, 'Rectificación de fruta en CS', 'soporte', 6),
  (7, 'Almuerzo', 'personal', 7),
  (8, 'Cambio de lote', 'soporte', 8),
  (9, 'Rectificación - remanente', 'soporte', 9),
  (10, 'Cambio de casa sombra', 'soporte', 10),
  (11, 'Fin de jornada', 'soporte', 11),
  (12, 'Espera de jabas/jarras vacías', 'espera', 12),
  (13, 'Espera de recojo de fruta cosechada', 'espera', 13),
  (14, 'Falta de material de cosecha', 'espera', 14),
  (15, 'Espera de instrucciones del supervisor', 'espera', 15),
  (16, 'Reunión por rechazo de calidad en CS', 'espera', 16),
  (17, 'Reunión con la líder', 'soporte', 17),
  (18, 'Incidentes', 'espera', 18),
  (19, 'SSHH', 'personal', 19)
on conflict (id) do nothing;

create table if not exists public.top_estandar_items (
  id serial primary key,
  tipo text not null check (tipo in ('INSTRUCTIVO', 'LUP', 'FORMATO')),
  presentacion text not null check (presentacion in ('BANDEJA', 'JARRA')),
  estandar text not null,
  descripcion text not null,
  numero text,
  orden smallint not null default 0,
  activo boolean not null default true,
  unique (tipo, presentacion, descripcion)
);

insert into public.top_estandar_items (tipo, presentacion, estandar, descripcion, numero, orden) values
  ('INSTRUCTIVO', 'BANDEJA', 'Cosecha de arándano - granel', 'Coger 3 bandejas blancas y ubicarlas dentro del atril.', '1', 1),
  ('INSTRUCTIVO', 'BANDEJA', 'Cosecha de arándano - granel', 'Cosechar las bayas en la jarra cosechera y colocarlas en la bandeja blanca, cuidando de no maltratar la fruta.', '2', 2),
  ('INSTRUCTIVO', 'BANDEJA', 'Cosecha de arándano - granel', 'Colocar las bayas defectuosas en el pote de descarte.', '3', 3),
  ('INSTRUCTIVO', 'BANDEJA', 'Cosecha de arándano - granel', 'Continuar con el llenado de las jabas blancas con bayas hasta la capacidad indicada por el supervisor.', '4', 4),
  ('LUP', 'BANDEJA', 'Guía para la cosecha', 'Iniciar la cosecha desde la parte baja hasta la zona media de la planta.', '1', 11),
  ('LUP', 'BANDEJA', 'Guía para la cosecha', 'Continuar con la cosecha en la parte superior de la planta.', '2', 12),
  ('LUP', 'BANDEJA', 'Guía para la cosecha', 'Finalizar la cosecha recolectando los frutos de la parte interna de la planta.', '3', 13),
  ('LUP', 'BANDEJA', 'Guía para la cosecha', 'Coger la rama que tiene las bayas azules. Girar la baya de forma horaria para evitar daño en la inserción del pedicelo.', '4', 14),
  ('LUP', 'BANDEJA', 'Guía para la cosecha', 'Evitar coger más de 5 bayas en la palma de la mano.', '5', 15),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'Recolectar jarras cosecheras vacías y ordenarlas en las jabas dentro del atril.', '1', 1),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'Colocar y ajustar correctamente la correa. Colgar dos jarras cosecheras (una equipada con tamiz) y un pote de descarte.', '2', 2),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'De acuerdo a la indicación del supervisor, colocar: tamiz 16 en jarra de calibre 12, tamiz 18 en jarra de calibre 16 y tamiz 20 en jarra de calibre 18.', '3', 3),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'Llenar la jarra cosechera con bayas hasta la capacidad indicada por el supervisor.', '4', 4),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'Colocar las bayas defectuosas en el pote de descarte.', '5', 5),
  ('INSTRUCTIVO', 'JARRA', 'Cosecha de arándano - jarra cosechera', 'Retirar las jarras completadas de la correa y colocarlas en las jabas verdes que se encuentran en el atril.', '6', 6),
  ('LUP', 'JARRA', 'Guía para la cosecha', 'Iniciar la cosecha desde la parte baja hasta la zona media de la planta.', '1', 11),
  ('LUP', 'JARRA', 'Guía para la cosecha', 'Continuar con la cosecha en la parte superior de la planta.', '2', 12),
  ('LUP', 'JARRA', 'Guía para la cosecha', 'Finalizar la cosecha recolectando los frutos de la parte interna de la planta.', '3', 13),
  ('LUP', 'JARRA', 'Guía para la cosecha', 'Coger la rama que tiene las bayas azules. Girar la baya de forma horaria para evitar daño en la inserción del pedicelo.', '4', 14),
  ('LUP', 'JARRA', 'Guía para la cosecha', 'Evitar coger más de 5 bayas en la palma de la mano.', '5', 15),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Sombrilla', '1', 21),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Careta de protección de abejas', '2', 22),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Pote de descarte', '3', 23),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Cinturón o correa', '4', 24),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Jarra cosechera', '5', 25),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Atril', '6', 26),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Guía de defectos', '7', 27),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'Bandejas blancas', '8', 28),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'No está permitido tener más de 1 jarra cosechera en la correa', null, 29),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'No está permitido tener más de 3 bandejas blancas en el atril', null, 30),
  ('FORMATO', 'BANDEJA', 'Estándar de puesto de trabajo - cosecha a granel', 'No está permitido colocar bandejas blancas en el suelo', null, 31),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Sombrilla', '1', 21),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Caretas de protección de abejas', '2', 22),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Pote de descarte', '3', 23),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Tamiz', '4', 24),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Cinturón o correa', '5', 25),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Jarras cosecheras', '6', 26),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Atril', '7', 27),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Guía de defectos', '8', 28),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'Jabas verdes', '9', 29),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'No está permitido tener más de 2 jarras cosecheras en la correa', null, 30),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'No está permitido tener más de 2 jabas verdes en el atril', null, 31),
  ('FORMATO', 'JARRA', 'Estándar de puesto de trabajo - cosecha en jarra cosechera', 'No está permitido colocar las jabas en el suelo', null, 32)
on conflict (tipo, presentacion, descripcion) do nothing;

-- ================================================================ evaluaciones
create sequence if not exists public.top_evaluaciones_seq;

create table if not exists public.top_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default 'TOP-' || lpad(nextval('public.top_evaluaciones_seq')::text, 4, '0'),
  fecha date not null default (now() at time zone 'America/Lima')::date,
  fundo text,
  lote text,
  presentacion text not null check (presentacion in ('BANDEJA', 'JARRA')),
  cosechador text not null,
  dni text,
  lider text,
  labor text not null default 'Cosecha de arándano',
  herramienta text,
  observaciones text,
  evaluador_id uuid default auth.uid() references public.perfiles(id),
  evaluador_txt text,
  anulada boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists top_evaluaciones_fecha_idx on public.top_evaluaciones (fecha desc);

create table if not exists public.top_tiempos (
  id bigserial primary key,
  evaluacion_id uuid not null references public.top_evaluaciones(id) on delete cascade,
  actividad_id smallint not null references public.top_actividades(id),
  inicio timestamptz not null,
  fin timestamptz,
  duracion_seg integer generated always as (extract(epoch from (fin - inicio))::integer) stored,
  nota text,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index if not exists top_tiempos_eval_idx on public.top_tiempos (evaluacion_id);

create table if not exists public.top_cumplimiento (
  evaluacion_id uuid not null references public.top_evaluaciones(id) on delete cascade,
  item_id integer not null references public.top_estandar_items(id),
  resultado text check (resultado in ('C', 'NC', 'NA')),
  observacion text,
  practica_top text,
  fotos text[] not null default '{}',
  actualizado_en timestamptz not null default now(),
  primary key (evaluacion_id, item_id)
);

create table if not exists public.top_reba (
  id bigserial primary key,
  evaluacion_id uuid not null references public.top_evaluaciones(id) on delete cascade,
  actividad_id smallint references public.top_actividades(id),
  momento text,
  -- Grupo A
  cuello smallint not null check (cuello between 1 and 2),
  cuello_mod boolean not null default false,
  tronco smallint not null check (tronco between 1 and 4),
  tronco_mod boolean not null default false,
  piernas smallint not null check (piernas between 1 and 2),
  piernas_mod smallint not null default 0 check (piernas_mod between 0 and 2),
  carga smallint not null default 0 check (carga between 0 and 2),
  carga_brusca boolean not null default false,
  -- Grupo B
  brazo smallint not null check (brazo between 1 and 4),
  brazo_elevado boolean not null default false,
  brazo_apoyo boolean not null default false,
  antebrazo smallint not null check (antebrazo between 1 and 2),
  muneca smallint not null check (muneca between 1 and 2),
  muneca_mod boolean not null default false,
  agarre smallint not null default 0 check (agarre between 0 and 3),
  -- Actividad muscular
  act_estatica boolean not null default false,
  act_repetitiva boolean not null default false,
  act_inestable boolean not null default false,
  -- Calculados por fn_top_reba_calcular (no confiar en el navegador)
  tabla_a smallint, puntaje_a smallint, tabla_b smallint, puntaje_b smallint, puntaje_c smallint,
  puntaje_final smallint, nivel smallint, riesgo text,
  fotos text[] not null default '{}',
  observacion text,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists top_reba_eval_idx on public.top_reba (evaluacion_id);

create table if not exists public.top_ergonomia (
  evaluacion_id uuid primary key references public.top_evaluaciones(id) on delete cascade,
  respuestas jsonb not null default '{}'::jsonb,   -- { "1.1": "SI" | "NO" | "NS", … }
  dolor jsonb not null default '{}'::jsonb,        -- { "2.1": [1, 2], … } momentos 1-5
  actualizado_en timestamptz not null default now()
);

create table if not exists public.top_propuestas (
  id bigserial primary key,
  ambito text not null check (ambito in ('estandar', 'actividad', 'ergonomia', 'otro')),
  tipo text not null check (tipo in ('mantener', 'modificar', 'eliminar', 'nuevo', 'reducir')),
  presentacion text check (presentacion in ('BANDEJA', 'JARRA')),
  item_id integer references public.top_estandar_items(id),
  actividad_id smallint references public.top_actividades(id),
  texto_actual text,
  texto_propuesto text,
  tiempo_estandar_seg integer,
  sustento text,
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'descartada')),
  creado_por uuid default auth.uid() references public.perfiles(id),
  aprobado_por uuid references public.perfiles(id),
  aprobado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ================================================================ REBA (tablas A, B y C oficiales)
/** Puntaje REBA desde el jsonb de una fila top_reba. Devuelve tabla_a, puntaje_a, tabla_b, puntaje_b, c, final, nivel, riesgo. */
create or replace function public.fn_top_reba_puntaje(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  -- Tabla A [tronco 1-5][cuello 1-3][piernas 1-4] aplanada: ((tronco-1)*3 + cuello-1)*4 + piernas
  ta int[] := array[1,2,3,4, 1,2,3,4, 3,3,5,6,
                    2,3,4,5, 3,4,5,6, 4,5,6,7,
                    2,4,5,6, 4,5,6,7, 5,6,7,8,
                    3,5,6,7, 5,6,7,8, 6,7,8,9,
                    4,6,7,8, 6,7,8,9, 7,8,9,9];
  -- Tabla B [brazo 1-6][antebrazo 1-2][muñeca 1-3]: ((brazo-1)*2 + antebrazo-1)*3 + muñeca
  tb int[] := array[1,2,2, 1,2,3,
                    1,2,3, 2,3,4,
                    3,4,5, 4,5,5,
                    4,5,5, 5,6,7,
                    6,7,8, 7,8,8,
                    7,8,8, 8,9,9];
  -- Tabla C [A 1-12][B 1-12]
  tc int[] := array[
     1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7,
     1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8,
     2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8,
     3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9,
     4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9,
     6, 6, 6, 7, 8, 8, 9, 9,10,10,10,10,
     7, 7, 7, 8, 9, 9, 9,10,10,11,11,11,
     8, 8, 8, 9,10,10,10,10,10,11,11,11,
     9, 9, 9,10,10,10,11,11,11,12,12,12,
    10,10,10,11,11,11,11,12,12,12,12,12,
    11,11,11,11,12,12,12,12,12,12,12,12,
    12,12,12,12,12,12,12,12,12,12,12,12];
  cu int; tr int; pi int; br int; an int; mu int;
  a int; b int; pa int; pb int; c int; f int; nv int;
begin
  cu := least(3, (p->>'cuello')::int + case when (p->>'cuello_mod')::boolean then 1 else 0 end);
  tr := least(5, (p->>'tronco')::int + case when (p->>'tronco_mod')::boolean then 1 else 0 end);
  pi := least(4, (p->>'piernas')::int + coalesce((p->>'piernas_mod')::int, 0));
  br := greatest(1, least(6, (p->>'brazo')::int + case when (p->>'brazo_elevado')::boolean then 1 else 0 end
                                               - case when (p->>'brazo_apoyo')::boolean then 1 else 0 end));
  an := (p->>'antebrazo')::int;
  mu := least(3, (p->>'muneca')::int + case when (p->>'muneca_mod')::boolean then 1 else 0 end);
  a := ta[((tr - 1) * 3 + cu - 1) * 4 + pi];
  b := tb[((br - 1) * 2 + an - 1) * 3 + mu];
  pa := least(12, a + coalesce((p->>'carga')::int, 0) + case when (p->>'carga_brusca')::boolean then 1 else 0 end);
  pb := least(12, b + coalesce((p->>'agarre')::int, 0));
  c := tc[(pa - 1) * 12 + pb];
  f := c + case when (p->>'act_estatica')::boolean then 1 else 0 end
         + case when (p->>'act_repetitiva')::boolean then 1 else 0 end
         + case when (p->>'act_inestable')::boolean then 1 else 0 end;
  nv := case when f = 1 then 0 when f <= 3 then 1 when f <= 7 then 2 when f <= 10 then 3 else 4 end;
  return jsonb_build_object('tabla_a', a, 'puntaje_a', pa, 'tabla_b', b, 'puntaje_b', pb, 'puntaje_c', c,
    'puntaje_final', f, 'nivel', nv,
    'riesgo', (array['Inapreciable', 'Bajo', 'Medio', 'Alto', 'Muy alto'])[nv + 1]);
end;
$$;

create or replace function public.fn_top_reba_calcular()
returns trigger language plpgsql set search_path = public as $$
declare r jsonb := public.fn_top_reba_puntaje(to_jsonb(new));
begin
  new.tabla_a := (r->>'tabla_a')::smallint;  new.puntaje_a := (r->>'puntaje_a')::smallint;
  new.tabla_b := (r->>'tabla_b')::smallint;  new.puntaje_b := (r->>'puntaje_b')::smallint;
  new.puntaje_c := (r->>'puntaje_c')::smallint;
  new.puntaje_final := (r->>'puntaje_final')::smallint;
  new.nivel := (r->>'nivel')::smallint;  new.riesgo := r->>'riesgo';
  return new;
end;
$$;
drop trigger if exists trg_top_reba_calcular on public.top_reba;
create trigger trg_top_reba_calcular before insert or update on public.top_reba
  for each row execute function public.fn_top_reba_calcular();

-- ================================================================ accesos (0024)
drop trigger if exists trg_top_evaluacion_acceso on public.top_evaluaciones;
create trigger trg_top_evaluacion_acceso before insert or update on public.top_evaluaciones
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');
drop trigger if exists trg_top_tiempo_acceso on public.top_tiempos;
create trigger trg_top_tiempo_acceso before insert or update on public.top_tiempos
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');
drop trigger if exists trg_top_cumplimiento_acceso on public.top_cumplimiento;
create trigger trg_top_cumplimiento_acceso before insert or update on public.top_cumplimiento
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');
drop trigger if exists trg_top_reba_acceso on public.top_reba;
create trigger trg_top_reba_acceso before insert or update on public.top_reba
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');
drop trigger if exists trg_top_ergonomia_acceso on public.top_ergonomia;
create trigger trg_top_ergonomia_acceso before insert or update on public.top_ergonomia
  for each row execute function public.fn_exigir_acceso('campo.top.evaluar', 'Estudio TOP · Evaluar');
drop trigger if exists trg_top_propuesta_acceso on public.top_propuestas;
create trigger trg_top_propuesta_acceso before insert or update on public.top_propuestas
  for each row execute function public.fn_exigir_acceso('campo.top.propuesta', 'Estudio TOP · Propuesta');

-- ================================================================ RLS: solo lectura
do $$
declare t text;
begin
  foreach t in array array['top_actividades', 'top_estandar_items', 'top_evaluaciones', 'top_tiempos',
                           'top_cumplimiento', 'top_reba', 'top_ergonomia', 'top_propuestas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rol_actual() in (''admin'', ''captura'', ''visor'') and public.fn_tiene_acceso(''campo.top''))', t || '_leer', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ================================================================ RPC de escritura
/** Admin, o quien creó la evaluación (con rol captura). */
create or replace function public.fn_top_puede_editar(p_eval uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rol_actual() = 'admin'
      or (public.rol_actual() = 'captura' and exists (
            select 1 from public.top_evaluaciones e where e.id = p_eval and e.evaluador_id = auth.uid() and not e.anulada));
$$;
revoke execute on function public.fn_top_puede_editar(uuid) from public, anon;
grant execute on function public.fn_top_puede_editar(uuid) to authenticated;

create or replace function public.rpc_top_guardar_evaluacion(p jsonb)
returns public.top_evaluaciones language plpgsql security definer set search_path = public as $$
declare v public.top_evaluaciones; v_id uuid := nullif(p->>'id', '')::uuid;
begin
  perform public.exigir_rol('admin', 'captura');
  if coalesce(trim(p->>'cosechador'), '') = '' then raise exception 'Falta el nombre del cosechador.'; end if;
  if nullif(p->>'fundo', '') is not null and not public.fn_fundo_permitido(p->>'fundo') then
    raise exception 'No tienes asignado el fundo %.', p->>'fundo';
  end if;
  if v_id is null then
    insert into public.top_evaluaciones (fecha, fundo, lote, presentacion, cosechador, dni, lider, labor, herramienta, observaciones, evaluador_id, evaluador_txt)
    values (coalesce(nullif(p->>'fecha', '')::date, (now() at time zone 'America/Lima')::date), nullif(p->>'fundo', ''),
            upper(nullif(trim(p->>'lote'), '')), p->>'presentacion', trim(p->>'cosechador'), nullif(trim(p->>'dni'), ''),
            nullif(trim(p->>'lider'), ''), coalesce(nullif(trim(p->>'labor'), ''), 'Cosecha de arándano'),
            nullif(trim(p->>'herramienta'), ''), nullif(trim(p->>'observaciones'), ''), auth.uid(),
            (select nombre from public.perfiles where id = auth.uid()))
    returning * into v;
    insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'Evaluación creada', v.codigo || ' · ' || v.cosechador);
  else
    if not public.fn_top_puede_editar(v_id) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
    update public.top_evaluaciones set
      fecha = coalesce(nullif(p->>'fecha', '')::date, fecha), fundo = nullif(p->>'fundo', ''), lote = upper(nullif(trim(p->>'lote'), '')),
      presentacion = coalesce(p->>'presentacion', presentacion), cosechador = trim(p->>'cosechador'), dni = nullif(trim(p->>'dni'), ''),
      lider = nullif(trim(p->>'lider'), ''), labor = coalesce(nullif(trim(p->>'labor'), ''), labor),
      herramienta = nullif(trim(p->>'herramienta'), ''), observaciones = nullif(trim(p->>'observaciones'), ''), actualizado_en = now()
    where id = v_id returning * into v;
  end if;
  return v;
end;
$$;

create or replace function public.rpc_top_anular_evaluacion(p_id uuid, p_anular boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin', 'captura');
  if public.rol_actual() <> 'admin' and not exists (select 1 from public.top_evaluaciones where id = p_id and evaluador_id = auth.uid()) then
    raise exception 'Solo quien creó la evaluación (o un admin) puede anularla.';
  end if;
  update public.top_evaluaciones set anulada = p_anular, actualizado_en = now() where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'ESTUDIO_TOP', case when p_anular then 'Evaluación anulada' else 'Evaluación restaurada' end, p_id::text);
end;
$$;

create or replace function public.rpc_top_guardar_tiempo(p jsonb)
returns public.top_tiempos language plpgsql security definer set search_path = public as $$
declare v public.top_tiempos; v_id bigint := nullif(p->>'id', '')::bigint; v_eval uuid := (p->>'evaluacion_id')::uuid;
begin
  perform public.exigir_rol('admin', 'captura');
  if v_id is not null then select evaluacion_id into v_eval from public.top_tiempos where id = v_id; end if;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede registrar tiempos.'; end if;
  if v_id is null then
    insert into public.top_tiempos (evaluacion_id, actividad_id, inicio, fin, nota)
    values (v_eval, (p->>'actividad_id')::smallint, (p->>'inicio')::timestamptz, nullif(p->>'fin', '')::timestamptz, nullif(trim(p->>'nota'), ''))
    returning * into v;
  else
    update public.top_tiempos set actividad_id = (p->>'actividad_id')::smallint, inicio = (p->>'inicio')::timestamptz,
      fin = nullif(p->>'fin', '')::timestamptz, nota = nullif(trim(p->>'nota'), '')
    where id = v_id returning * into v;
  end if;
  return v;
end;
$$;

create or replace function public.rpc_top_borrar_tiempo(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  perform public.exigir_rol('admin', 'captura');
  select evaluacion_id into v_eval from public.top_tiempos where id = p_id;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede borrar tiempos.'; end if;
  delete from public.top_tiempos where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'Tiempo borrado', p_id::text);
end;
$$;

/** p_items: [{ item_id, resultado, observacion, practica_top, fotos: [] }] */
create or replace function public.rpc_top_guardar_cumplimiento(p_eval uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  insert into public.top_cumplimiento (evaluacion_id, item_id, resultado, observacion, practica_top, fotos, actualizado_en)
  select p_eval, (x->>'item_id')::int, nullif(x->>'resultado', ''), nullif(trim(x->>'observacion'), ''), nullif(trim(x->>'practica_top'), ''),
         coalesce(array(select jsonb_array_elements_text(coalesce(x->'fotos', '[]'::jsonb))), '{}'), now()
  from jsonb_array_elements(p_items) x
  on conflict (evaluacion_id, item_id) do update set resultado = excluded.resultado, observacion = excluded.observacion,
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

create or replace function public.rpc_top_borrar_reba(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  perform public.exigir_rol('admin', 'captura');
  select evaluacion_id into v_eval from public.top_reba where id = p_id;
  if not public.fn_top_puede_editar(v_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede borrarla.'; end if;
  delete from public.top_reba where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'REBA borrado', p_id::text);
end;
$$;

create or replace function public.rpc_top_guardar_ergonomia(p_eval uuid, p_respuestas jsonb, p_dolor jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin', 'captura');
  if not public.fn_top_puede_editar(p_eval) then raise exception 'Solo quien creó la evaluación (o un admin) puede editarla.'; end if;
  insert into public.top_ergonomia (evaluacion_id, respuestas, dolor, actualizado_en)
  values (p_eval, coalesce(p_respuestas, '{}'), coalesce(p_dolor, '{}'), now())
  on conflict (evaluacion_id) do update set respuestas = excluded.respuestas, dolor = excluded.dolor, actualizado_en = now();
end;
$$;

create or replace function public.rpc_top_guardar_propuesta(p jsonb)
returns public.top_propuestas language plpgsql security definer set search_path = public as $$
declare v public.top_propuestas; v_id bigint := nullif(p->>'id', '')::bigint;
begin
  perform public.exigir_rol('admin', 'captura');
  if v_id is not null and public.rol_actual() <> 'admin' and not exists (
       select 1 from public.top_propuestas where id = v_id and creado_por = auth.uid() and estado = 'borrador') then
    raise exception 'Solo quien creó la propuesta (o un admin) puede editarla mientras está en borrador.';
  end if;
  if v_id is null then
    insert into public.top_propuestas (ambito, tipo) values (p->>'ambito', p->>'tipo') returning id into v_id;
  end if;
  update public.top_propuestas set ambito = p->>'ambito', tipo = p->>'tipo', presentacion = nullif(p->>'presentacion', ''),
    item_id = nullif(p->>'item_id', '')::int, actividad_id = nullif(p->>'actividad_id', '')::smallint,
    texto_actual = nullif(trim(p->>'texto_actual'), ''), texto_propuesto = nullif(trim(p->>'texto_propuesto'), ''),
    tiempo_estandar_seg = nullif(p->>'tiempo_estandar_seg', '')::int, sustento = nullif(trim(p->>'sustento'), ''),
    actualizado_en = now()
  where id = v_id returning * into v;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'Propuesta guardada', v_id::text);
  return v;
end;
$$;

create or replace function public.rpc_top_estado_propuesta(p_id bigint, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin', 'captura');
  if p_estado in ('aprobada') and public.rol_actual() <> 'admin' then raise exception 'Solo un administrador aprueba propuestas.'; end if;
  if public.rol_actual() <> 'admin' and not exists (select 1 from public.top_propuestas where id = p_id and creado_por = auth.uid()) then
    raise exception 'Solo quien creó la propuesta (o un admin) puede cambiar su estado.';
  end if;
  update public.top_propuestas set estado = p_estado,
    aprobado_por = case when p_estado = 'aprobada' then auth.uid() else null end,
    aprobado_en = case when p_estado = 'aprobada' then now() else null end, actualizado_en = now()
  where id = p_id;
  insert into public.bitacora(usuario_id, modulo, accion, detalle) values (auth.uid(), 'ESTUDIO_TOP', 'Propuesta ' || p_estado, p_id::text);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['rpc_top_guardar_evaluacion(jsonb)', 'rpc_top_anular_evaluacion(uuid, boolean)',
    'rpc_top_guardar_tiempo(jsonb)', 'rpc_top_borrar_tiempo(bigint)', 'rpc_top_guardar_cumplimiento(uuid, jsonb)',
    'rpc_top_guardar_reba(jsonb)', 'rpc_top_borrar_reba(bigint)', 'rpc_top_guardar_ergonomia(uuid, jsonb, jsonb)',
    'rpc_top_guardar_propuesta(jsonb)', 'rpc_top_estado_propuesta(bigint, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.fn_top_reba_calcular() from public, anon, authenticated;

-- ================================================================ fotos (Storage privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estudio-top', 'estudio-top', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists top_fotos_insertar on storage.objects;
create policy top_fotos_insertar on storage.objects for insert to authenticated
  with check (bucket_id = 'estudio-top' and public.rol_actual() in ('admin', 'captura'));
drop policy if exists top_fotos_leer on storage.objects;
create policy top_fotos_leer on storage.objects for select to authenticated
  using (bucket_id = 'estudio-top' and public.rol_actual() in ('admin', 'captura', 'visor'));
