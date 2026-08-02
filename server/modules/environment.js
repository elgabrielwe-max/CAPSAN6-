import { Router } from 'express';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool } from '../db.js';
import { classifyRacLocal } from '../services/ai.js';
import { audit } from '../services/audit.js';
import { unitScope } from '../scope.js';

export const environmentRouter=Router();
environmentRouter.use(authRequired,requireCapability('environment:view'));

environmentRouter.get('/dashboard',async(req,res)=>{
  const scope=unitScope(req.user,'r',1);const params=[...scope.params];let i=scope.next;const clauses=[scope.clause];if(req.query.businessUnitId){clauses.push(`r.business_unit_id=$${i++}`);params.push(Number(req.query.businessUnitId));}if(req.query.from){clauses.push(`r.report_date>=$${i++}`);params.push(req.query.from);}if(req.query.to){clauses.push(`r.report_date<=$${i++}`);params.push(req.query.to);}const where=clauses.join(' AND ');
  const rac=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted,COUNT(*) FILTER(WHERE risk_level='ALTO')::int high FROM racs r WHERE ${where} AND (r.environmental_flag OR UPPER(COALESCE(r.description,'')) ~ 'AGUA|RESIDU|DERRAME|POLVO|SUELO|RELAVE|EFLUENTE|EMISION')`,params)).rows[0];
  const categories=(await pool.query(`SELECT COALESCE(environmental_category,cause_subtype,deviation_type,'OTROS') name,COUNT(*)::int total FROM racs r WHERE ${where} AND (r.environmental_flag OR UPPER(COALESCE(r.description,'')) ~ 'AGUA|RESIDU|DERRAME|POLVO|SUELO|RELAVE|EFLUENTE|EMISION') GROUP BY 1 ORDER BY total DESC`,params)).rows;
  const metricsScope=req.user.role==='MASTER'?'TRUE':`em.business_unit_id=ANY($1::int[])`;const metricParams=req.user.role==='MASTER'?[]:[req.user.units.map(x=>Number(x.id))];const metrics=(await pool.query(`SELECT em.*,bu.name business_unit FROM environmental_metrics em JOIN business_units bu ON bu.id=em.business_unit_id WHERE ${metricsScope} ORDER BY metric_date DESC LIMIT 200`,metricParams)).rows;
  const water=metrics.filter(x=>String(x.metric_type).toUpperCase().includes('AGUA'));const latestWater=water[0]||null;
  res.json({kpis:{environmentalRacs:rac.total,lifted:rac.lifted,high:rac.high,closurePercent:rac.total?Math.round(rac.lifted*100/rac.total):0,latestWater},categories,metrics});
});

environmentRouter.post('/metrics',requireCapability('environment:manage'),async(req,res)=>{
  const unitId=Number(req.body.businessUnitId);if(!assertUnitAccess(req.user,unitId))return res.status(403).json({error:'Unidad fuera de tu alcance'});const result=await pool.query(`INSERT INTO environmental_metrics(business_unit_id,metric_date,metric_type,value,unit,target_value,source,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[unitId,req.body.metricDate||new Date().toISOString().slice(0,10),String(req.body.metricType||'CONSUMO DE AGUA').toUpperCase(),Number(req.body.value),String(req.body.unit||'m3'),req.body.targetValue===''||req.body.targetValue==null?null:Number(req.body.targetValue),req.body.source||null,req.user.id]);await audit(req,'CREATE_ENVIRONMENT_METRIC','ENVIRONMENT_METRIC',result.rows[0].id);res.json(result.rows[0]);
});

environmentRouter.post('/reclassify-racs',requireCapability('environment:manage'),async(req,res)=>{
  const scope=unitScope(req.user,'r',1);const rows=(await pool.query(`SELECT id,description,cause_subtype FROM racs r WHERE ${scope.clause}`,[...scope.params])).rows;let environmental=0;
  for(const row of rows){const c=classifyRacLocal(`${row.cause_subtype||''} ${row.description||''}`);await pool.query(`UPDATE racs SET environmental_flag=$1,environmental_category=$2,environmental_confidence=$3 WHERE id=$4`,[c.environmental,c.environmentalCategory,c.confidence,row.id]);if(c.environmental)environmental++;}
  await audit(req,'RECLASSIFY_ENVIRONMENTAL_RACS','RAC',null,{processed:rows.length,environmental});res.json({processed:rows.length,environmental});
});
