import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSENGER_PICKUP_BUFFER_MINS, DROPOFF_BUFFER_MINS, FINAL_DESTINATION_EARLY_MINS } from '../src/triplogixCarpoolPolicy.js';
import { bucketByTimeAndDriver } from '../src/triplogixAutomaticGroups.js';
test('espera fija de pasajeros y descenso es cero; conserva margen de llegada original', () => {
  assert.equal(PASSENGER_PICKUP_BUFFER_MINS,0);
  assert.equal(DROPOFF_BUFFER_MINS,0);
  assert.equal(FINAL_DESTINATION_EARLY_MINS,10);
});
test('la columna conductor agrupa pasajeros por hora y chofer sin mezclarlos', () => {
  const employees=[
    {entrada:'05:00',aiDriver:'Chofer A',assignedTo:'Ana'},
    {entrada:'05:00',aiDriver:'Chofer B',assignedTo:'Luis'},
    {entrada:'05:00',aiDriver:'chofer a',assignedTo:'Mauricio'},
    {entrada:'06:00',aiDriver:'Chofer A',assignedTo:'Mario'}
  ];
  const buckets=bucketByTimeAndDriver(employees,e=>e.entrada,x=>x.trim().toUpperCase());
  assert.deepEqual(buckets.map(b=>b.employees.map(e=>e.assignedTo)),[['Ana','Mauricio'],['Luis'],['Mario']]);
});
