-- 0025: Cliente interno — cada usuario solo ve las encuestas que él registró
--
--   · sci_encuestas: el admin ve todas; los demás solo las suyas (creado_por = auth.uid()),
--     sean de la app o del histórico que cargaron. Evita disputas entre áreas.
--   · sci_respuestas: sigue a su encuesta (si no ves la encuesta, no ves sus respuestas).
--   · fn_sci_resultados y fn_sci_bd son security invoker: heredan el filtro solas.
--   · sync-sheets usa service_role (no pasa por RLS): la hoja sigue recibiendo todo.

drop policy if exists sci_encuestas_select on public.sci_encuestas;
create policy sci_encuestas_select on public.sci_encuestas for select to authenticated
  using (public.rol_actual() = 'admin'
         or (public.rol_actual() in ('captura', 'visor') and creado_por = (select auth.uid())));

drop policy if exists sci_respuestas_select on public.sci_respuestas;
create policy sci_respuestas_select on public.sci_respuestas for select to authenticated
  using (exists (select 1 from public.sci_encuestas e where e.id = encuesta_id));

create index if not exists sci_encuestas_creado_por_idx on public.sci_encuestas (creado_por);
