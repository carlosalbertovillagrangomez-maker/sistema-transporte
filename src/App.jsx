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

// Agregamos 'geometry' para calcular la rotación del coche en vivo
const libraries = ['places', 'geometry']; 

const ICON_START = "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
const ICON_WAYPOINT = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
const ICON_END = "http://maps.google.com/mapfiles/ms/icons/red-dot.png";

// === HELPER PARA CALCULAR DISTANCIA ===
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
  const [currentUser, setCurrentUser] = useState(null); // NUEVO: Control de usuario real
  const [activeTab, setActiveTab] = useState('monitoreo');
  
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);

  const [liveRoutes, setLiveRoutes] = useState([]);
  const [onlineDrivers, setOnlineDrivers] = useState([]); 
  const [editingRoute, setEditingRoute] = useState(null); 
  const [viewHistory, setViewHistory] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  const [chatModalRoute, setChatModalRoute] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef(null);

  // Estados para estabilizar la brújula del coche en el Despachador
  const prevLocRef = useRef(null);
  const [carHeading, setCarHeading] = useState(0);

  // 1. CARGAR RUTAS Y CONDUCTORES
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
        setOnlineDrivers(driversArr.filter(d => d.isOnline && d.status === 'Aprobado'));
    });

    return () => { unsubRoutes(); unsubDrivers(); };
  }, []);

  // 2. EL CEREBRO DE AUTO-ASIGNACIÓN
  useEffect(() => {
      const viajesParaAsignar = liveRoutes.filter(r => r.status === 'Pendiente' && !r.driverId && r.serviceType === 'Prioritario' && r.ofertaEstado !== 'Pendiente');

      if (viajesParaAsignar.length === 0 || onlineDrivers.length === 0) return;

      viajesParaAsignar.forEach(async (viaje) => {
          const choferesOcupadosIds = liveRoutes.filter(r => r.status === 'En Ruta' && r.driverId).map(r => r.driverId);
          const choferesQueRechazaron = viaje.rechazadoPor || [];

          const choferesElegibles = onlineDrivers.filter(d => 
              !choferesOcupadosIds.includes(d.id) && 
              !choferesQueRechazaron.includes(d.id)
          );

          if (choferesElegibles.length === 0) return;

          let choferMasCercano = null;
          let menorDistancia = Infinity;

          choferesElegibles.forEach(chofer => {
              const dist = (chofer.currentLocation && viaje.startCoords) ? getDistance(chofer.currentLocation, viaje.startCoords) : 0;
              if (dist < menorDistancia) {
                  menorDistancia = dist;
                  choferMasCercano = chofer;
              }
          });

          if (choferMasCercano && menorDistancia <= 50) {
              try {
                  await updateDoc(doc(db, "rutas", viaje.id), {
                      ofertaPara: choferMasCercano.id,
                      ofertaNombre: choferMasCercano.name,
                      ofertaEstado: 'Pendiente',
                      ofertaTiempo: new Date().getTime()
                  });
              } catch (e) {}
          }
      });
  }, [liveRoutes, onlineDrivers]);

  // RESTO DEL DESPACHADOR...
  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [chatModalRoute?.chat]);

  // Lógica para calcular la rotación del coche con filtro estabilizador
  useEffect(() => {
      if (selectedRoute?.status === 'En Ruta' && selectedRoute?.currentLocation && window.google?.maps?.geometry) {
          const loc = selectedRoute.currentLocation;
          if (prevLocRef.current) {
              const p1 = new window.google.maps.LatLng(prevLocRef.current.lat, prevLocRef.current.lng);
              const p2 = new window.google.maps.LatLng(loc.lat, loc.lng);
              const dist = window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
              
              if (dist > 3) {
                  const newHeading = window.google.maps.geometry.spherical.computeHeading(p1, p2);
                  setCarHeading(newHeading);
                  prevLocRef.current = loc;
              }
          } else {
              prevLocRef.current = loc;
          }
      } else if (!selectedRoute) {
          prevLocRef.current = null;
      }
  }, [selectedRoute?.currentLocation, selectedRoute?.status]);

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
  const updateRouteStatus = async (id, status, updates = {}) => { try { await updateDoc(doc(db, "rutas", id), { status, ...updates }); } catch (error) {} };
  const handleStartTrip = (id) => updateRouteStatus(id, 'En Ruta', { startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  const handleEndTrip = (id) => updateRouteStatus(id, 'Finalizado', { endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  
  const saveTimeEdit = async () => {
      if (!editingRoute) return;
      const newStatus = editingRoute.endTime ? 'Finalizado' : (editingRoute.startTime ? 'En Ruta' : editingRoute.status);
      await updateRouteStatus(editingRoute.id, newStatus, { startTime: editingRoute.startTime, endTime: editingRoute.endTime });
      setEditingRoute(null);
  };

  const sendDispatchMessage = async () => {
      if (!chatInput.trim() || !chatModalRoute || !currentUser) return;
      // NUEVO: Se registra el nombre real del administrador en el chat
      const msg = { sender: 'Despacho', text: chatInput.trim(), time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), timestamp: new Date().toISOString(), sentBy: currentUser.name };
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

  // Si no hay usuario activo, mostramos el Login
  if (!currentUser) return <Login onLogin={(user) => setCurrentUser(user)} />;

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="h-16 flex items-center justify-center px-6 border-b border-slate-800 bg-slate-950">
           {/* LOGO TRIPLOGIX */}
           <img src="/logo.png" alt="TripLogix" className="h-8 w-auto mr-2" />
           <span className="text-white font-black text-lg uppercase tracking-wider">Trip<span className="text-orange-500">Logix</span></span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('monitoreo')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'monitoreo' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Monitor className="w-5 h-5" /><span className="font-bold text-sm">Monitor en Vivo</span></button>
          <button onClick={() => setActiveTab('planificacion')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'planificacion' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><MapIcon className="w-5 h-5" /><span className="font-bold text-sm">Planificación</span></button>
          <button onClick={() => setActiveTab('clientes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'clientes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Briefcase className="w-5 h-5" /><span className="font-bold text-sm">Clientes</span></button>
          <button onClick={() => setActiveTab('conductores')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'conductores' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Users className="w-5 h-5" /><span className="font-bold text-sm">Conductores</span></button>
          <button onClick={() => setActiveTab('reportes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reportes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><FileText className="w-5 h-5" /><span className="font-bold text-sm">Reportes</span></button>
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-950">
            <button onClick={() => setCurrentUser(null)} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-red-400 transition py-3 rounded-xl hover:bg-red-500/10"><X className="w-4 h-4"/> CERRAR SESIÓN</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <h1 className="text-xl font-black text-slate-800 tracking-tight">{activeTab === 'monitoreo' && 'Torre de Control'}{activeTab === 'planificacion' && 'Planificación de Rutas'}{activeTab === 'clientes' && 'Cartera de Clientes'}{activeTab === 'conductores' && 'Directorio de Conductores'}{activeTab === 'reportes' && 'Historial y Reportes'}</h1>
          <div className="flex items-center gap-6">
              <div className="relative cursor-pointer">
                  <Bell className="text-slate-400 hover:text-slate-800 w-6 h-6 transition" />
                  {activeAlertsCount > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white animate-pulse">{activeAlertsCount}</span>}
              </div>
              <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition border border-transparent hover:border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-black text-xs border border-orange-200">{currentUser.name.substring(0, 2).toUpperCase()}</div>
                  <div className="leading-tight">
                      <p className="text-slate-800 font-bold text-sm">{currentUser.name}</p>
                      <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">● En Línea</p>
                  </div>
              </div>
          </div>
        </header>

        {activeTab === 'monitoreo' && (
            <div className="flex-1 flex overflow-hidden p-6 gap-6 animate-[fadeIn_0.3s_ease-out]">
                {/* MAPA GOOGLE */}
                <div className="flex-1 relative bg-slate-200 rounded-3xl shadow-sm overflow-hidden border border-slate-200">
                    {isLoaded ? (
                        <GoogleMap 
                            mapContainerStyle={containerStyle} 
                            center={centerMX} 
                            zoom={12} 
                            onLoad={handleMapLoad} 
                            options={{ mapId: "73f56298887c80075f6fc648", streetViewControl: false, mapTypeControl: false, gestureHandling: "greedy" }}
                        >
                            {onlineDrivers.map(d => d.currentLocation && <Marker key={d.id} position={d.currentLocation} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#22c55e", fillOpacity: 0.8, strokeWeight: 2, strokeColor: "white" }} title={`Operador: ${d.name}`} />)}
                            {selectedRoute && selectedRoute.technicalData?.geometry?.length > 0 && (
                                <>
                                    <Polyline path={selectedRoute.technicalData.geometry} options={{ strokeColor: "#f97316", strokeOpacity: 0.8, strokeWeight: 6 }} />
                                    {selectedRoute.startCoords && <Marker position={selectedRoute.startCoords} icon={ICON_START} />}
                                    {Array.isArray(selectedRoute.waypointsData) && selectedRoute.waypointsData.map((wp, idx) => ( wp?.lat && wp?.lng ? <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} icon={ICON_WAYPOINT} /> : null ))}
                                    {selectedRoute.endCoords && <Marker position={selectedRoute.endCoords} icon={ICON_END} />}
                                    
                                    {/* El coche dinámico que gira en el Despachador */}
                                    {selectedRoute.currentLocation && selectedRoute.status === 'En Ruta' && ( 
                                        <Marker 
                                            position={selectedRoute.currentLocation} 
                                            icon={{ path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: "#f97316", fillOpacity: 1, strokeWeight: 2, strokeColor: "white", rotation: carHeading }} 
                                            zIndex={999}
                                        /> 
                                    )}
                                </>
                            )}
                        </GoogleMap>
                    ) : <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin w-8 h-8 text-orange-500"/><span className="text-xs font-bold uppercase tracking-widest">Cargando Mapas...</span></div>}

                    {!selectedRoute && (<div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-5 py-3 rounded-2xl shadow-sm z-[500] border border-slate-100 max-w-xs"><h5 className="font-black text-slate-800 text-sm mb-1">Radar en Vivo</h5><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> {onlineDrivers.length} unidades activas</p></div>)}
                    
                    {selectedRoute?.status === 'En Ruta' && selectedRoute?.currentLocation && (
                        <div className={`absolute top-4 right-4 bg-white/90 backdrop-blur px-4 py-2.5 rounded-full shadow-sm z-[500] border flex items-center gap-2 ${selectedRoute.proximityAlert?.active ? 'border-orange-300' : 'border-slate-200'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${selectedRoute.proximityAlert?.active ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${selectedRoute.proximityAlert?.active ? 'text-orange-600' : 'text-slate-600'}`}>{selectedRoute.proximityAlert?.active ? 'Conductor Llegando' : 'Señal GPS Activa'}</p>
                        </div>
                    )}
                </div>

                {/* LISTA LATERAL DE RUTAS */}
                <div className="w-96 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                        <h2 className="font-black text-slate-800 flex items-center gap-2 text-sm uppercase tracking-widest"><Clock className="w-4 h-4 text-orange-500"/> {viewHistory ? 'Historial' : 'Activos'}</h2>
                        <button onClick={() => setViewHistory(!viewHistory)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black transition ${viewHistory ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{viewHistory ? <><Eye className="w-3 h-3"/> Activos</> : <><History className="w-3 h-3"/> Pasados</>}</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {rutasVisibles.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium"><p>{viewHistory ? 'No hay historial reciente.' : 'No hay rutas pendientes hoy.'}</p></div>}

                        {rutasVisibles.map((ruta) => {
                            const hasChatOrEvidence = (ruta.chat && ruta.chat.length > 0) || (ruta.evidencias && ruta.evidencias.length > 0);
                            
                            return (
                                <div key={ruta.id} onClick={() => setSelectedRoute(ruta)} className={`border-2 rounded-2xl p-4 transition-all shadow-sm cursor-pointer relative overflow-hidden ${selectedRoute?.id === ruta.id ? 'border-orange-500 bg-orange-50/30 shadow-orange-500/10' : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'} ${ruta.proximityAlert?.active ? 'border-orange-400 bg-orange-50/50' : ''}`}>
                                    {ruta.proximityAlert?.active && <div className="absolute top-0 left-0 right-0 bg-orange-500 text-white text-[10px] font-black text-center py-1 flex items-center justify-center gap-1 animate-pulse"><BellRing className="w-3 h-3"/> ¡LLEGANDO A: {ruta.proximityAlert.passenger.toUpperCase()}!</div>}

                                    <div className={`flex justify-between items-start mb-3 ${ruta.proximityAlert?.active ? 'mt-4' : ''}`}>
                                        <div>
                                            {ruta.serviceType === 'Prioritario' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 mb-2"><Zap className="w-3 h-3 fill-orange-500 text-orange-600" /> INMEDIATO</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 mb-2"><Calendar className="w-3 h-3" /> PROGRAMADO: {ruta.scheduledDate}</span>}
                                            <h4 className="font-black text-slate-800 text-sm truncate">{ruta.client}</h4>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingRoute(ruta); }} className="text-slate-300 hover:text-orange-500 transition p-1 bg-slate-50 hover:bg-orange-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                                    </div>

                                    {ruta.ofertaEstado === 'Pendiente' ? (
                                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-[10px] font-black px-3 py-2 rounded-xl uppercase flex items-center gap-2 mb-4 animate-pulse">
                                            <Loader2 className="w-3 h-3 animate-spin"/> OFRECIENDO A: {ruta.ofertaNombre.split(' ')[0]}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400"/> <span className="font-bold text-slate-700">{ruta.driver || 'Sin Asignar'}</span></p>
                                    )}
                                    
                                    <div className="flex gap-2 mb-4">
                                        <div className="flex-1 bg-slate-50 rounded-xl border border-slate-100 p-2.5">
                                            <div className="flex justify-between text-[10px] mb-1.5"><span className="text-slate-400 uppercase font-black tracking-widest">Inicio:</span><span className="font-mono font-bold text-slate-800">{ruta.startTime ? ruta.startTime : (ruta.serviceType === 'Programado' ? ruta.scheduledTime : '--:--')}</span></div>
                                            <div className="flex justify-between text-[10px]"><span className="text-slate-400 uppercase font-black tracking-widest">Fin:</span><span className="font-mono font-bold text-slate-800">{ruta.endTime || '--:--'}</span></div>
                                        </div>
                                        {(ruta.status === 'En Ruta' || hasChatOrEvidence) && (
                                            <button onClick={(e) => { e.stopPropagation(); setChatModalRoute(ruta); }} className={`flex flex-col items-center justify-center px-4 rounded-xl border transition-colors ${hasChatOrEvidence ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'} relative`}>
                                                <MessageSquare className="w-5 h-5"/>
                                                <span className="text-[9px] font-black uppercase tracking-widest mt-1">Logs</span>
                                                {ruta.chat && ruta.chat.length > 0 && ruta.chat[ruta.chat.length-1].sender !== 'Despacho' && ruta.chat[ruta.chat.length-1].sender !== 'Sistema' && <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-white"></div>}
                                            </button>
                                        )}
                                    </div>

                                    {/* --- NUEVO: MOSTRAR ETA EN EL MONITOR EN VIVO --- */}
                                    {ruta.status === 'En Ruta' && ruta.proximityAlert?.etaMins && (
                                        <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-center">
                                            <p className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center justify-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5"/> ETA: {ruta.proximityAlert.etaMins} MIN A {ruta.proximityAlert.passenger.split(' ')[0].toUpperCase()}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        {ruta.status !== 'En Ruta' && ruta.status !== 'Finalizado' && (<button onClick={(e) => { e.stopPropagation(); handleStartTrip(ruta.id); }} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-black flex items-center justify-center gap-2 transition shadow-sm"><Play className="w-3 h-3 fill-current" /> INICIAR</button>)}
                                        {ruta.status === 'En Ruta' && (<button onClick={(e) => { e.stopPropagation(); handleEndTrip(ruta.id); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-black flex items-center justify-center gap-2 transition shadow-sm animate-pulse shadow-red-500/20"><CheckSquare className="w-3 h-3" /> FINALIZAR</button>)}
                                        {ruta.status === 'Finalizado' && <div className="w-full text-center text-[10px] tracking-widest font-black text-green-600 py-2.5 bg-green-50 rounded-xl border border-green-100 uppercase">✅ FINALIZADO</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        
        {activeTab === 'planificacion' && <Planificacion currentUser={currentUser} />}
        {activeTab === 'clientes' && <Clientes />}
        {activeTab === 'conductores' && <Conductores />}
        {activeTab === 'reportes' && <Historial />}
      </main>

      {/* MODAL CHAT Y EVIDENCIAS */}
      {chatModalRoute && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[2rem] shadow-2xl flex overflow-hidden border border-slate-200">
                  <div className="w-1/2 flex flex-col border-r border-slate-200 bg-slate-50">
                      <div className="p-5 bg-slate-800 text-white flex justify-between items-center shadow-md z-10 shrink-0">
                          <div>
                              <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2"><MessageSquare className="w-4 h-4"/> Registro de Chat</h3>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Operador: <span className="text-white">{chatModalRoute.driver}</span></p>
                          </div>
                      </div>
                      <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                          {(!chatModalRoute.chat || chatModalRoute.chat.length === 0) && <p className="text-center text-slate-400 text-xs font-bold mt-10 uppercase tracking-widest">Sin mensajes en esta ruta</p>}
                          {(chatModalRoute.chat || []).map((msg, i) => {
                              if (msg.sender === 'Sistema') return <div key={i} className="text-center"><span className="bg-red-50 text-red-600 border border-red-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">{msg.text}</span></div>;
                              const isDespacho = msg.sender === 'Despacho';
                              return (
                                  <div key={i} className={`flex w-full ${isDespacho ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${isDespacho ? 'bg-orange-500 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}>
                                          <div className="flex justify-between items-center mb-1">
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${isDespacho ? 'text-orange-200' : msg.sender === 'Conductor' ? 'text-slate-400' : 'text-blue-500'}`}>{msg.sender}</p>
                                            {isDespacho && msg.sentBy && <p className="text-[8px] text-orange-200/70 font-bold">POR: {msg.sentBy}</p>}
                                          </div>
                                          <p className="text-sm font-medium leading-snug">{msg.text}</p>
                                          <p className={`text-[9px] mt-2 text-right font-bold ${isDespacho ? 'text-orange-200' : 'text-slate-400'}`}>{msg.time}</p>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                      <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3 shrink-0">
                          <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendDispatchMessage()} placeholder="Escribe al conductor o cliente..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 focus:bg-white transition-colors" />
                          <button onClick={sendDispatchMessage} className="p-3 bg-orange-500 text-white rounded-xl shadow-md hover:bg-orange-600 active:scale-95 transition-transform"><Send className="w-5 h-5"/></button>
                      </div>
                  </div>
                  <div className="w-1/2 flex flex-col bg-white">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2"><Camera className="w-4 h-4 text-red-500"/> Evidencias (No Shows)</h3>
                          <button onClick={() => setChatModalRoute(null)} className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-xl transition"><X className="w-5 h-5"/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
                          {(!chatModalRoute.evidencias || chatModalRoute.evidencias.length === 0) ? (
                              <div className="text-center py-20 text-slate-400"><ShieldCheck className="w-16 h-16 mx-auto mb-3 opacity-20"/><p className="text-xs font-black uppercase tracking-widest">No hay reportes de ausencia</p></div>
                          ) : (
                              chatModalRoute.evidencias.map((ev, idx) => (
                                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                      <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center"><div><p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-0.5">Reporte de Ausencia</p><p className="text-sm font-black text-slate-800">{ev.passenger}</p></div><div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Hora</p><p className="text-sm font-mono font-black text-slate-700">{ev.time}</p></div></div>
                                      <div className="p-4"><p className="text-xs text-slate-600 font-medium mb-4 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-red-400"/> {ev.address}</p>{ev.photo ? (<div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer" onClick={() => window.open(ev.photo, '_blank')}><img src={ev.photo} alt="Evidencia" className="w-full h-48 object-cover" /><div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><p className="text-white text-xs font-black uppercase tracking-widest border-2 border-white px-4 py-2 rounded-lg">Ver Completa</p></div></div>) : (<div className="w-full h-24 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-200">SIN FOTO</div>)}</div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {editingRoute && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm animate-[fadeIn_0.2s_ease-out]">
                  <h3 className="font-black text-slate-800 text-lg mb-1">Ajuste de Tiempos</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Ruta: <span className="text-orange-500">{editingRoute.client}</span></p>
                  <div className="space-y-4">
                      <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Hora de Inicio</label><input type="time" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold text-slate-700 focus:border-orange-500 outline-none" value={editingRoute.startTime || (editingRoute.serviceType === 'Programado' ? editingRoute.scheduledTime : '')} onChange={(e) => setEditingRoute({...editingRoute, startTime: e.target.value})} /></div>
                      <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Hora de Finalización</label><input type="time" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold text-slate-700 focus:border-orange-500 outline-none" value={editingRoute.endTime || ''} onChange={(e) => setEditingRoute({...editingRoute, endTime: e.target.value})} /></div>
                  </div>
                  <div className="flex gap-3 mt-8">
                      <button onClick={() => setEditingRoute(null)} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 rounded-xl transition">Cancelar</button>
                      <button onClick={saveTimeEdit} className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 hover:bg-orange-600 flex items-center justify-center gap-2 transition active:scale-95"><Save className="w-4 h-4" /> Guardar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;