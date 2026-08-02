import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool, tx } from '../db.js';
import { analyzeRacWorkbook } from '../imports/racWorkbook.js';
import { classifyRac } from '../services/ai.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';
import { audit, notify } from '../services/audit.js';
import { unitScope, parseFilters } from '../scope.js';
import { config } from '../config.js';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
export const racsRouter=Router();
racsRouter.use(authRequired);
const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
const upper=v=>clean(v).toUpperCase();
const normalizedName=v=>upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);

async function areaId(client,name,businessUnitId=null){
  const n=upper(name)||'SIN ÁREA ASIGNADA';
  const id=(await client.query(`INSERT INTO areas(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=TRUE RETURNING id`,[n])).rows[0].id;
  if(businessUnitId)await client.query(`INSERT INTO business_unit_areas(business_unit_id,area_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[Number(businessUnitId),id]);
  return id;
}
async function unit(client,id){const r=await client.query(`SELECT * FROM business_units WHERE id=$1 AND active=TRUE`,[Number(id)]);return r.rows[0];}
function dueDate(date,risk){const days=risk==='ALTO'?1:risk==='MEDIO'?3:7;const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function supervisorClause(user,alias='r'){
  if(user.role!=='SUPERVISOR')return 'TRUE';
  return `(${alias}.supervisor_user_id=${Number(user.id)} OR ${alias}.created_by=${Number(user.id)} OR EXISTS(SELECT 1 FROM rac_assignments ra WHERE ra.rac_id=${alias}.id AND ra.supervisor_user_id=${Number(user.id)} AND ra.active=TRUE))`;
}

function buildWhere(req,alias='r'){
  const scope=unitScope(req.user,alias,1);const filters=parseFilters(req.query,scope.next,alias);return{where:`${scope.clause} AND ${supervisorClause(req.user,alias)} AND ${filters.clause}`,params:[...scope.params,...filters.params]};
}

racsRouter.get('/dashboard',requireCapability('rac:view'),async(req,res)=>{
  const {where,params}=buildWhere(req);
  const k=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE report_type='ACTO SUBESTANDAR')::int acts,COUNT(*) FILTER(WHERE report_type='CONDICION SUBESTANDAR')::int conditions,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted,COUNT(*) FILTER(WHERE status<>'LEVANTADO')::int pending,COUNT(*) FILTER(WHERE risk_level='ALTO')::int high,COUNT(*) FILTER(WHERE due_date<CURRENT_DATE AND status<>'LEVANTADO')::int overdue FROM racs r WHERE ${where}`,params)).rows[0];
  const byRisk=(await pool.query(`SELECT report_type,risk_level,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY report_type,risk_level`,params)).rows;
  const byStatus=(await pool.query(`SELECT status name,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY status ORDER BY total DESC`,params)).rows;
  const byCause=(await pool.query(`SELECT COALESCE(cause_subtype,deviation_type,'OTROS') name,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 10`,params)).rows;
  const bySupervisor=(await pool.query(`SELECT COALESCE(u.name,r.supervisor_name_text,'SIN ASIGNAR') name,COUNT(*)::int total,COUNT(*) FILTER(WHERE r.status='LEVANTADO')::int lifted FROM racs r LEFT JOIN users u ON u.id=r.supervisor_user_id WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 15`,params)).rows;
  res.json({kpis:{...k,closurePercent:k.total?Math.round(k.lifted*100/k.total):0},byRisk,byStatus,byCause,bySupervisor});
});

racsRouter.get('/',requireCapability('rac:view'),async(req,res)=>{
  const {where,params}=buildWhere(req);const limit=Math.min(Number(req.query.limit||300),1000);
  const rows=(await pool.query(`SELECT r.*,bu.name business_unit,ar.name reporting_area,ad.name reported_area,COALESCE(u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name,
    (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count
    FROM racs r LEFT JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas ar ON ar.id=r.reporting_area_id LEFT JOIN areas ad ON ad.id=r.reported_area_id LEFT JOIN users u ON u.id=r.supervisor_user_id WHERE ${where} ORDER BY r.report_date DESC,r.id DESC LIMIT ${limit}`,params)).rows;
  res.json(rows);
});

