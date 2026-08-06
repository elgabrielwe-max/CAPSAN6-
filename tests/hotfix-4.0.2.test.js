import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('incidentes no usa month como alias SQL y entrega series compatibles', async () => {
  const server = await read('server/modules/incidents.js');
  const client = await read('public/js/pages/incidents.js');
  assert.doesNotMatch(server, /TO_CHAR\([^\n]+\)\s+month\b/i);
  assert.match(server, /TO_CHAR\(f\.event_date, 'YYYY-MM'\) AS name/);
  assert.match(client, /x\.name\|\|x\.month\|\|x\.period/);
  assert.match(server, /asyncRoute/);
});

test('importador confirma usando valores capturados y verifica la base central', async () => {
  const server = await read('server/modules/racs.js');
  const client = await read('public/js/pages/racs.js');
  assert.match(client, /const selectedUnitId=currentForm\.elements\.businessUnitId\.value/);
  assert.doesNotMatch(client, /fd2\.append\('businessUnitId',e\.currentTarget/);
  assert.match(server, /CASE WHEN \$21::int>=100 THEN \$10::date ELSE NULL::date END,\$22::date,\$23,\$24,\$25,\$26,\$27,\$28,\$29,\$30,\$31,\$32/);
  assert.doesNotMatch(server, /CASE WHEN \$21::int>=100 THEN \$10::date ELSE NULL::date END,[^;]*\$33/);
  assert.match(server, /WHERE import_batch_id=\$1 AND id=ANY\(\$2::int\[\]\)/);
  assert.match(server, /verified!==expectedUnique/);
  assert.doesNotMatch(server, /verified!==inserted\+updated/);
  assert.match(server, /INSERT INTO business_unit_areas/);
});

