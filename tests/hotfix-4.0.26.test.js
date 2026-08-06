import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('4.0.26 crea trazabilidad y área de direccionamiento en PostgreSQL',()=>{
  const schema=read('server/schema.js');
  assert.match(schema,/directed_area_id INTEGER/);
  assert.match(schema,/direction_reason TEXT/);
  assert.match(schema,/directed_by INTEGER/);
  assert.match(schema,/directed_at TIMESTAMPTZ/);
  assert.match(schema,/idx_racs_direction/);
  assert.match(schema,/4\.0\.26/);
});

test('4.0.26 restringe Listado direccionado a Máster y SSOMA',()=>{
  const permissions=read('server/permissions.js');
  const master=permissions.match(/MASTER:\s*\[(.*?)\]/s)?.[1]||'';
  const ssoma=permissions.match(/SSOMA:\s*\[(.*?)\]/s)?.[1]||'';
  const supervisor=permissions.match(/SUPERVISOR:\s*\[(.*?)\]/s)?.[1]||'';
  assert.match(master,/rac:direct/);
  assert.match(master,/rac:edit/);
  assert.match(ssoma,/rac:direct/);
  assert.match(ssoma,/rac:edit/);
  assert.doesNotMatch(supervisor,/rac:direct/);
  assert.doesNotMatch(supervisor,/rac:edit/);
});

test('4.0.26 expone endpoints protegidos para direccionar, editar y crear tipos de causa',()=>{
  const backend=read('server/modules/racs.js');
  assert.match(backend,/post\('\/cause-categories',requireCapability\('rac:catalog\.manage'\)/);
  assert.match(backend,/get\('\/directed',requireCapability\('rac:direct'\)/);
  assert.match(backend,/patch\('\/:id\/direction',requireCapability\('rac:direct'\)/);
  assert.match(backend,/DIRECT_RAC/);
  assert.match(backend,/EDIT_RAC/);
});

test('4.0.26 añade Listado direccionado y editor integral en la interfaz',()=>{
  const front=read('public/js/pages/racs.js');
  assert.match(front,/Listado direccionado/);
  assert.match(front,/can\('rac:direct'\)/);
  assert.match(front,/directionModal/);
  assert.match(front,/Área direccionada/);
  assert.match(front,/¿Por qué se direcciona a esta área?/);
  assert.match(front,/Nuevo tipo de causa/);
  assert.match(front,/Nueva subcausa/);
});

test('4.0.26 permite crear categorías de causa personalizadas',()=>{
  const catalog=read('server/services/racCatalog.js');
  assert.match(catalog,/createRacCauseCategory/);
  assert.match(catalog,/is_custom/);
  assert.match(catalog,/toRoman/);
});

test('4.0.26 queda versionado y renueva recursos web',()=>{
  assert.match(read('server/index.js'),/CAPSAN6 4\.0\.28 ejecutándose/);
  assert.match(read('server/app.js'),/4\.0\.26-LISTADO-DIRECCIONADO-EDICION-RACS-CATALOGO-TIPOS-DE-CAUSA/);
  assert.match(read('package.json'),/"version": "4\.0\.28"/);
  assert.match(read('public/index.html'),/v=4028/);
  assert.match(read('public/js/app.js'),/racs\.js\?v=4028/);
});
