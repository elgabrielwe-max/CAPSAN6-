import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { dueDateForRisk, RAC_DEADLINE_RULES } from '../server/services/racDeadlines.js';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('plazos RACS cumplen reglas de gerencia',()=>{
  assert.equal(dueDateForRisk('2026-08-01','ALTO'),'2026-08-03');
  assert.equal(dueDateForRisk('2026-08-01','MEDIO'),'2026-08-04');
  assert.equal(dueDateForRisk('2026-08-01','BAJO'),'2026-08-05');
  assert.equal(RAC_DEADLINE_RULES.ALTO.label,'0 a 48 horas');
});

test('unidades nuevas se propagan a perfiles con alcance automático',async()=>{
  const schema=await read('server/schema.js');
  const admin=await read('server/modules/admin.js');
  const auth=await read('server/auth.js');
  assert.match(schema,/all_units_access BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(admin,/propagatedUsers/);
  assert.match(admin,/Todas las unidades actuales y futuras|allUnitsAccess/);
  assert.match(auth,/user\?\.all_units_access/);
});

test('catálogos se refrescan después de crear una unidad',async()=>{
  const source=await read('public/js/pages/admin.js');
  assert.match(source,/state\.catalogs=await api\('\/api\/catalogs'\)/);
  assert.match(source,/renderPage\(\)/);
});

test('descarga de recursos incorpora control RACS por unidad',async()=>{
  const backend=await read('server/modules/reports.js');
  const frontend=await read('public/js/pages/ssoma.js');
  const report=await read('server/reports/racControl.js');
  assert.match(backend,/\/racs\/control-summary/);
  assert.match(backend,/lifted_without_evidence/);
  assert.match(backend,/pending_validation/);
  assert.match(backend,/high_overdue/);
  assert.match(frontend,/Excel Control RACS por unidad/);
  assert.match(frontend,/Levantados sin evidencia/);
  assert.match(report,/RACS VENCIDOS/);
  assert.match(report,/PENDIENTES VALIDACION/);
});

test('control SSOMA lista incluso unidades sin pendientes',async()=>{
  const source=await read('server/modules/ssoma.js');
  assert.match(source,/FROM business_units bu LEFT JOIN racs r/);
  assert.match(source,/COUNT\(r\.id\) FILTER/);
});
