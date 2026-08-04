import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { authRequired, requireCapability } from '../auth.js';
import { pool, tx } from '../db.js';
import { analyzeWorkerWorkbook } from '../imports/workerWorkbook.js';
import { audit } from '../services/audit.js';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
export const adminRouter=Router();
adminRouter.use(authRequired);

const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
const upper=v=>clean(v).toUpperCase();

async function areaId(client,name){
  const n=upper(name)||'SIN ÁREA ASIGNADA';
  const result=await client.query(`INSERT INTO areas(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=TRUE RETURNING id`,[n]);
  return result.rows[0].id;
}
async function unitId(client,nameOrId){
  if(/^\d+$/.test(String(nameOrId||''))){const r=await client.query(`SELECT id,name,code FROM business_units WHERE id=$1`,[Number(nameOrId)]);return r.rows[0];}
  const name=upper(nameOrId);if(!name)return null;
  const code=name.split(/\s+/).map(x=>x[0]).join('').slice(0,8);
  const r=await client.query(`INSERT INTO business_units(name,code) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET active=TRUE RETURNING id,name,code`,[name,code]);return r.rows[0];
}

adminRouter.get('/units',requireCapability('masterdata:manage'),async(_req,res)=>res.json((await pool.query(`SELECT bu.*,COUNT(DISTINCT w.id)::int workers,COUNT(DISTINCT ubu.user_id)::int users FROM business_units bu LEFT JOIN workers w ON w.business_unit_id=bu.id AND w.active=TRUE LEFT JOIN user_business_units ubu ON ubu.business_unit_id=bu.id GROUP BY bu.id ORDER BY bu.name`)).rows));
adminRouter.post('/units',requireCapability('masterdata:manage'),async(req,res)=>{
  const name=upper(req.body.name);if(!name)return res.status(400).json({error:'Nombre requerido'});
  const result=await tx(async client=>{
    const row=(await client.query(`INSERT INTO business_units(name,code) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET code=EXCLUDED.code,active=TRUE RETURNING *`,[name,upper(req.body.code)||null])).rows[0];
    const propagated=(await client.query(`INSERT INTO user_business_units(user_id,business_unit_id)
      SELECT u.id,$1 FROM users u
      WHERE u.all_units_access=TRUE AND u.active=TRUE AND u.deleted_at IS NULL
      ON CONFLICT DO NOTHING RETURNING user_id`,[row.id])).rowCount;
    return{...row,propagatedUsers:propagated};
  });
  await audit(req,'UPSERT_UNIT','BUSINESS_UNIT',result.id,{propagatedUsers:result.propagatedUsers});res.json(result);
});
adminRouter.get('/areas',requireCapability('masterdata:manage'),async(_req,res)=>res.json((await pool.query(`SELECT a.*,array_remove(array_agg(bua.business_unit_id),NULL) unit_ids,COUNT(DISTINCT w.id)::int workers FROM areas a LEFT JOIN business_unit_areas bua ON bua.area_id=a.id LEFT JOIN workers w ON w.area_id=a.id AND w.active=TRUE GROUP BY a.id ORDER BY a.name`)).rows));
adminRouter.post('/areas',requireCapability('masterdata:manage'),async(req,res)=>{
  const name=upper(req.body.name);if(!name)return res.status(400).json({error:'Nombre requerido'});
  const unitIds=(req.body.unitIds||[]).map(Number).filter(Boolean);
  const area=await tx(async client=>{
    const r=await client.query(`INSERT INTO areas(name,code) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET code=EXCLUDED.code,active=TRUE RETURNING *`,[name,upper(req.body.code)||null]);
    await client.query(`DELETE FROM business_unit_areas WHERE area_id=$1`,[r.rows[0].id]);
    for(const id of unitIds)await client.query(`INSERT INTO business_unit_areas(business_unit_id,area_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,r.rows[0].id]);
    return r.rows[0];
  });
  await audit(req,'UPSERT_AREA','AREA',area.id,{unitIds});res.json(area);
});

adminRouter.get('/users',requireCapability('users:manage'),async(_req,res)=>{
  const rows=(await pool.query(`SELECT u.id,u.name,u.email,u.username,u.role,u.active,u.must_change_password,u.all_units_access,u.created_at,array_remove(array_agg(ubu.business_unit_id),NULL) unit_ids,array_remove(array_agg(bu.name),NULL) units FROM users u LEFT JOIN user_business_units ubu ON ubu.user_id=u.id LEFT JOIN business_units bu ON bu.id=ubu.business_unit_id WHERE u.deleted_at IS NULL GROUP BY u.id ORDER BY u.name`)).rows;
  res.json(rows);
});
adminRouter.post('/users',requireCapability('users:manage'),async(req,res)=>{
  const {id}=req.body;const name=upper(req.body.name),username=clean(req.body.username),role=upper(req.body.role);let unitIds=(req.body.unitIds||[]).map(Number).filter(Boolean);
  const allUnitsAccess=role!=='MASTER'&&['true','1','on','si','sí'].includes(String(req.body.allUnitsAccess||'').toLowerCase());
  if(!name||!username||!['MASTER','SSOMA','SUPERVISOR'].includes(role))return res.status(400).json({error:'Completa nombre, usuario y perfil'});
  if(allUnitsAccess)unitIds=(await pool.query(`SELECT id FROM business_units WHERE active=TRUE ORDER BY id`)).rows.map(x=>Number(x.id));
  if(role!=='MASTER'&&!unitIds.length)return res.status(400).json({error:'Selecciona al menos una unidad de negocio o activa el acceso automático'});
  const user=await tx(async client=>{
    let row;
    if(id){
      row=(await client.query(`UPDATE users SET name=$1,username=$2,email=$3,role=$4,active=$5,all_units_access=$7 WHERE id=$6 AND deleted_at IS NULL RETURNING *`,[name,username,clean(req.body.email)||`${username}@capsan6.local`,role,req.body.active!==false,Number(id),allUnitsAccess])).rows[0];
    }else{
      const password=String(req.body.password||'');if(!password)throw Object.assign(new Error('Contraseña temporal requerida'),{status:400});
      const hash=await bcrypt.hash(password,12);
      row=(await client.query(`INSERT INTO users(name,email,username,password_hash,role,active,must_change_password,all_units_access) VALUES($1,$2,$3,$4,$5,TRUE,TRUE,$6) RETURNING *`,[name,clean(req.body.email)||`${username}@capsan6.local`,username,hash,role,allUnitsAccess])).rows[0];
    }
    if(!row)throw Object.assign(new Error('Usuario no encontrado'),{status:404});
    await client.query(`DELETE FROM user_business_units WHERE user_id=$1`,[row.id]);
    for(const unit of unitIds)await client.query(`INSERT INTO user_business_units(user_id,business_unit_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[row.id,unit]);
    return row;
  });
  await audit(req,id?'UPDATE_USER':'CREATE_USER','USER',user.id,{role,unitIds,allUnitsAccess});res.json({id:user.id});
});
adminRouter.post('/users/:id/reset-password',requireCapability('users:manage'),async(req,res)=>{
  const password=String(req.body.password||'');if(!password)return res.status(400).json({error:'Contraseña temporal requerida'});
  const hash=await bcrypt.hash(password,12);await pool.query(`UPDATE users SET password_hash=$1,must_change_password=TRUE,active=TRUE WHERE id=$2 AND deleted_at IS NULL`,[hash,Number(req.params.id)]);
  await audit(req,'RESET_PASSWORD','USER',req.params.id);res.json({ok:true});
});
adminRouter.post('/users/bulk-delete',requireCapability('users:manage'),async(req,res)=>{
  const ids=(req.body.ids||[]).map(Number).filter(Boolean);if(!ids.length)return res.status(400).json({error:'Selecciona usuarios'});
  if(ids.includes(req.user.id))return res.status(400).json({error:'No puedes eliminar tu propia cuenta'});
  const currentPassword=String(req.body.currentPassword||'');
  const master=(await pool.query(`SELECT password_hash FROM users WHERE id=$1`,[req.user.id])).rows[0];
  if(!master||!(await bcrypt.compare(currentPassword,master.password_hash)))return res.status(400).json({error:'Contraseña Máster incorrecta'});
  const masters=Number((await pool.query(`SELECT COUNT(*)::int total FROM users WHERE role='MASTER' AND active=TRUE AND deleted_at IS NULL AND NOT(id=ANY($1::int[]))`,[ids])).rows[0].total);
  if(masters<1)return res.status(400).json({error:'Debe quedar al menos un Máster activo'});
  await tx(async client=>{
    await client.query(`UPDATE rac_assignments SET active=FALSE WHERE supervisor_user_id=ANY($1::int[])`,[ids]);
    await client.query(`DELETE FROM user_business_units WHERE user_id=ANY($1::int[])`,[ids]);
    await client.query(`UPDATE users SET active=FALSE,deleted_at=NOW(),deleted_by=$2,
      username=username||'__ELIMINADO__'||id,email='eliminado-'||id||'@capsan6.local'
      WHERE id=ANY($1::int[])`,[ids,req.user.id]);
  });
  await audit(req,'BULK_DELETE_USERS','USER',ids.join(','),{count:ids.length});res.json({deleted:ids.length});
});

adminRouter.get('/workers',requireCapability('masterdata:manage'),async(req,res)=>{
  const params=[];const clauses=['w.active=TRUE'];let i=1;
  if(req.query.businessUnitId){clauses.push(`w.business_unit_id=$${i++}`);params.push(Number(req.query.businessUnitId));}
  if(req.query.areaId){clauses.push(`w.area_id=$${i++}`);params.push(Number(req.query.areaId));}
  if(req.query.search){clauses.push(`(w.dni ILIKE $${i} OR w.full_name ILIKE $${i})`);params.push(`%${req.query.search}%`);i++;}
  const rows=(await pool.query(`SELECT w.*,a.name area_name,bu.name business_unit_name FROM workers w JOIN areas a ON a.id=w.area_id LEFT JOIN business_units bu ON bu.id=w.business_unit_id WHERE ${clauses.join(' AND ')} ORDER BY w.full_name LIMIT 1000`,params)).rows;
  res.json(rows);
});
adminRouter.post('/workers',requireCapability('masterdata:manage'),async(req,res)=>{
  const unit=await unitId(pool,req.body.businessUnitId||req.body.businessUnitName);if(!unit)return res.status(400).json({error:'Unidad requerida'});
  const area=await areaId(pool,req.body.areaName);
  const dni=String(req.body.dni||'').replace(/\D/g,'').padStart(8,'0');if(!/^\d{8}$/.test(dni))return res.status(400).json({error:'DNI inválido'});
  const result=await pool.query(`INSERT INTO workers(dni,full_name,area_id,business_unit_id,zone,position,guard,active) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT(dni) DO UPDATE SET full_name=EXCLUDED.full_name,area_id=EXCLUDED.area_id,business_unit_id=EXCLUDED.business_unit_id,zone=EXCLUDED.zone,position=EXCLUDED.position,guard=EXCLUDED.guard,active=TRUE,updated_at=NOW() RETURNING *`,[dni,upper(req.body.fullName),area,unit.id,upper(req.body.zone)||null,upper(req.body.position)||null,upper(req.body.guard)||null]);
  await audit(req,'UPSERT_WORKER','WORKER',result.rows[0].id);res.json(result.rows[0]);
});
adminRouter.post('/workers/import/analyze',requireCapability('masterdata:manage'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const workbook=XLSX.read(req.file.buffer,{type:'buffer',cellDates:true});
  const known=(await pool.query(`SELECT name FROM business_units WHERE active=TRUE`)).rows.map(x=>x.name);
  const selected=req.body.businessUnitId?(await pool.query(`SELECT name FROM business_units WHERE id=$1`,[Number(req.body.businessUnitId)])).rows[0]?.name:'';
  const analysis=analyzeWorkerWorkbook(workbook,{selectedBusinessUnit:selected,knownBusinessUnits:known});
  res.json({...analysis,records:analysis.records.slice(0,30)});
});
adminRouter.post('/workers/import',requireCapability('masterdata:manage'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const workbook=XLSX.read(req.file.buffer,{type:'buffer',cellDates:true});
  const known=(await pool.query(`SELECT name FROM business_units WHERE active=TRUE`)).rows.map(x=>x.name);
  const selected=req.body.businessUnitId?(await pool.query(`SELECT name FROM business_units WHERE id=$1`,[Number(req.body.businessUnitId)])).rows[0]?.name:'';
  const analysis=analyzeWorkerWorkbook(workbook,{selectedBusinessUnit:selected,knownBusinessUnits:known});
  const result=await tx(async client=>{
    let inserted=0,updated=0;
    for(const record of analysis.records){
      const unit=await unitId(client,record.businessUnit);const area=await areaId(client,record.area);
      await client.query(`INSERT INTO business_unit_areas(business_unit_id,area_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[unit.id,area]);
      const existing=await client.query(`SELECT id FROM workers WHERE dni=$1`,[record.dni]);
      await client.query(`INSERT INTO workers(dni,full_name,area_id,business_unit_id,zone,position,guard,source_file,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE) ON CONFLICT(dni) DO UPDATE SET full_name=EXCLUDED.full_name,area_id=EXCLUDED.area_id,business_unit_id=EXCLUDED.business_unit_id,zone=EXCLUDED.zone,position=EXCLUDED.position,guard=EXCLUDED.guard,source_file=EXCLUDED.source_file,active=TRUE,updated_at=NOW()`,[record.dni,record.fullName,area,unit.id,record.zone,record.position,record.guard,req.file.originalname]);
      existing.rowCount?updated++:inserted++;
    }
    return {inserted,updated,total:analysis.records.length,warnings:analysis.warnings,errors:analysis.errors};
  });
  await audit(req,'IMPORT_WORKERS','WORKER_IMPORT',req.file.originalname,result);res.json(result);
});

function headerKey(v){return upper(v).replace(/[^A-Z0-9]+/g,'');}
function cell(row,names){const wanted=new Set(names.map(headerKey));for(const [k,v] of Object.entries(row))if(wanted.has(headerKey(k))&&clean(v))return v;return '';}
adminRouter.post('/users/import',requireCapability('users:manage'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona un Excel'});
  const wb=XLSX.read(req.file.buffer,{type:'buffer'});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
  const summary=await tx(async client=>{let inserted=0,updated=0,rejected=0;
    for(const row of rows){
      const username=clean(cell(row,['USUARIO','DNI','USERNAME']));const name=upper(cell(row,['NOMBRE','NOMBRES Y APELLIDOS','APELLIDOS Y NOMBRES','SUPERVISOR']));const role=upper(cell(row,['ROL','PERFIL','CARGO'])).includes('SSOMA')?'SSOMA':'SUPERVISOR';const unitName=upper(cell(row,['UNIDAD','UNIDAD DE NEGOCIO','PROYECTO','AREA']));
      if(!username||!name||!unitName){rejected++;continue;}const unit=await unitId(client,unitName);const existing=await client.query(`SELECT id FROM users WHERE username=$1 AND deleted_at IS NULL`,[username]);let userId;
      if(existing.rowCount){userId=existing.rows[0].id;await client.query(`UPDATE users SET name=$1,role=$2,active=TRUE WHERE id=$3`,[name,role,userId]);updated++;}
      else{const temp=String(cell(row,['CLAVE','PASSWORD','CONTRASEÑA'])||username);const hash=await bcrypt.hash(temp,12);userId=(await client.query(`INSERT INTO users(name,email,username,password_hash,role,active,must_change_password,all_units_access) VALUES($1,$2,$3,$4,$5,TRUE,TRUE,FALSE) RETURNING id`,[name,`${username}@capsan6.local`,username,hash,role])).rows[0].id;inserted++;}
      await client.query(`INSERT INTO user_business_units(user_id,business_unit_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,unit.id]);
    }return{inserted,updated,rejected,total:rows.length};});
  await audit(req,'IMPORT_USERS','USER_IMPORT',req.file.originalname,summary);res.json(summary);
});
