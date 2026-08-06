import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const tokenPattern = /^[a-f0-9]{48}$/i;

const cacheDir = () => path.join(config.uploadDir, '.import-cache');
const safeExt = name => {
  const ext = path.extname(String(name || '')).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
};
const filePathFor = (token, ext = '.bin') => path.join(cacheDir(), `${token}${ext}`);
const metaPathFor = token => path.join(cacheDir(), `${token}.json`);

async function ensureCacheDir() {
  await fs.mkdir(cacheDir(), { recursive: true });
}

export async function cacheUploadedFile(file, { userId, businessUnitId, purpose = 'RAC_IMPORT' } = {}) {
  if (!file?.buffer) throw Object.assign(new Error('No se recibió el archivo para conservarlo'), { status: 400 });
  await ensureCacheDir();
  const token = crypto.randomBytes(24).toString('hex');
  const ext = safeExt(file.originalname);
  const createdAt = Date.now();
  const meta = {
    token,
    userId: Number(userId),
    businessUnitId: Number(businessUnitId),
    purpose,
    originalName: String(file.originalname || 'archivo.xlsx'),
    mimeType: String(file.mimetype || 'application/octet-stream'),
    size: Number(file.size || file.buffer.length || 0),
    ext,
    createdAt,
    expiresAt: createdAt + CACHE_TTL_MS,
  };
  await Promise.all([
    fs.writeFile(filePathFor(token, ext), file.buffer),
    fs.writeFile(metaPathFor(token), JSON.stringify(meta)),
  ]);
  return { token, expiresAt: new Date(meta.expiresAt).toISOString(), originalName: meta.originalName, size: meta.size };
}

export async function loadCachedFile(token, { userId, businessUnitId, purpose = 'RAC_IMPORT' } = {}) {
  const normalized = String(token || '').trim();
  if (!tokenPattern.test(normalized)) throw Object.assign(new Error('El archivo analizado ya no está disponible. Vuelve a analizarlo.'), { status: 400 });
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(metaPathFor(normalized), 'utf8'));
  } catch {
    throw Object.assign(new Error('El archivo analizado ya no está disponible. Vuelve a analizarlo.'), { status: 410 });
  }
  if (Number(meta.userId) !== Number(userId) || Number(meta.businessUnitId) !== Number(businessUnitId) || meta.purpose !== purpose) {
    throw Object.assign(new Error('El archivo analizado no pertenece a esta sesión o unidad.'), { status: 403 });
  }
  if (Date.now() > Number(meta.expiresAt || 0)) {
    await removeCachedFile(normalized, meta).catch(() => {});
    throw Object.assign(new Error('La copia temporal del Excel venció. Vuelve a analizar el archivo.'), { status: 410 });
  }
  const filePath = filePathFor(normalized, meta.ext);
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    throw Object.assign(new Error('No se pudo recuperar el Excel analizado. Vuelve a seleccionarlo.'), { status: 410 });
  }
  return {
    buffer,
    originalname: meta.originalName,
    mimetype: meta.mimeType,
    size: meta.size,
    uploadToken: normalized,
  };
}

export async function removeCachedFile(token, knownMeta = null) {
  const normalized = String(token || '').trim();
  if (!tokenPattern.test(normalized)) return;
  let meta = knownMeta;
  if (!meta) {
    try { meta = JSON.parse(await fs.readFile(metaPathFor(normalized), 'utf8')); } catch { meta = null; }
  }
  const candidates = [metaPathFor(normalized)];
  if (meta?.ext) candidates.push(filePathFor(normalized, meta.ext));
  else {
    for (const ext of ['.xlsx', '.xls', '.bin']) candidates.push(filePathFor(normalized, ext));
  }
  await Promise.all(candidates.map(target => fs.rm(target, { force: true }).catch(() => {})));
}

export async function cleanupExpiredUploadCache() {
  await ensureCacheDir();
  const entries = await fs.readdir(cacheDir(), { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const target = path.join(cacheDir(), entry.name);
    try {
      const meta = JSON.parse(await fs.readFile(target, 'utf8'));
      if (Date.now() > Number(meta.expiresAt || 0)) {
        await removeCachedFile(meta.token, meta);
        removed++;
      }
    } catch {
      await fs.rm(target, { force: true });
    }
  }
  return removed;
}
