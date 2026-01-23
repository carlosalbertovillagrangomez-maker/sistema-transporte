import React, { useState } from 'react';
import { Map, Plus, MoreVertical, ArrowRight, Clock, MapPin, X, Trash2, User, Search } from 'lucide-react';

export default function Planificacion() {
  // Estado para controlar el Modal
  const [showModal, setShowModal] = useState(false);
  
  // Estado para los puntos intermedios (Waypoints)
  const [waypoints, setWaypoints] = useState([]);

  // Función para agregar un punto intermedio vacío
  const addWaypoint = () => {
    setWaypoints([...waypoints, '']);
  };

  // Función para eliminar un punto intermedio específico
  const removeWaypoint = (index) => {
    const newWaypoints = waypoints.filter((_, i) => i !== index);
    setWaypoints(newWaypoints);
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      
      {/* === HEADER === */}
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2>
            <p className="text-slate-500 text-sm">Asignación de pedidos para mañana, 24 Ene</p>
          </div>
          {/* BOTÓN QUE ABRE EL MODAL */}
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-900/20 transition hover:scale-105"
          >
              <Plus className="w-4 h-4" /> Nueva Ruta
          </button>
      </div>

      {/* === CONTENIDO PRINCIPAL (FONDO) === */}
      <div className="flex-1 flex gap-6 overflow-hidden">
          {/* COLUMNA IZQUIERDA: LISTA */}
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
              {/* Tarjeta 1 */}
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
              {/* Tarjeta 2 */}
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

          {/* COLUMNA DERECHA: MAPA FONDO */}
          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                <div className="text-center opacity-50">
                    <Map className="w-16 h-16 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-500 font-medium">Selecciona "+ Nueva Ruta" para comenzar</p>
                </div>
          </div>
      </div>

      {/* ================= MODAL DE NUEVA RUTA ================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header Modal */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Crear Ruta Optimizada</h3>
                        <p className="text-xs text-slate-500">El sistema calculará la ruta más eficiente automáticamente.</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body Modal (Grid de 2 Columnas) */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* COLUMNA IZQUIERDA: FORMULARIO */}
                    <div className="w-1/3 p-6 overflow-y-auto border-r border-slate-100 bg-white">
                        
                        <div className="space-y-6">
                            {/* 1. Puntos de Ruta */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Puntos de Ruta</label>
                                <div className="space-y-3 relative">
                                    {/* Línea conectora visual */}
                                    <div className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-slate-200 -z-10"></div>

                                    {/* Input Inicio */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0 z-10">
                                            <span className="text-green-700 font-bold text-xs">A</span>
                                        </div>
                                        <input type="text" placeholder="Punto de Inicio..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>

                                    {/* Puntos Intermedios Dinámicos */}
                                    {waypoints.map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]">
                                            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 z-10">
                                                <span className="text-blue-600 font-bold text-xs">{index + 1}</span>
                                            </div>
                                            <input type="text" placeholder="Parada intermedia..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                                            <button onClick={() => removeWaypoint(index)} className="text-slate-400 hover:text-red-500 transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Botón Agregar Parada */}
                                    <div className="pl-[52px]">
                                        <button onClick={addWaypoint} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50 transition border border-dashed border-blue-200 bg-white w-full justify-center">
                                            <Plus className="w-3 h-3" /> Agregar Parada
                                        </button>
                                    </div>

                                    {/* Input Final */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center shrink-0 z-10">
                                            <MapPin className="w-4 h-4 text-red-600" />
                                        </div>
                                        <input type="text" placeholder="Punto Final..." className="flex-1 bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* 2. Asignación de Chofer */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Asignar Conductor</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                        <User className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5">
                                        <option>Seleccionar Conductor...</option>
                                        <option>Juan Pérez (Hino 300)</option>
                                        <option>Carlos Ruiz (Nissan NV)</option>
                                        <option>Mario Rosas (Disponible)</option>
                                    </select>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded border border-green-100">
                                    <Clock className="w-3 h-3" />
                                    <span>Tiempo estimado de ruta: <strong>4h 25m</strong></span>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* COLUMNA DERECHA: MAPA GOOGLE */}
                    <div className="flex-1 bg-slate-100 relative group overflow-hidden">
                        
                        {/* Etiqueta de Google Maps */}
                        <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
                             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Google_Maps_icon_%282020%29.svg/1200px-Google_Maps_icon_%282020%29.svg.png" className="w-4 h-4" alt="G" />
                             Vista Previa de Optimización
                        </div>

                        {/* Patrón de Mapa Simulado */}
                        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
                        
                        {/* SVG Rutas Simuladas */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            {/* Ruta Azul (Optimizada) */}
                            <path d="M100,100 C200,100 150,300 300,300 S 500,150 600,200" fill="none" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" className="drop-shadow-lg" strokeDasharray="10 5" />
                            
                            {/* Puntos en el mapa */}
                            <circle cx="100" cy="100" r="8" fill="#22c55e" stroke="white" strokeWidth="3" /> {/* Inicio */}
                            <circle cx="300" cy="300" r="6" fill="#3b82f6" stroke="white" strokeWidth="2" /> {/* Parada 1 */}
                            <circle cx="600" cy="200" r="8" fill="#ef4444" stroke="white" strokeWidth="3" /> {/* Fin */}
                        </svg>
                        
                        {/* Tarjeta Flotante de Detalles en el Mapa */}
                        <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs animate-bounce-slow">
                            <h5 className="font-bold text-slate-800 text-sm mb-1">Ruta Optimizada</h5>
                            <p className="text-xs text-slate-500 mb-2">Se ahorraron 12km reordenando las paradas.</p>
                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{width: '85%'}}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                <span>Eficiencia</span>
                                <span>98%</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer Modal */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                        Cancelar
                    </button>
                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center gap-2 transition">
                        <Map className="w-4 h-4" /> Confirmar y Asignar Ruta
                    </button>
                </div>

            </div>
        </div>
      )}
    </div>
  );
}