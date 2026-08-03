import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoReportDate } from '../services/reportDates.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR=path.resolve(__dirname,'../../templates/assets');
const LOGO=path.join(ASSET_DIR,'optimus-logo.png');
const WAVE=path.join(ASSET_DIR,'optimus-wave-wide.png');
const C={orange:'F36C0A',orange2:'F7B267',navy:'002060',blue:'0070C0',green:'00B050',red:'FF0000',yellow:'FFF200',low:'00B050',gray:'D9E2F3',light:'F7F7F7',ink:'1F1F1F',white:'FFFFFF',condition:'F36C0A',act:'4472C4'};
const MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;
const text=v=>String(v??'').trim();
const iso=v=>isoReportDate(v);
const safeDate=v=>{const value=iso(v);return value?new Date(`${value}T12:00:00Z`):null;};
const shortDate=d=>d?`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(-2)}`:'';
const longDate=d=>d?`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`:'';
const periodName=d=>d?`${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`:'PERIODO ACTUAL';
const displayUnit=name=>({'PLANTA MAHUARA':'PLANTA','OBRA CIVIL OPTIMUS':'OBRAS CIVILES','DESARROLLOS MINEROS':'DESARROLLOS MINEROS','MINA CANDELARIA':'MINA CANDELARIA','CONGEMIN':'CONGEMIN','DIAMANTINA':'DIAMANTINA'}[name]||name);
const two=n=>String(Number(n)||0).padStart(2,'0');

