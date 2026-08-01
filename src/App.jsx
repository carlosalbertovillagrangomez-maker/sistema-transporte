import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, Monitor, Map as MapIcon, Users, FileText, Bell, AlertTriangle, X, Play, CheckSquare, Clock, Zap, Calendar, Edit, Save, History, Eye, Briefcase, Loader2, BellRing, MessageSquare, Send, Camera, RefreshCw, ShieldCheck, MapPin, LocateFixed, Route as RouteIcon, Timer, Gauge, CircleDot, Navigation2 } from 'lucide-react';

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

// === HELPERS DE MONITOREO Y AUDITORÍA ===
const toFiniteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const normalizePoint = (point) => {
    if (!point) return null;
    const lat = toFiniteNumber(point.lat);
    const lng = toFiniteNumber(point.lng ?? point.lon);
    if (lat === null || lng === null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { ...point, lat, lng };
};

const normalizePath = (path) => Array.isArray(path) ? path.map(normalizePoint).filter(Boolean) : [];

const getLiveGeometry = (route) => {
    const candidates = [
        route?.liveRouteGeometry,
        route?.liveNavigation?.geometry,
        route?.technicalData?.geometry
    ];

    for (const candidate of candidates) {
        const path = normalizePath(candidate);
        if (path.length > 1) return path;
    }

    return [];
};

const getTimestampMs = (value) => {
    if (!value) return null;
    try {
        if (typeof value?.toDate === 'function') return value.toDate().getTime();
        if (value instanceof Date) return value.getTime();
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const formatMexicoTime = (value) => {
    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return '';
    return new Date(milliseconds).toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatMexicoDateTime = (value) => {
    const milliseconds = getTimestampMs(value);
    if (!milliseconds) return 'Sin registro';
    return new Date(milliseconds).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'short',
        timeStyle: 'short'
    });
};

const getPlannedStartTime = (route) => String(
    route?.startCoords?.pickupTime ||
    route?.pickupTime ||
    route?.technicalData?.carpool?.startTime ||
    route?.startTime ||
    route?.scheduledTime ||
    ''
);

const getActualStartTime = (route) => String(
    route?.actualStartTime ||
    formatMexicoTime(route?.actualStartTimestamp || route?.navigationStartedAt || route?.startedAt) ||
    ''
);

const getActualEndTime = (route) => String(
    route?.actualEndTime ||
    route?.endTime ||
    formatMexicoTime(route?.actualEndTimestamp || route?.finishedAt || route?.completedAt) ||
    ''
);

const getLastRouteUpdateMs = (route) => getTimestampMs(
    route?.liveNavigation?.updatedAt ||
    route?.liveRouteUpdatedAt ||
    route?.lastUpdate ||
    route?.updatedAt ||
    route?.actualEndTimestamp ||
    route?.finishedAt
);

const getRouteAuditSortMs = (route) => (
    getTimestampMs(route?.actualEndTimestamp) ||
    getTimestampMs(route?.finishedAt) ||
    getTimestampMs(route?.completedAt) ||
    getTimestampMs(route?.finalDate) ||
    getTimestampMs(route?.scheduledDate) ||
    getTimestampMs(route?.createdDate) ||
    0
);

const getFirstBoardingTime = (route) => {
    if (route?.firstBoardingTime) return String(route.firstBoardingTime);
    if (route?.firstBoardingTimestamp) return formatMexicoTime(route.firstBoardingTimestamp);

    const evidences = Array.isArray(route?.evidenciasLlegada) ? route.evidenciasLlegada : [];
    if (!evidences.length) return '';
    const ordered = [...evidences].sort((a, b) => (getTimestampMs(a?.timestamp) || 0) - (getTimestampMs(b?.timestamp) || 0));
    return ordered[0]?.time || formatMexicoTime(ordered[0]?.timestamp) || '';
};

const getRouteCurrentStopLabel = (route) => {
    const stopIndex = Number(route?.currentStopIndex ?? route?.nextStopIdx ?? route?.liveNavigation?.stopIndex ?? 0);
    const waypoints = Array.isArray(route?.waypointsData) ? route.waypointsData : [];
    if (stopIndex <= 0) return route?.startCoords?.passengerName || route?.startCoords?.contact || 'Origen';
    if (stopIndex <= waypoints.length) {
        const point = waypoints[stopIndex - 1] || {};
        return point.passengerName || point.contact || `Parada ${stopIndex}`;
    }
    return route?.endCoords?.passengerName || route?.endCoords?.contact || 'Destino final';
};

const buildLiveTimeline = (route) => {
    if (!route) return [];
    const events = [];
    const seen = new Set();
    const push = (label, timestamp, detail = '', tone = 'slate', eventId = '') => {
        const ms = getTimestampMs(timestamp);
        const key = eventId || `${label}|${ms || timestamp || ''}|${detail}`;
        if (seen.has(key)) return;
        seen.add(key);
        events.push({ label, timestamp, ms: ms || 0, time: ms ? formatMexicoDateTime(timestamp) : String(timestamp || ''), detail, tone });
    };

    push('Viaje creado', route.createdDate, route.serviceType || '', 'slate', `${route.id}-created`);
    if (route.assignmentRequestedAt) push('Oferta enviada al conductor', route.assignmentRequestedAt, route.ofertaParaNombre || route.driver || '', 'blue', `${route.id}-assignment`);
    if (route.actualStartTimestamp || route.navigationStartedAt) push('Conductor inició el viaje', route.actualStartTimestamp || route.navigationStartedAt, `Inicio real: ${getActualStartTime(route) || 'registrado'}`, 'green', `${route.id}-started`);

    const stopEvents = Array.isArray(route.stopEvents) ? route.stopEvents : [];
    stopEvents.forEach((item, index) => {
        if (item?.type === 'boarding' || item?.type === 'destination_arrival') {
            push(
                item.type === 'destination_arrival' ? 'Llegada al destino final' : `Pasajero abordó en ${item.label || `punto ${Number(item.stopIndex) + 1 || index + 1}`}`,
                item.timestamp || item.time,
                item.passenger || item.response || '',
                'green',
                item.eventId
            );
        } else if (item?.type === 'absence') {
            push(`Ausencia reportada en ${item.label || `punto ${Number(item.stopIndex) + 1 || index + 1}`}`, item.timestamp || item.time, item.passenger || '', 'red', item.eventId);
        } else if (item?.type === 'client_arrival_acknowledgement') {
            push(`Cliente confirmó el punto ${Number(item.stopIndex) + 1}`, item.timestamp || item.time, item.response || item.passenger || '', 'blue', item.eventId);
        }
    });

    (Array.isArray(route.evidenciasLlegada) ? route.evidenciasLlegada : []).forEach((item, index) => {
        push(`Pasajero abordó en ${item.label || `punto ${Number(item.stopIndex) + 1 || index + 1}`}`, item.timestamp || item.time, item.passenger || '', 'green', item.eventId);
    });

    (Array.isArray(route.evidencias) ? route.evidencias : []).forEach((item, index) => {
        push(`Ausencia reportada en ${item.label || `punto ${Number(item.stopIndex) + 1 || index + 1}`}`, item.timestamp || item.time, item.passenger || '', 'red', item.eventId);
    });

    (Array.isArray(route.arrivalAcknowledgements) ? route.arrivalAcknowledgements : []).forEach((item, index) => {
        push(`Cliente confirmó el punto ${Number(item.stopIndex) + 1}`, item.timestamp || item.time, item.response || item.passenger || '', 'blue', item.eventId || `${route.id}-ack-${index}`);
    });

    (Array.isArray(route.bitacora) ? route.bitacora : []).forEach((item, index) => {
        push(item.evento || 'Evento de bitácora', item.timestamp || item.time, item.motivo || item.punto || '', 'orange', item.eventId || `${route.id}-log-${index}-${item.timestamp || item.time || ''}`);
    });

    if (route.proximityAlert?.timestamp) {
        push('Conductor próximo al punto', route.proximityAlert.timestamp, `${route.proximityAlert.passenger || getRouteCurrentStopLabel(route)} · ${route.proximityAlert.etaMins ?? '--'} min`, 'orange', `${route.id}-proximity-${route.proximityAlert.stopIndex}-${route.proximityAlert.timestamp}`);
    }

    if (route.actualEndTimestamp || route.finishedAt || route.endTime) {
        push('Viaje finalizado', route.actualEndTimestamp || route.finishedAt || route.endTime, `Fin real: ${getActualEndTime(route) || 'registrado'}`, 'green', `${route.id}-finished`);
    }

    return events.sort((a, b) => a.ms - b.ms);
};

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
  const [currentUser, setCurrentUser] = useState(null); 
  const [activeTab, setActiveTab] = useState('monitoreo');
  
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);
  const selectedRouteListenerRef = useRef(null);

  const [liveRoutes, setLiveRoutes] = useState([]);
  const [onlineDrivers, setOnlineDrivers] = useState([]); 
  const [editingRoute, setEditingRoute] = useState(null); 
  const [viewHistory, setViewHistory] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [followSelectedRoute, setFollowSelectedRoute] = useState(true);
  const [clockTick, setClockTick] = useState(Date.now());

  const [chatModalRoute, setChatModalRoute] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef(null);

  // NUEVO: Estados para Reasignación
  const [reassigningRoute, setReassigningRoute] = useState(null);
  const [newDriverSelection, setNewDriverSelection] = useState('');

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


  useEffect(() => {
      const interval = setInterval(() => setClockTick(Date.now()), 5000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      if (selectedRouteListenerRef.current) {
          selectedRouteListenerRef.current();
          selectedRouteListenerRef.current = null;
      }

      if (!selectedRoute?.id) return undefined;

      selectedRouteListenerRef.current = onSnapshot(
          doc(db, 'rutas', selectedRoute.id),
          (snapshot) => {
              if (!snapshot.exists()) return;
              const updatedRoute = { id: snapshot.id, ...snapshot.data() };
              setSelectedRoute(updatedRoute);
              setChatModalRoute(prev => prev?.id === updatedRoute.id ? updatedRoute : prev);
          },
          (listenerError) => console.error('No se pudo actualizar el monitor del viaje:', listenerError)
      );

      return () => {
          selectedRouteListenerRef.current?.();
          selectedRouteListenerRef.current = null;
      };
  }, [selectedRoute?.id]);

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
              } catch (assignmentError) {
                  console.error('No se pudo asignar automáticamente el viaje:', assignmentError);
              }
          }
      });
  }, [liveRoutes, onlineDrivers]);

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
      } else if (!selectedRoute?.id) {
          prevLocRef.current = null;
      }
  }, [selectedRoute?.id, selectedRoute?.currentLocation, selectedRoute?.status]);

  const focusSelectedRoute = useCallback((map = mapRef.current, forceFit = false) => {
      if (!map || !isLoaded || !selectedRoute || !window.google?.maps) return;

      try {
          const currentLocation = normalizePoint(selectedRoute.currentLocation);
          const path = getLiveGeometry(selectedRoute);

          if (followSelectedRoute && currentLocation && !forceFit) {
              map.panTo(currentLocation);
              const currentZoom = Number(map.getZoom?.());
              if (!Number.isFinite(currentZoom) || currentZoom < 15) map.setZoom(16);
              return;
          }

          const points = [
              ...path,
              normalizePoint(selectedRoute.startCoords),
              ...(Array.isArray(selectedRoute.waypointsData) ? selectedRoute.waypointsData.map(normalizePoint) : []),
              normalizePoint(selectedRoute.endCoords),
              currentLocation
          ].filter(Boolean);

          if (points.length > 1) {
              const bounds = new window.google.maps.LatLngBounds();
              points.forEach(point => bounds.extend(point));
              map.fitBounds(bounds, 48);
          } else if (points[0]) {
              map.panTo(points[0]);
              map.setZoom(15);
          }
      } catch (error) {
          console.error('No se pudo enfocar el viaje en el mapa:', error);
      }
  }, [isLoaded, selectedRoute, followSelectedRoute]);

  useEffect(() => {
      if (activeTab !== 'monitoreo' || !mapRef.current) return;
      const timer = setTimeout(() => {
          try {
              window.google?.maps?.event?.trigger(mapRef.current, 'resize');
              focusSelectedRoute(mapRef.current, !followSelectedRoute);
          } catch (error) {
              console.error('No se pudo restaurar el monitor:', error);
          }
      }, 250);
      return () => clearTimeout(timer);
  }, [activeTab, selectedRoute?.id, isLoaded, focusSelectedRoute, followSelectedRoute]);

  useEffect(() => {
      if (activeTab !== 'monitoreo' || !followSelectedRoute || selectedRoute?.status !== 'En Ruta') return;
      focusSelectedRoute();
  }, [activeTab, followSelectedRoute, selectedRoute?.status, selectedRoute?.currentLocation?.lat, selectedRoute?.currentLocation?.lng, selectedRoute?.liveNavigation?.updatedAt, focusSelectedRoute]);

  const handleMapLoad = useCallback((map) => {
      mapRef.current = map;
      setTimeout(() => focusSelectedRoute(map, !followSelectedRoute), 100);
  }, [focusSelectedRoute, followSelectedRoute]);

  const updateRouteStatus = async (id, status, updates = {}) => {
      try {
          await updateDoc(doc(db, 'rutas', id), { status, ...updates });
      } catch (error) {
          console.error('No se pudo actualizar el viaje:', error);
      }
  };

  const handleStartTrip = (id) => {
      const now = new Date();
      return updateRouteStatus(id, 'En Ruta', {
          actualStartTime: now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
          actualStartTimestamp: now.toISOString(),
          navigationStartedAt: now.toISOString()
      });
  };

  const handleEndTrip = (id) => {
      const now = new Date();
      return updateRouteStatus(id, 'Finalizado', {
          endTime: now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
          actualEndTime: now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
          actualEndTimestamp: now.toISOString(),
          finishedAt: now.toISOString()
      });
  };
  
  const saveTimeEdit = async () => {
      if (!editingRoute) return;
      const actualStartTime = editingRoute.actualStartTime || '';
      const actualEndTime = editingRoute.actualEndTime || editingRoute.endTime || '';
      const newStatus = actualEndTime ? 'Finalizado' : (actualStartTime ? 'En Ruta' : editingRoute.status);
      const updates = {
          actualStartTime,
          actualEndTime,
          endTime: actualEndTime
      };

      if (actualStartTime && !editingRoute.actualStartTimestamp) updates.actualStartTimestamp = new Date().toISOString();
      if (actualEndTime && !editingRoute.actualEndTimestamp) {
          updates.actualEndTimestamp = new Date().toISOString();
          updates.finishedAt = updates.actualEndTimestamp;
      }

      await updateRouteStatus(editingRoute.id, newStatus, updates);
      setEditingRoute(null);
  };

  // LÓGICA DE REASIGNACIÓN
  const confirmReassignDriver = async () => {
      if (!newDriverSelection || !reassigningRoute) return alert("Selecciona un conductor primero.");
      const selectedDriverObj = onlineDrivers.find(d => d.id === newDriverSelection);
      if (!selectedDriverObj) return;

      try {
          await updateDoc(doc(db, "rutas", reassigningRoute.id), {
              driver: selectedDriverObj.name,
              driverId: selectedDriverObj.id,
              status: 'Aceptada', // Se reinicia a Aceptada para que el nuevo chofer inicie el viaje
              ofertaEstado: null,
              ofertaPara: null,
              ofertaNombre: null,
              rechazadoPor: [] // Limpiamos rechazos por si acaso
          });
          setReassigningRoute(null);
          setNewDriverSelection('');
      } catch (error) {
          console.error("Error reasignando:", error);
          alert("Hubo un error al reasignar el viaje.");
      }
  };

  const sendDispatchMessage = async () => {
      if (!chatInput.trim() || !chatModalRoute || !currentUser) return;
      const msg = { sender: 'Despacho', text: chatInput.trim(), time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), timestamp: new Date().toISOString(), sentBy: currentUser.name };
      try {
          await updateDoc(doc(db, "rutas", chatModalRoute.id), { chat: arrayUnion(msg) });
          setChatInput('');
      } catch (messageError) {
          console.error('No se pudo enviar el mensaje del despacho:', messageError);
      }
  };

  const getFilteredAndSortedRoutes = () => {
      const filtered = liveRoutes.filter(ruta => viewHistory
          ? ['Finalizado', 'Completado', 'Cancelado'].includes(ruta.status)
          : !['Finalizado', 'Completado', 'Cancelado'].includes(ruta.status)
      );

      return filtered.sort((a, b) => {
          if (viewHistory) return getRouteAuditSortMs(b) - getRouteAuditSortMs(a);
          if (a.status === 'En Ruta' && b.status !== 'En Ruta') return -1;
          if (b.status === 'En Ruta' && a.status !== 'En Ruta') return 1;
          if (a.serviceType === 'Prioritario' && b.serviceType !== 'Prioritario') return -1;
          if (b.serviceType === 'Prioritario' && a.serviceType !== 'Prioritario') return 1;
          return (getTimestampMs(a.scheduledDate || a.createdDate) || 0) - (getTimestampMs(b.scheduledDate || b.createdDate) || 0);
      });
  };

  const rutasVisibles = getFilteredAndSortedRoutes();
  const selectedRouteGeometry = getLiveGeometry(selectedRoute);
  const selectedLastUpdateMs = getLastRouteUpdateMs(selectedRoute);
  const selectedUpdateAgeSeconds = selectedLastUpdateMs ? Math.max(0, Math.floor((clockTick - selectedLastUpdateMs) / 1000)) : null;
  const selectedSignalState = selectedUpdateAgeSeconds === null
      ? 'unknown'
      : selectedUpdateAgeSeconds > 60
          ? 'stale'
          : selectedUpdateAgeSeconds > 30
              ? 'delayed'
              : 'live';

  if (!currentUser) return <Login onLogin={(user) => setCurrentUser(user)} />;

  return (
    <div className="flex h-[100dvh] bg-slate-50 font-sans overflow-hidden">
      <aside className="w-20 2xl:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 transition-all duration-300">
        <div className="h-16 flex items-center justify-center px-3 2xl:px-6 border-b border-slate-800 bg-slate-950">
           <img src="/logo.png" alt="TripLogix" className="h-8 w-auto mr-2" />
           <span className="hidden 2xl:inline text-white font-black text-lg uppercase tracking-wider">Trip<span className="text-orange-500">Logix</span></span>
        </div>
        <nav className="flex-1 p-2 2xl:p-4 space-y-2">
          <button onClick={() => setActiveTab('monitoreo')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'monitoreo' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Monitor className="w-5 h-5" /><span className="hidden 2xl:inline font-bold text-sm">Monitor en Vivo</span></button>
          <button onClick={() => setActiveTab('planificacion')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'planificacion' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><MapIcon className="w-5 h-5" /><span className="hidden 2xl:inline font-bold text-sm">Planificación</span></button>
          <button onClick={() => setActiveTab('clientes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'clientes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Briefcase className="w-5 h-5" /><span className="hidden 2xl:inline font-bold text-sm">Clientes</span></button>
          <button onClick={() => setActiveTab('conductores')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'conductores' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><Users className="w-5 h-5" /><span className="hidden 2xl:inline font-bold text-sm">Conductores</span></button>
          <button onClick={() => setActiveTab('reportes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reportes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-slate-800 hover:text-white'}`}><FileText className="w-5 h-5" /><span className="hidden 2xl:inline font-bold text-sm">Reportes</span></button>
        </nav>
        <div className="p-2 2xl:p-4 border-t border-slate-800 bg-slate-950">
            <button onClick={() => setCurrentUser(null)} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-red-400 transition py-3 rounded-xl hover:bg-red-500/10"><X className="w-4 h-4"/> <span className="hidden 2xl:inline">CERRAR SESIÓN</span></button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 2xl:px-8 shadow-sm z-10 shrink-0">
          <h1 className="text-base md:text-xl font-black text-slate-800 tracking-tight">{activeTab === 'monitoreo' && 'Torre de Control'}{activeTab === 'planificacion' && 'Planificación de Rutas'}{activeTab === 'clientes' && 'Cartera de Clientes'}{activeTab === 'conductores' && 'Directorio de Conductores'}{activeTab === 'reportes' && 'Historial y Reportes'}</h1>
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
            <div className="flex-1 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_24rem] overflow-y-auto 2xl:overflow-hidden p-3 md:p-4 2xl:p-6 gap-4 2xl:gap-6 animate-[fadeIn_0.3s_ease-out]">
                {/* MAPA GOOGLE */}
                <div className="relative h-[48vh] min-h-[360px] 2xl:h-auto 2xl:min-h-0 bg-slate-200 rounded-3xl shadow-sm overflow-hidden border border-slate-200">
                    {isLoaded ? (
                        <GoogleMap 
                            mapContainerStyle={containerStyle} 
                            center={centerMX} 
                            zoom={12} 
                            onLoad={handleMapLoad} 
                            options={{ mapId: "73f56298887c80075f6fc648", streetViewControl: false, mapTypeControl: false, gestureHandling: "greedy" }}
                        >
                            {onlineDrivers.map(d => d.currentLocation && <Marker key={d.id} position={d.currentLocation} icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#22c55e", fillOpacity: 0.8, strokeWeight: 2, strokeColor: "white" }} title={`Operador: ${d.name}`} onClick={() => { const driverRoute = liveRoutes.find(r => !["Finalizado", "Completado", "Cancelado"].includes(r.status) && (r.driverId === d.id || r.driver === d.name)); if (driverRoute) setSelectedRoute(driverRoute); }} />)}
                            {selectedRoute && (
                                <>
                                    {selectedRouteGeometry.length > 1 && (
                                        <Polyline
                                            path={selectedRouteGeometry}
                                            options={{ strokeColor: '#f97316', strokeOpacity: 0.95, strokeWeight: 7 }}
                                        />
                                    )}
                                    {normalizePoint(selectedRoute.startCoords) && <Marker position={normalizePoint(selectedRoute.startCoords)} icon={ICON_START} />}
                                    {Array.isArray(selectedRoute.waypointsData) && selectedRoute.waypointsData.map((wp, idx) => {
                                        const point = normalizePoint(wp);
                                        return point ? <Marker key={idx} position={point} icon={ICON_WAYPOINT} /> : null;
                                    })}
                                    {normalizePoint(selectedRoute.endCoords) && <Marker position={normalizePoint(selectedRoute.endCoords)} icon={ICON_END} />}

                                    {normalizePoint(selectedRoute.currentLocation) && selectedRoute.status === 'En Ruta' && (
                                        <Marker
                                            position={normalizePoint(selectedRoute.currentLocation)}
                                            icon={{
                                                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                                scale: 7,
                                                fillColor: '#f97316',
                                                fillOpacity: 1,
                                                strokeWeight: 2,
                                                strokeColor: 'white',
                                                rotation: Number(selectedRoute.liveHeading ?? selectedRoute.liveNavigation?.heading ?? carHeading) || 0
                                            }}
                                            zIndex={999}
                                        />
                                    )}
                                </>
                            )}
                        </GoogleMap>
                    ) : <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin w-8 h-8 text-orange-500"/><span className="text-xs font-bold uppercase tracking-widest">Cargando Mapas...</span></div>}

                    {!selectedRoute && (<div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-5 py-3 rounded-2xl shadow-sm z-[500] border border-slate-100 max-w-xs"><h5 className="font-black text-slate-800 text-sm mb-1">Radar en Vivo</h5><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> {onlineDrivers.length} unidades activas</p></div>)}
                    
                    {selectedRoute?.status === 'En Ruta' && normalizePoint(selectedRoute?.currentLocation) && (
                        <>
                            <div className={`absolute top-4 right-4 bg-white/95 backdrop-blur px-4 py-2.5 rounded-2xl shadow-lg z-[500] border flex items-center gap-2 ${selectedSignalState === 'stale' ? 'border-red-300' : selectedSignalState === 'delayed' ? 'border-amber-300' : selectedRoute.proximityAlert?.active ? 'border-orange-300' : 'border-green-200'}`}>
                                <div className={`w-2.5 h-2.5 rounded-full ${selectedSignalState === 'stale' ? 'bg-red-500' : selectedSignalState === 'delayed' ? 'bg-amber-500 animate-pulse' : selectedRoute.proximityAlert?.active ? 'bg-orange-500 animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSignalState === 'stale' ? 'text-red-600' : selectedSignalState === 'delayed' ? 'text-amber-700' : selectedRoute.proximityAlert?.active ? 'text-orange-600' : 'text-slate-700'}`}>
                                        {selectedSignalState === 'stale' ? 'Señal sin actualizar' : selectedSignalState === 'delayed' ? 'Señal retrasada' : selectedRoute.proximityAlert?.active ? 'Conductor llegando' : 'GPS en vivo'}
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                        {selectedUpdateAgeSeconds === null ? 'Sin hora de actualización' : `Último dato hace ${selectedUpdateAgeSeconds} s`}
                                    </p>
                                </div>
                            </div>

                            <div className="absolute bottom-4 left-4 z-[500] flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFollowSelectedRoute(true);
                                        setTimeout(() => focusSelectedRoute(mapRef.current, false), 50);
                                    }}
                                    className={`px-4 py-3 rounded-2xl shadow-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${followSelectedRoute ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                                >
                                    <LocateFixed className="w-4 h-4" /> Seguir unidad
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFollowSelectedRoute(false);
                                        setTimeout(() => focusSelectedRoute(mapRef.current, true), 50);
                                    }}
                                    className={`px-4 py-3 rounded-2xl shadow-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${!followSelectedRoute ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}
                                >
                                    <RouteIcon className="w-4 h-4" /> Ver ruta completa
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* LISTA LATERAL DE RUTAS */}
                <div className="w-full min-h-[420px] 2xl:min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                        <h2 className="font-black text-slate-800 flex items-center gap-2 text-sm uppercase tracking-widest"><Clock className="w-4 h-4 text-orange-500"/> {viewHistory ? 'Historial' : 'Activos'}</h2>
                        <button onClick={() => setViewHistory(!viewHistory)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black transition ${viewHistory ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{viewHistory ? <><Eye className="w-3 h-3"/> Activos</> : <><History className="w-3 h-3"/> Pasados</>}</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {rutasVisibles.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium"><p>{viewHistory ? 'No hay historial reciente.' : 'No hay rutas pendientes hoy.'}</p></div>}

                        {rutasVisibles.map((ruta) => {
                            const hasChatOrEvidence = (ruta.chat && ruta.chat.length > 0) || (ruta.evidencias && ruta.evidencias.length > 0) || (ruta.evidenciasLlegada && ruta.evidenciasLlegada.length > 0) || (ruta.stopEvents && ruta.stopEvents.length > 0);
                            const routeUpdateMs = getLastRouteUpdateMs(ruta);
                            const routeUpdateAge = routeUpdateMs ? Math.max(0, Math.floor((clockTick - routeUpdateMs) / 1000)) : null;
                            const liveDistance = Number(ruta.liveNavigation?.distanceKm);
                            const liveDuration = Number(ruta.liveNavigation?.durationMinutes);
                            
                            return (
                                <div key={ruta.id} onClick={() => { setSelectedRoute(ruta); setFollowSelectedRoute(ruta.status === 'En Ruta'); }} className={`border-2 rounded-2xl p-4 transition-all shadow-sm cursor-pointer relative overflow-hidden ${selectedRoute?.id === ruta.id ? 'border-orange-500 bg-orange-50/30 shadow-orange-500/10' : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'} ${ruta.proximityAlert?.active ? 'border-orange-400 bg-orange-50/50' : ''}`}>
                                    {ruta.proximityAlert?.active && <div className="absolute top-0 left-0 right-0 bg-orange-500 text-white text-[10px] font-black text-center py-1 flex items-center justify-center gap-1 animate-pulse"><BellRing className="w-3 h-3"/> ¡LLEGANDO A: {ruta.proximityAlert.passenger.toUpperCase()}!</div>}

                                    <div className={`flex justify-between items-start mb-3 ${ruta.proximityAlert?.active ? 'mt-4' : ''}`}>
                                        <div>
                                            {ruta.serviceType === 'Prioritario' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 mb-2"><Zap className="w-3 h-3 fill-orange-500 text-orange-600" /> INMEDIATO</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 mb-2"><Calendar className="w-3 h-3" /> PROGRAMADO: {ruta.scheduledDate}</span>}
                                            <h4 className="font-black text-slate-800 text-sm truncate">{ruta.client}</h4>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingRoute(ruta); }} className="text-slate-300 hover:text-orange-500 transition p-1 bg-slate-50 hover:bg-orange-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                                    </div>

                                    {/* --- AQUÍ ESTÁ EL BOTÓN DE REASIGNACIÓN --- */}
                                    {ruta.ofertaEstado === 'Pendiente' ? (
                                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-[10px] font-black px-3 py-2 rounded-xl uppercase flex items-center justify-between gap-2 mb-4 animate-pulse">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-3 h-3 animate-spin"/> OFRECIENDO A: {ruta.ofertaNombre?.split(' ')[0]}
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); setReassigningRoute(ruta); }} className="px-2 py-1 bg-white border border-yellow-300 text-yellow-800 rounded hover:bg-yellow-100 transition shadow-sm">Cambiar</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center mb-4">
                                            <p className="text-xs text-slate-500 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400"/> <span className="font-bold text-slate-700">{ruta.driver || 'Sin Asignar'}</span></p>
                                            {(ruta.status === 'Aceptada' || ruta.status === 'En Ruta' || ruta.status === 'Pendiente') && (
                                                <button onClick={(e) => { e.stopPropagation(); setReassigningRoute(ruta); }} className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm">
                                                    <RefreshCw className="w-3 h-3"/> Reasignar
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div className="flex gap-2 mb-4">
                                        <div className="flex-1 bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1.5">
                                            <div className="flex justify-between text-[10px] gap-3"><span className="text-slate-400 uppercase font-black tracking-widest">Programado:</span><span className="font-mono font-bold text-slate-700">{getPlannedStartTime(ruta) || '--:--'}</span></div>
                                            <div className="flex justify-between text-[10px] gap-3"><span className="text-slate-400 uppercase font-black tracking-widest">Inicio real:</span><span className="font-mono font-bold text-green-700">{getActualStartTime(ruta) || '--:--'}</span></div>
                                            <div className="flex justify-between text-[10px] gap-3"><span className="text-slate-400 uppercase font-black tracking-widest">Primer abordaje:</span><span className="font-mono font-bold text-blue-700">{getFirstBoardingTime(ruta) || '--:--'}</span></div>
                                            <div className="flex justify-between text-[10px] gap-3"><span className="text-slate-400 uppercase font-black tracking-widest">Fin real:</span><span className="font-mono font-bold text-slate-800">{getActualEndTime(ruta) || '--:--'}</span></div>
                                        </div>
                                        {(ruta.status === 'En Ruta' || hasChatOrEvidence || ruta.bitacora?.length > 0) && (
                                            <button onClick={(e) => { e.stopPropagation(); setChatModalRoute(ruta); }} className={`flex flex-col items-center justify-center px-4 rounded-xl border transition-colors ${hasChatOrEvidence ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'} relative`}>
                                                <Monitor className="w-5 h-5"/>
                                                <span className="text-[9px] font-black uppercase tracking-widest mt-1">Monitor</span>
                                                {ruta.chat && ruta.chat.length > 0 && ruta.chat[ruta.chat.length-1].sender !== 'Despacho' && ruta.chat[ruta.chat.length-1].sender !== 'Sistema' && <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-white"></div>}
                                            </button>
                                        )}
                                    </div>

                                    {ruta.status === 'En Ruta' && ruta.proximityAlert?.etaMins && (
                                        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-center">
                                            <p className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center justify-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5"/> LLEGADA ESTIMADA: {ruta.proximityAlert.etaMins} MIN A {(ruta.proximityAlert.passenger || getRouteCurrentStopLabel(ruta)).split(' ')[0].toUpperCase()}
                                            </p>
                                        </div>
                                    )}

                                    {ruta.status === 'En Ruta' && (
                                        <div className="mb-4 grid grid-cols-3 gap-2">
                                            <div className="rounded-xl bg-blue-50 border border-blue-100 p-2 text-center">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-blue-500">Punto actual</p>
                                                <p className="text-[10px] font-black text-slate-700 truncate mt-1">{getRouteCurrentStopLabel(ruta)}</p>
                                            </div>
                                            <div className="rounded-xl bg-orange-50 border border-orange-100 p-2 text-center">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-orange-500">Restante</p>
                                                <p className="text-[10px] font-black text-slate-700 mt-1">{Number.isFinite(liveDistance) ? `${liveDistance.toFixed(1)} km` : '--'}</p>
                                            </div>
                                            <div className={`rounded-xl border p-2 text-center ${routeUpdateAge !== null && routeUpdateAge > 60 ? 'bg-red-50 border-red-200' : routeUpdateAge !== null && routeUpdateAge > 30 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Actualización</p>
                                                <p className="text-[10px] font-black text-slate-700 mt-1">{routeUpdateAge === null ? '--' : `${routeUpdateAge} s`}</p>
                                                {Number.isFinite(liveDuration) && <p className="text-[8px] font-bold text-slate-400 mt-0.5">{Math.round(liveDuration)} min</p>}
                                            </div>
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
              <div className="bg-white w-full max-w-6xl h-[92dvh] rounded-[2rem] shadow-2xl flex flex-col xl:flex-row overflow-hidden border border-slate-200">
                  <div className="w-full xl:w-1/2 h-1/2 xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-slate-50">
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
                  <div className="w-full xl:w-1/2 h-1/2 xl:h-full flex flex-col bg-white">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2"><Monitor className="w-4 h-4 text-orange-500"/> Actividad en vivo y evidencias</h3>
                          <button onClick={() => setChatModalRoute(null)} className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-xl transition"><X className="w-5 h-5"/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 space-y-6">
                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-500">Plan inicial</p>
                                  <p className="text-xs font-bold text-slate-500 mt-2">Salida prevista: <span className="text-slate-800">{getPlannedStartTime(chatModalRoute) || '--:--'}</span></p>
                                  <p className="text-xs font-bold text-slate-500 mt-1">Distancia: <span className="text-slate-800">{chatModalRoute.technicalData?.totalDistance || '--'} km</span></p>
                                  <p className="text-xs font-bold text-slate-500 mt-1">Duración: <span className="text-slate-800">{chatModalRoute.technicalData?.totalDuration || '--'} min</span></p>
                              </div>
                              <div className="bg-white border border-green-100 rounded-2xl p-4 shadow-sm">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-green-600">Ejecución real</p>
                                  <p className="text-xs font-bold text-slate-500 mt-2">Inicio real: <span className="text-slate-800">{getActualStartTime(chatModalRoute) || '--:--'}</span></p>
                                  <p className="text-xs font-bold text-slate-500 mt-1">Primer abordaje: <span className="text-slate-800">{getFirstBoardingTime(chatModalRoute) || '--:--'}</span></p>
                                  <p className="text-xs font-bold text-slate-500 mt-1">Fin real: <span className="text-slate-800">{getActualEndTime(chatModalRoute) || '--:--'}</span></p>
                                  <p className="text-xs font-bold text-slate-500 mt-1">Distancia GPS: <span className="text-slate-800">{Number(chatModalRoute.realDistanceDriven || 0).toFixed(1)} km</span></p>
                              </div>
                          </div>

                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                              <div className="flex items-center justify-between gap-3 mb-4">
                                  <div>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Bitácora en vivo</p>
                                      <p className="text-[9px] font-bold text-slate-400 mt-1">Se actualiza automáticamente mientras el conductor avanza.</p>
                                  </div>
                                  {chatModalRoute.status === 'En Ruta' && (
                                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-widest animate-pulse">En curso</span>
                                  )}
                              </div>
                              <div className="space-y-3">
                                  {buildLiveTimeline(chatModalRoute).map((event, index) => (
                                      <div key={`${event.label}-${index}`} className="flex gap-3">
                                          <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${event.tone === 'green' ? 'bg-green-500' : event.tone === 'red' ? 'bg-red-500' : event.tone === 'orange' ? 'bg-orange-500' : event.tone === 'blue' ? 'bg-blue-500' : 'bg-slate-400'}`}></div>
                                          <div className="min-w-0 flex-1 pb-3 border-b border-slate-100 last:border-0">
                                              <div className="flex justify-between gap-3">
                                                  <p className="text-xs font-black text-slate-800">{event.label}</p>
                                                  <p className="text-[9px] font-bold text-slate-400 whitespace-nowrap">{event.time || 'Sin hora'}</p>
                                              </div>
                                              {event.detail && <p className="text-[10px] font-medium text-slate-500 mt-1">{event.detail}</p>}
                                          </div>
                                      </div>
                                  ))}
                                  {buildLiveTimeline(chatModalRoute).length === 0 && <p className="text-xs text-slate-400 text-center py-5">Todavía no hay eventos registrados.</p>}
                              </div>
                          </div>

                          <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Camera className="w-4 h-4 text-green-600"/> Evidencias de abordaje</h4>
                              {(!chatModalRoute.evidenciasLlegada || chatModalRoute.evidenciasLlegada.length === 0) ? (
                                  <div className="text-center py-8 text-slate-400 bg-white rounded-2xl border border-slate-200"><p className="text-xs font-black uppercase tracking-widest">Sin abordajes registrados</p></div>
                              ) : (
                                  <div className="space-y-3">
                                      {chatModalRoute.evidenciasLlegada
                                          .slice()
                                          .sort((a, b) => (Number(a.stopIndex) || 0) - (Number(b.stopIndex) || 0))
                                          .map((ev, idx) => (
                                          <div key={ev.eventId || `${ev.stopIndex}-${ev.timestamp}-${idx}`} className="bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden">
                                              <div className="bg-green-50 p-4 border-b border-green-100 flex justify-between items-center"><div><p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-0.5">{ev.label || `Punto ${Number(ev.stopIndex) + 1}`}</p><p className="text-sm font-black text-slate-800">{ev.passenger || 'Pasajero'}</p></div><div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Hora</p><p className="text-sm font-mono font-black text-slate-700">{ev.time || formatMexicoTime(ev.timestamp) || '--:--'}</p></div></div>
                                              <div className="p-4"><p className="text-xs text-slate-600 font-medium mb-4 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-green-500"/> {ev.address || 'Sin dirección registrada'}</p>{ev.photo ? (<div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer" onClick={() => window.open(ev.photo, '_blank')}><img src={ev.photo} alt="Evidencia de abordaje" className="w-full h-48 object-cover" /><div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><p className="text-white text-xs font-black uppercase tracking-widest border-2 border-white px-4 py-2 rounded-lg">Ver completa</p></div></div>) : (<div className="w-full h-20 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-200">ABORDAJE SIN FOTO</div>)}</div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>

                          <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Camera className="w-4 h-4 text-red-500"/> Evidencias de ausencia</h4>
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
          </div>
      )}

      {/* --- MODAL PARA REASIGNAR CONDUCTOR --- */}
      {reassigningRoute && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><RefreshCw className="w-5 h-5 text-blue-500"/> Reasignar Viaje</h3>
                      <button onClick={() => setReassigningRoute(null)} className="text-slate-400 hover:text-red-500 transition"><X className="w-6 h-6"/></button>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Ruta: <span className="text-orange-500">{reassigningRoute.client}</span></p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Seleccionar Nuevo Operador</label>
                          <select 
                              className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 focus:border-blue-500 outline-none shadow-sm"
                              value={newDriverSelection}
                              onChange={(e) => setNewDriverSelection(e.target.value)}
                          >
                              <option value="">👤 Seleccionar chofer disponible...</option>
                              {onlineDrivers.filter(d => d.id !== reassigningRoute.driverId).map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                          </select>
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                          ⚠️ Al confirmar, este viaje desaparecerá inmediatamente del teléfono del conductor actual y se le enviará al nuevo operador seleccionado.
                      </p>
                  </div>
                  
                  <div className="flex gap-3 mt-8">
                      <button onClick={() => setReassigningRoute(null)} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 rounded-xl transition">Cancelar</button>
                      <button onClick={confirmReassignDriver} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:bg-blue-700 flex items-center justify-center gap-2 transition active:scale-95"><CheckSquare className="w-4 h-4" /> Confirmar</button>
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
                      <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Hora de Inicio Real</label><input type="time" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold text-slate-700 focus:border-orange-500 outline-none" value={editingRoute.actualStartTime || ''} onChange={(e) => setEditingRoute({...editingRoute, actualStartTime: e.target.value})} /></div>
                      <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Hora de Finalización Real</label><input type="time" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold text-slate-700 focus:border-orange-500 outline-none" value={editingRoute.actualEndTime || editingRoute.endTime || ''} onChange={(e) => setEditingRoute({...editingRoute, actualEndTime: e.target.value})} /></div>
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