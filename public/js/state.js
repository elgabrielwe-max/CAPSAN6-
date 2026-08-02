export const state={user:null,catalogs:{units:[],areas:[],users:[],riskLevels:[],racStatuses:[]},route:'dashboard',filters:{}};
export const can=cap=>state.user?.capabilities?.includes(cap);
export const unitOptions=(selected='')=>`<option value="">Todas las unidades</option>${state.catalogs.units.map(x=>`<option value="${x.id}" ${String(selected)===String(x.id)?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}`;
export const areaOptions=(selected='',unitId='')=>`<option value="">Todas las áreas</option>${state.catalogs.areas.filter(a=>!unitId||!a.unit_ids?.length||a.unit_ids.map(Number).includes(Number(unitId))).map(x=>`<option value="${x.id}" ${String(selected)===String(x.id)?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}`;
export function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