function countSplit(rows,key){
  const map=new Map();
  for(const r of rows){
    const name=text(r[key])||'SIN REGISTRO';
    const item=map.get(name)||{name,total:0,acts:0,conditions:0};
    item.total++;
    if(text(r.report_type).toUpperCase()==='ACTO SUBESTANDAR')item.acts++;else item.conditions++;
    map.set(name,item);
  }
  return [...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}
function countCauses(rows){
  const map=new Map();
  for(const r of rows){const name=text(r.cause_subtype||r.deviation_type)||'OTROS';map.set(name,(map.get(name)||0)+1);}
  return [...map.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}
function summarizeUnitRows(rows,workers=0,name=''){
  const unit={name,rows,total:rows.length,acts:0,conditions:0,lifted:0,pending:0,high:0,workers:Number(workers||0)};
  for(const r of rows){
    const isAct=text(r.report_type).toUpperCase()==='ACTO SUBESTANDAR';if(isAct)unit.acts++;else unit.conditions++;
    if(text(r.status).toUpperCase()==='LEVANTADO')unit.lifted++;else unit.pending++;
    if(!isAct&&text(r.risk_level).toUpperCase()==='ALTO')unit.high++;
  }
  unit.reportRate=unit.workers?Number((unit.total/unit.workers).toFixed(2)):0;
  unit.closurePercent=pct(unit.lifted,unit.total);
  unit.supervisors=countSplit(rows,'supervisor_name');
  unit.areas=countSplit(rows,'reporting_area');
  unit.causes=countCauses(rows);
  return unit;
}
export function summarizeRacs(rows=[],workerCounts={}){
  const summary={total:rows.length,acts:0,conditions:0,lifted:0,pending:0,high:0};const grouped=new Map();
  for(const r of rows){const name=text(r.business_unit)||'SIN UNIDAD';if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(r);const isAct=text(r.report_type).toUpperCase()==='ACTO SUBESTANDAR';if(isAct)summary.acts++;else summary.conditions++;if(text(r.status).toUpperCase()==='LEVANTADO')summary.lifted++;else summary.pending++;if(!isAct&&text(r.risk_level).toUpperCase()==='ALTO')summary.high++;}
  summary.closurePercent=pct(summary.lifted,summary.total);
  const order=['MINA CANDELARIA','PLANTA MAHUARA','OBRA CIVIL OPTIMUS','CONGEMIN','DIAMANTINA','DESARROLLOS MINEROS'];
  const units=[...grouped.entries()].map(([name,unitRows])=>summarizeUnitRows(unitRows,workerCounts[name],name)).sort((a,b)=>{const ai=order.indexOf(a.name),bi=order.indexOf(b.name);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi);return a.name.localeCompare(b.name);});
  return{summary,units};
}
function periodContext(rows,context={}){
  const dates=rows.map(r=>safeDate(r.report_date)).filter(Boolean).sort((a,b)=>a-b);
  const ref=safeDate(context.to)||dates.at(-1)||new Date();
  const from=safeDate(context.from)||dates[0]||new Date(Date.UTC(ref.getUTCFullYear(),ref.getUTCMonth(),1));
  return{ref,period:periodName(ref),short:shortDate(ref),long:longDate(ref),from,to:ref,iso:iso(ref)};
}
function rowsForDate(rows,dateIso){return rows.filter(r=>iso(r.report_date)===dateIso);}
function chartBase(x,y,w,h){return{x,y,w,h,showTitle:false,showLegend:false,showValue:true,showCatName:false,catAxisLabelFontFace:'Arial',catAxisLabelFontSize:7,valAxisLabelFontFace:'Arial',valAxisLabelFontSize:8,valGridLine:{color:'BFBFBF',size:0.5},chartArea:{fill:{color:C.white},border:{color:C.white,pt:0}},plotArea:{fill:{color:'FBFBFB'},border:{color:'D9D9D9',pt:0.4}},showCatAxisTitle:false,showValAxisTitle:false};}

function svgData(svg){return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;}
function xml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function niceMax(value,min=4){const n=Math.max(min,Number(value)||0);if(n<=5)return Math.ceil(n);if(n<=10)return Math.ceil(n/2)*2;return Math.ceil(n/5)*5;}
function wrapWords(value,max=22,maxLines=3){
  const words=text(value).split(/\s+/).filter(Boolean),lines=[];let line='';
  for(const word of words){const next=line?`${line} ${word}`:word;if(next.length<=max||!line)line=next;else{lines.push(line);line=word;if(lines.length>=maxLines-1)break;}}
  if(line&&lines.length<maxLines)lines.push(line);return lines;
}
function compactPareto(items,maxItems=18){
  if(items.length<=maxItems)return items;
  const keep=items.slice(0,maxItems-1),others=items.slice(maxItems-1).reduce((a,b)=>a+Number(b.total||0),0);
  return [...keep,{name:'OTROS',total:others}];
}
function paretoSvg(items){
  const list=compactPareto(items.length?items:[{name:'SIN CAUSA REGISTRADA',total:0}],18);
  const W=1500,H=530,L=160,R=72,T=24,B=list.length>8?185:124,PW=W-L-R,PH=H-T-B;
  const values=list.map(i=>Number(i.total||0)),total=values.reduce((a,b)=>a+b,0)||1,max=niceMax(Math.max(...values)+0.2,2),step=max<=5?0.5:max<=10?1:Math.ceil(max/5);
  let running=0;const cumulative=values.map(v=>{running+=v;return running*100/total;});
  const slot=PW/list.length,barW=Math.min(105,slot*0.56);
  let grid='',axes='',bars='',labels='',line='';
  for(let v=0;v<=max+1e-9;v+=step){const y=T+PH-(v/max)*PH;grid+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#BFBFBF" stroke-width="1"/>`;axes+=`<text x="${L-10}" y="${y+5}" text-anchor="end" font-family="Arial" font-size="17" fill="#333">${Number(v.toFixed(1))}</text>`;}
  for(let v=0;v<=100;v+=10){const y=T+PH-(v/100)*PH;axes+=`<text x="${W-R+12}" y="${y+5}" font-family="Arial" font-size="17" fill="#444">${v}%</text>`;}
  const points=[];
  list.forEach((item,i)=>{const cx=L+slot*(i+0.5),h=(values[i]/max)*PH,y=T+PH-h;bars+=`<rect x="${cx-barW/2}" y="${y}" width="${barW}" height="${h}" fill="#00B050"/>`;if(values[i]>0)bars+=`<text x="${cx}" y="${Math.max(T+19,y+h*0.62)}" text-anchor="middle" font-family="Arial" font-size="24" fill="#000">${values[i]}</text>`;const py=T+PH-(cumulative[i]/100)*PH;points.push(`${cx},${py}`);if(list.length>8){labels+=`<text x="${cx-4}" y="${T+PH+25}" transform="rotate(-60 ${cx-4} ${T+PH+25})" text-anchor="end" font-family="Arial" font-size="9.5" fill="#444">${xml(item.name)}</text>`;}else{const lines=wrapWords(item.name,23,3);lines.forEach((ln,j)=>{labels+=`<text x="${cx}" y="${T+PH+34+j*18}" text-anchor="middle" font-family="Arial" font-size="14" fill="#444">${xml(ln)}</text>`;});}});
  if(points.length)line=`<polyline points="${points.join(' ')}" fill="none" stroke="#ED7D31" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>% ACUMULADO</title><defs><pattern id="diag" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#DDDDDD" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="#FFFFFF"/><rect x="${L}" y="${T}" width="${PW}" height="${PH}" fill="url(#diag)"/>${grid}<line x1="${L}" y1="${T+PH}" x2="${W-R}" y2="${T+PH}" stroke="#999"/>${bars}${line}${axes}${labels}</svg>`;
}
function stackedSvg(items,{legend=false}={}){
  const list=items.slice(0,10),W=760,H=425,L=54,R=legend?175:32,T=22,B=list.length>5?112:72,PW=W-L-R,PH=H-T-B;
  const max=niceMax(Math.max(...list.map(i=>i.total),1)+0.2,4),step=max<=6?1:Math.ceil(max/5),slot=PW/Math.max(list.length,1),barW=Math.min(66,slot*0.58);
  let grid='',axes='',bars='',labels='',legendSvg='';
  for(let v=0;v<=max;v+=step){const y=T+PH-(v/max)*PH;grid+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#C8C8C8" stroke-width="1"/>`;axes+=`<text x="${L-10}" y="${y+5}" text-anchor="end" font-family="Arial" font-size="18" fill="#222">${v}</text>`;}
  list.forEach((item,i)=>{const cx=L+slot*(i+0.5),act=Number(item.acts||0),cond=Number(item.conditions||0),ha=(act/max)*PH,hc=(cond/max)*PH,yA=T+PH-ha,yC=yA-hc;bars+=`<rect x="${cx-barW/2}" y="${yA}" width="${barW}" height="${ha}" fill="#4472C4"/>`;bars+=`<rect x="${cx-barW/2}" y="${yC}" width="${barW}" height="${hc}" fill="#F47B20"/>`;if(act>0)bars+=`<text x="${cx}" y="${yA+ha/2+7}" text-anchor="middle" font-family="Arial" font-size="22" fill="#111">${act}</text>`;if(cond>0)bars+=`<text x="${cx}" y="${yC+hc/2+7}" text-anchor="middle" font-family="Arial" font-size="22" fill="#111">${cond}</text>`;const name=xml(item.name);if(list.length>5)labels+=`<text x="${cx-4}" y="${T+PH+22}" transform="rotate(-48 ${cx-4} ${T+PH+22})" text-anchor="end" font-family="Arial" font-size="13" fill="#222">${name}</text>`;else labels+=`<text x="${cx}" y="${T+PH+27}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#222">${name}</text>`;});
  if(legend)legendSvg=`<rect x="${W-R+18}" y="${T+10}" width="25" height="25" fill="#F47B20"/><text x="${W-R+52}" y="${T+31}" font-family="Arial" font-size="19" font-weight="700">CONDICIÓN SUBESTÁNDAR</text><rect x="${W-R+18}" y="${T+50}" width="25" height="25" fill="#4472C4"/><text x="${W-R+52}" y="${T+71}" font-family="Arial" font-size="19" font-weight="700">ACTO SUBESTÁNDAR</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#FFFFFF"/>${grid}<line x1="${L}" y1="${T+PH}" x2="${W-R}" y2="${T+PH}" stroke="#999"/>${bars}${axes}${labels}${legendSvg}</svg>`;
}
function addCorporateHeader(slide,title,{titleWidth=9.3,largeYear=false}={}){
  slide.background={color:C.white};
  slide.addShape('rect',{x:0,y:0,w:13.333,h:0.83,fill:{color:'F8C58D'},line:{color:'F8C58D'}});
  if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.26,w:13.333,h:0.56,transparency:4});
  slide.addShape('roundRect',{x:0.58,y:0.035,w:titleWidth,h:0.69,rectRadius:0.05,fill:{color:C.orange},line:{color:'9E480E',pt:1.2}});
  if(largeYear&&/\s\d{4}$/.test(title)){const year=title.slice(-4),base=title.slice(0,-4);slide.addText([{text:base,options:{fontSize:24}},{text:year,options:{fontSize:37,bold:true}}],{x:0.78,y:0.14,w:titleWidth-0.38,h:0.43,fontFace:'Arial',color:C.white,align:'center',valign:'mid',margin:0,fit:'shrink'});}else slide.addText(title,{x:0.78,y:0.2,w:titleWidth-0.38,h:0.3,fontFace:'Arial',fontSize:20,bold:false,color:C.white,align:'center',margin:0,fit:'shrink'});
  if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:11.22,y:0.055,w:2.12,h:0.83});
}
function addCover(pptx,period){
  const slide=pptx.addSlide();slide.background={color:C.white};
  slide.addShape('rect',{x:0,y:0,w:13.333,h:1.0,fill:{color:'F3C18E'},line:{color:'F3C18E'}});if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.3,w:13.333,h:0.7,transparency:4});if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:5.0,y:0.28,w:3.3,h:1.25});
  slide.addText('REPORTE EJECUTIVO RACS',{x:2.0,y:2.45,w:9.33,h:0.55,fontFace:'Arial',fontSize:28,bold:true,italic:true,color:C.navy,align:'center',margin:0});slide.addText('U.E.A CANDELARIA CHANCA',{x:3.3,y:3.35,w:6.7,h:0.34,fontFace:'Arial',fontSize:16,bold:true,color:'C00000',align:'center',margin:0});slide.addText(period,{x:3.6,y:4.15,w:6.1,h:0.4,fontFace:'Arial',fontSize:20,bold:true,color:C.navy,align:'center',margin:0});slide.addShape('line',{x:0.2,y:7.15,w:12.93,h:0,line:{color:'C00000',pt:1.6}});
}
function addClosing(pptx){
  const slide=pptx.addSlide();slide.background={color:C.white};slide.addShape('rect',{x:0,y:0,w:13.333,h:1.0,fill:{color:'F3C18E'},line:{color:'F3C18E'}});if(fs.existsSync(WAVE))slide.addImage({path:WAVE,x:0,y:0.3,w:13.333,h:0.7,transparency:4});if(fs.existsSync(LOGO))slide.addImage({path:LOGO,x:5.0,y:2.0,w:3.3,h:1.3});slide.addText('U.E.A CANDELARIA CHANCA',{x:3.6,y:3.65,w:6.1,h:0.34,fontFace:'Arial',fontSize:16,bold:true,color:'C00000',align:'center',margin:0});slide.addText('GRACIAS!!!',{x:3.7,y:5.0,w:5.9,h:0.6,fontFace:'Arial',fontSize:32,bold:true,color:C.ink,align:'center',margin:0});
}
function addTrainingSlide(pptx,calendar,info,units){
  const slide=pptx.addSlide();addCorporateHeader(slide,`CHARLA DE 5 MINUTOS – ${info.period}`);const days=new Date(Date.UTC(info.ref.getUTCFullYear(),info.ref.getUTCMonth()+1,0)).getUTCDate();const x0=1.75,dayW=7.55/days;
  slide.addShape('rect',{x:0.2,y:0.86,w:9.55,h:0.34,fill:{color:C.navy},line:{color:C.navy}});slide.addText('DIÁLOGO DIARIO DE SEGURIDAD',{x:0.35,y:0.94,w:3.3,h:0.15,fontFace:'Arial',fontSize:11,bold:true,color:C.white,margin:0});slide.addText('% CUMPLIMIENTO',{x:8.82,y:0.94,w:0.82,h:0.15,fontFace:'Arial',fontSize:7,bold:true,color:C.white,align:'center',margin:0});slide.addText('UNIDAD',{x:0.23,y:1.28,w:1.45,h:0.25,fontFace:'Arial',fontSize:8,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},margin:0.02});
  for(let d=1;d<=days;d++)slide.addText(String(d),{x:x0+(d-1)*dayW,y:1.28,w:dayW,h:0.25,fontFace:'Arial',fontSize:5.5,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},line:{color:C.white,pt:0.2},margin:0});slide.addText('%',{x:9.33,y:1.28,w:0.4,h:0.25,fontFace:'Arial',fontSize:7,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.navy},margin:0});
  const records=calendar||[];const names=[...new Set([...units.map(u=>u.name),...records.map(r=>r.business_unit)])].slice(0,18);const rowH=Math.min(0.31,5.2/Math.max(names.length,1));
  names.forEach((name,idx)=>{const y=1.53+idx*rowH;slide.addText(displayUnit(name),{x:0.23,y,w:1.45,h:rowH,fontFace:'Arial',fontSize:6.5,bold:true,color:C.ink,fill:{color:idx%2?'FFFFFF':'F2F2F2'},line:{color:'D9D9D9',pt:0.3},margin:0.02,fit:'shrink'});let scheduled=0,executed=0;for(let d=1;d<=days;d++){const dayRecords=records.filter(r=>r.business_unit===name&&safeDate(r.scheduled_date)?.getUTCDate()===d);let value='',fill=idx%2?'FFFFFF':'F2F2F2';if(dayRecords.length){scheduled++;if(dayRecords.some(r=>Number(r.graded)>0)){value='E';executed++;fill='E2F0D9';}else{value='P';fill='FCE4D6';}}slide.addText(value,{x:x0+(d-1)*dayW,y,w:dayW,h:rowH,fontFace:'Arial',fontSize:5.5,bold:true,color:value==='P'?'C00000':'006100',align:'center',valign:'mid',fill:{color:fill},line:{color:'D9D9D9',pt:0.2},margin:0});}slide.addText(`${pct(executed,scheduled)}%`,{x:9.33,y,w:0.4,h:rowH,fontFace:'Arial',fontSize:6.2,bold:true,color:C.ink,align:'center',valign:'mid',fill:{color:idx%2?'FFFFFF':'F2F2F2'},line:{color:'D9D9D9',pt:0.3},margin:0});});
}
function addUnitMetrics(slide,u){
  const label=`PERSONAL DE ${u.name==='PLANTA MAHUARA'?'PLANTA MAHUARA':displayUnit(u.name)}`;
  const rows=[[{text:label,options:{bold:true,fill:{color:'FFF2CC'}}},{text:String(u.workers),options:{bold:true,align:'right'}}],[{text:'NUMERO DE REPORTES A LA FECHA',options:{bold:true,fill:{color:'FFF2CC'}}},{text:String(u.total),options:{bold:true,align:'right'}}],[{text:'REPORTES/TRABAJADOR',options:{bold:true,fill:{color:'FFF2CC'}}},{text:u.reportRate.toFixed(2),options:{bold:true,align:'right'}}]];
  slide.addTable(rows,{x:0.51,y:0.91,w:4.81,h:1.04,colW:[3.72,1.09],rowH:0.34,fontFace:'Arial',fontSize:9.2,border:{type:'solid',color:'7F6000',pt:0.7},margin:0.025,fill:C.white,color:C.ink});
}
function addPareto(slide,items){slide.addImage({data:svgData(paretoSvg(items)),x:0.42,y:2.18,w:12.48,h:4.56});}

