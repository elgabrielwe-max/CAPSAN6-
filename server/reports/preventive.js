import ExcelJS from 'exceljs';

const navy='17324D';
const teal='1B7F79';
const amber='F2B134';
const green='4E9F6F';
const red='C84C4C';
const paper='FFFDF8';
const line='DCE4E9';

function title(ws,text,subtitle='',lastColumn='N'){
  ws.mergeCells(`A1:${lastColumn}1`);
  ws.getCell('A1').value=text;
  ws.getCell('A1').font={bold:true,size:18,color:{argb:'FFFFFFFF'}};
  ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${navy}`}};
  ws.getCell('A1').alignment={vertical:'middle',horizontal:'left'};
  ws.getRow(1).height=30;
  if(subtitle){ws.mergeCells(`A2:${lastColumn}2`);ws.getCell('A2').value=subtitle;ws.getCell('A2').font={italic:true,color:{argb:'FF667788'}};}
}

function styleHeader(row){
  row.eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${teal}`}};
    cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
    cell.border={top:{style:'thin',color:{argb:`FF${line}`}},bottom:{style:'thin',color:{argb:`FF${line}`}},left:{style:'thin',color:{argb:`FF${line}`}},right:{style:'thin',color:{argb:`FF${line}`}}};
  });
  row.height=28;
}

function styleRows(ws,start=4){
  for(let r=start;r<=ws.rowCount;r++){
    ws.getRow(r).eachCell(cell=>{
      cell.alignment={vertical:'top',wrapText:true};
      cell.border={bottom:{style:'hair',color:{argb:`FF${line}`}}};
      if(r%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${paper}`}};
    });
  }
  ws.views=[{state:'frozen',ySplit:start-1}];
  ws.autoFilter={from:{row:start-1,column:1},to:{row:start-1,column:ws.columnCount}};
}

export async function buildRitDailyExcel(rows,label=''){
  const wb=new ExcelJS.Workbook();wb.creator='CAPSAN6';wb.subject='RIT Diario';
  const ws=wb.addWorksheet('RIT DIARIO');
  title(ws,'CAPSAN6 · RIT DIARIO',label);
  ws.columns=[
    {header:'FECHA',key:'rit_date',width:13},{header:'UNIDAD',key:'business_unit',width:24},{header:'ÁREA',key:'area_name',width:22},
    {header:'GUARDIA / TURNO',key:'guard',width:17},{header:'TEMA',key:'topic',width:38},{header:'FACILITADOR',key:'facilitator_name',width:26},
    {header:'PROGRAMADOS',key:'scheduled_count',width:13},{header:'ASISTENTES',key:'attendee_count',width:12},{header:'CUMPLIMIENTO %',key:'compliance_percent',width:16},
    {header:'DURACIÓN (MIN)',key:'duration_minutes',width:14},{header:'ESTADO',key:'status',width:16},{header:'OBSERVACIÓN',key:'observation',width:40},
    {header:'EVIDENCIA',key:'evidence_name',width:28},{header:'REGISTRADO POR',key:'created_by_name',width:24}
  ];
  styleHeader(ws.getRow(3));
  for(const row of rows)ws.addRow({...row,rit_date:String(row.rit_date||'').slice(0,10),evidence_name:row.evidence_name||''});
  styleRows(ws,4);
  ws.getColumn('compliance_percent').numFmt='0.0';
  return wb.xlsx.writeBuffer();
}

export async function buildIdsExcel(rows,label=''){
  const wb=new ExcelJS.Workbook();wb.creator='CAPSAN6';wb.subject='Índice de Desempeño de Seguridad';
  const ws=wb.addWorksheet('IDS');
  title(ws,'CAPSAN6 · IDS',label,'U');
  ws.columns=[
    {header:'DESDE',key:'period_start',width:13},{header:'HASTA',key:'period_end',width:13},{header:'UNIDAD',key:'business_unit',width:24},
    {header:'TRABAJADOR / SUPERVISOR',key:'worker_name',width:30},{header:'DNI',key:'dni',width:12},{header:'COLABORADORES A CARGO',key:'collaborators_count',width:20},
    {header:'RAC PROGRAMADO',key:'rac_programmed',width:16},{header:'RAC EJECUTADO',key:'rac_executed',width:16},{header:'ACTOS',key:'acts_count',width:10},{header:'CONDICIONES',key:'conditions_count',width:13},
    {header:'RIT-CAP PROGRAMADO',key:'rit_cap_programmed',width:18},{header:'RIT-CAP EJECUTADO',key:'rit_cap_executed',width:18},
    {header:'INSPECCIONES PROGRAMADO',key:'inspections_programmed',width:22},{header:'INSPECCIONES EJECUTADO',key:'inspections_executed',width:22},
    {header:'PARE PROGRAMADO',key:'pare_programmed',width:17},{header:'PARE EJECUTADO',key:'pare_executed',width:17},
    {header:'TOTAL PROGRAMADO',key:'total_programmed',width:17},{header:'TOTAL EJECUTADO',key:'total_executed',width:17},
    {header:'CUMPLIMIENTO %',key:'compliance_percent',width:16},{header:'DESEMPEÑO',key:'performance',width:14},{header:'OBSERVACIÓN',key:'observation',width:40}
  ];
  styleHeader(ws.getRow(3));
  for(const row of rows){
    const added=ws.addRow({...row,period_start:String(row.period_start||'').slice(0,10),period_end:String(row.period_end||'').slice(0,10)});
    const performance=String(row.performance||'');
    added.getCell('performance').fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${performance==='BUENO'?green:performance==='REGULAR'?amber:red}`}};
    added.getCell('performance').font={bold:true,color:{argb:'FFFFFFFF'}};
  }
  styleRows(ws,4);
  ws.getColumn('compliance_percent').numFmt='0.0';
  return wb.xlsx.writeBuffer();
}
