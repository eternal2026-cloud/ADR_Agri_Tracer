# AgriTracer · Don Ricardo — Tiempos de Ciclo + Reubicación de Personal

Sitio único en **Vercel** (HTML/CSS/JS plano, sin build, anime.js UMD)
respaldado por **Supabase** (Postgres + Auth + Edge Functions + Vault + pg_cron).

## Estado actual

- **Proyecto Supabase** `agritracer-don-ricardo` (ref `ptsvriudoilsyofgccsb`) con
  migraciones `supabase/migrations/0001..0017` aplicadas (0012: Auditoría 5S,
  0013: Auditoría 5S por cultivo, 0014: observaciones 5S por área,
  0015: Revisión del plan de mantenimiento, 0016: Satisfacción del cliente
  interno y cultivo en los tiempos de ciclo, 0017: acceso con correo corporativo + PIN).
- **Edge Functions desplegadas** (código en `supabase/functions/`):
  - `admin-usuarios` — dar acceso por correo (con bienvenida), reenviar acceso, correo de prueba, cambiar rol, desactivar.
  - `correo-bot` — Send Email Hook: PIN de ingreso con el diseño del Bot Don Ricardo (Microsoft Graph).
  - `sync-sheets` — espejo de auditoría hacia Google Sheets.
- **Sincronización automática**: `pg_cron` revisa cada 5 min y dispara
  `sync-sheets` cuando pasaron los minutos configurados (60 por defecto).
- **Google Sheet destino configurada**: «ADR_ Proyecto AGRITRACER», compartida
  como Editor con la cuenta de servicio (verificado).
- **Vercel no necesita variables de entorno**: las funciones de administración
  viven en Supabase.

## Portada por grupos

Mismo orden del organigrama de Ingeniería de Procesos (lista `GRUPOS` en `index.html`):

- **Ingeniería · Campo**: **Toma de tiempos campo** abre `#campo` con un acceso por
  cultivo: **Arándano** (los tiempos de ciclo de siempre, `ciclos/`) y **Uva**
  (`campo/uva/`, en definición). `ciclos_cosecha.cultivo` (0016) separa los cultivos;
  todo lo registrado hasta hoy es Arándano (valor por defecto y trigger).
- **Ingeniería · Planta**: Reubicación de personal.
- **Gestión de Procesos**: Auditoría 5S, Revisión plan de mantenimiento y
  Satisfacción del cliente interno.
- **Usuarios y configuración**: apartado propio, solo administradores.
- Mover una tarjeta de grupo = cortar su línea `{ href: … }` y pegarla en la lista
  `modulos` del grupo destino (no hay pantalla para esto). `#campo`, `#planta` y
  `#gestion` en la dirección abren o desplazan a ese grupo.
- El ícono de cultivo vive en `DR.iconoCultivo` (`js/nucleo.js`); 5S lo reutiliza.

### Pendiente (lo hace un admin desde la app, una sola vez)

1. **Contraseña del admin**: `admin` / `DonRicardo2026` sigue siendo temporal.
   Al entrar, la app pide crear una propia (esa pantalla antes quedaba invisible
   por un error, ya corregido).
2. **Clave de Google**: `Config → Sheets → Subir clave JSON` (archivo de la
   carpeta `JSON/`). Queda cifrada en Supabase Vault. Apenas se sube, la hoja se
   llena sola.
3. **Datos históricos del Excel**: `Config → Ajustes → Importar histórico desde
   Excel` → elegir `5.1. TIEMPO DE CICLO ACTUALIZADO.xlsx` → **Importar 234 ciclos**.

## Acceso: correo corporativo + PIN del Bot Don Ricardo (migración 0017)

- Los usuarios escriben su **correo corporativo** (`@adr.com.pe`, parámetro
  `CORREO_DOMINIOS`) y reciben un **PIN de 6 dígitos** del *Bot Don Ricardo ·
  Gestión de Procesos*. No hay contraseñas ni contraseña temporal: el PIN es la
  validación. Solo reciben PIN los correos que un administrador dio de alta.
- **Solo la cuenta `admin`** entra con usuario y contraseña («Ingresar como
  administrador» en la pantalla de inicio).
