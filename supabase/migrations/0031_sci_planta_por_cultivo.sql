-- 0031: Cliente interno — la planta ya no la asigna el administrador
--
--   · Hay jefes que ven varias plantas y cultivos: la planta se elige en la encuesta y la app
--     la filtra según el cultivo (Arándano → PDC, Uva → PDC/PLM/PYA, Cítrico → PCCH).
--   · fn_sci_permisos deja de exigir que la planta esté en perfiles.sci_plantas.
--   · Se vacían las plantas asignadas (la columna se conserva por compatibilidad).
--   · El cargo deja de pedirse en la encuesta (la columna se conserva para el histórico).

create or replace function public.fn_sci_permisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.perfiles;
begin
  if auth.uid() is null or new.origen <> 'app' then return new; end if;
  select * into p from public.perfiles where id = auth.uid();
  if p.id is null or p.rol = 'admin' then return new; end if;
  if cardinality(p.sci_areas) > 0 and not (new.area_evaluada_id = any (p.sci_areas)) then
    raise exception 'No tienes asignada esa área para evaluar. Pide a un administrador que te la asigne.';
  end if;
  if p.sci_area is not null and new.area_evaluadora_id <> p.sci_area then
    raise exception 'Tu área evaluadora es la que te asignó el administrador.';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_sci_permisos() from public, anon, authenticated;

update public.perfiles set sci_plantas = '{}' where cardinality(sci_plantas) > 0;
