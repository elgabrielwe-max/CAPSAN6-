import { Router } from 'express';
import crypto from 'node:crypto';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool } from '../db.js';
import { buildRacExecutiveExcel, buildRacExecutivePpt } from '../reports/racExecutive.js';
import { buildTrainingExcel } from '../reports/trainingExecutive.js';
import { buildFlashReportExcel } from '../reports/flashReport.js';
import { buildRacControlExcel } from '../reports/racControl.js';
import { RAC_DEADLINE_RULES } from '../services/racDeadlines.js';
import { audit } from '../services/audit.js';
import { config } from '../config.js';
import { reportPeriod } from '../services/reportDates.js';

export const reportsRouter=Router();
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
reportsRouter.use(authRequired,requireCapability('reports:executive'));

function paramsFrom(query,user){
  const params=[];const clauses=['TRUE'];let i=1;
  if(user.role!=='MASTER'){clauses.push(`r.business_unit_id=ANY($${i++}::int[])`);params.push(user.units.map(x=>Number(x.id)));}
  if(query.businessUnitId){clauses.push(`r.business_unit_id=$${i++}`);params.push(Number(query.businessUnitId));}
  if(query.from){clauses.push(`r.report_date>=$${i++}::date`);params.push(query.from);}
  if(query.to){clauses.push(`r.report_date<=$${i++}::date`);params.push(query.to);}
  if(query.status){clauses.push(`r.status=$${i++}::varchar`);params.push(query.status);}
  if(query.risk){clauses.push(`r.risk_level=$${i++}::varchar`);params.push(query.risk);}
  return{where:clauses.join(' AND '),params};
}

async function reportRows(query,user){
  const f=paramsFrom(query,user);
  const rows=(await pool.query(`SELECT r.*,bu.name business_unit,ar.name reporting_area,ad.name reported_area,COALESCE(u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name
    FROM racs r LEFT JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas ar ON ar.id=r.reporting_area_id LEFT JOIN areas ad ON ad.id=r.reported_area_id LEFT JOIN users u ON u.id=r.supervisor_user_id
    WHERE ${f.where} ORDER BY bu.name,r.report_date,r.id`,f.params)).rows;
  if(!rows.length)return rows;
  const ids=rows.map(r=>String(r.id));
  const assets=(await pool.query(`SELECT entity_id,local_path,original_name,mime_type,created_at FROM file_assets WHERE entity_type='RAC' AND entity_id=ANY($1::text[]) AND COALESCE(mime_type,'') LIKE 'image/%' ORDER BY created_at,id`,[ids])).rows;
  const byRac=new Map();for(const a of assets){if(!byRac.has(a.entity_id))byRac.set(a.entity_id,[]);byRac.get(a.entity_id).push(a);}
  return rows.map(r=>({...r,evidence_files:byRac.get(String(r.id))||[]}));
}

async function workerCounts(user){
  const unitIds=user.role==='MASTER'?null:user.units.map(x=>Number(x.id));
  return Object.fromEntries((await pool.query(`SELECT bu.name,COUNT(*)::int total
    FROM workers w JOIN business_units bu ON bu.id=w.business_unit_id
    WHERE w.active=TRUE AND ($1::int[] IS NULL OR w.business_unit_id=ANY($1::int[]))
    GROUP BY bu.name`,[unitIds])).rows.map(x=>[x.name,x.total]));
}

async function trainingCalendar(user,query,rows){
  const period=reportPeriod(rows,query);const params=[period.from,period.to];const clauses=[`COALESCE(t.start_date,t.created_at::date) BETWEEN $1::date AND $2::date`];let i=3;
  if(user.role!=='MASTER'){clauses.push(`tt.business_unit_id=ANY($${i++}::int[])`);params.push(user.units.map(x=>Number(x.id)));}
  if(query.businessUnitId){clauses.push(`tt.business_unit_id=$${i++}::int`);params.push(Number(query.businessUnitId));}
  return (await pool.query(`SELECT t.id,t.title,COALESCE(t.start_date,t.created_at::date) scheduled_date,bu.name business_unit,tt.business_unit_id,
    COUNT(DISTINCT g.worker_id) FILTER(WHERE w.business_unit_id=tt.business_unit_id)::int graded
    FROM trainings t JOIN training_targets tt ON tt.training_id=t.id JOIN business_units bu ON bu.id=tt.business_unit_id
    LEFT JOIN grades g ON g.training_id=t.id LEFT JOIN workers w ON w.id=g.worker_id
    WHERE t.enabled=TRUE AND ${clauses.join(' AND ')}
    GROUP BY t.id,t.title,COALESCE(t.start_date,t.created_at::date),bu.name,tt.business_unit_id
    ORDER BY scheduled_date,bu.name,t.title`,params)).rows;
}

