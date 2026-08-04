import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('DDS regresa con el nombre RIT Diario e IDS queda separado',async()=>{
  const app=await read('public/js/app.js');
  assert.match(app,/navButton\('ritDaily','RIT Diario'/);
  assert.match(app,/navButton\('ids','IDS'/);
  assert.doesNotMatch(app,/navButton\([^\n]*'DDS'/);
});

test('schema incorpora tablas independientes para RIT e IDS',async()=>{
  const schema=await read('server/schema.js');
  assert.match(schema,/CREATE TABLE IF NOT EXISTS rit_daily_records/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS ids_performance/);
  assert.match(schema,/UNIQUE\(worker_id,period_start,period_end\)/);
});

test('IDS conserva métricas solicitadas y clasificación de desempeño',async()=>{
  const backend=await read('server/modules/preventive.js');
  assert.match(backend,/acts_count/);
  assert.match(backend,/conditions_count/);
  assert.match(backend,/rit_cap_programmed/);
  assert.match(backend,/inspections_programmed/);
  assert.match(backend,/pare_programmed/);
  assert.match(backend,/Number\(value\)>=90\?'BUENO':Number\(value\)>=75\?'REGULAR':'DEFICIENTE'/);
});

test('RIT e IDS tienen descargas Excel separadas',async()=>{
  const frontend=await read('public/js/pages/ssoma.js');
  const report=await read('server/reports/preventive.js');
  assert.match(frontend,/Excel RIT Diario/);
  assert.match(frontend,/Excel IDS/);
  assert.match(report,/buildRitDailyExcel/);
  assert.match(report,/buildIdsExcel/);
});
