import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('la base relacional conecta todos los módulos SSOMA', async()=>{
  const schema=await read('server/schema.js');
  for(const table of ['business_units','business_unit_areas','user_business_units','workers','trainings','training_targets','grades','racs','rac_assignments','rac_evidence','environmental_metrics','ssoma_work_plans','ssoma_evidence','flash_reports','file_assets','public_share_links','audit_log']){
    assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`),table);
  }
  assert.match(schema,/workers[\s\S]*business_unit_id INTEGER REFERENCES business_units/);
  assert.match(schema,/training_targets[\s\S]*business_unit_id INTEGER NOT NULL REFERENCES business_units/);
  assert.match(schema,/racs[\s\S]*business_unit_id INTEGER REFERENCES business_units/);
});

test('el servidor expone solo los módulos del nuevo sistema',async()=>{
  const app=await read('server/app.js');
  for(const route of ['/api/trainings','/api/racs','/api/environment','/api/ssoma','/api/incidents','/api/reports'])assert.match(app,new RegExp(route.replaceAll('/','\\/')));
  assert.doesNotMatch(app,/command.?center|management360|ccMetric/i);
});

test('la navegación contiene el alcance funcional aprobado',async()=>{
  const app=await read('public/js/app.js');
  for(const label of ['Capacitación','RAC','Gestión','Medio ambiente','Plan diario y evidencias','Descarga de recursos','Incidentes y accidentes','Trabajadores e importaciones'])assert.match(app,new RegExp(label,'i'));
  assert.doesNotMatch(app,/COMMAND CENTER|Gestión 360/i);
});

test('solo existe un PPT oficial de RACS, sin presentaciones interactivas o grupales',async()=>{
  const files=[await read('server/modules/reports.js'),await read('public/js/pages/ssoma.js'),await read('public/js/pages/training.js')].join('\n');
  assert.match(files,/racs\/executive\.pptx/);
  assert.doesNotMatch(files,/interactive|interactivo|grupal|training\/executive\.pptx/i);
});

test('las plantillas funcionales y recursos compactos se incluyen en el proyecto',async()=>{
  for(const file of ['templates/FLASH_REPORT_MODELO_OFICIAL.xls','templates/FLASH_REPORT_REFERENCIA.docx','templates/EJEMPLO_BASE_TRABAJADORES.xlsx','templates/assets/optimus-logo.png','templates/assets/optimus-wave-wide.png'])await access(new URL(`../${file}`,import.meta.url));
  const generator=await read('server/reports/racExecutive.js');
  assert.match(generator,/defineLayout\(\{name:'CAPSAN6_WIDE'/);
  assert.match(generator,/U\.E\.A CANDELARIA CHANCA/);
});

test('Drive utiliza estructura automática y registro de archivos',async()=>{
  const drive=await read('server/services/drive.js');
  assert.match(drive,/CAPSAN6/);
  assert.match(drive,/business_unit_name/);
  assert.match(drive,/entity_type/);
  assert.match(drive,/file_assets/);
});

test('Flash Report rellena el modelo Excel oficial en sus celdas institucionales',async()=>{
  const flash=await read('server/reports/flashReport.js');
  assert.match(flash,/FLASH_REPORT_MODELO_OFICIAL\.xls/);
  for(const cell of ['D9','R9','AD9','E15','T15','N17','L23','AB23','J27','C32','C41'])assert.match(flash,new RegExp(`['\"]${cell}['\"]`));
  assert.match(flash,/addImage/);
});
