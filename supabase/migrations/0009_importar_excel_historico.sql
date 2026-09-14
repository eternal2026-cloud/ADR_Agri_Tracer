-- 0009: Importación del Excel histórico "5.1. TIEMPO DE CICLO ACTUALIZADO.xlsx" (hoja BD)
--
-- · origen: 'app' (capturado en la app) o 'excel' (importado). La captura en
--   campo solo lista ciclos 'app'; resumen y Google Sheets muestran ambos.
-- · clave_excel = FUNDO|LOTE|INICIO COSECHA (al minuto): reimportar el mismo
--   Excel actualizado actualiza esas filas en vez de duplicarlas, y nunca toca
--   ciclos capturados en la app.
-- · Los importados reciben código H-00001… y el trigger recalcula semana y tramos.

alter table public.ciclos_cosecha
  add column if not exists origen text not null default 'app',
  add column if not exists clave_excel text;
alter table public.ciclos_cosecha drop constraint if exists ciclos_origen_chk;
alter table public.ciclos_cosecha add constraint ciclos_origen_chk check (origen in ('app', 'excel'));
create unique index if not exists ciclos_clave_excel_uidx on public.ciclos_cosecha (clave_excel) where clave_excel is not null;
create sequence if not exists public.ciclos_historico_seq;

create or replace function public.fn_interna_importar_ciclos_excel(p_filas jsonb, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f jsonb; r public.ciclos_cosecha; v_id uuid; v_origen text;
  v_nuevos integer := 0; v_actualizados integer := 0; v_protegidos integer := 0; v_omitidos integer := 0;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Se esperaba una lista de filas.'; end if;

  for f in select value from jsonb_array_elements(p_filas) loop
    if coalesce(f->>'clave_excel', '') = '' or coalesce(f->>'fundo', '') = '' or coalesce(f->>'fecha', '') = '' then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    r := jsonb_populate_record(null::public.ciclos_cosecha, f);
    v_id := null; v_origen := null;
    select id, origen into v_id, v_origen from public.ciclos_cosecha where clave_excel = r.clave_excel;

    if v_id is null then
      insert into public.ciclos_cosecha (
        codigo, origen, clave_excel, fecha, fundo, lote, lider, presentacion, variedad, calibre,
        inicio_cosecha, fin_cosecha, inicio_jabero, fin_jabero, num_jabas, obs_jaba,
        placa, hora_llegada_moto, inicio_carga_moto, fin_carga_moto, inicio_traslado_ca, fin_traslado_ca,
        num_jabas_2, obs_jabas_2, inicio_descarga_ca, fin_descarga_ca, num_pallets, presentaciones, placa_camion,
        inicio_carga_camion, fin_carga_camion, inicio_traslado_planta, fin_traslado_planta, obs_cs, tareadora, obs_ca,
        creado_por, actualizado_por
      ) values (
        'H-' || lpad(nextval('public.ciclos_historico_seq')::text, 5, '0'), 'excel', r.clave_excel, r.fecha, r.fundo, r.lote, r.lider, r.presentacion, r.variedad, r.calibre,
        r.inicio_cosecha, r.fin_cosecha, r.inicio_jabero, r.fin_jabero, r.num_jabas, r.obs_jaba,
        r.placa, r.hora_llegada_moto, r.inicio_carga_moto, r.fin_carga_moto, r.inicio_traslado_ca, r.fin_traslado_ca,
        r.num_jabas_2, r.obs_jabas_2, r.inicio_descarga_ca, r.fin_descarga_ca, r.num_pallets, r.presentaciones, r.placa_camion,
        r.inicio_carga_camion, r.fin_carga_camion, r.inicio_traslado_planta, r.fin_traslado_planta, r.obs_cs, r.tareadora, r.obs_ca,
        p_usuario, p_usuario
      );
      v_nuevos := v_nuevos + 1;
    elsif v_origen = 'excel' then
      update public.ciclos_cosecha set
        fecha = r.fecha, fundo = r.fundo, lote = r.lote, lider = r.lider, presentacion = r.presentacion, variedad = r.variedad, calibre = r.calibre,
        inicio_cosecha = r.inicio_cosecha, fin_cosecha = r.fin_cosecha, inicio_jabero = r.inicio_jabero, fin_jabero = r.fin_jabero,
        num_jabas = r.num_jabas, obs_jaba = r.obs_jaba, placa = r.placa, hora_llegada_moto = r.hora_llegada_moto,
        inicio_carga_moto = r.inicio_carga_moto, fin_carga_moto = r.fin_carga_moto, inicio_traslado_ca = r.inicio_traslado_ca, fin_traslado_ca = r.fin_traslado_ca,
        num_jabas_2 = r.num_jabas_2, obs_jabas_2 = r.obs_jabas_2, inicio_descarga_ca = r.inicio_descarga_ca, fin_descarga_ca = r.fin_descarga_ca,
        num_pallets = r.num_pallets, presentaciones = r.presentaciones, placa_camion = r.placa_camion,
        inicio_carga_camion = r.inicio_carga_camion, fin_carga_camion = r.fin_carga_camion,
        inicio_traslado_planta = r.inicio_traslado_planta, fin_traslado_planta = r.fin_traslado_planta,
        obs_cs = r.obs_cs, tareadora = r.tareadora, obs_ca = r.obs_ca,
        actualizado_por = p_usuario
      where id = v_id;
      v_actualizados := v_actualizados + 1;
    else
      v_protegidos := v_protegidos + 1;
    end if;
  end loop;

  -- Valores nuevos del Excel pasan a las listas de captura (sin tocar los existentes).
  -- Tareadoras llegan inactivas: el Excel trae variantes del mismo nombre; se activan en Config → Listas.
  insert into public.listas_maestras (tipo, valor, activo, orden)
  select distinct t.tipo, t.valor, t.tipo <> 'tareadora', 500
  from jsonb_array_elements(p_filas) e,
  lateral (values ('fundo', trim(e->>'fundo')), ('variedad', trim(e->>'variedad')), ('calibre', trim(e->>'calibre')),
                  ('presentacion', trim(e->>'presentacion')), ('tareadora', trim(e->>'tareadora'))) as t(tipo, valor)
  where coalesce(t.valor, '') <> ''
  on conflict (tipo, valor) do nothing;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (p_usuario, 'CICLOS', 'Importación Excel',
            format('%s nuevos, %s actualizados, %s protegidos (app), %s omitidos', v_nuevos, v_actualizados, v_protegidos, v_omitidos));

  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados, 'protegidos', v_protegidos, 'omitidos', v_omitidos);
end;
$$;
revoke execute on function public.fn_interna_importar_ciclos_excel(jsonb, uuid) from public, anon, authenticated;

create or replace function public.rpc_importar_ciclos_excel(p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol('admin');
  if jsonb_array_length(p_filas) > 2000 then raise exception 'Máximo 2000 filas por envío.'; end if;
  return public.fn_interna_importar_ciclos_excel(p_filas, auth.uid());
end;
$$;
revoke execute on function public.rpc_importar_ciclos_excel(jsonb) from public, anon;
grant execute on function public.rpc_importar_ciclos_excel(jsonb) to authenticated;
