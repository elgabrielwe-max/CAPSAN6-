import { api,setToken } from '../api.js';
import { state,unitOptions,areaOptions,escapeHtml } from '../state.js';
import { $,formData,table,toast,modal,errorBox } from '../ui.js';

export async function unitsAreasPage(root){
  let units=await api('/api/admin/units');
  let areas=await api('/api/admin/areas');
  const renderPage=()=>{
    root.innerHTML=`<div class="page-head"><div><h2>Unidades y áreas</h2><p>Catálogos centrales compartidos por trabajadores, capacitaciones, RACS e incidentes.</p></div></div><div class="grid-2"><section class="panel"><h3>Unidad de negocio</h3><form id="unitForm"><div class="form-grid two"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Código</label><input name="code" maxlength="30"></div></div><button class="btn primary">Guardar unidad</button></form><div id="unitList"></div></section><section class="panel"><h3>Área</h3><form id="areaForm"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Código</label><input name="code"></div><div class="field"><label>Unidades donde se utiliza</label><div class="check-grid">${state.catalogs.units.map(x=>`<label class="check"><input type="checkbox" name="unitIds" value="${x.id}">${escapeHtml(x.name)}</label>`).join('')}</div></div><button class="btn primary">Guardar área</button></form><div id="areaList"></div></section></div>`;
    $('#unitList').innerHTML=table(['Unidad','Código','Trabajadores','Usuarios'],units.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.code||'')}</td><td>${x.workers}</td><td>${x.users}</td></tr>`));
    $('#areaList').innerHTML=table(['Área','Unidades','Trabajadores'],areas.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${(x.unit_ids||[]).map(id=>escapeHtml(state.catalogs.units.find(u=>Number(u.id)===Number(id))?.name||id)).join('<br>')}</td><td>${x.workers}</td></tr>`));
    $('#unitForm').onsubmit=async event=>{
      event.preventDefault();
      try{
        const saved=await api('/api/admin/units',{method:'POST',body:formData(event.currentTarget)});
        state.catalogs=await api('/api/catalogs');
        units=await api('/api/admin/units');
        areas=await api('/api/admin/areas');
        toast(`Unidad guardada${saved.propagatedUsers?` · ${saved.propagatedUsers} perfiles con acceso automático actualizados`:''}`);
        renderPage();
      }catch(error){toast(error.message,'error');}
    };
    $('#areaForm').onsubmit=async event=>{
      event.preventDefault();
      const data=formData(event.currentTarget);
      data.unitIds=[...event.currentTarget.querySelectorAll('[name=unitIds]:checked')].map(x=>Number(x.value));
      try{
        await api('/api/admin/areas',{method:'POST',body:data});
        state.catalogs=await api('/api/catalogs');
        areas=await api('/api/admin/areas');
        toast('Área guardada');
        renderPage();
      }catch(error){toast(error.message,'error');}
    };
  };
  renderPage();
}

