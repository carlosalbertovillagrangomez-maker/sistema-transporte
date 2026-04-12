import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileSpreadsheet, Calendar, ArrowUp, X, MapPin, User, Clock, Building, Search, Filter, Zap, Navigation, UserCheck, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// FIREBASE
import { db } from './firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 
const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
const libraries = ['places']; 

// --- HELPER: EXTRACCIÓN SEGURA DE FECHAS ---
const getSafeDate = (ruta) => {
    if (ruta.finalDate) return ruta.finalDate;
    if (ruta.scheduledDate) return ruta.scheduledDate;
    if (ruta.createdDate) {
        return ruta.createdDate.includes('T') ? ruta.createdDate.split('T')[0] : ruta.createdDate.split(' ')[0];
    }
    return 'Sin Fecha';
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

  // === 1. CARGAR DATOS REALES DESDE FIREBASE ===
  useEffect(() => {
    const q = query(collection(db, "rutas"), orderBy("createdDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const routesArr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllRoutes(routesArr);
        
        // Extraer conductores y clientes únicos
        const drivers = [...new Set(routesArr.map(r => r.driver).filter(Boolean))];
        const clients = [...new Set(routesArr.map(r => r.client).filter(Boolean))];
        setUniqueDrivers(drivers);
        setUniqueClients(clients);
    });
    return () => unsubscribe();
  }, []);

  // === 2. LÓGICA DE FILTRADO SEGURO ===
  useEffect(() => {
    let result = allRoutes.filter(r => r.status === 'Finalizado' || r.status === 'Completado' || r.status === 'Cancelado'); // Incluimos cancelados para tener el log completo

    if (filterDateStart) result = result.filter(r => getSafeDate(r) >= filterDateStart);
    if (filterDateEnd) result = result.filter(r => getSafeDate(r) <= filterDateEnd);
    if (filterDriver) result = result.filter(r => r.driver === filterDriver);
    if (filterClient) result = result.filter(r => r.client === filterClient);

    setFilteredRoutes(result);
  }, [filterDateStart, filterDateEnd, filterDriver, filterClient, allRoutes]);

  // === 3. CENTRAR MAPA DEL MODAL ===
  useEffect(() => {
      if(isLoaded && mapRef.current && showModal && selectedRoute?.technicalData?.geometry?.length > 0) {
          const bounds = new window.google.maps.LatLngBounds();
          selectedRoute.technicalData.geometry.forEach(coord => bounds.extend(coord));
          mapRef.current.fitBounds(bounds);
      }
  }, [showModal, selectedRoute, isLoaded]);

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  // === 4. CÁLCULO DE KPIs ===
  const totalViajes = filteredRoutes.filter(r => r.status !== 'Cancelado').length;
  const totalKm = filteredRoutes
      .filter(r => r.status !== 'Cancelado')
      .reduce((acc, curr) => acc + parseFloat(curr.technicalData?.totalDistance || 0), 0)
      .toFixed(1);

  // === 5. EXPORTAR A EXCEL ===
  const handleExport = () => {
    const datosParaExcel = filteredRoutes.map(fila => {
        const origin = encodeURIComponent(fila.start || ''); 
        const destination = encodeURIComponent(fila.end || '');
        let waypointsStr = fila.waypoints?.length > 0 ? '&waypoints=' + fila.waypoints.map(wp => encodeURIComponent(wp)).join('|') : '';
        const mapLink = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsStr}&travelmode=driving`;

        return {
            "ID Ruta": fila.id,
            "Fecha": getSafeDate(fila),
            "Tipo Servicio": fila.serviceType || 'N/A',
            "Cliente": fila.client || 'N/A',
            "Solicitante": fila.requestUser || 'N/A',
            "Conductor": fila.driver || 'Sin asignar',
            "Punto de Inicio": fila.start || 'N/A',
            "Paradas Intermedias": fila.waypoints?.length > 0 ? fila.waypoints.join(' -> ') : 'Directo',
            "Punto Final": fila.end || 'N/A',
            "Distancia (km)": fila.technicalData?.totalDistance || '-',
            "Tiempo Estimado (min)": fila.technicalData?.totalDuration || '-',
            "Hora Inicio Real": fila.startTime || '-',
            "Hora Fin Real": fila.endTime || '-',
            "Estado": fila.status,
            "Link Google Maps": mapLink
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);
    
    const wscols = [
        {wch: 15}, {wch: 12}, {wch: 15}, {wch: 25}, {wch: 20}, 
        {wch: 20}, {wch: 40}, {wch: 40}, {wch: 40}, 
        {wch: 15}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 60}
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte Finalizados");
    XLSX.writeFile(wb, `Reporte_Rutas_Finalizadas_${new Date().toISOString().split('T')[0]}.xlsx`);
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
              <p className="text-slate-500 text-sm">Análisis de rutas completadas, canceladas y exportación de datos.</p>
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
                  <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-black rounded-lg text-sm px-6 py-2.5 flex items-center gap-2 transition shadow-lg shadow-green-900/20"><FileSpreadsheet className="w-4 h-4"/> Exportar Excel</button>
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
                          <th className="px-6 py-4">Fecha</th>
                          <th className="px-6 py-4">Cliente</th>
                          <th className="px-6 py-4">Conductor</th>
                          <th className="px-6 py-4">Resumen de Ruta</th>
                          <th className="px-6 py-4">Tiempo / Dist.</th>
                          <th className="px-6 py-4 text-right">Detalles</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredRoutes.map((fila) => (
                          <tr key={fila.id} className={`transition ${fila.status === 'Cancelado' ? 'bg-red-50/30' : 'hover:bg-slate-50'}`}>
                              <td className="px-6 py-4 font-bold text-slate-800">{getSafeDate(fila)}</td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-700">{fila.client}</div>
                                  <div className="text-[10px] text-slate-400 font-bold uppercase">{fila.serviceType}</div>
                              </td>
                              <td className="px-6 py-4 font-medium">
                                  {fila.driver ? fila.driver : <span className="text-slate-400 italic">Sin asignar</span>}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="text-xs max-w-[200px]">
                                      <div className="truncate text-slate-800"><span className="text-green-500 font-black">A:</span> {(fila.start || 'N/A').split(',')[0]}</div>
                                      {fila.waypoints?.length > 0 && <div className="text-[10px] text-blue-500 font-bold pl-3">+{fila.waypoints.length} paradas</div>}
                                      <div className="truncate text-slate-800"><span className="text-red-500 font-black">B:</span> {(fila.end || 'N/A').split(',')[0]}</div>
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-800">{fila.technicalData?.totalDuration || '--'} min</div>
                                  <div className="text-xs text-slate-400">{fila.technicalData?.totalDistance || '--'} km</div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <div className="flex flex-col items-end gap-1">
                                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${fila.status === 'Cancelado' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                          {fila.status}
                                      </span>
                                      <button onClick={() => handleViewDetails(fila)} className="bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded transition text-xs font-bold shadow mt-1">Ver Reporte</button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>

      {/* === MODAL DE DETALLES MEJORADO === */}
      {showModal && selectedRoute && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Reporte de Servicio</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ruta ID: {selectedRoute.id}</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto flex">
                    {/* Panel Izquierdo: Info */}
                    <div className="w-1/2 p-8 border-r border-slate-100 space-y-6 bg-white">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Cliente</p><p className="font-black text-slate-800">{selectedRoute.client}</p></div>
                            <div><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Conductor</p><p className="font-black text-blue-600">{selectedRoute.driver || 'No asignado'}</p></div>
                        </div>

                        {selectedRoute.status !== 'Cancelado' ? (
                            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Inicio Real</p><p className="font-black text-slate-800 text-lg">{selectedRoute.startTime || '--:--'}</p></div>
                                <div className="flex-1 px-4"><div className="w-full h-1 bg-green-500 rounded-full"></div></div>
                                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Fin Real</p><p className="font-black text-slate-800 text-lg">{selectedRoute.endTime || '--:--'}</p></div>
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
                                    <p className="text-[10px] text-green-600 font-black uppercase">Origen</p>
                                    <p className="text-xs font-medium text-slate-800">{selectedRoute.start}</p>
                                </div>
                                {selectedRoute.waypoints && selectedRoute.waypoints.map((wp, i) => (
                                    <div key={i} className="relative">
                                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-50"></div>
                                        <p className="text-[10px] text-blue-600 font-black uppercase">Parada {i + 1}</p>
                                        <p className="text-xs font-medium text-slate-800">{wp}</p>
                                    </div>
                                ))}
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-50"></div>
                                    <p className="text-[10px] text-red-600 font-black uppercase">Destino Final</p>
                                    <p className="text-xs font-medium text-slate-800">{selectedRoute.end}</p>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Panel Derecho: Mapa */}
                    <div className="w-1/2 bg-slate-200 relative">
                        {isLoaded ? (
                            <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                                {selectedRoute.technicalData?.geometry && (
                                    <>
                                        <Polyline path={selectedRoute.technicalData.geometry} options={{ strokeColor: selectedRoute.status === 'Cancelado' ? "#94a3b8" : "#3b82f6", strokeOpacity: 0.8, strokeWeight: 5 }} />
                                        {selectedRoute.startCoords && <Marker position={selectedRoute.startCoords} label={{text: "A", color: "white", fontWeight: "bold"}} />}
                                        {selectedRoute.endCoords && <Marker position={selectedRoute.endCoords} label={{text: "B", color: "white", fontWeight: "bold"}} />}
                                    </>
                                )}
                            </GoogleMap>
                        ) : <div className="h-full flex items-center justify-center text-slate-500">Cargando Mapa...</div>}

                        {selectedRoute.technicalData && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white px-6 py-3 rounded-full shadow-xl border border-slate-200 flex gap-6 z-10">
                                <div className="text-center"><p className="text-[10px] font-black uppercase text-slate-400">Total Recorrido</p><p className="font-black text-slate-800">{selectedRoute.technicalData.totalDistance} km</p></div>
                                <div className="w-px bg-slate-200"></div>
                                <div className="text-center"><p className="text-[10px] font-black uppercase text-slate-400">Tiempo de Ruta</p><p className="font-black text-blue-600">{selectedRoute.technicalData.totalDuration} min</p></div>
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