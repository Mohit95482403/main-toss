/**
 * DADDY TOSS BOOK - Authoritative Date, Time & Match State Utilities
 * Ensures consistent time-zone and status interpretation between
 * Admin forms, MySQL DATETIME columns, and betting cutoff checks.
 */

/**
 * Parse an admin-provided expiry / schedule date string into a JavaScript Date object.
 * Interprets local HTML5 datetime-local inputs (which lack timezone offset) as IST (UTC+05:30).
 *
 * @param {string|number|Date} input
 * @returns {Date|null}
 */
function parseExpiryDateTime(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  const str = String(input).trim();
  if (!str) return null;

  // 1. Numeric timestamp (seconds or milliseconds)
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. HTML5 datetime-local string without timezone offset
  // Examples: "2026-10-23T20:00", "2026-10-23 20:00:00", "2026-10-23T20:00:00.000"
  // Admin operates in Indian Standard Time (IST, UTC+05:30)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(str)) {
    const d = new Date(str.replace(' ', 'T') + '+05:30');
    return isNaN(d.getTime()) ? null : d;
  }

  // 3. ISO string with timezone or standard date string
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Authoritatively parses any stored match timestamp (from MySQL DATETIME or JS Date)
 * into UTC epoch milliseconds. Avoids local timezone distortion when Node or MySQL
 * have different local offsets.
 *
 * @param {string|number|Date} val
 * @returns {number|null} Epoch milliseconds in UTC, or null if invalid
 */
function parseUtcTimestamp(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();

  const str = String(val).trim();
  if (!str) return null;

  // Numeric epoch
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n < 1e11 ? n * 1000 : n;
  }

  // MySQL DATETIME string without timezone (stored in UTC)
  // Example: "2026-10-23 15:30:00" -> treat explicitly as UTC ("2026-10-23T15:30:00Z")
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(str)) {
    const d = new Date(str.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Strictly check if a match is settled without accidental truthy coercion of '0', null, or undefined.
 *
 * @param {*} val
 * @returns {boolean}
 */
function isMatchSettled(val) {
  if (val === true || val === 1 || val === '1') return true;
  if (typeof val === 'string' && val.toLowerCase() === 'true') return true;
  return false;
}

/**
 * Check if a match status represents a concluded or closed state.
 * In DADDY TOSS BOOK, 'upcoming' and 'live' (Live Toss) are active betting fixtures.
 *
 * @param {string} status
 * @returns {boolean}
 */
function isMatchConcluded(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['completed', 'abandoned', 'closed', 'settlement_reversed'].includes(s);
}

module.exports = {
  parseExpiryDateTime,
  parseUtcTimestamp,
  isMatchSettled,
  isMatchConcluded
};