- El correo lo arma la Edge Function **`correo-bot`** (Send Email Hook de Supabase
  Auth) con el diseño Don Ricardo (franja azul-naranja-verde, PIN grande, firma del
  bot con logo y sello B incrustados) y lo envía por **Microsoft Graph** desde el
  buzón `CORREO_REMITENTE` (hoy `rhaya@adr.com.pe`). Se usa Graph y no SMTP porque
  Microsoft 365 desactiva por defecto el SMTP con usuario y contraseña desde fines
  de 2026. Plantillas y envío en `supabase/functions/_shared/correo.ts`.
- `admin-usuarios` crea usuarios por correo (sin contraseña) y envía la
  **bienvenida**; también *Reenviar acceso* y *Enviar correo de prueba*.
- Las cuentas de prueba (ronald, juanito, luis) se eliminaron; sus registros se
  conservan con el autor en blanco.

### Activación (una sola vez, en este orden)

1. **TI de ADR (Microsoft Entra ID)** — registrar una aplicación «AgriTracer Bot»:
   - *API permissions* → Microsoft Graph → **Application** → `Mail.Send` →
     **Grant admin consent**.
   - *Certificates & secrets* → nuevo *client secret* (anotar el valor).
   - Recomendado: limitar la app al buzón del bot con una *Application Access
     Policy* (o RBAC for Applications) de Exchange Online, para que no pueda enviar
     como cualquier usuario. Ideal: un buzón compartido propio del bot
     (p. ej. `gestion.procesos@adr.com.pe`) en lugar de un buzón personal.
   - Entregar: **Directory (tenant) ID**, **Application (client) ID** y el **secret**.
2. **Supabase → Edge Functions → Secrets**: crear `MS_TENANT_ID`, `MS_CLIENT_ID` y
   `MS_CLIENT_SECRET` con esos valores.
3. **AgriTracer → Usuarios y configuración → Usuarios → Correo del Bot Don
   Ricardo**: revisar buzón, dominios y dirección de la app, **Guardar** y **Enviar
   correo de prueba**. Si llega, Graph está listo.
4. **Supabase → Authentication → Hooks → Send Email hook** → tipo *HTTPS* → URL
   `https://ptsvriudoilsyofgccsb.supabase.co/functions/v1/correo-bot` →
   **Generate secret** → copiarlo → guardar el hook → crear el secret
   `SEND_EMAIL_HOOK_SECRET` (valor completo `v1,whsec_…`) en Edge Functions → Secrets.
5. **Supabase → Authentication → Providers → Email**: *Email OTP expiration* =
   **600** segundos (el correo dice «vence en 10 minutos») y *Email OTP length* = **6**.
6. Crear los usuarios reales desde la app y probar el ingreso con un correo.

Mientras el paso 4 no esté hecho, Supabase no envía PIN con el diseño del bot; el
admin siempre puede entrar con usuario y contraseña.

## Cómo crear usuarios

1. Entra como **admin** → tarjeta **Usuarios y configuración**.
2. Escribe el **nombre completo** y el **correo corporativo**.
3. Elige qué podrá hacer: **Captura en campo**, **Solo consulta** o **Administrador**.
4. **Dar acceso y enviar bienvenida** → el Bot Don Ricardo le envía los pasos. Si el
   correo no sale, el usuario igual queda creado y luego se usa *Reenviar acceso*.
5. La persona abre la página de inicio, escribe su correo y entra con el PIN.

Desde la misma lista: cambiar rol, *Reenviar acceso* o *Desactivar* (bloquea el
ingreso y deja de recibir PIN).

## Datos históricos del Excel (actualización repetible)

`Config → Ajustes → Importar histórico desde Excel` lee la hoja **BD** del Excel
en el propio dispositivo, muestra un resumen (ciclos, fechas, fundos y si los
tiempos coinciden con los del Excel) y recién entonces importa.

- Se puede repetir cada vez que el Excel tenga filas nuevas: **no duplica**. Cada
  fila se identifica por `FUNDO | LOTE | INICIO COSECHA`; si ya existe se actualiza.
- Nunca modifica ciclos capturados en la app (origen `app`).
- Los importados reciben código `H-00001…`; semana y tramos los recalcula la BD
  con las mismas fórmulas del Excel (validado: 234/234 tiempos de ciclo idénticos).
- No aparecen como "en curso" en Captura; sí en Resumen y en Google Sheets.
- Valores nuevos de fundo, variedad, calibre y presentación se agregan a las
  listas de captura. Las tareadoras llegan **inactivas** (el Excel trae variantes
  del mismo nombre): actívalas en `Config → Listas`.

