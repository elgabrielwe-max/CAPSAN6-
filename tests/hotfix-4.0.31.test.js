import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldMatchBySourceReportNumber } from '../server/services/racReconciliation.js';

const racsSource=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');
const workbookSource=fs.readFileSync(new URL('../server/imports/racWorkbook.js',import.meta.url),'utf8');

test('números de reporte repetidos no se usan como clave única de conciliación',()=>{
  assert.equal(shouldMatchBySourceReportNumber({sourceReportNumber:'1',sourceNumberUnique:false}),false);
  assert.equal(shouldMatchBySourceReportNumber({sourceReportNumber:'1',sourceNumberUnique:true}),true);
});

test('el importador marca ocurrencia y unicidad del número de reporte',()=>{
  assert.match(workbookSource,/sourceNumberUnique:sourceRaw\?sourceCounts\.get\(source\)===1:true/);
  assert.match(workbookSource,/sourceNumberOccurrence:occurrence/);
  assert.match(workbookSource,/occurrence>1/);
});

test('la verificación final cuenta RACS únicos afectados y reporta filas consolidadas',()=>{
  assert.match(racsSource,/const touchedRacIds=new Set\(\)/);
  assert.match(racsSource,/const expectedUnique=touchedIds\.length/);
  assert.match(racsSource,/sourceRowsConsolidated/);
  assert.doesNotMatch(racsSource,/verified!==inserted\+updated/);
});

test('la compatibilidad del hotfix 4.0.31 se conserva en la versión actual',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.33');
});
