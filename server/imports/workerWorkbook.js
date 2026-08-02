import XLSX from 'xlsx';

const HEADER_ALIASES = {
  dni: ['DNI','DOCUMENTO','NRO DOCUMENTO','NUMERO DOCUMENTO','DOC IDENTIDAD','DOCUMENTO DE IDENTIDAD'],
  name: ['NOMBRE','NOMBRES','APELLIDOS Y NOMBRES','NOMBRES Y APELLIDOS','TRABAJADOR','PERSONAL','COLABORADOR','NOMBRE COMPLETO'],
  businessUnit: ['UNIDAD DE NEGOCIO','UNIDAD','UEA','U.E.A.','SEDE','PROYECTO','EMPRESA','CONTRATA'],
  area: ['AREA','ÁREA','AREA DE TRABAJO','DEPARTAMENTO','SECCION','SECCIÓN'],
  zone: ['ZONA','LABOR','UBICACION','UBICACIÓN','FRENTE'],
  position: ['CARGO','PUESTO','PUESTO DE TRABAJO','OCUPACION','OCUPACIÓN','FUNCION','FUNCIÓN'],
  guard: ['GUARDIA','TURNO','HORARIO'],
};

export function normalizeWorkerHeader(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

const aliasKeys = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([field, aliases]) => [field, aliases.map(normalizeWorkerHeader)])
);

export function normalizeWorkerDni(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  while (digits.length > 8 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length < 8) digits = digits.padStart(8, '0');
  return digits;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function valueFromRow(row, field) {
  const wanted = new Set(aliasKeys[field]);
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(normalizeWorkerHeader(key)) && clean(value)) return value;
  }
  return '';
}

function headerScore(cells) {
  const keys = new Set((cells || []).map(normalizeWorkerHeader).filter(Boolean));
  const has = field => aliasKeys[field].some(key => keys.has(key));
  let score = 0;
  if (has('dni')) score += 6;
  if (has('name')) score += 6;
  if (has('businessUnit')) score += 3;
  if (has('area')) score += 3;
  if (has('position')) score += 2;
  if (has('zone')) score += 1;
  if (has('guard')) score += 1;
  return score;
}

function chooseSheet(workbook) {
  let best = null;
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
    const limit = Math.min(matrix.length, 40);
    for (let i = 0; i < limit; i++) {
      const score = headerScore(matrix[i]);
      if (!best || score > best.score) best = { sheetName, sheet, matrix, headerRow: i, score };
    }
  }
  if (!best || best.score < 12) throw new Error('No se encontró una hoja con columnas de DNI y nombres');
  return best;
}

function normalized(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export function analyzeWorkerWorkbook(workbook, options = {}) {
  const best = chooseSheet(workbook);
  const rows = XLSX.utils.sheet_to_json(best.sheet, {
    range: best.headerRow,
    defval: '',
    raw: true,
    blankrows: false,
  });

  const parsed = rows.map((row, index) => {
    const rawDni = valueFromRow(row, 'dni');
    return {
    sourceRow: best.headerRow + index + 2,
    originalDniDigits: String(rawDni ?? '').replace(/\D/g, ''),
    dni: normalizeWorkerDni(rawDni),
    fullName: clean(valueFromRow(row, 'name')).toUpperCase(),
    explicitBusinessUnit: clean(valueFromRow(row, 'businessUnit')).toUpperCase(),
    sourceArea: clean(valueFromRow(row, 'area')).toUpperCase(),
    zone: clean(valueFromRow(row, 'zone')).toUpperCase(),
    position: clean(valueFromRow(row, 'position')).toUpperCase(),
    guard: clean(valueFromRow(row, 'guard')).toUpperCase(),
  };
  }).filter(row => row.dni || row.fullName || row.sourceArea || row.explicitBusinessUnit);

  const selectedBusinessUnit = clean(options.selectedBusinessUnit).toUpperCase();
  const explicitUnits = [...new Set(parsed.map(row => row.explicitBusinessUnit).filter(Boolean))];
  const sourceAreas = [...new Set(parsed.map(row => row.sourceArea).filter(Boolean))];
  const knownUnits = new Map((options.knownBusinessUnits || []).map(name => [normalized(name), clean(name).toUpperCase()]));

  let inferredUnit = selectedBusinessUnit;
  let areaColumnRepresentsUnit = false;
  if (!inferredUnit && explicitUnits.length === 1) inferredUnit = explicitUnits[0];
  if (!inferredUnit && sourceAreas.length === 1) {
    const only = sourceAreas[0];
    const known = knownUnits.get(normalized(only));
    if (known || parsed.length >= 2) {
      inferredUnit = known || only;
      areaColumnRepresentsUnit = true;
    }
  }

  const errors = [];
  const warnings = [];
  const records = [];
  const seenDnis = new Set();
  let correctedDnis = 0;
  for (const row of parsed) {
    const rawUnit = selectedBusinessUnit || row.explicitBusinessUnit || inferredUnit;
    let area = row.sourceArea;
    if (rawUnit && normalized(area) === normalized(rawUnit)) area = '';
    if (areaColumnRepresentsUnit) area = '';
    const finalArea = area || 'SIN ÁREA ASIGNADA';
    if (!/^\d{8}$/.test(row.dni)) {
      errors.push(`Fila ${row.sourceRow}: DNI inválido`);
      continue;
    }
    if (seenDnis.has(row.dni)) {
      errors.push(`Fila ${row.sourceRow}: DNI repetido dentro del archivo (${row.dni})`);
      continue;
    }
    if (!row.fullName) {
      errors.push(`Fila ${row.sourceRow}: falta NOMBRES Y APELLIDOS`);
      continue;
    }
    if (!rawUnit) {
      errors.push(`Fila ${row.sourceRow}: no se pudo identificar la unidad de negocio`);
      continue;
    }
    if (row.originalDniDigits !== row.dni) correctedDnis++;
    seenDnis.add(row.dni);
    records.push({
      sourceRow: row.sourceRow,
      dni: row.dni,
      fullName: row.fullName,
      businessUnit: rawUnit,
      area: finalArea,
      zone: row.zone || null,
      position: row.position || null,
      guard: row.guard || null,
    });
  }

  if (areaColumnRepresentsUnit) warnings.push(`La columna AREA fue interpretada como unidad de negocio: ${inferredUnit}`);
  if (correctedDnis) warnings.push(`${correctedDnis} DNI fueron normalizados a 8 dígitos`);
  if (!records.length && errors.length) throw new Error(errors[0]);

  return {
    sheetName: best.sheetName,
    headerRow: best.headerRow + 1,
    totalRows: parsed.length,
    validRows: records.length,
    records,
    errors,
    warnings,
    inferredBusinessUnit: inferredUnit || null,
    areaColumnRepresentsUnit,
    correctedDnis,
  };
}
