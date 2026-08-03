import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('periodo de lotes admite MULTIPERIODO en bases nuevas y existentes',async()=>{
  const schema=await read('server/schema.js');
  const racs=await read('server/modules/racs.js');
  assert.match(schema,/detected_period VARCHAR\(20\)/);
  assert.match(schema,/ALTER COLUMN detected_period TYPE VARCHAR\(20\) USING detected_period::text/);
  assert.match(racs,/MULTIPERIODO/);
  assert.match(racs,/\$5::varchar\(20\)/);
});

test('versión 4.0.13 publicada',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const app=await read('server/app.js');
  const index=await read('public/index.html');
  assert.equal(pkg.version,'4.0.13');
  assert.match(app,/4\.0\.13-HOTFIX-PERIODO-IMPORTACION-MULTIPERIODO/);
  assert.match(index,/v=4013/);
});
