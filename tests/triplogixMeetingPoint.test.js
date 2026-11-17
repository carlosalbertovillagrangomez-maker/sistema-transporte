import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {chooseTripStop,isMeetingInstruction,isUsableStreetAddress} from '../src/triplogixMeetingPoint.js';
import {extractOperationalWorkbook,toPlanningRow} from '../src/triplogixWorkbook.js';

const INSTRUCTION='PROGRAMAR RUTA A PUNTO DE ENCUENTRO';
const header=['HORA ENTRADA','HORA SALIDA','NOMBRE','HORA PASO','PUNTO DE RECOGIDA','','','PUNTO DE DESCARGUE','','','ENTRADA','','','SALIDA','','','TELEFONO USUARIO'];
const secondary=['','','','','DIRECCIÓN','PUNTO DE ENCUENTRO','COLONIA','DIRECCIÓN','PUNTO DE ENCUENTRO','COLONIA','RUTA','PUESTO','COND','RUTA','PUESTO','COND'];
const add=(workbook,name,rows)=>XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);
const book=(day,entries,sub=secondary)=>{
 const wb=XLSX.utils.book_new();
 add(wb,day,[header,sub,...entries]);
 return wb;
};
const row=({entrada='',salida='',pickup='',pointIn='',dropoff='',pointOut='',routeIn='',routeOut=''}={})=>[
 entrada,salida,'Pasajero Ficticio','5.15',pickup,pointIn,'',
 dropoff,pointOut,'',routeIn,1,'Operador A',routeOut,1,'Operador B','6140000000'
];

test('no se interpreta "PROGRAMAR RUTA A PUNTO DE ENCUENTRO" como dirección de Maps',()=>{
 assert.equal(isMeetingInstruction(INSTRUCTION),true);
 assert.equal(isUsableStreetAddress(INSTRUCTION),false);
 assert.equal(isUsableStreetAddress('PUNTO DE ENCUENTRO'),false);
 assert.equal(isUsableStreetAddress('Diego Lucero, 31123 Chihuahua'),false);
 const vague=chooseTripStop({primary:'Colonia Diego Lucero, Chihuahua'});
 assert.equal(vague.requiresMeetingPoint,true);
 assert.equal(vague.address,'');
 assert.equal(isUsableStreetAddress('Perif. de la Juventud 6300, Chihuahua'),true);
 assert.equal(isUsableStreetAddress('Av. Juan Escutia y Chucho Martinez'),true);
});

test('columna E con instrucción usa dirección de F en ENTRADA',()=>{
 const wb=book('Domingo 15 de Nov',[row({entrada:'12.00',pickup:INSTRUCTION,pointIn:'Av. Tecnológico 7315, Vallarta, Chihuahua',routeIn:'12'})]);
 const extracted=extractOperationalWorkbook(wb);
 const plan=toPlanningRow(extracted.entries[0],'Ida','');
 assert.equal(plan.meetingPointAddress,'Av. Tecnológico 7315, Vallarta, Chihuahua');
 assert.equal(plan.locationSource,'punto_de_encuentro_sheet');
 assert.equal(plan.sourceAddressAuthoritative,true);
 assert.equal(plan.requiresMeetingPoint,false);
 assert.ok(!plan.meetingPointAddress.includes('PROGRAMAR'));
});

test('columna H con instrucción usa I en SALIDA, conservando ruta/orden/conductor',()=>{
 const wb=book('Domingo 15 de Nov',[row({salida:'14.00',dropoff:INSTRUCTION,pointOut:'Perif. de la Juventud 6300, Chihuahua',routeOut:'13'})]);
 const extracted=extractOperationalWorkbook(wb);
 const plan=toPlanningRow(extracted.entries[0],'Regreso','');
 assert.equal(plan.meetingPointAddress,'Perif. de la Juventud 6300, Chihuahua');
 assert.equal(plan.locationSource,'punto_de_encuentro_sheet');
 assert.equal(plan.route,'13');
 assert.equal(plan.driver,'Operador B');
 assert.equal(plan.order,1);
});

test('dirección explícita E/H tiene prioridad cuando hay otra referencia F/I',()=>{
 const stop=chooseTripStop({primary:'C. Esmeralda 2300, Chihuahua',meetingColumn:'Av. Central 6600, Chihuahua',intermediate:'Calle Centro 145, Chihuahua'});
 assert.equal(stop.address,'C. Esmeralda 2300, Chihuahua');
 assert.equal(stop.source,'direccion');
});

test('alias de punto de encuentro se resuelve desde BD solo con dirección física',()=>{
 const wb=book('Domingo 15 de Nov',[row({entrada:'15.00',pickup:INSTRUCTION,pointIn:'PLAZA CENTRAL',routeIn:'15'})]);
 add(wb,'BD',[
  ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'],
  [1,'Pasajero Ficticio','Domicilio 1000, Chihuahua','','','Periférico Juventud 6300, Chihuahua','','','PLAZA CENTRAL']
 ]);
 const extracted=extractOperationalWorkbook(wb);
 const plan=toPlanningRow(extracted.entries[0],'Ida','');
 assert.equal(plan.meetingPointAddress,'Periférico Juventud 6300, Chihuahua');
 assert.equal(plan.locationSource,'punto_intermedio_bd');
 assert.equal(plan.sourceUsesIntermediate,true);
});

test('si punto de encuentro sólo es una orden o alias, no sustituye la parada por el domicilio',()=>{
 const wb=book('Domingo 15 de Nov',[row({salida:'18.00',dropoff:INSTRUCTION,pointOut:'CHINA CITY',routeOut:'22'})]);
 add(wb,'BD',[
  ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'],
  [1,'Pasajero Ficticio','C. Su Casa 1200, Chihuahua','','','','','','CHINA CITY']
 ]);
 const extracted=extractOperationalWorkbook(wb);
 const plan=toPlanningRow(extracted.entries[0],'Regreso','');
 assert.equal(plan.address,'C. Su Casa 1200, Chihuahua');
 assert.equal(plan.meetingPointAddress,'');
 assert.equal(plan.requiresMeetingPoint,true);
 assert.equal(plan.sourceAddressAuthoritative,false);
});

test('sábado con subtítulos K2:N2 vacíos conserva siete días sin perder asignaciones',()=>{
 const wb=XLSX.utils.book_new();
 const days=['Lunes 09 de Nov','Martes 10 de Nov','Miércoles 11 de Nov','Jueves 12 de Nov','Viernes 13 de Nov','Sábado 14 de Nov','Domingo 15 de Nov'];
 for(const day of days){
   const sub=day.startsWith('Sábado') ? secondary.map((x,i)=>i>=10&&i<=15?'':x) : secondary;
   add(wb,day,[header,sub,row({entrada:'06.00',pickup:'Río Tigris 2447, Chihuahua',routeIn:'1'})]);
 }
 add(wb,'Viajes Semana',[
  ['TIPO','','DIA','FECHA'],['ENTRADA','','LUNES','09/11/2026']
 ]);
 const parsed=extractOperationalWorkbook(wb);
 assert.equal(parsed.weeklyDays.length,7);
 assert.equal(parsed.weeklyDays[5].name,'Sábado 14 de Nov');
 assert.equal(parsed.weeklyDays[5].entries[0].entradaRoute,'1');
 assert.equal(parsed.weeklyDays[5].date,'2026-11-14');
 assert.ok(parsed.warnings.some(x=>x.includes('Sábado')));
});
