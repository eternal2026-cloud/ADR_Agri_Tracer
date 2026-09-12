-- 0003: Personal de reubicación + auditoría de escaneos
create table public.reub_personal (
  dni text primary key,
  nombre text,
  linea text,
  lado text check (lado in ('IZQUIERDO','DERECHO') or lado is null),
  labor text,
  obs text,
  activo boolean not null default true,
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);

create table public.reub_escaneos (
  id bigserial primary key,
  ocurrido_en timestamptz not null default now(),
  dni_leido text,
  encontrado boolean not null,
  nombre text,
  linea text,
  lado text,
  labor text,
  texto_crudo text,
  origen text not null check (origen in ('escaner','manual')),
  dispositivo_id text,
  perfil_id uuid references public.perfiles(id),
  creado_en timestamptz not null default now()
);

create index reub_escaneos_fecha_idx on public.reub_escaneos (ocurrido_en desc);
