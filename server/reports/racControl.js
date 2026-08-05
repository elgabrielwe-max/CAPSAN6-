import ExcelJS from 'exceljs';
import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const C={navy:'17324D',teal:'138F8A',green:'2E8B57',amber:'F5A623',red:'C0392B',light:'EEF4F7',white:'FFFFFF',ink:'1F2933'};
const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;

function styleHeader(row,color=C.navy){
  row.font={bold:true,color:{argb:C.white}};
  row.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};
  row.alignment={vertical:'middle',horizontal:'center',wrapText:true};
}
function styleRows(sheet,start=2){
  for(let r=start;r<=sheet.rowCount;r++){
    const row=sheet.getRow(r);
    row.alignment={vertical:'top',wrapText:true};
    if(r%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F7FAFC'}};
  }
}
function addDetailSheet(workbook,name,rows){
  const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[
    {header:'RAC',key:'report_code',width:20},{header:'Unidad',key:'business_unit',width:26},{header:'Fecha',key:'report_date',width:13},
    {header:'Vencimiento',key:'due_date',width:13},{header:'Riesgo',key:'risk_level',width:11},{header:'Estado',key:'status',width:25},
    {header:'Supervisor',key:'supervisor_name',width:28},{header:'Área reportante',key:'reporting_area',width:24},
    {header:'Lugar',key:'location',width:28},{header:'Descripción',key:'description',width:65},{header:'Días vencido',key:'days_overdue',width:13},
    {header:'Evidencia final',key:'has_final_evidence',width:16},{header:'Requiere evidencia',key:'evidence_required',width:18},
    {header:'Tipo de sustento',key:'closure_support',width:20},{header:'Justificación de excepción',key:'evidence_exemption_reason',width:45},
  ];
  styleHeader(sheet.getRow(1));
  rows.forEach(row=>sheet.addRow({...row,has_final_evidence:row.has_final_evidence?'SÍ':'NO',evidence_required:row.evidence_required?'SÍ':'NO',closure_support:row.has_final_evidence?'EVIDENCIA':(!row.evidence_required?'NO REQUIERE EVIDENCIA':'SIN SUSTENTO')}));
  styleRows(sheet);
  sheet.autoFilter={from:'A1',to:'O1'};
  return sheet;
}

export async function buildRacControlExcel(summaryRows=[],detailRows=[],label=''){
  const workbook=new ExcelJS.Workbook();
  workbook.creator='CAPSAN6';
  workbook.subject='Control de plazos y estados RACS por unidad';
  const sheet=workbook.addWorksheet('CONTROL POR UNIDAD',{views:[{state:'frozen',ySplit:6,showGridLines:false}]});
  sheet.columns=[
    {width:28},{width:12},{width:12},{width:12},{width:12},{width:12},{width:12},{width:14},{width:18},{width:18},
    {width:18},{width:15},{width:15},{width:15},{width:17},{width:17},{width:16},{width:15},{width:14},{width:14},{width:14}
  ];
  sheet.mergeCells('A1:U2');
  const title=sheet.getCell('A1');title.value='CONTROL EJECUTIVO RACS POR UNIDAD';title.font={size:22,bold:true,color:{argb:C.white}};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};title.alignment={horizontal:'center',vertical:'middle'};
  sheet.mergeCells('A3:U3');sheet.getCell('A3').value=label;sheet.getCell('A3').alignment={horizontal:'center'};
  sheet.mergeCells('A4:U4');sheet.getCell('A4').value='Plazos: ALTO 0–48 horas · MEDIO 1–3 días · BAJO 1–4 días';sheet.getCell('A4').font={bold:true,color:{argb:C.red}};sheet.getCell('A4').alignment={horizontal:'center'};
  const headers=['Unidad','Trabajadores','RACS','Actos','Condiciones','Alto','Medio','Bajo','Pendientes','En proceso','Pend. validación','Devueltos','Levantados','Lev. con evidencia','No requiere evidencia','Lev. sin sustento','Cierres sustentados','Vencidos','Vence hoy','Alto vencido','% cierre'];
  headers.forEach((h,i)=>sheet.getCell(6,i+1).value=h);styleHeader(sheet.getRow(6));
  for(const row of summaryRows){
    sheet.addRow([row.unit,row.workers,row.total,row.acts,row.conditions,row.high,row.medium,row.low,row.pending,row.in_process,row.pending_validation,row.returned,row.lifted,row.lifted_with_evidence,row.lifted_no_evidence_required,row.lifted_without_evidence,Number(row.lifted_with_evidence||0)+Number(row.lifted_no_evidence_required||0),row.overdue,row.due_today,row.high_overdue,pct(row.lifted,row.total)]);
  }
  styleRows(sheet,7);
  for(let r=7;r<=sheet.rowCount;r++)sheet.getCell(r,21).numFmt='0"%"';
  sheet.autoFilter={from:'A6',to:'U6'};
  const total=summaryRows.reduce((a,r)=>{for(const key of ['workers','total','acts','conditions','high','medium','low','pending','in_process','pending_validation','returned','lifted','lifted_with_evidence','lifted_no_evidence_required','lifted_without_evidence','overdue','due_today','high_overdue'])a[key]=(a[key]||0)+Number(r[key]||0);return a;},{});
  const totalRow=sheet.addRow(['TOTAL',total.workers,total.total,total.acts,total.conditions,total.high,total.medium,total.low,total.pending,total.in_process,total.pending_validation,total.returned,total.lifted,total.lifted_with_evidence,total.lifted_no_evidence_required,total.lifted_without_evidence,Number(total.lifted_with_evidence||0)+Number(total.lifted_no_evidence_required||0),total.overdue,total.due_today,total.high_overdue,pct(total.lifted,total.total)]);
  totalRow.font={bold:true,color:{argb:C.white}};totalRow.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.teal}};totalRow.alignment={horizontal:'center'};totalRow.getCell(21).numFmt='0"%"';

  addDetailSheet(workbook,'RACS VENCIDOS',detailRows.filter(x=>x.is_overdue));
  addDetailSheet(workbook,'PENDIENTES VALIDACION',detailRows.filter(x=>x.status==='PENDIENTE DE VALIDACION'));
  addDetailSheet(workbook,'NO REQUIERE EVIDENCIA',detailRows.filter(x=>x.status==='LEVANTADO'&&!x.evidence_required));
  addDetailSheet(workbook,'LEV. SIN SUSTENTO',detailRows.filter(x=>x.status==='LEVANTADO'&&x.evidence_required&&!x.has_final_evidence));
  addDetailSheet(workbook,'RIESGO ALTO',detailRows.filter(x=>x.risk_level==='ALTO'));
  return workbook.xlsx.writeBuffer();
}


