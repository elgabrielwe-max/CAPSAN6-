import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server/services/racReconciliation.js',import.meta.url),'utf8');

test('restauración de evidencias tipa cada parámetro una sola vez',()=>{
  assert.match(source,/WITH incoming AS \(/);
  assert.match(source,/\$2::varchar\(30\) AS evidence_type/);
  assert.match(source,/existing\.evidence_type::text=i\.evidence_type::text/);
  const fragment=source.slice(source.indexOf('WITH incoming AS ('),source.indexOf(']);',source.indexOf('WITH incoming AS (')));
  for(let i=1;i<=13;i++){
    const matches=fragment.match(new RegExp('\\$'+i+'(?!\\d)','g'))||[];
    assert.equal(matches.length,1,`El parámetro $${i} debe declararse una sola vez dentro del CTE`);
  }
});

test('el hotfix previo permanece cubierto por la versión actual',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'4.0.34');
});
