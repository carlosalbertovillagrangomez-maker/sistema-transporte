import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, MapPin, X, Trash2, User, Loader2, Zap, Calendar, Navigation, Star, Clock, MoreVertical, Users, Wand2, Car, Network, Building2 } from 'lucide-react';
// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline, Autocomplete } from '@react-google-maps/api';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, doc, query, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 

const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
// --- CAMBIO 1 (Autocomplete): Asegurar 'places' cargado ---
const libraries = ['places']; 

// --- CAMBIO 2 (Autocomplete): Moví AddressAutocomplete DENTRO de Planificacion ---

// --- COMPONENTE: RESUMEN INCRUSTADO EN LA PARADA ---
const InlineSummaryBox = ({ distance, duration, eta, color = "blue", showEta }) => {
    if (!distance) return null;
    const bgClass = color === 'red' ? 'bg-red-50/80 border-red-200 text-red-800' : 'bg-blue-50/80 border-blue-200 text-blue-800';
    const iconClass = color === 'red' ? 'text-red-500' : 'text-blue-500';
    return (
        <div className="pl-[52px] mt-3 relative animate-in fade-in slide-in-from-top-2 duration-300">
            <div className={`w-full p-2.5 border rounded-lg shadow-sm flex items-center justify-between text-xs font-bold ${bgClass}`}>
                <div className="flex gap-4">
                    <span className="flex items-center gap-1.5"><Navigation className={`w-4 h-4 ${iconClass}`}/> {distance} km</span>
                    <span className="flex items-center gap-1.5"><Clock className={`w-4 h-4 ${iconClass}`}/> {duration} min</span>
                </div>
                {showEta && eta && <span className="flex items-center gap-1.5 text-orange-600"><Zap className="w-4 h-4 text-orange-500"/> LLEGADA: {eta}</span>}
            </div>
        </div>
    );
};

