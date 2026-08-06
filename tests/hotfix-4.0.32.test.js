import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRacFingerprints, sameRacContentIdentity } from '../server/services/racReconciliation.js';
import { classifyCauseFromCatalog } from '../server/racCauseCatalog.js';

test('encabezados reales de origen están reconocidos por el importador',()=>{
  const workbook=fs.readFileSync(new URL('../server/imports/racWorkbook.js',import.meta.url),'utf8');
  for(const header of ['N° REPORTE','N° ORIGEN','SUPERVISOR ACARGO DE LA ENTREGA','SUBTIPO / CAUSA NORMALIZADA','TIPO'])assert.match(workbook,new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(workbook,/sourceReportNumber:source/);
  assert.match(workbook,/rawCause:rawCause\.toUpperCase\(\)/);
});

test('dos hallazgos con igual descripción no se fusionan si cambia reportante o lugar',()=>{
  const a={businessUnitName:'MINA CANDELARIA',sourceReportNumber:'1',reportDate:'2026-08-01',reporterName:'FELIBERTO TAYPE',reportingArea:'MANTENIMIENTO',reportedArea:'OPERACION MINA',location:'NV 365',description:'PERFORISTA SIN LUBRICACION'};
  const b={...a,sourceReportNumber:'3',location:'NV 440 - SANTA ROSA'};
  const c={...a,sourceReportNumber:'64',reporterName:'DEYSI BARRETO',location:'TRINCHERA',description:'SE ENCONTRO MECHA RAPIDA EN UNA BOLSA'};
  const d={...c,sourceReportNumber:'68',reporterName:'STHEVYN AZAÑERO',location:'CAMPAMENTO 10'};
  assert.notEqual(buildRacFingerprints(a).contentFingerprint,buildRacFingerprints(b).contentFingerprint);
  assert.notEqual(buildRacFingerprints(c).contentFingerprint,buildRacFingerprints(d).contentFingerprint);
  assert.equal(sameRacContentIdentity(a,b),false);
  assert.equal(sameRacContentIdentity(c,d),false);
  assert.equal(sameRacContentIdentity(a,{...a,sourceReportNumber:'9',reportedArea:'MANTENIMIENTO'}),false);
});

test('duplicados verdaderos se consolidan aunque cambie solo el número de origen',()=>{
  const a={businessUnitName:'DIAMANTINA',sourceReportNumber:'128',reportDate:'2026-08-01',reporterName:'D. JANAMPA COLLAO',reportingArea:'DIAMANTINA',reportedArea:'DIAMANTINA',location:'NV 620 - CAMARA DDH B150',description:'ACUMULACION DE MONOXIDO Y POLVO EN LA RAMPA Y CAMARA SM50'};
  const b={...a,sourceReportNumber:'1'};
  const fa=buildRacFingerprints(a),fb=buildRacFingerprints(b);
  assert.notEqual(fa.recordFingerprint,fb.recordFingerprint);
  assert.equal(fa.contentFingerprint,fb.contentFingerprint);
  assert.equal(sameRacContentIdentity(a,b),true);
});

test('variantes de causas de los archivos reales se normalizan sin caer en orden y limpieza',()=>{
  const cases=[
    ['MAL ESTADO DE EQUIPOS/MAQUINARIAS','EQUIPOS O MAQUINARIA EN MAL ESTADO'],
    ['TIROS CORTADOS','MANEJO DE EXPLOSIVOS, TIROS FALLADOS, CORTADOS O NO DETONADOS'],
    ['FALTA DE SEÑALIZACION','FALTA DE SEÑALIZACIÓN'],
    ['HORARIO DE DISPARO','DISPAROS FUERA DE HORARIO'],
    ['DEFICIENCIA O FALTA DE AGUA','DEFICIENCIA O FALTA DE AGUA'],
    ['NO USO DE EPP´S','NO USO DE EPP']
  ];
  for(const [input,expected] of cases)assert.equal(classifyCauseFromCatalog(input).causeSubtype,expected,input);
});

test('la importación conserva la causa fuente y usa identidad completa',()=>{
  const racs=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');
  const reconcile=fs.readFileSync(new URL('../server/services/racReconciliation.js',import.meta.url),'utf8');
  assert.match(racs,/r\.rawCause\|\|r\.deviationType/);
  assert.match(reconcile,/sameRacContentIdentity/);
  assert.match(reconcile,/p\.reporter,p\.reportingArea,p\.reportedArea,p\.location,p\.description/);
});



test('los seis casos detectados en la comparación conservan su identidad correcta',()=>{
  const distinctPairs=[
    [
      {businessUnitName:'OBRA CIVIL OPTIMUS',sourceReportNumber:'26',reportDate:'2026-08-03',reporterName:'BRAYAN ESPINOZA CAPCHA',reportingArea:'OBRA CIVIL',reportedArea:'ADMINISTRACION',location:'CAMPAMENTO',description:'SE EVIDENCIA QUE LOS CAMPAMENTOS NO CUENTAN CON EXTINTORES'},
      {businessUnitName:'OBRA CIVIL OPTIMUS',sourceReportNumber:'35',reportDate:'2026-08-03',reporterName:'FIDEL BRAVO ESPINOZA',reportingArea:'OBRA CIVIL',reportedArea:'ADMINISTRACION',location:'CAMPAMENTO',description:'SE EVIDENCIA QUE LOS CAMPAMENTOS NO CUENTAN CON EXTINTORES'}
    ],
    [
      {businessUnitName:'DESARROLLOS MINEROS',sourceReportNumber:'17',reportDate:'2026-08-03',reporterName:'YONI HUAMAN',reportingArea:'DESARROLLOS MINEROS',reportedArea:'OPERACION MINA',location:'NV 710 - CX 687',description:'NO SE ESTA RESPETANDO EL HORARIO DE DISPARO'},
      {businessUnitName:'DESARROLLOS MINEROS',sourceReportNumber:'18',reportDate:'2026-08-03',reporterName:'ENOC LAPA',reportingArea:'DESARROLLOS MINEROS',reportedArea:'OPERACION MINA',location:'NV 710 - CX 687',description:'NO SE ESTA RESPETANDO EL HORARIO DE DISPARO'}
    ],
    [
      {businessUnitName:'DESARROLLOS MINEROS',sourceReportNumber:'34',reportDate:'2026-08-05',reporterName:'LUIS PORTILLA',reportingArea:'DESARROLLOS MINEROS',reportedArea:'OPERACION MINA',location:'NV 620 - BOCAMINA',description:'DEMASIADO TRANSITO ENTRE EQUIPOS PESADOS Y LIVIANOS'},
      {businessUnitName:'DESARROLLOS MINEROS',sourceReportNumber:'39',reportDate:'2026-08-05',reporterName:'NELSON ROJAS',reportingArea:'DESARROLLOS MINEROS',reportedArea:'OPERACION MINA',location:'NV 620 - BOCAMINA',description:'DEMASIADO TRANSITO ENTRE EQUIPOS PESADOS Y LIVIANOS'}
    ]
  ];
  for(const [left,right] of distinctPairs){
    assert.equal(sameRacContentIdentity(left,right),false);
    assert.notEqual(buildRacFingerprints(left).contentFingerprint,buildRacFingerprints(right).contentFingerprint);
  }
});

test('versión corresponde a CAPSAN6 4.0.34',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.34');
});