## Borrar datos de prueba sin riesgo

**Nunca borres filas desde el panel de Supabase.** Usa la app:

1. Entra como **admin** → **Captura** → toca el ciclo de prueba (o ábrelo desde
   "Cerrados recientemente").
2. Al final de la pantalla: **Eliminar este ciclo** → escribe el motivo → **Mover a
   la papelera**.
3. Si te equivocas: **Config → Ajustes → Papelera de ciclos → Restaurar**.

Protecciones en la base de datos (migración 0011):
- Cualquier ciclo borrado, incluso desde Supabase, se copia a la papelera.
- Vaciar tablas (TRUNCATE) está bloqueado en ciclos, parámetros, listas, bitácora,
  perfiles y personal.
- `parametros` (configuración) y `bitacora` (auditoría) no permiten borrar filas.
- Los ciclos importados del Excel no se eliminan desde la app: se corrigen en el
  Excel y se vuelve a importar.

## Captura de tiempos

- **Ciclos en curso** aparecen al abrir Captura, con barra de progreso de 7 etapas.
- **Asistente por etapas**: Cosecha → Jabero → Motocarga → Traslado C.A. →
  Descarga C.A. → Carga camión → Traslado planta.
- Cada hora tiene su botón **Ahora**; el botón grande inferior indica qué toca
  marcar y **Guardar y continuar** pasa sola a la siguiente etapa.
- Cada marca con **Ahora** se guarda de inmediato.
- Avisa horas en el futuro o fuera de orden antes de avanzar.

## Auditoría 5S (módulo `auditoria5s/`, migraciones 0012, 0013 y 0014)

Réplica del proceso de los Excel «TERCERA AUDITORIA 5S - <ÁREA>» (hojas CHECK LIST,
BD, Observaciones y Resultados), con el mismo estilo secuencial de Captura.

- **Por cultivo** (0013): Arándano, Uva y Cítrico tienen cada uno su campaña, su
  planta y sus propias zonas por área (verificado contra los 21 Excel de
  `Ejemplo/<CULTIVO>`). Resultados, observaciones, informes y Sheets **nunca
  mezclan cultivos**. Nuevos cultivos, con ícono y color, en Catálogo.
- **Auditar** (admin y captura): Nueva auditoría (cultivo → área → zonas, con
  «+ Agregar área» y «+ Agregar zonas» antes de iniciar; Opinada/Inopinada, N°,
  fecha, campaña y planta del cultivo) → N° de zona → 1S → 2S → 3S → 4S → 5S →
  resumen de la zona → siguiente zona → cerrar auditoría. Los pasos se tocan para
  regresar. Los auditores pueden **agregar** áreas y zonas; renombrar, renumerar o
  desactivar es solo de administradores.
- **Observaciones en tabla** con las columnas de la hoja Observaciones y botón
  **Descargar Excel** con el formato manual: «Evidencia Fotográfica», colores y
  anchos originales, color por estado, filtros, fotos Antes/Después incrustadas,
  una hoja por área y hoja BD.
- **Informe PDF** (Resultados): elige área y una o más fechas → resultado por S,
  gráfico radar, detalle por área o zona y, como **última hoja (apaisada)**, la tabla
  con el formato de la hoja Observaciones: abiertas del área + las registradas en
  esas fechas, con la celda de evidencia **dividida** entre las fotos «Antes»
  (banda superior) y «Después» (banda inferior). Logo y paleta Don Ricardo ·
  Ingeniería de Procesos. Librerías locales: `vendor/jspdf.umd.min.js`
  y `vendor/exceljs.min.js` (se cargan solo al generar).
- Checklist de 26 ítems (5-5-6-5-5), puntaje 0 · 1 · 1.5 · 2 por ítem.
  `% de la S = SUMA / (n° de ítems × 2)`; zona = promedio de las 5 S; madurez
  ≥ 90 % EXCELENTE · ≥ 75 % BIEN · ≥ 65 % REGULAR · resto CRÍTICO
  (validado contra la auditoría 3 de Producción: 0.80 · 0.80 · 0.75 · 0.80 · 0.70 → 0.77 BIEN).
- Cada S se guarda al continuar; cada toque queda además en el celular y se
  recupera si se va la señal o se cierra la app.
