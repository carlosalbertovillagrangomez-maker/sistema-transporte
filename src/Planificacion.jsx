import React, { useState, useEffect } from 'react';
import { Map, Plus, MoreVertical, ArrowRight, Clock, MapPin, X, Trash2, User, Search, Package, Loader2, Share2, Zap, Calendar } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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

// === COMPONENTE SIMPLE ===
const AddressAutocomplete = ({ label, value, onChange, placeholder, iconColor = "text-slate-400", zIndex = 50 }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleSearch = async (query) => {
        onChange(query);
        if (query.length < 3) {
            setSuggestions([]);
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=mx&limit=5`);
            const data = await response.json();
            setSuggestions(data);
            setShowSuggestions(true);
        } catch (error) {
            console.error("Error buscando dirección", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (address) => {
        onChange(address);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    return (
        <div className="relative" style={{ zIndex: zIndex }}> 
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${iconColor === 'green' ? 'bg-green-100 border-green-200' : iconColor === 'red' ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200'} border flex items-center justify-center shrink-0`}>
                    <MapPin className={`w-4 h-4 ${iconColor === 'green' ? 'text-green-700' : iconColor === 'red' ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 relative">
                    <input 
                        type="text" 
                        placeholder={placeholder}
                        className="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500"
                        value={value}
                        onChange={(e) => handleSearch(e.target.value)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {isLoading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />}
                </div>
            </div>
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-14 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map((item, index) => (
                        <li key={index} onClick={() => handleSelect(item.display_name)} className="px-3 py-2 text-xs text-slate-600 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0">
                            {item.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  
  const [newRoute, setNewRoute] = useState({ 
      client: '', 
      start: 'Centro de Distribución', 
      end: '', 
      driver: '', 
      status: 'Pendiente',
      serviceType: 'Prioritario', 
      scheduledDate: '',          
      scheduledTime: ''           
  });
  
  const [waypoints, setWaypoints] = useState([]);

  useEffect(() => {
    const conductoresGuardados = localStorage.getItem('mis_conductores_v2');
    if (conductoresGuardados) setAvailableDrivers(JSON.parse(conductoresGuardados));
  }, [showModal]);

  const [routesList, setRoutesList] = useState(() => {
    const saved = localStorage.getItem('mis_rutas');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('mis_rutas', JSON.stringify(routesList));
  }, [routesList]);

  const addWaypoint = () => setWaypoints([...waypoints, '']);
  const removeWaypoint = (index) => setWaypoints(waypoints.filter((_, i) => i !== index));
  const updateWaypoint = (index, val) => { const newWp = [...waypoints]; newWp[index] = val; setWaypoints(newWp); };

  const handleSaveRoute = () => {
      if(!newRoute.client || !newRoute.end || !newRoute.driver) return alert("Por favor completa Cliente, Destino y Conductor.");
      
      if(newRoute.serviceType === 'Programado' && (!newRoute.scheduledDate || !newRoute.scheduledTime)) {
          return alert("Para servicios programados, debes indicar Fecha y Hora.");
      }

      // DETERMINAR LA FECHA REAL DE GESTIÓN
      // Si es programado, usamos la fecha elegida. Si es Prioritario, usamos HOY.
      const today = new Date().toISOString().split('T')[0];
      const gestionDate = newRoute.serviceType === 'Programado' ? newRoute.scheduledDate : today;

      const nuevaRutaGuardada = {
          id: `RT-${Math.floor(Math.random() * 9000) + 1000}`,
          client: newRoute.client, 
          start: newRoute.start, 
          end: newRoute.end, 
          driver: newRoute.driver, 
          waypoints: waypoints.filter(w => w !== ''), 
          status: 'Asignado',
          serviceType: newRoute.serviceType,
          scheduledDate: newRoute.scheduledDate, // Fecha visual
          scheduledTime: newRoute.scheduledTime, // Hora visual
          
          // CAMPO CLAVE PARA ORDENAR EN EL MONITOR
          finalDate: gestionDate, 
          createdDate: today // Fecha de solicitud
      };

      setRoutesList([nuevaRutaGuardada, ...routesList]);
      setShowModal(false);
      setNewRoute({ client: '', start: 'Centro de Distribución', end: '', driver: '', status: 'Pendiente', serviceType: 'Prioritario', scheduledDate: '', scheduledTime: '' });
      setWaypoints([]);
  };

  const handleDeleteRoute = (id, e) => {
      e.stopPropagation();
      if(confirm("¿Eliminar esta ruta?")) setRoutesList(routesList.filter(r => r.id !== id));
  };

  const handleShare = (e, ruta) => {
      e.stopPropagation(); 
      const waypointsStr = ruta.waypoints && ruta.waypoints.length > 0 ? `&waypoints=${ruta.waypoints.join('|')}` : '';
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ruta.start)}&destination=${encodeURIComponent(ruta.end)}${waypointsStr}`;

      let tipoServicioTexto = "";
      if (ruta.serviceType === 'Prioritario') {
          tipoServicioTexto = "⚡ *SERVICIO PRIORITARIO - SALIDA INMEDIATA* ⚡";
      } else {
          tipoServicioTexto = `📅 *SERVICIO PROGRAMADO*\n🗓️ Fecha: ${ruta.scheduledDate}\n⏰ Hora: ${ruta.scheduledTime}`;
      }

      const text = `🚛 *NUEVA RUTA ASIGNADA*
${tipoServicioTexto}

👤 Conductor: ${ruta.driver}
📦 Cliente: ${ruta.client}

🟢 *Origen:* ${ruta.start}
🔴 *Destino:* ${ruta.end}
${ruta.waypoints.length > 0 ? `🛑 *Paradas:* ${ruta.waypoints.join(', ')}` : ''}

🗺️ *Link de Navegación:* ${googleMapsUrl}`;

      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2>
            <p className="text-slate-500 text-sm">Gestionando {routesList.length} entregas activas</p>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg transition hover:scale-105">
              <Plus className="w-4 h-4" /> Nueva Ruta
          </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
              {routesList.length === 0 && <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">No hay rutas planeadas hoy.</div>}
              {routesList.map((ruta) => (
                <div key={ruta.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group relative">
                    <div className="flex justify-between items-start mb-3">
                        {ruta.serviceType === 'Programado' ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
                                <Calendar className="w-3 h-3"/> {ruta.scheduledDate} • {ruta.scheduledTime}
                            </span>
                        ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1 animate-pulse">
                                <Zap className="w-3 h-3"/> PRIORITARIO
                            </span>
                        )}
                        <div className="flex gap-1">
                            <button onClick={(e) => handleShare(e, ruta)} title="Enviar por WhatsApp" className="text-green-600 hover:text-green-700 bg-green-50 p-1.5 rounded-md hover:bg-green-100 transition"><Share2 className="w-4 h-4" /></button>
                            <button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-slate-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-1">{ruta.client}</h4>
                    <p className="text-xs text-slate-500 mb-3 font-mono">{ruta.id}</p>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-600 text-xs bg-slate-50 p-2 rounded border border-slate-100"><MapPin className="w-3 h-3 text-green-600" /> <span className="truncate">De: {ruta.start}</span></div>
                        <div className="flex items-center gap-2 text-slate-600 text-xs bg-slate-50 p-2 rounded border border-slate-100"><MapPin className="w-3 h-3 text-red-600" /> <span className="truncate">A: {ruta.end}</span></div>
                        {ruta.driver && <div className="flex items-center gap-2 text-blue-600 text-xs font-bold mt-1 px-1"><User className="w-3 h-3" /> {ruta.driver}</div>}
                    </div>
                </div>
              ))}
          </div>
          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center">
             <MapContainer center={[19.4326, -99.1332]} zoom={12} zoomControl={false} dragging={true} style={{height: "100%", width: "100%"}}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[19.4326, -99.1332]}><Popup>Inicio: CDMX</Popup></Marker></MapContainer>
             <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000]"><h5 className="font-bold text-slate-800 text-sm mb-1">Nota:</h5><p className="text-xs text-slate-500">El autocompletado busca direcciones reales en México.</p></div>
          </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div><h3 className="text-lg font-bold text-slate-800">Planificar Nueva Ruta</h3><p className="text-xs text-slate-500">Complete los datos de origen, destino y asignación.</p></div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition"><X className="w-6 h-6" /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-lg">
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipo de Servicio</label>
                                <div className="flex gap-3 mb-3">
                                    <button onClick={() => setNewRoute({...newRoute, serviceType: 'Prioritario'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Prioritario' ? 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm ring-1 ring-orange-200' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}><Zap className="w-4 h-4" /> PRIORITARIO</button>
                                    <button onClick={() => setNewRoute({...newRoute, serviceType: 'Programado'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Programado' ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm ring-1 ring-blue-200' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}><Calendar className="w-4 h-4" /> PROGRAMADO</button>
                                </div>
                                {newRoute.serviceType === 'Programado' && (
                                    <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100 animate-[fadeIn_0.3s_ease-out]">
                                        <div><label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Fecha</label><input type="date" className="w-full bg-white border border-blue-200 rounded-lg p-2 text-xs text-slate-700 outline-none" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} /></div>
                                        <div><label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Hora</label><input type="time" className="w-full bg-white border border-blue-200 rounded-lg p-2 text-xs text-slate-700 outline-none" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} /></div>
                                    </div>
                                )}
                            </div>
                            <hr className="border-slate-100" />
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente / Pedido</label><div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg p-2"><Package className="w-4 h-4 text-slate-400"/><input type="text" placeholder="Ej. Entrega Walmart..." className="bg-transparent outline-none text-sm w-full" value={newRoute.client} onChange={(e) => setNewRoute({...newRoute, client: e.target.value})} /></div></div>
                            <div className="relative"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Itinerario</label><div className="space-y-3 relative"><div className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-slate-200 -z-10"></div><AddressAutocomplete placeholder="Punto de Inicio..." value={newRoute.start} onChange={(val) => setNewRoute({...newRoute, start: val})} iconColor="green" zIndex={50} />{waypoints.map((wp, index) => (<div key={index} className="flex gap-2 relative" style={{ zIndex: 40 - index }}><div className="flex-1"><AddressAutocomplete placeholder="Parada intermedia..." value={wp} onChange={(val) => updateWaypoint(index, val)} iconColor="blue" zIndex={40 - index} /></div><button onClick={() => removeWaypoint(index)} className="mt-2 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>))}<div className="pl-[52px]"><button onClick={addWaypoint} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50 transition border border-dashed border-blue-200 bg-white w-full justify-center"><Plus className="w-3 h-3" /> Agregar Parada</button></div><AddressAutocomplete placeholder="Destino final..." value={newRoute.end} onChange={(val) => setNewRoute({...newRoute, end: val})} iconColor="red" zIndex={10} /></div></div>
                            <hr className="border-slate-100" /><div className="relative z-0"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Asignar Conductor</label><select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5 outline-none focus:border-blue-500" value={newRoute.driver} onChange={(e) => setNewRoute({...newRoute, driver: e.target.value})}><option value="">Seleccionar Conductor...</option>{availableDrivers.length > 0 ? (availableDrivers.map((driver) => (<option key={driver.id} value={driver.name}>{driver.name} - {driver.vehicle}</option>))) : (<option disabled>No hay conductores registrados</option>)}</select></div>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-100 relative"><MapContainer center={[19.4200, -99.1500]} zoom={13} style={{ height: "100%", width: "100%" }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[19.4326, -99.1332]}><Popup>Inicio: CDMX</Popup></Marker></MapContainer><div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000]"><h5 className="font-bold text-slate-800 text-sm mb-1">Nota:</h5><p className="text-xs text-slate-500">El autocompletado busca direcciones reales en México.</p></div></div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0"><button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button><button onClick={handleSaveRoute} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg flex items-center gap-2 transition"><Map className="w-4 h-4" /> Confirmar y Guardar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}