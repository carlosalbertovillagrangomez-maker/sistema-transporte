import React, { useMemo, useState } from 'react';
import { formatOperationalTime, norm, parseOperationalClipboard, toPlanningRow } from './triplogixWorkbook';
import { addressFromClientCatalog, groupScheduleForMode, hasScheduledMode, normalizeIdentity } from './triplogixScheduleReview';

const initialMode = data => {
  if (data.rosterSource !== 'Programación') return 'Ida';
  const ida = data.entries.filter(row => hasScheduledMode(row, 'Ida')).length;
  const regreso = data.entries.filter(row => hasScheduledMode(row, 'Regreso')).length;
  return regreso > 0 && ida === 0 ? 'Regreso' : 'Ida';
};

export default function TripLogixOperationalImporter({ data, clients = [], onApply, onClose }) {
  const [company, setCompany] = useState('');
  const [date, setDate] = useState('');
  const [mode, setMode] = useState(() => initialMode(data));
  const [officialTime, setOfficialTime] = useState('');
  const [search, setSearch] = useState('');
  const [supplementText, setSupplementText] = useState('');
  const [supplementEntries, setSupplementEntries] = useState([]);
  const [addressOverrides, setAddressOverrides] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [supplementMessage, setSupplementMessage] = useState('');

  const initialGroup = useMemo(() => groupScheduleForMode(data.entries, initialMode(data), data.rosterSource), [data]);
  const [selected, setSelected] = useState(() => new Set(initialGroup.selected));

  const group = useMemo(
    () => groupScheduleForMode(data.entries, mode, data.rosterSource),
    [data, mode]
  );
  const selectedClient = useMemo(() => clients.find(client => client.name === company), [clients, company]);
  const referenceAddresses = useMemo(() => {
    const byName = new Map();
    for(const entry of supplementEntries) {
      const key = normalizeIdentity(entry.name);
      const old = byName.get(key) || {};
      byName.set(key, {
        address: entry.homeAddress || old.address || '',
        phone: entry.phone || old.phone || ''
      });
    }
    return byName;
  }, [supplementEntries]);

  const records = useMemo(() => group.rows.map(entry => {
    const key = normalizeIdentity(entry.name);
    const supplement = referenceAddresses.get(key) || {};
    const catalogAddress = addressFromClientCatalog(selectedClient, entry.name);
    const editedAddress = String(addressOverrides[entry.id] || '').trim();
    const source = toPlanningRow(entry, mode, officialTime);
    const homeAddress = source.address || supplement.address || catalogAddress || '';
    const plannedAddress = editedAddress || source.meetingPointAddress || homeAddress;
    return {
      ...entry,
      planning: {
        ...source,
        address: homeAddress || plannedAddress,
        phone: source.phone || supplement.phone || '',
        meetingPoint: editedAddress ? editedAddress : source.meetingPoint,
        meetingPointAddress: editedAddress || source.meetingPointAddress,
        sourceAddressAuthoritative: Boolean(editedAddress) || source.sourceAddressAuthoritative
      },
      addressDisplay: plannedAddress,
      addressOrigin: editedAddress ? 'Corregida' : source.meetingPointAddress ? 'Programación' : source.address ? 'BD / Directorio' : supplement.address ? 'BD pegada' : catalogAddress ? 'Clientes TripLogix' : 'Sin dirección'
    };
  }), [group, mode, officialTime, selectedClient, referenceAddresses, addressOverrides]);

  const shown = useMemo(() => records.filter(entry =>
    norm(entry.name).includes(norm(search)) || norm(entry.addressDisplay).includes(norm(search))
  ), [records, search]);
  const active = records.filter(entry => selected.has(entry.id));
  const missingTime = active.filter(entry => !formatOperationalTime(entry.planning.time));
  const missingAddress = active.filter(entry => !entry.addressDisplay);
  const selectedDuplicates = useMemo(() => {
    const seen = new Set();
    const duplicates = new Set();
    for(const entry of active) {
      const key = normalizeIdentity(entry.name);
      if(seen.has(key)) duplicates.add(entry.name);
      seen.add(key);
    }
    return duplicates;
  }, [active]);

  const changeMode = value => {
    setMode(value);
    const otherGroup = groupScheduleForMode(data.entries, value, data.rosterSource);
    setSelected(new Set(otherGroup.selected));
    setMessage('');
    setSearch('');
    setOfficialTime('');
  };
  const chooseVisible = () => setSelected(prev => {
    const next = new Set(prev);
    const seen = new Set(records.filter(entry => next.has(entry.id)).map(entry => normalizeIdentity(entry.name)));
    shown.forEach(entry => {
      const key = normalizeIdentity(entry.name);
      if(!seen.has(key)) { next.add(entry.id); seen.add(key); }
    });
    return next;
  });
  const clearAll = () => { setSelected(new Set()); setMessage(''); };
  const toggle = entry => setSelected(prev => {
    const next = new Set(prev);
    if(next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      // Una fila por persona y sentido; al seleccionar otra variante se
      // desmarca la anterior en vez de bloquear toda la planificación.
      records.filter(row => normalizeIdentity(row.name) === normalizeIdentity(entry.name))
        .forEach(row => next.delete(row.id));
      next.add(entry.id);
    }
    return next;
  });

  const addSupplement = () => {
    try {
      const parsed = parseOperationalClipboard(supplementText);
      if(!parsed || parsed.rosterSource !== 'BD/Directorio') {
        throw new Error('Pega la pestaña BD o Directorio completa con sus encabezados.');
      }
      setSupplementEntries(parsed.entries);
      setSupplementMessage('Se cargaron ' + parsed.entries.length + ' registros para buscar direcciones y teléfonos. No se creó ningún viaje.');
      setSupplementText('');
      setMessage('');
    } catch(error) { setSupplementMessage(error.message); }
  };

  const apply = async () => {
    setMessage('');
    const client = clients.find(item => item.name === company);
    if (!client) return setMessage('Selecciona la empresa que recibirá las rutas.');
    const headquarters = (client.locations || []).find(location => location.assignedTo === 'General');
    const headquartersLat = headquarters?.lat == null || headquarters?.lat === '' ? NaN : Number(headquarters.lat);
    const headquartersLngValue = headquarters?.lng ?? headquarters?.lon;
    const headquartersLng = headquartersLngValue == null || headquartersLngValue === '' ? NaN : Number(headquartersLngValue);
    if (!headquarters?.address || !Number.isFinite(headquartersLat) || !Number.isFinite(headquartersLng)) {
      return setMessage('La empresa necesita una sede General con dirección y coordenadas. Revísala en Clientes.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMessage('Selecciona la fecha real del servicio.');
    if (!active.length) return setMessage('Selecciona a las personas que realmente viajarán ese día.');
    if (selectedDuplicates.size) return setMessage('Hay pasajeros repetidos en esta selección. Elige una sola fila por persona y sentido.');
    if (active.length > 300) return setMessage('Selecciona hasta 300 pasajeros para revisar las rutas por grupos.');
    if (missingTime.length) return setMessage('Falta hora de entrada/salida para ' + missingTime.length + ' pasajero(s). Indica la hora oficial en el campo superior.');
    if (missingAddress.length) {
      setSearch('');
      return setMessage('Falta dirección para ' + missingAddress.length + ' pasajero(s). Escribe las direcciones junto a sus nombres, pega también la pestaña BD o desmarca a los que aún no viajarán.');
    }
    if (!window.confirm('Preparar ' + active.length + ' pasajeros de ' +
      (mode === 'Ida' ? 'ENTRADA' : 'SALIDA') + ' para el ' + date +
      '? Se conservará el sentido elegido y no se guardará ninguna ruta hasta la confirmación final.')) return;

    setLoading(true);
    try {
      const result = await onApply({
        clientName: company,
        date,
        mode,
        rows: active.map(entry => entry.planning)
      });
      if(result) onClose();
    } catch(error) {
      console.error('Error al preparar planificación:', error);
      setMessage(error.message || 'No se pudo preparar la planificación. Verifica domicilios y horarios.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-2xl shadow-2xl p-4 md:p-6 space-y-4" onClick={event => event.stopPropagation()}>
        <div className="flex justify-between gap-3 items-start">
          <div>
            <h3 className="text-xl font-black text-slate-900">Planificar desde la plantilla de la empresa</h3>
            <p className="text-xs text-slate-500 mt-1">{data.sources.join(', ')} · {data.entries.length} filas originales · {data.drivers.length} conductores en directorio</p>
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
          <label className="text-xs font-bold text-slate-700">Fecha del servicio
            <input type="date" className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-700">Sentido (separado)
            <select className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={mode} onChange={event => changeMode(event.target.value)}>
              <option value="Ida">Sólo ENTRADAS → Empresa</option>
              <option value="Regreso">Sólo SALIDAS → Domicilios</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Hora oficial si falta en el documento
            <input type="time" className="block w-full mt-1.5 rounded-lg p-3 border border-slate-300 bg-white" value={officialTime} onChange={event => setOfficialTime(event.target.value)} />
          </label>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
          <p className="font-black">Se muestran sólo {mode === 'Ida' ? 'ENTRADAS' : 'SALIDAS'} que figuran en Programación.</p>
          {data.rosterSource === 'Programación' && <p>{group.otherModeExcluded} filas sin programación para este sentido, excluidas de la lista. {group.exactDuplicates > 0 ? group.exactDuplicates + ' repeticiones idénticas consolidadas.' : ''}</p>}
          {group.conflictingNames.size > 0 && <p className="text-amber-800">{group.conflictingNames.size} personas aparecen con dos servicios distintos para este sentido: elige cuál corresponde al día. TripLogix no las eliminará de la fuente.</p>}
          <p>Se conserva una sola fila seleccionada por persona; cambiar a Salidas no copia los pasajeros de Entrada.</p>
        </div>
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-800">¿Faltan domicilios? Completar desde BD o Directorio sin descargar Excel</summary>
          <p className="text-xs text-slate-600 my-2">Abre la pestaña BD o Directorio del mismo Google Sheets, copia el rango con encabezados y pégalo aquí. No se generarán viajes de las personas del directorio; sólo se utilizarán sus domicilios y teléfonos.</p>
          <textarea value={supplementText} onChange={event => setSupplementText(event.target.value)} className="block w-full border border-slate-300 rounded-lg p-3 text-xs" rows={3} placeholder="Pega BD / Directorio con encabezados..." />
          <button type="button" disabled={!supplementText.trim()} onClick={addSupplement} className="mt-2 rounded-lg bg-blue-600 text-white text-xs font-bold px-4 py-2 disabled:opacity-40">Complementar domicilios</button>
          {supplementMessage && <p role="status" className="mt-2 text-xs text-slate-600">{supplementMessage}</p>}
        </details>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-sm font-bold text-slate-700">Seleccionados: <strong className="text-orange-600">{active.length}/{records.length}</strong></label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={chooseVisible} className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-800">Seleccionar visibles (sin repetir)</button>
            <button type="button" onClick={clearAll} className="px-3 py-2 bg-white border rounded-lg text-xs font-bold text-slate-600">Quitar selección</button>
          </div>
        </div>
        <input type="search" placeholder="Buscar por nombre o domicilio..." value={search} onChange={event => setSearch(event.target.value)} className="w-full border border-slate-300 rounded-xl p-3 text-sm" />
        <div className="border border-slate-200 rounded-xl max-h-[40vh] overflow-y-auto divide-y divide-slate-100">
          {shown.map(entry => {
            const needsAddress = selected.has(entry.id) && !entry.addressDisplay;
            const samePersonVariants = group.conflictingNames.has(normalizeIdentity(entry.name));
            return (
              <div key={entry.id} className="px-3 py-3 hover:bg-slate-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry)} className="w-4 h-4 accent-orange-600 shrink-0 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-slate-800">{entry.name}{samePersonVariants && <span className="ml-2 text-amber-600 font-medium">Variantes de servicio</span>}</span>
                    <span className="block text-[11px] text-slate-600 break-words">{entry.addressDisplay || '⚠ Falta dirección'} <span className="text-slate-400">· {entry.addressOrigin}</span></span>
                  </span>
                  <span className="text-[10px] text-slate-600 shrink-0 text-right">{entry.planning.time || 'Sin hora'}<br/>{entry.planning.route ? 'Ruta ' + entry.planning.route : 'Sin ruta fija'}</span>
                </label>
                {(needsAddress || Object.prototype.hasOwnProperty.call(addressOverrides, entry.id)) && <label className="block ml-7 mt-2 text-[11px] text-amber-700 font-bold">
                  Dirección de recogida/entrega de este servicio
                  <input type="text" value={addressOverrides[entry.id] || ''} onChange={event => setAddressOverrides(prev => ({ ...prev, [entry.id]: event.target.value }))} className="mt-1 w-full border border-amber-300 bg-amber-50 p-2 rounded-lg text-xs text-slate-700" placeholder="Calle, número, colonia y ciudad" />
                </label>}
                {selected.has(entry.id) && entry.addressDisplay && <button type="button" className="ml-7 mt-1 text-[10px] text-blue-600 hover:underline" onClick={() => setAddressOverrides(prev => ({ ...prev, [entry.id]: prev[entry.id] || entry.addressDisplay }))}>Corregir esta dirección</button>}
              </div>
            );
          })}
          {!shown.length && <p className="p-5 text-sm text-slate-500">No hay personas para este sentido en Programación. Revisa Entrada/Salida o la pestaña utilizada.</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="text-xs text-slate-600 space-y-1">
            <p>{missingTime.length ? '⚠ '+missingTime.length+' seleccionados sin hora oficial.' : '✓ Horarios preparados.'}</p>
            <p>{missingAddress.length ? '⚠ '+missingAddress.length+' seleccionados sin dirección: completa sólo esos datos.' : '✓ Los seleccionados tienen direcciones.'}</p>
            {selectedDuplicates.size > 0 && <p className="text-amber-700">⚠ {selectedDuplicates.size} nombres repetidos en la selección.</p>}
            <p>Conductores temporales: <strong>Cuadrillas Armadas → + Registrar conductor nuevo</strong> (nombre, vehículo, placas).</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="border p-3 rounded-lg text-xs font-bold">Cancelar</button>
            <button type="button" disabled={loading || !active.length} onClick={apply} className="bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-lg text-xs font-black disabled:opacity-50">{loading ? 'Validando direcciones...' : 'Continuar a planificación'}</button>
          </div>
        </div>
        {message && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{message}</p>}
        <p className="text-[11px] text-slate-500">No se crean rutas hasta la confirmación final. Los puntos deben validarse con Google Maps; si alguno no se encuentra, se detiene la operación para corregirlo sin alterar rutas anteriores.</p>
      </div>
    </div>
  );
}
