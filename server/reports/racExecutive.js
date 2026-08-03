import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR=path.resolve(__dirname,'../../templates/assets');
const LOGO=path.join(ASSET_DIR,'optimus-logo.png');
const WAVE=path.join(ASSET_DIR,'optimus-wave-wide.png');
const C={orange:'F58220',orange2:'F4A261',navy:'17365D',blue:'5B9BD5',green:'00B050',red:'FF0000',yellow:'FFF200',gray:'D9E2F3',light:'F7F7F7',ink:'1F1F1F',white:'FFFFFF',condition:'ED7D31',act:'5B9BD5'};
const MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;
const text=v=>String(v??'').trim();
const safeDate=v=>{const d=v instanceof Date?v:new Date(String(v||'').slice(0,10)+'T12:00:00Z');return Number.isNaN(d.getTime())?null:d;};
const shortDate=d=>d?`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(-2)}`:'';
const periodName=d=>d?`${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`:'PERIODO ACTUAL';
const displayUnit=name=>({
  'PLANTA MAHUARA':'PLANTA',
  'OBRA CIVIL OPTIMUS':'OBRAS CIVILES',
  'DESARROLLOS MINEROS':'DESARROLLOS MINEROS',
  'MINA CANDELARIA':'MINA CANDELARIA',
  'CONGEMIN':'CONGEMIN',
  'DIAMANTINA':'DIAMANTINA',
}[name]||name);

function countSplit(rows,key){
  const map=new Map();
  for(const r of rows){const name=text(r[key])||'SIN REGISTRO';const item=map.get(name)||{name,total:0,acts:0,conditions:0};item.total++;if(r.report_type==='ACTO SUBESTANDAR')item.acts++;else item.conditions++;map.set(name,item);}
  return [...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}

export function summarizeRacs(rows=[],workerCounts={}){
  const summary={total:rows.length,acts:0,conditions:0,lifted:0,pending:0,high:0};const units=new Map();
  for(const r of rows){
    const unit=text(r.business_unit)||'SIN UNIDAD';
    if(!units.has(unit))units.set(unit,{name:unit,total:0,acts:0,conditions:0,lifted:0,pending:0,high:0,risks:{ALTO:0,MEDIO:0,BAJO:0},causes:new Map(),rows:[]});
    const u=units.get(unit);u.rows.push(r);u.total++;
    const isAct=r.report_type==='ACTO SUBESTANDAR';if(isAct){u.acts++;summary.acts++;}else{u.conditions++;summary.conditions++;}
    if(r.status==='LEVANTADO'){u.lifted++;summary.lifted++;}else{u.pending++;summary.pending++;}
    if(!isAct&&r.risk_level==='ALTO'){u.high++;summary.high++;}
    u.risks[r.risk_level]=(u.risks[r.risk_level]||0)+1;
    const cause=text(r.cause_subtype||r.deviation_type)||'OTROS';u.causes.set(cause,(u.causes.get(cause)||0)+1);
  }
  summary.closurePercent=pct(summary.lifted,summary.total);
  const order=['MINA CANDELARIA','PLANTA MAHUARA','OBRA CIVIL OPTIMUS','CONGEMIN','DIAMANTINA','DESARROLLOS MINEROS'];
  return {summary,units:[...units.values()].map(u=>({
    ...u,workers:Number(workerCounts[u.name]||0),reportRate:Number(workerCounts[u.name]||0)?Number((u.total/Number(workerCounts[u.name])).toFixed(2)):0,closurePercent:pct(u.lifted,u.total),
    supervisors:countSplit(u.rows,'supervisor_name'),areas:countSplit(u.rows,'reporting_area'),
    causes:[...u.causes.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),
  })).sort((a,b)=>{const ai=order.indexOf(a.name),bi=order.indexOf(b.name);if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi);return a.name.localeCompare(b.name);})};
}

