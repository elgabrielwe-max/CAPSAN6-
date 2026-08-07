import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('4.0.38 crea un token estable nuevo después del análisis',()=>{
  const source=read('server/modules/racs.js');
  assert.match(source,/const cachedUpload=await cacheUploadedFile\(importFile/);
  assert.match(source,/uploadToken!==cachedUpload\.token/);
});

test('4.0.38 renueva la caché y valida checksum',()=>{
  const source=read('server/services/uploadCache.js');
  assert.match(source,/6 \* 60 \* 60 \* 1000/);
  assert.match(source,/checksum: sha256\(/);
  assert.match(source,/meta\.expiresAt = Date\.now\(\) \+ CACHE_TTL_MS/);
});

test('4.0.38 recupera automáticamente una caché 410 desde el navegador',()=>{
  const source=read('public/js/pages/racs.js');
  assert.match(source,/Number\(firstError\.status\)===410/);
  assert.match(source,/Recuperando Excel automáticamente/);
  assert.match(source,/currentUploadToken=refreshed\.uploadToken/);
  const app=read('public/js/app.js');
  assert.match(app,/api\.js\?v=4038/);
  assert.match(app,/racs\.js\?v=4038/);
  assert.match(read('public/index.html'),/app\.js\?v=4038/);
});

test('4.0.38 expone el estado HTTP en el helper API',()=>{
  const source=read('public/js/api.js');
  assert.match(source,/error\.status=response\.status/);
});
