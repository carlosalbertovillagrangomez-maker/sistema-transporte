import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { isOperationalWorkbook, extractOperationalWorkbook,parseOperationalClipboard,toPlanningRow } from '../src/triplogixWorkbook.js';
import { groupScheduleForMode } from '../src/triplogixScheduleReview.js';

const make = (name,rows,extras = {}) => {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  for(const [tab,cells] of Object.entries(extras)){
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cells),tab);
  }
  return wb;
};

test('Lunes 16 de noviembre: cinco columnas de hora, nombre y conductor para cada sentido',()=>{
  const book=make('Lunes 16 de Noviembre',[
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','CONDUCTOR ELEGIDO PARA LAS ENTRADAS','CONDUCTOR PARA SU SALIDA'],
    ['05:30','18:15','Ana Prueba','Chofer Entrada','Chofer Regreso'],
    ['','21:30','Luis Prueba','','Chofer Noche']
  ],{'BD':[
    ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO'],
    [1,'Ana Prueba','Calle 101, Chihuahua','','','','','6141112222']
  ]});
  assert.equal(isOperationalWorkbook(book),true);
  const imported=extractOperationalWorkbook(book);
  assert.equal(imported.format,'triplogix-weekly');
  assert.equal(imported.weeklyDays.length,1);
  assert.equal(imported.warnings.some(w=>w.includes('No se pudieron leer las pestañas')),false);
  assert.equal(imported.entries.length,2);
  assert.equal(imported.entries[0].entradaDriver,'Chofer Entrada');
  assert.equal(imported.entries[0].salidaDriver,'Chofer Regreso');
  assert.equal(imported.entries[1].entradaDriver,'');
  assert.equal(imported.entries[1].salidaDriver,'Chofer Noche');
  assert.equal(imported.entries[0].homeAddress,'Calle 101, Chihuahua');
  assert.equal(toPlanningRow(imported.entries[0],'Ida').driver,'Chofer Entrada');
  assert.equal(toPlanningRow(imported.entries[0],'Regreso').driver,'Chofer Regreso');
  assert.equal(imported.weeklyDays[0].date,''); // año no se inventa
});

test('formato reducido de cinco columnas con título decorativo y fila de encabezado en segundo renglón',()=>{
  const book=make('Lunes 16 de noviembre',[
    ['HOJA DE PRUEBAS · ENTRADAS Y SALIDAS'],
    ['Hora de entrada','Hora de salida','Nombre completo','Chofer para entrada','Chofer para salida'],
    ['06:00','17:00','Mariana Prueba','Conductor 1','Conductor 2'],
  ]);
  const imported=extractOperationalWorkbook(book);
  assert.equal(imported.entries.length,1);
  assert.equal(imported.entries[0].name,'Mariana Prueba');
  assert.equal(imported.entries[0].entradaDriver,'Conductor 1');
  assert.equal(imported.entries[0].salidaDriver,'Conductor 2');
  assert.equal(imported.entries[0].sourceRow,3);
});

test('columnas reducidas reordenadas y pestaña de nombre libre',()=>{
  const book=make('Hoja de pruebas',[
    ['NOMBRE COMPLETO','HORA DE SALIDA','CONDUCTOR PARA SU SALIDA','HORA DE ENTRADA','CONDUCTOR ELEGIDO PARA LAS ENTRADAS'],
    ['Ana Prueba','18:30','Chofer Sur','06:10','Chofer Norte']
  ]);
  const data=extractOperationalWorkbook(book);
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].entradaTime,'06:10');
  assert.equal(data.entries[0].salidaTime,'18:30');
  assert.equal(data.entries[0].entradaDriver,'Chofer Norte');
  assert.equal(data.entries[0].salidaDriver,'Chofer Sur');
});

test('pegar cinco columnas con encabezados o solamente registros',()=>{
  const headed='HORA ENTRADA\tHORA SALIDA\tNOMBRE\tCONDUCTOR ENTRADA\tCONDUCTOR SALIDA\n05:00\t17:00\tAna Prueba\tChofer A\tChofer B';
  const raw='05:00\t17:00\tAna Prueba\tChofer A\tChofer B';
  for(const text of [headed,raw]){
    const result=parseOperationalClipboard(text);
    assert.equal(result.entries.length,1);
    assert.equal(result.entries[0].entradaDriver,'Chofer A');
    assert.equal(result.entries[0].salidaDriver,'Chofer B');
    assert.equal(result.entries[0].pickupAddress,'');
    assert.equal(result.entries[0].homeAddress,'');
  }
});

test('cada sentido conserva un conductor diferente sin mezclar viajes',()=>{
  const book=make('Lunes 16 de Nov',[
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','CONDUCTOR ENTRADAS','CONDUCTOR SALIDAS'],
    ['06:00','','Persona Entrada','Chofer Matutino',''],
    ['', '18:00','Persona Regreso','','Chofer Vespertino']
  ]);
  const data=extractOperationalWorkbook(book);
  const ida=groupScheduleForMode(data.entries,'Ida',data.rosterSource);
  const regreso=groupScheduleForMode(data.entries,'Regreso',data.rosterSource);
  assert.deepEqual(ida.rows.map(x=>[x.name,x.entradaDriver]),[['Persona Entrada','Chofer Matutino']]);
  assert.deepEqual(regreso.rows.map(x=>[x.name,x.salidaDriver]),[['Persona Regreso','Chofer Vespertino']]);
});
