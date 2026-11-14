# Planificación TripLogix · correcciones solicitadas por Mauricio (13 nov 2026)

## Qué mostraron las capturas
- "Está tomando entradas y salidas por igual": el asistente no filtraba estrictamente registros por sentido si una fila contenía información cruzada. Ahora las filas se filtran por sentido; cuando hay hora oficial sólo de un sentido, la ruta escrita accidentalmente en la otra columna no determina la selección.
- "Hay personas repetidas": algunos nombres tenían más de un registro. En lugar de bloquear todas las rutas, se consolidan sólo los servicios **exactamente iguales** para el mismo sentido, sin modificar los datos originales. Si hay distintos horarios/rutas del mismo nombre, el operador elige qué variante corresponde al día.
- "No se aplicó por falta de ubicaciones": la pantalla anterior paraba todo el grupo aunque parte de las direcciones se encontraban en otras pestañas. El nuevo asistente recupera domicilios de BD/Directorio del archivo completo y del catálogo Clientes de la empresa. Permite pegar una BD/Directorio adicional y editar domicilios de casos faltantes. Una dirección que Google Maps no pueda geocodificar todavía requiere corrección; **no se generan GPS ni direcciones inventadas**.
- "La forma anterior tampoco funciona": el botón de Gemini con plantilla Excel reconocida ya no depende de Gemini; lee las columnas estructuradas sin mezclar entrada/salida. Para texto libre/fotos, Gemini sigue siendo opcional y puede requerir que el usuario proporcione direcciones.

## Flujo recomendado para Mauricio
1. Abrir **Planificación → Importar Google Sheets**. Para un enlace privado, seleccionar **Conectar Google Drive** (requiere OAuth configurado). Esta vinculación permite elegir diferentes archivos de distintas cuentas que el usuario tenga permiso para ver, no un Drive fijo. La lectura privada importa las pestañas Programación, BD, Directorio y Conductores juntas.
2. Si el acceso OAuth privado no está configurado, **no publicar hojas con datos personales**. Alternativa temporal: usar **Copiar y pegar** en la pestaña Programación y luego, dentro del asistente, desplegar **¿Faltan domicilios?** para pegar la pestaña BD (sin descargar Excel).
3. Elegir la **empresa**, **fecha** y **Sólo ENTRADAS** o **Sólo SALIDAS**. La selección se reinicia al cambiar de sentido: no se mezclan pasajeros.
4. Revisar las personas seleccionadas. Los duplicados exactos se consolidan; entre servicios distintos para una misma persona se muestra una sola variante seleccionada y se puede elegir otra.
5. Si faltan domicilios, usar el campo de corrección o pegar BD; si aún no se conoce el domicilio, desmarcar al pasajero hasta tenerlo. Los pasajeros desmarcados no se programan.
6. Presionar **Continuar a planificación**, validar geocodificación con Google Maps y revisar grupos. Una falla no modifica rutas anteriores.
7. En **Cuadrillas Armadas → Conductor asignado → + Registrar conductor nuevo**, llenar **nombre, vehículo y placas** o precargar desde pestaña Conductores. La alta operativa NO equivale a acceso a la app móvil.
8. Después de revisar orden/horarios y asignaciones, confirmar. No se guarda antes de la confirmación final.

## Limitación real que requiere habilitación de Google
No se puede leer una hoja **privada** a partir de una URL sin autorización de su propietario. El OAuth web requiere configurar `VITE_GOOGLE_CLIENT_ID` en Vercel y los orígenes JavaScript autorizados del despachador en Google Cloud. Una vez habilitado, el usuario podrá abrir archivos distintos por URL cada día sin descargar el Excel. No usar accesos públicos como solución para datos personales.

## Validación técnica
Pruebas automáticas incluidas en `tests/triplogixScheduleReview.test.js` y las ya existentes de formato de plantilla y gateway Sheets. La compilación no demuestra que todos los domicilios reales sean correctos, ni reemplaza una prueba funcional de una ruta real en el navegador que utiliza Mauricio.