const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR=path.resolve(__dirname,'../../templates/assets');
const LOGO=path.join(ASSET_DIR,'optimus-logo.png');
const WAVE=path.join(ASSET_DIR,'optimus-wave-wide.png');
const B={orange:'F36C0A',orange2:'F7B267',navy:'002060',blue:'4472C4',teal:'138F8A',green:'00B050',red:'C00000',amber:'F4B183',gray:'D9E2F3',light:'F7F7F7',white:'FFFFFF',ink:'1F1F1F',muted:'667085'};
const n=value=>Number(value||0);
const safeText=value=>String(value??'').trim();
const dateText=value=>{if(!value)return '—';const s=String(value).slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s;};
const supportTotal=row=>n(row.lifted_with_evidence)+n(row.lifted_no_evidence_required);

function aggregateControl(rows){
  const keys=['workers','total','acts','conditions','high','medium','low','pending','in_process','pending_validation','returned','lifted','lifted_with_evidence','lifted_no_evidence_required','lifted_without_evidence','overdue','due_today','high_overdue'];
  const total=Object.fromEntries(keys.map(key=>[key,0]));
  for(const row of rows)for(const key of keys)total[key]+=n(row[key]);
  total.supported=total.lifted_with_evidence+total.lifted_no_evidence_required;
  total.closure=pct(total.lifted,total.total);
  return total;
}
function addCorporateHeader(slide,title,subtitle=''){
  slide.background={color:B.white};
  slide.addShape('rect',{x:0,y:0,w:10,h:0.86,fill:{color:'F3C18E'},line:{color:'F3C18E'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.42,w:10,h:0.48,transparency:4});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:0.16,y:0.06,w:1.25,h:0.49,transparency:0});
  slide.addText(title,{x:1.55,y:0.13,w:7.9,h:0.28,fontFace:'Arial',fontSize:14,bold:true,color:B.navy,align:'center',margin:0,fit:'shrink'});
  if(subtitle)slide.addText(subtitle,{x:1.55,y:0.48,w:7.9,h:0.18,fontFace:'Arial',fontSize:6.7,color:B.muted,align:'center',margin:0,fit:'shrink'});
  slide.addShape('line',{x:0.2,y:7.18,w:9.6,h:0,line:{color:'D9D9D9',pt:0.5}});
  slide.addText('CAPSAN6 · SISTEMA INTEGRAL DE GESTIÓN SSOMA',{x:0.25,y:7.22,w:6.5,h:0.13,fontFace:'Arial',fontSize:5.5,color:B.muted,margin:0});
  slide.addText('U.E.A CANDELARIA CHANCA',{x:7.0,y:7.22,w:2.75,h:0.13,fontFace:'Arial',fontSize:5.5,bold:true,color:B.red,align:'right',margin:0});
}
function addCard(slide,x,y,w,h,label,value,color,sub=''){
  slide.addShape('roundRect',{x,y,w,h,rectRadius:0.08,fill:{color:B.white},line:{color:'D6E0E7',pt:0.75},shadow:{type:'outer',color:'C7D1DA',opacity:0.14,blur:1.5,angle:45,distance:1}});
  slide.addShape('arc',{x:x+w-0.48,y:y-0.02,w:0.5,h:0.5,adjustPoint:0.25,rotate:0,fill:{color,transparency:72},line:{color,transparency:100}});
  slide.addText(label,{x:x+0.12,y:y+0.12,w:w-0.24,h:0.17,fontFace:'Arial',fontSize:6.7,bold:true,color:'40546A',margin:0,fit:'shrink'});
  slide.addText(String(value),{x:x+0.12,y:y+0.38,w:w-0.24,h:0.34,fontFace:'Arial',fontSize:18,bold:true,color,margin:0,fit:'shrink'});
  if(sub)slide.addText(sub,{x:x+0.12,y:y+h-0.25,w:w-0.24,h:0.12,fontFace:'Arial',fontSize:5.4,color:B.muted,margin:0,fit:'shrink'});
}
function addCover(pptx,label){
  const slide=pptx.addSlide();slide.background={color:B.white};
  slide.addShape('rect',{x:0,y:0,w:10,h:1.18,fill:{color:'F3C18E'},line:{color:'F3C18E'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.56,w:10,h:0.55,transparency:3});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:3.25,y:1.65,w:3.5,h:1.38});
  slide.addText('SEGURIDAD Y SALUD OCUPACIONAL',{x:1.2,y:3.35,w:7.6,h:0.25,fontFace:'Arial',fontSize:13,bold:true,color:B.red,align:'center',margin:0});
  slide.addText('CONTROL EJECUTIVO RACS POR UNIDAD',{x:0.7,y:3.86,w:8.6,h:0.55,fontFace:'Arial',fontSize:25,bold:true,color:B.navy,align:'center',margin:0,fit:'shrink'});
  slide.addText(label||'Periodo filtrado',{x:1.15,y:4.58,w:7.7,h:0.28,fontFace:'Arial',fontSize:10,color:B.muted,align:'center',margin:0,fit:'shrink'});
  slide.addShape('roundRect',{x:2.55,y:5.12,w:4.9,h:0.58,rectRadius:0.05,fill:{color:'FFF2CC'},line:{color:'E6B800',pt:0.7}});
  slide.addText('Plazos: ALTO 0–48 h · MEDIO 1–3 días · BAJO 1–4 días',{x:2.72,y:5.31,w:4.56,h:0.16,fontFace:'Arial',fontSize:7.2,bold:true,color:B.red,align:'center',margin:0,fit:'shrink'});
  slide.addText('U.E.A CANDELARIA CHANCA',{x:2.2,y:6.54,w:5.6,h:0.24,fontFace:'Arial',fontSize:13,bold:true,color:B.red,align:'center',margin:0});
}
function overviewTableRows(rows){
  const header=['UNIDAD','RACS','ALTO','LEV.','CON EVID.','NO REQ. EVID.','SIN SUST.','VENC.','ALTO VENC.','% CIERRE'];
  return [header.map(text=>({text,options:{bold:true,color:B.white,fill:{color:B.navy},align:'center'}})),...rows.map((row,index)=>{const fill=index%2?'FFFFFF':'EAF1F6';return [safeText(row.unit),n(row.total),n(row.high),n(row.lifted),n(row.lifted_with_evidence),n(row.lifted_no_evidence_required),n(row.lifted_without_evidence),n(row.overdue),n(row.high_overdue),`${pct(row.lifted,row.total)}%`].map((value,col)=>({text:String(value),options:{fill:{color:fill},align:col===0?'left':'center',bold:col===0||col===9,color:(col===6&&n(row.lifted_without_evidence)>0)||(col===7&&n(row.overdue)>0)||(col===8&&n(row.high_overdue)>0)?B.red:B.ink}}));})];
}
function addExecutiveSummary(pptx,rows,label){
  const t=aggregateControl(rows);const slide=pptx.addSlide();addCorporateHeader(slide,'CONTROL RACS POR UNIDAD',label);
  const cards=[['RACS',t.total,B.navy,'Periodo filtrado'],['LEVANTADOS',t.lifted,B.green,`${t.closure}% de cierre`],['CON EVIDENCIA',t.lifted_with_evidence,B.teal,'Evidencia final registrada'],['NO REQUIERE EVIDENCIA',t.lifted_no_evidence_required,B.navy,'Excepción aprobada'],['SIN SUSTENTO',t.lifted_without_evidence,'E85D3F','Registros por regularizar'],['VENCIDOS',t.overdue,B.red,'Fuera del plazo'],['PEND. VALIDACIÓN',t.pending_validation,'C08000','Con evidencia por revisar'],['ALTO VENCIDO',t.high_overdue,B.red,'Prioridad crítica']];
  cards.forEach((card,index)=>addCard(slide,0.28+(index%4)*2.43,1.02+Math.floor(index/4)*1.12,2.15,0.94,...card));
  const active=rows.filter(row=>n(row.total)>0);const shown=active.length?active:rows;
  slide.addTable(overviewTableRows(shown.slice(0,9)),{x:0.25,y:3.42,w:9.5,h:Math.min(3.32,0.35+shown.slice(0,9).length*0.31),colW:[2.15,0.58,0.52,0.52,0.75,0.82,0.65,0.55,0.68,0.65],rowH:0.31,fontFace:'Arial',fontSize:6.2,border:{type:'solid',color:'B9CAD6',pt:0.42},margin:0.015,fill:B.white,color:B.ink});
}
function addAnalysisSlide(pptx,rows,label){
  const t=aggregateControl(rows);const slide=pptx.addSlide();addCorporateHeader(slide,'ANÁLISIS EJECUTIVO DE CIERRE Y SUSTENTO',label);
  const active=rows.filter(r=>n(r.total)>0);
  slide.addChart('bar',[{name:'% CIERRE',labels:active.map(r=>r.unit),values:active.map(r=>pct(r.lifted,r.total))}],{x:0.35,y:1.08,w:4.35,h:2.55,barDir:'bar',catAxisLabelFontSize:6.5,valAxisMinVal:0,valAxisMaxVal:100,valAxisMajorUnit:20,valAxisLabelFormatCode:'0"%"',showTitle:true,title:'% CIERRE POR UNIDAD',titleFontFace:'Arial',titleFontSize:9,showLegend:false,showValue:true,dataLabelPosition:'outEnd',chartColors:[B.green],showCatName:false,showValAxisTitle:false,showCatAxisTitle:false,showBorder:false});
  slide.addChart('bar',[{name:'SIN SUSTENTO',labels:active.map(r=>r.unit),values:active.map(r=>n(r.lifted_without_evidence))}],{x:5.05,y:1.08,w:4.55,h:2.55,barDir:'bar',catAxisLabelFontSize:6.5,valAxisMinVal:0,valAxisMajorUnit:Math.max(1,Math.ceil(Math.max(1,...active.map(r=>n(r.lifted_without_evidence)))/5)),showTitle:true,title:'LEVANTADOS SIN SUSTENTO',titleFontFace:'Arial',titleFontSize:9,showLegend:false,showValue:true,dataLabelPosition:'outEnd',chartColors:['E85D3F'],showBorder:false});
  const support=[n(t.lifted_with_evidence),n(t.lifted_no_evidence_required),n(t.lifted_without_evidence)];
  slide.addChart('doughnut',[{name:'CIERRES',labels:['CON EVIDENCIA','NO REQUIERE EVIDENCIA','SIN SUSTENTO'],values:support}],{x:0.55,y:4.02,w:3.2,h:2.5,holeSize:55,showTitle:true,title:'CALIDAD DEL CIERRE',titleFontFace:'Arial',titleFontSize:9,showLegend:true,legendPos:'b',legendFontSize:7,showPercent:true,showValue:false,chartColors:[B.teal,B.navy,'E85D3F'],showBorder:false});
  slide.addChart('doughnut',[{name:'ESTADO',labels:['LEVANTADOS','PENDIENTES','EN PROCESO','PEND. VALIDACIÓN','DEVUELTOS'],values:[n(t.lifted),n(t.pending),n(t.in_process),n(t.pending_validation),n(t.returned)]}],{x:3.75,y:4.02,w:3.2,h:2.5,holeSize:55,showTitle:true,title:'ESTADO GENERAL',titleFontFace:'Arial',titleFontSize:9,showLegend:true,legendPos:'b',legendFontSize:6.7,showPercent:true,showValue:false,chartColors:[B.green,'F4B183',B.blue,'FFD966',B.red],showBorder:false});
  slide.addChart('doughnut',[{name:'RIESGO',labels:['ALTO','MEDIO','BAJO'],values:[n(t.high),n(t.medium),n(t.low)]}],{x:6.95,y:4.02,w:2.75,h:2.5,holeSize:55,showTitle:true,title:'NIVEL DE RIESGO',titleFontFace:'Arial',titleFontSize:9,showLegend:true,legendPos:'b',legendFontSize:7,showPercent:true,showValue:false,chartColors:[B.red,'F4B183',B.green],showBorder:false});
}
function addRiskDeadlineSlide(pptx,rows,label){
  const active=rows.filter(r=>n(r.total)>0);const slide=pptx.addSlide();addCorporateHeader(slide,'RIESGOS, VENCIMIENTOS Y ALERTAS',label);
  slide.addChart('bar',[{name:'ALTO',labels:active.map(r=>r.unit),values:active.map(r=>n(r.high))},{name:'MEDIO',labels:active.map(r=>r.unit),values:active.map(r=>n(r.medium))},{name:'BAJO',labels:active.map(r=>r.unit),values:active.map(r=>n(r.low))}],{x:0.38,y:1.05,w:5.55,h:5.55,barDir:'col',barGrouping:'stacked',catAxisLabelFontSize:6.2,valAxisMinVal:0,showTitle:true,title:'DISTRIBUCIÓN DE RACS POR NIVEL DE RIESGO',titleFontFace:'Arial',titleFontSize:10,showLegend:true,legendPos:'b',legendFontSize:7,showValue:false,chartColors:[B.red,'F4B183',B.green],showBorder:false});
  slide.addChart('bar',[{name:'VENCIDOS',labels:active.map(r=>r.unit),values:active.map(r=>n(r.overdue))},{name:'ALTO VENCIDO',labels:active.map(r=>r.unit),values:active.map(r=>n(r.high_overdue))}],{x:6.12,y:1.05,w:3.55,h:3.08,barDir:'bar',catAxisLabelFontSize:6.2,valAxisMinVal:0,showTitle:true,title:'RACS FUERA DE PLAZO',titleFontFace:'Arial',titleFontSize:10,showLegend:true,legendPos:'b',legendFontSize:7,showValue:true,dataLabelPosition:'outEnd',chartColors:['E85D3F',B.red],showBorder:false});
  const alerts=active.filter(r=>n(r.overdue)>0||n(r.lifted_without_evidence)>0||n(r.pending_validation)>0).sort((a,b)=>(n(b.high_overdue)*5+n(b.overdue)+n(b.lifted_without_evidence))-(n(a.high_overdue)*5+n(a.overdue)+n(a.lifted_without_evidence))).slice(0,5);
  slide.addShape('roundRect',{x:6.12,y:4.37,w:3.55,h:2.12,rectRadius:0.06,fill:{color:'FFF2CC'},line:{color:'E6B800',pt:0.8}});
  slide.addText('PRIORIDADES DE GESTIÓN',{x:6.32,y:4.56,w:3.15,h:0.22,fontFace:'Arial',fontSize:9,bold:true,color:B.red,align:'center',margin:0});
  const lines=alerts.length?alerts.map((r,i)=>`${i+1}. ${r.unit}: ${n(r.overdue)} vencidos · ${n(r.high_overdue)} altos vencidos · ${n(r.lifted_without_evidence)} sin sustento`):['Sin alertas críticas en el periodo filtrado.'];
  slide.addText(lines.map(text=>({text,options:{breakLine:true,bullet:false}})),{x:6.32,y:4.92,w:3.12,h:1.28,fontFace:'Arial',fontSize:7.1,color:B.ink,margin:0.02,breakLine:true,fit:'shrink'});
}
function addUnitSlide(pptx,row,label){
  const slide=pptx.addSlide();addCorporateHeader(slide,`CONTROL RACS · ${safeText(row.unit)}`,label);
  const closure=pct(row.lifted,row.total);const rate=n(row.workers)?(n(row.total)/n(row.workers)).toFixed(2):'0.00';
  const cards=[['RACS',n(row.total),B.navy,`${n(row.workers)} trabajadores`],['LEVANTADOS',n(row.lifted),B.green,`${closure}% de cierre`],['ALTO',n(row.high),B.red,'Riesgo crítico'],['VENCIDOS',n(row.overdue),B.red,`${n(row.high_overdue)} de riesgo alto`],['CON EVIDENCIA',n(row.lifted_with_evidence),B.teal,'Cierre con archivo final'],['SIN SUSTENTO',n(row.lifted_without_evidence),'E85D3F','Requiere regularización']];
  cards.forEach((card,index)=>addCard(slide,0.35+(index%3)*3.18,1.0+Math.floor(index/3)*1.08,2.86,0.9,...card));
  slide.addChart('doughnut',[{name:'RIESGO',labels:['ALTO','MEDIO','BAJO'],values:[n(row.high),n(row.medium),n(row.low)]}],{x:0.4,y:3.35,w:2.85,h:2.7,holeSize:55,showTitle:true,title:'NIVEL DE RIESGO',titleFontFace:'Arial',titleFontSize:9,showLegend:true,legendPos:'b',legendFontSize:7,showPercent:true,showValue:false,chartColors:[B.red,'F4B183',B.green],showBorder:false});
  slide.addChart('doughnut',[{name:'SUSTENTO',labels:['CON EVIDENCIA','NO REQUIERE','SIN SUSTENTO'],values:[n(row.lifted_with_evidence),n(row.lifted_no_evidence_required),n(row.lifted_without_evidence)]}],{x:3.35,y:3.35,w:2.85,h:2.7,holeSize:55,showTitle:true,title:'SUSTENTO DEL CIERRE',titleFontFace:'Arial',titleFontSize:9,showLegend:true,legendPos:'b',legendFontSize:6.7,showPercent:true,showValue:false,chartColors:[B.teal,B.navy,'E85D3F'],showBorder:false});
  slide.addChart('bar',[{name:'ESTADOS',labels:['PENDIENTE','EN PROCESO','PEND. VALIDACIÓN','DEVUELTO','LEVANTADO'],values:[n(row.pending),n(row.in_process),n(row.pending_validation),n(row.returned),n(row.lifted)]}],{x:6.25,y:3.35,w:3.35,h:2.7,barDir:'bar',showTitle:true,title:'ESTADO DE GESTIÓN',titleFontFace:'Arial',titleFontSize:9,showLegend:false,showValue:true,dataLabelPosition:'outEnd',catAxisLabelFontSize:6.5,valAxisMinVal:0,chartColors:[B.blue],showBorder:false});
  slide.addShape('roundRect',{x:0.7,y:6.34,w:8.6,h:0.45,rectRadius:0.05,fill:{color:'EAF1F6'},line:{color:'B9CAD6',pt:0.6}});
  slide.addText(`RACS / trabajador: ${rate}   ·   Cierres sustentados: ${supportTotal(row)}   ·   Vencen hoy: ${n(row.due_today)}   ·   Pendientes de validación: ${n(row.pending_validation)}`,{x:0.9,y:6.49,w:8.2,h:0.14,fontFace:'Arial',fontSize:7.2,bold:true,color:B.navy,align:'center',margin:0,fit:'shrink'});
}
function detailTableRows(rows){
  const header=['RAC','UNIDAD','FECHA / VENC.','RIESGO','ESTADO','SUPERVISOR','LUGAR','DESCRIPCIÓN'];
  return [header.map(text=>({text,options:{bold:true,color:B.white,fill:{color:B.navy},align:'center'}})),...rows.map((row,index)=>{const fill=index%2?'FFFFFF':'EAF1F6';return [safeText(row.report_code),safeText(row.business_unit),`${dateText(row.report_date)}\n${dateText(row.due_date)}`,safeText(row.risk_level),safeText(row.status),safeText(row.supervisor_name),safeText(row.location),safeText(row.description)].map((value,col)=>({text:value||'—',options:{fill:{color:fill},align:col>=2&&col<=4?'center':'left',valign:'mid',bold:col===0,color:(col===3&&safeText(row.risk_level)==='ALTO')||n(row.is_overdue)?B.red:B.ink}}));})];
}
function addDetailPages(pptx,title,rows,label){
  const pageSize=7;for(let start=0;start<rows.length;start+=pageSize){const page=rows.slice(start,start+pageSize);const slide=pptx.addSlide();const current=Math.floor(start/pageSize)+1,total=Math.ceil(rows.length/pageSize);addCorporateHeader(slide,`${title}${total>1?` · ${current}/${total}`:''}`,label);slide.addTable(detailTableRows(page),{x:0.12,y:1.03,w:9.76,h:5.93,colW:[1.18,1.1,0.78,0.55,1.05,1.15,1.25,2.7],rowH:0.75,fontFace:'Arial',fontSize:5.7,border:{type:'solid',color:'9FBAD0',pt:0.4},margin:0.015,fill:B.white,color:B.ink,autoFit:false});}}
