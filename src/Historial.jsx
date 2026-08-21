import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSpreadsheet, Calendar, ArrowUp, X, MapPin, User, Clock, Building, Search, Filter, Zap, Navigation, UserCheck, CheckCircle2, Camera, AlertOctagon, Gauge } from 'lucide-react';
import * as XLSX from 'xlsx';

// FIREBASE
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 
const containerStyle = { width: '100%', height: '100%' };
const DEFAULT_MAP_CENTER = { lat: 19.4326, lng: -99.1332 }; 
const libraries = ['places', 'geometry'];

// --- HELPERS DE FECHAS Y AUDITORÍA ---
const getTimestampMs = (value) => {
    if (!value) return null;
    try {
        if (typeof value?.toDate === 'function') return value.toDate().getTime();
        if (value instanceof Date) return value.getTime();

        const raw = String(value).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
            const [day, month, year] = raw.split('/').map(Number);
            return new Date(year, month - 1, day, 12, 0, 0).getTime();
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const [year, month, day] = raw.split('-').map(Number);
            return new Date(year, month - 1, day, 12, 0, 0).getTime();
        }

        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const getRouteAuditTimestamp = (route) => (
    getTimestampMs(route?.actualEndTimestamp) ||
    getTimestampMs(route?.finishedAt) ||
    getTimestampMs(route?.completedAt) ||
    getTimestampMs(route?.finalDate) ||
    getTimestampMs(route?.scheduledDate) ||
    getTimestampMs(route?.createdDate) ||
    0
);

const getDateKey = (value) => {
    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleDateString('en-CA', {});
};

const getSafeDate = (route) => {
    const value =
        route?.actualEndTimestamp ||
        route?.finishedAt ||
        route?.completedAt ||
        route?.finalDate ||
        route?.scheduledDate ||
        route?.createdDate;

    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return 'Sin fecha';
    return new Date(milliseconds).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};

const getDiaSemana = (route) => {
    const milliseconds = getRouteAuditTimestamp(route);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleDateString('es-MX', {
        weekday: 'long'
    }).toUpperCase();
};

const formatMexicoTime = (value) => {
    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getPlannedStartTime = (route) => String(
    route?.startCoords?.pickupTime ||
    route?.pickupTime ||
    route?.technicalData?.carpool?.startTime ||
    route?.startTime ||
    route?.scheduledTime ||
    ''
);

const getActualStartTime = (route) => String(
    route?.actualStartTime ||
    formatMexicoTime(route?.actualStartTimestamp || route?.navigationStartedAt || route?.startedAt) ||
    ''
);

const getActualEndTime = (route) => String(
    route?.actualEndTime ||
    route?.endTime ||
    formatMexicoTime(route?.actualEndTimestamp || route?.finishedAt || route?.completedAt) ||
    ''
);

const getFirstStopAttendedTime = (route) => String(
    route?.firstStopAttendedTime ||
    formatMexicoTime(route?.firstStopAttendedTimestamp) ||
    ''
);

const getBoardingEvents = (route) => {
    const evidences = Array.isArray(route?.evidenciasLlegada) ? route.evidenciasLlegada : [];
    const stopBoardings = (Array.isArray(route?.stopEvents) ? route.stopEvents : [])
        .filter(item => item?.type === 'boarding' || item?.type === 'destination_arrival' || item?.type === 'dropoff');

    const unique = new Map();
    [...evidences, ...stopBoardings].forEach((item, index) => {
        const key = item?.eventId || `${item?.stopIndex ?? index}|${item?.timestamp || item?.time || ''}|${item?.passenger || ''}`;
        if (!unique.has(key)) unique.set(key, item);
    });

    return [...unique.values()].sort((a, b) => (getTimestampMs(a?.timestamp) || 0) - (getTimestampMs(b?.timestamp) || 0));
};

const getActualDistanceKm = (route) => {
    const candidates = [
        route?.officialGoogleDistanceKm,
        route?.googleMatchedDistanceKm,
        route?.finalDistanceKm,
        route?.realDistanceDriven,
        route?.receipt?.distanceKm,
        route?.actualDistanceKm
    ];

    for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return value;
    }

    const points = normalizePath(route?.rutaReal);
    if (points.length < 2) return 0;

    const toRadians = (value) => value * Math.PI / 180;
    let totalKm = 0;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const dLat = toRadians(current.lat - previous.lat);
        const dLng = toRadians(current.lng - previous.lng);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(previous.lat)) *
            Math.cos(toRadians(current.lat)) *
            Math.sin(dLng / 2) ** 2;
        const segmentKm = 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        const previousMs = getTimestampMs(previous?.recordedAt || previous?.timestamp);
        const currentMs = getTimestampMs(current?.recordedAt || current?.timestamp);
        const gapMs = previousMs && currentMs && currentMs > previousMs ? currentMs - previousMs : 0;
        const segmentBreak = Boolean(current?.segmentStart || current?.routeBreak || current?.gpsGap || gapMs > 30000);
        if (!segmentBreak && Number.isFinite(segmentKm) && segmentKm >= 0.001 && segmentKm <= 1) {
            totalKm += segmentKm;
        }
    }

    return totalKm;
};

