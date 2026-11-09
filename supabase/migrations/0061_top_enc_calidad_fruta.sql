-- Encuesta TOP, pregunta 6: «Calibre de la fruta» (código 5) se une a «Calidad de la fruta» (código 4).
-- Cada respuesta guarda el orden de los factores elegidos. El 5 pasa a ser 4 y, si alguien ya tenía
-- los dos, queda el 4 en la mejor posición (sin repetir). Los originales se respaldan antes.

create table if not exists public.top_encuestas_p6_respaldo (
  evaluacion_id uuid primary key,
  p6 jsonb,
  respaldado timestamptz not null default now()
);
alter table public.top_encuestas_p6_respaldo enable row level security;

insert into public.top_encuestas_p6_respaldo (evaluacion_id, p6)
select evaluacion_id, respuestas->'p6' from public.top_encuestas
where jsonb_typeof(respuestas->'p6') = 'array' and respuestas->'p6' @> '[5]'
on conflict (evaluacion_id) do nothing;

create or replace function public.fn_top_p6_unificar(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(v order by pos), '[]'::jsonb) from (
    select distinct on (v) v, pos from (
      select case when e = '5'::jsonb or e = '"5"'::jsonb then '4'::jsonb else e end v, pos
      from jsonb_array_elements(p) with ordinality t(e, pos)) a
    order by v, pos) b
$$;

update public.top_encuestas
set respuestas = jsonb_set(respuestas, '{p6}', public.fn_top_p6_unificar(respuestas->'p6'))
where jsonb_typeof(respuestas->'p6') = 'array' and respuestas->'p6' @> '[5]';

-- Celulares con la versión anterior o encuestas sin conexión: se unifican al guardar.
create or replace function public.trg_top_enc_p6() returns trigger
language plpgsql as $$
begin
  if jsonb_typeof(new.respuestas->'p6') = 'array' and new.respuestas->'p6' @> '[5]' then
    new.respuestas := jsonb_set(new.respuestas, '{p6}', public.fn_top_p6_unificar(new.respuestas->'p6'));
  end if;
  return new;
end $$;

drop trigger if exists top_enc_p6_unificar on public.top_encuestas;
create trigger top_enc_p6_unificar before insert or update on public.top_encuestas
for each row execute function public.trg_top_enc_p6();
