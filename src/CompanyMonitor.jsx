import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, LogOut, MapPin, Navigation2, Clock, Car, Loader2, ShieldCheck } from 'lucide-react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { db } from './firebase';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';

const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 };
const containerStyle = { width: '100%', height: '100%' };
const ICON_START = 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
const ICON_END = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
const ICON_WAYPOINT = 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';

const normalizePoint = (point) => {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng ?? point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { ...point, lat, lng };
};

const normalizePath = (path) => Array.isArray(path) ? path.map(normalizePoint).filter(Boolean) : [];

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const getPlannedGeometry = (route) => {
  const candidates = [route?.originalPlan?.geometry, route?.originalPlan?.technicalData?.geometry, route?.technicalData?.geometry];
  for (const candidate of candidates) {
    const path = normalizePath(candidate);
    if (path.length > 1) return path;
  }
  return [];
};

const getLiveGeometry = (route) => {
  const candidates = [route?.liveRouteGeometry, route?.liveNavigation?.geometry];
  for (const candidate of candidates) {
    const path = normalizePath(candidate);
    if (path.length > 1) return path;
  }
  return [];
};

const splitTrace = (path) => {
  const points = normalizePath(path);
  if (points.length < 2) return [];
  const segments = [];
  let current = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    const previousMs = getTimestampMs(previous.recordedAt || previous.timestamp);
    const currentMs = getTimestampMs(point.recordedAt || point.timestamp);
    const gap = previousMs && currentMs ? currentMs - previousMs : 0;
    if (point.segmentStart || point.routeBreak || point.gpsGap || gap > 20000) {
      if (current.length > 1) segments.push(current);
      current = [point];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
};

const routeSortValue = (route) => getTimestampMs(route.actualStartTimestamp || route.scheduledDate || route.createdDate);

export default function CompanyMonitor({ currentUser, onLogout, isLoaded }) {
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.companyName) return undefined;
    setLoading(true);
    const companyQuery = query(collection(db, 'rutas'), where('client', '==', currentUser.companyName));
    return onSnapshot(companyQuery, snapshot => {
      const next = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => !['Finalizado', 'Completado', 'Cancelado'].includes(item.status))
        .sort((a, b) => routeSortValue(b) - routeSortValue(a));
      setRoutes(next);
      setSelectedRouteId(previous => previous && next.some(item => item.id === previous) ? previous : (next[0]?.id || ''));
      setLoading(false);
    }, error => {
      console.error('Monitor empresa:', error);
      setLoading(false);
    });
  }, [currentUser?.companyName]);

  const selectedRoute = routes.find(route => route.id === selectedRouteId) || null;

  useEffect(() => {
    setSelectedDriver(null);
    if (!selectedRoute?.driverId) return undefined;
    return onSnapshot(doc(db, 'conductores', selectedRoute.driverId), snap => {
      setSelectedDriver(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [selectedRoute?.driverId]);

  const visibleRoutes = useMemo(() => routes, [routes]);

  const plannedGeometry = selectedRoute ? getPlannedGeometry(selectedRoute) : [];
  const liveGeometry = selectedRoute ? getLiveGeometry(selectedRoute) : [];
  const traceSegments = selectedRoute ? splitTrace(selectedRoute.rutaReal) : [];
  const driverPoint = normalizePoint(selectedDriver?.currentLocation) || normalizePoint(selectedRoute?.currentLocation);
  const center = driverPoint || normalizePoint(selectedRoute?.startCoords) || plannedGeometry[0] || DEFAULT_CENTER;

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !selectedRoute) return;
    const points = [...plannedGeometry, ...traceSegments.flat(), ...liveGeometry];
    if (driverPoint) points.push(driverPoint);
    if (points.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      points.forEach(point => bounds.extend(point));
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [selectedRouteId, routes.length]);

  return (
    <div className="h-[100dvh] bg-slate-950 flex flex-col overflow-hidden">
      <header className="shrink-0 h-16 bg-slate-950 border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="TripLogix" className="h-9 w-9 object-contain"/>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] font-black text-orange-400">Monitor empresarial · Solo lectura</p>
            <h1 className="font-black text-sm sm:text-base truncate">{currentUser.companyName}</h1>
          </div>
        </div>
        <button type="button" onClick={onLogout} className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2 text-xs font-black"><LogOut className="w-4 h-4"/><span className="hidden sm:inline">Salir</span></button>
      </header>

      <main className="flex-1 min-h-0 p-2 sm:p-3 md:p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 overflow-y-auto xl:overflow-hidden">
        <div className="relative h-[52vh] min-h-[320px] xl:h-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
          {isLoaded ? (
            <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={12} onLoad={map => { mapRef.current = map; }} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: 'greedy' }}>
              {plannedGeometry.length > 1 && <Polyline path={plannedGeometry} options={{ strokeColor: '#475569', strokeOpacity: 0.8, strokeWeight: 8, zIndex: 1 }}/>} 
              {traceSegments.map((segment, index) => <Polyline key={index} path={segment} options={{ strokeColor: '#2563eb', strokeOpacity: 0.95, strokeWeight: 5, zIndex: 3 }}/>) }
              {liveGeometry.length > 1 && <Polyline path={liveGeometry} options={{ strokeColor: '#f97316', strokeOpacity: 0.98, strokeWeight: 5, zIndex: 2 }}/>} 
              {normalizePoint(selectedRoute?.startCoords) && <Marker position={normalizePoint(selectedRoute.startCoords)} icon={ICON_START}/>} 
              {(selectedRoute?.waypointsData || []).map((point, index) => normalizePoint(point) ? <Marker key={index} position={normalizePoint(point)} icon={ICON_WAYPOINT}/> : null)}
              {normalizePoint(selectedRoute?.endCoords) && <Marker position={normalizePoint(selectedRoute.endCoords)} icon={ICON_END}/>} 
              {driverPoint && <Marker position={driverPoint} icon={{ path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 7, fillColor: '#f97316', fillOpacity: 1, strokeWeight: 2, strokeColor: '#ffffff', rotation: Number(selectedRoute?.liveHeading ?? selectedRoute?.liveNavigation?.heading ?? 0) || 0 }} zIndex={999}/>} 
            </GoogleMap>
          ) : <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="w-7 h-7 animate-spin mr-2"/> Cargando mapa...</div>}

          <div className="absolute left-3 top-3 z-[800] rounded-xl bg-slate-950/90 text-white px-3 py-2 border border-white/10 backdrop-blur max-w-[85%]">
            <p className="text-[9px] uppercase tracking-wider font-black text-orange-400">Ruta seleccionada</p>
            <p className="text-xs font-black truncate mt-1">{selectedRoute ? `${selectedRoute.driver || 'Sin conductor'} · ${selectedRoute.status || 'Sin estado'}` : 'Sin ruta activa'}</p>
          </div>
        </div>

        <aside className="xl:min-h-0 xl:overflow-y-auto rounded-2xl bg-white border border-slate-200 p-3 sm:p-4 space-y-3">
          <div>
            <p className="text-[9px] uppercase tracking-wider font-black text-orange-500">Rutas activas de la empresa</p>
            <p className="font-black text-slate-800">{visibleRoutes.length} activas</p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 flex gap-2"><ShieldCheck className="w-4 h-4 text-blue-600 shrink-0"/><p className="text-[10px] font-bold text-blue-800">Esta cuenta sólo puede ver rutas activas de la empresa asignada. No puede consultar historial, planear, editar, iniciar, cancelar ni finalizar viajes.</p></div>

          {loading && <div className="py-12 text-center text-slate-400 text-xs font-bold"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2"/>Actualizando servicios...</div>}
          {!loading && visibleRoutes.length === 0 && <div className="py-12 text-center text-slate-400 text-xs font-bold">No hay servicios para mostrar.</div>}

          {visibleRoutes.map(route => (
            <button key={route.id} type="button" onClick={() => setSelectedRouteId(route.id)} className={`w-full text-left rounded-xl border p-3 transition ${selectedRouteId === route.id ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${route.status === 'En Ruta' ? 'bg-green-100 text-green-700' : route.status === 'Cancelado' ? 'bg-red-100 text-red-700' : ['Finalizado', 'Completado'].includes(route.status) ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'}`}>{route.status || 'Pendiente'}</span>
                <span className="text-[9px] font-mono text-slate-400">{route.scheduledDate || route.finalDate || ''}</span>
              </div>
              <p className="font-black text-sm text-slate-800 mt-2 truncate">{route.driver || 'Conductor por asignar'}</p>
              <div className="mt-2 space-y-1.5 text-[10px] font-bold text-slate-500">
                <p className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-orange-500"/>{route.startCoords?.pickupTime || route.scheduledTime || route.officialScheduledTime || '--:--'}</p>
                <p className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 text-green-600 shrink-0"/>{route.start || 'Origen'}</p>
                <p className="flex items-center gap-1.5 truncate"><Navigation2 className="w-3 h-3 text-red-500 shrink-0"/>{route.end || 'Destino'}</p>
                {route.driver && <p className="flex items-center gap-1.5"><Car className="w-3 h-3 text-slate-500"/>{route.driver}</p>}
              </div>
            </button>
          ))}
        </aside>
      </main>
    </div>
  );
}
