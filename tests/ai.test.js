import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const { classifyRacLocal, classifyFlashLocal } = await import('../server/services/ai.js');

test('clasifica medio ambiente con el catálogo institucional', () => {
  const r=classifyRacLocal('Se evidencia derrame de aceite contaminando el suelo cerca de la poza');
  assert.equal(r.environmental,true);
  assert.equal(r.causeCategoryCode,'VI');
  assert.equal(r.causeCategory,'MEDIO AMBIENTE Y SUSTANCIAS PELIGROSAS');
  assert.equal(r.causeSubtype,'MANEJO INADECUADO DE HIDROCARBUROS');
});

test('distingue acto por no uso de EPP', () => {
  const r=classifyRacLocal('El trabajador no usa EPP, guantes ni lentes de seguridad');
  assert.equal(r.reportType,'ACTO SUBESTANDAR');
  assert.equal(r.causeCategoryCode,'VII');
  assert.equal(r.causeCategory,'FACTORES HUMANOS (ACTOS SUBESTÁNDAR)');
  assert.equal(r.causeSubtype,'NO USO DE EPP');
});

test('clasifica ventilación como condición', () => {
  const r=classifyRacLocal('Se detecta monóxido por ventilación deficiente en la labor');
  assert.equal(r.reportType,'CONDICION SUBESTANDAR');
  assert.equal(r.causeCategoryCode,'V');
  assert.equal(r.causeCategory,'CONDICIONES DE TRABAJO');
  assert.equal(r.causeSubtype,'DEFICIENCIA DE VENTILACIÓN');
});

test('Flash Report eleva potencial crítico ante eventos graves', () => {
  assert.equal(classifyFlashLocal('Posible electrocución durante mantenimiento').potentialSeverity,'CRITICO');
  assert.equal(classifyFlashLocal('Golpe menor sin lesión').potentialSeverity,'MEDIO');
});
