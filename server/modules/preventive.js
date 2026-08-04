import { Router } from 'express';
import multer from 'multer';
import { authRequired, requireCapability, assertUnitAccess, scopedUnitIds } from '../auth.js';
import { pool } from '../db.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';
import { audit } from '../services/audit.js';
import { buildRitDailyExcel, buildIdsExcel } from '../reports/preventive.js';

export const preventiveRouter=Router();
preventiveRouter.use(authRequired);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
const clean=value=>String(value??'').trim();
const upper=value=>clean(value).toUpperCase();
const int=value=>Math.max(0,Number.parseInt(value||0,10)||0);
const pct=(executed,programmed)=>programmed?Math.round((executed*1000)/programmed)/10:0;
const performanceFor=value=>Number(value)>=90?'BUENO':Number(value)>=75?'REGULAR':'DEFICIENTE';
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);

function scopeClause(user,alias='x',start=1){
  const ids=scopedUnitIds(user);
  if(ids===null)return{clause:'TRUE',params:[],next:start};
  if(!ids.length)return{clause:'FALSE',params:[],next:start};
  return{clause:`${alias}.business_unit_id=ANY($${start}::int[])`,params:[ids],next:start+1};
}

function ritFilters(query,user,alias='r'){
  const scope=scopeClause(user,alias,1);const clauses=[scope.clause],params=[...scope.params];let i=scope.next;
  if(query.businessUnitId){clauses.push(`${alias}.business_unit_id=$${i++}`);params.push(Number(query.businessUnitId));}
  if(query.from){clauses.push(`${alias}.rit_date>=$${i++}::date`);params.push(query.from);}
  if(query.to){clauses.push(`${alias}.rit_date<=$${i++}::date`);params.push(query.to);}
  if(query.status){clauses.push(`${alias}.status=$${i++}`);params.push(upper(query.status));}
  return{where:clauses.join(' AND '),params};
}

async function ritRows(query,user){
  const f=ritFilters(query,user);
  return (await pool.query(`SELECT r.*,bu.name business_unit,a.name area_name,u.name created_by_name,
      CASE WHEN r.scheduled_count>0 THEN ROUND(r.attendee_count*100.0/r.scheduled_count,1) ELSE 0 END compliance_percent,
      fa.id asset_id,fa.original_name evidence_name,fa.mime_type evidence_mime,fa.size_bytes evidence_size
    FROM rit_daily_records r
    JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas a ON a.id=r.area_id
    LEFT JOIN users u ON u.id=r.created_by
    LEFT JOIN LATERAL (
      SELECT id,original_name,mime_type,size_bytes FROM file_assets
      WHERE entity_type='RIT_DAILY' AND entity_id=CAST(r.id AS text)
      ORDER BY id DESC LIMIT 1
    ) fa ON TRUE
    WHERE ${f.where}
    ORDER BY r.rit_date DESC,r.id DESC`,f.params)).rows;
}

preventiveRouter.get('/rit',requireCapability('rit:view'),asyncRoute(async(req,res)=>res.json(await ritRows(req.query,req.user))));