export async function usersPage(root){
  let users=await api('/api/admin/users');
  root.innerHTML=`<div class="page-head"><div><h2>Usuarios y permisos por unidad</h2><p>Los perfiles SSOMA y Supervisor pueden usar unidades específicas o recibir automáticamente todas las unidades actuales y futuras.</p></div><div class="actions"><button class="btn danger" id="deleteSelected">Eliminar seleccionados</button></div></div><div class="grid-2"><section class="panel"><h3>Crear o editar usuario</h3><form id="userForm"><input type="hidden" name="id"><div class="form-grid two"><div class="field"><label>Nombres</label><input name="name" required></div><div class="field"><label>Usuario / DNI</label><input name="username" required></div><div class="field"><label>Correo</label><input name="email" type="email"></div><div class="field"><label>Perfil</label><select name="role"><option>SUPERVISOR</option><option>SSOMA</option><option>MASTER</option></select></div><div class="field span-2"><label>Contraseña temporal (solo al crear)</label><input name="password" type="password"></div><div class="field span-2"><label class="check"><input type="checkbox" id="allUnitsAccess"> Todas las unidades actuales y futuras</label><small class="muted">Úsalo para personal SSOMA corporativo. Las unidades nuevas se agregarán automáticamente.</small></div><div class="field span-2"><label>Unidades de negocio</label><div class="check-grid" id="userUnits">${state.catalogs.units.map(x=>`<label class="check"><input type="checkbox" value="${x.id}">${escapeHtml(x.name)}</label>`).join('')}</div></div></div><button class="btn primary">Guardar usuario</button> <button type="button" class="btn ghost" id="clearUser">Limpiar</button></form></section><section class="panel"><h3>Importar Supervisores / SSOMA</h3><div class="panel-sub">Excel con USUARIO o DNI, NOMBRES Y APELLIDOS, ROL y UNIDAD DE NEGOCIO.</div><form id="userImport"><div class="dropzone"><input type="file" name="file" accept=".xlsx,.xls" required></div><button class="btn amber">Importar perfiles</button></form></section></div><section class="panel"><div id="userList"></div></section>`;
  const form=$('#userForm');
  const allUnits=$('#allUnitsAccess');
  const syncAllUnits=()=>{
    const enabled=allUnits.checked;
    form.querySelectorAll('#userUnits input').forEach(input=>{if(enabled)input.checked=true;input.disabled=enabled;});
  };
  allUnits.onchange=syncAllUnits;
  function render(){
    const rows=users.map(user=>`<tr><td><input type="checkbox" class="user-check" value="${user.id}"></td><td><b>${escapeHtml(user.name)}</b><br><small>${escapeHtml(user.username)}</small></td><td>${escapeHtml(user.role)}</td><td>${user.all_units_access?'<span class="tag done">TODAS · AUTOMÁTICO</span><br>':''}${(user.units||[]).map(escapeHtml).join('<br>')||'Sin asignación'}</td><td>${user.active?'ACTIVO':'INACTIVO'}</td><td><button class="btn small" data-edit="${user.id}">Editar</button> ${['SSOMA','SUPERVISOR'].includes(user.role)?`<button class="btn small amber" data-enter="${user.id}">Ingresar al perfil</button>`:''} <button class="btn small ghost" data-reset="${user.id}">Clave temporal</button></td></tr>`);
    $('#userList').innerHTML=table(['','Usuario','Perfil','Unidades','Estado','Acciones'],rows);
    document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{
      const user=users.find(x=>x.id===Number(button.dataset.edit));
      form.id.value=user.id;form.name.value=user.name;form.username.value=user.username;form.email.value=user.email||'';form.role.value=user.role;form.password.value='';
      allUnits.checked=Boolean(user.all_units_access);
      const selected=new Set((user.unit_ids||[]).map(Number));
      form.querySelectorAll('#userUnits input').forEach(input=>input.checked=selected.has(Number(input.value)));
      syncAllUnits();scrollTo({top:0,behavior:'smooth'});
    });
    document.querySelectorAll('[data-enter]').forEach(button=>button.onclick=async()=>{try{const data=await api(`/api/auth/impersonate/${button.dataset.enter}`,{method:'POST'});setToken(data.token);location.hash='dashboard';location.reload();}catch(error){toast(error.message,'error')}});
    document.querySelectorAll('[data-reset]').forEach(button=>button.onclick=()=>resetModal(button.dataset.reset));
  }
  render();
  $('#clearUser').onclick=()=>{form.reset();form.id.value='';allUnits.checked=false;syncAllUnits();};
  form.onsubmit=async event=>{
    event.preventDefault();
    const data=formData(event.currentTarget);
    data.allUnitsAccess=allUnits.checked;
    data.unitIds=[...event.currentTarget.querySelectorAll('#userUnits input:checked')].map(x=>Number(x.value));
    try{await api('/api/admin/users',{method:'POST',body:data});toast('Usuario guardado');users=await api('/api/admin/users');render();event.currentTarget.reset();allUnits.checked=false;syncAllUnits();}catch(error){toast(error.message,'error');}
  };
  $('#userImport').onsubmit=async event=>{event.preventDefault();try{const result=await api('/api/admin/users/import',{method:'POST',body:new FormData(event.currentTarget)});toast(`${result.inserted} creados, ${result.updated} actualizados`);users=await api('/api/admin/users');render();}catch(error){toast(error.message,'error')}};
  $('#deleteSelected').onclick=()=>{
    const ids=[...document.querySelectorAll('.user-check:checked')].map(x=>Number(x.value));if(!ids.length)return toast('Selecciona usuarios','error');
    const box=modal(`Eliminar ${ids.length} usuarios`,`<form id="deleteUsers"><div class="alert danger">Se desactivarán las cuentas y sus asignaciones activas. Los RACS y auditorías se conservan.</div><div class="field"><label>Contraseña actual del Máster</label><input type="password" name="currentPassword" required></div><button class="btn danger">Confirmar eliminación</button></form>`);
    box.querySelector('#deleteUsers').onsubmit=async event=>{event.preventDefault();try{await api('/api/admin/users/bulk-delete',{method:'POST',body:{ids,currentPassword:event.currentTarget.currentPassword.value}});toast('Usuarios eliminados');box.remove();users=await api('/api/admin/users');render();}catch(error){toast(error.message,'error')}};
  };
  function resetModal(id){const box=modal('Asignar contraseña temporal',`<form id="resetPass"><div class="field"><label>Nueva contraseña temporal</label><input type="password" name="password" required></div><button class="btn primary">Restablecer</button></form>`);box.querySelector('#resetPass').onsubmit=async event=>{event.preventDefault();try{await api(`/api/admin/users/${id}/reset-password`,{method:'POST',body:formData(event.currentTarget)});toast('Contraseña temporal asignada');box.remove();}catch(error){toast(error.message,'error')}};}
}

