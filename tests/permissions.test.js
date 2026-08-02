import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, hasCapability } from '../server/permissions.js';

test('Máster conserva control total de gestión', () => {
  for (const capability of ['users:manage','users:impersonate','masterdata:manage','rac:purge','drive:sync','reports:executive']) {
    assert.equal(hasCapability('MASTER', capability), true, capability);
  }
});

test('SSOMA gestiona operación pero no cuentas Máster', () => {
  for (const capability of ['rac:validate','rac:assign','ssoma:manage','environment:manage','incidents:manage']) {
    assert.equal(hasCapability('SSOMA', capability), true, capability);
  }
  assert.equal(hasCapability('SSOMA','users:manage'), false);
  assert.equal(hasCapability('SSOMA','rac:purge'), false);
});

test('Supervisor trabaja por alcance sin privilegios administrativos', () => {
  for (const capability of ['rac:view','rac:create','rac:followup','training:grade','reports:executive']) {
    assert.equal(hasCapability('SUPERVISOR', capability), true, capability);
  }
  for (const capability of ['users:manage','masterdata:manage','rac:purge','rac:validate']) {
    assert.equal(hasCapability('SUPERVISOR', capability), false, capability);
  }
});

test('no existen capacidades duplicadas por perfil', () => {
  for (const [role, list] of Object.entries(CAPABILITIES)) {
    assert.equal(new Set(list).size, list.length, role);
  }
});
