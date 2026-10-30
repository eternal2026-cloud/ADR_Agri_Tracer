-- 0058: Tiempo de ciclo Uva — «Solo sus ciclos / Todos los ciclos» propio de Uva, unión por pallet
--       solo del mismo día y fundo, e historial de quién cambió cada dato
--
--   · perfiles.uva_solo_propios (Config › Usuarios › Ciclos que ve › Uva). Antes Uva usaba el mismo
--     interruptor que Arándano (ciclos_solo_propios, 0055); se inicia con ese valor para no cambiar a nadie.
--       Solo sus ciclos: ve y edita solo los ciclos que él inició; al subir, su ciclo NO se une con
--         el de otra persona aunque tenga el mismo N° de pallet.
--       Todos los ciclos: ve, continúa y edita los ciclos de sus fundos asignados (0057).
--   · Unión por N° de pallet (0057): ahora exige la MISMA fecha (antes ±1 día) y el mismo fundo cuando
--     los dos lo tienen. Los N° de pallet cortos (0014, 0020…) se repiten de un día a otro y el 30/10
--     se juntaron ciclos de hoy con los de ayer.
--   · uva_ciclos_cambios: cada vez que un ciclo de campo cambia queda quién lo subió, cuándo y qué
--     datos cambiaron (valor anterior, valor nuevo y hora de toma). Solo lectura para admin.
--
-- Revertir: drop table uva_ciclos_cambios; drop function fn_uva_ver_todos, fn_uva_valor, fn_uva_anotar_cambio;
--   volver a crear la política uva_ciclos_leer y rpc_uva_config de 0055 y fn_uva_aplicar_campo de 0057;
--   alter table perfiles drop column uva_solo_propios.

alter table public.perfiles add column if not exists uva_solo_propios boolean;
update public.perfiles set uva_solo_propios = coalesce(ciclos_solo_propios, false) where uva_solo_propios is null;
alter table public.perfiles alter column uva_solo_propios set default false;
alter table public.perfiles alter column uva_solo_propios set not null;

/** Ve (y edita) todos los ciclos Uva de sus fundos: admin o «Todos los ciclos» en Uva. */
create or replace function public.fn_uva_ver_todos()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.rol = 'admin' or not p.uva_solo_propios
    from public.perfiles p where p.id = auth.uid() and p.activo
  ), false);
$$;
revoke execute on function public.fn_uva_ver_todos() from public, anon;
grant execute on function public.fn_uva_ver_todos() to authenticated;

drop policy if exists uva_ciclos_leer on public.uva_ciclos;
create policy uva_ciclos_leer on public.uva_ciclos for select to authenticated
  using (public.rol_actual() in ('admin', 'captura', 'visor')
         and (public.fn_tiene_acceso('campo.uva') or public.fn_tiene_acceso('planta.uva'))
         and (fundo is null or public.fn_uva_fundo_permitido(fundo))
         and ((select public.fn_uva_ver_todos()) or usuario_id = (select auth.uid()) or planta_usuario_id = (select auth.uid())));

create or replace function public.rpc_uva_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'config', coalesce((select valor::jsonb from public.parametros where clave = 'UVA_CONFIG'), '{}'::jsonb),
    'catalogo', coalesce((select jsonb_agg(jsonb_build_array(zona, fundo, lote, variedad) order by zona, fundo, lote)
                          from public.uva_catalogo where activo and public.fn_uva_fundo_permitido(fundo)), '[]'::jsonb),
    'fundos_asignados', coalesce((select to_jsonb(p.fundos) from public.perfiles p where p.id = auth.uid() and p.rol <> 'admin'), '[]'::jsonb),
    'solo_propios', not public.fn_uva_ver_todos(),
    'usuario_id', auth.uid())
  where public.rol_actual() is not null;
$$;

