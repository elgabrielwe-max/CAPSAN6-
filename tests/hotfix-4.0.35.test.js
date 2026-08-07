import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listHistoricalEvidenceRecords } from '../server/services/racReconciliation.js';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');

test('existe API exclusiva para listar todas las evidencias históricas',()=>{
  const routes=read('../server/modules/racs.js');
  assert.match(routes,/reconciliation\/evidence-history',requireCapability\('rac:direct'\)/);
  assert.match(routes,/listHistoricalEvidenceRecords/);
});

test('servicio clasifica evidencias históricas por situación',()=>{
  const service=read('../server/services/racReconciliation.js');
  for(const status of ['ALREADY_PRESENT','REASSIGNABLE','INSERTABLE','AMBIGUOUS','UNMATCHED','CONFLICT'])assert.match(service,new RegExp(status));
  assert.match(service,/assetId/);
  assert.match(service,/targetCode/);
});


test('listado devuelve el archivo y su RAC destino seguro',async()=>{
  const memory={id:7,old_rac_id:90,business_unit_id:4,business_unit_name:'OBRA CIVIL OPTIMUS',source_report_number:'26',report_date:'2026-08-03',
    rac_snapshot:{report_code:'OC-ANTERIOR',business_unit:'OBRA CIVIL OPTIMUS',report_date:'2026-08-03',reporter_name:'BRAYAN ESPINOZA',location:'CAMPAMENTO',description:'CAMPAMENTO SIN EXTINTOR',status:'PENDIENTE'},
    evidence_snapshot:[{stored_name:'foto-90.jpg',original_name:'foto.jpg',evidence_type:'FINAL',mime_type:'image/jpeg'}]};
  const active={id:26,business_unit_id:4,business_unit_name:'OBRA CIVIL OPTIMUS',source_report_number:'26',report_date:'2026-08-03',reporter_name:'BRAYAN ESPINOZA',location:'CAMPAMENTO',description:'CAMPAMENTO SIN EXTINTOR',report_code:'OC-26'};
  const client={query:async sql=>{
    if(sql.includes('FROM rac_reconciliation_memory m'))return{rows:[memory]};
    if(sql.includes('FROM racs r')&&sql.includes('WHERE r.business_unit_id=ANY'))return{rows:[active]};
    if(sql.includes('FROM rac_evidence e'))return{rows:[]};
    if(sql.includes('FROM file_assets'))return{rows:[{id:501,stored_name:'foto-90.jpg',original_name:'foto.jpg',mime_type:'image/jpeg',business_unit_id:4}]};
    throw new Error(`Consulta inesperada: ${sql}`);
  }};
  const result=await listHistoricalEvidenceRecords(client,{businessUnitIds:[4]});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].status,'INSERTABLE');
  assert.equal(result.rows[0].assetId,501);
  assert.equal(result.rows[0].targetCode,'OC-26');
});

test('interfaz incluye pestaña y filtros del apartado de evidencias',()=>{
  const page=read('../public/js/pages/racs.js');
  assert.match(page,/data-tab="historical-evidence"/);
  assert.match(page,/Evidencias históricas de RACS/);
  assert.match(page,/historyEvidenceStatus/);
  assert.match(page,/Recuperar coincidencias seguras/);
  assert.match(page,/data-open-evidence/);
});

test('versión corresponde a CAPSAN6 4.0.38',()=>{
  const pkg=JSON.parse(read('../package.json'));
  assert.equal(pkg.version,'4.0.38');
});
