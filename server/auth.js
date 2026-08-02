import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';
import { CAPABILITIES, hasCapability } from './permissions.js';

const sign = payload => jwt.sign(payload, config.jwtSecret, { expiresIn: '12h', issuer: 'capsan6-ssoma' });

export async function authenticate(username, password) {
  const result = await pool.query(`SELECT * FROM users WHERE username=$1 AND active=TRUE AND deleted_at IS NULL`, [String(username || '').trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) return null;
  const units = await userUnits(user.id);
  return { token: sign({ sub: user.id, actor: user.id, role: user.role }), user: publicUser(user, units) };
}

export async function userUnits(userId) {
  const result = await pool.query(`SELECT bu.id,bu.name,bu.code FROM user_business_units ubu JOIN business_units bu ON bu.id=ubu.business_unit_id WHERE ubu.user_id=$1 AND bu.active=TRUE ORDER BY bu.name`, [userId]);
  return result.rows;
}

export function publicUser(user, units = []) {
  return {
    id: user.id, name: user.name, username: user.username, email: user.email, role: user.role,
    mustChangePassword: Boolean(user.must_change_password), units,
    capabilities: CAPABILITIES[user.role] || [],
  };
}

export async function authRequired(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sesión requerida' });
    const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'capsan6-ssoma' });
    const result = await pool.query(`SELECT * FROM users WHERE id=$1 AND active=TRUE AND deleted_at IS NULL`, [decoded.sub]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuario no disponible' });
    const units = await userUnits(user.id);
    req.user = publicUser(user, units);
    req.user.actorId = Number(decoded.actor || decoded.sub);
    req.user.impersonating = req.user.actorId !== req.user.id;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}

export const requireCapability = capability => (req, res, next) => {
  if (!req.user || !hasCapability(req.user.role, capability)) return res.status(403).json({ error: 'No tienes permiso para esta operación' });
  next();
};

export function scopedUnitIds(user) {
  if (user.role === 'MASTER') return null;
  return user.units.map(x => Number(x.id));
}

export function assertUnitAccess(user, unitId) {
  if (user.role === 'MASTER') return true;
  return user.units.some(x => Number(x.id) === Number(unitId));
}

export async function issueImpersonation(actor, targetId) {
  if (actor.role !== 'MASTER') throw Object.assign(new Error('Solo el Máster puede ingresar a otro perfil'), { status: 403 });
  const result = await pool.query(`SELECT * FROM users WHERE id=$1 AND role IN ('SSOMA','SUPERVISOR') AND active=TRUE AND deleted_at IS NULL`, [targetId]);
  const target = result.rows[0];
  if (!target) throw Object.assign(new Error('Perfil no disponible'), { status: 404 });
  return sign({ sub: target.id, actor: actor.id, role: target.role });
}

export async function changePassword(userId, currentPassword, newPassword) {
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/.test(String(newPassword || ''))) {
    throw Object.assign(new Error('La contraseña debe tener mínimo 10 caracteres, mayúscula, minúscula y número'), { status: 400 });
  }
  const result = await pool.query(`SELECT password_hash,username FROM users WHERE id=$1`, [userId]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.password_hash))) {
    throw Object.assign(new Error('La contraseña actual no es correcta'), { status: 400 });
  }
  if (String(newPassword).toLowerCase() === String(user.username).toLowerCase()) {
    throw Object.assign(new Error('La contraseña no puede ser igual al usuario'), { status: 400 });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(`UPDATE users SET password_hash=$1,must_change_password=FALSE WHERE id=$2`, [hash, userId]);
}
