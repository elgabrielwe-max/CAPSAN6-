import { config } from '../config.js';
import { RAC_CAUSE_CATALOG, categoryByReference, subtypeByReference, classifyCauseFromCatalog, normalizeCauseText } from '../racCauseCatalog.js';

const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const environmentalWords=['DERRAME','RESIDUO','AGUA','POLVO','SUELO','RELAVE','EFLUENTE','EMISION','FAUNA','FLORA','HIDROCARBURO'];

function withEnvironmental(classification,text) {
  const n=normalize(text);const environmental=classification.causeCategoryCode==='VI'||environmentalWords.some(word=>n.includes(word));
  return{...classification,environmental,environmentalCategory:environmental?classification.causeSubtype:null,confidence:Math.min(0.98,0.48+Number(classification.score||0)*0.12)};
}

export function classifyRacLocal(text,preferredReportType='') {
  return{...withEnvironmental(classifyCauseFromCatalog(text,preferredReportType),text),source:'REGLAS'};
}

function canonicalizeAiResult(parsed,text,local) {
  const category=categoryByReference(parsed.causeCategoryCode||parsed.causeCategory,parsed.reportType)||categoryByReference(parsed.causeCategoryCode||parsed.causeCategory)||null;
  const subtype=category?subtypeByReference(parsed.causeSubtype,category):subtypeByReference(parsed.causeSubtype);
  if(!category||!subtype)return local;
  const reportType=category.reportType;const result={reportType,causeCategoryCode:category.code,causeCategory:category.name,causeSubtype:subtype.name,score:local.score||0};
  const environmental=category.code==='VI'||Boolean(parsed.environmental)||environmentalWords.some(word=>normalize(text).includes(word));
  return{...result,environmental,environmentalCategory:environmental?subtype.name:null,confidence:Number.isFinite(Number(parsed.confidence))?Math.max(0,Math.min(1,Number(parsed.confidence))):local.confidence,source:'IA'};
}

export async function classifyRac(text) {
  const local=classifyRacLocal(text);
  if(!config.openAiKey)return local;
  try{
    const allowed=RAC_CAUSE_CATALOG.map(category=>({code:category.code,name:category.name,reportType:category.reportType,subtypes:category.subtypes}));
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${config.openAiKey}`,'content-type':'application/json'},
      body:JSON.stringify({
        model:config.openAiModel,
        input:[
          {role:'system',content:`Clasifica un reporte SSOMA peruano usando exclusivamente este catálogo institucional: ${JSON.stringify(allowed)}. Responde solo JSON. No inventes categorías ni subcausas y no reescribas el texto original.`},
          {role:'user',content:String(text||'')}
        ],
        text:{format:{type:'json_schema',name:'rac_classification',strict:true,schema:{type:'object',additionalProperties:false,properties:{reportType:{type:'string'},causeCategoryCode:{type:'string'},causeCategory:{type:'string'},causeSubtype:{type:'string'},environmental:{type:'boolean'},environmentalCategory:{type:['string','null']},confidence:{type:'number'}},required:['reportType','causeCategoryCode','causeCategory','causeSubtype','environmental','environmentalCategory','confidence']}}}
      })
    });
    if(!response.ok)return local;const data=await response.json();const parsed=JSON.parse(data.output_text||'{}');return canonicalizeAiResult(parsed,text,local);
  }catch{return local;}
}

export function classifyFlashLocal(description) {
  const n=normalize(description);const critical=['FATAL','AMPUTACION','ATRAPAMIENTO','EXPLOSION','CAIDA DE ALTURA','ELECTROCUCION'];const high=['FRACTURA','HOSPITAL','INCAPACIDAD','QUEMADURA','GOLPE FUERTE'];const potentialSeverity=critical.some(x=>n.includes(x))?'CRITICO':high.some(x=>n.includes(x))?'ALTO':'MEDIO';return{potentialSeverity,reason:'Clasificación preventiva por palabras clave',source:'REGLAS'};
}
