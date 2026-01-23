import React, { useState } from 'react';
import { Map, Plus, MoreVertical, ArrowRight, Clock, MapPin, X, Trash2, User, Search } from 'lucide-react';
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

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [waypoints, setWaypoints] = useState([]);

  // Coordenadas simuladas
  const startPoint = [19.4326, -99.1332]; 
  const endPoint = [19.4000, -99.1800];   
  const routeLine = [
    [19.4326, -99.1332],
    [19.4200, -99.1500], 
    [19.4000, -99.1800]
  ];

  const addWaypoint = () => {
    setWaypoints([...waypoints, '']);
  };

  const removeWaypoint = (index) => {
    const newWaypoints = waypoints.filter((_, i) => i !== index);
    setWaypoints(newWaypoints);
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2>
            <p className="text-slate-500 text-sm">Asignación de pedidos para mañana, 24 Ene</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-900/20 transition hover:scale-105"
          >
              <Plus className="w-4 h-4" /> Nueva Ruta
          </button>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex gap-6 overflow-hidden">
          {/* LISTA DE PEDIDOS */}
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                      <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded">Pendiente</span>
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-slate-800">Entrega: Supermercados del Norte</h4>
                  <div className="flex items-center gap-2 text-slate-600 text-sm bg-slate-50 p-2 rounded border border-slate-100 mt-2">
                      <MapPin className="w-4 h-4 text-slate-400" /> Av. Reforma #123
                  </div>
              </div>
              
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                      <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded">Pendiente</span>
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-slate-800">Recolección: Fábrica Textil</h4>
                  <div className="flex items-center gap-2 text-slate-600 text-sm bg-slate-50 p-2 rounded border border-slate-100 mt-2">
                      <MapPin className="w-4 h-4 text-slate-400" /> Parque Industrial Norte
                  </div>
              </div>
          </div>

          {/* MAPA GENERAL DE FONDO */}
          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center">
             <MapContainer center={[19.4326, -99.1332]} zoom={12} zoomControl={false} dragging={false} scrollWheelZoom={false} style={{height: "100%", width: "100%", opacity: 0.6}}>
                 <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
             </MapContainer>
             
             {/* CORRECCIÓN AQUÍ: Cambiamos z-[400] por z-10 para que se quede atrás */}
             <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-sm z-10">
                <div className="text-center opacity-80">
                    <Map className="w-16 h-16 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-800 font-bold">Selecciona "+ Nueva Ruta" para comenzar</p>
                </div>
             </div>
          </div>
      </div>

      {/* ================= MODAL DE NUEVA RUTA ================= */}
      {showModal && (
        // CORRECCIÓN AQUÍ: Agregamos z-[9999] para que esté SUPER ARRIBA de todo
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header Modal */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Crear Ruta Optimizada</h3>
                        <p className="text-xs text-slate-500">El sistema calculará la ruta más eficiente automáticamente.</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body Modal */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* COLUMNA IZQUIERDA */}
                    <div className="w-1/3 p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-lg">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Puntos de Ruta</label>
                                <div className="space-y-3 relative">
                                    <div className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-slate-200 -z-10"></div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0 z-10">
                                            <span className="text-green-700 font-bold text-xs">A</span>
                                        </div>
                                        <input type="text" placeholder="Punto de Inicio..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500" defaultValue="Centro de Distribución" />
                                    </div>
                                    {waypoints.map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]">
                                            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 z-10">
                                                <span className="text-blue-600 font-bold text-xs">{index + 1}</span>
                                            </div>
                                            <input type="text" placeholder="Parada intermedia..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500" />
                                            <button onClick={() => removeWaypoint(index)} className="text-slate-400 hover:text-red-500 transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="pl-[52px]">
                                        <button onClick={addWaypoint} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50 transition border border-dashed border-blue-200 bg-white w-full justify-center">
                                            <Plus className="w-3 h-3" /> Agregar Parada
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center shrink-0 z-10">
                                            <MapPin className="w-4 h-4 text-red-600" />
                                        </div>
                                        <input type="text" placeholder="Punto Final..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500" defaultValue="Cliente Zona Sur" />
                                    </div>
                                </div>
                            </div>
                            <hr className="border-slate-100" />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Asignar Conductor</label>
                                <select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block w-full p-2.5">
                                    <option>Seleccionar Conductor...</option>
                                    <option>Juan Pérez (Hino 300)</option>
                                    <option>Carlos Ruiz (Nissan NV)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA DERECHA */}
                    <div className="flex-1 bg-slate-100 relative">
                        <MapContainer center={[19.4200, -99.1500]} zoom={13} style={{ height: "100%", width: "100%" }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <Marker position={startPoint}><Popup>Inicio: CEDIS</Popup></Marker>
                            <Marker position={endPoint}><Popup>Fin: Cliente Sur</Popup></Marker>
                            <Polyline positions={routeLine} color="#3b82f6" weight={5} opacity={0.7} dashArray="10, 10" />
                        </MapContainer>
                        
                        <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000] animate-[slideUp_0.3s_ease-out]">
                            <h5 className="font-bold text-slate-800 text-sm mb-1">Ruta Calculada</h5>
                            <p className="text-xs text-slate-500 mb-2">Distancia: 12.5 km • Tiempo: 45 min</p>
                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{width: '100%'}}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                <span>Tráfico: Fluido</span>
                                <span className="text-green-600 font-bold">Óptimo</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Modal */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                        Cancelar
                    </button>
                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center gap-2 transition">
                        <Map className="w-4 h-4" /> Confirmar y Asignar
                    </button>
                </div>

            </div>
        </div>
      )}
    </div>
  );
}