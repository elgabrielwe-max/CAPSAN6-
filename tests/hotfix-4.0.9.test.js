import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('servidor expone listado de cambios con alcance por unidad',async()=>{
  const source=await read('server/modules/racs.js');
  assert.match(source,/racsRouter\.get\('\/changes'/);
  assert.match(source,/const \{where,params\}=buildWhere\(req\)/);
  assert.match(source,/audit_log/);
  assert.match(source,/rac_evidence/);
  assert.match(source,/file_assets/);
  assert.match(source,/changes:changesBy/);
  assert.match(source,/evidence:evidenceBy/);
});

test('interfaz incorpora pestaña y galería ampliable de evidencias',async()=>{
  const source=await read('public/js/pages/racs.js');
  assert.match(source,/Listado de cambios/);
  assert.match(source,/data-evidence-preview/);
  assert.match(source,/data-open-evidence/);
  assert.match(source,/openRacEvidence/);
  assert.match(source,/evidence-expanded-image/);
  assert.match(source,/evidence-expanded-pdf/);
});

test('estilos incluyen tarjetas, miniaturas y línea de tiempo',async()=>{
  const source=await read('public/css/app.css');
  for(const selector of ['.rac-change-card','.evidence-gallery','.evidence-thumb','.change-timeline','.evidence-expanded-image'])assert.ok(source.includes(selector),selector);
});
