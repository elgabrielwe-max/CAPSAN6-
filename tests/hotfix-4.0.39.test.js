import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('4.0.39 analiza la carga fragmentada en la misma solicitud', () => {
  const server = read('server/modules/racs.js');
  const cache = read('server/services/uploadCache.js');
  assert.match(server, /loadOrCompleteChunkedFile/);
  assert.match(cache, /completeChunkedUpload\(token, owner\)/);
});

test('4.0.39 no finaliza la carga en una solicitud separada antes de analizar', () => {
  const client = read('public/js/pages/racs.js');
  const uploadFn = client.match(/async function uploadRacWorkbookInChunks[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(uploadFn, /\/import\/upload\/complete/);
  assert.match(uploadFn, /return \{uploadToken:initialized\.uploadToken/);
});

test('4.0.39 vuelve a cargar por partes al confirmar e importa en la misma operación', () => {
  const client = read('public/js/pages/racs.js');
  assert.match(client, /Preparando importación definitiva/);
  assert.match(client, /const finalUpload=await uploadRacWorkbookInChunks/);
  assert.match(client, /const r=await importWithToken\(currentUploadToken\)/);
});
