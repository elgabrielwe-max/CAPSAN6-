import { classifyCauseFromCatalog, normalizeCauseText } from '../racCauseCatalog.js';

export function canonicalRacReportType(value) {
  const key = normalizeCauseText(value);
  if (key.includes('ACTO')) return 'ACTO SUBESTANDAR';
  if (key.includes('CONDICION')) return 'CONDICION SUBESTANDAR';
  return '';
}

export async function fetchRacCauseCatalog(client) {
  const categories=(await client.query(`SELECT id,code,name,report_type,sort_order FROM rac_cause_categories WHERE active=TRUE ORDER BY sort_order,code`)).rows;
  const subtypes=(await client.query(`SELECT id,category_id,name,is_custom,sort_order FROM rac_cause_subtypes WHERE active=TRUE ORDER BY category_id,sort_order,name`)).rows;
  return categories.map(category=>({id:category.id,code:category.code,name:category.name,reportType:canonicalRacReportType(category.report_type)||category.report_type,sortOrder:category.sort_order,subtypes:subtypes.filter(subtype=>Number(subtype.category_id)===Number(category.id)).map(subtype=>({id:subtype.id,name:subtype.name,isCustom:subtype.is_custom,sortOrder:subtype.sort_order}))}));
}

function findSubtype(catalog, value, preferredCategory=null) {
  const key=normalizeCauseText(value);
  if(!key)return null;
  const ordered=preferredCategory?[preferredCategory,...catalog.filter(item=>Number(item.id)!==Number(preferredCategory.id))]:catalog;
  for(const item of ordered){
    const subtype=item.subtypes.find(row=>normalizeCauseText(row.name)===key);
    if(subtype)return{category:item,subtype};
  }
  return null;
}

export async function resolveRacCauseSelection(client,input={}) {
  const catalog=await fetchRacCauseCatalog(client);
  const requestedReportType=canonicalRacReportType(input.reportType);
  let category=null;let subtype=null;

  if(input.categoryId)category=catalog.find(item=>Number(item.id)===Number(input.categoryId))||null;
  if(!category&&input.categoryCode)category=catalog.find(item=>normalizeCauseText(item.code)===normalizeCauseText(input.categoryCode))||null;
  if(!category&&input.categoryName)category=catalog.find(item=>normalizeCauseText(item.name)===normalizeCauseText(input.categoryName))||null;

  if(input.subtypeId){
    for(const item of catalog){
      const found=item.subtypes.find(row=>Number(row.id)===Number(input.subtypeId));
      if(found){category=item;subtype=found;break;}
    }
  }

  if(!subtype&&input.subtypeName){
    const exact=findSubtype(catalog,input.subtypeName,category);
    if(exact){category=exact.category;subtype=exact.subtype;}
  }

  if(!category||!subtype){
    const inferred=classifyCauseFromCatalog(`${input.subtypeName||''} ${input.fallbackText||''}`,requestedReportType);
    const inferredCategory=catalog.find(item=>normalizeCauseText(item.code)===normalizeCauseText(inferred.causeCategoryCode))||null;
    const inferredSubtype=inferredCategory?.subtypes.find(row=>normalizeCauseText(row.name)===normalizeCauseText(inferred.causeSubtype))||null;
    if(!category)category=inferredCategory;
    if(!subtype&&category){
      subtype=category.subtypes.find(row=>normalizeCauseText(row.name)===normalizeCauseText(inferred.causeSubtype))||null;
    }
    if(!subtype&&inferredCategory&&inferredSubtype){category=inferredCategory;subtype=inferredSubtype;}
  }

  if(!category)throw Object.assign(new Error('Selecciona un tipo de causa válido'),{status:400});
  if(!subtype)throw Object.assign(new Error('Selecciona una subcausa válida'),{status:400});

  const catalogReportType=canonicalRacReportType(category.reportType);
  return{
    category,
    subtype,
    reportType:requestedReportType||catalogReportType||'CONDICION SUBESTANDAR',
    typeMismatch:Boolean(requestedReportType&&catalogReportType&&requestedReportType!==catalogReportType)
  };
}

export async function createRacCauseSubtype(client,{categoryId,name,createdBy}) {
  const clean=String(name||'').trim().replace(/\s+/g,' ').toUpperCase();if(clean.length<4||clean.length>220)throw Object.assign(new Error('La nueva subcausa debe tener entre 4 y 220 caracteres'),{status:400});
  const normalized=normalizeCauseText(clean);const category=(await client.query(`SELECT id,code,name,report_type FROM rac_cause_categories WHERE id=$1 AND active=TRUE`,[Number(categoryId)])).rows[0];if(!category)throw Object.assign(new Error('Tipo de causa no encontrado'),{status:404});
  const row=(await client.query(`INSERT INTO rac_cause_subtypes(category_id,name,normalized_name,is_custom,active,created_by,sort_order) VALUES($1,$2,$3,TRUE,TRUE,$4,COALESCE((SELECT MAX(sort_order)+1 FROM rac_cause_subtypes WHERE category_id=$1),1)) ON CONFLICT(category_id,normalized_name) DO UPDATE SET active=TRUE,updated_at=NOW() RETURNING id,category_id,name,is_custom,sort_order`,[category.id,clean,normalized,createdBy])).rows[0];
  return{id:row.id,categoryId:row.category_id,name:row.name,isCustom:row.is_custom,sortOrder:row.sort_order,category:{id:category.id,code:category.code,name:category.name,reportType:canonicalRacReportType(category.report_type)||category.report_type}};
}
