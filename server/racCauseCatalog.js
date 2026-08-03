export const RAC_CAUSE_CATALOG = Object.freeze([
  { code:'I', name:'GEOMECÁNICA Y TERRENO', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'ROCAS SUELTAS / FALTA DE SOSTENIMIENTO','PAREDES, TECHOS O HASTIALES INESTABLES','FALLAS EN INSPECCIÓN GEOMECÁNICA','SOSTENIMIENTO INADECUADO O INEXISTENTE','CAÍDA DE ROCAS POR VIBRACIÓN, VOLADURA O TRÁNSITO DE EQUIPOS'
  ]},
  { code:'II', name:'OPERACIONES MINA', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'CHIMENEA O REALCE EN MAL ESTADO','MANEJO DE EXPLOSIVOS, TIROS FALLADOS, CORTADOS O NO DETONADOS','DISPAROS FUERA DE HORARIO','ILUMINACIÓN DEFICIENTE','MANIPULACIÓN DE MINERAL O DESMONTE','CAMPANEO DE TOLVAS','IZAJE DE MATERIALES'
  ]},
  { code:'III', name:'TRANSPORTE Y TRÁNSITO (CRÍTICO)', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'ACARREO Y TRANSPORTE DE DESMONTE O MINERAL','VÍAS, CAMINOS O ACCESOS EN MAL ESTADO','INTERFERENCIA EN VÍAS, CRUCES, OBSTRUCCIONES O EQUIPOS ESTACIONADOS','OPERACIÓN A VELOCIDAD INADECUADA','FALTA O USO INADECUADO DE SEÑALIZACIÓN EN EQUIPOS MÓVILES','FALTA DE CONTROL DE TRÁNSITO INTERNO','POSICIONAMIENTO INCORRECTO DE EQUIPOS'
  ]},
  { code:'IV', name:'EQUIPOS, HERRAMIENTAS Y ENERGÍA', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'EQUIPOS O MAQUINARIA EN MAL ESTADO','HERRAMIENTAS DEFECTUOSAS','MANTENIMIENTO MECÁNICO O ELÉCTRICO DEFICIENTE','ENERGÍA ELÉCTRICA INCONTROLADA','FALTA DE BLOQUEO Y ROTULADO (LOTO)','INSTALACIONES DE AIRE O AGUA DEFECTUOSAS','BOMBAS O TUBERÍAS','EQUIPOS DE SECADO DEFICIENTES O ESTUFAS'
  ]},
  { code:'V', name:'CONDICIONES DE TRABAJO', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'PISOS, ESPACIOS ABIERTOS O DESNIVEL','PELDAÑO SUELTO','PELDAÑO ROTO','ESCALERA EN MAL ESTADO','ORDEN Y LIMPIEZA DEFICIENTE','ILUMINACIÓN DEFICIENTE O EXCESIVA','DEFICIENCIA DE VENTILACIÓN','TEMPERATURAS EXTREMAS','CONGESTIÓN O RESTRICCIÓN DE ESPACIO','FALTA DE SEÑALIZACIÓN','FALTA DE BARANDAS, BERMAS O BARRERAS'
  ]},
  { code:'VI', name:'MEDIO AMBIENTE Y SUSTANCIAS PELIGROSAS', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'GENERACIÓN DE POLVO EXCESIVO','EMISIÓN DE GASES SOBRE LMP','MANEJO DE SUSTANCIAS PELIGROSAS','MANEJO INADECUADO DE HIDROCARBUROS','MANEJO DE RESIDUOS PELIGROSOS O NO PELIGROSOS','MANEJO DE RELAVES','MANEJO DE LODOS DE PERFORACIÓN','SOLUCIÓN ALUMINADA','PELIGRO DE INCENDIO O EXPLOSIÓN'
  ]},
  { code:'VII', name:'FACTORES HUMANOS (ACTOS SUBESTÁNDAR)', reportType:'ACTO SUBESTANDAR', subtypes:[
    'INCUMPLIMIENTO DE PROCEDIMIENTOS','EXCESO DE CONFIANZA','DISTRACCIÓN O FALTA DE ATENCIÓN','USO INCORRECTO DE HERRAMIENTAS Y EQUIPOS','NO USO DE EPP','FATIGA FÍSICA O MENTAL','POSICIONAMIENTO INCORRECTO FRENTE AL PELIGRO','FALTA FÍSICA O MENTAL','ACTO INSEGURO DELIBERADO'
  ]},
  { code:'VIII', name:'HABITABILIDAD, ALIMENTACIÓN Y SERVICIOS DE CAMPAMENTO', reportType:'CONDICION SUBESTANDAR', subtypes:[
    'NO HAY AGUA CALIENTE','FUGA DE AGUA','HUMEDAD EN PAREDES','SSHH EN MAL ESTADO','CAMAS EN MAL ESTADO','POCA CANTIDAD DE COMIDA','VASOS O TÁPERES CON OLOR A DETERGENTE','CUBIERTOS PLÁSTICOS INADECUADOS','ENVÍO DE ALIMENTOS EN BOLSAS O RECIPIENTES INADECUADOS','CORTE DE ENERGÍA ELÉCTRICA','FALTA DE SEÑAL WIFI'
  ]}
]);

