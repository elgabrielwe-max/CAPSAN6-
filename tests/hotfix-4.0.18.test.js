import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('planes recientes permiten abrir el plan completo y sus evidencias asociadas',async()=>{
  const page=await read('public/js/pages/ssoma.js');
  assert.ok(page.includes('Ver plan completo'));
  assert.ok(page.includes('Objetivo completo'));
  assert.ok(page.includes('Actividades programadas'));
  assert.ok(page.includes('Evidencias de cumplimiento de la fecha'));
  assert.ok(page.includes('matchingEvidence'));
});

test('evidencias SSOMA tienen vista, descarga autenticada y archivo asociado',async()=>{
  const page=await read('public/js/pages/ssoma.js');
  const route=await read('server/modules/ssoma.js');
  assert.ok(page.includes('Ver evidencia'));
  assert.ok(page.includes("authorization:`Bearer ${session.token}`"));
  assert.ok(page.includes('downloadSsomaEvidence'));
  assert.ok(page.includes('evidence-expanded-image'));
  assert.ok(page.includes('evidence-expanded-pdf'));
  assert.ok(route.includes("entity_type='SSOMA_EVIDENCE'"));
  assert.ok(route.includes('fa.id asset_id'));
});
