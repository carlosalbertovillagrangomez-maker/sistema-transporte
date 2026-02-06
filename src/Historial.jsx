import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Calendar, ArrowUp, X, MapPin, User, Clock, Building, Search, Filter, Zap, LayoutList, Navigation, UserCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Iconos Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// === COMPONENTE PARA CENTRAR EL MAPA EN EL MODAL ===
function MapUpdater({ routeCoords }) {
    const map = useMap();
    useEffect(() => {
        if (routeCoords && routeCoords.length > 0) {
            const bounds = L.latLngBounds(routeCoords);
            map.fitBounds(bounds, { padding: [30, 30] });
        }
    }, [routeCoords, map]);
    return null;
}

export default function Historial() {
  const [showModal, setShowModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  // === 1. ESTADO DE DATOS Y FILTROS ===
  const [allRoutes, setAllRoutes] = useState([]);
  const [filteredRoutes, setFilteredRoutes] = useState([]);

  // Filtros
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterClient, setFilterClient] = useState('');

  // Listas para los selectores
  const [uniqueDrivers, setUniqueDrivers] = useState([]);
  const [uniqueClients, setUniqueClients] = useState([]);

  // === 2. CARGAR DATOS REALES ===
  useEffect(() => {
    const saved = localStorage.getItem('mis_rutas');
    if (saved) {
        const parsedRoutes = JSON.parse(saved);
        setAllRoutes(parsedRoutes);
        setFilteredRoutes(parsedRoutes);

        const drivers = [...new Set(parsedRoutes.map(r => r.driver).filter(Boolean))];
        const clients = [...new Set(parsedRoutes.map(r => r.client).filter(Boolean))];
        setUniqueDrivers(drivers);
        setUniqueClients(clients);
    }
  }, []);

  // === 3. LÓGICA DE FILTRADO ===
  useEffect(() => {
    let result = allRoutes;

    if (filterDateStart) result = result.filter(r => (r.finalDate || r.createdDate) >= filterDateStart);
    if (filterDateEnd) result = result.filter(r => (r.finalDate || r.createdDate) <= filterDateEnd);
    if (filterDriver) result = result.filter(r => r.driver === filterDriver);
    if (filterClient) result = result.filter(r => r.client === filterClient);

    setFilteredRoutes(result);
  }, [filterDateStart, filterDateEnd, filterDriver, filterClient, allRoutes]);

  // === 4. CÁLCULO DE KPIs ===
  const totalViajes = filteredRoutes.length;
  const viajesCompletados = filteredRoutes.filter(r => r.status === 'Completado').length;
  const tasaExito = totalViajes > 0 ? Math.round((viajesCompletados / totalViajes) * 100) : 0;

  // === 5. EXPORTAR A EXCEL (MEJORADO CON PARADAS E INFO TÉCNICA) ===
  const handleExport = () => {
    const datosParaExcel = filteredRoutes.map(fila => ({
        "ID Ruta": fila.id,
        "Fecha Gestión": fila.finalDate,
        "Tipo Servicio": fila.serviceType,
        "Cliente": fila.client,
        "Solicitado Por": fila.requestUser || 'N/A', // NUEVO
        "Conductor": fila.driver,
        "Origen": fila.start,
        // NUEVO: Paradas en formato texto
        "Paradas Intermedias": fila.waypoints && fila.waypoints.length > 0 ? fila.waypoints.join(' -> ') : 'Directo',
        "Destino": fila.end,
        // NUEVO: Datos técnicos
        "Distancia (km)": fila.technicalData?.totalDistance || '-',
        "Tiempo Est. (min)": fila.technicalData?.totalDuration || '-',
        "Estado Actual": fila.status,
        "Hora Inicio Real": fila.startTime || '-',
        "Hora Fin Real": fila.endTime || '-'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);
    
    // Ajustar ancho de columnas para que se vea bonito
    const wscols = [
        {wch: 10}, {wch: 12}, {wch: 12}, {wch: 20}, {wch: 15}, 
        {wch: 15}, {wch: 25}, {wch: 30}, {wch: 25}, 
        {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte Detallado");
    XLSX.writeFile(wb, `Reporte_Logistica_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleViewDetails = (ruta) => {
      setSelectedRoute(ruta);
      setShowModal(true);
  };

  const defaultCenter = [19.4326, -99.1332];

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-50 h-full">
      
      {/* BARRA DE FILTROS */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold text-sm">
              <Filter className="w-4 h-4 text-blue-600"/> Filtros de Búsqueda
          </div>
          <div className="flex flex-wrap items-end gap-4">
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Desde</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-slate-400 mb-1">Hasta</label><input type="date" className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg p-2.5 outline-none" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} /></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Conductor</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}><option value="">Todos los Conductores</option>{uniqueDrivers.map((d, i) => <option key={i} value={d}>{d}</option>)}</select></div>
              <div className="min-w-[200px]"><label className="block text-xs font-bold text-slate-400 mb-1">Cliente</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}><option value="">Todos los Clientes</option>{uniqueClients.map((c, i) => <option key={i} value={c}>{c}</option>)}</select></div>
              <div className="flex-1 flex justify-end gap-2">
                  {(filterDateStart || filterDateEnd || filterDriver || filterClient) && (<button onClick={() => {setFilterDateStart(''); setFilterDateEnd(''); setFilterDriver(''); setFilterClient('');}} className="text-red-500 hover:bg-red-50 px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-1"><X className="w-4 h-4"/> Limpiar</button>)}
                  <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-sm px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-green-900/20"><FileSpreadsheet className="w-4 h-4"/> Exportar Reporte</button>
              </div>
          </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><p className="text-sm font-medium text-slate-500 mb-1">Resultados Filtrados</p><h3 className="text-3xl font-bold text-slate-800">{totalViajes} <span className="text-base font-normal text-slate-400">viajes</span></h3></div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><p className="text-sm font-medium text-slate-500 mb-1">Completados</p><div className="flex items-center gap-2"><h3 className="text-3xl font-bold text-slate-800">{viajesCompletados}</h3><span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><ArrowUp className="w-3 h-3"/> Éxito</span></div></div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><p className="text-sm font-medium text-slate-500 mb-1">Tasa de Efectividad</p><h3 className="text-3xl font-bold text-blue-600">{tasaExito}%</h3></div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {filteredRoutes.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><Search className="w-10 h-10 mx-auto mb-2 opacity-20"/><p>No se encontraron viajes con estos filtros.</p></div>
          ) : (
              <table className="min-w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase text-xs">
                      <tr>
                          <th className="px-6 py-4">Fecha</th>
                          <th className="px-6 py-4">Tipo</th>
                          <th className="px-6 py-4">Cliente / ID</th>
                          <th className="px-6 py-4">Conductor</th>
                          <th className="px-6 py-4">Ruta (Resumen)</th>
                          <th className="px-6 py-4">Estado</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredRoutes.map((fila, index) => (
                          <tr key={index} className="hover:bg-slate-50 transition">
                              <td className="px-6 py-4 font-medium text-slate-800">{fila.finalDate || fila.createdDate}</td>
                              <td className="px-6 py-4">
                                  {fila.serviceType === 'Prioritario' ? <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 w-fit"><Zap className="w-3 h-3"/> URGENTE</span> : <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit"><Calendar className="w-3 h-3"/> PROG.</span>}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-700">{fila.client}</div>
                                  <div className="text-xs font-mono text-slate-400">{fila.id}</div>
                                  {fila.requestUser && <div className="text-[10px] text-blue-500 flex items-center gap-1 mt-0.5"><UserCheck className="w-3 h-3"/> {fila.requestUser}</div>}
                              </td>
                              <td className="px-6 py-4 font-medium">{fila.driver || 'Sin Asignar'}</td>
                              <td className="px-6 py-4">
                                  <div className="text-xs max-w-[150px]">
                                      <div className="truncate" title={fila.start}><span className="text-green-600 font-bold">A:</span> {fila.start.split(',')[0]}</div>
                                      {fila.waypoints?.length > 0 && <div className="text-[10px] text-slate-400 pl-3">+{fila.waypoints.length} paradas</div>}
                                      <div className="truncate" title={fila.end}><span className="text-red-600 font-bold">B:</span> {fila.end.split(',')[0]}</div>
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${fila.status === 'Completado' ? 'bg-green-100 text-green-700' : fila.status === 'En Curso' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                      <span className={`w-2 h-2 rounded-full ${fila.status === 'Completado' ? 'bg-green-500' : fila.status === 'En Curso' ? 'bg-blue-500' : 'bg-gray-500'}`}></span> {fila.status}
                                  </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button onClick={() => handleViewDetails(fila)} className="text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition text-xs font-medium">Ver Detalles</button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>

      {/* === MODAL DE DETALLES MEJORADO === */}
      {showModal && selectedRoute && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Detalles del Viaje</h3>
                        <p className="text-xs font-mono text-slate-500">{selectedRoute.id} • {selectedRoute.serviceType}</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition"><X className="w-6 h-6" /></button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {/* INFO PRINCIPAL */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-500 uppercase font-bold mb-1">Conductor</p>
                            <p className="font-bold text-slate-800 flex items-center gap-2 truncate"><User className="w-4 h-4"/> {selectedRoute.driver}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Cliente</p>
                            <p className="font-bold text-slate-800 flex items-center gap-2 truncate"><Building className="w-4 h-4"/> {selectedRoute.client}</p>
                            {selectedRoute.requestUser && <p className="text-xs text-slate-500 mt-1">Solicitó: {selectedRoute.requestUser}</p>}
                        </div>
                    </div>

                    {/* TIMELINE HORARIOS */}
                    <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">Inicio Real</p>
                            <p className="font-bold text-slate-800 font-mono">{selectedRoute.startTime || '--:--'}</p>
                        </div>
                        <div className="flex-1 px-4 flex flex-col items-center">
                            <div className="w-full h-1 bg-slate-200 rounded-full relative overflow-hidden">
                                <div className={`absolute top-0 left-0 h-full ${selectedRoute.status === 'Completado' ? 'bg-green-500 w-full' : selectedRoute.status === 'En Curso' ? 'bg-blue-500 w-1/2' : 'w-0'}`}></div>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1">{selectedRoute.status}</span>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">Fin Real</p>
                            <p className="font-bold text-slate-800 font-mono">{selectedRoute.endTime || '--:--'}</p>
                        </div>
                    </div>

                    {/* LISTA DE ITINERARIO */}
                    <div className="space-y-4 mb-6">
                        <h4 className="text-xs font-bold text-slate-500 uppercase border-b border-slate-100 pb-2">Itinerario Completo</h4>
                        
                        <div className="relative pl-4 border-l-2 border-slate-200 space-y-4">
                            {/* Inicio */}
                            <div className="relative">
                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm"></div>
                                <p className="text-xs text-green-600 font-bold">Origen</p>
                                <p className="text-sm text-slate-800">{selectedRoute.start}</p>
                            </div>

                            {/* Paradas */}
                            {selectedRoute.waypoints && selectedRoute.waypoints.map((wp, i) => (
                                <div key={i} className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-400 border-2 border-white shadow-sm"></div>
                                    <p className="text-xs text-blue-500 font-bold">Parada {i + 1}</p>
                                    <p className="text-sm text-slate-600">{wp}</p>
                                </div>
                            ))}

                            {/* Fin */}
                            <div className="relative">
                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
                                <p className="text-xs text-red-600 font-bold">Destino</p>
                                <p className="text-sm text-slate-800">{selectedRoute.end}</p>
                            </div>
                        </div>
                    </div>

                    {/* DATOS TÉCNICOS RESUMEN */}
                    {selectedRoute.technicalData && (
                        <div className="flex gap-4 text-xs bg-slate-50 p-3 rounded mb-4 border border-slate-200">
                            <div className="flex items-center gap-1"><Navigation className="w-3 h-3 text-slate-400"/> <strong>Distancia:</strong> {selectedRoute.technicalData.totalDistance} km</div>
                            <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400"/> <strong>Tiempo Est:</strong> {selectedRoute.technicalData.totalDuration} min</div>
                        </div>
                    )}

                    {/* MAPA VISUAL CON RUTA TRAZADA */}
                    <div className="w-full h-56 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative">
                         <MapContainer center={defaultCenter} zoom={11} style={{ height: "100%", width: "100%" }} zoomControl={false} dragging={true}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            
                            {/* DIBUJO DE RUTA SI EXISTE */}
                            {selectedRoute.technicalData?.geometry && (
                                <>
                                    <MapUpdater routeCoords={selectedRoute.technicalData.geometry} />
                                    <Polyline positions={selectedRoute.technicalData.geometry} color="#3b82f6" weight={4} />
                                    <Marker position={selectedRoute.technicalData.geometry[0]}><Popup>Inicio</Popup></Marker>
                                    <Marker position={selectedRoute.technicalData.geometry[selectedRoute.technicalData.geometry.length - 1]}><Popup>Fin</Popup></Marker>
                                </>
                            )}
                         </MapContainer>
                    </div>

                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end shrink-0">
                    <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition font-medium">Cerrar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}