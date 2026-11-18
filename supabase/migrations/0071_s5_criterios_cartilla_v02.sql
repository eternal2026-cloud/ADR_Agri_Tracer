-- 0071: Auditoría 5S · criterios de la Cartilla del Auditor v02 (IP-FO-005)
--
-- Cada ítem del checklist guarda qué significa 0 · 1 · 1.5 · 2 (columnas D, E, F y G de la cartilla).
-- Al auditar, cuando se toca un puntaje aparece debajo del ítem el criterio correspondiente;
-- si no se toca nada, el ítem se ve igual que antes.
--   · criterio_15 queda vacío en 1.4, 1.5 y 4.5 (seguridad / conducta: cumple o no cumple).
--   · Se enlaza por (s, numero): la numeración de s5_items ya coincide con la v02
--     (4.3 = procedimientos, 4.4 = controles visuales).

alter table public.s5_items
  add column if not exists criterio_0 text,
  add column if not exists criterio_1 text,
  add column if not exists criterio_15 text,
  add column if not exists criterio_2 text;

update public.s5_items i
   set criterio_0 = v.c0, criterio_1 = v.c1, criterio_15 = v.c15, criterio_2 = v.c2
  from (values
  (1, 1, 'Más de 1 innecesario o defectuoso sin tarjeta roja.', 'Solo 1 innecesario o defectuoso sin tarjeta roja, o existen innecesarios identificados con tarjeta roja.', 'Los innecesarios tienen tarjeta roja y retiro programado (responsable y fecha); aún están en el área.', 'Cumplimiento al 100%.'),
  (1, 2, 'No se cumple.', 'Ligera acumulación, con gestión para trabajar con las cantidades necesarias.', 'La acumulación ya se redujo; queda un sobrante puntual con fecha de salida.', 'Cumplimiento al 100%.'),
  (1, 3, 'No existe zona de merma, cuarentena o almacenamiento temporal.', 'Los innecesarios no se han retirado a la zona de cuarentena y no hay gestión.', 'Los innecesarios ya están en la zona de cuarentena y se solicitó su retiro, aún sin fecha confirmada.', 'Gestión evidenciada (correos) con fecha de retiro, o correos reiterativos solicitando el retiro.'),
  (1, 4, 'Más de 1 elemento obstruye pasillos, escaleras o zonas de tránsito.', 'Solo 1 elemento obstruye pasillos, escaleras o zonas de tránsito.', null, 'Cumplimiento al 100%.'),
  (1, 5, 'Más de 1 objeto personal.', '1 solo objeto personal en la zona de trabajo.', null, 'Cumplimiento al 100%.'),
  (2, 1, 'No hay ninguna delimitación.', 'Falta delimitar 1 lugar, o las delimitaciones existentes están dañadas o poco visibles.', 'Falta delimitar 1 lugar (o repintar) y la acción ya está en ejecución (registrada en Observaciones).', 'Cumplimiento al 100%.'),
  (2, 2, 'No hay rótulos de identificación, o la mayoría de elementos está sin identificar.', 'Faltan identificar elementos puntuales, o un rótulo no coincide con lo almacenado.', 'La mayoría ya está identificada y lo que falta tiene acción en ejecución.', 'Cumplimiento al 100%.'),
  (2, 3, 'Más de 1 elemento sin lugar asignado apropiado.', '1 elemento sin lugar asignado.', 'El elemento sin lugar ya tiene ubicación definida y su implementación está en curso.', 'Cumplimiento al 100%.'),
  (2, 4, 'No hay listados, o los listados (kardex) no concuerdan en absoluto.', 'Falta 1 listado, o 1 listado / ítem del kardex está desactualizado.', 'Los listados existen; solo falta completar elementos en 1 listado y la acción está en ejecución.', 'Cumplimiento al 100%.'),
  (2, 5, 'Los archivos no están ordenados ni se almacenan correctamente.', 'Los archivos están ordenados, pero la clasificación no es clara y los archivadores no están identificados.', 'Ordenados y clasificados; falta forrar o rotular algún archivador.', 'Cumplimiento al 100%.'),
  (3, 1, 'No se cumple.', 'Limpios, pero con huecos, roturas o desgaste (en gestión).', 'Limpios y la reparación ya está programada o en ejecución (con fecha).', 'Limpio, sin huecos y en buen estado.'),
  (3, 2, 'Más de 1 elemento sucio (grasa, polvo o residuos acumulados de varios días).', 'Solo 1 elemento con polvo acumulado de varios días.', 'Solo polvo ligero del día en 1 elemento y el programa de limpieza está al día.', 'Cumplimiento al 100%.'),
  (3, 3, 'Más de 1 letrero o rótulo sucio o deteriorado (doblado, roto, con cintas).', 'Solo 1 letrero o rótulo sucio o deteriorado.', 'El único rótulo deteriorado ya se está reemplazando (acción en ejecución).', 'Cumplimiento al 100%.'),
  (3, 4, 'No existe un programa de limpieza.', 'Existe, pero no está actualizado.', 'Está actualizado, pero falta registrar 1 o 2 fechas.', 'Cumplimiento al 100%.'),
  (3, 5, 'No hay elementos de limpieza y el proceso los necesita.', 'Los elementos no están en óptimas condiciones o no están identificados.', 'Están en óptimas condiciones; falta identificar 1 elemento.', 'Cumplimiento al 100%.'),
  (3, 6, 'Faltan tachos y la segregación es incorrecta.', 'Falta 1 tipo de tacho, o hay residuos en el tacho incorrecto (mezcla).', 'Tachos y segregación correctos, pero 1 tacho tiene un rótulo inadecuado o fuera de estándar.', 'Cumplimiento al 100%.'),
  (4, 1, 'No hay rótulos estándar.', 'Cumplen el estándar pero falta identificar 1 elemento, o todo está identificado pero fuera de estándar.', 'El cambio a rótulo estándar está en ejecución: la mayoría ya cumple y quedan algunos por reemplazar.', 'Cumplimiento al 100%.'),
  (4, 2, 'No se cumple.', 'Solo 1 delimitación fuera del estándar.', 'La delimitación fuera de estándar ya se está corrigiendo.', 'Cumplimiento al 100%.'),
  (4, 3, 'No se cumple.', 'Existen pero no están actualizados o falta codificar, o están actualizados pero no se difundieron.', 'Actualizados y codificados; la difusión al personal está en curso (registro parcial de capacitación).', 'Cumplimiento al 100%.'),
  (4, 4, 'No se cumple.', 'Existen, pero no cubren todos los procesos o no se usan.', 'Existen y se usan en los procesos principales; falta 1 proceso secundario.', 'Cumplimiento al 100%.'),
  (4, 5, 'No se cumple.', 'Usa bien el uniforme pero no tiene los EPP necesarios o están en mal estado, o tiene los EPP pero no los usa correctamente.', null, 'Cumplimiento al 100%.'),
  (5, 1, 'No se cumple.', 'El 50% del personal lo conoce, o todos lo conocen pero no está publicado ni es de fácil acceso.', 'Todos lo conocen y la publicación está en proceso, o lo conoce al menos el 75%.', 'Cumplimiento al 100%.'),
  (5, 2, 'Menos del 50% de avance y sin gestión.', 'Al menos 50% de avance, o las soluciones están en gestión.', 'Al menos 75% cerradas y el resto En ejecución (ninguna Pendiente).', '100% de observaciones cerradas.'),
  (5, 3, 'No se cumple.', 'Hay panel 5S pero no está actualizado.', 'Actualizado con la última auditoría; falta registrar el avance de las observaciones.', 'Cumplimiento al 100%.'),
  (5, 4, 'No se cumple.', 'El 50% del personal no sabe dónde dejar o guardar los elementos al terminar.', 'Todos saben dónde guardar; se observa solo 1 elemento fuera de su lugar.', 'Cumplimiento al 100%.'),
  (5, 5, 'No se cumple.', 'El formato de barrido 5S está incompleto.', 'El formato está completo, pero falta la firma o participación de parte del personal.', 'Cumplimiento al 100%.')
  ) as v(s, numero, c0, c1, c15, c2)
 where i.s = v.s and i.numero = v.numero;
