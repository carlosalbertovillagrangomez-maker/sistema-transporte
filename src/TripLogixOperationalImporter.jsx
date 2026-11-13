import React, { useMemo, useState } from 'react';
import { formatOperationalTime, norm, toPlanningRow } from './triplogixWorkbook';

// Antes de guardar rutas, el operador debe confirmar la empresa, fecha,
// el sentido de viaje y la hora oficial que no figure en Programación.
export default function TripLogixOperationalImporter({ data, clients = [], onApply, onClose }) {
  const [company, setCompany] = useState('');
  const [date, setDate] = useState('');
  const [mode, setMode] = useState('Ida');
  const [officialTime, setOfficialTime] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set(
    data.rosterSource === 'Programación'
      ? data.entries.filter(entry => entry.entradaTime || entry.entradaRoute).map(entry => entry.id)
      : []
  ));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const records = useMemo(() => data.entries.map(entry => ({
    ...entry, planning: toPlanningRow(entry, mode, officialTime)
  })), [data, mode, officialTime]);
  const shown = useMemo(() => records.filter(entry => norm(entry.name).includes(norm(search)) || norm(entry.homeAddress).includes(norm(search))), [records, search]);
  const active = records.filter(entry => selected.has(entry.id));
  const duplicates = new Set();
  const seen = new Set();
  for (const entry of active) {
    const key = norm(entry.name);
    if (seen.has(key)) duplicates.add(entry.name);
    seen.add(key);
  }
  const missingTime = active.filter(entry => !formatOperationalTime(entry.planning.time));
  const missingAddress = active.filter(entry => !entry.planning.address && !entry.planning.meetingPointAddress);

  const changeMode = value => {
    setMode(value);
    if (data.rosterSource === 'Programación') {
      setSelected(new Set(data.entries.filter(entry => value === 'Ida'
        ? Boolean(entry.entradaTime || entry.entradaRoute)
        : Boolean(entry.salidaTime || entry.salidaRoute)
      ).map(entry => entry.id)));
    } else {
      setSelected(new Set());
    }
  };
  const chooseVisible = () => setSelected(prev => new Set([...prev, ...shown.map(entry => entry.id)]));
  const clearAll = () => setSelected(new Set());
  const toggle = id => setSelected(prev => {
    const next = new Set(prev); if(next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const apply = async () => {
    setMessage('');
    const client = clients.find(item => item.name === company);
    if (!client) return setMessage('Selecciona la empresa que recibirá las rutas.');
    const headquarters = (client.locations || []).find(location => location.assignedTo === 'General');
    if (!headquarters?.address || !Number.isFinite(Number(headquarters.lat)) || !Number.isFinite(Number(headquarters.lng ?? headquarters.lon))) {
      return setMessage('La empresa elegida necesita una sede General con dirección y coordenadas en Clientes.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMessage('Selecciona la fecha del servicio.');
    if (!active.length) return setMessage('Selecciona a las personas que realmente viajarán ese día.');
    if (duplicates.size > 0) return setMessage('Hay personas repetidas en la selección: ' + [...duplicates].slice(0,5).join(', ') + '. Selecciona sólo una fila por persona y sentido.');
    if (active.length > 120) return setMessage('Selecciona hasta 120 personas por operación para revisar los recorridos por grupos.');
    if (missingTime.length) return setMessage('Falta hora oficial para ' + missingTime.length + ' persona(s). Escribe la hora de entrada/salida arriba.');
    if (missingAddress.length) return setMessage('Falta domicilio/dirección para ' + missingAddress.length + ' persona(s). Revisa la hoja BD o Programación.');
    if (!window.confirm('Preparar ' + active.length + ' pasajero(s) para ' + (mode === 'Ida' ? 'ENTRADA' : 'SALIDA') + ' el ' + date + ' en ' + company + '? No se guardarán rutas hasta confirmar el último paso.')) return;

    setLoading(true);
    try {
      const result = await onApply({
        clientName: company, date, mode,
        rows: active.map(entry => entry.planning)
      });
      if(result) onClose();
    } catch(error) {
      console.error('No se pudo preparar la planificación importada:', error);
      setMessage(error.message || 'No se pudo importar la programación. Revisa domicilios y horarios.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-2xl shadow-2xl p-4 md:p-6 space-y-4" onClick={event => event.stopPropagation()}>
        <div className="flex justify-between gap-3 items-start">
          <div>
            <h3 className="text-xl font-black text-slate-900">Planificar desde la plantilla de la empresa</h3>
            <p className="text-xs text-slate-500 mt-1">Reconocimos: {data.sources.join(', ')} · {data.entries.length} personas · {data.drivers.length} conductores del directorio</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 text-2xl leading-none" aria-label="Cerrar importador">×</button>
        </div>
        {data.warnings.map((warning, index) => <p key={index} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">{warning}</p>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-blue-50/60 rounded-xl border border-blue-100 p-4">
          <label className="text-xs font-bold text-slate-700">Empresa registrada
            <select className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={company} onChange={event => setCompany(event.target.value)}>
              <option value="">Seleccionar empresa...</option>
              {clients.map(item => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Fecha de servicio
            <input type="date" className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-700">Sentido de las rutas
            <select className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={mode} onChange={event => changeMode(event.target.value)}>
              <option value="Ida">ENTRADA → Empresa</option><option value="Regreso">SALIDA → Domicilios</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Hora oficial (si falta en Programación)
            <input type="time" className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={officialTime} onChange={event => setOfficialTime(event.target.value)} />
          </label>
        </div>
        <p className="text-xs text-slate-600">La pestaña <strong>BD</strong> contiene un directorio; no se toma como lista de viajes del día. Selecciona únicamente los pasajeros que deban trasladarse. Las rutas y horas de Programación se respetan cuando existen.</p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-sm font-bold text-slate-700">Pasajeros seleccionados: <strong className="text-orange-600">{active.length}/{records.length}</strong></label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={chooseVisible} className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-800">Seleccionar visibles</button>
            <button type="button" onClick={clearAll} className="px-3 py-2 bg-white border rounded-lg text-xs font-bold text-slate-600">Quitar selección</button>
          </div>
        </div>
        <input type="search" placeholder="Buscar por nombre o domicilio..." value={search} onChange={event => setSearch(event.target.value)} className="w-full border border-slate-300 rounded-xl p-3 text-sm" />
        <div className="border border-slate-200 rounded-xl max-h-[36vh] overflow-y-auto divide-y divide-slate-100">
          {shown.map(entry => (
            <label key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} className="w-4 h-4 accent-orange-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-black text-slate-800">{entry.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{entry.planning.meetingPointAddress || entry.planning.address || 'Sin dirección'}</span>
              </span>
              <span className="text-[10px] text-slate-600 shrink-0">{entry.planning.time || 'Sin hora'}{entry.planning.route ? ' · Ruta ' + entry.planning.route : ''}</span>
            </label>
          ))}
          {!shown.length && <p className="p-5 text-sm text-slate-500">No se encontraron pasajeros.</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
          <div className="text-xs text-slate-600 space-y-1">
            <p>{missingTime.length ? '⚠ ' + missingTime.length + ' seleccionados sin hora oficial.' : '✓ Horarios completos para la selección.'}</p>
            {duplicates.size > 0 && <p className="text-amber-700">⚠ {duplicates.size} nombres repetidos: revisa antes de continuar.</p>}
            <p>{missingAddress.length ? '⚠ ' + missingAddress.length + ' seleccionados sin domicilio.' : '✓ Los pasajeros seleccionados tienen dirección de referencia.'}</p>
            <p>Los conductores temporales se agregan después, en <strong>Cuadrillas armadas → + Registrar conductor nuevo</strong> (nombre, vehículo y placas).</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="border p-3 rounded-lg text-xs font-bold">Cancelar</button>
            <button type="button" disabled={loading || !active.length} onClick={apply} className="bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-lg text-xs font-black disabled:opacity-50">
              {loading ? 'Preparando recorridos...' : 'Continuar a planificación'}
            </button>
          </div>
        </div>
        {message && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{message}</p>}
        <p className="text-[11px] text-slate-500">La importación no guarda servicios automáticamente. TripLogix usa Google Maps para validar ubicaciones y permite revisar grupos, orden y conductor antes de confirmar.</p>
      </div>
    </div>
  );
}