- **Observaciones por área** (0014): la observación **vive en la zona**, no en la
  auditoría: persiste entre auditorías y la auditoría queda solo como *origen*
  (trazabilidad y checklist que sustenta). Se pueden registrar desde la pestaña
  Observaciones eligiendo área y zona, sin auditoría abierta. N° correlativo por
  zona que continúa entre auditorías. Al entrar a una zona se avisan las
  observaciones abiertas anteriores.
- **Hasta 3 fotos «Antes» y 3 «Después»** (`fotos_antes`/`fotos_despues`, arrays);
  `foto_antes`/`foto_despues` se mantienen como foto principal (primera del array)
  por un trigger, para que Sheets y el Excel manual sigan igual. Se comprimen en el
  celular y se ven en galería con visor navegable.
- **Seguimiento**: nuevo estado (Pendiente, En ejecución, Cerrado, Cancelado,
  Stand By, Recomendación), nota, foto «Después» y **corrección del puntaje en
  formato checklist**. Se conserva el puntaje original, quién, cuándo y la nota.
- **Plazo**: `S5_DIAS_CORRECCION` (3) días desde la **fecha de registro de la
  observación** para el rol captura; después solo admin (mismo criterio para editarla
  y para corregir su puntaje). Una zona completa solo se reescribe directo el
  mismo día de la auditoría; luego, únicamente por seguimiento.
- **Catálogo** (admin): parámetros, áreas, zonas numeradas, textos del checklist y
  reabrir/anular auditorías. Nada se borra: se desactiva o se anula.
- Fotos en Storage privado `auditoria-5s` (la app usa URLs firmadas temporales).

## Revisión del plan de mantenimiento (módulo `mantenimiento/`, migración 0015)

Réplica de la revisión mensual del Excel «Plan de <mes>.xlsx» (hoja del mes +
tabla dinámica Hoja1) y del correo de resultados.

- **Cargar plan** (admin y captura): se elige el Excel y se lee en el dispositivo.
  Se toma la **primera hoja cuyo nombre es un mes** (MARZO, «Abril 2026»…); las demás
  (Hoja1, OT (2)…) se ignoran. La fila de encabezados se busca en las 10 primeras
  filas (`# OT` y `RESPONSABLE` obligatorias; PLANTA, UBICACIÓN, SUB-EQUIPOS,
  DESCRIPCIÓN, PERSONAS y las 4 fechas plan/real). El año sale de las fechas reales.
  Se muestra la tabla dinámica para compararla con Hoja1 y al confirmar se crea la
  revisión `RPM-00001…`. **Cada carga es una revisión nueva**: los hallazgos de
  revisiones anteriores no pasan a la nueva; el histórico se acumula.
  (Validado con `Plan de marzo`: 64 OT, mismos conteos que Hoja1.)
- **Revisar**: lista de revisiones → tabla dinámica Planta > Responsable (# OT,
  revisadas, observaciones, NC) → tocar un encargado → una tarjeta por OT con
  **checks** en # OT, Descripción, Sub equipo, Personas y las 4 fechas. Los checks
  son **solo ayuda visual** (localStorage del dispositivo): no van a la BD y se borran
  al cerrar la revisión. Aviso si las fechas reales salen del rango del plan.
  «Siguiente encargado» recorre la tabla en orden.
- **Hallazgo por OT**: observación y/o no conformidad (ambas opcionales) y hasta
  3 fotos (Storage privado `plan-mantenimiento`, ruta `rpm/<revisión>/<ot>-…`).
- **Resultado** = 100 % − **0,5 %** por no conformidad (`fn_mp_puntaje`; 3 NC → 98,5 %).
  Por encargado se **consolida entre plantas** (RENZO suma PDC-A, PDC-U y PYA); también
  global de la revisión. Pestaña Resultados: KPIs, barras y tabla por encargado,
  detalle de hallazgos con el formato del correo, histórico de las últimas 12
  revisiones y **Copiar resumen para correo** (tablas en HTML para Outlook).
- **Cerrar** (admin/captura) bloquea los hallazgos; **reabrir** y **anular** solo admin.
- Tablas `mp_revisiones` y `mp_ot` (el hallazgo vive en la fila de la OT); RPC
  `rpc_mp_crear_revision`, `rpc_mp_guardar_hallazgo`, `rpc_mp_cerrar_revision`,
  `rpc_mp_reabrir_revision`, `rpc_mp_anular_revision`; lecturas `fn_mp_tabla` y
  `fn_mp_resultados`. Bitácora con módulo `REVISION_PLAN_MTTO`.

