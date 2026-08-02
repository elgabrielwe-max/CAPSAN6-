import { scopedUnitIds } from './auth.js';

export function unitScope(user, alias='r', startIndex=1) {
  const ids=scopedUnitIds(user);
  if(ids===null)return { clause:'TRUE', params:[], next:startIndex };
  if(!ids.length)return { clause:'FALSE', params:[], next:startIndex };
  return { clause:`${alias}.business_unit_id = ANY($${startIndex}::int[])`, params:[ids], next:startIndex+1 };
}

export function parseFilters(query, start=1, alias='r') {
  const clauses=[],params=[]; let i=start;
  if(query.businessUnitId){clauses.push(`${alias}.business_unit_id=$${i++}`);params.push(Number(query.businessUnitId));}
  if(query.from){clauses.push(`${alias}.report_date >= $${i++}::date`);params.push(query.from);}
  if(query.to){clauses.push(`${alias}.report_date <= $${i++}::date`);params.push(query.to);}
  if(query.status){clauses.push(`${alias}.status=$${i++}`);params.push(query.status);}
  if(query.risk){clauses.push(`${alias}.risk_level=$${i++}`);params.push(query.risk);}
  if(query.reportType){clauses.push(`${alias}.report_type=$${i++}`);params.push(query.reportType);}
  if(query.supervisorUserId){clauses.push(`COALESCE(${alias}.supervisor_user_id,0)=$${i++}`);params.push(Number(query.supervisorUserId));}
  return { clause:clauses.length?clauses.join(' AND '):'TRUE',params,next:i };
}
