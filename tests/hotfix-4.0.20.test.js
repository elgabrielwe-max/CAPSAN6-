import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('DDS y RIT aceptan escaneado de asistentes en formatos documentales e imagen', () => {
  const module = read('server/modules/dailySafety.js');
  assert.match(module, /DDS_ATTENDANCE_SCAN/);
  assert.match(module, /RIT_ATTENDANCE_SCAN/);
  assert.match(module, /application\/pdf/);
  assert.match(module, /image\/heic/);
  assert.match(module, /25 \* 1024 \* 1024/);
});

test('el escaneado queda vinculado a file_assets y respeta el alcance por unidad', () => {
  const module = read('server/modules/dailySafety.js');
  assert.match(module, /queueAsset\(\{/);
  assert.match(module, /businessUnitId: session\.business_unit_id/);
  assert.match(module, /assertUnitAccess\(user, row\.business_unit_id\)/);
  assert.match(module, /UPLOAD_ATTENDANCE_SCAN/);
});

test('la interfaz carga y permite descargar el escaneado desde DDS y RIT', () => {
  const page = read('public/js/pages/dailySafety.js');
  assert.match(page, /Escaneado de asistentes/);
  assert.match(page, /ddsAttendanceScan/);
  assert.match(page, /ritAttendanceScan/);
  assert.match(page, /attendance-scan/);
  assert.match(page, /download\(`\/api\/files\//);
});

test('la versión del servidor se actualizó a 4.0.20', () => {
  const app = read('server/app.js');
  const pkg = read('package.json');
  assert.match(app, /version:'4\.0\.20'/);
  assert.match(pkg, /"version": "4\.0\.20"/);
});
