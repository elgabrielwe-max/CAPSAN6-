import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema=readFileSync(new URL('../server/schema.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const index=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');

test('4.0.27 crea el índice de direccionamiento después de agregar columnas',()=>{
  const ensurePos=schema.indexOf('await ensureColumns();');
  const indexPos=schema.indexOf('CREATE INDEX IF NOT EXISTS idx_racs_direction');
  assert.ok(ensurePos>=0);
  assert.ok(indexPos>ensurePos,'idx_racs_direction debe crearse después de ensureColumns()');
});

test('4.0.27 conserva su migración dentro de la versión actual',()=>{
  assert.equal(pkg.version,'4.0.38');
  assert.match(schema,/VALUES\('4\.0\.27'\)/);
  assert.match(index,/CAPSAN6 4\.0\.38 ejecutándose/);
});
