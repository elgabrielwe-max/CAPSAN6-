import { Router } from 'express';
import { authRequired } from '../auth.js';
import { pool } from '../db.js';

export const catalogsRouter=Router();
catalogsRouter.use(authRequired);

catalogsRouter.get('/',async(req,res)=>{
  const units=req.user.role==='MASTER'
    ?(await pool.query(`SELECT id,name,code FROM business_units WHERE active=TRUE ORDER BY name`)).rows
    :req.user.units;
  const unitIds=units.map(x=>Number(x.id));
  const areas=(await pool.query(`SELECT a.id,a.name,a.code,array_remove(array_agg(bua.business_unit_id),NULL) unit_ids FROM areas a LEFT JOIN business_unit_areas bua ON bua.area_id=a.id WHERE a.active=TRUE GROUP BY a.id ORDER BY a.name`)).rows;
  const people=(await pool.query(`SELECT u.id,u.name,u.username,u.role,array_remove(array_agg(ubu.business_unit_id),NULL) unit_ids FROM users u LEFT JOIN user_business_units ubu ON ubu.user_id=u.id WHERE u.active=TRUE AND u.deleted_at IS NULL GROUP BY u.id ORDER BY u.name`)).rows
    .filter(u=>req.user.role==='MASTER'||u.unit_ids.some(id=>unitIds.includes(Number(id))));
  res.json({units,areas,users:people,roles:['MASTER','SSOMA','SUPERVISOR'],racStatuses:['PENDIENTE','EN PROCESO','PENDIENTE DE VALIDACION','DEVUELTO PARA CORRECCION','LEVANTADO'],riskLevels:['ALTO','MEDIO','BAJO']});
});
