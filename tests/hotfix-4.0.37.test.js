import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('CAPSAN6 4.0.37 carga el Excel RACS por partes reintentables',()=>{
  const server=read('server/modules/racs.js');
  const service=read('server/services/uploadCache.js');
  const client=read('public/js/pages/racs.js');
  assert.match(server,/\/import\/upload\/init/);
  assert.match(server,/\/import\/upload\/chunk/);
  assert.match(server,/\/import\/upload\/complete/);
  assert.match(service,/DEFAULT_CHUNK_SIZE = 512 \* 1024/);
  assert.match(service,/handle\.write\(buffer, 0, buffer\.length, offset\)/);
  assert.match(service,/receivedChunks/);
  assert.match(client,/uploadRacWorkbookInChunks/);
  assert.match(client,/retryChunkRequest/);
  assert.match(client,/Subiendo Excel por partes/);
  assert.doesNotMatch(client,/fd\.append\('file',selectedFile\)/);
});

test('la finalización fragmentada es idempotente y queda ligada al usuario y unidad',()=>{
  const service=read('server/services/uploadCache.js');
  assert.match(service,/La respuesta de finalización puede perderse/);
  assert.match(service,/assertOwner\(meta, \{ userId, businessUnitId, purpose \}\)/);
  assert.match(service,/MAX_IMPORT_FILE_SIZE = 25 \* 1024 \* 1024/);
});

test('versión corresponde a CAPSAN6 4.0.37',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'4.0.37');
  assert.match(read('server/app.js'),/version:'4\.0\.37'/);
  assert.match(read('server/index.js'),/CAPSAN6 4\.0\.37 ejecutándose/);
});
