import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('4.0.25 agrega expediente documental en planificación de capacitación',()=>{
  const front=read('public/js/pages/training.js');
  assert.match(front,/Lista de asistentes \/ documento rellenado/);
  assert.match(front,/trainingDocumentManager/);
  assert.match(front,/Documentos/);
  assert.match(front,/training-card-grid/);
  assert.match(front,/Ver detalle/);
});

test('4.0.25 acepta PDF imagen Word y Excel para asistencia',()=>{
  const back=read('server/modules/trainings.js');
  assert.match(back,/isTrainingDocument/);
  assert.match(back,/PDF, imagen, Word o Excel/);
  assert.match(back,/business_unit_name/);
  assert.match(back,/attendance_files/);
});

test('4.0.25 incorpora vista previa autenticada de archivos',()=>{
  const api=read('public/js/api.js');
  assert.match(api,/export async function preview/);
  assert.match(api,/window\.open/);
  assert.match(api,/startsWith\('image\/'\)/);
});

test('la funcionalidad 4.0.25 permanece incluida y usa el caché actual',()=>{
  assert.match(read('server/index.js'),/CAPSAN6 4\.0\.33 ejecutándose/);
  assert.match(read('server/app.js'),/4\.0\.25-DOCUMENTOS-CAPACITACION-Y-VISTA-COMPACTA/);
  assert.match(read('package.json'),/"version": "4\.0\.33"/);
  assert.match(read('public/index.html'),/v=4031/);
  assert.match(read('public/js/app.js'),/training\.js\?v=4031/);
});
