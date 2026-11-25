# TRIPLOGIX: puntos intermedios por empleado, día y sentido
Fecha: 25 de noviembre de 2026

## Caso solicitado por Mauricio
Adrián Fernando puede tener **lunes, entrada 06:00, recogida en Casa** y
**martes, entrada 08:00, recogida en Plaza Vallarta**, sin modificar su domicilio.
Además, para el martes puede configurarse **Salida → Recaudación** de manera
independiente. Estas ubicaciones son ejemplos de nombres: la dirección precisa
debe registrarla el operador mediante Google Maps.

## Configuración
1. Entrar a **Empresas y clientes → Empresa y turnos semanales**.
2. Abrir la empresa y entrar en **Empresa y sedes**.
3. En **Puntos intermedios de recogida y entrega**, agregar cada lugar
   (por ejemplo Plaza Vallarta, Recaudación o China City), introducir un alias,
   seleccionar la dirección real desde las sugerencias de Google Maps y verificar
   que muestre el indicador de ubicación validada.
4. Entrar a **Empleados y turnos**. En cada día marcado como «Trabaja»
   elegir **Entrada: recoger en → Casa / Punto intermedio**, y
   **Salida: dejar en → Casa / Punto intermedio**, junto a la hora de cada sentido.
5. Guardar. Las ubicaciones quedan asociadas al día y al sentido, no sobrescriben
   el domicilio de casa. Los horarios históricos sin elección explícita siguen
   usando Casa.
6. En **Planificación → Planeación automática**, seleccionar empresa, fecha
   y sede; alternar **Entradas / Salidas**. Verificar puntos en tarjetas y Excel.
7. Continuar a las cuadrillas. Aparece la opción
   **Respetar los puntos configurados por empleado y día**. Si se activa un
   punto común para toda la cuadrilla, solo reemplaza la ubicación del viaje
   actual; volver a la configuración semanal restaura la selección de origen.
8. Confirmar el recorrido vial y los horarios de Google Maps antes de
   asignar el conductor y guardar viajes reales.

## Reglas
- Los puntos reutilizables se guardan en `clientes.meetingPoints`, como catálogo
  independiente de `locations` (sedes y casas).
- `users[].weeklySchedule[day].entradaLocation` y
  `salidaLocation` indican tipo home/meeting y el ID del punto.
- Un punto sin coordenadas, eliminado o desconocido genera una advertencia
  y bloquea la planeación; nunca se reemplaza silenciosamente por Casa.
- Dos o más pasajeros del mismo punto medio y misma cuadrilla pueden compartir
  **una parada vial**, manteniendo sus manifiestos y horarios individuales.
- La agrupación automática conserva máximo 4 pasajeros y turnos oficiales,
  y usa Google Directions para recorridos reales, sin prometer optimización
  matemática global de combustible o tráfico.
- No se cambia información de viajes ya despachados ni se desactivan
  Google Sheets, recorridos manuales, GPS o WhatsApp.

## Validación y límites
Ejecutar `node --test tests/triplogixDailyMeetingPoints.test.js`, regresiones
corporativas y antiguas, `npx eslint` de los módulos, y `npm run build`.
La prueba con direcciones reales de Mauricio es todavía un requisito separado.
Probar también en escritorio con al menos 92 empleados, uso de scroll horizontal,
filtrado y guardado. No crear rutas operativas reales hasta la revisión de Mauricio.
