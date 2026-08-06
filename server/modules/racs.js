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
import { fetchRacCauseCatalog, resolveRacCauseSelection, createRacCauseSubtype, createRacCauseCategory, canonicalRacReportType } from '../services/racCatalog.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';
import { audit, notify } from '../services/audit.js';
import { unitScope, parseFilters } from '../scope.js';
import { config } from '../config.js';
import { dueDateForRisk } from '../services/racDeadlines.js';
import { buildRacFingerprints, findActiveRacMatch, findReconciliationMemory, rememberRacsBeforePurge, restoreReconciliationMemory, allocateUniqueRacReportCode, recoverHistoricalEvidence } from '../services/racReconciliation.js';

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
function buildWhere(req,alias='r'){
  // La visibilidad se determina exclusivamente por las unidades vinculadas al perfil.
  // La asignación individual indica al responsable directo, pero no limita la lectura.
  const scope=unitScope(req.user,alias,1);
  const filters=parseFilters(req.query,scope.next,alias);
  return{where:`${scope.clause} AND ${filters.clause}`,params:[...scope.params,...filters.params]};
}

racsRouter.get('/dashboard',requireCapability('rac:view'),async(req,res)=>{
  const {where,params}=buildWhere(req);
  const k=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE report_type='ACTO SUBESTANDAR')::int acts,COUNT(*) FILTER(WHERE report_type='CONDICION SUBESTANDAR')::int conditions,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted,COUNT(*) FILTER(WHERE status<>'LEVANTADO')::int pending,COUNT(*) FILTER(WHERE risk_level='ALTO')::int high,COUNT(*) FILTER(WHERE due_date<CURRENT_DATE AND status<>'LEVANTADO')::int overdue FROM racs r WHERE ${where}`,params)).rows[0];
  const byRisk=(await pool.query(`SELECT report_type,risk_level,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY report_type,risk_level`,params)).rows;
  const byStatus=(await pool.query(`SELECT status name,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY status ORDER BY total DESC`,params)).rows;
  const byCause=(await pool.query(`SELECT COALESCE(cause_subtype,deviation_type,'OTROS') name,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 10`,params)).rows;
  const bySupervisor=(await pool.query(`
    SELECT name,total,lifted FROM (
      SELECT u.name,COUNT(DISTINCT r.id)::int total,COUNT(DISTINCT r.id) FILTER(WHERE r.status='LEVANTADO')::int lifted
      FROM racs r
      JOIN rac_assignments ra ON ra.rac_id=r.id AND ra.active=TRUE
      JOIN users u ON u.id=ra.supervisor_user_id AND u.active=TRUE AND u.deleted_at IS NULL
      WHERE ${where}
      GROUP BY u.id,u.name
      UNION ALL
      SELECT 'SIN ASIGNAR' name,COUNT(*)::int total,COUNT(*) FILTER(WHERE r.status='LEVANTADO')::int lifted
      FROM racs r
      WHERE ${where} AND NOT EXISTS(SELECT 1 FROM rac_assignments ra WHERE ra.rac_id=r.id AND ra.active=TRUE)
    ) supervisor_totals
    WHERE total>0 ORDER BY total DESC,name LIMIT 15`,params)).rows;
  res.json({kpis:{...k,closurePercent:k.total?Math.round(k.lifted*100/k.total):0},byRisk,byStatus,byCause,bySupervisor});
});

racsRouter.get('/',requireCapability('rac:view'),async(req,res)=>{
  const {where,params}=buildWhere(req);const limit=Math.min(Number(req.query.limit||300),1000);
  const rows=(await pool.query(`SELECT r.*,bu.name business_unit,ar.name reporting_area,ad.name reported_area,da.name directed_area,director.name directed_by_name,
    COALESCE((SELECT string_agg(su.name, ', ' ORDER BY su.name) FROM rac_assignments sra JOIN users su ON su.id=sra.supervisor_user_id WHERE sra.rac_id=r.id AND sra.active=TRUE AND su.active=TRUE AND su.deleted_at IS NULL),u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name,
    (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count
    FROM racs r LEFT JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas ar ON ar.id=r.reporting_area_id LEFT JOIN areas ad ON ad.id=r.reported_area_id LEFT JOIN areas da ON da.id=r.directed_area_id LEFT JOIN users director ON director.id=r.directed_by LEFT JOIN users u ON u.id=r.supervisor_user_id WHERE ${where} ORDER BY r.report_date DESC,r.id DESC LIMIT ${limit}`,params)).rows;
  res.json(rows);
});


racsRouter.get('/changes',requireCapability('rac:view'),async(req,res)=>{
  const {where,params}=buildWhere(req);
  const values=[...params];
  const clauses=[where];
  const search=clean(req.query.search);
  if(search){
    values.push(`%${upper(search)}%`);
    const n=values.length;
    clauses.push(`(
      UPPER(COALESCE(r.report_code,'')) LIKE $${n}
      OR UPPER(COALESCE(r.source_report_number,'')) LIKE $${n}
      OR UPPER(COALESCE(r.reporter_name,'')) LIKE $${n}
      OR UPPER(COALESCE(r.location,'')) LIKE $${n}
      OR UPPER(COALESCE(r.description,'')) LIKE $${n}
      OR UPPER(COALESCE(r.cause_subtype,r.deviation_type,'')) LIKE $${n}
      OR UPPER(COALESCE(u.name,r.supervisor_name_text,'')) LIKE $${n}
      OR EXISTS(SELECT 1 FROM rac_assignments sra JOIN users su ON su.id=sra.supervisor_user_id WHERE sra.rac_id=r.id AND sra.active=TRUE AND UPPER(su.name) LIKE $${n})
    )`);
  }
  const limit=Math.min(Math.max(Number(req.query.limit||200),1),500);
  const rows=(await pool.query(`
    SELECT
      r.id,r.report_code,r.source_report_number,r.business_unit_id,r.report_date,r.risk_level,
      r.report_type,r.deviation_type,r.cause_category,r.cause_subtype,r.reporter_name,r.reporter_type,
      r.location,r.description,r.corrective_action,r.status,r.progress_percent,r.due_date,r.lifted_at,
      r.evidence_required,r.evidence_exemption_reason,r.evidence_exempted_at,r.evidence_exempted_by,
      r.directed_area_id,r.direction_reason,r.directed_by,r.directed_at,
      r.created_at,r.updated_at,
      bu.name business_unit,ar.name reporting_area,ad.name reported_area,da.name directed_area,director.name directed_by_name,
      COALESCE((SELECT string_agg(su.name, ', ' ORDER BY su.name) FROM rac_assignments sra JOIN users su ON su.id=sra.supervisor_user_id WHERE sra.rac_id=r.id AND sra.active=TRUE AND su.active=TRUE AND su.deleted_at IS NULL),u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name,
      COALESCE((
        SELECT MAX(al.created_at)
        FROM audit_log al
        WHERE al.entity_type='RAC' AND al.entity_id=r.id::text
          AND al.action IN ('CREATE_RAC','ASSIGN_RAC','UPDATE_RAC_STATUS','DIRECT_RAC','EDIT_RAC')
      ),r.updated_at,r.created_at) last_change_at,
      (SELECT COUNT(*)::int FROM audit_log al WHERE al.entity_type='RAC' AND al.entity_id=r.id::text AND al.action IN ('CREATE_RAC','ASSIGN_RAC','UPDATE_RAC_STATUS','DIRECT_RAC','EDIT_RAC')) change_count,
      (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count
    FROM racs r
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    LEFT JOIN areas da ON da.id=r.directed_area_id
    LEFT JOIN users director ON director.id=r.directed_by
    LEFT JOIN users u ON u.id=r.supervisor_user_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY last_change_at DESC,r.id DESC
    LIMIT ${limit}
  `,values)).rows;
  if(!rows.length)return res.json([]);

  const ids=rows.map(row=>Number(row.id));
  const idTexts=ids.map(String);
  const changes=(await pool.query(`
    SELECT al.id,al.entity_id::int rac_id,al.action,al.details,al.created_at,
      COALESCE(changer.name,'SISTEMA') changed_by
    FROM audit_log al
    LEFT JOIN users changer ON changer.id=al.user_id
    WHERE al.entity_type='RAC'
      AND al.entity_id=ANY($1::text[])
      AND al.action IN ('CREATE_RAC','ASSIGN_RAC','UPDATE_RAC_STATUS','DIRECT_RAC','EDIT_RAC')
    ORDER BY al.created_at DESC,al.id DESC
  `,[idTexts])).rows;
  const evidence=(await pool.query(`
    SELECT e.id,e.rac_id,e.evidence_type,e.comment,e.original_name,e.stored_name,e.mime_type,e.size_bytes,
      e.drive_web_link,e.drive_status,e.uploaded_at,COALESCE(uploader.name,'USUARIO') uploaded_by_name,
      asset.id asset_id
    FROM rac_evidence e
    LEFT JOIN users uploader ON uploader.id=e.uploaded_by
    LEFT JOIN LATERAL (
      SELECT fa.id
      FROM file_assets fa
      WHERE fa.entity_type='RAC'
        AND fa.entity_id=e.rac_id::text
        AND fa.stored_name=e.stored_name
      ORDER BY fa.id DESC
      LIMIT 1
    ) asset ON TRUE
    WHERE e.rac_id=ANY($1::int[])
    ORDER BY e.uploaded_at DESC,e.id DESC
  `,[ids])).rows;

  const changesBy=new Map();
  for(const item of changes){
    if(!changesBy.has(item.rac_id))changesBy.set(item.rac_id,[]);
    changesBy.get(item.rac_id).push(item);
  }
  const evidenceBy=new Map();
  for(const item of evidence){
    if(!evidenceBy.has(item.rac_id))evidenceBy.set(item.rac_id,[]);
    evidenceBy.get(item.rac_id).push(item);
  }
  res.json(rows.map(row=>({
    ...row,
    changes:changesBy.get(Number(row.id))||[],
    evidence:evidenceBy.get(Number(row.id))||[]
  })));
});

racsRouter.post('/ai/classify',requireCapability('rac:create'),async(req,res)=>{
  const text=clean(req.body.text);if(!text)return res.status(400).json({error:'Escribe el texto original del trabajador'});
  res.json(await classifyRac(text));
});

racsRouter.get('/cause-catalog',requireCapability('rac:view'),async(req,res)=>{
  res.json(await fetchRacCauseCatalog(pool));
});

racsRouter.post('/cause-subtypes',requireCapability('rac:catalog.manage'),async(req,res)=>{
  const subtype=await tx(client=>createRacCauseSubtype(client,{categoryId:req.body.categoryId,name:req.body.name,createdBy:req.user.id}));
  await audit(req,'CREATE_RAC_CAUSE_SUBTYPE','RAC_CAUSE_SUBTYPE',subtype.id,{categoryId:subtype.categoryId,name:subtype.name});
  res.status(201).json(subtype);
});


racsRouter.post('/cause-categories',requireCapability('rac:catalog.manage'),async(req,res)=>{
  const category=await tx(client=>createRacCauseCategory(client,{name:req.body.name,reportType:req.body.reportType,code:req.body.code,createdBy:req.user.id}));
  await audit(req,'CREATE_RAC_CAUSE_CATEGORY','RAC_CAUSE_CATEGORY',category.id,{code:category.code,name:category.name,reportType:category.reportType});
  res.status(201).json(category);
});

racsRouter.post('/reconciliation/evidence-recovery/preview',requireCapability('rac:direct'),asyncRoute(async(req,res)=>{
  const requestedUnit=Number(req.body.businessUnitId||0);
  if(requestedUnit&&!assertUnitAccess(req.user,requestedUnit))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const businessUnitIds=requestedUnit?[requestedUnit]:(req.user.role==='MASTER'?null:req.user.unitIds||[]);
  const result=await recoverHistoricalEvidence(pool,{businessUnitIds,from:req.body.from||null,to:req.body.to||null,actorId:req.user.id,dryRun:true});
  res.json({...result,dryRun:true});
}));

racsRouter.post('/reconciliation/evidence-recovery/execute',requireCapability('rac:direct'),asyncRoute(async(req,res)=>{
  const requestedUnit=Number(req.body.businessUnitId||0);
  if(requestedUnit&&!assertUnitAccess(req.user,requestedUnit))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const businessUnitIds=requestedUnit?[requestedUnit]:(req.user.role==='MASTER'?null:req.user.unitIds||[]);
  const result=await tx(client=>recoverHistoricalEvidence(client,{businessUnitIds,from:req.body.from||null,to:req.body.to||null,actorId:req.user.id,dryRun:false}));
  await audit(req,'RECOVER_RAC_EVIDENCE','RAC_RECONCILIATION','HISTORICAL_EVIDENCE',{...result,businessUnitIds,from:req.body.from||null,to:req.body.to||null});
  res.json({...result,dryRun:false});
}));

racsRouter.post('/',requireCapability('rac:create'),async(req,res)=>{
  const b=req.body;const unitId=Number(b.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const description=upper(b.description);if(!description)return res.status(400).json({error:'Descripción requerida'});
  const ai=b.useAi===false?null:await classifyRac(description);const reportDate=b.reportDate||new Date().toISOString().slice(0,10);const risk=upper(b.riskLevel)||'BAJO';const reportType=canonicalRacReportType(b.reportType||ai?.reportType)||'CONDICION SUBESTANDAR';
  const row=await tx(async client=>{
    const reporting=await areaId(client,b.reportingArea,unitId);const reported=await areaId(client,b.reportedArea||b.reportingArea,unitId);const bu=await unit(client,unitId);if(!bu)throw Object.assign(new Error('Unidad no encontrada'),{status:404});
    const selectedCause=await resolveRacCauseSelection(client,{categoryId:b.causeCategoryId,subtypeId:b.causeSubtypeId,categoryName:b.causeCategory,subtypeName:b.causeSubtype,reportType,fallbackText:description});
    const unitSupervisors=(await client.query(`SELECT DISTINCT u.id,u.name FROM users u JOIN user_business_units ubu ON ubu.user_id=u.id WHERE ubu.business_unit_id=$1 AND u.role='SUPERVISOR' AND u.active=TRUE AND u.deleted_at IS NULL ORDER BY u.name,u.id`,[unitId])).rows;
    const primarySupervisor=unitSupervisors[0]||null;
    const prefix=bu.code||'RAC';const sequence=Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1 AND report_date=$2`,[unitId,reportDate])).rows[0].total)+1;const preferredCode=`${prefix}-${reportDate.replaceAll('-','')}-${String(sequence).padStart(4,'0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;const code=await allocateUniqueRacReportCode(client,preferredCode);
    const fingerprints=buildRacFingerprints({businessUnitName:bu.name,sourceReportNumber:b.sourceReportNumber,reportDate,reporterName:b.reporterName,reportingArea:b.reportingArea,reportedArea:b.reportedArea||b.reportingArea,location:b.location,description});
    const result=await client.query(`INSERT INTO racs(report_code,source_uid,source_report_number,business_unit_id,reporting_area_id,reported_area_id,reporter_name,reporter_type,location,report_date,risk_level,report_type,deviation_type,cause_category,cause_subtype,description,supervisor_user_id,supervisor_name_text,corrective_action,status,progress_percent,due_date,environmental_flag,environmental_category,environmental_confidence,record_fingerprint,content_fingerprint,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PENDIENTE',0,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,[
      code,upper(b.sourceUid)||null,clean(b.sourceReportNumber)||null,unitId,reporting,reported,upper(b.reporterName),upper(b.reporterType)||'COLABORADOR',upper(b.location)||null,reportDate,risk,reportType,selectedCause.subtype.name,selectedCause.category.name,selectedCause.subtype.name,description,primarySupervisor?.id||null,primarySupervisor?.name||null,upper(b.correctiveAction)||null,dueDateForRisk(reportDate,risk),Boolean(ai?.environmental||selectedCause.category.code==='VI'),selectedCause.category.code==='VI'?selectedCause.subtype.name:ai?.environmentalCategory||null,ai?.confidence||null,fingerprints.recordFingerprint,fingerprints.contentFingerprint,req.user.id]);
    await client.query(`UPDATE racs SET cause_category_id=$1,cause_subtype_id=$2 WHERE id=$3`,[selectedCause.category.id,selectedCause.subtype.id,result.rows[0].id]);
    result.rows[0].cause_category_id=selectedCause.category.id;result.rows[0].cause_subtype_id=selectedCause.subtype.id;
    for(const supervisor of unitSupervisors)await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`,[result.rows[0].id,supervisor.id,req.user.id]);
    return {...result.rows[0],assigned_supervisor_ids:unitSupervisors.map(item=>Number(item.id)),assigned_supervisor_names:unitSupervisors.map(item=>item.name),assigned_supervisor_count:unitSupervisors.length};
  });
  await audit(req,'CREATE_RAC','RAC',row.id,{code:row.report_code,automaticSupervisorAssignment:true,supervisorIds:row.assigned_supervisor_ids});
  for(const supervisorId of row.assigned_supervisor_ids||[])if(supervisorId!==req.user.id)await notify(supervisorId,'Nuevo RAC de tu unidad',`${row.report_code} fue registrado en una unidad bajo tu responsabilidad`,'WARN','RAC',row.id);
  res.json(row);
});

racsRouter.post('/import/analyze',requireCapability('rac:import'),upload.single('file'),asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const bu=await unit(pool,req.body.businessUnitId);
  if(!bu)return res.status(400).json({error:'Selecciona una unidad'});
  if(!assertUnitAccess(req.user,bu.id))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const analysis=analyzeRacWorkbook(req.file.buffer,req.file.originalname,{businessUnitName:bu.name,unitCode:bu.code});
  let willUpdate=0,willRestore=0,willInsert=0,preservedStates=0;
  for(const record of analysis.records){
    const existing=await findActiveRacMatch(pool,record,bu.id);
    if(existing){willUpdate++;if(existing.has_operational_activity)preservedStates++;continue;}
    const memory=await findReconciliationMemory(pool,record,bu.id);
    if(memory.length)willRestore++;else willInsert++;
  }
  res.json({...analysis,reconciliationPreview:{willUpdate,willRestore,willInsert,preservedStates},records:analysis.records.slice(0,50)});
}));

racsRouter.post('/import',requireCapability('rac:import'),upload.single('file'),asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const bu=await unit(pool,req.body.businessUnitId);
  if(!bu)return res.status(400).json({error:'Selecciona una unidad'});
  if(!assertUnitAccess(req.user,bu.id))return res.status(403).json({error:'Unidad fuera de tu alcance'});

  const analysis=analyzeRacWorkbook(req.file.buffer,req.file.originalname,{businessUnitName:bu.name,unitCode:bu.code});
  if(!analysis.validRows)return res.status(400).json({error:'El archivo no contiene RACS válidos para importar',details:analysis.errors.slice(0,20)});
  const periodMode=upper(req.body.periodMode)||'ALL';
  const selectedPeriod=clean(req.body.selectedPeriod)||analysis.dominantPeriod;
  let importRecords=analysis.records;
  if(periodMode==='DOMINANT')importRecords=analysis.records.filter(record=>record.reportDate.startsWith(`${analysis.dominantPeriod}-`));
  if(periodMode==='PERIOD'){
    if(!/^\d{4}-\d{2}$/.test(selectedPeriod))return res.status(400).json({error:'Selecciona un periodo válido para importar'});
    importRecords=analysis.records.filter(record=>record.reportDate.startsWith(`${selectedPeriod}-`));
  }
  if(!importRecords.length)return res.status(400).json({error:'No existen RACS válidos en el periodo seleccionado'});
  const importedPeriods=[...new Set(importRecords.map(record=>record.reportDate.slice(0,7)))];
  const detectedPeriod=importedPeriods.length===1?importedPeriods[0]:'MULTIPERIODO';

  const summary=await tx(async client=>{
    const batch=(await client.query(`
      INSERT INTO rac_import_batches(
        original_name,source_file,business_unit_id,imported_by,created_by,
        detected_period,rows_received,total_rows,rows_valid,rows_rejected,
        error_rows,status,summary
      )
      VALUES($1::text,$2::text,$3::int,$4::int,$4::int,$5::varchar(20),$6::int,$6::int,$7::int,$8::int,$8::int,'PROCESANDO',$9::jsonb)
      RETURNING id
    `,[
      req.file.originalname,req.file.originalname,bu.id,req.user.id,detectedPeriod,
      analysis.totalRows,importRecords.length,analysis.errors.length,
      JSON.stringify({periods:analysis.periods,importedPeriods,periodMode,warnings:analysis.warnings})
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

    let inserted=0,updated=0,reconciled=0,restoredEvidence=0,duplicatesMerged=0,preservedOperational=0,sourceRowsConsolidated=0,reportCodesRegenerated=0;
    const touchedRacIds=new Set();
    for(const r of importRecords){
      const reporting=await resolveArea(r.reportingArea);
      const reported=await resolveArea(r.reportedArea);
      const matchedSupervisor=supervisors.get(normalizedName(r.supervisorName))||null;
      const selectedCause=await resolveRacCauseSelection(client,{categoryName:r.causeCategory,subtypeName:r.causeSubtype,reportType:r.reportType,fallbackText:`${r.causeSubtype||''} ${r.description||''}`});
      const existing=await findActiveRacMatch(client,r,bu.id);
      let racId;
      let preserveAssignments=false;

      if(existing){
        const preserveOperational=Boolean(existing.has_operational_activity);
        preserveAssignments=preserveOperational;
        racId=(await client.query(`
          UPDATE racs SET
            source_uid=COALESCE($1,source_uid),
            source_report_number=$2,
            business_unit_id=$3,
            reporting_area_id=$4,
            reported_area_id=$5,
            reporter_name=$6,
            reporter_type=$7,
            location=$8,
            report_date=$9::date,
            risk_level=$10,
            report_type=$11,
            deviation_type=$12,
            cause_category=$13,
            cause_subtype=$14,
            description=$15,
            supervisor_user_id=COALESCE($16,supervisor_user_id),
            supervisor_name_text=COALESCE(NULLIF($17,''),supervisor_name_text),
            corrective_action=COALESCE(NULLIF($18,''),corrective_action),
            status=CASE WHEN $31::boolean THEN status ELSE $19 END,
            progress_percent=CASE WHEN $31::boolean THEN progress_percent ELSE $20 END,
            lifted_at=CASE WHEN $31::boolean THEN lifted_at WHEN $20::int>=100 THEN $9::date ELSE NULL::date END,
            due_date=$21::date,
            environmental_flag=$22,
            environmental_category=$23,
            environmental_confidence=$24,
            source_file=$25,
            source_sheet=$26,
            source_row=$27,
            import_batch_id=$28,
            record_fingerprint=$29,
            content_fingerprint=$30,
            updated_at=NOW()
          WHERE id=$32
          RETURNING id
        `,[
          r.externalId||null,r.sourceReportNumber,bu.id,reporting,reported,r.reporterName,r.reporterType,
          r.location,r.reportDate,r.riskLevel,canonicalRacReportType(r.reportType)||selectedCause.reportType,r.rawCause||r.deviationType||selectedCause.subtype.name,selectedCause.category.name,
          selectedCause.subtype.name,r.description,matchedSupervisor?.id||null,r.supervisorName||null,
          r.correctiveAction||null,r.status,r.progressPercent,dueDateForRisk(r.reportDate,r.riskLevel),
          Boolean(r.environmentalFlag||selectedCause.category.code==='VI'),selectedCause.category.code==='VI'?selectedCause.subtype.name:r.environmentalCategory,r.environmentalConfidence,r.sourceFile,
          r.sourceSheet,r.sourceRow,batch.id,r.recordFingerprint,r.contentFingerprint,preserveOperational,existing.id
        ])).rows[0].id;
        updated++;
        if(preserveOperational)preservedOperational++;
      }else{
        const reportCode=await allocateUniqueRacReportCode(client,r.internalCode);
        if(reportCode!==r.internalCode)reportCodesRegenerated++;
        racId=(await client.query(`
          INSERT INTO racs(
            report_code,source_uid,source_report_number,business_unit_id,reporting_area_id,reported_area_id,
            reporter_name,reporter_type,location,report_date,risk_level,report_type,deviation_type,
            cause_category,cause_subtype,description,supervisor_user_id,supervisor_name_text,
            corrective_action,status,progress_percent,lifted_at,due_date,environmental_flag,
            environmental_category,environmental_confidence,source_file,source_sheet,source_row,
            import_batch_id,record_fingerprint,content_fingerprint,created_by
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::int,
            CASE WHEN $21::int>=100 THEN $10::date ELSE NULL::date END,$22::date,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
          )
          RETURNING id
        `,[
          reportCode,r.externalId||null,r.sourceReportNumber,bu.id,reporting,reported,r.reporterName,r.reporterType,
          r.location,r.reportDate,r.riskLevel,canonicalRacReportType(r.reportType)||selectedCause.reportType,r.rawCause||r.deviationType||selectedCause.subtype.name,selectedCause.category.name,
          selectedCause.subtype.name,r.description,matchedSupervisor?.id||null,r.supervisorName||null,
          r.correctiveAction||null,r.status,r.progressPercent,dueDateForRisk(r.reportDate,r.riskLevel),
          Boolean(r.environmentalFlag||selectedCause.category.code==='VI'),selectedCause.category.code==='VI'?selectedCause.subtype.name:r.environmentalCategory,r.environmentalConfidence,r.sourceFile,
          r.sourceSheet,r.sourceRow,batch.id,r.recordFingerprint,r.contentFingerprint,req.user.id
        ])).rows[0].id;
        inserted++;
      }

      await client.query(`UPDATE racs SET cause_category_id=$1,cause_subtype_id=$2 WHERE id=$3`,[selectedCause.category.id,selectedCause.subtype.id,racId]);

      const memoryRows=await findReconciliationMemory(client,r,bu.id);
      if(memoryRows.length){
        const restored=await restoreReconciliationMemory(client,racId,memoryRows,req.user.id);
        if(restored.restored){reconciled++;restoredEvidence+=restored.evidence;duplicatesMerged+=restored.duplicatesMerged;preserveAssignments=true;}
      }

      if(matchedSupervisor&&!preserveAssignments){
        await client.query(`UPDATE rac_assignments SET active=FALSE WHERE rac_id=$1 AND supervisor_user_id<>$2 AND active=TRUE`,[racId,matchedSupervisor.id]);
        await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`,[racId,matchedSupervisor.id,req.user.id]);
      }

      const normalizedRacId=Number(racId);
      if(touchedRacIds.has(normalizedRacId))sourceRowsConsolidated++;
      touchedRacIds.add(normalizedRacId);
    }

    const sortedImportDates=importRecords.map(row=>row.reportDate).filter(Boolean).sort();
    const historicalEvidenceRecovery=await recoverHistoricalEvidence(client,{
      businessUnitIds:[Number(bu.id)],from:sortedImportDates[0]||null,to:sortedImportDates.at(-1)||null,actorId:req.user.id,dryRun:false
    });
    restoredEvidence+=Number(historicalEvidenceRecovery.inserted||0)+Number(historicalEvidenceRecovery.moved||0);

    const touchedIds=[...touchedRacIds];
    const expectedUnique=touchedIds.length;
    const verified=expectedUnique?Number((await client.query(`
      SELECT COUNT(*)::int total
      FROM racs
      WHERE import_batch_id=$1 AND id=ANY($2::int[])
    `,[batch.id,touchedIds])).rows[0].total):0;
    if(verified!==expectedUnique)throw Object.assign(new Error(`La verificación central esperaba ${expectedUnique} RACS únicos y encontró ${verified}`),{status:500});

    await client.query(`
      UPDATE rac_import_batches
      SET rows_inserted=$1,inserted_rows=$1,rows_updated=$2,updated_rows=$2,status='COMPLETADO',
          summary=COALESCE(summary,'{}'::jsonb)||jsonb_build_object(
            'processedRows',$4::int,
            'uniqueAffected',$5::int,
            'sourceRowsConsolidated',$6::int,
            'reportCodesRegenerated',$7::int
          )
      WHERE id=$3
    `,[inserted,updated,batch.id,importRecords.length,expectedUnique,sourceRowsConsolidated,reportCodesRegenerated]);

    const centralTotal=Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1`,[bu.id])).rows[0].total);
    const periodForTotal=importedPeriods.length===1?importedPeriods[0]:analysis.dominantPeriod;
    const periodTotal=periodForTotal?Number((await client.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=$1::int AND TO_CHAR(report_date,'YYYY-MM')=$2::text`,[bu.id,periodForTotal])).rows[0].total):centralTotal;
    return{
      batchId:batch.id,inserted,updated,reconciled,restoredEvidence,duplicatesMerged,preservedOperational,
      historicalEvidenceRecovery,
      processedRows:importRecords.length,uniqueAffected:expectedUnique,sourceRowsConsolidated,reportCodesRegenerated,verified,centralTotal,periodTotal,
      rejected:analysis.errors.length,period:detectedPeriod,importedPeriods,periodMode,warnings:analysis.warnings
    };
  });

  await audit(req,'IMPORT_RACS','RAC_IMPORT',summary.batchId,summary);
  res.json(summary);
}));