export const normalizeCauseText = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');

export function categoryByReference(value, reportType='') {
  const key=normalizeCauseText(value);const type=normalizeCauseText(reportType);
  return RAC_CAUSE_CATALOG.find(category=>(!type||normalizeCauseText(category.reportType)===type)&&[category.code,category.name].some(item=>normalizeCauseText(item)===key))||null;
}

export function subtypeByReference(value, category=null) {
  const key=normalizeCauseText(value);if(!key)return null;
  const categories=category?[category]:RAC_CAUSE_CATALOG;
  for(const item of categories){const name=item.subtypes.find(subtype=>normalizeCauseText(subtype)===key);if(name)return{category:item,name};}
  return null;
}

const RULES = [
  { words:['ROCA SUELTA','SOSTENIMIENTO','HASTIAL','TECHO INESTABLE','CUADRO DE MADERA'], code:'I', subtype:'ROCAS SUELTAS / FALTA DE SOSTENIMIENTO' },
  { words:['CHIMENEA','REALCE'], code:'II', subtype:'CHIMENEA O REALCE EN MAL ESTADO' },
  { words:['EXPLOSIVO','TIRO FALLADO','TIRO CORTADO','NO DETONADO'], code:'II', subtype:'MANEJO DE EXPLOSIVOS, TIROS FALLADOS, CORTADOS O NO DETONADOS' },
  { words:['ACARREO','TRANSPORTE DE MINERAL','TRANSPORTE DE DESMONTE'], code:'III', subtype:'ACARREO Y TRANSPORTE DE DESMONTE O MINERAL' },
  { words:['VIA EN MAL ESTADO','CAMINO EN MAL ESTADO','ACCESO INADECUADO'], code:'III', subtype:'VÍAS, CAMINOS O ACCESOS EN MAL ESTADO' },
  { words:['OBSTRUCCION','INTERFERENCIA EN VIA','CRUCE BLOQUEADO','EQUIPO ESTACIONADO'], code:'III', subtype:'INTERFERENCIA EN VÍAS, CRUCES, OBSTRUCCIONES O EQUIPOS ESTACIONADOS' },
  { words:['EXCESO DE VELOCIDAD','VELOCIDAD INADECUADA'], code:'III', subtype:'OPERACIÓN A VELOCIDAD INADECUADA' },
  { words:['EQUIPO EN MAL ESTADO','MAQUINA EN MAL ESTADO','MAQUINARIA EN MAL ESTADO','FALLA DE EQUIPO','CELDA','LOCOMOTORA'], code:'IV', subtype:'EQUIPOS O MAQUINARIA EN MAL ESTADO' },
  { words:['HERRAMIENTA DEFECTUOSA','HERRAMIENTA EN MAL ESTADO'], code:'IV', subtype:'HERRAMIENTAS DEFECTUOSAS' },
  { words:['CABLE ELECTRICO','ENERGIA ELECTRICA','TABLERO ELECTRICO','PULSADOR'], code:'IV', subtype:'ENERGÍA ELÉCTRICA INCONTROLADA' },
  { words:['LOTO','BLOQUEO Y ROTULADO','FALTA DE BLOQUEO'], code:'IV', subtype:'FALTA DE BLOQUEO Y ROTULADO (LOTO)' },
  { words:['BOMBA','TUBERIA'], code:'IV', subtype:'BOMBAS O TUBERÍAS' },
  { words:['DESORDEN','BASURA','SUCIO','LIMPIEZA DEFICIENTE','FALTA DE ORDEN'], code:'V', subtype:'ORDEN Y LIMPIEZA DEFICIENTE' },
  { words:['VENTILACION','MONOXIDO','GAS','HUMO','AIRE VICIADO'], code:'V', subtype:'DEFICIENCIA DE VENTILACIÓN' },
  { words:['ILUMINACION'], code:'V', subtype:'ILUMINACIÓN DEFICIENTE O EXCESIVA' },
  { words:['FALTA DE SEÑALIZACION','SIN SEÑALIZACION'], code:'V', subtype:'FALTA DE SEÑALIZACIÓN' },
  { words:['BARANDA','BERMA','BARRERA'], code:'V', subtype:'FALTA DE BARANDAS, BERMAS O BARRERAS' },
  { words:['POLVO','POLVADERA'], code:'VI', subtype:'GENERACIÓN DE POLVO EXCESIVO' },
  { words:['EMISION DE GAS','GASES SOBRE LMP'], code:'VI', subtype:'EMISIÓN DE GASES SOBRE LMP' },
  { words:['HIDROCARBURO','DERRAME DE ACEITE','DERRAME DE COMBUSTIBLE'], code:'VI', subtype:'MANEJO INADECUADO DE HIDROCARBUROS' },
  { words:['RESIDUO PELIGROSO','RESIDUO NO PELIGROSO','SEGREGACION DE RESIDUOS'], code:'VI', subtype:'MANEJO DE RESIDUOS PELIGROSOS O NO PELIGROSOS' },
  { words:['RELAVE'], code:'VI', subtype:'MANEJO DE RELAVES' },
  { words:['LODO DE PERFORACION'], code:'VI', subtype:'MANEJO DE LODOS DE PERFORACIÓN' },
  { words:['INCENDIO','EXPLOSION'], code:'VI', subtype:'PELIGRO DE INCENDIO O EXPLOSIÓN' },
  { words:['NO USA EPP','SIN EPP','NO USO DE EPP','SIN GUANTE','SIN CASCO','SIN LENTE','SIN ARNES'], code:'VII', subtype:'NO USO DE EPP' },
  { words:['PROCEDIMIENTO','IPERC','PETAR','SIN AUTORIZACION'], code:'VII', subtype:'INCUMPLIMIENTO DE PROCEDIMIENTOS' },
  { words:['DISTRACCION','FALTA DE ATENCION'], code:'VII', subtype:'DISTRACCIÓN O FALTA DE ATENCIÓN' },
  { words:['EXCESO DE CONFIANZA'], code:'VII', subtype:'EXCESO DE CONFIANZA' },
  { words:['FATIGA','CANSANCIO'], code:'VII', subtype:'FATIGA FÍSICA O MENTAL' },
  { words:['ACTO INSEGURO'], code:'VII', subtype:'ACTO INSEGURO DELIBERADO' },
  { words:['AGUA CALIENTE'], code:'VIII', subtype:'NO HAY AGUA CALIENTE' },
  { words:['FUGA DE AGUA'], code:'VIII', subtype:'FUGA DE AGUA' },
  { words:['COMIDA','ALIMENTO','RACION'], code:'VIII', subtype:'POCA CANTIDAD DE COMIDA' },
  { words:['CAMA','COLCHON'], code:'VIII', subtype:'CAMAS EN MAL ESTADO' },
  { words:['WIFI','INTERNET'], code:'VIII', subtype:'FALTA DE SEÑAL WIFI' }
];

