import { api,download,session } from '../api.js';
import { state,unitOptions,escapeHtml } from '../state.js';
import { $,formData,kpi,bars,table,toast,modal,errorBox } from '../ui.js';

const dateOnly=value=>String(value||'').slice(0,10)||'—';
const dateTime=value=>{
  if(!value)return '—';
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?escapeHtml(String(value)):parsed.toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'});
};
const asArray=value=>{
  if(Array.isArray(value))return value;
  if(!value)return [];
  try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [];}
};
const compactText=(value,max=92)=>{
  const text=String(value||'').trim();
  return text.length>max?`${text.slice(0,max-1)}…`:text;
};
const formatBytes=value=>{
  const bytes=Number(value||0);
  if(!bytes)return '—';
  const units=['B','KB','MB','GB'];
  const level=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1);
  return `${(bytes/(1024**level)).toFixed(level?1:0)} ${units[level]}`;
};
const planStatus=status=>{
  const normalized=String(status||'PLANIFICADO').toUpperCase();
  const tone=normalized==='COMPLETADO'?'done':normalized==='EN EJECUCION'?'pending':'';
  return `<span class="tag ${tone}">${escapeHtml(normalized)}</span>`;
};
const safeExternalUrl=value=>/^https?:\/\//i.test(String(value||''))?String(value):'';

