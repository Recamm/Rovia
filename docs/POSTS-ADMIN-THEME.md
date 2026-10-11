# Publicaciones, administradores, tema y correo

## Publicaciones

Desde la ficha del local, elegí **Publicar visita**. Incluí descripción y fecha; la calificación y las fotos son opcionales. Podés crear publicaciones independientes para visitas repetidas. Las publicaciones aparecen en tu perfil, la ficha del lugar y la pestaña Publicaciones de Actividad. También incorporan el lugar a Mi mapa > Ya fui. El puntaje del post no cambia la valoración general, que sigue utilizando la única reseña activa por persona y local.

Hasta cinco imágenes JPEG, PNG o WebP por publicación, 5 MB por imagen. El procesador verifica el contenido, elimina metadatos y genera miniaturas; Storage es privado y la privacidad del perfil también limita el acceso. Si falla una foto, reintentar no duplica el post ya creado. Editar o borrar un post se hace desde su tarjeta. Las fotos se retiran de la API inmediatamente y se encolan para limpieza; sigue siendo necesario programar `photo-cleanup`.

## Administradores

**Estado actual:** crear usuarios, roles y recuperación están disponibles. Suspender, restaurar y eliminar cuentas están preparadas y verificadas en el entorno aislado, pero deshabilitadas hasta aprobar y aplicar `20261011003715_account_lifecycle_controls.sql`. La migración aditiva de publicaciones y administración básica ya está aplicada.

Configuración > Alternar a vista de administrador > Administrar usuarios. Permite crear cuentas, enviar enlaces de recuperación, suspender/restaurar, eliminar y otorgar/retirar el rol. No muestra contraseñas existentes. Las cuentas creadas por un administrador utilizan una contraseña temporal que el usuario puede cambiar desde Configuración.

Solo un administrador autenticado con una sesión vigente puede ejecutar la Edge Function. Los roles se verifican en la base, no en datos editables por el usuario. El último administrador no puede quitarse el rol. Para eliminar/suspender a otro administrador primero hay que retirarle el rol; no se puede eliminar ni suspender la cuenta propia desde esta vista. La eliminación es permanente, requiere escribir el correo del usuario, revoca sesiones y borra su contenido personal y listas propias. Conserva las propuestas y auditoría desvinculando al autor. La suspensión impide nuevas sesiones, revoca las existentes y bloquea acceso directo a tablas mediante RLS, además de las escrituras por RPC.

El primer administrador se asigna desde SQL con la identidad verificada del propietario. Los siguientes se asignan desde esta pantalla. Nunca permitir que una cuenta se registre como administrador usando `user_metadata`.

## Apariencia e iPhone

Configuración > Apariencia: Claro, Oscuro o tema del dispositivo. **Claro es el predeterminado**, incluso en un dispositivo con modo oscuro; se conserva cualquier preferencia local ya elegida. El mapa también cambia de apariencia.

Se ofrecen dos manifiestos e íconos opacos: claro con fondo terracota/naranja y marca blanca; oscuro con fondo oscuro y marca naranja. El navegador recibe la variante activa al instalar. iOS puede guardar el ícono de inicio y no cambiarlo automáticamente cuando cambia el tema de una PWA instalada. Para actualizarlo, quitar el acceso de inicio, abrir Rovia en Safari, elegir el tema y volver a agregarlo. Las cuentas y datos permanecen en Supabase. No se afirma actualización automática del ícono instalado.

La paleta oscura usa fondo `#181D1C`, superficies `#222A28`, superficies secundarias `#2C3632`, texto `#E8EEE9`, texto secundario `#A6B5AE`, bordes `#3D4944` y naranja `#F07857`. Dentro de la app, el logo siempre carga `logo-light.svg` (fondo naranja y R blanca), también en modo oscuro; el nombre de Rovia es naranja en modo oscuro. Los íconos de instalación siguen la variante del tema seleccionado. No se invierten los colores de imágenes ni teselas: el mapa conserva los colores originales de OpenStreetMap. La navegación oscura seleccionada se distingue por el icono y texto naranja, sin fondo, brillo ni indicador superior; el enfoque de teclado permanece visible.

Los campos móviles tienen al menos 16 px para prevenir el zoom al enfocarlos; se mantiene el zoom manual por accesibilidad. La barra inferior respeta `safe-area-inset-bottom` y reserva espacio adicional para los gestos. El pin Explorar está en la posición central.

## Último paso: registro sin confirmación y Brevo

La conexión Supabase MCP disponible modifica SQL y funciones, pero no expone configuración de Auth/SMTP. No confundir editar el frontend con deshabilitar confirmación en el servidor.

1. En Supabase > Authentication > Sign In / Providers > Email, desactivar **Confirm email**. La operación afecta nuevos registros; revisar por separado cuentas anteriores pendientes. No confirmar correos ajenos de forma masiva.
2. En Authentication > URL Configuration, utilizar `https://userovia.vercel.app` como Site URL e incluir `https://userovia.vercel.app/auth/callback` y `https://userovia.vercel.app/auth/reset` entre las redirecciones permitidas. Mantener otras URLs todavía utilizadas.
3. En Authentication > SMTP Settings, habilitar SMTP personalizado:
   - Remitente: el correo verificado en Brevo.
   - Nombre: Rovia.
   - Host: `smtp-relay.brevo.com`.
   - Puerto: `587`.
   - Usuario: SMTP login que muestra Brevo, que puede ser distinto del correo de tu cuenta.
   - Contraseña: **clave SMTP de Brevo**, no la clave API. Pegarla directamente en el panel, nunca en GitHub ni en variables VITE.
4. Mantener confirmación de registro desactivada. Brevo enviará recuperación de contraseña y otros mensajes de Auth que habilites. Configurar Brevo no activa automáticamente correos promocionales ni notificaciones por mail de Rovia.
5. Deshabilitar seguimiento de enlaces para los mensajes de autenticación. Personalizar las plantillas de recuperación en español y probar una recuperación real con tu cuenta. Recién después dar por verificado el envío.

Fuentes oficiales:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls
- https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP
