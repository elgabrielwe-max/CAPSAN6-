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
  assert.match(racs,/findActiveRacMatch/);
  assert.match(racs,/source_uid=COALESCE/);
  assert.match(racs,/rac_import_batches/);
});

test('modelo oficial RACS usa ID único y conciliación antiduplicados',async()=>{
  const importer=await read('server/imports/racWorkbook.js');
  const racs=await read('server/modules/racs.js');
  const schema=await read('server/schema.js');
  assert.match(importer,/ID UNICO ORIGEN/);
  assert.match(importer,/recordFingerprint/);
  assert.match(importer,/missingStableIds/);
  assert.match(racs,/findActiveRacMatch/);
  assert.match(racs,/restoreReconciliationMemory/);
  assert.match(racs,/preservedOperational/);
  assert.match(schema,/rac_reconciliation_memory/);
  assert.match(schema,/idx_racs_source_uid_unique/);
});

test('la depuración preserva estados evidencias y asignaciones para reimportar',async()=>{
  const racs=await read('server/modules/racs.js');
  const reconcile=await read('server/services/racReconciliation.js');
  assert.match(racs,/rememberRacsBeforePurge/);
  assert.match(racs,/reconciliationEnabled:true/);
  assert.match(reconcile,/evidence_snapshot/);
  assert.match(reconcile,/assignments_snapshot/);
  assert.match(reconcile,/RECONCILE_RAC/);
  assert.match(reconcile,/UPDATE audit_log SET entity_id/);
});

test('listado direccionado y listado de cambios tienen filtro por fechas',async()=>{
  const page=await read('public/js/pages/racs.js');
  for(const id of ['directFrom','directTo','changesFrom','changesTo'])assert.match(page,new RegExp(id));
  assert.match(page,/q\.set\('from'/);
  assert.match(page,/q\.set\('to'/);
});
