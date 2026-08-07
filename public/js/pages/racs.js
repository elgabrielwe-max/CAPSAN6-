import { api,session } from '../api.js';import { state,can,unitOptions,areaOptions,escapeHtml } from '../state.js';import { $,formData,table,kpi,bars,toast,modal,errorBox } from '../ui.js';
const statusTag=s=>`<span class="tag ${s==='LEVANTADO'?'done':s==='PENDIENTE'?'pending':''}">${escapeHtml(s)}</span>`;
const evidenceObjectUrls=new Map();
const formatDateTime=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?escapeHtml(String(value)):date.toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'});};
const changeTitle=action=>({CREATE_RAC:'RAC registrado',ASSIGN_RAC:'Supervisor asignado',UPDATE_RAC_STATUS:'Cambio de seguimiento',DIRECT_RAC:'RAC direccionado',EDIT_RAC:'Clasificación y direccionamiento corregidos'}[action]||'Actualización');
const changeDescription=change=>{
  const details=change.details||{};
  if(change.action==='UPDATE_RAC_STATUS')return `${escapeHtml(details.from||'SIN ESTADO')} → <b>${escapeHtml(details.to||'ACTUALIZADO')}</b>${details.noEvidenceRequired?' · <b>NO REQUIERE EVIDENCIA</b>':''}${details.comment?` · ${escapeHtml(details.comment)}`:''}`;
  if(change.action==='ASSIGN_RAC')return 'Se actualizó la asignación del responsable del RAC.';
  if(change.action==='DIRECT_RAC'||change.action==='EDIT_RAC')return `Área direccionada: <b>${escapeHtml(details.directedArea||'SIN ÁREA')}</b>${details.directionReason?` · ${escapeHtml(details.directionReason)}`:''}`;
  if(change.action==='CREATE_RAC')return `Se creó el registro${details.code?` ${escapeHtml(details.code)}`:''}.`;
  return 'Se actualizó el RAC.';
};
async function evidenceObjectUrl(assetId){
  if(!assetId)throw new Error('La evidencia no está disponible en el volumen');
  if(evidenceObjectUrls.has(Number(assetId)))return evidenceObjectUrls.get(Number(assetId));
  const response=await fetch(`/api/files/${Number(assetId)}`,{headers:session.token?{authorization:`Bearer ${session.token}`}:{}}); 
  if(!response.ok){let message='No se pudo abrir la evidencia';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  const url=URL.createObjectURL(await response.blob());
  evidenceObjectUrls.set(Number(assetId),url);
  return url;
}
async function openRacEvidence(evidence){
  if(!evidence?.asset_id){
    if(evidence?.drive_web_link)return window.open(evidence.drive_web_link,'_blank','noopener');
    return toast('La evidencia no está disponible en el volumen ni en Drive','error');
  }
  try{
    const url=await evidenceObjectUrl(evidence.asset_id);
    const mime=String(evidence.mime_type||'').toLowerCase();
    const meta=`<div class="evidence-expanded-meta"><b>${escapeHtml(evidence.original_name||'Evidencia')}</b><span>${escapeHtml(evidence.evidence_type||'SEGUIMIENTO')} · ${formatDateTime(evidence.uploaded_at)} · ${escapeHtml(evidence.uploaded_by_name||'USUARIO')}</span>${evidence.comment?`<p>${escapeHtml(evidence.comment)}</p>`:''}</div>`;
    if(mime.startsWith('image/'))return modal(`Evidencia de ${evidence.rac_code||'RAC'}`,`${meta}<img class="evidence-expanded-image" src="${url}" alt="${escapeHtml(evidence.original_name||'Evidencia')}">`);
    if(mime.includes('pdf'))return modal(`Evidencia de ${evidence.rac_code||'RAC'}`,`${meta}<iframe class="evidence-expanded-pdf" src="${url}" title="${escapeHtml(evidence.original_name||'PDF')}"></iframe>`);
    const box=modal(`Evidencia de ${evidence.rac_code||'RAC'}`,`${meta}<div class="alert warn">Este formato no tiene vista previa.</div><a class="btn primary" id="downloadEvidenceFile" href="${url}" download="${escapeHtml(evidence.original_name||'evidencia')}">Descargar archivo</a>`);
    return box;
  }catch(error){toast(error.message,'error');}
}
async function hydrateEvidenceThumbnails(root,evidenceMap){
  const images=[...root.querySelectorAll('[data-evidence-preview]')];
  await Promise.all(images.map(async image=>{
    const evidence=evidenceMap.get(Number(image.dataset.evidencePreview));
    if(!evidence?.asset_id)return;
    try{
      image.src=await evidenceObjectUrl(evidence.asset_id);
      image.closest('.evidence-visual')?.classList.add('loaded');
    }catch{}
  }));
  root.querySelectorAll('[data-open-evidence]').forEach(button=>{
    button.onclick=()=>openRacEvidence(evidenceMap.get(Number(button.dataset.openEvidence)));
  });
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function arrayBufferToBase64(buffer){
  const bytes=new Uint8Array(buffer);let binary='';const step=0x8000;
  for(let offset=0;offset<bytes.length;offset+=step)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+step,bytes.length)));
  return btoa(binary);
}
async function retryChunkRequest(url,body,attempts=4){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await api(url,{method:'POST',body});}
    catch(error){lastError=error;if(attempt<attempts)await pause(700*attempt);}
  }
  throw lastError;
}
async function uploadRacWorkbookInChunks(file,businessUnitId,onProgress=()=>{}){
  if(Number(file.size)>25*1024*1024)throw new Error('El archivo supera el tamaño máximo permitido de 25 MB.');
  const initialized=await api('/api/racs/import/upload/init',{method:'POST',body:{
    businessUnitId,fileName:file.name,mimeType:file.type||'application/octet-stream',size:file.size
  }});
  const chunkSize=Number(initialized.chunkSize);const totalChunks=Number(initialized.totalChunks);
  for(let index=0;index<totalChunks;index++){
    const start=index*chunkSize;const end=Math.min(start+chunkSize,file.size);
    const data=arrayBufferToBase64(await file.slice(start,end).arrayBuffer());
    await retryChunkRequest('/api/racs/import/upload/chunk',{
      uploadToken:initialized.uploadToken,businessUnitId,index,data
    });
    onProgress(Math.round((index+1)*100/totalChunks),index+1,totalChunks);
  }
  return {uploadToken:initialized.uploadToken,totalChunks,chunkSize};
}
export async function racDashboardPage(root){root.innerHTML=`<div class="page-head"><div><h2>Dashboard principal RACS</h2><p>Vista compacta con filtros de unidad, fecha, estado, riesgo y Supervisor. Plazos: ALTO 48 h · MEDIO 3 días · BAJO 4 días.</p></div></div><section class="panel"><form id="racFilters" class="filter-grid"><div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Desde</label><input type="date" name="from"></div><div class="field"><label>Hasta</label><input type="date" name="to"></div><div class="field"><label>Estado</label><select name="status"><option value="">Todos</option>${state.catalogs.racStatuses.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Riesgo</label><select name="risk"><option value="">Todos</option>${state.catalogs.riskLevels.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Tipo</label><select name="reportType"><option value="">Todos</option><option>ACTO SUBESTANDAR</option><option>CONDICION SUBESTANDAR</option></select></div><div class="field"><label>Supervisor</label><select name="supervisorUserId"><option value="">Todos</option>${state.catalogs.users.filter(x=>x.role==='SUPERVISOR').map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}</select></div><div class="field"><label>&nbsp;</label><button class="btn primary">Aplicar filtros</button></div></form></section><div id="racDash"></div>`;async function load(){const qs=new URLSearchParams(formData($('#racFilters')));const d=await api(`/api/racs/dashboard?${qs}`);$('#racDash').innerHTML=`<div class="kpi-grid">${kpi('Total RACS',d.kpis.total,'Base filtrada','navy')}${kpi('Actos',d.kpis.acts,'Actos subestándar','coral')}${kpi('Condiciones',d.kpis.conditions,'Condiciones subestándar','teal')}${kpi('Alto potencial',d.kpis.high,'Prioridad','red')}${kpi('Pendientes',d.kpis.pending,'Requieren atención','amber')}${kpi('Vencidos',d.kpis.overdue,'Fuera del plazo','red')}${kpi('% cierre',`${d.kpis.closurePercent}%`,'Levantamiento','green')}</div><div class="grid-3"><section class="panel"><h3>Estado</h3>${bars(d.byStatus)}</section><section class="panel"><h3>Principales causas</h3>${bars(d.byCause)}</section><section class="panel"><h3>Supervisores</h3>${bars(d.bySupervisor)}</section></div><section class="panel"><h3>Riesgo por tipo</h3>${table(['Tipo','Riesgo','RACS'],d.byRisk.map(x=>`<tr><td>${escapeHtml(x.report_type)}</td><td><span class="tag ${x.risk_level==='ALTO'?'high':x.risk_level==='MEDIO'?'medium':'low'}">${x.risk_level}</span></td><td>${x.total}</td></tr>`))}</section>`;}$('#racFilters').onsubmit=e=>{e.preventDefault();load()};await load();}

