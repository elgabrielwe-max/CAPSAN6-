import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export async function ensureStorage() { await fs.mkdir(config.uploadDir, { recursive: true }); }

const clean = value => String(value || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,120);

export async function saveUpload(file, folder='general') {
  if (!file?.buffer) throw Object.assign(new Error('Archivo requerido'), { status: 400 });
  const dir = path.join(config.uploadDir, clean(folder));
  await fs.mkdir(dir, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${clean(file.originalname)}`;
  const fullPath = path.join(dir, storedName);
  await fs.writeFile(fullPath, file.buffer);
  return { storedName, fullPath, originalName: file.originalname, mimeType: file.mimetype, size: file.size };
}
