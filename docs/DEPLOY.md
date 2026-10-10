# Rovia: GitHub, Vercel y Supabase

Repositorio: https://github.com/Recamm/Rovia. El código del frontend usa React + TypeScript + Vite. Supabase aloja la base, Auth, Storage y las Edge Functions.

## Estado de la entrega

El código se publica en `Recamm/Rovia`. El Supabase `scektvkakqnrjndjaupe` ya tiene las ocho migraciones y los 7.510 locales; ambas Edge Functions están desplegadas. La preview está conectada. Falta importar el repositorio en tu cuenta Vercel, configurar Auth/SMTP y CORS para ese dominio, programar la limpieza y registrar/asignar tu administrador.

## 1. Trabajar con tu repositorio

Si la publicación directa no quedó disponible, descargá el ZIP de esta entrega, cloná tu repositorio y copiá los archivos dentro de esa carpeta. Conservá su `.git`; no copies metadatos de Sites. Si el repositorio ya tiene trabajo, hacelo en una rama y revisá los cambios antes de fusionar.

```bash
git clone https://github.com/Recamm/Rovia.git
cd Rovia
git switch -c rovia-gastronomia-admin
# Copiar aquí el contenido del ZIP: package.json debe quedar en la raíz.
npm ci
npm run typecheck
npm test
npm run catalog:check
npm run build
git add .
git commit -m "Agregar gastronomía, mapa personal y administración de Rovia"
git push -u origin rovia-gastronomia-admin
```

Abrí el pull request hacia `main`, revisá el resultado de GitHub Actions y fusioná. Si el repositorio está completamente vacío, podés subir directamente a `main`. El ZIP no contiene `.git`, `.openai`, `node_modules`, claves ni el build generado.

## 2. Preparar tu Supabase vacío

Usá un proyecto dedicado a Rovia, sin tablas de otra aplicación. Instalá Supabase CLI según su documentación oficial y ejecutá desde la raíz:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

En un proyecto vacío, esto aplica **ocho migraciones**. En el proyecto actual, las versiones locales coinciden con las ya aplicadas y `db push` no debe repetirlas. No uses comandos de reset contra producción. Alternativamente, podés aplicar los ocho SQL de `supabase/migrations` en orden en SQL Editor; usar CLI permite conservar el seguimiento de migraciones.

La región territorial queda incorporada en la migración `catalog_admin` con polígonos OSM de CABA y todo el partido de Vicente López. Los administradores se guardan en un esquema privado: la cuenta no puede concederse ese permiso desde el cliente.

### Variables públicas del frontend

Copiá `.env.example` a `.env.local` para trabajar localmente y completá:

```dotenv
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA_PUBLISHABLE
```

La URL y la clave publishable están en la configuración/API del proyecto. También se admite la clave `anon` heredada. Las variables `VITE_*` se incluyen en el código público al compilar. Nunca pongas una clave secreta, `service_role`, contraseña de base ni token de Supabase en una variable `VITE_*` o en GitHub.

### Importar o actualizar los 7.510 locales de la entrega

La carga inicial al proyecto actual ya se completó. Repetí este paso solo para otro entorno o para actualizar el catálogo.

Creá `.env.import.local` (ignorado por Git) en tu computadora:

```dotenv
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CLAVE_DEL_BACKEND_CONFIABLE
```

```bash
node --env-file=.env.import.local scripts/import-catalog.mjs
```

La carga usa lotes de 100 y puede repetirse: conserva identificadores, cambios del administrador, bajas y actividad personal. En modo conectado, el mapa consulta la base; si no importás el catálogo, no aparecerán esos locales.

### Fotos y limpieza

```bash
npm run prepare:edge
supabase functions deploy image-upload --no-verify-jwt
supabase functions deploy photo-cleanup --no-verify-jwt
```

Ambas ya están desplegadas en el proyecto actual. Estos comandos permiten actualizarlas. `prepare:edge` incorpora el WASM al paquete; el despliegue de texto inicial usa el artefacto fijado con comprobación SHA-256 como alternativa. Estas funciones verifican los permisos dentro de su implementación. Copiá `supabase/functions/.env.example` a `supabase/.env.local`, completá `ALLOWED_ORIGINS` con los orígenes exactos del frontend y generá `PHOTO_CLEANUP_SECRET` aleatorio. Luego:

```bash
supabase secrets set --env-file supabase/.env.local
```

