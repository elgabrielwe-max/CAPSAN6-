import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server/modules/racs.js',import.meta.url),'utf8');

function splitTopLevel(input){
  const parts=[];let current='';let depth=0;
  for(const ch of input){
    if(ch==='(')depth++;
    if(ch===')')depth--;
    if(ch===','&&depth===0){parts.push(current.trim());current='';}
    else current+=ch;
  }
  if(current.trim())parts.push(current.trim());
  return parts;
}

function importInsertParts(){
  const marker='INSERT INTO racs(\n            report_code,source_uid,source_report_number';
  const start=source.indexOf(marker);
  assert.ok(start>=0,'No se encontró el INSERT conciliado de RACS');
  const fragment=source.slice(start,source.indexOf('RETURNING id',start));
  const columnStart=fragment.indexOf('(')+1;
  const valuesToken=fragment.indexOf('VALUES(');
  const columns=fragment.slice(columnStart,fragment.lastIndexOf(')',valuesToken));
  const valuesStart=valuesToken+'VALUES('.length;
  const values=fragment.slice(valuesStart,fragment.lastIndexOf(')'));
  return {columns:splitTopLevel(columns),values:splitTopLevel(values),rawValues:values};
}

test('INSERT de importación RACS tiene la misma cantidad de columnas y expresiones',()=>{
  const {columns,values,rawValues}=importInsertParts();
  assert.equal(columns.length,33);
  assert.equal(values.length,33);
  assert.equal(Math.max(...[...rawValues.matchAll(/\$(\d+)/g)].map(item=>Number(item[1]))),32);
});

test('el hotfix previo permanece cubierto por la versión actual',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.32');
});
