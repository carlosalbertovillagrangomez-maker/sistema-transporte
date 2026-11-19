import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {extractOperationalWorkbook,isOperationalWorkbook} from '../src/triplogixWorkbook.js';
import {findCompactHeader} from '../src/triplogixCompactLayout.js';
import {norm} from '../src/triplogixWorkbook.js';

const bookFrom=(tabs)=>{
  const wb=XLSX.utils.book_new();
  Object.entries(tabs).forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name));
  return wb;
};
const sample=[
  ['HORA ENTRADA','HORA SALIDA','NOMBRE','',''],
  ['','','','COND','COND'],
  ['05:30','18:15','Ana Prueba','Chofer Entrada','Chofer Salida'],
  ['06:30','','Luis Prueba','Chofer Entrada','']
];

test('Lunes 16: A-C títulos primera fila y D/E COND en segunda fila se reconocen como cinco columnas',()=>{
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':sample}));
  assert.equal(data.weeklyDays.length,1);
  assert.equal(data.entries.length,2);
  assert.equal(data.entries[0].entradaTime,'05:30');
  assert.equal(data.entries[0].salidaTime,'18:15');
  assert.equal(data.entries[0].entradaDriver,'Chofer Entrada');
  assert.equal(data.entries[0].salidaDriver,'Chofer Salida');
  assert.equal(data.entries[0].sourceRow,3);
  assert.equal(data.warnings.some(w=>w.includes('No se pudieron leer')),false);
});

test('Lunes 16 con grupos superiores ENTRADA/SALIDA y COND inferiores mantiene ambos conductores',()=>{
  const rows=[
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','ENTRADA','SALIDA'],
    ['','','','COND','COND'],
    ['06:00','17:00','Persona Prueba','Chofer A','Chofer B']
  ];
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':rows}));
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].entradaDriver,'Chofer A');
  assert.equal(data.entries[0].salidaDriver,'Chofer B');
});

test('Lunes 16 cuatro columnas, COND en segundo renglón, sigue compatible',()=>{
  const rows=[['HORA ENTRADA','HORA SALIDA','NOMBRE',''],['','','','COND'],
    ['06:00','17:00','Persona Prueba','Chofer A']];
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':rows}));
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].entradaDriver,'Chofer A');
  assert.equal(data.entries[0].salidaDriver,'Chofer A');
});

test('Lunes 16 con dos COND en primera fila asigna D a entrada y E a salida',()=>{
  const rows=[['HORA ENTRADA','HORA SALIDA','NOMBRE','COND','COND'],
    ['06:00','17:00','Persona Prueba','Chofer A','Chofer B']];
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':rows}));
  assert.equal(data.entries[0].entradaDriver,'Chofer A');
  assert.equal(data.entries[0].salidaDriver,'Chofer B');
});

test('la pestaña del lunes sólo con datos A:E y sin encabezados no se descarta',()=>{
  const rows=[['06:00','17:00','Persona Uno','Chofer A','Chofer B'],
    ['07:00','','Persona Dos','Chofer C','']];
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':rows}));
  assert.equal(data.entries.length,2);
  assert.equal(data.entries[0].entradaDriver,'Chofer A');
  assert.equal(data.entries[0].salidaDriver,'Chofer B');
  assert.equal(data.entries[1].name,'Persona Dos');
});

test('el primer pasajero con valor Chofer A no se interpreta como encabezado',()=>{
  const rows=[['HORA ENTRADA','HORA SALIDA','NOMBRE','',''],
    ['06:00','17:00','Persona Uno','Chofer A','Chofer B'],
    ['07:00','18:00','Persona Dos','Chofer C','Chofer D']];
  const data=extractOperationalWorkbook(bookFrom({'Lunes 16 de Nov':rows}));
  assert.equal(data.entries.length,2);
  assert.equal(data.entries[0].name,'Persona Uno');
  assert.equal(data.entries[1].name,'Persona Dos');
});

test('libro con lunes reducido y seis días normales muestra siete días, sin advertencia de omisión',()=>{
  const dates=['Martes 17 de Nov','Miércoles 18 de Nov','Jueves 19 de Nov',
    'Viernes 20 de Nov','Sábado 21 de Nov','Domingo 22 de Nov'];
  const tabs={'Lunes 16 de Nov':sample};
  for(const day of dates){
    tabs[day]=[['HORA ENTRADA','HORA SALIDA','NOMBRE','CONDUCTOR'],
      ['06:00','','Persona '+day,'Chofer A']];
  }
  const data=extractOperationalWorkbook(bookFrom(tabs));
  assert.equal(data.weeklyDays.length,7);
  assert.equal(data.weeklyDays[0].name,'Lunes 16 de Nov');
  assert.equal(data.weeklyDays[0].entradaCount,2);
  assert.equal(data.warnings.some(w=>w.includes('No se pudieron leer')),false);
});

test('la plantilla tradicional A:Y sigue siendo ajena al detector reducido',()=>{
  const row=['HORA ENTRADA','HORA SALIDA','NOMBRE','HORA PASO',
    'PUNTO DE RECOGIDA','','','PUNTO DE DESCARGUE','','','ENTRADA','','',
    'SALIDA','','','TELEFONO USUARIO','RUTA','HORA ENTRADA','HORA SALIDA'];
  assert.equal(findCompactHeader([row],norm),null);
});

test('las instrucciones y encabezados insuficientes no fabrican servicios',()=>{
  const wb=bookFrom({'Lunes 16 de Nov':[
    ['HORA ENTRADA','HORA SALIDA','NOMBRE',''],
    ['','','',''],
    ['PENDIENTE','','','']
  ]});
  assert.equal(isOperationalWorkbook(wb),true);
  assert.throws(()=>extractOperationalWorkbook(wb),/no contiene pestañas diarias reconocibles/i);
});