export async function racPurgePage(root){
  root.innerHTML=`<div class="page-head"><div><h2>Depuración segura de RACS</h2><p>Exclusiva para Máster. Crea respaldo JSON y memoria de conciliación antes de eliminar, para recuperar estados, evidencias, direccionamientos e historial al reimportar.</p></div></div><section class="panel"><form id="purgeForm"><div class="form-grid three"><div class="field"><label>Unidad (vacío = todas)</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Desde</label><input type="date" name="from"></div><div class="field"><label>Hasta</label><input type="date" name="to"></div></div><button class="btn amber" type="button" id="previewPurge">Vista previa</button><div id="purgePreview"></div></form></section>`;

  const purgeForm=$('#purgeForm');
  purgeForm.onsubmit=event=>event.preventDefault();
  let preview=null;

  $('#previewPurge').onclick=async()=>{
    try{
      preview=await api('/api/racs/purge/preview',{method:'POST',body:formData(purgeForm)});
      $('#purgePreview').innerHTML=`<div class="alert danger"><b>${preview.total} RACS</b> serán eliminados. Periodo: ${preview.date_from||'—'} a ${preview.date_to||'—'}.</div><div class="alert ok"><b>Protección automática activa:</b> el sistema memorizará estados, evidencias, direccionamientos, asignaciones e historial para restaurarlos cuando vuelvas a importar el modelo oficial.</div><div class="form-grid two"><div class="field"><label>Escribe exactamente: ${escapeHtml(preview.phrase)}</label><input id="purgePhrase" autocomplete="off" placeholder="${escapeHtml(preview.phrase)}"></div><div class="field"><label>Contraseña Máster</label><input id="purgePassword" type="password" autocomplete="current-password"></div></div><button class="btn danger" type="button" id="executePurge">Crear respaldo y eliminar</button>`;

      $('#executePurge').onclick=async event=>{
        event.preventDefault();
        const phrase=$('#purgePhrase').value.trim();
        const currentPassword=$('#purgePassword').value;

        if(phrase!==preview.phrase){
          toast(`Escribe exactamente: ${preview.phrase}`,'error');
          $('#purgePhrase').focus();
          return;
        }
        if(!currentPassword){
          toast('Ingresa la contraseña Máster','error');
          $('#purgePassword').focus();
          return;
        }

        const button=event.currentTarget;
        button.disabled=true;
        button.textContent='Eliminando…';
        try{
          const body={...formData(purgeForm),phrase,currentPassword};
          const result=await api('/api/racs/purge/execute',{method:'POST',body});
          toast(`${result.deleted} RACS eliminados; ${result.remembered||0} preparados para conciliación`);
          preview=null;
          $('#purgePreview').innerHTML=`<div class="alert ok"><b>${result.deleted} RACS eliminados.</b><br>${result.remembered||0} registros guardados en memoria de conciliación.<br>Respaldo: ${escapeHtml(result.backupPath)}<br><b>Ahora importa el Excel oficial; el sistema restaurará automáticamente el estado más avanzado y las evidencias.</b></div>`;
        }catch(error){
          toast(error.message,'error');
          button.disabled=false;
          button.textContent='Crear respaldo y eliminar';
        }
      };
    }catch(error){
      toast(error.message,'error');
    }
  };
}

