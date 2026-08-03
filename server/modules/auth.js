import { Router } from 'express';
import { authenticate, authRequired, changePassword, issueImpersonation, publicUser, userUnits } from '../auth.js';
import { pool } from '../db.js';
import { audit } from '../services/audit.js';

export const authRouter=Router();

authRouter.post('/login',async(req,res)=>{
  const result=await authenticate(req.body.username,req.body.password);
  if(!result)return res.status(401).json({error:'Usuario o contraseña incorrectos'});
  res.json(result);
});

authRouter.get('/me',authRequired,async(req,res)=>res.json(req.user));

authRouter.post('/change-password',authRequired,async(req,res)=>{
  await changePassword(req.user.id,req.body.currentPassword,req.body.newPassword);
  await audit(req,'CHANGE_PASSWORD','USER',req.user.id);
  res.json({ok:true});
});

authRouter.post('/impersonate/:id',authRequired,async(req,res)=>{
  const targetId=Number(req.params.id);
  const token=await issueImpersonation(req.user,targetId);
  const target=(await pool.query(`SELECT * FROM users WHERE id=$1`,[targetId])).rows[0];
  const units=target?await userUnits(target.id,{repair:true,user:target}):[];
  const racCount=units.length?Number((await pool.query(`SELECT COUNT(*)::int total FROM racs WHERE business_unit_id=ANY($1::int[])`,[units.map(x=>Number(x.id))])).rows[0].total||0):0;
  await audit(req,'IMPERSONATE','USER',req.params.id,{unitIds:units.map(x=>Number(x.id)),racCount});
  res.json({token,user:target?publicUser(target,units):null,scope:{units,racCount}});
});

authRouter.post('/stop-impersonation',authRequired,async(req,res)=>{
  const actorId=req.user.actorId;
  const found=await pool.query(`SELECT * FROM users WHERE id=$1 AND role='MASTER' AND active=TRUE AND deleted_at IS NULL`,[actorId]);
  if(!found.rowCount)return res.status(403).json({error:'No se pudo recuperar el perfil Máster'});
  const actor=found.rows[0];
  const units=await userUnits(actor.id);
  const { default: jwt }=await import('jsonwebtoken');
  const { config }=await import('../config.js');
  const token=jwt.sign({sub:actor.id,actor:actor.id,role:actor.role},config.jwtSecret,{expiresIn:'12h',issuer:'capsan6-ssoma'});
  res.json({token,user:publicUser(actor,units)});
});
