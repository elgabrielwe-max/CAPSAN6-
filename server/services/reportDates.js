export function isoReportDate(value){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  const raw=String(value??'').trim();
  const direct=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(direct){
    const iso=`${direct[1]}-${direct[2]}-${direct[3]}`;
    const parsed=new Date(`${iso}T00:00:00Z`);
    if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso)return iso;
  }
  if(!raw)return'';
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
}

export function reportPeriod(rows=[],query={}){
  const today=new Date().toISOString().slice(0,10);
  const dates=rows.map(r=>isoReportDate(r.report_date)).filter(Boolean).sort();
  const requestedTo=isoReportDate(query.to);
  const reference=requestedTo||dates.at(-1)||today;
  const requestedFrom=isoReportDate(query.from);
  const from=requestedFrom||`${reference.slice(0,7)}-01`;
  return from<=reference?{from,to:reference}:{from:reference,to:from};
}
