import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSpreadsheet, Calendar, ArrowUp, X, MapPin, User, Clock, Building, Search, Filter, Zap, Navigation, UserCheck, CheckCircle2, Camera, AlertOctagon } from 'lucide-react';
import * as XLSX from 'xlsx';

// FIREBASE
import { db } from './firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 
const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
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
    return new Date(milliseconds).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
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
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};

const getDiaSemana = (route) => {
    const milliseconds = getRouteAuditTimestamp(route);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        weekday: 'long'
    }).toUpperCase();
};

const formatMexicoTime = (value) => {
    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
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

const getBoardingEvents = (route) => {
    const evidences = Array.isArray(route?.evidenciasLlegada) ? route.evidenciasLlegada : [];
    return [...evidences].sort((a, b) => (getTimestampMs(a?.timestamp) || 0) - (getTimestampMs(b?.timestamp) || 0));
};

const getActualDistanceKm = (route) => {
    const value = Number(
        route?.finalDistanceKm ??
        route?.realDistanceDriven ??
        route?.actualDistanceKm ??
        0
    );
    return Number.isFinite(value) ? value : 0;
};

const getPlannedDistanceKm = (route) => {
    const value = Number(route?.technicalData?.totalDistance ?? route?.distanceKm ?? 0);
    return Number.isFinite(value) ? value : 0;
};

const normalizePoint = (point) => {
    if (!point) return null;
    const lat = Number(point.lat);
    const lng = Number(point.lng ?? point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { ...point, lat, lng };
};

const normalizePath = (path) => Array.isArray(path) ? path.map(normalizePoint).filter(Boolean) : [];

export default function Historial() {
  const [showModal, setShowModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const [allRoutes, setAllRoutes] = useState([]);

  // Filtros
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterClient, setFilterClient] = useState('');

  const [uniqueDrivers, setUniqueDrivers] = useState([]);
  const [uniqueClients, setUniqueClients] = useState([]);

  // Google Maps Hook
  const { isLoaded } = useJsApiLoader({ 
      id: 'google-map-script', 
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      libraries: libraries 
  });
  const mapRef = useRef(null);

  // === CARGAR DATOS ===
  useEffect(() => {
    const q = query(collection(db, "rutas"), orderBy("createdDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const routesArr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllRoutes(routesArr);
        
        const drivers = [...new Set(routesArr.map(r => r.driver).filter(Boolean))];
        const clients = [...new Set(routesArr.map(r => r.client).filter(Boolean))];
        setUniqueDrivers(drivers);
        setUniqueClients(clients);
    });
    return () => unsubscribe();
  }, []);

  // === FILTRADO Y ORDEN DESCENDENTE POR CIERRE REAL ===
  const filteredRoutes = useMemo(() => {
    let result = allRoutes.filter(r => ['Finalizado', 'Completado', 'Cancelado'].includes(r.status));

    if (filterDateStart) result = result.filter(r => getDateKey(
        r.actualEndTimestamp || r.finishedAt || r.completedAt || r.finalDate || r.scheduledDate || r.createdDate
    ) >= filterDateStart);

    if (filterDateEnd) result = result.filter(r => getDateKey(
        r.actualEndTimestamp || r.finishedAt || r.completedAt || r.finalDate || r.scheduledDate || r.createdDate
    ) <= filterDateEnd);

    if (filterDriver) result = result.filter(r => r.driver === filterDriver);
    if (filterClient) result = result.filter(r => r.client === filterClient);

    return [...result].sort((a, b) => getRouteAuditTimestamp(b) - getRouteAuditTimestamp(a));
  }, [filterDateStart, filterDateEnd, filterDriver, filterClient, allRoutes]);

  // === CENTRAR MAPA (ZOOM INTELIGENTE) ===
  useEffect(() => {
      if(isLoaded && mapRef.current && showModal && selectedRoute) {
          const bounds = new window.google.maps.LatLngBounds();
          let hasPoints = false;

          // 1. Añadir la ruta planeada a los límites.
          const plannedPath = normalizePath(selectedRoute.technicalData?.geometry);
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

        const buildWaypointValue = (wp) => {
            if (!wp) return '';
            if (typeof wp === 'string') return wp;
            if (typeof wp === 'object') {
                if (wp.address) return wp.address;
                if (wp.lat != null && (wp.lng != null || wp.lon != null)) return `${wp.lat},${wp.lng ?? wp.lon}`;
            }
            return '';
        };
        const originValue = fila.start || (fila.startCoords?.lat != null && fila.startCoords?.lng != null ? `${fila.startCoords.lat},${fila.startCoords.lng}` : '');
        const destinationValue = fila.end || (fila.endCoords?.lat != null && fila.endCoords?.lng != null ? `${fila.endCoords.lat},${fila.endCoords.lng}` : '');
        const origin = encodeURIComponent(originValue);
        const destination = encodeURIComponent(destinationValue);
        const waypointValues = Array.isArray(fila.waypointsData)
            ? fila.waypointsData.map(buildWaypointValue).filter(Boolean)
            : Array.isArray(fila.waypoints)
                ? fila.waypoints.map(buildWaypointValue).filter(Boolean)
                : [];
        const waypointsStr = waypointValues.length > 0
            ? '&waypoints=' + waypointValues.map(wp => encodeURIComponent(wp)).join('|')
            : '';
        const mapLink = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsStr}&travelmode=driving`;


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
    <div className="flex-1 p-4 md:p-6 2xl:p-8 overflow-y-auto bg-slate-50 h-full">
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
          <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Historial y Reportes</h2>
              <p className="text-slate-500 text-sm">Auditoría de rutas, bitácoras y exportación de kilometrajes.</p>
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
                  {(filterDateStart || filterDateEnd || filterDriver || filterClient) && (<button onClick={() => {setFilterDateStart(''); setFilterDateEnd(''); setFilterDriver(''); setFilterClient('');}} className="text-red-500 hover:bg-red-50 px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-1"><X className="w-4 h-4"/> Limpiar</button>)}
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
          {filteredRoutes.length === 0 ? (
              <div className="p-16 text-center text-slate-400"><Search className="w-12 h-12 mx-auto mb-4 opacity-20"/><p className="font-bold">No se encontraron viajes en el historial con estos filtros.</p></div>
          ) : (
              <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase text-xs">
                      <tr>
                          <th className="px-6 py-4">Día / Fecha</th>
                          <th className="px-6 py-4">Cliente</th>
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
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
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
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Fin real</span><span className="font-black text-slate-800">{getActualEndTime(selectedRoute) || '--:--'}</span></div>
                                            <div className="flex justify-between text-xs"><span className="font-bold text-slate-500">Kilómetros GPS</span><span className="font-black text-green-700">{getActualDistanceKm(selectedRoute).toFixed(1)} km</span></div>
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
                                                    <span className="font-bold text-slate-600">{event.label || event.passenger || `Punto ${index + 1}`}</span>
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
                            <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                                {/* RUTA PLANEADA */}
                                {normalizePath(selectedRoute.technicalData?.geometry).length > 1 && (
                                    <Polyline path={normalizePath(selectedRoute.technicalData?.geometry)} options={{ strokeColor: "#3b82f6", strokeOpacity: 0.45, strokeWeight: 4 }} />
                                )}
                                {/* ÚLTIMA RUTA RECALCULADA POR EL CONDUCTOR */}
                                {normalizePath(selectedRoute.liveRouteGeometry || selectedRoute.liveNavigation?.geometry).length > 1 && (
                                    <Polyline path={normalizePath(selectedRoute.liveRouteGeometry || selectedRoute.liveNavigation?.geometry)} options={{ strokeColor: "#f97316", strokeOpacity: 0.9, strokeWeight: 5 }} />
                                )}
                                {/* RUTA REAL (GPS CHOFER) */}
                                {normalizePath(selectedRoute.rutaReal).length > 1 && (
                                    <Polyline path={normalizePath(selectedRoute.rutaReal)} options={{ strokeColor: "#a855f7", strokeOpacity: 1, strokeWeight: 5 }} />
                                )}

                                {normalizePoint(selectedRoute.startCoords) && <Marker position={normalizePoint(selectedRoute.startCoords)} label="A" />}
                                {selectedRoute.waypointsData && selectedRoute.waypointsData.map((wp, idx) => {
                                    const point = normalizePoint(wp);
                                    return point ? <Marker key={idx} position={point} label={String.fromCharCode(66 + idx)} /> : null;
                                })}
                                {normalizePoint(selectedRoute.endCoords) && <Marker position={normalizePoint(selectedRoute.endCoords)} label={String.fromCharCode(66 + (selectedRoute.waypointsData?.length || 0))} />}
                            </GoogleMap>
                        ) : <div className="h-full flex items-center justify-center text-slate-500">Cargando Mapa...</div>}

                        {selectedRoute.technicalData && (
                            <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur px-4 md:px-6 py-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col gap-2 z-10 min-w-[280px] max-w-[90%]">
                                <div className="flex justify-between items-center gap-4 border-b pb-2">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><p className="text-[10px] font-black uppercase text-slate-500">Planeada</p></div>
                                    <p className="font-bold text-blue-700">{getPlannedDistanceKm(selectedRoute).toFixed(1)} km</p>
                                </div>
                                <div className="flex justify-between items-center gap-4 border-b pb-2">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div><p className="text-[10px] font-black uppercase text-orange-600">Recalculada</p></div>
                                    <p className="font-bold text-orange-700">{Number(selectedRoute.liveNavigation?.distanceKm || 0).toFixed(1)} km restantes</p>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div><p className="text-[10px] font-black uppercase text-purple-600">Real GPS</p></div>
                                    <p className="font-black text-xl text-purple-700">{getActualDistanceKm(selectedRoute).toFixed(1)} km</p>
                                </div>
                                <p className="text-[8px] text-center text-slate-400 font-bold uppercase mt-1">Azul: plan · naranja: recálculo · morado: recorrido GPS.</p>
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