racsRouter.get('/directed',requireCapability('rac:direct'),async(req,res)=>{
  const {where,params}=buildWhere(req);
  const clauses=[where];const values=[...params];
  const directionStatus=upper(req.query.directionStatus||'ALL');
  if(directionStatus==='DIRECTED')clauses.push('r.directed_area_id IS NOT NULL');
  if(directionStatus==='NOT_DIRECTED')clauses.push('r.directed_area_id IS NULL');
  if(req.query.directedAreaId){values.push(Number(req.query.directedAreaId));clauses.push(`r.directed_area_id=$${values.length}`);}
  const search=clean(req.query.search);
  if(search){values.push(`%${upper(search)}%`);const n=values.length;clauses.push(`(UPPER(COALESCE(r.report_code,'')) LIKE $${n} OR UPPER(COALESCE(r.description,'')) LIKE $${n} OR UPPER(COALESCE(r.location,'')) LIKE $${n} OR UPPER(COALESCE(r.cause_subtype,r.deviation_type,'')) LIKE $${n} OR UPPER(COALESCE(da.name,'')) LIKE $${n} OR UPPER(COALESCE(r.direction_reason,'')) LIKE $${n})`);}
  const limit=Math.min(Math.max(Number(req.query.limit||500),1),1000);
  const rows=(await pool.query(`
    SELECT r.*,bu.name business_unit,ar.name reporting_area,ad.name reported_area,da.name directed_area,director.name directed_by_name,
      COALESCE((SELECT string_agg(su.name, ', ' ORDER BY su.name) FROM rac_assignments sra JOIN users su ON su.id=sra.supervisor_user_id WHERE sra.rac_id=r.id AND sra.active=TRUE AND su.active=TRUE AND su.deleted_at IS NULL),u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name,
      (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count
    FROM racs r
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    LEFT JOIN areas da ON da.id=r.directed_area_id
    LEFT JOIN users director ON director.id=r.directed_by
    LEFT JOIN users u ON u.id=r.supervisor_user_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY (r.directed_area_id IS NULL) DESC,COALESCE(r.directed_at,r.updated_at,r.created_at) DESC,r.id DESC
    LIMIT ${limit}
  `,values)).rows;
  res.json(rows);
});

