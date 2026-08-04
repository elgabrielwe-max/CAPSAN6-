import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('depuración RACS no usa la lista completa de ids como entity_id',async()=>{
  const route=await read('server/modules/racs.js');
  assert.ok(!route.includes("await audit(req,'PURGE_RACS','RAC',ids.join(',')"));
  assert.ok(route.includes("path.basename(backupPath,'.json')"));
  assert.ok(route.includes("'RAC_PURGE'"));
  assert.ok(route.includes('{count:ids.length,ids,backupPath'));
});

test('schema amplía audit_log.entity_id y auditoría no derriba el proceso',async()=>{
  const schema=await read('server/schema.js');
  const audit=await read('server/services/audit.js');
  assert.ok(schema.includes('ALTER TABLE audit_log ALTER COLUMN entity_id TYPE TEXT'));
  assert.ok(schema.includes('entity_id TEXT'));
  assert.ok(audit.includes("console.error('No se pudo registrar auditoría:'"));
  assert.ok(audit.includes('return false'));
});
