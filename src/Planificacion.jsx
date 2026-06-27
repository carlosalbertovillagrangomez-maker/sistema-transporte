import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, MapPin, X, Trash2, User, Loader2, Zap, Calendar, Navigation, Star, Clock, MoreVertical, Users, Wand2, Car, Network, Building2, Eye, RefreshCw, GripVertical, Search, ArrowRight, ChevronLeft } from 'lucide-react';
// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline, Autocomplete } from '@react-google-maps/api';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, doc, query, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 

const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
const libraries = ['places', 'geometry'];

// --- COMPONENTES AUXILIARES ---
const AddressAutocomplete = ({ isLoaded, value, onSelect, placeholder, iconColor = "text-slate-400", zIndex = 50, favorites = [] }) => {
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
    const handleFavoriteClick = (fav) => { setInputValue(fav.address); onSelect({ address: fav.address, lat: parseFloat(fav.lat), lng: parseFloat(fav.lon || fav.lng) }); };

    return (
        <div className="relative" style={{ zIndex: zIndex }}> 
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${iconColor === 'green' ? 'bg-green-100 border-green-200' : iconColor === 'red' ? 'bg-red-100 border-red-200' : iconColor === 'orange' ? 'bg-orange-100 border-orange-200' : 'bg-slate-100 border-slate-200'} border flex items-center justify-center shrink-0 shadow-sm relative z-10 bg-white`}>
                    <MapPin className={`w-4 h-4 ${iconColor === 'green' ? 'text-green-700' : iconColor === 'red' ? 'text-red-600' : iconColor === 'orange' ? 'text-orange-600' : 'text-slate-600'}`} />
                </div>
                <div className="flex-1 relative">
                    {isLoaded ? (
                        <Autocomplete onLoad={(ref) => (autocompleteRef.current = ref)} onPlaceChanged={handlePlaceChanged} options={options}>
                            <input type="text" placeholder={placeholder} className="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-orange-500 focus:bg-white transition shadow-sm" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                        </Autocomplete>
                    ) : ( <input type="text" placeholder="Cargando mapas..." className="w-full bg-slate-100 border border-slate-200 text-sm rounded-lg p-2.5 outline-none animate-pulse" disabled /> )}
                </div>
            </div>
            {favorites && favorites.length > 0 && (
                <div className="pl-[52px] mt-2 space-y-2">
                    {generalFavs.length > 0 && ( <div><p className="text-[9px] font-bold text-slate-400 uppercase mb-1 ml-1 mt-1">🏢 Sedes de la Empresa</p><div className="flex flex-wrap gap-2">{generalFavs.map((fav, i) => (<button type="button" key={i} onClick={() => handleFavoriteClick(fav)} className="text-[10px] bg-yellow-50 text-slate-600 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100 flex items-center gap-1 transition shadow-sm whitespace-nowrap"><Star className="w-3 h-3 fill-yellow-400 text-yellow-500"/> <span className="font-bold">{fav.alias}</span></button>))}</div></div> )}
                </div>
            )}
        </div>
    );
};

const EmployeeSearch = ({ employees, value, onSelect, placeholder }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    useEffect(() => { setQuery(value || ''); }, [value]);
    const filtered = employees.filter(e => e.assignedTo?.toLowerCase().includes(query.toLowerCase()) || e.address?.toLowerCase().includes(query.toLowerCase()));

    return (
        <div className="relative w-full">
            <div className="flex items-center absolute left-3 top-2.5 text-orange-500"><Search className="w-4 h-4"/></div>
            <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2 pl-9 text-xs font-bold text-slate-800 outline-none focus:border-orange-400 shadow-sm" placeholder={placeholder} value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
            {open && query && (
                <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 shadow-xl max-h-40 overflow-y-auto rounded-lg">
                    {filtered.length === 0 ? <p className="p-2 text-xs text-slate-400">Sin resultados</p> : filtered.map((emp, i) => (
                        <div key={i} className="p-2 border-b border-slate-50 hover:bg-orange-50 cursor-pointer transition" onClick={() => { setQuery(''); onSelect(emp); setOpen(false); }}>
                            <p className="text-xs font-black text-slate-700">{emp.assignedTo}</p><p className="text-[9px] text-slate-400 truncate">{emp.address}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const InlineSummaryBox = ({ distance, duration, eta, color = "slate", showEta }) => {
    if (!distance) return null;
    const bgClass = color === 'red' ? 'bg-red-50/80 border-red-200 text-red-800' : 'bg-slate-50/80 border-slate-200 text-slate-800';
    const iconClass = color === 'red' ? 'text-red-500' : 'text-slate-500';
    return (
        <div className="pl-[52px] mt-3 relative animate-in fade-in slide-in-from-top-2 duration-300">
            <div className={`w-full p-2.5 border rounded-lg shadow-sm flex items-center justify-between text-xs font-bold ${bgClass}`}>
                <div className="flex gap-4"><span className="flex items-center gap-1.5"><Navigation className={`w-4 h-4 ${iconClass}`}/> {distance} km</span><span className="flex items-center gap-1.5"><Clock className={`w-4 h-4 ${iconClass}`}/> {duration} min</span></div>
                {showEta && eta && <span className="flex items-center gap-1.5 text-orange-600"><Zap className="w-4 h-4 text-orange-500"/> LLEGADA: {eta}</span>}
            </div>
        </div>
    );
};

const getMarkerLabel = (index) => String.fromCharCode(65 + index);
const PREVIEW_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#eab308', '#ec4899'];

// FUNCIONES MATEMÁTICAS DE DISTANCIA
const getDistance = (p1, p2) => {
    const R = 6371; const dLat = (p2.lat - p1.lat) * Math.PI / 180; const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [routeToAssign, setRouteToAssign] = useState(null);

  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);
  const previewMapRef = useRef(null);

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

  // === ESTADOS MÓDULO CARPOOLING INTELIGENTE (WIZARD) ===
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);
  const [carpoolStep, setCarpoolStep] = useState(1); 
  const [employeeRoster, setEmployeeRoster] = useState([]); 
  const [rosterSearch, setRosterSearch] = useState(''); // NUEVO: Buscador de personal
  
  const [carpoolGroups, setCarpoolGroups] = useState([]);
  const [previewGroupId, setPreviewGroupId] = useState('all'); 
  const [fetchingRealRoutes, setFetchingRealRoutes] = useState(false);
  const [globalCarpool, setGlobalCarpool] = useState({ mode: 'Ida' });

  const isProgramado = newRoute.serviceType === 'Programado';

  useEffect(() => {
      if(isLoaded && mapRef.current) {
          const bounds = new window.google.maps.LatLngBounds();
          let hasPoints = false;
          if (viewRoute?.technicalData?.geometry) { viewRoute.technicalData.geometry.forEach(coord => bounds.extend(coord)); hasPoints = true; } 
          else {
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
    const driverName = e.target.value; const selectedDriver = availableDrivers.find(d => d.name === driverName);
    if (selectedDriver) setNewRoute({ ...newRoute, driver: driverName, driverId: selectedDriver.id }); else setNewRoute({ ...newRoute, driver: '', driverId: '' });
  };
  const getFilteredFavorites = () => {
      if (!selectedClientData?.locations) return [];
      return selectedClientData.locations.filter(loc => {
          if (!loc.assignedTo || loc.assignedTo === 'General') return true;
          if (newRoute.requestUser && loc.assignedTo === newRoute.requestUser) return true;
          return false;
      });
  };

  const handlePassengerSelectForPoint = (pointType, waypointIndex, empObj) => {
    if (!empObj) {
        if (pointType === 'start') setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
        if (pointType === 'end') setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' });
        if (pointType === 'waypoint') { const w = [...waypoints]; w[waypointIndex] = { address: '', lat: null, lng: null, contact: '', passengerName: '' }; setWaypoints(w); }
        return;
    }
    const newPointData = { address: empObj.address, lat: parseFloat(empObj.lat), lng: parseFloat(empObj.lon || empObj.lng), contact: empObj.assignedTo, passengerName: empObj.assignedTo };
    if (pointType === 'start') setStartPoint(newPointData);
    else if (pointType === 'end') setEndPoint(newPointData);
    else if (pointType === 'waypoint') { const updatedWaypoints = [...waypoints]; updatedWaypoints[waypointIndex] = newPointData; setWaypoints(updatedWaypoints); }
  };

  const handleOptimizeRoute = () => {
      if (!startPoint?.lat) return alert("Debes definir el 'Punto de Inicio' primero para poder optimizar la ruta.");
      const validWaypoints = waypoints.filter(w => w.lat && w.lng); const invalidWaypoints = waypoints.filter(w => !w.lat || !w.lng);
      if (validWaypoints.length < 2) return alert("Necesitas al menos 2 paradas intermedias para poder optimizarlas.");
      let currentLoc = { lat: startPoint.lat, lng: startPoint.lng }; let unvisited = [...validWaypoints]; let optimizedWaypoints = [];
      while (unvisited.length > 0) {
          let nearestIdx = 0; let minDistance = Infinity;
          for (let i = 0; i < unvisited.length; i++) { const d = getDistance(currentLoc, unvisited[i]); if (d < minDistance) { minDistance = d; nearestIdx = i; } }
          currentLoc = unvisited[nearestIdx]; optimizedWaypoints.push(unvisited[nearestIdx]); unvisited.splice(nearestIdx, 1);
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
      if (isProgramado && newRoute.scheduledTime) { const [hours, minutes] = newRoute.scheduledTime.split(':'); baseDateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0); }
      setStartTimeDisplay(baseDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (routeInfo.segments && routeInfo.segments.length > 0) {
          let currentEta = new Date(baseDateObj); const etas = [];
          routeInfo.segments.forEach(seg => { currentEta = new Date(currentEta.getTime() + (seg.duration || 0) * 60000); etas.push(currentEta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); });
          setCalculatedEtas(etas);
      } else { setCalculatedEtas([]); }
  }, [routeInfo, isProgramado, newRoute.scheduledTime]);

  const addWaypoint = () => setWaypoints([...waypoints, { address: '', lat: null, lng: null, contact: '', passengerName: '' }]);
  const removeWaypoint = (i) => setWaypoints(waypoints.filter((_, idx) => idx !== i));
  const updateWaypoint = (i, item) => { const w = [...waypoints]; w[i] = item; setWaypoints(w); };

  const handleSaveRoute = async () => {
      if(!newRoute.client || !startPoint?.address || !endPoint?.address) return alert("Faltan datos obligatorios (Empresa, Origen, Destino).");
      const today = new Date().toISOString().split('T')[0];
      const rutaSave = { ...newRoute, driver: newRoute.driver, driverId: newRoute.driverId, status: newRoute.driver ? 'Aceptada' : 'Pendiente', start: startPoint.address, end: endPoint.address, startCoords: { lat: startPoint.lat, lng: startPoint.lng, contact: startPoint.contact || '' }, endCoords: { lat: endPoint.lat, lng: endPoint.lng, contact: endPoint.contact || '' }, waypointsData: waypoints.map(w => ({ address: w.address, lat: w.lat, lng: w.lng, contact: w.contact || '' })), waypoints: waypoints.map(w => w.address), technicalData: { ...routeInfo }, finalDate: isProgramado ? newRoute.scheduledDate : today, createdDate: new Date().toISOString() };
      try { 
          await addDoc(collection(db, "rutas"), rutaSave); 
          setShowModal(false); setNewRoute({ client: '', requestUser: '', driver: '', driverId: '', status: 'Pendiente', serviceType: 'Programado', scheduledDate: '', scheduledTime: '' });
          setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' }); setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '' }); setWaypoints([]); setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] }); setSelectedClientData(null);
      } catch (e) { alert(e.message); }
  };

  // =================================================================================
  // === LÓGICA DEL MÓDULO DE CARPOOLING INTELIGENTE (WIZARD ETAPAS) ===
  // =================================================================================

  const openCarpoolModal = () => {
      setShowCarpoolModal(true);
      setCarpoolStep(1); // Iniciamos en la Etapa 1
      setNewRoute({...newRoute, client: '', serviceType: 'Programado', scheduledDate: ''});
      setCarpoolGroups([]);
      setEmployeeRoster([]);
      setRosterSearch(''); // Limpiar buscador
      setPreviewGroupId('all');
      setGlobalCarpool({ mode: 'Ida' });
      setSelectedClientData(null);
  };

  const handleCarpoolClientChange = (e) => {
      const clientName = e.target.value;
      setNewRoute({ ...newRoute, client: clientName });
      const clientObj = availableClients.find(c => c.name === clientName);
      setSelectedClientData(clientObj || null);
      setCarpoolGroups([]); 
      setRosterSearch(''); // Limpiar buscador al cambiar de empresa

      // ETAPA 1: Cargar el Roster (Lista Plana de Empleados)
      if (clientObj) {
          const activeUserNames = clientObj.users?.map(u => u.name) || [];
          const emps = clientObj.locations.filter(loc => loc.assignedTo && loc.assignedTo !== 'General' && activeUserNames.includes(loc.assignedTo));
          
          const initialRoster = emps.map(emp => {
              const uData = clientObj.users?.find(u => u.name === emp.assignedTo) || {};
              return {
                  ...emp,
                  included: false, // Opt-in por defecto
                  entrada: uData.entrada || '08:00',
                  salida: uData.salida || '17:00'
              }
          });
          setEmployeeRoster(initialRoster);
      } else { setEmployeeRoster([]); }
  };

  const updateRosterItem = (originalIndex, field, value) => {
      setEmployeeRoster(prev => {
          const newRoster = [...prev];
          newRoster[originalIndex][field] = value;
          return newRoster;
      });
  };

  // --- CALCULAR RUTAS REALES CON OSRM PARA LAS CUADRILLAS ---
  const fetchRealRoutesForGroups = async (groups) => {
      setFetchingRealRoutes(true);
      const oficina = selectedClientData?.locations?.find(l => l.assignedTo === 'General');
      const endPointObj = oficina && oficina.lat ? { lat: parseFloat(oficina.lat), lng: parseFloat(oficina.lon || oficina.lng) } : null;
      
      let updatedGroups = [...groups];
      
      for (let i = 0; i < updatedGroups.length; i++) {
          let g = updatedGroups[i];
          const isShared = g.sharedMeetingPoint.active && g.sharedMeetingPoint.lat && ['Ambos', globalCarpool.mode].includes(g.sharedMeetingPoint.type || 'Ambos');
          
          let points = [];
          if (globalCarpool.mode === 'Ida') {
              if (isShared) {
                  points.push({ lat: parseFloat(g.sharedMeetingPoint.lat), lng: parseFloat(g.sharedMeetingPoint.lng) });
                  if(endPointObj) points.push(endPointObj);
              } else {
                  g.employees.forEach(emp => { if(emp.lat) points.push({ lat: parseFloat(emp.lat), lng: parseFloat(emp.lon || emp.lng) }); });
                  if(endPointObj) points.push(endPointObj);
              }
          } else {
              if(endPointObj) points.push(endPointObj);
              if (isShared) {
                  points.push({ lat: parseFloat(g.sharedMeetingPoint.lat), lng: parseFloat(g.sharedMeetingPoint.lng) });
              } else {
                  g.employees.forEach(emp => { if(emp.lat) points.push({ lat: parseFloat(emp.lat), lng: parseFloat(emp.lon || emp.lng) }); });
              }
          }

          if (points.length >= 2) {
              const coordsString = points.map(p => `${p.lng},${p.lat}`).join(';');
              try {
                  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`);
                  const data = await res.json();
                  if (data.code === 'Ok' && data.routes.length > 0) {
                      const geometry = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                      updatedGroups[i].routeGeometry = geometry;
                  }
              } catch(e) { console.error("OSRM Error", e); }
          } else { updatedGroups[i].routeGeometry = []; }
      }
      setCarpoolGroups(updatedGroups);
      setFetchingRealRoutes(false);
  };

  const isEmpInAnyGroup = (name) => { return carpoolGroups.some(g => g.employees.some(e => e.assignedTo === name)); };

  const addEmployeeToGroup = async (groupId, empObj) => {
      if(!empObj) return;
      let newGroups = [];
      setCarpoolGroups(prev => {
          // 1. Limpiamos al empleado de CUALQUIER otra cuadrilla
          const cleanedGroups = prev.map(g => ({
              ...g,
              employees: g.employees.filter(e => e.assignedTo !== empObj.assignedTo)
          }));

          // 2. Lo agregamos a la cuadrilla destino
          newGroups = cleanedGroups.map(g => {
              if (g.id === groupId) {
                  if (g.employees.length >= 4) { alert("El vehículo ya está lleno."); return g; }
                  return { ...g, employees: [...g.employees, empObj] };
              }
              return g;
          });
          return newGroups;
      });
      setTimeout(() => fetchRealRoutesForGroups(newGroups), 100);
  };

  // --- FUNCIÓN MAESTRA: AGRUPAR GEOGRÁFICAMENTE DESDE EL MÁS LEJANO + HORARIO ---
  const handleGenerateStep2 = () => {
      if(!selectedClientData) return alert("Selecciona una empresa primero.");
      const mode = globalCarpool.mode; 
      
      const activeEmps = employeeRoster.filter(emp => emp.included);
      if(activeEmps.length === 0) return alert("No hay empleados seleccionados para planificar.");

      const oficina = selectedClientData.locations.find(l => l.assignedTo === 'General');
      if(!oficina || !oficina.lat) return alert("La empresa no tiene una ubicación 'General' configurada.");
      const ofiCoords = { lat: parseFloat(oficina.lat), lng: parseFloat(oficina.lon || oficina.lng) };

      const timeBuckets = {};

      activeEmps.forEach(emp => {
          const tKey = mode === 'Ida' ? (emp.entrada || '08:00') : (emp.salida || '17:00');
          if(!timeBuckets[tKey]) timeBuckets[tKey] = [];
          timeBuckets[tKey].push(emp);
      });

      let newGroups = [];
      let groupIdx = 0;

      Object.keys(timeBuckets).forEach(tKey => {
          let unassignedValid = timeBuckets[tKey].filter(e => e.lat);
          const invalidEmps = timeBuckets[tKey].filter(e => !e.lat);
          
          while(unassignedValid.length > 0) {
              let currentGrp = [];
              
              unassignedValid.sort((a,b) => {
                  const distA = Math.pow(parseFloat(a.lat) - ofiCoords.lat, 2) + Math.pow(parseFloat(a.lon||a.lng) - ofiCoords.lng, 2);
                  const distB = Math.pow(parseFloat(b.lat) - ofiCoords.lat, 2) + Math.pow(parseFloat(b.lon||b.lng) - ofiCoords.lng, 2);
                  return distB - distA; 
              });
              
              let seed = unassignedValid.shift(); 
              currentGrp.push(seed);

              while(currentGrp.length < 4 && unassignedValid.length > 0) {
                  unassignedValid.sort((a,b) => {
                      const distA = Math.pow(parseFloat(a.lat) - parseFloat(seed.lat), 2) + Math.pow(parseFloat(a.lon||a.lng) - parseFloat(seed.lon||seed.lng), 2);
                      const distB = Math.pow(parseFloat(b.lat) - parseFloat(seed.lat), 2) + Math.pow(parseFloat(b.lon||b.lng) - parseFloat(seed.lon||seed.lng), 2);
                      return distA - distB; 
                  });
                  currentGrp.push(unassignedValid.shift());
              }

              let isShared = false;
              const hourStr = tKey ? tKey.split(':')[0] : '8';
              const hour = parseInt(hourStr, 10) || 8;
              
              if (mode === 'Ida' && hour >= 7) isShared = true;
              if (mode === 'Regreso' && hour < 20) isShared = true;

              newGroups.push({
                  id: `group_${groupIdx++}`,
                  employees: currentGrp,
                  timeKey: tKey, 
                  driverId: '',
                  driverName: '',
                  sharedMeetingPoint: { active: isShared, address: '', lat: null, lng: null },
                  routeGeometry: [] 
              });
          }

          while(invalidEmps.length > 0) {
              newGroups.push({
                  id: `group_${groupIdx++}`,
                  employees: invalidEmps.splice(0, 4),
                  timeKey: tKey,
                  driverId: '',
                  driverName: '',
                  sharedMeetingPoint: { active: false, address: '', lat: null, lng: null },
                  routeGeometry: []
              });
          }
      });

      setCarpoolGroups(newGroups);
      setCarpoolStep(2); 
      fetchRealRoutesForGroups(newGroups); 
  };

  const removeEmployeeFromGroup = (groupId, empIndex) => {
      let newGroups = [];
      setCarpoolGroups(prev => {
          newGroups = prev.map(g => {
              if (g.id === groupId) {
                  const newEmp = [...g.employees];
                  newEmp.splice(empIndex, 1);
                  return { ...g, employees: newEmp };
              }
              return g;
          });
          return newGroups;
      });
      fetchRealRoutesForGroups(newGroups);
  };

  const handleDragStart = (e, groupId, empIndex) => { e.dataTransfer.setData('sourceGroupId', groupId); e.dataTransfer.setData('sourceEmpIndex', empIndex.toString()); };

  const handleDrop = (e, targetGroupId, targetEmpIndex) => {
      e.preventDefault();
      const sourceGroupId = e.dataTransfer.getData('sourceGroupId');
      const sourceEmpIndex = parseInt(e.dataTransfer.getData('sourceEmpIndex'), 10);

      let resultedGroups = [];

      if (sourceGroupId === targetGroupId) {
          setCarpoolGroups(prev => {
              const newGroups = [...prev];
              const gIdx = newGroups.findIndex(g => g.id === targetGroupId);
              const emps = [...newGroups[gIdx].employees];
              const [moved] = emps.splice(sourceEmpIndex, 1);
              emps.splice(targetEmpIndex, 0, moved);
              newGroups[gIdx] = { ...newGroups[gIdx], employees: emps };
              resultedGroups = newGroups; return newGroups;
          });
      } else {
          setCarpoolGroups(prev => {
              const newGroups = [...prev];
              const sIdx = newGroups.findIndex(g => g.id === sourceGroupId);
              const tIdx = newGroups.findIndex(g => g.id === targetGroupId);
              if (newGroups[tIdx].employees.length >= 4) { alert("Este grupo ya está lleno"); resultedGroups = newGroups; return prev; }
              const sEmps = [...newGroups[sIdx].employees];
              const [moved] = sEmps.splice(sourceEmpIndex, 1);
              const tEmps = [...newGroups[tIdx].employees];
              tEmps.splice(targetEmpIndex, 0, moved);
              newGroups[sIdx] = { ...newGroups[sIdx], employees: sEmps };
              newGroups[tIdx] = { ...newGroups[tIdx], employees: tEmps };
              resultedGroups = newGroups; return newGroups;
          });
      }
      setTimeout(() => fetchRealRoutesForGroups(resultedGroups), 100);
  };

  const setGroupDriver = (groupId, driverId) => {
      const driver = availableDrivers.find(d => d.id === driverId);
      setCarpoolGroups(prev => prev.map(g => g.id === groupId ? { ...g, driverId, driverName: driver?.name || '' } : g));
  };

  useEffect(() => {
      if(isLoaded && previewMapRef.current && carpoolGroups.length > 0 && selectedClientData) {
          const bounds = new window.google.maps.LatLngBounds();
          const oficina = selectedClientData.locations.find(loc => loc.assignedTo === 'General');
          let hasPoints = false;
          if (oficina && oficina.lat) { bounds.extend({ lat: parseFloat(oficina.lat), lng: parseFloat(oficina.lon || oficina.lng) }); hasPoints = true; }

          carpoolGroups.forEach(g => {
              if (previewGroupId === 'all' || previewGroupId === g.id) {
                  if (g.routeGeometry && g.routeGeometry.length > 0) {
                      g.routeGeometry.forEach(p => bounds.extend(p)); hasPoints = true;
                  } else {
                      if (g.sharedMeetingPoint.active && g.sharedMeetingPoint.lat) {
                          bounds.extend({ lat: parseFloat(g.sharedMeetingPoint.lat), lng: parseFloat(g.sharedMeetingPoint.lng) }); hasPoints = true;
                      } else {
                          g.employees.forEach(emp => { if (emp.lat) { bounds.extend({ lat: parseFloat(emp.lat), lng: parseFloat(emp.lon || emp.lng) }); hasPoints = true; } });
                      }
                  }
              }
          });
          if (hasPoints) { previewMapRef.current.fitBounds(bounds); previewMapRef.current.panToBounds(bounds, 50); }
      }
  }, [previewGroupId, carpoolGroups, selectedClientData, isLoaded]);

  const handleConfirmAndDispatch = async () => {
      if(!newRoute.client || !newRoute.scheduledDate) return alert("Falta configurar Empresa y Fecha.");
      const oficina = selectedClientData?.locations.find(loc => loc.assignedTo === 'General');
      if(!oficina) return alert("Esta empresa no tiene configurada la Sede 'General'.");
      const validGroups = carpoolGroups.filter(g => g.employees.length > 0);
      if(validGroups.length === 0) return alert("No hay grupos para programar.");

      for(let g of validGroups) {
          if(!g.driverId) return alert("⚠️ Todos los grupos deben tener un conductor asignado.");
          if(g.sharedMeetingPoint.active && !g.sharedMeetingPoint.lat) return alert("⚠️ Activaste un Punto de Reunión pero no seleccionaste ubicación en el mapa.");
      }

      try {
          for (let g of validGroups) {
              const isShared = g.sharedMeetingPoint?.active && g.sharedMeetingPoint?.lat && ['Ambos', globalCarpool.mode].includes(g.sharedMeetingPoint.type || 'Ambos');
              const allPassengersString = g.employees.map(e => e.assignedTo).join(', ');

              let startAddress, startLat, startLng, startContact;
              let endAddress, endLat, endLng, endContact;
              let waypointsData = [], waypoints = [];

              if (globalCarpool.mode === 'Ida') {
                  if (isShared) {
                      startAddress = g.sharedMeetingPoint.address; startLat = parseFloat(g.sharedMeetingPoint.lat); startLng = parseFloat(g.sharedMeetingPoint.lng); startContact = allPassengersString; 
                  } else {
                      const inicio = g.employees[0]; const intermedias = g.employees.slice(1);
                      startAddress = inicio.address; startLat = parseFloat(inicio.lat); startLng = parseFloat(inicio.lon || inicio.lng); startContact = inicio.assignedTo;
                      waypointsData = intermedias.map(w => ({ address: w.address, lat: parseFloat(w.lat), lng: parseFloat(w.lon || w.lng), contact: w.assignedTo }));
                      waypoints = intermedias.map(w => w.address);
                  }
                  endAddress = oficina.address; endLat = parseFloat(oficina.lat); endLng = parseFloat(oficina.lon || oficina.lng); endContact = 'Oficina Central';
              } else {
                  startAddress = oficina.address; startLat = parseFloat(oficina.lat); startLng = parseFloat(oficina.lon || oficina.lng); startContact = 'Oficina Central';
                  if (isShared) {
                      endAddress = g.sharedMeetingPoint.address; endLat = parseFloat(g.sharedMeetingPoint.lat); endLng = parseFloat(g.sharedMeetingPoint.lng); endContact = allPassengersString;
                  } else {
                      const finRegreso = g.employees[g.employees.length - 1]; const intermediasRegreso = g.employees.slice(0, -1);
                      endAddress = finRegreso.address; endLat = parseFloat(finRegreso.lat); endLng = parseFloat(finRegreso.lon || finRegreso.lng); endContact = finRegreso.assignedTo;
                      waypointsData = intermediasRegreso.map(w => ({ address: w.address, lat: parseFloat(w.lat), lng: parseFloat(w.lon || w.lng), contact: w.assignedTo }));
                      waypoints = intermediasRegreso.map(w => w.address);
                  }
              }

              const newTrip = {
                  client: newRoute.client, driver: g.driverName, driverId: g.driverId, status: 'Aceptada', serviceType: 'Programado',
                  scheduledDate: newRoute.scheduledDate, scheduledTime: g.timeKey, 
                  start: startAddress, startCoords: { lat: startLat, lng: startLng, contact: startContact },
                  end: endAddress, endCoords: { lat: endLat, lng: endLng, contact: endContact },
                  waypointsData: waypointsData, waypoints: waypoints, 
                  technicalData: { geometry: g.routeGeometry || [] },
                  finalDate: newRoute.scheduledDate, createdDate: new Date().toISOString()
              };
              await addDoc(collection(db, "rutas"), newTrip);
          }
          alert(`✅ ¡Logística completada! Rutas de ${globalCarpool.mode} creadas con éxito.`);
          setShowCarpoolModal(false);
      } catch(e) { alert("Error al generar las rutas."); }
  };

  const handleDeleteRoute = async (id, e) => { e.stopPropagation(); if(confirm("¿Eliminar ruta permanentemente?")) { await deleteDoc(doc(db, "rutas", id)); if(viewRoute?.id === id) setViewRoute(null); } };
  const confirmAssignDriver = async () => { if (!newRoute.driver) return alert("Selecciona un conductor primero."); try { await updateDoc(doc(db, "rutas", routeToAssign.id), { driver: newRoute.driver, driverId: newRoute.driverId, status: 'Aceptada' }); setShowAssignModal(false); setRouteToAssign(null); setNewRoute({ ...newRoute, driver: '', driverId: '' }); } catch (e) {} };
  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);
  const handlePreviewMapLoad = useCallback((map) => { previewMapRef.current = map; }, []);
  const routeToDisplay = viewRoute?.technicalData?.geometry ? viewRoute.technicalData.geometry : [];
  let mapCenter = centerMX; if(routeToDisplay.length > 0) mapCenter = routeToDisplay[0];
  const activePlanRoutes = routesList.filter(r => r.status === 'Pendiente' || r.status === 'Aceptada' || r.status === 'En Ruta');

  if (!isLoaded) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-slate-800"/></div>;

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2><p className="text-slate-500 text-sm">{activePlanRoutes.length} viajes pendientes o activos</p></div>
          <div className="flex gap-3">
              <button onClick={openCarpoolModal} className="bg-orange-100 text-orange-700 border border-orange-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-orange-200 transition"><Network className="w-4 h-4" /> Optimizar Grupos de Personal</button>
              <button onClick={() => { setViewRoute(null); setShowModal(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg hover:bg-slate-900 transition"><Plus className="w-4 h-4" /> Nueva Ruta Manual</button>
          </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
          {/* LISTA DE RUTAS MANUALES */}
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-4 scrollbar-thin">
              {activePlanRoutes.length === 0 && <div className="text-center text-slate-400 mt-10">No hay viajes programados.</div>}
              {activePlanRoutes.map((ruta) => (
                <div key={ruta.id} onClick={() => setViewRoute(ruta)} className={`bg-white p-4 rounded-xl shadow-sm border transition cursor-pointer group ${viewRoute?.id === ruta.id ? 'border-orange-500 ring-1 ring-orange-500 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                    <div className="flex justify-between items-start mb-2">
                          {ruta.serviceType === 'Prioritario' ? <span className="text-[10px] font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1"><Zap className="w-3 h-3"/> INMEDIATO</span> : <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-700 flex items-center gap-1"><Calendar className="w-3 h-3"/> {ruta.scheduledDate} {ruta.scheduledTime}</span>}
                          <div className="flex gap-1"><button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-red-400 bg-red-50 p-1.5 rounded hover:bg-red-100 transition"><Trash2 className="w-4 h-4"/></button></div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-0.5 truncate">{ruta.client}</h4>
                    
                    {(() => {
                        const passengers = [ ruta.startCoords?.contact, ...(ruta.waypointsData?.map(w => w.contact) || []), ruta.endCoords?.contact ].filter(Boolean);
                        if (passengers.length === 0) return null;
                        return (
                            <div className="flex flex-wrap gap-1 mt-1 mb-3">
                                {passengers.map((p, i) => <span key={i} className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1"><User className="w-2.5 h-2.5"/> {p}</span>)}
                            </div>
                        );
                    })()}
                    
                    <div className="space-y-2 mt-3">
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-green-600 shrink-0" /> <span className="truncate">{ruta.start?.split(',')[0]}</span></div>
                        {ruta.waypointsData && ruta.waypointsData.length > 0 && <div className="pl-5"><div className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-flex items-center gap-1"><Users className="w-3 h-3"/> {ruta.waypointsData.length} paradas</div></div>}
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-red-600 shrink-0" /> <span className="truncate">{ruta.end?.split(',')[0]}</span></div>
                    </div>
                    
                    {ruta.status === 'Pendiente' && <button onClick={(e) => { e.stopPropagation(); setRouteToAssign(ruta); setShowAssignModal(true); }} className="w-full mt-3 bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-200 font-black p-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-pulse"><User className="w-3.5 h-3.5"/> ASIGNAR UNIDAD</button>}
                    {ruta.driver && <div className="w-full mt-3 bg-slate-50 text-slate-600 border border-slate-200 font-bold p-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm"><Car className="w-3.5 h-3.5 text-slate-500"/> {ruta.driver}</div>}
                </div>
              ))}
          </div>

          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center shadow-inner">
             <GoogleMap mapContainerStyle={containerStyle} center={mapCenter} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                 {routeToDisplay.length > 0 && (
                     <>
                        <Polyline path={routeToDisplay} options={{ strokeColor: "#f97316", strokeOpacity: 1, strokeWeight: 5 }} />
                        <Marker position={routeToDisplay[0]} label="A" />
                        {viewRoute?.waypointsData && viewRoute.waypointsData.map((wp, idx) => ( wp.lat && wp.lng && <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} label={getMarkerLabel(idx + 1)} /> ))}
                        <Marker position={routeToDisplay[routeToDisplay.length - 1]} label={getMarkerLabel((viewRoute?.waypointsData?.length || 0) + 1)} />
                     </>
                 )}
             </GoogleMap>
          </div>
      </div>

      {showAssignModal && routeToAssign && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                      <div><h3 className="text-lg font-bold text-slate-800">Asignar Operador</h3></div><button onClick={() => { setShowAssignModal(false); setRouteToAssign(null); }}><X className="w-5 h-5 text-slate-400 hover:text-red-500 transition" /></button>
                  </div>
                  <div className="p-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <label className="text-xs font-bold text-slate-500 uppercase">Unidad / Conductor</label>
                          <select className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 font-bold text-slate-700" value={newRoute.driver} onChange={handleDriverChange}>
                              <option value="">Seleccionar conductor...</option>{availableDrivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                          </select>
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                      <button onClick={() => { setShowAssignModal(false); setRouteToAssign(null); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
                      <button onClick={confirmAssignDriver} className="px-6 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-md transition">Confirmar Asignación</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- MODAL 2: CARPOOLING INTELIGENTE (WIZARD ETAPAS) --- */}
      {showCarpoolModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white w-full max-w-[95vw] h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-orange-300 flex justify-between items-center bg-slate-900 text-white shrink-0">
                      <div><h3 className="text-lg font-bold flex items-center gap-2"><Network className="w-5 h-5 text-orange-500"/> Optimizador Logístico por Turnos</h3></div>
                      <button onClick={() => setShowCarpoolModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-white transition" /></button>
                  </div>
                  
                  <div className="flex-1 flex overflow-hidden">
                      {/* COLUMNA 1: CONFIGURACIÓN MAESTRA (SIEMPRE VISIBLE) */}
                      <div className="w-1/4 bg-slate-50 border-r border-slate-200 p-6 overflow-y-auto min-w-[280px]">
                          <div className="space-y-5">
                              <div>
                                  <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5 mb-2"><Building2 className="w-4 h-4"/> Empresa Corporativa</label>
                                  <select className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none font-bold text-slate-700 shadow-sm" value={newRoute.client} onChange={handleCarpoolClientChange}>
                                      <option value="">Selecciona la empresa...</option>
                                      {availableClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                  </select>
                              </div>
                              
                              <div>
                                  <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5 mb-2"><Calendar className="w-4 h-4"/> Fecha Programada</label>
                                  <input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none shadow-sm" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} />
                              </div>

                              <div className="bg-white p-4 rounded-xl border-2 border-orange-100 shadow-sm">
                                  <label className="text-xs font-black text-orange-600 uppercase mb-3 block">Modo de Planificación</label>
                                  <div className="flex gap-2 mb-4">
                                      <button 
                                          onClick={() => { setGlobalCarpool({mode: 'Ida'}); setCarpoolStep(1); }} 
                                          className={`flex-1 py-3 px-2 rounded-lg text-xs font-bold border transition ${globalCarpool.mode === 'Ida' ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                                      >🌅 ENTRADAS (Ida)</button>
                                      <button 
                                          onClick={() => { setGlobalCarpool({mode: 'Regreso'}); setCarpoolStep(1); }} 
                                          className={`flex-1 py-3 px-2 rounded-lg text-xs font-bold border transition ${globalCarpool.mode === 'Regreso' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                                      >🌃 SALIDAS (Regreso)</button>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* AREA PRINCIPAL: CAMBIA SEGÚN LA ETAPA */}
                      <div className="flex-1 flex overflow-hidden">
                          
                          {/* === ETAPA 1: FILTRO Y AJUSTE DE ASISTENCIA === */}
                          {carpoolStep === 1 && (
                              <div className="flex-1 bg-slate-100 p-8 overflow-y-auto animate-[fadeIn_0.3s_ease-out]">
                                  <div className="max-w-3xl mx-auto">
                                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
                                          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-2"><Users className="w-6 h-6 text-orange-500"/> Confirmación de Asistencia y Horarios</h2>
                                          <p className="text-sm text-slate-500">Selecciona los empleados que <b>SÍ</b> asistirán y ajusta su horario si es necesario. Luego presiona Siguiente para armar las rutas.</p>
                                      </div>

                                      {employeeRoster.length === 0 ? (
                                          <div className="text-center p-12 text-slate-400 font-bold border-2 border-dashed border-slate-300 rounded-2xl">
                                              Selecciona una empresa para cargar su plantilla de personal.
                                          </div>
                                      ) : (
                                          <div className="space-y-4">
                                              {/* NUEVO: Buscador de personal para la Etapa 1 */}
                                              <div className="relative mb-6">
                                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                      <Search className="h-4 w-4 text-slate-400" />
                                                  </div>
                                                  <input 
                                                      type="text" 
                                                      placeholder="Buscar empleado por nombre o dirección..." 
                                                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition text-sm font-bold text-slate-700 shadow-sm"
                                                      value={rosterSearch}
                                                      onChange={(e) => setRosterSearch(e.target.value)}
                                                  />
                                              </div>

                                              <div className="space-y-3">
                                                  {employeeRoster
                                                      .map((emp, originalIndex) => ({ ...emp, originalIndex }))
                                                      .filter(emp => 
                                                          emp.assignedTo?.toLowerCase().includes(rosterSearch.toLowerCase()) || 
                                                          emp.address?.toLowerCase().includes(rosterSearch.toLowerCase())
                                                      )
                                                      .map((emp) => (
                                                      <div key={emp.originalIndex} className={`flex items-center gap-4 bg-white p-4 rounded-xl border shadow-sm transition ${emp.included ? 'border-orange-200 ring-1 ring-orange-100' : 'border-slate-200 opacity-60 grayscale'}`}>
                                                          <input type="checkbox" className="w-5 h-5 text-orange-500 rounded cursor-pointer" checked={emp.included} onChange={(e) => updateRosterItem(emp.originalIndex, 'included', e.target.checked)} />
                                                          <div className="flex-1">
                                                              <h4 className="font-black text-slate-800 text-sm">{emp.assignedTo}</h4>
                                                              <p className="text-[10px] text-slate-500 truncate mt-0.5">{emp.address}</p>
                                                          </div>
                                                          {globalCarpool.mode === 'Ida' ? (
                                                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                                  <span className="text-[10px] font-bold text-slate-500 uppercase">ENTRADA:</span>
                                                                  <input type="time" className="text-xs font-black outline-none bg-transparent w-20 text-slate-800" value={emp.entrada} onChange={(e) => updateRosterItem(emp.originalIndex, 'entrada', e.target.value)} disabled={!emp.included} />
                                                              </div>
                                                          ) : (
                                                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                                  <span className="text-[10px] font-bold text-slate-500 uppercase">SALIDA:</span>
                                                                  <input type="time" className="text-xs font-black outline-none bg-transparent w-20 text-slate-800" value={emp.salida} onChange={(e) => updateRosterItem(emp.originalIndex, 'salida', e.target.value)} disabled={!emp.included} />
                                                              </div>
                                                          )}
                                                      </div>
                                                  ))}
                                                  
                                                  {employeeRoster.filter(emp => emp.assignedTo?.toLowerCase().includes(rosterSearch.toLowerCase()) || emp.address?.toLowerCase().includes(rosterSearch.toLowerCase())).length === 0 && (
                                                      <div className="text-center p-6 text-slate-400 font-bold text-sm">
                                                          No se encontró ningún empleado con "{rosterSearch}"
                                                      </div>
                                                  )}
                                              </div>
                                              
                                              <div className="pt-6 flex justify-end">
                                                  <button onClick={handleGenerateStep2} className="px-8 py-4 bg-orange-500 text-white rounded-2xl font-black shadow-xl shadow-orange-500/30 hover:bg-orange-600 transition flex items-center gap-2 uppercase tracking-widest text-sm">
                                                      Siguiente Paso <ArrowRight className="w-5 h-5"/>
                                                  </button>
                                              </div>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )}

                          {/* === ETAPA 2: CUADRILLAS Y MAPA REAL === */}
                          {carpoolStep === 2 && (
                              <>
                                  <div className="w-[45%] bg-slate-100 p-6 overflow-y-auto border-r border-slate-200 shadow-inner animate-[slideIn_0.3s_ease-out]">
                                      <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-10 mb-6">
                                          <div className="flex items-center gap-3">
                                              <button onClick={() => setCarpoolStep(1)} className="text-slate-400 hover:text-orange-500 transition"><ChevronLeft className="w-5 h-5"/></button>
                                              <h4 className="text-sm font-black text-slate-700">Cuadrillas Armadas</h4>
                                          </div>
                                          <button onClick={() => setPreviewGroupId('all')} className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${previewGroupId === 'all' ? 'bg-slate-800 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Eye className="w-3 h-3"/> Ver Todas</button>
                                      </div>

                                      <div className="space-y-6">
                                          {carpoolGroups.map((grupo, idx) => {
                                              const isPreviewing = previewGroupId === grupo.id;
                                              const groupColor = PREVIEW_COLORS[idx % PREVIEW_COLORS.length];
                                              
                                              return (
                                              <div key={grupo.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${isPreviewing ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200'}`}>
                                                  <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
                                                      <div className="flex items-center gap-2">
                                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: groupColor }}></div>
                                                          <h4 className="font-black text-sm">Vehículo {idx + 1}</h4>
                                                          <span className="ml-2 text-[10px] bg-slate-600 px-2 py-1 rounded font-bold border border-slate-500"><Clock className="w-3 h-3 inline mr-1"/>{globalCarpool.mode === 'Ida' ? 'Llega a' : 'Sale a'} las {grupo.timeKey}</span>
                                                      </div>
                                                      <div className="flex gap-2">
                                                          <span className="text-[10px] bg-slate-700 px-2 py-1 rounded font-bold">{grupo.employees.length}/4 pax</span>
                                                          <button onClick={() => setPreviewGroupId(grupo.id)} className={`text-[10px] font-black uppercase px-2 py-1 rounded transition ${isPreviewing ? 'bg-orange-500 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}>Ver Ruta</button>
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="p-4 space-y-4">
                                                      <div>
                                                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Conductor Asignado</label>
                                                          <select className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold text-slate-700 outline-none focus:border-orange-400" value={grupo.driverId} onChange={(e) => setGroupDriver(grupo.id, e.target.value)}>
                                                              <option value="">👤 Seleccionar chofer...</option>
                                                              {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                          </select>
                                                      </div>
                                                      
                                                      <div>
                                                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Orden de Recorrido (Drag & Drop)</label>
                                                          <div className="space-y-2 min-h-[50px]">
                                                              {grupo.employees.map((emp, eIdx) => (
                                                                  <div 
                                                                      key={`${grupo.id}-${eIdx}`} 
                                                                      draggable
                                                                      onDragStart={(e) => handleDragStart(e, grupo.id, eIdx)}
                                                                      onDragOver={(e) => e.preventDefault()}
                                                                      onDrop={(e) => handleDrop(e, grupo.id, eIdx)}
                                                                      className={`flex items-center gap-2 bg-slate-50 border p-2 rounded cursor-grab active:cursor-grabbing hover:border-orange-300 transition ${grupo.sharedMeetingPoint.active ? 'border-orange-200 bg-orange-50/50' : 'border-slate-100'}`}
                                                                  >
                                                                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0"/>
                                                                      {!grupo.sharedMeetingPoint.active && (
                                                                         <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-slate-400" style={{ backgroundColor: groupColor }}>
                                                                             {globalCarpool.mode === 'Ida' ? String.fromCharCode(65+eIdx) : String.fromCharCode(66+eIdx)}
                                                                         </div>
                                                                      )}
                                                                      <div className="flex-1 overflow-hidden"><p className="text-xs font-bold text-slate-700 truncate">{emp.assignedTo}</p></div>
                                                                      <button onClick={() => removeEmployeeFromGroup(grupo.id, eIdx)} className="text-slate-300 hover:text-red-500 p-1 bg-white rounded border border-slate-100 shadow-sm"><X className="w-3 h-3"/></button>
                                                                  </div>
                                                              ))}
                                                          </div>
                                                          
                                                          {grupo.employees.length < 4 && (
                                                              <div className="mt-2 pt-2 border-t border-slate-100">
                                                                  <EmployeeSearch 
                                                                      employees={selectedClientData?.locations?.filter(l => 
                                                                          l.assignedTo !== 'General' && 
                                                                          (selectedClientData.users?.map(u => u.name) || []).includes(l.assignedTo) &&
                                                                          !grupo.employees.some(e => e.assignedTo === l.assignedTo) // Ocultar solo a los que YA están en ESTA misma cuadrilla
                                                                      ) || []} 
                                                                      placeholder="🔍 Buscar para agregar/mover aquí..." 
                                                                      onSelect={(emp) => addEmployeeToGroup(grupo.id, emp)} 
                                                                  />
                                                              </div>
                                                          )}
                                                      </div>

                                                      <div className="pt-3 border-t border-slate-200 mt-2">
                                                          <div className="flex items-center gap-2 mb-3">
                                                              <input type="checkbox" checked={grupo.sharedMeetingPoint.active} onChange={(e) => { const st = e.target.checked; setCarpoolGroups(prev => prev.map(g => g.id === grupo.id ? {...g, sharedMeetingPoint: {...g.sharedMeetingPoint, active: st}} : g)); setTimeout(()=>fetchRealRoutesForGroups(carpoolGroups.map(g => g.id === grupo.id ? {...g, sharedMeetingPoint: {...g.sharedMeetingPoint, active: st}} : g)), 100); }} className="w-4 h-4 text-orange-600 rounded cursor-pointer" />
                                                              <label className="text-[10px] font-black text-slate-600 uppercase cursor-pointer">Punto de Reunión Compartido</label>
                                                          </div>
                                                          {grupo.sharedMeetingPoint.active && (
                                                              <div className="space-y-2 mb-2">
                                                                  <AddressAutocomplete isLoaded={isLoaded} placeholder="Buscar plaza, metro, etc..." value={grupo.sharedMeetingPoint.address} onSelect={(loc) => { setCarpoolGroups(prev => prev.map(g => g.id === grupo.id ? {...g, sharedMeetingPoint: {...g.sharedMeetingPoint, address: loc.address, lat: loc.lat, lng: loc.lon || loc.lng}} : g)); setTimeout(()=>fetchRealRoutesForGroups(carpoolGroups.map(g => g.id === grupo.id ? {...g, sharedMeetingPoint: {...g.sharedMeetingPoint, address: loc.address, lat: loc.lat, lng: loc.lon || loc.lng}} : g)), 100); }} iconColor="orange" zIndex={100 - idx} />
                                                              </div>
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          )})}
                                      </div>
                                  </div>

                                  <div className="flex-1 bg-slate-300 relative">
                                      {fetchingRealRoutes && ( <div className="absolute top-4 right-4 bg-slate-900/80 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 z-20 backdrop-blur"><Loader2 className="animate-spin w-4 h-4"/> Trazando Rutas Reales...</div> )}
                                      {!isLoaded ? ( <div className="h-full flex items-center justify-center text-slate-500 font-bold"><Loader2 className="animate-spin mr-2"/> Cargando Mapas...</div> ) : (
                                          <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={11} onLoad={handlePreviewMapLoad} options={{ streetViewControl: false, mapTypeControl: false, gestureHandling: "greedy" }}>
                                              {selectedClientData && (
                                                  <Marker 
                                                      position={{ lat: parseFloat(selectedClientData.locations.find(l => l.assignedTo === 'General')?.lat || centerMX.lat), lng: parseFloat(selectedClientData.locations.find(l => l.assignedTo === 'General')?.lon || selectedClientData.locations.find(l => l.assignedTo === 'General')?.lng || centerMX.lng) }} 
                                                      icon="http://maps.google.com/mapfiles/kml/pal3/icon21.png" title="Oficina Central"
                                                  />
                                              )}
                                              
                                              {carpoolGroups.map((g, idx) => {
                                                  if (previewGroupId !== 'all' && previewGroupId !== g.id) return null;
                                                  const gColor = PREVIEW_COLORS[idx % PREVIEW_COLORS.length];
                                                  const isShared = g.sharedMeetingPoint.active && g.sharedMeetingPoint.lat;
                                                  const oficina = selectedClientData?.locations?.find(l => l.assignedTo === 'General');
                                                  const endPoint = oficina && oficina.lat ? { lat: parseFloat(oficina.lat), lng: parseFloat(oficina.lon || oficina.lng) } : null;

                                                  // RENDERIZAR RUTA REAL (OSRM)
                                                  if (g.routeGeometry && g.routeGeometry.length > 0) {
                                                      return (
                                                          <React.Fragment key={`real-route-${g.id}`}>
                                                              <Polyline path={g.routeGeometry} options={{ strokeColor: gColor, strokeOpacity: 0.8, strokeWeight: 5 }} />
                                                              {isShared ? ( <Marker position={{ lat: parseFloat(g.sharedMeetingPoint.lat), lng: parseFloat(g.sharedMeetingPoint.lng) }} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: gColor, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 }} /> ) : (
                                                                  g.employees.map((emp, i) => emp.lat && ( <Marker key={`m-${g.id}-${i}`} position={{ lat: parseFloat(emp.lat), lng: parseFloat(emp.lon || emp.lng) }} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: gColor, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 }} label={{ text: globalCarpool.mode === 'Ida' ? String.fromCharCode(65 + i) : String.fromCharCode(66 + i), color: 'white', fontSize: '10px' }} /> ))
                                                              )}
                                                          </React.Fragment>
                                                      );
                                                  }
                                                  return null; 
                                              })}
                                          </GoogleMap>
                                      )}
                                  </div>
                              </>
                          )}
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0 shadow-[0_-10px_15px_rgba(0,0,0,0.05)] z-10">
                      <button onClick={() => setShowCarpoolModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancelar</button>
                      {carpoolStep === 2 && (
                          <button onClick={handleConfirmAndDispatch} className="px-8 py-2.5 text-sm font-black text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-xl shadow-orange-500/30 transition flex items-center gap-2"><Wand2 className="w-4 h-4"/> Confirmar y Despachar</button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- MODAL 3: NUEVA RUTA MANUAL (SE MANTIENE INTACTO) --- */}
      {showModal && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-6xl h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div><h3 className="text-lg font-bold text-slate-800">Planificar Ruta de Personal</h3></div>
                    <button onClick={() => setShowModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-red-500 transition" /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-[45%] p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-[5px_0_15px_-5px_rgba(0,0,0,0.1)] relative scrollbar-thin">
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Configuración de Viaje</label>
                                <div className="flex gap-3 mb-3"><button onClick={() => setNewRoute({...newRoute, serviceType: 'Prioritario'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Prioritario' ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400'}`}><Zap className="w-4 h-4" /> INMEDIATO</button><button onClick={() => setNewRoute({...newRoute, serviceType: 'Programado'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Programado' ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400'}`}><Calendar className="w-4 h-4" /> PROGRAMADO</button></div>
                                {isProgramado && (<div className="grid grid-cols-2 gap-3 mt-3"><input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} /><input type="time" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} /></div>)}
                                <div className="mt-4">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Empresa / Cuenta Responsable</label>
                                    <select className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.client} onChange={handleClientChange}><option value="">Selecciona la empresa...</option>{availableClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                                </div>
                            </div>

                            <div className="relative pt-2 pb-6">
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-sm font-black text-slate-700 uppercase flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-800"/> Itinerario del Viaje</label>
                                </div>
                                <div className="absolute left-[39px] top-[70px] bottom-[30px] w-0.5 bg-slate-200 -z-10"></div>

                                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 mb-0 relative shadow-sm">
                                    <div className="flex justify-between items-center mb-3">
                                        <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-green-600"/> Punto de Inicio</h5>
                                        {isProgramado && startTimeDisplay && <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-1 rounded border border-green-200 flex items-center gap-1"><Clock className="w-3 h-3"/> SALIDA: {startTimeDisplay}</span>}
                                    </div>
                                    {selectedClientData?.locations?.some(loc => loc.assignedTo && loc.assignedTo !== 'General') && (
                                        <div className="mb-3">
                                            <EmployeeSearch employees={selectedClientData.locations.filter(l => l.assignedTo !== 'General' && selectedClientData.users?.some(u => u.name === l.assignedTo))} placeholder="🔍 Buscar empleado por nombre..." onSelect={(val) => handlePassengerSelectForPoint('start', null, val)} />
                                        </div>
                                    )}
                                    <AddressAutocomplete isLoaded={isLoaded} placeholder="Dirección exacta de Inicio..." value={startPoint?.address} onSelect={(loc) => setStartPoint(prev => ({...(prev || {}), ...loc, passengerName: prev?.passengerName || ''}))} iconColor="green" zIndex={50} favorites={getFilteredFavorites()} />
                                    <div className="pl-[52px] mt-2 mb-1 relative">
                                        <User className="w-3 h-3 text-slate-400 absolute left-[62px] top-[11px]" />
                                        <input type="text" placeholder="Pasajero o Referencia (Ej. Juan Pérez)" className="w-full pl-8 text-xs p-2.5 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-green-400 shadow-sm font-medium" value={startPoint?.contact || ''} onChange={e => setStartPoint(prev => ({...(prev || {}), contact: e.target.value}))} />
                                    </div>
                                </div>
                                
                                {waypoints.map((wp, index) => (
                                    <div key={index} className="relative" style={{zIndex: 40-index}}>
                                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 mb-0 mt-3 relative shadow-sm">
                                            <button type="button" onClick={() => removeWaypoint(index)} className="absolute right-2 top-2 text-slate-300 hover:text-red-500 transition bg-white p-1 rounded-full shadow-sm border border-slate-100"><Trash2 className="w-4 h-4"/></button>
                                            <div className="flex justify-between items-center mb-3 pr-8">
                                                <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><MoreVertical className="w-3.5 h-3.5 text-slate-800"/> Parada Intermedia {getMarkerLabel(index + 1)}</h5>
                                            </div>
                                            {selectedClientData?.locations?.some(loc => loc.assignedTo && loc.assignedTo !== 'General') && (
                                                <div className="mb-3">
                                                    <EmployeeSearch employees={selectedClientData.locations.filter(l => l.assignedTo !== 'General' && selectedClientData.users?.some(u => u.name === l.assignedTo))} placeholder="🔍 Buscar empleado por nombre..." onSelect={(val) => handlePassengerSelectForPoint('waypoint', index, val)} />
                                                </div>
                                            )}
                                            <AddressAutocomplete isLoaded={isLoaded} placeholder={`Dirección de Parada ${getMarkerLabel(index + 1)}...`} value={wp.address} onSelect={(loc) => updateWaypoint(index, {...wp, ...loc, passengerName: wp.passengerName || ''})} iconColor="slate" zIndex={40-index} favorites={getFilteredFavorites()} />
                                            <div className="pl-[52px] mt-2 mb-1 relative">
                                                <User className="w-3 h-3 text-slate-400 absolute left-[62px] top-[11px]" />
                                                <input type="text" placeholder="Pasajero a abordar (Ej. María López)" className="w-full pl-8 text-xs p-2.5 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-slate-800 shadow-sm font-medium" value={wp.contact || ''} onChange={e => updateWaypoint(index, {...wp, contact: e.target.value})} />
                                            </div>
                                            <InlineSummaryBox distance={routeInfo.segments[index]?.distance} duration={routeInfo.segments[index]?.duration} eta={calculatedEtas[index]} color="slate" showEta={isProgramado} />
                                        </div>
                                    </div>
                                ))}
                                
                                <button type="button" onClick={addWaypoint} className="ml-[52px] mt-3 text-xs text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg font-bold flex items-center gap-1 transition shadow-sm relative z-10"><Plus className="w-4 h-4"/> Añadir Parada Manualmente</button>
                                
                                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 mb-6 mt-3 relative shadow-sm z-10">
                                    <div className="flex justify-between items-center mb-3">
                                        <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-red-600"/> Punto de Destino Final</h5>
                                    </div>
                                    {selectedClientData?.locations?.some(loc => loc.assignedTo && loc.assignedTo !== 'General') && (
                                        <div className="mb-3">
                                            <EmployeeSearch employees={selectedClientData.locations.filter(l => l.assignedTo !== 'General' && selectedClientData.users?.some(u => u.name === l.assignedTo))} placeholder="🔍 Buscar empleado por nombre..." onSelect={(val) => handlePassengerSelectForPoint('end', null, val)} />
                                        </div>
                                    )}
                                    <AddressAutocomplete isLoaded={isLoaded} placeholder="Dirección Destino Final (Ej. Oficina Central)" value={endPoint?.address} onSelect={(loc) => setEndPoint(prev => ({...(prev || {}), ...loc, passengerName: prev?.passengerName || ''}))} iconColor="red" zIndex={10} favorites={getFilteredFavorites()} />
                                    <div className="pl-[52px] mt-2 mb-1 relative">
                                        <User className="w-3 h-3 text-slate-400 absolute left-[62px] top-[11px]" />
                                        <input type="text" placeholder="Referencia Destino (Ej. Corporativo o Juan Pérez)" className="w-full pl-8 text-xs p-2.5 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-red-400 shadow-sm font-medium" value={endPoint?.contact || ''} onChange={e => setEndPoint(prev => ({...(prev || {}), contact: e.target.value}))} />
                                    </div>
                                    <InlineSummaryBox distance={routeInfo.segments[waypoints.length]?.distance} duration={routeInfo.segments[waypoints.length]?.duration} eta={calculatedEtas[waypoints.length]} color="red" showEta={isProgramado} />
                                </div>

                                {routeInfo.totalDistance > 0 && (
                                    <div className="p-5 bg-slate-800 rounded-xl border border-slate-700 text-white flex justify-between items-center shadow-lg relative z-10 animate-in zoom-in-95 duration-300">
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Resumen Total del Viaje</p>
                                            <div className="flex items-center gap-4 text-sm font-black">
                                                <span className="flex items-center gap-1.5"><Navigation className="w-4 h-4 text-blue-400"/> {routeInfo.totalDistance} km</span>
                                                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-green-400"/> {routeInfo.totalDuration} min</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <hr className="border-slate-100" />
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-500 uppercase">Unidad / Conductor Asignado</label>
                                <select className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.driver} onChange={handleDriverChange}>
                                    <option value="">Dejar huérfano para Auto-Asignación (Opcional)</option>
                                    {availableDrivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-200 relative">
                        <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false }}>
                            {startPoint?.lat && <Marker position={startPoint} label="A" />}
                            {waypoints.map((wp, idx) => (
                                wp.lat && wp.lng && <Marker key={idx} position={{lat: wp.lat, lng: wp.lng}} label={getMarkerLabel(idx + 1)} />
                            ))}
                            {endPoint?.lat && <Marker position={endPoint} label={getMarkerLabel(waypoints.length + 1)} />}
                            {routeInfo.geometry.length > 0 && <Polyline path={routeInfo.geometry} options={{ strokeColor: "#f97316", strokeOpacity: 1, strokeWeight: 5 }} />}
                        </GoogleMap>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 flex justify-end gap-3 shrink-0 bg-white">
                    <button onClick={() => setShowModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancelar</button>
                    <button onClick={handleSaveRoute} className="px-6 py-2.5 text-sm font-black text-white bg-slate-800 rounded-lg hover:bg-slate-900 shadow-lg flex items-center gap-2 transition"><Navigation className="w-4 h-4"/> Confirmar Ruta</button>
                </div>
            </div>
        </div>
      )}

      {/* ESTILOS DEL AUTOCOMPLETE Y SCROLLBAR */}
      <style>{`
        .pac-container { z-index: 20000 !important; border-radius: 8px; margin-top: 5px; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1); font-family: inherit; min-width: 400px !important; }
        .pac-item { padding: 12px 10px; font-size: 13px; cursor: pointer; border-top: 1px solid #f1f5f9; white-space: normal !important; line-height: 1.4; }
        .pac-item:hover { background-color: #f8fafc; }
        .pac-item-query { font-size: 13px; color: #1e293b; font-weight: 600; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}</style>
    </div>
  );
}