function addExecutiveOverviewSlide(pptx,data,info){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RESUMEN EJECUTIVO RACS – ${info.period}`);
  const s=data.summary;const cards=[['TOTAL RACS',s.total,C.orange],['ACTOS',s.acts,C.act],['CONDICIONES',s.conditions,C.condition],['ALTO POTENCIAL',s.high,C.red],['PENDIENTES',s.pending,C.red],['% LEV.',`${s.closurePercent}%`,C.green]];
  cards.forEach(([label,value,color],i)=>{const x=0.42+i*2.1;slide.addShape('rect',{x,y:1.0,w:1.84,h:0.36,fill:{color},line:{color}});slide.addText(label,{x:x+0.05,y:1.09,w:1.74,h:0.14,fontFace:'Arial',fontSize:8,bold:true,color:C.white,align:'center',margin:0,fit:'shrink'});slide.addShape('rect',{x,y:1.36,w:1.84,h:0.62,fill:{color:'F2F2F2'},line:{color:'BFBFBF',pt:0.5}});slide.addText(String(value),{x:x+0.05,y:1.51,w:1.74,h:0.27,fontFace:'Arial',fontSize:18,bold:true,color:C.ink,align:'center',margin:0,fit:'shrink'});});
  const rows=[[{text:'UNIDAD',options:{bold:true,fill:{color:C.navy},color:C.white}},{text:'PERSONAL',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'RACS',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'ACTOS',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'COND.',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'ALTO',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'LEV.',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'PEND.',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}},{text:'% LEV.',options:{bold:true,fill:{color:C.navy},color:C.white,align:'center'}}],...data.units.map((u,idx)=>{const fill=idx%2?'FFFFFF':'D9E2F3';return[dataCell(displayUnit(u.name),fill,{bold:true}),dataCell(u.workers,fill,{align:'center'}),dataCell(u.total,fill,{align:'center'}),dataCell(u.acts,fill,{align:'center'}),dataCell(u.conditions,fill,{align:'center'}),dataCell(u.high,fill,{align:'center',color:u.high?C.red:C.ink,bold:!!u.high}),dataCell(u.lifted,fill,{align:'center'}),dataCell(u.pending,fill,{align:'center',color:u.pending?C.red:C.ink,bold:!!u.pending}),dataCell(`${u.closurePercent}%`,fill,{align:'center',bold:true})];})];
  slide.addTable(rows,{x:0.42,y:2.25,w:12.48,h:Math.min(3.1,0.36+data.units.length*0.34),colW:[2.0,0.8,0.65,0.65,0.65,0.65,0.65,0.65,0.75],rowH:0.34,fontFace:'Arial',fontSize:7.2,border:{type:'solid',color:'9FBAD0',pt:0.45},margin:0.02,fill:C.white,color:C.ink});
  const pendingByUnit=data.units.filter(u=>u.pending>0).sort((a,b)=>b.pending-a.pending).slice(0,8);const causeMap=new Map();for(const u of data.units)for(const r of u.rows.filter(x=>text(x.status).toUpperCase()!=='LEVANTADO')){const name=text(r.cause_subtype||r.deviation_type)||'OTROS';causeMap.set(name,(causeMap.get(name)||0)+1);}const pendingCauses=[...causeMap.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,8);
  addSplitChart(slide,'PENDIENTES POR UNIDAD',pendingByUnit.map(u=>({name:displayUnit(u.name),total:u.pending,conditions:u.pending,acts:0})),0.42,5.75,5.95,1.35);addSplitChart(slide,'PENDIENTES POR DESVIACIÓN',pendingCauses.map(c=>({name:c.name,total:c.total,conditions:c.total,acts:0})),6.82,5.75,6.08,1.35);
}

function addUnitSummarySlide(pptx,u,info){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RACS ${displayUnit(u.name)} – ${info.period}`,{titleWidth:8.95,largeYear:true});addUnitMetrics(slide,u);
  const sentence=u.acts&&u.conditions?`Se registraron ${two(u.total)} reportes RACS ( ${two(u.acts)} actos y ${two(u.conditions)} Condiciones)`:u.acts?`Se registraron ${two(u.total)} reportes RACS ( ${two(u.acts)} actos)`:`Se registraron ${two(u.total)} reportes RACS ( ${two(u.conditions)} Condiciones)`;
  slide.addShape('rect',{x:5.52,y:0.88,w:7.61,h:0.94,fill:{color:C.orange},line:{color:C.orange}});
  slide.addText([{text:`•  ${sentence}`,options:{breakLine:true}},{text:`•  Se registró ${two(u.high)} condiciones de alto potencial`,options:{breakLine:true}},{text:`•  Se reportaron ${two(u.total)} RACS hasta la fecha ${info.long}.`,options:{breakLine:true}}],{x:5.7,y:0.95,w:7.25,h:0.72,fontFace:'Arial',fontSize:12.5,bold:true,color:C.white,margin:0.02,fit:'shrink'});
  addPareto(slide,u.causes);
}
function addSplitChart(slide,title,items,x,y,w,h,{legend=false}={}){
  slide.addShape('rect',{x,y:y-0.73,w,h:0.73,fill:{color:C.orange},line:{color:C.orange}});slide.addText(title,{x:x+0.12,y:y-0.57,w:w-0.24,h:0.42,fontFace:'Arial',fontSize:13.5,bold:true,color:C.white,margin:0.01,fit:'shrink'});
  if(!items.length){slide.addText('Sin datos',{x,y:y+1.35,w,h:0.35,align:'center',fontSize:14,color:'777777'});return;}
  slide.addImage({data:svgData(stackedSvg(items,{legend})),x,y,w,h});
}
function splitNarrative(daily,info,cumulativeTotal=0){
  const typeText=daily.acts&&daily.conditions?`${two(daily.acts)} actos y ${two(daily.conditions)} condiciones`:daily.acts?`${two(daily.acts)} actos`:`${two(daily.conditions)} condiciones`;
  const highText=daily.high?`de los cuales son ${two(daily.high)} ${daily.high===1?'condición':'condiciones'} de alto potencial`:'de los cuales no se reportaron condiciones de alto potencial';
  return[`Se reportaron ${typeText} ${highText} durante el ${info.long}.`,`Se reportaron ${two(daily.total)} RACS el ${info.long}. Acumulado del mes: ${two(cumulativeTotal)} RACS.`];
}
function addUnitSplitSlide(pptx,u,info){
  const dailyRows=rowsForDate(u.rows,info.iso),daily=summarizeUnitRows(dailyRows,u.workers,u.name),slide=pptx.addSlide();addCorporateHeader(slide,`RACS ${displayUnit(u.name)} – ${info.period}`,{titleWidth:9.28,largeYear:true});
  slide.addShape('line',{x:6.01,y:0.86,w:0,h:5.03,line:{color:C.orange,pt:2.5,dash:'dash'}});slide.addShape('line',{x:0,y:5.83,w:13.333,h:0,line:{color:C.orange,pt:2.5,dash:'dash'}});
  addSplitChart(slide,`SUPERVISORES QUE ENTREGARON RACS EL ${info.long}`,daily.supervisors,0.25,1.61,5.66,4.18,{legend:false});addSplitChart(slide,`ÁREAS REPORTANTES DEL ${info.long}`,daily.areas,6.14,1.61,7.02,4.18,{legend:false});
  slide.addShape('rect',{x:10.72,y:1.82,w:0.27,h:0.27,fill:{color:C.condition},line:{color:C.condition}});slide.addText('CONDICIÓN SUBESTÁNDAR',{x:11.05,y:1.82,w:2.15,h:0.27,fontFace:'Arial',fontSize:10.5,bold:true,color:C.ink,margin:0,fit:'shrink'});slide.addShape('rect',{x:10.72,y:2.15,w:0.27,h:0.27,fill:{color:C.act},line:{color:C.act}});slide.addText('ACTO SUBESTÁNDAR',{x:11.05,y:2.15,w:2.15,h:0.27,fontFace:'Arial',fontSize:10.5,bold:true,color:C.ink,margin:0,fit:'shrink'});
  slide.addShape('rect',{x:0.58,y:6.07,w:11.05,h:1.24,fill:{color:C.orange},line:{color:C.orange}});slide.addText(splitNarrative(daily,info,u.total).map(t=>({text:`•  ${t}`,options:{breakLine:true}})),{x:0.79,y:6.35,w:10.65,h:0.7,fontFace:'Arial',fontSize:13.5,bold:true,color:C.white,margin:0.02,fit:'shrink'});
}
function riskCell(value,fill){const v=text(value).toUpperCase();const color=v==='ALTO'?C.red:v==='MEDIO'?C.yellow:C.low;return{text:v,options:{fill:{color},color:v==='MEDIO'?C.ink:C.white,bold:false,align:'center'}};}
function typeCell(value,fill){return{text:text(value).toUpperCase(),options:{fill:{color:fill},color:C.blue,bold:true,align:'center'}};}
function dataCell(value,fill,options={}){return{text:text(value),options:{fill:{color:fill},...options}};}
function detailRows(rows){return rows.map((r,index)=>{const fill=index%2?'FFFFFF':'D9E2F3';return[dataCell(r.reporting_area,fill,{align:'center'}),dataCell(r.reporter_name,fill,{align:'center'}),dataCell(r.location,fill,{align:'center'}),dataCell(r.reported_area||r.reporting_area,fill,{align:'center'}),dataCell(longDate(safeDate(r.report_date)),fill,{align:'center'}),riskCell(r.risk_level,fill),typeCell(r.report_type,fill),dataCell(r.cause_subtype||r.deviation_type,fill,{align:'center'}),dataCell(r.description,fill,{align:'center'}),dataCell(r.supervisor_name,fill,{align:'center'}),dataCell(text(r.status).toUpperCase()==='LEVANTADO'?'SI':'NO',fill,{align:'center'})];});}
function pendingCharts(slide,rows){
  const pending=rows.filter(r=>text(r.status).toUpperCase()!=='LEVANTADO');
  if(!pending.length){slide.addText('SIN RACS PENDIENTES DE LEVANTAMIENTO',{x:2.65,y:5.25,w:8.0,h:0.6,fontFace:'Arial',fontSize:20,bold:true,color:C.green,align:'center',margin:0});return;}
  const causes=countCauses(pending),dominant=causes[0],dominantRows=pending.filter(r=>(text(r.cause_subtype||r.deviation_type)||'OTROS')===dominant.name),byLocation=new Map();for(const r of dominantRows){const name=text(r.location)||text(r.reported_area)||'SIN LUGAR';byLocation.set(name,(byLocation.get(name)||0)+1);}const locations=[...byLocation.entries()].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  slide.addChart('pie',[{name:'NO',labels:causes.map(c=>c.name),values:causes.map(c=>c.total)}],{x:0.05,y:4.55,w:6.15,h:2.75,showTitle:false,showLegend:true,legendPos:'b',legendFontSize:7,showPercent:false,showValue:true,chartColors:['4472C4','ED7D31','A5A5A5','FFC000','5B9BD5','70AD47','264478']});
  slide.addChart('bar',[{name:'NO',labels:locations.map(x=>x.name),values:locations.map(x=>x.total)}],{...chartBase(6.35,4.55,6.93,2.75),barDir:'bar',barGrouping:'stacked',chartColors:[C.red],showLegend:false,catAxisLabelFontSize:8,valAxisMinVal:0,valAxisMaxVal:Math.max(2,Math.max(...locations.map(x=>x.total))+1),valAxisMajorUnit:1,dataLabelPosition:'ctr'});
}
function addDetailSlide(pptx,u,info,rows,pageIndex,totalPages,pendingScopeRows=rows){
  const slide=pptx.addSlide();addCorporateHeader(slide,`RACS LEVANTAMIENTO ${displayUnit(u.name)} – ${info.short}${totalPages>1?` · ${pageIndex}/${totalPages}`:''}`,{titleWidth:9.7});
  const header=['AREA REPORTANTE','DATOS DEL REPORTANTE','LUGAR DE REPORTE','AREA REPORTADA','FECHA','NIVEL DE RIESGO','TIPO DE REPORTE','TIPO DE DESVIACION','DESCRIPCION DEL RAC´S','SUPERVISOR ACARGO DE LA ENTREGA','% LEVANTAMIENTO'];
  slide.addTable([header,...detailRows(rows)],{x:0.19,y:0.85,w:13.08,h:3.58,colW:[0.76,0.87,0.85,0.83,0.58,0.64,0.91,1.25,3.82,1.55,0.82],rowH:0.51,fontFace:'Arial',fontSize:6.1,border:{type:'solid',color:'9FBAD0',pt:0.45},fill:C.white,color:C.ink,margin:0.012,autoFit:false,bold:false,bandRow:false});
  pendingCharts(slide,pendingScopeRows);
}
function addEvidenceSlides(pptx,u){
  const candidates=u.rows.filter(r=>Array.isArray(r.evidence_files)&&r.evidence_files.some(f=>f.local_path&&fs.existsSync(f.local_path))).slice(0,6);
  for(const r of candidates){const images=r.evidence_files.filter(f=>f.local_path&&fs.existsSync(f.local_path)).slice(0,2);if(!images.length)continue;const slide=pptx.addSlide();addCorporateHeader(slide,`${text(r.location||r.reported_area||'EVIDENCIA')} – ${displayUnit(u.name)}`,{titleWidth:9.6});const w=images.length===1?5.3:5.35;images.forEach((img,i)=>slide.addImage({path:img.local_path,x:images.length===1?4.02:0.85+i*6.25,y:1.15,w,h:4.65,sizing:'contain'}));slide.addShape('rect',{x:0.75,y:6.0,w:5.75,h:0.82,fill:{color:C.orange},line:{color:C.orange}});slide.addText(`OBSERVACIÓN\n${text(r.description)}`,{x:0.95,y:6.1,w:5.35,h:0.58,fontFace:'Arial',fontSize:9,bold:true,color:C.white,align:'center',margin:0.02,fit:'shrink'});slide.addShape('rect',{x:6.83,y:6.0,w:5.75,h:0.82,fill:{color:C.orange},line:{color:C.orange}});slide.addText(`MEDIDA CORRECTIVA\n${text(r.corrective_action||r.close_comment||'EVIDENCIA DE LEVANTAMIENTO REGISTRADA')}`,{x:7.03,y:6.1,w:5.35,h:0.58,fontFace:'Arial',fontSize:9,bold:true,color:C.white,align:'center',margin:0.02,fit:'shrink'});}
}

