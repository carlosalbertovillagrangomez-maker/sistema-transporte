// Lectura conservadora de hojas reducidas de Mauricio (4 o 5 campos).
// La antigua plantilla semanal A:Y conserva su parser de rutas K:P.
// Soporta títulos de horas en fila 1 y COND en fila 2, como ocurre al borrar
// columnas de una plantilla semanal, sin exigir reestructurar la hoja original.

const normalize = (value, norm) => norm(value)
  .replace(/[\\/|:;.,_()\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isEntranceTime = value => /^(?:(?:HORA(?:S)?|HORARIO)(?: DE| PARA| DEL)? )?(?:ENTRADA(?:S)?|INGRESO(?:S)?|LLEGADA(?:S)?)$/.test(value);
const isExitTime = value => /^(?:(?:HORA(?:S)?|HORARIO)(?: DE| PARA| DEL)? )?(?:SALIDA(?:S)?|REGRESO(?:S)?)$/.test(value);
const isPassengerName = value => /^(?:NOMBRE(?:S)?(?: COMPLETO(?:S)?| Y APELLIDO(?:S)?| DEL? (?:PASAJERO|USUARIO|EMPLEADO))?|PASAJERO(?:S)?|USUARIO(?:S)?|EMPLEADO(?:S)?)$/.test(value);
const isDriverHeading = value =>
  /\b(?:CONDUCTOR(?:ES)?|CHOFER(?:ES)?|OPERADOR(?:ES)?|UNIDAD(?:ES)?|COND)\b/.test(value) ||
  /^(?:GRUPO|GRUPO CONDUCTOR|GRUPO CHOFER)$/.test(value);

const direction = value => {
  const inTrip = /\b(?:ENTRADAS?|IDAS?|RECOGIDAS?|INGRESOS?)\b/.test(value);
  const outTrip = /\b(?:SALIDAS?|REGRESOS?|VUELTAS?)\b/.test(value);
  return inTrip && !outTrip ? 'entrada' : outTrip && !inTrip ? 'salida' : 'ambos';
};

const isLegacyHeader = titles =>
  titles.filter(Boolean).length > 9 ||
  titles.some(title => /^(?:HORA PASO|TELEFONO USUARIO)$/.test(title) ||
    /^PUNTO DE (?:RECOGIDA|DESCARGUE)/.test(title));

export const compactColumnLayout = (headers, norm) => {
  const titles = (Array.isArray(headers) ? headers : []).map(cell => normalize(cell,norm));
  if (isLegacyHeader(titles)) return null;
  const entrada=titles.findIndex(isEntranceTime);
  const salida=titles.findIndex(isExitTime);
  const name=titles.findIndex(isPassengerName);
  if ([entrada,salida,name].some(index=>index<0)) return null;
  const drivers=titles.map((title,index)=>({title,index})).filter(item=>isDriverHeading(item.title));
  if (!drivers.length) return null;
  const incoming=drivers.find(d=>direction(d.title)==='entrada')?.index ?? -1;
  const outgoing=drivers.find(d=>direction(d.title)==='salida')?.index ?? -1;
  const neutral=drivers.filter(d=>direction(d.title)==='ambos').map(d=>d.index);
  // Cuando se eliminan K,L,N,O de la plantilla anterior, M2 y P2
  // quedan como «COND» y «COND». Su posición D/E determina el sentido.
  // Nunca atribuir el mismo chofer a ambos sentidos por esta ambigüedad.
  let entradaDriver=incoming, salidaDriver=outgoing;
  if (entradaDriver<0) entradaDriver=neutral[0] ?? -1;
  if (salidaDriver<0) {
    salidaDriver=neutral.find(index=>index!==entradaDriver) ??
      (drivers.length===1 ? neutral[0] : -1) ?? -1;
  }
  if (entradaDriver<0 && salidaDriver<0) return null;
  return {name,entrada,salida,entradaDriver,salidaDriver};
};

const combineTwoRows = (first,second,norm) => {
  const len=Math.max(first?.length||0,second?.length||0);
  return Array.from({length:len},(_,i)=>{
    const top=normalize(first?.[i],norm),bottom=normalize(second?.[i],norm);
    // Un grupo superior «ENTRADA»/«SALIDA» NO debe leerse como
    // horario si la celda inferior dice «COND»: describe al conductor.
    if (isDriverHeading(bottom) &&
        !(isEntranceTime(top) && /^HORA\b/.test(top)) &&
        !(isExitTime(top) && /^HORA\b/.test(top))) {
      const grouped = direction(top);
      return grouped==='ambos' ? bottom : top+' '+bottom;
    }
    if (isEntranceTime(top)||isExitTime(top)||isPassengerName(top)) return top;
    if (isDriverHeading(top)) {
      const grouped = direction(bottom);
      return grouped==='ambos' ? top : top+' '+bottom;
    }
    return top||bottom;
  });
};

const resemblesTime = value => {
  const text=String(value??'').trim();
  return /^(?:[01]?\d|2[0-3])(?::[0-5]\d|[.][0-5]?\d)?$/.test(text) ||
    /^0[.,]\d{1,4}$/.test(text);
};
const resemblesName = value => {
  const text=String(value??'').trim();
  return text.length>=4 && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(text) &&
    !/^(?:NOMBRE|PASAJERO|ENTRADA|SALIDA|CONDUCTOR|CHOFER|HORARIO)\b/i.test(text);
};

// Último recurso, sólo si hay al menos dos pasajeros reales y las cinco
// columnas operativas ocupan las posiciones A:E. No adivina direcciones.
const inferHeaderless = (rows,norm) => {
  const data=(rows||[]).slice(0,25);
  if (data.some(row=>isLegacyHeader((row||[]).map(cell=>normalize(cell,norm)))))return null;
  const examples=[];
  let first=-1;
  for(let i=0;i<data.length;i++){
    const row=data[i]||[];
    const populated=row.map((value,index)=>String(value??'').trim()?index:-1).filter(index=>index>=0);
    if (populated.some(index=>index>4)) return null;
    if (populated.length<2)continue;
    if (resemblesName(row[2])&&(resemblesTime(row[0])||resemblesTime(row[1]))) {
      if(first<0)first=i;
      examples.push(row);
    }
  }
  if (examples.length<2) return null;
  const fifthColumn=examples.some(row=>String(row?.[4]??'').trim());
  return {name:2,entrada:0,salida:1,entradaDriver:3,
    salidaDriver:fifthColumn?4:3,headerRows:first,inferredWithoutHeadings:true};
};

export const findCompactHeader = (rows,norm) => {
  for (let i=0;i<Math.min(10,(rows||[]).length);i++){
    const direct=compactColumnLayout(rows[i],norm);
    if (direct) return {...direct,headerRows:i+1};
    if(i+1<(rows||[]).length) {
      const nextRow=rows[i+1]||[];
      // Un valor «Chofer A» en la primera fila de pasajeros no es
      // un encabezado «CHOFER»: no descartamos a ese pasajero.
      if (resemblesName(nextRow[2]) &&
          (resemblesTime(nextRow[0])||resemblesTime(nextRow[1]))) continue;
      const combined=compactColumnLayout(combineTwoRows(rows[i],nextRow,norm),norm);
      if(combined) return {...combined,headerRows:i+2,splitHeader:true};
    }
  }
  return inferHeaderless(rows,norm);
};
