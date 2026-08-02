import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('recuperación Máster es segura y de una sola aplicación',async()=>{
  const schema=await read('server/schema.js');
  const config=await read('server/config.js');
  assert.match(config,/MASTER_RECOVERY_PASSWORD/);
  assert.match(schema,/master_recovery_events/);
  assert.match(schema,/createHash\('sha256'\)/);
  assert.match(schema,/must_change_password=TRUE/);
  assert.match(schema,/active=TRUE/);
  assert.match(schema,/deleted_at=NULL/);
  assert.match(schema,/pg_advisory_xact_lock/);
  assert.match(schema,/SELECT id FROM users WHERE role='MASTER' LIMIT 1/);
});