async function label(query){
  let unit='';if(query.businessUnitId)unit=(await pool.query(`SELECT name FROM business_units WHERE id=$1`,[Number(query.businessUnitId)])).rows[0]?.name||'';
  return `Periodo: ${query.from||'inicio'} a ${query.to||'hoy'}${unit?` · Unidad: ${unit}`:''}`;
}

async function racControlData(query,user){
  const unitIds=user.role==='MASTER'?null:user.units.map(x=>Number(x.id));
  const values=[unitIds,query.businessUnitId?Number(query.businessUnitId):null,query.from||null,query.to||null];
  const summary=(await pool.query(`
    WITH scoped_units AS (
      SELECT bu.id,bu.name FROM business_units bu
      WHERE bu.active=TRUE
        AND ($1::int[] IS NULL OR bu.id=ANY($1::int[]))
        AND ($2::int IS NULL OR bu.id=$2::int)
    ), worker_counts AS (
      SELECT w.business_unit_id,COUNT(*)::int workers FROM workers w
      JOIN scoped_units su ON su.id=w.business_unit_id
      WHERE w.active=TRUE GROUP BY w.business_unit_id
    ), rac_base AS (
      SELECT r.*,
        EXISTS(SELECT 1 FROM rac_evidence e WHERE e.rac_id=r.id AND e.evidence_type='FINAL') has_final_evidence
      FROM racs r JOIN scoped_units su ON su.id=r.business_unit_id
      WHERE ($3::date IS NULL OR r.report_date>=$3::date)
        AND ($4::date IS NULL OR r.report_date<=$4::date)
    ), rac_counts AS (
      SELECT business_unit_id,
        COUNT(*)::int total,
        COUNT(*) FILTER(WHERE report_type='ACTO SUBESTANDAR')::int acts,
        COUNT(*) FILTER(WHERE report_type='CONDICION SUBESTANDAR')::int conditions,
        COUNT(*) FILTER(WHERE risk_level='ALTO')::int high,
        COUNT(*) FILTER(WHERE risk_level='MEDIO')::int medium,
        COUNT(*) FILTER(WHERE risk_level='BAJO')::int low,
        COUNT(*) FILTER(WHERE status='PENDIENTE')::int pending,
        COUNT(*) FILTER(WHERE status='EN PROCESO')::int in_process,
        COUNT(*) FILTER(WHERE status='PENDIENTE DE VALIDACION')::int pending_validation,
        COUNT(*) FILTER(WHERE status='DEVUELTO PARA CORRECCION')::int returned,
        COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted,
        COUNT(*) FILTER(WHERE status='LEVANTADO' AND has_final_evidence)::int lifted_with_evidence,
        COUNT(*) FILTER(WHERE status='LEVANTADO' AND NOT evidence_required)::int lifted_no_evidence_required,
        COUNT(*) FILTER(WHERE status='LEVANTADO' AND evidence_required AND NOT has_final_evidence)::int lifted_without_evidence,
        COUNT(*) FILTER(WHERE status<>'LEVANTADO' AND due_date<CURRENT_DATE)::int overdue,
        COUNT(*) FILTER(WHERE status<>'LEVANTADO' AND due_date=CURRENT_DATE)::int due_today,
        COUNT(*) FILTER(WHERE status<>'LEVANTADO' AND risk_level='ALTO' AND due_date<CURRENT_DATE)::int high_overdue
      FROM rac_base GROUP BY business_unit_id
    )
    SELECT su.id unit_id,su.name unit,COALESCE(wc.workers,0)::int workers,
      COALESCE(rc.total,0)::int total,COALESCE(rc.acts,0)::int acts,COALESCE(rc.conditions,0)::int conditions,
      COALESCE(rc.high,0)::int high,COALESCE(rc.medium,0)::int medium,COALESCE(rc.low,0)::int low,
      COALESCE(rc.pending,0)::int pending,COALESCE(rc.in_process,0)::int in_process,
      COALESCE(rc.pending_validation,0)::int pending_validation,COALESCE(rc.returned,0)::int returned,
      COALESCE(rc.lifted,0)::int lifted,COALESCE(rc.lifted_with_evidence,0)::int lifted_with_evidence,
      COALESCE(rc.lifted_no_evidence_required,0)::int lifted_no_evidence_required,
      COALESCE(rc.lifted_without_evidence,0)::int lifted_without_evidence,COALESCE(rc.overdue,0)::int overdue,
      COALESCE(rc.due_today,0)::int due_today,COALESCE(rc.high_overdue,0)::int high_overdue
    FROM scoped_units su LEFT JOIN worker_counts wc ON wc.business_unit_id=su.id
    LEFT JOIN rac_counts rc ON rc.business_unit_id=su.id
    ORDER BY rc.total DESC NULLS LAST,su.name
  `,values)).rows;
  const details=(await pool.query(`
    WITH scoped_units AS (
      SELECT bu.id FROM business_units bu WHERE bu.active=TRUE
        AND ($1::int[] IS NULL OR bu.id=ANY($1::int[]))
        AND ($2::int IS NULL OR bu.id=$2::int)
    )
    SELECT r.id,r.report_code,bu.name business_unit,r.report_date,r.due_date,r.risk_level,r.status,
      COALESCE((SELECT string_agg(su.name, ', ' ORDER BY su.name) FROM rac_assignments ra JOIN users su ON su.id=ra.supervisor_user_id WHERE ra.rac_id=r.id AND ra.active=TRUE),u.name,r.supervisor_name_text,'SIN ASIGNAR') supervisor_name,
      ar.name reporting_area,r.location,r.description,COALESCE(r.evidence_required,TRUE) evidence_required,
      r.evidence_exemption_reason,r.evidence_exempted_at,
      EXISTS(SELECT 1 FROM rac_evidence e WHERE e.rac_id=r.id AND e.evidence_type='FINAL') has_final_evidence,
      (r.status<>'LEVANTADO' AND r.due_date<CURRENT_DATE) is_overdue,
      CASE WHEN r.status<>'LEVANTADO' AND r.due_date<CURRENT_DATE THEN CURRENT_DATE-r.due_date ELSE 0 END::int days_overdue
    FROM racs r JOIN scoped_units scope ON scope.id=r.business_unit_id
    JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN users u ON u.id=r.supervisor_user_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    WHERE ($3::date IS NULL OR r.report_date>=$3::date)
      AND ($4::date IS NULL OR r.report_date<=$4::date)
    ORDER BY bu.name,r.due_date NULLS LAST,r.report_date,r.id
  `,values)).rows;
  return{summary,details,rules:RAC_DEADLINE_RULES};
}