function addCorporateHeader(slide,title){
  slide.background={color:C.white};
  slide.addShape('rect',{x:0,y:0,w:10,h:0.86,fill:{color:'F7C896'},line:{color:'F7C896'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.22,w:10,h:0.45,transparency:18});
  slide.addShape('roundRect',{x:0.12,y:0.12,w:5.2,h:0.48,rectRadius:0.04,fill:{color:C.orange},line:{color:C.orange}});
  slide.addText(title,{x:0.3,y:0.23,w:4.85,h:0.22,fontFace:'Arial',fontSize:15,bold:true,color:C.white,margin:0,fit:'shrink'});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:8.35,y:0.06,w:1.45,h:0.56});
  slide.addShape('line',{x:0.12,y:7.28,w:9.72,h:0,line:{color:C.orange,pt:1.2}});
}
function addOrangeNote(slide,lines,y=6.3){
  slide.addShape('rect',{x:0.25,y,w:9.5,h:0.72,fill:{color:C.orange},line:{color:C.orange}});
  slide.addText(lines.map(t=>({text:`• ${t}`,options:{breakLine:true}})),{x:0.45,y:y+0.09,w:9.05,h:0.54,fontFace:'Arial',fontSize:10,bold:true,color:C.white,margin:0.02,fit:'shrink'});
}
function addCover(pptx,period){
  const slide=pptx.addSlide();slide.background={color:C.white};
  slide.addShape('rect',{x:0,y:0,w:10,h:1.2,fill:{color:'F3C18E'},line:{color:'F3C18E'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.55,w:10,h:0.5,transparency:5});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:3.45,y:0.28,w:3.1,h:1.2});
  slide.addText('SEGURIDAD',{x:2.3,y:2.5,w:5.4,h:0.45,fontFace:'Arial',fontSize:26,bold:true,italic:true,color:C.navy,align:'center',margin:0});
  slide.addText('U.E.A CANDELARIA CHANCA',{x:2.1,y:3.28,w:5.8,h:0.3,fontFace:'Arial',fontSize:14,bold:true,color:'C00000',align:'center',margin:0});
  slide.addText(period,{x:2.3,y:4.1,w:5.4,h:0.35,fontFace:'Arial',fontSize:18,bold:true,color:C.navy,align:'center',margin:0});
  slide.addShape('line',{x:0.18,y:7.16,w:9.64,h:0,line:{color:'C00000',pt:1.6}});
}
function addClosing(pptx){
  const slide=pptx.addSlide();slide.background={color:C.white};
  slide.addShape('rect',{x:0,y:0,w:10,h:1.2,fill:{color:'F3C18E'},line:{color:'F3C18E'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.55,w:10,h:0.5,transparency:5});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:3.35,y:2.05,w:3.3,h:1.28});
  slide.addText('U.E.A CANDELARIA CHANCA',{x:2.2,y:3.7,w:5.6,h:0.3,fontFace:'Arial',fontSize:15,bold:true,color:'C00000',align:'center',margin:0});
  slide.addText('GRACIAS!!!',{x:2.3,y:5.05,w:5.4,h:0.55,fontFace:'Arial',fontSize:30,bold:true,color:C.ink,align:'center',margin:0});
}

