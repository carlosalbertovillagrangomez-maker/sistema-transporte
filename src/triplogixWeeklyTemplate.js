import { findCompactHeader } from './triplogixCompactLayout.js';

// Parser dedicado al libro semanal de operación de Chihuahua.
// No crea viajes ni toca la base de datos: sólo interpreta filas explícitas.
const WEEKDAY=/^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+(\d{1,2})\s+DE\s+([A-Z]+)/;
const MONTHS={ENE:1,ENERO:1,FEB:2,FEBRERO:2,MAR:3,MARZO:3,ABR:4,ABRIL:4,MAY:5,MAYO:5,JUN:6,JUNIO:6,JUL:7,JULIO:7,AGO:8,AGOSTO:8,SEP:9,SEPTIEMBRE:9,OCT:10,OCTUBRE:10,NOV:11,NOVIEMBRE:11,DIC:12,DICIEMBRE:12};
const asDate=(n,m,y)=>{
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(n)||!m||y<2020) return '';
  const date=new Date(Date.UTC(y,m-1,n));
  if(date.getUTCDate()!==n||date.getUTCMonth()+1!==m)return '';
  return [y,String(m).padStart(2,'0'),String(n).padStart(2,'0')].join('-');
};
const yearFromWorkbook=(book,sheetRows)=>{
  for(const name of ['Viajes Semana','Semana Definitivo']){
    const rows=sheetRows(book,name);
    const candidates=[rows[1]?.[3],rows[1]?.[24]];
    for(const raw of candidates){
      const match=String(raw||'').match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
      if(match)return Number(match[3]);
    }
  }
  return null; // pedir fecha si no existe año verificable
};

