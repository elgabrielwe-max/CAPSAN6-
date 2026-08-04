import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('schema guarda la excepción formal de evidencia',async()=>{
  const schema=await read('server/schema.js');
  assert.match(schema,/evidence_required BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema,/evidence_exemption_reason TEXT/);
  assert.match(schema,/evidence_exempted_by INTEGER/);
});

test('solo validadores pueden cerrar un RAC que no requiere evidencia',async()=>{
  const racs=await read('server/modules/racs.js');
  assert.match(racs,/noEvidenceRequired/);
  assert.match(racs,/Solo SSOMA o Máster puede aprobar un cierre que no requiere evidencia/);
  assert.match(racs,/Explica en el comentario por qué este RAC no requiere evidencia/);
});

test('interfaz ofrece la marca no requiere evidencia solo al validar levantado',async()=>{
  const ui=await read('public/js/pages/racs.js');
  assert.match(ui,/Este RAC no requiere evidencia para su cierre/);
  assert.match(ui,/NO REQUIERE EVIDENCIA/);
  assert.match(ui,/validator=can\('rac:validate'\)/);
});

test('reporte separa evidencia real, excepción y cierres sin sustento',async()=>{
  const backend=await read('server/modules/reports.js');
  const excel=await read('server/reports/racControl.js');
  assert.match(backend,/lifted_no_evidence_required/);
  assert.match(backend,/evidence_required AND NOT has_final_evidence/);
  assert.match(excel,/NO REQUIERE EVIDENCIA/);
  assert.match(excel,/LEV\. SIN SUSTENTO/);
});
