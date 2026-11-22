import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEK_DAYS,emptyWeeklySchedule,normalizeWeeklySchedule,weekdayForDate,validCoords,
  generalSites,dailyCorporateRoster,corporateGroupsForDay,estimateFuel,corporateSpreadsheetRows
} from '../src/triplogixCorporateSchedule.js';

const office={alias:'Sede',assignedTo:'General',address:'Calle Empresarial, Chihuahua',lat:28.64,lon:-106.06};
const employee=(i,day='lunes',time='08:00',sout='17:00')=>{
  const weekly=emptyWeeklySchedule();
  weekly[day]={active:true,entrada:time,salida:sout};
  return {name:'Empleado '+i,phone:'614000000'+i,role:'Empleado',
    address:'Domicilio '+i+', Chihuahua',lat:28.62+i*0.002,lon:-106.02+i*0.003,
    weeklySchedule:weekly};
};
const company=(users,sites=[office])=>({name:'Empresa A',type:'Empresa',locations:sites,users});

test('la semana contiene siete días con identificadores estables',()=>{
  assert.equal(WEEK_DAYS.length,7);
  assert.deepEqual(WEEK_DAYS.map(d=>d.key),['lunes','martes','miercoles','jueves','viernes','sabado','domingo']);
  assert.equal(weekdayForDate('2026-11-23').key,'lunes');
  assert.equal(weekdayForDate('2026-11-22').key,'domingo');
  assert.equal(weekdayForDate('2026-11-21').key,'sabado');
  assert.equal(weekdayForDate('2026-02-30'),null);
});
test('nunca asume que un empleado heredado trabaja toda la semana',()=>{
  const roster=dailyCorporateRoster(company([{name:'Persona sin turno',entrada:'08:00',salida:'17:00'}]),'2026-11-23','Ida');
  assert.equal(roster.participants.length,0);
  assert.equal(roster.inactive.length,1);
  assert.equal(roster.day.name,'Lunes');
});
test('un día no marcado nunca produce viajes ni inventa horarios',()=>{
  const data=dailyCorporateRoster(company([employee(1,'lunes')]),'2026-11-24','Ida');
  assert.equal(data.participants.length,0);
});
test('entrada y salida toman sus horarios independientes y domicilio de la ficha',()=>{
  const data=company([employee(1,'lunes','06:00','19:30')]);
  assert.equal(dailyCorporateRoster(data,'2026-11-23','Ida').participants[0].timeKey,'06:00');
  assert.equal(dailyCorporateRoster(data,'2026-11-23','Regreso').participants[0].timeKey,'19:30');
  assert.equal(dailyCorporateRoster(data,'2026-11-23','Ida').participants[0].address,'Domicilio 1, Chihuahua');
});
test('los domicilios de favoritos particulares se priorizan sin usar sede como casa',()=>{
  const data=company([employee(1)],[
    office,{assignedTo:'Empleado 1',alias:'Casa',address:'Calle Confirmada, Chihuahua',lat:28.68,lon:-106.09}
  ]);
  assert.equal(dailyCorporateRoster(data,'2026-11-23','Ida').participants[0].address,'Calle Confirmada, Chihuahua');
  assert.equal(generalSites(data).length,1);
});
test('no planifica personas con coordenadas faltantes ni omite silenciosamente',()=>{
  const u=employee(1);u.lon=null;u.lat=null;
  const data=dailyCorporateRoster(company([u]),'2026-11-23','Ida');
  assert.equal(data.participants.length,0);
  assert.equal(data.missing.length,1);
  assert.match(data.missing[0].reason,/coordenadas/);
  assert.equal(validCoords({lat:null,lon:null}),false);
});
test('11 pasajeros del mismo horario generan 3 grupos, todos de hasta 4',()=>{
  const data=dailyCorporateRoster(company(Array.from({length:11},(_,i)=>employee(i+1))),'2026-11-23','Ida');
  const groups=corporateGroupsForDay(data.participants,office,{mode:'Ida'});
  assert.deepEqual(groups.map(g=>g.employees.length),[4,4,3]);
  assert.equal(groups.flatMap(g=>g.employees).length,11);
  assert.equal(new Set(groups.flatMap(g=>g.employees.map(e=>e.assignedTo))).size,11);
  assert.ok(groups.every(g=>g.driverId===''&&g.pickupMode==='home'));
});
test('horarios distintos no se mezclan y cada sentido usa su hora oficial',()=>{
  const users=[employee(1,'lunes','06:00','18:00'),employee(2,'lunes','07:00','18:00'),employee(3,'lunes','07:00','19:00')];
  const entries=dailyCorporateRoster(company(users),'2026-11-23','Ida').participants;
  const returns=dailyCorporateRoster(company(users),'2026-11-23','Regreso').participants;
  assert.deepEqual(corporateGroupsForDay(entries,office,{mode:'Ida'}).map(g=>g.timeKey),['06:00','07:00']);
  assert.deepEqual(corporateGroupsForDay(returns,office,{mode:'Regreso'}).map(g=>g.timeKey),['18:00','19:00']);
});
test('la vista Excel conserva nombres y horarios, sin kilómetros inventados',()=>{
  const data=dailyCorporateRoster(company([employee(1)]),'2026-11-23','Ida');
  const groups=corporateGroupsForDay(data.participants,office,{mode:'Ida'});
  const rows=corporateSpreadsheetRows(groups,'Ida');
  assert.equal(rows.length,1);
  assert.equal(rows[0].Nombre,'Empleado 1');
  assert.equal(rows[0].KmConfirmados,'');
  assert.equal(rows[0].Conductor,'PENDIENTE');
  assert.equal(rows[0].Sentido,'ENTRADA');
});
test('estimación gasolina depende de kilómetros verificados y rendimiento explícito',()=>{
  assert.equal(estimateFuel(null,'',''),null);
  assert.equal(estimateFuel(30,0,24),null);
  const result=estimateFuel(30,10,24);
  assert.equal(result.litres,3);
  assert.equal(result.cost,72);
});
test('horarios nuevos comienzan desactivados y se normalizan con límites',()=>{
  const blank=emptyWeeklySchedule();
  assert.ok(WEEK_DAYS.every(d=>blank[d.key].active===false));
  const normalized=normalizeWeeklySchedule({lunes:{active:true,entrada:'50:00',salida:'18:30'}});
  assert.equal(normalized.lunes.active,true);
  assert.equal(normalized.lunes.entrada,'08:00');
  assert.equal(normalized.lunes.salida,'18:30');
});
