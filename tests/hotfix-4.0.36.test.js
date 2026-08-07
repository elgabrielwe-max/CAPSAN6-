import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('CAPSAN6 4.0.36 conserva el Excel analizado y confirma mediante token',()=>{
  const server=read('server/modules/racs.js');
  const client=read('public/js/pages/racs.js');
  assert.match(server,/cacheUploadedFile\(importFile/);
  assert.match(server,/loadCachedFile\(uploadToken/);
  assert.match(server,/removeCachedFile\(uploadToken/);
  assert.match(server,/importFile\.originalname,importFile\.originalname/);
  assert.doesNotMatch(server,/req\.file\.originalname,req\.file\.originalname/);
  assert.match(client,/let currentUploadToken=a\.uploadToken/);
  assert.doesNotMatch(client,/fd2\.append\('file',selectedFile\)/);
});

test('la caché temporal está ligada a usuario, unidad y vencimiento',()=>{
  const service=read('server/services/uploadCache.js');
  assert.match(service,/Number\(meta\.userId\) !== Number\(userId\)/);
  assert.match(service,/Number\(meta\.businessUnitId\) !== Number\(businessUnitId\)/);
  assert.match(service,/Date\.now\(\) > Number\(meta\.expiresAt/);
  assert.match(service,/6 \* 60 \* 60 \* 1000/);
});

test('los abortos de carga tienen tratamiento específico y no error 500 genérico',()=>{
  const middleware=read('server/middleware/error.js');
  assert.match(middleware,/Request aborted/);
  assert.match(middleware,/UPLOAD_ABORTED/);
  assert.match(middleware,/status\(499\)/);
});

test('el servidor amplía los tiempos para cargas lentas',()=>{
  const index=read('server/index.js');
  assert.match(index,/requestTimeout=15\*60\*1000/);
  assert.match(index,/headersTimeout=16\*60\*1000/);
});

test('versión corresponde a CAPSAN6 4.0.38',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'4.0.38');
  assert.match(read('server/app.js'),/version:'4\.0\.38'/);
});
