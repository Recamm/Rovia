# Verificación de Rovia — actualización 10/10/2026 (Argentina)

- 58 pruebas aprobadas en 11 archivos. El entorno SQL aplica todas las migraciones, incluida la migración pendiente de producción, en PostgreSQL/PGlite con PostGIS aislado.
- TypeScript estricto, chequeo Deno de tres Edge Functions, build de producción y catálogo verificados.
- Íconos claro/oscuro 180 × 180 comprobados como completamente opacos. Hay variantes 32, 192, 512 y maskable, con manifiestos separados.
- Se corrigieron las consultas de autor `profiles!reviews_user_id_fkey` en perfil y ficha. No se usa una relación implícita ambigua.
- Se verifica creación privada con RETURNING, repetición de visitas al mismo local, puntaje opcional, límite y privacidad de fotos, bloqueos de escritura ajena, limpieza, acceso a Mi mapa, protección del último administrador, suspensión y eliminación con dependencias.

## Estado real de producción

- Supabase Rovia: nueve migraciones aplicadas, 7.510 locales. La cuenta existente `@camilo` recibió el rol administrador después de confirmación de identidad del propietario.
- Migración aditiva `20261011003554_visit_posts_and_user_admin.sql` aplicada. Tablas posts/post_photos/post_likes con RLS, bucket privado y funciones desplegadas.
- `image-upload` versión 3, `photo-cleanup` versión 2 y `admin-users` versión 1 activas. Autenticación dentro de las funciones; no se expone service_role al frontend.
- `20261011003715_account_lifecycle_controls.sql` NO aplicada: la revisión automática bloqueó el cambio amplio de permisos y eliminación. Las acciones de suspensión/restauración/eliminación se rechazan también en el servidor hasta habilitación. Los tests prueban cómo funcionarán al aprobarse.
- Supabase Advisors no informa tablas sin RLS. Los avisos SECURITY DEFINER corresponden a APIs intencionales con controles de rol; la protección de contraseñas filtradas sigue deshabilitada en Auth.

## Límites de verificación y pendientes

- No se ejecutó revisión visual en navegador ni instalación física en iPhone. Se conserva la limitación del entorno Sites; las pruebas jsdom sustituyen Leaflet.
- No se inició una sesión real ni se subió una foto desde una cuenta humana. Las pruebas de funciones sin sesión y las consultas REST son complementarias a los tests aislados.
- Deshabilitar Confirm email y activar SMTP Brevo requiere configuración de Auth, no un cambio de frontend. Estos cambios siguen pendientes; el mensaje de registro ya maneja sesión inmediata cuando el servidor la habilite.
- El envío y llegada de recuperación por correo no se consideran probados. No se enviaron correos de prueba.
- La PWA selecciona el manifiesto e ícono según tema al instalar. iOS puede conservar el ícono instalado: no se promete su sustitución automática al cambiar el tema.
- La limpieza de fotos sigue requiriendo PHOTO_CLEANUP_SECRET y cron; el borrado de referencias es inmediato y los archivos quedan encolados.
- Verificar visualmente claro/oscuro, navegación central, teclado móvil y rutas directas en el dispositivo del usuario.
