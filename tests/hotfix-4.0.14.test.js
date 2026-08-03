import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('registro RAC conserva referencia del formulario antes del await',()=>{
  const source=fs.readFileSync('public/js/pages/racs.js','utf8');
  assert.match(source,/const submittedForm=event\.currentTarget/);
  assert.match(source,/body:formData\(submittedForm\)/);
  assert.match(source,/submittedForm\.reset\(\)/);
  assert.doesNotMatch(source,/event\.currentTarget\.reset\(\)/);
});