export async function buildRacExecutivePpt(rows,filtersLabel,workerCounts={},context={}){
  const data=summarizeRacs(rows,workerCounts),info=periodContext(rows,context);const pptx=new pptxgen();pptx.defineLayout({name:'CAPSAN6_WIDE',width:13.333,height:7.5});pptx.layout='CAPSAN6_WIDE';pptx.author='CAPSAN6';pptx.subject='Reporte Ejecutivo RACS';pptx.title='Reporte Ejecutivo RACS';pptx.company='OPTIMUS';pptx.lang='es-PE';pptx.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'es-PE'};
  addCover(pptx,info.period);addExecutiveOverviewSlide(pptx,data,info);
  for(const u of data.units){addUnitSummarySlide(pptx,u,info);addUnitSplitSlide(pptx,u,info);const dailyRows=rowsForDate(u.rows,info.iso);const detailSource=dailyRows.length?dailyRows:u.rows;const pageSize=6,totalPages=Math.max(1,Math.ceil(detailSource.length/pageSize));for(let i=0;i<totalPages;i++)addDetailSlide(pptx,u,info,detailSource.slice(i*pageSize,(i+1)*pageSize),i+1,totalPages,detailSource);addEvidenceSlides(pptx,u);}
  addClosing(pptx);return pptx.write({outputType:'nodebuffer'});
}

