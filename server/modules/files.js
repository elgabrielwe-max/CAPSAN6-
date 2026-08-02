import { Router } from 'express';
import fs from 'node:fs';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool } from '../db.js';
import { syncAsset } from '../services/drive.js';
import { audit } from '../services/audit.js';

export const filesRouter=Router();filesRouter.use(authRequired);
filesRouter.get('/:id',async(req,res)=>{const asset=(await pool.query(`SELECT * FROM file_assets WHERE id=$1`,[Number(req.params.id)])).rows[0];if(!asset)return res.status(404).json({error:'Archivo no encontrado'});if(asset.business_unit_id&&!assertUnitAccess(req.user,asset.business_unit_id))return res.status(403).json({error:'Archivo fuera de tu alcance'});if(!fs.existsSync(asset.local_path))return res.status(404).json({error:'Archivo no disponible en el volumen'});res.download(asset.local_path,asset.original_name);});
filesRouter.post('/:id/sync',requireCapability('drive:sync'),async(req,res)=>{const result=await syncAsset(Number(req.params.id));await audit(req,'SYNC_DRIVE_FILE','FILE',req.params.id,result);res.json(result);});
filesRouter.post('/sync-pending/all',requireCapability('drive:sync'),async(req,res)=>{const rows=(await pool.query(`SELECT id FROM file_assets WHERE drive_status IN ('LOCAL','ERROR') ORDER BY id LIMIT 100`)).rows;let synced=0,failed=0;for(const row of rows){try{await syncAsset(row.id);synced++;}catch{failed++;}}res.json({processed:rows.length,synced,failed});});
