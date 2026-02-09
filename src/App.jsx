import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, Monitor, Map as MapIcon, Users, FileText, Bell, AlertTriangle, X, Play, CheckSquare, Clock, Zap, Calendar, Edit, Save, History, Eye, Briefcase, Loader2 } from 'lucide-react';

// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

// COMPONENTES
import Historial from './Historial';
import Planificacion from './Planificacion';
import Conductores from './Conductores';
import Clientes from './Clientes';
import Login from './Login';

// FIREBASE
import { db } from './firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc } from 'firebase/firestore';

// === CONFIGURACIÓN GOOGLE MAPS ===
const GOOGLE_MAPS_API_KEY = "AIzaSyCue-ppitnj81zowobWCTiBvhHdqCDUrqg"; // TU CLAVE
const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; // CDMX
const libraries = ['places']; // Misma config que en Planificación

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('monitoreo');
  
  // CARGAR GOOGLE MAPS
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);

  // DATOS FIREBASE
  const [liveRoutes, setLiveRoutes] = useState([]);
  const [editingRoute, setEditingRoute] = useState(null); 
  const [viewHistory, setViewHistory] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  // === CARGAR RUTAS EN TIEMPO REAL ===
  useEffect(() => {
    const q = query(collection(db, "rutas"), orderBy("createdDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const routesArr = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setLiveRoutes(routesArr);
    });
    return () => unsubscribe();
  }, [activeTab]);

  // === EFECTO PARA CENTRAR EL MAPA AL SELECCIONAR RUTA ===
  useEffect(() => {
      if(isLoaded && mapRef.current && selectedRoute?.technicalData?.geometry) {
          const bounds = new window.google.maps.LatLngBounds();
          const path = selectedRoute.technicalData.geometry;
          
          if(path && path.length > 0) {
              path.forEach(coord => bounds.extend(coord));
              mapRef.current.fitBounds(bounds);
          }
      }
  }, [selectedRoute, isLoaded]);

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const updateRouteStatus = async (id, status, updates = {}) => {
      const routeRef = doc(db, "rutas", id);
      await updateDoc(routeRef, { status, ...updates });
  };

  const handleStartTrip = (id) => {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      updateRouteStatus(id, 'En Curso', { startTime: timeString });
  };

  const handleEndTrip = (id) => {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      updateRouteStatus(id, 'Completado', { endTime: timeString });
  };

  const saveTimeEdit = async () => {
      if (!editingRoute) return;
      const newStatus = editingRoute.endTime ? 'Completado' : (editingRoute.startTime ? 'En Curso' : editingRoute.status);
      await updateRouteStatus(editingRoute.id, newStatus, { startTime: editingRoute.startTime, endTime: editingRoute.endTime });
      setEditingRoute(null);
  };

  const getFilteredAndSortedRoutes = () => {
      const today = new Date().toISOString().split('T')[0];
      const filtered = liveRoutes.filter(ruta => {
          if (viewHistory) {
              return ruta.status === 'Completado' || ruta.status === 'Cancelado';
          } else {
              return ruta.status !== 'Completado' && ruta.status !== 'Cancelado';
          }
      });
      return filtered.sort((a, b) => {
          const dateA = a.finalDate || '9999-99-99';
          const dateB = b.finalDate || '9999-99-99';
          if (dateA === dateB) {
              if (a.serviceType === 'Prioritario' && b.serviceType !== 'Prioritario') return -1;
              if (b.serviceType === 'Prioritario' && a.serviceType !== 'Prioritario') return 1;
              return 0;
          }
          if (dateA === today && dateB !== today) return -1;
          if (dateB === today && dateA !== today) return 1;
          return dateA.localeCompare(dateB);
      });
  };

  const rutasVisibles = getFilteredAndSortedRoutes();

  // PREPARAR DATOS DEL MAPA
  const routePath = selectedRoute?.technicalData?.geometry || [];
  const startPos = routePath.length > 0 ? routePath[0] : null;
  const endPos = routePath.length > 0 ? routePath[routePath.length - 1] : null;

  if (!isAuthenticated) return <Login onLogin={() => setIsAuthenticated(true)} />;

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-800 text-gray-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <div className="flex items-center gap-2 text-white font-bold text-lg"><Truck className="text-blue-500 w-6 h-6" /><span>Despacho</span></div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('monitoreo')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'monitoreo' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}><Monitor className="w-5 h-5" /><span className="font-medium">Monitor en Vivo</span></button>
          <button onClick={() => setActiveTab('planificacion')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'planificacion' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}><MapIcon className="w-5 h-5" /><span>Planificación</span></button>
          <button onClick={() => setActiveTab('clientes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'clientes' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}><Briefcase className="w-5 h-5" /><span>Clientes</span></button>
          <button onClick={() => setActiveTab('conductores')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'conductores' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}><Users className="w-5 h-5" /><span>Conductores</span></button>
          <button onClick={() => setActiveTab('reportes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'reportes' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 hover:text-white'}`}><FileText className="w-5 h-5" /><span>Reportes</span></button>
        </nav>
        <div className="p-4 border-t border-slate-700"><button onClick={() => setIsAuthenticated(false)} className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white transition py-2 hover:bg-slate-700 rounded">Cerrar Sesión</button></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">{activeTab === 'monitoreo' && 'Torre de Control'}{activeTab === 'planificacion' && 'Planificación de Rutas'}{activeTab === 'clientes' && 'Cartera de Clientes'}{activeTab === 'conductores' && 'Directorio de Conductores'}{activeTab === 'reportes' && 'Historial y Reportes'}</h1>
          <div className="flex items-center gap-6"><div className="relative cursor-pointer"><Bell className="text-slate-500 hover:text-slate-700 w-6 h-6 transition" /><span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">3</span></div><div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">AD</div><div className="leading-tight"><p className="text-slate-700 font-bold text-sm">Administrador</p><p className="text-[10px] text-green-600 font-bold">● En Línea</p></div></div></div>
        </header>

        {activeTab === 'monitoreo' && (
            <div className="flex-1 flex overflow-hidden p-6 gap-6 animate-[fadeIn_0.3s_ease-out]">
                {/* MAPA GOOGLE */}
                <div className="flex-1 relative bg-slate-200 rounded-xl shadow-inner overflow-hidden border border-slate-300">
                    {isLoaded ? (
                        <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                            {selectedRoute && routePath.length > 0 && (
                                <>
                                    <Polyline path={routePath} options={{ strokeColor: "#3b82f6", strokeOpacity: 1, strokeWeight: 5 }} />
                                    {startPos && <Marker position={startPos} label="A" />}
                                    {endPos && <Marker position={endPos} label="B" />}
                                </>
                            )}
                        </GoogleMap>
                    ) : <div className="h-full flex items-center justify-center text-slate-500 gap-2"><Loader2 className="animate-spin"/> Cargando Google Maps...</div>}

                    {!selectedRoute && (<div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-md z-[500] border border-slate-200 max-w-xs"><h5 className="font-bold text-slate-800 text-sm">Mapa en Vivo</h5><p className="text-xs text-slate-500">Selecciona un viaje para ver su ruta.</p></div>)}
                </div>

                {/* LISTA LATERAL */}
                <div className="w-96 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600"/> {viewHistory ? 'Historial' : 'Activos'}</h2>
                        <button onClick={() => setViewHistory(!viewHistory)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition ${viewHistory ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>{viewHistory ? <><Eye className="w-3 h-3"/> Ver Activos</> : <><History className="w-3 h-3"/> Ver Pasados</>}</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {rutasVisibles.length === 0 && <div className="text-center py-10 text-slate-400"><p>{viewHistory ? 'No hay historial reciente.' : 'No hay rutas pendientes hoy.'}</p></div>}

                        {rutasVisibles.map((ruta) => (
                            <div key={ruta.id} onClick={() => setSelectedRoute(ruta)} className={`border rounded-lg p-3 transition shadow-sm cursor-pointer ${selectedRoute?.id === ruta.id ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'bg-white border-slate-200 hover:shadow-md'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        {ruta.serviceType === 'Prioritario' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 mb-1 border border-orange-200"><Zap className="w-3 h-3 fill-orange-500 text-orange-600" /> SOLICITADO: {ruta.createdDate || 'Hoy'}</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 mb-1 border border-blue-100"><Calendar className="w-3 h-3" /> PROGRAMADO: {ruta.scheduledDate}</span>}
                                        <h4 className="font-bold text-slate-800 text-sm">{ruta.client}</h4>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setEditingRoute(ruta); }} className="text-slate-300 hover:text-blue-500 transition"><Edit className="w-4 h-4" /></button>
                                </div>
                                <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><Users className="w-3 h-3"/> {ruta.driver || 'Sin Asignar'}</p>
                                <div className="bg-slate-50 rounded border border-slate-100 p-2 mb-3">
                                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Inicio:</span><span className="font-mono font-bold text-slate-700">{ruta.startTime ? ruta.startTime : (ruta.serviceType === 'Programado' ? ruta.scheduledTime : '--:--')}</span></div>
                                    <div className="flex justify-between text-xs"><span className="text-slate-500">Fin:</span><span className="font-mono font-bold text-slate-700">{ruta.endTime || '--:--'}</span></div>
                                </div>
                                <div className="flex gap-2">
                                    {ruta.status !== 'En Curso' && ruta.status !== 'Completado' && (<button onClick={(e) => { e.stopPropagation(); handleStartTrip(ruta.id); }} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"><Play className="w-3 h-3 fill-current" /> INICIAR</button>)}
                                    {ruta.status === 'En Curso' && (<button onClick={(e) => { e.stopPropagation(); handleEndTrip(ruta.id); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm animate-pulse"><CheckSquare className="w-3 h-3" /> FINALIZAR</button>)}
                                    {ruta.status === 'Completado' && <div className="w-full text-center text-xs font-bold text-green-600 py-1.5 bg-green-50 rounded border border-green-100">✅ FINALIZADO</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'planificacion' && <Planificacion />}
        {activeTab === 'clientes' && <Clientes />}
        {activeTab === 'conductores' && <Conductores />}
        {activeTab === 'reportes' && <Historial />}
      </main>

      {editingRoute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-[fadeIn_0.2s_ease-out]">
                  <h3 className="font-bold text-slate-800 text-lg mb-1">Ajuste Manual de Tiempos</h3>
                  <p className="text-xs text-slate-500 mb-4">Ruta: {editingRoute.client}</p>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Hora de Inicio</label><input type="time" className="w-full border border-slate-300 rounded p-2 text-sm" value={editingRoute.startTime || (editingRoute.serviceType === 'Programado' ? editingRoute.scheduledTime : '')} onChange={(e) => setEditingRoute({...editingRoute, startTime: e.target.value})} /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Hora de Finalización</label><input type="time" className="w-full border border-slate-300 rounded p-2 text-sm" value={editingRoute.endTime || ''} onChange={(e) => setEditingRoute({...editingRoute, endTime: e.target.value})} /></div>
                  </div>
                  <div className="flex gap-3 mt-6">
                      <button onClick={() => setEditingRoute(null)} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                      <button onClick={saveTimeEdit} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Guardar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;