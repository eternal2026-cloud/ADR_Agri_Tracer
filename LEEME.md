# AgriTracer · Don Ricardo — Tiempos de Ciclo + Reubicación de Personal

Sitio único en **Vercel** (HTML/CSS/JS plano, sin build, anime.js UMD)
respaldado por **Supabase** (Postgres + Auth + Edge Functions + Vault + pg_cron).

## Estado actual

- **Proyecto Supabase** `agritracer-don-ricardo` (ref `ptsvriudoilsyofgccsb`) con
  migraciones `supabase/migrations/0001..0009` aplicadas.
- **Edge Functions desplegadas** (código en `supabase/functions/`):
  - `admin-usuarios` — crear usuarios, restablecer contraseñas, cambiar rol, desactivar.
  - `sync-sheets` — espejo de auditoría hacia Google Sheets.
- **Sincronización automática**: `pg_cron` revisa cada 5 min y dispara
  `sync-sheets` cuando pasaron los minutos configurados (60 por defecto).
- **Google Sheet destino configurada**: «ADR_ Proyecto AGRITRACER», compartida
  como Editor con la cuenta de servicio (verificado).
- **Vercel no necesita variables de entorno**: las funciones de administración
  viven en Supabase.

### Pendiente (lo hace un admin desde la app, una sola vez)

1. **Contraseña del admin**: `admin` / `DonRicardo2026` sigue siendo temporal.
   Al entrar, la app pide crear una propia (esa pantalla antes quedaba invisible
   por un error, ya corregido).
2. **Clave de Google**: `Config → Sheets → Subir clave JSON` (archivo de la
   carpeta `JSON/`). Queda cifrada en Supabase Vault. Apenas se sube, la hoja se
   llena sola.
3. **Datos históricos del Excel**: `Config → Ajustes → Importar histórico desde
   Excel` → elegir `5.1. TIEMPO DE CICLO ACTUALIZADO.xlsx` → **Importar 234 ciclos**.

## Cómo crear usuarios

1. Entra con una cuenta **admin** → tarjeta **Usuarios y configuración**.
2. Escribe el **nombre completo**; el usuario se sugiere solo (ej. `juan.perez`).
3. Elige qué podrá hacer: **Captura en campo**, **Solo consulta** o **Administrador**.
4. **Crear usuario** → aparece su usuario y una contraseña temporal con botones
   **Copiar** y **Enviar por WhatsApp**. No se vuelve a mostrar.
5. La persona entra a la página de inicio y crea su propia contraseña.

Desde la misma lista: *Nueva contraseña*, cambiar rol o *Desactivar*.

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

## Captura de tiempos

- **Ciclos en curso** aparecen al abrir Captura, con barra de progreso de 7 etapas.
- **Asistente por etapas**: Cosecha → Jabero → Motocarga → Traslado C.A. →
  Descarga C.A. → Carga camión → Traslado planta.
- Cada hora tiene su botón **Ahora**; el botón grande inferior indica qué toca
  marcar y **Guardar y continuar** pasa sola a la siguiente etapa.
- Cada marca con **Ahora** se guarda de inmediato.
- Avisa horas en el futuro o fuera de orden antes de avanzar.

## Conectar Google Sheets (referencia)

Pestañas que la app sobrescribe: `Ciclos_BD`, `Resumen_Semanal`,
`Personal_Reubicacion`, `Auditoria_Escaneos`, `Sync_Info` (horas de Lima).
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
vendor/                  anime.js, supabase-js, html5-qrcode, jsQR (UMD)

ciclos/                  Tiempos de Ciclo (Resumen · Captura · Config)
  js/captura.js          Asistente secuencial por etapas
  js/config.js           Usuarios · Listas · Google Sheets · Ajustes/Importar Excel
  js/importar-excel.js   Lector del Excel histórico (hoja BD)

reubicacion/             Reubicación de Personal (Escanear · Personal · Datos)

supabase/migrations/     Esquema SQL completo (ya aplicado)
supabase/functions/      Edge Functions admin-usuarios y sync-sheets (ya desplegadas)
JSON/                    Clave de Google — ignorada por git, NUNCA subir
```

## Notas de seguridad

- Toda escritura sensible pasa por RPC que validan el rol con `exigir_rol()`;
  sin sesión o sin perfil activo → "No autorizado".
- Solo `rpc_registrar_escaneo` es pública a propósito (escaneo sin login).
- La clave de Google vive en Vault y solo la lee `service_role` (Edge Function).
