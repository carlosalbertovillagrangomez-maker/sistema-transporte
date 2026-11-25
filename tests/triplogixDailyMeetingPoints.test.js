import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyWeeklySchedule,normalizeWeeklySchedule,normalizeShiftLocation,
  dailyCorporateRoster,corporateGroupsForDay,corporateSpreadsheetRows
} from '../src/triplogixCorporateSchedule.js';
import {buildPassengerStopsForGroup,getGroupMeetingPoints} from '../src/triplogixPickupModes.js';

const office={alias:'Sede principal',assignedTo:'General',address:'Centro corporativo, Chihuahua',lat:28.61,lon:-106.06};
const plaza={id:'p_plaza',alias:'Plaza Vallarta',address:'Plaza Vallarta, Chihuahua',lat:28.65,lon:-106.02};
const recaudacion={id:'p_recaudacion',alias:'Recaudación',address:'Punto Recaudación, Chihuahua',lat:28.66,lon:-106.05};
const point=id=>({type:'meeting',meetingPointId:id});
const user=(name,coords={lat:28.62,lon:-106.03})=>({
  name,address:'Calle Casa '+name+', Chihuahua',...coords,phone:'6140000000',
  weeklySchedule:emptyWeeklySchedule()
});
const setup=(users,meetingPoints=[plaza,recaudacion])=>({
  type:'Empresa',name:'Prueba Transporte',locations:[office],meetingPoints,users
});

test('Mauricio: lunes 06:00 casa y martes 08:00 Plaza Vallarta, sin cambiar domicilio',()=>{
  const adrian=user('Adrián Fernando');
  adrian.weeklySchedule.lunes={...adrian.weeklySchedule.lunes,active:true,entrada:'06:00',salida:'15:00'};
  adrian.weeklySchedule.martes={...adrian.weeklySchedule.martes,active:true,entrada:'08:00',salida:'17:00',
    entradaLocation:point(plaza.id)};
  const company=setup([adrian]);
  const monday=dailyCorporateRoster(company,'2026-11-23','Ida');
  const tuesday=dailyCorporateRoster(company,'2026-11-24','Ida');
  assert.equal(monday.participants.length,1);
  assert.equal(monday.participants[0].timeKey,'06:00');
  assert.equal(monday.participants[0].address,adrian.address);
  assert.equal(monday.participants[0].scheduledPickupType,'home');
  assert.equal(tuesday.participants.length,1);
  assert.equal(tuesday.participants[0].timeKey,'08:00');
  assert.equal(tuesday.participants[0].address,plaza.address);
  assert.equal(tuesday.participants[0].meetingPointAlias,'Plaza Vallarta');
  assert.equal(tuesday.participants[0].homeAddress,adrian.address);
  assert.equal(adrian.address,'Calle Casa Adrián Fernando, Chihuahua');
});

test('martes: entrada Plaza Vallarta; salida Recaudación en hora diferente',()=>{
  const adrian=user('Adrián Fernando');
  adrian.weeklySchedule.martes={active:true,entrada:'08:00',salida:'19:00',
    entradaLocation:point(plaza.id),salidaLocation:point(recaudacion.id)};
  const company=setup([adrian]);
  const entry=dailyCorporateRoster(company,'2026-11-24','Ida').participants[0];
  const exit=dailyCorporateRoster(company,'2026-11-24','Regreso').participants[0];
  assert.equal(entry.address,plaza.address);
  assert.equal(exit.address,recaudacion.address);
  assert.equal(entry.timeKey,'08:00');
  assert.equal(exit.timeKey,'19:00');
  assert.equal(exit.meetingPointId,recaudacion.id);
});

test('no requiere domicilio para el día marcado en punto intermedio válido',()=>{
  const ana=user('Ana',{lat:null,lon:null});
  ana.address='';
  ana.weeklySchedule.martes={active:true,entrada:'08:00',salida:'17:00',
    entradaLocation:point(plaza.id),salidaLocation:point(recaudacion.id)};
  const company=setup([ana]);
  const today=dailyCorporateRoster(company,'2026-11-24','Ida');
  assert.equal(today.participants.length,1);
  assert.equal(today.missing.length,0);
  assert.equal(today.participants[0].address,plaza.address);
  const exit=dailyCorporateRoster(company,'2026-11-24','Regreso');
  assert.equal(exit.participants.length,1);
});

test('punto eliminado nunca se sustituye silenciosamente por casa ni empresa',()=>{
  const ana=user('Ana');
  ana.weeklySchedule.martes={...ana.weeklySchedule.martes,active:true,
    entradaLocation:point('p_eliminado')};
  const result=dailyCorporateRoster(setup([ana]),'2026-11-24','Ida');
  assert.equal(result.participants.length,0);
  assert.equal(result.missing.length,1);
  assert.match(result.missing[0].reason,/Punto intermedio no encontrado/);
});

test('punto sin ubicación GPS validada bloquea el trayecto afectado',()=>{
  const ana=user('Ana');
  ana.weeklySchedule.martes={...ana.weeklySchedule.martes,active:true,
    entradaLocation:point(plaza.id)};
  const result=dailyCorporateRoster(setup([ana],[{...plaza,lat:null}]),'2026-11-24','Ida');
  assert.equal(result.participants.length,0);
  assert.match(result.missing[0].reason,/sin ubicación verificada/);
});

