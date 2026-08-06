import crypto from 'node:crypto';

const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
export const normalizeRacIdentity=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export const shouldMatchBySourceReportNumber=record=>Boolean(record?.sourceReportNumber)&&record?.sourceNumberUnique!==false;
const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const dateOnly=value=>String(value||'').slice(0,10);

function identityParts(record={}){
  return{
    unit:normalizeRacIdentity(record.businessUnitName||record.business_unit_name||record.business_unit||record.unitName||record.unitKey),
    source:normalizeRacIdentity(record.sourceReportNumber||record.source_report_number),
    date:dateOnly(record.reportDate||record.report_date),
    reporter:normalizeRacIdentity(record.reporterName||record.reporter_name),
    reportingArea:normalizeRacIdentity(record.reportingArea||record.reporting_area_name||record.reporting_area),
    reportedArea:normalizeRacIdentity(record.reportedArea||record.reported_area_name||record.reported_area),
    location:normalizeRacIdentity(record.location),
    description:normalizeRacIdentity(record.description)
  };
}

export function buildRacFingerprints(record={}){
  const p=identityParts(record);
  const content=[p.unit,p.date,p.reporter,p.reportingArea,p.reportedArea,p.location,p.description].join('|');
  const strict=[p.unit,p.date,p.source,p.reporter,p.reportingArea,p.reportedArea,p.location,p.description].join('|');
  return{
    recordFingerprint:hash(strict),
    contentFingerprint:hash(content),
    extendedFingerprint:hash(content),
    legacyRecordFingerprint:hash([p.unit,p.date,p.reporter,p.description].join('|')),
    legacyContentFingerprint:hash([p.unit,p.date,p.description].join('|'))
  };
}

export function sameRacContentIdentity(left={},right={}){
  const a=identityParts(left),b=identityParts(right);
  return Boolean(a.date&&a.reporter&&a.location&&a.description&&
    a.date===b.date&&a.reporter===b.reporter&&a.location===b.location&&a.description===b.description&&
    (!a.unit||!b.unit||a.unit===b.unit)&&
    (!a.reportingArea||a.reportingArea===b.reportingArea)&&
    (!a.reportedArea||a.reportedArea===b.reportedArea));
}

// Identidad estable usada únicamente cuando el código interno generado ya existe.
// Permite reconocer el mismo RAC aunque posteriormente se haya corregido el lugar o el área,
// pero nunca mezcla reportantes, fechas, números de origen o descripciones diferentes.
export function sameRacCodeIdentity(left={},right={}){
  const a=identityParts(left),b=identityParts(right);
  return Boolean(a.date&&a.source&&a.reporter&&a.description&&
    a.date===b.date&&a.source===b.source&&a.reporter===b.reporter&&a.description===b.description&&
    (!a.unit||!b.unit||a.unit===b.unit));
}

const REPORT_CODE_MAX_LENGTH=80;
const collisionCode=(base,attempt)=>{
  const suffix=`-${String(attempt).padStart(2,'0')}`;
  return `${base.slice(0,Math.max(1,REPORT_CODE_MAX_LENGTH-suffix.length))}${suffix}`;
};

export async function allocateUniqueRacReportCode(client,preferredCode){
  const base=clean(preferredCode).toUpperCase().slice(0,REPORT_CODE_MAX_LENGTH);
  if(!base)throw Object.assign(new Error('No se pudo generar el código interno del RAC'),{status:500});
  // Evita que dos importaciones concurrentes reserven el mismo código base.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`,[base]);
  for(let attempt=1;attempt<=9999;attempt++){
    const candidate=attempt===1?base:collisionCode(base,attempt);
    const exists=await client.query(`SELECT 1 FROM racs WHERE report_code=$1 LIMIT 1`,[candidate]);
    if(!exists.rowCount)return candidate;
  }
  throw Object.assign(new Error(`No se pudo reservar un código único para ${base}`),{status:500});
}

const statusWeight=status=>({
  'LEVANTADO':500,
  'PENDIENTE DE VALIDACION':400,
  'DEVUELTO PARA CORRECCION':350,
  'EN PROCESO':250,
  'PENDIENTE':100
}[String(status||'').toUpperCase()]||0);

const snapshotValue=row=>row?.rac_snapshot&&typeof row.rac_snapshot==='object'?row.rac_snapshot:row;
const evidenceRows=row=>Array.isArray(row?.evidence_snapshot)?row.evidence_snapshot:[];

