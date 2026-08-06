import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRacFingerprints, chooseBestReconciliationSnapshot } from '../server/services/racReconciliation.js';

test('la huella del RAC no depende del código interno',()=>{
  const base={businessUnitName:'OBRA CIVIL OPTIMUS',reportDate:'2026-08-06',reporterName:'JUAN PEREZ',description:'SE OBSERVA MATERIAL EN EL ACCESO',location:'NV 440'};
  const a=buildRacFingerprints({...base,reportCode:'OC-001'});
  const b=buildRacFingerprints({...base,reportCode:'OTRO-CODIGO'});
  assert.equal(a.recordFingerprint,b.recordFingerprint);
  assert.equal(a.contentFingerprint,b.contentFingerprint);
});

test('la conciliación elige el estado operativo más avanzado',()=>{
  const best=chooseBestReconciliationSnapshot([
    {rac_snapshot:{status:'PENDIENTE',progress_percent:0},evidence_snapshot:[]},
    {rac_snapshot:{status:'EN PROCESO',progress_percent:50},evidence_snapshot:[{id:1}]},
    {rac_snapshot:{status:'LEVANTADO',progress_percent:100},evidence_snapshot:[]},
  ]);
  assert.equal(best.rac_snapshot.status,'LEVANTADO');
});
