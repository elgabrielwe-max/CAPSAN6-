import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_IMPORT_FILE_SIZE = 25 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 512 * 1024;
const tokenPattern = /^[a-f0-9]{48}$/i;

const cacheDir = () => path.join(config.uploadDir, '.import-cache');
const safeExt = name => {
  const ext = path.extname(String(name || '')).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
};
const filePathFor = (token, ext = '.bin') => path.join(cacheDir(), `${token}${ext}`);
const metaPathFor = token => path.join(cacheDir(), `${token}.json`);
const chunkMetaPathFor = token => path.join(cacheDir(), `${token}.upload.json`);
const chunkPartPathFor = token => path.join(cacheDir(), `${token}.part`);

async function ensureCacheDir() {
  await fs.mkdir(cacheDir(), { recursive: true });
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value));
  await fs.rename(temporary, target);
}

function assertToken(token) {
  const normalized = String(token || '').trim();
  if (!tokenPattern.test(normalized)) throw Object.assign(new Error('La carga temporal no es válida. Selecciona nuevamente el archivo.'), { status: 400 });
  return normalized;
}

function assertOwner(meta, { userId, businessUnitId, purpose }) {
  if (Number(meta.userId) !== Number(userId) || Number(meta.businessUnitId) !== Number(businessUnitId) || meta.purpose !== purpose) {
    throw Object.assign(new Error('La carga temporal no pertenece a esta sesión o unidad.'), { status: 403 });
  }
  if (Date.now() > Number(meta.expiresAt || 0)) {
    throw Object.assign(new Error('La carga temporal venció. Selecciona nuevamente el archivo.'), { status: 410 });
  }
}

async function loadChunkMeta(token, owner) {
  const normalized = assertToken(token);
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(chunkMetaPathFor(normalized), 'utf8'));
  } catch {
    throw Object.assign(new Error('La carga por partes ya no está disponible. Selecciona nuevamente el archivo.'), { status: 410 });
  }
  assertOwner(meta, owner);
  return { normalized, meta };
}

export async function beginChunkedUpload({ userId, businessUnitId, purpose = 'RAC_IMPORT', originalName, mimeType, size } = {}) {
  await ensureCacheDir();
  const normalizedSize = Number(size || 0);
  const ext = safeExt(originalName);
  if (!['.xlsx', '.xls'].includes(ext)) throw Object.assign(new Error('Selecciona un archivo Excel .xlsx o .xls'), { status: 400 });
  if (!Number.isInteger(normalizedSize) || normalizedSize <= 0) throw Object.assign(new Error('El archivo está vacío o no se pudo leer'), { status: 400 });
  if (normalizedSize > MAX_IMPORT_FILE_SIZE) throw Object.assign(new Error('El archivo supera el tamaño máximo permitido de 25 MB.'), { status: 413 });

  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = Date.now();
  const totalChunks = Math.ceil(normalizedSize / DEFAULT_CHUNK_SIZE);
  const meta = {
    kind: 'CHUNK_UPLOAD', token, userId: Number(userId), businessUnitId: Number(businessUnitId), purpose,
    originalName: String(originalName || 'archivo.xlsx'), mimeType: String(mimeType || 'application/octet-stream'),
    size: normalizedSize, ext, chunkSize: DEFAULT_CHUNK_SIZE, totalChunks, receivedChunks: [],
    createdAt, expiresAt: createdAt + CACHE_TTL_MS,
  };
  await fs.writeFile(chunkPartPathFor(token), Buffer.alloc(0));
  await writeJsonAtomic(chunkMetaPathFor(token), meta);
  return { uploadToken: token, chunkSize: DEFAULT_CHUNK_SIZE, totalChunks, expiresAt: new Date(meta.expiresAt).toISOString() };
}

