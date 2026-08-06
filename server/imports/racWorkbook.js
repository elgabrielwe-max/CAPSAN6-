import XLSX from 'xlsx';
import crypto from 'node:crypto';
import { classifyRacLocal } from '../services/ai.js';
import { buildRacFingerprints, normalizeRacIdentity } from '../services/racReconciliation.js';

const aliases = {
  externalId:['ID UNICO ORIGEN','ID ÚNICO ORIGEN','CODIGO UNICO ORIGEN','CÓDIGO ÚNICO ORIGEN','UID RAC','ID ORIGEN'],
  businessUnit:['UNIDAD DE NEGOCIO','UNIDAD','UNIDAD OPERATIVA'],
  code:['N DE REPORTE','NRO REPORTE','NUMERO DE REPORTE','REPORTE','RAC','RACS','N° DE REPORTE'],
  reportingArea:['AREA REPORTANTE','AREA QUE REPORTA'],
  reporter:['DATOS DEL REPORTANTE','REPORTANTE','NOMBRE DEL REPORTANTE','TRABAJADOR','COLABORADOR'],
  reporterType:['COLABORADOR SUPERVISION','SUPERVISOR TRABAJADOR','SUPERVISOR COLABORADOR','TIPO REPORTANTE','ROL'],
  location:['LUGAR DEL REPORTE','LUGAR DE REPORTE','LUGAR','ZONA','UBICACION'],
  level:['NIVEL','NV'], labor:['LABOR','EQUIPO','INSTALACION'],
  reportedArea:['AREA REPORTADA','AREA RESPONSABLE'],
  date:['FECHA','FECHA REPORTE','FECHA DE REPORTE'], risk:['NIVEL DE RIESGO','RIESGO'],
  reportType:['TIPO DE REPORTE','TIPO RACS','ACTO CONDICION'],
  causeCategory:['TIPO DE CAUSA','CATEGORIA DE CAUSA','CATEGORÍA DE CAUSA'],
  cause:['CAUSA SUBCAUSA','CAUSA / SUBCAUSA','SUBCAUSA','TIPO DE DESVIACION','DESVIACION','PROBLEMA','CAUSA','SUBTIPO'],
  description:['DESCRIPCION DEL RACS','DESCRIPCION DEL RAC S','DESCRIPCION','DETALLE'],
  supervisor:['SUPERVISOR A CARGO','SUPERVISOR','RESPONSABLE'],
  action:['ACCION CORRECTIVA','ACCIONES','MEDIDA CORRECTIVA'],
  lifted:['LEVANTAMIENTO','SE LEVANTO','ESTADO','ESTADO ACTUAL'], progress:['AVANCE','PORCENTAJE','PORCENTAJE DE AVANCE']
};

export const normalizeHeader = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const keys = Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,v.map(normalizeHeader)]));
const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const upper = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

function field(row, name) {
  const wanted = new Set(keys[name]);
  for (const [key,value] of Object.entries(row || {})) if (wanted.has(normalizeHeader(key)) && clean(value)) return value;
  return '';
}

function scoreHeader(cells) {
  const set = new Set(cells.map(normalizeHeader));
  let score = 0;
  for (const name of ['description','reporter','reportingArea','date','reportType','cause']) if (keys[name].some(x=>set.has(x))) score += 4;
  if (keys.code.some(x=>set.has(x))) score += 2;
  return score;
}

function chooseSheet(workbook) {
  let best = null;
  for (const name of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:false});
    for (let i=0;i<Math.min(matrix.length,40);i++) {
      const score = scoreHeader(matrix[i] || []);
      if (!best || score > best.score) best = { name, sheet, headerRow:i, score, matrix };
    }
  }
  if (!best || best.score < 12) throw new Error('No se encontró una hoja con estructura de RACS');
  return best;
}

function validDate(y,m,d) {
  y=Number(y);m=Number(m);d=Number(d);
  if(y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d)return null;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

export function normalizeExcelDate(value) {
  if(value instanceof Date && !Number.isNaN(value.getTime())) return validDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
  if(value===null||value===undefined||value==='')return null;
  const raw=String(value).trim();
  if(/^\d+(\.\d+)?$/.test(raw)){
    const serial=Math.floor(Number(raw));
    if(serial>20000){const dt=new Date(Date.UTC(1899,11,30)+serial*86400000);return validDate(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());}
  }
  let m=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); if(m)return validDate(m[1],m[2],m[3]);
  m=raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if(m){const year=m[3].length===2?Number(`20${m[3]}`):Number(m[3]);return validDate(year,m[2],m[1])||validDate(year,m[1],m[2]);}
  return null;
}

function risk(value) { const n=upper(value); return n.includes('ALT')?'ALTO':n.includes('MED')?'MEDIO':'BAJO'; }
function type(value, description='') { const n=upper(`${value} ${description}`); return n.includes('ACTO')?'ACTO SUBESTANDAR':'CONDICION SUBESTANDAR'; }
function progress(lift, pct) { const n=upper(lift); const number=Number(String(pct||'').replace('%','').replace(',','.'))||0; return ['SI','LEVANTADO','CERRADO','100'].includes(n)||number>=100?100:Math.max(0,Math.min(99,number)); }
function sourceNumber(value) { const raw=clean(value); const match=raw.match(/\d+/); return match ? match[0] : raw; }