## Satisfacción del cliente interno (módulo `satisfaccion/`, migración 0016)

Réplica de los Excel «Encuesta NPS - <Área evaluada> - <Evaluador>.xlsx» (hoja
ENCUESTA) y de la presentación «Evaluación Cliente Interno - <Área>».

- **Fórmulas** (validadas contra la presentación de Manejo de Información):
  cada ítem vale Totalmente en desacuerdo 4 % · En desacuerdo 6,5 % · De acuerdo 8,5 % ·
  Totalmente de acuerdo 10 %; resultado = suma de los 10 ítems; % de un criterio =
  suma de sus ítems / (n° de ítems × 10). Criterios: Atención y trato (1-2),
  Tiempo de respuesta (3-4), Comunicación (5-6), Calidad de servicio (7-10).
  **Ponderado** del área evaluada = promedio por encuesta.
- **Cargar histórico** (admin y captura): varios Excel o una carpeta completa. El
  lector ubica los ítems por el N° de la columna D (sirve para las dos variantes de
  la plantilla, con o sin fila Cargo) y valida contra el resultado del Excel
  (28/28 archivos idénticos). La planta (PDC, PLM…) y la sub-área (Limpieza,
  Packing…) se sugieren desde el nombre del archivo; todo se corrige en la vista
  previa. Avisa duplicados (mismo contenido en dos carpetas) y campos faltantes.
  También acepta la BD en formato largo que descarga la app.
- **Repetible sin duplicar**: clave cultivo | área evaluada | área evaluadora |
  sub-área | planta | fecha. Reimportar actualiza; nunca pisa lo registrado en la
  app ni revive una encuesta anulada.
- **Encuesta** (admin y captura): asistente de 4 pasos para registros futuros; el
  borrador queda en el celular hasta guardarlo.
- **Resultados**: filtros por cultivo (o todos), campaña, fechas y área evaluada;
  ponderado, matriz de evaluaciones por planta y grupo («PDC - Prod. Limpieza»),
  radar, sugerencias, encuestas (anular: solo admin) e histórico por campaña.
- **Descargas**: BD para Power BI (`.xlsx`, hoja «Data Power BI» con la tabla
  `TablaSCI`, una fila por ítem, + hoja «Resultados») y **presentación `.pptx`**
  (PptxGenJS local `vendor/pptxgen.bundle.js`, radar nativo editable, imágenes en
  `satisfaccion/plantilla/`): portada, objetivo, estructura, RESULTADOS, matriz,
  consolidado y una diapositiva por planta con 2 grupos.
- **Áreas**: catálogo `s5_areas` (compartido con 5S; 0016 activa Ingeniería y crea
  PCP). **Planta**: `listas_maestras.codigo` del fundo (DON CARLOS → PDC,
  LA MAQUINA → PLM, YANCAY → PYA), editable en `Config → Listas → Códigos de planta`.
- Tablas `sci_criterios`, `sci_items`, `sci_encuestas`, `sci_respuestas`; RPC
  `rpc_sci_importar`, `rpc_sci_guardar_encuesta`, `rpc_sci_anular_encuesta`;
  lecturas `fn_sci_resultados` y `fn_sci_bd`. Bitácora con módulo `SATISFACCION_CI`.

## Conectar Google Sheets (referencia)

Pestañas que la app sobrescribe: `Ciclos_BD`, `Resumen_Semanal`,
`Personal_Reubicacion`, `Auditoria_Escaneos`, `5S_BD` (mismas 19 columnas de la
hoja BD), `5S_Observaciones` (formato de la hoja Observaciones, con miniaturas
Antes/Después que se renuevan en cada sincronización), `5S_Resumen`,
`PM_Revisiones`, `PM_Hallazgos` (una fila por observación / no conformidad, con
miniaturas), `PM_Resultados` (resultado por encargado y revisión), `SCI_BD`
(satisfacción del cliente interno en formato largo, fuente para Power BI),
`SCI_Resultados` (una fila por encuesta) y
`Sync_Info` (horas de Lima).
Tus otras pestañas no se tocan. Estado, frecuencia y "Sincronizar ahora" en
`Config → Sheets`.

