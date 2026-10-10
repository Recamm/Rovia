# Rovia

App web en español para explorar lugares, compartir experiencias y organizar planes. Implementada a partir del prompt y los dos PDF entregados el 10 de octubre de 2026.

## Estado de esta entrega

El frontend está construido en **React 19 + TypeScript estricto + Vite**, con React Router, TanStack Query y React Leaflet. Incluye SQL de Supabase/PostGIS, políticas RLS, APIs transaccionales, funciones de fotos, importador OSM y pruebas.

**Conectado al proyecto Supabase Rovia (`scektvkakqnrjndjaupe`).** Se aplicaron las ocho migraciones, se cargaron los 7.510 locales y se desplegaron `image-upload` y `photo-cleanup`. La preview se compila con URL y clave pública. Quedan la configuración de correo y redirecciones, el secreto/cron de limpieza y el registro de la cuenta que será administradora. No se simulan cuentas ni actividad personal.

El catálogo contiene **7.510 locales gastronómicos con nombre**, normalizados de **7.824 objetos OSM**, descargados el **10/10/2026**. Incluye CABA y **todo el partido de Vicente López**, recortados mediante sus límites administrativos OSM (relaciones 3082668 y 2752665). Son restaurantes, cafeterías, bares, heladerías, panaderías, pastelerías y comida rápida. Excluye kioscos, supermercados y comercios ajenos. No garantiza todos los negocios existentes ni una verificación presencial. No hay reseñas o personas sintéticas en producción.

**Guía para tu repositorio y Vercel:** [docs/DEPLOY.md](docs/DEPLOY.md). Incluye conexión a Supabase, importación, correo y asignación de tu cuenta administradora.

El mapa abre **Explorar** por defecto. **Mi mapa** reúne guardados, pendientes, visitas, reseñas y lugares de listas propias o colaborativas aceptadas, sin duplicar pins. Filtra por estado y lista. Los locales faltantes se proponen desde `/sugerir-local` y solo se publican después de aprobación. La cuenta con rol administrador alterna su vista desde Configuración y gestiona catálogo, propuestas, bajas/restauraciones y auditoría desde `/admin`.

La identidad utiliza la propuesta del informe: verde `#203F3B`, terracota `#C64E3B`, crema `#FFF9F1` y menta `#DAEEE8`; Plus Jakarta Sans (OFL) y voseo moderado. Perfil y reseñas empiezan para amigos, visitas para amigos y listas privadas; el usuario puede cambiarlo. Rovia continúa como nombre de trabajo.

## Inicio rápido

Requiere Node.js **22.12 o posterior** (se verificó con Node 24), npm y, para servicios alojados, un proyecto Supabase nuevo dedicado a Rovia.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abrí `http://localhost:5173`. Sin credenciales funciona la exploración de la extracción OSM incluida. El almacenamiento del catálogo incluido es de solo lectura: no reemplaza la base de actividad de Rovia ni guarda cambios personales.

```bash
npm run typecheck
npm test
npm run build
```

## Conectar Supabase

El proyecto actual ya está preparado. Los pasos siguientes sirven para configurar tu entorno local o crear otro entorno de prueba. No reapliques a mano las migraciones que ya figuran en el historial.

1. Para otro entorno, creá un **proyecto nuevo** de Supabase. No ejecutes estas migraciones sobre una aplicación existente. Los nombres pertenecen al dominio Rovia; no hay scripts de reset ni borrados masivos.
2. Instalá Supabase CLI según su documentación oficial. Ejecutá `supabase login`, `supabase link --project-ref TU_PROJECT_REF` y `supabase db push` desde esta carpeta. También podés aplicar los ocho archivos SQL, en orden, mediante SQL Editor.
3. Las migraciones crean tablas, categorías, PostGIS en `extensions`, restricciones, índices, RLS, RPC y los buckets privados `review-photos` y `avatars`. No cambies esos buckets a públicos. PostgREST debe exponer únicamente `public`; **no expongas `private`**. Los permisos adicionales de funciones se conceden explícitamente.
4. En `.env.local`, completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Se admite la clave pública legacy mediante `VITE_SUPABASE_ANON_KEY`. Reiniciá Vite o reconstruí el frontend. Las claves `service_role` van solo en entornos confiables.
5. En Authentication, habilitá email/contraseña, confirmación de correo y una longitud mínima de contraseña de 8. Configurá SMTP para el piloto. El envío real de correo y recuperación no se probaron en esta entrega.
6. Site URL: tu dominio de frontend. Redirect URLs: `http://localhost:5173/auth/callback`, `http://localhost:5173/auth/reset`, y sus equivalentes con tu dominio publicado. Conservá los parámetros `next` en los enlaces de confirmación. La app rechaza destinos fuera de su origen.
7. Prepará y desplegá las funciones:

