import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Arreglo para que los iconos por defecto de Leaflet se vean bien en React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

export default function Mapa() {
  // Coordenadas iniciales (Centro de la Ciudad de México por ejemplo)
  const position = [19.4326, -99.1332];

  return (
    <div className="h-full w-full rounded-xl overflow-hidden shadow-inner border border-slate-300 relative z-0">
      <MapContainer 
        center={position} 
        zoom={13} 
        style={{ height: "100%", width: "100%" }}
        zoomControl={false} // Quitamos el zoom feo por defecto para ponerlo nosotros si queremos
      >
        {/* PIEL DEL MAPA (OpenStreetMap - Gratis) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* MARCADOR 1: RUTA 101 */}
        <Marker position={[19.4326, -99.1332]}>
          <Popup>
            <div className="text-center">
                <strong className="text-blue-600">Ruta 101</strong><br />
                Juan Pérez<br />
                <span className="text-green-600 font-bold">En Curso</span>
            </div>
          </Popup>
        </Marker>

        {/* MARCADOR 2: RUTA 102 (Con alerta) */}
        <Marker position={[19.4200, -99.1600]}>
          <Popup>
             <div className="text-center">
                <strong className="text-red-600">Ruta 102</strong><br />
                Carlos Ruiz<br />
                <span className="text-red-600 font-bold">RETRASADO</span>
            </div>
          </Popup>
        </Marker>

        {/* MARCADOR 3: RUTA 103 */}
        <Marker position={[19.4400, -99.1200]}>
          <Popup>
             <div className="text-center">
                <strong className="text-blue-600">Ruta 103</strong><br />
                Luis M.<br />
                <span className="text-green-600 font-bold">En Curso</span>
            </div>
          </Popup>
        </Marker>

      </MapContainer>

      {/* Etiqueta flotante encima del mapa */}
      <div className="absolute top-4 right-4 z-[1000] bg-white px-3 py-1 rounded shadow-md border border-slate-200 text-xs font-bold text-slate-600">
          🟢 En vivo
      </div>
    </div>
  );
}