export async function workersPage(root){let workers=[];root.innerHTML=`<div class="page-head"><div><h2>Base maestra de trabajadores</h2><p>Una sola fuente para capacitación, responsables, reportes e indicadores por unidad.</p></div></div><div class="grid-2"><section class="panel"><h3>Registrar o actualizar trabajador</h3><form id="workerForm"><div class="form-grid two"><div class="field"><label>DNI</label><input name="dni" required></div><div class="field"><label>Apellidos y nombres</label><input name="fullName" required></div><div class="field"><label>Unidad</label><select name="businessUnitId" required>${unitOptions()}</select></div><div class="field"><label>Área</label><input name="areaName" value="SIN ÁREA ASIGNADA"></div><div class="field"><label>Zona</label><input name="zone"></div><div class="field"><label>Cargo</label><input name="position"></div><div class="field"><label>Guardia</label><input name="guard"></div></div><button class="btn primary">Guardar trabajador</button></form></section><section class="panel"><h3>Importación inteligente de trabajadores</h3><div class="panel-sub">Reconoce DNI, NOMBRES Y APELLIDOS, PUESTO, ÁREA, UNIDAD, ZONA y GUARDIA. También interpreta cuando AREA contiene la unidad.</div><form id="workerImport"><div class="field"><label>Unidad de negocio opcional</label><select name="businessUnitId">${unitOptions()}</select></div><div class="dropzone"><input type="file" name="file" accept=".xlsx,.xls" required></div><button class="btn amber" type="button" id="analyzeWorkers">Analizar</button><button class="btn primary">Importar personal</button></form><div id="workerAnalysis"></div></section></div><section class="panel"><form id="workerFilters" class="filter-grid"><div class="field"><label>Unidad</label><select name="businessUnitId">${unitOptions()}</select></div><div class="field"><label>Área</label><select name="areaId">${areaOptions()}</select></div><div class="field"><label>Buscar</label><input name="search" placeholder="DNI o trabajador"></div><div class="field"><label>&nbsp;</label><button class="btn primary">Buscar</button></div></form><div id="workerList"></div></section>`;async function load(){const q=new URLSearchParams(formData($('#workerFilters')));workers=await api(`/api/admin/workers?${q}`);$('#workerList').innerHTML=table(['DNI','Trabajador','Unidad','Área','Cargo','Zona','Guardia'],workers.map(w=>`<tr><td>${w.dni}</td><td>${escapeHtml(w.full_name)}</td><td>${escapeHtml(w.business_unit_name||'')}</td><td>${escapeHtml(w.area_name)}</td><td>${escapeHtml(w.position||'')}</td><td>${escapeHtml(w.zone||'')}</td><td>${escapeHtml(w.guard||'')}</td></tr>`));}$('#workerForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/workers',{method:'POST',body:formData(e.currentTarget)});toast('Trabajador guardado');load();}catch(err){toast(err.message,'error')}};$('#analyzeWorkers').onclick=async()=>{const fd=new FormData($('#workerImport'));try{const a=await api('/api/admin/workers/import/analyze',{method:'POST',body:fd});$('#workerAnalysis').innerHTML=`<div class="alert ok">${a.validRows} trabajadores válidos. Unidad detectada: ${escapeHtml(a.inferredBusinessUnit||'—')}.</div>${a.warnings.map(x=>`<div class="alert warn">${escapeHtml(x)}</div>`).join('')}${a.errors.slice(0,6).map(x=>`<div class="alert danger">${escapeHtml(x)}</div>`).join('')}`;}catch(err){$('#workerAnalysis').innerHTML=errorBox(err)}};$('#workerImport').onsubmit=async e=>{e.preventDefault();try{const r=await api('/api/admin/workers/import',{method:'POST',body:new FormData(e.currentTarget)});toast(`${r.inserted} insertados y ${r.updated} actualizados`);load();}catch(err){toast(err.message,'error')}};$('#workerFilters').onsubmit=e=>{e.preventDefault();load()};await load();}
