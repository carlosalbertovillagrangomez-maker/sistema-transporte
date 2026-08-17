import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, MapPin, X, Trash2, User, Loader2, Zap, Calendar, Navigation, Star, Clock, MoreVertical, Users, Wand2, Car, Network, Building2, Eye, GripVertical, Search, ArrowRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
// GOOGLE MAPS
import { GoogleMap, useJsApiLoader, Marker, Polyline, Autocomplete } from '@react-google-maps/api';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, doc, query, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 

const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; 
const libraries = ['places', 'geometry'];

// --- CONFIGURACIÓN DE TIEMPOS CARPOOLING ---
// Para viajes de Ida, el destino final debe alcanzarse mínimo 10 minutos antes.
// Además, se agrega una tolerancia operativa de 5 minutos por cada pasajero.
const FINAL_DESTINATION_EARLY_MINS = 10;
const PASSENGER_PICKUP_BUFFER_MINS = 5;

const parseTimeKeyToDate = (timeKey) => {
    const [h, m] = String(timeKey || '').split(':').map(Number);
    const date = new Date();
    date.setHours(
        Number.isFinite(h) ? h : 0,
        Number.isFinite(m) ? m : 0,
        0,
        0
    );
    return date;
};

const addMinutesToDate = (date, minutes) => {
    return new Date(date.getTime() + (Number(minutes) || 0) * 60000);
};

const formatHHMM = (date) => {
    const finalH = String(date.getHours()).padStart(2, '0');
    const finalM = String(date.getMinutes()).padStart(2, '0');
    return `${finalH}:${finalM}`;
};

const safeMinutes = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const normalizeContactPhone = (...values) => {
    for (const value of values) {
        const digits = String(value || '').replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) return digits;
    }

    return '';
};

const getClientUserPhone = (clientData, personName, fallback = '') => {
    const user = clientData?.users?.find(item => item?.name === personName);

    return normalizeContactPhone(
        user?.phone,
        user?.telefono,
        user?.whatsapp,
        user?.mobile,
        user?.celular,
        fallback
    );
};

// --- HELPER: CALCULAR HORA REAL DE INICIO DEL CHOFER ---
const getCalculatedStartTime = (timeKey, durationMins, mode, passengerCount = 0) => {
    if (!timeKey || durationMins == null) return timeKey;

    // En regreso se respeta la hora oficial de salida.
    if (mode !== 'Ida') return timeKey;

    const officialArrivalDate = parseTimeKeyToDate(timeKey);
    const targetFinalArrivalDate = addMinutesToDate(officialArrivalDate, -FINAL_DESTINATION_EARLY_MINS);
    const totalPassengerBufferMins = safeMinutes(passengerCount) * PASSENGER_PICKUP_BUFFER_MINS;

    const startDate = addMinutesToDate(
        targetFinalArrivalDate,
        -(safeMinutes(durationMins) + totalPassengerBufferMins)
    );

    return formatHHMM(startDate);
};

// --- HELPER: PLAN COMPLETO DE TIEMPOS PARA CARPOOLING ---
const buildCarpoolTimePlan = ({
    timeKey,
    totalDurationMins,
    routeSegments = [],
    mode,
    passengerCount = 0,
    isShared = false
}) => {
    if (!timeKey || totalDurationMins == null || mode !== 'Ida') {
        return {
            officialScheduledTime: timeKey,
            startTime: timeKey,
            targetFinalArrivalTime: timeKey,
            estimatedFinalArrivalTime: timeKey,
            finalEarlyBufferMins: 0,
            passengerBufferMins: 0,
            totalPassengerBufferMins: 0,
            pickupTimes: []
        };
    }

    const officialArrivalDate = parseTimeKeyToDate(timeKey);
    const targetFinalArrivalDate = addMinutesToDate(officialArrivalDate, -FINAL_DESTINATION_EARLY_MINS);
    const totalPassengerBufferMins = safeMinutes(passengerCount) * PASSENGER_PICKUP_BUFFER_MINS;

    const startDate = addMinutesToDate(
        targetFinalArrivalDate,
        -(safeMinutes(totalDurationMins) + totalPassengerBufferMins)
    );

    let pickupTimes = [];

    if (isShared) {
        pickupTimes = Array.from({ length: passengerCount }, () => formatHHMM(startDate));

        const estimatedFinalArrivalDate = addMinutesToDate(
            startDate,
            safeMinutes(totalDurationMins) + totalPassengerBufferMins
        );

        return {
            officialScheduledTime: timeKey,
            startTime: formatHHMM(startDate),
            targetFinalArrivalTime: formatHHMM(targetFinalArrivalDate),
            estimatedFinalArrivalTime: formatHHMM(estimatedFinalArrivalDate),
            finalEarlyBufferMins: FINAL_DESTINATION_EARLY_MINS,
            passengerBufferMins: PASSENGER_PICKUP_BUFFER_MINS,
            totalPassengerBufferMins,
            pickupTimes
        };
    }

    let cursor = new Date(startDate);
    const safeSegments = Array.isArray(routeSegments) ? routeSegments : [];

    for (let i = 0; i < passengerCount; i++) {
        pickupTimes.push(formatHHMM(cursor));
        cursor = addMinutesToDate(cursor, PASSENGER_PICKUP_BUFFER_MINS);
        cursor = addMinutesToDate(cursor, safeMinutes(safeSegments[i]?.duration));
    }

    return {
        officialScheduledTime: timeKey,
        startTime: formatHHMM(startDate),
        targetFinalArrivalTime: formatHHMM(targetFinalArrivalDate),
        estimatedFinalArrivalTime: formatHHMM(cursor),
        finalEarlyBufferMins: FINAL_DESTINATION_EARLY_MINS,
        passengerBufferMins: PASSENGER_PICKUP_BUFFER_MINS,
        totalPassengerBufferMins,
        pickupTimes
    };
};