export function classifyCauseFromCatalog(text, preferredReportType='') {
  const normalized=normalizeCauseText(text);let best=null;
  for(const rule of RULES){const score=rule.words.reduce((total,word)=>total+(normalized.includes(normalizeCauseText(word))?1:0),0);if(score&&(!best||score>best.score))best={...rule,score};}
  if(!best){const act=normalizeCauseText(preferredReportType)==='ACTO SUBESTANDAR'||/TRABAJADOR|PERSONAL|OPERADOR/.test(normalized);best=act?{code:'VII',subtype:'ACTO INSEGURO DELIBERADO',score:0}:{code:'V',subtype:'ORDEN Y LIMPIEZA DEFICIENTE',score:0};}
  const category=RAC_CAUSE_CATALOG.find(item=>item.code===best.code);return{reportType:category.reportType,causeCategoryCode:category.code,causeCategory:category.name,causeSubtype:best.subtype,score:best.score};
}

export const flattenedCauseCatalog = () => RAC_CAUSE_CATALOG.flatMap((category,categoryIndex)=>category.subtypes.map((name,subtypeIndex)=>({categoryCode:category.code,categoryName:category.name,reportType:category.reportType,categoryOrder:categoryIndex+1,name,subtypeOrder:subtypeIndex+1})));
