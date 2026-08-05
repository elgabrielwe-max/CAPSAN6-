import { api,download,preview } from '../api.js';
import { state,can,unitOptions,areaOptions,escapeHtml } from '../state.js';
import { $,formData,table,kpi,bars,toast,errorBox,modal } from '../ui.js';

const selectedValues=sel=>[...sel.selectedOptions].map(x=>Number(x.value)).filter(Boolean);
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const trainingFileAccept='.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp';
const fileIcon=file=>{
  const mime=String(file.mime_type||'').toLowerCase(),name=String(file.original_name||'').toLowerCase();
  if(mime.includes('pdf')||name.endsWith('.pdf'))return 'PDF';
  if(mime.startsWith('image/')||/\.(png|jpe?g|webp)$/.test(name))return 'IMG';
  if(mime.includes('word')||/\.docx?$/.test(name))return 'DOC';
  if(mime.includes('excel')||mime.includes('spreadsheet')||/\.xlsx?$/.test(name))return 'XLS';
  return 'DOC';
};
const formatDate=value=>value?new Date(value).toLocaleString('es-PE'):'Sin fecha';
const formatPeriod=training=>`${escapeHtml(training.start_date||'Sin inicio')} — ${escapeHtml(training.end_date||'Sin límite')}`;
const targetKey=target=>`${Number(target.businessUnitId)}|${target.areaId?Number(target.areaId):''}`;
const targetLabel=target=>`${target.businessUnit}${target.area?` · ${target.area}`:' · unidad completa'}`;
const uniqueTargets=targets=>{
  const seen=new Set();return (targets||[]).filter(target=>{const key=targetKey(target);if(seen.has(key))return false;seen.add(key);return true;});
};

function documentCards(files=[]){
  if(!files.length)return '<div class="training-file-empty">Aún no se adjuntó una lista de asistentes para esta asignación.</div>';
  return `<div class="training-file-grid">${files.map(file=>`<article class="training-file-card"><div class="training-file-icon">${fileIcon(file)}</div><div class="training-file-info"><b title="${escapeHtml(file.original_name)}">${escapeHtml(file.original_name)}</b><small>${escapeHtml(file.business_unit_name||'')} ${file.area_name?`· ${escapeHtml(file.area_name)}`:'· unidad completa'}</small><small>${escapeHtml(file.uploaded_by_name||'Usuario')} · ${formatDate(file.created_at)}</small></div><div class="training-file-actions"><button type="button" class="btn small primary" data-preview-file="${file.file_asset_id}" data-file-name="${escapeHtml(file.original_name)}" data-file-mime="${escapeHtml(file.mime_type||'')}">Ver</button><button type="button" class="btn small ghost" data-download-file="${file.file_asset_id}" data-file-name="${escapeHtml(file.original_name)}">Descargar</button></div></article>`).join('')}</div>`;
}
function bindDocumentActions(root=document){
  root.querySelectorAll('[data-preview-file]').forEach(button=>button.onclick=()=>preview(`/api/files/${button.dataset.previewFile}`,button.dataset.fileName,button.dataset.fileMime).catch(error=>toast(error.message,'error')));
  root.querySelectorAll('[data-download-file]').forEach(button=>button.onclick=()=>download(`/api/files/${button.dataset.downloadFile}`,button.dataset.fileName).catch(error=>toast(error.message,'error')));
}