reportsRouter.get('/racs/control-summary',asyncRoute(async(req,res)=>{
  const data=await racControlData(req.query,req.user);
  res.json({rows:data.summary,rules:data.rules});
}));
reportsRouter.get('/racs/control.xlsx',asyncRoute(async(req,res)=>{
  const data=await racControlData(req.query,req.user);
  const buffer=await buildRacControlExcel(data.summary,data.details,await label(req.query));
  await audit(req,'DOWNLOAD_RAC_CONTROL_EXCEL','REPORT',null,{units:data.summary.length,rows:data.details.length});
  res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition','attachment; filename="CAPSAN6_CONTROL_RACS_POR_UNIDAD.xlsx"');
  res.send(Buffer.from(buffer));
}));

reportsRouter.get('/racs/executive.xlsx',asyncRoute(async(req,res)=>{
  const rows=await reportRows(req.query,req.user);const buffer=await buildRacExecutiveExcel(rows,await label(req.query),await workerCounts(req.user));
  await audit(req,'DOWNLOAD_RAC_EXECUTIVE_EXCEL','REPORT',null,{rows:rows.length});res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('content-disposition','attachment; filename="CAPSAN6_REPORTE_EJECUTIVO_RACS.xlsx"');res.send(Buffer.from(buffer));
}));
reportsRouter.get('/racs/executive.pptx',asyncRoute(async(req,res)=>{
  const rows=await reportRows(req.query,req.user);const period=reportPeriod(rows,req.query);const context={...period};
  const buffer=await buildRacExecutivePpt(rows,await label(req.query),await workerCounts(req.user),context);
  await audit(req,'DOWNLOAD_RAC_EXECUTIVE_PPT','REPORT',null,{rows:rows.length,format:'RACS_ONLY_GERENCIA'});res.setHeader('content-type','application/vnd.openxmlformats-officedocument.presentationml.presentation');res.setHeader('content-disposition','attachment; filename="CAPSAN6_REPORTE_EJECUTIVO_RACS.pptx"');res.send(Buffer.from(buffer));
}));

