-- 0067: Uva — separa los 4 pallets de EL TUNAL que la unión automática juntó el 11/11/2026 (07:12, 07:39, 07:41)
--
-- Valores tomados de uva_ciclos_cambios (columna «antes» de cada unión). Las marcas de hora de toma de lo
-- restaurado se ponen en la hora de esta restauración, para que las copias viejas de los celulares no lo pisen.
--   · UV-IN-IYKJ-MWC1I8LI (Cristel, pallet 0002, TU4): etapas 1–5 originales; se quedan sus etapas 6–8
--     (portabin 07:47, carga 07:56–08:14, traslado 08:16, placa C6C-886), que siguen a su enzunchado de 07:23.
--   · UV-IN-IYKJ-MWC29DOT (Cristel, pallet 0004, TU4): vuelve; etapas 1–3 y grupo originales.
--   · UV-IN-G8Y6-MWC24UG2 (Luz, TU19, pallet 0002): vuelve con su lecturado 07:10–07:13.
--   · UV-IN-G8Y6-MWC38RE5 (Luz, pallet 0004): vuelve; armado corregido a 07:29 y lecturado 07:32–07:47.
create or replace function pg_temp.et(p jsonb, p_n int, p_ini text, p_fin text, p_causa text default null, p_com text default null)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(case when (e->>'n')::int = p_n then
    e || jsonb_build_object('inicio', coalesce(p_ini, e->>'inicio'), 'fin', coalesce(p_fin, e->>'fin'),
      'causa', coalesce(p_causa, e->>'causa'), 'comentario', coalesce(p_com, e->>'comentario'),
      'minutos', coalesce(to_jsonb(round(public.fn_uva_min(public.fn_uva_ts(coalesce(p_ini, e->>'inicio')), public.fn_uva_ts(coalesce(p_fin, e->>'fin'))), 1)), '""'::jsonb))
    else e end order by (e->>'n')::int), '[]'::jsonb)
  from jsonb_array_elements(p) e;
$$;
create or replace function pg_temp.marcas(p jsonb, p_claves text[])
returns jsonb language sql as $$
  select jsonb_set(p, '{marcas}', coalesce(p->'marcas', '{}'::jsonb) ||
    (select jsonb_object_agg(k, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) from unnest(p_claves) k));
$$;

do $$
declare v jsonb; r jsonb;
begin
  -- Pallet 0002 de Cristel
  select etapas, registro into v, r from public.uva_ciclos where id = 'UV-IN-IYKJ-MWC1I8LI';
  v := pg_temp.et(v, 1, '2026-11-11T11:32:51.478Z', '2026-11-11T11:34:14.015Z');
  v := pg_temp.et(v, 2, '2026-11-11T11:34:18.713Z', '2026-11-11T11:34:23.482Z');
  v := pg_temp.et(v, 3, '2026-11-11T11:32:00.000Z', '2026-11-11T11:42:05.050Z', '', '');
  v := pg_temp.et(v, 4, '2026-11-11T11:55:46.518Z', '2026-11-11T11:57:08.137Z');
  v := pg_temp.et(v, 5, '2026-11-11T12:22:27.269Z', '2026-11-11T12:23:02.622Z');
  r := r || '{"lote":"TU4","grupo":"GIOVANNA GOMEZ","pasada":"3","variedad":"TIMPSON","pallet":"0002"}'::jsonb;
  r := pg_temp.marcas(r, array['cos.ini','cos.fin','tja.ini','tja.fin','arm.ini','arm.fin','arm.causa','arm.com','lec.ini','lec.fin','enz.ini','enz.fin','lote','grupo','pasada','variedad','pallet']);
  update public.uva_ciclos set etapas = v, registro = r, lote = 'TU4', grupo = 'GIOVANNA GOMEZ', pallet = '0002',
    ini_cosecha = public.fn_uva_inicio_ciclo(v) where id = 'UV-IN-IYKJ-MWC1I8LI';

  -- Pallet 0004 de Cristel
  select etapas, registro into v, r from public.uva_ciclos where id = 'UV-IN-IYKJ-MWC29DOT';
  v := pg_temp.et(v, 1, '2026-11-11T11:53:57.517Z', '2026-11-11T12:01:02.344Z');
  v := pg_temp.et(v, 2, '2026-11-11T12:01:18.179Z', '2026-11-11T12:02:08.486Z');
  v := pg_temp.et(v, 3, '2026-11-11T11:53:00.000Z', '2026-11-11T12:20:00.000Z');
  r := r || '{"grupo":"GIOVANNA GOMEZ","pallet":"0004","editadoPor":"Cristel Martinez"}'::jsonb;
  r := pg_temp.marcas(r, array['cos.ini','cos.fin','tja.ini','tja.fin','arm.ini','arm.fin','grupo','pallet']);
  update public.uva_ciclos set etapas = v, registro = r, grupo = 'GIOVANNA GOMEZ', pallet = '0004', eliminado = false, fusionado_en = null,
    ini_cosecha = public.fn_uva_inicio_ciclo(v) where id = 'UV-IN-IYKJ-MWC29DOT';

  -- Pallet TU19 de Luz (N° 0002)
  select etapas, registro into v, r from public.uva_ciclos where id = 'UV-IN-G8Y6-MWC24UG2';
  v := pg_temp.et(v, 4, null, '2026-11-11T12:13:05.848Z');
  r := r || '{"pallet":"0002"}'::jsonb;
  r := pg_temp.marcas(r, array['lec.fin','pallet']);
  update public.uva_ciclos set etapas = v, registro = r, pallet = '0002', eliminado = false, fusionado_en = null where id = 'UV-IN-G8Y6-MWC24UG2';

  -- Segundo pallet de Luz (N° 0004)
  select etapas, registro into v, r from public.uva_ciclos where id = 'UV-IN-G8Y6-MWC38RE5';
  v := pg_temp.et(v, 3, null, '2026-11-11T12:29:00.000Z');
  v := pg_temp.et(v, 4, '2026-11-11T12:32:00.000Z', '2026-11-11T12:47:20.939Z');
  r := r || '{"pallet":"0004"}'::jsonb;
  r := pg_temp.marcas(r, array['arm.fin','lec.ini','lec.fin','pallet']);
  update public.uva_ciclos set etapas = v, registro = r, pallet = '0004', eliminado = false, fusionado_en = null where id = 'UV-IN-G8Y6-MWC38RE5';

  insert into public.uva_ciclos_cambios (ciclo_id, cuando, usuario, accion, campos, detalle)
  select id, now(), 'Integra (restauración)', 'restaurado', '{}'::jsonb,
    'Separado de una unión automática por N° de pallet del 11/11 (0066/0067)'
  from unnest(array['UV-IN-IYKJ-MWC1I8LI','UV-IN-IYKJ-MWC29DOT','UV-IN-G8Y6-MWC24UG2','UV-IN-G8Y6-MWC38RE5']) id;
end $$;
