const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getJsFiles(fullPath));
      }
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const dirs = [
  path.resolve(__dirname, '../backend'),
  path.resolve(__dirname, '../frontend'),
  path.resolve(__dirname, '../scripts')
];

let total = 0;
let failed = 0;

dirs.forEach(d => {
  const files = getJsFiles(d);
  files.forEach(f => {
    total++;
    try {
      execSync(`node -c "${f}"`, { stdio: 'pipe' });
    } catch (e) {
      console.error(`[SYNTAX ERROR] ${f}:`, e.stderr.toString());
      failed++;
    }
  });
});

console.log(`[SYNTAX AUDIT] Checked ${total} JS files across backend, frontend, scripts.`);
if (failed === 0) {
  console.log(`[SYNTAX AUDIT] ALL ${total} FILES PASSED SYNTAX CHECK!`);
  process.exit(0);
} else {
  console.error(`[SYNTAX AUDIT] ${failed} file(s) failed syntax check.`);
  process.exit(1);
}
