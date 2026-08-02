import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE=path.resolve(__dirname,'../../templates/FLASH_REPORT_MODELO_OFICIAL.xls');
const clean=v=>String(v??'').trim();

function set(ws,cell,value){ws.getCell(cell).value=value??'';}
function actionLines(value){return clean(value).split(/\r?\n|\s*;\s*/).map(x=>x.replace(/^\d+[.)-]?\s*/, '').trim()).filter(Boolean).slice(0,5);}
function imageExtension(asset){const mime=String(asset.mime_type||'').toLowerCase();if(mime.includes('png'))return 'png';if(mime.includes('gif'))return 'gif';return 'jpeg';}

export async function buildFlashReportExcel(report,assets=[]){
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(await fs.readFile(TEMPLATE));
  const ws=wb.getWorksheet('Flash Report NV400')||wb.worksheets[0];
  ws.name='FLASH REPORT';

  set(ws,'D9',report.event_type||'INCIDENTE');
  set(ws,'N9',report.event_number||'');
  set(ws,'R9',report.potential_severity||report.risk_classification||'MEDIO');
  set(ws,'AD9',report.event_group||report.group_name||'SEGURIDAD');
  set(ws,'E15',report.event_date ? new Date(`${String(report.event_date).slice(0,10)}T12:00:00`) : '');
  ws.getCell('E15').numFmt='dd/mm/yyyy';
  set(ws,'L15',report.event_time||'');
  set(ws,'T15',report.place||'');
  set(ws,'AG15',report.area_name||report.area||'');
  set(ws,'N17',report.business_unit_name||report.business_unit||'CANDELARIA');
  set(ws,'AC17',report.company||'');
  set(ws,'L23',report.involved_person||'');
  set(ws,'AB23',report.involved_position||'');
  set(ws,'J27',report.immediate_supervisor||'');
  set(ws,'AB27',report.supervisor_position||'SUPERVISOR');
  set(ws,'B30','3. DESCRIPCIÓN DEL EVENTO');
  set(ws,'C32',report.event_description||'');
  set(ws,'C41',report.damage_description||report.medical_diagnosis||'');

  const actions=actionLines(report.immediate_actions||report.corrective_actions);
  for(let i=0;i<5;i++){
    set(ws,`C${63+i}`,actions[i]?`${i+1}.-`:'');
    set(ws,`D${63+i}`,actions[i]||'');
  }

  const usable=[];
  for(const asset of assets.slice(0,2)){
    try{if(asset.local_path){await fs.access(asset.local_path);usable.push(asset);}}catch{}
  }
  for(let i=0;i<usable.length;i++){
    const asset=usable[i];
    const imageId=wb.addImage({filename:asset.local_path,extension:imageExtension(asset)});
    const col=i===0?1:20;
    ws.addImage(imageId,{tl:{col,row:46},ext:{width:430,height:185},editAs:'oneCell'});
  }

  // Mantiene las listas de validación del modelo y actualiza el catálogo visible.
  const data=wb.getWorksheet('DATOS');
  if(data){
    set(data,'E11',report.business_unit_name||report.business_unit||'CANDELARIA');
  }
  wb.creator='CAPSAN6';wb.lastModifiedBy='CAPSAN6';wb.subject='Flash Report SSOMA';
  return wb.xlsx.writeBuffer();
}
