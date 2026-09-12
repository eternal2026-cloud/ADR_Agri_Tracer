-- 0001: Núcleo global (perfiles, parámetros, listas maestras, bitácora)
create extension if not exists pgcrypto;

create type public.rol_app as enum ('admin', 'captura', 'visor');

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text unique not null,
  nombre text not null,
  area text,
  rol public.rol_app not null default 'visor',
  activo boolean not null default true,
  debe_cambiar_password boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);

create table public.parametros (
  clave text primary key,
  valor text not null,
  descripcion text,
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);

create table public.listas_maestras (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fundo','variedad','calibre','presentacion','tareadora')),
  valor text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (tipo, valor)
);

create table public.bitacora (
  id bigserial primary key,
  usuario_id uuid references public.perfiles(id),
  usuario_txt text,
  modulo text not null,
  accion text not null,
  detalle text,
  creado_en timestamptz not null default now()
);

-- Helper de rol, usado por todas las políticas RLS.
create or replace function public.rol_actual()
returns public.rol_app language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- Parámetros iniciales (idempotente: no falla si ya existen).
insert into public.parametros (clave, valor, descripcion) values
  ('UMBRAL_TIEMPO_CICLO_MIN', '480', 'Minutos máximos de un ciclo completo; por encima se excluye del promedio por posible error de digitación.'),
  ('SHEETS_SYNC_MINUTOS', '60', 'Cada cuántos minutos se sincroniza el espejo de auditoría en Google Sheets.'),
  ('ULTIMA_SYNC_SHEETS', '', 'Marca de tiempo de la última sincronización exitosa hacia Sheets.'),
  ('ULTIMO_ERROR_SYNC_SHEETS', '', 'Último error de sincronización hacia Sheets (vacío si todo bien).')
on conflict (clave) do nothing;