async function trainingData(user,query={}){
  const unitIds=user.role==='MASTER'?null:user.units.map(x=>Number(x.id));const params=[unitIds];const clauses=[`($1::int[] IS NULL OR w.business_unit_id=ANY($1::int[]))`];let i=2;
  if(query.businessUnitId){clauses.push(`w.business_unit_id=$${i++}`);params.push(Number(query.businessUnitId));}
  if(query.areaId){clauses.push(`w.area_id=$${i++}`);params.push(Number(query.areaId));}
  if(query.trainingId){clauses.push(`t.id=$${i++}`);params.push(Number(query.trainingId));}
  const where=clauses.join(' AND ');
  const k=(await pool.query(`SELECT COUNT(DISTINCT w.id)::int workers,COUNT(DISTINCT t.id)::int topics,COUNT(DISTINCT (t.id,w.id))::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where}`,params)).rows[0];
  const byArea=(await pool.query(`SELECT a.name,COUNT(DISTINCT (t.id,w.id))::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN areas a ON a.id=w.area_id JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where} GROUP BY a.name ORDER BY a.name`,params)).rows;
  const byTopic=(await pool.query(`SELECT t.id,t.title,COUNT(DISTINCT w.id)::int expected,COUNT(g.id)::int graded,COUNT(g.id) FILTER(WHERE g.result='APROBADO')::int approved,ROUND(AVG(g.score),2) average FROM workers w JOIN training_targets tt ON tt.business_unit_id=w.business_unit_id AND (tt.area_id IS NULL OR tt.area_id=w.area_id) JOIN trainings t ON t.id=tt.training_id AND t.enabled=TRUE LEFT JOIN grades g ON g.training_id=t.id AND g.worker_id=w.id WHERE w.active=TRUE AND ${where} GROUP BY t.id ORDER BY t.title`,params)).rows;
  const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;const data={kpis:{...k,trainingCompliance:pct(k.graded,k.expected),gradeCompliance:pct(k.graded,k.expected),trainedPercent:pct(k.graded,k.expected),approvalPercent:pct(k.approved,k.graded)},byArea:byArea.map(x=>({...x,compliance:pct(x.graded,x.expected),approval:pct(x.approved,x.graded)})),byTopic:byTopic.map(x=>({...x,compliance:pct(x.graded,x.expected),approval:pct(x.approved,x.graded)}))};
  const detail=(await pool.query(`SELECT w.dni,w.full_name worker,bu.name unit,a.name area,t.title training,g.score,g.result,g.entered_at date FROM grades g JOIN workers w ON w.id=g.worker_id JOIN business_units bu ON bu.id=w.business_unit_id JOIN areas a ON a.id=w.area_id JOIN trainings t ON t.id=g.training_id WHERE ${where} ORDER BY g.entered_at DESC`,params)).rows;return{data,detail};
}
reportsRouter.get('/training/executive.xlsx',asyncRoute(async(req,res)=>{const {data,detail}=await trainingData(req.user,req.query);const buffer=await buildTrainingExcel(data,detail);res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('content-disposition','attachment; filename="CAPSAN6_REPORTE_EJECUTIVO_CAPACITACION.xlsx"');res.send(Buffer.from(buffer));}));

reportsRouter.get('/incidents/:id/flash.xlsx',asyncRoute(async(req,res)=>{const report=(await pool.query(`SELECT f.*,bu.name business_unit_name,a.name area_name,u.name created_by_name FROM flash_reports f LEFT JOIN business_units bu ON bu.id=f.business_unit_id LEFT JOIN areas a ON a.id=f.area_id LEFT JOIN users u ON u.id=f.created_by WHERE f.id=$1`,[Number(req.params.id)])).rows[0];if(!report)return res.status(404).json({error:'Flash Report no encontrado'});if(report.business_unit_id&&!assertUnitAccess(req.user,report.business_unit_id))return res.status(403).json({error:'Flash Report fuera de tu alcance'});const images=(await pool.query(`SELECT fa.local_path,fa.mime_type,fa.original_name,fa.drive_web_link FROM file_assets fa WHERE fa.entity_type='FLASH_REPORT' AND fa.entity_id=$1 ORDER BY fa.id LIMIT 2`,[String(report.id)])).rows;const buffer=await buildFlashReportExcel(report,images);res.setHeader('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('content-disposition',`attachment; filename="${report.report_code||'FLASH_REPORT'}.xlsx"`);res.send(Buffer.from(buffer));}));

reportsRouter.post('/public-link',asyncRoute(async(req,res)=>{const token=crypto.randomBytes(32).toString('base64url');const hash=crypto.createHash('sha256').update(token).digest('hex');const hours=Math.max(1,Math.min(Number(req.body.hours||168),720));const filters={...(req.body.filters||{}),ownerUserId:req.user.id,ownerRole:req.user.role,unitIds:req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id))};await pool.query(`INSERT INTO public_share_links(token_hash,scope,filters,created_by,expires_at) VALUES($1,$2,$3::jsonb,$4,NOW()+make_interval(hours => $5::int))`,[hash,req.body.scope||'RACS_EXECUTIVE',JSON.stringify(filters),req.user.id,hours]);const base=config.publicUrl||`${req.protocol}://${req.get('host')}`;res.json({url:`${base}/public-dashboard.html?token=${encodeURIComponent(token)}`,expiresInHours:hours});}));
