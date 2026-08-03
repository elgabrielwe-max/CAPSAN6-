import { Router } from 'express';
import multer from 'multer';
import { authRequired, assertUnitAccess } from '../auth.js';
import { hasCapability } from '../permissions.js';
import { pool, tx } from '../db.js';
import { audit } from '../services/audit.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const dailySafetyRouter = Router();
dailySafetyRouter.use(authRequired);

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const upper = value => clean(value).toUpperCase();
const list = value => Array.isArray(value) ? value : [];
const allowed = (value, values, fallback) => values.includes(upper(value)) ? upper(value) : fallback;
const dateValue = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';

const scanEntity = Object.freeze({ dds: 'DDS_ATTENDANCE_SCAN', rit: 'RIT_ATTENDANCE_SCAN' });
const scanAllowed = file => {
  if (!file) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || '').toLowerCase();
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)
    || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(name);
};

async function attendanceFiles(entityType, entityId) {
  return (await pool.query(`SELECT id,original_name,mime_type,size_bytes,drive_status,created_at
    FROM file_assets WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC,id DESC`, [entityType, String(entityId)])).rows;
}


function requireDaily(req, res, next) {
  if (!req.user || !(hasCapability(req.user.role, 'dds:manage') || hasCapability(req.user.role, 'rit:manage'))) {
    return res.status(403).json({ error: 'No tienes permiso para DDS y RIT' });
  }
  next();
}

dailySafetyRouter.use(requireDaily);

function unitScope(user, alias, params) {
  if (user.role === 'MASTER') return 'TRUE';
  const ids = user.units.map(unit => Number(unit.id)).filter(Boolean);
  if (!ids.length) return 'FALSE';
  params.push(ids);
  return `${alias}.business_unit_id=ANY($${params.length}::int[])`;
}

function assertRequestUnit(req, res, unitId) {
  if (!unitId) {
    res.status(400).json({ error: 'Selecciona la unidad de negocio' });
    return false;
  }
  if (!assertUnitAccess(req.user, unitId)) {
    res.status(403).json({ error: 'Unidad fuera de tu alcance' });
    return false;
  }
  return true;
}

async function ensureWorkers(client, workerItems, unitId, areaId = null) {
  const ids = [...new Set(workerItems.map(item => Number(item.workerId)).filter(Boolean))];
  if (!ids.length) return [];
  const params = [ids, Number(unitId)];
  let areaClause = '';
  if (areaId) {
    params.push(Number(areaId));
    areaClause = ` AND area_id=$3::int`;
  }
  const rows = (await client.query(`SELECT id FROM workers WHERE active=TRUE AND id=ANY($1::int[]) AND business_unit_id=$2::int${areaClause}`, params)).rows;
  const allowedIds = new Set(rows.map(row => Number(row.id)));
  const invalid = ids.filter(id => !allowedIds.has(id));
  if (invalid.length) throw Object.assign(new Error('Uno o más trabajadores no pertenecen a la unidad/área seleccionada'), { status: 400 });
  return ids;
}

function splitLines(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value || '').split(/\r?\n/).map(clean).filter(Boolean);
}

function buildListFilters(req, alias, dateColumn) {
  const params = [];
  const clauses = [unitScope(req.user, alias, params)];
  if (req.query.businessUnitId) { params.push(Number(req.query.businessUnitId)); clauses.push(`${alias}.business_unit_id=$${params.length}::int`); }
  if (req.query.areaId) { params.push(Number(req.query.areaId)); clauses.push(`${alias}.area_id=$${params.length}::int`); }
  if (req.query.from) { params.push(req.query.from); clauses.push(`${alias}.${dateColumn}>=$${params.length}::date`); }
  if (req.query.to) { params.push(req.query.to); clauses.push(`${alias}.${dateColumn}<=$${params.length}::date`); }
  if (req.query.status) { params.push(upper(req.query.status)); clauses.push(`${alias}.status=$${params.length}`); }
  return { params, clause: clauses.join(' AND ') };
}

