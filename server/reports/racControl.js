import ExcelJS from 'exceljs';

const C={navy:'17324D',teal:'138F8A',green:'2E8B57',amber:'F5A623',red:'C0392B',light:'EEF4F7',white:'FFFFFF',ink:'1F2933'};
const pct=(a,b)=>Number(b)?Math.round(Number(a)*100/Number(b)):0;

function styleHeader(row,color=C.navy){
  row.font={bold:true,color:{argb:C.white}};
  row.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};
  row.alignment={vertical:'middle',horizontal:'center',wrapText:true};
}
function styleRows(sheet,start=2){
  for(let r=start;r<=sheet.rowCount;r++){
    const row=sheet.getRow(r);
    row.alignment={vertical:'top',wrapText:true};
    if(r%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F7FAFC'}};
  }
}
function addDetailSheet(workbook,name,rows){
  const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[
    {header:'RAC',key:'report_code',width:20},{header:'Unidad',key:'business_unit',width:26},{header:'Fecha',key:'report_date',width:13},
    {header:'Vencimiento',key:'due_date',width:13},{header:'Riesgo',key:'risk_level',width:11},{header:'Estado',key:'status',width:25},
    {header:'Supervisor',key:'supervisor_name',width:28},{header:'Área reportante',key:'reporting_area',width:24},
    {header:'Lugar',key:'location',width:28},{header:'Descripción',key:'description',width:65},{header:'Días vencido',key:'days_overdue',width:13},
    {header:'Evidencia final',key:'has_final_evidence',width:16},{header:'Requiere evidencia',key:'evidence_required',width:18},
    {header:'Tipo de sustento',key:'closure_support',width:20},{header:'Justificación de excepción',key:'evidence_exemption_reason',width:45},
  ];
  styleHeader(sheet.getRow(1));
  rows.forEach(row=>sheet.addRow({...row,has_final_evidence:row.has_final_evidence?'SÍ':'NO',evidence_required:row.evidence_required?'SÍ':'NO',closure_support:row.has_final_evidence?'EVIDENCIA':(!row.evidence_required?'NO REQUIERE EVIDENCIA':'SIN SUSTENTO')}));
  styleRows(sheet);
  sheet.autoFilter={from:'A1',to:'O1'};
  return sheet;
}

export async function buildRacControlExcel(summaryRows=[],detailRows=[],label=''){
  const workbook=new ExcelJS.Workbook();
  workbook.creator='CAPSAN6';
  workbook.subject='Control de plazos y estados RACS por unidad';
  const sheet=workbook.addWorksheet('CONTROL POR UNIDAD',{views:[{state:'frozen',ySplit:6,showGridLines:false}]});
  sheet.columns=[
    {width:28},{width:12},{width:12},{width:12},{width:12},{width:12},{width:12},{width:14},{width:18},{width:18},
    {width:18},{width:15},{width:15},{width:15},{width:17},{width:17},{width:16},{width:15},{width:14},{width:14},{width:14}
  ];
  sheet.mergeCells('A1:U2');
  const title=sheet.getCell('A1');title.value='CONTROL EJECUTIVO RACS POR UNIDAD';title.font={size:22,bold:true,color:{argb:C.white}};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};title.alignment={horizontal:'center',vertical:'middle'};
  sheet.mergeCells('A3:U3');sheet.getCell('A3').value=label;sheet.getCell('A3').alignment={horizontal:'center'};
  sheet.mergeCells('A4:U4');sheet.getCell('A4').value='Plazos: ALTO 0–48 horas · MEDIO 1–3 días · BAJO 1–4 días';sheet.getCell('A4').font={bold:true,color:{argb:C.red}};sheet.getCell('A4').alignment={horizontal:'center'};
  const headers=['Unidad','Trabajadores','RACS','Actos','Condiciones','Alto','Medio','Bajo','Pendientes','En proceso','Pend. validación','Devueltos','Levantados','Lev. con evidencia','No requiere evidencia','Lev. sin sustento','Cierres sustentados','Vencidos','Vence hoy','Alto vencido','% cierre'];
  headers.forEach((h,i)=>sheet.getCell(6,i+1).value=h);styleHeader(sheet.getRow(6));
  for(const row of summaryRows){
    sheet.addRow([row.unit,row.workers,row.total,row.acts,row.conditions,row.high,row.medium,row.low,row.pending,row.in_process,row.pending_validation,row.returned,row.lifted,row.lifted_with_evidence,row.lifted_no_evidence_required,row.lifted_without_evidence,Number(row.lifted_with_evidence||0)+Number(row.lifted_no_evidence_required||0),row.overdue,row.due_today,row.high_overdue,pct(row.lifted,row.total)]);
  }
  styleRows(sheet,7);
  for(let r=7;r<=sheet.rowCount;r++)sheet.getCell(r,21).numFmt='0"%"';
  sheet.autoFilter={from:'A6',to:'U6'};
  const total=summaryRows.reduce((a,r)=>{for(const key of ['workers','total','acts','conditions','high','medium','low','pending','in_process','pending_validation','returned','lifted','lifted_with_evidence','lifted_no_evidence_required','lifted_without_evidence','overdue','due_today','high_overdue'])a[key]=(a[key]||0)+Number(r[key]||0);return a;},{});
  const totalRow=sheet.addRow(['TOTAL',total.workers,total.total,total.acts,total.conditions,total.high,total.medium,total.low,total.pending,total.in_process,total.pending_validation,total.returned,total.lifted,total.lifted_with_evidence,total.lifted_no_evidence_required,total.lifted_without_evidence,Number(total.lifted_with_evidence||0)+Number(total.lifted_no_evidence_required||0),total.overdue,total.due_today,total.high_overdue,pct(total.lifted,total.total)]);
  totalRow.font={bold:true,color:{argb:C.white}};totalRow.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.teal}};totalRow.alignment={horizontal:'center'};totalRow.getCell(21).numFmt='0"%"';

  addDetailSheet(workbook,'RACS VENCIDOS',detailRows.filter(x=>x.is_overdue));
  addDetailSheet(workbook,'PENDIENTES VALIDACION',detailRows.filter(x=>x.status==='PENDIENTE DE VALIDACION'));
  addDetailSheet(workbook,'NO REQUIERE EVIDENCIA',detailRows.filter(x=>x.status==='LEVANTADO'&&!x.evidence_required));
  addDetailSheet(workbook,'LEV. SIN SUSTENTO',detailRows.filter(x=>x.status==='LEVANTADO'&&x.evidence_required&&!x.has_final_evidence));
  addDetailSheet(workbook,'RIESGO ALTO',detailRows.filter(x=>x.risk_level==='ALTO'));
  return workbook.xlsx.writeBuffer();
}