racsRouter.post('/ai/classify',requireCapability('rac:create'),async(req,res)=>{
  const text=clean(req.body.text);if(!text)return res.status(400).json({error:'Escribe el texto original del trabajador'});
  res.json(await classifyRac(text));
});

racsRouter.post('/',requireCapability('rac:create'),async(req,res)=>{
  const b=req.body;const unitId=Number(b.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const description=upper(b.description);if(!description)return res.status(400).json({error:'Descripción requerida'});
  const ai=b.useAi===false?null:await classifyRac(description);const reportDate=b.reportDate||new Date().toISOString().slice(0,10);const risk=upper(b.riskLevel)||'BAJO';
  const row=await tx(async client=>{
    const reporting=await areaId(client,b.reportingArea,unitId);const reported=await areaId(client,b.reportedArea||b.reportingArea,unitId);const bu=await unit(client,unitId);if(!bu)throw Object.assign(new Error('Unidad no encontrada'),{status:404});
    const prefix=bu.code||'RAC';const sequence=Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1 AND report_date=$2`,[unitId,reportDate])).rows[0].total)+1;const code=`${prefix}-${reportDate.replaceAll('-','')}-${String(sequence).padStart(4,'0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const result=await client.query(`INSERT INTO racs(report_code,source_report_number,business_unit_id,reporting_area_id,reported_area_id,reporter_name,reporter_type,location,report_date,risk_level,report_type,deviation_type,cause_category,cause_subtype,description,supervisor_user_id,supervisor_name_text,corrective_action,status,progress_percent,due_date,environmental_flag,environmental_category,environmental_confidence,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'PENDIENTE',0,$19,$20,$21,$22,$23) RETURNING *`,[
      code,clean(b.sourceReportNumber)||null,unitId,reporting,reported,upper(b.reporterName),upper(b.reporterType)||'COLABORADOR',upper(b.location)||null,reportDate,risk,upper(b.reportType)||ai?.reportType||'CONDICION SUBESTANDAR',upper(b.causeSubtype)||ai?.causeSubtype||'OTROS',upper(b.causeCategory)||ai?.causeCategory||'OTROS',upper(b.causeSubtype)||ai?.causeSubtype||'OTROS',description,b.supervisorUserId?Number(b.supervisorUserId):req.user.role==='SUPERVISOR'?req.user.id:null,upper(b.supervisorName) || (req.user.role==='SUPERVISOR' ? req.user.name : null),upper(b.correctiveAction)||null,dueDate(reportDate,risk),Boolean(ai?.environmental),ai?.environmentalCategory||null,ai?.confidence||null,req.user.id]);
    if(result.rows[0].supervisor_user_id)await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`,[result.rows[0].id,result.rows[0].supervisor_user_id,req.user.id]);
    return result.rows[0];
  });
  await audit(req,'CREATE_RAC','RAC',row.id,{code:row.report_code});if(row.supervisor_user_id&&row.supervisor_user_id!==req.user.id)await notify(row.supervisor_user_id,'Nuevo RAC asignado',`${row.report_code} requiere atención`,'WARN','RAC',row.id);res.json(row);
});

racsRouter.post('/import/analyze',requireCapability('rac:import'),upload.single('file'),asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const bu=await unit(pool,req.body.businessUnitId);
  if(!bu)return res.status(400).json({error:'Selecciona una unidad'});
  if(!assertUnitAccess(req.user,bu.id))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const analysis=analyzeRacWorkbook(req.file.buffer,req.file.originalname,{businessUnitName:bu.name,unitCode:bu.code});
  res.json({...analysis,records:analysis.records.slice(0,50)});
}));

racsRouter.post('/import',requireCapability('rac:import'),upload.single('file'),asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const bu=await unit(pool,req.body.businessUnitId);
  if(!bu)return res.status(400).json({error:'Selecciona una unidad'});
  if(!assertUnitAccess(req.user,bu.id))return res.status(403).json({error:'Unidad fuera de tu alcance'});

  const analysis=analyzeRacWorkbook(req.file.buffer,req.file.originalname,{businessUnitName:bu.name,unitCode:bu.code});
  if(!analysis.validRows)return res.status(400).json({error:'El archivo no contiene RACS válidos para importar',details:analysis.errors.slice(0,20)});

  const summary=await tx(async client=>{
    const batch=(await client.query(`
      INSERT INTO rac_import_batches(
        original_name,source_file,business_unit_id,imported_by,created_by,
        detected_period,rows_received,total_rows,rows_valid,rows_rejected,
        error_rows,status,summary
      )
      VALUES($1,$1,$2,$3,$3,$4,$5,$5,$6,$7,$7,'PROCESANDO',$8::jsonb)
      RETURNING id
    `,[
      req.file.originalname,bu.id,req.user.id,analysis.dominantPeriod,
      analysis.totalRows,analysis.validRows,analysis.errors.length,
      JSON.stringify({periods:analysis.periods,warnings:analysis.warnings})
    ])).rows[0];

    const supervisorRows=(await client.query(`
      SELECT DISTINCT u.id,u.name
      FROM users u
      JOIN user_business_units ubu ON ubu.user_id=u.id
      WHERE u.role='SUPERVISOR'
        AND u.active=TRUE
        AND u.deleted_at IS NULL
        AND ubu.business_unit_id=$1
    `,[bu.id])).rows;
    const supervisors=new Map(supervisorRows.map(row=>[normalizedName(row.name),row]));
    const areaCache=new Map();
    const resolveArea=async name=>{
      const key=normalizedName(name)||'SIN AREA ASIGNADA';
      if(areaCache.has(key))return areaCache.get(key);
      const id=await areaId(client,name,bu.id);
      areaCache.set(key,id);
      return id;
    };

    let inserted=0,updated=0;
    for(const r of analysis.records){
      const reporting=await resolveArea(r.reportingArea);
      const reported=await resolveArea(r.reportedArea);
      const matchedSupervisor=supervisors.get(normalizedName(r.supervisorName))||null;
      const existing=(await client.query(`SELECT id FROM racs WHERE report_code=$1`,[r.internalCode])).rows[0];
      let racId;

      if(existing){
        racId=(await client.query(`
          UPDATE racs SET
            source_report_number=$1,
            business_unit_id=$2,
            reporting_area_id=$3,
            reported_area_id=$4,
            reporter_name=$5,
            reporter_type=$6,
            location=$7,
            report_date=$8::date,
            risk_level=$9,
            report_type=$10,
            deviation_type=$11,
            cause_category=$12,
            cause_subtype=$13,
            description=$14,
            supervisor_user_id=COALESCE($15,supervisor_user_id),
            supervisor_name_text=$16,
            corrective_action=$17,
            status=$18,
            progress_percent=$19,
            lifted_at=CASE WHEN $19::int>=100 THEN $8::date ELSE NULL::date END,
            due_date=$20::date,
            environmental_flag=$21,
            environmental_category=$22,
            environmental_confidence=$23,
            source_file=$24,
            source_sheet=$25,
            source_row=$26,
            import_batch_id=$27,
            updated_at=NOW()
          WHERE id=$28
          RETURNING id
        `,[
          r.sourceReportNumber,bu.id,reporting,reported,r.reporterName,r.reporterType,
          r.location,r.reportDate,r.riskLevel,r.reportType,r.deviationType,r.causeCategory,
          r.causeSubtype,r.description,matchedSupervisor?.id||null,r.supervisorName||null,
          r.correctiveAction||null,r.status,r.progressPercent,dueDate(r.reportDate,r.riskLevel),
          r.environmentalFlag,r.environmentalCategory,r.environmentalConfidence,r.sourceFile,
          r.sourceSheet,r.sourceRow,batch.id,existing.id
        ])).rows[0].id;
        updated++;
      }else{
        racId=(await client.query(`
          INSERT INTO racs(
            report_code,source_report_number,business_unit_id,reporting_area_id,reported_area_id,
            reporter_name,reporter_type,location,report_date,risk_level,report_type,deviation_type,
            cause_category,cause_subtype,description,supervisor_user_id,supervisor_name_text,
            corrective_action,status,progress_percent,lifted_at,due_date,environmental_flag,
            environmental_category,environmental_confidence,source_file,source_sheet,source_row,
            import_batch_id,created_by
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::int,
            CASE WHEN $20::int>=100 THEN $9::date ELSE NULL::date END,$21::date,$22,$23,$24,$25,$26,$27,$28,$29
          )
          RETURNING id
        `,[
          r.internalCode,r.sourceReportNumber,bu.id,reporting,reported,r.reporterName,r.reporterType,
          r.location,r.reportDate,r.riskLevel,r.reportType,r.deviationType,r.causeCategory,
          r.causeSubtype,r.description,matchedSupervisor?.id||null,r.supervisorName||null,
          r.correctiveAction||null,r.status,r.progressPercent,dueDate(r.reportDate,r.riskLevel),
          r.environmentalFlag,r.environmentalCategory,r.environmentalConfidence,r.sourceFile,
          r.sourceSheet,r.sourceRow,batch.id,req.user.id
        ])).rows[0].id;
        inserted++;
      }

      if(matchedSupervisor){
        await client.query(`UPDATE rac_assignments SET active=FALSE WHERE rac_id=$1 AND supervisor_user_id<>$2 AND active=TRUE`,[racId,matchedSupervisor.id]);
        await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`,[racId,matchedSupervisor.id,req.user.id]);
      }
    }

    const verified=Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE import_batch_id=$1`,[batch.id])).rows[0].total);
    if(verified!==inserted+updated)throw Object.assign(new Error(`La verificación central esperaba ${inserted+updated} RACS y encontró ${verified}`),{status:500});

    await client.query(`
      UPDATE rac_import_batches
      SET rows_inserted=$1,inserted_rows=$1,rows_updated=$2,updated_rows=$2,status='COMPLETADO'
      WHERE id=$3
    `,[inserted,updated,batch.id]);

    const centralTotal=Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1`,[bu.id])).rows[0].total);
    const periodTotal=analysis.dominantPeriod?Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1 AND TO_CHAR(report_date,'YYYY-MM')=$2`,[bu.id,analysis.dominantPeriod])).rows[0].total):centralTotal;
    return{
      batchId:batch.id,inserted,updated,verified,centralTotal,periodTotal,
      rejected:analysis.errors.length,period:analysis.dominantPeriod,warnings:analysis.warnings
    };
  });

  await audit(req,'IMPORT_RACS','RAC_IMPORT',summary.batchId,summary);
  res.json(summary);
}));

racsRouter.post('/:id/assign',requireCapability('rac:assign'),async(req,res)=>{
  const racId=Number(req.params.id),supervisorId=Number(req.body.supervisorUserId);const rac=(await pool.query(`SELECT business_unit_id,report_code FROM racs WHERE id=$1`,[racId])).rows[0];if(!rac)return res.status(404).json({error:'RAC no encontrado'});if(!assertUnitAccess(req.user,rac.business_unit_id))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const supervisor=(await pool.query(`SELECT u.id,u.name FROM users u JOIN user_business_units ubu ON ubu.user_id=u.id WHERE u.id=$1 AND u.role='SUPERVISOR' AND ubu.business_unit_id=$2 AND u.active=TRUE`,[supervisorId,rac.business_unit_id])).rows[0];if(!supervisor)return res.status(400).json({error:'Supervisor no pertenece a la unidad'});
  await tx(async client=>{await client.query(`UPDATE rac_assignments SET active=FALSE WHERE rac_id=$1`,[racId]);await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE)`,[racId,supervisorId,req.user.id]);await client.query(`UPDATE racs SET supervisor_user_id=$1,supervisor_name_text=$2,updated_at=NOW() WHERE id=$3`,[supervisorId,supervisor.name,racId]);});
  await notify(supervisorId,'RAC asignado',`${rac.report_code} fue asignado a tu perfil`,'WARN','RAC',racId);await audit(req,'ASSIGN_RAC','RAC',racId,{supervisorId});res.json({ok:true});
});

