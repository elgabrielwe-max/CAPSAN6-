import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { pool } from '../db.js';

const b64url = input => Buffer.from(input).toString('base64url');
let tokenCache = { token: '', expiresAt: 0 };

async function accessToken() {
  if (!config.drive.enabled) return null;
  if (!config.drive.serviceAccountEmail || !config.drive.privateKey || !config.drive.rootFolderId) {
    throw new Error('Google Drive está habilitado pero faltan credenciales');
  }
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;
  const now = Math.floor(Date.now()/1000);
  const header = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: config.drive.serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), config.drive.privateKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error(`No se pudo autenticar Google Drive: ${await response.text()}`);
  const data = await response.json();
  tokenCache = { token:data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600)*1000 };
  return tokenCache.token;
}

async function driveRequest(url, options={}) {
  const token = await accessToken();
  const response = await fetch(url, { ...options, headers: { authorization:`Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Google Drive ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function escapeQuery(value) { return String(value).replace(/'/g,"\\'"); }

async function findOrCreateFolder(parentId, name) {
  const q = encodeURIComponent(`name='${escapeQuery(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files?.[0]) return found.files[0].id;
  const created = await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name&supportsAllDrives=true', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name, mimeType:'application/vnd.google-apps.folder', parents:[parentId] })
  });
  return created.id;
}

async function ensureFolderPath(parts) {
  let parent = config.drive.rootFolderId;
  for (const part of parts.filter(Boolean)) parent = await findOrCreateFolder(parent, String(part).slice(0,100));
  return parent;
}

export async function syncAsset(assetId) {
  if (!config.drive.enabled) return { status:'LOCAL' };
  const result = await pool.query(`SELECT fa.*,bu.name business_unit_name FROM file_assets fa LEFT JOIN business_units bu ON bu.id=fa.business_unit_id WHERE fa.id=$1`, [assetId]);
  const asset = result.rows[0];
  if (!asset) throw new Error('Archivo no encontrado');
  const created = new Date(asset.created_at);
  const year = created.getFullYear();
  const month = String(created.getMonth()+1).padStart(2,'0');
  const folderParts = ['CAPSAN6', String(year), month, asset.business_unit_name || 'GENERAL', asset.entity_type, asset.entity_id || 'SIN-CODIGO'];
  const folderId = await ensureFolderPath(folderParts);
  const boundary = `capsan-${crypto.randomBytes(12).toString('hex')}`;
  const fileBytes = await fs.readFile(asset.local_path);
  const metadata = JSON.stringify({ name: asset.original_name, parents:[folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${asset.mime_type || 'application/octet-stream'}\r\n\r\n`),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const uploaded = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true', {
    method:'POST', headers:{'content-type':`multipart/related; boundary=${boundary}`}, body
  });
  const folderPath = folderParts.join('/');
  await pool.query(`UPDATE file_assets SET drive_folder_path=$1,drive_file_id=$2,drive_web_link=$3,drive_status='SYNCED',synced_at=NOW() WHERE id=$4`, [folderPath, uploaded.id, uploaded.webViewLink || null, assetId]);
  return { status:'SYNCED', fileId:uploaded.id, webViewLink:uploaded.webViewLink, folderPath };
}

export async function queueAsset({ entityType, entityId, businessUnitId, saved, uploadedBy }) {
  const result = await pool.query(`INSERT INTO file_assets(entity_type,entity_id,business_unit_id,original_name,stored_name,local_path,mime_type,size_bytes,uploaded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [entityType,String(entityId || ''),businessUnitId || null,saved.originalName,saved.storedName,saved.fullPath,saved.mimeType,saved.size,uploadedBy]);
  const asset = result.rows[0];
  if (config.drive.enabled) {
    try { return { asset, drive: await syncAsset(asset.id) }; }
    catch (error) {
      await pool.query(`UPDATE file_assets SET drive_status='ERROR' WHERE id=$1`, [asset.id]);
      console.error('Drive sync:', error.message);
    }
  }
  return { asset, drive:{ status:'LOCAL' } };
}