Programá la limpieza cada diez minutos siguiendo el README. El secreto de limpieza queda en el backend. La cola respeta quince minutos de gracia y comprueba referencias antes de eliminar archivos huérfanos.

## 3. Conectar Vercel con GitHub

En tu cuenta Vercel, importá `Recamm/Rovia` y elegí:

| Opción            | Valor                |
| ----------------- | -------------------- |
| Framework         | Vite                 |
| Root Directory    | Raíz del repositorio |
| Install Command   | `npm ci`             |
| Build Command     | `npm run build`      |
| Output Directory  | `dist`               |
| Production Branch | `main`               |

Cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en las variables de Vercel antes de desplegar. Conservá las variables cartográficas si cambiás el proveedor. Si modificás variables después, generá un nuevo despliegue: Vite las incorpora durante la compilación.

Vercel desplegará automáticamente los cambios de `main` en producción y generará previews para otras ramas/pull requests. No necesitás una GitHub Action adicional que publique en Vercel. El workflow `ci.yml` verifica tipos, pruebas, catálogo, Edge Functions y build.

Para impedir que una rama con fallas se fusione, configurá la protección de `main` con el check `verify` obligatorio. Los despliegues de Vercel pueden empezar de forma independiente a GitHub Actions: el check obligatorio protege la fusión, no convierte ambos procesos en uno.

**Las migraciones no se ejecutan desde Vercel.** Antes de fusionar cambios que las necesiten, aplicalas al proyecto correspondiente con CLI. Las nuevas migraciones deben ser compatibles con la versión del frontend que siga desplegada durante el cambio.

El plan Hobby de Vercel se limita a uso personal no comercial. Elegí un plan compatible si el proyecto pasa a operar comercialmente.

## 4. Configurar acceso y correo

En Supabase Auth:

- Site URL: URL definitiva de Vercel o tu dominio.
- Redirect URLs: direcciones exactas `/auth/callback` y `/auth/reset` del dominio de producción, más las direcciones locales necesarias.
- Si usás previews con acceso, autorizá solo los patrones de tu cuenta/proyecto; evitá un permiso global para cualquier `vercel.app`.
- Activá confirmación de correo y configurá SMTP para los usuarios del piloto.

Las previews conectadas al proyecto de producción pueden modificar datos reales. Para probar cambios de permisos, migraciones o borrados, usá un proyecto Supabase de desarrollo separado y sus propias variables de Preview.

## 5. Convertir tu cuenta normal en administradora

1. Registrá tu cuenta en Rovia con tu correo y confirmalo.
2. Abrí `supabase/operations/grant-admin.sql`.
3. Reemplazá `REEMPLAZAR_POR_TU_CORREO` por ese correo.
4. Ejecutalo en SQL Editor como propietario del proyecto.
5. Recargá Rovia y abrí Configuración → **Alternar a vista de administrador**.

No se crea una contraseña predefinida ni una cuenta universal. El administrador puede seguir usando listas, reseñas y amigos como cualquier usuario. La vista administrativa no concede permisos: el servidor comprueba el rol en cada operación. Una revocación impide nuevas acciones aunque la pestaña siga abierta.

En `/admin` podés revisar propuestas en el mapa, corregirlas y publicarlas, rechazarlas con un motivo o vincularlas a un local existente. También podés dar de alta, editar, marcar cierre permanente, dar de baja y restaurar locales. Las bajas conservan reseñas, visitas y listas; el historial registra las acciones.

## 6. Comprobar el piloto

Probá con un visitante, tu cuenta administradora y otra cuenta normal: registro/confirmación/reset, guardados, varias listas, filtros de Mi mapa, propuesta pendiente, aprobación, rechazo, edición y baja/restauración. Verificá que la cuenta normal no pueda abrir datos administrativos ni cambiar roles. Probá fotos y permisos con dos cuentas y recargá rutas directas en Vercel.

El entorno de esta entrega verifica SQL/PostGIS, componentes y compilación; incluye la carga y consultas SQL reales en tu Supabase, pero no sustituye los recorridos con cuentas confirmadas ni la revisión visual de mapa y celular en navegador real.

Fuentes oficiales: [Vercel + GitHub](https://vercel.com/docs/git/vercel-for-github), [plan Hobby](https://vercel.com/docs/plans/hobby), [redirecciones Supabase](https://supabase.com/docs/guides/auth/redirect-urls), [CLI y migraciones](https://supabase.com/docs/guides/deployment/database-migrations).
