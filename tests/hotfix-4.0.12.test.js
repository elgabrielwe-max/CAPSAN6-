import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('migración de alcance califica columnas ambiguas',async()=>{
  const source=await read('server/schema.js');
  assert.match(source,/SELECT DISTINCT inferred\.user_id,inferred\.business_unit_id FROM \(/);
  assert.doesNotMatch(source,/SELECT DISTINCT user_id,business_unit_id FROM \(/);
});

test('versión 4.0.14 publicada y cache renovada',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const index=await read('public/index.html');
  const app=await read('server/app.js');
  assert.ok(Number(pkg.version.split('.').at(-1))>=15);
  assert.match(index,/v=4018/);
  assert.match(app,/4\.0\.15-ASIGNACION-AUTOMATICA-TODOS-SUPERVISORES-POR-UNIDAD/);
});