export async function trainingPlanPage(root){
  if(!can('training:manage'))throw new Error('No tienes permiso para planificar capacitaciones');
  let trainings=await api('/api/trainings');let activeTrainingId=null;
  root.innerHTML=`<div class="page-head"><div><h2>Planificación de capacitación</h2><p>Registra el tema una vez, asigna su alcance y conserva la lista de asistentes dentro del mismo expediente.</p></div></div><div class="grid-2 training-plan-grid"><section class="panel"><h3>Nuevo tema / actualización</h3><div class="panel-sub">Los trabajadores se vinculan automáticamente según unidad y área.</div><form id="trainingForm"><input type="hidden" name="id"><div class="form-grid two"><div class="field span-2"><label>Tema</label><input name="title" required></div><div class="field span-2"><label>Contenido</label><textarea name="description"></textarea></div><div class="field span-2"><label>Evaluación / criterio</label><input name="evaluationTopic"></div><div class="field"><label>Inicio</label><input type="date" name="startDate"></div><div class="field"><label>Fecha límite</label><input type="date" name="endDate"></div><div class="field"><label>Nota aprobatoria</label><input type="number" name="approvedMin" value="16" min="0" max="20" step="0.1"></div><div class="field"><label>Estado</label><select name="status"><option>PROGRAMADO</option><option>EN EJECUCION</option><option>CERRADO</option><option>BORRADOR</option></select></div><div class="field"><label>Unidades de negocio</label><select id="targetUnits" multiple size="6">${state.catalogs.units.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}</select></div><div class="field"><label>Áreas (vacío = unidad completa)</label><select id="targetAreas" multiple size="6">${state.catalogs.areas.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}</select></div></div><button class="btn primary">Guardar tema y asignación</button> <button type="button" class="btn ghost" id="clearTraining">Limpiar</button></form><div class="training-document-box" id="trainingDocumentBox"><div class="training-document-heading"><div><h4>Lista de asistentes / documento rellenado</h4><p>Guarda o edita un tema para adjuntar PDF, imagen, Word o Excel a una unidad y área.</p></div><span class="tag">SIN TEMA ACTIVO</span></div><div id="trainingDocumentManager" class="training-document-disabled">Selecciona “Editar” o guarda un tema para habilitar esta sección.</div></div></section><section class="panel"><h3>Carga masiva de temas</h3><div class="panel-sub">Encabezados adaptativos: TEMA, UNIDAD, ÁREA, FECHA INICIO, FECHA FIN y NOTA APROBATORIA.</div><form id="topicImport"><div class="dropzone"><input type="file" name="file" accept=".xlsx,.xls" required></div><button class="btn amber">Importar temas</button></form><div class="training-help-card"><b>Expediente digital de capacitación</b><p>Cada tema puede conservar varias listas de asistencia, separadas por unidad o área. Los archivos quedan disponibles para consulta y descarga.</p></div></section></div><section class="panel"><div class="training-list-head"><div><h3>Temas y asignaciones</h3><p class="panel-sub">Vista compacta. Abre el detalle únicamente cuando lo necesites.</p></div><div class="training-list-filters"><input id="trainingSearch" type="search" placeholder="Buscar tema o unidad"><select id="trainingStatus"><option value="">Todos los estados</option><option>PROGRAMADO</option><option>EN EJECUCION</option><option>CERRADO</option><option>BORRADOR</option></select></div></div><div id="trainingList"></div></section>`;

  const currentTraining=()=>trainings.find(item=>Number(item.id)===Number(activeTrainingId));
  function compactTargets(training){
    const targets=uniqueTargets(training.targets),shown=targets.slice(0,3),extra=Math.max(0,targets.length-shown.length);
    return `<div class="training-target-chips">${shown.map(target=>`<span>${escapeHtml(targetLabel(target))}</span>`).join('')}${extra?`<button type="button" class="training-more-chip" data-targets="${training.id}">+${extra} más</button>`:''}</div>`;
  }
  function render(){
    const query=norm($('#trainingSearch')?.value),status=$('#trainingStatus')?.value;
    const visible=trainings.filter(training=>(!status||training.status===status)&&(!query||norm(`${training.title} ${training.description||''} ${(training.targets||[]).map(targetLabel).join(' ')}`).includes(query)));
    $('#trainingList').innerHTML=visible.length?`<div class="training-card-grid">${visible.map(training=>`<article class="training-topic-card"><header><div><span class="tag ${training.status==='CERRADO'?'done':training.status==='BORRADOR'?'medium':''}">${escapeHtml(training.status)}</span><h4>${escapeHtml(training.title)}</h4></div><div class="training-topic-count">${Number(training.graded||0)}<small>notas</small></div></header><p class="training-topic-description">${escapeHtml(training.description||'Sin descripción registrada.')}</p>${compactTargets(training)}<div class="training-topic-meta"><span><b>${uniqueTargets(training.targets).length}</b> asignaciones</span><span><b>${Number(training.attendance_files||0)}</b> documentos</span><span><b>${escapeHtml(training.approved_min||16)}</b> nota mínima</span></div><div class="training-topic-period">${formatPeriod(training)}</div><footer><button type="button" class="btn small" data-detail="${training.id}">Ver detalle</button><button type="button" class="btn small amber" data-documents="${training.id}">Documentos${Number(training.attendance_files||0)?` (${training.attendance_files})`:''}</button><button type="button" class="btn small primary" data-edit="${training.id}">Editar</button></footer></article>`).join('')}</div>`:'<div class="training-empty-state"><b>No hay temas con esos filtros.</b><span>Registra un tema nuevo o cambia la búsqueda.</span></div>';
    bindListActions();
  }
  function openAssignments(training){
    const targets=uniqueTargets(training.targets);const box=modal(`Asignaciones · ${training.title}`,`<div class="training-detail-grid"><div><small>Estado</small><b>${escapeHtml(training.status)}</b></div><div><small>Periodo</small><b>${formatPeriod(training)}</b></div><div><small>Nota mínima</small><b>${escapeHtml(training.approved_min||16)}</b></div><div><small>Trabajadores con nota</small><b>${Number(training.graded||0)}</b></div></div><div class="training-detail-section"><h4>Unidades y áreas asignadas</h4><div class="training-assignment-grid">${targets.map(target=>`<div><b>${escapeHtml(target.businessUnit)}</b><span>${escapeHtml(target.area||'Unidad completa')}</span></div>`).join('')}</div></div>`);return box;
  }
  function openDetail(training){
    const box=openAssignments(training);box.querySelector('.modal-body').insertAdjacentHTML('afterbegin',`<div class="training-detail-section"><h4>${escapeHtml(training.title)}</h4><p>${escapeHtml(training.description||'Sin contenido registrado.')}</p>${training.evaluation_topic?`<div class="alert info"><b>Evaluación / criterio:</b> ${escapeHtml(training.evaluation_topic)}</div>`:''}</div>`);
  }
  function bindListActions(){
    document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>editTraining(Number(button.dataset.edit)));
    document.querySelectorAll('[data-detail]').forEach(button=>openDetail(trainings.find(item=>Number(item.id)===Number(button.dataset.detail))));
    document.querySelectorAll('[data-documents]').forEach(button=>openDocumentsModal(trainings.find(item=>Number(item.id)===Number(button.dataset.documents))));
    document.querySelectorAll('[data-targets]').forEach(button=>openAssignments(trainings.find(item=>Number(item.id)===Number(button.dataset.targets))));
  }
  function editTraining(id){
    const training=trainings.find(item=>Number(item.id)===Number(id));if(!training)return;
    activeTrainingId=training.id;const form=$('#trainingForm');
    for(const [key,value] of Object.entries({id:training.id,title:training.title,description:training.description||'',evaluationTopic:training.evaluation_topic||'',startDate:training.start_date||'',endDate:training.end_date||'',approvedMin:training.approved_min,status:training.status}))if(form.elements[key])form.elements[key].value=value;
    const unitIds=new Set(training.targets.map(target=>Number(target.businessUnitId))),areaIds=new Set(training.targets.map(target=>Number(target.areaId)).filter(Boolean));
    [...$('#targetUnits').options].forEach(option=>option.selected=unitIds.has(Number(option.value)));[...$('#targetAreas').options].forEach(option=>option.selected=areaIds.has(Number(option.value)));
    renderDocumentManager();scrollTo({top:0,behavior:'smooth'});
  }
  function targetOptions(training){return uniqueTargets(training.targets).map(target=>`<option value="${targetKey(target)}">${escapeHtml(targetLabel(target))}</option>`).join('');}
  async function fetchTargetFiles(training,targetValue){
    const [unitId,areaId]=String(targetValue||'').split('|');if(!unitId)return [];
    return api(`/api/trainings/${training.id}/attendance-files?businessUnitId=${unitId}&areaId=${areaId||''}`);
  }
  async function renderTargetFiles(container,training,targetValue){
    container.innerHTML='<div class="page-loading">Cargando documentos…</div>';
    try{const files=await fetchTargetFiles(training,targetValue);container.innerHTML=documentCards(files);bindDocumentActions(container);}catch(error){container.innerHTML=errorBox(error);}
  }
  function documentManagerMarkup(training,prefix='plan'){
    return `<div class="training-document-controls"><div class="field"><label>Asignación del documento</label><select id="${prefix}DocumentTarget">${targetOptions(training)}</select></div><div class="field"><label>Archivo rellenado</label><input id="${prefix}DocumentFile" type="file" accept="${trainingFileAccept}"><small class="muted">PDF, imagen, Word o Excel · máximo 20 MB.</small></div><button type="button" class="btn amber" id="${prefix}UploadDocument">Subir documento</button></div><div id="${prefix}DocumentFiles" class="training-document-files"></div>`;
  }
  function bindDocumentManager(container,training,prefix,onUploaded){
    const target=container.querySelector(`#${prefix}DocumentTarget`),filesBox=container.querySelector(`#${prefix}DocumentFiles`),fileInput=container.querySelector(`#${prefix}DocumentFile`),uploadButton=container.querySelector(`#${prefix}UploadDocument`);
    const refresh=()=>renderTargetFiles(filesBox,training,target.value);target.onchange=refresh;
    uploadButton.onclick=async()=>{
      const file=fileInput.files[0];if(!file)return toast('Selecciona la lista de asistentes o documento rellenado','error');const [businessUnitId,areaId]=target.value.split('|');
      uploadButton.disabled=true;uploadButton.textContent='Subiendo…';try{const fd=new FormData();fd.append('file',file);fd.append('businessUnitId',businessUnitId);if(areaId)fd.append('areaId',areaId);await api(`/api/trainings/${training.id}/attendance-files`,{method:'POST',body:fd});toast('Documento de capacitación guardado');fileInput.value='';trainings=await api('/api/trainings');training=trainings.find(item=>Number(item.id)===Number(training.id))||training;render();await refresh();if(onUploaded)onUploaded(training);}catch(error){toast(error.message,'error')}finally{uploadButton.disabled=false;uploadButton.textContent='Subir documento';}
    };refresh();
  }
  function renderDocumentManager(){
    const training=currentTraining(),box=$('#trainingDocumentBox'),manager=$('#trainingDocumentManager');
    if(!training){box.querySelector('.tag').textContent='SIN TEMA ACTIVO';manager.className='training-document-disabled';manager.textContent='Selecciona “Editar” o guarda un tema para habilitar esta sección.';return;}
    box.querySelector('.tag').textContent=training.title;manager.className='';manager.innerHTML=documentManagerMarkup(training,'plan');bindDocumentManager(manager,training,'plan');
  }
  function openDocumentsModal(training){
    const box=modal(`Documentos · ${training.title}`,`<p class="muted">Adjunta y consulta las listas de asistentes por unidad o área.</p>${documentManagerMarkup(training,'modal')}`);bindDocumentManager(box,training,'modal',updated=>{const label=$('#trainingDocumentBox .tag');if(label&&Number(updated.id)===Number(activeTrainingId))label.textContent=updated.title;});
  }

  $('#trainingSearch').oninput=render;$('#trainingStatus').onchange=render;render();
  $('#clearTraining').onclick=()=>{$('#trainingForm').reset();$('#trainingForm').elements.id.value='';activeTrainingId=null;renderDocumentManager();};
  $('#trainingForm').onsubmit=async event=>{
    event.preventDefault();const data=formData(event.currentTarget),units=selectedValues($('#targetUnits')),areas=selectedValues($('#targetAreas'));if(!units.length)return toast('Selecciona al menos una unidad','error');
    data.targets=areas.length?units.flatMap(unit=>areas.map(area=>({businessUnitId:unit,areaId:area}))):units.map(unit=>({businessUnitId:unit,areaId:null}));data.enabled=true;
    try{const saved=await api('/api/trainings',{method:'POST',body:data});toast('Tema y asignaciones guardados');trainings=await api('/api/trainings');activeTrainingId=saved.id;render();renderDocumentManager();$('#trainingForm').elements.id.value=saved.id;}catch(error){toast(error.message,'error')}
  };
  $('#topicImport').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);try{const result=await api('/api/trainings/import/topics',{method:'POST',body:fd});toast(`${result.inserted} temas importados`);trainings=await api('/api/trainings');render();}catch(error){toast(error.message,'error')}};
}