racsRouter.patch('/:id/direction',requireCapability('rac:direct'),async(req,res)=>{
  const id=Number(req.params.id);const b=req.body||{};
  const rac=(await pool.query(`SELECT * FROM racs WHERE id=$1`,[id])).rows[0];
  if(!rac)return res.status(404).json({error:'RAC no encontrado'});
  if(!assertUnitAccess(req.user,rac.business_unit_id))return res.status(403).json({error:'RAC fuera de tu alcance'});
  const directionReason=clean(b.directionReason);
  if(directionReason.length<5)return res.status(400).json({error:'Indica por qué se direcciona el RAC al área seleccionada'});
  const directedAreaId=Number(b.directedAreaId);const reportingAreaId=Number(b.reportingAreaId||rac.reporting_area_id);const reportedAreaId=Number(b.reportedAreaId||rac.reported_area_id);
  if(!directedAreaId)return res.status(400).json({error:'Selecciona el área direccionada'});
  const risk=upper(b.riskLevel||rac.risk_level);if(!['ALTO','MEDIO','BAJO'].includes(risk))return res.status(400).json({error:'Nivel de riesgo inválido'});
  const description=upper(b.description||rac.description);if(!description)return res.status(400).json({error:'La descripción del RAC es obligatoria'});
  const updated=await tx(async client=>{
    const areaIds=[reportingAreaId,reportedAreaId,directedAreaId].filter(Boolean);
    const areas=(await client.query(`SELECT id,name FROM areas WHERE id=ANY($1::int[]) AND active=TRUE`,[areaIds])).rows;
    if(new Set(areas.map(row=>Number(row.id))).size!==new Set(areaIds).size)throw Object.assign(new Error('Una de las áreas seleccionadas no existe o está inactiva'),{status:400});
    for(const areaIdValue of areaIds)await client.query(`INSERT INTO business_unit_areas(business_unit_id,area_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[rac.business_unit_id,areaIdValue]);
    const selectedCause=await resolveRacCauseSelection(client,{categoryId:b.causeCategoryId||rac.cause_category_id,subtypeId:b.causeSubtypeId||rac.cause_subtype_id,reportType:b.reportType||rac.report_type,fallbackText:description});
    const reportType=canonicalRacReportType(selectedCause.category.reportType)||selectedCause.reportType||'CONDICION SUBESTANDAR';
    const result=(await client.query(`UPDATE racs SET
      reporting_area_id=$1,reported_area_id=$2,directed_area_id=$3,direction_reason=$4,directed_by=$5,directed_at=NOW(),
      risk_level=$6,due_date=$7,report_type=$8,deviation_type=$9,cause_category_id=$10,cause_subtype_id=$11,cause_category=$12,cause_subtype=$13,
      description=$14,location=$15,corrective_action=$16,updated_at=NOW()
      WHERE id=$17 RETURNING *`,[
      reportingAreaId,reportedAreaId,directedAreaId,directionReason,req.user.id,risk,dueDateForRisk(rac.report_date,risk),reportType,selectedCause.subtype.name,
      selectedCause.category.id,selectedCause.subtype.id,selectedCause.category.name,selectedCause.subtype.name,description,upper(b.location||rac.location)||null,upper(b.correctiveAction||rac.corrective_action)||null,id
    ])).rows[0];
    const directedArea=areas.find(row=>Number(row.id)===directedAreaId);
    return{...result,directed_area:directedArea?.name||''};
  });
  const details={
    directedAreaId, directedArea:updated.directed_area, directionReason,
    previous:{reportingAreaId:rac.reporting_area_id,reportedAreaId:rac.reported_area_id,directedAreaId:rac.directed_area_id,riskLevel:rac.risk_level,reportType:rac.report_type,causeCategory:rac.cause_category,causeSubtype:rac.cause_subtype,description:rac.description},
    current:{reportingAreaId,reportedAreaId,directedAreaId,riskLevel:updated.risk_level,reportType:updated.report_type,causeCategory:updated.cause_category,causeSubtype:updated.cause_subtype,description:updated.description}
  };
  await audit(req,rac.directed_area_id?'EDIT_RAC':'DIRECT_RAC','RAC',id,details);
  const assigned=(await pool.query(`SELECT DISTINCT supervisor_user_id id FROM rac_assignments WHERE rac_id=$1 AND active=TRUE`,[id])).rows;
  for(const recipient of assigned)if(Number(recipient.id)!==Number(req.user.id))await notify(recipient.id,'RAC direccionado',`${rac.report_code} fue direccionado a ${updated.directed_area}: ${directionReason}`,'WARN','RAC',id);
  res.json({...updated,direction_reason:directionReason});
});

racsRouter.post('/:id/assign',requireCapability('rac:assign'),async(req,res)=>{
  const racId=Number(req.params.id),supervisorId=Number(req.body.supervisorUserId);const rac=(await pool.query(`SELECT business_unit_id,report_code FROM racs WHERE id=$1`,[racId])).rows[0];if(!rac)return res.status(404).json({error:'RAC no encontrado'});if(!assertUnitAccess(req.user,rac.business_unit_id))return res.status(403).json({error:'Unidad fuera de tu alcance'});
  const supervisor=(await pool.query(`SELECT u.id,u.name FROM users u JOIN user_business_units ubu ON ubu.user_id=u.id WHERE u.id=$1 AND u.role='SUPERVISOR' AND ubu.business_unit_id=$2 AND u.active=TRUE`,[supervisorId,rac.business_unit_id])).rows[0];if(!supervisor)return res.status(400).json({error:'Supervisor no pertenece a la unidad'});
  await tx(async client=>{await client.query(`UPDATE rac_assignments SET active=FALSE WHERE rac_id=$1`,[racId]);await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active) VALUES($1,$2,$3,TRUE)`,[racId,supervisorId,req.user.id]);await client.query(`UPDATE racs SET supervisor_user_id=$1,supervisor_name_text=$2,updated_at=NOW() WHERE id=$3`,[supervisorId,supervisor.name,racId]);});
  await notify(supervisorId,'RAC asignado',`${rac.report_code} fue asignado a tu perfil`,'WARN','RAC',racId);await audit(req,'ASSIGN_RAC','RAC',racId,{supervisorId});res.json({ok:true});
});

