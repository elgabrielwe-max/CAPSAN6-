import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { pool, tx } from './db.js';
import { config } from './config.js';
import { RAC_CAUSE_CATALOG, normalizeCauseText } from './racCauseCatalog.js';

const q = sql => pool.query(sql);

async function ensureColumns() {
  const statements = [
    `ALTER TABLE business_units ADD COLUMN IF NOT EXISTS code VARCHAR(30)`,
    `ALTER TABLE business_units ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE areas ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE areas ADD COLUMN IF NOT EXISTS code VARCHAR(40)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by INTEGER`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS all_units_access BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS business_unit_id INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS full_name VARCHAR(220)`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS source_file TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR'`,
    `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS evaluation_topic VARCHAR(240)`,
    `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS approved_min NUMERIC(5,2) NOT NULL DEFAULT 16`,
    `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS score_min NUMERIC(5,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS score_max NUMERIC(5,2) NOT NULL DEFAULT 20`,
    `ALTER TABLE grades ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(30) NOT NULL DEFAULT 'ASISTIO'`,
    `ALTER TABLE grades ADD COLUMN IF NOT EXISTS observation TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS business_unit_id INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS source_report_number VARCHAR(80)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS source_uid VARCHAR(160)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS record_fingerprint VARCHAR(64)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS content_fingerprint VARCHAR(64)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS cause_category VARCHAR(180)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS cause_subtype VARCHAR(220)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS cause_category_id INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS cause_subtype_id INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS close_comment TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS validation_comment TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS validation_requested_at TIMESTAMPTZ`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS validated_by INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS due_date DATE`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS first_attention_at TIMESTAMPTZ`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS source_file TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS source_sheet TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS source_row INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS import_batch_id BIGINT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS environmental_flag BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS environmental_category VARCHAR(120)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS environmental_confidence NUMERIC(5,4)`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS evidence_required BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS evidence_exemption_reason TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS evidence_exempted_at TIMESTAMPTZ`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS evidence_exempted_by INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS directed_area_id INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS direction_reason TEXT`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS directed_by INTEGER`,
    `ALTER TABLE racs ADD COLUMN IF NOT EXISTS directed_at TIMESTAMPTZ`,
    `ALTER TABLE rac_cause_categories ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(30) NOT NULL DEFAULT 'SEGUIMIENTO'`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS comment TEXT`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS drive_file_id TEXT`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS drive_web_link TEXT`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS drive_folder_path TEXT`,
    `ALTER TABLE rac_evidence ADD COLUMN IF NOT EXISTS drive_status VARCHAR(30) DEFAULT 'LOCAL'`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS report_code VARCHAR(50)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS potential_severity VARCHAR(30)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS event_group VARCHAR(80)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS business_unit_id INTEGER`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS area_id INTEGER`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS immediate_actions TEXT`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS root_cause TEXT`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS solution_summary TEXT`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS severity_category VARCHAR(30)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS severity_value INTEGER DEFAULT 1`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS probability_category VARCHAR(30)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS probability_value INTEGER DEFAULT 1`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 1`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS risk_classification VARCHAR(30)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS group_name VARCHAR(80)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS area VARCHAR(120)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS business_unit VARCHAR(120)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS supervisor_position VARCHAR(160)`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS medical_diagnosis TEXT`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS lost_days INTEGER DEFAULT 0`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS corrective_actions TEXT`,
    `ALTER TABLE flash_reports ADD COLUMN IF NOT EXISTS event_number INTEGER`,
    `ALTER TABLE flash_report_images ADD COLUMN IF NOT EXISTS stored_name TEXT`,
    `ALTER TABLE flash_report_images ADD COLUMN IF NOT EXISTS drive_file_id TEXT`,
    `ALTER TABLE flash_report_images ADD COLUMN IF NOT EXISTS drive_web_link TEXT`,
    `ALTER TABLE flash_report_images ADD COLUMN IF NOT EXISTS drive_status VARCHAR(30) DEFAULT 'LOCAL'`,
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_user_id INTEGER`,
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE audit_log ALTER COLUMN entity_id TYPE TEXT USING entity_id::text`,
    `ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER`,
    `ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS user_id INTEGER`,
    `ALTER TABLE public_share_links ADD COLUMN IF NOT EXISTS scope VARCHAR(40) NOT NULL DEFAULT 'RACS_EXECUTIVE'`,
    `ALTER TABLE environmental_metrics ADD COLUMN IF NOT EXISTS target_value NUMERIC(16,3)`,
    `ALTER TABLE ssoma_work_plans ADD COLUMN IF NOT EXISTS activities JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE ssoma_evidence ADD COLUMN IF NOT EXISTS drive_file_id TEXT`,
    `ALTER TABLE ssoma_evidence ADD COLUMN IF NOT EXISTS drive_web_link TEXT`,
    `ALTER TABLE ssoma_evidence ADD COLUMN IF NOT EXISTS drive_folder_path TEXT`,
    `ALTER TABLE ssoma_evidence ADD COLUMN IF NOT EXISTS drive_status VARCHAR(30) DEFAULT 'LOCAL'`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS original_name TEXT`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS source_file TEXT`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS imported_by INTEGER`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS created_by INTEGER`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS detected_period VARCHAR(20)`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS rows_received INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS rows_valid INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS rows_inserted INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS rows_updated INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS rows_rejected INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS total_rows INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS inserted_rows INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS updated_rows INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS omitted_rows INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS error_rows INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE rac_import_batches ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb`,
  ];
  for (const sql of statements) {
    try { await q(sql); } catch (error) {
      if (error.code !== '42P01') throw error;
    }
  }
}

