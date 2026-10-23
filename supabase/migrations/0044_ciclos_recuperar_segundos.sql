-- 0044: recupera los segundos de las horas que la app guardaba truncadas al minuto (hasta 2026-10-23).
--
--   Causa: CAPTURA.localDe armaba la hora sin segundos (AAAA-MM-DDTHH:MM), así que el botón «Ahora»
--   guardaba 09:56:00 aunque se tocara a las 09:56:36. El arreglo se publicó el 23/10 a las 09:15,
--   pero los celulares con Integra abierta desde antes siguieron con el código viejo hasta recargar.
--   Fuente de los segundos reales: bitacora. Cada «Ahora» guarda al instante y deja una fila
--   «Iniciado» o «Etapa guardada: <etapa>» con la hora exacta del servidor.
--   Regla: solo horas en :00 de ciclos origen app cuyo minuto coincide con un guardado de esa etapa
--   (si hay dos horas de la misma etapa en el mismo minuto, se emparejan en orden). Una hora no se
--   toca si con el valor nuevo la cadena quedaría fuera de orden. Las horas escritas a mano en otro
--   minuto, o de ciclos importados del Excel, quedan igual.
--   Respaldo: ciclos_horas_respaldo_0044 (codigo, campo, original, nueva) para poder revertir.
--   Simulación del 23/10: 5 110 horas en :00, 3 062 recuperables en 557 ciclos.
--
--   Revertir:
--     update ciclos_cosecha c set <campo> = r.original from ciclos_horas_respaldo_0044 r
--      where r.codigo = c.codigo and r.campo = '<campo>' and c.<campo> = r.nueva;

create table if not exists public.ciclos_horas_respaldo_0044 (
  codigo text not null, campo text not null, original timestamptz, nueva timestamptz, aplicado_en timestamptz default now(),
  primary key (codigo, campo));
alter table public.ciclos_horas_respaldo_0044 enable row level security;
revoke all on public.ciclos_horas_respaldo_0044 from anon, authenticated;

do $$
declare r record; n int; i int;
begin
  create temp table _par on commit drop as
  with mapa(campo, etapa, orden) as (values
   ('inicio_cosecha','cosecha',1),('fin_cosecha','cosecha',2),('inicio_jabero','jabero',3),('fin_jabero','jabero',4),
   ('hora_llegada_moto','motocarga',5),('inicio_carga_moto','motocarga',6),('fin_carga_moto','motocarga',7),
   ('inicio_traslado_ca','traslado_ca',8),('fin_traslado_ca','traslado_ca',9),('inicio_descarga_ca','descarga_ca',10),('fin_descarga_ca','descarga_ca',11),
   ('inicio_carga_camion','carga_camion',12),('fin_carga_camion','carga_camion',13),('inicio_traslado_planta','traslado_planta',14),('fin_traslado_planta','traslado_planta',15)),
  horas as (
   select c.codigo, m.campo, m.etapa, m.orden, (to_jsonb(c)->>m.campo)::timestamptz h
   from public.ciclos_cosecha c cross join mapa m where c.origen = 'app'),
  cand as (
   select h.*, row_number() over (partition by h.codigo, h.etapa, date_trunc('minute', h.h) order by h.orden) rn
   from horas h where h.h is not null and h.h = date_trunc('minute', h.h)),
  ent as (
   select b.detalle codigo, case when b.accion = 'Iniciado' then 'cosecha' else substring(b.accion from 'Etapa guardada: (.*)') end etapa, b.creado_en,
     row_number() over (partition by b.detalle, case when b.accion = 'Iniciado' then 'cosecha' else substring(b.accion from 'Etapa guardada: (.*)') end,
                        date_trunc('minute', b.creado_en) order by b.creado_en) rn
   from public.bitacora b where b.modulo = 'CICLOS' and (b.accion = 'Iniciado' or b.accion like 'Etapa guardada: %'))
  select c.codigo, c.campo, c.orden, c.h, date_trunc('second', e.creado_en) nueva
  from cand c join ent e on e.codigo = c.codigo and e.etapa = c.etapa
   and date_trunc('minute', e.creado_en) = date_trunc('minute', c.h) and e.rn = c.rn;

  -- Saca del lote las horas que dejarían la cadena fuera de orden (sin contar la llegada de la moto).
  for i in 1..5 loop
    with todas as (
     select c.codigo, m.campo, m.orden, coalesce(p.nueva, (to_jsonb(c)->>m.campo)::timestamptz) h, (to_jsonb(c)->>m.campo)::timestamptz h0, p.nueva is not null es_nueva
     from public.ciclos_cosecha c
     join (select distinct codigo from _par) q on q.codigo = c.codigo
     cross join (values ('inicio_cosecha',1),('fin_cosecha',2),('inicio_jabero',3),('fin_jabero',4),('inicio_carga_moto',6),('fin_carga_moto',7),
       ('inicio_traslado_ca',8),('fin_traslado_ca',9),('inicio_descarga_ca',10),('fin_descarga_ca',11),('inicio_carga_camion',12),('fin_carga_camion',13),
       ('inicio_traslado_planta',14),('fin_traslado_planta',15)) m(campo, orden)
     left join _par p on p.codigo = c.codigo and p.campo = m.campo),
    s as (select *, lag(h) over w hp, lag(h0) over w hp0, lag(campo) over w cp, lag(es_nueva) over w np
          from todas where h is not null window w as (partition by codigo order by orden)),
    malas as (
     select codigo, campo from s where h < hp and not coalesce(h0 < hp0, false) and es_nueva
     union select codigo, cp from s where h < hp and not coalesce(h0 < hp0, false) and np)
    delete from _par p using malas m where p.codigo = m.codigo and p.campo = m.campo;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;

  insert into public.ciclos_horas_respaldo_0044 (codigo, campo, original, nueva)
    select codigo, campo, h, nueva from _par on conflict do nothing;

  -- El trigger ciclos_calcular_formulas recalcula los tramos (t_*) y el total de cada ciclo.
  for r in select distinct campo from _par loop
    execute format('update public.ciclos_cosecha c set %I = p.nueva from _par p where p.codigo = c.codigo and p.campo = %L and c.%I = p.h',
                   r.campo, r.campo, r.campo);
  end loop;
end $$;

-- Resultado (debe dar ~3 054 horas en ~559 ciclos; C-000636 con fin_jabero 14:56:36+00).
select (select count(*) from public.ciclos_horas_respaldo_0044) horas_corregidas,
       (select count(distinct codigo) from public.ciclos_horas_respaldo_0044) ciclos,
       (select count(*) from public.ciclos_cosecha) total_ciclos,
       (select fin_jabero from public.ciclos_cosecha where codigo = 'C-000636') fin_jabero_c000636;
