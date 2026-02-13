import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, MapPin, X, Trash2, User, Loader2, Zap, Calendar, Navigation, ArrowDown, Star } from 'lucide-react';
// GOOGLE MAPS (Importamos Autocomplete)
import { GoogleMap, useJsApiLoader, Marker, Polyline, Autocomplete } from '@react-google-maps/api';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, doc, query, orderBy, deleteDoc } from 'firebase/firestore';

// === TU NUEVA CLAVE DE API ===
const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0"; 

// === CONFIGURACIÓN GOOGLE MAPS ===
const containerStyle = { width: '100%', height: '100%' };
const centerMX = { lat: 19.4326, lng: -99.1332 }; // CDMX
// IMPORTANTE: 'places' es necesario para el buscador
const libraries = ['places']; 

// === NUEVO COMPONENTE AUTOCOMPLETE DE GOOGLE ===
const AddressAutocomplete = ({ value, onSelect, placeholder, iconColor = "text-slate-400", zIndex = 50, favorites = [] }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const autocompleteRef = useRef(null);

    useEffect(() => { setInputValue(value || ''); }, [value]);

    const personalFavs = favorites.filter(f => f.assignedTo && f.assignedTo !== 'General');
    const generalFavs = favorites.filter(f => !f.assignedTo || f.assignedTo === 'General');

    // Configuración para restringir a México
    const options = {
        componentRestrictions: { country: "mx" },
        fields: ["address_components", "geometry", "formatted_address"],
    };

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
        onSelect({ 
            address: fav.address, 
            lat: parseFloat(fav.lat), 
            lng: parseFloat(fav.lon || fav.lng) 
        });
    };

    return (
        <div className="relative" style={{ zIndex: zIndex }}> 
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${iconColor === 'green' ? 'bg-green-100 border-green-200' : iconColor === 'red' ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200'} border flex items-center justify-center shrink-0`}>
                    <MapPin className={`w-4 h-4 ${iconColor === 'green' ? 'text-green-700' : iconColor === 'red' ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 relative">
                    {/* Componente Oficial de Google */}
                    <Autocomplete
                        onLoad={(ref) => (autocompleteRef.current = ref)}
                        onPlaceChanged={handlePlaceChanged}
                        options={options}
                    >
                        <input 
                            type="text" 
                            placeholder={placeholder} 
                            className="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg p-2.5 outline-none focus:border-blue-500 focus:bg-white transition shadow-sm"
                            value={inputValue} 
                            onChange={(e) => setInputValue(e.target.value)} 
                        />
                    </Autocomplete>
                </div>
            </div>

            {/* Favoritos */}
            {favorites && favorites.length > 0 && (
                <div className="pl-[52px] mt-2 space-y-2">
                    {personalFavs.length > 0 && (
                        <div><p className="text-[9px] font-bold text-purple-600 uppercase mb-1 ml-1">👤 Personales</p><div className="flex flex-wrap gap-2">{personalFavs.map((fav, i) => (<button key={i} onClick={() => handleFavoriteClick(fav)} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded-lg hover:bg-purple-100 flex items-center gap-1 transition shadow-sm whitespace-nowrap"><Star className="w-3 h-3 fill-purple-400 text-purple-500"/> <span className="font-bold">{fav.alias}</span></button>))}</div></div>
                    )}
                    {generalFavs.length > 0 && (
                        <div>{personalFavs.length > 0 && <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 ml-1 mt-2">🏢 Empresa</p>}<div className="flex flex-wrap gap-2">{generalFavs.map((fav, i) => (<button key={i} onClick={() => handleFavoriteClick(fav)} className="text-[10px] bg-yellow-50 text-slate-600 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100 flex items-center gap-1 transition shadow-sm whitespace-nowrap"><Star className="w-3 h-3 fill-yellow-400 text-yellow-500"/> <span className="font-bold">{fav.alias}</span></button>))}</div></div>
                    )}
                </div>
            )}
        </div>
    );
};

const SegmentInfo = ({ distance, duration }) => {
    if (!distance) return <div className="pl-[19px] py-1"><div className="w-0.5 h-4 bg-slate-200 ml-0.5"></div></div>;
    return (
        <div className="pl-[20px] py-2 flex items-center relative z-0">
            <div className="w-0.5 h-full absolute left-[21px] top-0 bottom-0 bg-slate-200 -z-10"></div>
            <div className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-500 flex items-center gap-2 shadow-sm ml-4">
                <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3"/> Tramo:</span><span className="font-bold text-slate-700">{distance} km</span><span className="text-slate-300">|</span><span className="font-bold text-green-600">{duration} min</span>
            </div>
        </div>
    );
};

export default function Planificacion() {
  const [showModal, setShowModal] = useState(false);
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries });
  const mapRef = useRef(null);

  // DATOS FIREBASE
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableClients, setAvailableClients] = useState([]);
  const [routesList, setRoutesList] = useState([]);

  // ESTADOS MAPA Y RUTA
  const [viewRoute, setViewRoute] = useState(null);
  const [newRoute, setNewRoute] = useState({ client: '', requestUser: '', driver: '', status: 'Pendiente', serviceType: 'Prioritario', scheduledDate: '', scheduledTime: '' });
  const [selectedClientData, setSelectedClientData] = useState(null);
  
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  
  const [routeInfo, setRouteInfo] = useState({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] });
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // EFECTO PARA CENTRAR EL MAPA
  useEffect(() => {
      if(isLoaded && mapRef.current) {
          const bounds = new window.google.maps.LatLngBounds();
          let hasPoints = false;

          if (viewRoute?.technicalData?.geometry) {
              viewRoute.technicalData.geometry.forEach(coord => bounds.extend(coord));
              hasPoints = true;
          } else {
              if (startPoint) { bounds.extend(startPoint); hasPoints = true; }
              if (endPoint) { bounds.extend(endPoint); hasPoints = true; }
              if (routeInfo.geometry.length > 0) {
                  routeInfo.geometry.forEach(coord => bounds.extend(coord));
                  hasPoints = true;
              }
          }
          if (hasPoints) mapRef.current.fitBounds(bounds);
      }
  }, [startPoint, endPoint, routeInfo, viewRoute, isLoaded]);

  // CARGAR DATOS
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

  const getFilteredFavorites = () => {
      if (!selectedClientData?.locations) return [];
      return selectedClientData.locations.filter(loc => {
          if (!loc.assignedTo || loc.assignedTo === 'General') return true;
          if (newRoute.requestUser && loc.assignedTo === newRoute.requestUser) return true;
          return false;
      });
  };

  // CÁLCULO DE RUTA
  useEffect(() => { if (startPoint && endPoint) calculateRoute(); }, [startPoint, endPoint, waypoints]);

  const calculateRoute = async () => {
      setIsLoadingRoute(true);
      try {
          const points = [startPoint, ...waypoints, endPoint];
          const validPoints = points.filter(p => p && p.lat && p.lng);
          if (validPoints.length < 2) return;
          
          const coordsString = validPoints.map(p => `${p.lng},${p.lat}`).join(';');
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=true`);
          const data = await response.json();
          
          if (data.code === 'Ok' && data.routes.length > 0) {
              const ruta = data.routes[0];
              const segmentsData = ruta.legs.map(leg => ({ distance: (leg.distance / 1000).toFixed(1), duration: Math.round(leg.duration / 60) }));
              const geometry = ruta.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
              
              setRouteInfo({ totalDistance: (ruta.distance / 1000).toFixed(1), totalDuration: Math.round(ruta.duration / 60), segments: segmentsData, geometry: geometry });
          }
      } catch (error) { console.error("Error ruta:", error); } finally { setIsLoadingRoute(false); }
  };

  const addWaypoint = () => setWaypoints([...waypoints, { address: '', lat: null, lng: null }]);
  const removeWaypoint = (i) => setWaypoints(waypoints.filter((_, idx) => idx !== i));
  const updateWaypoint = (i, item) => { const w = [...waypoints]; w[i] = item; setWaypoints(w); };

  const handleSaveRoute = async () => {
      if(!newRoute.client || !endPoint || !newRoute.driver) return alert("Faltan datos.");
      const today = new Date().toISOString().split('T')[0];
      const rutaSave = {
          ...newRoute,
          start: startPoint.address, end: endPoint.address, waypoints: waypoints.map(w => w.address),
          technicalData: { ...routeInfo },
          finalDate: newRoute.serviceType === 'Programado' ? newRoute.scheduledDate : today, createdDate: new Date().toISOString()
      };
      try { 
          await addDoc(collection(db, "rutas"), rutaSave); 
          setShowModal(false); 
          setNewRoute({ client: '', requestUser: '', driver: '', status: 'Pendiente', serviceType: 'Prioritario', scheduledDate: '', scheduledTime: '' });
          setStartPoint(null); setEndPoint(null); setWaypoints([]); setRouteInfo({ totalDistance: 0, totalDuration: 0, segments: [], geometry: [] }); setSelectedClientData(null);
      } catch (e) { alert(e.message); }
  };

  const handleDeleteRoute = async (id, e) => {
    e.stopPropagation();
    if(confirm("¿Eliminar ruta?")) {
        await deleteDoc(doc(db, "rutas", id));
        if(viewRoute?.id === id) setViewRoute(null);
    }
  };

  const handleMapLoad = useCallback((map) => { mapRef.current = map; }, []);
  const routeToDisplay = viewRoute?.technicalData?.geometry ? viewRoute.technicalData.geometry : [];
  const mapCenter = routeToDisplay.length > 0 ? routeToDisplay[0] : centerMX;

  if (!isLoaded) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600"/></div>;

  return (
    <div className="flex-1 p-6 bg-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">Planificador de Rutas</h2><p className="text-slate-500 text-sm">{routesList.length} entregas en Nube</p></div>
          <button onClick={() => { setViewRoute(null); setShowModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg"><Plus className="w-4 h-4" /> Nueva Ruta</button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
          <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
              {routesList.map((ruta) => (
                <div key={ruta.id} onClick={() => setViewRoute(ruta)} className={`bg-white p-4 rounded-xl shadow-sm border transition cursor-pointer group ${viewRoute?.id === ruta.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:shadow-md'}`}>
                    <div className="flex justify-between items-start mb-2">
                         {ruta.serviceType === 'Prioritario' ? <span className="text-[10px] font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1 animate-pulse"><Zap className="w-3 h-3"/> PRIORITARIO</span> : <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1"><Calendar className="w-3 h-3"/> {ruta.scheduledDate}</span>}
                         <div className="flex gap-1"><button onClick={(e) => handleDeleteRoute(ruta.id, e)} className="text-red-400 bg-red-50 p-1.5 rounded hover:bg-red-100"><Trash2 className="w-4 h-4"/></button></div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-0.5">{ruta.client}</h4>
                    {ruta.requestUser && <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><User className="w-3 h-3"/> Solicitó: {ruta.requestUser}</p>}
                    <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-green-600" /> <span className="truncate">{ruta.start.split(',')[0]}</span></div>
                        <div className="flex items-center gap-2 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-red-600" /> <span className="truncate">{ruta.end.split(',')[0]}</span></div>
                    </div>
                </div>
              ))}
          </div>

          <div className="flex-1 bg-slate-200 rounded-xl border border-slate-300 relative overflow-hidden flex items-center justify-center">
             <GoogleMap mapContainerStyle={containerStyle} center={mapCenter} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false, mapTypeControl: false }}>
                 {routeToDisplay.length > 0 && (
                     <>
                        <Polyline path={routeToDisplay} options={{ strokeColor: "#3b82f6", strokeOpacity: 1, strokeWeight: 5 }} />
                        <Marker position={routeToDisplay[0]} label="A" />
                        <Marker position={routeToDisplay[routeToDisplay.length - 1]} label="B" />
                     </>
                 )}
             </GoogleMap>
          </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div><h3 className="text-lg font-bold text-slate-800">Planificar Ruta</h3></div>
                    <button onClick={() => setShowModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-red-500" /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 p-6 overflow-y-auto border-r border-slate-100 bg-white z-10 shadow-lg relative">
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipo de Servicio</label>
                                <div className="flex gap-3 mb-3"><button onClick={() => setNewRoute({...newRoute, serviceType: 'Prioritario'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Prioritario' ? 'bg-orange-50 border-orange-200 text-orange-700 ring-1 ring-orange-200' : 'bg-white border-slate-200 text-slate-400'}`}><Zap className="w-4 h-4" /> PRIORITARIO</button><button onClick={() => setNewRoute({...newRoute, serviceType: 'Programado'})} className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition ${newRoute.serviceType === 'Programado' ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200' : 'bg-white border-slate-200 text-slate-400'}`}><Calendar className="w-4 h-4" /> PROGRAMADO</button></div>
                                {newRoute.serviceType === 'Programado' && (<div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100"><input type="date" className="w-full bg-white border border-blue-200 rounded p-2 text-xs" value={newRoute.scheduledDate} onChange={(e) => setNewRoute({...newRoute, scheduledDate: e.target.value})} /><input type="time" className="w-full bg-white border border-blue-200 rounded p-2 text-xs" value={newRoute.scheduledTime} onChange={(e) => setNewRoute({...newRoute, scheduledTime: e.target.value})} /></div>)}
                            </div>
                            <hr className="border-slate-100" />
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Cliente</label>
                                <select className="w-full mt-1 bg-slate-50 border border-slate-300 rounded p-2 text-sm" value={newRoute.client} onChange={handleClientChange}><option value="">Seleccionar...</option>{availableClients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                                {selectedClientData?.type === 'Empresa' && (<select className="w-full mt-2 bg-slate-50 border border-slate-300 rounded p-2 text-xs" value={newRoute.requestUser} onChange={e => setNewRoute({...newRoute, requestUser: e.target.value})}><option value="">-- Solicitado por --</option>{selectedClientData.users?.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}</select>)}
                            </div>
                            <div className="relative pt-2">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Itinerario</label>
                                <AddressAutocomplete placeholder="Inicio..." value={startPoint?.address} onSelect={setStartPoint} iconColor="green" zIndex={50} favorites={getFilteredFavorites()} />
                                <SegmentInfo distance={routeInfo.segments[0]?.distance} duration={routeInfo.segments[0]?.duration} />
                                {waypoints.map((wp, index) => (<div key={index} className="relative" style={{zIndex: 40-index}}><AddressAutocomplete placeholder="Parada..." value={wp.address} onSelect={(i) => updateWaypoint(index, i)} iconColor="blue" zIndex={40-index} favorites={getFilteredFavorites()} /><button onClick={() => removeWaypoint(index)} className="absolute right-0 top-2 text-red-400"><Trash2 className="w-4 h-4"/></button><SegmentInfo distance={routeInfo.segments[index+1]?.distance} duration={routeInfo.segments[index+1]?.duration} /></div>))}
                                <button onClick={addWaypoint} className="ml-4 text-xs text-blue-600 font-bold mb-2 flex gap-1"><Plus className="w-3 h-3"/> Agregar Parada</button>
                                <AddressAutocomplete placeholder="Destino..." value={endPoint?.address} onSelect={setEndPoint} iconColor="red" zIndex={10} favorites={getFilteredFavorites()} />
                            </div>
                            <hr className="border-slate-100" />
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Conductor</label><select className="w-full mt-1 bg-slate-50 border border-slate-300 rounded p-2 text-sm" value={newRoute.driver} onChange={e => setNewRoute({...newRoute, driver: e.target.value})}><option value="">Seleccionar...</option>{availableDrivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select></div>
                        </div>
                    </div>

                    <div className="flex-1 bg-slate-100 relative">
                        <GoogleMap mapContainerStyle={containerStyle} center={centerMX} zoom={12} onLoad={handleMapLoad} options={{ streetViewControl: false }}>
                            {startPoint && <Marker position={startPoint} label="A" />}
                            {endPoint && <Marker position={endPoint} label="B" />}
                            {routeInfo.geometry.length > 0 && <Polyline path={routeInfo.geometry} options={{ strokeColor: "#3b82f6", strokeOpacity: 1, strokeWeight: 5 }} />}
                        </GoogleMap>
                        
                        <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-xl border border-slate-200 max-w-xs z-[1000]">
                             <h5 className="font-bold text-slate-800 text-sm mb-2">Resumen Total</h5>
                             {isLoadingRoute ? <div className="text-xs text-blue-500 flex gap-2"><Loader2 className="animate-spin w-3 h-3"/> Calculando...</div> : routeInfo.totalDistance > 0 ? (<div><div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Distancia:</span> <b>{routeInfo.totalDistance} km</b></div><div className="flex justify-between text-sm"><span className="text-slate-500">Tiempo:</span> <b className="text-green-600">{routeInfo.totalDuration} min</b></div></div>) : <p className="text-xs text-slate-400">Define la ruta para ver el cálculo.</p>}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 border rounded hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleSaveRoute} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded hover:bg-blue-700 shadow flex items-center gap-2"><Navigation className="w-4 h-4"/> Confirmar Ruta</button>
                </div>
            </div>
        </div>
      )}

      {/* ESTILOS ESPECÍFICOS PARA ARREGLAR GOOGLE AUTOCOMPLETE */}
      <style>{`
        .pac-container {
          z-index: 20000 !important;
          border-radius: 8px;
          margin-top: 5px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          font-family: inherit;
        }
        .pac-item {
          padding: 10px;
          font-size: 13px;
          cursor: pointer;
          border-top: 1px solid #f1f5f9;
        }
        .pac-item:hover {
          background-color: #f8fafc;
        }
        .pac-item-query {
          font-size: 13px;
          color: #1e293b;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}