// Reutiliza directamente la base maestra de trabajadores ya cargada en CAPSAN6.
dailySafetyRouter.get('/workers', async (req, res) => {
  const unitId = Number(req.query.businessUnitId);
  if (!assertRequestUnit(req, res, unitId)) return;
  const params = [unitId];
  const clauses = ['w.active=TRUE', 'w.business_unit_id=$1::int'];
  if (req.query.areaId) { params.push(Number(req.query.areaId)); clauses.push(`w.area_id=$${params.length}::int`); }
  if (req.query.guard) { params.push(upper(req.query.guard)); clauses.push(`UPPER(COALESCE(w.guard,''))=$${params.length}`); }
  if (req.query.search) {
    params.push(`%${clean(req.query.search)}%`);
    clauses.push(`(w.dni ILIKE $${params.length} OR w.full_name ILIKE $${params.length} OR COALESCE(w.position,'') ILIKE $${params.length})`);
  }
  const rows = (await pool.query(`SELECT w.id,w.dni,w.full_name,w.position,w.guard,w.zone,w.area_id,a.name area_name
    FROM workers w JOIN areas a ON a.id=w.area_id
    WHERE ${clauses.join(' AND ')} ORDER BY a.name,w.full_name LIMIT 1500`, params)).rows;
  const guards = [...new Set(rows.map(row => clean(row.guard)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  res.json({ workers: rows, guards });
});

dailySafetyRouter.get('/summary', async (req, res) => {
  const from = dateValue(req.query.from) || null;
  const to = dateValue(req.query.to) || null;
  const unitId = req.query.businessUnitId ? Number(req.query.businessUnitId) : null;
  if (unitId && !assertUnitAccess(req.user, unitId)) return res.status(403).json({ error: 'Unidad fuera de tu alcance' });
  const unitIds = req.user.role === 'MASTER' ? null : req.user.units.map(unit => Number(unit.id));
  const params = [unitIds, unitId, from, to];
  const dds = (await pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE status='REALIZADO')::int realized,
      COALESCE(SUM(att.total),0)::int participants,
      COALESCE(SUM(att.present),0)::int present
    FROM dds_sessions d
    LEFT JOIN LATERAL (SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE attendance_status='ASISTIO')::int present FROM dds_attendance da WHERE da.dds_id=d.id) att ON TRUE
    WHERE ($1::int[] IS NULL OR d.business_unit_id=ANY($1::int[])) AND ($2::int IS NULL OR d.business_unit_id=$2)
      AND ($3::date IS NULL OR d.session_date>=$3) AND ($4::date IS NULL OR d.session_date<=$4)`, params)).rows[0];
  const rit = (await pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE status IN ('REALIZADO','CERRADO'))::int realized,
      COALESCE(SUM(part.total),0)::int participants,
      COALESCE(SUM(jsonb_array_length(COALESCE(r.critical_risks,'[]'::jsonb))),0)::int risks
    FROM rit_sessions r
    LEFT JOIN LATERAL (SELECT COUNT(*)::int total FROM rit_participants rp WHERE rp.rit_id=r.id) part ON TRUE
    WHERE ($1::int[] IS NULL OR r.business_unit_id=ANY($1::int[])) AND ($2::int IS NULL OR r.business_unit_id=$2)
      AND ($3::date IS NULL OR r.meeting_date>=$3) AND ($4::date IS NULL OR r.meeting_date<=$4)`, params)).rows[0];
  const attendancePercent = Number(dds.participants) ? Math.round(Number(dds.present) * 1000 / Number(dds.participants)) / 10 : 0;
  res.json({ dds: { ...dds, attendancePercent }, rit });
});

dailySafetyRouter.get('/dds', async (req, res) => {
  const filter = buildListFilters(req, 'd', 'session_date');
  const rows = (await pool.query(`SELECT d.*,bu.name business_unit_name,a.name area_name,u.name presenter_user_name,
      COUNT(da.id)::int participant_count,COUNT(da.id) FILTER(WHERE da.attendance_status='ASISTIO')::int attended_count,
      (SELECT COUNT(*)::int FROM file_assets fa WHERE fa.entity_type='DDS_ATTENDANCE_SCAN' AND fa.entity_id=d.id::text) attendance_scan_count
    FROM dds_sessions d JOIN business_units bu ON bu.id=d.business_unit_id LEFT JOIN areas a ON a.id=d.area_id
    LEFT JOIN users u ON u.id=d.presenter_user_id LEFT JOIN dds_attendance da ON da.dds_id=d.id
    WHERE ${filter.clause} GROUP BY d.id,bu.name,a.name,u.name ORDER BY d.session_date DESC,d.created_at DESC LIMIT 300`, filter.params)).rows;
  res.json(rows);
});