export async function trainingGradesPage(root){
  const trainings=await api('/api/trainings');
  root.innerHTML=`<div class="page-head"><div><h2>Registro de notas por área asignada</h2><p>El tema define automáticamente las unidades y áreas habilitadas. Busca por DNI o nombre y adjunta la lista oficial de asistentes.</p></div></div><section class="panel"><div class="filter-grid"><div class="field"><label>Tema</label><select id="gradeTraining"><option value="">Seleccionar</option>${trainings.map(x=>`<option value="${x.id}">${escapeHtml(x.title)}</option>`).join('')}</select></div><div class="field"><label>Unidad asignada</label><select id="gradeUnit"><option value="">Selecciona primero el tema</option></select></div><div class="field"><label>Área asignada</label><select id="gradeArea"><option value="">Selecciona primero la unidad</option></select></div><div class="field"><label>&nbsp;</label><button class="btn primary" id="loadRoster">Cargar personal</button></div></div></section><section class="panel"><form id="gradesForm"><div id="roster"><p class="muted">Selecciona el tema, la unidad y el área asignada.</p></div></form></section>`;
  const selectedTraining=()=>trainings.find(x=>Number(x.id)===Number($('#gradeTraining').value));
  const assignedTargets=(training,unitId)=>Array.isArray(training?.targets)?training.targets.filter(target=>Number(target.businessUnitId)===Number(unitId)):[];
  function refreshUnits(){const training=selectedTraining(),unique=new Map();for(const target of training?.targets||[])unique.set(Number(target.businessUnitId),target.businessUnit);$('#gradeUnit').innerHTML='<option value="">Seleccionar unidad</option>'+[...unique.entries()].map(([id,name])=>`<option value="${id}">${escapeHtml(name)}</option>`).join('');$('#gradeArea').innerHTML='<option value="">Selecciona primero la unidad</option>';$('#roster').innerHTML='<p class="muted">Selecciona la unidad y el área asignada.</p>';}
  function refreshAreas(){const training=selectedTraining(),unitId=$('#gradeUnit').value,targets=assignedTargets(training,unitId),unitWide=targets.some(target=>!target.areaId),specific=targets.filter(target=>target.areaId),options=[];if(unitWide)options.push('<option value="">Todas las áreas de la unidad</option>');else if(specific.length>1)options.push('<option value="">Todas las áreas asignadas</option>');options.push(...specific.map(target=>`<option value="${target.areaId}">${escapeHtml(target.area)}</option>`));$('#gradeArea').innerHTML=options.length?options.join(''):'<option value="">Sin áreas asignadas</option>';$('#roster').innerHTML='<p class="muted">Pulsa “Cargar personal” para abrir la matriz de notas.</p>';}
  $('#gradeTraining').onchange=refreshUnits;$('#gradeUnit').onchange=refreshAreas;
  async function loadAttendanceFiles(trainingId,unitId,areaId){
    const files=await api(`/api/trainings/${trainingId}/attendance-files?businessUnitId=${unitId}&areaId=${areaId}`),box=$('#attendanceFiles');if(!box)return;box.innerHTML=documentCards(files);bindDocumentActions(box);
  }
  async function loadRoster(){
    const trainingId=$('#gradeTraining').value,unitId=$('#gradeUnit').value,areaId=$('#gradeArea').value;if(!trainingId||!unitId)return toast('Selecciona tema y unidad asignada','error');
    try{
      const data=await api(`/api/trainings/${trainingId}/roster?businessUnitId=${unitId}&areaId=${areaId}`);
      const rows=data.workers.map(worker=>`<tr data-roster-row data-search="${escapeHtml(norm(`${worker.dni} ${worker.full_name} ${worker.area} ${worker.position||''}`))}"><td>${escapeHtml(worker.dni)}</td><td>${escapeHtml(worker.full_name)}</td><td>${escapeHtml(worker.area)}</td><td>${escapeHtml(worker.position||'')}</td><td><input class="score" type="number" min="${data.training.score_min}" max="${data.training.score_max}" step="0.1" value="${worker.score??''}" data-worker="${worker.id}" style="width:90px"></td><td><select class="attendance" data-worker="${worker.id}"><option ${worker.attendance_status==='ASISTIO'?'selected':''}>ASISTIO</option><option ${worker.attendance_status==='NO ASISTIO'?'selected':''}>NO ASISTIO</option><option ${worker.attendance_status==='JUSTIFICADO'?'selected':''}>JUSTIFICADO</option></select></td><td>${worker.result?`<span class="tag ${worker.result==='APROBADO'?'done':'high'}">${worker.result}</span>`:''}</td></tr>`);
      $('#roster').innerHTML=`<div class="grade-head"><div><h3>${escapeHtml(data.training.title)}</h3><p>Nota aprobatoria: <b>${data.training.approved_min||16}</b> · <b id="visibleRosterCount">${data.workers.length}</b> de ${data.workers.length} trabajadores visibles</p></div><button class="btn primary" type="submit">Guardar todas las notas</button></div><div class="grade-toolbar"><div class="field roster-search"><label>Buscador por DNI, nombre, cargo o área</label><input id="rosterSearch" type="search" inputmode="numeric" placeholder="Escribe el DNI o nombre" autocomplete="off"></div><div class="attendance-upload"><div class="field"><label>Lista oficial de asistentes / documento rellenado</label><input id="attendancePdf" type="file" accept="${trainingFileAccept}"><small class="muted">PDF, imagen, Word o Excel.</small></div><button type="button" class="btn amber" id="uploadAttendancePdf">Subir documento</button></div></div><div id="attendanceFiles" class="training-document-files"></div>${table(['DNI','Trabajador','Área','Cargo','Nota','Asistencia','Resultado'],rows)}`;
      const search=$('#rosterSearch');search.oninput=()=>{const query=norm(search.value);let visible=0;document.querySelectorAll('[data-roster-row]').forEach(row=>{const show=!query||row.dataset.search.includes(query);row.hidden=!show;if(show)visible++;});$('#visibleRosterCount').textContent=visible;};search.focus();
      $('#uploadAttendancePdf').onclick=async()=>{const file=$('#attendancePdf').files[0];if(!file)return toast('Selecciona la lista de asistentes o documento rellenado','error');const button=$('#uploadAttendancePdf');button.disabled=true;button.textContent='Subiendo…';try{const fd=new FormData();fd.append('file',file);fd.append('businessUnitId',unitId);if(areaId)fd.append('areaId',areaId);await api(`/api/trainings/${trainingId}/attendance-files`,{method:'POST',body:fd});toast('Documento de asistencia guardado');$('#attendancePdf').value='';await loadAttendanceFiles(trainingId,unitId,areaId);}catch(error){toast(error.message,'error')}finally{button.disabled=false;button.textContent='Subir documento';}};
      $('#gradesForm').onsubmit=async event=>{event.preventDefault();const grades=[...document.querySelectorAll('.score')].map(input=>({workerId:Number(input.dataset.worker),score:input.value,attendanceStatus:document.querySelector(`.attendance[data-worker="${input.dataset.worker}"]`).value}));try{const result=await api(`/api/trainings/${trainingId}/grades`,{method:'POST',body:{grades}});toast(`${result.saved} notas guardadas`);await loadRoster();}catch(error){toast(error.message,'error')}};
      await loadAttendanceFiles(trainingId,unitId,areaId);
    }catch(error){$('#roster').innerHTML=errorBox(error)}
  }
  $('#loadRoster').onclick=loadRoster;
}