preventiveRouter.get('/rit/dashboard',requireCapability('rit:view'),asyncRoute(async(req,res)=>{
  const f=ritFilters(req.query,req.user);
  const k=(await pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE status='EJECUTADO')::int executed,
      COUNT(*) FILTER(WHERE status='PROGRAMADO')::int programmed,
      COALESCE(SUM(attendee_count),0)::int attendees,
      COALESCE(SUM(scheduled_count),0)::int scheduled,
      CASE WHEN SUM(scheduled_count)>0 THEN ROUND(SUM(attendee_count)*100.0/SUM(scheduled_count),1) ELSE 0 END compliance
    FROM rit_daily_records r WHERE ${f.where}`,f.params)).rows[0];
  const byUnit=(await pool.query(`SELECT bu.name,COUNT(*)::int total FROM rit_daily_records r JOIN business_units bu ON bu.id=r.business_unit_id WHERE ${f.where} GROUP BY bu.name ORDER BY total DESC,bu.name`,f.params)).rows;
  res.json({kpis:k,byUnit});
}));

preventiveRouter.get('/rit/export.xlsx',requireCapability('rit:view'),asyncRoute(async(req,res)=>{
  const rows=await ritRows(req.query,req.user);
  const buffer=await buildRitDailyExcel(rows,`Periodo: ${req.query.from||'inicio'} a ${req.query.to||'hoy'}`);
  await audit(req,'DOWNLOAD_RIT_DAILY_EXCEL','RIT_DAILY_REPORT',null,{rows:rows.length});
  res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition','attachment; filename="CAPSAN6_RIT_DIARIO.xlsx"');
  res.send(Buffer.from(buffer));
}));

preventiveRouter.post('/rit',requireCapability('rit:manage'),upload.single('evidence'),asyncRoute(async(req,res)=>{
  let data=req.body||{};
  if(req.body?.payload){try{data=JSON.parse(req.body.payload);}catch{return res.status(400).json({error:'Datos RIT no válidos'});}}
  const unitId=Number(data.businessUnitId);if(!unitId||!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const ritDate=clean(data.ritDate);const topic=clean(data.topic);const facilitator=clean(data.facilitatorName);
  if(!ritDate||!topic||!facilitator)return res.status(400).json({error:'Fecha, tema y facilitador son obligatorios'});
  const scheduled=int(data.scheduledCount),attendees=int(data.attendeeCount);
  if(attendees>scheduled&&scheduled>0)return res.status(400).json({error:'Los asistentes no pueden superar al personal programado'});
  const id=Number(data.id||0);let record;
  if(id){
    const existing=(await pool.query(`SELECT * FROM rit_daily_records WHERE id=$1`,[id])).rows[0];
    if(!existing)return res.status(404).json({error:'RIT Diario no encontrado'});
    if(!assertUnitAccess(req.user,existing.business_unit_id))return res.status(403).json({error:'RIT fuera de tu alcance'});
    record=(await pool.query(`UPDATE rit_daily_records SET rit_date=$1,business_unit_id=$2,area_id=$3,guard=$4,topic=$5,facilitator_name=$6,scheduled_count=$7,attendee_count=$8,duration_minutes=$9,status=$10,observation=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[
      ritDate,unitId,data.areaId?Number(data.areaId):null,clean(data.guard)||null,topic,facilitator,scheduled,attendees,int(data.durationMinutes),upper(data.status)||'EJECUTADO',clean(data.observation)||null,id
    ])).rows[0];
  }else{
    record=(await pool.query(`INSERT INTO rit_daily_records(rit_date,business_unit_id,area_id,guard,topic,facilitator_name,scheduled_count,attendee_count,duration_minutes,status,observation,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[
      ritDate,unitId,data.areaId?Number(data.areaId):null,clean(data.guard)||null,topic,facilitator,scheduled,attendees,int(data.durationMinutes),upper(data.status)||'EJECUTADO',clean(data.observation)||null,req.user.id
    ])).rows[0];
  }
  let asset=null;if(req.file){const saved=await saveUpload(req.file,`rit-diario/${record.id}`);asset=(await queueAsset({entityType:'RIT_DAILY',entityId:record.id,businessUnitId:unitId,saved,uploadedBy:req.user.id})).asset;}
  await audit(req,id?'UPDATE_RIT_DAILY':'CREATE_RIT_DAILY','RIT_DAILY',record.id,{unitId,ritDate,topic,scheduled,attendees,assetId:asset?.id||null});
  res.status(id?200:201).json({...record,compliancePercent:pct(attendees,scheduled),assetId:asset?.id||null});
}));

function idsFilters(query,user,alias='i'){
  const scope=scopeClause(user,alias,1);const clauses=[scope.clause],params=[...scope.params];let n=scope.next;
  if(query.businessUnitId){clauses.push(`${alias}.business_unit_id=$${n++}`);params.push(Number(query.businessUnitId));}
  if(query.from){clauses.push(`${alias}.period_start>=$${n++}::date`);params.push(query.from);}
  if(query.to){clauses.push(`${alias}.period_end<=$${n++}::date`);params.push(query.to);}
  if(query.workerId){clauses.push(`${alias}.worker_id=$${n++}`);params.push(Number(query.workerId));}
  return{where:clauses.join(' AND '),params};
}

const idsSelect=`SELECT i.*,bu.name business_unit,w.full_name worker_name,w.dni,
    (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed)::int total_programmed,
    (i.rac_executed+i.rit_cap_executed+i.inspections_executed+i.pare_executed)::int total_executed,
    CASE WHEN (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed)>0
      THEN ROUND((i.rac_executed+i.rit_cap_executed+i.inspections_executed+i.pare_executed)*100.0/
        (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed),1) ELSE 0 END compliance_percent,
    CASE WHEN (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed)=0 THEN 'DEFICIENTE'
      WHEN ((i.rac_executed+i.rit_cap_executed+i.inspections_executed+i.pare_executed)*100.0/
        (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed))>=90 THEN 'BUENO'
      WHEN ((i.rac_executed+i.rit_cap_executed+i.inspections_executed+i.pare_executed)*100.0/
        (i.rac_programmed+i.rit_cap_programmed+i.inspections_programmed+i.pare_programmed))>=75 THEN 'REGULAR'
      ELSE 'DEFICIENTE' END performance
  FROM ids_performance i JOIN business_units bu ON bu.id=i.business_unit_id JOIN workers w ON w.id=i.worker_id`;

async function idsRows(query,user){const f=idsFilters(query,user);return (await pool.query(`${idsSelect} WHERE ${f.where} ORDER BY i.period_end DESC,compliance_percent DESC,w.full_name`,f.params)).rows;}

preventiveRouter.get('/ids/workers',requireCapability('ids:view'),asyncRoute(async(req,res)=>{
  const ids=scopedUnitIds(req.user);const params=[ids,req.query.businessUnitId?Number(req.query.businessUnitId):null];
  const rows=(await pool.query(`SELECT w.id,w.dni,w.full_name,w.business_unit_id,bu.name business_unit,a.name area_name,w.position
    FROM workers w JOIN business_units bu ON bu.id=w.business_unit_id LEFT JOIN areas a ON a.id=w.area_id
    WHERE w.active=TRUE AND ($1::int[] IS NULL OR w.business_unit_id=ANY($1::int[])) AND ($2::int IS NULL OR w.business_unit_id=$2::int)
    ORDER BY bu.name,w.full_name`,params)).rows;res.json(rows);
}));

preventiveRouter.get('/ids',requireCapability('ids:view'),asyncRoute(async(req,res)=>res.json(await idsRows(req.query,req.user))));

preventiveRouter.get('/ids/dashboard',requireCapability('ids:view'),asyncRoute(async(req,res)=>{
  const rows=await idsRows(req.query,req.user);const total=rows.length;
  const average=total?Math.round(rows.reduce((sum,row)=>sum+Number(row.compliance_percent||0),0)*10/total)/10:0;
  res.json({kpis:{records:total,good:rows.filter(x=>x.performance==='BUENO').length,regular:rows.filter(x=>x.performance==='REGULAR').length,deficient:rows.filter(x=>x.performance==='DEFICIENTE').length,average},ranking:rows.slice().sort((a,b)=>Number(b.compliance_percent)-Number(a.compliance_percent)).slice(0,10).map(x=>({name:x.worker_name,total:Number(x.compliance_percent)}))});
}));

preventiveRouter.get('/ids/export.xlsx',requireCapability('ids:view'),asyncRoute(async(req,res)=>{
  const rows=await idsRows(req.query,req.user);const buffer=await buildIdsExcel(rows,`Periodo: ${req.query.from||'inicio'} a ${req.query.to||'hoy'}`);
  await audit(req,'DOWNLOAD_IDS_EXCEL','IDS_REPORT',null,{rows:rows.length});
  res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition','attachment; filename="CAPSAN6_IDS.xlsx"');res.send(Buffer.from(buffer));
}));

preventiveRouter.post('/ids',requireCapability('ids:manage'),asyncRoute(async(req,res)=>{
  const data=req.body||{};const workerId=Number(data.workerId);if(!workerId)return res.status(400).json({error:'Selecciona un trabajador o supervisor'});
  const worker=(await pool.query(`SELECT id,business_unit_id FROM workers WHERE id=$1 AND active=TRUE`,[workerId])).rows[0];if(!worker)return res.status(404).json({error:'Trabajador no encontrado'});
  if(!assertUnitAccess(req.user,worker.business_unit_id))return res.status(403).json({error:'Trabajador fuera de tu alcance'});
  const start=clean(data.periodStart),end=clean(data.periodEnd);if(!start||!end)return res.status(400).json({error:'Registra el periodo del IDS'});if(start>end)return res.status(400).json({error:'La fecha inicial no puede ser posterior a la fecha final'});
  const acts=int(data.actsCount),conditions=int(data.conditionsCount),racExecuted=acts+conditions;
  const values={
    collaborators:int(data.collaboratorsCount),racProgrammed:int(data.racProgrammed),racExecuted,acts,conditions,
    ritProgrammed:int(data.ritCapProgrammed),ritExecuted:int(data.ritCapExecuted),
    inspectionsProgrammed:int(data.inspectionsProgrammed),inspectionsExecuted:int(data.inspectionsExecuted),
    pareProgrammed:int(data.pareProgrammed),pareExecuted:int(data.pareExecuted)
  };
  const record=(await pool.query(`INSERT INTO ids_performance(period_start,period_end,business_unit_id,worker_id,collaborators_count,rac_programmed,rac_executed,acts_count,conditions_count,rit_cap_programmed,rit_cap_executed,inspections_programmed,inspections_executed,pare_programmed,pare_executed,observation,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT(worker_id,period_start,period_end) DO UPDATE SET business_unit_id=EXCLUDED.business_unit_id,collaborators_count=EXCLUDED.collaborators_count,rac_programmed=EXCLUDED.rac_programmed,rac_executed=EXCLUDED.rac_executed,acts_count=EXCLUDED.acts_count,conditions_count=EXCLUDED.conditions_count,rit_cap_programmed=EXCLUDED.rit_cap_programmed,rit_cap_executed=EXCLUDED.rit_cap_executed,inspections_programmed=EXCLUDED.inspections_programmed,inspections_executed=EXCLUDED.inspections_executed,pare_programmed=EXCLUDED.pare_programmed,pare_executed=EXCLUDED.pare_executed,observation=EXCLUDED.observation,updated_at=NOW()
    RETURNING *`,[start,end,worker.business_unit_id,workerId,values.collaborators,values.racProgrammed,values.racExecuted,values.acts,values.conditions,values.ritProgrammed,values.ritExecuted,values.inspectionsProgrammed,values.inspectionsExecuted,values.pareProgrammed,values.pareExecuted,clean(data.observation)||null,req.user.id])).rows[0];
  const totalProgrammed=values.racProgrammed+values.ritProgrammed+values.inspectionsProgrammed+values.pareProgrammed;
  const totalExecuted=values.racExecuted+values.ritExecuted+values.inspectionsExecuted+values.pareExecuted;
  const compliance=pct(totalExecuted,totalProgrammed);
  await audit(req,'SAVE_IDS','IDS',record.id,{workerId,periodStart:start,periodEnd:end,totalProgrammed,totalExecuted,compliance,performance:performanceFor(compliance)});
  res.status(201).json({...record,totalProgrammed,totalExecuted,compliancePercent:compliance,performance:performanceFor(compliance)});
}));
