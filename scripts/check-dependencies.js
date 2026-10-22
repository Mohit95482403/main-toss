const fs = require('fs');
const path = require('path');

const pkg = require('../backend/package.json');
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
const builtins = new Set(['fs', 'path', 'crypto', 'http', 'https', 'stream', 'os', 'child_process', 'util', 'events', 'url', 'zlib', 'net', 'tls', 'assert']);

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules') results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const backendFiles = getJsFiles(path.resolve(__dirname, '../backend'));
const missing = new Set();

backendFiles.forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  const requireRegex = /require\(["']([^"']+)["']\)/g;
  let match;
  while ((match = requireRegex.exec(code)) !== null) {
    const mod = match[1];
    if (mod.startsWith('.') || mod.startsWith('/')) continue;
    const rootMod = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
    if (!builtins.has(rootMod) && !declared.has(rootMod)) {
      missing.add(`${rootMod} (found in ${path.basename(f)})`);
    }
  }
});

console.log('[DEPENDENCY AUDIT] Declared dependencies in backend/package.json:', Array.from(declared));
if (missing.size > 0) {
  console.error('[DEPENDENCY AUDIT FAILED] Undeclared dependencies found:', Array.from(missing));
  process.exit(1);
} else {
  console.log('[DEPENDENCY AUDIT SUCCESS] All required backend modules are declared in package.json!');
}
