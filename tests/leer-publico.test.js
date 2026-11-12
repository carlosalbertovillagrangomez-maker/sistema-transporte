import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/sheets/leer-publico.js';

const nativeFetch = globalThis.fetch;
after(() => { globalThis.fetch = nativeFetch; });

const request = (sheetId, gid='0', method='GET') => ({ method, query: { sheetId, gid } });
const response = () => ({
  headers:{}, code:200, body:null,
  setHeader(key, value){this.headers[key]=value;},
  status(value){this.code=value;return this;},
  json(value){this.body=value;return this;}
});

const id = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789';
test('rechaza identificadores inválidos sin consultar la red',async()=>{
  globalThis.fetch=async()=>{ throw Error('No debería consultar Google');};
  const res=response(); await handler(request('../../private'),res);
  assert.equal(res.code,400);
});
test('rechaza métodos que no sean GET',async()=>{
  const res=response(); await handler(request(id,'0','POST'),res);
  assert.equal(res.code,405);
});
test('lee CSV público con destino HTTPS fijo y cache deshabilitada',async()=>{
  let url='';
  globalThis.fetch=async(input,opts)=>{
    url=String(input);
    assert.equal(opts.cache,'no-store');
    return new Response('RUTA,FECHA,HORA_OBJETIVO,DIRECCION\nR1,2026-11-12,08:00,Prueba', {status:200,headers:{'content-type':'text/csv; charset=utf-8'}});
  };
  const res=response();await handler(request(id,'1234'),res);
  assert.equal(res.code,200);
  assert.match(url,/^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
  assert.ok(url.includes('gid=1234'));
  assert.match(res.body.csv,/R1,2026-11-12/);
  assert.equal(res.headers['Cache-Control'],'no-store, private');
});
test('no devuelve HTML de una hoja privada',async()=>{
  globalThis.fetch=async()=>new Response('<!doctype html><html>login</html>', {status:200,headers:{'content-type':'text/html'}});
  const res=response();await handler(request(id),res);
  assert.equal(res.code,403);
  assert.ok(!JSON.stringify(res.body).includes('login</html>'));
});
test('rechaza archivos que excedan 2 MB',async()=>{
  globalThis.fetch=async()=>new Response('a'.repeat(2_000_100), {status:200,headers:{'content-type':'text/csv'}});
  const res=response();await handler(request(id),res);
  assert.equal(res.code,413);
});