const findTop=(headers,word,norm)=>{
  return headers.findIndex(cell=>norm(cell)===word);
};
export const hasWeeklyTab=(name,norm)=>WEEKDAY.test(norm(name));
const hasCompactHeader=(rows,norm)=>Boolean(findCompactHeader(rows,norm));
export const isWeeklyWorkbook=(book,sheetRows,norm)=>{
  if((book.SheetNames||[]).some(name=>hasWeeklyTab(name,norm)))return true;
  if((book.SheetNames||[]).some(name=>hasCompactHeader(sheetRows(book,name),norm)))return true;
  const program=sheetRows(book,'Programación');
  const top=program[0]||[];
  if (hasCompactHeader(program,norm)) return true;
  return norm(top[2])==='NOMBRE'&&
    norm(top[7]).includes('PUNTO DE DESCARGUE')&&
    norm(top[10])==='ENTRADA'&&norm(top[13])==='SALIDA';
};
const layoutOf=(rows,norm)=>{
  const head=rows[0]||[], lower=rows[1]||[];
  const compact=findCompactHeader(rows,norm);
  if (compact) return {
    name:compact.name,entrada:compact.entrada,salida:compact.salida,
    pickup:-1,dropoff:-1,tel:-1,paso:-1,pickupMeeting:-1,dropoffMeeting:-1,
    entradaRoute:-1,entradaOrder:-1,entradaDriver:compact.entradaDriver,
    salidaRoute:-1,salidaOrder:-1,salidaDriver:compact.salidaDriver,
    headerRows:compact.headerRows,inferredRouteHeaders:false
  };
  const name=findTop(head,'NOMBRE',norm);
  const entrada=findTop(head,'HORA ENTRADA',norm);
  const salida=findTop(head,'HORA SALIDA',norm);
  const pickup=head.findIndex(cell=>norm(cell).includes('PUNTO DE RECOGIDA'));
  const dropoff=head.findIndex(cell=>norm(cell).includes('PUNTO DE DESCARGUE'));
  const entIndex=findTop(head,'ENTRADA',norm);
  const salIndex=findTop(head,'SALIDA',norm);
  const tel=head.findIndex(cell=>norm(cell).includes('TELEFONO USUARIO'));
  const paso=head.findIndex(cell=>norm(cell).includes('HORA PASO'));
  // Los formatos reducidos ya se detectaron arriba, incluso si hay
  // cinco columnas o el encabezado está debajo de una fila decorativa.
  // Algunas semanas (por ejemplo el sábado) dejan K2 y N2 sin el texto
  // RUTA; K1=ENTRADA y N1=SALIDA mantienen los bloques K:M y N:P.
  if([name,entrada,salida,pickup,dropoff,entIndex,salIndex].some(i=>i<0))return null;
  const inSub=norm(lower[entIndex]);
  const outSub=norm(lower[salIndex]);
  if ((inSub && inSub!=='RUTA') || (outSub && outSub!=='RUTA') ||
      !(entIndex+2<salIndex && salIndex+2<tel))return null;
  return {
    name,entrada,salida,pickup,dropoff,tel,paso,
    pickupMeeting:pickup+1,dropoffMeeting:dropoff+1,
    inferredRouteHeaders:!inSub||!outSub,
    entradaRoute:entIndex,entradaOrder:entIndex+1,entradaDriver:entIndex+2,
    salidaRoute:salIndex,salidaOrder:salIndex+1,salidaDriver:salIndex+2,
    headerRows:2
  };
};
const dateFromTab=(name,year,norm)=>{
  const match=norm(name).match(WEEKDAY);
  if(!match)return '';
  const month=MONTHS[match[3]]||MONTHS[match[3].slice(0,3)]||0;
  return asDate(Number(match[2]),month,year);
};
export const extractWeeklyWorkbook=(book,{sheetRows,norm,clean,formatTime,normalizePhone,referenceByName,drivers})=>{
  const year=yearFromWorkbook(book,sheetRows);
  const dayNames=(book.SheetNames||[]).filter(name=>hasWeeklyTab(name,norm));
  if(!dayNames.length)dayNames.push(
    (book.SheetNames||[]).find(name=>hasCompactHeader(sheetRows(book,name),norm)) || 'Programación'
  );
  const weeklyDays=[];
  const ignored=[];
  const inferredDays=[];
  for(const name of dayNames){
    const rows=sheetRows(book,name);
    const layout=layoutOf(rows,norm);
    if(!layout){ignored.push(name);continue;}
    if(layout.inferredRouteHeaders)inferredDays.push(name);
    const entries=[];
    for(let ri=layout.headerRows;ri<rows.length;ri++){
      const row=rows[ri];
      const passenger=clean(row[layout.name]);
      if(!passenger)continue;
      const entradaTime=formatTime(row[layout.entrada]);
      const salidaTime=formatTime(row[layout.salida]);
      const entradaRoute=clean(row[layout.entradaRoute]);
      const salidaRoute=clean(row[layout.salidaRoute]);
      // Un nombre en la base no equivale a un servicio del día.
      if(!entradaTime&&!salidaTime&&!entradaRoute&&!salidaRoute)continue;
      const ref=referenceByName.get(norm(passenger))||{};
      entries.push({
        id:name+':'+(ri+1)+':'+norm(passenger),
        name:passenger,source:name,sourceRow:ri+1,sourceDay:name,
        homeAddress:ref.homeAddress||'',phone:normalizePhone(row[layout.tel])||ref.phone||'',
        pickupAddress:clean(row[layout.pickup]),dropoffAddress:clean(row[layout.dropoff]),
        pickupMeetingAddress:clean(row[layout.pickupMeeting]),
        dropoffMeetingAddress:clean(row[layout.dropoffMeeting]),
        entradaIntermediate:ref.entradaIntermediate||'',
        salidaIntermediate:ref.salidaIntermediate||'',
        meetingLabel:ref.meetingLabel||'',
        entradaTime,salidaTime,referenceTime:formatTime(row[layout.paso]),
        entradaRoute,salidaRoute,
        entradaOrder:Number(row[layout.entradaOrder])||0,
        salidaOrder:Number(row[layout.salidaOrder])||0,
        entradaDriver:clean(row[layout.entradaDriver]),
        salidaDriver:clean(row[layout.salidaDriver])
      });
    }
    weeklyDays.push({name,date:dateFromTab(name,year,norm),entries,
      entradaCount:entries.filter(x=>x.entradaTime||x.entradaRoute).length,
      salidaCount:entries.filter(x=>x.salidaTime||x.salidaRoute).length});
  }
  if(!weeklyDays.length)throw new Error('La semana no contiene pestañas diarias reconocibles. Revisa los títulos de Hora entrada, Hora salida, Nombre y Conductor de entrada/salida.');
  const panel=sheetRows(book,'Panel Logístico')[0]||[];
  const selectedName=norm(panel[1]||'');
  const defaultIndex=Math.max(0,weeklyDays.findIndex(day=>norm(day.name)===selectedName));
  const activeDay=weeklyDays[defaultIndex];
  return {
    format:'triplogix-weekly',
    sources:[...weeklyDays.map(day=>day.name),...(book.SheetNames||[]).filter(name=>['BD','DIRECTORIO','CONDUCTORES'].includes(norm(name)))],
    rosterSource:'Programación',
    weeklyDays,defaultDayIndex:defaultIndex,
    entries:activeDay.entries,
    drivers,
    warnings:[
      ...(!year?['No se encontró el año en las hojas de resumen. Selecciona la fecha real del día antes de generar rutas.']:[]),
      ...(ignored.length?['No se pudieron leer las pestañas: '+ignored.join(', ')]:[]),
      ...(inferredDays.length?['Se reconocieron las columnas de rutas por sus títulos principales en '+inferredDays.join(', ')+' (encabezados RUTA secundarios vacíos).']:[]),
      'Con cuatro columnas (un conductor) o cinco (conductor para entrada y para salida), TripLogix completa direcciones desde BD/Directorio/Clientes y calcula las rutas y horas de paso.',
      'Se importaron únicamente las pestañas diarias; Panel Logístico y los informes no generan servicios.'
    ],
    summary:{programRows:activeDay.entries.length,weeklyRows:weeklyDays.reduce((sum,day)=>sum+day.entries.length,0),days:weeklyDays.length,drivers:drivers.length}
  };
};
