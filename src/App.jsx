import React, { useState } from 'react';
import { Truck, Monitor, Map, Users, FileText, Bell, Maximize, AlertTriangle, X, Car } from 'lucide-react';

// === IMPORTAMOS TODAS LAS PÁGINAS ===
import Historial from './Historial';
import Planificacion from './Planificacion';
import Conductores from './Conductores';

function App() {
  const [activeTab, setActiveTab] = useState('monitoreo');

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      
      {/* === SIDEBAR IZQUIERDO === */}
      <aside className="w-64 bg-slate-800 text-gray-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Truck className="text-blue-500 w-6 h-6" />
            <span>Despacho</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* Botón 1: Monitor */}
          <button 
            onClick={() => setActiveTab('monitoreo')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'monitoreo' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}
          >
            <Monitor className="w-5 h-5" />
            <span className="font-medium">Monitor en Vivo</span>
          </button>

          {/* Botón 2: Planificación */}
          <button 
            onClick={() => setActiveTab('planificacion')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'planificacion' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}
          >
            <Map className="w-5 h-5" />
            <span>Planificación</span>
          </button>

          {/* Botón 3: Conductores */}
          <button 
             onClick={() => setActiveTab('conductores')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'conductores' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
            <span>Conductores</span>
          </button>

          {/* Botón 4: Reportes */}
          <button 
             onClick={() => setActiveTab('reportes')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'reportes' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}
          >
            <FileText className="w-5 h-5" />
            <span>Reportes</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">v1.0 • React System</p>
        </div>
      </aside>

      {/* === CONTENIDO PRINCIPAL === */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {activeTab === 'monitoreo' && 'Torre de Control'}
            {activeTab === 'planificacion' && 'Planificación de Rutas'}
            {activeTab === 'conductores' && 'Directorio de Conductores'}
            {activeTab === 'reportes' && 'Historial y Reportes'}
          </h1>
          
          <div className="flex items-center gap-6">
            <div className="relative cursor-pointer">
              <Bell className="text-slate-500 hover:text-slate-700 w-6 h-6 transition" />
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">1</span>
            </div>
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">AD</div>
              <span className="text-slate-700 font-medium text-sm">Admin</span>
            </div>
          </div>
        </header>

        {/* === ÁREA CAMBIANTE (RUTEO DE PÁGINAS) === */}
        
        {/* 1. MONITOR EN VIVO */}
        {activeTab === 'monitoreo' && (
            <div className="flex-1 flex overflow-hidden p-6 gap-6 animate-[fadeIn_0.3s_ease-out]">
                
                {/* MAPA SIMULADO */}
                <div className="flex-1 relative bg-slate-200 rounded-xl border border-gray-300 shadow-inner overflow-hidden group">
                    <div className="absolute inset-0 opacity-20" style={{ 
                        backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', 
                        backgroundSize: '20px 20px' 
                    }}></div>

                    <button className="absolute top-4 right-4 bg-white p-2 rounded shadow text-gray-600 hover:text-gray-800 z-20 hover:scale-110 transition">
                        <Maximize className="w-5 h-5" />
                    </button>

                    {/* Auto 1 */}
                    <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 cursor-pointer transition-all duration-1000 hover:translate-x-10">
                    <div className="relative">
                        <Car className="text-green-600 w-8 h-8 rotate-45 drop-shadow-lg" />
                        <div className="absolute -top-8 -left-4 bg-white px-2 py-0.5 rounded text-xs font-bold shadow whitespace-nowrap opacity-100">
                            Ruta 101
                        </div>
                    </div>
                    </div>

                    {/* Auto 2 + Alerta */}
                    <div className="absolute bottom-1/3 left-1/4 cursor-pointer">
                    <div className="relative">
                        <Car className="text-red-500 w-8 h-8 -rotate-12 drop-shadow-lg animate-pulse" />
                    </div>
                    </div>

                    <div className="absolute top-1/4 left-1/4 bg-white px-4 py-2 rounded-lg shadow-lg border-l-4 border-red-500 flex items-center gap-3 z-30 animate-bounce">
                        <AlertTriangle className="text-red-500 w-5 h-5" />
                        <span className="font-bold text-red-700 text-sm">ALERTA: Desvío</span>
                        <X className="text-gray-400 w-4 h-4 cursor-pointer" />
                    </div>
                </div>

                {/* PANEL DERECHO */}
                <div className="w-80 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h2 className="font-semibold text-gray-800">Estado de la Flota</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="border-l-4 border-green-500 pl-4 py-2 shadow-sm rounded-r bg-white hover:bg-slate-50 transition cursor-pointer">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-gray-800">Ruta 101</span>
                                <span className="text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full">En Curso</span>
                            </div>
                            <p className="text-sm text-gray-600">Cond. Ana G. - 4/4</p>
                        </div>
                        <div className="border-l-4 border-red-500 pl-4 py-2 bg-red-50 rounded-r shadow-sm hover:bg-red-100 transition cursor-pointer">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-gray-800">Ruta 102</span>
                                <span className="text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-bold">RETRASADO</span>
                            </div>
                            <p className="text-sm text-gray-600">Cond. Pedro L. - 3/4</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* 2. PLANIFICACIÓN */}
        {activeTab === 'planificacion' && <Planificacion />}

        {/* 3. CONDUCTORES */}
        {activeTab === 'conductores' && <Conductores />}

        {/* 4. REPORTES */}
        {activeTab === 'reportes' && <Historial />}

      </main>
    </div>
  );
}

export default App;