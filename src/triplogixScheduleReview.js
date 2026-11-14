// Lógica pura de selección de pasajeros por sentido. Nunca deduce recorridos ni
// convierte una salida en entrada. Las duplicidades idénticas se consolidan
// sólo en la vista previa; la fuente original sigue intacta.
export const normalizeIdentity = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').replace(/[.,]+/g, '').trim().toLocaleUpperCase('es');

const text = value => String(value ?? '').trim();

export const hasScheduledMode = (row, mode) => mode === 'Regreso'
  ? Boolean(text(row.salidaTime) || text(row.salidaRoute))
  : Boolean(text(row.entradaTime) || text(row.entradaRoute));

const identityOfService = (entry, mode) => {
  const isExit = mode === 'Regreso';
  return [
    normalizeIdentity(entry.name),
    isExit ? text(entry.salidaTime) : text(entry.entradaTime),
    normalizeIdentity(isExit ? entry.salidaRoute : entry.entradaRoute),
    isExit ? text(entry.salidaOrder) : text(entry.entradaOrder),
    normalizeIdentity(isExit ? entry.dropoffAddress : entry.pickupAddress),
    normalizeIdentity(isExit ? entry.salidaDriver : entry.entradaDriver)
  ].join('::');
};

const completeness = (entry, mode) => {
  const exit = mode === 'Regreso';
  return [
    entry.homeAddress, entry.phone,
    exit ? entry.dropoffAddress : entry.pickupAddress,
    exit ? entry.salidaTime : entry.entradaTime,
    exit ? entry.salidaRoute : entry.entradaRoute,
    exit ? entry.salidaDriver : entry.entradaDriver
  ].filter(Boolean).length;
};

export const groupScheduleForMode = (entries = [], mode, rosterSource = 'Programación') => {
  const sourceRows = rosterSource === 'Programación'
    ? entries.filter(row => hasScheduledMode(row, mode))
    : [...entries];
  const unique = new Map();
  let exactDuplicates = 0;
  for (const entry of sourceRows) {
    const key = identityOfService(entry, mode);
    const saved = unique.get(key);
    if (saved) {
      exactDuplicates += 1;
      if (completeness(entry, mode) > completeness(saved, mode)) unique.set(key, entry);
    } else unique.set(key, entry);
  }
  const rows = [...unique.values()];
  const byPerson = new Map();
  rows.forEach(row => {
    const key = normalizeIdentity(row.name);
    byPerson.set(key, [...(byPerson.get(key) || []), row]);
  });
  const conflictingNames = new Set([...byPerson.entries()]
    .filter(([,values]) => values.length > 1).map(([key]) => key));
  // Al cambiar de sentido, elegir una sola fila por nombre. Si hay
  // servicios distintos se exige elección explícita antes de crear rutas.
  const selected = [];
  const selectedNames = new Set();
  for (const row of rows) {
    const key = normalizeIdentity(row.name);
    if (!selectedNames.has(key) && rosterSource === 'Programación') {
      selected.push(row.id);
      selectedNames.add(key);
    }
  }
  return {
    rows, selected,
    exactDuplicates,
    conflictingNames,
    otherModeExcluded: rosterSource === 'Programación' ? entries.length - sourceRows.length : 0
  };
};

export const addressFromClientCatalog = (client, personName) => {
  if (!client || !personName) return '';
  const key = normalizeIdentity(personName);
  const locations = Array.isArray(client.locations) ? client.locations : [];
  const users = Array.isArray(client.users) ? client.users : [];
  const located = locations.find(loc => normalizeIdentity(loc.assignedTo) === key && text(loc.address));
  if (located) return text(located.address);
  const user = users.find(item => normalizeIdentity(item.name) === key);
  return text(user?.address || user?.domicilio || user?.direccion || '');
};
