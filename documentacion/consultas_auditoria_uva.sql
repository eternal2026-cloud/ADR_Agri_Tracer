-- ============================================================================
-- Auditoría de Tiempo de ciclo Uva: quién inició, qué ciclos hizo, quién editó y qué ciclos editó.
-- Pegar en Supabase › SQL Editor. Cambiar el periodo en «params» (hora de Lima).
-- Cuenta un ciclo si se creó O se subió algún cambio dentro del periodo.
--
-- Roles:
--   Inició                         → creó el ciclo (registrador / usuario_id).
--   Última edición en ciclo ajeno  → subió el último cambio de un ciclo que creó otra persona
--                                     (registro.editadoPor; Integra guarda solo el último editor).
--   Su ciclo se unió a uno ajeno   → su ciclo tenía el mismo N° de pallet que el de otra persona y
--                                     Integra los juntó: sus datos pasaron al ciclo de la otra persona.
--   Recibió una unión              → al ciclo que creó se le juntó el de otra persona.
-- Desde la migración 0058 hay historial completo por cambio: ver la consulta 3.
-- ============================================================================

-- 1) DETALLE: una fila por persona, rol y ciclo.
with params as (
  select timestamp '2026-10-30 00:00:00' as desde, timestamp '2026-10-30 23:59:59' as hasta
),
c as (
  select c.*,
    (c.creado_en at time zone 'America/Lima') as creado_lima,
    (c.actualizado_en at time zone 'America/Lima') as subido_lima,
    nullif(c.registro->>'editadoPor', '') as editor,
    case when c.eliminado and c.fusionado_en is not null then 'Unido a ' || c.fusionado_en
         when c.eliminado then 'Eliminado' else 'Vigente' end as situacion,
    (select min((v #>> '{}')::timestamptz) at time zone 'America/Lima' from jsonb_each(coalesce(c.registro->'marcas', '{}')) e(k, v)) as primera_toma,
    (select max((v #>> '{}')::timestamptz) at time zone 'America/Lima' from jsonb_each(coalesce(c.registro->'marcas', '{}')) e(k, v)) as ultima_toma
  from public.uva_ciclos c, params p
  where c.origen = 'integra'
    and ((c.creado_en at time zone 'America/Lima') between p.desde and p.hasta
      or (c.actualizado_en at time zone 'America/Lima') between p.desde and p.hasta)
),
mov as (
  select c.registrador as persona, '1 Inició' as rol, c.id as ciclo, c.registrador as creador, c.editor as ultimo_editor,
         null::text as con_ciclo, c.fecha, c.fundo, c.lote, c.pallet, c.estado, c.situacion,
         c.creado_lima, c.subido_lima, c.primera_toma, c.ultima_toma
  from c
  union all
  select c.editor, '2 Última edición en ciclo ajeno', c.id, c.registrador, c.editor,
         null, c.fecha, c.fundo, c.lote, c.pallet, c.estado, c.situacion,
         c.creado_lima, c.subido_lima, c.primera_toma, c.ultima_toma
  from c where c.editor is not null and c.editor <> c.registrador
  union all
  select o.registrador, '3 Su ciclo se unió a uno ajeno', o.id, o.registrador, o.editor,
         s.id || ' (de ' || s.registrador || ')', o.fecha, o.fundo, o.lote, o.pallet, o.estado, o.situacion,
         o.creado_lima, o.subido_lima, o.primera_toma, o.ultima_toma
  from c o join public.uva_ciclos s on s.id = o.fusionado_en
  where o.registrador <> s.registrador
  union all
  select s.registrador, '4 Recibió una unión', s.id, s.registrador, nullif(s.registro->>'editadoPor', ''),
         o.id || ' (de ' || o.registrador || ')', s.fecha, s.fundo, s.lote, s.pallet, s.estado,
         case when s.eliminado then 'Eliminado' else 'Vigente' end,
         s.creado_en at time zone 'America/Lima', s.actualizado_en at time zone 'America/Lima', null, null
  from c o join public.uva_ciclos s on s.id = o.fusionado_en
  where o.registrador <> s.registrador
)
select persona, rol, ciclo, creador, ultimo_editor, con_ciclo, fecha, fundo, lote, pallet, estado, situacion,
  to_char(creado_lima, 'DD/MM HH24:MI:SS') as creado, to_char(subido_lima, 'DD/MM HH24:MI:SS') as ultima_subida,
  to_char(primera_toma, 'DD/MM HH24:MI:SS') as primera_toma, to_char(ultima_toma, 'DD/MM HH24:MI:SS') as ultima_toma
from mov
order by persona, rol, creado_lima;


-- 2) RESUMEN POR PERSONA: cuántos y cuáles ciclos en cada rol.
with params as (
  select timestamp '2026-10-30 00:00:00' as desde, timestamp '2026-10-30 23:59:59' as hasta
),
c as (
  select c.*, nullif(c.registro->>'editadoPor', '') as editor
  from public.uva_ciclos c, params p
  where c.origen = 'integra'
    and ((c.creado_en at time zone 'America/Lima') between p.desde and p.hasta
      or (c.actualizado_en at time zone 'America/Lima') between p.desde and p.hasta)
),
mov as (
  select c.registrador as persona, 'Inició' as rol, c.id || ' · ' || coalesce(c.fundo, '') || ' ' || coalesce(c.lote, '') || ' · pallet ' || coalesce(nullif(c.pallet, ''), '—') as ciclo from c
  union all
  select c.editor, 'Última edición en ciclo de ' || c.registrador, c.id || ' · pallet ' || coalesce(nullif(c.pallet, ''), '—')
  from c where c.editor is not null and c.editor <> c.registrador
  union all
  select o.registrador, 'Su ciclo se unió al de ' || s.registrador, o.id || ' → ' || s.id
  from c o join public.uva_ciclos s on s.id = o.fusionado_en where o.registrador <> s.registrador
)
select persona, rol, count(*) as ciclos, string_agg(ciclo, E'\n' order by ciclo) as detalle
from mov group by persona, rol order by persona, rol;


-- 3) HISTORIAL COMPLETO (desde la migración 0058): cada subida que cambió un ciclo, quién, cuándo y qué datos.
--    «tomado» = hora en que se marcó el dato en el celular; «cuando» = hora en que llegó a Integra.
-- with params as (select timestamp '2026-10-30 00:00:00' as desde, timestamp '2026-10-30 23:59:59' as hasta)
-- select to_char(h.cuando at time zone 'America/Lima', 'DD/MM HH24:MI:SS') as cuando, h.usuario as subio, c.registrador as creador,
--   h.accion, h.ciclo_id, c.fundo, c.lote, c.pallet, d.key as dato, d.value->>'antes' as antes, d.value->>'despues' as despues,
--   to_char((d.value->>'tomado')::timestamptz at time zone 'America/Lima', 'DD/MM HH24:MI:SS') as tomado,
--   (h.usuario is distinct from c.registrador) as ciclo_ajeno, h.detalle
-- from public.uva_ciclos_cambios h
-- join public.uva_ciclos c on c.id = h.ciclo_id
-- left join lateral jsonb_each(h.campos) d on true, params p
-- where (h.cuando at time zone 'America/Lima') between p.desde and p.hasta
-- order by h.cuando, h.ciclo_id, d.key;
