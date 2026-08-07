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


function sameNormalizedValue(a,b){
  return Boolean(a&&b&&a===b);
}

function evidenceMatchDetails(memoryRow,activeRow){
  const memory=memorySnapshot(memoryRow);
  const a=identityParts(memory),b=identityParts(activeRow);
  if(a.unit&&b.unit&&a.unit!==b.unit)return{score:0,method:null};
  if(a.date&&b.date&&a.date!==b.date)return{score:0,method:null};

  const sourceUid=normalizeRacIdentity(memoryRow.source_uid||memory.source_uid);
  const activeSourceUid=normalizeRacIdentity(activeRow.source_uid);
  if(sourceUid&&activeSourceUid&&sourceUid===activeSourceUid)return{score:1200,method:'ID_UNICO_ORIGEN'};
  if(memoryRow.record_fingerprint&&activeRow.record_fingerprint&&memoryRow.record_fingerprint===activeRow.record_fingerprint)return{score:1150,method:'HUELLA_ESTRICTA'};
  if(memoryRow.content_fingerprint&&activeRow.content_fingerprint&&memoryRow.content_fingerprint===activeRow.content_fingerprint&&sameRacContentIdentity(memory,activeRow))return{score:1100,method:'HUELLA_CONTENIDO'};

  const description=sameNormalizedValue(a.description,b.description);
  if(!description)return{score:0,method:null};
  let score=350;
  if(a.date&&b.date&&a.date===b.date)score+=140;
  if(sameNormalizedValue(a.source,b.source))score+=220;
  if(sameNormalizedValue(a.reporter,b.reporter))score+=210;
  if(sameNormalizedValue(a.location,b.location))score+=190;
  if(sameNormalizedValue(a.reportingArea,b.reportingArea))score+=45;
  if(sameNormalizedValue(a.reportedArea,b.reportedArea))score+=45;
  const method=score>=900?'NUMERO_FECHA_TEXTO':score>=820?'TEXTO_REPORTANTE_LUGAR':score>=700?'TEXTO_Y_DATOS':'DESCRIPCION_UNICA';
  return{score,method};
}

