/**
 * IRONMAN TOSS BOOK - Zero-Dependency Local Static Frontend Server
 * Serves the frontend/ directory on http://localhost:5500 using native Node.js APIs.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  // Normalize URL
  const cleanUrl = req.url.split('?')[0];
  let relativePath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
  let filePath = path.join(FRONTEND_DIR, relativePath);

  // Security check: prevent directory traversal outside FRONTEND_DIR
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found: ' + cleanUrl);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Performance: Cache-Control headers for static assets
    const isHtml = ext === '.html';
    const isDev = process.env.NODE_ENV !== 'production';
    const cacheControl = isDev ? 'no-cache, no-store, must-revalidate' : (isHtml ? 'no-cache' : 'public, max-age=86400, stale-while-revalidate=3600');

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const compressibleExts = ['.html', '.css', '.js', '.json', '.svg'];
    const canGzip = acceptEncoding.includes('gzip') && compressibleExts.includes(ext);

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept-Encoding'
    };

    if (canGzip) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      const zlib = require('zlib');
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  IRONMAN TOSS BOOK - Frontend Local Server`);
    console.log(`  Serving folder: ${FRONTEND_DIR}`);
    console.log(`  Local URL     : http://localhost:${PORT}/`);
    console.log(`====================================================`);
  });
}

module.exports = server;