const getPlannedDistanceKm = (route) => {
    const value = Number(
        route?.originalPlan?.totalDistance ??
        route?.originalPlan?.technicalData?.totalDistance ??
        route?.technicalData?.totalDistance ??
        route?.distanceKm ??
        0
    );
    return Number.isFinite(value) ? value : 0;
};

const getAverageSpeedKmh = (route) => {
    const distanceKm = getActualDistanceKm(route);
    const startMs = getTimestampMs(route?.serviceDistanceStartedAt || route?.firstStopAttendedTimestamp || route?.actualStartTimestamp || route?.navigationStartedAt);
    const endMs = getTimestampMs(route?.actualEndTimestamp || route?.finishedAt || route?.completedAt);
    if (!(distanceKm > 0) || !startMs || !endMs || endMs <= startMs) return 0;
    const hours = (endMs - startMs) / 3600000;
    return hours > 0 ? distanceKm / hours : 0;
};

const normalizePoint = (point) => {
    if (!point) return null;
    const lat = Number(point.lat);
    const lng = Number(point.lng ?? point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { ...point, lat, lng };
};

const normalizePath = (path) => Array.isArray(path) ? path.map(normalizePoint).filter(Boolean) : [];

const getPlannedGeometry = (route) => {
    const candidates = [
        route?.originalPlan?.geometry,
        route?.originalPlan?.technicalData?.geometry,
        route?.technicalData?.geometry
    ];
    for (const candidate of candidates) {
        const path = normalizePath(candidate);
        if (path.length > 1) return path;
    }
    return [];
};

const splitGpsTraceSegments = (path, options = {}) => {
    const points = normalizePath(path);
    if (!points.length) return [];
    const maxGapMs = Number(options.maxGapMs) || 18000;
    const maxBridgeKm = Number(options.maxBridgeKm) || 0.12;
    const segments = [];
    let current = [];

    const distanceKm = (a, b) => {
        const R = 6371;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const aa = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * Math.PI / 180) *
            Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    };

    const flush = () => {
        if (current.length > 1) segments.push(current);
        current = [];
    };

    points.forEach((point, index) => {
        if (index === 0) {
            current = [point];
            return;
        }
        const previous = points[index - 1];
        const previousMs = getTimestampMs(previous?.recordedAt || previous?.timestamp);
        const currentMs = getTimestampMs(point?.recordedAt || point?.timestamp);
        const gapMs = previousMs && currentMs && currentMs > previousMs ? currentMs - previousMs : 0;
        const bridgeKm = distanceKm(previous, point);
        const gapSeconds = gapMs > 0 ? gapMs / 1000 : 0;
        const impliedMetersPerSecond = gapSeconds > 0 ? (bridgeKm * 1000) / gapSeconds : 0;
        const explicitBreak = Boolean(point?.segmentStart || point?.routeBreak || point?.gpsGap);

        if (explicitBreak || gapMs > maxGapMs || bridgeKm > maxBridgeKm || (gapSeconds > 0 && impliedMetersPerSecond > 45)) {
            flush();
            current = [point];
        } else {
            current.push(point);
        }
    });
    flush();
    return segments;
};

const getRoutePointValue = (point, fallback = '') => {
    const normalized = normalizePoint(point);
    if (normalized) return `${normalized.lat},${normalized.lng}`;
    if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
    if (typeof point === 'string' && point.trim()) return point.trim();
    return '';
};

