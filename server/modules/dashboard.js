import { Router } from 'express';
import { authRequired, requireCapability } from '../auth.js';
import { pool } from '../db.js';
import { unitScope } from '../scope.js';

export const dashboardRouter=Router();
dashboardRouter.use(authRequired,requireCapability('dashboard:view'));

dashboardRouter.get('/',async(req,res)=>{
  const scope=unitScope(req.user,'r',1);
  const params=[...scope.params]; let clauses=[scope.clause]; let i=scope.next;
  if(req.query.businessUnitId){clauses.push(`r.business_unit_id=$${i++}`);params.push(Number(req.query.businessUnitId));}
  if(req.query.from){clauses.push(`r.report_date>=$${i++}`);params.push(req.query.from);}
  if(req.query.to){clauses.push(`r.report_date<=$${i++}`);params.push(req.query.to);}
  const where=clauses.join(' AND ');
  const rac=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='LEVANTADO')::int lifted,COUNT(*) FILTER(WHERE status<>'LEVANTADO')::int pending,COUNT(*) FILTER(WHERE risk_level='ALTO')::int high,COUNT(*) FILTER(WHERE environmental_flag)::int environmental FROM racs r WHERE ${where}`,params)).rows[0];
  const unitIds=req.user.role==='MASTER'?null:req.user.units.map(x=>Number(x.id));
  const workers=Number((await pool.query(`SELECT COUNT(*)::int total FROM workers w
    WHERE w.active=TRUE AND ($1::int[] IS NULL OR w.business_unit_id=ANY($1::int[]))`,[unitIds])).rows[0].total||0);
  const trainings=Number((await pool.query(`SELECT COUNT(DISTINCT t.id)::int total FROM trainings t
    JOIN training_targets tt ON tt.training_id=t.id
    WHERE t.enabled=TRUE AND ($1::int[] IS NULL OR tt.business_unit_id=ANY($1::int[]))`,[unitIds])).rows[0].total||0);
  const incidents=Number((await pool.query(`SELECT COUNT(*)::int total FROM flash_reports f
    WHERE f.followup_status<>'CERRADO' AND ($1::int[] IS NULL OR f.business_unit_id=ANY($1::int[]))`,[unitIds])).rows[0].total||0);
  const states=(await pool.query(`SELECT status name,COUNT(*)::int total FROM racs r WHERE ${where} GROUP BY status ORDER BY total DESC`,params)).rows;
  const units=(await pool.query(`SELECT COALESCE(bu.name,'SIN UNIDAD') name,COUNT(*)::int total FROM racs r LEFT JOIN business_units bu ON bu.id=r.business_unit_id WHERE ${where} GROUP BY bu.name ORDER BY total DESC`,params)).rows;
  res.json({scope:{role:req.user.role,unitIds:req.user.units.map(x=>Number(x.id)),units:req.user.units,noUnitScope:req.user.role!=='MASTER'&&!req.user.units.length},kpis:{racs:rac.total,lifted:rac.lifted,pending:rac.pending,high:rac.high,environmental:rac.environmental,workers,trainings,openIncidents:incidents,closurePercent:rac.total?Math.round(rac.lifted*100/rac.total):0},states,units});
});