// --- COMPONENTES AUXILIARES ---
const AddressAutocomplete = ({ isLoaded, value, onSelect, placeholder, iconColor = "text-slate-400", zIndex = 50, favorites = [] }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const autocompleteRef = useRef(null);
    useEffect(() => { setInputValue(value || ''); }, [value]);
    const generalFavs = favorites.filter(f => !f.assignedTo || f.assignedTo === 'General');
    const options = { fields: ["address_components", "geometry", "formatted_address"] };

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
const comparePeopleAZ = (a, b) => String(a?.assignedTo || a?.name || '').localeCompare(String(b?.assignedTo || b?.name || ''), 'es', { sensitivity: 'base' });

// FUNCIONES MATEMÁTICAS DE DISTANCIA
const getDistance = (p1, p2) => {
    const R = 6371; const dLat = (p2.lat - p1.lat) * Math.PI / 180; const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

const getPlanSortTimestamp = (route) => {
    if (String(route?.serviceType || '').toLowerCase().includes('prioritario')) {
        return new Date(route?.createdDate || 0).getTime() || Date.now();
    }
    const date = String(route?.scheduledDate || route?.finalDate || '').trim();
    const time = String(route?.startTime || route?.pickupTime || route?.scheduledTime || '00:00').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const normalized = /^\d{1,2}:\d{2}$/.test(time)
            ? `${time.split(':')[0].padStart(2, '0')}:${time.split(':')[1]}`
            : '00:00';
        const parsed = new Date(`${date}T${normalized}:00`).getTime();
        if (Number.isFinite(parsed)) return parsed;
    }
    return new Date(route?.createdDate || 0).getTime() || 0;
};

const getGroupMeetingPoints = (group) => {
    const modern = Array.isArray(group?.sharedMeetingPoints) ? group.sharedMeetingPoints : [];
    const legacy = group?.sharedMeetingPoint?.active
        ? [{ ...group.sharedMeetingPoint, id: group.sharedMeetingPoint.id || 'legacy-shared' }]
        : [];
    const all = [...modern, ...legacy];
    const seen = new Set();
    return all.filter(point => {
        if (!point?.active) return false;
        const id = String(point.id || `${point.address}|${point.lat}|${point.lng}`);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};

const getEmployeeMeetingPoint = (group, employeeName) => {
    return getGroupMeetingPoints(group).find(point =>
        Array.isArray(point?.passengerNames) &&
        point.passengerNames.includes(employeeName)
    ) || null;
};

const buildPassengerStopsForGroup = (group) => {
    const stops = [];
    const usedMeetingPoints = new Set();

    (group?.employees || []).forEach(employee => {
        const meetingPoint = getEmployeeMeetingPoint(group, employee.assignedTo);
        if (meetingPoint) {
            const key = String(meetingPoint.id || meetingPoint.address);
            if (usedMeetingPoints.has(key)) return;
            usedMeetingPoints.add(key);

            const assignedEmployees = (group.employees || []).filter(item =>
                Array.isArray(meetingPoint.passengerNames) &&
                meetingPoint.passengerNames.includes(item.assignedTo)
            );

            stops.push({
                stopType: 'shared_meeting',
                id: key,
                address: meetingPoint.address,
                lat: Number(meetingPoint.lat),
                lng: Number(meetingPoint.lng ?? meetingPoint.lon),
                employees: assignedEmployees
            });
            return;
        }

        stops.push({
            stopType: 'individual',
            id: `individual-${employee.assignedTo}`,
            address: employee.address,
            lat: Number(employee.lat),
            lng: Number(employee.lng ?? employee.lon),
            employees: [employee]
        });
    });

    return stops.filter(stop =>
        stop.address &&
        Number.isFinite(stop.lat) &&
        Number.isFinite(stop.lng) &&
        stop.employees.length > 0
    );
};

const buildImmutableOriginalPlan = ({ routeInfo, startPoint, waypoints, endPoint, createdAt }) => ({
    version: 1,
    createdAt,
    geometry: Array.isArray(routeInfo?.geometry) ? routeInfo.geometry : [],
    totalDistance: routeInfo?.totalDistance ?? null,
    totalDuration: routeInfo?.totalDuration ?? null,
    segments: Array.isArray(routeInfo?.segments) ? routeInfo.segments : [],
    start: startPoint?.address || '',
    startCoords: startPoint ? { lat: startPoint.lat, lng: startPoint.lng } : null,
    waypoints: (waypoints || []).map(item => item?.address || ''),
    waypointsData: (waypoints || []).map(item => ({
        address: item?.address || '',
        lat: item?.lat ?? null,
        lng: item?.lng ?? item?.lon ?? null
    })),
    end: endPoint?.address || '',
    endCoords: endPoint ? { lat: endPoint.lat, lng: endPoint.lng } : null
});

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [routeToAssign, setRouteToAssign] = useState(null);

  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries, language: 'es' });
  const mapRef = useRef(null);
  const previewMapRef = useRef(null);

  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableClients, setAvailableClients] = useState([]);
  const [routesList, setRoutesList] = useState([]);

  const [viewRoute, setViewRoute] = useState(null);
  const [newRoute, setNewRoute] = useState({ client: '', requestUser: '', driver: '', driverId: '', status: 'Pendiente', serviceType: 'Programado', scheduledDate: '', scheduledTime: '' });
  const [selectedClientData, setSelectedClientData] = useState(null);
  
  const [startPoint, setStartPoint] = useState({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
  const [endPoint, setEndPoint] = useState({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
  const [waypoints, setWaypoints] = useState([]);
  
  const [routeInfo, setRouteInfo] = useState({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
  const [calculatedEtas, setCalculatedEtas] = useState([]);
  const [startTimeDisplay, setStartTimeDisplay] = useState('');
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // === ESTADOS MÓDULO CARPOOLING INTELIGENTE (WIZARD) ===
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);
  const [carpoolStep, setCarpoolStep] = useState(1); 
  const [employeeRoster, setEmployeeRoster] = useState([]); 
  const [rosterSearch, setRosterSearch] = useState(''); 
  
  const [carpoolGroups, setCarpoolGroups] = useState([]);
  const [previewGroupId, setPreviewGroupId] = useState('all'); 
  const [fetchingRealRoutes, setFetchingRealRoutes] = useState(false);
  const [globalCarpool, setGlobalCarpool] = useState({ mode: 'Ida' });

  // === SERVICIO OCASIONAL / CENTRO DE ACOPIO ===
  const [walkUpMode, setWalkUpMode] = useState(false);
  const [walkUpPassengers, setWalkUpPassengers] = useState([{ name: '', phone: '' }]);
  const [walkUpPricing, setWalkUpPricing] = useState({
      currency: 'MXN',
      quotedTotal: '',
      recalculateAtEnd: true,
      baseFare: '35',
      perKm: '15',
      perMinute: '1.5',
      serviceFee: '12',
      minimumFare: '75'
  });
  const [editingPlannedRouteId, setEditingPlannedRouteId] = useState(null);

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
    const u1 = onSnapshot(collection(db, "conductores"), (s) => setAvailableDrivers(s.docs.map(d => ({id: d.id, ...d.data()})).sort(comparePeopleAZ)));
    const u2 = onSnapshot(collection(db, "clientes"), (s) => setAvailableClients(s.docs.map(d => ({id: d.id, ...d.data()})).sort(comparePeopleAZ)));
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
        if (pointType === 'start') setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
        if (pointType === 'end') setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
        if (pointType === 'waypoint') { const w = [...waypoints]; w[waypointIndex] = { address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' }; setWaypoints(w); }
        return;
    }
    const newPointData = {
        address: empObj.address,
        lat: parseFloat(empObj.lat),
        lng: parseFloat(empObj.lon || empObj.lng),
        contact: empObj.assignedTo,
        passengerName: empObj.assignedTo,
        phone: getClientUserPhone(selectedClientData, empObj.assignedTo, empObj.phone)
    };
    if (pointType === 'start') setStartPoint(newPointData);
    else if (pointType === 'end') setEndPoint(newPointData);
    else if (pointType === 'waypoint') { const updatedWaypoints = [...waypoints]; updatedWaypoints[waypointIndex] = newPointData; setWaypoints(updatedWaypoints); }
  };

  useEffect(() => { if (startPoint?.address && endPoint?.address) calculateRoute(); }, [startPoint?.address, endPoint?.address, waypoints]);

  const toGoogleRouteLocation = (point) => {
      if (!point) return null;
      const address = String(point.address || '').trim();
      if (address.length >= 6) return address;
      const lat = Number(point.lat);
      const lng = Number(point.lng ?? point.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  const requestGoogleDrivingRoute = async (points) => {
      if (!isLoaded || !window.google?.maps?.DirectionsService) throw new Error('Google Maps todavía no está listo.');
      const valid = points.filter(Boolean).map(point => ({ source: point, location: toGoogleRouteLocation(point) })).filter(item => item.location);
      if (valid.length < 2) return null;

      const service = new window.google.maps.DirectionsService();
      const result = await new Promise((resolve, reject) => {
          service.route({
              origin: valid[0].location,
              destination: valid[valid.length - 1].location,
              waypoints: valid.slice(1, -1).map(item => ({ location: item.location, stopover: true })),
              optimizeWaypoints: false,
              travelMode: window.google.maps.TravelMode.DRIVING,
              provideRouteAlternatives: valid.length === 2,
              drivingOptions: {
                  departureTime: new Date(),
                  trafficModel: window.google.maps.TrafficModel?.BEST_GUESS || 'bestguess'
              }
          }, (response, status) => {
              if (status === window.google.maps.DirectionsStatus.OK && response?.routes?.[0]) resolve(response);
              else reject(new Error(`Google Directions: ${status}`));
          });
      });

      const route = [...result.routes].sort((a, b) => {
          const distanceA = (a.legs || []).reduce((sum, leg) => sum + (Number(leg.distance?.value) || 0), 0);
          const distanceB = (b.legs || []).reduce((sum, leg) => sum + (Number(leg.distance?.value) || 0), 0);
          return distanceA - distanceB;
      })[0];
      const legs = route.legs || [];
      const geometry = [];
      legs.forEach(leg => (leg.steps || []).forEach(step => (step.path || []).forEach(point => {
          const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
          const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
          if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) geometry.push({ lat: Number(lat), lng: Number(lng) });
      })));

      const segments = legs.map(leg => ({
          distance: ((Number(leg.distance?.value) || 0) / 1000).toFixed(1),
          duration: Math.round((Number(leg.duration_in_traffic?.value || leg.duration?.value) || 0) / 60)
      }));
      const totalMeters = legs.reduce((sum, leg) => sum + (Number(leg.distance?.value) || 0), 0);
      const totalSeconds = legs.reduce((sum, leg) => sum + (Number(leg.duration_in_traffic?.value || leg.duration?.value) || 0), 0);
      const routedStopLocations = [];
      if (legs[0]?.start_location) routedStopLocations.push({ lat: legs[0].start_location.lat(), lng: legs[0].start_location.lng() });
      legs.forEach(leg => {
          if (leg?.end_location) routedStopLocations.push({ lat: leg.end_location.lat(), lng: leg.end_location.lng() });
      });

      return {
          geometry,
          segments,
          totalDistance: (totalMeters / 1000).toFixed(1),
          totalDuration: Math.round(totalSeconds / 60),
          routedStopLocations
      };
  };

  const calculateRoute = async () => {
      setIsLoadingRoute(true);
      try {
          const result = await requestGoogleDrivingRoute([startPoint, ...waypoints, endPoint]);
          if (!result) {
              setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
              return;
          }
          setRouteInfo({
              totalDistance: result.totalDistance,
              totalDuration: result.totalDuration,
              segments: result.segments,
              geometry: result.geometry,
              routedStopLocations: result.routedStopLocations
          });
      } catch (error) {
          console.error('No se pudo calcular la ruta con Google:', error);
          setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
      } finally { setIsLoadingRoute(false); }
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

  const addWaypoint = () => setWaypoints([...waypoints, { address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' }]);
  const removeWaypoint = (i) => setWaypoints(waypoints.filter((_, idx) => idx !== i));
  const updateWaypoint = (i, item) => { const w = [...waypoints]; w[i] = item; setWaypoints(w); };

  const resetManualRouteForm = () => {
      setShowModal(false);
      setEditingPlannedRouteId(null);
      setWalkUpMode(false);
      setWalkUpPassengers([{ name: '', phone: '' }]);
      setWalkUpPricing({
          currency: 'MXN',
          quotedTotal: '',
          recalculateAtEnd: true,
          baseFare: '35',
          perKm: '15',
          perMinute: '1.5',
          serviceFee: '12',
          minimumFare: '75'
      });
      setNewRoute({ client: '', requestUser: '', driver: '', driverId: '', status: 'Pendiente', serviceType: 'Programado', scheduledDate: '', scheduledTime: '' });
      setStartPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
      setEndPoint({ address: '', lat: null, lng: null, contact: '', passengerName: '', phone: '' });
      setWaypoints([]);
      setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
      setSelectedClientData(null);
  };

  const handleSaveRoute = async () => {
      const validWalkUpPassengers = walkUpPassengers
          .map(item => ({ name: String(item.name || '').trim(), phone: normalizeContactPhone(item.phone) }))
          .filter(item => item.name);

      if ((!newRoute.client && !walkUpMode) || !startPoint?.address || !endPoint?.address) {
          return alert(walkUpMode
              ? "Faltan datos obligatorios (Origen y Destino)."
              : "Faltan datos obligatorios (Empresa, Origen, Destino)."
          );
      }

      if (walkUpMode && validWalkUpPassengers.length === 0) {
          return alert("Agrega al menos un pasajero para el servicio ocasional.");
      }

      if (walkUpMode && validWalkUpPassengers.length > 4) {
          return alert("El servicio ocasional admite máximo 4 pasajeros por unidad.");
      }

      const quotedTotal = Number(walkUpPricing.quotedTotal);
      if (walkUpMode && (!Number.isFinite(quotedTotal) || quotedTotal <= 0)) {
          return alert("Define la cotización inicial del servicio.");
      }

      if (walkUpMode && walkUpPricing.recalculateAtEnd) {
          const rateValues = [
              walkUpPricing.baseFare,
              walkUpPricing.perKm,
              walkUpPricing.perMinute,
              walkUpPricing.serviceFee,
              walkUpPricing.minimumFare
          ].map(value => Number(value) || 0);
          if (rateValues.every(value => value <= 0)) {
              return alert("Para recalcular al final, define las tarifas aplicables a la moneda seleccionada.");
          }
      }

      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];
      const existingRoute = editingPlannedRouteId
          ? routesList.find(item => item.id === editingPlannedRouteId)
          : null;

      const occasionalSchedule = validWalkUpPassengers.map((passenger, index) => ({
          stopIndex: 0,
          passengerName: passenger.name,
          phone: passenger.phone,
          contactPhone: passenger.phone,
          pickupTime: newRoute.scheduledTime || '',
          seat: index + 1
      }));

      const startContact = walkUpMode
          ? validWalkUpPassengers.map(item => item.name).join(', ')
          : (startPoint.contact || '');

      const startCoordsSave = {
          lat: startPoint.lat,
          lng: startPoint.lng,
          contact: startContact,
          passengerName: walkUpMode
              ? (validWalkUpPassengers.length === 1 ? validWalkUpPassengers[0].name : startContact)
              : (startPoint.passengerName || startPoint.contact || ''),
          phone: walkUpMode && validWalkUpPassengers.length === 1
              ? validWalkUpPassengers[0].phone
              : normalizeContactPhone(startPoint.phone),
          contactPhone: walkUpMode && validWalkUpPassengers.length === 1
              ? validWalkUpPassengers[0].phone
              : normalizeContactPhone(startPoint.phone)
      };

      if (walkUpMode) {
          startCoordsSave.passengersSchedule = occasionalSchedule;
          startCoordsSave.pickupTime = newRoute.scheduledTime || '';
      } else if (Array.isArray(existingRoute?.startCoords?.passengersSchedule)) {
          startCoordsSave.passengersSchedule = existingRoute.startCoords.passengersSchedule;
          startCoordsSave.sharedMeetingPoint = existingRoute.startCoords.sharedMeetingPoint === true;
          startCoordsSave.pickupTime = existingRoute.startCoords.pickupTime || newRoute.scheduledTime || '';
      }

      const technicalData = {
          ...(existingRoute?.technicalData || {}),
          ...routeInfo,
          routingProvider: 'google-directions'
      };

      const immutablePlan = existingRoute?.originalPlan || (
          existingRoute
              ? {
                  version: 1,
                  createdAt: existingRoute.createdDate || nowIso,
                  geometry: Array.isArray(existingRoute.technicalData?.geometry) ? existingRoute.technicalData.geometry : [],
                  totalDistance: existingRoute.technicalData?.totalDistance ?? null,
                  totalDuration: existingRoute.technicalData?.totalDuration ?? null,
                  segments: Array.isArray(existingRoute.technicalData?.segments) ? existingRoute.technicalData.segments : [],
                  start: existingRoute.start || '',
                  startCoords: existingRoute.startCoords ? {
                      lat: existingRoute.startCoords.lat ?? null,
                      lng: existingRoute.startCoords.lng ?? existingRoute.startCoords.lon ?? null
                  } : null,
                  waypoints: existingRoute.waypoints || [],
                  waypointsData: (existingRoute.waypointsData || []).map(item => ({
                      address: item.address || '',
                      lat: item.lat ?? null,
                      lng: item.lng ?? item.lon ?? null
                  })),
                  end: existingRoute.end || '',
                  endCoords: existingRoute.endCoords ? {
                      lat: existingRoute.endCoords.lat ?? null,
                      lng: existingRoute.endCoords.lng ?? existingRoute.endCoords.lon ?? null
                  } : null
              }
              : buildImmutableOriginalPlan({
                  routeInfo,
                  startPoint,
                  waypoints,
                  endPoint,
                  createdAt: nowIso
              })
      );

      const rutaSave = {
          ...newRoute,
          client: walkUpMode ? (newRoute.client || 'Servicio ocasional') : newRoute.client,
          driver: newRoute.driver,
          driverId: newRoute.driverId,
          status: existingRoute?.status || (newRoute.driver ? 'Aceptada' : 'Pendiente'),
          start: startPoint.address,
          end: endPoint.address,
          tripSource: 'dispatcher',
          createdBy: 'dispatcher',
          chat: existingRoute?.chat || [],
          startCoords: startCoordsSave,
          endCoords: {
              lat: endPoint.lat,
              lng: endPoint.lng,
              contact: endPoint.contact || (walkUpMode ? 'Destino del servicio' : ''),
              passengerName: endPoint.passengerName || endPoint.contact || '',
              phone: normalizeContactPhone(endPoint.phone),
              contactPhone: normalizeContactPhone(endPoint.phone)
          },
          waypointsData: waypoints.map(w => ({
              address: w.address,
              lat: w.lat,
              lng: w.lng,
              contact: w.contact || '',
              passengerName: w.passengerName || w.contact || '',
              phone: normalizeContactPhone(w.phone),
              contactPhone: normalizeContactPhone(w.phone),
              ...(Array.isArray(w.passengersSchedule) ? { passengersSchedule: w.passengersSchedule } : {})
          })),
          waypoints: waypoints.map(w => w.address),
          technicalData,
          originalPlan: immutablePlan,
          finalDate: isProgramado ? newRoute.scheduledDate : today,
          createdDate: existingRoute?.createdDate || nowIso,
          updatedAt: nowIso
      };

      if (!walkUpMode && Array.isArray(existingRoute?.endCoords?.passengersSchedule)) {
          rutaSave.endCoords.passengersSchedule = existingRoute.endCoords.passengersSchedule;
          rutaSave.endCoords.sharedMeetingPoint = existingRoute.endCoords.sharedMeetingPoint === true;
      }

      if (walkUpMode) {
          rutaSave.serviceModel = 'walk_up';
          rutaSave.serviceType = newRoute.serviceType || 'Prioritario';
          rutaSave.passengerSchedule = occasionalSchedule;
          rutaSave.pricingVisibility = 'visible';
          rutaSave.showPricingDuringTrip = true;
          rutaSave.pricingPolicy = 'dispatcher_visible_quote';
          rutaSave.currency = String(walkUpPricing.currency || 'MXN').toUpperCase();
          rutaSave.recalculateAtEnd = Boolean(walkUpPricing.recalculateAtEnd);
          rutaSave.pricingMode = walkUpPricing.recalculateAtEnd ? 'quoted_then_recalculate' : 'fixed_quote';
          rutaSave.pricing = {
              ...(existingRoute?.pricing || {}),
              currency: rutaSave.currency,
              quotedTotal,
              initialQuote: quotedTotal,
              estimatedTotal: quotedTotal,
              total: quotedTotal,
              fixedQuote: !walkUpPricing.recalculateAtEnd,
              recalculateAtEnd: Boolean(walkUpPricing.recalculateAtEnd),
              baseFare: Number(walkUpPricing.baseFare) || 0,
              perKm: Number(walkUpPricing.perKm) || 0,
              perMinute: Number(walkUpPricing.perMinute) || 0,
              serviceFee: Number(walkUpPricing.serviceFee) || 0,
              minimumFare: Number(walkUpPricing.minimumFare) || 0,
              quoteSource: 'dispatcher_walk_up',
              quotedAt: existingRoute?.pricing?.quotedAt || nowIso,
              updatedAt: nowIso
          };
      } else {
          rutaSave.pricingVisibility = existingRoute?.pricingVisibility || 'hidden_during_trip';
          rutaSave.showPricingDuringTrip = existingRoute?.showPricingDuringTrip ?? false;
          rutaSave.pricingPolicy = existingRoute?.pricingPolicy || 'dispatcher_hidden_during_trip';
      }

      try {
          if (editingPlannedRouteId && existingRoute) {
              if (!['Pendiente', 'Aceptada'].includes(existingRoute.status)) {
                  return alert("Solo se pueden modificar rutas que aún no han iniciado.");
              }

              const revision = {
                  changedAt: nowIso,
                  previousTechnicalData: existingRoute.technicalData || null,
                  previousStart: existingRoute.start || '',
                  previousEnd: existingRoute.end || '',
                  previousWaypoints: existingRoute.waypoints || [],
                  previousScheduledDate: existingRoute.scheduledDate || '',
                  previousScheduledTime: existingRoute.scheduledTime || ''
              };

              rutaSave.planRevisions = [...(existingRoute.planRevisions || []), revision];
              rutaSave.planEditedAt = nowIso;
              rutaSave.planEditCount = Number(existingRoute.planEditCount || 0) + 1;

              // Mantener siempre la primera fotografía del plan, aunque se edite.
              rutaSave.originalPlan = existingRoute.originalPlan || immutablePlan;

              await updateDoc(doc(db, "rutas", editingPlannedRouteId), rutaSave);
              alert("✅ Ruta planeada actualizada. El plan original quedó conservado para auditoría.");
          } else {
              await addDoc(collection(db, "rutas"), rutaSave);
              alert(walkUpMode
                  ? `✅ Servicio ocasional creado. Cotización inicial: ${rutaSave.currency} ${quotedTotal.toFixed(2)}.`
                  : "✅ Ruta creada correctamente."
              );
          }

          resetManualRouteForm();
      } catch (e) {
          console.error(e);
          alert(e.message || "No se pudo guardar la ruta.");
      }
  };

  const openEditPlannedRoute = (route, event) => {
      event?.stopPropagation?.();
      if (!route?.id) return;
      if (!['Pendiente', 'Aceptada'].includes(route.status)) {
          alert("Solo se pueden editar rutas que todavía no han iniciado.");
          return;
      }

      setEditingPlannedRouteId(route.id);
      const isWalkUp = route?.serviceModel === 'walk_up';
      setWalkUpMode(isWalkUp);
      setNewRoute({
          client: route.client || '',
          requestUser: route.requestUser || '',
          driver: route.driver || '',
          driverId: route.driverId || '',
          status: route.status || 'Pendiente',
          serviceType: route.serviceType || 'Programado',
          scheduledDate: route.scheduledDate || route.finalDate || '',
          scheduledTime: route.scheduledTime || ''
      });

      const clientObj = availableClients.find(c => c.name === route.client);
      setSelectedClientData(clientObj || null);
      setStartPoint({
          address: route.start || '',
          lat: route.startCoords?.lat ?? null,
          lng: route.startCoords?.lng ?? route.startCoords?.lon ?? null,
          contact: route.startCoords?.contact || '',
          passengerName: route.startCoords?.passengerName || '',
          phone: route.startCoords?.phone || route.startCoords?.contactPhone || ''
      });
      setEndPoint({
          address: route.end || '',
          lat: route.endCoords?.lat ?? null,
          lng: route.endCoords?.lng ?? route.endCoords?.lon ?? null,
          contact: route.endCoords?.contact || '',
          passengerName: route.endCoords?.passengerName || '',
          phone: route.endCoords?.phone || route.endCoords?.contactPhone || ''
      });
      setWaypoints((route.waypointsData || []).map(item => ({
          ...item,
          address: item.address || '',
          lng: item.lng ?? item.lon ?? null
      })));
      setRouteInfo({
          totalDistance: route.technicalData?.totalDistance || 0,
          totalDuration: route.technicalData?.totalDuration || 0,
          segments: route.technicalData?.segments || [],
          geometry: route.technicalData?.geometry || [],
          routedStopLocations: route.technicalData?.routedStopLocations || []
      });

      if (isWalkUp) {
          const passengers = Array.isArray(route.passengerSchedule)
              ? route.passengerSchedule
              : Array.isArray(route.startCoords?.passengersSchedule)
                  ? route.startCoords.passengersSchedule
                  : [];
          setWalkUpPassengers(
              passengers.length
                  ? passengers.slice(0, 4).map(item => ({
                      name: item.passengerName || item.name || '',
                      phone: item.phone || item.contactPhone || ''
                  }))
                  : [{ name: route.startCoords?.passengerName || '', phone: route.startCoords?.phone || '' }]
          );
          setWalkUpPricing({
              currency: route.pricing?.currency || route.currency || 'MXN',
              quotedTotal: String(route.pricing?.quotedTotal ?? route.pricing?.initialQuote ?? route.pricing?.total ?? ''),
              recalculateAtEnd: route.pricing?.recalculateAtEnd !== false && route.recalculateAtEnd !== false,
              baseFare: String(route.pricing?.baseFare ?? 35),
              perKm: String(route.pricing?.perKm ?? 15),
              perMinute: String(route.pricing?.perMinute ?? 1.5),
              serviceFee: String(route.pricing?.serviceFee ?? 12),
              minimumFare: String(route.pricing?.minimumFare ?? 75)
          });
      }

      setShowModal(true);
  };

  // =================================================================================
  // === LÓGICA DEL MÓDULO DE CARPOOLING INTELIGENTE (WIZARD ETAPAS) ===
  // =================================================================================

  const openCarpoolModal = () => {
      setShowCarpoolModal(true);
      setCarpoolStep(1); 
      setNewRoute({...newRoute, client: '', serviceType: 'Programado', scheduledDate: ''});
      setCarpoolGroups([]);
      setEmployeeRoster([]);
      setRosterSearch(''); 
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
      setRosterSearch(''); 

      if (clientObj) {
          const activeUserNames = clientObj.users?.map(u => u.name) || [];
          const emps = clientObj.locations.filter(loc => loc.assignedTo && loc.assignedTo !== 'General' && activeUserNames.includes(loc.assignedTo));
          
          const initialRoster = emps.map(emp => {
              const uData = clientObj.users?.find(u => u.name === emp.assignedTo) || {};
              return {
                  ...emp,
                  included: false,
                  entrada: uData.entrada || '08:00',
                  salida: uData.salida || '17:00',
                  phone: normalizeContactPhone(
                      uData.phone,
                      uData.telefono,
                      uData.whatsapp,
                      uData.mobile,
                      uData.celular,
                      emp.phone
                  )
              }
          });
          setEmployeeRoster(initialRoster.sort(comparePeopleAZ));
      } else { setEmployeeRoster([]); }
  };

  const updateRosterItem = (originalIndex, field, value) => {
      setEmployeeRoster(prev => {
          const newRoster = [...prev];
          newRoster[originalIndex][field] = value;
          return newRoster;
      });
  };

  // --- CALCULAR RUTAS VEHICULARES CON GOOGLE DIRECTIONS ---
  // Soporta varios puntos compartidos dentro de la misma unidad.
  const fetchRealRoutesForGroups = async (groups) => {
      setFetchingRealRoutes(true);
      const oficina = selectedClientData?.locations?.find(l => l.assignedTo === 'General');
      let updatedGroups = [...groups];

      try {
          for (let i = 0; i < updatedGroups.length; i++) {
              const g = updatedGroups[i];
              const passengerStops = buildPassengerStopsForGroup(g);
              const points = [];

              if (globalCarpool.mode === 'Ida') {
                  passengerStops.forEach(stop => points.push(stop));
                  if (oficina) points.push(oficina);
              } else {
                  if (oficina) points.push(oficina);
                  passengerStops.forEach(stop => points.push(stop));
              }

              if (points.length < 2) {
                  updatedGroups[i] = {
                      ...g,
                      routeGeometry: [],
                      routeSegments: [],
                      routedStopLocations: [],
                      passengerStops,
                      totalDistanceKm: null,
                      totalDurationMins: null
                  };
                  continue;
              }

              try {
                  const result = await requestGoogleDrivingRoute(points);
                  if (!result) continue;
                  updatedGroups[i] = {
                      ...g,
                      passengerStops,
                      routeGeometry: result.geometry,
                      routeSegments: result.segments,
                      routedStopLocations: result.routedStopLocations,
                      totalDistanceKm: result.totalDistance,
                      totalDurationMins: result.totalDuration,
                      routingProvider: 'google-directions'
                  };
              } catch (routeError) {
                  console.error('Google Directions Error', routeError);
                  updatedGroups[i] = {
                      ...g,
                      passengerStops,
                      routeGeometry: [],
                      routeSegments: [],
                      routedStopLocations: [],
                      totalDistanceKm: null,
                      totalDurationMins: null
                  };
              }
          }
          setCarpoolGroups(updatedGroups);
      } finally {
          setFetchingRealRoutes(false);
      }
  };

  const isEmpInAnyGroup = (name) => { return carpoolGroups.some(g => g.employees.some(e => e.assignedTo === name)); };

  const addEmployeeToGroup = async (groupId, empObj) => {
      if(!empObj) return;
      let newGroups = [];
      setCarpoolGroups(prev => {
          const cleanedGroups = prev.map(g => ({
              ...g,
              employees: g.employees.filter(e => e.assignedTo !== empObj.assignedTo),
              sharedMeetingPoints: (g.sharedMeetingPoints || []).map(point => ({
                  ...point,
                  passengerNames: (point.passengerNames || []).filter(name => name !== empObj.assignedTo)
              }))
          }));
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
                  sharedMeetingPoint: { active: false, address: '', lat: null, lng: null },
                  sharedMeetingPoints: isShared ? [{ id: `meeting_${groupIdx}_1`, active: true, address: '', lat: null, lng: null, passengerNames: currentGrp.map(emp => emp.assignedTo) }] : [],
                  routeGeometry: [],
                  routeSegments: [],
                  totalDistanceKm: null,
                  totalDurationMins: null
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
                  sharedMeetingPoints: [],
                  routeGeometry: [],
                  routeSegments: [],
                  totalDistanceKm: null,
                  totalDurationMins: null
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
                  const removed = newEmp[empIndex];
                  newEmp.splice(empIndex, 1);
                  return {
                      ...g,
                      employees: newEmp,
                      sharedMeetingPoints: (g.sharedMeetingPoints || []).map(point => ({
                          ...point,
                          passengerNames: (point.passengerNames || []).filter(name => name !== removed?.assignedTo)
                      }))
                  };
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
              newGroups[sIdx] = {
                  ...newGroups[sIdx],
                  employees: sEmps,
                  sharedMeetingPoints: (newGroups[sIdx].sharedMeetingPoints || []).map(point => ({
                      ...point,
                      passengerNames: (point.passengerNames || []).filter(name => name !== moved?.assignedTo)
                  }))
              };
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

  const refreshGroupsAfterChange = (nextGroups) => {
      setCarpoolGroups(nextGroups);
      setTimeout(() => fetchRealRoutesForGroups(nextGroups), 80);
  };

  const addGroupMeetingPoint = (groupId) => {
      const nextGroups = carpoolGroups.map(group => {
          if (group.id !== groupId) return group;
          const current = Array.isArray(group.sharedMeetingPoints) ? group.sharedMeetingPoints : [];
          if (current.length >= 4) {
              alert("Puedes configurar hasta 4 puntos de reunión por unidad.");
              return group;
          }
          return {
              ...group,
              sharedMeetingPoints: [
                  ...current,
                  {
                      id: `meeting_${group.id}_${Date.now()}`,
                      active: true,
                      address: '',
                      lat: null,
                      lng: null,
                      passengerNames: []
                  }
              ]
          };
      });
      setCarpoolGroups(nextGroups);
  };

  const updateGroupMeetingPoint = (groupId, meetingId, updates, recalculate = false) => {
      const nextGroups = carpoolGroups.map(group => {
          if (group.id !== groupId) return group;
          return {
              ...group,
              sharedMeetingPoints: (group.sharedMeetingPoints || []).map(point =>
                  point.id === meetingId ? { ...point, ...updates } : point
              )
          };
      });
      if (recalculate) refreshGroupsAfterChange(nextGroups);
      else setCarpoolGroups(nextGroups);
  };

  const removeGroupMeetingPoint = (groupId, meetingId) => {
      const nextGroups = carpoolGroups.map(group =>
          group.id === groupId
              ? {
                  ...group,
                  sharedMeetingPoints: (group.sharedMeetingPoints || []).filter(point => point.id !== meetingId)
              }
              : group
      );
      refreshGroupsAfterChange(nextGroups);
  };

  const toggleMeetingPassenger = (groupId, meetingId, employeeName) => {
      const nextGroups = carpoolGroups.map(group => {
          if (group.id !== groupId) return group;

          // Un pasajero solo puede pertenecer a un punto compartido.
          const cleared = (group.sharedMeetingPoints || []).map(point => ({
              ...point,
              passengerNames: (point.passengerNames || []).filter(name => name !== employeeName)
          }));

          return {
              ...group,
              sharedMeetingPoints: cleared.map(point => {
                  if (point.id !== meetingId) return point;
                  const wasAssigned = (group.sharedMeetingPoints || [])
                      .find(item => item.id === meetingId)
                      ?.passengerNames?.includes(employeeName);
                  return {
                      ...point,
                      passengerNames: wasAssigned
                          ? point.passengerNames
                          : [...(point.passengerNames || []), employeeName]
                  };
              })
          };
      });
      refreshGroupsAfterChange(nextGroups);
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
                      const previewStops = buildPassengerStopsForGroup(g);
                      previewStops.forEach(stop => {
                          if (Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) {
                              bounds.extend({ lat: Number(stop.lat), lng: Number(stop.lng) });
                              hasPoints = true;
                          }
                      });
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

      for (const group of validGroups) {
          if(!group.driverId) return alert("⚠️ Todos los grupos deben tener un conductor asignado.");

          for (const point of getGroupMeetingPoints(group)) {
              if (!point.address || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng ?? point.lon))) {
                  return alert("⚠️ Hay un punto de reunión sin ubicación válida.");
              }
              if (!Array.isArray(point.passengerNames) || point.passengerNames.length === 0) {
                  return alert("⚠️ Asigna al menos un pasajero a cada punto de reunión.");
              }
          }
      }

      try {
          for (const g of validGroups) {
              const passengerStops = buildPassengerStopsForGroup(g);
              if (!passengerStops.length) {
                  throw new Error(`La unidad de ${g.driverName || 'conductor'} no tiene puntos válidos.`);
              }

              const resolveEmployeePhone = (employee) =>
                  getClientUserPhone(selectedClientData, employee?.assignedTo, employee?.phone);

              const hasSharedStops = passengerStops.some(stop => stop.employees.length > 1 || stop.stopType === 'shared_meeting');

              const timePlan = buildCarpoolTimePlan({
                  timeKey: g.timeKey,
                  totalDurationMins: g.totalDurationMins,
                  routeSegments: g.routeSegments || [],
                  mode: globalCarpool.mode,
                  passengerCount: g.employees.length,
                  isShared: hasSharedStops
              });

              const routePoints = globalCarpool.mode === 'Ida'
                  ? [...passengerStops, {
                      stopType: 'office',
                      address: oficina.address,
                      lat: Number(oficina.lat),
                      lng: Number(oficina.lng ?? oficina.lon),
                      employees: []
                  }]
                  : [{
                      stopType: 'office',
                      address: oficina.address,
                      lat: Number(oficina.lat),
                      lng: Number(oficina.lng ?? oficina.lon),
                      employees: []
                  }, ...passengerStops];

              const routedPointAt = (index, fallback) => {
                  const point = g.routedStopLocations?.[index];
                  if (
                      point &&
                      Number.isFinite(Number(point.lat)) &&
                      Number.isFinite(Number(point.lng))
                  ) {
                      return { lat: Number(point.lat), lng: Number(point.lng) };
                  }
                  return {
                      lat: Number(fallback?.lat),
                      lng: Number(fallback?.lng ?? fallback?.lon)
                  };
              };

              // Hora por punto: quienes comparten punto reciben la misma hora;
              // los siguientes puntos avanzan con el tiempo de ruta + 5 min por pasajero.
              const pickupTimeByPassenger = new Map();
              if (globalCarpool.mode === 'Ida') {
                  let pickupCursor = parseTimeKeyToDate(timePlan.startTime);
                  passengerStops.forEach((stop, stopIndex) => {
                      stop.employees.forEach(employee => {
                          pickupTimeByPassenger.set(employee.assignedTo, formatHHMM(pickupCursor));
                      });
                      pickupCursor = addMinutesToDate(
                          pickupCursor,
                          (stop.employees.length * PASSENGER_PICKUP_BUFFER_MINS) +
                          safeMinutes(g.routeSegments?.[stopIndex]?.duration)
                      );
                  });
              }

              const passengerSchedule = [];
              passengerStops.forEach((stop, stopIndexWithinPassengers) => {
                  const routeStopIndex = globalCarpool.mode === 'Ida'
                      ? stopIndexWithinPassengers
                      : stopIndexWithinPassengers + 1;

                  stop.employees.forEach(employee => {
                      const exactPhone = resolveEmployeePhone(employee);
                      passengerSchedule.push({
                          stopIndex: routeStopIndex,
                          passengerName: employee.assignedTo,
                          phone: exactPhone,
                          contactPhone: exactPhone,
                          pickupTime: globalCarpool.mode === 'Ida'
                              ? (pickupTimeByPassenger.get(employee.assignedTo) || timePlan.startTime)
                              : '',
                          bufferMins: globalCarpool.mode === 'Ida' ? PASSENGER_PICKUP_BUFFER_MINS : 0,
                          meetingPointId: stop.stopType === 'shared_meeting' ? stop.id : ''
                      });
                  });
              });

              const buildSavedPoint = (routePoint, routeIndex) => {
                  const snapped = routedPointAt(routeIndex, routePoint);
                  const schedules = (routePoint.employees || []).map(employee => {
                      return passengerSchedule.find(item => item.passengerName === employee.assignedTo);
                  }).filter(Boolean);
                  const contact = (routePoint.employees || []).map(employee => employee.assignedTo).join(', ');

                  const saved = {
                      address: routePoint.address,
                      lat: snapped.lat,
                      lng: snapped.lng,
                      contact: routePoint.stopType === 'office' ? 'Oficina Central' : contact,
                      passengerName: routePoint.stopType === 'office'
                          ? 'Oficina Central'
                          : (routePoint.employees.length === 1 ? routePoint.employees[0].assignedTo : contact),
                      phone: routePoint.employees.length === 1
                          ? resolveEmployeePhone(routePoint.employees[0])
                          : '',
                      contactPhone: routePoint.employees.length === 1
                          ? resolveEmployeePhone(routePoint.employees[0])
                          : '',
                      stopType: routePoint.stopType
                  };

                  if (schedules.length > 1 || routePoint.stopType === 'shared_meeting') {
                      saved.passengersSchedule = schedules;
                      saved.sharedMeetingPoint = true;
                  }

                  if (globalCarpool.mode === 'Ida' && schedules.length) {
                      saved.pickupTime = schedules
                          .map(item => item.pickupTime)
                          .filter(Boolean)
                          .sort()[0] || timePlan.startTime;
                      saved.pickupBufferMins = PASSENGER_PICKUP_BUFFER_MINS;
                  }

                  return saved;
              };

              const savedRoutePoints = routePoints.map(buildSavedPoint);
              const startCoordsSave = savedRoutePoints[0];
              const endCoordsSave = savedRoutePoints[savedRoutePoints.length - 1];
              const intermediateSaved = savedRoutePoints.slice(1, -1);

              if (globalCarpool.mode === 'Ida') {
                  endCoordsSave.targetArrivalTime = timePlan.targetFinalArrivalTime;
                  endCoordsSave.officialScheduledTime = g.timeKey;
                  endCoordsSave.finalEarlyBufferMins = FINAL_DESTINATION_EARLY_MINS;
              }

              const createdAt = new Date().toISOString();
              const technicalData = {
                  geometry: g.routeGeometry || [],
                  routingProvider: 'google-directions',
                  segments: g.routeSegments || [],
                  totalDistance: g.totalDistanceKm || null,
                  totalDuration: g.totalDurationMins || 0,
                  totalDurationMins: g.totalDurationMins || 0,
                  routedStopLocations: g.routedStopLocations || [],
                  carpool: {
                      mode: globalCarpool.mode,
                      officialScheduledTime: g.timeKey,
                      startTime: timePlan.startTime,
                      targetArrivalTime: timePlan.targetFinalArrivalTime,
                      estimatedFinalArrivalTime: timePlan.estimatedFinalArrivalTime,
                      finalEarlyBufferMins: timePlan.finalEarlyBufferMins,
                      passengerBufferMins: timePlan.passengerBufferMins,
                      totalPassengerBufferMins: timePlan.totalPassengerBufferMins,
                      passengerCount: g.employees.length,
                      passengerSchedule,
                      meetingPoints: getGroupMeetingPoints(g).map(point => ({
                          id: point.id,
                          address: point.address,
                          lat: Number(point.lat),
                          lng: Number(point.lng ?? point.lon),
                          passengerNames: point.passengerNames || []
                      }))
                  }
              };

              const originalPlan = {
                  version: 1,
                  createdAt,
                  geometry: [...(g.routeGeometry || [])],
                  totalDistance: g.totalDistanceKm || null,
                  totalDuration: g.totalDurationMins || 0,
                  segments: [...(g.routeSegments || [])],
                  start: startCoordsSave.address,
                  startCoords: { lat: startCoordsSave.lat, lng: startCoordsSave.lng },
                  waypoints: intermediateSaved.map(item => item.address),
                  waypointsData: intermediateSaved.map(item => ({
                      address: item.address,
                      lat: item.lat,
                      lng: item.lng
                  })),
                  end: endCoordsSave.address,
                  endCoords: { lat: endCoordsSave.lat, lng: endCoordsSave.lng }
              };

              const newTrip = {
                  client: newRoute.client,
                  driver: g.driverName,
                  driverId: g.driverId,
                  status: 'Aceptada',
                  serviceType: 'Programado',
                  tripSource: 'dispatcher',
                  createdBy: 'dispatcher',
                  pricingVisibility: 'hidden_during_trip',
                  showPricingDuringTrip: false,
                  pricingPolicy: 'dispatcher_hidden_during_trip',
                  chat: [],
                  scheduledDate: newRoute.scheduledDate,
                  scheduledTime: g.timeKey,
                  startTime: timePlan.startTime,
                  targetArrivalTime: timePlan.targetFinalArrivalTime,
                  officialScheduledTime: g.timeKey,
                  estimatedFinalArrivalTime: timePlan.estimatedFinalArrivalTime,
                  finalEarlyBufferMins: timePlan.finalEarlyBufferMins,
                  passengerBufferMins: timePlan.passengerBufferMins,
                  totalPassengerBufferMins: timePlan.totalPassengerBufferMins,
                  passengerSchedule,
                  start: startCoordsSave.address,
                  startCoords: startCoordsSave,
                  end: endCoordsSave.address,
                  endCoords: endCoordsSave,
                  waypointsData: intermediateSaved,
                  waypoints: intermediateSaved.map(item => item.address),
                  technicalData,
                  originalPlan,
                  finalDate: newRoute.scheduledDate,
                  createdDate: createdAt
              };

              await addDoc(collection(db, "rutas"), newTrip);
          }

          alert(`✅ ¡Logística completada! Rutas de ${globalCarpool.mode} creadas con éxito.`);
          setShowCarpoolModal(false);
      } catch(e) {
          console.error(e);
          alert(e?.message || "Error al generar las rutas.");
      }
  };

  const handleDeleteRoute = async (id, e) => { e.stopPropagation(); if(confirm("¿Eliminar ruta permanentemente?")) { await deleteDoc(doc(db, "rutas", id)); if(viewRoute?.id === id) setViewRoute(null); } };
  const confirmAssignDriver = async () => { if (!newRoute.driver) return alert("Selecciona un conductor primero."); try { await updateDoc(doc(db, "rutas", routeToAssign.id), { driver: newRoute.driver, driverId: newRoute.driverId, status: 'Aceptada' }); setShowAssignModal(false); setRouteToAssign(null); setNewRoute({ ...newRoute, driver: '', driverId: '' }); } catch (e) {} };
  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);
  const handlePreviewMapLoad = useCallback((map) => { previewMapRef.current = map; }, []);
  const routeToDisplay = viewRoute?.technicalData?.geometry ? viewRoute.technicalData.geometry : [];
  let mapCenter = centerMX; if(routeToDisplay.length > 0) mapCenter = routeToDisplay[0];
  const activePlanRoutes = routesList
      .filter(r => r.status === 'Pendiente' || r.status === 'Aceptada' || r.status === 'En Ruta')
      .sort((a, b) => {
          if (a.status === 'En Ruta' && b.status !== 'En Ruta') return -1;
          if (b.status === 'En Ruta' && a.status !== 'En Ruta') return 1;
          return getPlanSortTimestamp(a) - getPlanSortTimestamp(b);
      });

  if (!isLoaded) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-slate-800"/></div>;

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2><p className="text-slate-500 text-sm">{activePlanRoutes.length} viajes pendientes o activos</p></div>
          <div className="flex gap-3">
              <button onClick={openCarpoolModal} className="bg-orange-100 text-orange-700 border border-orange-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-orange-200 transition"><Network className="w-4 h-4" /> Optimizar Grupos de Personal</button>
              <button onClick={() => { setViewRoute(null); setEditingPlannedRouteId(null); setWalkUpMode(false); setShowModal(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg hover:bg-slate-900 transition"><Plus className="w-4 h-4" /> Nueva Ruta Manual</button>
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
                          <div className="flex gap-1">
                              {['Pendiente', 'Aceptada'].includes(ruta.status) && (
                                  <button
                                      type="button"
                                      onClick={(e) => openEditPlannedRoute(ruta, e)}
                                      className="text-blue-600 bg-blue-50 px-2 py-1.5 rounded hover:bg-blue-100 transition text-[9px] font-black uppercase"
                                      title="Modificar ruta planeada antes de iniciar"
                                  >
                                      EDITAR
                                  </button>
                              )}
                              <button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-red-400 bg-red-50 p-1.5 rounded hover:bg-red-100 transition"><Trash2 className="w-4 h-4"/></button>
                          </div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-0.5 truncate">{ruta.client}</h4>
                    {ruta.serviceModel === 'walk_up' && Number(ruta.pricing?.quotedTotal ?? ruta.pricing?.total) > 0 && (
                        <div className="mt-1 mb-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[9px] font-black text-emerald-700">
                            COTIZADO: {ruta.pricing?.currency || ruta.currency || 'MXN'} {Number(ruta.pricing?.quotedTotal ?? ruta.pricing?.total).toFixed(2)}
                            {ruta.pricing?.recalculateAtEnd !== false && <span className="text-emerald-500">· RECÁLCULO FINAL</span>}
                        </div>
                    )}

                    
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
                                              <div className="relative mb-4">
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

                                              <div className="mb-5 bg-orange-50 border border-orange-200 rounded-xl p-4">
                                                  <div className="flex items-center justify-between gap-3 mb-2">
                                                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Pasajeros seleccionados</p>
                                                      <span className="text-[10px] font-black bg-orange-500 text-white rounded-full px-2.5 py-1">{employeeRoster.filter(emp => emp.included).length}</span>
                                                  </div>
                                                  {employeeRoster.filter(emp => emp.included).length === 0 ? (
                                                      <p className="text-xs font-bold text-orange-400">Aún no has seleccionado pasajeros.</p>
                                                  ) : (
                                                      <div className="flex flex-wrap gap-2">
                                                          {employeeRoster.filter(emp => emp.included).sort(comparePeopleAZ).map((emp, index) => (
                                                              <span key={`selected-${emp.assignedTo}-${index}`} className="inline-flex items-center gap-1.5 bg-white border border-orange-200 rounded-full px-3 py-1.5 text-[10px] font-black text-slate-700 shadow-sm">
                                                                  <CheckCircle2 className="w-3 h-3 text-orange-500" /> {emp.assignedTo}
                                                              </span>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>

                                              <div className="space-y-3">
                                                  {employeeRoster
                                                      .map((emp, originalIndex) => ({ ...emp, originalIndex }))
                                                      .sort((a, b) => {
                                                          if (a.included !== b.included) return a.included ? -1 : 1;
                                                          return comparePeopleAZ(a, b);
                                                      })
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
                                              const timePlan = buildCarpoolTimePlan({
                                                  timeKey: grupo.timeKey,
                                                  totalDurationMins: grupo.totalDurationMins,
                                                  routeSegments: grupo.routeSegments || [],
                                                  mode: globalCarpool.mode,
                                                  passengerCount: grupo.employees.length,
                                                  isShared: getGroupMeetingPoints(grupo).length > 0
                                              });
                                              
                                              return (
                                              <div key={grupo.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${isPreviewing ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200'}`}>
                                                  <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
                                                      <div className="flex items-center gap-2">
                                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: groupColor }}></div>
                                                          <h4 className="font-black text-sm">Vehículo {idx + 1}</h4>
                                                          
                                                          {/* --- MOSTRAR HORA DE RECOLECCIÓN O SALIDA --- */}
                                                          {globalCarpool.mode === 'Ida' && grupo.totalDurationMins != null ? (
                                                              <span
                                                                  className="ml-2 text-[10px] bg-slate-700 px-2 py-1 rounded font-bold border border-slate-600 text-green-400"
                                                                  title={`Entrada oficial ${grupo.timeKey}. Llegada objetivo: ${buildCarpoolTimePlan({
                                                                      timeKey: grupo.timeKey,
                                                                      totalDurationMins: grupo.totalDurationMins,
                                                                      routeSegments: grupo.routeSegments || [],
                                                                      mode: 'Ida',
                                                                      passengerCount: grupo.employees.length,
                                                                      isShared: getGroupMeetingPoints(grupo).length > 0
                                                                  }).targetFinalArrivalTime}. Incluye 10 min de antelación final y 5 min por pasajero.`}
                                                              >
                                                                  <Clock className="w-3 h-3 inline mr-1"/>RECOGER: {getCalculatedStartTime(grupo.timeKey, grupo.totalDurationMins, 'Ida', grupo.employees.length)}
                                                              </span>
                                                          ) : (
                                                              <span className="ml-2 text-[10px] bg-slate-600 px-2 py-1 rounded font-bold border border-slate-500">
                                                                  <Clock className="w-3 h-3 inline mr-1"/>SALIDA: {grupo.timeKey}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <div className="flex gap-2">
                                                          <span className="text-[10px] bg-slate-700 px-2 py-1 rounded font-bold">{grupo.employees.length}/4 pax</span>
                                                          {grupo.totalDistanceKm != null && <span className="text-[10px] bg-slate-700 px-2 py-1 rounded font-bold">{grupo.totalDistanceKm} km</span>}
                                                          {grupo.totalDurationMins != null && <span className="text-[10px] bg-slate-700 px-2 py-1 rounded font-bold">{grupo.totalDurationMins} min</span>}
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
                                                      
                                                                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                          <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Pasajeros seleccionados</p>
                                                          <div className="flex flex-wrap gap-2">
                                                              {grupo.employees.map((emp, empIdx) => (
                                                                  <span key={`sel-${grupo.id}-${empIdx}`} className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                                                                      {globalCarpool.mode === 'Ida' ? String.fromCharCode(65 + empIdx) : String.fromCharCode(66 + empIdx)} · {emp.assignedTo}
                                                                  </span>
                                                              ))}
                                                          </div>
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
                                                                      className={`flex items-center gap-2 bg-slate-50 border p-2 rounded cursor-grab active:cursor-grabbing hover:border-orange-300 transition ${getEmployeeMeetingPoint(grupo, emp.assignedTo) ? 'border-orange-200 bg-orange-50/50' : 'border-slate-100'}`}
                                                                  >
                                                                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0"/>
                                                                      {!getEmployeeMeetingPoint(grupo, emp.assignedTo) && (
                                                                         <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-slate-400" style={{ backgroundColor: groupColor }}>
                                                                             {globalCarpool.mode === 'Ida' ? String.fromCharCode(65+eIdx) : String.fromCharCode(66+eIdx)}
                                                                         </div>
                                                                      )}
                                                                      <div className="flex-1 overflow-hidden">
                                                                          <p className="text-xs font-bold text-slate-700 truncate">{emp.assignedTo}</p>
                                                                          {timePlan.pickupTimes?.[eIdx] && (
                                                                              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Paso estimado: {timePlan.pickupTimes[eIdx]}</p>
                                                                          )}
                                                                      </div>
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
                                                                          !grupo.employees.some(e => e.assignedTo === l.assignedTo) 
                                                                      ) || []} 
                                                                      placeholder="🔍 Buscar para agregar/mover aquí..." 
                                                                      onSelect={(emp) => addEmployeeToGroup(grupo.id, emp)} 
                                                                  />
                                                              </div>
                                                          )}
                                                      </div>

                                                      <div className="pt-3 border-t border-slate-200 mt-2">
                                                          <div className="flex items-center justify-between gap-3 mb-3">
                                                              <div>
                                                                  <p className="text-[10px] font-black text-slate-600 uppercase">Puntos de reunión compartidos</p>
                                                                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">Puedes usar varios puntos en la misma ruta, tanto de ida como de regreso.</p>
                                                              </div>
                                                              <button
                                                                  type="button"
                                                                  onClick={() => addGroupMeetingPoint(grupo.id)}
                                                                  className="px-3 py-2 rounded-lg bg-orange-100 text-orange-700 border border-orange-200 text-[9px] font-black uppercase hover:bg-orange-200"
                                                              >
                                                                  + Agregar punto
                                                              </button>
                                                          </div>

                                                          {(grupo.sharedMeetingPoints || []).length === 0 && (
                                                              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
                                                                  <p className="text-[10px] font-bold text-slate-400">Sin puntos compartidos. Cada pasajero se recoge/entrega en su dirección.</p>
                                                              </div>
                                                          )}

                                                          <div className="space-y-3">
                                                              {(grupo.sharedMeetingPoints || []).map((meeting, meetingIndex) => (
                                                                  <div key={meeting.id} className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-3">
                                                                      <div className="flex items-center justify-between gap-2">
                                                                          <p className="text-[10px] font-black uppercase text-orange-700">Punto compartido {meetingIndex + 1}</p>
                                                                          <button
                                                                              type="button"
                                                                              onClick={() => removeGroupMeetingPoint(grupo.id, meeting.id)}
                                                                              className="p-1.5 bg-white border border-red-100 text-red-400 rounded-lg hover:text-red-600"
                                                                              title="Eliminar punto compartido"
                                                                          >
                                                                              <X className="w-3.5 h-3.5"/>
                                                                          </button>
                                                                      </div>

                                                                      <AddressAutocomplete
                                                                          isLoaded={isLoaded}
                                                                          placeholder="Buscar plaza, acceso, evento, centro de reunión..."
                                                                          value={meeting.address}
                                                                          onSelect={(loc) => updateGroupMeetingPoint(
                                                                              grupo.id,
                                                                              meeting.id,
                                                                              { address: loc.address, lat: loc.lat, lng: loc.lon || loc.lng },
                                                                              true
                                                                          )}
                                                                          iconColor="orange"
                                                                          zIndex={150 - (idx * 10) - meetingIndex}
                                                                      />

                                                                      <div>
                                                                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Pasajeros en este punto</p>
                                                                          <div className="flex flex-wrap gap-2">
                                                                              {grupo.employees.map((emp) => {
                                                                                  const assignedPoint = getEmployeeMeetingPoint(grupo, emp.assignedTo);
                                                                                  const selectedHere = assignedPoint?.id === meeting.id;
                                                                                  return (
                                                                                      <button
                                                                                          key={`${meeting.id}-${emp.assignedTo}`}
                                                                                          type="button"
                                                                                          onClick={() => toggleMeetingPassenger(grupo.id, meeting.id, emp.assignedTo)}
                                                                                          className={`px-2.5 py-1.5 rounded-full border text-[9px] font-black transition ${
                                                                                              selectedHere
                                                                                                  ? 'bg-orange-500 border-orange-500 text-white'
                                                                                                  : assignedPoint
                                                                                                      ? 'bg-slate-100 border-slate-200 text-slate-400'
                                                                                                      : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300'
                                                                                          }`}
                                                                                          title={assignedPoint && !selectedHere ? 'Asignado a otro punto compartido' : ''}
                                                                                      >
                                                                                          {selectedHere ? '✓ ' : ''}{emp.assignedTo}
                                                                                      </button>
                                                                                  );
                                                                              })}
                                                                          </div>
                                                                      </div>
                                                                  </div>
                                                              ))}
                                                          </div>
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
                                                  const passengerStops = buildPassengerStopsForGroup(g);

                                                  // RENDERIZAR RUTA REAL CALCULADA POR GOOGLE
                                                  if (g.routeGeometry && g.routeGeometry.length > 0) {
                                                      return (
                                                          <React.Fragment key={`real-route-${g.id}`}>
                                                              <Polyline path={g.routeGeometry} options={{ strokeColor: gColor, strokeOpacity: 0.8, strokeWeight: 5 }} />
                                                              {passengerStops.map((stop, stopIndex) => (
                                                                  <Marker
                                                                      key={`stop-${g.id}-${stop.id}-${stopIndex}`}
                                                                      position={{ lat: Number(stop.lat), lng: Number(stop.lng) }}
                                                                      icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: stop.stopType === 'shared_meeting' ? 7 : 5, fillColor: gColor, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 }}
                                                                      label={{
                                                                          text: String.fromCharCode(65 + stopIndex),
                                                                          color: 'white',
                                                                          fontSize: '10px'
                                                                      }}
                                                                      title={stop.stopType === 'shared_meeting'
                                                                          ? `Punto compartido: ${stop.employees.map(item => item.assignedTo).join(', ')}`
                                                                          : stop.employees[0]?.assignedTo || 'Pasajero'}
                                                                  />
                                                              ))}
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
                    <div><h3 className="text-lg font-bold text-slate-800">{editingPlannedRouteId ? 'Modificar Ruta Planeada' : walkUpMode ? 'Servicio Ocasional / Centro de Acopio' : 'Planificar Ruta de Personal'}</h3></div>
                    <button onClick={resetManualRouteForm}><X className="w-6 h-6 text-slate-400 hover:text-red-500 transition" /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-[45%] p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-[5px_0_15px_-5px_rgba(0,0,0,0.1)] relative scrollbar-thin">
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <label className="block text-xs font-bold text-slate-500 uppercase">Configuración de Viaje</label>
                                    {editingPlannedRouteId && (
                                        <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded">
                                            Editando ruta planeada
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setWalkUpMode(false);
                                            if (newRoute.client === 'Servicio ocasional') setNewRoute({...newRoute, client: ''});
                                        }}
                                        className={`py-2.5 rounded-lg text-[10px] font-black uppercase border transition ${!walkUpMode ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                                    >
                                        Cuenta / Empresa
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setWalkUpMode(true);
                                            setSelectedClientData(null);
                                            setNewRoute({...newRoute, client: 'Servicio ocasional'});
                                        }}
                                        className={`py-2.5 rounded-lg text-[10px] font-black uppercase border transition ${walkUpMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-200'}`}
                                    >
                                        Servicio ocasional / acopio
                                    </button>
                                </div>

                                <div className="flex gap-3 mb-3">
                                    <button type="button" onClick={() => setNewRoute({...newRoute, serviceType: 'Prioritario'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Prioritario' ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400'}`}><Zap className="w-4 h-4" /> INMEDIATO</button>
                                    <button type="button" onClick={() => setNewRoute({...newRoute, serviceType: 'Programado'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Programado' ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400'}`}><Calendar className="w-4 h-4" /> PROGRAMADO</button>
                                </div>

                                {isProgramado && (
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} />
                                        <input type="time" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} />
                                    </div>
                                )}

                                {!walkUpMode ? (
                                    <div className="mt-4">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Empresa / Cuenta Responsable</label>
                                        <select className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" value={newRoute.client} onChange={handleClientChange}>
                                            <option value="">Selecciona la empresa...</option>
                                            {availableClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="mt-4 space-y-4">
                                        <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Pasajeros ocasionales</p>
                                                    <p className="text-[9px] font-bold text-orange-500 mt-0.5">1 a 4 plazas sin crear usuarios permanentes.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={walkUpPassengers.length >= 4}
                                                    onClick={() => setWalkUpPassengers(prev => [...prev, { name: '', phone: '' }])}
                                                    className="px-2.5 py-1.5 rounded-lg bg-white border border-orange-200 text-orange-700 text-[9px] font-black disabled:opacity-40"
                                                >
                                                    + PLAZA
                                                </button>
                                            </div>

                                            <div className="space-y-2">
                                                {walkUpPassengers.map((passenger, index) => (
                                                    <div key={`walkup-${index}`} className="grid grid-cols-[1fr_0.8fr_auto] gap-2">
                                                        <input
                                                            type="text"
                                                            value={passenger.name}
                                                            onChange={(event) => setWalkUpPassengers(prev => prev.map((item, itemIndex) => itemIndex === index ? {...item, name: event.target.value} : item))}
                                                            placeholder={`Pasajero ${index + 1}`}
                                                            className="w-full p-2.5 rounded-lg border border-orange-200 bg-white text-xs outline-none focus:border-orange-500"
                                                        />
                                                        <input
                                                            type="tel"
                                                            value={passenger.phone}
                                                            onChange={(event) => setWalkUpPassengers(prev => prev.map((item, itemIndex) => itemIndex === index ? {...item, phone: event.target.value} : item))}
                                                            placeholder="WhatsApp"
                                                            className="w-full p-2.5 rounded-lg border border-orange-200 bg-white text-xs outline-none focus:border-orange-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={walkUpPassengers.length <= 1}
                                                            onClick={() => setWalkUpPassengers(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                                            className="p-2.5 rounded-lg bg-white border border-red-100 text-red-400 disabled:opacity-30"
                                                        >
                                                            <X className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-3">
                                            <div className="grid grid-cols-[0.7fr_1.3fr] gap-2">
                                                <select
                                                    value={walkUpPricing.currency}
                                                    onChange={(event) => setWalkUpPricing(prev => ({
                                                        ...prev,
                                                        currency: event.target.value,
                                                        ...(event.target.value === 'COP' ? {
                                                            baseFare: '',
                                                            perKm: '',
                                                            perMinute: '',
                                                            serviceFee: '',
                                                            minimumFare: ''
                                                        } : {})
                                                    }))}
                                                    className="p-2.5 rounded-lg border border-emerald-200 bg-white text-xs font-black"
                                                >
                                                    <option value="MXN">MXN</option>
                                                    <option value="COP">COP</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={walkUpPricing.quotedTotal}
                                                    onChange={(event) => setWalkUpPricing(prev => ({...prev, quotedTotal: event.target.value}))}
                                                    placeholder="Cotización inicial al usuario"
                                                    className="p-2.5 rounded-lg border border-emerald-200 bg-white text-xs font-black outline-none focus:border-emerald-500"
                                                />
                                            </div>

                                            <label className="flex items-start gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={walkUpPricing.recalculateAtEnd}
                                                    onChange={(event) => setWalkUpPricing(prev => ({...prev, recalculateAtEnd: event.target.checked}))}
                                                    className="mt-0.5 w-4 h-4"
                                                />
                                                <span className="text-[10px] font-bold text-emerald-800">
                                                    Recalcular al finalizar con kilómetros y tiempo reales. Si se desactiva, la cotización queda fija.
                                                </span>
                                            </label>

                                            {walkUpPricing.recalculateAtEnd && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        ['baseFare', 'Tarifa base'],
                                                        ['perKm', 'Por km'],
                                                        ['perMinute', 'Por minuto'],
                                                        ['serviceFee', 'Cuota operativa'],
                                                        ['minimumFare', 'Tarifa mínima']
                                                    ].map(([field, label]) => (
                                                        <label key={field} className="text-[9px] font-black uppercase text-emerald-700">
                                                            {label}
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={walkUpPricing[field]}
                                                                onChange={(event) => setWalkUpPricing(prev => ({...prev, [field]: event.target.value}))}
                                                                className="mt-1 w-full p-2 rounded-lg border border-emerald-200 bg-white text-xs text-slate-700 outline-none"
                                                            />
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
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
                    <button onClick={resetManualRouteForm} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancelar</button>
                    <button onClick={handleSaveRoute} className="px-6 py-2.5 text-sm font-black text-white bg-slate-800 rounded-lg hover:bg-slate-900 shadow-lg flex items-center gap-2 transition"><Navigation className="w-4 h-4"/> {editingPlannedRouteId ? 'Guardar Cambios' : 'Confirmar Ruta'}</button>
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