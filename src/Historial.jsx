import React, { useState } from 'react';
import { FileSpreadsheet, Calendar, ArrowUp, X, MapPin, User, Clock, Building } from 'lucide-react';

export default function Historial() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-50 h-full">
      
      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
              <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400"><Calendar className="w-4 h-4"/></span>
                  <input type="text" value="01/12/2025 - 31/12/2025" readOnly className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block pl-10 p-2.5 w-64 cursor-pointer" />
              </div>
              <select className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg block p-2.5 w-56">
                  <option>Todos los Conductores</option>
                  <option>Juan Pérez</option>
                  <option>Carlos Ruiz</option>
              </select>
          </div>
          <button className="bg-green-700 hover:bg-green-800 text-white font-medium rounded-lg text-sm px-5 py-2.5 flex items-center gap-2 transition">
              <FileSpreadsheet className="w-4 h-4"/> Exportar a Excel
          </button>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-medium text-slate-500 mb-1">Total Viajes</p>
              <h3 className="text-3xl font-bold text-slate-800">1,245</h3>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-medium text-slate-500 mb-1">Tasa de Completado</p>
              <div className="flex items-center gap-2">
                  <h3 className="text-3xl font-bold text-slate-800">98%</h3>
                  <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ArrowUp className="w-3 h-3"/> 2.5%
                  </span>
              </div>
          </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase text-xs">
                  <tr>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">ID Ruta</th>
                      <th className="px-6 py-4">Conductor</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Duración</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {/* Fila 1 */}
                  <tr className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">30/12/2025</td>
                      <td className="px-6 py-4 font-mono text-slate-500">#400</td>
                      <td className="px-6 py-4 font-medium text-slate-800">Juan Pérez</td>
                      <td className="px-6 py-4">
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span> Completado
                          </span>
                      </td>
                      <td className="px-6 py-4">45 min</td>
                      <td className="px-6 py-4 text-right">
                          <button onClick={() => setShowModal(true)} className="text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition text-xs font-medium">Ver Detalles</button>
                      </td>
                  </tr>
                  {/* Fila 2 */}
                  <tr className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">30/12/2025</td>
                      <td className="px-6 py-4 font-mono text-slate-500">#399</td>
                      <td className="px-6 py-4 font-medium text-slate-800">Carlos Ruiz</td>
                      <td className="px-6 py-4">
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span> Completado
                          </span>
                      </td>
                      <td className="px-6 py-4">38 min</td>
                      <td className="px-6 py-4 text-right">
                          <button className="text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1 rounded hover:bg-slate-50 transition text-xs">Ver Detalles</button>
                      </td>
                  </tr>
              </tbody>
          </table>
      </div>

      {/* MODAL / POP UP */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                
                {/* Header Modal */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">Detalles del Viaje #400</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body Modal */}
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    
                    {/* Datos Clave */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-500 uppercase font-bold mb-1">Chofer</p>
                            <p className="font-bold text-slate-800 flex items-center gap-2">
                                <User className="w-4 h-4"/> Juan Pérez
                            </p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Cliente</p>
                            <p className="font-bold text-slate-800 flex items-center gap-2">
                                <Building className="w-4 h-4"/> Tech Solutions
                            </p>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">Inicio</p>
                            <p className="font-bold text-slate-800">08:00 AM</p>
                        </div>
                        <div className="flex-1 px-4 flex flex-col items-center">
                            <div className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full mb-1">
                                <Clock className="w-3 h-3"/> 45 min
                            </div>
                            <div className="w-full h-1 bg-slate-200 rounded-full relative">
                                <div className="absolute w-full h-1 bg-blue-500 rounded-full"></div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">Fin</p>
                            <p className="font-bold text-slate-800">08:45 AM</p>
                        </div>
                    </div>

                    {/* Mapa Simulado */}
                    <div className="w-full h-40 bg-slate-200 rounded-xl relative overflow-hidden mb-4 border border-slate-300">
                         <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                         <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <span className="bg-white/80 px-3 py-1 rounded-full text-xs font-bold shadow flex items-center gap-2 text-slate-600">
                                <MapPin className="text-red-500 w-4 h-4"/> Vista de Mapa
                            </span>
                         </div>
                    </div>

                </div>

                <div className="bg-slate-50 px-6 py-4 flex justify-end">
                    <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition font-medium">Cerrar</button>
                </div>

            </div>
        </div>
      )}
    </div>
  );
}