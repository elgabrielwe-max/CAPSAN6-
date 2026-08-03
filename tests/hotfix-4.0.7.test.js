import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveRacCauseSelection } from '../server/services/racCatalog.js';
import { isoReportDate, reportPeriod } from '../server/services/reportDates.js';

const read=p=>fs.readFile(new URL(`../${p}`,import.meta.url),'utf8');

function catalogClient(){
  return{
    async query(sql){
      if(sql.includes('FROM rac_cause_categories'))return{rows:[
        {id:1,code:'V',name:'CONDICIONES DE TRABAJO',report_type:'CONDICION SUBESTANDAR',sort_order:5},
        {id:2,code:'VII',name:'FACTORES HUMANOS (ACTOS SUBESTÁNDAR)',report_type:'ACTO SUBESTANDAR',sort_order:7}
      ]};
      if(sql.includes('FROM rac_cause_subtypes'))return{rows:[
        {id:10,category_id:1,name:'DEFICIENCIA DE VENTILACIÓN',is_custom:false,sort_order:1},
        {id:20,category_id:2,name:'NO USO DE EPP',is_custom:false,sort_order:1}
      ]};
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
}

test('causa y tipo de reporte se registran de forma independiente',async()=>{
  const selected=await resolveRacCauseSelection(catalogClient(),{
    reportType:'ACTO SUBESTANDAR',categoryId:1,subtypeId:10,fallbackText:'ventilación deficiente'
  });
  assert.equal(selected.category.code,'V');
  assert.equal(selected.subtype.name,'DEFICIENCIA DE VENTILACIÓN');
  assert.equal(selected.reportType,'ACTO SUBESTANDAR');
  assert.equal(selected.typeMismatch,true);
});

test('periodo del PPT normaliza fechas DATE de PostgreSQL',()=>{
  const date=new Date('2026-08-01T00:00:00.000Z');
  assert.equal(isoReportDate(date),'2026-08-01');
  assert.deepEqual(reportPeriod([{report_date:date}],{}),{from:'2026-08-01',to:'2026-08-01'});
  assert.deepEqual(reportPeriod([{report_date:'2026-08-17'}],{}),{from:'2026-08-01',to:'2026-08-17'});
});

test('importador conserva el tipo de reporte del Excel y reportes manejan errores sin tumbar Railway',async()=>{
  const [racs,reports,front]=await Promise.all([read('server/modules/racs.js'),read('server/modules/reports.js'),read('public/js/pages/racs.js')]);
  assert.match(racs,/canonicalRacReportType\(r\.reportType\)\|\|selectedCause\.reportType/);
  assert.doesNotMatch(racs,/r\.riskLevel,selectedCause\.category\.reportType/);
  assert.match(reports,/const asyncRoute=handler/);
  assert.match(reports,/executive\.pptx',asyncRoute\(async/);
  assert.match(front,/const availableCategories=\(\)=>catalog/);
});