racsRouter.post('/:id/status',requireCapability('rac:followup'),upload.single('evidence'),async(req,res)=>{
  const id=Number(req.params.id);const rac=(await pool.query(`SELECT * FROM racs WHERE id=$1`,[id])).rows[0];if(!rac)return res.status(404).json({error:'RAC no encontrado'});if(!assertUnitAccess(req.user,rac.business_unit_id)||!['MASTER','SSOMA'].includes(req.user.role)&&!([rac.created_by,rac.supervisor_user_id].includes(req.user.id)||(await pool.query(`SELECT 1 FROM rac_assignments WHERE rac_id=$1 AND supervisor_user_id=$2 AND active=TRUE`,[id,req.user.id])).rowCount))return res.status(403).json({error:'RAC fuera de tu alcance'});
  const target=upper(req.body.status);const allowed=['PENDIENTE','EN PROCESO','PENDIENTE DE VALIDACION','DEVUELTO PARA CORRECCION','LEVANTADO'];if(!allowed.includes(target))return res.status(400).json({error:'Estado inválido'});
  if(req.user.role==='SUPERVISOR'&&['DEVUELTO PARA CORRECCION','LEVANTADO'].includes(target))return res.status(403).json({error:'El levantamiento debe validarlo SSOMA o Máster'});
  if(target==='PENDIENTE DE VALIDACION'&&!req.file)return res.status(400).json({error:'Adjunta evidencia final para solicitar validación'});
  if(target==='LEVANTADO'&&!req.file&&(await pool.query(`SELECT 1 FROM rac_evidence WHERE rac_id=$1 AND evidence_type='FINAL' LIMIT 1`,[id])).rowCount===0)return res.status(400).json({error:'Se requiere evidencia final'});
  const comment=clean(req.body.comment);let asset=null;
  if(req.file){const saved=await saveUpload(req.file,`racs/${rac.report_code}`);asset=await queueAsset({entityType:'RAC',entityId:rac.id,businessUnitId:rac.business_unit_id,saved,uploadedBy:req.user.id});await pool.query(`INSERT INTO rac_evidence(rac_id,evidence_type,comment,original_name,stored_name,mime_type,size_bytes,drive_file_id,drive_web_link,drive_folder_path,drive_status,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,['PENDIENTE DE VALIDACION','LEVANTADO'].includes(target)?'FINAL':'SEGUIMIENTO',comment||null,saved.originalName,saved.storedName,saved.mimeType,saved.size,asset.drive.fileId||null,asset.drive.webViewLink||null,asset.drive.folderPath||null,asset.drive.status,req.user.id]);}
  await pool.query(`UPDATE racs SET status=$1,progress_percent=$2,first_attention_at=CASE WHEN $1<>'PENDIENTE' THEN COALESCE(first_attention_at,NOW()) ELSE first_attention_at END,validation_requested_at=CASE WHEN $1='PENDIENTE DE VALIDACION' THEN NOW() ELSE validation_requested_at END,validated_at=CASE WHEN $1='LEVANTADO' THEN NOW() ELSE validated_at END,validated_by=CASE WHEN $1='LEVANTADO' THEN $3 ELSE validated_by END,closed_at=CASE WHEN $1='LEVANTADO' THEN NOW() ELSE NULL END,lifted_at=CASE WHEN $1='LEVANTADO' THEN CURRENT_DATE ELSE NULL END,close_comment=CASE WHEN $1='LEVANTADO' THEN $4 ELSE close_comment END,validation_comment=CASE WHEN $1='DEVUELTO PARA CORRECCION' THEN $4 ELSE validation_comment END,updated_at=NOW() WHERE id=$5`,[target,target==='LEVANTADO'?100:target==='PENDIENTE'?0:target==='EN PROCESO'?50:90,req.user.id,comment||null,id]);
  if(target==='PENDIENTE DE VALIDACION'){const reviewers=(await pool.query(`SELECT DISTINCT u.id FROM users u LEFT JOIN user_business_units ubu ON ubu.user_id=u.id WHERE u.active=TRUE AND u.deleted_at IS NULL AND (u.role='MASTER' OR (u.role='SSOMA' AND ubu.business_unit_id=$1))`,[rac.business_unit_id])).rows;for(const reviewer of reviewers)await notify(reviewer.id,'Levantamiento por validar',`${rac.report_code} tiene evidencia final`,'WARN','RAC',id);}
  if(target==='DEVUELTO PARA CORRECCION'&&rac.supervisor_user_id)await notify(rac.supervisor_user_id,'Levantamiento devuelto',`${rac.report_code}: ${comment||'Requiere corrección'}`,'ERROR','RAC',id);
  await audit(req,'UPDATE_RAC_STATUS','RAC',id,{from:rac.status,to:target,comment});res.json({ok:true,drive:asset?.drive||null});
});

racsRouter.post('/purge/preview',requireCapability('rac:purge'),async(req,res)=>{
  const unitId=req.body.businessUnitId?Number(req.body.businessUnitId):null;const from=req.body.from||null,to=req.body.to||null;const params=[];const clauses=['TRUE'];let i=1;if(unitId){clauses.push(`business_unit_id=$${i++}`);params.push(unitId);}if(from){clauses.push(`report_date>=$${i++}`);params.push(from);}if(to){clauses.push(`report_date<=$${i++}`);params.push(to);}const rows=(await pool.query(`SELECT COUNT(*)::int total,MIN(report_date) date_from,MAX(report_date) date_to,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted FROM racs WHERE ${clauses.join(' AND ')}`,params)).rows[0];res.json({...rows,phrase:`ELIMINAR ${rows.total} RACS`});
});

racsRouter.post('/purge/execute',requireCapability('rac:purge'),async(req,res)=>{
  const password=String(req.body.currentPassword||'');const master=(await pool.query(`SELECT password_hash FROM users WHERE id=$1`,[req.user.id])).rows[0];if(!master||!(await bcrypt.compare(password,master.password_hash)))return res.status(400).json({error:'Contraseña Máster incorrecta'});
  const unitId=req.body.businessUnitId?Number(req.body.businessUnitId):null,from=req.body.from||null,to=req.body.to||null;const params=[];const clauses=['TRUE'];let i=1;if(unitId){clauses.push(`business_unit_id=$${i++}`);params.push(unitId);}if(from){clauses.push(`report_date>=$${i++}`);params.push(from);}if(to){clauses.push(`report_date<=$${i++}`);params.push(to);}const where=clauses.join(' AND ');
  const selected=(await pool.query(`SELECT * FROM racs WHERE ${where} ORDER BY id`,params)).rows;const phrase=`ELIMINAR ${selected.length} RACS`;if(req.body.phrase!==phrase)return res.status(409).json({error:`Escribe exactamente: ${phrase}`});
  const backupDir=path.join(config.uploadDir,'purge-backups');await fs.mkdir(backupDir,{recursive:true});const backupPath=path.join(backupDir,`racs-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);const ids=selected.map(x=>x.id);const evidence=ids.length?(await pool.query(`SELECT * FROM rac_evidence WHERE rac_id=ANY($1::int[])`,[ids])).rows:[];await fs.writeFile(backupPath,JSON.stringify({createdAt:new Date().toISOString(),filters:{unitId,from,to},racs:selected,evidence},null,2));
  await tx(async client=>{if(ids.length)await client.query(`DELETE FROM system_notifications WHERE entity_type='RAC' AND entity_id=ANY($1::text[])`,[ids.map(String)]);if(ids.length)await client.query(`DELETE FROM racs WHERE id=ANY($1::int[])`,[ids]);});
  await audit(req,'PURGE_RACS','RAC',ids.join(','),{count:ids.length,backupPath});res.json({deleted:ids.length,backupPath});
});
