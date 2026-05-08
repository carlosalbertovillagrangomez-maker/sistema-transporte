import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// --- HELPER: EXTRACCIÓN SEGURA DE FECHAS Y DÍAS ---
const getSafeDate = (ruta) => {
    if (ruta.finalDate) return ruta.finalDate;
    if (ruta.scheduledDate) return ruta.scheduledDate;
    if (ruta.createdDate) {
        return ruta.createdDate.includes('T') ? ruta.createdDate.split('T')[0] : ruta.createdDate.split(' ')[0];
    }
    return 'Sin Fecha';
};

const getDiaSemana = (fechaStr) => {
    if (!fechaStr || fechaStr === 'Sin Fecha') return '';
    const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const date = new Date(fechaStr + 'T12:00:00Z');
    return dias[date.getUTCDay()];
};

export default function Historial() {
  const [showModal, setShowModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const [allRoutes, setAllRoutes] = useState([]);
  const [filteredRoutes, setFilteredRoutes] = useState([]);

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

  // === FILTRADO ===
  useEffect(() => {
    let result = allRoutes.filter(r => r.status === 'Finalizado' || r.status === 'Completado' || r.status === 'Cancelado'); 

    if (filterDateStart) result = result.filter(r => getSafeDate(r) >= filterDateStart);
    if (filterDateEnd) result = result.filter(r => getSafeDate(r) <= filterDateEnd);
    if (filterDriver) result = result.filter(r => r.driver === filterDriver);
    if (filterClient) result = result.filter(r => r.client === filterClient);

    setFilteredRoutes(result);
  }, [filterDateStart, filterDateEnd, filterDriver, filterClient, allRoutes]);

  // === CENTRAR MAPA ===
  useEffect(() => {
      if(isLoaded && mapRef.current && showModal && selectedRoute?.technicalData?.geometry?.length > 0) {
          const bounds = new window.google.maps.LatLngBounds();
          selectedRoute.technicalData.geometry.forEach(coord => bounds.extend(coord));
          mapRef.current.fitBounds(bounds);
      }
  }, [showModal, selectedRoute, isLoaded]);

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  // === KPIs (USANDO ODÓMETRO REAL SI EXISTE) ===
  const totalViajes = filteredRoutes.filter(r => r.status !== 'Cancelado').length;
  const totalKm = filteredRoutes.filter(r => r.status !== 'Cancelado').reduce((acc, curr) => acc + parseFloat(curr.realDistanceDriven || curr.technicalData?.totalDistance || 0), 0).toFixed(1);

  // === EXPORTAR A EXCEL ===
  const handleExport = () => {
    const datosParaExcel = filteredRoutes.map(fila => {
        const fechaSegura = getSafeDate(fila);
        const dia = getDiaSemana(fechaSegura);
        
        const bitacoraTexto = fila.bitacora && fila.bitacora.length > 0 
            ? fila.bitacora.map(b => `[${b.time}] ${b.evento}: ${b.motivo}`).join(" | ")
            : 'Sin desviaciones';

        const origin = encodeURIComponent(fila.start || ''); 
        const destination = encodeURIComponent(fila.end || '');
        let waypointsStr = fila.waypoints?.length > 0 ? '&waypoints=' + fila.waypoints.map(wp => encodeURIComponent(wp)).join('|') : '';
        const mapLink = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsStr}&travelmode=driving`;

        const fotosLlegada = fila.evidenciasLlegada?.map(e => `Abordaje (${e.time})`).join(", ") || '';
        const fotosAusencia = fila.evidencias?.map(e => `No Show (${e.time})`).join(", ") || '';
        const resumenFotos = [fotosLlegada, fotosAusencia].filter(Boolean).join(" | ") || 'Sin registro fotográfico';

        return {
            "DÍA": dia,
            "FECHA": fechaSegura,
            "HORA ENTRADA": fila.startTime || '-',
            "HORA SALIDA": fila.endTime || '-',
            "NOMBRE COMPLETO": fila.driver || 'Sin asignar',
            "PUNTO DE RECOGIDA": fila.start || 'N/A',
            "PUNTO DE DESCARGUE": fila.end || 'N/A',
            "KMTS": fila.realDistanceDriven ? parseFloat(fila.realDistanceDriven).toFixed(1) : (fila.technicalData?.totalDistance || '-'),
            "ESTATUS": fila.status,
            "BITÁCORA / JUSTIFICACIONES": bitacoraTexto,
            "REGISTRO FOTOGRÁFICO": resumenFotos,
            "CLIENTE SOLICITANTE": fila.client || 'N/A',
            "ID RUTA": fila.id,
            "TIPO SERVICIO": fila.serviceType || 'N/A',
            "TIEMPO ESTIMADO (MIN)": fila.technicalData?.totalDuration || '-',
            "LINK GOOGLE MAPS": mapLink
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);
    
    const wscols = [ 
        {wch: 12}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 35}, 
        {wch: 45}, {wch: 45}, {wch: 10}, {wch: 15}, {wch: 50}, 
        {wch: 35}, {wch: 25}, {wch: 25}, {wch: 15}, {wch: 22}, {wch: 60} 
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
    <div className="flex-1 p-8 overflow-y-auto bg-slate-50 h-full">
      
      <div className="flex justify-between items-center mb-6">
          <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Historial y Reportes</h2>
              <p className="text-slate-500 text-sm">Auditoría de rutas, bitácoras y exportación de kilometrajes.</p>
          </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold text-sm"><Filter className="w-4 h-4 text-blue-600"/> Filtros de Búsqueda</div>
          <div className="flex flex-wrap items-end gap-4">
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Desde</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Hasta</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} /></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Conductor</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}><option value="">Todos</option>{uniqueDrivers.map((d, i) => <option key={i} value={d}>{d}</option>)}</select></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Cliente</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}><option value="">Todos</option>{uniqueClients.map((c, i) => <option key={i} value={c}>{c}</option>)}</select></div>
              <div className="flex-1 flex justify-end gap-2">
                  {(filterDateStart || filterDateEnd || filterDriver || filterClient) && (<button onClick={() => {setFilterDateStart(''); setFilterDateEnd(''); setFilterDriver(''); setFilterClient('');}} className="text-red-500 hover:bg-red-50 px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-1"><X className="w-4 h-4"/> Limpiar</button>)}
                  <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-black rounded-lg text-sm px-6 py-2.5 flex items-center gap-2 transition shadow-lg shadow-green-900/20"><FileSpreadsheet className="w-4 h-4"/> Exportar a Excel</button>
              </div>
          </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0"><CheckCircle2 className="w-8 h-8"/></div>
              <div><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Viajes Completados</p><h3 className="text-4xl font-black text-slate-800">{totalViajes}</h3></div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center shrink-0"><Navigation className="w-8 h-8"/></div>
              <div><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Distancia Total Recorrida</p><h3 className="text-4xl font-black text-slate-800">{totalKm} <span className="text-base font-bold text-slate-400">km</span></h3></div>
          </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {filteredRoutes.length === 0 ? (
              <div className="p-16 text-center text-slate-400"><Search className="w-12 h-12 mx-auto mb-4 opacity-20"/><p className="font-bold">No se encontraron viajes en el historial con estos filtros.</p></div>
          ) : (
              <table className="min-w-full text-left text-sm text-slate-600">
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
                                  <div className="font-black text-slate-800 uppercase text-[10px]">{getDiaSemana(getSafeDate(fila))}</div>
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
                                  <div className="text-sm text-blue-600 font-black">
                                      {fila.realDistanceDriven ? parseFloat(fila.realDistanceDriven).toFixed(1) : (fila.technicalData?.totalDistance || '--')} km
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
              </table>
          )}
      </div>

      {/* === MODAL DE DETALLES MEJORADO (CON BITÁCORA) === */}
      {showModal && selectedRoute && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Reporte de Auditoría de Servicio</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ruta ID: {selectedRoute.id}</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto flex">
                    {/* Panel Izquierdo: Info y Bitácora */}
                    <div className="w-1/2 p-8 border-r border-slate-100 space-y-6 bg-white overflow-y-auto">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Cliente Corporativo</p><p className="font-black text-slate-800">{selectedRoute.client}</p></div>
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Operador Asignado</p><p className="font-black text-blue-600">{selectedRoute.driver || 'No asignado'}</p></div>
                        </div>

                        {selectedRoute.status !== 'Cancelado' ? (
                            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Hora Entrada</p><p className="font-black text-slate-800 text-lg">{selectedRoute.startTime || '--:--'}</p></div>
                                <div className="flex-1 px-4"><div className="w-full h-1 bg-green-500 rounded-full"></div></div>
                                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Hora Salida</p><p className="font-black text-slate-800 text-lg">{selectedRoute.endTime || '--:--'}</p></div>
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
                                        <p className="text-[10px] text-blue-600 font-black uppercase">Parada Intermedia {i + 1}</p>
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
                    <div className="w-1/2 bg-slate-200 relative">
                        {isLoaded ? (
                            <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                                {/* RUTA PLANEADA */}
                                {selectedRoute.technicalData?.geometry && (
                                    <Polyline path={selectedRoute.technicalData.geometry} options={{ strokeColor: "#3b82f6", strokeOpacity: 0.4, strokeWeight: 4 }} />
                                )}
                                {/* RUTA REAL (GPS CHOFER) */}
                                {selectedRoute.rutaReal && (
                                    <Polyline path={selectedRoute.rutaReal} options={{ strokeColor: "#a855f7", strokeOpacity: 1, strokeWeight: 5 }} />
                                )}

                                {selectedRoute.startCoords && <Marker position={selectedRoute.startCoords} label="A" />}
                                {selectedRoute.waypointsData && selectedRoute.waypointsData.map((wp, idx) => ( wp.lat && wp.lng && <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} label={String.fromCharCode(66 + idx)} /> ))}
                                {selectedRoute.endCoords && <Marker position={selectedRoute.endCoords} label={String.fromCharCode(66 + (selectedRoute.waypointsData?.length || 0))} />}
                            </GoogleMap>
                        ) : <div className="h-full flex items-center justify-center text-slate-500">Cargando Mapa...</div>}

                        {selectedRoute.technicalData && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col gap-2 z-10 min-w-[300px]">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <p className="text-[10px] font-black uppercase text-slate-400">Ruta Planeada:</p>
                                    <p className="font-bold text-slate-600">{selectedRoute.technicalData?.totalDistance} km</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                        <p className="text-[10px] font-black uppercase text-purple-600">Auditoría Real (GPS):</p>
                                    </div>
                                    <p className="font-black text-xl text-purple-700">
                                        {selectedRoute.realDistanceDriven ? parseFloat(selectedRoute.realDistanceDriven).toFixed(1) : "0.0"} km
                                    </p>
                                </div>
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