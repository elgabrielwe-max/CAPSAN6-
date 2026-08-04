import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('unidades vinculadas no se pierden por bandera active',async()=>{
  const source=await read('server/auth.js');
  const block=source.match(/export async function userUnits[\s\S]*?return result\.rows;\n}/)?.[0]||'';
  assert.doesNotMatch(block,/bu\.active=TRUE/);
  assert.match(block,/ORDER BY bu\.active DESC,bu\.name/);
});

test('perfil supervisor repara alcance histórico verificable',async()=>{
  const source=await read('server/auth.js');
  assert.match(source,/repairUserUnitLinks/);
  assert.match(source,/rac_assignments/);
  assert.match(source,/ssoma_work_plans/);
  assert.match(source,/grades g JOIN workers/);
  assert.match(source,/userUnits\(user\.id, \{ repair: true, user \}\)/);
});

test('impersonación devuelve unidades y cantidad de RACS',async()=>{
  const source=await read('server/modules/auth.js');
  assert.match(source,/scope:\{units,racCount\}/);
  assert.match(source,/business_unit_id=ANY/);
});

test('dashboard informa alcance efectivo',async()=>{
  const backend=await read('server/modules/dashboard.js');
  const frontend=await read('public/js/pages/dashboard.js');
  assert.match(backend,/noUnitScope/);
  assert.match(frontend,/Alcance automático/);
  assert.match(frontend,/Perfil sin unidad vinculada/);
});

test('alcance 4.0.11 permanece integrado en versión posterior',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const index=await read('public/index.html');
  assert.ok(Number(pkg.version.split('.').at(-1))>=15);
  assert.match(index,/v=40\d{2}/);
});
