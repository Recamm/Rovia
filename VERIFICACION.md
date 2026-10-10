# Verificación de Rovia — 10/10/2026

## Resultado comprobado

- 45 pruebas aprobadas en ocho archivos: dominio, importación, imágenes, SQL/PostGIS y componentes.
- TypeScript estricto, chequeo de Edge Functions con Deno y catálogo verificados.
- Catálogo real: 7.824 objetos OSM originales; 7.510 locales con nombre, identidad estable y coordenadas dentro de CABA o todo el partido de Vicente López. Cero registros fuera de esos límites en Supabase.
- Supabase Rovia (`scektvkakqnrjndjaupe`): ocho migraciones aplicadas y sus versiones sincronizadas con los archivos locales. 7.510 lugares activos importados, cero cuentas y cero propuestas de prueba.
- REST alojado con clave publishable: Explorar devuelve 200 resultados como máximo por consulta; Mi mapa sin sesión devuelve 401. No se escribe actividad de usuarios desde un visitante.
- Edge Functions `image-upload` y `photo-cleanup` activas; ambas rechazan solicitudes sin la autenticación correspondiente (401). No se completó una subida autenticada.

## Funciones y permisos

Los tests SQL aplican los archivos reales de migración en PostgreSQL/PGlite con PostGIS. Solo adaptan los esquemas de plataforma `auth` y `storage`. Sus usuarios y locales sintéticos viven exclusivamente en memoria.

Se verifica aislamiento entre propietario, amigo, seguidor, tercero y miembros de listas; revocación de amistad/membresía; privacidad de reseñas y fotos; agregados públicos; importación idempotente; conservación de cambios administrativos y bajas; propuestas privadas; rechazo de roles no administradores; aprobación única; creación y archivo de lugares con auditoría. Mi mapa combina estados personales y listas propias o colaborativas aceptadas, aplicando filtros antes del límite de resultados.

Los tests de interfaz comprueban Explorar por defecto, acceso requerido a Mi mapa/propuestas, bloqueo de la vista administrativa para una cuenta normal, edición de propuestas y confirmación de rechazo. La capa cartográfica se sustituye en jsdom: estas pruebas no verifican el dibujo de Leaflet ni la distribución visual real.

ImageMagick reprocesa una imagen JPEG real, retira metadatos y produce miniatura. El despliegue inicial de texto descarga el WASM fijado 0.0.44 desde jsDelivr, validando SHA-256; el artefacto descargado coincidió con el paquete local. El despliegue por CLI puede incorporar ese binario y evitar la descarga en frío.

## Revisión de Supabase Advisors

No se reportaron tablas expuestas sin RLS. Los avisos de funciones SECURITY DEFINER corresponden a APIs intencionales; su autorización y permisos EXECUTE se revisaron y se prueban. La revisión también señala oportunidades de rendimiento: índices de claves foráneas y evaluación de `auth.uid()` en políticas. No se afirma que estén optimizadas para grandes volúmenes. Los índices sin uso son esperables antes de actividad real; no se retiraron por ese motivo.

Referencias del diagnóstico: [funciones públicas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [funciones autenticadas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [políticas y rendimiento](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).

## Pendiente de configuración y prueba

- Importar `Recamm/Rovia` en Vercel con las dos variables públicas; establecer URLs de Auth y SMTP.
- Registrar y confirmar la cuenta normal, identificar su correo y asignarle el rol administrador con el SQL incluido.
- Configurar `ALLOWED_ORIGINS` para el dominio definitivo, `PHOTO_CLEANUP_SECRET` y cron de limpieza. La función de limpieza desplegada permanece cerrada hasta configurar el secreto.
- Probar correo, sesiones, listas, propuestas, fotos y URLs firmadas con cuentas reales. No se inventaron credenciales ni se enviaron correos de prueba.
- Verificar mapa, móvil, teclado y rutas directas en navegador real. No se ejecutó Playwright ni se inició un navegador alternativo en este entorno.

El catálogo no representa un censo exhaustivo: incluye los negocios gastronómicos con nombre que figuran en la extracción OSM. Las sugerencias y la administración permiten completar faltantes. No se inventan precios, horarios, puntuaciones ni reseñas. Las bajas preservan historial y se distinguen del cierre permanente.
