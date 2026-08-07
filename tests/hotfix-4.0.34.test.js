import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectHistoricalEvidenceTarget } from '../server/services/racReconciliation.js';

const memory=(overrides={})=>({
  old_rac_id:91,business_unit_id:4,source_report_number:'26',report_date:'2026-08-03',
  rac_snapshot:{business_unit:'OBRA CIVIL OPTIMUS',report_date:'2026-08-03',reporter_name:'BRAYAN ESPINOZA CAPCHA',location:'CAMPAMENTO',description:'SE EVIDENCIA QUE LOS CAMPAMENTOS NO CUENTAN CON EXTINTORES',...overrides},
  evidence_snapshot:[{stored_name:'evidencia-91.jpg',evidence_type:'FINAL'}]
});
const active=(id,overrides={})=>({id,business_unit_id:4,business_unit_name:'OBRA CIVIL OPTIMUS',report_date:'2026-08-03',source_report_number:String(id),reporter_name:'BRAYAN ESPINOZA CAPCHA',location:'CAMPAMENTO',description:'SE EVIDENCIA QUE LOS CAMPAMENTOS NO CUENTAN CON EXTINTORES',report_code:`OC-${id}`,...overrides});

test('evidencia histórica elige el RAC por texto reportante y lugar, no solo por descripción',()=>{
  const result=selectHistoricalEvidenceTarget(memory(),[
    active(35,{reporter_name:'FIDEL BRAVO ESPINOZA'}),
    active(26)
  ]);
  assert.equal(result.target.id,26);
  assert.match(result.method,/TEXTO|NUMERO/);
});

test('descripción repetida y sin señales suficientes queda ambigua',()=>{
  const row=memory({reporter_name:'',location:''});
  const result=selectHistoricalEvidenceTarget(row,[
    active(1,{reporter_name:'',location:'ZONA A'}),
    active(2,{reporter_name:'',location:'ZONA B'})
  ]);
  assert.equal(result.target,null);
  assert.equal(result.confidence,'AMBIGUOUS');
});

test('descripción exacta única puede recuperar una evidencia aunque el código haya cambiado',()=>{
  const row=memory({reporter_name:'',location:''});
  const result=selectHistoricalEvidenceTarget(row,[active(50,{reporter_name:'',location:'NUEVO LUGAR'})]);
  assert.equal(result.target.id,50);
  assert.equal(result.confidence,'UNIQUE_TEXT');
});

test('interfaz muestra descripción, contador y recuperación de evidencias',()=>{
  const page=fs.readFileSync(new URL('../public/js/pages/racs.js',import.meta.url),'utf8');
  assert.match(page,/Descripción \/ evidencias/);
  assert.match(page,/previewEvidenceRecovery/);
  assert.match(page,/evidence_count/);
  assert.match(page,/reconciliation\/evidence-recovery\/execute/);
});

test('recuperación está restringida a Máster y SSOMA mediante rac direct',()=>{
  const routes=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');
  assert.match(routes,/evidence-recovery\/preview',requireCapability\('rac:direct'\)/);
  assert.match(routes,/evidence-recovery\/execute',requireCapability\('rac:direct'\)/);
  assert.match(routes,/recoverHistoricalEvidence/);
});

test('versión corresponde a CAPSAN6 4.0.34',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.37');
});
