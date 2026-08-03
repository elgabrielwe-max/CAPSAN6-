import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('DDS y RIT reutilizan la base maestra de trabajadores', () => {
  const schema = read('server/schema.js');
  const module = read('server/modules/dailySafety.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS dds_attendance/);
  assert.match(schema, /worker_id INTEGER NOT NULL REFERENCES workers\(id\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS rit_participants/);
  assert.match(module, /FROM workers w JOIN areas a ON a\.id=w\.area_id/);
  assert.match(module, /Uno o más trabajadores no pertenecen a la unidad\/área seleccionada/);
});

test('el módulo registra asistencia DDS y asignaciones RIT por trabajador', () => {
  const module = read('server/modules/dailySafety.js');
  assert.match(module, /INSERT INTO dds_attendance\(dds_id,worker_id,attendance_status,observation\)/);
  assert.match(module, /INSERT INTO rit_participants\(rit_id,worker_id,assigned_activity,responsibility\)/);
  assert.match(module, /ASISTIO.*NO ASISTIO.*JUSTIFICADO/s);
  assert.match(module, /planned_activities.*critical_risks.*controls/s);
});

test('Supervisor, SSOMA y Máster acceden a DDS y RIT respetando unidad', () => {
  const permissions = read('server/permissions.js');
  const module = read('server/modules/dailySafety.js');
  for (const role of ['MASTER', 'SSOMA', 'SUPERVISOR']) {
    const block = permissions.match(new RegExp(`${role}: \\[([\\s\\S]*?)\\]`))?.[1] || '';
    assert.match(block, /'dds:manage'/);
    assert.match(block, /'rit:manage'/);
  }
  assert.match(module, /assertUnitAccess\(req\.user, unitId\)/);
  assert.match(module, /unitScope\(req\.user/);
});

test('la interfaz incorpora Gestión diaria con carga de trabajadores existentes', () => {
  const app = read('public/js/app.js');
  const page = read('public/js/pages/dailySafety.js');
  const server = read('server/app.js');
  assert.match(app, /Gestión diaria/);
  assert.match(app, /DDS y RIT/);
  assert.match(page, /\/api\/daily-safety\/workers/);
  assert.match(page, /Cargar trabajadores/);
  assert.match(page, /BASE MAESTRA/);
  assert.match(server, /app\.use\('\/api\/daily-safety',dailySafetyRouter\)/);
  assert.match(server, /version:'4\.0\.(?:19|20)/);
});
