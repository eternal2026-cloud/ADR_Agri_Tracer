-- 0002: Ciclos de cosecha (Tiempos de Ciclo) + réplica de fórmulas del Excel
create sequence public.ciclos_codigo_seq start 1;

create table public.ciclos_cosecha (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,

  -- Entrada: Cosecha
  fecha date not null,
  fundo text not null,
  lote text,
  lider text,
  presentacion text,
  variedad text,
  calibre text,
  inicio_cosecha timestamptz,
  fin_cosecha timestamptz,

  -- Entrada: Jabero
  inicio_jabero timestamptz,
  fin_jabero timestamptz,
  num_jabas integer,
  obs_jaba text,

  -- Entrada: Motocarga / Casa Sombra
  placa text,
  hora_llegada_moto timestamptz,
  inicio_carga_moto timestamptz,
  fin_carga_moto timestamptz,
  inicio_traslado_ca timestamptz,
  fin_traslado_ca timestamptz,

  -- Entrada: Centro de Acopio
  num_jabas_2 integer,
  obs_jabas_2 text,
  inicio_descarga_ca timestamptz,
  fin_descarga_ca timestamptz,
  num_pallets integer,
  presentaciones text,
  placa_camion text,

  -- Entrada: Camión / Planta
  inicio_carga_camion timestamptz,
  fin_carga_camion timestamptz,
  inicio_traslado_planta timestamptz,
  fin_traslado_planta timestamptz,

  obs_cs text,
  tareadora text,
  obs_ca text,

  -- Fórmula: las llena el trigger, nunca el cliente
  semana integer,
  t_cosecha numeric,
  t_espera_jabero numeric,
  t_jabero numeric,
  t_estadia_cs numeric,
  t_carga_moto numeric,
  t_estadia_moto_cs numeric,
  t_espera_traslado numeric,
  t_traslado_ca numeric,
  t_espera_descarga numeric,
  t_descarga_ca numeric,
  t_estadia_ca numeric,
  t_carga_camion numeric,
  t_espera_traslado_planta numeric,
  t_traslado_planta numeric,
  t_ciclo_total numeric,
  cerrado boolean not null default false,

  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en timestamptz not null default now()
);

create index ciclos_semana_fundo_idx on public.ciclos_cosecha (semana, fundo);
create index ciclos_abiertos_idx on public.ciclos_cosecha (fecha desc) where not cerrado;
create index ciclos_codigo_idx on public.ciclos_cosecha (codigo);

-- WEEKNUM(fecha, 1) de Excel: semanas empiezan domingo, la semana del 1-ene es la 1.
create or replace function public.weeknum_excel_sistema1(p_fecha date)
returns integer language sql immutable as $$
  select floor(
    (extract(doy from p_fecha)::int - 1 + extract(dow from date_trunc('year', p_fecha))::int) / 7
  )::int + 1;
$$;

create or replace function public.ciclos_calcular_formulas()
returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'C-' || lpad(nextval('public.ciclos_codigo_seq')::text, 6, '0');
  end if;

  new.semana := public.weeknum_excel_sistema1(new.fecha);

  new.t_cosecha                 := extract(epoch from (new.fin_cosecha - new.inicio_cosecha)) / 60;
  new.t_espera_jabero           := extract(epoch from (new.inicio_jabero - new.fin_cosecha)) / 60;
  new.t_jabero                  := extract(epoch from (new.fin_jabero - new.inicio_jabero)) / 60;
  new.t_estadia_cs              := extract(epoch from (new.inicio_carga_moto - new.fin_jabero)) / 60;
  new.t_carga_moto              := extract(epoch from (new.fin_carga_moto - new.inicio_carga_moto)) / 60;
  new.t_estadia_moto_cs         := extract(epoch from (new.inicio_traslado_ca - new.hora_llegada_moto)) / 60;
  new.t_espera_traslado         := extract(epoch from (new.inicio_traslado_ca - new.fin_carga_moto)) / 60;
  new.t_traslado_ca             := extract(epoch from (new.fin_traslado_ca - new.inicio_traslado_ca)) / 60;
  new.t_espera_descarga         := extract(epoch from (new.inicio_descarga_ca - new.fin_traslado_ca)) / 60;
  new.t_descarga_ca             := extract(epoch from (new.fin_descarga_ca - new.inicio_descarga_ca)) / 60;
  new.t_estadia_ca              := extract(epoch from (new.inicio_carga_camion - new.fin_descarga_ca)) / 60;
  new.t_carga_camion            := extract(epoch from (new.fin_carga_camion - new.inicio_carga_camion)) / 60;
  new.t_espera_traslado_planta  := extract(epoch from (new.inicio_traslado_planta - new.fin_carga_camion)) / 60;
  new.t_traslado_planta         := extract(epoch from (new.fin_traslado_planta - new.inicio_traslado_planta)) / 60;

  new.cerrado := new.fin_traslado_planta is not null;

  if new.t_cosecha is not null and new.t_espera_jabero is not null and new.t_jabero is not null
     and new.t_estadia_cs is not null and new.t_carga_moto is not null and new.t_espera_traslado is not null
     and new.t_traslado_ca is not null and new.t_espera_descarga is not null and new.t_descarga_ca is not null
     and new.t_estadia_ca is not null and new.t_carga_camion is not null
     and new.t_espera_traslado_planta is not null and new.t_traslado_planta is not null then
    new.t_ciclo_total :=
      new.t_cosecha + new.t_espera_jabero + new.t_jabero + new.t_estadia_cs + new.t_carga_moto +
      new.t_espera_traslado + new.t_traslado_ca + new.t_espera_descarga + new.t_descarga_ca +
      new.t_estadia_ca + new.t_carga_camion + new.t_espera_traslado_planta + new.t_traslado_planta;
  else
    new.t_ciclo_total := null;
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

create trigger trg_ciclos_calcular_formulas
before insert or update on public.ciclos_cosecha
for each row execute function public.ciclos_calcular_formulas();
