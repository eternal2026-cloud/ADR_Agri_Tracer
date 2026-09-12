-- 0006: Fijar search_path (evita suplantación de esquema) y cerrar el grant
-- implícito a PUBLIC que Postgres otorga por defecto a toda función nueva.
-- (Ya aplicada en el proyecto; se documenta aquí para que el historial de
-- migraciones en disco coincida con el estado real de la base de datos.)

alter function public.weeknum_excel_sistema1(date) set search_path = public;
alter function public.ciclos_calcular_formulas() set search_path = public;
alter function public.fn_semanas_disponibles() set search_path = public;
alter function public.fn_resumen_semana(integer) set search_path = public;
alter function public.fn_resumen_general() set search_path = public;
alter function public.fn_ciclos_excluidos(integer) set search_path = public;

revoke execute on function public.rol_actual() from public;
grant execute on function public.rol_actual() to anon, authenticated;

revoke execute on function public.fn_semanas_disponibles() from public;
revoke execute on function public.fn_resumen_semana(integer) from public;
revoke execute on function public.fn_resumen_general() from public;
revoke execute on function public.fn_ciclos_excluidos(integer) from public;
grant execute on function public.fn_semanas_disponibles() to authenticated;
grant execute on function public.fn_resumen_semana(integer) to authenticated;
grant execute on function public.fn_resumen_general() to authenticated;
grant execute on function public.fn_ciclos_excluidos(integer) to authenticated;

revoke execute on function public.weeknum_excel_sistema1(date) from public;

revoke execute on function public.rpc_iniciar_ciclo(jsonb) from public;
revoke execute on function public.rpc_agregar_etapa(text, text, jsonb) from public;
revoke execute on function public.rpc_guardar_lote_ciclos(jsonb) from public;
revoke execute on function public.rpc_marcar_password_cambiada() from public;
revoke execute on function public.rpc_guardar_personal_fila(jsonb) from public;
revoke execute on function public.rpc_reemplazar_personal_lote(jsonb) from public;
grant execute on function public.rpc_iniciar_ciclo(jsonb) to authenticated;
grant execute on function public.rpc_agregar_etapa(text, text, jsonb) to authenticated;
grant execute on function public.rpc_guardar_lote_ciclos(jsonb) to authenticated;
grant execute on function public.rpc_marcar_password_cambiada() to authenticated;
grant execute on function public.rpc_guardar_personal_fila(jsonb) to authenticated;
grant execute on function public.rpc_reemplazar_personal_lote(jsonb) to authenticated;

revoke execute on function public.rpc_registrar_escaneo(jsonb) from public;
grant execute on function public.rpc_registrar_escaneo(jsonb) to authenticated, anon;
