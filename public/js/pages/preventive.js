import { api,download } from '../api.js';
import { state,unitOptions,areaOptions,escapeHtml } from '../state.js';
import { $,toast,errorBox,kpi,bars,table,formData } from '../ui.js';

const localDate=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);};
const monthStart=()=>`${localDate().slice(0,7)}-01`;
const specificUnitOptions=(selected='')=>`<option value="">Selecciona una unidad</option>${state.catalogs.units.map(unit=>`<option value="${unit.id}" ${String(selected)===String(unit.id)?'selected':''}>${escapeHtml(unit.name)}</option>`).join('')}`;
const statusTag=status=>`<span class="tag ${status==='EJECUTADO'?'done':status==='NO EJECUTADO'?'high':'pending'}">${escapeHtml(status)}</span>`;
const performanceTag=value=>`<span class="tag ${value==='BUENO'?'done':value==='REGULAR'?'medium':'high'}">${escapeHtml(value)}</span>`;
const n=value=>Number(value||0);

export async function ritDailyPage(root){
  let rows=[];
  root.innerHTML=`<div class="page-head"><div><h2>RIT Diario</h2><p>Registro diario de la Reunión de Inicio de Turno. Este módulo reemplaza al antiguo DDS.</p></div><button class="btn amber" id="ritExcel">Excel RIT Diario</button></div>
  <div id="ritDashboard"></div>
  <div class="grid-2"><section class="panel"><h3>Registrar RIT Diario</h3><div class="panel-sub">Tema, asistencia, responsable y evidencia de la reunión diaria.</div>
    <form id="ritForm"><input type="hidden" name="id"><div class="form-grid two">
      <div class="field"><label>Fecha</label><input type="date" name="ritDate" value="${localDate()}" required></div>
      <div class="field"><label>Unidad</label><select name="businessUnitId" id="ritUnit" required>${specificUnitOptions()}</select></div>
      <div class="field"><label>Área</label><select name="areaId" id="ritArea">${areaOptions()}</select></div>
      <div class="field"><label>Guardia / turno</label><input name="guard" placeholder="A, B, C / Día / Noche"></div>
      <div class="field span-2"><label>Tema del RIT</label><input name="topic" maxlength="280" required></div>
      <div class="field"><label>Facilitador / responsable</label><input name="facilitatorName" required></div>
      <div class="field"><label>Duración en minutos</label><input type="number" min="0" name="durationMinutes" value="5"></div>
      <div class="field"><label>Personal programado</label><input type="number" min="0" name="scheduledCount" value="0"></div>
      <div class="field"><label>Asistentes</label><input type="number" min="0" name="attendeeCount" value="0"></div>
      <div class="field"><label>Estado</label><select name="status"><option>EJECUTADO</option><option>PROGRAMADO</option><option>NO EJECUTADO</option></select></div>
      <div class="field"><label>Evidencia</label><input type="file" name="evidence" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"></div>
      <div class="field span-2"><label>Observación</label><textarea name="observation" placeholder="Incidencias, acuerdos, personal ausente u observaciones."></textarea></div>
    </div><div class="actions"><button class="btn primary">Guardar RIT Diario</button><button type="button" class="btn ghost" id="clearRit">Nuevo registro</button></div></form>
  </section><section class="panel"><h3>Filtros</h3><form id="ritFilters"><div class="form-grid two">
    <div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div>
    <div class="field"><label>Estado</label><select name="status"><option value="">Todos</option><option>EJECUTADO</option><option>PROGRAMADO</option><option>NO EJECUTADO</option></select></div>
    <div class="field"><label>Desde</label><input type="date" name="from" value="${monthStart()}"></div>
    <div class="field"><label>Hasta</label><input type="date" name="to" value="${localDate()}"></div>
  </div><button class="btn primary">Aplicar filtros</button></form><div id="ritByUnit"></div></section></div>
  <section class="panel"><h3>Registros RIT Diario</h3><div id="ritList"></div></section>`;

  const query=()=>new URLSearchParams(formData($('#ritFilters'))).toString();
  const resetForm=()=>{const form=$('#ritForm');form.reset();form.id.value='';form.ritDate.value=localDate();form.durationMinutes.value=5;form.scheduledCount.value=0;form.attendeeCount.value=0;$('#ritArea').innerHTML=areaOptions();};
  $('#ritUnit').onchange=()=>{$('#ritArea').innerHTML=areaOptions('',$('#ritUnit').value);};
  $('#clearRit').onclick=resetForm;

  function bind(){
    document.querySelectorAll('[data-edit-rit]').forEach(button=>button.onclick=()=>{
      const row=rows.find(item=>Number(item.id)===Number(button.dataset.editRit));if(!row)return;
      const form=$('#ritForm');form.id.value=row.id;form.ritDate.value=String(row.rit_date).slice(0,10);form.businessUnitId.value=row.business_unit_id;
      $('#ritArea').innerHTML=areaOptions(row.area_id||'',row.business_unit_id);form.areaId.value=row.area_id||'';form.guard.value=row.guard||'';form.topic.value=row.topic||'';
      form.facilitatorName.value=row.facilitator_name||'';form.durationMinutes.value=row.duration_minutes||0;form.scheduledCount.value=row.scheduled_count||0;form.attendeeCount.value=row.attendee_count||0;
      form.status.value=row.status||'EJECUTADO';form.observation.value=row.observation||'';window.scrollTo({top:0,behavior:'smooth'});
    });
    document.querySelectorAll('[data-rit-evidence]').forEach(button=>button.onclick=()=>download(`/api/files/${button.dataset.ritEvidence}`,button.dataset.file||'evidencia-rit').catch(error=>toast(error.message,'error')));
  }

  async function load(){
    try{
      const [dashboard,data]=await Promise.all([api(`/api/preventive/rit/dashboard?${query()}`),api(`/api/preventive/rit?${query()}`)]);rows=data;
      $('#ritDashboard').innerHTML=`<div class="kpi-grid">${kpi('RIT registrados',dashboard.kpis.total,'Periodo filtrado','navy')}${kpi('Ejecutados',dashboard.kpis.executed,'Reuniones realizadas','green')}${kpi('Programados',dashboard.kpis.programmed,'Pendientes de ejecutar','amber')}${kpi('Asistentes',dashboard.kpis.attendees,'Participación total','teal')}${kpi('% asistencia',`${dashboard.kpis.compliance||0}%`,`${dashboard.kpis.scheduled||0} programados`,'coral')}</div>`;
      $('#ritByUnit').innerHTML=`<h3 style="margin-top:20px">RIT por unidad</h3>${bars(dashboard.byUnit)}`;
      $('#ritList').innerHTML=table(['Fecha','Unidad','Área','Guardia','Tema','Facilitador','Prog.','Asist.','%','Estado','Evidencia','Acción'],rows.map(row=>`<tr>
        <td>${String(row.rit_date).slice(0,10)}</td><td><b>${escapeHtml(row.business_unit)}</b></td><td>${escapeHtml(row.area_name||'—')}</td><td>${escapeHtml(row.guard||'—')}</td>
        <td>${escapeHtml(row.topic)}</td><td>${escapeHtml(row.facilitator_name)}</td><td>${row.scheduled_count}</td><td>${row.attendee_count}</td><td>${row.compliance_percent}%</td><td>${statusTag(row.status)}</td>
        <td>${row.asset_id?`<button type="button" class="btn small amber" data-rit-evidence="${row.asset_id}" data-file="${escapeHtml(row.evidence_name||'evidencia-rit')}">Descargar</button>`:'—'}</td>
        <td><button type="button" class="btn small" data-edit-rit="${row.id}">Editar</button></td></tr>`));bind();
    }catch(error){$('#ritList').innerHTML=errorBox(error);}
  }

  $('#ritFilters').onsubmit=event=>{event.preventDefault();load();};
  $('#ritExcel').onclick=()=>download(`/api/preventive/rit/export.xlsx?${query()}`,'CAPSAN6_RIT_DIARIO.xlsx').catch(error=>toast(error.message,'error'));
  $('#ritForm').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget;const payload=formData(form);delete payload.evidence;const fd=new FormData();fd.append('payload',JSON.stringify(payload));if(form.evidence.files[0])fd.append('evidence',form.evidence.files[0]);
    try{await api('/api/preventive/rit',{method:'POST',body:fd});toast('RIT Diario guardado');resetForm();await load();}catch(error){toast(error.message,'error');}
  };
  await load();
}

