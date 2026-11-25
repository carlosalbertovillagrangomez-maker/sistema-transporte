// Planeación corporativa semanal — funciones puras y compatibles con Clientes.
// La asistencia exige un día explícitamente marcado: no se inventan turnos.
// Los grupos son propuestas geográficas; Google Directions confirma kilómetros,
// minutos y orden vial antes de que sea posible despachar.
export const WEEK_DAYS = Object.freeze([
  {key:'lunes',label:'Lun',name:'Lunes'},
  {key:'martes',label:'Mar',name:'Martes'},
  {key:'miercoles',label:'Mié',name:'Miércoles'},
  {key:'jueves',label:'Jue',name:'Jueves'},
  {key:'viernes',label:'Vie',name:'Viernes'},
  {key:'sabado',label:'Sáb',name:'Sábado'},
  {key:'domingo',label:'Dom',name:'Domingo'}
]);

const isTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
const string = v => String(v??'').trim();
const normalized = value => string(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('es');

// La ubicación de ENTRADA y SALIDA se elige por persona y por día.
// 'home' conserva el domicilio; 'meeting' usa un punto del catálogo de empresa.
export const normalizeShiftLocation = source => {
  const raw=source&&typeof source==='object'?source:{};
  return raw.type==='meeting'
    ? {type:'meeting',meetingPointId:string(raw.meetingPointId)}
    : {type:'home',meetingPointId:''};
};
export const emptyWeeklySchedule = () => Object.fromEntries(WEEK_DAYS.map(day => [
  day.key,{active:false,entrada:'08:00',salida:'17:00',
    entradaLocation:{type:'home',meetingPointId:''},
    salidaLocation:{type:'home',meetingPointId:''}}
]));

export const normalizeWeeklySchedule = source => {
  const input=source&&typeof source==='object'?source:{};
  return Object.fromEntries(WEEK_DAYS.map(day => {
    const item=input[day.key]||{};
    return [day.key,{
      active:item.active===true,
      entrada:isTime(item.entrada)?item.entrada:'08:00',
      salida:isTime(item.salida)?item.salida:'17:00',
      entradaLocation:normalizeShiftLocation(item.entradaLocation),
      salidaLocation:normalizeShiftLocation(item.salidaLocation)
    }];
  }));
};

export const weekdayForDate = date => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
  const d=new Date(date+'T12:00:00');
  if(Number.isNaN(d.getTime())||d.toLocaleDateString('en-CA')==='')return null;
  const [y,m,n]=date.split('-').map(Number);
  if(d.getFullYear()!==y||d.getMonth()+1!==m||d.getDate()!==n)return null;
  return WEEK_DAYS[(d.getDay()+6)%7];
};

export const validCoords = location => {
  const a=location?.lat,b=location?.lng??location?.lon;
  if(a===null||a===undefined||a===''||b===null||b===undefined||b==='')return false;
  const lat=Number(a),lng=Number(b);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
};

export const generalSites = company => (company?.locations||[]).filter(location =>
  (!location.assignedTo||location.assignedTo==='General')&&string(location.address));

export const dailyCorporateRoster = (company,date,mode) => {
  const day=weekdayForDate(date);
  const participants=[],missing=[],inactive=[];
  if(!day)return {day:null,participants,missing,inactive};
  const isExit=mode==='Regreso';
  const users=Array.isArray(company?.users)?company.users:[];
  for (const user of users) {
    const name=string(user?.name);
    if(!name)continue;
    // Solo los empleados con horario semanal habilitado participan.
    const shift=user?.weeklySchedule?.[day.key];
    if(shift?.active!==true){inactive.push(name);continue;}
    const time=string(isExit?shift.salida:shift.entrada);
    const locations=company?.locations||[];
    const home=locations.find(loc=>
      normalized(loc.assignedTo)===normalized(name)&&string(loc.address))||
      locations.find(loc=>string(user.address)&&normalized(loc.address)===normalized(user.address));
    const homeAddress=string(home?.address||user.address||user.domicilio||user.direccion);
    const homeLat=home?.lat??user.lat??null;
    const homeLng=home?.lng??home?.lon??user.lng??user.lon??null;
    const location=normalizeShiftLocation(isExit?shift.salidaLocation:shift.entradaLocation);
    const meeting=location.type==='meeting'
      ? (company?.meetingPoints||[]).find(point=>string(point.id)===location.meetingPointId)
      : null;
    // No usar la sede empresarial ni el domicilio como sustituto silencioso
    // cuando se eligió un punto intermedio que fue borrado o es inválido.
    const pointLocation=location.type==='meeting'?meeting:{address:homeAddress,lat:homeLat,lng:homeLng};
    const address=string(pointLocation?.address);
    const point={
      assignedTo:name,address,
      lat:pointLocation?.lat??null,
      lng:pointLocation?.lng??pointLocation?.lon??null,
      lon:pointLocation?.lon??pointLocation?.lng??null,
      homeAddress,homeLat,homeLng,homeLon:homeLng,
      scheduledPickupType:location.type,
      meetingPointId:location.type==='meeting'?location.meetingPointId:'',
      meetingPointAlias:location.type==='meeting'?string(meeting?.alias):'',
      locationLabel:location.type==='meeting'?string(meeting?.alias||'Punto intermedio'):'Domicilio',
      phone:string(user.phone||user.telefono),
      whatsappOptIn:user.whatsappOptIn===true,
      entrada:string(shift.entrada),salida:string(shift.salida),
      included:true
    };
    if(!isTime(time)||!address||!validCoords(point)){
      const reason=!isTime(time)?'Horario inválido':location.type==='meeting'
        ? (!meeting?'Punto intermedio no encontrado':'Punto intermedio sin ubicación verificada')
        : (!homeAddress?'Sin domicilio':'Dirección sin coordenadas verificadas');
      missing.push({name,reason});
      continue;
    }
    participants.push({...point,timeKey:time});
  }
  return {day,participants,missing,inactive};
};

