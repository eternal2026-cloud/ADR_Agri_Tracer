-- 0004: Row Level Security — todo el acceso de escritura sensible pasa por RPC
-- (security definer), las políticas aquí solo gobiernan lectura directa vía REST
-- y la escritura de administración simple (parámetros, listas maestras).

alter table public.perfiles enable row level security;
alter table public.parametros enable row level security;
alter table public.listas_maestras enable row level security;
alter table public.bitacora enable row level security;
alter table public.ciclos_cosecha enable row level security;
alter table public.reub_personal enable row level security;
alter table public.reub_escaneos enable row level security;

-- ---------------------------------------------------------------- perfiles
create policy perfiles_select_admin on public.perfiles for select
  to authenticated using (public.rol_actual() = 'admin');
create policy perfiles_select_propio on public.perfiles for select
  to authenticated using (id = auth.uid());
create policy perfiles_update_admin on public.perfiles for update
  to authenticated using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
-- Sin política de insert/delete directa: el alta de usuarios pasa por la función
-- serverless con service_role (crea el auth.user y esta fila en la misma operación).

-- --------------------------------------------------------------- parametros
create policy parametros_select on public.parametros for select
  to authenticated using (true);
create policy parametros_update_admin on public.parametros for update
  to authenticated using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
create policy parametros_insert_admin on public.parametros for insert
  to authenticated with check (public.rol_actual() = 'admin');

-- ----------------------------------------------------------- listas_maestras
create policy listas_select on public.listas_maestras for select
  to authenticated using (true);
create policy listas_insert_admin on public.listas_maestras for insert
  to authenticated with check (public.rol_actual() = 'admin');
create policy listas_update_admin on public.listas_maestras for update
  to authenticated using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- -------------------------------------------------------------------- bitacora
create policy bitacora_select_admin on public.bitacora for select
  to authenticated using (public.rol_actual() = 'admin');
-- Sin política de insert para authenticated/anon: solo escriben las RPC
-- security definer (dueñas de la función, no sujetas a esta política).

-- --------------------------------------------------------------- ciclos_cosecha
create policy ciclos_select on public.ciclos_cosecha for select
  to authenticated using (public.rol_actual() in ('admin','captura','visor'));
revoke insert, update, delete on public.ciclos_cosecha from authenticated, anon;

-- ---------------------------------------------------------------- reub_personal
create policy reub_personal_lectura_publica on public.reub_personal for select
  to anon, authenticated using (activo = true or public.rol_actual() = 'admin');
revoke insert, update, delete on public.reub_personal from authenticated, anon;

-- --------------------------------------------------------------- reub_escaneos
create policy escaneos_insert_publico on public.reub_escaneos for insert
  to anon, authenticated with check (true);
create policy escaneos_select_admin on public.reub_escaneos for select
  to authenticated using (public.rol_actual() = 'admin');