export async function idsPage(root){
  let rows=[],workers=[];
  root.innerHTML=`<div class="page-head"><div><h2>IDS</h2><p>Índice de Desempeño de Seguridad individual por trabajador o supervisor y periodo.</p></div><button class="btn amber" id="idsExcel">Excel IDS</button></div>
  <div id="idsDashboard"></div>
  <section class="panel"><h3>Registrar desempeño IDS</h3><div class="panel-sub">El RAC ejecutado se calcula automáticamente como Actos + Condiciones.</div><form id="idsForm">
    <div class="form-grid four"><div class="field"><label>Desde</label><input type="date" name="periodStart" value="${monthStart()}" required></div><div class="field"><label>Hasta</label><input type="date" name="periodEnd" value="${localDate()}" required></div>
    <div class="field"><label>Unidad</label><select name="businessUnitId" id="idsUnit" required>${specificUnitOptions()}</select></div><div class="field"><label>Trabajador / supervisor</label><select name="workerId" id="idsWorker" required><option value="">Selecciona primero una unidad</option></select></div></div>
    <div class="ids-metric-grid"><article class="ids-metric-card"><h4>RAC</h4><div class="form-grid two"><div class="field"><label>Programado</label><input type="number" min="0" name="racProgrammed" value="0"></div><div class="field"><label>Ejecutado</label><input id="racExecutedPreview" value="0" readonly></div><div class="field"><label>Actos</label><input type="number" min="0" name="actsCount" value="0"></div><div class="field"><label>Condiciones</label><input type="number" min="0" name="conditionsCount" value="0"></div></div></article>
    <article class="ids-metric-card"><h4>RIT-CAP</h4><div class="form-grid two"><div class="field"><label>Programado</label><input type="number" min="0" name="ritCapProgrammed" value="0"></div><div class="field"><label>Ejecutado</label><input type="number" min="0" name="ritCapExecuted" value="0"></div></div></article>
    <article class="ids-metric-card"><h4>Inspecciones</h4><div class="form-grid two"><div class="field"><label>Programado</label><input type="number" min="0" name="inspectionsProgrammed" value="0"></div><div class="field"><label>Ejecutado</label><input type="number" min="0" name="inspectionsExecuted" value="0"></div></div></article>
    <article class="ids-metric-card"><h4>PARE</h4><div class="form-grid two"><div class="field"><label>Programado</label><input type="number" min="0" name="pareProgrammed" value="0"></div><div class="field"><label>Ejecutado</label><input type="number" min="0" name="pareExecuted" value="0"></div></div></article></div>
    <div class="form-grid two"><div class="field"><label>Colaboradores a cargo</label><input type="number" min="0" name="collaboratorsCount" value="0"></div><div class="field"><label>Resultado calculado</label><div class="ids-result" id="idsResult">0 / 0 · 0% · DEFICIENTE</div></div><div class="field span-2"><label>Observación</label><textarea name="observation"></textarea></div></div>
    <button class="btn primary">Guardar IDS</button></form></section>
  <section class="panel"><h3>Filtros y ranking</h3><form id="idsFilters" class="filter-grid"><div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Desde</label><input type="date" name="from" value="${monthStart()}"></div><div class="field"><label>Hasta</label><input type="date" name="to" value="${localDate()}"></div><div class="field"><label>&nbsp;</label><button class="btn primary">Aplicar filtros</button></div></form><div id="idsRanking"></div></section>
  <section class="panel"><h3>Detalle IDS</h3><div id="idsList"></div></section>`;

  const form=$('#idsForm');
  const query=()=>new URLSearchParams(formData($('#idsFilters'))).toString();
  const workerOptions=(selected='')=>`<option value="">Selecciona un trabajador</option>${workers.map(worker=>`<option value="${worker.id}" ${String(selected)===String(worker.id)?'selected':''}>${escapeHtml(worker.full_name)} · ${escapeHtml(worker.dni)}</option>`).join('')}`;
  async function loadWorkers(selected=''){
    const unitId=$('#idsUnit').value;if(!unitId){workers=[];$('#idsWorker').innerHTML='<option value="">Selecciona primero una unidad</option>';return;}
    workers=await api(`/api/preventive/ids/workers?businessUnitId=${unitId}`);$('#idsWorker').innerHTML=workerOptions(selected);
  }
  function calculate(){
    const racExecuted=n(form.actsCount.value)+n(form.conditionsCount.value);$('#racExecutedPreview').value=racExecuted;
    const programmed=n(form.racProgrammed.value)+n(form.ritCapProgrammed.value)+n(form.inspectionsProgrammed.value)+n(form.pareProgrammed.value);
    const executed=racExecuted+n(form.ritCapExecuted.value)+n(form.inspectionsExecuted.value)+n(form.pareExecuted.value);
    const compliance=programmed?Math.round(executed*1000/programmed)/10:0;const performance=compliance>=90?'BUENO':compliance>=75?'REGULAR':'DEFICIENTE';
    $('#idsResult').innerHTML=`<b>${executed} / ${programmed}</b> · <b>${compliance}%</b> · ${performanceTag(performance)}`;
  }
  $('#idsUnit').onchange=()=>loadWorkers();
  form.querySelectorAll('input[type="number"]').forEach(input=>input.oninput=calculate);calculate();

  async function load(){
    try{
      const [dashboard,data]=await Promise.all([api(`/api/preventive/ids/dashboard?${query()}`),api(`/api/preventive/ids?${query()}`)]);rows=data;
      $('#idsDashboard').innerHTML=`<div class="kpi-grid">${kpi('Registros IDS',dashboard.kpis.records,'Periodo filtrado','navy')}${kpi('Promedio',`${dashboard.kpis.average}%`,'Cumplimiento general','teal')}${kpi('Bueno',dashboard.kpis.good,'90% o más','green')}${kpi('Regular',dashboard.kpis.regular,'75% a 89.9%','amber')}${kpi('Deficiente',dashboard.kpis.deficient,'Menor a 75%','red')}</div>`;
      $('#idsRanking').innerHTML=`<h3 style="margin-top:18px">Ranking de cumplimiento</h3>${bars(dashboard.ranking)}`;
      $('#idsList').innerHTML=table(['Periodo','Unidad','Trabajador','Colab.','RAC P/E','Actos','Cond.','RIT-CAP P/E','Insp. P/E','PARE P/E','Total P/E','%','Desempeño','Observación'],rows.map(row=>`<tr>
        <td>${String(row.period_start).slice(0,10)}<br>${String(row.period_end).slice(0,10)}</td><td>${escapeHtml(row.business_unit)}</td><td><b>${escapeHtml(row.worker_name)}</b><br><small>${escapeHtml(row.dni)}</small></td><td>${row.collaborators_count}</td>
        <td>${row.rac_programmed} / ${row.rac_executed}</td><td>${row.acts_count}</td><td>${row.conditions_count}</td><td>${row.rit_cap_programmed} / ${row.rit_cap_executed}</td><td>${row.inspections_programmed} / ${row.inspections_executed}</td><td>${row.pare_programmed} / ${row.pare_executed}</td>
        <td><b>${row.total_programmed} / ${row.total_executed}</b></td><td>${row.compliance_percent}%</td><td>${performanceTag(row.performance)}</td><td>${escapeHtml(row.observation||'—')}</td></tr>`));
    }catch(error){$('#idsList').innerHTML=errorBox(error);}
  }
  $('#idsFilters').onsubmit=event=>{event.preventDefault();load();};
  $('#idsExcel').onclick=()=>download(`/api/preventive/ids/export.xlsx?${query()}`,'CAPSAN6_IDS.xlsx').catch(error=>toast(error.message,'error'));
  form.onsubmit=async event=>{event.preventDefault();try{await api('/api/preventive/ids',{method:'POST',body:formData(form)});toast('IDS guardado');form.reset();form.periodStart.value=monthStart();form.periodEnd.value=localDate();workers=[];$('#idsWorker').innerHTML='<option value="">Selecciona primero una unidad</option>';calculate();await load();}catch(error){toast(error.message,'error');}};
  await load();
}