export function chooseBestReconciliationSnapshot(rows=[]){
  return [...rows].sort((a,b)=>{
    const ar=snapshotValue(a),br=snapshotValue(b);
    const scoreA=statusWeight(ar.status)*100000+Number(ar.progress_percent||0)*1000+evidenceRows(a).length*10+Number(Boolean(ar.directed_area_id));
    const scoreB=statusWeight(br.status)*100000+Number(br.progress_percent||0)*1000+evidenceRows(b).length*10+Number(Boolean(br.directed_area_id));
    if(scoreA!==scoreB)return scoreB-scoreA;
    return new Date(br.updated_at||br.created_at||0)-new Date(ar.updated_at||ar.created_at||0);
  })[0]||null;
}

function rankActiveCandidate(row){
  return statusWeight(row.status)*100000+Number(row.progress_percent||0)*1000+Number(row.evidence_count||0)*10+Number(row.operational_change_count||0);
}

function chooseActive(rows=[]){
  return [...rows].sort((a,b)=>rankActiveCandidate(b)-rankActiveCandidate(a)||Number(b.id)-Number(a.id))[0]||null;
}

async function queryActive(client,businessUnitId,clause,params=[]){
  return (await client.query(`
    SELECT r.*,bu.name business_unit_name,ar.name reporting_area_name,ad.name reported_area_name,
      (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count,
      (SELECT COUNT(*)::int FROM audit_log al WHERE al.entity_type='RAC' AND al.entity_id=r.id::text AND al.action IN ('ASSIGN_RAC','UPDATE_RAC_STATUS','DIRECT_RAC','EDIT_RAC')) operational_change_count
    FROM racs r
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    WHERE r.business_unit_id=$1 AND ${clause}
    ORDER BY (r.status='LEVANTADO') DESC,r.progress_percent DESC,evidence_count DESC,r.updated_at DESC,r.id DESC
  `,[businessUnitId,...params])).rows;
}

async function activeCandidates(client,record,businessUnitId){
  if(record.externalId){
    const rows=await queryActive(client,businessUnitId,'r.source_uid=$2',[record.externalId]);
    if(rows.length)return chooseActive(rows);
  }

  // Si el código determinista ya existe, se reutiliza únicamente cuando sus datos estables
  // corresponden al mismo RAC. Una colisión real continuará al generador de código alternativo.
  if(record.internalCode){
    const rows=await queryActive(client,businessUnitId,'r.report_code=$2',[record.internalCode]);
    const exact=rows.filter(row=>sameRacCodeIdentity(record,row)||sameRacContentIdentity(record,row));
    if(exact.length)return chooseActive(exact);
  }

  if(shouldMatchBySourceReportNumber(record)){
    const rows=await queryActive(client,businessUnitId,'r.source_report_number=$2 AND r.report_date=$3::date',[record.sourceReportNumber,record.reportDate]);
    if(rows.length===1)return rows[0];
    const exact=rows.filter(row=>sameRacContentIdentity(record,row));
    if(exact.length)return chooseActive(exact);
  }

  if(record.recordFingerprint){
    const rows=await queryActive(client,businessUnitId,'r.record_fingerprint=$2',[record.recordFingerprint]);
    if(rows.length)return chooseActive(rows);
  }

  if(record.contentFingerprint){
    const rows=await queryActive(client,businessUnitId,'r.content_fingerprint=$2',[record.contentFingerprint]);
    const exact=rows.filter(row=>sameRacContentIdentity(record,row));
    if(exact.length)return chooseActive(exact);
  }

  // Compatibilidad con importaciones anteriores: busca por la identidad real del hallazgo,
  // nunca solo por descripción. Esto permite corregir números de origen dañados sin fusionar
  // reportantes o lugares diferentes.
  const sameDate=await queryActive(client,businessUnitId,'r.report_date=$2::date',[record.reportDate]);
  const exact=sameDate.filter(row=>sameRacContentIdentity(record,row));
  return exact.length?chooseActive(exact):null;
}

export async function findActiveRacMatch(client,record,businessUnitId){
  const row=await activeCandidates(client,record,businessUnitId);
  if(!row)return null;
  row.has_operational_activity=Boolean(
    Number(row.evidence_count||0)>0||Number(row.operational_change_count||0)>0||
    row.status!=='PENDIENTE'||Number(row.progress_percent||0)>0||row.directed_area_id||row.first_attention_at||row.validation_requested_at||row.closed_at
  );
  return row;
}

