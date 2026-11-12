-- 0070: Auditoría 5S · el Excel de avance elimina las observaciones cuya fila se borró
--
-- Si en el Excel de avance se borra a mano la fila de una observación de la auditoría que se está
-- actualizando, al aplicar el Excel esa observación se elimina de la app.
--   · s5_obs_eliminadas: copia completa de la observación y de su historial antes de borrarla
--     (para poder recuperarla si fue un error). Las fotos se conservan en Storage.
--   · rpc_s5_obs_eliminar: mismo permiso y plazo que editar los textos (captura dentro del plazo,
--     admin siempre). Los puntajes corregidos con esa observación se conservan; solo pierden el enlace.

create table if not exists public.s5_obs_eliminadas (
  id uuid primary key,
  auditoria_id uuid,
  zona_id integer,
  numero integer,
  observacion jsonb not null,
  seguimientos jsonb not null default '[]'::jsonb,
  origen text,
  eliminado_por uuid,
  eliminado_en timestamptz not null default now()
);
alter table public.s5_obs_eliminadas enable row level security;

create or replace function public.rpc_s5_obs_eliminar(p_observacion uuid, p_origen text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.s5_observaciones; a public.s5_auditorias; z public.s5_zonas; v_origen text;
begin
  perform public.exigir_rol('admin', 'captura');
  select * into o from public.s5_observaciones where id = p_observacion for update;
  if o.id is null then return jsonb_build_object('eliminada', false); end if; -- ya no existe (doble envío)
  select * into z from public.s5_zonas where id = o.zona_id;
  if o.auditoria_id is not null then
    select * into a from public.s5_auditorias where id = o.auditoria_id;
    if a.estado = 'anulada' then raise exception 'La auditoría % está anulada.', a.codigo; end if;
    if a.estado = 'cerrada' and public.rol_actual() is distinct from 'admin' then
      raise exception 'La auditoría % está cerrada: solo un administrador puede eliminar la observación N° %.', a.codigo, o.numero;
    end if;
  end if;
  if public.rol_actual() is distinct from 'admin'
     and public.fn_hoy_lima() > o.fecha_registro + public.fn_s5_dias_correccion() then
    raise exception 'No se eliminó la observación N° % (%): el plazo para modificarla venció el %. Pide a un administrador que la elimine.',
      o.numero, z.nombre, to_char(o.fecha_registro + public.fn_s5_dias_correccion(), 'DD/MM/YYYY');
  end if;
  v_origen := case when p_origen = 'excel' then 'Excel de avance' else coalesce(nullif(btrim(p_origen), ''), 'App') end;

  insert into public.s5_obs_eliminadas (id, auditoria_id, zona_id, numero, observacion, seguimientos, origen, eliminado_por)
  values (o.id, o.auditoria_id, o.zona_id, o.numero, to_jsonb(o),
          coalesce((select jsonb_agg(to_jsonb(s) order by s.fecha) from public.s5_seguimientos s where s.observacion_id = o.id), '[]'::jsonb),
          v_origen, auth.uid())
  on conflict (id) do update set observacion = excluded.observacion, seguimientos = excluded.seguimientos,
    origen = excluded.origen, eliminado_por = excluded.eliminado_por, eliminado_en = now();

  update public.s5_puntajes set observacion_id = null where observacion_id = o.id;
  delete from public.s5_seguimientos where observacion_id = o.id;
  delete from public.s5_observaciones where id = o.id;

  insert into public.bitacora(usuario_id, modulo, accion, detalle)
    values (auth.uid(), 'AUDITORIA_5S', 'Observación eliminada · ' || v_origen,
            coalesce(a.codigo || ' · ', '') || 'obs N° ' || o.numero || ' · ' || coalesce(z.numero || '. ' || z.nombre, 'zona ' || o.zona_id) ||
            ' · «' || left(o.descripcion, 120) || '»');
  return jsonb_build_object('eliminada', true, 'id', o.id, 'numero', o.numero);
end;
$$;
revoke all on function public.rpc_s5_obs_eliminar(uuid, text) from public, anon;
grant execute on function public.rpc_s5_obs_eliminar(uuid, text) to authenticated;
