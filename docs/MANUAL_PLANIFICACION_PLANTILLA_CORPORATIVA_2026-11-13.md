# TripLogix Despachador · Planificación con plantilla corporativa (13/11/2026)

## Diagnóstico del archivo recibido

El libro `1. Plantilla Vacia.xlsx` contiene cuatro hojas:
- **Programación**: encabezado en dos niveles con columnas HORA ENTRADA (A), HORA SALIDA (B), NOMBRE (C), HORA PASO (D), PUNTO DE RECOGIDA (E), PUNTO DE DESCARGUE (G), ENTRADA RUTA/PUESTO/COND (I/J/K), SALIDA RUTA/PUESTO/COND (L/M/N), TELEFONO USUARIO (O). La copia recibida no tiene pasajeros programados en C3:C197, por lo que **no hay fecha/hora/rutas reales que inventar**.
- **BD**: directorio con nombre, domicilio, teléfono y puntos intermedios de entrada/salida; son personas disponibles, no una programación confirmada.
- **Directorio**: respaldo de domicilios y teléfonos.
- **Conductores**: referencias de nombre, vehículo y placas; **no se crean automáticamente cuentas de conductor ni operadores activos**.

El importador anterior exigía `FECHA`, `HORA_OBJETIVO`, `DIRECCION`, por lo que rechazaba la estructura de Programación. El lector nuevo reconoce el formato por las pestañas/encabezados y utiliza información de BD y Directorio sin alterar el Excel ni enviar los datos a Gemini.

## Planificar desde el Excel completo (recomendado)

1. En **Planificación**, abrir **Importar Excel / Plantilla empresa**.
2. Seleccionar el archivo original `.xlsx` exportado desde Google Sheets (con sus cuatro pestañas).
3. Aparecerá **Planificar desde la plantilla de la empresa**, con número de personas y conductores identificados.
4. Seleccionar una **Empresa** que exista en TripLogix y tenga una sede **General** configurada con coordenadas en **Clientes**.
5. Elegir la **fecha** real y el sentido **ENTRADA** o **SALIDA**.
6. Si Programación no incluye hora oficial para los seleccionados, definir la **hora oficial** en el campo de hora; no se crea una hora por defecto.
7. Seleccionar quiénes viajarán ese día (buscar nombre, seleccionar visibles o elegir individualmente). BD y Directorio no se marcan automáticamente como viajes.
8. Pulsar **Continuar a planificación**. TripLogix resuelve las direcciones usando Google Maps y abre el optimizador; ante direcciones no válidas se detiene sin modificar rutas anteriores.
9. Revisar la lista de pasajeros y los horarios, pulsar **Siguiente Paso**, revisar grupos y orden, agregar los conductores y **confirmar** para generar la planificación.
10. Los viajes sólo se guardan al confirmar el último paso, no al importar el directorio.

## Desde Google Sheets sin OAuth ni Google Cloud

1. Abrir la pestaña **Programación** o **BD** en Google Sheets.
2. Seleccionar toda la tabla con encabezados; copiar con **Ctrl + C**.
3. En **Importar Google Sheets → Copiar y pegar**, pegar con **Ctrl + V** y pulsar **Importar datos pegados**.
4. Se abrirá el mismo asistente de empresa, fecha, sentido, hora y selección de personas.
5. Si se usa **sólo Programación**, la hoja debe contener direcciones válidas por pasajero para poder geocodificar sin BD. Para combinar automáticamente varias pestañas es preferible importar el **archivo Excel completo**.
6. Los enlaces de Sheets admiten múltiples archivos de la **plantilla normal** con fechas; el formato Programación/BD requiere un enlace por vez cuando necesita fecha/turno elegidos por el operador. No se leen hojas privadas mediante enlace sin OAuth ni se deben hacer públicos datos de pasajeros.

## Registrar conductor temporal durante planificación

1. Una vez seleccionada la empresa, fecha y pasajeros, pulsar **Siguiente Paso** para entrar a **Cuadrillas Armadas**.
2. En el grupo deseado, bajo **Conductor Asignado**, pulsar **+ Registrar conductor nuevo**.
3. Si importaste el Excel completo, puedes seleccionar un registro de la pestaña **Conductores** para precargar el formulario (opcional).
4. El formulario pide sólo **Nombre completo, Vehículo/modelo y Placas**. Puedes escribir los valores manualmente. No exige correo, contraseña ni teléfono.
5. Pulsar **Registrar y seleccionar**. El conductor se registra en el catálogo con `quickRegistration=true`, `status=Pendiente` y se selecciona en ese grupo.
6. Repetir para otros grupos si es necesario y revisar antes de confirmar los viajes.
7. **Importante**: un alta rápida es para control operativo/manual. No puede iniciar sesión en la app Conductor ni recibir notificaciones push hasta que complete el registro y autorización. Esto no se presenta como un conductor móvil activo.
8. El sistema comprueba que las placas no existan previamente para no crear duplicados de unidades.

## Diagnóstico del error `insertBefore`

La captura reporta una excepción DOM de React. En el navegador se observan textos transformados (por ejemplo, menús traducidos), compatibles con una extensión o función de traducción automática que puede modificar los nodos de React. La página ahora declara `lang=es`, `translate=no` y `notranslate` para reducir esa interferencia. El botón del error ahora recarga la aplicación; **desactiva también la traducción automática en el navegador** si persiste.

## Validaciones y límites

- Se rechaza planificar sin empresa existente, sede General geolocalizada, fecha, pasajeros elegidos, hora oficial o direcciones.
- Se conservan valores explícitos de **RUTA**, **PUESTO**, **COND**, hora de paso y puntos de recogida/descargue; los registros sin Programación se consideran únicamente catálogo.
- Se detectan pasajeros duplicados antes de crear grupos.
- No se cambió el cálculo de GPS, Google Directions, geometría `originalPlan`, auditoría o rastreo.
- Se mantienen los métodos antiguos de importación Excel/Sheets y el asistente Gemini **opcional**, sin enviar automáticamente el archivo a una IA.
- Las pruebas automatizadas usan nombres/direcciones sintéticos, no incluyen el Excel de pasajeros aportado por el cliente ni lo suben a GitHub.
- La prueba de compilación no sustituye validar la navegación y servicios reales con la empresa y las claves de Google Maps configuradas.

## Para diagnosticar un caso que siga fallando

Revisar: (a) si el operador copió los encabezados, (b) si la empresa tiene sede General, (c) si se eligió fecha/hora, (d) si hay direcciones físicas válidas y (e) si el navegador traduce la página. Revisar la consola del navegador si persiste un error no reproducido en tests.
