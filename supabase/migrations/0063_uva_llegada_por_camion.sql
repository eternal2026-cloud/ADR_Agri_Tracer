-- 0063: Uva — un camión cierra todos sus ciclos (llegada compartida por placa ± 30 min de salida)
--
-- Un camión lleva varios pallets (ciclos). Cuando campo o planta marca la llegada de UNO, los demás
-- quedaban sin llegada. Ahora la base la copia a los otros ciclos de la MISMA PLACA cuya SALIDA
-- (inicio de la etapa 8 «Traslado a planta»; si no hay, fin de la carga) esté a ± 30 min de la salida
-- del ciclo que tiene la llegada. Vale para ciclos pasados (se completa al aplicar) y futuros (trigger).
--
--   · llegada_por = 'camion' y llegada_ref = ID del ciclo del que se tomó.
--   · Solo se toman llegadas propias (campo o planta), nunca una ya copiada: no hay cadenas.
--   · Si hay varias, vale la de salida más cercana. La llegada debe ser posterior a la salida.
--   · Lo marcado a mano manda: si campo o planta marca su propia llegada, reemplaza la copiada.
--   · Si el ciclo de origen cambia o se borra, las copias se recalculan (o se quitan).
--   · Los ciclos iniciados en planta (sin salida de campo) no reciben ni dan copias.

alter table public.uva_ciclos drop constraint if exists uva_ciclos_llegada_por_check;
alter table public.uva_ciclos add constraint uva_ciclos_llegada_por_check check (llegada_por in ('campo', 'planta', 'camion'));
alter table public.uva_ciclos add column if not exists llegada_ref text;

/** Salida del camión de un ciclo: inicio del traslado (etapa 8) o, si no hay, fin de la carga. */
create or replace function public.fn_uva_salida(p_etapas jsonb, p_fin_carga timestamptz)
returns timestamptz language sql immutable set search_path = public as $$
  select coalesce(public.fn_uva_hora_etapa(p_etapas, 8, 'inicio'), p_fin_carga);
$$;

create index if not exists uva_ciclos_placa_llave_idx on public.uva_ciclos (upper(regexp_replace(coalesce(placa, ''), '[^A-Za-z0-9]', '', 'g')));

/** Recalcula las llegadas copiadas de una placa (p_placa ya normalizada: mayúsculas, sin espacios ni guiones). */
create or replace function public.fn_uva_camion_propagar(p_placa text)
returns int language plpgsql security definer set search_path = public as $$
declare t record; s record; n int := 0;
begin
  if coalesce(p_placa, '') = '' then return 0; end if;
  for t in
    select c.id, c.hora_llegada, c.llegada_por, c.llegada_ref, public.fn_uva_salida(c.etapas, c.fin_carga) sal
    from public.uva_ciclos c
    where upper(regexp_replace(coalesce(c.placa, ''), '[^A-Za-z0-9]', '', 'g')) = p_placa
      and not c.eliminado and c.origen <> 'planta'
      and (c.hora_llegada is null or c.llegada_por = 'camion')
  loop
    s := null;
    if t.sal is not null then
      select o.id, o.hora_llegada into s
      from public.uva_ciclos o
      where upper(regexp_replace(coalesce(o.placa, ''), '[^A-Za-z0-9]', '', 'g')) = p_placa
        and o.id <> t.id and not o.eliminado and o.origen <> 'planta'
        and o.llegada_por in ('campo', 'planta') and o.hora_llegada is not null
        and public.fn_uva_salida(o.etapas, o.fin_carga) between t.sal - interval '30 minutes' and t.sal + interval '30 minutes'
        and o.hora_llegada >= t.sal
      order by abs(extract(epoch from public.fn_uva_salida(o.etapas, o.fin_carga) - t.sal)), o.hora_llegada
      limit 1;
    end if;
    if s.id is not null then
      if t.hora_llegada is distinct from s.hora_llegada or t.llegada_ref is distinct from s.id or t.llegada_por is distinct from 'camion' then
        update public.uva_ciclos set hora_llegada = s.hora_llegada, llegada_por = 'camion', llegada_ref = s.id where id = t.id;
        n := n + 1;
      end if;
    elsif t.llegada_por = 'camion' then
      update public.uva_ciclos set hora_llegada = null, llegada_por = null, llegada_ref = null where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.fn_uva_camion_propagar(text) from public, anon, authenticated;

/** BEFORE: una llegada propia de campo (etapa 8 distinta a la copiada) reemplaza la copiada. */
create or replace function public.fn_uva_camion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.llegada_por is distinct from 'camion' then new.llegada_ref := null; return new; end if;
  if tg_op = 'UPDATE' and new.llegada_campo is not null and new.llegada_campo is distinct from old.llegada_campo
     and new.llegada_campo is distinct from new.hora_llegada then
    new.hora_llegada := new.llegada_campo; new.llegada_por := 'campo'; new.llegada_ref := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_uva_a_camion on public.uva_ciclos;
