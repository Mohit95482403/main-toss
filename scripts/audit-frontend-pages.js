const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '../frontend');

function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getHtmlFiles(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

const htmlFiles = getHtmlFiles(frontendDir);
console.log(`[AUDIT] Found ${htmlFiles.length} HTML files.`);

let totalChecks = 0;
let errors = [];

htmlFiles.forEach(htmlPath => {
  const content = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);

  // Check script tags
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    const src = match[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      continue;
    }
    const cleanSrc = src.split('?')[0];
    const resolved = cleanSrc.startsWith('/')
      ? path.join(frontendDir, cleanSrc)
      : path.resolve(dir, cleanSrc);

    totalChecks++;
    if (!fs.existsSync(resolved)) {
      errors.push(`HTML ${path.relative(frontendDir, htmlPath)} -> Missing script: "${src}" (resolved: ${resolved})`);
    }
  }

  // Check link stylesheet tags
  const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  while ((match = cssRegex.exec(content)) !== null) {
    const href = match[1];
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      continue;
    }
    const cleanHref = href.split('?')[0];
    const resolved = cleanHref.startsWith('/')
      ? path.join(frontendDir, cleanHref)
      : path.resolve(dir, cleanHref);

    totalChecks++;
    if (!fs.existsSync(resolved)) {
      errors.push(`HTML ${path.relative(frontendDir, htmlPath)} -> Missing CSS: "${href}" (resolved: ${resolved})`);
    }
  }
});

console.log(`[AUDIT] Verified ${totalChecks} asset references across all HTML files.`);
if (errors.length > 0) {
  console.error('[AUDIT FAILED] Found broken asset references:');
  errors.forEach(e => console.error('  - ', e));
  process.exit(1);
} else {
  console.log('[AUDIT SUCCESS] 100% of script and CSS asset references exist on disk!');
}
