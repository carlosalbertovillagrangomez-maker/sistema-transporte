# TripLogix — recogida por grupo y WhatsApp inmediato (18 noviembre 2026)

## Recogidas
Planificación → Optimizar Grupos → Paso 2 (Cuadrillas Armadas): en cada vehículo marcar **un solo punto para todos** o **domicilio por pasajero**. En ambos casos escribir y seleccionar la dirección de Google Maps o elegir una ubicación favorita. Sólo se recalcula la ruta de esa unidad; las direcciones editadas aquí no se guardan en el catálogo de Clientes. Se conserva el modo avanzado de múltiples puntos. El guardado rechaza ubicaciones inválidas y geometría no validada por Google Maps.

## Avisos automáticos inmediatos
En el pie del Paso 2, marcar **Notificar por WhatsApp al confirmar** e introducir la clave operativa temporal. Al confirmar se guardan las rutas y se invoca `POST /api/whatsapp/sync` con las IDs recién creadas. Sólo el servidor consulta Firestore y comunica con Meta WhatsApp Cloud API mediante plantillas aprobadas. No se admiten textos o teléfonos arbitrarios del navegador. Se verifica consentimiento `whatsappOptIn === true` en los pasajeros y conductores; los no autorizados no reciben mensajes. El envío programado original permanece disponible y los botones manuales siguen funcionando.

### Configuración obligatoria
Vercel (variables de entorno de producción):
- `WHATSAPP_ACCESS_TOKEN` — token de Meta Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID` — identificador del número emisor.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — cuenta de servicio con acceso limitado a Firestore, sólo en servidor.
- `CRON_SECRET` — secreto para cron diario existente.
- `WHATSAPP_DISPATCH_KEY` — clave larga y aleatoria distinta de `CRON_SECRET` para enviar al confirmar grupos.
- Opcional: `WHATSAPP_GRAPH_VERSION`.

En Despachador → Configuración WhatsApp: habilitar solo cuando los remitentes y destinatarios tengan consentimiento válido y Meta haya aprobado las plantillas: `triplogix_ruta_asignada` (4 variables: pasajero, conductor, fecha/hora, enlace) y `triplogix_conductor_ruta` (4 variables: conductor, fecha/hora, origen, destino). Configurar idioma `es_MX`. Revisar permisos reales de la cuenta de Meta y costos de conversación antes de activarla. No cargar tokens en GitHub ni en el navegador. El envío de conductores utiliza su teléfono y consentimiento registrados en la ficha del conductor (no un campo enviado por el navegador).

**Importante:** si no hay credenciales, la ruta puede guardarse sin notificación usando la casilla desactivada. Un fallo de WhatsApp no elimina rutas guardadas. El servidor limita mensajes por invocación, informa fallos y registra marcadores en `whatsappEnvios` para evitar reenvíos. Para muchos grupos dividir en lotes (mejora futura). No confundir compilación con envío end-to-end real.
