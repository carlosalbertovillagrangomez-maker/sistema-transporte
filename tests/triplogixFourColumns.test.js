import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractOperationalWorkbook, parseOperationalClipboard, toPlanningRow } from '../src/triplogixWorkbook.js';
import { groupScheduleForMode } from '../src/triplogixScheduleReview.js';
const book = () => {
  const wb = XLSX.utils.book_new();
  const append = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  append('Lunes 16 de Nov', [
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','CONDUCTOR'],
    ['05:00','','Ana Prueba','Chofer A'],
    ['05:00','','Mauricio Prueba','Chofer A'],
    ['','18:00','Luis Prueba','Chofer B']
  ]);
  append('BD', [
    ['#','Nombres','Dirección','Colonia','CP','INTERMEDIO ENTRADA','INTERMEDIO SALIDA','TELEFONO'],
    ['1','Ana Prueba','Calle 100, Chihuahua','','','','','6141234567'],
    ['2','Mauricio Prueba','Calle 200, Chihuahua','','','','','6141234568'],
    ['3','Luis Prueba','Calle 300, Chihuahua','','','','','6141234569']
  ]);
  append('Conductores', [
    ['Nombre','Vehículo','Placas','Celular'],
    ['Chofer A','Van','ABC123','6141234001'],
    ['Chofer B','Van','ABC124','6141234002']
  ]);
  return wb;
};
test('A:D programa entradas y salidas sin ruta, hora de paso o dirección explícita', () => {
  const data = extractOperationalWorkbook(book());
  assert.equal(data.format, 'triplogix-weekly');
  assert.equal(data.weeklyDays[0].entries.length,3);
  const [ana,mauricio,luis] = data.entries;
  assert.equal(ana.entradaTime,'05:00');
  assert.equal(ana.entradaDriver,'Chofer A');
  assert.equal(ana.salidaDriver,'Chofer A');
  assert.equal(ana.entradaRoute,'');
  assert.equal(ana.referenceTime,'');
  assert.equal(ana.homeAddress,'Calle 100, Chihuahua');
  assert.equal(ana.phone,'6141234567');
  assert.equal(mauricio.entradaDriver,'Chofer A');
  assert.equal(luis.salidaTime,'18:00');
  assert.equal(toPlanningRow(ana,'Ida').driver,'Chofer A');
  assert.equal(toPlanningRow(luis,'Regreso').time,'18:00');
  assert.equal(data.drivers[0].phone,'6141234001');
});
test('no mezcla entradas con salidas y conserva una fila por usuario', () => {
  const data=extractOperationalWorkbook(book());
  const ida=groupScheduleForMode(data.entries,'Ida',data.rosterSource);
  const regreso=groupScheduleForMode(data.entries,'Regreso',data.rosterSource);
  assert.deepEqual(ida.rows.map(item=>item.name),['Ana Prueba','Mauricio Prueba']);
  assert.deepEqual(regreso.rows.map(item=>item.name),['Luis Prueba']);
});
test('pegado de A:D con encabezados y sin encabezados, sin generar dirección inventada', () => {
  const withHeader='HORA ENTRADA\tHORA SALIDA\tNOMBRE\tCONDUCTOR\n05:00\t\tAna Prueba\tChofer A';
  const withoutHeader='05:00\t\tAna Prueba\tChofer A';
  for(const text of [withHeader,withoutHeader]){
    const extracted=parseOperationalClipboard(text);
    assert.equal(extracted.entries.length,1);
    assert.equal(extracted.entries[0].entradaDriver,'Chofer A');
    assert.equal(extracted.entries[0].pickupAddress,'');
    assert.equal(extracted.entries[0].entradaRoute,'');
  }
});
test('Programación de cuatro columnas también se detecta como modo reducido', () => {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','CONDUCTOR'],
    ['08:00','','Ana Prueba','Chofer A']
  ]),'Programación');
  assert.equal(extractOperationalWorkbook(wb).entries[0].entradaDriver,'Chofer A');
});