racsRouter.post('/:id/status',requireCapability('rac:followup'),upload.single('evidence'),async(req,res)=>{
  const id=Number(req.params.id);
  const rac=(await pool.query(`SELECT * FROM racs WHERE id=$1`,[id])).rows[0];
  if(!rac)return res.status(404).json({error:'RAC no encontrado'});
  if(!assertUnitAccess(req.user,rac.business_unit_id))return res.status(403).json({error:'RAC fuera de tu alcance'});

  const target=upper(req.body.status);
  const allowed=['PENDIENTE','EN PROCESO','PENDIENTE DE VALIDACION','DEVUELTO PARA CORRECCION','LEVANTADO'];
  if(!allowed.includes(target))return res.status(400).json({error:'Estado inválido'});
  if(req.user.role==='SUPERVISOR'&&['DEVUELTO PARA CORRECCION','LEVANTADO'].includes(target))return res.status(403).json({error:'El levantamiento debe validarlo SSOMA o Máster'});

  const comment=clean(req.body.comment);
  const noEvidenceRequired=['true','1','on','si','sí'].includes(String(req.body.noEvidenceRequired||'').trim().toLowerCase());
  const canValidate=Array.isArray(req.user.capabilities)&&req.user.capabilities.includes('rac:validate');
  const hasFinalEvidence=(await pool.query(`SELECT 1 FROM rac_evidence WHERE rac_id=$1 AND evidence_type='FINAL' LIMIT 1`,[id])).rowCount>0;

  if(noEvidenceRequired&&(!canValidate||target!=='LEVANTADO'))return res.status(403).json({error:'Solo SSOMA o Máster puede aprobar un cierre que no requiere evidencia'});
  if(noEvidenceRequired&&req.file)return res.status(400).json({error:'No marques “No requiere evidencia” si estás adjuntando un archivo'});
  if(noEvidenceRequired&&comment.length<10)return res.status(400).json({error:'Explica en el comentario por qué este RAC no requiere evidencia'});
  if(target==='PENDIENTE DE VALIDACION'&&!req.file&&!hasFinalEvidence)return res.status(400).json({error:'Adjunta evidencia final para solicitar validación'});
  if(target==='LEVANTADO'&&!req.file&&!hasFinalEvidence&&!noEvidenceRequired)return res.status(400).json({error:'Adjunta evidencia final o marca “No requiere evidencia” y registra la justificación'});

  let asset=null;
  if(req.file){
    const saved=await saveUpload(req.file,`racs/${rac.report_code}`);
    asset=await queueAsset({entityType:'RAC',entityId:rac.id,businessUnitId:rac.business_unit_id,saved,uploadedBy:req.user.id});
    await pool.query(`INSERT INTO rac_evidence(rac_id,evidence_type,comment,original_name,stored_name,mime_type,size_bytes,drive_file_id,drive_web_link,drive_folder_path,drive_status,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,['PENDIENTE DE VALIDACION','LEVANTADO'].includes(target)?'FINAL':'SEGUIMIENTO',comment||null,saved.originalName,saved.storedName,saved.mimeType,saved.size,asset.drive.fileId||null,asset.drive.webViewLink||null,asset.drive.folderPath||null,asset.drive.status,req.user.id]);
  }

  const progress=target==='LEVANTADO'?100:target==='PENDIENTE'?0:target==='EN PROCESO'?50:90;
  await pool.query(`
    WITH input AS (
      SELECT $1::varchar AS target_status,$2::int AS target_progress,$3::int AS actor_id,$4::text AS note,$5::int AS rac_id,$6::boolean AS no_evidence_required
    )
    UPDATE racs r SET
      status=input.target_status,
      progress_percent=input.target_progress,
      first_attention_at=CASE WHEN input.target_status<>'PENDIENTE'::varchar THEN COALESCE(r.first_attention_at,NOW()) ELSE r.first_attention_at END,
      validation_requested_at=CASE WHEN input.target_status='PENDIENTE DE VALIDACION'::varchar THEN NOW() ELSE r.validation_requested_at END,
      validated_at=CASE WHEN input.target_status='LEVANTADO'::varchar THEN NOW() ELSE r.validated_at END,
      validated_by=CASE WHEN input.target_status='LEVANTADO'::varchar THEN input.actor_id ELSE r.validated_by END,
      closed_at=CASE WHEN input.target_status='LEVANTADO'::varchar THEN NOW() ELSE NULL END,
      lifted_at=CASE WHEN input.target_status='LEVANTADO'::varchar THEN CURRENT_DATE ELSE NULL END,
      close_comment=CASE WHEN input.target_status='LEVANTADO'::varchar THEN input.note ELSE r.close_comment END,
      validation_comment=CASE WHEN input.target_status='DEVUELTO PARA CORRECCION'::varchar THEN input.note ELSE r.validation_comment END,
      evidence_required=CASE WHEN input.target_status='LEVANTADO'::varchar THEN NOT input.no_evidence_required ELSE TRUE END,
      evidence_exemption_reason=CASE WHEN input.target_status='LEVANTADO'::varchar AND input.no_evidence_required THEN input.note ELSE NULL END,
      evidence_exempted_at=CASE WHEN input.target_status='LEVANTADO'::varchar AND input.no_evidence_required THEN NOW() ELSE NULL END,
      evidence_exempted_by=CASE WHEN input.target_status='LEVANTADO'::varchar AND input.no_evidence_required THEN input.actor_id ELSE NULL END,
      updated_at=NOW()
    FROM input
    WHERE r.id=input.rac_id
  `,[target,progress,req.user.id,comment||null,id,noEvidenceRequired]);

  if(target==='PENDIENTE DE VALIDACION'){
    const reviewers=(await pool.query(`SELECT DISTINCT u.id FROM users u LEFT JOIN user_business_units ubu ON ubu.user_id=u.id WHERE u.active=TRUE AND u.deleted_at IS NULL AND (u.role='MASTER' OR (u.role='SSOMA' AND ubu.business_unit_id=$1))`,[rac.business_unit_id])).rows;
    for(const reviewer of reviewers)await notify(reviewer.id,'Levantamiento por validar',`${rac.report_code} tiene evidencia final`,'WARN','RAC',id);
  }
  if(target==='DEVUELTO PARA CORRECCION'&&rac.supervisor_user_id)await notify(rac.supervisor_user_id,'Levantamiento devuelto',`${rac.report_code}: ${comment||'Requiere corrección'}`,'ERROR','RAC',id);
  await audit(req,'UPDATE_RAC_STATUS','RAC',id,{from:rac.status,to:target,comment,noEvidenceRequired,evidenceSupport:noEvidenceRequired?'NO_REQUIERE':(req.file||hasFinalEvidence?'EVIDENCIA':'SIN_SUSTENTO')});
  res.json({ok:true,drive:asset?.drive||null,evidenceSupport:noEvidenceRequired?'NO_REQUIERE':'EVIDENCIA'});
});

racsRouter.post('/purge/preview',requireCapability('rac:purge'),async(req,res)=>{
  const unitId=req.body.businessUnitId?Number(req.body.businessUnitId):null;const from=req.body.from||null,to=req.body.to||null;const params=[];const clauses=['TRUE'];let i=1;if(unitId){clauses.push(`business_unit_id=$${i++}`);params.push(unitId);}if(from){clauses.push(`report_date>=$${i++}`);params.push(from);}if(to){clauses.push(`report_date<=$${i++}`);params.push(to);}const rows=(await pool.query(`SELECT COUNT(*)::int total,MIN(report_date) date_from,MAX(report_date) date_to,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted FROM racs WHERE ${clauses.join(' AND ')}`,params)).rows[0];res.json({...rows,phrase:`ELIMINAR ${rows.total} RACS`});
});

racsRouter.post('/purge/execute',requireCapability('rac:purge'),async(req,res)=>{
  const password=String(req.body.currentPassword||'');const master=(await pool.query(`SELECT password_hash FROM users WHERE id=$1`,[req.user.id])).rows[0];if(!master||!(await bcrypt.compare(password,master.password_hash)))return res.status(400).json({error:'Contraseña Máster incorrecta'});
  const unitId=req.body.businessUnitId?Number(req.body.businessUnitId):null,from=req.body.from||null,to=req.body.to||null;const params=[];const clauses=['TRUE'];let i=1;if(unitId){clauses.push(`business_unit_id=$${i++}`);params.push(unitId);}if(from){clauses.push(`report_date>=$${i++}`);params.push(from);}if(to){clauses.push(`report_date<=$${i++}`);params.push(to);}const where=clauses.join(' AND ');
  const selected=(await pool.query(`SELECT r.*,bu.name business_unit,ar.name reporting_area,ad.name reported_area FROM racs r LEFT JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas ar ON ar.id=r.reporting_area_id LEFT JOIN areas ad ON ad.id=r.reported_area_id WHERE ${where.replaceAll('business_unit_id','r.business_unit_id').replaceAll('report_date','r.report_date')} ORDER BY r.id`,params)).rows;const phrase=`ELIMINAR ${selected.length} RACS`;if(req.body.phrase!==phrase)return res.status(409).json({error:`Escribe exactamente: ${phrase}`});
  const backupDir=path.join(config.uploadDir,'purge-backups');await fs.mkdir(backupDir,{recursive:true});const backupPath=path.join(backupDir,`racs-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);const ids=selected.map(x=>x.id);const evidence=ids.length?(await pool.query(`SELECT * FROM rac_evidence WHERE rac_id=ANY($1::int[])`,[ids])).rows:[];const assignments=ids.length?(await pool.query(`SELECT * FROM rac_assignments WHERE rac_id=ANY($1::int[])`,[ids])).rows:[];const purgeReference=path.basename(backupPath,'.json');await fs.writeFile(backupPath,JSON.stringify({createdAt:new Date().toISOString(),filters:{unitId,from,to},racs:selected,evidence,assignments,reconciliationEnabled:true},null,2));
  const remembered=await tx(async client=>{const total=ids.length?await rememberRacsBeforePurge(client,selected,purgeReference):0;if(ids.length)await client.query(`DELETE FROM system_notifications WHERE entity_type='RAC' AND entity_id=ANY($1::text[])`,[ids.map(String)]);if(ids.length)await client.query(`DELETE FROM racs WHERE id=ANY($1::int[])`,[ids]);return total;});
  await audit(req,'PURGE_RACS','RAC_PURGE',purgeReference,{count:ids.length,ids,backupPath,remembered,filters:{unitId,from,to},reconciliationEnabled:true});
  res.json({deleted:ids.length,backupPath,purgeReference,remembered,reconciliationEnabled:true});
});
