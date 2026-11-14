import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentity, groupScheduleForMode, addressFromClientCatalog } from '../src/triplogixScheduleReview.js';
import * as XLSX from 'xlsx';
import { extractOperationalWorkbook, toPlanningRow } from '../src/triplogixWorkbook.js';

const passenger = (id, name, entradaTime, salidaTime, extra = {}) => ({
  id, name, entradaTime, salidaTime, entradaRoute: '', salidaRoute: '', ...extra
});

test('no mezcla entradas y salidas al elegir el sentido', () => {
  const entries = [
    passenger('a','Persona Uno','06:00',''),
    passenger('b','Persona Dos','','17:00'),
    passenger('c','Persona Tres','07:00','19:00')
  ];
  const entrada = groupScheduleForMode(entries,'Ida','Programación');
  const salida = groupScheduleForMode(entries,'Regreso','Programación');
  assert.deepEqual(entrada.rows.map(p => p.name), ['Persona Uno','Persona Tres']);
  assert.deepEqual(salida.rows.map(p => p.name), ['Persona Dos','Persona Tres']);
  assert.equal(entrada.otherModeExcluded,1);
  assert.equal(salida.otherModeExcluded,1);
});

test('consolida sólo el mismo servicio exacto y conserva el registro más completo', () => {
  const entries = [
    passenger('a','Persona Uno','06:00','', { entradaRoute:'A',entradaOrder:1,entradaDriver:'Operador Uno' }),
    passenger('b','Persona Uno','06:00','', { entradaRoute:'A',entradaOrder:1,entradaDriver:'Operador Uno',homeAddress:'Calle Central 123' })
  ];
  const result=groupScheduleForMode(entries,'Ida','Programación');
  assert.equal(result.rows.length,1);
  assert.equal(result.exactDuplicates,1);
  assert.equal(result.rows[0].id,'b');
  assert.equal(result.conflictingNames.size,0);
});

test('dos servicios del mismo nombre con horarios distintos requieren elegir uno', () => {
  const entries=[
    passenger('a','María Gómez','06:00','', {entradaRoute:'R1'}),
    passenger('b','MARIA  GOMEZ','08:00','', {entradaRoute:'R2'})
  ];
  const result=groupScheduleForMode(entries,'Ida','Programación');
  assert.equal(result.rows.length,2);
  assert.equal(result.selected.length,1);
  assert.equal(result.conflictingNames.size,1);
  assert.equal(normalizeIdentity(' MARÍA  GÓMEZ '),normalizeIdentity('maria gomez'));
});

test('puede completar domicilio de cliente guardado sin usar geocodificación imaginaria', () => {
  const client={users:[{name:'Persona Uno',domicilio:'Calle Esmeralda 1234'}],locations:[]};
  assert.equal(addressFromClientCatalog(client,'PERSONA UNO'),'Calle Esmeralda 1234');
  assert.equal(addressFromClientCatalog(client,'No Existe'),'');
  assert.equal(addressFromClientCatalog({locations:[{assignedTo:'Persona Uno',address:'Av. Dorada 400'}]},'Persona Uno'),'Av. Dorada 400');
});

test('la plantilla con entrada y salida en filas separadas conserva los modos sin mezclar', () => {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['HORA ENTRADA','HORA SALIDA','NOMBRE','','PUNTO RECOGIDA','','PUNTO ENTREGA','','RUTA'],
    ['','','','','DIRECCIÓN','','DIRECCIÓN','','RUTA'],
    ['06:00','','Persona Uno','','Calle 1234 Chihuahua','','','','R1'],
    ['','17:00','Persona Dos','','','','Calle 5678 Chihuahua','','R2']
  ]),'Programación');
  const parsed=extractOperationalWorkbook(wb);
  assert.equal(groupScheduleForMode(parsed.entries,'Ida',parsed.rosterSource).rows.length,1);
  assert.equal(groupScheduleForMode(parsed.entries,'Regreso',parsed.rosterSource).rows.length,1);
  const exit = groupScheduleForMode(parsed.entries,'Regreso',parsed.rosterSource).rows[0];
  assert.equal(toPlanningRow(exit,'Regreso','').time,'17:00');
});