function addClosing(pptx){
  const slide=pptx.addSlide();slide.background={color:B.white};slide.addShape('rect',{x:0,y:0,w:10,h:1.15,fill:{color:'F3C18E'},line:{color:'F3C18E'}});if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.56,w:10,h:0.45,transparency:5});if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:3.35,y:2.05,w:3.3,h:1.28});slide.addText('CONTROL RACS BASADO EN DATOS',{x:1.6,y:3.72,w:6.8,h:0.35,fontFace:'Arial',fontSize:17,bold:true,color:B.navy,align:'center',margin:0});slide.addText('Priorizar · Levantar · Sustentar · Validar',{x:2.2,y:4.28,w:5.6,h:0.25,fontFace:'Arial',fontSize:10,color:B.muted,align:'center',margin:0});slide.addText('U.E.A CANDELARIA CHANCA',{x:2.2,y:5.35,w:5.6,h:0.25,fontFace:'Arial',fontSize:13,bold:true,color:B.red,align:'center',margin:0});
}

export async function buildRacControlPpt(summaryRows=[],detailRows=[],label=''){
  const pptx=new pptxgen();pptx.defineLayout({name:'CAPSAN6_4X3',width:10,height:7.5});pptx.layout='CAPSAN6_4X3';pptx.author='CAPSAN6';pptx.subject='Control ejecutivo RACS por unidad';pptx.title='Control ejecutivo RACS por unidad';pptx.company='OPTIMUS';pptx.lang='es-PE';pptx.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'es-PE'};
  addCover(pptx,label);addExecutiveSummary(pptx,summaryRows,label);addAnalysisSlide(pptx,summaryRows,label);addRiskDeadlineSlide(pptx,summaryRows,label);
  for(const row of summaryRows.filter(item=>n(item.total)>0))addUnitSlide(pptx,row,label);
  addDetailPages(pptx,'RACS VENCIDOS',detailRows.filter(row=>row.is_overdue),label);
  addDetailPages(pptx,'RACS DE RIESGO ALTO ABIERTOS',detailRows.filter(row=>safeText(row.risk_level)==='ALTO'&&safeText(row.status)!=='LEVANTADO'),label);
  addDetailPages(pptx,'LEVANTADOS SIN SUSTENTO',detailRows.filter(row=>safeText(row.status)==='LEVANTADO'&&row.evidence_required&&!row.has_final_evidence),label);
  addDetailPages(pptx,'PENDIENTES DE VALIDACIÓN',detailRows.filter(row=>safeText(row.status)==='PENDIENTE DE VALIDACION'),label);
  addClosing(pptx);return pptx.write({outputType:'nodebuffer'});
}