## Recomendado (Supabase Dashboard)

- **Authentication → desactivar "Allow new users to sign up"**.
- **Authentication → Password security → activar "Leaked password protection"**.

## Estructura del repo

```
index.html               Login + selector de módulo
css/estilos.css          Sistema visual único (colores oficiales Don Ricardo)
img/fondo.jpg, icono.svg Foto del fundo e isotipo
js/nucleo.js             Utilidades DR.* (animaciones, toasts, isotipo, íconos)
js/supabase-cliente.js   Cliente Supabase + sesión + RPC + Edge Functions (AT.*)
vendor/                  anime.js, supabase-js, html5-qrcode, jsQR, jsPDF 2.5.2, ExcelJS 4.4.0 (UMD)

ciclos/                  Tiempos de Ciclo (Resumen · Captura · Config)
  js/captura.js          Asistente secuencial por etapas
  js/config.js           Usuarios · Listas · Google Sheets · Ajustes/Importar Excel
  js/importar-excel.js   Lector del Excel histórico (hoja BD)

reubicacion/             Reubicación de Personal (Escanear · Personal · Datos)

auditoria5s/             Auditoría 5S (Resultados · Auditar · Observaciones · Catálogo)
  js/catalogo.js         Catálogo, parámetros y fórmulas del CHECK LIST
  js/auditar.js          Asistente secuencial: área → zona → 1S…5S
  js/observaciones.js    Observaciones, seguimiento y corrección de puntajes
  js/fotos.js            Cámara, compresión y Storage privado
  js/informes.js         Excel de observaciones (formato manual) e informe PDF con radar
  js/resultados.js       Resultados por cultivo, radar e informe PDF por fechas
  js/config.js           Catálogo: cultivos, áreas, zonas por cultivo, checklist, auditorías

mantenimiento/           Revisión plan de mantenimiento (Resultados · Revisar · Cargar plan)
  js/comun.js            Puntaje, tabla dinámica, checks locales y lectura de datos (MP.*)
  js/importar.js         Lector del Excel del plan (hoja del mes)
  js/cargar.js           Vista previa y creación de la revisión
  js/revisar.js          Tabla dinámica, OT por encargado con checks y hallazgos con fotos
  js/resultados.js       Resultado por encargado, hallazgos, histórico y resumen para correo

satisfaccion/            Satisfacción del cliente interno (Resultados · Encuesta · Cargar histórico)
  js/importar.js         Lector de los Excel de encuesta y de la BD larga (sin DOM, probado en Node)
  js/comun.js            Catálogos, fórmulas, consolidado y radar de 4 criterios (SCI.*)
  js/cargar.js           Vista previa editable, duplicados e importación por lotes
  js/encuesta.js         Asistente de registro en 4 pasos
  js/resultados.js       Matriz, consolidado, detalle por planta, histórico y BD para Power BI
  js/pptx.js             Presentación .pptx (PptxGenJS)
  plantilla/             Imágenes de la presentación

campo/uva/               Toma de tiempos campo · Uva (en definición)

supabase/migrations/     Esquema SQL completo (ya aplicado)
supabase/functions/      Edge Functions admin-usuarios, correo-bot y sync-sheets (ya desplegadas)
  _shared/correo.ts      Plantillas HTML del bot y envío por Microsoft Graph
  _shared/imagenes.ts    Logo y sello B de la firma (base64, van incrustados en el correo)
JSON/                    Clave de Google — ignorada por git, NUNCA subir
```

## Notas de seguridad

- Ingreso sin contraseñas: PIN de un solo uso por correo, solo para correos dados de alta
  y de los dominios de `CORREO_DOMINIOS` (lo validan la app, `admin-usuarios` y `correo-bot`).
- `correo-bot` se despliega sin verificación de JWT y valida la firma del hook
  (`SEND_EMAIL_HOOK_SECRET`). Las credenciales de Microsoft viven en los secretos de Supabase.
- Toda escritura sensible pasa por RPC que validan el rol con `exigir_rol()`;
  sin sesión o sin perfil activo → "No autorizado".
- Solo `rpc_registrar_escaneo` es pública a propósito (escaneo sin login).
- La clave de Google vive en Vault y solo la lee `service_role` (Edge Function).
