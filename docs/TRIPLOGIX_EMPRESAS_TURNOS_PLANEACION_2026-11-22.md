# TRIPLOGIX — Empresas, turnos y planeación automática
Fecha: 22 de noviembre de 2026

## Catálogo corporativo
- En **Empresas y clientes** seleccionar «Empresa y turnos semanales».
- Crear empresa o editar una existente. Registrar datos generales y sedes mediante Google Maps; la primera sede es el origen/destino corporativo por defecto.
- En «Empleados y turnos» se pueden añadir empleados, validar direcciones y marcar los siete días con horas de entrada y salida independientes en tabla tipo Excel.
- Guardar cambios. Los usuarios heredados sin semana marcada no se programan automáticamente; la carga tradicional permanece disponible.

## Planificación del día
- En Planificación pulsar «Planeación automática», elegir empresa, fecha y sede. Se muestran dos pestañas: ENTRADAS y SALIDAS.
- La lista se forma automáticamente desde los días explícitamente marcados, agrupados por hora oficial con máximo cuatro personas por unidad.
- Vista tipo Excel y descarga XLSX; nunca se muestran kilometrajes no calculados.
- Si un empleado tiene el turno activado pero domicilio sin coordenadas, se indica y se bloquea la generación en lugar de omitirlo silenciosamente.
- Pulsar «Calcular rutas y asignar conductores» para entrar al flujo de cuadrillas, que conserva el mapa, selección de chofer, casilla de punto común, favoritos y confirmación final.
- Google Directions calcula rutas por calles y optimiza el orden de los waypoints internos para los grupos creados automáticamente. Los horarios de pasajeros se sincronizan con ese orden y el plan original queda registrado como antes.
- El cálculo opcional de combustible requiere que el operador introduzca rendimiento en km/L y precio por litro. Es una **estimación** en función de kilómetros confirmados por Google, no un costo real de operación.

## Precauciones y pendientes de QA
- La agrupación geográfica inicial es heurística y respeta capacidad y horarios; Google optimiza puntos intermedios. No se garantiza el mínimo matemático global ni los minutos de tráfico futuros.
- Conservar las importaciones históricas de 4/5 y 25 columnas, planificación manual, registros de rutas, GPS y acciones WhatsApp.
- Para uso comercial masivo evaluar límites del documento Firestore con arrays de empleados, reglas de acceso, protección de datos personales, manejo de excepciones operativas y calidad de seguimiento GPS.
- Prueba recomendada: empresa de prueba con dos sedes y cinco empleados para lunes. Verificar tres horas diferentes, cuadrillas de máximo cuatro, modalidad casa vs. punto común, dos sentidos, hoja XLSX y chofer por vehículo. No guardar rutas reales hasta autorización.
- No se valida aquí combustible real, operación con vehículos ni aceptación final de Mauricio.