function memorySnapshot(row){
  const snapshot=snapshotValue(row);
  return{
    ...snapshot,
    business_unit_name:snapshot.business_unit||snapshot.business_unit_name,
    reporting_area_name:snapshot.reporting_area||snapshot.reporting_area_name,
    reported_area_name:snapshot.reported_area||snapshot.reported_area_name,
    source_report_number:row.source_report_number||snapshot.source_report_number,
    report_date:row.report_date||snapshot.report_date
  };
}

export async function findReconciliationMemory(client,record,businessUnitId){
  const base=`SELECT * FROM rac_reconciliation_memory WHERE restored_at IS NULL AND business_unit_id=$1`;
  if(record.externalId){
    const rows=(await client.query(`${base} AND source_uid=$2 ORDER BY created_at DESC,id DESC`,[businessUnitId,record.externalId])).rows;
    if(rows.length)return rows;
  }
  if(shouldMatchBySourceReportNumber(record)){
    const rows=(await client.query(`${base} AND source_report_number=$2 AND report_date=$3::date ORDER BY created_at DESC,id DESC`,[businessUnitId,record.sourceReportNumber,record.reportDate])).rows;
    if(rows.length===1)return rows;
    const exact=rows.filter(row=>sameRacContentIdentity(record,memorySnapshot(row)));
    if(exact.length)return exact;
  }
  if(record.recordFingerprint){
    const rows=(await client.query(`${base} AND record_fingerprint=$2 ORDER BY created_at DESC,id DESC`,[businessUnitId,record.recordFingerprint])).rows;
    if(rows.length)return rows;
  }
  if(record.contentFingerprint){
    const rows=(await client.query(`${base} AND content_fingerprint=$2 ORDER BY created_at DESC,id DESC`,[businessUnitId,record.contentFingerprint])).rows;
    const exact=rows.filter(row=>sameRacContentIdentity(record,memorySnapshot(row)));
    if(exact.length)return exact;
  }
  const sameDate=(await client.query(`${base} AND report_date=$2::date ORDER BY created_at DESC,id DESC`,[businessUnitId,record.reportDate])).rows;
  return sameDate.filter(row=>sameRacContentIdentity(record,memorySnapshot(row)));
}

