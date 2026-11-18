# TripLogix Despachador · Cambios solicitados por Mauricio · 17/11/2026

## Formato reducido desde Google Sheets
El operador sólo necesita cuatro columnas:
A **HORA ENTRADA**, B **HORA SALIDA**, C **NOMBRE**, D **CONDUCTOR**.
Puede dejar la hora del sentido que no aplica vacía. No requiere **HORA PASO, DIRECCIÓN, RUTA, PUESTO u ORDEN** en la hoja reducida. Para las rutas de entrada se usa A; para las de salida se usa B. Los días del libro se seleccionan por separado.

Se consulta BD / Directorio o el catálogo de Clientes registrado para domicilios y teléfonos. **Si no hay domicilio verificable, se solicita corrección: nunca se inventa una ubicación.** Se mantiene la lectura de hojas semanales anteriores (E/H, K:P, Q) para evitar regresiones. El formato A:D admite copiar y pegar con o sin encabezados.

El conductor indicado en D se traslada a la planificación; quienes compartan conductor y turno se agrupan en vehículos de máximo cuatro pasajeros, optimizados por proximidad. Si un conductor no se encuentra en el catálogo, se solicita su selección en pantalla. Desde importación A:D no se crean automáticamente puntos de encuentro vacíos.

## Horarios netos
La tolerancia por pasajero de **5 minutos** pasa a **0** y el margen fijo por descenso también se pone en **0**. Las horas se calculan con segmentos reales de Google Directions. Se mantiene la llegada anticipada de **10 minutos** a la empresa para ENTRADAS (regla existente). Una hora de paso explícita en formatos legados sigue teniendo prioridad.

## Alta rápida de conductor y WhatsApp
En **alta rápida** se requiere celular / WhatsApp de 10 a 15 dígitos, además de nombre, vehículo y placas. Se guarda en `conductores.phone`; sigue sin acceso a la app mientras esté pendiente. El botón manual WhatsApp prepara mensajes tanto para pasajeros como para el conductor asignado; el operador confirma el envío en WhatsApp.

El **envío automático** continúa separado hasta verificar Meta Cloud API, plantilla aprobada, variables de Vercel, cron y consentimiento `whatsappOptIn===true` en pasajeros. Las cuatro columnas NO constituyen consentimiento. El backend actual de avisos automáticos no se amplió a conductores sin autorización.

## Prueba controlada previa al uso
1. Importar una hoja A:D con dos entradas y una salida; seleccionar día, empresa y sentido.
2. Confirmar que domicilios provienen de BD/Directorio/Clientes, sin exigir dirección en A:D.
3. Preparar dos conductores diferentes a la misma hora; comprobar que no se mezclen.
4. Revisar ruta vial de Google y horarios netos; no guardar sin geometría.
5. Dar de alta conductor temporal con celular, preparar aviso WhatsApp a usuario y chofer y revisar el texto antes de enviarlo.
6. No habilitar automatización masiva sin probar credenciales, consentimientos y plantillas en Vercel/Meta.

**Nota:** compilación y pruebas unitarias no sustituyen una prueba real con Google Maps, Firestore y WhatsApp de Mauricio.