export function selectHistoricalEvidenceTarget(memoryRow,activeRows=[]){
  const ranked=activeRows.map(row=>({row,...evidenceMatchDetails(memoryRow,row)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||Number(b.row.id)-Number(a.row.id));
  if(!ranked.length)return{target:null,method:null,confidence:'UNMATCHED',score:0};
  const top=ranked[0],second=ranked[1];
  const memory=memorySnapshot(memoryRow),parts=identityParts(memory);
  const sameDescription=ranked.filter(item=>identityParts(item.row).description===parts.description);
  const uniqueDescription=sameDescription.length===1;
  const tied=second&&second.score===top.score;
  const strong=top.score>=700;
  const safeUniqueText=top.score>=490&&uniqueDescription&&parts.description.length>=18;
  if(tied||(!strong&&!safeUniqueText))return{target:null,method:null,confidence:'AMBIGUOUS',score:top.score,candidates:ranked.slice(0,5).map(item=>item.row.report_code)};
  return{target:top.row,method:top.method,confidence:top.score>=900?'HIGH':top.score>=700?'MEDIUM':'UNIQUE_TEXT',score:top.score};
}

function evidenceIdentityKey(evidence={}){
  return [clean(evidence.stored_name),clean(evidence.evidence_type||'SEGUIMIENTO'),String(evidence.uploaded_at||'').slice(0,19)].join('|');
}

async function insertOrMoveHistoricalEvidence(client,{target,memoryRow,evidence,actorId,dryRun}){
  const storedName=clean(evidence.stored_name);
  if(!storedName)return{status:'SKIPPED'};
  const existing=(await client.query(`
    SELECT e.id,e.rac_id,r.report_code,r.business_unit_id,r.source_uid,r.source_report_number,r.report_date,r.reporter_name,r.location,r.description,
      bu.name business_unit_name,ar.name reporting_area_name,ad.name reported_area_name
    FROM rac_evidence e
    JOIN racs r ON r.id=e.rac_id
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    WHERE e.stored_name=$1
    ORDER BY e.id DESC
  `,[storedName])).rows;
  if(existing.some(row=>Number(row.rac_id)===Number(target.id)))return{status:'ALREADY_PRESENT'};

  if(existing.length){
    const current=existing[0];
    const currentScore=evidenceMatchDetails(memoryRow,current).score;
    const targetScore=evidenceMatchDetails(memoryRow,target).score;
    if(targetScore<=currentScore)return{status:'CONFLICT',currentRacId:Number(current.rac_id),currentCode:current.report_code};
    if(!dryRun){
      await client.query(`UPDATE rac_evidence SET rac_id=$1 WHERE id=$2`,[Number(target.id),Number(current.id)]);
      await client.query(`UPDATE file_assets SET entity_id=$1::text,business_unit_id=COALESCE(business_unit_id,$2) WHERE entity_type='RAC' AND stored_name=$3`,[Number(target.id),Number(target.business_unit_id),storedName]);
    }
    return{status:'MOVED',fromRacId:Number(current.rac_id),fromCode:current.report_code};
  }

  if(!dryRun){
    await client.query(`WITH incoming AS (
      SELECT $1::integer rac_id,$2::varchar(30) evidence_type,$3::text comment,$4::text original_name,$5::text stored_name,
        $6::text mime_type,$7::bigint size_bytes,$8::text drive_file_id,$9::text drive_web_link,$10::text drive_folder_path,
        $11::varchar(30) drive_status,$12::integer uploaded_by,$13::timestamptz uploaded_at
    )
    INSERT INTO rac_evidence(rac_id,evidence_type,comment,original_name,stored_name,mime_type,size_bytes,drive_file_id,drive_web_link,drive_folder_path,drive_status,uploaded_by,uploaded_at)
    SELECT i.rac_id,i.evidence_type,i.comment,i.original_name,i.stored_name,i.mime_type,i.size_bytes,i.drive_file_id,i.drive_web_link,i.drive_folder_path,i.drive_status,
      CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=i.uploaded_by) THEN i.uploaded_by ELSE NULL END,i.uploaded_at
    FROM incoming i
    WHERE NOT EXISTS(SELECT 1 FROM rac_evidence x WHERE x.rac_id=i.rac_id AND x.stored_name=i.stored_name AND x.evidence_type::text=i.evidence_type::text)`,[
      Number(target.id),evidence.evidence_type||'SEGUIMIENTO',evidence.comment||null,evidence.original_name||storedName,storedName,evidence.mime_type||null,evidence.size_bytes||null,
      evidence.drive_file_id||null,evidence.drive_web_link||null,evidence.drive_folder_path||null,evidence.drive_status||'LOCAL',evidence.uploaded_by||actorId||null,evidence.uploaded_at||new Date()
    ]);
    const oldId=Number(memoryRow.old_rac_id);
    if(oldId)await client.query(`UPDATE file_assets SET entity_id=$1::text,business_unit_id=COALESCE(business_unit_id,$2) WHERE entity_type='RAC' AND entity_id=$3::text AND stored_name=$4`,[Number(target.id),Number(target.business_unit_id),oldId,storedName]);
  }
  return{status:'INSERTED'};
}

export async function recoverHistoricalEvidence(client,{businessUnitIds=null,from=null,to=null,actorId=null,dryRun=true}={}){
  const empty={memoryRecords:0,matchedRecords:0,recoverableEvidence:0,inserted:0,moved:0,alreadyPresent:0,ambiguous:0,unmatched:0,conflicts:0,samples:[]};
  if(Array.isArray(businessUnitIds)&&businessUnitIds.length===0)return empty;
  const params=[];
  const memoryClauses=[`jsonb_array_length(COALESCE(evidence_snapshot,'[]'::jsonb))>0`];
  if(Array.isArray(businessUnitIds)&&businessUnitIds.length){params.push(businessUnitIds.map(Number));memoryClauses.push(`business_unit_id=ANY($${params.length}::int[])`);}
  if(from){params.push(from);memoryClauses.push(`report_date>=$${params.length}::date`);}
  if(to){params.push(to);memoryClauses.push(`report_date<=$${params.length}::date`);}
  const memoryRows=(await client.query(`SELECT * FROM rac_reconciliation_memory WHERE ${memoryClauses.join(' AND ')} ORDER BY report_date,id`,params)).rows;
  if(!memoryRows.length)return empty;

  const unitIds=[...new Set(memoryRows.map(row=>Number(row.business_unit_id)).filter(Boolean))];
  const active=(await client.query(`
    SELECT r.*,bu.name business_unit_name,ar.name reporting_area_name,ad.name reported_area_name
    FROM racs r
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    WHERE r.business_unit_id=ANY($1::int[])
    ORDER BY r.business_unit_id,r.report_date,r.id
  `,[unitIds])).rows;
  const byUnit=new Map();
  for(const row of active){const id=Number(row.business_unit_id);if(!byUnit.has(id))byUnit.set(id,[]);byUnit.get(id).push(row);}

  const result={memoryRecords:memoryRows.length,matchedRecords:0,recoverableEvidence:0,inserted:0,moved:0,alreadyPresent:0,ambiguous:0,unmatched:0,conflicts:0,samples:[]};
  for(const memoryRow of memoryRows){
    const selection=selectHistoricalEvidenceTarget(memoryRow,byUnit.get(Number(memoryRow.business_unit_id))||[]);
    if(!selection.target){
      if(selection.confidence==='AMBIGUOUS')result.ambiguous++;else result.unmatched++;
      if(result.samples.length<20)result.samples.push({oldRacId:memoryRow.old_rac_id,sourceReportNumber:memoryRow.source_report_number,status:selection.confidence,candidates:selection.candidates||[]});
      continue;
    }
    result.matchedRecords++;
    const uniqueEvidence=new Map();
    for(const evidence of evidenceRows(memoryRow)){const key=evidenceIdentityKey(evidence);if(!uniqueEvidence.has(key))uniqueEvidence.set(key,evidence);}
    result.recoverableEvidence+=uniqueEvidence.size;
    let touched=false;
    for(const evidence of uniqueEvidence.values()){
      const operation=await insertOrMoveHistoricalEvidence(client,{target:selection.target,memoryRow,evidence,actorId,dryRun});
      if(operation.status==='INSERTED'){result.inserted++;touched=true;}
      else if(operation.status==='MOVED'){result.moved++;touched=true;}
      else if(operation.status==='ALREADY_PRESENT')result.alreadyPresent++;
      else if(operation.status==='CONFLICT')result.conflicts++;
    }
    if(!dryRun&&touched){
      await client.query(`UPDATE rac_reconciliation_memory SET evidence_recovered_at=NOW(),evidence_recovered_rac_id=$1,evidence_recovery_method=$2 WHERE id=$3`,[Number(selection.target.id),selection.method,Number(memoryRow.id)]);
    }
    if(result.samples.length<20)result.samples.push({oldRacId:memoryRow.old_rac_id,sourceReportNumber:memoryRow.source_report_number,targetRacId:Number(selection.target.id),targetCode:selection.target.report_code,method:selection.method,confidence:selection.confidence,evidence:uniqueEvidence.size});
  }
  return result;
}



export async function listHistoricalEvidenceRecords(client,{businessUnitIds=null,from=null,to=null,status='ALL',search='',limit=500}={}){
  const empty={summary:{memoryRecords:0,secureMatches:0,evidenceFiles:0,insertable:0,reassignable:0,alreadyPresent:0,ambiguous:0,unmatched:0,conflicts:0,filesAvailable:0,filesMissing:0},total:0,rows:[]};
  if(Array.isArray(businessUnitIds)&&businessUnitIds.length===0)return empty;
  const params=[];
  const clauses=[`jsonb_array_length(COALESCE(m.evidence_snapshot,'[]'::jsonb))>0`];
  if(Array.isArray(businessUnitIds)&&businessUnitIds.length){params.push(businessUnitIds.map(Number));clauses.push(`m.business_unit_id=ANY($${params.length}::int[])`);}
  if(from){params.push(from);clauses.push(`m.report_date>=$${params.length}::date`);}
  if(to){params.push(to);clauses.push(`m.report_date<=$${params.length}::date`);}
  const memoryRows=(await client.query(`
    SELECT m.*,bu.name business_unit_name
    FROM rac_reconciliation_memory m
    LEFT JOIN business_units bu ON bu.id=m.business_unit_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY m.report_date DESC,m.id DESC
  `,params)).rows;
  if(!memoryRows.length)return empty;

  const unitIds=[...new Set(memoryRows.map(row=>Number(row.business_unit_id)).filter(Boolean))];
  const active=(await client.query(`
    SELECT r.*,bu.name business_unit_name,ar.name reporting_area_name,ad.name reported_area_name
    FROM racs r
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    WHERE r.business_unit_id=ANY($1::int[])
    ORDER BY r.business_unit_id,r.report_date,r.id
  `,[unitIds])).rows;
  const byUnit=new Map();
  for(const row of active){const id=Number(row.business_unit_id);if(!byUnit.has(id))byUnit.set(id,[]);byUnit.get(id).push(row);}

  const storedNames=[...new Set(memoryRows.flatMap(row=>evidenceRows(row).map(item=>clean(item.stored_name)).filter(Boolean)))];
  const existingRows=storedNames.length?(await client.query(`
    SELECT e.id,e.rac_id,e.evidence_type,e.comment,e.original_name,e.stored_name,e.mime_type,e.size_bytes,e.drive_web_link,e.uploaded_at,
      r.report_code,r.business_unit_id,r.source_uid,r.source_report_number,r.report_date,r.reporter_name,r.location,r.description,
      bu.name business_unit_name,ar.name reporting_area_name,ad.name reported_area_name
    FROM rac_evidence e
    JOIN racs r ON r.id=e.rac_id
    LEFT JOIN business_units bu ON bu.id=r.business_unit_id
    LEFT JOIN areas ar ON ar.id=r.reporting_area_id
    LEFT JOIN areas ad ON ad.id=r.reported_area_id
    WHERE e.stored_name=ANY($1::text[])
    ORDER BY e.stored_name,e.id DESC
  `,[storedNames])).rows:[];
  const assets=storedNames.length?(await client.query(`
    SELECT DISTINCT ON (stored_name) id,stored_name,original_name,mime_type,size_bytes,drive_web_link,drive_status,business_unit_id,created_at
    FROM file_assets
    WHERE stored_name=ANY($1::text[])
    ORDER BY stored_name,id DESC
  `,[storedNames])).rows:[];
  const existingByStored=new Map();
  for(const row of existingRows){if(!existingByStored.has(row.stored_name))existingByStored.set(row.stored_name,[]);existingByStored.get(row.stored_name).push(row);}
  const assetByStored=new Map(assets.map(row=>[row.stored_name,row]));

  const rows=[];
  const matchedMemoryIds=new Set();
  for(const memoryRow of memoryRows){
    const snapshot=memorySnapshot(memoryRow);
    const selection=selectHistoricalEvidenceTarget(memoryRow,byUnit.get(Number(memoryRow.business_unit_id))||[]);
    if(selection.target)matchedMemoryIds.add(Number(memoryRow.id));
    const uniqueEvidence=new Map();
    for(const evidence of evidenceRows(memoryRow)){const key=evidenceIdentityKey(evidence);if(!uniqueEvidence.has(key))uniqueEvidence.set(key,evidence);}
    for(const evidence of uniqueEvidence.values()){
      const storedName=clean(evidence.stored_name);
      const linked=existingByStored.get(storedName)||[];
      const asset=assetByStored.get(storedName)||null;
      let evidenceStatus='UNMATCHED';
      let current=null;
      if(!selection.target){
        evidenceStatus=selection.confidence==='AMBIGUOUS'?'AMBIGUOUS':'UNMATCHED';
      }else if(linked.some(item=>Number(item.rac_id)===Number(selection.target.id))){
        evidenceStatus='ALREADY_PRESENT';
        current=linked.find(item=>Number(item.rac_id)===Number(selection.target.id));
      }else if(linked.length){
        const ranked=[...linked].map(item=>({item,score:evidenceMatchDetails(memoryRow,item).score})).sort((a,b)=>b.score-a.score||Number(b.item.id)-Number(a.item.id));
        current=ranked[0]?.item||null;
        const targetScore=evidenceMatchDetails(memoryRow,selection.target).score;
        evidenceStatus=targetScore>Number(ranked[0]?.score||0)?'REASSIGNABLE':'CONFLICT';
      }else{
        evidenceStatus='INSERTABLE';
      }
      rows.push({
        memoryId:Number(memoryRow.id),oldRacId:Number(memoryRow.old_rac_id),oldReportCode:snapshot.report_code||null,
        sourceReportNumber:memoryRow.source_report_number||snapshot.source_report_number||null,businessUnitId:Number(memoryRow.business_unit_id),businessUnit:memoryRow.business_unit_name||snapshot.business_unit||snapshot.business_unit_name||'SIN UNIDAD',
        reportDate:dateOnly(memoryRow.report_date||snapshot.report_date),reporterName:snapshot.reporter_name||null,location:snapshot.location||null,
        description:snapshot.description||null,oldStatus:snapshot.status||null,oldProgress:Number(snapshot.progress_percent||0),
        evidenceType:evidence.evidence_type||'SEGUIMIENTO',comment:evidence.comment||null,originalName:evidence.original_name||asset?.original_name||storedName,
        storedName,mimeType:evidence.mime_type||asset?.mime_type||null,sizeBytes:Number(evidence.size_bytes||asset?.size_bytes||0),uploadedAt:evidence.uploaded_at||asset?.created_at||null,
        assetId:asset?Number(asset.id):null,driveWebLink:evidence.drive_web_link||asset?.drive_web_link||null,fileAvailable:Boolean(asset||evidence.drive_web_link),
        status:evidenceStatus,matchMethod:selection.method||null,confidence:selection.confidence||null,score:Number(selection.score||0),
        targetRacId:selection.target?Number(selection.target.id):null,targetCode:selection.target?.report_code||null,targetDescription:selection.target?.description||null,
        currentRacId:current?Number(current.rac_id):null,currentCode:current?.report_code||null,candidates:selection.candidates||[]
      });
    }
  }

  const summary={
    memoryRecords:memoryRows.length,secureMatches:matchedMemoryIds.size,evidenceFiles:rows.length,
    insertable:rows.filter(row=>row.status==='INSERTABLE').length,reassignable:rows.filter(row=>row.status==='REASSIGNABLE').length,
    alreadyPresent:rows.filter(row=>row.status==='ALREADY_PRESENT').length,ambiguous:rows.filter(row=>row.status==='AMBIGUOUS').length,
    unmatched:rows.filter(row=>row.status==='UNMATCHED').length,conflicts:rows.filter(row=>row.status==='CONFLICT').length,
    filesAvailable:rows.filter(row=>row.fileAvailable).length,filesMissing:rows.filter(row=>!row.fileAvailable).length
  };
  const wanted=String(status||'ALL').toUpperCase();
  const needle=normalizeRacIdentity(search);
  const filtered=rows.filter(row=>(wanted==='ALL'||row.status===wanted)&&(!needle||normalizeRacIdentity([
    row.oldReportCode,row.sourceReportNumber,row.businessUnit,row.reporterName,row.location,row.description,row.originalName,row.targetCode,row.currentCode
  ].join(' ')).includes(needle)));
  const max=Math.min(Math.max(Number(limit)||500,1),2000);
  return{summary,total:filtered.length,rows:filtered.slice(0,max)};
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

export async function restoreReconciliationMemory(client,racId,memoryRows,actorId,{restoreEvidence=true}={}){
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
  if(restoreEvidence){
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
  }

  const assignmentUsers=new Set();
  for(const row of memoryRows)for(const assignment of (Array.isArray(row.assignments_snapshot)?row.assignments_snapshot:[]))if(assignment.active!==false&&assignment.supervisor_user_id)assignmentUsers.add(Number(assignment.supervisor_user_id));
  for(const userId of assignmentUsers){
    const valid=(await client.query(`SELECT 1 FROM users WHERE id=$1 AND active=TRUE AND deleted_at IS NULL`,[userId])).rowCount>0;
    if(valid)await client.query(`INSERT INTO rac_assignments(rac_id,supervisor_user_id,assigned_by,active,assigned_at) VALUES($1,$2,$3,TRUE,NOW()) ON CONFLICT DO NOTHING`,[racId,userId,actorId]);
  }

  if(oldIds.length){
    await client.query(`UPDATE audit_log SET entity_id=$1::text,details=COALESCE(details,'{}'::jsonb)||jsonb_build_object('reconciled_from_rac_id',entity_id) WHERE entity_type='RAC' AND entity_id=ANY($2::text[])`,[String(racId),oldIds.map(String)]);
    if(restoreEvidence)await client.query(`UPDATE file_assets SET entity_id=$1::text WHERE entity_type='RAC' AND entity_id=ANY($2::text[])`,[String(racId),oldIds.map(String)]);
  }
  await client.query(`UPDATE rac_reconciliation_memory SET restored_at=NOW(),restored_rac_id=$1 WHERE id=ANY($2::bigint[])`,[racId,memoryRows.map(row=>Number(row.id))]);
  await client.query(`INSERT INTO audit_log(user_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$1,'RECONCILE_RAC','RAC',$2,$3::jsonb)`,[actorId,String(racId),JSON.stringify({oldRacIds:oldIds,evidenceRestored:restoreEvidence?evidenceMap.size:0,evidenceImportDisabled:!restoreEvidence,duplicatesMerged:Math.max(0,oldIds.length-1)})]);
  return{restored:true,evidence:evidenceMap.size,oldIds,duplicatesMerged:Math.max(0,oldIds.length-1)};
}
