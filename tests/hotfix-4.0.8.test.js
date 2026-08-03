import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('seguimiento RACS tipa los parámetros PostgreSQL sin reutilización ambigua',async()=>{
  const source=await read('server/modules/racs.js');
  assert.match(source,/WITH input AS/);
  assert.match(source,/\$1::varchar AS target_status/);
  assert.match(source,/\$2::int AS target_progress/);
  assert.doesNotMatch(source,/status=\$1,progress_percent=\$2,first_attention_at=CASE WHEN \$1/);
});

test('PPT de jefatura incluye los tres gráficos oficiales y los once campos',async()=>{
  const source=await read('server/reports/racExecutive.js');
  for(const token of ['REPORTES/TRABAJADOR','% ACUMULADO','SUPERVISORES QUE ENTREGARON RACS','ÁREAS REPORTANTES','TIPO DE DESVIACION','SUPERVISOR ACARGO DE LA ENTREGA','pendingCharts','addChart(\'pie\''])assert.ok(source.includes(token),token);
  assert.match(source,/const header=\['AREA REPORTANTE','DATOS DEL REPORTANTE','LUGAR DE REPORTE','AREA REPORTADA','FECHA','NIVEL DE RIESGO','TIPO DE REPORTE','TIPO DE DESVIACION','DESCRIPCION DEL RAC´S','SUPERVISOR ACARGO DE LA ENTREGA','% LEVANTAMIENTO'\]/);
});

test('notas se limitan a tema, unidad y áreas asignadas y el valor predeterminado es 16',async()=>{
  const server=await read('server/modules/trainings.js');
  const ui=await read('public/js/pages/training.js');
  assert.match(server,/targetScope/);
  assert.match(server,/w\.area_id=ANY\(\$3::int\[\]\)/);
  assert.match(ui,/Unidad asignada/);
  assert.match(ui,/Área asignada/);
  assert.match(ui,/name="approvedMin" value="16"/);
});

test('importador multiperiodo permite todo, dominante o periodo específico',async()=>{
  const server=await read('server/modules/racs.js');
  const ui=await read('public/js/pages/racs.js');
  assert.match(server,/periodMode==='DOMINANT'/);
  assert.match(server,/periodMode==='PERIOD'/);
  assert.match(ui,/Importar todos los periodos/);
  assert.match(ui,/Importar solo el mes dominante/);
});
