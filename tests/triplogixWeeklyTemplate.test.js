import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { isOperationalWorkbook,extractOperationalWorkbook,parseOperationalClipboard,toPlanningRow } from '../src/triplogixWorkbook.js';
import { groupScheduleForMode } from '../src/triplogixScheduleReview.js';

const head=['HORA ENTRADA','HORA SALIDA','NOMBRE','HORA PASO','PUNTO DE RECOGIDA','','','PUNTO DE DESCARGUE','','','ENTRADA','','','SALIDA','','','TELEFONO USUARIO','RUTA','HORA ENTRADA','HORA SALIDA','KM ENT','KM SAL','COND','COND'];
const sub=['','','','','DIRECCIÓN','PUNTO DE ENCUENTRO','COLONIA','DIRECCIÓN','PUNTO DE ENCUENTRO','COLONIA','RUTA','PUESTO','COND','RUTA','PUESTO','COND','','','','','','','ENT','SAL'];
const person=(name,entrada,salida,entRoute,salRoute)=>[
 entrada,salida,name,'5.15','Calle Norte 1000, Chihuahua','','Centro',
 'Calle Sur 2300, Chihuahua','','Centro',entRoute,1,'Chofer A',salRoute,1,'Chofer B',
 '6140000000','','6.00','17.00','','','',''
];
const add=(book,name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
const weekly=()=>{
 const wb=XLSX.utils.book_new();
 add(wb,'Panel Logístico',[['📅 Día a procesar:','Domingo 15 de Nov']]);
 const names=['Lunes 09 de Nov','Martes 10 de Nov','Miércoles 11 de Nov','Jueves 12 de Nov','Viernes 13 de Nov','Sábado 14 de Nov','Domingo 15 de Nov'];
 names.forEach((name,i)=>add(wb,name,[head,sub,
   person('Pasajero Entrada '+i,'6.00','','R'+i,''),
   person('Pasajero Salida '+i,'','17.00','','S'+i),
   person('Pasajero Ambos '+i,'8.00','18.00','E'+i,'X'+i)
 ]));
 add(wb,'Viajes Semana',[
  ['HORA VIAJE','','DIA','FECHA'],['ENTRADA','SALIDA','LUNES','09/11/2026']
 ]);
 add(wb,'BD',[
  ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'],
  [1,'Pasajero Entrada 6','Calle BD 4200, Chihuahua','','','','','6140000000','']
 ]);
 add(wb,'Directorio',[['NombreCompleto','Domicilio','Colonia','CodigoPostal','Telefono']]);
 add(wb,'Conductores',[['Nombre del Conductor','Vehículo','Placas','Celular'],['Chofer A','Van Blanca','TEST123','6140000009']]);
 return wb;
};

test('reconoce siete pestañas semanales desde Panel Logístico y el año de Viajes Semana',()=>{
 const wb=weekly();
 assert.equal(isOperationalWorkbook(wb),true);
 const extracted=extractOperationalWorkbook(wb);
 assert.equal(extracted.weeklyDays.length,7);
 assert.equal(extracted.defaultDayIndex,6);
 assert.equal(extracted.weeklyDays[0].date,'2026-11-09');
 assert.equal(extracted.weeklyDays[6].date,'2026-11-15');
 assert.equal(extracted.entries.length,3);
 assert.equal(extracted.drivers.length,1);
 assert.equal(extracted.entries[0].entradaTime,'06:00');
});

test('interpreta columnas semanales K/L/M de entrada y N/O/P de salida, H de descarga y Q de teléfono',()=>{
 const ext=extractOperationalWorkbook(weekly());
 const row=ext.entries[2];
 assert.equal(row.entradaRoute,'E6');
 assert.equal(row.salidaRoute,'X6');
 assert.equal(row.entradaDriver,'Chofer A');
 assert.equal(row.salidaDriver,'Chofer B');
 assert.equal(row.pickupAddress,'Calle Norte 1000, Chihuahua');
 assert.equal(row.dropoffAddress,'Calle Sur 2300, Chihuahua');
 assert.equal(row.phone,'6140000000');
 assert.equal(toPlanningRow(row,'Regreso','').time,'18:00');
 assert.equal(toPlanningRow(row,'Regreso','').meetingPointAddress,'Calle Sur 2300, Chihuahua');
});

test('separa entradas y salidas de la misma hoja, sólo incluye ambos cuando corresponde',()=>{
 const day=extractOperationalWorkbook(weekly()).weeklyDays[0];
 const ent=groupScheduleForMode(day.entries,'Ida','Programación');
 const sal=groupScheduleForMode(day.entries,'Regreso','Programación');
 assert.equal(ent.rows.length,2);
 assert.equal(sal.rows.length,2);
 assert.equal(ent.rows.some(x=>x.name==='Pasajero Salida 0'),false);
 assert.equal(sal.rows.some(x=>x.name==='Pasajero Entrada 0'),false);
});

test('pegar columnas A:Y desde una hoja diaria también funciona y no exige FECHA/HORA_OBJETIVO',()=>{
 const cells=[head,sub,person('Persona Turno','6.00','','2','')];
 const text=cells.map(row=>row.map(x=>String(x||'')).join('\t')).join('\n');
 const result=parseOperationalClipboard(text);
 assert.equal(result.format,'triplogix-weekly');
 assert.equal(result.weeklyDays.length,1);
 assert.equal(result.entries.length,1);
 assert.equal(result.entries[0].entradaRoute,'2');
 assert.equal(result.weeklyDays[0].date,''); // fecha manual al no conocer el año
});

test('no inventa el año si no está en resumen de la semana',()=>{
 const wb=XLSX.utils.book_new();
 add(wb,'Lunes 09 de Nov',[head,sub,person('Persona Turno','6.00','','2','')]);
 const extracted=extractOperationalWorkbook(wb);
 assert.equal(extracted.weeklyDays[0].date,'');
 assert.ok(extracted.warnings.some(w=>w.includes('año')));
});

test('ignora resumen y Panel Logístico al crear lista de pasajeros',()=>{
 const parsed=extractOperationalWorkbook(weekly());
 const ids=parsed.entries.map(x=>x.name);
 assert.equal(ids.some(x=>x.includes('Panel')),false);
 assert.equal(ids.some(x=>x.includes('Semana')),false);
});
