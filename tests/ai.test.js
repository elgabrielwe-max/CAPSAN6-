import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const { classifyRacLocal, classifyFlashLocal } = await import('../server/services/ai.js');

test('clasifica medio ambiente y conserva categorías operativas', () => {
  const r=classifyRacLocal('Se evidencia derrame de aceite contaminando el suelo cerca de la poza');
  assert.equal(r.environmental,true);
  assert.equal(r.causeCategory,'MEDIO AMBIENTE');
  assert.match(r.causeSubtype,/AMBIENTAL/);
});

test('distingue acto por no uso de EPP', () => {
  const r=classifyRacLocal('El trabajador no usa guantes ni lentes de seguridad');
  assert.equal(r.reportType,'ACTO SUBESTANDAR');
  assert.equal(r.causeCategory,'EPP');
});

test('clasifica ventilación como condición', () => {
  const r=classifyRacLocal('Se detecta monóxido por ventilación deficiente en la labor');
  assert.equal(r.reportType,'CONDICION SUBESTANDAR');
  assert.equal(r.causeCategory,'VENTILACION');
});

test('Flash Report eleva potencial crítico ante eventos graves', () => {
  assert.equal(classifyFlashLocal('Posible electrocución durante mantenimiento').potentialSeverity,'CRITICO');
  assert.equal(classifyFlashLocal('Golpe menor sin lesión').potentialSeverity,'MEDIO');
});