export function analyzeRacWorkbook(buffer, fileName='archivo.xlsx', options={}) {
  const workbook=XLSX.read(buffer,{type:'buffer',cellDates:true});
  const chosen=chooseSheet(workbook);
  const rows=XLSX.utils.sheet_to_json(chosen.sheet,{range:chosen.headerRow,defval:'',raw:true,blankrows:false});
  const unitName=clean(options.businessUnitName).toUpperCase();
  if(!unitName)throw new Error('Selecciona la unidad de negocio');
  const records=[],errors=[],warnings=[],periods=new Map();
  const sourceCounts=new Map(),externalCounts=new Map();
  rows.forEach(row=>{const n=sourceNumber(field(row,'code'));if(n)sourceCounts.set(n,(sourceCounts.get(n)||0)+1);const uid=upper(field(row,'externalId'));if(uid)externalCounts.set(uid,(externalCounts.get(uid)||0)+1);});
  const occurrences=new Map();
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    const description=clean(field(row,'description'));
    const externalId=upper(field(row,'externalId'));
    const rowUnit=upper(field(row,'businessUnit'));
    const reporter=clean(field(row,'reporter'));
    const reportingArea=clean(field(row,'reportingArea'));
    if(!description&&!reporter&&!reportingArea)continue;
    const sourceRow=chosen.headerRow+i+2;
    const rowErrors=[];
    if(!description)rowErrors.push('falta descripción');
    if(externalId&&externalCounts.get(externalId)>1)rowErrors.push('ID único de origen duplicado');
    if(rowUnit&&normalizeRacIdentity(rowUnit)!==normalizeRacIdentity(unitName))rowErrors.push(`unidad del archivo (${rowUnit}) no coincide con la unidad seleccionada (${unitName})`);
    if(!reporter)rowErrors.push('falta reportante');
    if(!reportingArea)rowErrors.push('falta área reportante');
    const date=normalizeExcelDate(field(row,'date'));
    if(!date)rowErrors.push('fecha inválida');
    rowErrors.forEach(x=>errors.push(`Fila ${sourceRow}: ${x}`));
    if(rowErrors.length)continue;
    const source=sourceNumber(field(row,'code')) || String(records.length+1);
    const occurrence=(occurrences.get(source)||0)+1; occurrences.set(source,occurrence);
    const ai=classifyRacLocal(`${field(row,'causeCategory')} ${field(row,'cause')} ${description}`);
    const reportType=type(field(row,'reportType'),description);
    const rawCauseCategory=clean(field(row,'causeCategory'));
    const causeCategory=(rawCauseCategory.replace(/^(?:[IVXLCDM]+|\d+)[.\-:) ]+/i,'').trim()) || ai.causeCategory;
    const cause=clean(field(row,'cause')) || ai.causeSubtype;
    const location=clean(field(row,'location')) || [clean(field(row,'level')),clean(field(row,'labor'))].filter(Boolean).join(' - ');
    const p=progress(field(row,'lifted'),field(row,'progress'));
    periods.set(date.slice(0,7),(periods.get(date.slice(0,7))||0)+1);
    const identitySeed=externalId||[unitName,date,source,occurrence,reporter,description].join('|');
    const hash=crypto.createHash('sha1').update(identitySeed).digest('hex').slice(0,12).toUpperCase();
    const fingerprints=buildRacFingerprints({businessUnitName:unitName,reportDate:date,reporterName:reporter,reportingArea,location,description});
    records.push({
      sourceRow, externalId:externalId||null, sourceReportNumber:source, internalCode:`${options.unitCode||'RAC'}-${date.replaceAll('-','')}-${String(source).padStart(4,'0')}${occurrence>1?`-${String(occurrence).padStart(2,'0')}`:''}-${hash.slice(0,4)}`,
      businessUnitName:unitName, reportingArea:reportingArea.toUpperCase(), reportedArea:(clean(field(row,'reportedArea'))||reportingArea).toUpperCase(),
      reporterName:reporter.toUpperCase(), reporterType:(clean(field(row,'reporterType'))||'COLABORADOR').toUpperCase(), location:location.toUpperCase(), reportDate:date,
      riskLevel:risk(field(row,'risk')), reportType, causeCategory:causeCategory.toUpperCase(), causeSubtype:cause.toUpperCase(), deviationType:cause.toUpperCase(),
      description:description.toUpperCase(), supervisorName:clean(field(row,'supervisor')).toUpperCase(), correctiveAction:clean(field(row,'action')).toUpperCase(),
      status:p>=100?'LEVANTADO':p>0?'EN PROCESO':'PENDIENTE', progressPercent:p, environmentalFlag:ai.environmental,
      environmentalCategory:ai.environmentalCategory, environmentalConfidence:ai.confidence, sourceFile:fileName, sourceSheet:chosen.name,
      recordFingerprint:fingerprints.recordFingerprint,contentFingerprint:fingerprints.contentFingerprint,
    });
  }
  const periodList=[...periods.entries()].sort((a,b)=>b[1]-a[1]).map(([period,total])=>({period,total}));
  if(periodList.length>1)warnings.push(`El archivo contiene varios periodos: ${periodList.map(x=>x.period).join(', ')}`);
  const repeated=[...sourceCounts.entries()].filter(([,n])=>n>1).reduce((s,[,n])=>s+n-1,0);
  if(repeated)warnings.push(`${repeated} números de reporte repetidos se conservarán como RACS independientes`);
  const missingStableIds=records.filter(record=>!record.externalId).length;
  if(missingStableIds)warnings.push(`${missingStableIds} RACS no tienen ID ÚNICO ORIGEN. Se aplicará conciliación por fecha, reportante y descripción; usa el modelo oficial para evitar duplicidad.`);
  return { sheetName:chosen.name, headerRow:chosen.headerRow+1, totalRows:rows.length, validRows:records.length, rejectedRows:errors.length, records, errors, warnings, periods:periodList, dominantPeriod:periodList[0]?.period||null, repeatedNumbers:repeated, stableIds:records.length-missingStableIds, missingStableIds };
}
