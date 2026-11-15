import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/sheets/leer-libro.js';
const oldFetch=globalThis.fetch;
after(()=>{globalThis.fetch=oldFetch;});
const id='abcdefghiABCDEFGHIJKLMNOP1234567890';
const res=()=>({
  headers:{},code:null,payload:null,
  setHeader(key,value){this.headers[key]=value;return this;},
  status(n){this.code=n;return this;},
  json(data){this.payload=data;return this;},
  send(buffer){this.payload=buffer;return this;}
});
test('sólo acepta GET y IDs válidos',async()=>{
  globalThis.fetch=async()=>{throw Error('No debe consultar red');};
  const x=res();await handler({method:'POST',query:{sheetId:id}},x);assert.equal(x.code,405);
  const y=res();await handler({method:'GET',query:{sheetId:'../../invalido'}},y);assert.equal(y.code,400);
});
test('descarga sólo xlsx desde URL fija, sin guardar ni cachear',async()=>{
  let requested='';
  globalThis.fetch=async url=>{
    requested=String(url);
    return new Response(Buffer.from([0x50,0x4b,0x03,0x04,1,2]),{status:200,headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  };
  const x=res();await handler({method:'GET',query:{sheetId:id}},x);
  assert.equal(x.code,200);
  assert.ok(Buffer.isBuffer(x.payload));
  assert.equal(x.headers['Cache-Control'],'private, no-store');
  assert.equal(requested,'https://docs.google.com/spreadsheets/d/'+id+'/export?format=xlsx');
});
test('rechaza portal HTML y no lo devuelve a usuario',async()=>{
  globalThis.fetch=async()=>new Response('<html>Inicio de sesión</html>',{status:200,headers:{'content-type':'text/html'}});
  const x=res();await handler({method:'GET',query:{sheetId:id}},x);
  assert.equal(x.code,403);
  assert.ok(!JSON.stringify(x.payload).includes('Inicio de sesión'));
});
test('rechaza libros mayores a 8 MB sin retornar bytes',async()=>{
  globalThis.fetch=async()=>new Response(Buffer.alloc(8_000_050,1),{status:200,headers:{'content-type':'application/octet-stream'}});
  const x=res();await handler({method:'GET',query:{sheetId:id}},x);
  assert.equal(x.code,413);
});
