import { config } from '../config.js';

const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

const CAUSES = [
  ['CONDICION SUBESTANDAR','ORDEN Y LIMPIEZA','ORDEN Y LIMPIEZA DEFICIENTE',['DESORDEN','BASURA','RESIDUO','SUCIO','LIMPIEZA','OBSTACULO']],
  ['CONDICION SUBESTANDAR','EQUIPOS Y MAQUINARIA','EQUIPO O MAQUINARIA EN MAL ESTADO',['EQUIPO','MAQUINA','CELDA','BOMBA','LOCOMOTORA','FALLA','MAL ESTADO']],
  ['CONDICION SUBESTANDAR','VENTILACION','VENTILACION DEFICIENTE',['VENTILACION','MONOXIDO','GAS','HUMO','AIRE']],
  ['CONDICION SUBESTANDAR','SOSTENIMIENTO','FALTA DE SOSTENIMIENTO O ROCA SUELTA',['ROCA','SOSTENIMIENTO','CUADRO','SOMBRERO','POSTE']],
  ['CONDICION SUBESTANDAR','ENERGIA','ENERGIA ELECTRICA O FUENTES DE ENERGIA',['CABLE','ELECTRICO','ENERGIA','PULSADOR','TABLERO']],
  ['CONDICION SUBESTANDAR','MEDIO AMBIENTE','MANEJO AMBIENTAL DEFICIENTE',['DERRAME','RESIDUO','AGUA','POLVO','SUELO','RELAVE','EFLUENTE','EMISION']],
  ['ACTO SUBESTANDAR','EPP','NO USO O USO INCORRECTO DE EPP',['SIN EPP','NO USA','GUANTE','CASCO','LENTE','ARNES']],
  ['ACTO SUBESTANDAR','PROCEDIMIENTO','INCUMPLIMIENTO DE PROCEDIMIENTO',['PROCEDIMIENTO','PETAR','IPERC','SIN AUTORIZACION','ACTO INSEGURO']],
];

export function classifyRacLocal(text) {
  const n = normalize(text);
  let best = null;
  for (const [reportType, category, subtype, words] of CAUSES) {
    const score = words.reduce((sum,w) => sum + (n.includes(w) ? 1 : 0), 0);
    if (!best || score > best.score) best = { reportType, causeCategory:category, causeSubtype:subtype, score };
  }
  if (!best || best.score === 0) best = { reportType:'CONDICION SUBESTANDAR', causeCategory:'OTROS', causeSubtype:'OTRA CONDICION SUBESTANDAR', score:0 };
  const environmental = ['DERRAME','RESIDUO','AGUA','POLVO','SUELO','RELAVE','EFLUENTE','EMISION','FAUNA','FLORA'].some(x => n.includes(x));
  return { ...best, environmental, environmentalCategory: environmental ? best.causeSubtype : null, confidence: Math.min(0.98, 0.45 + best.score*0.12), source:'REGLAS' };
}

export async function classifyRac(text) {
  const local = classifyRacLocal(text);
  if (!config.openAiKey) return local;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{ authorization:`Bearer ${config.openAiKey}`, 'content-type':'application/json' },
      body: JSON.stringify({
        model:config.openAiModel,
        input:[{ role:'system', content:'Clasifica un reporte SSOMA peruano. Responde solo JSON con reportType, causeCategory, causeSubtype, environmental, environmentalCategory, confidence. No reescribas el texto.' },{ role:'user', content:String(text || '') }],
        text:{ format:{ type:'json_schema', name:'rac_classification', strict:true, schema:{ type:'object', additionalProperties:false, properties:{ reportType:{type:'string'},causeCategory:{type:'string'},causeSubtype:{type:'string'},environmental:{type:'boolean'},environmentalCategory:{type:['string','null']},confidence:{type:'number'} }, required:['reportType','causeCategory','causeSubtype','environmental','environmentalCategory','confidence'] } } }
      })
    });
    if (!response.ok) return local;
    const data = await response.json();
    const parsed = JSON.parse(data.output_text || '{}');
    return { ...local, ...parsed, source:'IA' };
  } catch { return local; }
}

export function classifyFlashLocal(description) {
  const n = normalize(description);
  const critical = ['FATAL','AMPUTACION','ATRAPAMIENTO','EXPLOSION','CAIDA DE ALTURA','ELECTROCUCION'];
  const high = ['FRACTURA','HOSPITAL','INCAPACIDAD','QUEMADURA','GOLPE FUERTE'];
  const potentialSeverity = critical.some(x=>n.includes(x)) ? 'CRITICO' : high.some(x=>n.includes(x)) ? 'ALTO' : 'MEDIO';
  return { potentialSeverity, reason:'Clasificación preventiva por palabras clave', source:'REGLAS' };
}
