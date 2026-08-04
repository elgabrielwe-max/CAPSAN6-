const clean=value=>String(value||'').trim().toUpperCase();

export const RAC_DEADLINE_RULES=Object.freeze({
  ALTO:{days:2,label:'0 a 48 horas'},
  MEDIO:{days:3,label:'1 a 3 días'},
  BAJO:{days:4,label:'1 a 4 días'},
});

export function deadlineDays(riskLevel){
  return RAC_DEADLINE_RULES[clean(riskLevel)]?.days??RAC_DEADLINE_RULES.BAJO.days;
}

export function dueDateForRisk(reportDate,riskLevel){
  const raw=String(reportDate||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
  const date=new Date(`${raw}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+deadlineDays(riskLevel));
  return date.toISOString().slice(0,10);
}

export function deadlineLabel(riskLevel){
  return RAC_DEADLINE_RULES[clean(riskLevel)]?.label??RAC_DEADLINE_RULES.BAJO.label;
}
