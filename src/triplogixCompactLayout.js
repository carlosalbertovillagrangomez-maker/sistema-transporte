// Detección de encabezados reducidos para la planificación de Mauricio.
// Admite 4 columnas (conductor común) o 5 (entrada y salida por separado),
// columnas reordenadas y filas decorativas antes de los títulos.
// No transforma instrucciones operativas en direcciones ni inventa horarios.

const normalizedHeader = (value, norm) => norm(value)
  .replace(/[\\/|:;.,_()\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isEntranceTime = value => /^(?:(?:HORA(?:S)?|HORARIO)(?: DE| PARA| DEL)? )?(?:ENTRADA(?:S)?|INGRESO(?:S)?|LLEGADA(?:S)?)$/.test(value);
const isExitTime = value => /^(?:(?:HORA(?:S)?|HORARIO)(?: DE| PARA| DEL)? )?(?:SALIDA(?:S)?|REGRESO(?:S)?)$/.test(value);
const isPassengerName = value => /^(?:NOMBRE(?:S)?(?: COMPLETO(?:S)?| Y APELLIDO(?:S)?| DEL? (?:PASAJERO|USUARIO|EMPLEADO))?|PASAJERO(?:S)?|USUARIO(?:S)?|EMPLEADO(?:S)?)$/.test(value);
const isDriverHeading = value => /\b(?:CONDUCTOR(?:ES)?|CHOFER(?:ES)?|OPERADOR(?:ES)?|UNIDAD(?:ES)?|COND)\b/.test(value) ||
  /^(?:GRUPO|GRUPO CONDUCTOR|GRUPO CHOFER)$/.test(value);
const direction = value => {
  const entrance = /\b(?:ENTRADAS?|IDAS?|RECOGIDAS?|INGRESOS?)\b/.test(value);
  const exit = /\b(?:SALIDAS?|REGRESOS?|VUELTAS?)\b/.test(value);
  return entrance && !exit ? 'entrada' : exit && !entrance ? 'salida' : 'ambos';
};

export const compactColumnLayout = (headers, norm) => {
  const titles = (Array.isArray(headers) ? headers : []).map(value => normalizedHeader(value, norm));
  // La plantilla semanal tradicional (A:Y) usa K:M/N:P para rutas y puede
  // tener títulos COND en W/X. No debe confundirse con la tabla A:D / A:E.
  if (titles.filter(Boolean).length > 9 ||
      titles.some(title => /^(?:HORA PASO|TELEFONO USUARIO)$/.test(title) ||
        /^PUNTO DE (?:RECOGIDA|DESCARGUE)/.test(title))) return null;
  const entrada = titles.findIndex(isEntranceTime);
  const salida = titles.findIndex(isExitTime);
  const name = titles.findIndex(isPassengerName);
  if ([entrada, salida, name].some(index => index < 0)) return null;
  const drivers = titles.map((title,index) => ({title,index}))
    .filter(item => isDriverHeading(item.title));
  if (!drivers.length) return null;
  const chosen = side => drivers.find(item => direction(item.title)===side)?.index ?? -1;
  const common = chosen('ambos');
  const entradaDriver = chosen('entrada') >= 0 ? chosen('entrada') : common;
  const salidaDriver = chosen('salida') >= 0 ? chosen('salida') : common;
  if (entradaDriver < 0 && salidaDriver < 0) return null;
  return {name,entrada,salida,entradaDriver,salidaDriver};
};

export const findCompactHeader = (rows,norm) => {
  for(let index=0;index<Math.min(10,(rows || []).length);index++){
    const layout=compactColumnLayout(rows[index],norm);
    if(layout) return {...layout,headerRows:index+1};
  }
  return null;
};
