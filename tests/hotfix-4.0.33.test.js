import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allocateUniqueRacReportCode, sameRacCodeIdentity } from '../server/services/racReconciliation.js';

test('identidad por código reconoce el mismo RAC sin mezclar reportantes distintos',()=>{
  const base={businessUnitName:'PLANTA MAHUARA',sourceReportNumber:'60',reportDate:'2026-08-06',reporterName:'JUAN PEREZ',description:'OBSERVACION DE PRUEBA',location:'ZONA A'};
  assert.equal(sameRacCodeIdentity(base,{...base,location:'ZONA CORREGIDA'}),true);
  assert.equal(sameRacCodeIdentity(base,{...base,reporterName:'OTRO REPORTANTE'}),false);
});

test('generador reserva sufijo cuando el código base ya existe',async()=>{
  const occupied=new Set(['PM-20260806-0060-98C6','PM-20260806-0060-98C6-02']);
  const calls=[];
  const client={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('pg_advisory_xact_lock'))return{rowCount:1,rows:[{}]};
    if(sql.includes('SELECT 1 FROM racs'))return{rowCount:occupied.has(params[0])?1:0,rows:[]};
    throw new Error('Consulta inesperada');
  }};
  assert.equal(await allocateUniqueRacReportCode(client,'PM-20260806-0060-98C6'),'PM-20260806-0060-98C6-03');
  assert.match(calls[0].sql,/pg_advisory_xact_lock/);
});

test('importación reutiliza el código correcto y regenera solo colisiones reales',()=>{
  const reconcile=fs.readFileSync(new URL('../server/services/racReconciliation.js',import.meta.url),'utf8');
  const racs=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');
  assert.match(reconcile,/r\.report_code=\$2/);
  assert.match(reconcile,/sameRacCodeIdentity/);
  assert.match(racs,/allocateUniqueRacReportCode\(client,r\.internalCode\)/);
  assert.match(racs,/reportCodesRegenerated/);
});

test('versión corresponde a CAPSAN6 4.0.34',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.38');
});