export async function trainingDashboardPage(root){
  const trainings=await api('/api/trainings');
  root.innerHTML=`<div class="page-head"><div><h2>Dashboard especializado de capacitación</h2><p>Cumplimiento de capacitaciones, notas, capacitados y aprobación por área.</p></div><div class="actions"><button class="btn primary" id="trainingExcel">Excel Ejecutivo</button></div></div><section class="panel"><form id="trainingFilters" class="filter-grid"><div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Área</label><select name="areaId">${areaOptions()}</select></div><div class="field"><label>Tema</label><select name="trainingId"><option value="">Todos</option>${trainings.map(x=>`<option value="${x.id}">${escapeHtml(x.title)}</option>`).join('')}</select></div><div class="field"><label>&nbsp;</label><button class="btn primary">Aplicar filtros</button></div></form></section><div id="trainingDash"></div>`;
  const queryString=()=>new URLSearchParams(formData($('#trainingFilters'))).toString();
  async function load(){const data=await api(`/api/trainings/dashboard/summary?${queryString()}`);$('#trainingDash').innerHTML=`<div class="kpi-grid">${kpi('% capacitaciones',`${data.kpis.trainingCompliance}%`,'Ejecución esperada','teal')}${kpi('% notas',`${data.kpis.gradeCompliance}%`,'Registro de evaluaciones','navy')}${kpi('% capacitados',`${data.kpis.trainedPercent}%`,'Personal evaluado','amber')}${kpi('% aprobación',`${data.kpis.approvalPercent}%`,'Resultados aprobados','green')}${kpi('Promedio',data.kpis.average||0,'Nota general','coral')}${kpi('Pendientes',Number(data.kpis.expected)-Number(data.kpis.graded),'Sin nota','red')}</div><div class="grid-2"><section class="panel"><h3>Cumplimiento por área</h3>${bars(data.byArea.map(x=>({name:x.name,total:x.compliance})))}</section><section class="panel"><h3>Cumplimiento por tema</h3>${bars(data.byTopic.map(x=>({name:x.title,total:x.compliance})))}</section></div>${table(['Área','Programados','Evaluados','Aprobados','Promedio','Cumplimiento','Aprobación'],data.byArea.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.expected}</td><td>${x.graded}</td><td>${x.approved}</td><td>${x.average||0}</td><td>${x.compliance}%</td><td>${x.approval}%</td></tr>`))}`;}
  $('#trainingFilters').onsubmit=event=>{event.preventDefault();load()};$('#trainingExcel').onclick=()=>download(`/api/reports/training/executive.xlsx?${queryString()}`,'CAPSAN6_REPORTE_EJECUTIVO_CAPACITACION.xlsx').catch(error=>toast(error.message,'error'));await load();
}
