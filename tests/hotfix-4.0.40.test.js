import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const racs=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');
const reconciliation=fs.readFileSync(new URL('../server/services/racReconciliation.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/js/pages/racs.js',import.meta.url),'utf8');

test('4.0.40 desactiva restauración de evidencias durante importación Excel',()=>{
  assert.match(racs,/restoreReconciliationMemory\(client,racId,memoryRows,req\.user\.id,\{restoreEvidence:false\}\)/);
  const importBlock=racs.slice(racs.indexOf("racsRouter.post('/import'"),racs.indexOf("racsRouter.get('/directed'"));
  assert.doesNotMatch(importBlock,/recoverHistoricalEvidence\(/);
});

test('4.0.40 conserva recuperación manual separada del importador',()=>{
  assert.match(racs,/evidence-recovery\/preview/);
  assert.match(racs,/evidence-recovery\/execute/);
  assert.match(reconciliation,/if\(restoreEvidence\)/);
  assert.match(reconciliation,/if\(restoreEvidence\)await client\.query\(`UPDATE file_assets/);
});

test('4.0.40 elimina evidencias restauradas del resumen de importación',()=>{
  assert.doesNotMatch(ui,/evidencias restauradas/);
});
