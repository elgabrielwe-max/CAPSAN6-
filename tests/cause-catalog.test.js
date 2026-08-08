import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RAC_CAUSE_CATALOG, classifyCauseFromCatalog } from '../server/racCauseCatalog.js';

test('restaura las causas institucionales y la categoría de stock',()=>{
  assert.equal(RAC_CAUSE_CATALOG.length,10);
  assert.deepEqual(RAC_CAUSE_CATALOG.map(x=>x.code),['I','II','III','IV','V','VI','VII','VIII','IX','X']);
  assert.ok(RAC_CAUSE_CATALOG.find(x=>x.code==='I').subtypes.includes('ROCAS SUELTAS / FALTA DE SOSTENIMIENTO'));
  assert.ok(RAC_CAUSE_CATALOG.find(x=>x.code==='VII').subtypes.includes('NO USO DE EPP'));
  assert.ok(RAC_CAUSE_CATALOG.find(x=>x.code==='VI').subtypes.includes('MANEJO DE RESIDUOS PELIGROSOS O NO PELIGROSOS'));
  assert.equal(RAC_CAUSE_CATALOG.find(x=>x.code==='IX').name,'LOGÍSTICA, STOCK Y ABASTECIMIENTO');
  assert.ok(RAC_CAUSE_CATALOG.find(x=>x.code==='IX').subtypes.includes('FALLA EN LA PROGRAMACIÓN DE STOCK'));
});

test('la IA local devuelve categorías y subcausas del catálogo',()=>{
  const result=classifyCauseFromCatalog('Se observa cable eléctrico expuesto en tablero');
  assert.equal(result.causeCategoryCode,'IV');
  assert.equal(result.causeSubtype,'ENERGÍA ELÉCTRICA INCONTROLADA');
});

test('la IA detecta fallas de programación de stock',()=>{
  const result=classifyCauseFromCatalog('No se cuenta con repuesto por falla en la programación de stock');
  assert.equal(result.causeCategoryCode,'IX');
  assert.equal(result.causeSubtype,'FALLA EN LA PROGRAMACIÓN DE STOCK');
});

test('la base y el formulario usan el catálogo central y permiten nuevas subcausas controladas',()=>{
  const schema=fs.readFileSync('server/schema.js','utf8');
  const routes=fs.readFileSync('server/modules/racs.js','utf8');
  const page=fs.readFileSync('public/js/pages/racs.js','utf8');
  const permissions=fs.readFileSync('server/permissions.js','utf8');
  assert.match(schema,/CREATE TABLE IF NOT EXISTS rac_cause_categories/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS rac_cause_subtypes/);
  assert.match(schema,/cause_category_id/);
  assert.match(schema,/cause_subtype_id/);
  assert.match(routes,/post\('\/cause-subtypes'/);
  assert.match(routes,/CREATE_RAC_CAUSE_SUBTYPE/);
  assert.match(page,/Registrar nueva subcausa/);
  assert.match(page,/name="causeCategoryId"/);
  assert.match(page,/name="causeSubtypeId"/);
  assert.match(permissions,/rac:catalog\.manage/);
});
