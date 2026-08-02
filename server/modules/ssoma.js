import { Router } from 'express';
import multer from 'multer';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool } from '../db.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';
import { audit } from '../services/audit.js';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
export const ssomaRouter=Router();
ssomaRouter.use(authRequired,requireCapability('ssoma:manage'));
const clean=v=>String(v||'').trim().replace(/\s+/g,' ');

ssomaRouter.get('/plans',async(req,res)=>{
  const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));const rows=(await pool.query(`SELECT p.*,bu.name business_unit,u.name ssoma_name FROM ssoma_work_plans p JOIN business_units bu ON bu.id=p.business_unit_id JOIN users u ON u.id=p.ssoma_user_id WHERE ($1::int[] IS NULL OR p.business_unit_id=ANY($1::int[])) ORDER BY p.plan_date DESC,p.created_at DESC LIMIT 300`,[unitIds])).rows;res.json(rows);
});
ssomaRouter.post('/plans',async(req,res)=>{
  const unitId=Number(req.body.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});const ssomaUserId=req.user.role==='MASTER'&&req.body.ssomaUserId?Number(req.body.ssomaUserId):req.user.id;const planDate=req.body.planDate||new Date(Date.now()+86400000).toISOString().slice(0,10);const activities=Array.isArray(req.body.activities)?req.body.activities:[];
  const pending=(await pool.query(`SELECT status,COUNT(*)::int total FROM racs WHERE business_unit_id=$1 AND status<>'LEVANTADO' GROUP BY status`,[unitId])).rows;
  const objective=clean(req.body.objective);if(!objective)return res.status(400).json({error:'Define el objetivo del plan'});
  const existing=(await pool.query(`SELECT id FROM ssoma_work_plans WHERE plan_date=$1 AND business_unit_id=$2 AND ssoma_user_id=$3 ORDER BY id DESC LIMIT 1`,[planDate,unitId,ssomaUserId])).rows[0];
  const values=[planDate,unitId,ssomaUserId,objective,JSON.stringify(activities),JSON.stringify(pending),String(req.body.status||'PLANIFICADO').toUpperCase(),req.user.id];
  const result=existing
    ?await pool.query(`UPDATE ssoma_work_plans SET objective=$4,activities=$5::jsonb,pending_summary=$6::jsonb,status=$7,updated_at=NOW() WHERE id=$9 RETURNING *`,[...values,existing.id])
    :await pool.query(`INSERT INTO ssoma_work_plans(plan_date,business_unit_id,ssoma_user_id,objective,activities,pending_summary,status,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) RETURNING *`,values);
  await audit(req,'UPSERT_SSOMA_PLAN','SSOMA_PLAN',result.rows[0].id);res.json(result.rows[0]);
});
ssomaRouter.get('/evidence',async(req,res)=>{const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));res.json((await pool.query(`SELECT e.*,bu.name business_unit,u.name ssoma_name,r.report_code FROM ssoma_evidence e JOIN business_units bu ON bu.id=e.business_unit_id JOIN users u ON u.id=e.ssoma_user_id LEFT JOIN racs r ON r.id=e.rac_id WHERE ($1::int[] IS NULL OR e.business_unit_id=ANY($1::int[])) ORDER BY e.evidence_date DESC,e.id DESC LIMIT 300`,[unitIds])).rows);});
ssomaRouter.post('/evidence',upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Adjunta la evidencia'});const unitId=Number(req.body.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});const saved=await saveUpload(req.file,`ssoma/${unitId}`);const temp=await pool.query(`INSERT INTO ssoma_evidence(business_unit_id,rac_id,ssoma_user_id,evidence_date,title,description,original_name,stored_name,mime_type,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[unitId,req.body.racId?Number(req.body.racId):null,req.user.id,req.body.evidenceDate||new Date().toISOString().slice(0,10),clean(req.body.title),clean(req.body.description)||null,saved.originalName,saved.storedName,saved.mimeType,saved.size,req.user.id]);const row=temp.rows[0];const asset=await queueAsset({entityType:'SSOMA_EVIDENCE',entityId:row.id,businessUnitId:unitId,saved,uploadedBy:req.user.id});await pool.query(`UPDATE ssoma_evidence SET drive_file_id=$1,drive_web_link=$2,drive_folder_path=$3,drive_status=$4 WHERE id=$5`,[asset.drive.fileId||null,asset.drive.webViewLink||null,asset.drive.folderPath||null,asset.drive.status,row.id]);await audit(req,'UPLOAD_SSOMA_EVIDENCE','SSOMA_EVIDENCE',row.id,{racId:req.body.racId||null});res.json({...row,drive:asset.drive});
});
ssomaRouter.get('/dashboard',async(req,res)=>{const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));const k=(await pool.query(`SELECT COUNT(*) FILTER(WHERE p.plan_date=CURRENT_DATE+1)::int plans_tomorrow,COUNT(*) FILTER(WHERE p.status='COMPLETADO')::int completed_plans FROM ssoma_work_plans p WHERE ($1::int[] IS NULL OR p.business_unit_id=ANY($1::int[]))`,[unitIds])).rows[0];const evidence=Number((await pool.query(`SELECT COUNT(*)::int total FROM ssoma_evidence e WHERE ($1::int[] IS NULL OR e.business_unit_id=ANY($1::int[])) AND e.evidence_date>=CURRENT_DATE-30`,[unitIds])).rows[0].total);const pending=(await pool.query(`SELECT bu.name,COUNT(*)::int total FROM racs r JOIN business_units bu ON bu.id=r.business_unit_id WHERE ($1::int[] IS NULL OR r.business_unit_id=ANY($1::int[])) AND r.status<>'LEVANTADO' GROUP BY bu.name ORDER BY total DESC`,[unitIds])).rows;res.json({kpis:{...k,evidenceLast30:evidence},pending});});
