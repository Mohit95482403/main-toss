/**
 * IRONMAN TOSS BOOK - Cryptographic Utilities & Token Management
 * Implements secure salt-based password hashing (scrypt) and signed tokens (HMAC-SHA256).
 */

const crypto = require('crypto');

const DEFAULT_SECRET = process.env.SESSION_SECRET || 'itb_secure_app_signing_secret_key_2026_at_least_32_chars';

/**
 * Hash password using scrypt with a cryptographically secure random salt
 * Stored format: scrypt$<salt>$<derivedKeyHex>
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Verify password against stored scrypt hash using timingSafeEqual
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const salt = parts[1];
    const originalDerivedKeyHex = parts[2];
    const keyAttemptHex = crypto.scryptSync(password, salt, 64).toString('hex');

    const originalBuffer = Buffer.from(originalDerivedKeyHex, 'hex');
    const attemptBuffer = Buffer.from(keyAttemptHex, 'hex');

    if (originalBuffer.length !== attemptBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(originalBuffer, attemptBuffer);
  } catch (err) {
    return false;
  }
}

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate cryptographically signed JWT-compatible token (HS256)
 */
function generateToken(payload, secret = DEFAULT_SECRET, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Verify and decode signed token
 */
function verifyToken(token, secret = DEFAULT_SECRET) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or malformed');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token structure invalid');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new Error('Token signature verification failed');
  }

  const payloadJson = base64UrlDecode(encodedPayload);
  const payload = JSON.parse(payloadJson);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) {
    throw new Error('Token has expired');
  }

  return payload;
}

/**
 * Sanitize user object by stripping confidential security fields
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, password, ...safeUser } = user;
  if (safeUser.full_name && !safeUser.fullName) {
    safeUser.fullName = safeUser.full_name;
  }
  return safeUser;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  sanitizeUser,
  DEFAULT_SECRET
};
