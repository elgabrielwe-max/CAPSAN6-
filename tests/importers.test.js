import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('importador de trabajadores reconoce el archivo real entregado',async()=>{
  const src=await read('server/imports/workerWorkbook.js');
  for(const alias of ['NOMBRES Y APELLIDOS','PUESTO','AREA','UNIDAD DE NEGOCIO'])assert.match(src,new RegExp(alias));
  assert.match(src,/areaColumnRepresentsUnit/);
  assert.match(src,/SIN ÁREA ASIGNADA/);
  assert.match(src,/DNI repetido dentro del archivo/);
});

test('importador RACS interpreta encabezados variables, fechas peruanas y repetidos',async()=>{
  const src=await read('server/imports/racWorkbook.js');
  for(const alias of ['N° DE REPORTE','AREA REPORTANTE','DESCRIPCION DEL RACS','TIPO DE DESVIACION','LEVANTAMIENTO'])assert.match(src,new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(src,/validDate\(year,m\[2\],m\[1\]\)/);
  assert.match(src,/números de reporte repetidos se conservarán como RACS independientes/);
  assert.match(src,/dominantPeriod/);
});

test('las importaciones son transaccionales y actualizan por claves estables',async()=>{
  const admin=await read('server/modules/admin.js');
  const racs=await read('server/modules/racs.js');
  assert.match(admin,/await tx\(async client/);
  assert.match(admin,/ON CONFLICT\(dni\) DO UPDATE/);
  assert.match(racs,/await tx\(async client/);
  assert.match(racs,/WHERE report_code=\$1/);
  assert.match(racs,/rac_import_batches/);
});
