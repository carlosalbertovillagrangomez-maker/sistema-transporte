import React, { useMemo, useState } from 'react';

const PUBLIC_CLIENT_URL = 'https://app-cliente-five.vercel.app';

const normalizePoint = (p) => {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng ?? p?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const countryForRoute = (route) => {
  const explicit = String(route?.country || route?.clientCountry || route?.pais || '').toLowerCase();
  if (explicit.includes('colom')) return 'CO';
  if (explicit.includes('mex')) return 'MX';
  const p = normalizePoint(route?.startCoords) || normalizePoint(route?.currentLocation);
  if (p && p.lat >= -5 && p.lat <= 13.8 && p.lng >= -82 && p.lng <= -66) return 'CO';
  return 'MX';
};

const normalizeWhatsApp = (raw, country) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('52') || digits.startsWith('57')) return digits;
  if (digits.length === 10) return `${country === 'CO' ? '57' : '52'}${digits}`;
  return /^\d{11,15}$/.test(digits) ? digits : '';
};

const getContacts = (route) => {
  const map = new Map();
  const add = (name, phone, plannedTime = '') => {
    const n = String(name || '').trim();
    const p = String(phone || '').replace(/\D/g, '');
    if (!n || !p) return;
    const key = `${n.toLowerCase()}|${p}`;
    if (!map.has(key)) map.set(key, { name:n, phone:p, plannedTime });
  };

  (Array.isArray(route?.passengerSchedule) ? route.passengerSchedule : []).forEach(item =>
    add(item.passengerName || item.name, item.phone || item.whatsapp, item.plannedTime || item.pickupTime || item.dropoffTime)
  );

  [route?.startCoords, ...(Array.isArray(route?.waypointsData) ? route.waypointsData : []), route?.endCoords]
    .filter(Boolean)
    .forEach(point => {
      add(point.passengerName || point.contact, point.phone || point.whatsapp, point.pickupTime || point.dropoffTime);
      (Array.isArray(point.passengersSchedule) ? point.passengersSchedule : []).forEach(item =>
        add(item.passengerName || item.name, item.phone || item.whatsapp, item.plannedTime || item.pickupTime || item.dropoffTime)
      );
    });

  return [...map.values()].filter(item => !/oficina central|destino final/i.test(item.name));
};

export default function TripLogixWhatsAppActions({ route, drivers = [] }) {
  const [open, setOpen] = useState(false);
  const contacts = useMemo(() => getContacts(route), [route]);
  const country = countryForRoute(route);
  const assignedDriver = drivers.find(driver => driver.id === route?.driverId);
  const driverPhone = normalizeWhatsApp(route?.driverPhone || assignedDriver?.phone || assignedDriver?.telefono || assignedDriver?.celular, country);
  if (!route?.id || (contacts.length === 0 && !driverPhone)) return null;
  const openChat = (contact) => {
    const phone = normalizeWhatsApp(contact.phone, country);
    if (!phone) return;
    const serviceTime = contact.plannedTime || route?.scheduledTime || route?.startTime || '';
    const message = [
      `Hola ${contact.name}, tu servicio TripLogix está programado${serviceTime ? ` para las ${serviceTime}` : ''}.`,
      route?.driver ? `Conductor: ${route.driver}${driverPhone ? ` · Celular: +${driverPhone}` : ''}.` : '',
      route?.client ? `Servicio: ${route.client}.` : '',
      `Seguimiento: ${PUBLIC_CLIENT_URL}/?trip=${encodeURIComponent(route.id)}`
    ].filter(Boolean).join(' ');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const openDriverChat = () => {
    if (!driverPhone) return;
    const message = [
      `Hola ${route?.driver || assignedDriver?.name || 'conductor'}, tienes un servicio asignado en TripLogix.`,
      route?.scheduledDate ? `Fecha: ${route.scheduledDate}.` : '',
      route?.startTime || route?.scheduledTime ? `Hora de inicio: ${route.startTime || route.scheduledTime}.` : '',
      route?.client ? `Empresa: ${route.client}.` : '',
      route?.start ? `Origen: ${route.start}.` : '',
      route?.end ? `Destino: ${route.end}.` : '',
      'Confirma la ruta con el despachador antes de iniciar.'
    ].filter(Boolean).join(' ');
    window.open(`https://wa.me/${driverPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded hover:bg-emerald-100 transition text-[9px] font-black uppercase">
        WhatsApp
      </button>
      {open && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-black text-slate-900">WhatsApp a pasajeros y conductor</h3>
                <p className="text-xs text-slate-500">El mensaje queda preparado; tú confirmas el envío en WhatsApp.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 text-xl">×</button>
            </div>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {driverPhone && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-900">Conductor: {route.driver || assignedDriver?.name}</p>
                    <p className="text-xs text-emerald-800">+{driverPhone}</p>
                  </div>
                  <button onClick={openDriverChat} className="bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold shrink-0">Avisar al conductor</button>
                </div>
              )}
              {contacts.length === 0 && <p className="text-xs text-slate-500">No se encontraron celulares de pasajeros para esta ruta.</p>}
              {contacts.map((contact, i) => (
                <div key={`${contact.name}-${i}`} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{contact.name}</p>
                    <p className="text-xs text-slate-500">{contact.plannedTime ? `Horario: ${contact.plannedTime} · ` : ''}{contact.phone}</p>
                  </div>
                  <button onClick={() => openChat(contact)} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold shrink-0">Abrir WhatsApp</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