export async function initSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(40) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS business_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(140) UNIQUE NOT NULL,
      code VARCHAR(30) UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS areas (
      id SERIAL PRIMARY KEY,
      name VARCHAR(140) UNIQUE NOT NULL,
      code VARCHAR(40),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS business_unit_areas (
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      PRIMARY KEY(business_unit_id, area_id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL,
      username VARCHAR(60) UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK(role IN ('MASTER','SSOMA','SUPERVISOR')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      deleted_by INTEGER,
      all_units_access BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_business_units (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, business_unit_id)
    );
    CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY,
      dni VARCHAR(8) UNIQUE NOT NULL,
      full_name VARCHAR(220) NOT NULL,
      area_id INTEGER NOT NULL REFERENCES areas(id),
      business_unit_id INTEGER REFERENCES business_units(id),
      zone VARCHAR(140),
      position VARCHAR(160),
      guard VARCHAR(40),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      source_file TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_workers_unit_area ON workers(business_unit_id, area_id);

    CREATE TABLE IF NOT EXISTS trainings (
      id SERIAL PRIMARY KEY,
      title VARCHAR(240) NOT NULL,
      description TEXT,
      evaluation_topic VARCHAR(240),
      status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR',
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      start_date DATE,
      end_date DATE,
      approved_min NUMERIC(5,2) NOT NULL DEFAULT 16,
      failed_max NUMERIC(5,2) NOT NULL DEFAULT 10,
      score_min NUMERIC(5,2) NOT NULL DEFAULT 0,
      score_max NUMERIC(5,2) NOT NULL DEFAULT 20,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS training_targets (
      id BIGSERIAL PRIMARY KEY,
      training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      area_id INTEGER REFERENCES areas(id) ON DELETE CASCADE,
      UNIQUE(training_id, business_unit_id, area_id)
    );
    CREATE TABLE IF NOT EXISTS grades (
      id SERIAL PRIMARY KEY,
      training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      score NUMERIC(5,2) NOT NULL,
      result VARCHAR(30) NOT NULL,
      attendance_status VARCHAR(30) NOT NULL DEFAULT 'ASISTIO',
      observation TEXT,
      entered_by INTEGER REFERENCES users(id),
      entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(training_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS rit_daily_records (
      id BIGSERIAL PRIMARY KEY,
      rit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      area_id INTEGER REFERENCES areas(id),
      guard VARCHAR(80),
      topic VARCHAR(280) NOT NULL,
      facilitator_name VARCHAR(220) NOT NULL,
      scheduled_count INTEGER NOT NULL DEFAULT 0 CHECK(scheduled_count>=0),
      attendee_count INTEGER NOT NULL DEFAULT 0 CHECK(attendee_count>=0),
      duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK(duration_minutes>=0),
      status VARCHAR(30) NOT NULL DEFAULT 'EJECUTADO',
      observation TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rit_daily_scope ON rit_daily_records(business_unit_id,rit_date,status);

    CREATE TABLE IF NOT EXISTS ids_performance (
      id BIGSERIAL PRIMARY KEY,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      collaborators_count INTEGER NOT NULL DEFAULT 0 CHECK(collaborators_count>=0),
      rac_programmed INTEGER NOT NULL DEFAULT 0 CHECK(rac_programmed>=0),
      rac_executed INTEGER NOT NULL DEFAULT 0 CHECK(rac_executed>=0),
      acts_count INTEGER NOT NULL DEFAULT 0 CHECK(acts_count>=0),
      conditions_count INTEGER NOT NULL DEFAULT 0 CHECK(conditions_count>=0),
      rit_cap_programmed INTEGER NOT NULL DEFAULT 0 CHECK(rit_cap_programmed>=0),
      rit_cap_executed INTEGER NOT NULL DEFAULT 0 CHECK(rit_cap_executed>=0),
      inspections_programmed INTEGER NOT NULL DEFAULT 0 CHECK(inspections_programmed>=0),
      inspections_executed INTEGER NOT NULL DEFAULT 0 CHECK(inspections_executed>=0),
      pare_programmed INTEGER NOT NULL DEFAULT 0 CHECK(pare_programmed>=0),
      pare_executed INTEGER NOT NULL DEFAULT 0 CHECK(pare_executed>=0),
      observation TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(worker_id,period_start,period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_ids_scope ON ids_performance(business_unit_id,period_start,period_end);

    CREATE TABLE IF NOT EXISTS rac_cause_categories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(10) UNIQUE NOT NULL,
      name VARCHAR(180) NOT NULL,
      report_type VARCHAR(50) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      is_custom BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rac_cause_categories_name ON rac_cause_categories(name);
    CREATE TABLE IF NOT EXISTS rac_cause_subtypes (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES rac_cause_categories(id) ON DELETE CASCADE,
      name VARCHAR(220) NOT NULL,
      normalized_name VARCHAR(220) NOT NULL,
      is_custom BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(category_id, normalized_name)
    );
    CREATE INDEX IF NOT EXISTS idx_rac_cause_subtypes_category ON rac_cause_subtypes(category_id,active,sort_order);

    CREATE TABLE IF NOT EXISTS racs (
      id SERIAL PRIMARY KEY,
      report_code VARCHAR(80) UNIQUE NOT NULL,
      source_report_number VARCHAR(80),
      business_unit_id INTEGER REFERENCES business_units(id),
      reporting_area_id INTEGER REFERENCES areas(id),
      reported_area_id INTEGER REFERENCES areas(id),
      directed_area_id INTEGER REFERENCES areas(id),
      direction_reason TEXT,
      directed_by INTEGER REFERENCES users(id),
      directed_at TIMESTAMPTZ,
      reporter_name VARCHAR(180) NOT NULL,
      reporter_type VARCHAR(40) DEFAULT 'COLABORADOR',
      location VARCHAR(220),
      report_date DATE NOT NULL DEFAULT CURRENT_DATE,
      risk_level VARCHAR(20) NOT NULL,
      report_type VARCHAR(50) NOT NULL,
      deviation_type VARCHAR(220) NOT NULL,
      cause_category VARCHAR(180),
      cause_subtype VARCHAR(220),
      description TEXT NOT NULL,
      supervisor_user_id INTEGER REFERENCES users(id),
      supervisor_name_text VARCHAR(180),
      corrective_action TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      lifted_at DATE,
      close_comment TEXT,
      validation_comment TEXT,
      validation_requested_at TIMESTAMPTZ,
      validated_at TIMESTAMPTZ,
      validated_by INTEGER REFERENCES users(id),
      due_date DATE,
      first_attention_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      objective TEXT,
      source_file TEXT,
      source_sheet TEXT,
      source_row INTEGER,
      import_batch_id BIGINT,
      environmental_flag BOOLEAN NOT NULL DEFAULT FALSE,
      environmental_category VARCHAR(120),
      environmental_confidence NUMERIC(5,4),
      evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
      evidence_exemption_reason TEXT,
      evidence_exempted_at TIMESTAMPTZ,
      evidence_exempted_by INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_racs_filters ON racs(business_unit_id, report_date, status, risk_level);
    CREATE TABLE IF NOT EXISTS rac_assignments (
      id BIGSERIAL PRIMARY KEY,
      rac_id INTEGER NOT NULL REFERENCES racs(id) ON DELETE CASCADE,
      supervisor_user_id INTEGER NOT NULL REFERENCES users(id),
      assigned_by INTEGER REFERENCES users(id),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rac_active_assignment ON rac_assignments(rac_id, supervisor_user_id) WHERE active;
    CREATE TABLE IF NOT EXISTS rac_evidence (
      id SERIAL PRIMARY KEY,
      rac_id INTEGER NOT NULL REFERENCES racs(id) ON DELETE CASCADE,
      evidence_type VARCHAR(30) NOT NULL DEFAULT 'SEGUIMIENTO',
      comment TEXT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes BIGINT,
      drive_file_id TEXT,
      drive_web_link TEXT,
      drive_folder_path TEXT,
      drive_status VARCHAR(30) DEFAULT 'LOCAL',
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS rac_import_batches (
      id BIGSERIAL PRIMARY KEY,
      original_name TEXT NOT NULL,
      business_unit_id INTEGER REFERENCES business_units(id),
      imported_by INTEGER REFERENCES users(id),
      detected_period VARCHAR(20),
      rows_received INTEGER NOT NULL DEFAULT 0,
      rows_valid INTEGER NOT NULL DEFAULT 0,
      rows_inserted INTEGER NOT NULL DEFAULT 0,
      rows_updated INTEGER NOT NULL DEFAULT 0,
      rows_rejected INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'COMPLETADO',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS environmental_metrics (
      id BIGSERIAL PRIMARY KEY,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      metric_date DATE NOT NULL,
      metric_type VARCHAR(80) NOT NULL,
      value NUMERIC(16,3) NOT NULL,
      unit VARCHAR(30) NOT NULL,
      target_value NUMERIC(16,3),
      source TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_environment_metrics ON environmental_metrics(business_unit_id, metric_date, metric_type);

    CREATE TABLE IF NOT EXISTS ssoma_work_plans (
      id BIGSERIAL PRIMARY KEY,
      plan_date DATE NOT NULL,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      ssoma_user_id INTEGER NOT NULL REFERENCES users(id),
      objective TEXT NOT NULL,
      activities JSONB NOT NULL DEFAULT '[]'::jsonb,
      pending_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'PLANIFICADO',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(plan_date, business_unit_id, ssoma_user_id)
    );
    CREATE TABLE IF NOT EXISTS ssoma_evidence (
      id BIGSERIAL PRIMARY KEY,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      rac_id INTEGER REFERENCES racs(id) ON DELETE SET NULL,
      ssoma_user_id INTEGER NOT NULL REFERENCES users(id),
      evidence_date DATE NOT NULL DEFAULT CURRENT_DATE,
      title VARCHAR(180) NOT NULL,
      description TEXT,
      original_name TEXT,
      stored_name TEXT,
      mime_type TEXT,
      size_bytes BIGINT,
      drive_file_id TEXT,
      drive_web_link TEXT,
      drive_folder_path TEXT,
      drive_status VARCHAR(30) DEFAULT 'LOCAL',
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS flash_reports (
      id SERIAL PRIMARY KEY,
      report_code VARCHAR(50) UNIQUE,
      event_type VARCHAR(50) NOT NULL,
      potential_severity VARCHAR(30),
      event_group VARCHAR(80),
      event_date DATE NOT NULL,
      event_time VARCHAR(20),
      place VARCHAR(220) NOT NULL,
      business_unit_id INTEGER REFERENCES business_units(id),
      area_id INTEGER REFERENCES areas(id),
      company VARCHAR(180),
      involved_person VARCHAR(220),
      involved_position VARCHAR(160),
      immediate_supervisor VARCHAR(220),
      event_description TEXT NOT NULL,
      damage_description TEXT,
      immediate_actions TEXT,
      root_cause TEXT,
      solution_summary TEXT,
      followup_status VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
      closed_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS flash_report_images (
      id BIGSERIAL PRIMARY KEY,
      flash_report_id INTEGER NOT NULL REFERENCES flash_reports(id) ON DELETE CASCADE,
      original_name TEXT,
      stored_name TEXT,
      mime_type TEXT,
      size_bytes BIGINT,
      drive_file_id TEXT,
      drive_web_link TEXT,
      drive_status VARCHAR(30) DEFAULT 'LOCAL',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS file_assets (
      id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(60) NOT NULL,
      entity_id VARCHAR(80),
      business_unit_id INTEGER REFERENCES business_units(id),
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      local_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes BIGINT,
      drive_folder_path TEXT,
      drive_file_id TEXT,
      drive_web_link TEXT,
      drive_status VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
      uploaded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_file_assets_entity ON file_assets(entity_type, entity_id);
    CREATE TABLE IF NOT EXISTS training_attendance_files (
      id BIGSERIAL PRIMARY KEY,
      training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
      file_asset_id BIGINT NOT NULL UNIQUE REFERENCES file_assets(id) ON DELETE CASCADE,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_training_attendance_scope ON training_attendance_files(training_id,business_unit_id,area_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS public_share_links (
      id BIGSERIAL PRIMARY KEY,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      scope VARCHAR(40) NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by INTEGER REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      actor_user_id INTEGER REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(80),
      entity_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS system_notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      message TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
      entity_type VARCHAR(60),
      entity_id VARCHAR(80),
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await ensureColumns();

  await q(`CREATE TABLE IF NOT EXISTS rac_reconciliation_memory (
    id BIGSERIAL PRIMARY KEY,
    purge_reference TEXT NOT NULL,
    old_rac_id INTEGER NOT NULL,
    business_unit_id INTEGER,
    source_uid VARCHAR(160),
    source_report_number VARCHAR(80),
    report_date DATE,
    record_fingerprint VARCHAR(64),
    content_fingerprint VARCHAR(64),
    rac_snapshot JSONB NOT NULL,
    evidence_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    assignments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    restored_at TIMESTAMPTZ,
    restored_rac_id INTEGER,
    evidence_recovered_at TIMESTAMPTZ,
    evidence_recovered_rac_id INTEGER,
    evidence_recovery_method VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`ALTER TABLE rac_reconciliation_memory ADD COLUMN IF NOT EXISTS evidence_recovered_at TIMESTAMPTZ`);
  await q(`ALTER TABLE rac_reconciliation_memory ADD COLUMN IF NOT EXISTS evidence_recovered_rac_id INTEGER`);
  await q(`ALTER TABLE rac_reconciliation_memory ADD COLUMN IF NOT EXISTS evidence_recovery_method VARCHAR(80)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_rac_reconciliation_match ON rac_reconciliation_memory(business_unit_id,source_uid,source_report_number,report_date,record_fingerprint,content_fingerprint)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_rac_reconciliation_pending ON rac_reconciliation_memory(restored_at,business_unit_id)`);

  // Los índices que dependen de columnas agregadas por migración deben crearse
  // después de ensureColumns(). En bases existentes, CREATE TABLE IF NOT EXISTS
  // no incorpora columnas nuevas y el índice fallaría durante el arranque.
  await q(`CREATE INDEX IF NOT EXISTS idx_racs_direction ON racs(business_unit_id,directed_area_id,status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_racs_fingerprint ON racs(business_unit_id,record_fingerprint,content_fingerprint)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_racs_source_uid_unique ON racs(business_unit_id,source_uid) WHERE source_uid IS NOT NULL`);

  // Normaliza restricciones históricas sin borrar información.
  await q(`UPDATE users SET username=COALESCE(username, split_part(email,'@',1)) WHERE username IS NULL`);
  try { await q(`UPDATE workers SET full_name=COALESCE(full_name, dni) WHERE full_name IS NULL`); } catch (error) { if (error.code !== '42703') throw error; }
  await q(`UPDATE system_notifications SET recipient_user_id=COALESCE(recipient_user_id,user_id),user_id=COALESCE(user_id,recipient_user_id)`);
  await q(`UPDATE rac_import_batches SET original_name=COALESCE(original_name,source_file,'ARCHIVO'),source_file=COALESCE(source_file,original_name,'ARCHIVO'),imported_by=COALESCE(imported_by,created_by),created_by=COALESCE(created_by,imported_by),rows_received=GREATEST(rows_received,total_rows),total_rows=GREATEST(total_rows,rows_received),rows_inserted=GREATEST(rows_inserted,inserted_rows),inserted_rows=GREATEST(inserted_rows,rows_inserted),rows_updated=GREATEST(rows_updated,updated_rows),updated_rows=GREATEST(updated_rows,rows_updated),rows_rejected=GREATEST(rows_rejected,error_rows),error_rows=GREATEST(error_rows,rows_rejected)`);

  await q(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_v4 ON users(username) WHERE deleted_at IS NULL`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS flash_reports_report_code_unique_v4 ON flash_reports(report_code) WHERE report_code IS NOT NULL`);
  await q(`INSERT INTO areas(name, code) VALUES('SIN ÁREA ASIGNADA','SIN_AREA') ON CONFLICT(name) DO NOTHING`);

  const units = [
    ['MINA CANDELARIA','MC'], ['PLANTA MAHUARA','PM'], ['DESARROLLOS MINEROS','DMIN'],
    ['OBRA CIVIL OPTIMUS','OC'], ['DIAMANTINA','DIA'], ['CONGEMIN','CONG']
  ];
  for (const [name, code] of units) {
    await pool.query(`INSERT INTO business_units(name,code) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET code=COALESCE(business_units.code,EXCLUDED.code)`, [name, code]);
  }

  // Catálogo institucional de causas y subcausas RACS.
  for (let categoryIndex=0; categoryIndex<RAC_CAUSE_CATALOG.length; categoryIndex++) {
    const category=RAC_CAUSE_CATALOG[categoryIndex];
    const categoryRow=(await pool.query(`INSERT INTO rac_cause_categories(code,name,report_type,sort_order,active)
      VALUES($1,$2,$3,$4,TRUE)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,report_type=EXCLUDED.report_type,sort_order=EXCLUDED.sort_order,active=TRUE,updated_at=NOW()
      RETURNING id`,[category.code,category.name,category.reportType,categoryIndex+1])).rows[0];
    for (let subtypeIndex=0; subtypeIndex<category.subtypes.length; subtypeIndex++) {
      const subtype=category.subtypes[subtypeIndex];
      await pool.query(`INSERT INTO rac_cause_subtypes(category_id,name,normalized_name,is_custom,sort_order,active)
        VALUES($1,$2,$3,FALSE,$4,TRUE)
        ON CONFLICT(category_id,normalized_name) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,active=TRUE,updated_at=NOW()`,
        [categoryRow.id,subtype,normalizeCauseText(subtype),subtypeIndex+1]);
    }
  }

  // Vincula RACS históricos con el catálogo sin borrar ni alterar textos no reconocidos.
  await q(`UPDATE racs r SET cause_subtype_id=s.id,cause_category_id=c.id,cause_subtype=s.name,cause_category=c.name
    FROM rac_cause_subtypes s JOIN rac_cause_categories c ON c.id=s.category_id
    WHERE r.cause_subtype_id IS NULL
      AND regexp_replace(translate(upper(COALESCE(r.cause_subtype,r.deviation_type,'')),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+','','g')
        = regexp_replace(s.normalized_name,'[^A-Z0-9]+','','g')`);
  await q(`UPDATE racs r SET cause_category_id=c.id,cause_category=c.name
    FROM rac_cause_categories c
    WHERE r.cause_category_id IS NULL
      AND regexp_replace(translate(upper(COALESCE(r.cause_category,'')),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+','','g')
        = regexp_replace(translate(upper(c.name),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+','','g')`);
  await q(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='racs_cause_category_fk') THEN
      ALTER TABLE racs ADD CONSTRAINT racs_cause_category_fk FOREIGN KEY(cause_category_id) REFERENCES rac_cause_categories(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='racs_cause_subtype_fk') THEN
      ALTER TABLE racs ADD CONSTRAINT racs_cause_subtype_fk FOREIGN KEY(cause_subtype_id) REFERENCES rac_cause_subtypes(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='racs_directed_area_fk') THEN
      ALTER TABLE racs ADD CONSTRAINT racs_directed_area_fk FOREIGN KEY(directed_area_id) REFERENCES areas(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='racs_directed_by_fk') THEN
      ALTER TABLE racs ADD CONSTRAINT racs_directed_by_fk FOREIGN KEY(directed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$`);

  await q(`
    DO $$
    DECLARE c RECORD;
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='racs' AND column_name='import_batch_id') THEN
        UPDATE racs r SET import_batch_id=NULL
        WHERE import_batch_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM rac_import_batches b WHERE b.id=r.import_batch_id);
        FOR c IN SELECT conname FROM pg_constraint
          WHERE conrelid='racs'::regclass AND contype='f'
          AND pg_get_constraintdef(oid) ILIKE '%import_batch_id%'
        LOOP EXECUTE format('ALTER TABLE racs DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
        ALTER TABLE racs ADD CONSTRAINT racs_import_batch_fk
          FOREIGN KEY(import_batch_id) REFERENCES rac_import_batches(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Conecta catálogos históricos con el modelo relacional nuevo.
  await q(`INSERT INTO business_unit_areas(business_unit_id,area_id)
    SELECT DISTINCT business_unit_id,area_id FROM workers
    WHERE business_unit_id IS NOT NULL AND area_id IS NOT NULL ON CONFLICT DO NOTHING`);
  try {
    await q(`INSERT INTO training_targets(training_id,business_unit_id,area_id)
      SELECT DISTINCT ta.training_id,bua.business_unit_id,ta.area_id
      FROM training_areas ta JOIN business_unit_areas bua ON bua.area_id=ta.area_id
      ON CONFLICT DO NOTHING`);
  } catch (error) { if (error.code !== '42P01') throw error; }
  await q(`
    UPDATE racs SET status=CASE
      WHEN UPPER(COALESCE(status,'')) IN ('LEVANTADO','CERRADO','COMPLETADO') THEN 'LEVANTADO'
      WHEN UPPER(COALESCE(status,'')) IN ('EN PROCESO','PROCESO') THEN 'EN PROCESO'
      WHEN UPPER(COALESCE(status,'')) IN ('PENDIENTE DE VALIDACION','POR VALIDAR') THEN 'PENDIENTE DE VALIDACION'
      WHEN UPPER(COALESCE(status,'')) IN ('DEVUELTO PARA CORRECCION','DEVUELTO') THEN 'DEVUELTO PARA CORRECCION'
      ELSE 'PENDIENTE' END;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='racs_status_check') THEN
        ALTER TABLE racs DROP CONSTRAINT racs_status_check;
      END IF;
      ALTER TABLE racs ADD CONSTRAINT racs_status_check CHECK(status IN ('PENDIENTE','EN PROCESO','PENDIENTE DE VALIDACION','DEVUELTO PARA CORRECCION','LEVANTADO'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Compatibilidad con las columnas obligatorias de versiones anteriores de Flash Report.
  for (const sql of [
    `ALTER TABLE flash_reports ALTER COLUMN severity_category DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN severity_value DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN probability_category DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN probability_value DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN risk_score DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN risk_classification DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN group_name DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN area DROP NOT NULL`,
    `ALTER TABLE flash_reports ALTER COLUMN business_unit DROP NOT NULL`,
    `ALTER TABLE flash_report_images ALTER COLUMN image_data DROP NOT NULL`,
  ]) { try { await q(sql); } catch (error) { if (error.code !== '42703') throw error; } }

  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.2') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.28') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.30') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.31') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.33') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.35') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.37') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.38') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.39') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.3') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.4') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.6') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.7') ON CONFLICT DO NOTHING`);
  await q(`ALTER TABLE trainings ALTER COLUMN approved_min SET DEFAULT 16`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.8') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.9') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.10') ON CONFLICT DO NOTHING`);
  // Repara el alcance histórico de Supervisores y SSOMA. Las unidades vinculadas
  // siguen siendo visibles aunque la unidad esté inactiva, para conservar la data histórica.
  await q(`
    INSERT INTO user_business_units(user_id,business_unit_id)
    SELECT DISTINCT inferred.user_id,inferred.business_unit_id FROM (
      SELECT supervisor_user_id user_id,business_unit_id FROM racs
        WHERE supervisor_user_id IS NOT NULL AND business_unit_id IS NOT NULL
      UNION
      SELECT ra.supervisor_user_id,r.business_unit_id FROM rac_assignments ra JOIN racs r ON r.id=ra.rac_id
        WHERE r.business_unit_id IS NOT NULL
      UNION
      SELECT created_by,business_unit_id FROM racs
        WHERE created_by IS NOT NULL AND business_unit_id IS NOT NULL
      UNION
      SELECT created_by,business_unit_id FROM flash_reports
        WHERE created_by IS NOT NULL AND business_unit_id IS NOT NULL
      UNION
      SELECT ssoma_user_id,business_unit_id FROM ssoma_work_plans
        WHERE ssoma_user_id IS NOT NULL AND business_unit_id IS NOT NULL
      UNION
      SELECT ssoma_user_id,business_unit_id FROM ssoma_evidence
        WHERE ssoma_user_id IS NOT NULL AND business_unit_id IS NOT NULL
      UNION
      SELECT g.entered_by,w.business_unit_id FROM grades g JOIN workers w ON w.id=g.worker_id
        WHERE g.entered_by IS NOT NULL AND w.business_unit_id IS NOT NULL
    ) inferred
    JOIN users u ON u.id=inferred.user_id AND u.role IN ('SUPERVISOR','SSOMA')
    ON CONFLICT DO NOTHING
  `);
  await q(`
    INSERT INTO user_business_units(user_id,business_unit_id)
    SELECT DISTINCT u.id,r.business_unit_id
    FROM users u JOIN racs r ON r.business_unit_id IS NOT NULL AND r.supervisor_name_text IS NOT NULL
    WHERE u.role IN ('SUPERVISOR','SSOMA') AND u.deleted_at IS NULL
      AND regexp_replace(translate(upper(u.name),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+','','g')
        = regexp_replace(translate(upper(r.supervisor_name_text),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+','','g')
    ON CONFLICT DO NOTHING
  `);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.11') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.12') ON CONFLICT DO NOTHING`);
  await q(`ALTER TABLE rac_import_batches ALTER COLUMN detected_period TYPE VARCHAR(20) USING detected_period::text`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.13') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.14') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.15') ON CONFLICT DO NOTHING`);
  // 4.0.20 · Alcance automático de unidades y plazos institucionales RACS.
  // Detecta perfiles que ya cubrían todas las unidades operativas existentes y los
  // marca para recibir automáticamente las unidades creadas en el futuro.
  await q(`
    UPDATE users u SET all_units_access=TRUE
    WHERE u.role IN ('SSOMA','SUPERVISOR')
      AND u.active=TRUE AND u.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM user_business_units own WHERE own.user_id=u.id)>=2
      AND NOT EXISTS (
        SELECT 1 FROM business_units bu
        WHERE bu.active=TRUE
          AND EXISTS(SELECT 1 FROM user_business_units any_link WHERE any_link.business_unit_id=bu.id)
          AND NOT EXISTS(SELECT 1 FROM user_business_units own_link WHERE own_link.user_id=u.id AND own_link.business_unit_id=bu.id)
      )
  `);
  await q(`
    INSERT INTO user_business_units(user_id,business_unit_id)
    SELECT u.id,bu.id FROM users u CROSS JOIN business_units bu
    WHERE u.all_units_access=TRUE AND u.active=TRUE AND u.deleted_at IS NULL AND bu.active=TRUE
    ON CONFLICT DO NOTHING
  `);
  await q(`
    UPDATE racs SET due_date=report_date+CASE UPPER(COALESCE(risk_level,''))
      WHEN 'ALTO' THEN 2
      WHEN 'MEDIO' THEN 3
      ELSE 4 END
    WHERE report_date IS NOT NULL
  `);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.19') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.20') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.26') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO schema_migrations(version) VALUES('4.0.27') ON CONFLICT DO NOTHING`);
  await ensureMaster();
  await applyMasterRecovery();
}

async function ensureMaster() {
  const found = await pool.query(`SELECT id FROM users WHERE role='MASTER' LIMIT 1`);
  if (found.rowCount) return;
  const bootstrapPassword = config.masterInitialPassword || config.masterRecoveryPassword;
  if (!bootstrapPassword) {
    throw new Error('No existe usuario Máster. Configura MASTER_INITIAL_PASSWORD o MASTER_RECOVERY_PASSWORD');
  }
  const hash = await bcrypt.hash(bootstrapPassword, 12);
  await tx(async client => {
    await client.query(`INSERT INTO users(name,email,username,password_hash,role,active,must_change_password)
      VALUES($1,$2,$3,$4,'MASTER',TRUE,TRUE)`, [config.masterName, `${config.masterUsername}@capsan6.local`, config.masterUsername, hash]);
  });
  console.log(`Usuario Máster inicial creado: ${config.masterUsername}`);
}

async function applyMasterRecovery() {
  const password = String(config.masterRecoveryPassword || '');
  if (!password) return;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/.test(password)) {
    throw new Error('MASTER_RECOVERY_PASSWORD debe tener mínimo 10 caracteres, mayúscula, minúscula y número');
  }
  if (password.toLowerCase() === String(config.masterUsername).toLowerCase()) {
    throw new Error('MASTER_RECOVERY_PASSWORD no puede ser igual al usuario Máster');
  }
  await q(`CREATE TABLE IF NOT EXISTS master_recovery_events (
    fingerprint VARCHAR(64) PRIMARY KEY,
    master_user_id INTEGER REFERENCES users(id),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const fingerprint = createHash('sha256')
    .update(`capsan6-master-recovery-v1:${config.masterUsername}:${password}`)
    .digest('hex');
  const used = await pool.query(`SELECT 1 FROM master_recovery_events WHERE fingerprint=$1`, [fingerprint]);
  if (used.rowCount) return;
  await tx(async client => {
    await client.query(`SELECT pg_advisory_xact_lock(64001)`);
    const repeated = await client.query(`SELECT 1 FROM master_recovery_events WHERE fingerprint=$1`, [fingerprint]);
    if (repeated.rowCount) return;
    const target = (await client.query(`SELECT * FROM users WHERE role='MASTER'
      ORDER BY (username=$1) DESC, active DESC, id ASC LIMIT 1`, [config.masterUsername])).rows[0];
    if (!target) throw new Error('No se encontró una cuenta Máster para recuperar');
    const conflict = await client.query(`SELECT id FROM users WHERE username=$1 AND id<>$2 LIMIT 1`, [config.masterUsername, target.id]);
    const username = conflict.rowCount ? target.username : config.masterUsername;
    const hash = await bcrypt.hash(password, 12);
    await client.query(`UPDATE users SET username=$1,password_hash=$2,role='MASTER',active=TRUE,
      deleted_at=NULL,deleted_by=NULL,must_change_password=TRUE WHERE id=$3`, [username, hash, target.id]);
    await client.query(`INSERT INTO master_recovery_events(fingerprint,master_user_id) VALUES($1,$2)`, [fingerprint, target.id]);
  });
  console.log(`Recuperación Máster aplicada una sola vez para: ${config.masterUsername}`);
}