create or replace function public.fn_uva_aplicar_campo(p jsonb, p_origen text, p_usuario uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r jsonb := p->'registro';
  et jsonb := coalesce(p->'etapas', '[]'::jsonb);
  v_id text := r->>'id';
  v_reg text := coalesce(p->>'registrador', r->>'registrador', '');
  v_disp text := coalesce(p->>'dispositivo', r->>'dispositivo', '');
  v_fin timestamptz;
  v_lleg timestamptz;
  v_por text;
  v_pal text;
  v_fecha date;
  v_fundo text;
  v_todos boolean := p_origen <> 'integra' or public.fn_uva_ver_todos();
  v_f jsonb;
  x public.uva_ciclos;
  y public.uva_ciclos;
  s public.uva_ciclos;
  o public.uva_ciclos;
  hay boolean;
  n int := 0;
begin
  if r is null or coalesce(v_id, '') = '' then raise exception 'Solicitud no válida: falta el registro.'; end if;
  if v_id !~ '^UV-[A-Z0-9-]+$' then raise exception 'ID no válido: %', v_id; end if;
  select * into x from public.uva_ciclos where id = v_id for update;
  hay := found;
  while hay and x.fusionado_en is not null and n < 5 loop
    v_id := x.fusionado_en; n := n + 1;
    select * into x from public.uva_ciclos where id = v_id for update;
    hay := found;
  end loop;
  if hay then
    if x.origen <> p_origen then raise exception 'El registro % ya existe con otro origen (%). No se sobrescribe.', v_id, x.origen; end if;
    if p_origen = 'apk' and (x.registrador is distinct from v_reg or x.dispositivo is distinct from v_disp) then
      raise exception 'El registro % ya fue enviado por % (%). No se sobrescribe.', v_id, x.registrador, x.dispositivo;
    end if;
    if p_origen = 'integra' and coalesce(btrim(x.fundo), '') <> '' and not public.fn_uva_fundo_permitido(x.fundo) then
      raise exception 'El ciclo % es del fundo «%», que no tienes asignado. No se sobrescribe.', v_id, x.fundo;
    end if;
    if not v_todos and x.usuario_id is distinct from p_usuario then
      raise exception 'El ciclo % es de %. Tu usuario está en «Solo sus ciclos» para Uva: no puedes editar ciclos de otras personas.', v_id, coalesce(x.registrador, 'otra persona');
    end if;
  end if;

  if p_origen = 'integra' then
    -- Unión por N° de pallet: misma fecha, mismo fundo (si ambos lo tienen) y, con «Solo sus ciclos», solo los suyos.
    v_pal := public.fn_uva_pallet_llave(r->>'pallet');
    v_fecha := case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end;
    v_fundo := public.fn_txt_llave(coalesce(nullif(r->>'fundo', ''), x.fundo));
    if v_pal is not null and v_fecha is not null then
      select * into y from public.uva_ciclos c
      where c.origen = 'integra' and not c.eliminado and c.fusionado_en is null and c.id <> v_id
        and public.fn_uva_pallet_llave(c.pallet) = v_pal and c.fecha = v_fecha
        and (v_fundo is null or public.fn_txt_llave(c.fundo) is null or public.fn_txt_llave(c.fundo) = v_fundo)
        and (coalesce(btrim(c.fundo), '') = '' or public.fn_uva_fundo_permitido(c.fundo))
        and (v_todos or c.usuario_id = p_usuario)
      order by c.creado_en limit 1 for update;
      if found then
        if not hay then
          x := y; hay := true; v_id := y.id;
        elsif not (x.vinculado and y.vinculado) then
          if x.vinculado or (not y.vinculado and x.creado_en <= y.creado_en) then s := x; o := y; else s := y; o := x; end if;
          v_f := public.fn_uva_fusionar(s.registro, s.etapas, o.registro, o.etapas);
          update public.uva_ciclos set eliminado = true, fusionado_en = s.id where id = o.id;
          update public.uva_ciclos set registro = v_f->'registro', etapas = v_f->'etapas' where id = s.id;
          select * into x from public.uva_ciclos where id = s.id;
          v_id := s.id;
        end if;
      end if;
    end if;
    r := jsonb_set(r, '{id}', to_jsonb(v_id));
    if hay then
      v_f := public.fn_uva_fusionar(x.registro, x.etapas, r, et);
    else
      v_f := public.fn_uva_fusionar('{}'::jsonb, '[]'::jsonb, r, et);
    end if;
    r := v_f->'registro'; et := v_f->'etapas';
  end if;
  v_fin := public.fn_uva_hora_etapa(et, 8, 'fin');

  v_lleg := x.hora_llegada; v_por := x.llegada_por;
  if v_fin is distinct from x.llegada_campo then
    if v_fin is null then
      if v_por = 'campo' then v_lleg := null; v_por := null; end if;
    elsif v_lleg is null or v_por = 'campo' or x.llegada_campo is not null then
      v_lleg := v_fin; v_por := 'campo';
    end if;
  end if;

  insert into public.uva_ciclos as c (id, origen, registrador, dispositivo, usuario_id, registro, etapas, fecha, campana, zona, fundo, lote,
    variedad, grupo, pallet, placa, planta, estado, ini_cosecha, fin_carga, fin_traslado, campo_recibido, eliminado,
    llegada_campo, hora_llegada, llegada_por)
  values (v_id, p_origen, v_reg, v_disp, p_usuario, r, et,
    case when coalesce(r->>'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'fecha')::date end,
    r->>'campana', upper(btrim(r->>'zona')), upper(btrim(r->>'fundo')), upper(btrim(r->>'lote')), upper(btrim(r->>'variedad')),
    upper(btrim(r->>'grupo')), btrim(r->>'pallet'), nullif(upper(regexp_replace(coalesce(r->>'placa', ''), '\s+', '', 'g')), ''),
    upper(btrim(r->>'planta')), r->>'estado',
    public.fn_uva_inicio_ciclo(et), public.fn_uva_hora_etapa(et, 7, 'fin'), v_fin, now(), false,
    v_fin, v_lleg, v_por)
  on conflict (id) do update set
    registrador = case when c.origen = 'integra' then coalesce(nullif(c.registrador, ''), excluded.registrador) else excluded.registrador end,
    dispositivo = case when c.origen = 'integra' then coalesce(nullif(c.dispositivo, ''), excluded.dispositivo) else excluded.dispositivo end,
    usuario_id = coalesce(c.usuario_id, excluded.usuario_id),
    registro = excluded.registro, etapas = excluded.etapas, fecha = excluded.fecha, campana = excluded.campana,
    zona = excluded.zona, fundo = excluded.fundo, lote = excluded.lote, variedad = excluded.variedad, grupo = excluded.grupo,
    pallet = excluded.pallet, placa = excluded.placa, planta = excluded.planta, estado = excluded.estado,
    ini_cosecha = excluded.ini_cosecha, fin_carga = excluded.fin_carga,
    campo_recibido = excluded.campo_recibido, eliminado = false,
    llegada_campo = excluded.llegada_campo, hora_llegada = excluded.hora_llegada, llegada_por = excluded.llegada_por;
  return v_id;
end;
$$;
revoke execute on function public.fn_uva_aplicar_campo(jsonb, text, uuid) from public, anon, authenticated;

-- ================================================================ historial de cambios
create table if not exists public.uva_ciclos_cambios (
  id bigint generated always as identity primary key,
  ciclo_id text not null,
  cuando timestamptz not null default now(),
  usuario_id uuid,
  usuario text,
  accion text not null,               -- creado | editado | unido (otro ciclo se unió a este) | absorbido | eliminado
  campos jsonb not null default '{}', -- {"car.fin": {"antes": "...", "despues": "...", "tomado": "2026-10-30T15:21:17Z"}, ...}
  detalle text
);
create index if not exists uva_ciclos_cambios_ciclo_idx on public.uva_ciclos_cambios (ciclo_id, cuando);
create index if not exists uva_ciclos_cambios_cuando_idx on public.uva_ciclos_cambios (cuando);
alter table public.uva_ciclos_cambios enable row level security;
drop policy if exists uva_ciclos_cambios_leer on public.uva_ciclos_cambios;
create policy uva_ciclos_cambios_leer on public.uva_ciclos_cambios for select to authenticated using (public.rol_actual() = 'admin');
revoke insert, update, delete on public.uva_ciclos_cambios from anon, authenticated;

/** Valor de un dato del paquete: «fundo», «pallet»… del registro o «car.fin», «enz.com»… de las etapas. */
create or replace function public.fn_uva_valor(p_reg jsonb, p_et jsonb, p_clave text)
returns text language sql immutable set search_path = public as $$
  select case
    when position('.' in p_clave) = 0 then p_reg->>p_clave
    else (select e->>(case split_part(p_clave, '.', 2) when 'ini' then 'inicio' when 'fin' then 'fin' when 'com' then 'comentario' else 'causa' end)
          from jsonb_array_elements(coalesce(p_et, '[]'::jsonb)) e where e->>'id' = split_part(p_clave, '.', 1) limit 1)
  end;
$$;

create or replace function public.fn_uva_anotar_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_campos jsonb := '{}'::jsonb; v_accion text; v_quien text; k text; t jsonb; va text; vn text;
begin
  if new.origen <> 'integra' then return new; end if;
  if tg_op = 'UPDATE' and new.registro is not distinct from old.registro and new.etapas is not distinct from old.etapas
     and new.eliminado = old.eliminado then return new; end if;
  v_accion := case when tg_op = 'INSERT' then 'creado'
                   when new.eliminado and not old.eliminado and new.fusionado_en is not null then 'absorbido'
                   when new.eliminado and not old.eliminado then 'eliminado' else 'editado' end;
  for k, t in select key, value from jsonb_each(coalesce(new.registro->'marcas', '{}'::jsonb)) loop
    if tg_op = 'INSERT' or t is distinct from (old.registro->'marcas'->k) then
      va := case when tg_op = 'INSERT' then null else public.fn_uva_valor(old.registro, old.etapas, k) end;
      vn := public.fn_uva_valor(new.registro, new.etapas, k);
      if tg_op = 'INSERT' or va is distinct from vn then
        v_campos := v_campos || jsonb_build_object(k, jsonb_build_object('antes', va, 'despues', vn, 'tomado', t));
      end if;
    end if;
  end loop;
  if v_accion = 'editado' and v_campos = '{}'::jsonb then return new; end if;
  select coalesce(p.nombre, p.usuario) into v_quien from public.perfiles p where p.id = auth.uid();
  insert into public.uva_ciclos_cambios (ciclo_id, usuario_id, usuario, accion, campos, detalle)
  values (new.id, auth.uid(), v_quien, v_accion, v_campos,
    case when v_accion = 'absorbido' then 'Unido por N° de pallet al ciclo ' || new.fusionado_en end);
  return new;
end;
$$;
revoke execute on function public.fn_uva_anotar_cambio() from public, anon, authenticated;
drop trigger if exists uva_ciclos_cambios_trg on public.uva_ciclos;
create trigger uva_ciclos_cambios_trg after insert or update on public.uva_ciclos
  for each row execute function public.fn_uva_anotar_cambio();