```bash
npm run prepare:edge
npm run check:edge
supabase functions deploy image-upload --no-verify-jwt
supabase functions deploy photo-cleanup --no-verify-jwt
```

`image-upload` usa `auth.getUser()` en cada petición para validar el JWT del usuario, y verifica la propiedad de la reseña en el servidor. `verify_jwt=false` no significa acceso anónimo: el endpoint comprueba la sesión antes de cualquier escritura. La función de limpieza valida un secreto diferente y no acepta sesiones de usuarios.

8. Creá un archivo **local e ignorado** `supabase/.env.local`, a partir de `supabase/functions/.env.example`. Configurá `ALLOWED_ORIGINS` con tus orígenes exactos separados por comas y generá un `PHOTO_CLEANUP_SECRET` aleatorio de al menos 32 bytes. Subilo con `supabase secrets set --env-file supabase/.env.local`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son secretos de entorno suministrados normalmente por Supabase para funciones alojadas.
9. Importá el catálogo incluido a la base, según la sección siguiente. En modo conectado, **las búsquedas consultan PostgreSQL**, no el snapshot ni Overpass. Una base conectada sin importar mostrará cero resultados.
10. Probá registro, confirmación, recuperación, carga de fotos y aislamiento de usuarios en un proyecto de prueba antes de invitar participantes.

Las variables Vite se resuelven al compilar: cambiar valores de entorno en el host sin reconstruir no conecta el frontend.

## Catálogo e importación OSM

Los importadores corren en Node, fuera del navegador. `scripts/refresh-catalog.mjs` descarga las dos regiones administrativas, conserva los originales y normaliza nodos, vías y relaciones. Exige nombre y coordenadas válidas; no inventa dirección, precio, horario ni puntajes. El catálogo está recortado con los límites OSM versionados en `data/coverage.geojson`, con fuente cruda en `data/coverage-osm.json`.

Para validar o refrescar el catálogo local (sin escribir en Supabase):

```bash
npm run catalog:check
npm run catalog:refresh
```

Para importar el catálogo entregado a Supabase, desde un entorno confiable con `.env.import.local` ignorado:

```bash
node --env-file=.env.import.local scripts/import-catalog.mjs
```

Límites: 20 MB por respuesta, 20.000 objetos por región, consultas Overpass de 40 segundos y petición de 55 segundos, hasta tres intentos. El importador de base usa lotes de 100 y timeout de 30 segundos. No se consulta Overpass por movimiento del mapa. No programes descargas frecuentes contra instancias públicas.

El importador anterior `scripts/import-osm.mjs` sigue disponible para lotes acotados de hasta 0,08° por lado con recorte mediante `--polygon-file`. Para cargar la entrega completa, preferí `import-catalog.mjs`: conserva las categorías y zonas del snapshot validado. Los IDs deterministas evitan duplicados de un mismo objeto OSM; negocios repetidos con distintos objetos pueden requerir revisión. Una ausencia en una importación nunca marca automáticamente un cierre. Las ediciones administrativas y las bajas prevalecen sobre nuevas descargas.

Los datos OSM están bajo ODbL; conservá la atribución y cumplí sus condiciones para la base y sus derivados. `data/osm-source.json` es la descarga original reproducible. Las experiencias y perfiles se guardan por separado y no deben exportarse como parte del catálogo abierto.

## Fotos y limpieza

La función intenta usar el WASM empaquetado por CLI. Si no está presente, descarga la versión 0.0.44 fijada desde jsDelivr y verifica SHA-256 antes de inicializarla; una falla impide procesar la imagen y puede reintentarse. El primer uso de cada instancia depende de esa descarga. Para evitarla, desplegá por CLI con `npm run prepare:edge`.

La función admite JPEG, PNG y WebP; valida firmas, decodifica el contenido con ImageMagick WASM, restringe recursos, aplica orientación, retira metadatos y reencodea como JPEG. Produce una versión de hasta 1.600 px y una miniatura de hasta 360 px. Avatar: hasta 512 px. Máximo 5 MB por entrada y 8 megapíxeles; si supera recursos del runtime también se rechaza. No se aceptan SVG, PDF ni URLs de imagen. La transparencia se aplana al generar JPEG.

El máximo de cinco fotos se verifica en una transacción con bloqueo de la fila de reseña. Storage y metadatos son escritos exclusivamente por la Edge Function. Cada ruta se encola antes de subir archivos y se retira de la cola al registrar la foto. Si el proceso se interrumpe, el limpiador puede recuperar ese archivo. Si falla el registro, se intenta además retirar los archivos de inmediato. Si una reseña se guardó pero una foto falló, la interfaz conserva su ID y permite reintentar sin crear otra reseña.

