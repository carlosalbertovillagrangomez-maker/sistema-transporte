// Resolución de domicilios y puntos de encuentro de la plantilla de Chihuahua.
// Una instrucción operativa nunca es una dirección geocodificable.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

export const isMeetingInstruction = value => {
  const s = normalized(value);
  return /^(?:PROGRAMAR(?:\s+LA)?\s+RUTA\s+A(?:L)?\s+PUNTO\s+DE\s+ENCUENTRO|PUNTO\s+DE\s+ENCUENTRO|PENDIENTE\s+(?:DE\s+)?(?:DIRECCION|UBICACION)|SIN\s+DIRECCION)(?:[.! ]*)$/.test(s);
};

// Una colonia o zona sin número de calle, por ejemplo "Diego Lucero,
// 31123 Chihuahua", no define un punto de parada suficientemente preciso.
// Aceptar calles numeradas e intersecciones reconocibles; Google Maps aún
// validará la geocodificación. Jamás se generan coordenadas ficticias.
export const isUsableStreetAddress = value => {
  const raw = clean(value);
  if (!raw || isMeetingInstruction(raw)) return false;
  const upper = normalized(raw);
  if (/^(?:RUTA|CHOFER|CONDUCTOR|HORARIO|NO\s+APLICA|N\/A|PENDIENTE)\b/.test(upper)) return false;
  if (raw.length < 11 || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(raw)) return false;
  const streetNumber = /\b\d{1,4}[A-Za-z]?\b/.test(raw);
  const intersection = /\b(?:AV\.?|AVENIDA|CALLE|C\.|PERIF\.?|PERIFERICO|BLVD\.?|BOULEVARD|CARRETERA)\b/i.test(upper) &&
    /\b(?:Y|ESQUINA|CRUCE)\b/i.test(upper);
  // No transformar un código postal de cinco dígitos o número de ruta
  // en una dirección por sí solo.
  return streetNumber || intersection;
};

export const chooseTripStop = ({primary,meetingColumn,intermediate} = {}) => {
  const main = clean(primary);
  const meet = clean(meetingColumn);
  const bd = clean(intermediate);
  const isInstruction = isMeetingInstruction(main);
  if (isUsableStreetAddress(main)) {
    return {address:main,source:'direccion',requiresMeetingPoint:false,usesIntermediate:false};
  }
  if (isUsableStreetAddress(meet)) {
    return {address:meet,source:'punto_de_encuentro_sheet',requiresMeetingPoint:false,usesIntermediate:false};
  }
  if (isUsableStreetAddress(bd)) {
    return {address:bd,source:'punto_intermedio_bd',requiresMeetingPoint:false,usesIntermediate:true};
  }
  // Si E/H contiene un lugar o instrucción sin dirección precisa,
  // NO asumir que el punto de encuentro es el domicilio del pasajero.
  const expectsMeeting = isInstruction || Boolean(main) || Boolean(meet);
  return {address:'',source:expectsMeeting?'punto_de_encuentro_pendiente':'sin_direccion',
    requiresMeetingPoint:expectsMeeting,usesIntermediate:false,
    meetingLabel:!isUsableStreetAddress(meet)&&!isMeetingInstruction(meet)?meet:''};
};
