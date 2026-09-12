# AgriTracer · Don Ricardo — Tiempos de Ciclo + Reubicación de Personal

Sitio único en **Vercel** (HTML/CSS/JS plano, sin build/Babel/JSX, anime.js UMD)
respaldado por **Supabase** (Postgres + Auth). Reemplaza a `VISOR_TIEMPO_CICLO/`
(Apps Script) y absorbe `REUBICACION_FOTOCHECK/` (que sigue funcionando igual,
ahora con base de datos real en vez de Excel/localStorage). `EJEMPLO/`
(Kaizen/Lean/Six Sigma) queda completamente fuera de este proyecto.

## Ya está hecho

- **Proyecto Supabase** `agritracer-don-ricardo` (ref `ptsvriudoilsyofgccsb`,
  plan gratuito, región us-west-1) con las 7 tablas, RLS, triggers de fórmulas
  y funciones/RPC aplicadas (`supabase/migrations/0001..0006`).
- **Usuario admin inicial** ya creado en Supabase Auth:
  - Usuario: `admin`
  - Contraseña temporal: `DonRicardo2026` (te la pedirá cambiar en el primer login)
- **Listas maestras** sembradas con los fundos/variedad/calibres/presentación
  reales que ya conocíamos del Excel origen (puedes agregar más desde
  Configuración → Listas maestras).
- Todo el código del sitio (`index.html`, `ciclos/`, `reubicacion/`, `api/`).

## Pendiente de ti

### 1. Instalar Git y subir el código
Instala Git for Windows, luego desde esta carpeta (`SITIO_AGRITRACER/`):
```
git init
git remote add origin https://github.com/eternal2026-cloud/ADR_Agri_Tracer.git
git add .
git commit -m "AgriTracer: Tiempos de Ciclo + Reubicación (Vercel + Supabase)"
git push -u origin main
```

### 2. Desplegar en Vercel
1. vercel.com → **Add New → Project** → importa `ADR_Agri_Tracer`.
2. Framework Preset: **Other**. Deja vacíos Build Command y Output Directory.
3. Antes de darle **Deploy**, agrega las variables de entorno (Settings → Environment Variables):
   - `SUPABASE_URL` = `https://ptsvriudoilsyofgccsb.supabase.co`
   - `SUPABASE_ANON_KEY` = la clave publishable (`sb_publishable_...`) — Supabase Dashboard → Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave **service_role** (Project Settings → API → “service_role secret”). **Nunca la pongas en ningún archivo del repo** — solo aquí, en Vercel.
4. Deploy. Abre el enlace y entra con `admin` / `DonRicardo2026`.

### 3. Primer login
1. Entra con `admin` / `DonRicardo2026` — te pedirá una contraseña nueva de inmediato.
2. Ve a **Configuración** y crea los usuarios reales de tu equipo (rol `admin`,
   `captura` para quienes registran datos en campo, `visor` para consulta).
3. Revisa/completa las **Listas maestras** (Fundo, Variedad, Calibre,
   Presentación, Tareadora) si falta algún valor.

### 4. Cargar datos históricos (opcional)
El Excel `5.1. TIEMPO DE CICLO ACTUALIZADO.xlsx` (234 filas) no se migró
automáticamente. Si quieres verlo en el resumen, hay que insertarlo en la
tabla `ciclos_cosecha` fila por fila (para que el trigger calcule `semana` y
los 13 tiempos igual que el Excel). Dímelo y preparo el script de carga.

## Pendiente de diseño (no bloquea el uso del sitio)

### Sincronización automática hacia Google Sheets (auditoría)
Planificado pero no construido todavía: una Edge Function de Supabase
(`supabase/functions/sync-sheets`) que cada hora sobrescribe pestañas de un
Google Sheet (`Ciclos_BD`, `Resumen_Semanal`, `Personal_Reubicacion`,
`Auditoria_Escaneos`) usando una cuenta de servicio de Google. Requiere que
tú (una sola vez):
1. Crees un proyecto en Google Cloud Console y habilites la **Google Sheets API**.
2. Crees una **cuenta de servicio**, generes su clave JSON.
3. Crees el Google Sheet destino y lo compartas como Editor con el correo de
   esa cuenta de servicio.

Avísame cuando tengas esas credenciales y construyo la función.

## Estructura del repo

```
index.html              Login + selector de módulo (Planta futuro / Campo)
css/estilos.css          Sistema visual único (Don Ricardo)
js/nucleo.js             Utilidades DR.* (animaciones, toasts, sonido)
js/supabase-cliente.js   Cliente Supabase + sesión + helpers RPC (namespace AT)
vendor/                  anime.js, supabase-js, html5-qrcode, jsQR (UMD)

ciclos/                  Módulo Tiempos de Ciclo (Resumen · Captura · Config)
  js/ui.js, grafico.js, resumen.js, captura.js, config.js, app.js

reubicacion/             Módulo Reubicación de Personal (Escanear · Personal · Datos)
  js/datos.js (Supabase + caché offline), escaner.js (sin cambios), vistas.js, app.js
  vendor/xlsx.full.min.js, plantilla/

api/                     Funciones serverless de Vercel (Node)
  admin-crear-usuario.js, admin-reset-password.js  (usan SUPABASE_SERVICE_ROLE_KEY)

supabase/migrations/     Esquema SQL completo (ya aplicado al proyecto)
```

## Notas de seguridad

- Todo acceso de escritura sensible pasa por funciones RPC de Postgres que
  validan el rol del usuario (`admin`/`captura`/`visor`) — nunca confían en
  que el cliente oculte botones.
- La `service_role key` de Supabase solo vive como variable de entorno en
  Vercel, usada exclusivamente por `api/admin-*.js`. Nunca la pegues en un
  archivo del repo.
- `reub_personal` es legible sin login (paridad con el sitio anterior, que ya
  publicaba el Excel sin protección); si quieres subir el nivel de
  protección, activa *Vercel Deployment Protection* sobre `/reubicacion` o
  pide un PIN de planta antes de escanear.