export async function ssomaPage(root){
  let plans=[];
  let evidences=[];

  root.innerHTML=`
    <div class="page-head">
      <div>
        <h2>Control SSOMA como equipo</h2>
        <p>Plan de trabajo del día siguiente, pendientes por unidad y evidencias de cumplimiento.</p>
      </div>
    </div>
    <div id="ssomaDash"></div>
    <div class="grid-2">
      <section class="panel">
        <h3>Plan de trabajo</h3>
        <form id="planForm">
          <div class="form-grid two">
            <div class="field"><label>Fecha del plan</label><input type="date" name="planDate" value="${new Date(Date.now()+86400000).toISOString().slice(0,10)}"></div>
            <div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div>
            <div class="field span-2"><label>Objetivo</label><textarea name="objective" required></textarea></div>
            <div class="field span-2"><label>Actividades (una por línea)</label><textarea name="activitiesText"></textarea></div>
            <div class="field"><label>Estado</label><select name="status"><option>PLANIFICADO</option><option>EN EJECUCION</option><option>COMPLETADO</option></select></div>
          </div>
          <button class="btn primary">Guardar plan</button>
        </form>
      </section>
      <section class="panel">
        <h3>Subir evidencia SSOMA</h3>
        <form id="ssomaEvidence">
          <div class="form-grid two">
            <div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div>
            <div class="field"><label>Fecha</label><input type="date" name="evidenceDate" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="field"><label>RAC relacionado (ID opcional)</label><input name="racId" type="number"></div>
            <div class="field"><label>Título</label><input name="title" required></div>
            <div class="field span-2"><label>Descripción del cumplimiento</label><textarea name="description" placeholder="Describe qué actividad se cumplió, el resultado y cualquier observación."></textarea></div>
            <div class="field span-2"><label>Archivo</label><input type="file" name="file" required></div>
          </div>
          <button class="btn amber">Subir evidencia</button>
        </form>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h3>Planes recientes</h3><div class="panel-sub">Abre cada registro para ver el objetivo, actividades y evidencias asociadas.</div><div id="plans"></div></section>
      <section class="panel"><h3>Evidencias recientes</h3><div class="panel-sub">Vista completa, previsualización y descarga del archivo de cumplimiento.</div><div id="evidence"></div></section>
    </div>`;

  const matchingEvidence=plan=>evidences.filter(item=>
    Number(item.business_unit_id)===Number(plan.business_unit_id)&&dateOnly(item.evidence_date)===dateOnly(plan.plan_date)
  );

  const bindEvidenceButtons=(scope=document)=>{
    scope.querySelectorAll('[data-view-evidence]').forEach(button=>{
      button.onclick=()=>openEvidence(evidences.find(item=>Number(item.id)===Number(button.dataset.viewEvidence)));
    });
  };

  const openPlan=plan=>{
    if(!plan)return toast('No se encontró el plan','error');
    const activities=asArray(plan.activities);
    const pending=asArray(plan.pending_summary);
    const related=matchingEvidence(plan);
    const evidenceCards=related.length?related.map(item=>`
      <article class="ssoma-linked-evidence">
        <div><b>${escapeHtml(item.title||'Evidencia')}</b><small>${dateOnly(item.evidence_date)} · ${escapeHtml(item.report_code||'Sin RAC relacionado')}</small></div>
        <button type="button" class="btn small primary" data-view-evidence="${Number(item.id)}">Ver evidencia</button>
      </article>`).join(''):'<div class="empty-evidence">No hay evidencias registradas para esta unidad y fecha.</div>';
    const box=modal(`Plan de trabajo · ${dateOnly(plan.plan_date)}`,`
      <div class="ssoma-detail-grid">
        <div><small>Unidad</small><b>${escapeHtml(plan.business_unit)}</b></div>
        <div><small>Responsable SSOMA</small><b>${escapeHtml(plan.ssoma_name)}</b></div>
        <div><small>Estado</small>${planStatus(plan.status)}</div>
        <div><small>Última actualización</small><b>${dateTime(plan.updated_at||plan.created_at)}</b></div>
      </div>
      <section class="ssoma-detail-block">
        <h4>Objetivo completo</h4>
        <p class="ssoma-full-text">${escapeHtml(plan.objective)}</p>
      </section>
      <section class="ssoma-detail-block">
        <h4>Actividades programadas</h4>
        ${activities.length?`<ol class="ssoma-activity-list">${activities.map(activity=>`<li>${escapeHtml(activity)}</li>`).join('')}</ol>`:'<p class="muted">No se registraron actividades separadas.</p>'}
      </section>
      <section class="ssoma-detail-block">
        <h4>Pendientes RACS registrados al crear el plan</h4>
        ${pending.length?`<div class="ssoma-pending-grid">${pending.map(item=>`<div><span>${escapeHtml(item.status||'PENDIENTE')}</span><b>${Number(item.total||0)}</b></div>`).join('')}</div>`:'<div class="alert ok">No se registraron pendientes en el resumen del plan.</div>'}
      </section>
      <section class="ssoma-detail-block">
        <div class="ssoma-detail-heading"><h4>Evidencias de cumplimiento de la fecha</h4><span class="tag">${related.length}</span></div>
        <div class="ssoma-linked-list">${evidenceCards}</div>
      </section>`);
    bindEvidenceButtons(box);
  };

  const fetchEvidenceBlob=async evidence=>{
    if(!evidence?.asset_id)throw new Error('El archivo no está disponible en el volumen de Railway');
    const response=await fetch(`/api/files/${Number(evidence.asset_id)}`,{headers:session.token?{authorization:`Bearer ${session.token}`}:{}});
    if(!response.ok){
      let message='No se pudo abrir la evidencia';
      try{message=(await response.json()).error||message;}catch{}
      throw new Error(message);
    }
    return response.blob();
  };

  const openEvidence=async evidence=>{
    if(!evidence)return toast('No se encontró la evidencia','error');
    const driveUrl=safeExternalUrl(evidence.drive_web_link);
    const box=modal(`Evidencia de cumplimiento · ${escapeHtml(evidence.title||'SSOMA')}`,`
      <div class="page-loading"><span class="spinner"></span>Preparando evidencia…</div>`);
    const metadata=`
      <div class="ssoma-detail-grid">
        <div><small>Fecha</small><b>${dateOnly(evidence.evidence_date)}</b></div>
        <div><small>Unidad</small><b>${escapeHtml(evidence.business_unit)}</b></div>
        <div><small>Responsable SSOMA</small><b>${escapeHtml(evidence.ssoma_name)}</b></div>
        <div><small>RAC relacionado</small><b>${escapeHtml(evidence.report_code||'No relacionado')}</b></div>
        <div><small>Archivo</small><b>${escapeHtml(evidence.original_name||'Sin nombre')}</b></div>
        <div><small>Tamaño</small><b>${formatBytes(evidence.size_bytes)}</b></div>
      </div>
      <section class="ssoma-detail-block">
        <h4>Descripción del cumplimiento</h4>
        <p class="ssoma-full-text">${escapeHtml(evidence.description||'Sin descripción registrada.')}</p>
      </section>`;
    const actions=`<div class="actions ssoma-file-actions">
      ${evidence.asset_id?`<button type="button" class="btn primary" id="downloadSsomaEvidence">Descargar archivo</button>`:''}
      ${driveUrl?`<a class="btn ghost" href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener">Abrir en Drive</a>`:''}
    </div>`;
    if(!evidence.asset_id){
      box.querySelector('.modal-body').innerHTML=`${metadata}<div class="alert warn">El archivo local no está disponible.${driveUrl?' Puedes abrir la copia de Drive.':''}</div>${actions}`;
      return;
    }
    try{
      const blob=await fetchEvidenceBlob(evidence);
      const objectUrl=URL.createObjectURL(blob);
      const mime=String(evidence.mime_type||blob.type||'').toLowerCase();
      let preview='<div class="alert warn">Este tipo de archivo no tiene vista previa. Puedes descargarlo para abrirlo.</div>';
      if(mime.startsWith('image/'))preview=`<img class="evidence-expanded-image" src="${objectUrl}" alt="${escapeHtml(evidence.original_name||'Evidencia')}">`;
      else if(mime.includes('pdf'))preview=`<iframe class="evidence-expanded-pdf" src="${objectUrl}" title="${escapeHtml(evidence.original_name||'PDF')}"></iframe>`;
      else if(mime.startsWith('video/'))preview=`<video class="ssoma-media-preview" controls src="${objectUrl}"></video>`;
      else if(mime.startsWith('audio/'))preview=`<audio class="ssoma-audio-preview" controls src="${objectUrl}"></audio>`;
      box.querySelector('.modal-body').innerHTML=`${metadata}<section class="ssoma-detail-block"><h4>Archivo de evidencia</h4>${preview}</section>${actions}`;
      const close=box.querySelector('[data-close]');
      close.onclick=()=>{URL.revokeObjectURL(objectUrl);box.remove();};
      const downloadButton=box.querySelector('#downloadSsomaEvidence');
      if(downloadButton)downloadButton.onclick=()=>download(`/api/files/${Number(evidence.asset_id)}`,evidence.original_name||'evidencia').catch(error=>toast(error.message,'error'));
    }catch(error){
      box.querySelector('.modal-body').innerHTML=`${metadata}${errorBox(error)}${actions}`;
      const downloadButton=box.querySelector('#downloadSsomaEvidence');
      if(downloadButton)downloadButton.onclick=()=>download(`/api/files/${Number(evidence.asset_id)}`,evidence.original_name||'evidencia').catch(err=>toast(err.message,'error'));
    }
  };

  const bindPlanButtons=()=>{
    document.querySelectorAll('[data-view-plan]').forEach(button=>{
      button.onclick=()=>openPlan(plans.find(item=>Number(item.id)===Number(button.dataset.viewPlan)));
    });
    bindEvidenceButtons(document);
  };

  async function load(){
    const [dashboard,planRows,evidenceRows]=await Promise.all([
      api('/api/ssoma/dashboard'),
      api('/api/ssoma/plans'),
      api('/api/ssoma/evidence')
    ]);
    plans=planRows;
    evidences=evidenceRows;
    $('#ssomaDash').innerHTML=`
      <div class="kpi-grid">
        ${kpi('Planes para mañana',dashboard.kpis.plans_tomorrow,'Por unidad','teal')}
        ${kpi('Planes completados',dashboard.kpis.completed_plans,'Histórico','green')}
        ${kpi('Evidencias 30 días',dashboard.kpis.evidenceLast30,'Archivos SSOMA','amber')}
      </div>
      <section class="panel"><h3>Pendientes por unidad</h3>${bars(dashboard.pending)}</section>`;
    $('#plans').innerHTML=table(
      ['Fecha','Unidad','SSOMA','Objetivo','Estado','Acción'],
      plans.slice(0,20).map(plan=>`<tr>
        <td>${dateOnly(plan.plan_date)}</td>
        <td>${escapeHtml(plan.business_unit)}</td>
        <td>${escapeHtml(plan.ssoma_name)}</td>
        <td><span class="ssoma-table-preview" title="${escapeHtml(plan.objective)}">${escapeHtml(compactText(plan.objective))}</span></td>
        <td>${planStatus(plan.status)}</td>
        <td><button type="button" class="btn small primary" data-view-plan="${Number(plan.id)}">Ver plan completo</button></td>
      </tr>`)
    );
    $('#evidence').innerHTML=table(
      ['Fecha','Unidad','SSOMA','Título','RAC','Archivo','Acción'],
      evidences.slice(0,20).map(item=>`<tr>
        <td>${dateOnly(item.evidence_date)}</td>
        <td>${escapeHtml(item.business_unit)}</td>
        <td>${escapeHtml(item.ssoma_name)}</td>
        <td><span class="ssoma-table-preview" title="${escapeHtml(item.description||item.title)}">${escapeHtml(compactText(item.title,55))}</span></td>
        <td>${escapeHtml(item.report_code||'—')}</td>
        <td>${item.asset_id?'<span class="tag done">DISPONIBLE</span>':item.drive_web_link?'<span class="tag">DRIVE</span>':'<span class="tag pending">NO DISPONIBLE</span>'}</td>
        <td><button type="button" class="btn small amber" data-view-evidence="${Number(item.id)}">Ver evidencia</button></td>
      </tr>`)
    );
    bindPlanButtons();
  }

  $('#planForm').onsubmit=async event=>{
    event.preventDefault();
    const data=formData(event.currentTarget);
    data.activities=data.activitiesText.split('\n').map(item=>item.trim()).filter(Boolean);
    try{
      await api('/api/ssoma/plans',{method:'POST',body:data});
      toast('Plan guardado');
      await load();
    }catch(error){toast(error.message,'error');}
  };

  $('#ssomaEvidence').onsubmit=async event=>{
    event.preventDefault();
    try{
      await api('/api/ssoma/evidence',{method:'POST',body:new FormData(event.currentTarget)});
      toast('Evidencia de cumplimiento guardada');
      event.currentTarget.reset();
      await load();
    }catch(error){toast(error.message,'error');}
  };

  await load();
}

export async function resourcesPage(root){
  root.innerHTML=`<div class="page-head"><div><h2>Descarga de recursos ejecutivos</h2><p>Reportes ejecutivos de RACS, control de plazos por unidad y recursos de capacitación.</p></div></div>
  <section class="panel"><form id="resourceFilters" class="filter-grid"><div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Desde</label><input type="date" name="from"></div><div class="field"><label>Hasta</label><input type="date" name="to"></div><div class="field"><label>Estado para PPT/Excel ejecutivo</label><select name="status"><option value="">Todos</option>${state.catalogs.racStatuses.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>&nbsp;</label><button type="button" class="btn primary" id="refreshRacControl">Actualizar control</button></div></form></section>
  <section class="panel"><div class="page-head compact"><div><h3>Control RACS por unidad</h3><p>Plazos institucionales: ALTO 0–48 horas · MEDIO 1–3 días · BAJO 1–4 días. Levantados sin evidencia: se separan entre “No requiere evidencia” y “Sin sustento”.</p></div><div class="actions"><button class="btn amber" id="racControlPpt">PPT Control RACS por unidad</button><button class="btn primary" id="racControlExcel">Excel Control RACS por unidad</button></div></div><div id="racControlKpis"></div><div id="racControlTable"><div class="page-loading"><span class="spinner"></span>Cargando control…</div></div></section>
  <div class="grid-2"><section class="panel"><h3>RACS · Recursos ejecutivos</h3><p>Portada, resumen global, análisis por unidad, personal, RACS/trabajador, actos, condiciones, alto potencial, supervisores, áreas, riesgos, causas y tabla de levantamiento.</p><div class="actions"><button class="btn amber" id="racPpt">PPT Ejecutivo</button><button class="btn primary" id="racExcel">Excel Ejecutivo</button><button class="btn ghost" id="publicLink">Crear hipervínculo</button></div><div id="linkResult"></div></section><section class="panel"><h3>Capacitación · Recursos ejecutivos</h3><p>Cumplimiento de capacitaciones, notas, capacitados, aprobación, áreas y temas.</p><div class="actions"><button class="btn primary" id="trainingExcelResource">Excel Ejecutivo</button></div></section></div>
  <div class="grid-2"><section class="panel"><h3>RIT Diario</h3><p>Reuniones de inicio de turno, temas, facilitadores, asistencia, cumplimiento y evidencias.</p><div class="actions"><button class="btn primary" id="ritDailyExcelResource">Excel RIT Diario</button></div></section><section class="panel"><h3>IDS</h3><p>Desempeño individual por periodo: RAC, actos, condiciones, RIT-CAP, inspecciones, PARE y porcentaje de cumplimiento.</p><div class="actions"><button class="btn amber" id="idsExcelResource">Excel IDS</button></div></section></div>`;
  const qs=()=>new URLSearchParams(formData($('#resourceFilters'))).toString();
  const controlQs=()=>{
    const filters=formData($('#resourceFilters'));
    const params=new URLSearchParams();
    for(const key of ['businessUnitId','from','to'])if(filters[key])params.set(key,filters[key]);
    return params.toString();
  };
  const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row[key]||0),0);
  async function loadControl(){
    try{
      const result=await api(`/api/reports/racs/control-summary?${controlQs()}`);
      const rows=result.rows||[];
      const total=sum(rows,'total'),lifted=sum(rows,'lifted'),overdue=sum(rows,'overdue'),pendingValidation=sum(rows,'pending_validation'),noEvidence=sum(rows,'lifted_no_evidence_required'),withoutSupport=sum(rows,'lifted_without_evidence'),withEvidence=sum(rows,'lifted_with_evidence');
      $('#racControlKpis').innerHTML=`<div class="kpi-grid">${kpi('RACS',total,'Periodo filtrado','navy')}${kpi('Levantados',lifted,total?`${Math.round(lifted*100/total)}% de cierre`:'Sin RACS','green')}${kpi('Con evidencia',withEvidence,'Evidencia final registrada','teal')}${kpi('No requiere evidencia',noEvidence,'Excepción aprobada','navy')}${kpi('Sin sustento',withoutSupport,'Registros por regularizar','coral')}${kpi('Vencidos',overdue,'Fuera del plazo','red')}${kpi('Pendientes de validación',pendingValidation,'Con evidencia por revisar','amber')}</div>`;
      $('#racControlTable').innerHTML=table(['Unidad','RACS','Alto','Medio','Bajo','Levantados','Con evidencia','No requiere evidencia','Sin sustento','Pend. validación','Vencidos','Alto vencido','% cierre'],rows.map(row=>`<tr><td><b>${escapeHtml(row.unit)}</b><br><small>${Number(row.workers||0)} trabajadores</small></td><td>${row.total}</td><td>${row.high}</td><td>${row.medium}</td><td>${row.low}</td><td>${row.lifted}</td><td>${row.lifted_with_evidence}</td><td>${row.lifted_no_evidence_required}</td><td>${row.lifted_without_evidence}</td><td>${row.pending_validation}</td><td>${row.overdue}</td><td>${row.high_overdue}</td><td>${row.total?Math.round(Number(row.lifted)*100/Number(row.total)):0}%</td></tr>`));
    }catch(error){$('#racControlTable').innerHTML=errorBox(error);}
  }
  $('#refreshRacControl').onclick=loadControl;
  $('#racControlPpt').onclick=()=>download(`/api/reports/racs/control.pptx?${controlQs()}`,'CAPSAN6_CONTROL_RACS_POR_UNIDAD.pptx').catch(error=>toast(error.message,'error'));
  $('#racControlExcel').onclick=()=>download(`/api/reports/racs/control.xlsx?${controlQs()}`,'CAPSAN6_CONTROL_RACS_POR_UNIDAD.xlsx').catch(error=>toast(error.message,'error'));
  $('#racPpt').onclick=()=>download(`/api/reports/racs/executive.pptx?${qs()}`,'CAPSAN6_REPORTE_EJECUTIVO_RACS.pptx').catch(error=>toast(error.message,'error'));
  $('#racExcel').onclick=()=>download(`/api/reports/racs/executive.xlsx?${qs()}`,'CAPSAN6_REPORTE_EJECUTIVO_RACS.xlsx').catch(error=>toast(error.message,'error'));
  $('#trainingExcelResource').onclick=()=>download(`/api/reports/training/executive.xlsx?${qs()}`,'CAPSAN6_REPORTE_EJECUTIVO_CAPACITACION.xlsx').catch(error=>toast(error.message,'error'));
  $('#ritDailyExcelResource').onclick=()=>download(`/api/preventive/rit/export.xlsx?${controlQs()}`,'CAPSAN6_RIT_DIARIO.xlsx').catch(error=>toast(error.message,'error'));
  $('#idsExcelResource').onclick=()=>download(`/api/preventive/ids/export.xlsx?${controlQs()}`,'CAPSAN6_IDS.xlsx').catch(error=>toast(error.message,'error'));
  $('#publicLink').onclick=async()=>{try{const filters=formData($('#resourceFilters'));const result=await api('/api/reports/public-link',{method:'POST',body:{scope:'RACS_EXECUTIVE',filters,hours:168}});$('#linkResult').innerHTML=`<div class="alert ok">Hipervínculo válido por 7 días.<br><input value="${escapeHtml(result.url)}" readonly style="width:100%;margin-top:8px"><button class="btn small" id="copyLink">Copiar</button></div>`;$('#copyLink').onclick=()=>navigator.clipboard.writeText(result.url).then(()=>toast('Enlace copiado'));}catch(error){toast(error.message,'error')}};
  await loadControl();
}
