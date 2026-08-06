import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('importación RACS fuerza tipos compatibles para fechas y porcentaje', async () => {
  const server = await read('server/modules/racs.js');
  assert.match(server, /report_date=\$9::date/);
  assert.match(server, /lifted_at=CASE WHEN \$31::boolean THEN lifted_at WHEN \$20::int>=100 THEN \$9::date ELSE NULL::date END/);
  assert.match(server, /\$10::date,\$11/);
  assert.match(server, /CASE WHEN \$21::int>=100 THEN \$10::date ELSE NULL::date END,\$22::date/);
  assert.doesNotMatch(server, /CASE WHEN \$20>=100 THEN \$9 ELSE NULL END/);
});

test('la versión publicada conserva el hotfix de fechas en la versión vigente', async () => {
  const app = await read('server/app.js');
  const pkg = JSON.parse(await read('package.json'));
  assert.ok(Number(pkg.version.split('.').at(-1)) >= 10);
  assert.match(app, /ALCANCE-SUPERVISOR-REPARADO|SUPERVISOR-POR-UNIDAD-AUTOMATICO/);
});