create trigger trg_uva_a_camion before insert or update on public.uva_ciclos
  for each row execute function public.fn_uva_camion_antes();

/** AFTER: si cambió algo que afecta la llegada compartida, recalcula la placa (y la anterior si cambió). */
create or replace function public.fn_uva_camion_despues()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nueva text := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));
        v_vieja text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE' then
    v_vieja := upper(regexp_replace(coalesce(old.placa, ''), '[^A-Za-z0-9]', '', 'g'));
    if new.hora_llegada is not distinct from old.hora_llegada and new.llegada_por is not distinct from old.llegada_por
       and v_nueva = v_vieja and new.fin_carga is not distinct from old.fin_carga and new.eliminado = old.eliminado
       and public.fn_uva_hora_etapa(new.etapas, 8, 'inicio') is not distinct from public.fn_uva_hora_etapa(old.etapas, 8, 'inicio') then
      return null;
    end if;
    if v_vieja <> v_nueva then perform public.fn_uva_camion_propagar(v_vieja); end if;
  end if;
  perform public.fn_uva_camion_propagar(v_nueva);
  return null;
end;
$$;
drop trigger if exists trg_uva_z_camion on public.uva_ciclos;
create trigger trg_uva_z_camion after insert or update on public.uva_ciclos
  for each row execute function public.fn_uva_camion_despues();

-- Ciclos pasados: completar ya todas las placas.
select public.fn_uva_camion_propagar(p)
from (select distinct upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) p from public.uva_ciclos where placa is not null) x;

-- La fila que ven Planta / Integra campo lleva de dónde salió la llegada.
create or replace function public.rpc_uva_campo_llegadas(p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.rol_actual() is null or not public.fn_tiene_acceso('campo.uva') then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'llegada', c.hora_llegada, 'llegada_por', c.llegada_por,
      'llegada_ref', c.llegada_ref, 'planta', coalesce(c.planta_destino, c.planta)))
    from public.uva_ciclos c
    where c.id = any(coalesce(p_ids, '{}')) and c.origen = 'integra' and not c.eliminado and c.hora_llegada is not null
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.rpc_uva_campo_llegadas(text[]) from public, anon;
grant execute on function public.rpc_uva_campo_llegadas(text[]) to authenticated;

/**
 * Resumen de Planta: ciclos con datos de planta (continuados en planta o iniciados allí),
 * desde p_desde (por defecto 120 días). Solo lectura, acceso planta.uva.
 */
create or replace function public.rpc_uva_planta_resumen(p_desde date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_desde date := coalesce(p_desde, (now() at time zone 'America/Lima')::date - 120);
begin
  if public.rol_actual() is null or not public.fn_tiene_acceso('planta.uva') then raise exception 'No autorizado'; end if;
  return jsonb_build_object('hoy', (now() at time zone 'America/Lima')::date, 'filas', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'origen', c.origen, 'fecha', c.fecha, 'semana', c.semana, 'placa', c.placa,
      'planta', coalesce(c.planta_destino, c.planta), 'linea', c.linea, 'zona', c.zona, 'fundo', c.fundo, 'lote', c.lote,
      'variedad', c.variedad, 'pallet', c.pallet, 'vinculado', c.vinculado, 'fin_carga', c.fin_carga, 'ini_cosecha', c.ini_cosecha,
      'hora_llegada', c.hora_llegada, 'llegada_por', c.llegada_por, 'hora_recepcion', c.hora_recepcion, 'ini_descarga', c.ini_descarga,
      'fin_descarga', c.fin_descarga, 'ini_abastecimiento', c.ini_abastecimiento,
      't_espera_recepcion', c.t_espera_recepcion, 't_espera_descarga', c.t_espera_descarga, 't_descarga', c.t_descarga,
      't_espera_abastecimiento', c.t_espera_abastecimiento, 't_en_planta', c.t_en_planta,
      't_llegada_desde_carga', public.fn_uva_min(c.fin_carga, c.hora_llegada), 't_ciclo_completo', c.t_ciclo_completo,
      'planta_detalle', c.planta_detalle, 'planta_usuario', c.planta_usuario) order by c.hora_llegada)
    from public.uva_ciclos c
    where not c.eliminado and c.fecha >= v_desde and (c.vinculado or c.origen = 'planta')
  ), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_uva_planta_resumen(date) from public, anon;
grant execute on function public.rpc_uva_planta_resumen(date) to authenticated;