export const haversineKm = (a,b) => {
  if(!validCoords(a)||!validCoords(b))return Infinity;
  const r=Math.PI/180,dLat=(Number(b.lat)-Number(a.lat))*r;
  const dLng=(Number(b.lng??b.lon)-Number(a.lng??a.lon))*r;
  const c=Math.sin(dLat/2)**2+Math.cos(Number(a.lat)*r)*Math.cos(Number(b.lat)*r)*Math.sin(dLng/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(c)));
};

// Cada turno se agrupa en cuadrillas de hasta cuatro. Para evitar recorridos
// innecesarios primero sembramos con el hogar más alejado de la empresa y
// añadimos vecinos con menor distancia geográfica, sin mezclar horarios.
// Google Directions valida y optimiza el orden vial a continuación.
export const corporateGroupsForDay = (participants,office,{capacity=4,mode='Ida'}={}) => {
  const buckets=new Map();
  (participants||[]).forEach(p => {
    if(!isTime(p.timeKey)||!validCoords(p))return;
    if(!buckets.has(p.timeKey))buckets.set(p.timeKey,[]);
    buckets.get(p.timeKey).push(p);
  });
  const groups=[];
  [...buckets.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([timeKey,people])=>{
    const waiting=[...people].sort((a,b)=>haversineKm(b,office)-haversineKm(a,office));
    while(waiting.length){
      const employees=[waiting.shift()];
      while(employees.length<capacity&&waiting.length){
        let best=0,bestCost=Infinity;
        waiting.forEach((person,i)=>{
          const added=employees.reduce((sum,existing)=>sum+haversineKm(person,existing),0);
          const cost=added/Math.max(1,employees.length)+0.22*haversineKm(person,office);
          if(cost<bestCost){bestCost=cost;best=i;}
        });
        employees.push(waiting.splice(best,1)[0]);
      }
      groups.push({
        id:'weekly_'+groups.length+'_'+mode.toLowerCase(),
        employees,timeKey,driverId:'',driverName:'',
        pickupMode:'scheduled',
        singleMeetingPoint:{address:'',lat:null,lng:null},
        sharedMeetingPoints:[],sharedMeetingPoint:{active:false,address:'',lat:null,lng:null},
        aiImported:false,preserveAiPassTimes:false,aiRoute:'',
        routeGeometry:[],routeSegments:[],routedStopLocations:[],
        totalDistanceKm:null,totalDurationMins:null,
        generatedFromWeeklySchedule:true
      });
    }
  });
  return groups;
};

export const estimateFuel = (km,kmPerLitre,pricePerLitre) => {
  if(km===null||km===undefined||km==='')return null;
  const distance=Number(km),efficiency=Number(kmPerLitre),price=Number(pricePerLitre);
  if(!Number.isFinite(distance)||distance<0||!Number.isFinite(efficiency)||efficiency<=0||
     !Number.isFinite(price)||price<=0)return null;
  return {litres:distance/efficiency,cost:distance/efficiency*price};
};

export const corporateSpreadsheetRows = (groups,mode) => (groups||[]).flatMap((g,index)=>
  g.employees.map((p,passengerIndex)=>({
    Unidad:index+1,Sentido:mode==='Ida'?'ENTRADA':'SALIDA',
    HoraOficial:g.timeKey,Conductor:g.driverName||'PENDIENTE',
    Pasajero:passengerIndex+1,Nombre:p.assignedTo,
    Domicilio:p.homeAddress||p.address,
    TipoPunto:g.pickupMode==='meeting'?'Punto común de cuadrilla':g.pickupMode==='home'?'Casa':p.locationLabel||'Casa',
    PuntoAsignado:g.pickupMode==='meeting'?g.singleMeetingPoint?.address||'':g.pickupMode==='home'?(p.homeAddress||p.address):p.address,
    PuntoComun:g.pickupMode==='meeting'?g.singleMeetingPoint?.address||'':'',
    KmConfirmados:g.totalDistanceKm??'',MinutosConfirmados:g.totalDurationMins??''
  })));
