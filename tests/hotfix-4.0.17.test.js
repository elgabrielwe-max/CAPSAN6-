import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PPT ejecutivo RACS es exclusivo de RACS y ya no inserta charla de 5 minutos',async()=>{
  const report=await read('server/reports/racExecutive.js');
  const route=await read('server/modules/reports.js');
  const buildBody=report.slice(report.indexOf('export async function buildRacExecutivePpt'));
  assert.ok(report.includes('REPORTE EJECUTIVO RACS'));
  assert.ok(report.includes('addExecutiveOverviewSlide'));
  assert.ok(buildBody.includes('addExecutiveOverviewSlide(pptx,data,info)'));
  assert.ok(!buildBody.includes('addTrainingSlide'));
  assert.ok(route.includes('CAPSAN6_REPORTE_EJECUTIVO_RACS.pptx'));
  assert.ok(!route.match(/trainingCalendar:await trainingCalendar/));
});

test('PPT ejecutivo RACS separa correctamente reporte diario y acumulado',async()=>{
  const report=await read('server/reports/racExecutive.js');
  assert.ok(report.includes('durante el ${info.long}'));
  assert.ok(report.includes('Acumulado del mes: ${two(cumulativeTotal)} RACS.'));
  assert.ok(report.includes('condiciones de alto potencial'));
  assert.ok(report.includes("CAPSAN6_WIDE"));
  assert.ok(report.includes('pendingCharts(slide,pendingScopeRows)'));
  assert.ok(report.includes('addDetailSlide(pptx,u,info,detailSource.slice(i*pageSize,(i+1)*pageSize),i+1,totalPages,detailSource)'));
});
