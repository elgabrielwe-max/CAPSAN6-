import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=p=>fs.readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('registro de notas incorpora búsqueda y carga PDF de asistentes',async()=>{
  const [front,back,schema]=await Promise.all([read('public/js/pages/training.js'),read('server/modules/trainings.js'),read('server/schema.js')]);
  assert.match(front,/rosterSearch/);
  assert.match(front,/attendancePdf/);
  assert.match(front,/uploadAttendancePdf/);
  assert.match(back,/attendance-files/);
  assert.match(back,/application\/pdf/);
  assert.match(schema,/training_attendance_files/);
});

test('lote de importación RACS no reutiliza parámetros con tipos incompatibles',async()=>{
  const racs=await read('server/modules/racs.js');
  assert.match(racs,/VALUES\(\$1::text,\$2::text,\$3::int,\$4::int/);
  assert.doesNotMatch(racs,/VALUES\(\$1,\$1,\$2,\$3/);
});

test('PPT oficial replica los indicadores y gráficos del modelo institucional',async()=>{
  const ppt=await read('server/reports/racExecutive.js');
  for(const token of ['CHARLA DE 5 MINUTOS','REPORTES/TRABAJADOR','SUPERVISORES QUE ENTREGARON RACS','ÁREAS REPORTANTES','RACS LEVANTAMIENTO','MEDIDA CORRECTIVA'])assert.match(ppt,new RegExp(token));
  assert.match(ppt,/defineLayout\(\{name:'CAPSAN6_4X3',width:10,height:7\.5\}\)/);
  assert.match(ppt,/addSplitChart/);
  assert.match(ppt,/addEvidenceSlides/);
});
