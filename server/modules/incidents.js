import { Router } from 'express';
import multer from 'multer';
import { authRequired, requireCapability, assertUnitAccess } from '../auth.js';
import { pool, tx } from '../db.js';
import { classifyFlashLocal } from '../services/ai.js';
import { saveUpload } from '../services/storage.js';
import { queueAsset } from '../services/drive.js';
import { audit } from '../services/audit.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
export const incidentsRouter = Router();
incidentsRouter.use(authRequired, requireCapability('incidents:manage'));

const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const upper = value => clean(value).toUpperCase();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function incidentFilter(req, alias = 'f') {
  const unitIds = req.user.role === 'MASTER' ? null : req.user.units.map(unit => Number(unit.id));
  const params = [unitIds];
  const clauses = [`($1::int[] IS NULL OR ${alias}.business_unit_id = ANY($1::int[]))`];
  let index = 2;

  if (req.query.businessUnitId) {
    clauses.push(`${alias}.business_unit_id = $${index++}`);
    params.push(Number(req.query.businessUnitId));
  }
  if (req.query.from) {
    clauses.push(`${alias}.event_date >= $${index++}`);
    params.push(req.query.from);
  }
  if (req.query.to) {
    clauses.push(`${alias}.event_date <= $${index++}`);
    params.push(req.query.to);
  }
  if (req.query.status) {
    clauses.push(`${alias}.followup_status = $${index++}`);
    params.push(req.query.status);
  }
  if (req.query.eventType) {
    clauses.push(`${alias}.event_type = $${index++}`);
    params.push(req.query.eventType);
  }

  return { where: clauses.join(' AND '), params };
}

incidentsRouter.get('/', asyncRoute(async (req, res) => {
  const { where, params } = incidentFilter(req);
  const rows = (await pool.query(`
    SELECT
      f.*,
      bu.name AS business_unit_name,
      a.name AS area_name,
      u.name AS created_by_name,
      (SELECT COUNT(*)::int FROM flash_report_images fi WHERE fi.flash_report_id = f.id) AS image_count
    FROM flash_reports f
    LEFT JOIN business_units bu ON bu.id = f.business_unit_id
    LEFT JOIN areas a ON a.id = f.area_id
    LEFT JOIN users u ON u.id = f.created_by
    WHERE ${where}
    ORDER BY f.event_date DESC, f.id DESC
    LIMIT 500
  `, params)).rows;
  res.json(rows);
}));

