import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('RACS visibles automáticamente por unidad sin exigir asignación individual',async()=>{
  const source=await read('server/modules/racs.js');
  const build=source.match(/function buildWhere\(req,alias='r'\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(build,/unitScope\(req\.user/);
  assert.doesNotMatch(build,/supervisor_user_id|rac_assignments|created_by/);
  assert.doesNotMatch(source,/function supervisorClause/);
});

test('Supervisor puede dar seguimiento por pertenencia a la unidad',async()=>{
  const source=await read('server/modules/racs.js');
  assert.match(source,/if\(!assertUnitAccess\(req\.user,rac\.business_unit_id\)\)return res\.status\(403\)/);
  assert.doesNotMatch(source,/!\(\[rac\.created_by,rac\.supervisor_user_id\]\.includes\(req\.user\.id\)/);
  assert.match(source,/El levantamiento debe validarlo SSOMA o Máster/);
});

test('Reportes e hipervínculo heredan alcance por unidad y no por responsable',async()=>{
  const reports=await read('server/modules/reports.js');
  const publicModule=await read('server/modules/public.js');
  const params=reports.match(/function paramsFrom\(query,user\)\{[\s\S]*?return\{where:clauses\.join\(' AND '\),params\};\n\}/)?.[0]||'';
  assert.match(params,/business_unit_id=ANY/);
  assert.doesNotMatch(params,/user\.role==='SUPERVISOR'|rac_assignments|supervisor_user_id/);
  assert.doesNotMatch(publicModule,/ownerRole==='SUPERVISOR'/);
  assert.match(publicModule,/f\.unitIds/);
});

test('Dashboard principal limita trabajadores capacitaciones e incidentes por unidad',async()=>{
  const source=await read('server/modules/dashboard.js');
  assert.match(source,/w\.business_unit_id=ANY/);
  assert.match(source,/tt\.business_unit_id=ANY/);
  assert.match(source,/f\.business_unit_id=ANY/);
});

test('la versión vigente conserva el alcance automático de 4.0.10',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const app=await read('server/app.js');
  assert.ok(Number(pkg.version.split('.').at(-1))>=10);
  assert.match(app,/ALCANCE-SUPERVISOR-REPARADO|SUPERVISOR-POR-UNIDAD-AUTOMATICO/);
});