export async function racOperationsPage(root){
  let currentTab='import';
  const directionTab=can('rac:direct')?'<button data-tab="directed">Listado direccionado</button><button data-tab="historical-evidence">Evidencias históricas</button>':'';
  root.innerHTML=`<div class="page-head"><div><h2>Registro y levantamiento de RACS</h2><p>Importación inteligente, registro, direccionamiento y seguimiento en una sola operación.</p></div></div><div class="tabs"><button data-tab="import" class="active">Importar Excel</button><button data-tab="new">Registrar nuevo RAC</button><button data-tab="follow">Listado para levantamiento</button>${directionTab}<button data-tab="changes">Listado de cambios</button></div><div id="racOps"></div>`;
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{
    currentTab=button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item===button));
    render();
  });
  async function render(){
    if(currentTab==='import')return importTab();
    if(currentTab==='new')return newTab();
    if(currentTab==='follow')return followTab();
    if(currentTab==='directed'&&can('rac:direct'))return directedTab();
    if(currentTab==='historical-evidence'&&can('rac:direct'))return historicalEvidenceTab();
    return changesTab();
  }
  async function importTab(){
  const box=$('#racOps');
  box.innerHTML=`<section class="panel"><h3>Importador inteligente de RACS</h3><div class="panel-sub">Interpreta hojas, encabezados, fechas y causas. La conciliación conserva estados, evidencias, direccionamientos e historial aunque previamente se haya depurado la carga.</div><div class="alert ok"><b>Importación conciliada activa.</b> Usa siempre el ID ÚNICO ORIGEN del modelo oficial para que el mismo RAC se actualice y no vuelva a duplicarse.</div><div class="actions"><a class="btn ghost" href="/templates/MODELO_OFICIAL_IMPORTACION_RACS_CAPSAN6.xlsx" download>Descargar modelo oficial RACS</a></div><form id="racImportForm"><div class="form-grid two"><div class="field"><label>Unidad de negocio</label><select name="businessUnitId" required>${unitOptions()}</select></div><div class="field"><label>Archivo Excel</label><input type="file" name="file" accept=".xlsx,.xls" required></div></div><button class="btn primary" name="action" value="analyze">Analizar archivo</button></form><div id="uploadProgress"></div><div id="importResult"></div></section>`;
  const form=$('#racImportForm');
  form.onsubmit=async event=>{
    event.preventDefault();
    const currentForm=event.currentTarget;
    const selectedFile=currentForm.elements.file.files[0];
    const selectedUnitId=currentForm.elements.businessUnitId.value;
    if(!selectedFile||!selectedUnitId)return toast('Selecciona la unidad y el archivo Excel','error');
    const analyzeButton=currentForm.querySelector('button[type="submit"],button[name="action"]');
    analyzeButton.disabled=true;
    analyzeButton.textContent='Preparando carga…';
    const progressBox=$('#uploadProgress');
    progressBox.innerHTML='<div class="alert ok">Preparando el Excel para una carga estable por partes…</div>';
    try{
      const uploaded=await uploadRacWorkbookInChunks(selectedFile,selectedUnitId,(percent,current,total)=>{
        analyzeButton.textContent=`Subiendo ${percent}%`;
        progressBox.innerHTML=`<div class="alert ok"><b>Subiendo Excel por partes: ${percent}%</b><br>Parte ${current} de ${total}. No cierres esta pestaña.</div>`;
      });
      analyzeButton.textContent='Analizando Excel…';
      progressBox.innerHTML='<div class="alert ok"><b>Carga completada.</b> CAPSAN6 está analizando el contenido.</div>';
      const a=await api('/api/racs/import/analyze',{method:'POST',body:{uploadToken:uploaded.uploadToken,businessUnitId:selectedUnitId}});
      const warnings=(a.warnings||[]).map(w=>`<div class="alert warn">${escapeHtml(w)}</div>`).join('');
      const errors=(a.errors||[]).slice(0,8).map(w=>`<div class="alert danger">${escapeHtml(w)}</div>`).join('');
      const periodOptions=(a.periods||[]).map(item=>`<option value="${item.period}">${escapeHtml(item.period)} · ${item.total} RACS</option>`).join('');
      const preview=a.reconciliationPreview||{};
      const reconciliationPreview=`<div class="kpi-grid compact"><div class="kpi-card"><span>Nuevos</span><strong>${preview.willInsert||0}</strong><small>Se insertarán</small></div><div class="kpi-card"><span>Actualizaciones</span><strong>${preview.willUpdate||0}</strong><small>Coinciden con RACS activos</small></div><div class="kpi-card"><span>Recuperados</span><strong>${preview.willRestore||0}</strong><small>Desde depuración protegida</small></div><div class="kpi-card"><span>Estados preservados</span><strong>${preview.preservedStates||0}</strong><small>No retrocederán por el Excel</small></div></div>`;
      const periodControl=(a.periods||[]).length>1?`<div class="panel import-period-choice"><h4>El archivo contiene varios periodos</h4><div class="form-grid two"><div class="field"><label>Modo de importación</label><select id="importPeriodMode"><option value="ALL">Importar todos los periodos</option><option value="DOMINANT">Importar solo el mes dominante (${escapeHtml(a.dominantPeriod)})</option><option value="PERIOD">Importar un periodo específico</option></select></div><div class="field"><label>Periodo específico</label><select id="importSelectedPeriod" disabled>${periodOptions}</select></div></div></div>`:'';
      $('#importResult').innerHTML=`<div class="alert ok">${a.validRows} RACS válidos · ${a.stableIds||0} con ID único estable · ${a.missingStableIds||0} sin ID único · Periodo dominante ${escapeHtml(a.dominantPeriod||'sin fecha')}.</div><div class="alert ok"><b>Análisis completado.</b> Al confirmar, CAPSAN6 enviará el Excel nuevamente por partes y lo importará en la misma operación para evitar pérdidas de caché entre solicitudes. La copia temporal vence a las ${a.uploadExpiresAt?new Date(a.uploadExpiresAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'próximas 2 horas'}.</div>${reconciliationPreview}${warnings}${errors}${periodControl}<div class="actions"><button class="btn amber" id="commitImport">Confirmar e importar ${a.validRows} RACS a la base central</button></div><div id="commitImportStatus"></div>${table(['Código interno','ID único','N° origen','Fecha','Área','Lugar','Riesgo','Causa','Estado'],(a.records||[]).map(r=>`<tr><td>${escapeHtml(r.internalCode)}</td><td>${escapeHtml(r.externalId||'SIN ID')}</td><td>${escapeHtml(r.sourceReportNumber)}</td><td>${r.reportDate}</td><td>${escapeHtml(r.reportingArea)}</td><td>${escapeHtml(r.location)}</td><td>${escapeHtml(r.riskLevel)}</td><td>${escapeHtml(r.causeSubtype)}</td><td>${escapeHtml(r.status)}</td></tr>`))}`;
      if($('#importPeriodMode'))$('#importPeriodMode').onchange=()=>{$('#importSelectedPeriod').disabled=$('#importPeriodMode').value!=='PERIOD';};
      const commitButton=$('#commitImport');
      let currentUploadToken=a.uploadToken;
      const showImportSuccess=r=>{
        $('#commitImportStatus').innerHTML=`<div class="alert ok"><b>Importación confirmada en la base central.</b><br>${r.inserted} nuevos · ${r.updated} actualizados · ${r.reconciled||0} recuperados desde depuración · ${r.restoredEvidence||0} evidencias restauradas · ${r.duplicatesMerged||0} duplicados históricos fusionados · ${r.preservedOperational||0} estados actuales preservados · ${r.verified} verificados en PostgreSQL.</div><div class="actions"><button class="btn primary" id="openCentralDashboard">Abrir Dashboard RACS</button><button class="btn ghost" id="openCentralList">Abrir listado para levantamiento</button></div>`;
        commitButton.textContent='Importación completada';
        toast(`${r.verified} RACS verificados en la base central`);
        $('#openCentralDashboard').onclick=()=>document.querySelector('[data-route="racDashboard"]')?.click();
        $('#openCentralList').onclick=()=>{document.querySelector('[data-route="racOperations"]')?.click();setTimeout(()=>document.querySelector('[data-tab="follow"]')?.click(),50);};
      };
      const importWithToken=token=>api('/api/racs/import',{method:'POST',body:{
        uploadToken:token,
        businessUnitId:selectedUnitId,
        periodMode:$('#importPeriodMode')?.value||'ALL',
        selectedPeriod:$('#importSelectedPeriod')?.value||''
      }});
      commitButton.onclick=async()=>{
        commitButton.disabled=true;
        commitButton.textContent='Importando y verificando PostgreSQL…';
        try{
          $('#commitImportStatus').innerHTML='<div class="alert ok"><b>Preparando importación definitiva.</b> CAPSAN6 enviará nuevamente el Excel por partes y lo procesará en la misma operación, sin depender de una copia temporal anterior.</div>';
          const finalUpload=await uploadRacWorkbookInChunks(selectedFile,selectedUnitId,(percent,current,total)=>{
            commitButton.textContent=`Preparando importación ${percent}%`;
            $('#commitImportStatus').innerHTML=`<div class="alert ok"><b>Preparando importación definitiva: ${percent}%</b><br>Parte ${current} de ${total}. No cierres esta pestaña.</div>`;
          });
          currentUploadToken=finalUpload.uploadToken;
          commitButton.textContent='Importando y verificando PostgreSQL…';
          const r=await importWithToken(currentUploadToken);
          showImportSuccess(r);
        }catch(err){
          commitButton.disabled=false;
          commitButton.textContent=`Confirmar e importar ${a.validRows} RACS a la base central`;
          $('#commitImportStatus').innerHTML=errorBox(err);
          toast(err.message,'error');
        }
      };
    }catch(err){
      progressBox.innerHTML='';
      $('#importResult').innerHTML=errorBox(err);
    }finally{
      analyzeButton.disabled=false;
      analyzeButton.textContent='Analizar archivo';
    }
  };
}
async function newTab(){
  const box=$('#racOps');const catalog=state.catalogs.racCauseCategories||[];const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  box.innerHTML=`<section class="panel"><h3>Texto original del trabajador</h3><div class="panel-sub">La IA clasifica el reporte utilizando el catálogo institucional de causas y subcausas. El texto original se conserva sin cambios.</div><div class="field"><textarea id="workerText" placeholder="Pega exactamente lo informado por el trabajador"></textarea></div><button class="btn amber" id="classifyRac">Detectar tipo de causa y subcausa</button><div id="aiResult"></div></section><section class="panel"><form id="newRacForm"><div class="form-grid three"><div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div><div class="field"><label>Fecha</label><input type="date" name="reportDate" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>ID único de origen</label><input name="sourceUid" placeholder="Ejemplo: OC-2026-0001"><small class="muted">No debe cambiar en futuras cargas.</small></div><div class="field"><label>N° original</label><input name="sourceReportNumber"></div><div class="field"><label>Área reportante</label><input name="reportingArea" required></div><div class="field"><label>Área reportada</label><input name="reportedArea"></div><div class="field"><label>Reportante</label><input name="reporterName" required></div><div class="field"><label>Tipo reportante</label><select name="reporterType"><option>COLABORADOR</option><option>SUPERVISOR</option><option>SSOMA</option></select></div><div class="field"><label>Lugar / zona / labor</label><input name="location"></div><div class="field"><label>Riesgo</label><select name="riskLevel"><option>BAJO</option><option>MEDIO</option><option>ALTO</option></select></div><div class="field"><label>Tipo de reporte</label><select name="reportType" id="racReportType"><option>CONDICION SUBESTANDAR</option><option>ACTO SUBESTANDAR</option></select></div><div class="field"><label>Tipo de causa</label><select name="causeCategoryId" id="racCauseCategory" required></select><div class="panel-sub">Catálogo institucional ampliable. Máster y SSOMA pueden crear nuevos tipos y subcausas.</div></div><div class="field"><label>Subcausa / causa normalizada</label><select name="causeSubtypeId" id="racCauseSubtype" required></select><div class="actions compact">${can('rac:catalog.manage')?'<button type="button" class="btn small ghost" id="newRacCategory">＋ Nuevo tipo de causa</button><button type="button" class="btn small ghost" id="newRacSubtype">＋ Nueva subcausa</button>':''}</div></div><div class="field span-3"><label>Descripción original</label><textarea name="description" required></textarea></div><div class="field span-2"><label>Acción correctiva</label><textarea name="correctiveAction"></textarea></div><div class="field"><label>Supervisores de la unidad</label><div id="unitSupervisors" class="supervisor-auto-box loading">Selecciona una unidad</div><div class="panel-sub">Todos los Supervisores activos vinculados a la unidad quedarán asignados automáticamente.</div></div></div><button class="btn primary">Guardar RAC</button></form></section>`;
  const form=$('#newRacForm'),reportType=$('#racReportType'),categorySelect=$('#racCauseCategory'),subtypeSelect=$('#racCauseSubtype'),unitSelect=form.elements.businessUnitId,reportingAreaInput=form.elements.reportingArea,supervisorBox=$('#unitSupervisors');
  const supervisorsForUnit=unitId=>state.catalogs.users.filter(user=>user.role==='SUPERVISOR'&&(user.unit_ids||[]).map(Number).includes(Number(unitId)));
  const refreshUnitSupervisors=()=>{const unitId=Number(unitSelect.value);const supervisors=unitId?supervisorsForUnit(unitId):[];supervisorBox.classList.remove('loading','empty');if(!unitId){supervisorBox.classList.add('empty');supervisorBox.innerHTML='Selecciona una unidad para identificar a sus Supervisores.';return;}if(!supervisors.length){supervisorBox.classList.add('empty');supervisorBox.innerHTML='No hay Supervisores activos vinculados a esta unidad.';return;}supervisorBox.innerHTML=supervisors.map(user=>`<span class="supervisor-chip" title="Asignación automática">${escapeHtml(user.name)}</span>`).join('');};
  unitSelect.addEventListener('change',refreshUnitSupervisors);reportingAreaInput.addEventListener('change',refreshUnitSupervisors);reportingAreaInput.addEventListener('blur',refreshUnitSupervisors);refreshUnitSupervisors();
  const availableCategories=()=>catalog;
  const refreshCategories=(selected='')=>{const rows=availableCategories();categorySelect.innerHTML='<option value="">Seleccionar tipo de causa</option>'+rows.map(category=>`<option value="${category.id}" ${String(category.id)===String(selected)?'selected':''}>${escapeHtml(category.code)}. ${escapeHtml(category.name)}</option>`).join('');refreshSubtypes();};
  const refreshSubtypes=(selected='')=>{const category=catalog.find(item=>Number(item.id)===Number(categorySelect.value));subtypeSelect.innerHTML='<option value="">Seleccionar subcausa</option>'+((category?.subtypes||[]).map((subtype,index)=>`<option value="${subtype.id}" ${String(subtype.id)===String(selected)?'selected':''}>${index+1}. ${escapeHtml(subtype.name)}${subtype.isCustom?' · PERSONALIZADA':''}</option>`).join(''));};
  reportType.onchange=()=>{const category=categorySelect.value;refreshCategories(category);};categorySelect.onchange=()=>refreshSubtypes();refreshCategories();
  if($('#newRacCategory'))$('#newRacCategory').onclick=()=>{
    const dialog=modal('Registrar nuevo tipo de causa',`<form id="newCategoryForm"><div class="alert warn">El nuevo tipo quedará disponible para todos los RACS. Después debes registrar al menos una subcausa.</div><div class="form-grid two"><div class="field"><label>Nombre del tipo de causa</label><input name="name" maxlength="180" required placeholder="Ejemplo: GESTIÓN DOCUMENTARIA"></div><div class="field"><label>Corresponde a</label><select name="reportType"><option>CONDICION SUBESTANDAR</option><option>ACTO SUBESTANDAR</option></select></div><div class="field"><label>Código opcional</label><input name="code" maxlength="10" placeholder="Automático: X, XI, XII..."></div></div><button class="btn primary">Guardar tipo de causa</button></form>`);
    dialog.querySelector('#newCategoryForm').onsubmit=async event=>{
      event.preventDefault();
      try{
        const created=await api('/api/racs/cause-categories',{method:'POST',body:formData(event.currentTarget)});
        catalog.push({...created,subtypes:created.subtypes||[]});
        catalog.sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999)||String(a.code).localeCompare(String(b.code)));
        refreshCategories(created.id);
        reportType.value=created.reportType;
        dialog.remove();
        toast('Nuevo tipo de causa registrado. Ahora agrega su primera subcausa.');
        setTimeout(()=>$('#newRacSubtype')?.click(),50);
      }catch(error){toast(error.message,'error');}
    };
  };
  if($('#newRacSubtype'))$('#newRacSubtype').onclick=()=>{const category=catalog.find(item=>Number(item.id)===Number(categorySelect.value));if(!category)return toast('Selecciona primero el tipo de causa','error');const dialog=modal('Registrar nueva subcausa',`<form id="newSubtypeForm"><div class="alert warn">La nueva subcausa quedará disponible para todos los registros RACS dentro de <b>${escapeHtml(category.code)}. ${escapeHtml(category.name)}</b>.</div><div class="field"><label>Nombre de la nueva subcausa</label><input name="name" maxlength="220" required placeholder="Ejemplo: CONTROL DEFICIENTE DE DRENAJE"></div><button class="btn primary">Guardar en catálogo</button></form>`);dialog.querySelector('#newSubtypeForm').onsubmit=async event=>{event.preventDefault();try{const created=await api('/api/racs/cause-subtypes',{method:'POST',body:{categoryId:category.id,name:event.currentTarget.elements.name.value}});const existing=category.subtypes.find(item=>Number(item.id)===Number(created.id));if(!existing)category.subtypes.push({id:created.id,name:created.name,isCustom:true,sortOrder:created.sortOrder});category.subtypes.sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999)||a.name.localeCompare(b.name));refreshSubtypes(created.id);dialog.remove();toast('Nueva subcausa registrada en el catálogo central');}catch(error){toast(error.message,'error')}};};
  $('#classifyRac').onclick=async()=>{const text=$('#workerText').value;if(!text)return toast('Ingresa el texto del trabajador','error');try{const classification=await api('/api/racs/ai/classify',{method:'POST',body:{text}});form.description.value=text;reportType.value=classification.reportType;const category=catalog.find(item=>normalize(item.code)===normalize(classification.causeCategoryCode)||normalize(item.name)===normalize(classification.causeCategory));refreshCategories(category?.id||'');const subtype=category?.subtypes.find(item=>normalize(item.name)===normalize(classification.causeSubtype));if(subtype)refreshSubtypes(subtype.id);$('#aiResult').innerHTML=`<div class="alert ok">${escapeHtml(classification.reportType)} → ${escapeHtml(classification.causeCategoryCode||'')} ${escapeHtml(classification.causeCategory)} → ${escapeHtml(classification.causeSubtype)} · ${escapeHtml(classification.source)}</div>${subtype?'':'<div class="alert warn">La IA identificó la categoría, pero la subcausa no está en el catálogo activo. Selecciona una existente o regístrala como nueva.</div>'}`;}catch(error){toast(error.message,'error')}};
  form.onsubmit=async event=>{event.preventDefault();const submittedForm=event.currentTarget;if(!categorySelect.value||!subtypeSelect.value)return toast('Selecciona el tipo de causa y la subcausa','error');try{const result=await api('/api/racs',{method:'POST',body:formData(submittedForm)});const assigned=Number(result.assigned_supervisor_count||0);toast(`RAC ${result.report_code} registrado${assigned?` y asignado a ${assigned} Supervisor${assigned===1?'':'es'}`:''}`);submittedForm.reset();submittedForm.elements.reportDate.value=new Date().toISOString().slice(0,10);$('#workerText').value='';$('#aiResult').innerHTML='';refreshCategories();refreshUnitSupervisors();}catch(error){toast(error.message,'error')}};
}
async function followTab(){
  const box=$('#racOps');
  box.innerHTML=`<section class="panel"><div class="filter-grid"><div class="field"><label>Unidad</label><select id="followUnit">${unitOptions()}</select></div><div class="field"><label>Estado</label><select id="followStatus"><option value="">Todos</option>${state.catalogs.racStatuses.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Buscar</label><input id="followSearch" placeholder="RAC, lugar, descripción o área direccionada"></div><div class="field"><label>&nbsp;</label><button class="btn primary" id="loadFollow">Actualizar lista</button></div></div><div id="followList"></div></section>`;
  async function load(){
    const q=new URLSearchParams({limit:'500'});
    if($('#followUnit').value)q.set('businessUnitId',$('#followUnit').value);
    if($('#followStatus').value)q.set('status',$('#followStatus').value);
    let rows=await api(`/api/racs?${q}`);
    const search=$('#followSearch').value.toUpperCase();
    if(search)rows=rows.filter(r=>`${r.report_code} ${r.location} ${r.description} ${r.directed_area||''} ${r.direction_reason||''}`.toUpperCase().includes(search));
    $('#followList').innerHTML=table(['RAC','Unidad','Fecha','Vence','Riesgo','Causa','Descripción / direccionamiento','Supervisor','Estado',''],rows.map(r=>`<tr><td><b>${escapeHtml(r.report_code)}</b><br><small>${escapeHtml(r.source_report_number||'')}</small></td><td>${escapeHtml(r.business_unit||'')}</td><td>${String(r.report_date).slice(0,10)}</td><td>${String(r.due_date||'').slice(0,10)||'—'}${r.status!=='LEVANTADO'&&r.due_date&&String(r.due_date).slice(0,10)<new Date().toISOString().slice(0,10)?'<br><span class="tag high">VENCIDO</span>':''}</td><td><span class="tag ${r.risk_level==='ALTO'?'high':r.risk_level==='MEDIO'?'medium':'low'}">${r.risk_level}</span></td><td><small>${escapeHtml(r.cause_category||'')}</small><br>${escapeHtml(r.cause_subtype||r.deviation_type)}</td><td>${escapeHtml(r.description)}${r.directed_area?`<div class="direction-note"><b>DIRIGIDO A: ${escapeHtml(r.directed_area)}</b><span>${escapeHtml(r.direction_reason||'Sin motivo registrado')}</span></div>`:''}</td><td>${escapeHtml(r.supervisor_name)}</td><td>${statusTag(r.status)}${r.status==='LEVANTADO'&&r.evidence_required===false?'<br><span class="tag exempt">NO REQUIERE EVIDENCIA</span>':''}</td><td><button class="btn small" data-follow="${r.id}">Actualizar</button>${can('rac:assign')?` <button class="btn small ghost" data-assign="${r.id}" data-unit="${r.business_unit_id}">Asignar</button>`:''}</td></tr>`));
    document.querySelectorAll('[data-follow]').forEach(button=>button.onclick=()=>statusModal(rows.find(item=>item.id===Number(button.dataset.follow)),load));
    document.querySelectorAll('[data-assign]').forEach(button=>button.onclick=()=>assignModal(rows.find(item=>item.id===Number(button.dataset.assign)),load));
  }
  $('#loadFollow').onclick=load;
  $('#followSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  await load();
}

async function directedTab(){
  if(!can('rac:direct'))return;
  const box=$('#racOps');
  box.innerHTML=`<section class="panel"><div class="change-list-head"><div><h3>Listado direccionado</h3><div class="panel-sub">Exclusivo para Máster y SSOMA. Corrige clasificación, define el área responsable y registra por qué debe levantar la observación.</div></div><span class="tag high">NO VISIBLE PARA SUPERVISORES</span></div><div class="historical-evidence-recovery"><div><b>Recuperación de evidencias históricas</b><small>Relaciona las evidencias anteriores por ID de origen y, cuando el código cambió, por unidad, fecha, reportante, lugar y descripción. Nunca vincula solo por una descripción repetida.</small></div><button class="btn ghost" id="previewEvidenceRecovery">Revisar evidencias pendientes</button></div><div id="evidenceRecoveryResult"></div><div class="filter-grid"><div class="field"><label>Unidad</label><select id="directUnit">${unitOptions()}</select></div><div class="field"><label>Situación</label><select id="directStatus"><option value="NOT_DIRECTED">Sin direccionar</option><option value="DIRECTED">Direccionados</option><option value="ALL">Todos</option></select></div><div class="field"><label>Área direccionada</label><select id="directArea">${areaOptions()}</select></div><div class="field"><label>Desde</label><input type="date" id="directFrom"></div><div class="field"><label>Hasta</label><input type="date" id="directTo"></div><div class="field"><label>Buscar</label><input id="directSearch" placeholder="RAC, descripción, causa, lugar, área o motivo"></div><div class="field"><label>&nbsp;</label><button class="btn primary" id="loadDirected">Actualizar listado</button></div></div><div id="directedList"></div></section>`;
  const recoveryPayload=()=>({businessUnitId:$('#directUnit').value||null,from:$('#directFrom').value||null,to:$('#directTo').value||null});
  const renderRecovery=(result,executed=false)=>{
    const recoverable=Number(result.inserted||0)+Number(result.moved||0);
    $('#evidenceRecoveryResult').innerHTML=`<div class="alert ${recoverable?'warn':'ok'}"><b>${executed?'Recuperación ejecutada':'Revisión terminada'}.</b> Memorias con evidencia: ${Number(result.memoryRecords||0)} · Coincidencias seguras: ${Number(result.matchedRecords||0)} · ${executed?'Evidencias insertadas':'Por insertar'}: ${Number(result.inserted||0)} · ${executed?'Evidencias reasignadas':'Por reasignar'}: ${Number(result.moved||0)} · Ya presentes: ${Number(result.alreadyPresent||0)} · Ambiguas: ${Number(result.ambiguous||0)} · Sin coincidencia: ${Number(result.unmatched||0)}<div class="actions compact">${!executed&&recoverable?`<button class="btn primary" id="executeEvidenceRecovery">Recuperar ${recoverable} evidencia${recoverable===1?'':'s'}</button>`:''}<button class="btn ghost" id="openHistoricalEvidenceSection">Ver apartado de evidencias</button></div></div>`;
    $('#openHistoricalEvidenceSection').onclick=()=>document.querySelector('[data-tab="historical-evidence"]')?.click();
    if(!executed&&recoverable)$('#executeEvidenceRecovery').onclick=async()=>{
      if(!window.confirm(`Se insertarán o reasignarán ${recoverable} evidencias mediante coincidencias seguras. ¿Continuar?`))return;
      try{const done=await api('/api/racs/reconciliation/evidence-recovery/execute',{method:'POST',body:recoveryPayload()});renderRecovery(done,true);toast(`Recuperación completada: ${Number(done.inserted||0)+Number(done.moved||0)} evidencias`);await load();}catch(error){toast(error.message,'error');}
    };
  };
  async function load(){
    const target=$('#directedList');target.innerHTML='<div class="page-loading"><span class="spinner"></span>Cargando RACS…</div>';
    const q=new URLSearchParams({limit:'700',directionStatus:$('#directStatus').value});
    if($('#directUnit').value)q.set('businessUnitId',$('#directUnit').value);
    if($('#directArea').value)q.set('directedAreaId',$('#directArea').value);
    if($('#directFrom').value)q.set('from',$('#directFrom').value);
    if($('#directTo').value)q.set('to',$('#directTo').value);
    if($('#directSearch').value.trim())q.set('search',$('#directSearch').value.trim());
    try{
      const rows=await api(`/api/racs/directed?${q}`);
      target.innerHTML=rows.length?table(['RAC','Unidad','Área reportada','Área direccionada','Motivo','Riesgo','Tipo / causa','Descripción / evidencias','Estado',''],rows.map(r=>`<tr><td><b>${escapeHtml(r.report_code)}</b><br><small>${escapeHtml(r.source_report_number||'')}</small></td><td>${escapeHtml(r.business_unit||'')}</td><td><small>Reportante: ${escapeHtml(r.reporting_area||'—')}</small><br><b>${escapeHtml(r.reported_area||'—')}</b></td><td>${r.directed_area?`<span class="tag done">${escapeHtml(r.directed_area)}</span><br><small>${escapeHtml(r.directed_by_name||'')} · ${formatDateTime(r.directed_at)}</small>`:'<span class="tag pending">SIN DIRECCIONAR</span>'}</td><td>${escapeHtml(r.direction_reason||'—')}</td><td><span class="tag ${r.risk_level==='ALTO'?'high':r.risk_level==='MEDIO'?'medium':'low'}">${escapeHtml(r.risk_level)}</span></td><td><small>${escapeHtml(r.report_type||'')}</small><br><b>${escapeHtml(r.cause_category||'')}</b><br>${escapeHtml(r.cause_subtype||r.deviation_type||'')}</td><td class="rac-directed-description"><p>${escapeHtml(r.description||'SIN DESCRIPCIÓN')}</p><span class="tag ${Number(r.evidence_count||0)>0?'done':'pending'}">${Number(r.evidence_count||0)} EVIDENCIA${Number(r.evidence_count||0)===1?'':'S'}</span></td><td>${statusTag(r.status)}</td><td><button class="btn small amber" data-direct="${r.id}">${r.directed_area_id?'Editar / redireccionar':'Direccionar y corregir'}</button></td></tr>`)):'<div class="empty">No existen RACS para los filtros seleccionados.</div>';
      target.querySelectorAll('[data-direct]').forEach(button=>button.onclick=()=>directionModal(rows.find(item=>item.id===Number(button.dataset.direct)),load));
    }catch(error){target.innerHTML=errorBox(error);}
  }
  $('#previewEvidenceRecovery').onclick=async()=>{try{$('#evidenceRecoveryResult').innerHTML='<div class="page-loading"><span class="spinner"></span>Comparando evidencias históricas…</div>';const preview=await api('/api/racs/reconciliation/evidence-recovery/preview',{method:'POST',body:recoveryPayload()});renderRecovery(preview,false);}catch(error){$('#evidenceRecoveryResult').innerHTML=errorBox(error);}};
  $('#loadDirected').onclick=load;
  $('#directSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  await load();
}


async function historicalEvidenceTab(){
  const box=$('#racOps');
  const statusOptions=[
    ['ALL','Todas'],['REASSIGNABLE','Por reasignar'],['INSERTABLE','Por insertar'],['ALREADY_PRESENT','Ya presentes'],
    ['UNMATCHED','Sin coincidencia'],['AMBIGUOUS','Ambiguas'],['CONFLICT','Con conflicto']
  ];
  const statusMeta={
    REASSIGNABLE:{label:'POR REASIGNAR',className:'pending',detail:'La evidencia está vinculada a otro código, pero existe una coincidencia más segura.'},
    INSERTABLE:{label:'POR INSERTAR',className:'pending',detail:'El archivo existe en la memoria y tiene un RAC destino seguro.'},
    ALREADY_PRESENT:{label:'YA PRESENTE',className:'done',detail:'La evidencia ya está asociada al RAC correcto.'},
    UNMATCHED:{label:'SIN COINCIDENCIA',className:'high',detail:'No se encontró un RAC actual suficientemente parecido.'},
    AMBIGUOUS:{label:'AMBIGUA',className:'medium',detail:'Existen varios RACS posibles y no es seguro elegir uno automáticamente.'},
    CONFLICT:{label:'CONFLICTO',className:'high',detail:'La evidencia ya está asociada y la coincidencia actual no es mejor que la existente.'}
  };
  box.innerHTML=`<section class="panel historical-evidence-panel"><div class="change-list-head"><div><h3>Evidencias históricas de RACS</h3><div class="panel-sub">Consulta todas las evidencias guardadas antes de la depuración: recuperadas, por reasignar, ya presentes y aquellas que todavía no tienen coincidencia.</div></div><span class="tag high">SOLO MÁSTER Y SSOMA</span></div><div class="filter-grid historical-evidence-filters"><div class="field"><label>Unidad</label><select id="historyEvidenceUnit">${unitOptions()}</select></div><div class="field"><label>Situación</label><select id="historyEvidenceStatus">${statusOptions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>Desde</label><input type="date" id="historyEvidenceFrom"></div><div class="field"><label>Hasta</label><input type="date" id="historyEvidenceTo"></div><div class="field span-2"><label>Buscar</label><input id="historyEvidenceSearch" placeholder="Código anterior, número, descripción, reportante, lugar o archivo"></div><div class="field"><label>&nbsp;</label><button class="btn primary" id="loadHistoricalEvidence">Actualizar evidencias</button></div></div><div class="actions historical-evidence-actions"><button class="btn amber" id="recoverHistoricalEvidence">Recuperar coincidencias seguras</button></div><div id="historicalEvidenceSummary"></div><div id="historicalEvidenceList"></div></section>`;
  const payload=()=>({businessUnitId:$('#historyEvidenceUnit').value||null,from:$('#historyEvidenceFrom').value||null,to:$('#historyEvidenceTo').value||null});
  async function load(){
    const list=$('#historicalEvidenceList'),summaryBox=$('#historicalEvidenceSummary');
    list.innerHTML='<div class="page-loading"><span class="spinner"></span>Cargando evidencias históricas…</div>';
    const q=new URLSearchParams({limit:'1200',status:$('#historyEvidenceStatus').value});
    if($('#historyEvidenceUnit').value)q.set('businessUnitId',$('#historyEvidenceUnit').value);
    if($('#historyEvidenceFrom').value)q.set('from',$('#historyEvidenceFrom').value);
    if($('#historyEvidenceTo').value)q.set('to',$('#historyEvidenceTo').value);
    if($('#historyEvidenceSearch').value.trim())q.set('search',$('#historyEvidenceSearch').value.trim());
    try{
      const result=await api(`/api/racs/reconciliation/evidence-history?${q}`);
      const s=result.summary||{};
      summaryBox.innerHTML=`<div class="historical-evidence-kpis"><div><span>Memorias con evidencia</span><b>${Number(s.memoryRecords||0)}</b></div><div><span>Coincidencias seguras</span><b>${Number(s.secureMatches||0)}</b></div><div><span>Archivos históricos</span><b>${Number(s.evidenceFiles||0)}</b></div><div class="success"><span>Ya presentes</span><b>${Number(s.alreadyPresent||0)}</b></div><div class="warning"><span>Por recuperar</span><b>${Number(s.insertable||0)+Number(s.reassignable||0)}</b></div><div class="danger"><span>Sin coincidencia</span><b>${Number(s.unmatched||0)+Number(s.ambiguous||0)}</b></div></div><div class="historical-evidence-caption">Mostrando ${Number(result.total||0)} evidencia${Number(result.total||0)===1?'':'s'} según los filtros. Archivos disponibles: ${Number(s.filesAvailable||0)} · No disponibles en el volumen: ${Number(s.filesMissing||0)}.</div>`;
      const evidenceMap=new Map();
      const grouped=new Map();
      (result.rows||[]).forEach((row,index)=>{
        const viewId=index+1;row.viewId=viewId;
        evidenceMap.set(viewId,{id:viewId,asset_id:row.assetId,drive_web_link:row.driveWebLink,mime_type:row.mimeType,original_name:row.originalName,evidence_type:row.evidenceType,uploaded_at:row.uploadedAt,comment:row.comment,rac_code:row.targetCode||row.oldReportCode||'RAC HISTÓRICO'});
        if(!grouped.has(row.memoryId))grouped.set(row.memoryId,[]);grouped.get(row.memoryId).push(row);
      });
      list.innerHTML=grouped.size?`<div class="historical-evidence-list">${[...grouped.values()].map(items=>{
        const head=items[0],statuses=[...new Set(items.map(item=>item.status))];
        return `<article class="historical-evidence-card"><header><div><b>${escapeHtml(head.oldReportCode||`RAC ANTERIOR ${head.oldRacId}`)}</b><small>N.° origen: ${escapeHtml(head.sourceReportNumber||'SIN NÚMERO')} · ${escapeHtml(head.businessUnit||'')} · ${escapeHtml(head.reportDate||'SIN FECHA')}</small></div><div class="historical-evidence-statuses">${statuses.map(value=>`<span class="tag ${statusMeta[value]?.className||''}">${statusMeta[value]?.label||escapeHtml(value)}</span>`).join('')}</div></header><div class="historical-evidence-origin"><div><small>Reportante</small><b>${escapeHtml(head.reporterName||'SIN REPORTANTE')}</b></div><div><small>Lugar</small><b>${escapeHtml(head.location||'SIN LUGAR')}</b></div><div><small>Estado anterior</small><b>${escapeHtml(head.oldStatus||'—')} · ${Number(head.oldProgress||0)}%</b></div></div><div class="historical-evidence-description"><small>Descripción del RAC anterior</small><p>${escapeHtml(head.description||'SIN DESCRIPCIÓN')}</p></div><div class="historical-evidence-files">${items.map(item=>{
          const meta=statusMeta[item.status]||{label:item.status,className:'',detail:''};
          const mime=String(item.mimeType||'').toLowerCase(),isImage=mime.startsWith('image/'),fileLabel=mime.includes('pdf')?'PDF':isImage?'IMG':'FILE';
          const destination=item.targetCode?`RAC destino: <b>${escapeHtml(item.targetCode)}</b>`:'Sin RAC destino seguro';
          const current=item.currentCode&&item.currentCode!==item.targetCode?` · Vinculada actualmente a <b>${escapeHtml(item.currentCode)}</b>`:'';
          return `<div class="historical-evidence-file"><button type="button" class="historical-evidence-preview ${item.fileAvailable?'':'missing'}" ${item.fileAvailable?`data-open-evidence="${item.viewId}"`:'disabled'}><div class="evidence-visual">${isImage&&item.assetId?`<img data-evidence-preview="${item.viewId}" alt="${escapeHtml(item.originalName||'Evidencia')}">`:''}<span class="evidence-file-icon">${fileLabel}</span></div><span>${item.fileAvailable?'Abrir evidencia':'Archivo no disponible'}</span></button><div class="historical-evidence-file-info"><div><span class="tag ${meta.className}">${meta.label}</span><b>${escapeHtml(item.originalName||item.storedName||'EVIDENCIA')}</b></div><small>${escapeHtml(item.evidenceType||'SEGUIMIENTO')} · ${formatDateTime(item.uploadedAt)}</small>${item.comment?`<p>${escapeHtml(item.comment)}</p>`:''}<p class="historical-evidence-match">${destination}${current}<br><span>${escapeHtml(meta.detail)}${item.matchMethod?` Método: ${escapeHtml(item.matchMethod)}.`:''}${item.candidates?.length?` Posibles: ${item.candidates.map(escapeHtml).join(', ')}.`:''}</span></p></div></div>`;
        }).join('')}</div></article>`;
      }).join('')}</div>`:'<div class="empty">No existen evidencias históricas para los filtros seleccionados.</div>';
      await hydrateEvidenceThumbnails(list,evidenceMap);
    }catch(error){summaryBox.innerHTML='';list.innerHTML=errorBox(error);}
  }
  $('#recoverHistoricalEvidence').onclick=async()=>{
    if(!window.confirm('Se recuperarán únicamente las evidencias con coincidencia segura. Las ambiguas y sin coincidencia permanecerán sin cambios. ¿Continuar?'))return;
    const button=$('#recoverHistoricalEvidence');button.disabled=true;button.textContent='Recuperando evidencias…';
    try{const done=await api('/api/racs/reconciliation/evidence-recovery/execute',{method:'POST',body:payload()});toast(`Recuperación completada: ${Number(done.inserted||0)+Number(done.moved||0)} evidencias`);await load();}catch(error){toast(error.message,'error');}finally{button.disabled=false;button.textContent='Recuperar coincidencias seguras';}
  };
  $('#loadHistoricalEvidence').onclick=load;
  $('#historyEvidenceSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  await load();
}

async function changesTab(){
  const box=$('#racOps');
  box.innerHTML=`<section class="panel"><div class="change-list-head"><div><h3>Listado de cambios</h3><div class="panel-sub">Consulta el historial de cada RAC, su información completa y las evidencias cargadas. Pulsa una miniatura para ampliarla.</div></div></div><div class="filter-grid"><div class="field"><label>Unidad</label><select id="changesUnit">${unitOptions()}</select></div><div class="field"><label>Estado actual</label><select id="changesStatus"><option value="">Todos</option>${state.catalogs.racStatuses.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Desde</label><input type="date" id="changesFrom"></div><div class="field"><label>Hasta</label><input type="date" id="changesTo"></div><div class="field"><label>Buscar</label><input id="changesSearch" placeholder="RAC, reportante, lugar, causa o Supervisor"></div><div class="field"><label>&nbsp;</label><button class="btn primary" id="loadChanges">Actualizar cambios</button></div></div><div id="changesList"></div></section>`;
  async function load(){
    const target=$('#changesList');
    target.innerHTML='<div class="page-loading"><span class="spinner"></span>Cargando cambios y evidencias…</div>';
    const q=new URLSearchParams({limit:'250'});
    if($('#changesUnit').value)q.set('businessUnitId',$('#changesUnit').value);
    if($('#changesStatus').value)q.set('status',$('#changesStatus').value);
    if($('#changesFrom').value)q.set('from',$('#changesFrom').value);
    if($('#changesTo').value)q.set('to',$('#changesTo').value);
    if($('#changesSearch').value.trim())q.set('search',$('#changesSearch').value.trim());
    try{
      const rows=await api(`/api/racs/changes?${q}`);
      const evidenceMap=new Map();
      rows.forEach(rac=>(rac.evidence||[]).forEach(item=>evidenceMap.set(Number(item.id),{...item,rac_code:rac.report_code})));
      target.innerHTML=rows.length?`<div class="rac-change-list">${rows.map(rac=>{
        const evidences=(rac.evidence||[]);
        const changes=(rac.changes||[]);
        const evidenceHtml=evidences.length?`<div class="evidence-gallery">${evidences.map(evidence=>{
          const mime=String(evidence.mime_type||'').toLowerCase();
          const image=mime.startsWith('image/');
          const label=mime.includes('pdf')?'PDF':image?'IMG':'FILE';
          return `<button type="button" class="evidence-thumb" data-open-evidence="${evidence.id}" title="Abrir ${escapeHtml(evidence.original_name||'evidencia')}"><div class="evidence-visual">${image?`<img data-evidence-preview="${evidence.id}" alt="${escapeHtml(evidence.original_name||'Evidencia')}">`:''}<span class="evidence-file-icon">${label}</span></div><strong>${escapeHtml(evidence.evidence_type||'SEGUIMIENTO')}</strong><small>${formatDateTime(evidence.uploaded_at)}</small></button>`;
        }).join('')}</div>`:(rac.evidence_required===false?`<div class="empty-evidence exempted"><b>NO REQUIERE EVIDENCIA</b><br>${escapeHtml(rac.evidence_exemption_reason||'Cierre aprobado por SSOMA o Máster.')}</div>`:'<div class="empty-evidence">Todavía no se ha cargado evidencia para este RAC.</div>');
        const timeline=changes.length?changes.map(change=>`<div class="change-event"><i></i><div><div class="change-event-head"><b>${changeTitle(change.action)}</b><span>${formatDateTime(change.created_at)}</span></div><p>${changeDescription(change)}</p><small>Realizado por ${escapeHtml(change.changed_by||'SISTEMA')}</small></div></div>`).join(''):`<div class="change-event"><i></i><div><div class="change-event-head"><b>Registro actual</b><span>${formatDateTime(rac.updated_at||rac.created_at)}</span></div><p>No existe un movimiento auditado anterior para este RAC.</p></div></div>`;
        return `<article class="rac-change-card"><header><div><div class="rac-change-code">${escapeHtml(rac.report_code)}</div><div class="rac-change-source">${escapeHtml(rac.source_report_number||'SIN NÚMERO DE ORIGEN')} · Último cambio ${formatDateTime(rac.last_change_at)}</div></div><div class="rac-change-tags"><span class="tag ${rac.risk_level==='ALTO'?'high':rac.risk_level==='MEDIO'?'medium':'low'}">${escapeHtml(rac.risk_level)}</span>${statusTag(rac.status)}${rac.status==='LEVANTADO'&&rac.evidence_required===false?'<span class="tag exempt">NO REQUIERE EVIDENCIA</span>':''}</div></header><div class="rac-change-grid"><div><small>Unidad</small><b>${escapeHtml(rac.business_unit||'')}</b></div><div><small>Fecha del RAC</small><b>${String(rac.report_date||'').slice(0,10)}</b></div><div><small>Tipo</small><b>${escapeHtml(rac.report_type||'')}</b></div><div><small>Supervisor</small><b>${escapeHtml(rac.supervisor_name||'SIN ASIGNAR')}</b></div><div><small>Área reportante</small><b>${escapeHtml(rac.reporting_area||'')}</b></div><div><small>Área reportada</small><b>${escapeHtml(rac.reported_area||'')}</b></div><div><small>Lugar</small><b>${escapeHtml(rac.location||'—')}</b></div><div><small>Avance</small><b>${Number(rac.progress_percent||0)}%</b></div></div><div class="rac-change-detail"><div><small>Causa / subcausa</small><p><b>${escapeHtml(rac.cause_category||'')}</b> · ${escapeHtml(rac.cause_subtype||rac.deviation_type||'')}</p></div><div><small>Descripción del RAC</small><p>${escapeHtml(rac.description||'')}</p></div>${rac.directed_area?`<div class="direction-detail"><small>Direccionamiento</small><p><b>${escapeHtml(rac.directed_area)}</b> · ${escapeHtml(rac.direction_reason||'Sin motivo registrado')}<br><span>${escapeHtml(rac.directed_by_name||'')} · ${formatDateTime(rac.directed_at)}</span></p></div>`:''}${rac.corrective_action?`<div><small>Acción correctiva</small><p>${escapeHtml(rac.corrective_action)}</p></div>`:''}${rac.evidence_required===false?`<div><small>Excepción de evidencia</small><p><b>NO REQUIERE EVIDENCIA</b> · ${escapeHtml(rac.evidence_exemption_reason||'Sin detalle')}</p></div>`:''}</div><div class="rac-change-columns"><section><h4>Evidencias (${evidences.length})</h4>${evidenceHtml}</section><section><h4>Historial de cambios (${changes.length})</h4><div class="change-timeline">${timeline}</div></section></div></article>`;
      }).join('')}</div>`:'<div class="empty">No hay RACS para los filtros seleccionados.</div>';
      await hydrateEvidenceThumbnails(target,evidenceMap);
    }catch(error){target.innerHTML=errorBox(error);}
  }
  $('#loadChanges').onclick=load;
  $('#changesSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  await load();
}
await render();}
function directionModal(rac,reload){
  if(!can('rac:direct'))return toast('No tienes permiso para direccionar RACS','error');
  const catalog=state.catalogs.racCauseCategories||[];
  const areas=state.catalogs.areas.filter(area=>!area.unit_ids?.length||area.unit_ids.map(Number).includes(Number(rac.business_unit_id)));
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const initialCategory=catalog.find(item=>Number(item.id)===Number(rac.cause_category_id))||catalog.find(item=>normalized(item.name)===normalized(rac.cause_category));
  const areaSelect=(name,selected,required=true)=>`<select name="${name}" ${required?'required':''}><option value="">Seleccionar área</option>${areas.map(area=>`<option value="${area.id}" ${Number(area.id)===Number(selected)?'selected':''}>${escapeHtml(area.name)}</option>`).join('')}</select>`;
  const box=modal(`${rac.directed_area_id?'Editar y redireccionar':'Direccionar'} ${rac.report_code}`,`<form id="directionForm"><div class="alert warn"><b>Uso exclusivo de Máster y SSOMA.</b> Conserva el dato original, corrige la clasificación y define el área que debe levantar la observación.</div><div class="form-grid three"><div class="field"><label>Unidad</label><input value="${escapeHtml(rac.business_unit||'')}" disabled></div><div class="field"><label>Área reportante</label>${areaSelect('reportingAreaId',rac.reporting_area_id)}</div><div class="field"><label>Área reportada</label>${areaSelect('reportedAreaId',rac.reported_area_id)}</div><div class="field"><label>Área direccionada responsable</label>${areaSelect('directedAreaId',rac.directed_area_id||rac.reported_area_id)}</div><div class="field span-2"><label>¿Por qué se direcciona a esta área?</label><textarea name="directionReason" required minlength="5" placeholder="Ejemplo: Mantenimiento debe reparar el equipo y eliminar la condición observada.">${escapeHtml(rac.direction_reason||'')}</textarea></div><div class="field"><label>Nivel de riesgo</label><select name="riskLevel"><option ${rac.risk_level==='BAJO'?'selected':''}>BAJO</option><option ${rac.risk_level==='MEDIO'?'selected':''}>MEDIO</option><option ${rac.risk_level==='ALTO'?'selected':''}>ALTO</option></select></div><div class="field"><label>Tipo de reporte</label><select name="reportType" id="editReportType"><option ${rac.report_type==='CONDICION SUBESTANDAR'?'selected':''}>CONDICION SUBESTANDAR</option><option ${rac.report_type==='ACTO SUBESTANDAR'?'selected':''}>ACTO SUBESTANDAR</option></select></div><div class="field"><label>Tipo de causa</label><select name="causeCategoryId" id="editCauseCategory" required></select><div class="actions compact"><button type="button" class="btn small ghost" id="editNewCategory">＋ Nuevo tipo</button></div></div><div class="field"><label>Subcausa / causa</label><select name="causeSubtypeId" id="editCauseSubtype" required></select><div class="actions compact"><button type="button" class="btn small ghost" id="editNewSubtype">＋ Nueva subcausa</button></div></div><div class="field span-3"><label>Descripción del RAC</label><textarea name="description" required>${escapeHtml(rac.description||'')}</textarea></div><div class="field span-2"><label>Lugar / zona / labor</label><input name="location" value="${escapeHtml(rac.location||'')}"></div><div class="field"><label>Acción correctiva propuesta</label><input name="correctiveAction" value="${escapeHtml(rac.corrective_action||'')}"></div></div><div id="directionCatalogCreator"></div><div class="actions"><button class="btn primary">Guardar corrección y direccionamiento</button></div></form>`);
  const form=box.querySelector('#directionForm'),categorySelect=box.querySelector('#editCauseCategory'),subtypeSelect=box.querySelector('#editCauseSubtype'),reportType=box.querySelector('#editReportType');
  const refreshCategories=selected=>{
    categorySelect.innerHTML='<option value="">Seleccionar tipo de causa</option>'+catalog.map(category=>`<option value="${category.id}" ${Number(category.id)===Number(selected)?'selected':''}>${escapeHtml(category.code)}. ${escapeHtml(category.name)}${category.isCustom?' · PERSONALIZADO':''}</option>`).join('');
    refreshSubtypes(rac.cause_subtype_id);
  };
  const refreshSubtypes=selected=>{
    const category=catalog.find(item=>Number(item.id)===Number(categorySelect.value));
    subtypeSelect.innerHTML='<option value="">Seleccionar subcausa</option>'+((category?.subtypes||[]).map((subtype,index)=>`<option value="${subtype.id}" ${Number(subtype.id)===Number(selected)?'selected':''}>${index+1}. ${escapeHtml(subtype.name)}${subtype.isCustom?' · PERSONALIZADA':''}</option>`).join(''));
    if(category?.reportType)reportType.value=category.reportType;
  };
  categorySelect.onchange=()=>refreshSubtypes('');
  refreshCategories(initialCategory?.id||'');
  const creator=box.querySelector('#directionCatalogCreator');
  const closeCreator=()=>{creator.innerHTML='';};
  const openSubtypeCreator=()=>{
    const category=catalog.find(item=>Number(item.id)===Number(categorySelect.value));
    if(!category)return toast('Selecciona primero un tipo de causa','error');
    creator.innerHTML=`<section class="inline-catalog-editor"><div><b>Nueva subcausa</b><small>${escapeHtml(category.code)}. ${escapeHtml(category.name)}</small></div><form id="directionSubtypeForm" class="inline-form"><input name="name" maxlength="220" required placeholder="Nombre de la nueva subcausa"><button class="btn small primary">Guardar</button><button type="button" class="btn small ghost" data-cancel-catalog>Cancelar</button></form></section>`;
    creator.querySelector('[data-cancel-catalog]').onclick=closeCreator;
    creator.querySelector('#directionSubtypeForm').onsubmit=async event=>{
      event.preventDefault();
      try{
        const created=await api('/api/racs/cause-subtypes',{method:'POST',body:{categoryId:category.id,name:event.currentTarget.elements.name.value}});
        category.subtypes.push({id:created.id,name:created.name,isCustom:true,sortOrder:created.sortOrder});
        category.subtypes.sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999)||a.name.localeCompare(b.name));
        closeCreator();refreshSubtypes(created.id);toast('Nueva subcausa registrada');
      }catch(error){toast(error.message,'error');}
    };
  };
  box.querySelector('#editNewSubtype').onclick=openSubtypeCreator;
  box.querySelector('#editNewCategory').onclick=()=>{
    creator.innerHTML=`<section class="inline-catalog-editor"><div><b>Nuevo tipo de causa</b><small>Quedará disponible en todo CAPSAN6.</small></div><form id="directionCategoryForm" class="inline-form wide"><input name="name" maxlength="180" required placeholder="Nombre del tipo de causa"><select name="reportType"><option>CONDICION SUBESTANDAR</option><option>ACTO SUBESTANDAR</option></select><input name="code" maxlength="10" placeholder="Código opcional"><button class="btn small primary">Guardar</button><button type="button" class="btn small ghost" data-cancel-catalog>Cancelar</button></form></section>`;
    creator.querySelector('[data-cancel-catalog]').onclick=closeCreator;
    creator.querySelector('#directionCategoryForm').onsubmit=async event=>{
      event.preventDefault();
      try{
        const created=await api('/api/racs/cause-categories',{method:'POST',body:formData(event.currentTarget)});
        catalog.push({...created,subtypes:created.subtypes||[]});
        catalog.sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999)||String(a.code).localeCompare(String(b.code)));
        closeCreator();refreshCategories(created.id);toast('Nuevo tipo registrado. Agrega su primera subcausa.');setTimeout(openSubtypeCreator,50);
      }catch(error){toast(error.message,'error');}
    };
  };
  form.onsubmit=async event=>{event.preventDefault();if(!categorySelect.value||!subtypeSelect.value)return toast('Selecciona tipo de causa y subcausa','error');try{await api(`/api/racs/${rac.id}/direction`,{method:'PATCH',body:formData(event.currentTarget)});toast('RAC corregido y direccionado');box.remove();reload();}catch(error){toast(error.message,'error');}};
}

