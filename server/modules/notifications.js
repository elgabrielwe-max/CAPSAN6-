import { Router } from 'express';
import { authRequired } from '../auth.js';
import { pool } from '../db.js';
export const notificationsRouter=Router();notificationsRouter.use(authRequired);
notificationsRouter.get('/summary',async(req,res)=>{const unread=Number((await pool.query(`SELECT COUNT(*)::int total FROM system_notifications WHERE recipient_user_id=$1 AND read_at IS NULL`,[req.user.id])).rows[0].total);res.set('Cache-Control','no-store');res.json({unread});});
notificationsRouter.get('/',async(req,res)=>res.json((await pool.query(`SELECT * FROM system_notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 100`,[req.user.id])).rows));
notificationsRouter.post('/:id/read',async(req,res)=>{await pool.query(`UPDATE system_notifications SET read_at=NOW() WHERE id=$1 AND recipient_user_id=$2`,[Number(req.params.id),req.user.id]);res.json({ok:true});});
