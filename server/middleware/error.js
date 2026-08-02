import crypto from 'node:crypto';
import { pool } from '../db.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export async function errorHandler(error, req, res, _next) {
  const status = Number(error.status || (error.code === '23505' ? 409 : 500));
  const incident = crypto.randomBytes(5).toString('hex').toUpperCase();
  console.error(`[${incident}]`, error);
  try {
    await pool.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,details) VALUES($1,$2,'SYSTEM_ERROR','HTTP',$3::jsonb)`, [
      req.user?.id || null, req.user?.actorId || null, JSON.stringify({ incident, route: req.originalUrl, method: req.method, message: error.message, code: error.code })
    ]);
  } catch { /* no bloquea la respuesta */ }
  res.status(status).json({ error: status >= 500 ? 'No se pudo completar la operación' : error.message, incident });
}
