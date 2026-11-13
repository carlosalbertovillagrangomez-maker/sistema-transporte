import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  extractOperationalWorkbook, isOperationalWorkbook, formatOperationalTime,
  parseOperationalClipboard, toPlanningRow
} from '../src/triplogixWorkbook.js';

const book = ({ programRows = [], bdRows = [], directoryRows = [], driverRows = [] }) => {
  const wb = XLSX.utils.book_new();
  if (programRows) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(programRows), 'Programación');
  if (bdRows) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bdRows), 'BD');
  if (directoryRows) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(directoryRows), 'Directorio');
  if (driverRows) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(driverRows), 'Conductores');
  return wb;
};
const firstHeader = ['HORA ENTRADA','HORA SALIDA','NOMBRE','HORA PASO','PUNTO DE RECOGIDA','','PUNTO DE DESCARGUE','','ENTRADA','','','SALIDA','','','TELEFONO USUARIO'];
const secondHeader = ['','','','','DIRECCIÓN','','DIRECCIÓN','','RUTA','PUESTO','COND','RUTA','PUESTO','COND',''];

const base = () => book({
  programRows: [firstHeader,secondHeader],
  bdRows: [
    ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'],
    [1,'Persona Ejemplo','Calle Prueba 1234, Chihuahua','CENTRO','31000','Av. Principal 500, Chihuahua','Av. Principal 500, Chihuahua','6140000000','PLAZA CENTRAL'],
    [2,'Persona Dos','Calle Lago 921, Chihuahua','CENTRO','31000','','','6140000001','']
  ],
  directoryRows: [
    ['NombreCompleto','Domicilio','Colonia','CodigoPostal','Telefono'],
    ['Persona Ejemplo','Calle Prueba 1234, Chihuahua','CENTRO','31000','6140000000'],
    ['Persona Dos','Calle Lago 921, Chihuahua','CENTRO','31000','6140000001']
  ],
  driverRows: [
    ['Nombre del Conductor','Vehículo','Placas','Celular'],
    ['Chofer Temporal','Nissan Versa','ABC123','6140000002']
  ]
});

test('detecta cuatro pestañas y no crea rutas de un directorio sin Programación', () => {
  const result=extractOperationalWorkbook(base());
  assert.equal(result.rosterSource,'BD/Directorio');
  assert.equal(result.entries.length,2);
  assert.equal(result.drivers.length,1);
  assert.equal(result.entries[0].entradaTime,'');
  assert.equal(result.entries[0].homeAddress,'Calle Prueba 1234, Chihuahua');
  assert.ok(result.warnings.some(x=>x.includes('no contiene servicios')));
});

test('lee rutas, conductores y horarios oficiales desde Programación con dos cabeceras',()=>{
  const wb=base();
  const sheet=wb.worksheets.get_item?.('Programación');
  // Crea otra hoja desde AOA para asegurar no depender de API mutables.
  const custom=book({
    programRows:[
      firstHeader,secondHeader,
      ['22.00','','Persona Ejemplo','21.30','Calle Recolección 145, Chihuahua','','','','R-27',2,'Chofer Temporal','','','','6140000000']
    ],
    bdRows:[
      ['#','Nombres','Dirección','','','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'],
      [1,'Persona Ejemplo','Calle Prueba 1234, Chihuahua','','','Av. Principal 500, Chihuahua','','6140000000','PLAZA CENTRAL']
    ],
    directoryRows:[['NombreCompleto','Domicilio','Colonia','CodigoPostal','Telefono']]
  });
  assert.equal(isOperationalWorkbook(custom),true);
  const parsed=extractOperationalWorkbook(custom);
  assert.equal(parsed.rosterSource,'Programación');
  assert.equal(parsed.entries.length,1);
  const e=parsed.entries[0];
  assert.equal(e.entradaTime,'22:00');
  assert.equal(e.referenceTime,'21:30');
  assert.equal(e.entradaRoute,'R-27');
  assert.equal(e.entradaOrder,2);
  assert.equal(e.entradaDriver,'Chofer Temporal');
  assert.equal(toPlanningRow(e,'Ida','').meetingPointAddress,'Calle Recolección 145, Chihuahua');
});

test('horarios especiales de plantilla 5.3/5.15/24 y serial Excel',()=>{
  assert.equal(formatOperationalTime('5.3'),'05:30');
  assert.equal(formatOperationalTime('5.15'),'05:15');
  assert.equal(formatOperationalTime('22.00'),'22:00');
  assert.equal(formatOperationalTime(24),'00:00');
  assert.equal(formatOperationalTime(0.5),'12:00');
  assert.equal(formatOperationalTime('25.00'),'');
});

test('acepta pegar directamente Programación desde Sheets con encabezado único',()=>{
  const text = firstHeader.join('\t')+'\n'
    + ['08:00','','Persona Libre','','Calle Central 1090, Chihuahua','','','','R-1',1,'Chofer X'].join('\t');
  const result=parseOperationalClipboard(text);
  assert.equal(result.rosterSource,'Programación');
  assert.equal(result.entries.length,1);
  assert.equal(result.entries[0].entradaTime,'08:00');
  assert.equal(result.entries[0].name,'Persona Libre');
});

test('acepta pegar BD con sus columnas sin inventar fechas',()=>{
  const text=['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO','PUNTO DE ENCUENTRO'].join('\t')
    +'\n'+[1,'Persona Libre','Calle 220 Chihuahua','','','','',6140000000,''].join('\t');
  const parsed=parseOperationalClipboard(text);
  assert.equal(parsed.rosterSource,'BD/Directorio');
  assert.equal(parsed.entries.length,1);
  assert.equal(parsed.entries[0].entradaTime,'');
  assert.equal(toPlanningRow(parsed.entries[0],'Ida','07:15').time,'07:15');
  assert.equal(toPlanningRow(parsed.entries[0],'Ida','').time,'');
});

test('mantiene CSV estándar fuera del lector de plantilla especial',()=>{
  const text='RUTA,FECHA,HORA_OBJETIVO,DIRECCION\nR-1,2026-11-13,08:00,Calle 100';
  assert.equal(parseOperationalClipboard(text),null);
});

test('preserva grupo y conductor para Regreso, sin inventar horas',()=>{
  const parsed=extractOperationalWorkbook(book({
    programRows:[firstHeader,secondHeader,
      ['','17.30','Persona Ejemplo','','','','Calle Entrega 4321, Chihuahua','','','','','S-1',1,'Chofer de tarde']
    ]
  }));
  const row=toPlanningRow(parsed.entries[0],'Regreso','');
  assert.equal(row.time,'17:30');
  assert.equal(row.route,'S-1');
  assert.equal(row.driver,'Chofer de tarde');
  assert.equal(row.meetingPointAddress,'Calle Entrega 4321, Chihuahua');
  assert.equal(row.sourceAddressAuthoritative,true);
});
