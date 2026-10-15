/**
 * IRONMAN TOSS BOOK - Native HTTP Compression Middleware (Day 16)
 * Zero-dependency gzip/deflate response compression using Node.js built-in zlib module.
 * Shrinks JSON and text API response payloads by up to 75-85% for modern browsers and clients.
 */

const zlib = require('zlib');

function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Only compress if client explicitly accepts gzip or deflate
  if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
    return next();
  }

  const useGzip = acceptEncoding.includes('gzip');
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);

  res.json = function (obj) {
    let jsonBuffer;
    try {
      jsonBuffer = Buffer.from(JSON.stringify(obj), 'utf8');
    } catch (e) {
      return origJson(obj);
    }

    // Only compress payloads >= 512 bytes where compression ratio is beneficial
    if (jsonBuffer.length < 512 || res.headersSent) {
      return origJson(obj);
    }

    const compressFn = useGzip ? zlib.gzip : zlib.deflate;
    const encodingHeader = useGzip ? 'gzip' : 'deflate';

    compressFn(jsonBuffer, (err, compressed) => {
      if (err) {
        return origJson(obj);
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', encodingHeader);
      res.setHeader('Vary', 'Accept-Encoding');
      origSend(compressed);
    });
  };

  next();
}

module.exports = compressionMiddleware;
