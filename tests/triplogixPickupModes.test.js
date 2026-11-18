import test from 'node:test';
import assert from 'node:assert/strict';
import {getGroupMeetingPoints,getEmployeeMeetingPoint,buildPassengerStopsForGroup} from '../src/triplogixPickupModes.js';

const employees=[
  {assignedTo:'Ana',address:'Calle Uno 101, Chihuahua',lat:28.63,lng:-106.06},
  {assignedTo:'Luis',address:'Calle Dos 202, Chihuahua',lat:28.64,lng:-106.07}
];
const common={address:'Avenida Universidad 300, Chihuahua',lat:28.65,lng:-106.08};
test('recogida en casa crea una parada individual por pasajero',()=>{
  const group={id:'g1',pickupMode:'home',employees};
  const stops=buildPassengerStopsForGroup(group);
  assert.equal(stops.length,2);
  assert.deepEqual(stops.map(s=>s.address),employees.map(e=>e.address));
  assert.equal(getGroupMeetingPoints(group).length,0);
});
test('punto común crea una sola parada con todos los integrantes',()=>{
  const group={id:'g2',pickupMode:'meeting',employees,singleMeetingPoint:common};
  const stops=buildPassengerStopsForGroup(group);
  assert.equal(stops.length,1);
  assert.equal(stops[0].stopType,'shared_meeting');
  assert.deepEqual(stops[0].employees.map(e=>e.assignedTo),['Ana','Luis']);
  assert.equal(stops[0].address,common.address);
  assert.equal(getEmployeeMeetingPoint(group,'Ana')?.address,common.address);
});
test('punto compartido incompleto nunca se inventa ni se envía a Google',()=>{
  const group={id:'g3',pickupMode:'meeting',employees,singleMeetingPoint:{address:'PROGRAMAR RUTA A PUNTO DE ENCUENTRO',lat:28.65,lng:-106.08}};
  assert.equal(buildPassengerStopsForGroup(group).length,0);
  assert.equal(buildPassengerStopsForGroup({...group,singleMeetingPoint:{address:'',lat:null,lng:null}}).length,0);
});
test('domicilio inválido se excluye y el guardado deberá rechazar grupos incompletos',()=>{
  const group={id:'g4',pickupMode:'home',employees:[...employees,{assignedTo:'Eva',address:'',lat:null,lng:null}]};
  assert.equal(buildPassengerStopsForGroup(group).length,2);
  assert.notEqual(buildPassengerStopsForGroup(group).length,group.employees.length);
});
test('modo multipunto avanzado conserva el agrupamiento por pasajero',()=>{
  const group={id:'g5',pickupMode:'multiple',employees,sharedMeetingPoints:[{id:'m1',active:true,...common,passengerNames:['Ana']}]};
  const stops=buildPassengerStopsForGroup(group);
  assert.equal(stops.length,2);
  assert.equal(stops[0].stopType,'shared_meeting');
  assert.equal(stops[1].stopType,'individual');
  assert.equal(stops[0].employees[0].assignedTo,'Ana');
});
