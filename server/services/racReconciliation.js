import crypto from 'node:crypto';

const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
export const normalizeRacIdentity=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');

export function buildRacFingerprints(record={}){
  const unit=normalizeRacIdentity(record.businessUnitName||record.business_unit||record.unitName||record.unitKey);
  const date=String(record.reportDate||record.report_date||'').slice(0,10);
  const reporter=normalizeRacIdentity(record.reporterName||record.reporter_name);
  const description=normalizeRacIdentity(record.description);
  const location=normalizeRacIdentity(record.location);
  const area=normalizeRacIdentity(record.reportingArea||record.reporting_area);
  return{
    recordFingerprint:hash([unit,date,reporter,description].join('|')),
    contentFingerprint:hash([unit,date,description].join('|')),
    extendedFingerprint:hash([unit,date,reporter,area,location,description].join('|'))
  };
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

async function activeCandidates(client,record,businessUnitId){
  const attempts=[];
  if(record.externalId)attempts.push({sql:`r.source_uid=$2`,params:[businessUnitId,record.externalId]});
  if(record.sourceReportNumber)attempts.push({sql:`r.source_report_number=$2 AND r.report_date=$3::date`,params:[businessUnitId,record.sourceReportNumber,record.reportDate],uniqueOnly:true});
  if(record.recordFingerprint)attempts.push({sql:`r.record_fingerprint=$2`,params:[businessUnitId,record.recordFingerprint]});
  if(record.contentFingerprint)attempts.push({sql:`r.content_fingerprint=$2`,params:[businessUnitId,record.contentFingerprint],uniqueOnly:true});
  for(const attempt of attempts){
    const rows=(await client.query(`
      SELECT r.*,
        (SELECT COUNT(*)::int FROM rac_evidence e WHERE e.rac_id=r.id) evidence_count,
        (SELECT COUNT(*)::int FROM audit_log al WHERE al.entity_type='RAC' AND al.entity_id=r.id::text AND al.action IN ('ASSIGN_RAC','UPDATE_RAC_STATUS','DIRECT_RAC','EDIT_RAC')) operational_change_count
      FROM racs r
      WHERE r.business_unit_id=$1 AND ${attempt.sql}
      ORDER BY (r.status='LEVANTADO') DESC,r.progress_percent DESC,evidence_count DESC,r.updated_at DESC,r.id DESC
    `,attempt.params)).rows;
    if(rows.length===1||(!attempt.uniqueOnly&&rows.length))return rows[0];
  }
  return null;
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

export async function findReconciliationMemory(client,record,businessUnitId){
  const attempts=[];
  if(record.externalId)attempts.push({sql:`source_uid=$2`,params:[businessUnitId,record.externalId]});
  if(record.sourceReportNumber)attempts.push({sql:`source_report_number=$2 AND report_date=$3::date`,params:[businessUnitId,record.sourceReportNumber,record.reportDate],uniqueOnly:true});
  if(record.recordFingerprint)attempts.push({sql:`record_fingerprint=$2`,params:[businessUnitId,record.recordFingerprint]});
  if(record.contentFingerprint)attempts.push({sql:`content_fingerprint=$2`,params:[businessUnitId,record.contentFingerprint],uniqueOnly:true});
  for(const attempt of attempts){
    const rows=(await client.query(`SELECT * FROM rac_reconciliation_memory WHERE restored_at IS NULL AND business_unit_id=$1 AND ${attempt.sql} ORDER BY created_at DESC,id DESC`,attempt.params)).rows;
    if(rows.length===1||(!attempt.uniqueOnly&&rows.length))return rows;
  }
  return[];
}

export async function rememberRacsBeforePurge(client,selected,purgeReference){
  let remembered=0;
  for(const rac of selected){
    const fingerprints=buildRacFingerprints({
      businessUnitName:rac.business_unit,
      reportDate:rac.report_date,
      reporterName:rac.reporter_name,
      reportingArea:rac.reporting_area,
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
      rac.record_fingerprint||fingerprints.recordFingerprint,rac.content_fingerprint||fingerprints.contentFingerprint,
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
    await client.query(`INSERT INTO rac_evidence(rac_id,evidence_type,comment,original_name,stored_name,mime_type,size_bytes,drive_file_id,drive_web_link,drive_folder_path,drive_status,uploaded_by,uploaded_at)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      WHERE NOT EXISTS(SELECT 1 FROM rac_evidence WHERE rac_id=$1 AND stored_name=$5 AND evidence_type=$2)`,[
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