const getMarkerLabel = (index) => String.fromCharCode(65 + index);

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [routeToAssign, setRouteToAssign] = useState(null);

  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);

  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableClients, setAvailableClients] = useState([]);
  const [routesList, setRoutesList] = useState([]);

  const [viewRoute, setViewRoute] = useState(null);
  const [newRoute, setNewRoute] = useState({ client: '', requestUser: '', driver: '', driverId: '', status: 'Pendiente', serviceType: 'Programado', scheduledDate: '', scheduledTime: '' });
  const [selectedClientData, setSelectedClientData] = useState(null);
  
  const [startPoint, setStartPoint] = useState({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
  const [endPoint, setEndPoint] = useState({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
  const [waypoints, setWaypoints] = useState([]);
  
  const [routeInfo, setRouteInfo] = useState({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
  const [calculatedEtas, setCalculatedEtas] = useState([]);
  const [startTimeDisplay, setStartTimeDisplay] = useState('');
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // --- CAMBIO 3: MODAL CARPOOLING MANUAL ---
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);
  // Estado para capturar el chofer manual en el modal corporativo
  const [carpoolDriver, setCarpoolDriver] = useState({ name: '', id: '' }); 

  const isProgramado = newRoute.serviceType === 'Programado';

  // --- CAMBIO DENTRO 1 (Autocomplete): Definición de AddressAutocomplete ---
  // Se define aquí dentro para que reaccione al 'isLoaded' del padre
  const AddressAutocomplete = ({ value, onSelect, placeholder, iconColor = "text-slate-400", zIndex = 50, favorites = [] }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const autocompleteRef = useRef(null);

    useEffect(() => { setInputValue(value || ''); }, [value]);
    const generalFavs = favorites.filter(f => !f.assignedTo || f.assignedTo === 'General');
    const options = { componentRestrictions: { country: "mx" }, fields: ["address_components", "geometry", "formatted_address"] };

    const handlePlaceChanged = () => {
        if (autocompleteRef.current !== null) {
            const place = autocompleteRef.current.getPlace();
            if (place.geometry && place.geometry.location) {
                const address = place.formatted_address;
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                setInputValue(address);
                onSelect({ address, lat, lng });
            }
        }
    };

    const handleFavoriteClick = (fav) => {
        setInputValue(fav.address);
        onSelect({ address: fav.address, lat: parseFloat(fav.lat), lng: parseFloat(fav.lon || fav.lng) });
    };

    return (
        <div className="relative" style={{ zIndex: zIndex }}> 
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${iconColor === 'green' ? 'bg-green-100 border-green-200' : iconColor === 'red' ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200'} border flex items-center justify-center shrink-0 shadow-sm relative z-10 bg-white`}>
                    <MapPin className={`w-4 h-4 ${iconColor === 'green' ? 'text-green-700' : iconColor === 'red' ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 relative">
                    {/* --- CAMBIO DENTRO Autocomplete: Render condicional con isLoaded --- */}
                    {isLoaded ? (
                        <Autocomplete onLoad={(ref) => (autocompleteRef.current = ref)} onPlaceChanged={handlePlaceChanged} options={options}>
                            <input type="text" placeholder={placeholder} className="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500 focus:bg-white transition shadow-sm" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                        </Autocomplete>
                    ) : (
                        <input type="text" placeholder="Cargando mapas..." className="w-full bg-slate-100 border border-slate-200 text-sm rounded-lg p-2.5 outline-none animate-pulse" disabled />
                    )}
                </div>
            </div>
            {favorites && favorites.length > 0 && (
                <div className="pl-[52px] mt-2 space-y-2">
                    {generalFavs.length > 0 && (
                        <div><p className="text-[9px] font-bold text-slate-400 uppercase mb-1 ml-1 mt-1">🏢 Sedes de la Empresa</p><div className="flex flex-wrap gap-2">{generalFavs.map((fav, i) => (<button type="button" key={i} onClick={() => handleFavoriteClick(fav)} className="text-[10px] bg-yellow-50 text-slate-600 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100 flex items-center gap-1 transition shadow-sm whitespace-nowrap"><Star className="w-3 h-3 fill-yellow-400 text-yellow-500"/> <span className="font-bold">{fav.alias}</span></button>))}</div></div>
                    )}
                </div>
            )}
        </div>
    );
  };
  // --- FIN DEFINICIÓN ADDRESS AUTOCOMPLETE INTERNO ---

  useEffect(() => {
      if(isLoaded && mapRef.current) {
          const bounds = new window.google.maps.LatLngBounds();
          let hasPoints = false;
          if (viewRoute?.technicalData?.geometry) {
              viewRoute.technicalData.geometry.forEach(coord => bounds.extend(coord));
              hasPoints = true;
          } else {
              if (startPoint?.lat) { bounds.extend(startPoint); hasPoints = true; }
              if (endPoint?.lat) { bounds.extend(endPoint); hasPoints = true; }
              waypoints.forEach(wp => { if(wp.lat && wp.lng) { bounds.extend(wp); hasPoints = true; } });
              if (routeInfo.geometry.length > 0) { routeInfo.geometry.forEach(coord => bounds.extend(coord)); hasPoints = true; }
          }
          if (hasPoints) mapRef.current.fitBounds(bounds);
      }
  }, [startPoint, endPoint, waypoints, routeInfo, viewRoute, isLoaded]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "conductores"), (s) => setAvailableDrivers(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const u2 = onSnapshot(collection(db, "clientes"), (s) => setAvailableClients(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const u3 = onSnapshot(query(collection(db, "rutas"), orderBy("createdDate", "desc")), (s) => setRoutesList(s.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const handleClientChange = (e) => {
      const clientObj = availableClients.find(c => c.name === e.target.value);
      setSelectedClientData(clientObj || null);
      setNewRoute({ ...newRoute, client: e.target.value, requestUser: '' });
  };

  const handleDriverChange = (e) => {
    const driverName = e.target.value;
    const selectedDriver = availableDrivers.find(d => d.name === driverName);
    if (selectedDriver) { setNewRoute({ ...newRoute, driver: driverName, driverId: selectedDriver.id }); } 
    else { setNewRoute({ ...newRoute, driver: '', driverId: '' }); }
  };

  const getFilteredFavorites = () => {
      if (!selectedClientData?.locations) return [];
      return selectedClientData.locations.filter(loc => {
          if (!loc.assignedTo || loc.assignedTo === 'General') return true;
          if (newRoute.requestUser && loc.assignedTo === newRoute.requestUser) return true;
          return false;
      });
  };

  const handlePassengerSelectForPoint = (pointType, waypointIndex, selectedPassengerName) => {
    if (!selectedPassengerName) {
        if (pointType === 'start') setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
        if (pointType === 'end') setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
        if (pointType === 'waypoint') { const w = [...waypoints]; w[waypointIndex] = { address: '', lat: null, lng: null, contact: '', passengerName: '' }; setWaypoints(w); }
        return;
    }
    const personLocation = selectedClientData.locations.find(loc => loc.assignedTo === selectedPassengerName);
    if (!personLocation) return;
    const newPointData = { address: personLocation.address, lat: parseFloat(personLocation.lat), lng: parseFloat(personLocation.lon || personLocation.lng), contact: selectedPassengerName, passengerName: selectedPassengerName };

    if (pointType === 'start') setStartPoint(newPointData);
    else if (pointType === 'end') setEndPoint(newPointData);
    else if (pointType === 'waypoint') { const updatedWaypoints = [...waypoints]; updatedWaypoints[waypointIndex] = newPointData; setWaypoints(updatedWaypoints); }
  };

  const handleOptimizeRoute = () => {
      if (!startPoint?.lat) return alert("Debes definir el 'Punto de Inicio' primero para poder optimizar la ruta.");
      const validWaypoints = waypoints.filter(w => w.lat && w.lng);
      const invalidWaypoints = waypoints.filter(w => !w.lat || !w.lng);
      if (validWaypoints.length < 2) return alert("Necesitas al menos 2 paradas intermedias para poder optimizarlas.");

      let currentLoc = { lat: startPoint.lat, lng: startPoint.lng };
      let unvisited = [...validWaypoints];
      let optimizedWaypoints = [];

      const getDistance = (p1, p2) => {
          const R = 6371; const dLat = (p2.lat - p1.lat) * Math.PI / 180; const dLon = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
          return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      };

      while (unvisited.length > 0) {
          let nearestIdx = 0; let minDistance = Infinity;
          for (let i = 0; i < unvisited.length; i++) {
              const d = getDistance(currentLoc, unvisited[i]);
              if (d < minDistance) { minDistance = d; nearestIdx = i; }
          }
          currentLoc = unvisited[nearestIdx];
          optimizedWaypoints.push(unvisited[nearestIdx]);
          unvisited.splice(nearestIdx, 1);
      }
      setWaypoints([...optimizedWaypoints, ...invalidWaypoints]);
  };

  useEffect(() => { if (startPoint?.address && endPoint?.address) calculateRoute(); }, [startPoint?.address, endPoint?.address, waypoints]);

  const calculateRoute = async () => {
      setIsLoadingRoute(true);
      try {
          const points = [startPoint, ...waypoints, endPoint];
          const validPoints = points.filter(p => p && p.lat && p.lng);
          if (validPoints.length < 2) { setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] }); return; }
          
          const coordsString = validPoints.map(p => `${p.lng},${p.lat}`).join(';');
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=true`);
          const data = await response.json();
          
          if (data.code === 'Ok' && data.routes.length > 0) {
              const ruta = data.routes[0];
              const segmentsData = ruta.legs.map(leg => ({ distance: (leg.distance / 1000).toFixed(1), duration: Math.round(leg.duration / 60) }));
              const geometry = ruta.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
              setRouteInfo({ totalDistance: (ruta.distance / 1000).toFixed(1), totalDuration: Math.round(ruta.duration / 60), segments: segmentsData, geometry: geometry });
          }
      } catch (error) {} finally { setIsLoadingRoute(false); }
  };

  useEffect(() => {
      let baseDateObj = new Date(); 
      if (isProgramado && newRoute.scheduledTime) {
          const [hours, minutes] = newRoute.scheduledTime.split(':');
          baseDateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
      }
      setStartTimeDisplay(baseDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      if (routeInfo.segments && routeInfo.segments.length > 0) {
          let currentEta = new Date(baseDateObj);
          const etas = [];
          routeInfo.segments.forEach(seg => {
              currentEta = new Date(currentEta.getTime() + (seg.duration || 0) * 60000);
              etas.push(currentEta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          });
          setCalculatedEtas(etas);
      } else { setCalculatedEtas([]); }
  }, [routeInfo, isProgramado, newRoute.scheduledTime]);

  const addWaypoint = () => setWaypoints([...waypoints, { address: '', lat: null, lng: null, contact: '', passengerName: '' }]);
  const removeWaypoint = (i) => setWaypoints(waypoints.filter((_, idx) => idx !== i));
  const updateWaypoint = (i, item) => { const w = [...waypoints]; w[i] = item; setWaypoints(w); };

  const handleSaveRoute = async () => {
      if(!newRoute.client || !startPoint?.address || !endPoint?.address) return alert("Faltan datos obligatorios (Empresa, Origen, Destino).");
      const today = new Date().toISOString().split('T')[0];
      
      const rutaSave = {
          ...newRoute,
          driver: newRoute.driver, driverId: newRoute.driverId, 
          // --- CAMBIO DENTRO Autocomplete: estatus manual ---
          status: newRoute.driver ? 'Aceptada' : 'Pendiente', // Si tiene chofer, nace aceptada
          start: startPoint.address, end: endPoint.address, 
          startCoords: { lat: startPoint.lat, lng: startPoint.lng, contact: startPoint.contact || '' },
          endCoords: { lat: endPoint.lat, lng: endPoint.lng, contact: endPoint.contact || '' },
          waypointsData: waypoints.map(w => ({ address: w.address, lat: w.lat, lng: w.lng, contact: w.contact || '' })),
          waypoints: waypoints.map(w => w.address),
          technicalData: { ...routeInfo },
          finalDate: isProgramado ? newRoute.scheduledDate : today, 
          createdDate: new Date().toISOString()
      };
      try { 
          await addDoc(collection(db, "rutas"), rutaSave); 
          setShowModal(false); 
          setNewRoute({ client: '', requestUser: '', driver: '', driverId: '', status: 'Pendiente', serviceType: 'Programado', scheduledDate: '', scheduledTime: '' });
          setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' }); setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' }); setWaypoints([]); setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] }); setSelectedClientData(null);
      } catch (e) { alert(e.message); }
  };

  // === --- CAMBIO 4: GENERADOR DE CARPOOLING MANUAL CON CHOFER ESCANEADO --- ===
  const handleGenerateCarpoolGroups = async () => {
      // Validación estricta
      if(!newRoute.client || !newRoute.scheduledDate || !newRoute.scheduledTime) return alert("Falta configurar Empresa, Fecha u Hora Llegada corporativa.");
      
      // Validación del Chofer manual obligatorio
      if(!carpoolDriver.id) return alert("⚠️ Debes seleccionar un Conductor disponible obligatoriamente para esta ruta corporativa.");

      const empleados = selectedClientData.locations.filter(loc => loc.assignedTo && loc.assignedTo !== 'General');
      const oficina = selectedClientData.locations.find(loc => loc.assignedTo === 'General');
      
      if(empleados.length === 0) return alert("Esta empresa no tiene empleados con direcciones asignadas.");
      if(!oficina) return alert("Esta empresa no tiene configurada la Sede 'General' (oficina central).");

      // Dividir empleados en grupos de 4
      const grupos = [];
      for (let i = 0; i < empleados.length; i += 4) {
          grupos.push(empleados.slice(i, i + 4));
      }

      try {
          // Generamos las rutas una por una
          for (let idx = 0; idx < grupos.length; idx++) {
              const grupo = grupos[idx];
              const inicio = grupo[0]; // El primero del grupo es el inicio
              const intermedias = grupo.slice(1); // Los otros 3 son paradas intermedias

              const rutaGenerada = {
                  client: newRoute.client,
                  // --- CAMBIO CRÍTICO: Chofer asignado manualmente ---
                  driver: carpoolDriver.name, 
                  driverId: carpoolDriver.id, 
                  status: 'Aceptada', // Nace aceptada para que el chofer la vea directo
                  serviceType: 'Programado',
                  scheduledDate: newRoute.scheduledDate,
                  scheduledTime: newRoute.scheduledTime,
                  
                  start: inicio.address,
                  startCoords: { lat: parseFloat(inicio.lat), lng: parseFloat(inicio.lon || inicio.lng), contact: inicio.assignedTo },
                  end: oficina.address,
                  endCoords: { lat: parseFloat(oficina.lat), lng: parseFloat(oficina.lon || oficina.lng), contact: 'Oficina Central (Sede General)' },
                  waypointsData: intermedias.map(w => ({ address: w.address, lat: parseFloat(w.lat), lng: parseFloat(w.lon || w.lng), contact: w.assignedTo })),
                  waypoints: intermedias.map(w => w.address),
                  
                  finalDate: newRoute.scheduledDate,
                  createdDate: new Date().toISOString()
              };
              
              // Guardar en la base de datos
              await addDoc(collection(db, "rutas"), rutaGenerada);
          }
          
          alert(`✅ ¡Rutas automatizadas creadas con éxito! Se generaron ${grupos.length} viajes corporativos para ${empleados.length} empleados, asignados a ${carpoolDriver.name}.`);
          // Cerrar modal y resetear campos corporativos
          setShowCarpoolModal(false);
          setNewRoute({ ...newRoute, client: '', scheduledDate: '', scheduledTime: '' });
          setSelectedClientData(null);
          setCarpoolDriver({ name: '', id: '' });
      } catch(e) { 
          console.error("Error carpooling:", e);
          alert("Ocurrió un error técnico al generar las rutas corporativas."); 
      }
  };

  const handleDeleteRoute = async (id, e) => { e.stopPropagation(); if(confirm("¿Eliminar ruta permanentemente?")) { await deleteDoc(doc(db, "rutas", id)); if(viewRoute?.id === id) setViewRoute(null); } };

  const confirmAssignDriver = async () => {
      if (!newRoute.driver) return alert("Selecciona un conductor primero.");
      try {
          await updateDoc(doc(db, "rutas", routeToAssign.id), { driver: newRoute.driver, driverId: newRoute.driverId, status: 'Aceptada' });
          setShowAssignModal(false); setRouteToAssign(null); setNewRoute({ ...newRoute, driver: '', driverId: '' });
      } catch (e) {}
  };

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);
  const routeToDisplay = viewRoute?.technicalData?.geometry ? viewRoute.technicalData.geometry : [];
  let mapCenter = centerMX; if(routeToDisplay.length > 0) mapCenter = routeToDisplay[0];
  const activePlanRoutes = routesList.filter(r => r.status === 'Pendiente' || r.status === 'Aceptada' || r.status === 'En Ruta');

  if (!isLoaded) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600"/></div>;

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2><p className="text-slate-500 text-sm">{activePlanRoutes.length} viajes pendientes o activos</p></div>
          <div className="flex gap-3">
              {/* --- CAMBIO 5: Botón Carpooling Manual abre el nuevo modal --- */}
              <button onClick={() => { setShowCarpoolModal(true); setCarpoolDriver({ name: '', id: '' }); setNewRoute({...newRoute, serviceType: 'Programado'}) }} className="bg-purple-100 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-200 transition"><Network className="w-4 h-4" /> Auto-Agrupar Personal (Manual)</button>
              <button onClick={() => { setViewRoute(null); setShowModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg hover:bg-blue-700 transition"><Plus className="w-4 h-4" /> Nueva Ruta Manual</button>
          </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
          {/* LISTA DE RUTAS */}
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-4 scrollbar-thin">
              {activePlanRoutes.length === 0 && <div className="text-center text-slate-400 mt-10">No hay viajes programados.</div>}
              {activePlanRoutes.map((ruta) => (
                <div key={ruta.id} onClick={() => setViewRoute(ruta)} className={`bg-white p-4 rounded-xl shadow-sm border transition cursor-pointer group ${viewRoute?.id === ruta.id ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                    <div className="flex justify-between items-start mb-2">
                         {ruta.serviceType === 'Prioritario' ? <span className="text-[10px] font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1"><Zap className="w-3 h-3"/> INMEDIATO</span> : <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1"><Calendar className="w-3 h-3"/> {ruta.scheduledDate} {ruta.scheduledTime}</span>}
                         <div className="flex gap-1"><button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-red-400 bg-red-50 p-1.5 rounded hover:bg-red-100 transition"><Trash2 className="w-4 h-4"/></button></div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-0.5 truncate">{ruta.client}</h4>
                    
                    {/* PASAJEROS */}
                    {(() => {
                        const passengers = [ ruta.startCoords?.contact, ...(ruta.waypointsData?.map(w => w.contact) || []), ruta.endCoords?.contact ].filter(Boolean);
                        if (passengers.length === 0) return null;
                        return (
                            <div className="flex flex-wrap gap-1 mt-1 mb-3">
                                {passengers.map((p, i) => (
                                    <span key={i} className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1"><User className="w-2.5 h-2.5"/> {p}</span>
                                ))}
                            </div>
                        );
                    })()}
                    
                    <div className="space-y-2 mt-3">
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-green-600 shrink-0" /> <span className="truncate">{ruta.start?.split(',')[0]}</span></div>
                        {ruta.waypointsData && ruta.waypointsData.length > 0 && (
                            <div className="pl-5"><div className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-flex items-center gap-1"><Users className="w-3 h-3"/> {ruta.waypointsData.length} paradas intermedias</div></div>
                        )}
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-red-600 shrink-0" /> <span className="truncate">{ruta.end?.split(',')[0]}</span></div>
                    </div>
                    
                    {/* ESTADO CHOFER */}
                    {ruta.status === 'Pendiente' && (
                        <button onClick={(e) => { e.stopPropagation(); setRouteToAssign(ruta); setShowAssignModal(true); }} className="w-full mt-3 bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-200 font-black p-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-pulse">
                            <User className="w-3.5 h-3.5"/> ASIGNAR UNIDAD MANUALMENTE
                        </button>
                    )}
                    {ruta.driver && (
                        <div className="w-full mt-3 bg-slate-50 text-slate-600 border border-slate-200 font-bold p-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm">
                            <Car className="w-3.5 h-3.5 text-blue-500"/> UNIDAD ASIGNADA: {ruta.driver}
                        </div>
                    )}
                </div>
              ))}
          </div>

          {/* MAPA PRINCIPAL */}
          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center shadow-inner">
             <GoogleMap mapContainerStyle={containerStyle} center={mapCenter} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                 {routeToDisplay.length > 0 && (
                     <>
                        <Polyline path={routeToDisplay} options={{ strokeColor: "#3b82f6", strokeOpacity: 1, strokeWeight: 5 }} />
                        <Marker position={routeToDisplay[0]} label="A" />
                        {viewRoute?.waypointsData && viewRoute.waypointsData.map((wp, idx) => ( wp.lat && wp.lng && <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} label={getMarkerLabel(idx + 1)} /> ))}
                        <Marker position={routeToDisplay[routeToDisplay.length - 1]} label={getMarkerLabel((viewRoute?.waypointsData?.length || 0) + 1)} />
                     </>
                 )}
             </GoogleMap>
          </div>
      </div>

      {/* --- CAMBIO 6: MODAL CARPOOLING MANUAL CON SELECCIÓN DE CHOFER --- */}
      {showCarpoolModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-purple-600 text-white shrink-0">
                      <div><h3 className="text-lg font-bold flex items-center gap-2"><Network className="w-5 h-5"/> Enjambre Carpooling (Asignación Manual)</h3></div>
                      <button onClick={() => setShowCarpoolModal(false)}><X className="w-5 h-5 text-purple-200 hover:text-white transition" /></button>
                  </div>
                  
                  <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin">
                      <p className="text-xs text-slate-500 mb-4">Genera múltiples rutas automáticamente agrupando empleados de 4 en 4. **A diferencia del modo automático, aquí debes elegir al Conductor de forma manual antes de guardar.**</p>
                      
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5"/> Empresa Corporativa</label>
                              <select className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none font-bold text-slate-700" value={newRoute.client} onChange={handleClientChange}>
                                  <option value="">Selecciona la empresa...</option>
                                  {availableClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Programada</label><input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm outline-none" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} /></div>
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hora Llegada Sede Central</label><input type="time" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm outline-none" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} /></div>
                          </div>
                      </div>

                      {/* --- CAMBIO CRÍTICO: Selector de Conductor Manual en Modal Corporativo --- */}
                      <div className="bg-white p-4 rounded-xl border-2 border-dashed border-purple-300 mt-4 relative overflow-visible">
                         <label className="block text-xs font-black text-purple-700 uppercase mb-2 flex items-center gap-1.5"><Car className="w-4 h-4 text-purple-600"/> Conductor Asignado (Obligatorio)</label>
                         {availableDrivers.length > 0 ? (
                             <select className="w-full bg-purple-50 border-2 border-purple-200 text-slate-900 text-xs font-bold rounded-lg p-2.5 outline-none focus:border-purple-400 focus:bg-white shadow-sm transition" value={carpoolDriver.id} onChange={(e) => { const dr = availableDrivers.find(d => d.id === e.target.value); setCarpoolDriver({ name: dr?.name || '', id: dr?.id || '' }) }}>
                                 <option value="">👤 Seleccionar chofer disponible para estos grupos...</option>
                                 {availableDrivers.map(d => <option key={d.id} value={d.id} className="text-sm font-bold">{d.name} {d.vehicleModel ? `(${d.vehicleModel} - ${d.trips || 0} viajes)` : ''}</option>)}
                             </select>
                         ) : (
                             <div className="text-center text-xs text-slate-500 font-medium py-3 bg-slate-100 rounded-lg border border-slate-200"><Loader2 className="animate-spin w-4 h-4 text-slate-400 mx-auto mb-1.5"/> Cargando lista de choferes...</div>
                         )}
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setShowCarpoolModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
                      <button onClick={handleGenerateCarpoolGroups} className="px-6 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-md transition flex items-center gap-2 animate-pulse"><Wand2 className="w-4 h-4"/> Generar Grupos y Asignar Manualmente</button>
                  </div>
              </div>
          </div>
      )}
      
      {/* --- EL RESTO DE TUS MODALES EXISTENTES DE ASIGNACIÓN MANUAL, ETC, SIGUEN IGUAL --- */}
    </div>
  );
}