const buildGoogleMapsRouteLink = (route) => {
    const originValue = getRoutePointValue(route?.startCoords, route?.start);
    const destinationValue = getRoutePointValue(route?.endCoords, route?.end);
    if (!originValue || !destinationValue) return '';

    const waypointValues = Array.isArray(route?.waypointsData)
        ? route.waypointsData.map((point, index) => getRoutePointValue(point, route?.waypoints?.[index])).filter(Boolean)
        : Array.isArray(route?.waypoints)
            ? route.waypoints.map(point => getRoutePointValue(point, point)).filter(Boolean)
            : [];

    const params = new URLSearchParams({
        api: '1',
        origin: originValue,
        destination: destinationValue,
        travelmode: 'driving'
    });

    if (waypointValues.length) params.set('waypoints', waypointValues.join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
};


export default function Historial() {
  const [showModal, setShowModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const [allRoutes, setAllRoutes] = useState([]);

  // Filtros
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [serviceTab, setServiceTab] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [localMapCenter, setLocalMapCenter] = useState(DEFAULT_MAP_CENTER);

  const [uniqueDrivers, setUniqueDrivers] = useState([]);
  const [uniqueClients, setUniqueClients] = useState([]);

  // Google Maps Hook
  const { isLoaded } = useJsApiLoader({ 
      id: 'google-map-script', 
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      libraries,
      language: 'es' 
  });
  const mapRef = useRef(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return undefined;
    navigator.geolocation.getCurrentPosition(
      position => setLocalMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return undefined;
  }, []);

  // === CARGAR DATOS ===
  useEffect(() => {
    setIsLoadingRoutes(true);
    setLoadError('');
    const unsubscribe = onSnapshot(
      collection(db, 'rutas'),
      snapshot => {
        const routesArr = snapshot.docs.map(routeDoc => ({ id: routeDoc.id, ...routeDoc.data() }));
        setAllRoutes(routesArr);
        setUniqueDrivers([...new Set(routesArr.map(route => route.driver).filter(Boolean))].sort());
        setUniqueClients([...new Set(routesArr.map(route => route.client).filter(Boolean))].sort());
        setIsLoadingRoutes(false);
      },
      error => {
        console.error('No se pudo cargar el historial:', error);
        setLoadError('No fue posible cargar los reportes. Revisa la conexión o los permisos de Firestore.');
        setIsLoadingRoutes(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // === FILTRADO Y ORDEN DESCENDENTE POR CIERRE REAL ===
  const filteredRoutes = useMemo(() => {
    let result = allRoutes.filter(route => ['Finalizado', 'Completado', 'Cancelado'].includes(route.status));

    if (serviceTab === 'Inmediatos') result = result.filter(route => route.serviceType === 'Prioritario');
    if (serviceTab === 'Programados') result = result.filter(route => route.serviceType === 'Programado');

    if (filterDateStart) result = result.filter(route => getDateKey(
        route.actualEndTimestamp || route.finishedAt || route.completedAt || route.finalDate || route.scheduledDate || route.createdDate
    ) >= filterDateStart);

    if (filterDateEnd) result = result.filter(route => getDateKey(
        route.actualEndTimestamp || route.finishedAt || route.completedAt || route.finalDate || route.scheduledDate || route.createdDate
    ) <= filterDateEnd);

    if (filterDriver) result = result.filter(route => route.driver === filterDriver);
    if (filterClient) result = result.filter(route => route.client === filterClient);

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch) {
      result = result.filter(route => [
        route.client,
        route.driver,
        route.start,
        route.end,
        route.scheduledDate,
        getSafeDate(route),
        route.id,
        ...(Array.isArray(route.waypoints) ? route.waypoints : [])
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch));
    }

    return [...result].sort((a, b) => getRouteAuditTimestamp(b) - getRouteAuditTimestamp(a));
  }, [filterDateStart, filterDateEnd, filterDriver, filterClient, serviceTab, searchTerm, allRoutes]);

  // === CENTRAR MAPA (ZOOM INTELIGENTE) ===
  useEffect(() => {
      if(isLoaded && mapRef.current && showModal && selectedRoute) {
          const bounds = new window.google.maps.LatLngBounds();
          let hasPoints = false;

          // 1. Añadir la ruta planeada a los límites.
          const plannedPath = getPlannedGeometry(selectedRoute);
          if (plannedPath.length > 0) {
              plannedPath.forEach(coord => bounds.extend(coord));
              hasPoints = true;
          }

          // 2. Añadir la última ruta recalculada por el conductor.
          const recalculatedPath = normalizePath(selectedRoute.liveRouteGeometry || selectedRoute.liveNavigation?.geometry);
          if (recalculatedPath.length > 0) {
              recalculatedPath.forEach(coord => bounds.extend(coord));
              hasPoints = true;
          }
          
          // 3. Añadir la traza GPS real.
          const realPath = normalizePath(selectedRoute.rutaReal);
          if (realPath.length > 0) {
              realPath.forEach(coord => bounds.extend(coord));
              hasPoints = true;
          }

          if (hasPoints) {
              mapRef.current.fitBounds(bounds);
              // Opcional: Agregar un pequeño padding visual
              mapRef.current.panToBounds(bounds, 50); 
          }
      }
  }, [showModal, selectedRoute, isLoaded]);

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  // === KPIs ===
  const totalViajes = filteredRoutes.filter(r => r.status !== 'Cancelado').length;
  const totalKm = filteredRoutes.filter(r => r.status !== 'Cancelado').reduce((acc, curr) => acc + getActualDistanceKm(curr), 0).toFixed(1);
  const totalKmPlaneados = filteredRoutes.filter(r => r.status !== 'Cancelado').reduce((acc, curr) => acc + getPlannedDistanceKm(curr), 0).toFixed(1);

  // === EXPORTAR A EXCEL ===
  const handleExport = () => {
    const datosParaExcel = filteredRoutes.map(fila => {
        const fechaSegura = getSafeDate(fila);
        const dia = getDiaSemana(fila);
        
        const bitacoraTexto = fila.bitacora && fila.bitacora.length > 0 
            ? fila.bitacora.map(b => `[${b.time}] ${b.evento}: ${b.motivo}`).join(" | ")
             : 'Sin desviaciones';

        const mapLink = buildGoogleMapsRouteLink(fila);


        const boardingEvents = getBoardingEvents(fila);
        const boardingSummary = boardingEvents
            .map((event, index) => `${event.label || `Punto ${index + 1}`}: ${event.time || formatMexicoTime(event.timestamp) || 'Sin hora'}`)
            .join(' | ') || 'Sin abordajes registrados';

        const fotosLlegada = boardingEvents.map(e => `Abordaje (${e.time || formatMexicoTime(e.timestamp) || '-'})`).join(', ');
        const fotosAusencia = fila.evidencias?.map(e => `No Show (${e.time || formatMexicoTime(e.timestamp) || '-'})`).join(', ') || '';
        const resumenFotos = [fotosLlegada, fotosAusencia].filter(Boolean).join(' | ') || 'Sin registro fotográfico';

        return {
            "DÍA": dia,
            "FECHA DE CIERRE": fechaSegura,
            "HORA PROGRAMADA": getPlannedStartTime(fila) || '-',
            "HORA INICIO REAL": getActualStartTime(fila) || '-',
            "PRIMER PUNTO ATENDIDO": getFirstStopAttendedTime(fila) || '-',
            "RESULTADO PRIMER PUNTO": fila.firstStopAttendedStatus || '-',
            "HORAS DE ABORDAJE": boardingSummary,
            "HORA FINAL REAL": getActualEndTime(fila) || '-',
            "NOMBRE COMPLETO": fila.driver || 'Sin asignar',
            "PUNTO DE RECOGIDA": fila.start || 'N/A',
            "PUNTO DE DESCARGUE": fila.end || 'N/A',
            "KM PLANEADOS": getPlannedDistanceKm(fila).toFixed(1),
            "KM REALES GPS": getActualDistanceKm(fila).toFixed(1),
            "DIFERENCIA KM": (getActualDistanceKm(fila) - getPlannedDistanceKm(fila)).toFixed(1),
            "ESTATUS": fila.status,
            "BITÁCORA / JUSTIFICACIONES": bitacoraTexto,
            "REGISTRO FOTOGRÁFICO": resumenFotos,
            "CLIENTE SOLICITANTE": fila.client || 'N/A',
            "ID RUTA": fila.id,
            "TIPO SERVICIO": fila.serviceType || 'N/A',
            "TIEMPO ESTIMADO (MIN)": fila.technicalData?.totalDuration || '-',
            "TIEMPO REAL (MIN)": fila.finalDurationMinutes || fila.actualDurationMinutes || '-',
            "LINK GOOGLE MAPS": mapLink
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);

    const linkHeader = 'LINK GOOGLE MAPS';
    const linkColumnIndex = Object.keys(datosParaExcel[0] || {}).indexOf(linkHeader);
    if (linkColumnIndex >= 0) {
        datosParaExcel.forEach((row, rowIndex) => {
            const url = row[linkHeader];
            if (!url) return;
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: linkColumnIndex });
            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: 'Abrir ruta en Google Maps' };
            ws[cellRef].v = 'Abrir ruta en Google Maps';
            ws[cellRef].l = { Target: url, Tooltip: 'Abrir recorrido en Google Maps' };
        });
    }

    
    const wscols = [
        {wch: 12}, {wch: 16}, {wch: 16}, {wch: 16}, {wch: 48}, {wch: 16},
        {wch: 35}, {wch: 45}, {wch: 45}, {wch: 14}, {wch: 14}, {wch: 14},
        {wch: 15}, {wch: 55}, {wch: 40}, {wch: 25}, {wch: 25}, {wch: 18},
        {wch: 22}, {wch: 18}, {wch: 60}
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte_Logistica");
    XLSX.writeFile(wb, `Reporte_Logistica_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleViewDetails = (ruta) => {
      setSelectedRoute(ruta);
      setShowModal(true);
  };

  return (
    <div className="flex-1 p-4 md:p-6 xl:p-8 overflow-y-auto bg-slate-50 h-full">
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
          <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Historial y Reportes</h2>
              <p className="text-slate-500 text-sm">Auditoría de rutas, bitácoras y exportación de kilometrajes.</p>
          </div>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex gap-2 flex-wrap">
              {['Todos', 'Inmediatos', 'Programados'].map(tab => (
                  <button key={tab} type="button" onClick={() => setServiceTab(tab)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${serviceTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {tab}
                  </button>
              ))}
          </div>
          <div className="relative flex-1 lg:max-w-md lg:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar por fecha, conductor, cliente, origen o destino" className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-sm outline-none focus:border-blue-500" />
          </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold text-sm"><Filter className="w-4 h-4 text-blue-600"/> Filtros de Búsqueda</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 items-end gap-4">
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Desde</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Hasta</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} /></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Conductor</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}><option value="">Todos</option>{uniqueDrivers.map((d, i) => <option key={i} value={d}>{d}</option>)}</select></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Cliente</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}><option value="">Todos</option>{uniqueClients.map((c, i) => <option key={i} value={c}>{c}</option>)}</select></div>
              <div className="sm:col-span-2 xl:col-span-1 flex flex-wrap xl:flex-nowrap justify-start xl:justify-end gap-2">
                  {(filterDateStart || filterDateEnd || filterDriver || filterClient || searchTerm || serviceTab !== 'Todos') && (<button onClick={() => {setFilterDateStart(''); setFilterDateEnd(''); setFilterDriver(''); setFilterClient(''); setSearchTerm(''); setServiceTab('Todos');}} className="text-red-500 hover:bg-red-50 px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-1"><X className="w-4 h-4"/> Limpiar</button>)}
                  <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-black rounded-lg text-sm px-6 py-2.5 flex items-center gap-2 transition shadow-lg shadow-green-900/20"><FileSpreadsheet className="w-4 h-4"/> Exportar a Excel</button>
              </div>
          </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0"><CheckCircle2 className="w-8 h-8"/></div>
              <div><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Viajes Completados</p><h3 className="text-4xl font-black text-slate-800">{totalViajes}</h3></div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0"><Navigation className="w-8 h-8"/></div>
              <div><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Kilómetros Planeados</p><h3 className="text-3xl md:text-4xl font-black text-slate-800">{totalKmPlaneados} <span className="text-base font-bold text-slate-400">km</span></h3></div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center shrink-0"><Navigation className="w-8 h-8"/></div>
              <div><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Kilómetros Reales GPS</p><h3 className="text-3xl md:text-4xl font-black text-slate-800">{totalKm} <span className="text-base font-bold text-slate-400">km</span></h3></div>
          </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoadingRoutes ? (
              <div className="p-16 text-center text-slate-400"><Clock className="w-12 h-12 mx-auto mb-4 animate-pulse opacity-30"/><p className="font-bold">Cargando historial...</p></div>
          ) : loadError ? (
              <div className="p-16 text-center text-red-500"><AlertOctagon className="w-12 h-12 mx-auto mb-4 opacity-40"/><p className="font-bold">{loadError}</p></div>
          ) : filteredRoutes.length === 0 ? (
              <div className="p-16 text-center text-slate-400"><Search className="w-12 h-12 mx-auto mb-4 opacity-20"/><p className="font-bold">No se encontraron viajes en el historial con estos filtros.</p></div>
          ) : (
              <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase text-xs">
                      <tr>
                          <th className="px-6 py-4">Día / Fecha</th>
                          <th className="px-6 py-4">Cliente</th>
                          <th className="px-6 py-4">Horarios</th>
                          <th className="px-6 py-4">Operador (Nombre Completo)</th>
                          <th className="px-6 py-4">Resumen de Ruta</th>
                          <th className="px-6 py-4">Kilómetros</th>
                          <th className="px-6 py-4 text-right">Auditoría</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredRoutes.map((fila) => (
                          <tr key={fila.id} className={`transition ${fila.status === 'Cancelado' ? 'bg-red-50/30' : 'hover:bg-slate-50'}`}>
                              <td className="px-6 py-4">
                                  <div className="font-black text-slate-800 uppercase text-[10px]">{getDiaSemana(fila)}</div>
                                  <div className="font-bold text-slate-600">{getSafeDate(fila)}</div>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-700">{fila.client}</div>
                                  <div className="text-[10px] text-slate-400 font-bold uppercase">{fila.serviceType}</div>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="text-[10px] font-black uppercase text-slate-400">Programado: <span className="text-slate-700">{getPlannedStartTime(fila) || '--:--'}</span></div>
                                  <div className="text-xs font-black text-green-600 mt-1">Inicio real: {getActualStartTime(fila) || '--:--'}</div>
                                  <div className="text-[10px] font-bold text-slate-500 mt-1">Fin: {getActualEndTime(fila) || '--:--'}</div>
                              </td>
                              <td className="px-6 py-4 font-medium">
                                  {fila.driver ? <span className="font-bold text-slate-800">{fila.driver}</span> : <span className="text-slate-400 italic">Sin asignar</span>}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="text-xs max-w-[200px]">
                                      <div className="truncate text-slate-800"><span className="text-green-500 font-black">A:</span> {(fila.start || 'N/A').split(',')[0]}</div>
                                      {fila.waypoints?.length > 0 && <div className="text-[10px] text-blue-500 font-bold pl-3">+{fila.waypoints.length} paradas</div>}
                                      <div className="truncate text-slate-800"><span className="text-red-500 font-black">B:</span> {(fila.end || 'N/A').split(',')[0]}</div>
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="space-y-1">
                                      <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Planeados: <span className="text-blue-600">{getPlannedDistanceKm(fila).toFixed(1)} km</span></div>
                                      <div className="text-sm text-green-600 font-black">Reales: {getActualDistanceKm(fila).toFixed(1)} km</div>
                                      <div className={`text-[10px] font-black ${getActualDistanceKm(fila) - getPlannedDistanceKm(fila) > 0 ? 'text-orange-600' : 'text-slate-400'}`}>Diferencia: {(getActualDistanceKm(fila) - getPlannedDistanceKm(fila)).toFixed(1)} km</div>
                                      {getAverageSpeedKmh(fila) > 0 && <div className="text-[10px] font-black text-purple-600">Vel. promedio: {getAverageSpeedKmh(fila).toFixed(1)} km/h</div>}
                                  </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <div className="flex flex-col items-end gap-1">
                                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${fila.status === 'Cancelado' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                          {fila.status}
                                      </span>
                                      <button onClick={() => handleViewDetails(fila)} className="bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded transition text-[10px] font-bold shadow uppercase tracking-widest mt-1">Ver Reporte</button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table></div>
          )}
      </div>

      {/* === MODAL DE DETALLES MEJORADO (CON BITÁCORA) === */}
      {showModal && selectedRoute && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]">
                
                <div className="flex justify-between items-center px-4 md:px-8 py-4 md:py-5 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Reporte de Auditoría de Servicio</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ruta ID: {selectedRoute.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {buildGoogleMapsRouteLink(selectedRoute) && (
                            <a
                                href={buildGoogleMapsRouteLink(selectedRoute)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 transition"
                            >
                                <Navigation className="w-4 h-4" /> Abrir en Google Maps
                            </a>
                        )}
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col xl:flex-row">
                    {/* Panel Izquierdo: Info y Bitácora */}
                    <div className="w-full xl:w-1/2 p-4 md:p-6 xl:p-8 border-b xl:border-b-0 xl:border-r border-slate-100 space-y-6 bg-white overflow-y-auto">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Cliente Corporativo</p><p className="font-black text-slate-800">{selectedRoute.client}</p></div>
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Operador Asignado</p><p className="font-black text-blue-600">{selectedRoute.driver || 'No asignado'}</p></div>
                        </div>

                        {selectedRoute.status !== 'Cancelado' ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                        <p className="text-[10px] text-blue-600 uppercase font-black tracking-widest">Foto inicial del plan</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Hora programada</span><span className="font-black text-slate-800">{getPlannedStartTime(selectedRoute) || '--:--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Kilómetros calculados</span><span className="font-black text-blue-700">{getPlannedDistanceKm(selectedRoute).toFixed(1)} km</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Tiempo calculado</span><span className="font-black text-slate-800">{selectedRoute.technicalData?.totalDuration || '--'} min</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                                        <p className="text-[10px] text-green-700 uppercase font-black tracking-widest">Resultado real del recorrido</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Inicio real</span><span className="font-black text-slate-800">{getActualStartTime(selectedRoute) || '--:--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Primer punto atendido</span><span className="font-black text-orange-700">{getFirstStopAttendedTime(selectedRoute) || '--:--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Resultado inicial</span><span className="font-black text-orange-700">{selectedRoute.firstStopAttendedStatus || '--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Fin real</span><span className="font-black text-slate-800">{getActualEndTime(selectedRoute) || '--:--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Kilómetros reales/estimados</span><span className="font-black text-green-700">{getActualDistanceKm(selectedRoute).toFixed(1)} km</span></div>
                                            {Number(selectedRoute.gpsGapEstimatedDistanceKm || 0) > 0 && (
                                                <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Completados por pérdida GPS</span><span className="font-black text-amber-700">{Number(selectedRoute.gpsGapEstimatedDistanceKm).toFixed(1)} km estimados por ruta conocida</span></div>
                                            )}
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Diferencia</span><span className="font-black text-orange-600">{(getActualDistanceKm(selectedRoute) - getPlannedDistanceKm(selectedRoute)).toFixed(1)} km</span></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Horas reales de abordaje</p>
                                    {getBoardingEvents(selectedRoute).length > 0 ? (
                                        <div className="space-y-2">
                                            {getBoardingEvents(selectedRoute).map((event, index) => (
                                                <div key={`boarding-${index}`} className="flex justify-between gap-3 text-xs border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                                    <span className="font-bold text-slate-600">{event.type === 'dropoff' ? `Descarga: ${event.passenger || event.label || `Punto ${index + 1}`}` : (event.label || event.passenger || `Punto ${index + 1}`)}</span>
                                                    <span className="font-black text-blue-700">{event.time || formatMexicoTime(event.timestamp) || '--:--'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-400">No hay abordajes registrados.</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                <p className="font-black text-red-600">VIAJE CANCELADO</p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">Itinerario Registrado</h4>
                            <div className="relative pl-4 border-l-2 border-slate-200 space-y-5">
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-50"></div>
                                    <p className="text-[10px] text-green-600 font-black uppercase">Punto de Recogida</p>
                                    <p className="text-xs font-medium text-slate-800">{selectedRoute.start}</p>
                                </div>
                                {selectedRoute.waypoints && selectedRoute.waypoints.map((wp, i) => (
                                    <div key={i} className="relative">
                                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-50"></div>
                                        <p className="text-[10px] text-blue-600 font-black uppercase">Parada Intermedia {String.fromCharCode(66 + i)}</p>
                                        <p className="text-xs font-medium text-slate-800">{wp}</p>
                                    </div>
                                ))}
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-50"></div>
                                    <p className="text-[10px] text-red-600 font-black uppercase">Punto de Descargue</p>
                                    <p className="text-xs font-medium text-slate-800">{selectedRoute.end}</p>
                                </div>
                            </div>
                        </div>

                        {/* --- NUEVO: BITÁCORA DE DESVÍOS --- */}
                        {selectedRoute.bitacora?.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-slate-100">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-orange-500"/> Bitácora de Desvíos Registrados</h4>
                                <div className="space-y-3">
                                    {selectedRoute.bitacora.map((b, i) => (
                                        <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl p-3 relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500"></div>
                                            <div className="flex justify-between items-center mb-1">
                                                <p className="text-[10px] font-black uppercase text-orange-600 pl-2">{b.evento}</p>
                                                <p className="text-[10px] font-bold text-slate-500">{b.time}</p>
                                            </div>
                                            <p className="text-xs text-slate-700 font-medium pl-2 mb-1">"{b.motivo}"</p>
                                            <p className="text-[9px] text-slate-400 font-bold pl-2 uppercase tracking-widest">Distancia auditada: {b.distanciaMts} mts del punto</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* --- EVIDENCIAS FOTOGRÁFICAS --- */}
                        {(selectedRoute.evidencias?.length > 0 || selectedRoute.evidenciasLlegada?.length > 0) && (
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Camera className="w-4 h-4"/> Sellos de Evidencia Fotográfica</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {selectedRoute.evidenciasLlegada?.map((ev, i) => (
                                        <div key={`llegada-${i}`} className="bg-green-50 rounded-xl p-2 border border-green-100">
                                            <p className="text-[9px] font-bold text-green-600 uppercase mb-1">{ev.label} - Abordado</p>
                                            <a href={ev.photo} target="_blank" rel="noreferrer">
                                                <img src={ev.photo} className="w-full h-24 object-cover rounded-lg shadow-sm border border-green-200 hover:opacity-80 transition"/>
                                            </a>
                                            <p className="text-[9px] text-slate-500 mt-1 font-bold text-right">Hora: {ev.time}</p>
                                        </div>
                                    ))}
                                    {selectedRoute.evidencias?.map((ev, i) => (
                                        <div key={`ausencia-${i}`} className="bg-red-50 rounded-xl p-2 border border-red-100">
                                            <p className="text-[9px] font-bold text-red-600 uppercase mb-1">No se presentó</p>
                                            <a href={ev.photo} target="_blank" rel="noreferrer">
                                                <img src={ev.photo} className="w-full h-24 object-cover rounded-lg shadow-sm border border-red-200 hover:opacity-80 transition"/>
                                            </a>
                                            <p className="text-[9px] text-slate-500 mt-1 font-bold text-right">Hora: {ev.time}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Panel Derecho: Mapa de Auditoría */}
                    <div className="w-full xl:w-1/2 min-h-[420px] xl:min-h-0 bg-slate-200 relative">
                        {isLoaded ? (
                            <GoogleMap mapContainerStyle={containerStyle} center={normalizePoint(selectedRoute?.startCoords) || localMapCenter} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                                {/* RUTA PLANEADA: INMUTABLE DESDE QUE SE CREÓ EL VIAJE */}
                                {getPlannedGeometry(selectedRoute).length > 1 && (
                                    <Polyline path={getPlannedGeometry(selectedRoute)} options={{ strokeColor: "#334155", strokeOpacity: 0.72, strokeWeight: 9, zIndex: 1 }} />
                                )}
                                {/* ÚLTIMA RUTA RECALCULADA POR EL CONDUCTOR */}
                                {normalizePath(selectedRoute.liveRouteGeometry || selectedRoute.liveNavigation?.geometry).length > 1 && (
                                    <Polyline path={normalizePath(selectedRoute.liveRouteGeometry || selectedRoute.liveNavigation?.geometry)} options={{ strokeColor: "#f97316", strokeOpacity: 0.95, strokeWeight: 5, zIndex: 2 }} />
                                )}
                                {/* RUTA REAL (GPS CHOFER). Los cortes de señal se dibujan como segmentos separados. */}
                                {splitGpsTraceSegments(selectedRoute.rutaReal).map((segment, segmentIndex) => (
                                    <Polyline
                                        key={`audit-gps-${selectedRoute.id}-${segmentIndex}`}
                                        path={segment}
                                        options={{ strokeColor: "#a855f7", strokeOpacity: 1, strokeWeight: 4, zIndex: 3 }}
                                    />
                                ))}

                                {normalizePoint(selectedRoute.startCoords) && <Marker position={normalizePoint(selectedRoute.startCoords)} label="A" />}
                                {selectedRoute.waypointsData && selectedRoute.waypointsData.map((wp, idx) => {
                                    const point = normalizePoint(wp);
                                    return point ? <Marker key={idx} position={point} label={String.fromCharCode(66 + idx)} /> : null;
                                })}
                                {normalizePoint(selectedRoute.endCoords) && <Marker position={normalizePoint(selectedRoute.endCoords)} label={String.fromCharCode(66 + (selectedRoute.waypointsData?.length || 0))} />}
                            </GoogleMap>
                        ) : <div className="h-full flex items-center justify-center text-slate-500">Cargando Mapa...</div>}

                        {(selectedRoute.technicalData || selectedRoute.originalPlan) && (
                            <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur px-4 md:px-6 py-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col gap-2 z-10 min-w-[280px] max-w-[90%]">
                                <div className="flex justify-between items-center gap-4 border-b pb-2">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><p className="text-[10px] font-black uppercase text-slate-500">Ruta original creada</p></div>
                                    <p className="font-bold text-blue-700">{getPlannedDistanceKm(selectedRoute).toFixed(1)} km</p>
                                </div>
                                <div className="flex justify-between items-center gap-4 border-b pb-2">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div><p className="text-[10px] font-black uppercase text-orange-600">Recalculada</p></div>
                                    <p className="font-bold text-orange-700">{Number(selectedRoute.liveNavigation?.distanceKm || 0).toFixed(1)} km restantes</p>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div><p className="text-[10px] font-black uppercase text-purple-600">Ruta final recorrida</p></div>
                                    <p className="font-black text-xl text-purple-700">{getActualDistanceKm(selectedRoute).toFixed(1)} km</p>
                                </div>
                                {getAverageSpeedKmh(selectedRoute) > 0 && (
                                    <div className="flex justify-between items-center gap-4 border-t pt-2">
                                        <div className="flex items-center gap-2"><Gauge className="w-3.5 h-3.5 text-purple-600"/><p className="text-[10px] font-black uppercase text-slate-500">Velocidad promedio</p></div>
                                        <p className="font-black text-purple-700">{getAverageSpeedKmh(selectedRoute).toFixed(1)} km/h</p>
                                    </div>
                                )}
                                <p className="text-[8px] text-center text-slate-400 font-bold uppercase mt-1">Gris: plan original inmutable · naranja: recálculo vigente · morado: GPS real. Los cortes de señal no se unen con líneas rectas.</p>
                                {splitGpsTraceSegments(selectedRoute.rutaReal).length > 1 && (
                                    <p className="text-[8px] text-center text-amber-600 font-black uppercase">
                                        Se detectaron cortes de señal: no se unieron en línea recta.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}