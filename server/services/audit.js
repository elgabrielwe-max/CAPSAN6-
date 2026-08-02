import { pool } from '../db.js';
export async function audit(req, action, entityType, entityId, details = {}) {
  await pool.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [
    req.user?.id || null, req.user?.actorId || null, action, entityType || null, entityId == null ? null : String(entityId), JSON.stringify(details)
  ]);
}
export async function notify(userId, title, message, severity='INFO', entityType=null, entityId=null) {
  if (!userId) return;
  await pool.query(`INSERT INTO system_notifications(recipient_user_id,user_id,title,message,severity,entity_type,entity_id) VALUES($1,$1,$2,$3,$4,$5,$6)`, [userId,title,message,severity,entityType,entityId == null ? null : String(entityId)]);
}