dailySafetyRouter.get('/dds/:id', async (req, res) => {
  const id = Number(req.params.id); const params = [id];
  const scope = unitScope(req.user, 'd', params);
  const session = (await pool.query(`SELECT d.*,bu.name business_unit_name,a.name area_name,u.name presenter_user_name
    FROM dds_sessions d JOIN business_units bu ON bu.id=d.business_unit_id LEFT JOIN areas a ON a.id=d.area_id LEFT JOIN users u ON u.id=d.presenter_user_id
    WHERE d.id=$1 AND ${scope}`, params)).rows[0];
  if (!session) return res.status(404).json({ error: 'DDS no encontrado' });
  const participants = (await pool.query(`SELECT da.worker_id,da.attendance_status,da.observation,w.dni,w.full_name,w.position,w.guard,a.name area_name
    FROM dds_attendance da JOIN workers w ON w.id=da.worker_id JOIN areas a ON a.id=w.area_id WHERE da.dds_id=$1 ORDER BY a.name,w.full_name`, [id])).rows;
  const files = await attendanceFiles(scanEntity.dds, id);
  res.json({ session, participants, attendanceFiles: files });
});

async function sessionForScan(kind, id, user) {
  const table = kind === 'dds' ? 'dds_sessions' : 'rit_sessions';
  const row = (await pool.query(`SELECT id,business_unit_id FROM ${table} WHERE id=$1`, [Number(id)])).rows[0];
  if (!row || !assertUnitAccess(user, row.business_unit_id)) return null;
  return row;
}

async function uploadAttendanceScan(req, res, kind) {
  const id = Number(req.params.id);
  const session = await sessionForScan(kind, id, req.user);
  if (!session) return res.status(404).json({ error: `${kind === 'dds' ? 'DDS' : 'RIT'} no encontrada o fuera de tu alcance` });
  if (!req.file) return res.status(400).json({ error: 'Adjunta el escaneado de asistentes' });
  if (!scanAllowed(req.file)) return res.status(400).json({ error: 'El escaneado debe ser PDF, JPG, PNG, WEBP, HEIC o HEIF' });
  const saved = await saveUpload(req.file, `daily-safety/${kind}/${id}`);
  const queued = await queueAsset({
    entityType: scanEntity[kind], entityId: id, businessUnitId: session.business_unit_id, saved, uploadedBy: req.user.id,
  });
  await audit(req, 'UPLOAD_ATTENDANCE_SCAN', kind.toUpperCase(), id, { fileAssetId: queued.asset.id, originalName: saved.originalName });
  res.status(201).json({
    id: queued.asset.id,
    original_name: queued.asset.original_name,
    mime_type: queued.asset.mime_type,
    size_bytes: queued.asset.size_bytes,
    drive_status: queued.drive.status,
    created_at: queued.asset.created_at,
  });
}

dailySafetyRouter.post('/dds/:id/attendance-scan', upload.single('file'), (req, res) => uploadAttendanceScan(req, res, 'dds'));
dailySafetyRouter.post('/rit/:id/attendance-scan', upload.single('file'), (req, res) => uploadAttendanceScan(req, res, 'rit'));

