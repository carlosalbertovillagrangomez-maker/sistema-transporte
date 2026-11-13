import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

export default function TripLogixQuickDriver({ existing = [], suggestedDrivers = [], onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const cleanVehicle = vehicleModel.trim().replace(/\s+/g, ' ');
    const cleanPlate = vehiclePlate.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanName || !cleanVehicle || !cleanPlate) return setError('Completa nombre, vehículo y placas.');
    if (existing.some(driver => String(driver.vehiclePlate || '').replace(/\s+/g, '').toUpperCase() === cleanPlate)) return setError('Las placas ya existen en el catálogo de conductores.');
    setSaving(true); setError('');
    try {
      // Registro operativo: NO habilita una cuenta de conductor ni falsifica aprobación.
      const value = {
        name: cleanName,
        vehicleModel: cleanVehicle,
        vehiclePlate: cleanPlate,
        vehiculo: `${cleanVehicle} (${cleanPlate})`,
        status: 'Pendiente',
        isOnline: false,
        quickRegistration: true,
        accountAccessEnabled: false,
        createdBy: 'dispatcher',
        createdAt: new Date().toISOString()
      };
      const result = await addDoc(collection(db, 'conductores'), value);
      onCreated({ id: result.id, ...value });
    } catch (err) { setError(err?.message || 'No se pudo registrar al conductor.'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[11000] bg-black/70 p-4 flex items-center justify-center" onClick={onCancel}>
      <form onClick={event => event.stopPropagation()} onSubmit={save} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex justify-between gap-3 items-center"><h3 className="text-lg font-black text-slate-900">Nuevo conductor (alta rápida)</h3><button type="button" onClick={onCancel} className="text-slate-400 text-xl" aria-label="Cerrar">×</button></div>
        <p className="text-xs text-slate-500">Sólo se solicitan datos operativos. Para usar la app Conductor deberá completar su registro y recibir aprobación de Torre de Control.</p>
        {suggestedDrivers.length > 0 && <label className="block text-xs font-bold text-slate-700">
          Buscar en la pestaña Conductores del Excel (opcional)
          <select className="mt-1 block w-full p-3 border border-slate-300 rounded-lg bg-blue-50" defaultValue="" onChange={event => {
            const driver = event.target.value === '' ? null : suggestedDrivers[Number(event.target.value)];
            if (driver) {
              setName(driver.name || '');
              setVehicleModel(driver.vehicleModel || '');
              setVehiclePlate(driver.vehiclePlate || '');
              setError('');
            }
          }}>
            <option value="">Escribir manualmente...</option>
            {suggestedDrivers.map((driver, index) => <option key={index} value={index}>{driver.name} · {driver.vehiclePlate}</option>)}
          </select>
        </label>}
        <label className="block text-xs font-bold text-slate-700">Nombre completo<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full p-3 border border-slate-300 rounded-lg" /></label>
        <label className="block text-xs font-bold text-slate-700">Vehículo / modelo<input required maxLength={100} value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} className="mt-1 block w-full p-3 border border-slate-300 rounded-lg" /></label>
        <label className="block text-xs font-bold text-slate-700">Placas<input required maxLength={25} value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className="mt-1 block w-full p-3 border border-slate-300 rounded-lg uppercase" /></label>
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="p-3 text-xs rounded-lg border">Cancelar</button><button disabled={saving} type="submit" className="p-3 bg-orange-500 rounded-lg text-white font-black text-xs disabled:opacity-50">{saving ? 'Guardando...' : 'Registrar y seleccionar'}</button></div>
      </form>
    </div>
  );
}
