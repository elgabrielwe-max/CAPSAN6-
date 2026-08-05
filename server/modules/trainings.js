import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool, tx } from '../db.js';
import { audit } from '../services/audit.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
export const trainingsRouter=Router();
trainingsRouter.use(authRequired);

const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
const upper=v=>clean(v).toUpperCase();
const resultFor=(score,min)=>Number(score)>=Number(min||16)?'APROBADO':'DESAPROBADO';
const isPdf=file=>file&&(file.mimetype==='application/pdf'||/\.pdf$/i.test(file.originalname||''));
const isTrainingDocument=file=>{
  if(!file)return false;
  const mime=String(file.mimetype||'').toLowerCase(),name=String(file.originalname||'').toLowerCase();
  return isPdf(file)||mime.startsWith('image/')||mime.includes('word')||mime.includes('excel')||mime.includes('spreadsheet')||/\.(docx?|xlsx?|png|jpe?g|webp)$/i.test(name);
};

async function getTraining(id){return (await pool.query(`SELECT * FROM trainings WHERE id=$1`,[Number(id)])).rows[0];}
async function targetScope(trainingId,unitId){
  const rows=(await pool.query(`SELECT area_id FROM training_targets WHERE training_id=$1::int AND business_unit_id=$2::int ORDER BY area_id NULLS FIRST`,[Number(trainingId),Number(unitId)])).rows;
  return {exists:rows.length>0,unitWide:rows.some(row=>row.area_id===null),areaIds:rows.filter(row=>row.area_id!==null).map(row=>Number(row.area_id))};
}
async function assertTarget(trainingId,unitId,areaId){
  const scope=await targetScope(trainingId,unitId);
  if(!scope.exists)return false;
  if(scope.unitWide)return true;
  return areaId?scope.areaIds.includes(Number(areaId)):scope.areaIds.length>0;
}

trainingsRouter.get('/',requireCapability('training:grade'),async(req,res)=>{
  const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));
  const rows=(await pool.query(`SELECT t.*,COALESCE(json_agg(DISTINCT jsonb_build_object('id',tt.id,'businessUnitId',tt.business_unit_id,'businessUnit',bu.name,'areaId',tt.area_id,'area',a.name)) FILTER(WHERE tt.id IS NOT NULL),'[]') targets,
    COUNT(DISTINCT g.worker_id)::int graded,COUNT(DISTINCT taf.id)::int attendance_files
    FROM trainings t
    LEFT JOIN training_targets tt ON tt.training_id=t.id
    LEFT JOIN business_units bu ON bu.id=tt.business_unit_id
    LEFT JOIN areas a ON a.id=tt.area_id
    LEFT JOIN grades g ON g.training_id=t.id
    LEFT JOIN training_attendance_files taf ON taf.training_id=t.id AND ($1::int[] IS NULL OR taf.business_unit_id=ANY($1::int[]))
    WHERE ($1::int[] IS NULL OR tt.business_unit_id=ANY($1::int[])) GROUP BY t.id ORDER BY t.created_at DESC`,[unitIds])).rows;
  res.json(rows);
});

