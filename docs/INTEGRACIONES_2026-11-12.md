# TripLogix Despachador — Google Sheets, alta rápida y WhatsApp

## Alcance y compatibilidad
- La importación Excel sigue disponible; el botón **Importar Google Sheets** usa la misma validación, cálculo vehicular y conservación del plan original que el Excel.
- El nuevo conductor rápido pide sólo nombre, vehículo y placas. Se guarda en `conductores` con `status=Pendiente`, `quickRegistration=true`, `isOnline=false`. Es un conductor de administración sin acceso a la app ni notificaciones de conductor hasta completar su registro y aprobación.
- WhatsApp manual por wa.me sigue disponible. El automático usa exclusivamente API oficial de Meta, plantilla aprobada, consentimiento expreso del pasajero y un cron protegido en backend.

## Google Sheets — modo flexible sin configuración (noviembre 2026)
Desde **Planificación → Importar Google Sheets**, el despachador tiene dos métodos inmediatos:

1. **Copiar y pegar** (recomendado para datos privados): abrir cualquier Google Sheets que la persona ya pueda consultar, seleccionar el rango completo incluida la fila de encabezados, copiar y pegar en el cuadro de TripLogix, luego confirmar. No requiere Google Cloud, permisos adicionales ni compartir públicamente información de pasajeros.
2. **Varios enlaces por operación**: pegar uno o más enlaces originales de Google Sheets, elegir **+ Agregar otro enlace** para cada archivo/día y pulsar **Importar enlaces**. TripLogix lee la pestaña indicada por `gid` en cada URL, agrupa las rutas por **archivo + fecha + clave de ruta**, valida el formato de Excel y solicita confirmación **una sola vez**. La operación no queda vinculada a una cuenta, Drive o enlace fijo. Los enlaces de esta opción sólo funcionan cuando Google permite consultar la hoja sin iniciar sesión (acceso de lectura mediante enlace); no pueden acceder a archivos restringidos. Para datos personales, usar copiar y pegar.

La lectura de enlaces usa la función de servidor `/api/sheets/leer-publico`, que únicamente consulta URLs construidas internamente en `docs.google.com`, sin credenciales, con límite de 2 MB por pestaña. No almacena los CSV en disco ni se registran los contenidos. El formulario permite hasta 15 enlaces y 4500 filas en total. Las importaciones repetidas desde el mismo documento/pestaña/fecha/clave se omiten para evitar duplicados.

**Formato de datos**: utilizar la plantilla **Plantilla Excel** ya existente. Deben estar las columnas `FECHA`, `HORA_OBJETIVO` y `DIRECCION` (o alias compatibles). Las columnas `RUTA`, `ORDEN`, `PASAJERO`, `WHATSAPP_AUTORIZADO` y demás funcionan igual que en Excel. Sólo se crean rutas nuevas; se conserva el plan original y la lógica de rutas Google Directions.

### Opcional: seleccionar hojas privadas desde Drive conectado
El modo avanzado conserva OAuth y el explorador de Drive. Si se requiere el acceso directo a hojas privadas mediante API (sin copiar), entonces sí se debe habilitar Google Drive API + Sheets API, crear un cliente OAuth web y configurar `VITE_GOOGLE_CLIENT_ID` en Vercel, con sus orígenes JavaScript autorizados. **No es obligatorio para los métodos rápidos**. Un enlace restringido sin consentimiento OAuth nunca permite lectura automática; no se deben publicar documentos sensibles sólo para importar.

## Google Sheets — configuración OAuth avanzada
1. En Google Cloud Console habilitar **Google Drive API** y **Google Sheets API** y configurar pantalla de consentimiento.
2. Crear **OAuth client ID** tipo **Web application**. Configurar los JavaScript origins de todos los dominios Vercel del Despachador y el dominio final, por ejemplo `https://app-transporte.vercel.app`.
3. En Vercel, poner `VITE_GOOGLE_CLIENT_ID` (es un identificador público, no un client secret) y volver a desplegar para inyectarlo en el bundle web.
4. En Planificación → **Importar Google Sheets** → **Conectar cuenta Google** → elegir hoja y pestaña → **Importar**.
5. Usar encabezados de la plantilla Excel existente. La fila 1 debe contener los encabezados y las filas siguientes los puntos de cada ruta. La importación crea rutas nuevas, no actualiza rutas previas. Revisar duplicados antes de importar.
6. Google OAuth solicitará acceso sólo lectura a metadatos de Drive y Sheets. La app no almacena ni envía el token OAuth a Firestore.

## WhatsApp automático
1. En **Meta Business / WhatsApp Manager**, vincular un número para WhatsApp Cloud API y crear una plantilla de tipo utility aprobada `triplogix_ruta_asignada` (o el nombre real).
2. Plantilla de cuerpo con cuatro parámetros en este orden: `{{1}}` pasajero, `{{2}}` conductor, `{{3}}` fecha y hora, `{{4}}` enlace de seguimiento. Usar idioma coincidente (por defecto `es_MX`).
3. En Vercel → proyecto Despachador → Settings → Environment Variables (Production), ingresar los cuatro secretos:
   - `WHATSAPP_ACCESS_TOKEN` (Meta system user token)
   - `WHATSAPP_PHONE_NUMBER_ID` (Meta)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON completo de una cuenta de servicio Firebase con permisos Firestore **limitados** a las colecciones necesarias)
   - `CRON_SECRET` (cadena aleatoria larga)
   Opcional `WHATSAPP_GRAPH_VERSION` = `v25.0`.
   **Nunca ponerlos en .env VITE_, GitHub, Firestore, pantallas públicas ni en ChatGPT.**
4. En Torre de Control → **Configurar WhatsApp** registrar plantilla, idioma, URL de seguimiento y activar el envío cuando haya terminado una prueba controlada.
5. En la plantilla Excel/Sheets usar columna `WHATSAPP_AUTORIZADO` con valor `SI` sólo cuando el pasajero haya dado consentimiento verificable. Sin consentimiento no hay envío.
6. El cron está programado **diariamente a las 14:00 UTC**, por compatibilidad con Vercel Hobby. En Pro se puede cambiar a una frecuencia mayor después de revisar cuota y programación. **No equivale a un envío instantáneo al asignar**.
7. El backend sólo envía rutas recientes con conductor asignado (no alta rápida), omite casos sin consentimiento y crea un registro único en `whatsappEnvios` por ruta y teléfono. Los errores se registran allí como `failed`. No reenviar sin revisar estado de mensaje en Meta para evitar duplicados. No se han enviado mensajes reales durante la implementación.
8. La API `/api/whatsapp/sync` requiere encabezado `Authorization: Bearer <CRON_SECRET>`, salvo `?check=1` que sólo muestra si hay variables y no revela secretos. No exponer el secreto en el cliente.

## Seguridad y pendientes
- El Despachador utiliza autenticación personalizada sobre Firestore, incluyendo acceso maestro heredado en el código. Esto requiere migración a Firebase Auth o un backend robusto con roles antes de exposición a usuarios externos. **No está resuelto por esta mejora**.
- Si en Vercel no se han configurado credenciales, el envío automático queda inactivo.
- Se recomienda añadir observabilidad de webhooks de estado de Meta, pruebas reales con números permitidos y medición de entregas antes de activar envíos masivos.
