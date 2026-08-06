import crypto from 'node:crypto';
import { pool } from '../db.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

const isAbortedRequest = (error, req) => Boolean(
  req?.aborted ||
  error?.message === 'Request aborted' ||
  error?.code === 'ECONNRESET' ||
  error?.code === 'EPIPE'
);

export async function errorHandler(error, req, res, _next) {
  if (isAbortedRequest(error, req)) {
    console.warn(`[UPLOAD_ABORTED] ${req.method} ${req.originalUrl} · la conexión se cerró antes de completar la carga`);
    if (!res.headersSent && !res.destroyed && res.writable) {
      return res.status(499).json({
        error: 'La carga se interrumpió antes de terminar. Mantén la pestaña abierta, verifica tu conexión y vuelve a intentarlo.'
      });
    }
    return;
  }

  const isFileLimit = error?.code === 'LIMIT_FILE_SIZE';
  const status = Number(isFileLimit ? 413 : error.status || (error.code === '23505' ? 409 : 500));
  const incident = crypto.randomBytes(5).toString('hex').toUpperCase();
  console.error(`[${incident}] ${req.method} ${req.originalUrl}`, error);
  try {
    await pool.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,details) VALUES($1,$2,'SYSTEM_ERROR','HTTP',$3::jsonb)`, [
      req.user?.id || null, req.user?.actorId || null, JSON.stringify({ incident, route: req.originalUrl, method: req.method, message: error.message, code: error.code })
    ]);
  } catch { /* no bloquea la respuesta */ }
  const publicMessage = isFileLimit
    ? 'El archivo supera el tamaño máximo permitido de 25 MB.'
    : status >= 500 ? 'No se pudo completar la operación' : error.message;
  if (!res.headersSent) res.status(status).json({ error: publicMessage, incident });
}