export async function saveChunkedUploadPart(token, { userId, businessUnitId, purpose = 'RAC_IMPORT', index, data } = {}) {
  const { normalized, meta } = await loadChunkMeta(token, { userId, businessUnitId, purpose });
  const chunkIndex = Number(index);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= Number(meta.totalChunks)) {
    throw Object.assign(new Error('La parte recibida del archivo no es válida'), { status: 400 });
  }
  const encoded = String(data || '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Object.assign(new Error('La parte recibida está vacía o dañada'), { status: 400 });
  const buffer = Buffer.from(encoded, 'base64');
  const offset = chunkIndex * Number(meta.chunkSize);
  const expected = Math.min(Number(meta.chunkSize), Number(meta.size) - offset);
  if (buffer.length !== expected) throw Object.assign(new Error(`La parte ${chunkIndex + 1} llegó incompleta. Vuelve a intentar la carga.`), { status: 400 });

  const handle = await fs.open(chunkPartPathFor(normalized), 'r+');
  try { await handle.write(buffer, 0, buffer.length, offset); } finally { await handle.close(); }

  const received = new Set((meta.receivedChunks || []).map(Number));
  received.add(chunkIndex);
  meta.receivedChunks = [...received].sort((a, b) => a - b);
  meta.expiresAt = Date.now() + CACHE_TTL_MS;
  await writeJsonAtomic(chunkMetaPathFor(normalized), meta);
  return {
    receivedChunks: meta.receivedChunks.length,
    totalChunks: Number(meta.totalChunks),
    progressPercent: Math.round(meta.receivedChunks.length * 100 / Number(meta.totalChunks)),
  };
}

export async function completeChunkedUpload(token, { userId, businessUnitId, purpose = 'RAC_IMPORT' } = {}) {
  const normalized = assertToken(token);
  let loaded;
  try {
    loaded = await loadChunkMeta(normalized, { userId, businessUnitId, purpose });
  } catch (error) {
    // La respuesta de finalización puede perderse aunque el servidor ya haya completado el archivo.
    // En ese caso la operación debe ser idempotente y devolver la caché final existente.
    try {
      const meta = JSON.parse(await fs.readFile(metaPathFor(normalized), 'utf8'));
      assertOwner(meta, { userId, businessUnitId, purpose });
      return { uploadToken: normalized, expiresAt: new Date(Number(meta.expiresAt)).toISOString(), originalName: meta.originalName, size: Number(meta.size) };
    } catch {
      throw error;
    }
  }
  const { meta } = loaded;
  const received = new Set((meta.receivedChunks || []).map(Number));
  const missing = [];
  for (let i = 0; i < Number(meta.totalChunks); i++) if (!received.has(i)) missing.push(i + 1);
  if (missing.length) throw Object.assign(new Error(`Faltan ${missing.length} partes del archivo. Reintenta la carga.`), { status: 409, missingChunks: missing });

  const partPath = chunkPartPathFor(normalized);
  const stat = await fs.stat(partPath).catch(() => null);
  if (!stat || stat.size < Number(meta.size)) throw Object.assign(new Error('El archivo temporal quedó incompleto. Vuelve a cargarlo.'), { status: 409 });
  await fs.truncate(partPath, Number(meta.size));
  const finalPath = filePathFor(normalized, meta.ext);
  await fs.rename(partPath, finalPath);
  const finalMeta = {
    token: normalized, userId: Number(meta.userId), businessUnitId: Number(meta.businessUnitId), purpose: meta.purpose,
    originalName: meta.originalName, mimeType: meta.mimeType, size: Number(meta.size), ext: meta.ext,
    createdAt: Number(meta.createdAt), expiresAt: Date.now() + CACHE_TTL_MS,
  };
  await writeJsonAtomic(metaPathFor(normalized), finalMeta);
  await fs.rm(chunkMetaPathFor(normalized), { force: true });
  return { uploadToken: normalized, expiresAt: new Date(finalMeta.expiresAt).toISOString(), originalName: finalMeta.originalName, size: finalMeta.size };
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
    writeJsonAtomic(metaPathFor(token), meta),
  ]);
  return { token, expiresAt: new Date(meta.expiresAt).toISOString(), originalName: meta.originalName, size: meta.size };
}

export async function loadCachedFile(token, { userId, businessUnitId, purpose = 'RAC_IMPORT' } = {}) {
  const normalized = assertToken(token);
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(metaPathFor(normalized), 'utf8'));
  } catch {
    throw Object.assign(new Error('El archivo analizado ya no está disponible. Vuelve a analizarlo.'), { status: 410 });
  }
  assertOwner(meta, { userId, businessUnitId, purpose });
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
    expiresAt: new Date(Number(meta.expiresAt)).toISOString(),
  };
}

export async function removeCachedFile(token, knownMeta = null) {
  const normalized = String(token || '').trim();
  if (!tokenPattern.test(normalized)) return;
  let meta = knownMeta;
  if (!meta) {
    try { meta = JSON.parse(await fs.readFile(metaPathFor(normalized), 'utf8')); } catch { meta = null; }
  }
  const candidates = [metaPathFor(normalized), chunkMetaPathFor(normalized), chunkPartPathFor(normalized)];
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