export async function buildRacExecutiveExcel(rows,filtersLabel,workerCounts={}){
  const {default:ExcelJS}=await import('exceljs');const data=summarizeRacs(rows,workerCounts);const wb=new ExcelJS.Workbook();wb.creator='CAPSAN6';const dash=wb.addWorksheet('RESUMEN EJECUTIVO',{views:[{showGridLines:false}]});dash.columns=Array.from({length:10},()=>({width:18}));dash.mergeCells('A1:J2');dash.getCell('A1').value='REPORTE EJECUTIVO SSOMA · RACS';dash.getCell('A1').font={size:22,bold:true,color:{argb:C.white}};dash.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};dash.getCell('A1').alignment={horizontal:'center',vertical:'middle'};dash.mergeCells('A3:J3');dash.getCell('A3').value=filtersLabel;dash.getCell('A3').alignment={horizontal:'center'};
  const cards=[['TOTAL RACS',data.summary.total],['ACTOS',data.summary.acts],['CONDICIONES',data.summary.conditions],['ALTO POTENCIAL',data.summary.high],['% LEVANTAMIENTO',`${data.summary.closurePercent}%`]];cards.forEach(([t,v],idx)=>{const c=1+idx*2;dash.mergeCells(5,c,5,c+1);dash.mergeCells(6,c,7,c+1);const a=dash.getCell(5,c);a.value=t;a.font={bold:true,color:{argb:C.white}};a.fill={type:'pattern',pattern:'solid',fgColor:{argb:idx===3?C.red:idx===4?C.green:C.orange}};a.alignment={horizontal:'center'};const b=dash.getCell(6,c);b.value=v;b.font={size:20,bold:true,color:{argb:C.ink}};b.alignment={horizontal:'center',vertical:'middle'};});
  let row=10;dash.getCell(row,1).value='UNIDADES DE NEGOCIO';dash.getCell(row,1).font={bold:true,size:14};row++;['Unidad','Personal','RACS','RACS/Trabajador','Actos','Condiciones','Alto','Levantados','Pendientes','% Lev.'].forEach((h,i)=>dash.getCell(row,i+1).value=h);dash.getRow(row).font={bold:true,color:{argb:C.white}};dash.getRow(row).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};for(const u of data.units){row++;[u.name,u.workers,u.total,u.reportRate,u.acts,u.conditions,u.high,u.lifted,u.pending,`${u.closurePercent}%`].forEach((v,i)=>dash.getCell(row,i+1).value=v);}dash.autoFilter={from:{row:11,column:1},to:{row,column:10}};
  const base=wb.addWorksheet('BASE RACS');base.columns=[['RAC','report_code',18],['N° origen','source_report_number',14],['Unidad','business_unit',24],['Fecha','report_date',13],['Área reportante','reporting_area',22],['Reportante','reporter_name',26],['Tipo reportante','reporter_type',18],['Lugar','location',28],['Área reportada','reported_area',22],['Riesgo','risk_level',12],['Tipo','report_type',24],['Tipo de causa','cause_category',24],['Subtipo / causa normalizada','cause_subtype',34],['Descripción','description',60],['Supervisor','supervisor_name',26],['Acción correctiva','corrective_action',45],['Estado','status',24],['Avance %','progress_percent',12],['Ambiental','environmental_flag',12]].map(([header,key,width])=>({header,key,width}));base.views=[{state:'frozen',ySplit:1}];base.getRow(1).font={bold:true,color:{argb:C.white}};base.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};rows.forEach(r=>base.addRow(r));base.autoFilter={from:'A1',to:'S1'};
  const sup=wb.addWorksheet('SUPERVISORES');sup.columns=[{header:'Unidad',key:'unit',width:28},{header:'Supervisor',key:'name',width:32},{header:'RACS',key:'total',width:12},{header:'Levantados',key:'lifted',width:14},{header:'% Lev.',key:'pct',width:12}];sup.getRow(1).font={bold:true,color:{argb:C.white}};sup.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.orange}};for(const u of data.units)for(const s of u.supervisors){const lifted=u.rows.filter(r=>(text(r.supervisor_name)||'SIN ASIGNAR')===s.name&&text(r.status).toUpperCase()==='LEVANTADO').length;sup.addRow({unit:u.name,name:s.name,total:s.total,lifted,pct:`${pct(lifted,s.total)}%`});}
  const causes=wb.addWorksheet('CAUSAS');causes.columns=[{header:'Unidad',key:'unit',width:28},{header:'Causa normalizada',key:'name',width:48},{header:'RACS',key:'total',width:12}];causes.getRow(1).font={bold:true,color:{argb:C.white}};causes.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.orange}};for(const u of data.units)for(const c of u.causes)causes.addRow({unit:u.name,...c});return wb.xlsx.writeBuffer();
}
