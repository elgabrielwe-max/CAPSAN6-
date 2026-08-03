import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('registro RAC muestra Supervisores vinculados a la unidad',()=>{
  const source=fs.readFileSync('public/js/pages/racs.js','utf8');
  assert.match(source,/id="unitSupervisors"/);
  assert.match(source,/supervisorsForUnit=unitId=>state\.catalogs\.users\.filter/);
  assert.match(source,/user\.role==='SUPERVISOR'/);
  assert.match(source,/user\.unit_ids\|\|\[\]/);
  assert.match(source,/Todos los Supervisores activos vinculados a la unidad quedarán asignados automáticamente/);
  assert.doesNotMatch(source,/name="supervisorUserId"><option value="">Sin asignar/);
});

test('servidor asigna el RAC a todos los Supervisores activos de la unidad',()=>{
  const source=fs.readFileSync('server/modules/racs.js','utf8');
  assert.match(source,/JOIN user_business_units ubu ON ubu\.user_id=u\.id/);
  assert.match(source,/ubu\.business_unit_id=\$1 AND u\.role='SUPERVISOR'/);
  assert.match(source,/for\(const supervisor of unitSupervisors\)await client\.query\(`INSERT INTO rac_assignments/);
  assert.match(source,/assigned_supervisor_count:unitSupervisors\.length/);
  assert.match(source,/for\(const supervisorId of row\.assigned_supervisor_ids\|\|\[\]\)/);
});

test('listados y filtros consideran todas las asignaciones activas',()=>{
  const racs=fs.readFileSync('server/modules/racs.js','utf8');
  const scope=fs.readFileSync('server/scope.js','utf8');
  assert.match(racs,/string_agg\(su\.name, ', ' ORDER BY su\.name\)/);
  assert.match(scope,/EXISTS\(SELECT 1 FROM rac_assignments scope_ra/);
});
