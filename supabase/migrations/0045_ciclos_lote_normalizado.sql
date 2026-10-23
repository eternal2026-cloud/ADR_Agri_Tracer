-- 0045: el lote se GUARDA normalizado (antes solo se agrupaba así al leer, 0042).
--
--   «Ca 1», «Ca1 », «CA1 » → CA1 · «YA1 C» → YA1C · «DC01» → DC1 (fn_lote_normalizado: mayúsculas,
--   sin espacios, sin ceros a la izquierda). Solo cambia la escritura: la tabla dinámica del Resumen
--   ya agrupaba con fn_lote_normalizado, así que los promedios no se mueven.
--   · Corrige hacia el pasado los ciclos ya guardados (aplicada el 23/10: 306 ciclos).
--   · Trigger: lo que entre desde la app, el Excel o una edición queda normalizado.
--   · Google Sheets (Ciclos_BD) se reescribe completo en cada sync-sheets: tras esta migración se
--     fuerza un sync para que el histórico de la hoja también quede corregido.
--   Respaldo: ciclos_lote_respaldo_0045 (codigo, original, nuevo) para poder revertir.
--
--   Revertir:
--     drop trigger if exists trg_ciclos_lote_normalizado on public.ciclos_cosecha;
--     update public.ciclos_cosecha c set lote = r.original from public.ciclos_lote_respaldo_0045 r
--      where r.codigo = c.codigo and c.lote is not distinct from r.nuevo;

create table if not exists public.ciclos_lote_respaldo_0045 (
  codigo text primary key, original text, nuevo text, aplicado_en timestamptz default now());
alter table public.ciclos_lote_respaldo_0045 enable row level security;
revoke all on public.ciclos_lote_respaldo_0045 from anon, authenticated;

insert into public.ciclos_lote_respaldo_0045 (codigo, original, nuevo)
  select codigo, lote, public.fn_lote_normalizado(lote) from public.ciclos_cosecha
  where lote is distinct from public.fn_lote_normalizado(lote)
  on conflict do nothing;

-- Los triggers de acceso y de fundo no aplican sin usuario (auth.uid() nulo), como en 0044.
update public.ciclos_cosecha c set lote = r.nuevo
  from public.ciclos_lote_respaldo_0045 r
  where r.codigo = c.codigo and c.lote is not distinct from r.original;

create or replace function public.fn_ciclo_lote_normalizado()
returns trigger language plpgsql set search_path = public as $$
begin
  new.lote := public.fn_lote_normalizado(new.lote);
  return new;
end;
$$;
revoke execute on function public.fn_ciclo_lote_normalizado() from public, anon;

drop trigger if exists trg_ciclos_lote_normalizado on public.ciclos_cosecha;
create trigger trg_ciclos_lote_normalizado
before insert or update of lote on public.ciclos_cosecha
for each row execute function public.fn_ciclo_lote_normalizado();

-- Resultado (23/10: 306 corregidos y 0 pendientes).
select (select count(*) from public.ciclos_lote_respaldo_0045) lotes_corregidos,
       (select count(*) from public.ciclos_cosecha where lote is distinct from public.fn_lote_normalizado(lote)) pendientes;
