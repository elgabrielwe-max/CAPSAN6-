import { api, download } from '../api.js';
import { state, escapeHtml } from '../state.js';
import { $, toast, errorBox, kpi, table } from '../ui.js';

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const lines = value => Array.isArray(value) ? value.join('\n') : String(value || '');
const valueOf = (form, name) => form.elements[name]?.value || '';

function unitOptions(selected = '') {
  return `<option value="">Seleccionar unidad</option>${state.catalogs.units.map(unit => `<option value="${unit.id}" ${String(selected) === String(unit.id) ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`).join('')}`;
}
function areaOptions(unitId, selected = '') {
  const rows = state.catalogs.areas.filter(area => !unitId || !area.unit_ids?.length || area.unit_ids.map(Number).includes(Number(unitId)));
  return `<option value="">Todas las áreas de la unidad</option>${rows.map(area => `<option value="${area.id}" ${String(selected) === String(area.id) ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}`;
}
function statusTag(value) {
  const done = ['REALIZADO', 'CERRADO'].includes(String(value));
  return `<span class="tag ${done ? 'done' : 'pending'}">${escapeHtml(value)}</span>`;
}
function bindArea(form, unitName, areaName) {
  const unit = form.elements[unitName];
  const area = form.elements[areaName];
  const refresh = selected => { area.innerHTML = areaOptions(unit.value, selected); };
  unit.addEventListener('change', () => refresh(''));
  refresh(area.dataset.selected || '');
  return refresh;
}

function rosterToolbar(prefix, note) {
  return `<div class="daily-roster-toolbar">
    <div class="field"><label>Buscar trabajador</label><input id="${prefix}WorkerSearch" type="search" placeholder="DNI, nombre, cargo o área"></div>
    <div class="daily-roster-actions"><button type="button" class="btn ghost small" id="${prefix}SelectAll">Seleccionar visibles</button><button type="button" class="btn ghost small" id="${prefix}ClearAll">Quitar visibles</button></div>
    <p class="muted">${escapeHtml(note)}</p>
  </div>`;
}

function attendanceScanBlock(prefix, label) {
  return `<section class="panel daily-scan-panel"><div class="panel-title-row"><div><h3>Escaneado de asistentes</h3><p class="panel-sub">Adjunta la lista física firmada o escaneada. Se aceptan PDF, JPG, PNG, WEBP, HEIC y HEIF, hasta 25 MB.</p></div></div>
    <div class="form-grid two"><div class="field"><label>${escapeHtml(label)}</label><input id="${prefix}AttendanceScan" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"></div>
    <div class="field"><label>Archivos vinculados</label><div id="${prefix}AttendanceFiles" class="daily-file-list"><span class="muted">Guarda el registro para adjuntar el escaneado.</span></div></div></div>
  </section>`;
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size / 1024 / 1024 * 10) / 10} MB`;
}

function ddsForm() {
  return `<form id="ddsForm">
    <input type="hidden" name="id">
    <section class="panel"><div class="panel-title-row"><div><h3>Diálogo Diario de Seguridad</h3><p class="panel-sub">Selecciona la unidad y CAPSAN6 cargará la lista maestra de trabajadores registrada en el sistema.</p></div><button type="button" class="btn ghost small" id="ddsReset">Nuevo DDS</button></div>
      <div class="form-grid four">
        <div class="field"><label>Fecha</label><input type="date" name="sessionDate" value="${localDate()}" required></div>
        <div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div>
        <div class="field"><label>Área</label><select name="areaId"></select></div>
        <div class="field"><label>Turno</label><select name="shift"><option>DÍA</option><option>NOCHE</option><option>MIXTO</option></select></div>
        <div class="field"><label>Guardia</label><input name="guard" list="ddsGuards" placeholder="A, B, C..."><datalist id="ddsGuards"></datalist></div>
        <div class="field"><label>Duración (minutos)</label><input type="number" min="1" max="180" name="durationMinutes" value="5"></div>
        <div class="field span-2"><label>Tema del DDS</label><input name="topic" placeholder="Ej.: Orden y limpieza antes de iniciar la labor" required></div>
        <div class="field span-2"><label>Objetivo / mensaje principal</label><textarea name="objective" placeholder="Qué debe comprender o aplicar el trabajador"></textarea></div>
        <div class="field span-2"><label>Observaciones generales</label><textarea name="observations" placeholder="Preguntas, acuerdos o incidencias durante el diálogo"></textarea></div>
        <div class="field"><label>Estado</label><select name="status"><option>REALIZADO</option><option>BORRADOR</option></select></div>
        <div class="field"><label>&nbsp;</label><button type="button" class="btn amber" id="ddsLoadWorkers">Cargar trabajadores</button></div>
      </div>
    </section>
    ${attendanceScanBlock('dds', 'Lista firmada del DDS')}
    <section class="panel"><div class="panel-title-row"><div><h3>Asistencia del DDS</h3><p class="panel-sub"><b id="ddsSelectedCount">0</b> trabajadores seleccionados.</p></div><button class="btn primary" type="submit">Guardar DDS</button></div>
      ${rosterToolbar('dds', 'Los trabajadores se filtran por unidad, área y guardia utilizando la base ya existente.')}
      <div id="ddsRoster"><p class="muted">Selecciona la unidad y pulsa “Cargar trabajadores”.</p></div>
    </section>
  </form>`;
}

function ritForm() {
  return `<form id="ritForm">
    <input type="hidden" name="id">
    <section class="panel"><div class="panel-title-row"><div><h3>Reunión de Inicio de Turno</h3><p class="panel-sub">Planifica las labores del turno y asigna a los trabajadores ya registrados en CAPSAN6.</p></div><button type="button" class="btn ghost small" id="ritReset">Nueva RIT</button></div>
      <div class="form-grid four">
        <div class="field"><label>Fecha</label><input type="date" name="meetingDate" value="${localDate()}" required></div>
        <div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div>
        <div class="field"><label>Área</label><select name="areaId"></select></div>
        <div class="field"><label>Turno</label><select name="shift"><option>DÍA</option><option>NOCHE</option><option>MIXTO</option></select></div>
        <div class="field"><label>Guardia</label><input name="guard" list="ritGuards" placeholder="A, B, C..."><datalist id="ritGuards"></datalist></div>
        <div class="field"><label>Estado</label><select name="status"><option>REALIZADO</option><option>PLANIFICADO</option><option>CERRADO</option></select></div>
        <div class="field span-2"><label>Resumen del turno anterior</label><textarea name="previousShiftSummary" placeholder="Pendientes, equipos, labores restringidas o alertas recibidas"></textarea></div>
        <div class="field span-2"><label>Actividades planificadas — una por línea</label><textarea name="plannedActivities" placeholder="Perforación en TJ 407&#10;Limpieza de acceso NV 440" required></textarea></div>
        <div class="field span-2"><label>Riesgos críticos — uno por línea</label><textarea name="criticalRisks" placeholder="Rocas sueltas&#10;Energía neumática&#10;Tránsito de equipos"></textarea></div>
        <div class="field span-2"><label>Controles — uno por línea</label><textarea name="controls" placeholder="Desatado previo&#10;Check list del equipo&#10;IPERC continuo"></textarea></div>
        <div class="field span-2"><label>Restricciones / labores paralizadas</label><textarea name="restrictions"></textarea></div>
        <div class="field span-2"><label>Compromisos — uno por línea</label><textarea name="commitments"></textarea></div>
        <div class="field span-3"><label>Observaciones generales</label><textarea name="observations"></textarea></div>
        <div class="field"><label>&nbsp;</label><button type="button" class="btn amber" id="ritLoadWorkers">Cargar trabajadores</button></div>
      </div>
    </section>
    ${attendanceScanBlock('rit', 'Lista firmada de la RIT')}
    <section class="panel"><div class="panel-title-row"><div><h3>Personal asignado al turno</h3><p class="panel-sub"><b id="ritSelectedCount">0</b> trabajadores seleccionados.</p></div><button class="btn primary" type="submit">Guardar RIT</button></div>
      ${rosterToolbar('rit', 'Puedes asignar una actividad y responsabilidad diferente a cada trabajador.')}
      <div id="ritRoster"><p class="muted">Selecciona la unidad y pulsa “Cargar trabajadores”.</p></div>
    </section>
  </form>`;
}

function historyView() {
  return `<section class="panel"><form id="dailyHistoryFilters" class="filter-grid">
    <div class="field"><label>Unidad</label><select name="businessUnitId"><option value="">Todas</option>${state.catalogs.units.map(unit => `<option value="${unit.id}">${escapeHtml(unit.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Desde</label><input type="date" name="from"></div>
    <div class="field"><label>Hasta</label><input type="date" name="to"></div>
    <div class="field"><label>&nbsp;</label><button class="btn primary">Aplicar filtros</button></div>
  </form></section><div id="dailyHistory"><div class="page-loading">Cargando historial…</div></div>`;
}

export async function dailySafetyPage(root) {
  root.innerHTML = `<div class="page-head"><div><h2>DDS y Reunión de Inicio de Turno</h2><p>Control diario de seguridad y planificación operativa conectado con la base maestra de trabajadores.</p></div></div>
    <div id="dailyKpis"></div>
    <section class="panel"><div class="tabs" id="dailyTabs"><button data-tab="dds" class="active">DDS</button><button data-tab="rit">RIT</button><button data-tab="history">Historial y seguimiento</button></div><div id="dailyTabBody"></div></section>`;

  let currentTab = 'dds';
  let ddsWorkers = [];
  let ritWorkers = [];

  async function refreshSummary(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    try {
      const data = await api(`/api/daily-safety/summary?${qs}`);
      $('#dailyKpis').innerHTML = `<div class="kpi-grid">${kpi('DDS registrados', data.dds.total, `${data.dds.realized} realizados`, 'teal')}${kpi('Asistencia DDS', `${data.dds.attendancePercent}%`, `${data.dds.present} de ${data.dds.participants}`, 'green')}${kpi('RIT registradas', data.rit.total, `${data.rit.realized} realizadas/cerradas`, 'navy')}${kpi('Personal en RIT', data.rit.participants, 'Participaciones registradas', 'amber')}${kpi('Riesgos identificados', data.rit.risks, 'Registrados en RIT', 'coral')}${kpi('Fuente de personal', 'BASE MAESTRA', 'Sin duplicar trabajadores', 'teal')}</div>`;
    } catch (error) { $('#dailyKpis').innerHTML = errorBox(error); }
  }

  function updateSelected(prefix) {
    const count = document.querySelectorAll(`#${prefix}Roster [data-worker-row] input[data-select]:checked`).length;
    const box = $(`#${prefix}SelectedCount`);
    if (box) box.textContent = count;
  }

  function bindRoster(prefix) {
    const search = $(`#${prefix}WorkerSearch`);
    const applySearch = () => {
      const q = norm(search?.value);
      document.querySelectorAll(`#${prefix}Roster [data-worker-row]`).forEach(row => { row.hidden = Boolean(q) && !row.dataset.search.includes(q); });
    };
    if (search) search.oninput = applySearch;
    $(`#${prefix}SelectAll`).onclick = () => { document.querySelectorAll(`#${prefix}Roster [data-worker-row]:not([hidden]) input[data-select]`).forEach(input => { input.checked = true; }); updateSelected(prefix); };
    $(`#${prefix}ClearAll`).onclick = () => { document.querySelectorAll(`#${prefix}Roster [data-worker-row]:not([hidden]) input[data-select]`).forEach(input => { input.checked = false; }); updateSelected(prefix); };
    document.querySelectorAll(`#${prefix}Roster input[data-select]`).forEach(input => { input.onchange = () => updateSelected(prefix); });
    updateSelected(prefix);
  }

  function renderDdsRoster(workers, existing = new Map()) {
    const rows = workers.map(worker => {
      const saved = existing.get(Number(worker.id));
      const selected = existing.size ? Boolean(saved) : true;
      const attendance = saved?.attendance_status || 'ASISTIO';
      return `<tr data-worker-row data-worker-id="${worker.id}" data-search="${escapeHtml(norm(`${worker.dni} ${worker.full_name} ${worker.area_name} ${worker.position || ''} ${worker.guard || ''}`))}">
        <td><input type="checkbox" data-select ${selected ? 'checked' : ''}></td><td>${escapeHtml(worker.dni)}</td><td><b>${escapeHtml(worker.full_name)}</b><small class="worker-sub">${escapeHtml(worker.position || '')}</small></td><td>${escapeHtml(worker.area_name)}</td><td>${escapeHtml(worker.guard || '')}</td>
        <td><select data-attendance><option ${attendance === 'ASISTIO' ? 'selected' : ''}>ASISTIO</option><option ${attendance === 'NO ASISTIO' ? 'selected' : ''}>NO ASISTIO</option><option ${attendance === 'JUSTIFICADO' ? 'selected' : ''}>JUSTIFICADO</option></select></td>
        <td><input data-observation value="${escapeHtml(saved?.observation || '')}" placeholder="Opcional"></td></tr>`;
    });
    $('#ddsRoster').innerHTML = table(['✓', 'DNI', 'Trabajador', 'Área', 'Guardia', 'Asistencia', 'Observación'], rows);
    bindRoster('dds');
  }

  function renderRitRoster(workers, existing = new Map()) {
    const firstActivity = String(valueOf($('#ritForm'), 'plannedActivities')).split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
    const rows = workers.map(worker => {
      const saved = existing.get(Number(worker.id));
      const selected = existing.size ? Boolean(saved) : true;
      return `<tr data-worker-row data-worker-id="${worker.id}" data-search="${escapeHtml(norm(`${worker.dni} ${worker.full_name} ${worker.area_name} ${worker.position || ''} ${worker.guard || ''}`))}">
        <td><input type="checkbox" data-select ${selected ? 'checked' : ''}></td><td>${escapeHtml(worker.dni)}</td><td><b>${escapeHtml(worker.full_name)}</b><small class="worker-sub">${escapeHtml(worker.position || '')}</small></td><td>${escapeHtml(worker.area_name)}</td><td>${escapeHtml(worker.guard || '')}</td>
        <td><input data-activity value="${escapeHtml(saved?.assigned_activity || firstActivity)}" placeholder="Actividad asignada"></td><td><input data-responsibility value="${escapeHtml(saved?.responsibility || '')}" placeholder="Responsabilidad / equipo"></td></tr>`;
    });
    $('#ritRoster').innerHTML = table(['✓', 'DNI', 'Trabajador', 'Área', 'Guardia', 'Actividad', 'Responsabilidad'], rows);
    bindRoster('rit');
  }

  async function loadWorkers(prefix, existingRows = []) {
    const form = $(`#${prefix}Form`);
    const unitId = valueOf(form, 'businessUnitId');
    if (!unitId) return toast('Selecciona la unidad', 'error');
    const params = new URLSearchParams({ businessUnitId: unitId });
    const areaId = valueOf(form, 'areaId');
    const guard = valueOf(form, 'guard');
    if (areaId) params.set('areaId', areaId);
    if (guard) params.set('guard', guard);
    const data = await api(`/api/daily-safety/workers?${params}`);
    const datalist = $(`#${prefix}Guards`);
    if (datalist) datalist.innerHTML = data.guards.map(item => `<option value="${escapeHtml(item)}"></option>`).join('');
    const map = new Map(existingRows.map(item => [Number(item.worker_id || item.workerId), item]));
    if (prefix === 'dds') { ddsWorkers = data.workers; renderDdsRoster(ddsWorkers, map); }
    else { ritWorkers = data.workers; renderRitRoster(ritWorkers, map); }
    if (!data.workers.length) toast('No se encontraron trabajadores activos con esos filtros', 'error');
  }

  function renderAttendanceFiles(prefix, files = []) {
    const box = $(`#${prefix}AttendanceFiles`);
    if (!box) return;
    if (!files.length) {
      box.innerHTML = '<span class="muted">Sin escaneado adjunto.</span>';
      return;
    }
    box.innerHTML = files.map(file => `<button type="button" class="daily-file-item" data-scan-file="${file.id}" data-scan-name="${escapeHtml(file.original_name)}"><span>📎 ${escapeHtml(file.original_name)}</span><small>${formatBytes(file.size_bytes)} · ${String(file.created_at || '').slice(0, 10)}</small></button>`).join('');
    box.querySelectorAll('[data-scan-file]').forEach(button => {
      button.onclick = () => download(`/api/files/${button.dataset.scanFile}`, button.dataset.scanName).catch(error => toast(error.message, 'error'));
    });
  }

  async function uploadScan(prefix, sessionId, file) {
    if (!file || !file.size) return null;
    const data = new FormData(); data.append('file', file);
    return api(`/api/daily-safety/${prefix}/${sessionId}/attendance-scan`, { method: 'POST', body: data });
  }

  function resetDds() {
    const form = $('#ddsForm'); form.reset(); form.elements.id.value = ''; form.elements.sessionDate.value = localDate(); form.elements.durationMinutes.value = 5; form.elements.status.value = 'REALIZADO';
    form.elements.areaId.innerHTML = areaOptions(''); ddsWorkers = []; $('#ddsRoster').innerHTML = '<p class="muted">Selecciona la unidad y pulsa “Cargar trabajadores”.</p>'; renderAttendanceFiles('dds', []); updateSelected('dds');
  }
  function resetRit() {
    const form = $('#ritForm'); form.reset(); form.elements.id.value = ''; form.elements.meetingDate.value = localDate(); form.elements.status.value = 'REALIZADO';
    form.elements.areaId.innerHTML = areaOptions(''); ritWorkers = []; $('#ritRoster').innerHTML = '<p class="muted">Selecciona la unidad y pulsa “Cargar trabajadores”.</p>'; renderAttendanceFiles('rit', []); updateSelected('rit');
  }

  function collectDdsParticipants() {
    return [...document.querySelectorAll('#ddsRoster [data-worker-row]')].filter(row => row.querySelector('[data-select]').checked).map(row => ({
      workerId: Number(row.dataset.workerId), attendanceStatus: row.querySelector('[data-attendance]').value, observation: row.querySelector('[data-observation]').value,
    }));
  }
  function collectRitParticipants() {
    return [...document.querySelectorAll('#ritRoster [data-worker-row]')].filter(row => row.querySelector('[data-select]').checked).map(row => ({
      workerId: Number(row.dataset.workerId), assignedActivity: row.querySelector('[data-activity]').value, responsibility: row.querySelector('[data-responsibility]').value,
    }));
  }

  async function editDds(id) {
    switchTab('dds');
    const data = await api(`/api/daily-safety/dds/${id}`); const f = $('#ddsForm');
    f.elements.id.value = data.session.id; f.elements.sessionDate.value = String(data.session.session_date).slice(0, 10); f.elements.businessUnitId.value = data.session.business_unit_id;
    f.elements.areaId.innerHTML = areaOptions(data.session.business_unit_id, data.session.area_id); f.elements.areaId.value = data.session.area_id || '';
    f.elements.shift.value = data.session.shift; f.elements.guard.value = data.session.guard || ''; f.elements.durationMinutes.value = data.session.duration_minutes; f.elements.topic.value = data.session.topic;
    f.elements.objective.value = data.session.objective || ''; f.elements.observations.value = data.session.observations || ''; f.elements.status.value = data.session.status;
    await loadWorkers('dds', data.participants); renderAttendanceFiles('dds', data.attendanceFiles); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function editRit(id) {
    switchTab('rit');
    const data = await api(`/api/daily-safety/rit/${id}`); const f = $('#ritForm');
    f.elements.id.value = data.session.id; f.elements.meetingDate.value = String(data.session.meeting_date).slice(0, 10); f.elements.businessUnitId.value = data.session.business_unit_id;
    f.elements.areaId.innerHTML = areaOptions(data.session.business_unit_id, data.session.area_id); f.elements.areaId.value = data.session.area_id || '';
    f.elements.shift.value = data.session.shift; f.elements.guard.value = data.session.guard || ''; f.elements.status.value = data.session.status;
    f.elements.previousShiftSummary.value = data.session.previous_shift_summary || ''; f.elements.plannedActivities.value = lines(data.session.planned_activities); f.elements.criticalRisks.value = lines(data.session.critical_risks);
    f.elements.controls.value = lines(data.session.controls); f.elements.restrictions.value = data.session.restrictions || ''; f.elements.commitments.value = lines(data.session.commitments); f.elements.observations.value = data.session.observations || '';
    await loadWorkers('rit', data.participants); renderAttendanceFiles('rit', data.attendanceFiles); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadHistory() {
    const form = $('#dailyHistoryFilters'); const params = new URLSearchParams();
    if (form) new FormData(form).forEach((value, key) => { if (value) params.set(key, value); });
    const [dds, rit] = await Promise.all([api(`/api/daily-safety/dds?${params}`), api(`/api/daily-safety/rit?${params}`)]);
    const ddsRows = dds.map(row => `<tr><td>${String(row.session_date).slice(0, 10)}</td><td>${escapeHtml(row.business_unit_name)}</td><td>${escapeHtml(row.area_name || 'Todas')}</td><td>${escapeHtml(row.topic)}</td><td>${escapeHtml(row.presenter_name || row.presenter_user_name || '')}</td><td>${row.attended_count}/${row.participant_count}</td><td>${row.attendance_scan_count ? `📎 ${row.attendance_scan_count}` : '—'}</td><td>${statusTag(row.status)}</td><td><button class="btn ghost small" data-edit-dds="${row.id}">Abrir</button></td></tr>`);
    const ritRows = rit.map(row => `<tr><td>${String(row.meeting_date).slice(0, 10)}</td><td>${escapeHtml(row.business_unit_name)}</td><td>${escapeHtml(row.area_name || 'Todas')}</td><td>${escapeHtml(row.supervisor_name || row.supervisor_user_name || '')}</td><td>${row.activity_count}</td><td>${row.risk_count}</td><td>${row.participant_count}</td><td>${row.attendance_scan_count ? `📎 ${row.attendance_scan_count}` : '—'}</td><td>${statusTag(row.status)}</td><td><button class="btn ghost small" data-edit-rit="${row.id}">Abrir</button></td></tr>`);
    $('#dailyHistory').innerHTML = `<section class="panel"><h3>Historial DDS</h3>${table(['Fecha', 'Unidad', 'Área', 'Tema', 'Expositor', 'Asistencia', 'Escaneado', 'Estado', ''], ddsRows)}</section><section class="panel"><h3>Historial RIT</h3>${table(['Fecha', 'Unidad', 'Área', 'Supervisor', 'Actividades', 'Riesgos', 'Personal', 'Escaneado', 'Estado', ''], ritRows)}</section>`;
    document.querySelectorAll('[data-edit-dds]').forEach(button => { button.onclick = () => editDds(button.dataset.editDds).catch(error => toast(error.message, 'error')); });
    document.querySelectorAll('[data-edit-rit]').forEach(button => { button.onclick = () => editRit(button.dataset.editRit).catch(error => toast(error.message, 'error')); });
    const filters = Object.fromEntries(params.entries()); await refreshSummary(filters);
  }

  function bindDds() {
    const form = $('#ddsForm'); bindArea(form, 'businessUnitId', 'areaId');
    $('#ddsLoadWorkers').onclick = () => loadWorkers('dds').catch(error => toast(error.message, 'error'));
    $('#ddsReset').onclick = resetDds;
    form.onsubmit = async event => {
      event.preventDefault();
      const scan = $('#ddsAttendanceScan')?.files?.[0] || null;
      const formData = new FormData(form); const body = Object.fromEntries(formData.entries()); body.participants = collectDdsParticipants();
      const id = body.id; delete body.id;
      try {
        const saved = await api(id ? `/api/daily-safety/dds/${id}` : '/api/daily-safety/dds', { method: id ? 'PUT' : 'POST', body });
        if (scan) {
          try { await uploadScan('dds', saved.id, scan); }
          catch (uploadError) { toast(`DDS guardado, pero no se adjuntó el escaneado: ${uploadError.message}`, 'error'); await editDds(saved.id); return; }
        }
        toast(scan ? 'DDS y escaneado guardados' : (id ? 'DDS actualizado' : 'DDS registrado')); resetDds(); await refreshSummary();
      } catch (error) { toast(error.message, 'error'); }
    };
  }
  function bindRit() {
    const form = $('#ritForm'); bindArea(form, 'businessUnitId', 'areaId');
    $('#ritLoadWorkers').onclick = () => loadWorkers('rit').catch(error => toast(error.message, 'error'));
    $('#ritReset').onclick = resetRit;
    form.onsubmit = async event => {
      event.preventDefault();
      const scan = $('#ritAttendanceScan')?.files?.[0] || null;
      const formData = new FormData(form); const body = Object.fromEntries(formData.entries()); body.participants = collectRitParticipants();
      const id = body.id; delete body.id;
      try {
        const saved = await api(id ? `/api/daily-safety/rit/${id}` : '/api/daily-safety/rit', { method: id ? 'PUT' : 'POST', body });
        if (scan) {
          try { await uploadScan('rit', saved.id, scan); }
          catch (uploadError) { toast(`RIT guardada, pero no se adjuntó el escaneado: ${uploadError.message}`, 'error'); await editRit(saved.id); return; }
        }
        toast(scan ? 'RIT y escaneado guardados' : (id ? 'RIT actualizada' : 'RIT registrada')); resetRit(); await refreshSummary();
      } catch (error) { toast(error.message, 'error'); }
    };
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('#dailyTabs [data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const body = $('#dailyTabBody');
    if (tab === 'dds') { body.innerHTML = ddsForm(); bindDds(); }
    if (tab === 'rit') { body.innerHTML = ritForm(); bindRit(); }
    if (tab === 'history') { body.innerHTML = historyView(); $('#dailyHistoryFilters').onsubmit = event => { event.preventDefault(); loadHistory().catch(error => { $('#dailyHistory').innerHTML = errorBox(error); }); }; loadHistory().catch(error => { $('#dailyHistory').innerHTML = errorBox(error); }); }
  }

  document.querySelectorAll('#dailyTabs [data-tab]').forEach(button => { button.onclick = () => switchTab(button.dataset.tab); });
  await refreshSummary();
  switchTab(currentTab);
}