test('casa y dos empleados del mismo punto medio generan dos paradas, sin perder pasajeros',()=>{
  const users=[user('Ana'),user('Luis'),user('María')];
  for(const [i,u] of users.entries()){
    u.weeklySchedule.martes={...u.weeklySchedule.martes,active:true,entrada:'08:00',
      entradaLocation:i===0?{type:'home',meetingPointId:''}:point(plaza.id)};
  }
  const participants=dailyCorporateRoster(setup(users),'2026-11-24','Ida').participants;
  const groups=corporateGroupsForDay(participants,office,{mode:'Ida'});
  assert.equal(groups.length,1);
  assert.equal(groups[0].pickupMode,'scheduled');
  const stops=buildPassengerStopsForGroup(groups[0]);
  assert.equal(stops.length,2);
  assert.equal(stops.flatMap(s=>s.employees).length,3);
  const shared=stops.find(s=>s.stopType==='shared_meeting');
  assert.equal(shared.employees.length,2);
  assert.equal(shared.address,plaza.address);
  assert.equal(getGroupMeetingPoints(groups[0]).length,0);
});

test('checkbox Casa de cuadrilla usa domicilio original, no punto del martes',()=>{
  const adrian=user('Adrián');
  adrian.weeklySchedule.martes={...adrian.weeklySchedule.martes,active:true,
    entradaLocation:point(plaza.id)};
  const groups=corporateGroupsForDay(
    dailyCorporateRoster(setup([adrian]),'2026-11-24','Ida').participants,office);
  assert.equal(buildPassengerStopsForGroup(groups[0])[0].address,plaza.address);
  const homeStops=buildPassengerStopsForGroup({...groups[0],pickupMode:'home'});
  assert.equal(homeStops[0].address,adrian.address);
});

test('checkbox Casa no permite inventar una dirección faltante',()=>{
  const ana=user('Ana',{lat:null,lon:null});ana.address='';
  ana.weeklySchedule.martes={...ana.weeklySchedule.martes,active:true,entradaLocation:point(plaza.id)};
  const groups=corporateGroupsForDay(dailyCorporateRoster(setup([ana]),'2026-11-24','Ida').participants,office);
  assert.equal(buildPassengerStopsForGroup(groups[0]).length,1);
  assert.equal(buildPassengerStopsForGroup({...groups[0],pickupMode:'home'}).length,0);
});

test('Excel exporta domicilio original, punto asignado y sentido',()=>{
  const ana=user('Ana');
  ana.weeklySchedule.martes={...ana.weeklySchedule.martes,active:true,entradaLocation:point(plaza.id),
    salidaLocation:point(recaudacion.id)};
  const company=setup([ana]);
  const entry=corporateGroupsForDay(dailyCorporateRoster(company,'2026-11-24','Ida').participants,office);
  const exit=corporateGroupsForDay(dailyCorporateRoster(company,'2026-11-24','Regreso').participants,office,{mode:'Regreso'});
  const a=corporateSpreadsheetRows(entry,'Ida')[0];
  const b=corporateSpreadsheetRows(exit,'Regreso')[0];
  assert.equal(a.Domicilio,ana.address);
  assert.equal(a.PuntoAsignado,plaza.address);
  assert.equal(b.PuntoAsignado,recaudacion.address);
  assert.equal(a.TipoPunto,'Plaza Vallarta');
  assert.equal(a.Sentido,'ENTRADA');
  assert.equal(b.Sentido,'SALIDA');
});

test('normalización conserva puntos y agrega casa a horarios históricos',()=>{
  const weekly=normalizeWeeklySchedule({
    lunes:{active:true,entrada:'06:00',salida:'17:00'},
    martes:{active:true,entrada:'08:00',salida:'19:00',entradaLocation:point(plaza.id)}
  });
  assert.deepEqual(weekly.lunes.entradaLocation,{type:'home',meetingPointId:''});
  assert.deepEqual(weekly.lunes.salidaLocation,{type:'home',meetingPointId:''});
  assert.deepEqual(weekly.martes.entradaLocation,point(plaza.id));
  assert.deepEqual(weekly.martes.salidaLocation,{type:'home',meetingPointId:''});
  assert.deepEqual(normalizeShiftLocation(null),{type:'home',meetingPointId:''});
  assert.equal(emptyWeeklySchedule().lunes.active,false);
});

test('no mezcla turnos de distinta hora aunque compartan el mismo punto',()=>{
  const [ana,luis]=[user('Ana'),user('Luis')];
  ana.weeklySchedule.martes={...ana.weeklySchedule.martes,active:true,entrada:'08:00',entradaLocation:point(plaza.id)};
  luis.weeklySchedule.martes={...luis.weeklySchedule.martes,active:true,entrada:'09:00',entradaLocation:point(plaza.id)};
  const people=dailyCorporateRoster(setup([ana,luis]),'2026-11-24','Ida').participants;
  const groups=corporateGroupsForDay(people,office);
  assert.deepEqual(groups.map(g=>g.timeKey),['08:00','09:00']);
  assert.equal(groups.length,2);
});