Borrar una foto o reseña elimina referencias y encola sus archivos. La moderación **oculta** fotos y permite restaurarlas. La cola requiere ejecución periódica de `photo-cleanup`, vía Supabase Cron/pg_net o un programador confiable. Configurá una llamada POST cada 10 minutos con `Authorization: Bearer PHOTO_CLEANUP_SECRET`, almacenando el secreto en Vault o en el programador, nunca en SQL público ni el frontend. La función procesa hasta 200 rutas por llamada después de un margen de 15 minutos, vuelve a comprobar referencias activas para proteger fotos válidas y conserva la cola si hay fallos; ejecutá más lotes si se acumula trabajo.

La limpieza no se programó sobre una cuenta real. Monitoreá la cola. Las subidas interrumpidas quedan registradas antes de escribir Storage; los objetos ajenos a este flujo deben revisarse por separado, evitando borrar archivos válidos. Los objetos sin referencia no son accesibles por RLS.

Las fotos se sirven con URLs firmadas de **60 segundos**. Al revocar permisos, las consultas nuevas se bloquean; una URL ya emitida puede seguir funcionando hasta vencer. La interfaz vuelve a validar imágenes cada 45 segundos y registros sociales cada 30; las mutaciones invalidan cachés inmediatamente. Cerrar sesión o cambiar de cuenta limpia todas las consultas.

## Privacidad y modelo

- Perfiles mínimos (`id`, nombre, usuario, avatar) permiten encontrar personas; biografía, preferencias y contadores están protegidos.
- Reseñas, visitas y listas combinan la visibilidad del perfil con su visibilidad individual. Una restricción de cualquiera reduce la audiencia.
- Seguimiento unilateral y amistad aceptada son sistemas separados. Solicitudes cruzadas quedan en un único estado pendiente y requieren aceptación explícita.
- Guardado, pendiente y visita son registros independientes. No se guarda historial GPS ni se publica actividad por abrir o guardar un local.
- Los miembros aceptados tienen acceso específico a su lista. Propietario administra; editor modifica contenido; lector consulta. Se revoca acceso al retirar membresía.
- Feed cronológico combina reseñas y visitas compartidas y pagina por fecha + ID estable. RLS se evalúa en cada consulta.
- Promedios públicos usan reseñas públicas activas **de perfiles públicos**; no incluyen contenido para amigos ni oculto.
- Notificaciones se crean desde acciones verificadas y se filtran con permisos vigentes. No hay emails sociales ni push.
- Hay límites de frecuencia del servidor para publicaciones, relaciones, reportes, listas y fotos. Aumentalos solo después de medir uso real.

Entidades: perfiles/detalles → reseñas/fotos/likes; lugares/fuentes/overlays/categorías; seguidores/amistades; guardados/pendientes/visitas; listas/miembros/lugares; notificaciones/preferencias; correcciones/reportes/auditoría. La tabla `private.moderators` nunca puede editarse desde el perfil.

## Moderación y borrados

Registrá y confirmá la cuenta del primer moderador. Obtené su UUID en Authentication. Desde SQL Editor de un proyecto confiable:

```sql
insert into private.moderators(user_id)
select id from public.profiles where username = 'TU_USUARIO_EN_MINUSCULAS'
on conflict do nothing;
```

Verificá que corresponda a la cuenta correcta. El panel `/moderacion` solo opera con ese rol. Aprobación/rechazo de propuestas, ocultación/restauración de reseñas o fotos y fusión registran autor, fecha y motivo. Una corrección con `closed:true` marca cierre permanente, preserva la ficha y excluye el lugar de búsquedas ordinarias.

Fusión: una corrección con `duplicate_of:UUID_CANONICO` mueve fuentes, guardados, visitas y listas a la ficha canónica. Si un autor tenía dos reseñas, conserva ambas y archiva la del duplicado para sostener una única activa. Sus textos y fotos siguen almacenados y el autor puede revisar el historial; no se borran silenciosamente. La reimportación del alias no reemplaza el local canónico. Los permisos siguen evaluándose en el lugar activo.

La app no ofrece un borrado de cuenta automatizado. Para solicitudes de eliminación, verificá identidad y resolvé primero las listas de las que la cuenta es propietaria: transferir a un miembro que acepte o cerrarlas con aviso. La FK de `lists.owner_id` impide borrar accidentalmente un propietario. Preservá la auditoría necesaria y retirá fotos mediante la cola antes/después del borrado de Auth. No cambies restricciones para forzar el borrado.

## Teselas, despliegue y rutas

