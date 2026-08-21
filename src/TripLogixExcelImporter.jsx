import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebase';
import { addDoc, collection, getDocs } from 'firebase/firestore';

const FINAL_DESTINATION_EARLY_MINS = 10;
const PASSENGER_BUFFER_MINS = 5;

const clean = (value) => String(value ?? '').trim();
const digitsOnly = (value) => clean(value).replace(/\D/g, '');
const norm = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const getCell = (row, aliases) => {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const wanted = norm(alias).replace(/\s+/g, '_');
    const found = entries.find(([key]) => norm(key).replace(/\s+/g, '_') === wanted);
    if (found) return found[1];
  }
  return '';
};

const parseDateTime = (date, time) => {
  const d = clean(date);
  const t = clean(time);
  if (!d || !t) return null;
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? d
    : (() => {
        const parts = d.split(/[\/\-]/).map(Number);
        if (parts.length !== 3) return '';
        const [a,b,c] = parts;
        if (a > 1900) return `${String(a).padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(c).padStart(2,'0')}`;
        return `${String(c).padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
      })();
  if (!normalizedDate || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  return new Date(`${normalizedDate}T${t.padStart(5,'0')}:00`);
};

const hhmm = (date) => `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const addMins = (date, mins) => new Date(date.getTime() + Number(mins || 0) * 60000);

const toLocation = (point) => {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  if (clean(point.address)) return point.address;
  return null;
};

const calcGoogleRoute = async (points) => {
  if (!window.google?.maps?.DirectionsService) {
    throw new Error('Google Maps todavía no está listo. Espera unos segundos y vuelve a importar.');
  }
  const valid = points.map(toLocation);
  if (valid.some(v => !v) || valid.length < 2) throw new Error('Cada ruta necesita al menos dos puntos con dirección o coordenadas.');

  const service = new window.google.maps.DirectionsService();
  const result = await new Promise((resolve, reject) => {
    service.route({
      origin: valid[0],
      destination: valid[valid.length - 1],
      waypoints: valid.slice(1, -1).map(location => ({ location, stopover: true })),
      travelMode: window.google.maps.TravelMode.DRIVING,
      provideRouteAlternatives: false,
      region: 'MX',
      language: 'es'
    }, (res, status) => {
      if (status === 'OK' && res?.routes?.[0]) resolve(res.routes[0]);
      else reject(new Error(`Google Directions: ${status}`));
    });
  });

  const legs = result.legs || [];
  const geometry = [];
  legs.forEach(leg => (leg.steps || []).forEach(step => {
    (step.path || []).forEach(p => geometry.push({ lat: p.lat(), lng: p.lng() }));
  }));
  const totalMeters = legs.reduce((sum, leg) => sum + Number(leg.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((sum, leg) => sum + Number(leg.duration_in_traffic?.value || leg.duration?.value || 0), 0);
  const routedLocations = [];
  if (legs[0]?.start_location) routedLocations.push({ lat: legs[0].start_location.lat(), lng: legs[0].start_location.lng() });
  legs.forEach(leg => {
    if (leg.end_location) routedLocations.push({ lat: leg.end_location.lat(), lng: leg.end_location.lng() });
  });

  return {
    geometry,
    legs,
    totalDistanceKm: totalMeters / 1000,
    totalDurationMins: Math.round(totalSeconds / 60),
    routedLocations,
    segments: legs.map(leg => ({
      distance: Number(leg.distance?.value || 0) / 1000,
      duration: Math.round(Number(leg.duration_in_traffic?.value || leg.duration?.value || 0) / 60),
      startAddress: leg.start_address || '',
      endAddress: leg.end_address || ''
    }))
  };
};

const buildSchedules = ({ points, route, mode, date, objectiveTime }) => {
  const objective = parseDateTime(date, objectiveTime);
  if (!objective) throw new Error(`Fecha/hora inválida: ${date} ${objectiveTime}`);
  const schedules = Array(points.length).fill('');
  if (mode === 'Ida') {
    let cursor = addMins(objective, -FINAL_DESTINATION_EARLY_MINS);
    schedules[points.length - 1] = hhmm(cursor);
    for (let i = points.length - 2; i >= 0; i -= 1) {
      cursor = addMins(cursor, -Number(route.segments?.[i]?.duration || 0));
      if (points[i].pointType !== 'EMPRESA') cursor = addMins(cursor, -PASSENGER_BUFFER_MINS);
      schedules[i] = hhmm(cursor);
    }
    return {
      schedules,
      startTime: schedules[0],
      targetFinalArrivalTime: hhmm(addMins(objective, -FINAL_DESTINATION_EARLY_MINS)),
      officialArrivalTime: objectiveTime
    };
  }

  let cursor = new Date(objective);
  schedules[0] = hhmm(cursor);
  for (let i = 1; i < points.length; i += 1) {
    cursor = addMins(cursor, Number(route.segments?.[i - 1]?.duration || 0));
    schedules[i] = hhmm(cursor);
    if (points[i].pointType !== 'EMPRESA') cursor = addMins(cursor, 2);
  }
  return {
    schedules,
    startTime: objectiveTime,
    targetFinalArrivalTime: schedules[points.length - 1],
    officialArrivalTime: objectiveTime
  };
};

const normalizeMode = (value) => /SALIDA|REGRESO/i.test(clean(value)) ? 'Regreso' : 'Ida';

export default function TripLogixExcelImporter() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const sample = [
      { RUTA:'ENTRADA-001', ORDEN:1, FECHA:'2026-08-22', HORA_OBJETIVO:'08:00', MODO:'ENTRADA', EMPRESA:'Club San Francisco', CONDUCTOR:'Jonathan Antonio Cifuentes Cabrera', TIPO_PUNTO:'PASAJERO', PASAJERO:'Ana Pérez', TELEFONO:'6141234567', DIRECCION:'Dirección pasajero 1, Chihuahua', LATITUD:'', LONGITUD:'' },
      { RUTA:'ENTRADA-001', ORDEN:2, FECHA:'2026-08-22', HORA_OBJETIVO:'08:00', MODO:'ENTRADA', EMPRESA:'Club San Francisco', CONDUCTOR:'Jonathan Antonio Cifuentes Cabrera', TIPO_PUNTO:'PASAJERO', PASAJERO:'Carlos López', TELEFONO:'6141234568', DIRECCION:'Dirección pasajero 2, Chihuahua', LATITUD:'', LONGITUD:'' },
      { RUTA:'ENTRADA-001', ORDEN:3, FECHA:'2026-08-22', HORA_OBJETIVO:'08:00', MODO:'ENTRADA', EMPRESA:'Club San Francisco', CONDUCTOR:'Jonathan Antonio Cifuentes Cabrera', TIPO_PUNTO:'EMPRESA', PASAJERO:'Oficina Central', TELEFONO:'', DIRECCION:'Dirección final de la empresa', LATITUD:'', LONGITUD:'' },
      { RUTA:'SALIDA-001', ORDEN:1, FECHA:'2026-08-22', HORA_OBJETIVO:'17:00', MODO:'SALIDA', EMPRESA:'Club San Francisco', CONDUCTOR:'', TIPO_PUNTO:'EMPRESA', PASAJERO:'Oficina Central', TELEFONO:'', DIRECCION:'Dirección de la empresa', LATITUD:'', LONGITUD:'' },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'Rutas');
    XLSX.writeFile(wb, 'Plantilla_TripLogix_Rutas.xlsx');
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('El Excel está vacío.');

      const driverSnap = await getDocs(collection(db, 'conductores'));
      const drivers = driverSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const driverByName = (name) => drivers.find(d => norm(d.name) === norm(name));

      const groups = new Map();
      rows.forEach((row, index) => {
        const routeKey = clean(getCell(row, ['RUTA','ID_RUTA','CLAVE_RUTA'])) || `RUTA-${index + 1}`;
        const point = {
          routeKey,
          order: Number(getCell(row, ['ORDEN','SECUENCIA'])) || index + 1,
          date: clean(getCell(row, ['FECHA','FECHA_SERVICIO'])),
          objectiveTime: clean(getCell(row, ['HORA_OBJETIVO','HORA','HORA_LLEGADA'])),
          mode: normalizeMode(getCell(row, ['MODO','TIPO','ENTRADA_SALIDA'])),
          company: clean(getCell(row, ['EMPRESA','CLIENTE'])),
          driverName: clean(getCell(row, ['CONDUCTOR','CHOFER'])),
          pointType: /EMPRESA|OFICINA|DESTINO/i.test(clean(getCell(row, ['TIPO_PUNTO','PUNTO']))) ? 'EMPRESA' : 'PASAJERO',
          passengerName: clean(getCell(row, ['PASAJERO','NOMBRE','USUARIO'])),
          phone: digitsOnly(getCell(row, ['TELEFONO','WHATSAPP','CELULAR'])),
          address: clean(getCell(row, ['DIRECCION','DOMICILIO'])),
          lat: Number(getCell(row, ['LATITUD','LAT'])),
          lng: Number(getCell(row, ['LONGITUD','LNG','LON']))
        };
        if (!point.date || !point.objectiveTime || !point.address) {
          throw new Error(`Fila ${index + 2}: faltan FECHA, HORA_OBJETIVO o DIRECCION.`);
        }
        if (!groups.has(routeKey)) groups.set(routeKey, []);
        groups.get(routeKey).push(point);
      });

      let created = 0;
      for (const [routeKey, rawPoints] of groups) {
        const points = [...rawPoints].sort((a,b) => a.order - b.order);
        if (points.length < 2) throw new Error(`${routeKey}: necesita mínimo 2 puntos.`);
        const base = points[0];
        const google = await calcGoogleRoute(points);
        const schedule = buildSchedules({
          points,
          route: google,
          mode: base.mode,
          date: base.date,
          objectiveTime: base.objectiveTime
        });
        const driver = driverByName(base.driverName);
        const nowIso = new Date().toISOString();
        const withResolved = points.map((p, i) => ({
          ...p,
          lat: google.routedLocations?.[i]?.lat ?? (Number.isFinite(p.lat) ? p.lat : null),
          lng: google.routedLocations?.[i]?.lng ?? (Number.isFinite(p.lng) ? p.lng : null),
          plannedTime: schedule.schedules[i]
        }));

        const toCoord = (p) => ({
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          contact: p.passengerName,
          passengerName: p.passengerName,
          phone: p.phone,
          pickupTime: base.mode === 'Ida' ? p.plannedTime : '',
          dropoffTime: base.mode === 'Regreso' ? p.plannedTime : '',
          stopType: p.pointType === 'EMPRESA' ? 'office' : 'passenger'
        });

        const passengerSchedule = withResolved
          .map((p, i) => ({ p, i }))
          .filter(({p}) => p.pointType === 'PASAJERO')
          .map(({p, i}) => ({
            passengerName: p.passengerName,
            phone: p.phone,
            stopIndex: i,
            pickupTime: base.mode === 'Ida' ? p.plannedTime : '',
            dropoffTime: base.mode === 'Regreso' ? p.plannedTime : '',
            plannedTime: p.plannedTime,
            status: 'Pendiente'
          }));

        const originalPlan = {
          version: 1,
          createdAt: nowIso,
          geometry: google.geometry,
          totalDistance: Number(google.totalDistanceKm.toFixed(1)),
          totalDuration: google.totalDurationMins,
          segments: google.segments,
          start: withResolved[0].address,
          startCoords: toCoord(withResolved[0]),
          waypoints: withResolved.slice(1,-1).map(p => p.address),
          waypointsData: withResolved.slice(1,-1).map(toCoord),
          end: withResolved[withResolved.length - 1].address,
          endCoords: toCoord(withResolved[withResolved.length - 1])
        };

        const payload = {
          client: base.company || 'Importación Excel',
          requestUser: passengerSchedule.map(p => p.passengerName).join(', '),
          driver: driver?.name || base.driverName || '',
          driverId: driver?.id || '',
          status: 'Pendiente',
          serviceType: 'Programado',
          tripSource: 'dispatcher',
          createdBy: 'dispatcher',
          scheduledDate: base.date,
          scheduledTime: base.objectiveTime,
          startTime: schedule.startTime,
          pickupTime: schedule.startTime,
          finalDate: base.date,
          start: originalPlan.start,
          startCoords: originalPlan.startCoords,
          waypoints: originalPlan.waypoints,
          waypointsData: originalPlan.waypointsData,
          end: originalPlan.end,
          endCoords: originalPlan.endCoords,
          passengerSchedule,
          technicalData: {
            totalDistance: originalPlan.totalDistance,
            totalDuration: google.totalDurationMins,
            segments: google.segments,
            geometry: google.geometry,
            routingProvider: 'google-directions',
            carpool: {
              mode: base.mode,
              officialScheduledTime: base.objectiveTime,
              officialArrivalTime: schedule.officialArrivalTime,
              startTime: schedule.startTime,
              targetFinalArrivalTime: schedule.targetFinalArrivalTime,
              pickupTimes: base.mode === 'Ida' ? passengerSchedule.map(p => p.pickupTime) : [],
              dropoffTimes: base.mode === 'Regreso' ? passengerSchedule.map(p => p.dropoffTime) : [],
              finalEarlyBufferMins: base.mode === 'Ida' ? FINAL_DESTINATION_EARLY_MINS : 0
            }
          },
          originalPlan,
          pricingVisibility: 'hidden_during_trip',
          showPricingDuringTrip: false,
          pricingPolicy: 'dispatcher_hidden_during_trip',
          importedFromExcel: true,
          importRouteKey: routeKey,
          createdDate: nowIso,
          ...(driver ? {
            ofertaPara: driver.id,
            ofertaParaNombre: driver.name,
            ofertaEstado: 'Pendiente',
            assignmentRequestedAt: nowIso
          } : {})
        };

        await addDoc(collection(db, 'rutas'), payload);
        created += 1;
      }

      alert(`✅ Importación terminada: ${created} ruta(s) creadas. Revisa la planificación antes de iniciar los viajes.`);
    } catch (error) {
      console.error(error);
      alert(`No se pudo importar: ${error.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
      <button type="button" onClick={downloadTemplate} className="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50">
        Plantilla Excel
      </button>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
        {busy ? 'Importando...' : 'Importar Excel'}
      </button>
    </div>
  );
}
