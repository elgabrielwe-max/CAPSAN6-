import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('importación RACS fuerza tipos compatibles para fechas y porcentaje', async () => {
  const server = await read('server/modules/racs.js');
  assert.match(server, /report_date=\$8::date/);
  assert.match(server, /lifted_at=CASE WHEN \$19::int>=100 THEN \$8::date ELSE NULL::date END/);
  assert.match(server, /\$9::date,\$10/);
  assert.match(server, /CASE WHEN \$20::int>=100 THEN \$9::date ELSE NULL::date END,\$21::date/);
  assert.doesNotMatch(server, /CASE WHEN \$20>=100 THEN \$9 ELSE NULL END/);
});

test('la versión publicada conserva el hotfix de fechas en la versión vigente', async () => {
  const app = await read('server/app.js');
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, '4.0.7');
  assert.match(app, /4\.0\.7-HOTFIX-CATALOGO-FECHAS-PPT/);
});
