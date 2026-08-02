import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('eliminación de usuarios es múltiple, autenticada y conserva RACS',async()=>{
  const src=await read('server/modules/admin.js');
  assert.match(src,/users\/bulk-delete/);
  assert.match(src,/bcrypt\.compare\(currentPassword/);
  assert.match(src,/Debe quedar al menos un Máster activo/);
  assert.match(src,/UPDATE rac_assignments SET active=FALSE/);
  assert.doesNotMatch(src,/DELETE FROM racs WHERE supervisor/i);
});

test('depuración RACS exige contraseña, frase exacta y respaldo',async()=>{
  const src=await read('server/modules/racs.js');
  assert.match(src,/purge\/preview/);
  assert.match(src,/purge\/execute/);
  assert.match(src,/ELIMINAR \$\{selected\.length\} RACS/);
  assert.match(src,/purge-backups/);
  assert.match(src,/bcrypt\.compare/);
});

test('supervisores se limitan por unidades y sus RACS',async()=>{
  const auth=await read('server/auth.js');
  const reports=await read('server/modules/reports.js');
  assert.match(auth,/user_business_units/);
  assert.match(reports,/user\.role==='SUPERVISOR'/);
  assert.match(reports,/r\.supervisor_user_id/);
  assert.match(reports,/rac_assignments/);
});

test('enlaces públicos son firmados, revocables y expiran',async()=>{
  const reports=await read('server/modules/reports.js');
  const pub=await read('server/modules/public.js');
  assert.match(reports,/randomBytes\(32\)/);
  assert.match(reports,/sha256/);
  assert.match(reports,/make_interval/);
  assert.match(pub,/revoked_at IS NULL AND expires_at>NOW\(\)/);
});
