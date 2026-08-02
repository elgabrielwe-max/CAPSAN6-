import { readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) files.push(...await walk(full));
    else if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = [...await walk('server'), ...await walk('public/js')];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
console.log(`Sintaxis correcta: ${files.length} archivos JavaScript`);
