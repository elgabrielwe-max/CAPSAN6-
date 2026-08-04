import { pool } from '../db.js';
export async function audit(req, action, entityType, entityId, details = {}) {
  try {
    await pool.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [
      req.user?.id || null,
      req.user?.actorId || null,
      action,
      entityType || null,
      entityId == null ? null : String(entityId),
      JSON.stringify(details)
    ]);
    return true;
  } catch (error) {
    // Una falla secundaria de auditoría nunca debe tumbar la operación principal ni el servidor.
    console.error('No se pudo registrar auditoría:', {
      action,
      entityType,
      entityId: entityId == null ? null : String(entityId).slice(0, 160),
      code: error?.code,
      message: error?.message
    });
    return false;
  }
}
export async function notify(userId, title, message, severity='INFO', entityType=null, entityId=null) {
  if (!userId) return;
  await pool.query(`INSERT INTO system_notifications(recipient_user_id,user_id,title,message,severity,entity_type,entity_id) VALUES($1,$1,$2,$3,$4,$5,$6)`, [userId,title,message,severity,entityType,entityId == null ? null : String(entityId)]);
}
