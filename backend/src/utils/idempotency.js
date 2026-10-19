/**
 * DADDY TOSS BOOK — Financial Idempotency & Transaction Safety Manager
 * 
 * Enforces strict at-most-once semantics across all financial endpoints:
 * - Bet Placement
 * - Bet Cancellation & Refund
 * - Match Settlement
 * - Settlement Reversal & Resettlement
 * - Administrative Coin Adjustments
 * 
 * Features:
 * 1. Canonical request payload hashing (SHA-256) to detect payload tampering/mismatches on key reuse.
 * 2. Database-level atomic reservations to prevent concurrent execution under identical keys.
 * 3. Cached response delivery for safe, deterministic network retries.
 * 4. Automatic transaction retry with exponential backoff on MySQL deadlocks (ER_LOCK_DEADLOCK 1213 / 1205).
 */

const crypto = require('crypto');
const { getPool } = require('../config/db');

/**
 * Deterministically serialize and hash request payload
 */
function hashPayload(payload) {
  if (payload === undefined || payload === null) {
    return crypto.createHash('sha256').update('').digest('hex');
  }

  // Canonicalize object by sorting keys recursively
  function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(canonicalize);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
      // Exclude client-generated dynamic tokens that are not part of financial semantics
      if (key === 'idempotencyKey' || key === 'idempotency_key') continue;
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }

  const normalized = JSON.stringify(canonicalize(payload));
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Validates and sanitizes idempotency key string
 */
function sanitizeKey(rawKey) {
  if (!rawKey) return null;
  const str = String(rawKey).trim();
  if (str.length === 0 || str.length > 150) return null;
  // Allow alphanumeric, dashes, colons, underscores
  if (!/^[a-zA-Z0-9_\-:]+$/.test(str)) return null;
  return str;
}

/**
 * Reserve or check an idempotency key.
 * 
 * @param {object} connection - Active MySQL connection or pool
 * @param {object} options
 * @param {string} options.key - Unique idempotency key
 * @param {number|null} options.userId - Authenticated user ID (if applicable)
 * @param {string} options.scope - Operation scope (e.g. 'BET_PLACE', 'BET_CANCEL')
 * @param {any} options.payload - Request payload for canonical verification
 * 
 * @returns {Promise<{ isNew: boolean, isRetry: boolean, isProcessing: boolean, mismatch: boolean, cachedResponse?: { status: number, body: any } }>}
 */
async function reserveIdempotencyKey(connection, { key, userId = null, scope, payload }) {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) {
    return { isNew: true, skipped: true };
  }

  const reqHash = hashPayload(payload);

  // 1. Query for existing key record
  const [existingRows] = await connection.query(
    'SELECT id, idempotency_key, user_id, scope, request_hash, status, response_status, response_body FROM idempotency_records WHERE idempotency_key = ? LIMIT 1',
    [cleanKey]
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];

    // Payload mismatch check
    if (existing.request_hash !== reqHash) {
      return {
        mismatch: true,
        cleanKey,
        message: 'Idempotency key reuse violation. This key was already used with different request parameters.'
      };
    }

    // Already completed - safe deterministic replay
    if (existing.status === 'completed' && existing.response_status && existing.response_body) {
      let parsedBody = null;
      try {
        parsedBody = JSON.parse(existing.response_body);
      } catch (e) {
        parsedBody = { success: true, message: 'Operation previously completed.' };
      }

      return {
        isRetry: true,
        cleanKey,
        cachedResponse: {
          status: existing.response_status,
          body: parsedBody
        }
      };
    }

    // Currently processing under another concurrent worker
    if (existing.status === 'processing') {
      return {
        isProcessing: true,
        cleanKey,
        message: 'A request with this idempotency key is currently being processed. Please wait.'
      };
    }
  }

  // 2. Attempt atomic insertion with 'processing' status
  try {
    await connection.query(
      `INSERT INTO idempotency_records (
        idempotency_key, user_id, scope, request_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'processing', NOW(), NOW())`,
      [cleanKey, userId, scope, reqHash]
    );

    return {
      isNew: true,
      cleanKey,
      requestHash: reqHash
    };
  } catch (err) {
    // Concurrent duplicate insertion collided on UNIQUE constraint
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      const [recheckRows] = await connection.query(
        'SELECT status, response_status, response_body, request_hash FROM idempotency_records WHERE idempotency_key = ? LIMIT 1',
        [cleanKey]
      );
      if (recheckRows.length > 0) {
        const row = recheckRows[0];
        if (row.request_hash !== reqHash) {
          return { mismatch: true, cleanKey };
        }
        if (row.status === 'completed' && row.response_status && row.response_body) {
          try {
            return {
              isRetry: true,
              cleanKey,
              cachedResponse: {
                status: row.response_status,
                body: JSON.parse(row.response_body)
              }
            };
          } catch (e) {}
        }
      }
      return { isProcessing: true, cleanKey };
    }
    throw err;
  }
}

/**
 * Mark idempotency record as completed with response status and body
 */
async function completeIdempotencyKey(connection, { key, responseStatus, responseBody }) {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) return;

  const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
  await connection.query(
    `UPDATE idempotency_records
     SET status = 'completed',
         response_status = ?,
         response_body = ?,
         updated_at = NOW()
     WHERE idempotency_key = ?`,
    [responseStatus || 200, bodyStr, cleanKey]
  );
}

/**
 * Release/clean up idempotency key on rollback or failure so legitimate retries aren't locked out
 */
async function releaseIdempotencyKey(connection, key) {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) return;

  try {
    // Only delete if it's still 'processing'
    await connection.query(
      "DELETE FROM idempotency_records WHERE idempotency_key = ? AND status = 'processing'",
      [cleanKey]
    );
  } catch (e) {
    // Silently ignore if connection already rolled back or closed
  }
}

/**
 * Execute an operation with automatic retry on transient MySQL deadlocks
 */
async function executeWithRetry(fn, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const isDeadlock = err && (err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213 || err.code === 'ER_LOCK_WAIT_TIMEOUT' || err.errno === 1205);
      if (isDeadlock && attempt <= maxRetries) {
        console.warn(`[DEADLOCK DETECTED] Retrying transaction (attempt ${attempt}/${maxRetries})...`);
        const delayMs = Math.floor(40 * Math.pow(2, attempt - 1) + Math.random() * 25);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  hashPayload,
  sanitizeKey,
  reserveIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
  executeWithRetry
};
