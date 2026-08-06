import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('4.0.24 expone endpoint PPT Control RACS por unidad',()=>{
  const reports=read('server/modules/reports.js');
  assert.match(reports,/\/racs\/control\.pptx/);
  assert.match(reports,/buildRacControlPpt/);
  assert.match(reports,/CAPSAN6_CONTROL_RACS_POR_UNIDAD\.pptx/);
});

test('4.0.24 agrega botón PPT Control RACS por unidad en recursos',()=>{
  const ssoma=read('public/js/pages/ssoma.js');
  assert.match(ssoma,/racControlPpt/);
  assert.match(ssoma,/PPT Control RACS por unidad/);
  assert.match(ssoma,/\/api\/reports\/racs\/control\.pptx/);
});

test('4.0.24 constructor PPT de control usa modelo corporativo y láminas gerenciales',()=>{
  const report=read('server/reports/racControl.js');
  assert.match(report,/CONTROL EJECUTIVO RACS POR UNIDAD/);
  assert.match(report,/ANÁLISIS EJECUTIVO DE CIERRE Y SUSTENTO/);
  assert.match(report,/RACS VENCIDOS/);
  assert.match(report,/LEVANTADOS SIN SUSTENTO/);
  assert.match(report,/optimus-logo\.png/);
});

test('la funcionalidad 4.0.24 permanece incluida en la versión actual',()=>{
  assert.match(read('server/app.js'),/4\.0\.24-PPT-CONTROL-RACS-POR-UNIDAD/);
  assert.match(read('server/index.js'),/CAPSAN6 4\.0\.29 ejecutándose/);
  assert.match(read('package.json'),/"version": "4\.0\.29"/);
});