function statusModal(rac,reload){
  const validator=can('rac:validate');
  const box=modal(`Actualizar ${rac.report_code}`,`<form id="statusForm"><div class="field"><label>Nuevo estado</label><select name="status" id="racStatusSelect"><option>PENDIENTE</option><option>EN PROCESO</option><option>PENDIENTE DE VALIDACION</option>${validator?'<option>DEVUELTO PARA CORRECCION</option><option>LEVANTADO</option>':''}</select></div><div class="field"><label>Comentario / acción realizada</label><textarea name="comment" id="racStatusComment"></textarea></div><div class="field" id="racEvidenceField"><label>Evidencia</label><input type="file" name="evidence" id="racEvidenceInput" accept="image/*,.pdf"><small class="muted">Para cierres normales, adjunta evidencia final.</small></div>${validator?`<div class="field" id="noEvidenceBlock" hidden><label class="check"><input type="checkbox" name="noEvidenceRequired" value="true" id="noEvidenceRequired" ${rac.evidence_required===false?'checked':''}> Este RAC no requiere evidencia para su cierre</label><small class="muted">Solo SSOMA o Máster puede aprobar esta excepción. La justificación en el comentario es obligatoria.</small></div>`:''}<div class="alert warn" id="evidenceRuleMessage">El cierre LEVANTADO requiere evidencia final, salvo excepción aprobada por SSOMA o Máster.</div><button class="btn primary">Guardar seguimiento</button></form>`);
  const form=box.querySelector('#statusForm'),status=form.querySelector('#racStatusSelect'),file=form.querySelector('#racEvidenceInput'),exception=form.querySelector('#noEvidenceRequired'),block=form.querySelector('#noEvidenceBlock'),message=form.querySelector('#evidenceRuleMessage'),comment=form.querySelector('#racStatusComment');
  status.value=rac.status||'PENDIENTE';
  const sync=()=>{
    const lifted=status.value==='LEVANTADO';
    if(block)block.hidden=!lifted;
    if(exception){if(!lifted)exception.checked=false;file.disabled=lifted&&exception.checked;}
    if(message)message.textContent=lifted?(exception?.checked?'Este cierre quedará registrado como “NO REQUIERE EVIDENCIA”. Explica el motivo en el comentario.':'Adjunta evidencia final o marca la excepción “No requiere evidencia”.'):'La evidencia se guarda como seguimiento; para solicitar validación debe existir evidencia final.';
    if(comment)comment.required=Boolean(lifted&&exception?.checked);
  };
  status.onchange=sync;if(exception)exception.onchange=sync;sync();
  form.onsubmit=async e=>{e.preventDefault();try{await api(`/api/racs/${rac.id}/status`,{method:'POST',body:new FormData(e.currentTarget)});toast(exception?.checked?'RAC levantado: no requiere evidencia':'Seguimiento actualizado');box.remove();reload();}catch(err){toast(err.message,'error')}};
}
function assignModal(rac,reload){const supervisors=state.catalogs.users.filter(x=>x.role==='SUPERVISOR'&&x.unit_ids.map(Number).includes(Number(rac.business_unit_id)));const box=modal(`Asignar ${rac.report_code}`,`<form id="assignForm"><div class="field"><label>Supervisor de la unidad</label><select name="supervisorUserId">${supervisors.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}</select></div><button class="btn primary">Asignar</button></form>`);box.querySelector('#assignForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/racs/${rac.id}/assign`,{method:'POST',body:formData(e.currentTarget)});toast('RAC asignado');box.remove();reload();}catch(err){toast(err.message,'error')}};}