trainingsRouter.post('/',requireCapability('training:manage'),async(req,res)=>{
  const {id}=req.body;const title=upper(req.body.title);const targets=req.body.targets||[];
  if(!title||!targets.length)return res.status(400).json({error:'Registra tema y al menos una unidad/área'});
  for(const t of targets)if(!assertUnitAccess(req.user,t.businessUnitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const training=await tx(async client=>{
    let row;
    if(id){row=(await client.query(`UPDATE trainings SET title=$1,description=$2,evaluation_topic=$3,start_date=$4,end_date=$5,approved_min=$6,score_min=$7,score_max=$8,status=$9,enabled=$10 WHERE id=$11 RETURNING *`,[title,clean(req.body.description)||null,upper(req.body.evaluationTopic)||null,req.body.startDate||null,req.body.endDate||null,Number(req.body.approvedMin||16),Number(req.body.scoreMin||0),Number(req.body.scoreMax||20),upper(req.body.status)||'PROGRAMADO',req.body.enabled!==false,Number(id)])).rows[0];}
    else{row=(await client.query(`INSERT INTO trainings(title,description,evaluation_topic,start_date,end_date,approved_min,failed_max,score_min,score_max,status,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[title,clean(req.body.description)||null,upper(req.body.evaluationTopic)||null,req.body.startDate||null,req.body.endDate||null,Number(req.body.approvedMin||16),Number(req.body.approvedMin||16)-0.01,Number(req.body.scoreMin||0),Number(req.body.scoreMax||20),upper(req.body.status)||'PROGRAMADO',req.body.enabled!==false,req.user.id])).rows[0];}
    await client.query(`DELETE FROM training_targets WHERE training_id=$1`,[row.id]);
    for(const target of targets)await client.query(`INSERT INTO training_targets(training_id,business_unit_id,area_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[row.id,Number(target.businessUnitId),target.areaId?Number(target.areaId):null]);
    return row;
  });
  await audit(req,id?'UPDATE_TRAINING':'CREATE_TRAINING','TRAINING',training.id,{targets});res.json(training);
});

trainingsRouter.get('/:id/roster',requireCapability('training:grade'),async(req,res)=>{
  const id=Number(req.params.id);const training=await getTraining(id);if(!training)return res.status(404).json({error:'Capacitación no encontrada'});
  const unitId=Number(req.query.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const areaId=req.query.areaId?Number(req.query.areaId):null;
  const scope=await targetScope(id,unitId);
  if(!scope.exists)return res.status(400).json({error:'El tema no está asignado a la unidad seleccionada'});
  if(areaId&&!scope.unitWide&&!scope.areaIds.includes(areaId))return res.status(400).json({error:'El área no forma parte de la asignación del tema'});
  const params=[id,unitId];let areaClause='';
  if(areaId){params.push(areaId);areaClause=`AND w.area_id=$3::int`;}
  else if(!scope.unitWide){params.push(scope.areaIds);areaClause=`AND w.area_id=ANY($3::int[])`;}
  const rows=(await pool.query(`SELECT w.id,w.dni,w.full_name,a.name area,w.position,w.guard,g.score,g.result,g.attendance_status,g.observation FROM workers w JOIN areas a ON a.id=w.area_id LEFT JOIN grades g ON g.worker_id=w.id AND g.training_id=$1::int WHERE w.active=TRUE AND w.business_unit_id=$2::int ${areaClause} ORDER BY a.name,w.full_name`,params)).rows;
  res.json({training,workers:rows,targetScope:{unitWide:scope.unitWide,areaIds:scope.areaIds}});
});

trainingsRouter.get('/:id/attendance-files',requireCapability('training:grade'),async(req,res)=>{
  const trainingId=Number(req.params.id),unitId=Number(req.query.businessUnitId),areaId=req.query.areaId?Number(req.query.areaId):null;
  if(!(await getTraining(trainingId)))return res.status(404).json({error:'Capacitación no encontrada'});
  if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  if(!(await assertTarget(trainingId,unitId,areaId)))return res.status(400).json({error:'El tema no está asignado a esa unidad/área'});
  const rows=(await pool.query(`SELECT taf.id,taf.training_id,taf.business_unit_id,taf.area_id,taf.created_at,fa.id file_asset_id,fa.original_name,fa.mime_type,fa.size_bytes,fa.drive_status,fa.drive_web_link,u.name uploaded_by_name,bu.name business_unit_name,a.name area_name
    FROM training_attendance_files taf
    JOIN file_assets fa ON fa.id=taf.file_asset_id
    JOIN business_units bu ON bu.id=taf.business_unit_id
    LEFT JOIN areas a ON a.id=taf.area_id
    LEFT JOIN users u ON u.id=taf.uploaded_by
    WHERE taf.training_id=$1 AND taf.business_unit_id=$2 AND ($3::int IS NULL OR taf.area_id=$3::int)
    ORDER BY taf.created_at DESC`,[trainingId,unitId,areaId])).rows;
  res.json(rows);
});

trainingsRouter.post('/:id/attendance-files',requireCapability('training:grade'),upload.single('file'),async(req,res)=>{
  const trainingId=Number(req.params.id),unitId=Number(req.body.businessUnitId),areaId=req.body.areaId?Number(req.body.areaId):null;
  const training=await getTraining(trainingId);if(!training)return res.status(404).json({error:'Capacitación no encontrada'});
  if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  if(!(await assertTarget(trainingId,unitId,areaId)))return res.status(400).json({error:'El tema no está asignado a esa unidad/área'});
  if(!isTrainingDocument(req.file))return res.status(400).json({error:'Adjunta la lista de asistentes en PDF, imagen, Word o Excel'});
  const saved=await saveUpload(req.file,`capacitaciones/${trainingId}/asistencia`);
  const queued=await queueAsset({entityType:'TRAINING_ATTENDANCE',entityId:trainingId,businessUnitId:unitId,saved,uploadedBy:req.user.id});
  const record=(await pool.query(`INSERT INTO training_attendance_files(training_id,business_unit_id,area_id,file_asset_id,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[trainingId,unitId,areaId,queued.asset.id,req.user.id])).rows[0];
  await audit(req,'UPLOAD_TRAINING_ATTENDANCE','TRAINING',trainingId,{unitId,areaId,fileAssetId:queued.asset.id,originalName:saved.originalName});
  res.status(201).json({...record,fileAssetId:queued.asset.id,drive:queued.drive});
});

trainingsRouter.post('/:id/grades',requireCapability('training:grade'),async(req,res)=>{
  const id=Number(req.params.id);const training=(await pool.query(`SELECT approved_min,score_min,score_max FROM trainings WHERE id=$1`,[id])).rows[0];if(!training)return res.status(404).json({error:'Capacitación no encontrada'});
  const grades=req.body.grades||[];let saved=0;
  await tx(async client=>{
    for(const item of grades){
      if(item.score===null||item.score===undefined||item.score==='')continue;
      const score=Number(item.score);if(score<Number(training.score_min)||score>Number(training.score_max))throw Object.assign(new Error(`Nota fuera del rango permitido: ${score}`),{status:400});
      const worker=(await client.query(`SELECT business_unit_id FROM workers WHERE id=$1 AND active=TRUE`,[Number(item.workerId)])).rows[0];if(!worker||!assertUnitAccess(req.user,worker.business_unit_id))throw Object.assign(new Error('Trabajador fuera de tu alcance'),{status:403});
      await client.query(`INSERT INTO grades(training_id,worker_id,score,result,attendance_status,observation,entered_by,entered_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(training_id,worker_id) DO UPDATE SET score=EXCLUDED.score,result=EXCLUDED.result,attendance_status=EXCLUDED.attendance_status,observation=EXCLUDED.observation,entered_by=EXCLUDED.entered_by,entered_at=NOW()`,[id,Number(item.workerId),score,resultFor(score,training.approved_min),upper(item.attendanceStatus)||'ASISTIO',clean(item.observation)||null,req.user.id]);saved++;
    }
  });
  await audit(req,'SAVE_GRADES','TRAINING',id,{saved});res.json({saved});
});

trainingsRouter.get('/dashboard/summary',requireCapability('training:report'),async(req,res)=>{
  const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));const params=[unitIds];let i=2;const clauses=[`($1::int[] IS NULL OR w.business_unit_id=ANY($1::int[]))`];
  if(req.query.businessUnitId){clauses.push(`w.business_unit_id=$${i++}`);params.push(Number(req.query.businessUnitId));}
  if(req.query.areaId){clauses.push(`w.area_id=$${i++}`);params.push(Number(req.query.areaId));}
  if(req.query.trainingId){clauses.push(`t.id=$${i++}`);params.push(Number(req.query.trainingId));}
  if(req.query.from){clauses.push(`COALESCE(t.start_date,t.created_at::date)>=$${i++}`);params.push(req.query.from);}
  if(req.query.to){clauses.push(`COALESCE(t.end_date,t.created_at::date)<=$${i++}`);params.push(req.query.to);}
  const where=clauses.join(' AND ');
  const k=(await pool.query(`SELECT COUNT(DISTINCT w.id)::int workers,COUNT(DISTINCT t.id)::int topics,COUNT(DISTINCT (t.id,w.id))::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where}`,params)).rows[0];
  const byArea=(await pool.query(`SELECT a.name,COUNT(DISTINCT (t.id,w.id))::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN areas a ON a.id=w.area_id JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where} GROUP BY a.name ORDER BY a.name`,params)).rows;
  const byTopic=(await pool.query(`SELECT t.id,t.title,COUNT(DISTINCT w.id)::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where} GROUP BY t.id ORDER BY t.title`,params)).rows;
  const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;
  res.json({kpis:{workers:k.workers,topics:k.topics,expected:k.expected,graded:k.graded,approved:k.approved,average:k.average||0,trainingCompliance:pct(k.graded,k.expected),gradeCompliance:pct(k.graded,k.expected),trainedPercent:pct(k.graded,k.expected),approvalPercent:pct(k.approved,k.graded)},byArea:byArea.map(x=>({...x,compliance:pct(x.graded,x.expected),approval:pct(x.approved,x.graded)})),byTopic:byTopic.map(x=>({...x,compliance:pct(x.graded,x.expected),approval:pct(x.approved,x.graded)}))});
});

function h(v){return upper(v).replace(/[^A-Z0-9]+/g,'');}
function value(row,names){const set=new Set(names.map(h));for(const [k,v] of Object.entries(row))if(set.has(h(k))&&clean(v))return v;return '';}
trainingsRouter.post('/import/topics',requireCapability('training:manage'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const wb=XLSX.read(req.file.buffer,{type:'buffer',cellDates:true});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});let inserted=0,rejected=0;
  await tx(async client=>{for(const row of rows){const title=upper(value(row,['TEMA','CAPACITACION','TITULO']));const unitName=upper(value(row,['UNIDAD','UNIDAD DE NEGOCIO']));const areaName=upper(value(row,['AREA','ÁREA']));if(!title||!unitName){rejected++;continue;}const unit=(await client.query(`SELECT id FROM business_units WHERE UPPER(name)=UPPER($1)`,[unitName])).rows[0];if(!unit){rejected++;continue;}let area=null;if(areaName)area=(await client.query(`INSERT INTO areas(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=TRUE RETURNING id`,[areaName])).rows[0];const training=(await client.query(`INSERT INTO trainings(title,description,evaluation_topic,start_date,end_date,approved_min,status,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,'PROGRAMADO',TRUE,$7) RETURNING id`,[title,clean(value(row,['DESCRIPCION','CONTENIDO']))||null,upper(value(row,['EVALUACION','PREGUNTA']))||null,value(row,['FECHA INICIO','INICIO'])||null,value(row,['FECHA FIN','FIN'])||null,Number(value(row,['NOTA APROBATORIA','APROBADO'])||16),req.user.id])).rows[0];await client.query(`INSERT INTO training_targets(training_id,business_unit_id,area_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[training.id,unit.id,area?.id||null]);inserted++;}});
  await audit(req,'IMPORT_TRAINING_TOPICS','TRAINING_IMPORT',req.file.originalname,{inserted,rejected});res.json({inserted,rejected,total:rows.length});
});
