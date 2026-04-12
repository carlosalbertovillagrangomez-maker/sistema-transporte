import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, Monitor, Map as MapIcon, Users, FileText, Bell, AlertTriangle, X, Play, CheckSquare, Clock, Zap, Calendar, Edit, Save, History, Eye, Briefcase, Loader2, BellRing, MessageSquare, Send, Camera } from 'lucide-react';

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
import { collection, onSnapshot, query, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 
const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
const libraries = ['places']; 

const ICON_START = "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
const ICON_WAYPOINT = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
const ICON_END = "http://maps.google.com/mapfiles/ms/icons/red-dot.png";

// === HELPER PARA CALCULAR DISTANCIA EN LÍNEA RECTA (Haversine) ===
const getDistance = (p1, p2) => {
    if (!p1 || !p2 || !p1.lat || !p2.lat) return Infinity;
    const R = 6371; 
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('monitoreo');
  
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);

  const [liveRoutes, setLiveRoutes] = useState([]);
  const [onlineDrivers, setOnlineDrivers] = useState([]); // Choferes conectados
  const [editingRoute, setEditingRoute] = useState(null); 
  const [viewHistory, setViewHistory] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  const [chatModalRoute, setChatModalRoute] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef(null);

  // 1. CARGAR RUTAS Y CONDUCTORES EN TIEMPO REAL
  useEffect(() => {
    const qRoutes = query(collection(db, "rutas"), orderBy("createdDate", "desc"));
    const unsubRoutes = onSnapshot(qRoutes, (snapshot) => {
        const routesArr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLiveRoutes(routesArr);
        
        setActiveAlertsCount(routesArr.filter(r => r.proximityAlert?.active === true).length);
        
        setSelectedRoute(prev => prev ? (routesArr.find(r => r.id === prev.id) || prev) : null);
        setChatModalRoute(prev => prev ? (routesArr.find(r => r.id === prev.id) || prev) : null);
    });

    const qDrivers = query(collection(db, "conductores"));
    const unsubDrivers = onSnapshot(qDrivers, (snapshot) => {
        const driversArr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filtramos solo a los que están "En Línea" y aprobados
        setOnlineDrivers(driversArr.filter(d => d.isOnline && d.status === 'Aprobado'));
    });

    return () => { unsubRoutes(); unsubDrivers(); };
  }, []);

  // 2. EL CEREBRO DE AUTO-ASIGNACIÓN (ROBOT INVISIBLE)
  useEffect(() => {
      // Solo buscamos asignar viajes que sean "Prioritarios", estén "Pendientes" y NO tengan a nadie asignado, 
      // y que no estén siendo ofrecidos actualmente a un chofer (estado "Ofreciendo").
      const viajesParaAsignar = liveRoutes.filter(r => r.status === 'Pendiente' && !r.driverId && r.serviceType === 'Prioritario' && r.ofertaEstado !== 'Pendiente');

      if (viajesParaAsignar.length === 0 || onlineDrivers.length === 0) return;

      viajesParaAsignar.forEach(async (viaje) => {
          // Filtrar choferes que YA estén ocupados en otra ruta "En Ruta"
          const choferesOcupadosIds = liveRoutes.filter(r => r.status === 'En Ruta' && r.driverId).map(r => r.driverId);
          // Filtrar choferes que ya rechazaron ESTE viaje específico
          const choferesQueRechazaron = viaje.rechazadoPor || [];

          const choferesElegibles = onlineDrivers.filter(d => 
              !choferesOcupadosIds.includes(d.id) && 
              !choferesQueRechazaron.includes(d.id) &&
              d.currentLocation // Tienen que tener GPS activo
          );

          if (choferesElegibles.length === 0) return; // Nadie disponible cerca

          // Encontrar al más cercano
          let choferMasCercano = null;
          let menorDistancia = Infinity;

          choferesElegibles.forEach(chofer => {
              const dist = getDistance(chofer.currentLocation, viaje.startCoords);
              if (dist < menorDistancia) {
                  menorDistancia = dist;
                  choferMasCercano = chofer;
              }
          });

          // Si encontramos a alguien a menos de 50km (rango razonable), le lanzamos la oferta
          if (choferMasCercano && menorDistancia <= 50) {
              try {
                  await updateDoc(doc(db, "rutas", viaje.id), {
                      ofertaPara: choferMasCercano.id,
                      ofertaNombre: choferMasCercano.name,
                      ofertaEstado: 'Pendiente', // El chofer tiene que aceptarlo
                      ofertaTiempo: new Date().getTime() // Para que la oferta expire si no contesta
                  });
                  console.log(`Ofreciendo viaje ${viaje.id} a ${choferMasCercano.name} a ${menorDistancia.toFixed(1)}km`);
              } catch (e) { console.error("Error al lanzar oferta:", e); }
          }
      });
  }, [liveRoutes, onlineDrivers]);

  // Auto-scroll del chat
  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [chatModalRoute?.chat]);

  useEffect(() => {
      if(isLoaded && mapRef.current && selectedRoute?.technicalData?.geometry) {
          try {
              const bounds = new window.google.maps.LatLngBounds();
              const path = selectedRoute.technicalData.geometry;
              if(Array.isArray(path) && path.length > 0) {
                  path.forEach(coord => { if (coord && typeof coord.lat === 'number') bounds.extend(coord); });
                  if (selectedRoute.currentLocation?.lat) bounds.extend(selectedRoute.currentLocation);
                  mapRef.current.fitBounds(bounds);
              }
          } catch (error) {}
      }
  }, [selectedRoute?.id, isLoaded]);

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const updateRouteStatus = async (id, status, updates = {}) => {
      try { await updateDoc(doc(db, "rutas", id), { status, ...updates }); } catch (error) {}
  };

  const handleStartTrip = (id) => updateRouteStatus(id, 'En Ruta', { startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  const handleEndTrip = (id) => updateRouteStatus(id, 'Finalizado', { endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  
  const saveTimeEdit = async () => {
      if (!editingRoute) return;
      const newStatus = editingRoute.endTime ? 'Finalizado' : (editingRoute.startTime ? 'En Ruta' : editingRoute.status);
      await updateRouteStatus(editingRoute.id, newStatus, { startTime: editingRoute.startTime, endTime: editingRoute.endTime });
      setEditingRoute(null);
  };

  const sendDispatchMessage = async () => {
      if (!chatInput.trim() || !chatModalRoute) return;
      const msg = { sender: 'Despacho', text: chatInput.trim(), time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), timestamp: new Date().toISOString() };
      try { await updateDoc(doc(db, "rutas", chatModalRoute.id), { chat: arrayUnion(msg) }); setChatInput(''); } catch(e) {}
  };

  const getFilteredAndSortedRoutes = () => {
      const today = new Date().toISOString().split('T')[0];
      const filtered = liveRoutes.filter(ruta => viewHistory ? (ruta.status === 'Finalizado' || ruta.status === 'Completado' || ruta.status === 'Cancelado') : (ruta.status !== 'Finalizado' && ruta.status !== 'Completado' && ruta.status !== 'Cancelado'));
      return filtered.sort((a, b) => {
          const dateA = String(a.finalDate || '9999-99-99'); const dateB = String(b.finalDate || '9999-99-99');
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

  if (!isAuthenticated) return <Login onLogin={() => setIsAuthenticated(true)} />;

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
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

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">{activeTab === 'monitoreo' && 'Torre de Control'}{activeTab === 'planificacion' && 'Planificación de Rutas'}{activeTab === 'clientes' && 'Cartera de Clientes'}{activeTab === 'conductores' && 'Directorio de Conductores'}{activeTab === 'reportes' && 'Historial y Reportes'}</h1>
          <div className="flex items-center gap-6">
              <div className="relative cursor-pointer">
                  <Bell className="text-slate-500 hover:text-slate-700 w-6 h-6 transition" />
                  {activeAlertsCount > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white animate-pulse">{activeAlertsCount}</span>}
              </div>
              <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">AD</div><div className="leading-tight"><p className="text-slate-700 font-bold text-sm">Administrador</p><p className="text-[10px] text-green-600 font-bold">● En Línea</p></div></div>
          </div>
        </header>

        {activeTab === 'monitoreo' && (
            <div className="flex-1 flex overflow-hidden p-6 gap-6 animate-[fadeIn_0.3s_ease-out]">
                {/* MAPA GOOGLE */}
                <div className="flex-1 relative bg-slate-200 rounded-xl shadow-inner overflow-hidden border border-slate-300">
                    {isLoaded ? (
                        <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                            {/* Choferes conectados (puntos verdes) */}
                            {onlineDrivers.map(d => d.currentLocation && <Marker key={d.id} position={d.currentLocation} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#22c55e", fillOpacity: 0.8, strokeWeight: 2, strokeColor: "white" }} title={`Operador: ${d.name}`} />)}

                            {selectedRoute && selectedRoute.technicalData?.geometry?.length > 0 && (
                                <>
                                    <Polyline path={selectedRoute.technicalData.geometry} options={{ strokeColor: "#94a3b8", strokeOpacity: 1, strokeWeight: 5 }} />
                                    {selectedRoute.startCoords && <Marker position={selectedRoute.startCoords} icon={ICON_START} />}
                                    {Array.isArray(selectedRoute.waypointsData) && selectedRoute.waypointsData.map((wp, idx) => ( wp?.lat && wp?.lng ? <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} icon={ICON_WAYPOINT} /> : null ))}
                                    {selectedRoute.endCoords && <Marker position={selectedRoute.endCoords} icon={ICON_END} />}
                                    {selectedRoute.currentLocation && selectedRoute.status === 'En Ruta' && ( <Marker position={selectedRoute.currentLocation} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#3b82f6", fillOpacity: 1, strokeWeight: 3, strokeColor: "white" }} zIndex={999}/> )}
                                </>
                            )}
                        </GoogleMap>
                    ) : <div className="h-full flex items-center justify-center text-slate-500 gap-2"><Loader2 className="animate-spin"/> Cargando Google Maps...</div>}

                    {!selectedRoute && (<div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-md z-[500] border border-slate-200 max-w-xs"><h5 className="font-bold text-slate-800 text-sm">Mapa en Vivo</h5><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{onlineDrivers.length} unidades activas en zona</p></div>)}
                    
                    {selectedRoute?.status === 'En Ruta' && selectedRoute?.currentLocation && (
                        <div className={`absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-md z-[500] border flex items-center gap-2 ${selectedRoute.proximityAlert?.active ? 'border-orange-300' : 'border-blue-200'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${selectedRoute.proximityAlert?.active ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${selectedRoute.proximityAlert?.active ? 'text-orange-600' : 'text-blue-700'}`}>{selectedRoute.proximityAlert?.active ? 'Conductor Llegando' : 'Señal GPS Activa'}</p>
                        </div>
                    )}
                </div>

                {/* LISTA LATERAL DE RUTAS */}
                <div className="w-96 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden shrink-0">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600"/> {viewHistory ? 'Historial' : 'Activos'}</h2>
                        <button onClick={() => setViewHistory(!viewHistory)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition ${viewHistory ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>{viewHistory ? <><Eye className="w-3 h-3"/> Ver Activos</> : <><History className="w-3 h-3"/> Ver Pasados</>}</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {rutasVisibles.length === 0 && <div className="text-center py-10 text-slate-400"><p>{viewHistory ? 'No hay historial reciente.' : 'No hay rutas pendientes hoy.'}</p></div>}

                        {rutasVisibles.map((ruta) => {
                            const hasChatOrEvidence = (ruta.chat && ruta.chat.length > 0) || (ruta.evidencias && ruta.evidencias.length > 0);
                            
                            return (
                                <div key={ruta.id} onClick={() => setSelectedRoute(ruta)} className={`border rounded-lg p-3 transition shadow-sm cursor-pointer relative overflow-hidden ${selectedRoute?.id === ruta.id ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'bg-white border-slate-200 hover:shadow-md'} ${ruta.proximityAlert?.active ? 'border-orange-400 ring-1 ring-orange-400 bg-orange-50/30' : ''}`}>
                                    
                                    {ruta.proximityAlert?.active && <div className="absolute top-0 left-0 right-0 bg-orange-500 text-white text-[10px] font-black text-center py-1 flex items-center justify-center gap-1 animate-pulse"><BellRing className="w-3 h-3"/> ¡LLEGANDO A: {ruta.proximityAlert.passenger.toUpperCase()}!</div>}

                                    <div className={`flex justify-between items-start mb-2 ${ruta.proximityAlert?.active ? 'mt-4' : ''}`}>
                                        <div>
                                            {ruta.serviceType === 'Prioritario' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 mb-1 border border-orange-200"><Zap className="w-3 h-3 fill-orange-500 text-orange-600" /> INMEDIATO</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 mb-1 border border-blue-100"><Calendar className="w-3 h-3" /> PROGRAMADO: {ruta.scheduledDate}</span>}
                                            <h4 className="font-bold text-slate-800 text-sm truncate">{ruta.client}</h4>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingRoute(ruta); }} className="text-slate-300 hover:text-blue-500 transition"><Edit className="w-4 h-4" /></button>
                                    </div>

                                    {/* MUESTRA SI SE ESTÁ OFRECIENDO A UN CHOFER */}
                                    {ruta.ofertaEstado === 'Pendiente' ? (
                                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-[10px] font-black px-2 py-1.5 rounded uppercase flex items-center gap-2 mb-3 animate-pulse">
                                            <Loader2 className="w-3 h-3 animate-spin"/> OFRECIENDO A: {ruta.ofertaNombre.split(' ')[0]}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> <span className="font-bold">{ruta.driver || 'Sin Asignar'}</span></p>
                                    )}
                                    
                                    <div className="flex gap-2 mb-3">
                                        <div className="flex-1 bg-slate-50 rounded border border-slate-100 p-2">
                                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-400 uppercase font-bold">Inicio:</span><span className="font-mono font-bold text-slate-700">{ruta.startTime ? ruta.startTime : (ruta.serviceType === 'Programado' ? ruta.scheduledTime : '--:--')}</span></div>
                                            <div className="flex justify-between text-[10px]"><span className="text-slate-400 uppercase font-bold">Fin:</span><span className="font-mono font-bold text-slate-700">{ruta.endTime || '--:--'}</span></div>
                                        </div>
                                        {(ruta.status === 'En Ruta' || hasChatOrEvidence) && (
                                            <button onClick={(e) => { e.stopPropagation(); setChatModalRoute(ruta); }} className={`flex flex-col items-center justify-center px-3 rounded border transition-colors ${hasChatOrEvidence ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'} relative`}>
                                                <MessageSquare className="w-4 h-4"/>
                                                <span className="text-[8px] font-bold uppercase mt-1">Logs</span>
                                                {ruta.chat && ruta.chat.length > 0 && ruta.chat[ruta.chat.length-1].sender !== 'Despacho' && ruta.chat[ruta.chat.length-1].sender !== 'Sistema' && <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        {ruta.status !== 'En Ruta' && ruta.status !== 'Finalizado' && (<button onClick={(e) => { e.stopPropagation(); handleStartTrip(ruta.id); }} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"><Play className="w-3 h-3 fill-current" /> INICIAR</button>)}
                                        {ruta.status === 'En Ruta' && (<button onClick={(e) => { e.stopPropagation(); handleEndTrip(ruta.id); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm animate-pulse"><CheckSquare className="w-3 h-3" /> FINALIZAR</button>)}
                                        {ruta.status === 'Finalizado' && <div className="w-full text-center text-xs font-bold text-green-600 py-1.5 bg-green-50 rounded border border-green-100">✅ FINALIZADO</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        
        {activeTab === 'planificacion' && <Planificacion />}
        {activeTab === 'clientes' && <Clientes />}
        {activeTab === 'conductores' && <Conductores />}
        {activeTab === 'reportes' && <Historial />}
      </main>

      {/* MODAL: CENTRO DE COMUNICACIÓN (CHAT Y EVIDENCIAS) */}
      {chatModalRoute && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-300">
                  <div className="w-1/2 flex flex-col border-r border-slate-200 bg-slate-50">
                      <div className="p-4 bg-blue-600 text-white flex justify-between items-center shadow-md z-10 shrink-0">
                          <div>
                              <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2"><MessageSquare className="w-4 h-4"/> Registro de Chat</h3>
                              <p className="text-[10px] text-blue-200">Operador: {chatModalRoute.driver}</p>
                          </div>
                      </div>
                      <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                          {(!chatModalRoute.chat || chatModalRoute.chat.length === 0) && <p className="text-center text-slate-400 text-xs font-bold mt-10 uppercase">Sin mensajes en esta ruta</p>}
                          {(chatModalRoute.chat || []).map((msg, i) => {
                              if (msg.sender === 'Sistema') return <div key={i} className="text-center"><span className="bg-red-100 text-red-700 border border-red-200 px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm">{msg.text}</span></div>;
                              const isDespacho = msg.sender === 'Despacho';
                              return (
                                  <div key={i} className={`flex w-full ${isDespacho ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm ${isDespacho ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}>
                                          <p className={`text-[9px] font-black uppercase mb-1 ${isDespacho ? 'text-blue-200' : msg.sender === 'Conductor' ? 'text-green-500' : 'text-orange-500'}`}>{msg.sender}</p>
                                          <p className="text-sm font-medium leading-snug">{msg.text}</p>
                                          <p className={`text-[9px] mt-1 text-right font-bold ${isDespacho ? 'text-blue-300' : 'text-slate-400'}`}>{msg.time}</p>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                      <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
                          <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendDispatchMessage()} placeholder="Escribe al conductor o cliente..." className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                          <button onClick={sendDispatchMessage} className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"><Send className="w-4 h-4"/></button>
                      </div>
                  </div>
                  <div className="w-1/2 flex flex-col bg-white">
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2"><Camera className="w-4 h-4 text-red-500"/> Evidencias (No Shows)</h3>
                          <button onClick={() => setChatModalRoute(null)} className="p-1.5 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 rounded transition"><X className="w-5 h-5"/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
                          {(!chatModalRoute.evidencias || chatModalRoute.evidencias.length === 0) ? (
                              <div className="text-center py-20 text-slate-400"><ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-50"/><p className="text-xs font-bold uppercase">No hay reportes de ausencia en esta ruta.</p></div>
                          ) : (
                              chatModalRoute.evidencias.map((ev, idx) => (
                                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                      <div className="bg-red-50 p-3 border-b border-red-100 flex justify-between items-center"><div><p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Reporte de Ausencia</p><p className="text-sm font-bold text-slate-800">{ev.passenger}</p></div><div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</p><p className="text-sm font-mono font-bold text-slate-700">{ev.time}</p></div></div>
                                      <div className="p-3"><p className="text-xs text-slate-500 font-medium mb-3 flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400"/> {ev.address}</p>{ev.photo ? (<div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer" onClick={() => window.open(ev.photo, '_blank')}><img src={ev.photo} alt="Evidencia" className="w-full h-48 object-cover" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><p className="text-white text-xs font-bold uppercase tracking-widest">Ver Completa</p></div></div>) : (<div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-bold border border-slate-200">SIN FOTO</div>)}</div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {editingRoute && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
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