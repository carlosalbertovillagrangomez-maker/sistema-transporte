import * as XLSX from 'xlsx';

// Estructura de la plantilla operativa recibida en noviembre de 2026:
// Programación (A:O), BD (A:I), Directorio (A:E), Conductores (A:D).
// Se interpreta en el navegador: no es necesario subir el Excel a un modelo de IA.
export const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const norm = value => clean(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es');

export const normalizePhone = value => clean(value).replace(/\D/g, '');

export const formatOperationalTime = raw => {
  if (raw === '' || raw == null) return '';
  const input = String(raw).trim().replace(',', '.');
  if (!input) return '';
  const excelNumber = Number(input);
  if (excelNumber >= 0 && excelNumber < 1 && input.startsWith('0.')) {
    const minutes = Math.round(excelNumber * 1440) % 1440;
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }
  const normalizedInput = input.replace(/^(\d{1,2}:\d{2}):00$/, '$1');
  const matched = normalizedInput.match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (!matched) return '';
  let hours = Number(matched[1]);
  let mins = matched[2] ? Number(matched[2].length === 1 ? matched[2] + '0' : matched[2]) : 0;
  if (hours === 24 && mins === 0) hours = 0;
  if (hours < 0 || hours > 23 || mins > 59) return '';
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
};

const sheetRows = (book, name) => {
  const sheetName = (book.SheetNames || []).find(value => norm(value) === norm(name));
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(book.Sheets[sheetName], {
    header: 1, defval: '', raw: false, blankrows: false
  });
};

const addressLike = value => {
  const s = clean(value);
  // Direcciones expresas: calle/número, colonia/CP o ubicación descriptiva.
  // Alias como "PLAZA VALLARTA" no se geocodifican a ciegas.
  return s.length >= 12 && (/\d{3,}/.test(s) || /\b(calle|av\.?|avenida|blvd|boulevard|col\.?|colonia|calzada|carretera|privada|periferico|periférico)\b/i.test(s));
};

const mergedLookup = (book) => {
  const names = new Map();
  const merge = (name, patch) => {
    const key = norm(name);
    if (!key) return;
    const prev = names.get(key) || { name: clean(name), homeAddress: '', phone: '', entradaIntermediate: '', salidaIntermediate: '', meetingLabel: '' };
    names.set(key, {
      ...prev,
      ...Object.fromEntries(Object.entries(patch).filter(([,val]) => clean(val))),
      // Conserva el domicilio y contacto ya existentes si el nuevo origen está vacío.
      name: prev.name || clean(name)
    });
  };

  const directory = sheetRows(book, 'Directorio');
  for (const row of directory.slice(1)) {
    merge(row?.[0], { homeAddress: clean(row?.[1]), phone: normalizePhone(row?.[4]) });
  }
  const database = sheetRows(book, 'BD');
  for (const row of database.slice(1)) {
    merge(row?.[1], {
      homeAddress: clean(row?.[2]),
      phone: normalizePhone(row?.[7]),
      entradaIntermediate: clean(row?.[5]),
      salidaIntermediate: clean(row?.[6]),
      meetingLabel: clean(row?.[8])
    });
  }
  return { names, database, directory };
};

export const isOperationalWorkbook = book => {
  const names = (book?.SheetNames || []).map(norm);
  return names.includes('PROGRAMACION') || names.includes('BD') || names.includes('DIRECTORIO');
};

export const extractOperationalWorkbook = book => {
  if (!isOperationalWorkbook(book)) throw new Error('No se detectaron las pestañas Programación / BD / Directorio.');
  const { names, database, directory } = mergedLookup(book);
  const program = sheetRows(book, 'Programación');
  const headerRows = norm(program[1]?.[4]) === 'DIRECCION' || norm(program[1]?.[8]) === 'RUTA' ? 2 : 1;
  const programmed = program.slice(headerRows).map((row, index) => {
    const name = clean(row?.[2]);
    if (!name) return null;
    const reference = names.get(norm(name)) || {};
    const pickup = clean(row?.[4]);
    const dropoff = clean(row?.[6]);
    const entradaIntermediate = reference.entradaIntermediate || '';
    const salidaIntermediate = reference.salidaIntermediate || '';
    return {
      id: 'program-' + (index + headerRows + 1) + '-' + norm(name),
      source: 'Programación', sourceRow: index + headerRows + 1,
      name,
      phone: normalizePhone(row?.[14]) || reference.phone || '',
      homeAddress: reference.homeAddress || '',
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      entradaIntermediate, salidaIntermediate,
      meetingLabel: reference.meetingLabel || '',
      entradaTime: formatOperationalTime(row?.[0]),
      salidaTime: formatOperationalTime(row?.[1]),
      referenceTime: formatOperationalTime(row?.[3]),
      entradaRoute: clean(row?.[8]),
      entradaOrder: Number(row?.[9]) || 0,
      entradaDriver: clean(row?.[10]),
      salidaRoute: clean(row?.[11]),
      salidaOrder: Number(row?.[12]) || 0,
      salidaDriver: clean(row?.[13])
    };
  }).filter(Boolean);

  const entries = programmed.length ? programmed : [...names.values()].map((item, index) => ({
    id: 'directory-' + index + '-' + norm(item.name),
    source: 'BD/Directorio', sourceRow: 0,
    name: item.name, phone: item.phone || '', homeAddress: item.homeAddress || '',
    pickupAddress: '', dropoffAddress: '',
    entradaIntermediate: item.entradaIntermediate || '', salidaIntermediate: item.salidaIntermediate || '',
    meetingLabel: item.meetingLabel || '',
    entradaTime: '', salidaTime: '', referenceTime: '',
    entradaRoute: '', entradaOrder: 0, entradaDriver: '',
    salidaRoute: '', salidaOrder: 0, salidaDriver: ''
  }));

  const drivers = sheetRows(book, 'Conductores').slice(1)
    .filter(row => clean(row?.[0]) && clean(row?.[1]) && clean(row?.[2]))
    .map(row => ({ name: clean(row[0]), vehicleModel: clean(row[1]), vehiclePlate: clean(row[2]), phone: normalizePhone(row[3]) }));

  return {
    format: 'triplogix-operational',
    sources: (book.SheetNames || []).filter(name => ['PROGRAMACION', 'BD', 'DIRECTORIO', 'CONDUCTORES'].includes(norm(name))),
    rosterSource: programmed.length ? 'Programación' : 'BD/Directorio',
    entries,
    drivers,
    warnings: [
      ...(!programmed.length ? ['Programación no contiene servicios: se cargará el directorio de BD para seleccionar manualmente quién viaja. No se inventarán horarios ni rutas.'] : []),
      ...(!names.size ? ['Falta BD/Directorio. Se utilizarán solamente las direcciones explícitas de Programación.'] : []),
      ...(entries.length === 0 ? ['No se encontraron pasajeros en el libro.'] : [])
    ],
    summary: { programRows: programmed.length, databaseRows: Math.max(0, database.length - 1), directoryRows: Math.max(0, directory.length - 1), drivers: drivers.length }
  };
};

export const toPlanningRow = (entry, mode, defaultTime) => {
  const ida = mode !== 'Regreso';
  const official = (ida ? entry.entradaTime : entry.salidaTime) || formatOperationalTime(defaultTime);
  const route = ida ? entry.entradaRoute : entry.salidaRoute;
  const driver = ida ? entry.entradaDriver : entry.salidaDriver;
  const order = ida ? entry.entradaOrder : entry.salidaOrder;
  const explicit = ida ? entry.pickupAddress : entry.dropoffAddress;
  const intermediate = ida ? entry.entradaIntermediate : entry.salidaIntermediate;
  const sourceAddress = clean(explicit) || (addressLike(intermediate) ? intermediate : '');
  const homeAddress = clean(entry.homeAddress);
  return {
    name: entry.name,
    time: official,
    referenceTime: entry.referenceTime,
    address: homeAddress || sourceAddress,
    meetingPoint: sourceAddress ? (entry.meetingLabel || sourceAddress) : '',
    meetingPointAddress: sourceAddress,
    phone: entry.phone,
    driver: driver,
    route: route,
    order: order,
    sourceAddressAuthoritative: Boolean(sourceAddress),
    sourceUsesIntermediate: Boolean(sourceAddress && intermediate && sourceAddress === intermediate)
  };
};

export const parseOperationalClipboard = input => {
  const value = String(input || '').replace(/^\uFEFF/, '');
  if (!value.trim()) throw new Error('Pega datos de Google Sheets con los encabezados incluidos.');
  // CSV/TSV con comillas y saltos de línea dentro de celdas (formato de copiar desde Sheets).
  const separator = value.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      if (quoted && value[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && ch === separator) { row.push(cell); cell = ''; }
    else if (!quoted && (ch === '\r' || ch === '\n')) {
      row.push(cell); cell = '';
      if (row.some(v => clean(v))) rows.push(row);
      row = [];
      if (ch === '\r' && value[i + 1] === '\n') i += 1;
    } else cell += ch;
  }
  row.push(cell); if (row.some(v => clean(v))) rows.push(row);
  if (!rows.length) throw new Error('No se encontraron filas.');
  const headings = (rows[0] || []).map(norm);
  let type = '';
  if (headings.includes('HORA ENTRADA') && headings.includes('NOMBRE')) type = 'Programación';
  else if (headings.includes('NOMBRES') && headings.includes('DIRECCION')) type = 'BD';
  else if (headings.includes('NOMBRECOMPLETO') && headings.includes('DOMICILIO')) type = 'Directorio';
  // Algunas personas copian únicamente las filas del día (sin las dos filas
  // de encabezados de Programación). Reconocemos esa estructura SOLO cuando
  // conserva las posiciones A:O y hay nombre + horario + domicilio reconocibles.
  const first = rows[0] || [];
  const looksLikeProgramData = !type && first.length >= 11 &&
    clean(first[2]).length >= 6 &&
    /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clean(first[2])) &&
    Boolean(formatOperationalTime(first[0]) || formatOperationalTime(first[1])) &&
    Boolean(clean(first[4]) || clean(first[6]));
  if (looksLikeProgramData) type = 'Programación';
  if (!type) return null;

  const workbook = XLSX.utils.book_new();
  const inputRows = looksLikeProgramData ? [
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','HORA PASO','PUNTO DE RECOGIDA','','PUNTO DE DESCARGUE','','ENTRADA','','','SALIDA','','','TELEFONO USUARIO'],
    ['','','','','DIRECCIÓN','','DIRECCIÓN','','RUTA','PUESTO','COND','RUTA','PUESTO','COND',''],
    ...rows
  ] : rows;
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(inputRows), type);
  const extracted = extractOperationalWorkbook(workbook);
  if (looksLikeProgramData) {
    extracted.warnings.unshift('Se detectaron filas de Programación sin encabezados usando sus columnas A:O. Comprueba nombres, direcciones y horas antes de confirmar.');
  }
  return extracted;
};