async function saveDds(req, res) {
  const id = req.params.id ? Number(req.params.id) : null;
  const unitId = Number(req.body.businessUnitId);
  const areaId = req.body.areaId ? Number(req.body.areaId) : null;
  if (!assertRequestUnit(req, res, unitId)) return;
  const sessionDate = dateValue(req.body.sessionDate);
  const topic = upper(req.body.topic);
  if (!sessionDate || !topic) return res.status(400).json({ error: 'Registra fecha y tema del DDS' });
  const status = allowed(req.body.status, ['BORRADOR', 'REALIZADO'], 'REALIZADO');
  const participants = list(req.body.participants).map(item => ({
    workerId: Number(item.workerId),
    attendanceStatus: allowed(item.attendanceStatus, ['ASISTIO', 'NO ASISTIO', 'JUSTIFICADO'], 'ASISTIO'),
    observation: clean(item.observation) || null,
  })).filter(item => item.workerId);
  if (status === 'REALIZADO' && !participants.length) return res.status(400).json({ error: 'Selecciona al menos un trabajador para realizar el DDS' });
  const saved = await tx(async client => {
    await ensureWorkers(client, participants, unitId, areaId);
    let row;
    const values = [sessionDate, unitId, areaId, upper(req.body.shift) || 'DÍA', upper(req.body.guard) || null, topic,
      clean(req.body.objective) || null, Number(req.body.durationMinutes || 5), req.user.id, req.user.name,
      clean(req.body.observations) || null, status, req.user.id];
    if (id) {
      const existing = (await client.query(`SELECT id,business_unit_id FROM dds_sessions WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!existing || !assertUnitAccess(req.user, existing.business_unit_id)) throw Object.assign(new Error('DDS no encontrado o fuera de tu alcance'), { status: 404 });
      row = (await client.query(`UPDATE dds_sessions SET session_date=$1,business_unit_id=$2,area_id=$3,shift=$4,guard=$5,topic=$6,objective=$7,duration_minutes=$8,
        presenter_user_id=$9,presenter_name=$10,observations=$11,status=$12,updated_at=NOW() WHERE id=$13 RETURNING *`, [...values.slice(0,12), id])).rows[0];
    } else {
      row = (await client.query(`INSERT INTO dds_sessions(session_date,business_unit_id,area_id,shift,guard,topic,objective,duration_minutes,presenter_user_id,presenter_name,observations,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, values)).rows[0];
    }
    await client.query(`DELETE FROM dds_attendance WHERE dds_id=$1`, [row.id]);
    for (const item of participants) await client.query(`INSERT INTO dds_attendance(dds_id,worker_id,attendance_status,observation) VALUES($1,$2,$3,$4)`, [row.id, item.workerId, item.attendanceStatus, item.observation]);
    return row;
  });
  await audit(req, id ? 'UPDATE_DDS' : 'CREATE_DDS', 'DDS', saved.id, { unitId, areaId, participants: participants.length, status });
  res.status(id ? 200 : 201).json(saved);
}

dailySafetyRouter.post('/dds', saveDds);
dailySafetyRouter.put('/dds/:id', saveDds);

dailySafetyRouter.get('/rit', async (req, res) => {
  const filter = buildListFilters(req, 'r', 'meeting_date');
  const rows = (await pool.query(`SELECT r.*,bu.name business_unit_name,a.name area_name,u.name supervisor_user_name,
      COUNT(rp.id)::int participant_count,jsonb_array_length(COALESCE(r.planned_activities,'[]'::jsonb))::int activity_count,
      jsonb_array_length(COALESCE(r.critical_risks,'[]'::jsonb))::int risk_count,
      (SELECT COUNT(*)::int FROM file_assets fa WHERE fa.entity_type='RIT_ATTENDANCE_SCAN' AND fa.entity_id=r.id::text) attendance_scan_count
    FROM rit_sessions r JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas a ON a.id=r.area_id
    LEFT JOIN users u ON u.id=r.supervisor_user_id LEFT JOIN rit_participants rp ON rp.rit_id=r.id
    WHERE ${filter.clause} GROUP BY r.id,bu.name,a.name,u.name ORDER BY r.meeting_date DESC,r.created_at DESC LIMIT 300`, filter.params)).rows;
  res.json(rows);
});

dailySafetyRouter.get('/rit/:id', async (req, res) => {
  const id = Number(req.params.id); const params = [id];
  const scope = unitScope(req.user, 'r', params);
  const session = (await pool.query(`SELECT r.*,bu.name business_unit_name,a.name area_name,u.name supervisor_user_name
    FROM rit_sessions r JOIN business_units bu ON bu.id=r.business_unit_id LEFT JOIN areas a ON a.id=r.area_id LEFT JOIN users u ON u.id=r.supervisor_user_id
    WHERE r.id=$1 AND ${scope}`, params)).rows[0];
  if (!session) return res.status(404).json({ error: 'RIT no encontrada' });
  const participants = (await pool.query(`SELECT rp.worker_id,rp.assigned_activity,rp.responsibility,w.dni,w.full_name,w.position,w.guard,a.name area_name
    FROM rit_participants rp JOIN workers w ON w.id=rp.worker_id JOIN areas a ON a.id=w.area_id WHERE rp.rit_id=$1 ORDER BY a.name,w.full_name`, [id])).rows;
  const files = await attendanceFiles(scanEntity.rit, id);
  res.json({ session, participants, attendanceFiles: files });
});

async function saveRit(req, res) {
  const id = req.params.id ? Number(req.params.id) : null;
  const unitId = Number(req.body.businessUnitId);
  const areaId = req.body.areaId ? Number(req.body.areaId) : null;
  if (!assertRequestUnit(req, res, unitId)) return;
  const meetingDate = dateValue(req.body.meetingDate);
  const plannedActivities = splitLines(req.body.plannedActivities);
  const criticalRisks = splitLines(req.body.criticalRisks);
  const controls = splitLines(req.body.controls);
  const commitments = splitLines(req.body.commitments);
  if (!meetingDate || !plannedActivities.length) return res.status(400).json({ error: 'Registra fecha y al menos una actividad planificada' });
  const status = allowed(req.body.status, ['PLANIFICADO', 'REALIZADO', 'CERRADO'], 'REALIZADO');
  const participants = list(req.body.participants).map(item => ({
    workerId: Number(item.workerId),
    assignedActivity: clean(item.assignedActivity) || plannedActivities[0] || null,
    responsibility: clean(item.responsibility) || null,
  })).filter(item => item.workerId);
  if (status !== 'PLANIFICADO' && !participants.length) return res.status(400).json({ error: 'Selecciona al menos un trabajador para la RIT' });
  const saved = await tx(async client => {
    await ensureWorkers(client, participants, unitId, areaId);
    let row;
    const values = [meetingDate, unitId, areaId, upper(req.body.shift) || 'DÍA', upper(req.body.guard) || null, req.user.id, req.user.name,
      clean(req.body.previousShiftSummary) || null, JSON.stringify(plannedActivities), JSON.stringify(criticalRisks), JSON.stringify(controls),
      clean(req.body.restrictions) || null, JSON.stringify(commitments), clean(req.body.observations) || null, status, req.user.id];
    if (id) {
      const existing = (await client.query(`SELECT id,business_unit_id FROM rit_sessions WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!existing || !assertUnitAccess(req.user, existing.business_unit_id)) throw Object.assign(new Error('RIT no encontrada o fuera de tu alcance'), { status: 404 });
      row = (await client.query(`UPDATE rit_sessions SET meeting_date=$1,business_unit_id=$2,area_id=$3,shift=$4,guard=$5,supervisor_user_id=$6,supervisor_name=$7,
        previous_shift_summary=$8,planned_activities=$9::jsonb,critical_risks=$10::jsonb,controls=$11::jsonb,restrictions=$12,commitments=$13::jsonb,observations=$14,status=$15,updated_at=NOW()
        WHERE id=$16 RETURNING *`, [...values.slice(0,15), id])).rows[0];
    } else {
      row = (await client.query(`INSERT INTO rit_sessions(meeting_date,business_unit_id,area_id,shift,guard,supervisor_user_id,supervisor_name,previous_shift_summary,planned_activities,critical_risks,controls,restrictions,commitments,observations,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15,$16) RETURNING *`, values)).rows[0];
    }
    await client.query(`DELETE FROM rit_participants WHERE rit_id=$1`, [row.id]);
    for (const item of participants) await client.query(`INSERT INTO rit_participants(rit_id,worker_id,assigned_activity,responsibility) VALUES($1,$2,$3,$4)`, [row.id, item.workerId, item.assignedActivity, item.responsibility]);
    return row;
  });
  await audit(req, id ? 'UPDATE_RIT' : 'CREATE_RIT', 'RIT', saved.id, { unitId, areaId, participants: participants.length, status, risks: criticalRisks.length });
  res.status(id ? 200 : 201).json(saved);
}

dailySafetyRouter.post('/rit', saveRit);
dailySafetyRouter.put('/rit/:id', saveRit);
