import { classifyCauseFromCatalog, normalizeCauseText } from '../racCauseCatalog.js';

export async function fetchRacCauseCatalog(client) {
  const categories=(await client.query(`SELECT id,code,name,report_type,sort_order FROM rac_cause_categories WHERE active=TRUE ORDER BY sort_order,code`)).rows;
  const subtypes=(await client.query(`SELECT id,category_id,name,is_custom,sort_order FROM rac_cause_subtypes WHERE active=TRUE ORDER BY category_id,sort_order,name`)).rows;
  return categories.map(category=>({id:category.id,code:category.code,name:category.name,reportType:category.report_type,sortOrder:category.sort_order,subtypes:subtypes.filter(subtype=>Number(subtype.category_id)===Number(category.id)).map(subtype=>({id:subtype.id,name:subtype.name,isCustom:subtype.is_custom,sortOrder:subtype.sort_order}))}));
}

export async function resolveRacCauseSelection(client,input={}) {
  const catalog=await fetchRacCauseCatalog(client);const reportType=normalizeCauseText(input.reportType);
  let category=null;let subtype=null;
  if(input.categoryId)category=catalog.find(item=>Number(item.id)===Number(input.categoryId))||null;
  if(!category&&input.categoryCode)category=catalog.find(item=>normalizeCauseText(item.code)===normalizeCauseText(input.categoryCode))||null;
  if(!category&&input.categoryName)category=catalog.find(item=>normalizeCauseText(item.name)===normalizeCauseText(input.categoryName))||null;
  if(input.subtypeId){for(const item of catalog){const found=item.subtypes.find(row=>Number(row.id)===Number(input.subtypeId));if(found){category=item;subtype=found;break;}}}
  if(!subtype&&input.subtypeName){const key=normalizeCauseText(input.subtypeName);for(const item of category?[category]:catalog){const found=item.subtypes.find(row=>normalizeCauseText(row.name)===key);if(found){category=item;subtype=found;break;}}}
  if(category&&reportType&&normalizeCauseText(category.reportType)!==reportType)throw Object.assign(new Error('El tipo de causa no corresponde al tipo de reporte seleccionado'),{status:400});
  if(!category||!subtype){const inferred=classifyCauseFromCatalog(`${input.subtypeName||''} ${input.fallbackText||''}`,input.reportType);category=catalog.find(item=>item.code===inferred.causeCategoryCode)||category;subtype=category?.subtypes.find(row=>normalizeCauseText(row.name)===normalizeCauseText(inferred.causeSubtype))||subtype;}
  if(!category)throw Object.assign(new Error('Selecciona un tipo de causa válido'),{status:400});
  if(!subtype)throw Object.assign(new Error('Selecciona una subcausa válida'),{status:400});
  return{category,subtype};
}

export async function createRacCauseSubtype(client,{categoryId,name,createdBy}) {
  const clean=String(name||'').trim().replace(/\s+/g,' ').toUpperCase();if(clean.length<4||clean.length>220)throw Object.assign(new Error('La nueva subcausa debe tener entre 4 y 220 caracteres'),{status:400});
  const normalized=normalizeCauseText(clean);const category=(await client.query(`SELECT id,code,name,report_type FROM rac_cause_categories WHERE id=$1 AND active=TRUE`,[Number(categoryId)])).rows[0];if(!category)throw Object.assign(new Error('Tipo de causa no encontrado'),{status:404});
  const row=(await client.query(`INSERT INTO rac_cause_subtypes(category_id,name,normalized_name,is_custom,active,created_by,sort_order) VALUES($1,$2,$3,TRUE,TRUE,$4,COALESCE((SELECT MAX(sort_order)+1 FROM rac_cause_subtypes WHERE category_id=$1),1)) ON CONFLICT(category_id,normalized_name) DO UPDATE SET active=TRUE,updated_at=NOW() RETURNING id,category_id,name,is_custom,sort_order`,[category.id,clean,normalized,createdBy])).rows[0];
  return{id:row.id,categoryId:row.category_id,name:row.name,isCustom:row.is_custom,sortOrder:row.sort_order,category:{id:category.id,code:category.code,name:category.name,reportType:category.report_type}};
}