function periodContext(rows,context={}){
  const dates=rows.map(r=>safeDate(r.report_date)).filter(Boolean).sort((a,b)=>a-b);
  const ref=dates.at(-1)||safeDate(context.to)||new Date();
  return {ref,period:periodName(ref),short:shortDate(ref),from:dates[0]||ref,to:dates.at(-1)||ref};
}
function chartBase(x,y,w,h){return{x,y,w,h,showTitle:false,showLegend:false,showValue:true,showCatName:false,catAxisLabelFontFace:'Arial',catAxisLabelFontSize:7,valAxisLabelFontFace:'Arial',valAxisLabelFontSize:7,valGridLine:{color:'D9D9D9',size:0.5},chartArea:{fill:{color:C.white},border:{color:'BFBFBF',pt:0.6}},plotArea:{fill:{color:C.white},border:{color:'E7E6E6',pt:0.4}},showCatAxisTitle:false,showValAxisTitle:false};}
function addPareto(slide,items,x=0.4,y=2.18,w=9.2,h=4.55){
  const list=items.slice(0,12);if(!list.length){slide.addText('Sin causas registradas para el periodo',{x,y:y+1.5,w,h:0.4,align:'center',color:'777777',fontSize:16});return;}
  const labels=list.map(i=>i.name);const values=list.map(i=>Number(i.total));const total=values.reduce((a,b)=>a+b,0);let run=0;const cumulative=values.map(v=>{run+=v;return Number((run*100/total).toFixed(1));});
  slide.addChart([
    {type:'bar',data:[{name:'RACS',labels,values}],options:{barDir:'col',barGrouping:'clustered',chartColors:[C.green],showValue:true,dataLabelPosition:'outEnd'}},
    {type:'line',data:[{name:'% acumulado',labels,values:cumulative}],options:{secondaryValAxis:true,chartColors:[C.navy],lineSize:2,lineDataSymbol:'circle',lineDataSymbolSize:4,showValue:false}},
  ],{...chartBase(x,y,w,h),showLegend:true,legendPos:'b',legendFontSize:8,valAxes:[{valAxisMinVal:0},{secondaryValAxis:true,valAxisMinVal:0,valAxisMaxVal:100,valAxisLabelFormatCode:'0%'}],catAxisLabelRotate:-32});
}
function addUnitMetrics(slide,u){
  const rows=[
    [{text:`PERSONAL DE ${displayUnit(u.name)}`,options:{bold:true,fill:{color:'FFF2CC'}}},{text:String(u.workers),options:{bold:true,align:'center'}}],
    [{text:'NÚMERO DE REPORTES A LA FECHA',options:{bold:true,fill:{color:'FFF2CC'}}},{text:String(u.total),options:{bold:true,align:'center'}}],
    [{text:'REPORTES/TRABAJADOR',options:{bold:true,fill:{color:'FFF2CC'}}},{text:u.reportRate.toFixed(2),options:{bold:true,align:'center'}}],
  ];
  slide.addTable(rows,{x:0.28,y:0.88,w:3.35,h:0.96,colW:[2.75,0.6],rowH:0.28,fontFace:'Arial',fontSize:8.5,border:{type:'solid',color:'7F6000',pt:0.8},margin:0.03,fill:C.white,color:C.ink});
}
function unitNarrative(u,info){
  const parts=[];parts.push(`Se registraron ${String(u.total).padStart(2,'0')} reportes RACS (${String(u.acts).padStart(2,'0')} actos y ${String(u.conditions).padStart(2,'0')} condiciones)`);parts.push(`Se registró ${String(u.high).padStart(2,'0')} ${u.high===1?'condición':'condiciones'} de alto potencial`);parts.push(`Se reportaron ${String(u.total).padStart(2,'0')} RACS hasta la fecha ${info.short}`);return parts;
}
function addTrainingSlide(pptx,calendar,info,units){
  const slide=pptx.addSlide();addCorporateHeader(slide,`CHARLA DE 5 MINUTOS – ${info.period}`);
  const days=new Date(Date.UTC(info.ref.getUTCFullYear(),info.ref.getUTCMonth()+1,0)).getUTCDate();const x0=1.75,dayW=7.55/days;
  slide.addShape('rect',{x:0.2,y:0.86,w:9.55,h:0.34,fill:{color:C.navy},line:{color:C.navy}});
  slide.addText('DIÁLOGO DIARIO DE SEGURIDAD',{x:0.35,y:0.94,w:3.3,h:0.15,fontFace:'Arial',fontSize:11,bold:true,color:C.white,margin:0});
  slide.addText('% CUMPLIMIENTO',{x:8.82,y:0.94,w:0.82,h:0.15,fontFace:'Arial',fontSize:7,bold:true,color:C.white,align:'center',margin:0});
  slide.addText('UNIDAD',{x:0.23,y:1.28,w:1.45,h:0.25,fontFace:'Arial',fontSize:8,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},margin:0.02});
  for(let d=1;d<=days;d++)slide.addText(String(d),{x:x0+(d-1)*dayW,y:1.28,w:dayW,h:0.25,fontFace:'Arial',fontSize:5.5,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},line:{color:C.white,pt:0.2},margin:0});
  slide.addText('%',{x:9.33,y:1.28,w:0.4,h:0.25,fontFace:'Arial',fontSize:7,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},margin:0});
  const records=calendar||[];const names=[...new Set([...units.map(u=>u.name),...records.map(r=>r.business_unit)])].slice(0,18);const rowH=Math.min(0.31,5.2/Math.max(names.length,1));
  names.forEach((name,idx)=>{const y=1.53+idx*rowH;slide.addText(displayUnit(name),{x:0.23,y,w:1.45,h:rowH,fontFace:'Arial',fontSize:6.5,bold:true,color:C.ink,fill:{color:idx%2?'FFFFFF':'F2F2F2'},line:{color:'D9D9D9',pt:0.3},margin:0.02,fit:'shrink'});let scheduled=0,executed=0;for(let d=1;d<=days;d++){const dayRecords=records.filter(r=>r.business_unit===name&&safeDate(r.scheduled_date)?.getUTCDate()===d);let value='';let fill=idx%2?'FFFFFF':'F2F2F2';if(dayRecords.length){scheduled++;if(dayRecords.some(r=>Number(r.graded)>0)){value='E';executed++;fill='E2F0D9';}else{value='P';fill='FCE4D6';}}slide.addText(value,{x:x0+(d-1)*dayW,y,w:dayW,h:rowH,fontFace:'Arial',fontSize:5.5,bold:true,color:value==='P'?'C00000':'006100',align:'center',valign:'mid',fill:{color:fill},line:{color:'D9D9D9',pt:0.2},margin:0});}slide.addText(`${pct(executed,scheduled)}%`,{x:9.33,y,w:0.4,h:rowH,fontFace:'Arial',fontSize:6.2,bold:true,color:C.ink,align:'center',valign:'mid',fill:{color:idx%2?'FFFFFF':'F2F2F2'},line:{color:'D9D9D9',pt:0.3},margin:0});});
  const topicLines=records.slice(0,8).map(r=>`${shortDate(safeDate(r.scheduled_date))}: ${text(r.title)}`);slide.addText(topicLines.length?topicLines.join('  ·  '):'Sin temas programados en el periodo',{x:0.28,y:6.86,w:9.35,h:0.22,fontFace:'Arial',fontSize:6.5,color:'666666',margin:0,fit:'shrink'});
}
function addUnitSummarySlide(pptx,u,info){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RACS ${displayUnit(u.name)} – ${info.period}`);addUnitMetrics(slide,u);
  const notes=unitNarrative(u,info);slide.addShape('rect',{x:3.8,y:0.88,w:5.9,h:0.98,fill:{color:C.orange},line:{color:C.orange}});slide.addText(notes.map(t=>({text:`• ${t}`,options:{breakLine:true}})),{x:4.0,y:0.99,w:5.45,h:0.7,fontFace:'Arial',fontSize:9.5,bold:true,color:C.white,margin:0.02,fit:'shrink'});
  addPareto(slide,u.causes,0.35,2.08,9.3,4.85);
}
function addSplitChart(slide,title,items,x,y,w,h){
  const list=items.slice(0,9);slide.addShape('rect',{x,y:y-0.34,w,h:0.3,fill:{color:C.orange},line:{color:C.orange}});slide.addText(title,{x:x+0.08,y:y-0.27,w:w-0.16,h:0.16,fontFace:'Arial',fontSize:8.5,bold:true,color:C.white,align:'center',margin:0});
  if(!list.length){slide.addText('Sin datos',{x,y:y+1,w,h:0.3,align:'center',fontSize:12,color:'777777'});return;}
  slide.addChart('bar',[{name:'CONDICION SUBESTANDAR',labels:list.map(i=>i.name),values:list.map(i=>i.conditions)},{name:'ACTO SUBESTANDAR',labels:list.map(i=>i.name),values:list.map(i=>i.acts)}],{...chartBase(x,y,w,h),barDir:'col',barGrouping:'stacked',chartColors:[C.condition,C.act],showLegend:true,legendPos:'b',legendFontSize:6.5,catAxisLabelRotate:-25,catAxisLabelFontSize:6.5});
}
function addUnitSplitSlide(pptx,u,info){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RACS ${displayUnit(u.name)} – ${info.period}`);
  addSplitChart(slide,`SUPERVISORES QUE ENTREGARON RACS EL ${info.short}`,u.supervisors,0.3,1.42,4.45,4.55);
  addSplitChart(slide,`ÁREAS REPORTANTES DEL ${info.short}`,u.areas,5.18,1.42,4.5,4.55);
  addOrangeNote(slide,[`Se reportaron ${String(u.conditions).padStart(2,'0')} condiciones y ${String(u.acts).padStart(2,'0')} actos; ${String(u.high).padStart(2,'0')} condiciones de alto potencial`,`Se reportaron ${String(u.total).padStart(2,'0')} RACS hasta la fecha ${info.short}`],6.25);
}
function riskCell(value){const v=text(value).toUpperCase();const color=v==='ALTO'?C.red:v==='MEDIO'?C.yellow:'92D050';return{text:v,options:{fill:{color},color:v==='MEDIO'?C.ink:C.white,bold:true,align:'center'}};}
function typeCell(value){const v=text(value).toUpperCase();return{text:v,options:{fill:{color:v.startsWith('ACTO')?C.act:C.condition},color:C.white,bold:true,align:'center'}};}
function addDetailSlide(pptx,u,info,rows,pageIndex,totalPages){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RACS LEVANTAMIENTO ${displayUnit(u.name)} – ${info.short}${totalPages>1?` · ${pageIndex}/${totalPages}`:''}`);
  const body=rows.map(r=>[
    text(r.reporter_name),text(r.location),text(r.reported_area||r.reporting_area),shortDate(safeDate(r.report_date)),riskCell(r.risk_level),typeCell(r.report_type),text(r.cause_subtype||r.deviation_type),text(r.description),text(r.supervisor_name),r.status==='LEVANTADO'?'SI':'NO',
  ]);
  slide.addTable([['REPORTANTE','LUGAR','ÁREA REPORTADA','FECHA','RIESGO','TIPO DE REPORTE','TIPO DE DESVIACIÓN','DESCRIPCIÓN DEL RACS','RESPONSABLE','LEV.'],...body],{x:0.12,y:0.83,w:9.76,h:3.64,colW:[0.95,0.76,0.88,0.58,0.53,0.9,1.05,2.3,0.95,0.36],rowH:0.36,fontFace:'Arial',fontSize:5.8,border:{type:'solid',color:'A6A6A6',pt:0.45},fill:C.white,color:C.ink,margin:0.018,autoFit:false,bold:false,bandRow:false});
  const unresolved=u.rows.filter(r=>r.status!=='LEVANTADO');const source=unresolved.length?unresolved:u.rows;const causeMap=new Map();for(const r of source){const c=text(r.cause_subtype||r.deviation_type)||'OTROS';causeMap.set(c,(causeMap.get(c)||0)+1);}const causes=[...causeMap.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,7);
  if(causes.length){slide.addChart('bar',[{name:'NO',labels:causes.map(c=>c.name),values:causes.map(c=>c.total)}],{...chartBase(0.3,4.72,5.4,2.1),barDir:'bar',chartColors:[C.red],catAxisLabelFontSize:6,showLegend:false,dataLabelPosition:'outEnd'});slide.addChart('pie',[{name:'NO',labels:causes.map(c=>c.name),values:causes.map(c=>c.total)}],{x:6.02,y:4.65,w:3.3,h:2.2,showTitle:false,showLegend:true,legendPos:'b',legendFontSize:6,showPercent:false,showValue:true,chartColors:['4472C4','ED7D31','A5A5A5','FFC000','5B9BD5','70AD47','264478']});}
}
function addEvidenceSlides(pptx,u){
  const candidates=u.rows.filter(r=>Array.isArray(r.evidence_files)&&r.evidence_files.some(f=>f.local_path&&fs.existsSync(f.local_path))).slice(0,4);
  for(const r of candidates){const images=r.evidence_files.filter(f=>f.local_path&&fs.existsSync(f.local_path)).slice(0,2);if(!images.length)continue;const slide=pptx.addSlide();addCorporateHeader(slide,`${text(r.location||r.reported_area||'EVIDENCIA')} – ${displayUnit(u.name)}`);const w=images.length===1?4.3:4.2;images.forEach((img,i)=>{slide.addImage({path:img.local_path,x:images.length===1?2.85:0.65+i*4.45,y:1.2,w,h:4.55,sizing:'contain'});});slide.addShape('rect',{x:0.45,y:6.05,w:4.4,h:0.78,fill:{color:C.orange},line:{color:C.orange}});slide.addText(`OBSERVACIÓN\n${text(r.description)}`,{x:0.62,y:6.14,w:4.05,h:0.55,fontFace:'Arial',fontSize:8,bold:true,color:C.white,align:'center',margin:0.02,fit:'shrink'});slide.addShape('rect',{x:5.15,y:6.05,w:4.4,h:0.78,fill:{color:C.orange},line:{color:C.orange}});slide.addText(`MEDIDA CORRECTIVA\n${text(r.corrective_action||r.close_comment||'EVIDENCIA DE LEVANTAMIENTO REGISTRADA')}`,{x:5.32,y:6.14,w:4.05,h:0.55,fontFace:'Arial',fontSize:8,bold:true,color:C.white,align:'center',margin:0.02,fit:'shrink'});}
}

export async function buildRacExecutivePpt(rows,filtersLabel,workerCounts={},context={}){
  const data=summarizeRacs(rows,workerCounts),info=periodContext(rows,context);const pptx=new pptxgen();pptx.defineLayout({name:'CAPSAN6_4X3',width:10,height:7.5});pptx.layout='CAPSAN6_4X3';pptx.author='CAPSAN6';pptx.subject='Reporte Diario de Seguridad';pptx.title='Reporte Diario de Seguridad';pptx.company='OPTIMUS';pptx.lang='es-PE';pptx.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'es-PE'};
  addCover(pptx,info.period);addTrainingSlide(pptx,context.trainingCalendar||[],info,data.units);
  for(const u of data.units){addUnitSummarySlide(pptx,u,info);addUnitSplitSlide(pptx,u,info);const pageSize=8,totalPages=Math.max(1,Math.ceil(u.rows.length/pageSize));for(let i=0;i<totalPages;i++)addDetailSlide(pptx,u,info,u.rows.slice(i*pageSize,(i+1)*pageSize),i+1,totalPages);addEvidenceSlides(pptx,u);}
  addClosing(pptx);return pptx.write({outputType:'nodebuffer'});
}

export async function buildRacExecutiveExcel(rows,filtersLabel,workerCounts={}){
  const {default:ExcelJS}=await import('exceljs');
  const data=summarizeRacs(rows,workerCounts);const wb=new ExcelJS.Workbook();wb.creator='CAPSAN6';const dash=wb.addWorksheet('RESUMEN EJECUTIVO',{views:[{showGridLines:false}]});dash.columns=Array.from({length:10},()=>({width:18}));dash.mergeCells('A1:J2');dash.getCell('A1').value='REPORTE EJECUTIVO SSOMA · RACS';dash.getCell('A1').font={size:22,bold:true,color:{argb:C.white}};dash.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};dash.getCell('A1').alignment={horizontal:'center',vertical:'middle'};dash.mergeCells('A3:J3');dash.getCell('A3').value=filtersLabel;dash.getCell('A3').alignment={horizontal:'center'};
  const cards=[['TOTAL RACS',data.summary.total],['ACTOS',data.summary.acts],['CONDICIONES',data.summary.conditions],['ALTO POTENCIAL',data.summary.high],['% LEVANTAMIENTO',`${data.summary.closurePercent}%`]];cards.forEach(([t,v],idx)=>{const c=1+idx*2;dash.mergeCells(5,c,5,c+1);dash.mergeCells(6,c,7,c+1);const a=dash.getCell(5,c);a.value=t;a.font={bold:true,color:{argb:C.white}};a.fill={type:'pattern',pattern:'solid',fgColor:{argb:idx===3?C.red:idx===4?C.green:C.orange}};a.alignment={horizontal:'center'};const b=dash.getCell(6,c);b.value=v;b.font={size:20,bold:true,color:{argb:C.ink}};b.alignment={horizontal:'center',vertical:'middle'};});
  let row=10;dash.getCell(row,1).value='UNIDADES DE NEGOCIO';dash.getCell(row,1).font={bold:true,size:14};row++;['Unidad','Personal','RACS','RACS/Trabajador','Actos','Condiciones','Alto','Levantados','Pendientes','% Lev.'].forEach((h,i)=>dash.getCell(row,i+1).value=h);dash.getRow(row).font={bold:true,color:{argb:C.white}};dash.getRow(row).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};for(const u of data.units){row++;[u.name,u.workers,u.total,u.reportRate,u.acts,u.conditions,u.high,u.lifted,u.pending,`${u.closurePercent}%`].forEach((v,i)=>dash.getCell(row,i+1).value=v);}dash.autoFilter={from:{row:11,column:1},to:{row,column:10}};
  const base=wb.addWorksheet('BASE RACS');base.columns=[['RAC','report_code',18],['N° origen','source_report_number',14],['Unidad','business_unit',24],['Fecha','report_date',13],['Área reportante','reporting_area',22],['Reportante','reporter_name',26],['Tipo reportante','reporter_type',18],['Lugar','location',28],['Área reportada','reported_area',22],['Riesgo','risk_level',12],['Tipo','report_type',24],['Tipo de causa','cause_category',24],['Subtipo / causa normalizada','cause_subtype',34],['Descripción','description',60],['Supervisor','supervisor_name',26],['Acción correctiva','corrective_action',45],['Estado','status',24],['Avance %','progress_percent',12],['Ambiental','environmental_flag',12]].map(([header,key,width])=>({header,key,width}));base.views=[{state:'frozen',ySplit:1}];base.getRow(1).font={bold:true,color:{argb:C.white}};base.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};rows.forEach(r=>base.addRow(r));base.autoFilter={from:'A1',to:'S1'};
  const sup=wb.addWorksheet('SUPERVISORES');sup.columns=[{header:'Unidad',key:'unit',width:28},{header:'Supervisor',key:'name',width:32},{header:'RACS',key:'total',width:12},{header:'Levantados',key:'lifted',width:14},{header:'% Lev.',key:'pct',width:12}];sup.getRow(1).font={bold:true,color:{argb:C.white}};sup.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.orange}};for(const u of data.units)for(const s of u.supervisors){const lifted=u.rows.filter(r=>(text(r.supervisor_name)||'SIN ASIGNAR')===s.name&&r.status==='LEVANTADO').length;sup.addRow({unit:u.name,name:s.name,total:s.total,lifted,pct:`${pct(lifted,s.total)}%`});}
  const causes=wb.addWorksheet('CAUSAS');causes.columns=[{header:'Unidad',key:'unit',width:28},{header:'Causa normalizada',key:'name',width:48},{header:'RACS',key:'total',width:12}];causes.getRow(1).font={bold:true,color:{argb:C.white}};causes.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.orange}};for(const u of data.units)for(const c of u.causes)causes.addRow({unit:u.name,...c});
  return wb.xlsx.writeBuffer();
}
