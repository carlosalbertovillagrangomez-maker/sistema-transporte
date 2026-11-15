# TripLogix · Importación semanal desde Google Sheets (Chihuahua)

## Plantilla real revisada — semana del 9 al 15 de noviembre de 2026

El documento utiliza las pestañas **Panel Logístico**, **Lunes 09 de Nov** a **Domingo 15 de Nov**, **BD**, **Directorio**, **Conductores**, además de informes (**Viajes Semana**, **Semana Definitivo**, mensajes y resúmenes). Los reportes nunca se consideran rutas nuevas.

En cada hoja del día se leen las columnas exactas:
- A: HORA ENTRADA; B: HORA SALIDA; C: NOMBRE; D: HORA PASO
- E: DIRECCIÓN DE RECOGIDA; H: DIRECCIÓN DE DESCARGUE
- K/L/M: ENTRADA — RUTA / PUESTO / CONDUCTOR
- N/O/P: SALIDA — RUTA / PUESTO / CONDUCTOR
- Q: TELÉFONO USUARIO.
- Las columnas auxiliares de totales y kilómetros no se usan como identidades ni domicilios.

Las cabeceras se detectan por nombre y por su segunda fila, no por posición fija de la plantilla antigua. BD y Directorio complementan direcciones y teléfonos; Conductores sugiere operadores temporales, pero no los activa ni les crea cuentas.

## Cómo importar el enlace

1. En **Planificación → Importar Google Sheets**, pegar **un enlace al libro semanal**, incluso si apunta a `Panel Logístico`. El sistema solicitará el libro completo al servidor y reconocerá los siete días.
2. Pulsar **Importar enlaces**; se abrirá el asistente **Planificar desde la plantilla de la empresa**.
3. Seleccionar el **día de la semana**. Si hay una fecha comprobable en `Viajes Semana`, se establece automáticamente; si no, se solicita.
4. Seleccionar la **empresa** y el sentido: **Sólo ENTRADAS** o **Sólo SALIDAS**. Cada cambio de día o sentido reinicia la selección para evitar mezclar pasajeros.
5. Revisar los pasajeros y direcciones. Si faltan domicilios, se pueden complementar con BD o Directorio, sin generar nuevos viajes de todo el directorio.
6. Continuar a **Carpooling**, revisar rutas, pasajeros y conductores temporales. La confirmación final guarda rutas; la lectura inicial no modifica los servicios anteriores.

## Permisos
- Para un documento permitido a cualquier persona con el enlace, el backend puede leer temporalmente el XLSX sin credenciales; el archivo no se guarda.
- Si está **restringido**, se debe utilizar el apartado **Conectar Google Drive** con OAuth y `VITE_GOOGLE_CLIENT_ID` configurado. No existe acceso seguro a Sheets privados sin autorización.
- No hacer públicos datos personales para facilitar la importación. El archivo de ejemplo revisado presentaba permiso de edición a "cualquier persona con el enlace": se recomienda restringirlo y otorgar acceso específico a los operadores.

## Asistente de programación
- El asistente con Gemini usa el lector determinista para libros semanales en lugar de enviar los reportes o todos los datos a IA.
- Seleccionar una fecha dentro de la semana para usar sólo el día correspondiente; no se suponen fechas de otros días.
- Google Maps necesita direcciones válidas para crear geometrías. La lectura puede funcionar aunque alguna dirección posteriormente falle en geocodificación; en ese caso debe corregirse el dato y repetirse la preparación. No se reemplazan rutas originales con segmentos inventados.

## Alta de conductor temporal
1. En el paso **Cuadrillas Armadas** de Carpooling, seleccionar el grupo y pulsar **+ Registrar conductor nuevo**.
2. Escribir **nombre, vehículo/modelo y placas**, o elegir un registro de la hoja Conductores como sugerencia.
3. Pulsar **Registrar y seleccionar**.
4. El conductor temporal se guarda como alta operativa pendiente sin acceso a la aplicación Conductor; para recibir servicios en la app requiere completar registro y aprobación.

## Verificación
Se agregaron pruebas automatizadas anónimas para: siete días, selección desde Panel Logístico, año del resumen, columnas K-M y N-P, columnas E/H, separación de Entrada/Salida y pegado A:Y. Se ejecutan con el build Vite y sintaxis del backend. No se guardaron en GitHub filas reales de pasajeros ni su información personal.

## Advertencia de pruebas
El build y las pruebas del importador no equivalen a una prueba completa con credenciales, Google Maps y rutas reales en el entorno de Mauricio. Realizar primero un piloto de 2 a 4 pasajeros por sentido y un operador temporal antes de lanzar toda la semana.