export async function rememberRacsBeforePurge(client,selected,purgeReference){
  let remembered=0;
  for(const rac of selected){
    const fingerprints=buildRacFingerprints({
      businessUnitName:rac.business_unit,
      sourceReportNumber:rac.source_report_number,
      reportDate:rac.report_date,
      reporterName:rac.reporter_name,
      reportingArea:rac.reporting_area,
      reportedArea:rac.reported_area,
      location:rac.location,
      description:rac.description
    });
    const evidence=(await client.query(`SELECT * FROM rac_evidence WHERE rac_id=$1 ORDER BY id`,[rac.id])).rows;
    const assignments=(await client.query(`SELECT * FROM rac_assignments WHERE rac_id=$1 ORDER BY id`,[rac.id])).rows;
    await client.query(`INSERT INTO rac_reconciliation_memory(
      purge_reference,old_rac_id,business_unit_id,source_uid,source_report_number,report_date,
      record_fingerprint,content_fingerprint,rac_snapshot,evidence_snapshot,assignments_snapshot
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,[
      purgeReference,rac.id,rac.business_unit_id,rac.source_uid||null,rac.source_report_number||null,rac.report_date,
      fingerprints.recordFingerprint,fingerprints.contentFingerprint,
      JSON.stringify(rac),JSON.stringify(evidence),JSON.stringify(assignments)
    ]);
    remembered++;
  }
  return remembered;
}

const safeJson=value=>value&&typeof value==='object'?value:{};

export async function restoreReconciliationMemory(client,racId,memoryRows,actorId){
  if(!memoryRows.length)return{restored:false,evidence:0,oldIds:[]};
  const bestRow=chooseBestReconciliationSnapshot(memoryRows);
  const best=safeJson(bestRow.rac_snapshot);
  const oldIds=[...new Set(memoryRows.map(row=>Number(row.old_rac_id)).filter(Boolean))];
  await client.query(`UPDATE racs SET
    status=$1,progress_percent=$2,first_attention_at=$3,validation_requested_at=$4,validated_at=$5,validated_by=$6,
    closed_at=$7,lifted_at=$8,close_comment=$9,validation_comment=$10,evidence_required=$11,
    evidence_exemption_reason=$12,evidence_exempted_at=$13,evidence_exempted_by=$14,
    directed_area_id=$15,direction_reason=$16,directed_by=$17,directed_at=$18,
    supervisor_user_id=COALESCE($19,supervisor_user_id),supervisor_name_text=COALESCE($20,supervisor_name_text),
    updated_at=NOW()
    WHERE id=$21`,[
    best.status||'PENDIENTE',Number(best.progress_percent||0),best.first_attention_at||null,best.validation_requested_at||null,best.validated_at||null,best.validated_by||null,
    best.closed_at||null,best.lifted_at||null,best.close_comment||null,best.validation_comment||null,best.evidence_required!==false,
    best.evidence_exemption_reason||null,best.evidence_exempted_at||null,best.evidence_exempted_by||null,
    best.directed_area_id||null,best.direction_reason||null,best.directed_by||null,best.directed_at||null,
    best.supervisor_user_id||null,best.supervisor_name_text||null,racId
  ]);

  const evidenceMap=new Map();
  for(const row of memoryRows)for(const evidence of evidenceRows(row)){
    const key=[evidence.stored_name,evidence.evidence_type,evidence.uploaded_at].join('|');
    if(!evidenceMap.has(key))evidenceMap.set(key,evidence);
  }
  for(const e of evidenceMap.values()){
    await client.query(`WITH incoming AS (
        SELECT
          $1::integer AS rac_id,
          $2::varchar(30) AS evidence_type,
          $3::text AS comment,
          $4::text AS original_name,
          $5::text AS stored_name,
          $6::text AS mime_type,
          $7::bigint AS size_bytes,
          $8::text AS drive_file_id,
          $9::text AS drive_web_link,
          $10::text AS drive_folder_path,
          $11::varchar(30) AS drive_status,
          $12::integer AS uploaded_by,
          $13::timestamptz AS uploaded_at
      )
      INSERT INTO rac_evidence(rac_id,evidence_type,comment,original_name,stored_name,mime_type,size_bytes,drive_file_id,drive_web_link,drive_folder_path,drive_status,uploaded_by,uploaded_at)
      SELECT i.rac_id,i.evidence_type,i.comment,i.original_name,i.stored_name,i.mime_type,i.size_bytes,i.drive_file_id,i.drive_web_link,i.drive_folder_path,i.drive_status,i.uploaded_by,i.uploaded_at
      FROM incoming i
      WHERE NOT EXISTS(
        SELECT 1
        FROM rac_evidence existing
        WHERE existing.rac_id=i.rac_id
          AND existing.stored_name=i.stored_name
          AND existing.evidence_type::text=i.evidence_type::text
      )`,[
      racId,e.evidence_type||'SEGUIMIENTO',e.comment||null,e.original_name,e.stored_name,e.mime_type||null,e.size_bytes||null,e.drive_file_id||null,e.drive_web_link||null,e.drive_folder_path||null,e.drive_status||'LOCAL',e.uploaded_by||null,e.uploaded_at||new Date()
    ]);
  }

  const assignmentUsers=new Set();
  for(const row of memoryRows)for(const assignment of (Array.isArray(row.assignments_snapshot)?row.assignments_snapshot:[]))if(assignment.active!==false&&assignment.supervisor_user_id)assignmentUsers.add(Number(assignment.supervisor_user_id));
  for(const userId of assignmentUsers){
    const valid=(await client.query(`SELECT 1 FROM users WHERE id=$1 AND active=TRUE AND deleted_at IS NULL`,[userId])).rowCount>0;
    if(valid)await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active,assigned_at) VALUES($1,$2,$3,TRUE,NOW()) ON CONFLICT DO NOTHING`,[racId,userId,actorId]);
  }

  if(oldIds.length){
    await client.query(`UPDATE audit_log SET entity_id=$1::text,details=COALESCE(details,'{}'::jsonb)||jsonb_build_object('reconciled_from_rac_id',entity_id) WHERE entity_type='RAC' AND entity_id=ANY($2::text[])`,[String(racId),oldIds.map(String)]);
    await client.query(`UPDATE file_assets SET entity_id=$1::text WHERE entity_type='RAC' AND entity_id=ANY($2::text[])`,[String(racId),oldIds.map(String)]);
  }
  await client.query(`UPDATE rac_reconciliation_memory SET restored_at=NOW(),restored_rac_id=$1 WHERE id=ANY($2::bigint[])`,[racId,memoryRows.map(row=>Number(row.id))]);
  await client.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$1,'RECONCILE_RAC','RAC',$2,$3::jsonb)`,[actorId,String(racId),JSON.stringify({oldRacIds:oldIds,evidenceRestored:evidenceMap.size,duplicatesMerged:Math.max(0,oldIds.length-1)})]);
  return{restored:true,evidence:evidenceMap.size,oldIds,duplicatesMerged:Math.max(0,oldIds.length-1)};
}
