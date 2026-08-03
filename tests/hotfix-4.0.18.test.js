import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PPT RACS usa formato gerencial panorámico y gráficos visibles',async()=>{
  const report=await read('server/reports/racExecutive.js');
  assert.ok(report.includes("width:13.333,height:7.5"));
  assert.ok(report.includes('paretoSvg(items)'));
  assert.ok(report.includes('stackedSvg(items'));
  assert.ok(report.includes('CONDICIÓN SUBESTÁNDAR'));
  assert.ok(report.includes('ACTO SUBESTÁNDAR'));
  assert.ok(!report.includes("CAPSAN6_4X3"));
});

test('Resumen y comparativo diario conservan textos gerenciales',async()=>{
  const report=await read('server/reports/racExecutive.js');
  assert.ok(report.includes('NUMERO DE REPORTES A LA FECHA'));
  assert.ok(report.includes('Se reportaron ${two(u.total)} RACS hasta la fecha ${info.long}.'));
  assert.ok(report.includes('SUPERVISORES QUE ENTREGARON RACS EL'));
  assert.ok(report.includes('ÁREAS REPORTANTES DEL'));
});
