import React, { useState, useEffect } from 'react';
import { Map, Plus, MapPin, X, Trash2, User, Package, Loader2, Share2, Zap, Calendar, Navigation, ArrowDown, Star, Building, Briefcase } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Componente para centrar el mapa automáticamente
function MapUpdater({ routeCoords, center }) {
    const map = useMap();
    useEffect(() => {
        if (routeCoords && routeCoords.length > 0) {
            const bounds = L.latLngBounds(routeCoords);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (center) {
            map.flyTo(center, 13);
        }
    }, [routeCoords, center, map]);
    return null;
}

// Componente de Autocompletado
const AddressAutocomplete = ({ value, onSelect, placeholder, iconColor = "text-slate-400", zIndex = 50, favorites = [] }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');

    useEffect(() => { setInputValue(value || ''); }, [value]);

    const handleSearch = async (query) => {
        setInputValue(query);
        if (query.length < 3) { setSuggestions([]); return; }
        setIsLoading(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=mx&limit=5&addressdetails=1`);
            const data = await response.json();
            setSuggestions(data);
            setShowSuggestions(true);
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };

    const handleSelection = (item) => {
        setInputValue(item.display_name);
        onSelect({ address: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleFavoriteClick = (fav) => {
        setInputValue(fav.address);
        onSelect({ address: fav.address, lat: parseFloat(fav.lat), lon: parseFloat(fav.lon) });
        setShowSuggestions(false);
    };

    return (
        <div className="relative" style={{ zIndex: zIndex }}> 
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${iconColor === 'green' ? 'bg-green-100 border-green-200' : iconColor === 'red' ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200'} border flex items-center justify-center shrink-0`}>
                    <MapPin className={`w-4 h-4 ${iconColor === 'green' ? 'text-green-700' : iconColor === 'red' ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 relative">
                    <input type="text" placeholder={placeholder} className="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500 focus:bg-white transition"
                        value={inputValue} onChange={(e) => handleSearch(e.target.value)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
                    {isLoading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />}
                </div>
            </div>
            {favorites && favorites.length > 0 && (
                <div className="pl-[52px] mt-2 flex flex-wrap gap-2">
                    {favorites.map((fav, i) => (
                        <button key={i} onClick={() => handleFavoriteClick(fav)} className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100 flex items-center gap-1 transition shadow-sm whitespace-nowrap">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-500"/> <span className="font-bold">{fav.alias}</span>
                        </button>
                    ))}
                </div>
            )}
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-14 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-48 overflow-y-auto ring-1 ring-black/5 z-[100]">
                    {suggestions.map((item, index) => (
                        <li key={index} onClick={() => handleSelection(item)} className="px-3 py-2 text-xs text-slate-600 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0">
                            <span className="font-bold block text-slate-800">{item.address.road || item.display_name.split(',')[0]}</span>
                            <span className="block truncate opacity-70">{item.display_name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const SegmentInfo = ({ distance, duration }) => {
    if (!distance) return <div className="pl-[19px] py-1"><div className="w-0.5 h-4 bg-slate-200 ml-0.5"></div></div>;
    return (
        <div className="pl-[20px] py-2 flex items-center relative z-0">
            <div className="w-0.5 h-full absolute left-[21px] top-0 bottom-0 bg-slate-200 -z-10"></div>
            <div className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-500 flex items-center gap-2 shadow-sm ml-4">
                <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3"/> Tramo:</span>
                <span className="font-bold text-slate-700">{distance} km</span><span className="text-slate-300">|</span><span className="font-bold text-green-600">{duration} min</span>
            </div>
        </div>
    );
};

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableClients, setAvailableClients] = useState([]);
  
  // ESTADO DE VISUALIZACIÓN DE RUTA EN EL MAPA PRINCIPAL
  const [viewRoute, setViewRoute] = useState(null);

  const [newRoute, setNewRoute] = useState({ client: '', requestUser: '', driver: '', status: 'Pendiente', serviceType: 'Prioritario', scheduledDate: '', scheduledTime: '' });
  const [selectedClientData, setSelectedClientData] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [routeInfo, setRouteInfo] = useState({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  useEffect(() => {
    const conductores = localStorage.getItem('mis_conductores_v2');
    if (conductores) setAvailableDrivers(JSON.parse(conductores));
    const clientes = localStorage.getItem('mis_clientes');
    if (clientes) setAvailableClients(JSON.parse(clientes));
  }, []);

  const [routesList, setRoutesList] = useState(() => {
    const saved = localStorage.getItem('mis_rutas');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => { localStorage.setItem('mis_rutas', JSON.stringify(routesList)); }, [routesList]);

  const handleClientChange = (e) => {
      const clientName = e.target.value;
      const clientObj = availableClients.find(c => c.name === clientName);
      setSelectedClientData(clientObj || null);
      setNewRoute({ ...newRoute, client: clientName, requestUser: '' });
  };

  useEffect(() => { if (startPoint && endPoint) calculateMultiLegRoute(); }, [startPoint, endPoint, waypoints]);

  const calculateMultiLegRoute = async () => {
      setIsLoadingRoute(true);
      try {
          const points = [startPoint, ...waypoints, endPoint];
          const validPoints = points.filter(p => p && p.lat && p.lon);
          if (validPoints.length < 2) return;
          const coordsString = validPoints.map(p => `${p.lon},${p.lat}`).join(';');
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=true`);
          const data = await response.json();
          if (data.code === 'Ok' && data.routes.length > 0) {
              const ruta = data.routes[0];
              const segmentsData = ruta.legs.map(leg => ({ distance: (leg.distance / 1000).toFixed(1), duration: Math.round(leg.duration / 60) }));
              const geometry = ruta.geometry.coordinates.map(c => [c[1], c[0]]);
              setRouteInfo({ totalDistance: (ruta.distance / 1000).toFixed(1), totalDuration: Math.round(ruta.duration / 60), segments: segmentsData, geometry: geometry });
          }
      } catch (error) { console.error("Error ruta:", error); } finally { setIsLoadingRoute(false); }
  };

  const addWaypoint = () => setWaypoints([...waypoints, { address: '', lat: null, lon: null }]);
  const removeWaypoint = (index) => setWaypoints(waypoints.filter((_, i) => i !== index));
  const updateWaypoint = (index, item) => { const newWp = [...waypoints]; newWp[index] = item; setWaypoints(newWp); };

  const handleSaveRoute = () => {
      if(!newRoute.client || !endPoint || !newRoute.driver) return alert("Faltan datos.");
      if(newRoute.serviceType === 'Programado' && (!newRoute.scheduledDate || !newRoute.scheduledTime)) return alert("Indica Fecha y Hora.");
      
      const today = new Date().toISOString().split('T')[0];
      const nuevaRuta = {
          id: `RT-${Math.floor(Math.random() * 9000) + 1000}`,
          ...newRoute,
          start: startPoint.address,
          end: endPoint.address,
          waypoints: waypoints.map(w => w.address),
          // AQUÍ GUARDAMOS LA GEOMETRÍA PARA PODER DIBUJARLA DESPUÉS
          technicalData: { 
              segments: routeInfo.segments, 
              totalDistance: routeInfo.totalDistance, 
              totalDuration: routeInfo.totalDuration,
              geometry: routeInfo.geometry // <--- ESTO ES CRUCIAL
          },
          finalDate: newRoute.serviceType === 'Programado' ? newRoute.scheduledDate : today,
          createdDate: today
      };
      setRoutesList([nuevaRuta, ...routesList]);
      setShowModal(false);
      setNewRoute({ client: '', requestUser: '', driver: '', status: 'Pendiente', serviceType: 'Prioritario', scheduledDate: '', scheduledTime: '' });
      setStartPoint(null); setEndPoint(null); setWaypoints([]); setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] }); setSelectedClientData(null);
  };

  const handleDeleteRoute = (id, e) => { e.stopPropagation(); if(confirm("¿Eliminar?")) setRoutesList(routesList.filter(r => r.id !== id)); };
  const handleShare = (e, ruta) => { e.stopPropagation(); window.open(`https://wa.me/?text=${encodeURIComponent(`🚛 Ruta: ${ruta.client} (${ruta.technicalData?.totalDistance} km)`)}`, '_blank'); };

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2><p className="text-slate-500 text-sm">{routesList.length} entregas activas</p></div>
          <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg"><Plus className="w-4 h-4" /> Nueva Ruta</button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
              {routesList.map((ruta) => (
                <div 
                    key={ruta.id} 
                    onClick={() => setViewRoute(ruta)} // AL HACER CLIC, MOSTRAMOS RUTA
                    className={`bg-white p-4 rounded-xl shadow-sm border transition cursor-pointer group ${viewRoute?.id === ruta.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:shadow-md'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                         {ruta.serviceType === 'Prioritario' ? <span className="text-[10px] font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1 animate-pulse"><Zap className="w-3 h-3"/> PRIORITARIO</span> : <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1"><Calendar className="w-3 h-3"/> {ruta.scheduledDate}</span>}
                         <div className="flex gap-1"><button onClick={(e) => handleShare(e, ruta)} className="text-green-600 bg-green-50 p-1.5 rounded hover:bg-green-100"><Share2 className="w-4 h-4"/></button><button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-red-400 bg-red-50 p-1.5 rounded hover:bg-red-100"><Trash2 className="w-4 h-4"/></button></div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-0.5">{ruta.client}</h4>
                    {ruta.requestUser && <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><User className="w-3 h-3"/> Solicitó: {ruta.requestUser}</p>}
                    <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-green-600" /> <span className="truncate">{ruta.start.split(',')[0]}</span></div>
                        {ruta.technicalData?.segments?.length > 0 && <div className="pl-2 border-l-2 border-slate-100 ml-1.5 space-y-1">{ruta.technicalData.segments.map((seg, idx) => (<div key={idx} className="text-[10px] text-slate-400 flex justify-between"><span>Tramo {idx + 1}</span><span className="font-mono text-slate-600">{seg.distance}km</span></div>))}</div>}
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-red-600" /> <span className="truncate">{ruta.end.split(',')[0]}</span></div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-50 flex justify-between text-xs font-bold text-slate-500"><span>Total: {ruta.technicalData?.totalDistance} km</span><span>{ruta.technicalData?.totalDuration} min</span></div>
                </div>
              ))}
          </div>

          {/* MAPA PRINCIPAL INTERACTIVO */}
          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center">
             <MapContainer center={[19.4326, -99.1332]} zoom={12} style={{height: "100%", width: "100%"}}>
                 <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                 
                 {/* Si hay una ruta seleccionada, la dibujamos */}
                 {viewRoute && viewRoute.technicalData?.geometry && (
                     <>
                        <MapUpdater routeCoords={viewRoute.technicalData.geometry} />
                        <Polyline positions={viewRoute.technicalData.geometry} color="#3b82f6" weight={5} />
                        {/* Marcador Inicio (usamos primera coord) */}
                        <Marker position={viewRoute.technicalData.geometry[0]}><Popup>Inicio: {viewRoute.start}</Popup></Marker>
                        {/* Marcador Fin (usamos ultima coord) */}
                        <Marker position={viewRoute.technicalData.geometry[viewRoute.technicalData.geometry.length - 1]}><Popup>Fin: {viewRoute.end}</Popup></Marker>
                     </>
                 )}
             </MapContainer>
             {!viewRoute && (
                 <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000]">
                    <h5 className="font-bold text-slate-800 text-sm mb-1">Mapa General</h5>
                    <p className="text-xs text-slate-500">Haz clic en una ruta de la lista para ver su trazado en el mapa.</p>
                 </div>
             )}
          </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div><h3 className="text-lg font-bold text-slate-800">Planificar Ruta</h3><p className="text-xs text-slate-500">Calculadora de logística avanzada.</p></div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X className="w-6 h-6" /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-lg relative">
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipo de Servicio</label>
                                <div className="flex gap-3 mb-3"><button onClick={() => setNewRoute({...newRoute, serviceType: 'Prioritario'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Prioritario' ? 'bg-orange-50 border-orange-200 text-orange-700 ring-1 ring-orange-200' : 'bg-white border-slate-200 text-slate-400'}`}><Zap className="w-4 h-4" /> PRIORITARIO</button><button onClick={() => setNewRoute({...newRoute, serviceType: 'Programado'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Programado' ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200' : 'bg-white border-slate-200 text-slate-400'}`}><Calendar className="w-4 h-4" /> PROGRAMADO</button></div>{newRoute.serviceType === 'Programado' && (<div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100"><input type="date" className="w-full bg-white border border-blue-200 rounded p-2 text-xs" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} /><input type="time" className="w-full bg-white border border-blue-200 rounded p-2 text-xs" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} /></div>)}
                            </div>
                            <hr className="border-slate-100" />
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Cliente / Empresa</label>
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded p-2 mt-1">{selectedClientData?.type === 'Empresa' ? <Building className="w-4 h-4 text-blue-500"/> : <User className="w-4 h-4 text-slate-400"/>}<select className="bg-transparent text-sm w-full outline-none" value={newRoute.client} onChange={handleClientChange}><option value="">Seleccionar Cliente...</option>{availableClients.map(c => <option key={c.id} value={c.name}>{c.name} ({c.type})</option>)}</select></div>
                                {selectedClientData?.type === 'Empresa' && selectedClientData.users?.length > 0 && (<div className="mt-2 ml-6 animate-[fadeIn_0.3s_ease-out]"><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Solicitado por:</label><div className="flex items-center gap-2 border-b border-slate-200 pb-1"><Briefcase className="w-3 h-3 text-slate-400"/><select className="bg-transparent text-xs w-full outline-none text-slate-700" value={newRoute.requestUser} onChange={(e) => setNewRoute({...newRoute, requestUser: e.target.value})}><option value="">-- Seleccionar contacto --</option>{selectedClientData.users.map((u, i) => (<option key={i} value={u.name}>{u.name} ({u.role})</option>))}</select></div></div>)}
                            </div>
                            <div className="relative pt-2">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Itinerario</label>
                                <AddressAutocomplete placeholder="Punto de Inicio..." value={startPoint?.address} onSelect={setStartPoint} iconColor="green" zIndex={50} favorites={selectedClientData?.locations} />
                                <SegmentInfo distance={routeInfo.segments[0]?.distance} duration={routeInfo.segments[0]?.duration} />
                                {waypoints.map((wp, index) => (<div key={index} className="relative" style={{ zIndex: 40 - index }}><div className="flex gap-2"><div className="flex-1"><AddressAutocomplete placeholder={`Parada ${index + 1}...`} value={wp.address} onSelect={(item) => updateWaypoint(index, item)} iconColor="blue" zIndex={40 - index} favorites={selectedClientData?.locations} /></div><button onClick={() => removeWaypoint(index)} className="mt-2 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div><SegmentInfo distance={routeInfo.segments[index + 1]?.distance} duration={routeInfo.segments[index + 1]?.duration} /></div>))}
                                <div className="pl-[20px] pb-2 relative z-0"><div className="absolute left-[21px] top-0 bottom-0 w-0.5 bg-slate-200 -z-10"></div><button onClick={addWaypoint} className="ml-4 text-xs text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3"/> Agregar Parada</button></div>
                                <AddressAutocomplete placeholder="Destino Final..." value={endPoint?.address} onSelect={setEndPoint} iconColor="red" zIndex={10} favorites={selectedClientData?.locations} />
                            </div>
                            <hr className="border-slate-100 mt-4" />
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Conductor</label><select className="w-full mt-1 bg-slate-50 border border-slate-300 rounded p-2 text-sm" value={newRoute.driver} onChange={e => setNewRoute({...newRoute, driver: e.target.value})}><option value="">Seleccionar...</option>{availableDrivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select></div>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-100 relative"><MapContainer center={[19.42, -99.15]} zoom={12} style={{height: "100%", width: "100%"}}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapUpdater routeCoords={routeInfo.geometry} center={startPoint ? [startPoint.lat, startPoint.lon] : null} />{startPoint && <Marker position={[startPoint.lat, startPoint.lon]}><Popup>Inicio</Popup></Marker>}{endPoint && <Marker position={[endPoint.lat, endPoint.lon]}><Popup>Fin</Popup></Marker>}{routeInfo.geometry.length > 0 && <Polyline positions={routeInfo.geometry} color="#3b82f6" weight={5} />}</MapContainer><div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000]"><h5 className="font-bold text-slate-800 text-sm mb-2">Resumen Total</h5>{isLoadingRoute ? <div className="text-xs text-blue-500 flex gap-2"><Loader2 className="animate-spin w-3 h-3"/> Calculando...</div> : routeInfo.totalDistance > 0 ? (<div><div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Distancia:</span> <b>{routeInfo.totalDistance} km</b></div><div className="flex justify-between text-sm"><span className="text-slate-500">Tiempo:</span> <b className="text-green-600">{routeInfo.totalDuration} min</b></div></div>) : <p className="text-xs text-slate-400">Define la ruta para ver el cálculo.</p>}</div></div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0"><button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 border rounded hover:bg-slate-50">Cancelar</button><button onClick={handleSaveRoute} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded hover:bg-blue-700 shadow flex items-center gap-2"><Navigation className="w-4 h-4"/> Confirmar Ruta</button></div>
            </div>
        </div>
      )}
    </div>
  );
}