incidentsRouter.get('/dashboard', asyncRoute(async (req, res) => {
  const { where, params } = incidentFilter(req);
  const kpis = (await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE f.followup_status = 'CERRADO')::int AS closed,
      COUNT(*) FILTER (WHERE f.followup_status <> 'CERRADO')::int AS open,
      COUNT(*) FILTER (WHERE f.potential_severity IN ('ALTO', 'CRITICO'))::int AS high
    FROM flash_reports f
    WHERE ${where}
  `, params)).rows[0];

  const byType = (await pool.query(`
    SELECT COALESCE(f.event_type, 'SIN TIPO') AS name, COUNT(*)::int AS total
    FROM flash_reports f
    WHERE ${where}
    GROUP BY COALESCE(f.event_type, 'SIN TIPO')
    ORDER BY total DESC
  `, params)).rows;

  const byMonth = (await pool.query(`
    SELECT TO_CHAR(f.event_date, 'YYYY-MM') AS name, COUNT(*)::int AS total
    FROM flash_reports f
    WHERE ${where}
    GROUP BY TO_CHAR(f.event_date, 'YYYY-MM')
    ORDER BY name
  `, params)).rows;

  const byUnit = (await pool.query(`
    SELECT COALESCE(bu.name, 'SIN UNIDAD') AS name, COUNT(*)::int AS total
    FROM flash_reports f
    LEFT JOIN business_units bu ON bu.id = f.business_unit_id
    WHERE ${where}
    GROUP BY COALESCE(bu.name, 'SIN UNIDAD')
    ORDER BY total DESC
  `, params)).rows;

  res.json({
    kpis: {
      ...kpis,
      closurePercent: kpis.total ? Math.round((kpis.closed * 100) / kpis.total) : 0,
    },
    byType,
    byMonth,
    byUnit,
  });
}));

incidentsRouter.post('/ai/classify', asyncRoute(async (req, res) => {
  res.json(classifyFlashLocal(req.body.description));
}));

incidentsRouter.post('/', upload.array('images', 8), asyncRoute(async (req, res) => {
  const body = JSON.parse(req.body.payload || '{}');
  const unitId = Number(body.businessUnitId);
  if (!assertUnitAccess(req.user, unitId)) return res.status(403).json({ error: 'Unidad fuera de tu alcance' });
  if (!clean(body.eventDescription) || !clean(body.place) || !body.eventDate || !clean(body.involvedPerson)) {
    return res.status(400).json({ error: 'Completa fecha, lugar, persona involucrada y descripción' });
  }

  const ai = classifyFlashLocal(body.eventDescription);
  const report = await tx(async client => {
    const year = Number(String(body.eventDate).slice(0, 4));
    await client.query('SELECT pg_advisory_xact_lock($1)', [940000 + year]);
    const count = Number((await client.query(`
      SELECT COALESCE(MAX(event_number), 0)::int AS total
      FROM flash_reports
      WHERE EXTRACT(YEAR FROM event_date) = $1
    `, [year])).rows[0].total) + 1;
    const code = `FR-${year}-${String(count).padStart(4, '0')}`;

    const result = await client.query(`
      INSERT INTO flash_reports(
        report_code, event_number, event_type, potential_severity, event_group,
        event_date, event_time, place, business_unit_id, area_id, company,
        involved_person, involved_position, immediate_supervisor, event_description,
        damage_description, immediate_actions, root_cause, solution_summary,
        followup_status, created_by, severity_category, severity_value,
        probability_category, probability_value, risk_score, risk_classification,
        group_name, area, business_unit, supervisor_position, medical_diagnosis,
        lost_days, corrective_actions
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $4,1,'MEDIA',1,1,$4,$5,$22,$23,'SUPERVISOR',$24,0,$17
      )
      RETURNING *
    `, [
      code,
      count,
      upper(body.eventType) || 'INCIDENTE',
      upper(body.potentialSeverity) || ai.potentialSeverity,
      upper(body.eventGroup) || 'SEGURIDAD',
      body.eventDate,
      clean(body.eventTime) || null,
      upper(body.place),
      unitId,
      body.areaId ? Number(body.areaId) : null,
      upper(body.company) || null,
      upper(body.involvedPerson) || null,
      upper(body.involvedPosition) || null,
      upper(body.immediateSupervisor) || null,
      upper(body.eventDescription),
      upper(body.damageDescription) || null,
      upper(body.immediateActions) || null,
      upper(body.rootCause) || null,
      upper(body.solutionSummary) || null,
      upper(body.followupStatus) || 'PENDIENTE',
      req.user.id,
      upper(body.areaName) || 'SSOMA',
      upper(body.businessUnitName) || 'CANDELARIA',
      upper(body.medicalDiagnosis) || null,
    ]);
    return result.rows[0];
  });

  const uploaded = [];
  for (const file of req.files || []) {
    const saved = await saveUpload(file, `flash/${report.report_code}`);
    const asset = await queueAsset({
      entityType: 'FLASH_REPORT',
      entityId: report.id,
      businessUnitId: unitId,
      saved,
      uploadedBy: req.user.id,
    });
    const image = (await pool.query(`
      INSERT INTO flash_report_images(
        flash_report_id, original_name, stored_name, mime_type, size_bytes,
        drive_file_id, drive_web_link, drive_status
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      report.id,
      saved.originalName,
      saved.storedName,
      saved.mimeType,
      saved.size,
      asset.drive.fileId || null,
      asset.drive.webViewLink || null,
      asset.drive.status,
    ])).rows[0];
    uploaded.push(image);
  }

  await audit(req, 'CREATE_FLASH_REPORT', 'FLASH_REPORT', report.id, {
    code: report.report_code,
    images: uploaded.length,
  });
  res.json({ ...report, images: uploaded });
}));

incidentsRouter.put('/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await pool.query('SELECT business_unit_id FROM flash_reports WHERE id=$1', [id])).rows[0];
  if (!existing) return res.status(404).json({ error: 'Flash Report no encontrado' });
  if (!assertUnitAccess(req.user, existing.business_unit_id)) return res.status(403).json({ error: 'Fuera de tu alcance' });

  const status = upper(req.body.followupStatus) || 'PENDIENTE';
  const row = (await pool.query(`
    UPDATE flash_reports
    SET
      root_cause = COALESCE($1, root_cause),
      solution_summary = COALESCE($2, solution_summary),
      immediate_actions = COALESCE($3, immediate_actions),
      followup_status = $4,
      closed_at = CASE WHEN $4 = 'CERRADO' THEN NOW() ELSE NULL END,
      updated_at = NOW(),
      corrective_actions = COALESCE($3, corrective_actions)
    WHERE id = $5
    RETURNING *
  `, [
    upper(req.body.rootCause) || null,
    upper(req.body.solutionSummary) || null,
    upper(req.body.immediateActions) || null,
    status,
    id,
  ])).rows[0];

  await audit(req, 'UPDATE_FLASH_REPORT', 'FLASH_REPORT', id, { status });
  res.json(row);
}));