`VITE_TILE_URL` y `VITE_TILE_ATTRIBUTION` son configurables. La configuración inicial utiliza teselas públicas OSM para revisión acotada; no tiene SLA ni disponibilidad ilimitada. Elegí y configurá un proveedor adecuado al tráfico del piloto y conservá su atribución. Se usa OSM como catálogo independientemente del proveedor cartográfico.

Vercel: framework Vite, build `npm run build`, output `dist`; configurá variables Vite en el host antes de compilar. `vercel.json` conserva las rutas directas. La investigación señala que debe revisarse la adecuación del plan de hosting al objetivo comercial; también podés usar un host estático con fallback SPA como Cloudflare Pages (`public/_redirects`).

Esta entrega se publica en un Site **privado** para revisión. Ese acceso privado al frontend es independiente de Supabase Auth y RLS. Para uso compartido de un piloto necesitás configurar su alojamiento/audiencia y los servicios propios; no se cambió el acceso a público.

Rutas: `/`, `/local/:id`, `/local/:id/resena`, `/actividad`, `/guardados`, `/lista/:id`, `/personas`, `/perfil`, `/persona/:id`, `/persona/:id/conexiones`, `/notificaciones`, `/configuracion`, `/auth`, `/auth/callback`, `/auth/reset`, `/sugerir-local`, `/admin` y `/moderacion`.

## Verificación

Vitest verifica reglas, horarios, normalización, interfaz y las migraciones **sin modificarlas** en PostgreSQL/PGlite con PostGIS. El harness imita solo los esquemas de plataforma `auth` y `storage` y roles; los datos de prueba viven en memoria, separados de producción. No sustituye pruebas de PostgREST, JWT, correo o el Storage alojado.

Se comprobó directamente con roles SQL: visitante, propietario, amigo, seguidor, tercero, lector, editor y moderador. Se cubren acceso a registros/objetos, revocación de amistad y membresía, autor falsificado, restricción de columnas, duplicados, agregados, importación idempotente, correcciones, moderación, visitas y notificaciones.

Se incluyen pruebas Playwright para escritorio/celular de mapa, ficha, recarga, ubicación rechazada y estado sin Supabase. En una máquina con navegador instalado:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

**No se ejecutaron pruebas de navegador en este entorno** porque no estuvo disponible el controlador compatible. No se verificó visualmente el despliegue ni la interacción táctil. Los recorridos de registro, confirmación, reset, Storage/Edge alojados y RLS a través de PostgREST requieren configurar Supabase y un proyecto de prueba.

Consultá `VERIFICACION.md` para el detalle de cobertura y límites.

## Fuentes técnicas

- https://react-leaflet.js.org/docs/start-installation/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/postgis
- https://supabase.com/docs/guides/functions/examples/image-manipulation
- https://supabase.com/docs/guides/storage/serving/downloads
- https://pglite.dev/extensions/
- https://www.openstreetmap.org/copyright/es
- https://operations.osmfoundation.org/policies/tiles/
- https://dev.overpass-api.de/output_formats.html

Dependencias exactas resueltas en `package-lock.json`. Plus Jakarta Sans conserva su licencia OFL dentro de su paquete; Leaflet, iconos, WASM y PostGIS mantienen sus licencias de origen. Antes de abrir el piloto, completá políticas de privacidad/uso, catálogo auditado, SMTP, almacenamiento y cuotas, según la investigación entregada.

## Administración y propuestas de locales

El rol administrador se asigna exclusivamente desde SQL Editor o un backend confiable con `supabase/operations/grant-admin.sql`, después de registrar la cuenta normal. No existe contraseña administrativa de fábrica ni opción del cliente para otorgarse el rol. Los administradores también pueden abrir el panel de moderación existente; un moderador no obtiene automáticamente permiso para editar el catálogo.

Las propuestas tienen nombre, categoría, dirección, coordenadas y datos opcionales; quedan privadas para su autor y los administradores. Las RPC validan ámbito gastronómico/geográfico, restringen campos, aplican límites de envío y bloquean falsificación de autor/estado. La aprobación bloquea el registro para impedir publicarlo dos veces. Se puede vincular una propuesta a un local existente para resolver duplicados sin crear otro.

Las altas y ediciones exigen un motivo y quedan auditadas. “Dar de baja” archiva el local: lo retira de Explorar y Mi mapa, conserva su ficha histórica y las reseñas/listas/visitas y permite restaurarlo. “Cerrado permanentemente” describe el estado comercial y no borra el historial. La búsqueda administrativa muestra hasta 300 resultados por zona/búsqueda; las propuestas tienen paginación de 100. La auditoría muestra las últimas 50 acciones.
