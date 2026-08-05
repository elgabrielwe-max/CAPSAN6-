import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RAC_CAUSE_CATALOG, classifyCauseFromCatalog } from '../server/racCauseCatalog.js';

test('4.0.23 agrega logística, stock y abastecimiento al catálogo RACS',()=>{
  const category=RAC_CAUSE_CATALOG.find(item=>item.code==='IX');
  assert.ok(category);
  assert.equal(category.name,'LOGÍSTICA, STOCK Y ABASTECIMIENTO');
  assert.equal(category.reportType,'CONDICION SUBESTANDAR');
  assert.ok(category.subtypes.includes('FALLA EN LA PROGRAMACIÓN DE STOCK'));
});

test('4.0.23 clasifica expresiones de falta o quiebre de stock',()=>{
  for(const text of ['falla en la programación de stock','no hay stock del repuesto','quiebre de stock en almacén']){
    const result=classifyCauseFromCatalog(text);
    assert.equal(result.causeCategoryCode,'IX');
    assert.equal(result.causeSubtype,'FALLA EN LA PROGRAMACIÓN DE STOCK');
  }
});

test('4.0.23 queda versionado en API y arranque',()=>{
  assert.match(fs.readFileSync('server/app.js','utf8'),/4\.0\.23/);
  assert.match(fs.readFileSync('server/index.js','utf8'),/4\.0\.23/);
});
