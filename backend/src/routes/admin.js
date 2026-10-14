/**
 * IRONMAN TOSS BOOK - Administrative Governance & Operations Router (Day 14)
 * Secure, role-guarded APIs for platform management, user administration,
 * audit logging, and operational monitoring.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeUser } = require('../utils/crypto');

const router = express.Router();

// Enforce authentication & base administrative role on all routes
router.use(authenticate);
router.use(requireRole(['admin', 'super_admin']));

/**
 * Helper: Insert immutable audit log entry
 */
async function logAdminAction(admin, actionType, targetType, targetId, targetIdentifier, details, ip) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_username, action_type, target_type, target_id, target_identifier, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admin.id,
        admin.username,
        actionType,
        targetType,
        targetId || null,
        targetIdentifier || null,
        details ? JSON.stringify(details) : null,
        ip || '127.0.0.1'
      ]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Failed to record audit log:', err.message);
  }
}

/**
 * Format bytes into human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Humanize seconds into uptime string
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// =============================================================================
// 1. DASHBOARD OVERVIEW & METRICS
// =============================================================================
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const pool = getPool();

    // Query genuine statistics from MySQL
    const [[userCounts]] = await pool.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS bannedUsers,
        SUM(CASE WHEN role IN ('admin', 'super_admin') THEN 1 ELSE 0 END) AS adminUsers,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS newUsers24h,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS newUsers7d
      FROM users;
    `);

    const [[walletSums]] = await pool.query(`
      SELECT 
        COUNT(*) AS totalWallets,
        COALESCE(SUM(available_balance), 0) AS totalAvailableBalance,
        COALESCE(SUM(exposure_balance), 0) AS totalExposureBalance
      FROM wallets;
    `);

    const [[sessionCount]] = await pool.query(`
      SELECT COUNT(*) AS activeSessions
      FROM sessions
      WHERE expires_at > NOW();
    `);

    const [[recentAudits]] = await pool.query(`
      SELECT COUNT(*) AS recentAudits24h
      FROM admin_audit_logs
      WHERE created_at >= NOW() - INTERVAL 24 HOUR;
    `);

    return res.status(200).json({
      success: true,
      data: {
        users: {
          total: parseInt(userCounts.totalUsers || 0, 10),
          active: parseInt(userCounts.activeUsers || 0, 10),
          suspended: parseInt(userCounts.suspendedUsers || 0, 10),
          banned: parseInt(userCounts.bannedUsers || 0, 10),
          admins: parseInt(userCounts.adminUsers || 0, 10),
          newLast24h: parseInt(userCounts.newUsers24h || 0, 10),
          newLast7d: parseInt(userCounts.newUsers7d || 0, 10)
        },
        financials: {
          walletsCount: parseInt(walletSums.totalWallets || 0, 10),
          totalAvailableBalance: parseFloat(walletSums.totalAvailableBalance || 0),
          totalExposureBalance: parseFloat(walletSums.totalExposureBalance || 0)
        },
        sessions: {
          activeCount: parseInt(sessionCount.activeSessions || 0, 10)
        },
        activity: {
          recentAuditLogs24h: parseInt(recentAudits.recentAudits24h || 0, 10)
        },
        serverTimestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 2. USER MANAGEMENT: LIST & FILTER USERS
// =============================================================================
router.get('/users', async (req, res, next) => {
  try {
    const pool = getPool();

    // Parse and validate pagination
    let page = parseInt(req.query.page || '1', 10);
    let limit = parseInt(req.query.limit || '10', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;

    // Filter values
    const search = req.query.search ? req.query.search.trim() : '';
    const roleFilter = req.query.role ? req.query.role.trim() : 'all';
    const statusFilter = req.query.status ? req.query.status.trim() : 'all';

    // Sort validation
    const allowedSortBy = ['id', 'username', 'email', 'created_at', 'status', 'role'];
    const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'created_at';
    const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Build parameterized query
    const whereClauses = [];
    const queryParams = [];

    if (search.length > 0) {
      whereClauses.push('(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (roleFilter !== 'all' && ['user', 'admin', 'super_admin'].includes(roleFilter)) {
      whereClauses.push('u.role = ?');
      queryParams.push(roleFilter);
    }

    if (statusFilter !== 'all' && ['active', 'suspended', 'banned'].includes(statusFilter)) {
      whereClauses.push('u.status = ?');
      queryParams.push(statusFilter);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count query
    const countQuery = `SELECT COUNT(*) AS total FROM users u ${whereSql}`;
    const [[countResult]] = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query with wallet balances
    const dataQuery = `
      SELECT 
        u.id,
        u.uuid,
        u.full_name,
        u.username,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.created_at,
        u.updated_at,
        w.available_balance,
        w.exposure_balance,
        w.currency
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      ${whereSql}
      ORDER BY u.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(dataQuery, dataParams);

    // Sanitize user list (ensure no password hash)
    const sanitizedUsers = rows.map((row) => ({
      id: row.id,
      uuid: row.uuid,
      full_name: row.full_name,
      username: row.username,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      wallet: {
        available_balance: parseFloat(row.available_balance || 0),
        exposure_balance: parseFloat(row.exposure_balance || 0),
        currency: row.currency || 'INR'
      }
    }));

    return res.status(200).json({
      success: true,
      data: {
        users: sanitizedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 3. GET SINGLE USER DETAILS
// =============================================================================
router.get('/users/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Valid user identifier is required.' }
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.created_at, u.updated_at,
        w.available_balance, w.exposure_balance, w.currency,
        p.dark_mode_enabled, p.toss_alerts, p.match_reminders, p.wallet_notices
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN user_preferences p ON p.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User record not found.' }
      });
    }

    const [[sessionCount]] = await pool.query(
      'SELECT COUNT(*) AS activeSessions FROM sessions WHERE user_id = ? AND expires_at > NOW()',
      [userId]
    );

    const user = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        uuid: user.uuid,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        wallet: {
          available_balance: parseFloat(user.available_balance || 0),
          exposure_balance: parseFloat(user.exposure_balance || 0),
          currency: user.currency || 'INR'
        },
        preferences: {
          darkMode: Boolean(user.dark_mode_enabled),
          tossAlerts: Boolean(user.toss_alerts),
          matchReminders: Boolean(user.match_reminders),
          walletNotices: Boolean(user.wallet_notices)
        },
        activeSessions: parseInt(sessionCount.activeSessions || 0, 10)
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 4. UPDATE USER STATUS (SUSPEND, RESTORE, BAN)
// =============================================================================
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId) || targetUserId < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Valid user identifier is required.' }
      });
    }

    const { status, reason } = req.body || {};
    const allowedStatuses = ['active', 'suspended', 'banned'];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be one of: active, suspended, banned.' }
      });
    }

    // Self-action protection: Administrator cannot suspend or ban their own account
    if (req.user.id === targetUserId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SELF_ACTION_BLOCKED',
          message: 'Security policy: You cannot modify the status of your own administrator account.'
        }
      });
    }

    const pool = getPool();

    // Check target user's current record
    const [targetUsers] = await pool.query(
      'SELECT id, username, email, role, status FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    if (targetUsers.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Target user record not found.' }
      });
    }

    const targetUser = targetUsers[0];

    // Permission enforcement: Only super_admin can suspend or ban another admin/super_admin
    if (['admin', 'super_admin'].includes(targetUser.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only a super_admin possesses authority to suspend or ban administrative accounts.'
        }
      });
    }

    const previousStatus = targetUser.status;

    // Execute status update in MySQL
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, targetUserId]);

    // If account was suspended or banned, immediately invalidate active sessions
    if (status !== 'active') {
      await pool.query('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
    }

    // Record immutable administrative audit log
    await logAdminAction(
      req.user,
      `user_status_${status}`,
      'user',
      targetUserId,
      targetUser.username,
      {
        previousStatus,
        newStatus: status,
        reason: reason ? String(reason).trim() : 'Administrative status update',
        sessionsRevoked: status !== 'active'
      },
      req.ip
    );

    return res.status(200).json({
      success: true,
      message: `User account "${targetUser.username}" status updated to ${status}.`,
      data: {
        userId: targetUserId,
        username: targetUser.username,
        previousStatus,
        newStatus: status
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 5. UPDATE USER ROLE (SUPER_ADMIN ONLY)
// =============================================================================
router.put('/users/:id/role', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId) || targetUserId < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Valid user identifier is required.' }
      });
    }

    const { role, reason } = req.body || {};
    const allowedRoles = ['user', 'admin', 'super_admin'];

    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Role must be one of: user, admin, super_admin.' }
      });
    }

    // Self-demotion protection
    if (req.user.id === targetUserId && role !== 'super_admin') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SELF_DEMOTION_BLOCKED',
          message: 'Security policy: You cannot demote your own super_admin account.'
        }
      });
    }

    const pool = getPool();

    // Check target user
    const [targetUsers] = await pool.query(
      'SELECT id, username, email, role, status FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    if (targetUsers.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Target user record not found.' }
      });
    }

    const targetUser = targetUsers[0];
    const previousRole = targetUser.role;

    // Update role
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);

    // Record audit log
    await logAdminAction(
      req.user,
      'user_role_change',
      'user',
      targetUserId,
      targetUser.username,
      {
        previousRole,
        newRole: role,
        reason: reason ? String(reason).trim() : 'Administrative role assignment'
      },
      req.ip
    );

    return res.status(200).json({
      success: true,
      message: `User account "${targetUser.username}" role updated to ${role}.`,
      data: {
        userId: targetUserId,
        username: targetUser.username,
        previousRole,
        newRole: role
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 6. ADMINISTRATIVE AUDIT LOGS HISTORY
// =============================================================================
router.get('/audit-logs', async (req, res, next) => {
  try {
    const pool = getPool();

    let page = parseInt(req.query.page || '1', 10);
    let limit = parseInt(req.query.limit || '15', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 15;
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;

    const actionType = req.query.actionType ? req.query.actionType.trim() : '';
    const search = req.query.search ? req.query.search.trim() : '';

    const whereClauses = [];
    const queryParams = [];

    if (actionType.length > 0 && actionType !== 'all') {
      whereClauses.push('action_type = ?');
      queryParams.push(actionType);
    }

    if (search.length > 0) {
      whereClauses.push('(admin_username LIKE ? OR target_identifier LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const countQuery = `SELECT COUNT(*) AS total FROM admin_audit_logs ${whereSql}`;
    const [[countResult]] = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    // Data
    const dataQuery = `
      SELECT 
        id,
        admin_id,
        admin_username,
        action_type,
        target_type,
        target_id,
        target_identifier,
        details,
        ip_address,
        created_at
      FROM admin_audit_logs
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...queryParams, limit, offset]);

    // Parse JSON details if string
    const parsedRows = rows.map((row) => ({
      id: row.id,
      admin_id: row.admin_id,
      admin_username: row.admin_username,
      action_type: row.action_type,
      target_type: row.target_type,
      target_id: row.target_id,
      target_identifier: row.target_identifier,
      details: typeof row.details === 'string' ? JSON.parse(row.details || '{}') : row.details,
      ip_address: row.ip_address,
      created_at: row.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        logs: parsedRows,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 7. APPLICATION MONITORING & OPERATIONAL STATUS
// =============================================================================
router.get('/system/status', async (req, res, next) => {
  try {
    const pool = getPool();

    // Measure MySQL latency with timing probe
    const startDb = process.hrtime();
    await pool.query('SELECT 1');
    const diffDb = process.hrtime(startDb);
    const dbLatencyMs = parseFloat(((diffDb[0] * 1e9 + diffDb[1]) / 1e6).toFixed(2));

    // Get table counts
    const [[userCount]] = await pool.query('SELECT COUNT(*) AS c FROM users');
    const [[walletCount]] = await pool.query('SELECT COUNT(*) AS c FROM wallets');
    const [[sessionCount]] = await pool.query('SELECT COUNT(*) AS c FROM sessions');
    const [[auditCount]] = await pool.query('SELECT COUNT(*) AS c FROM admin_audit_logs');

    const mem = process.memoryUsage();
    const uptimeSec = process.uptime();

    return res.status(200).json({
      success: true,
      data: {
        application: {
          name: 'IRONMAN TOSS BOOK',
          version: '1.0.0-day14',
          environment: process.env.NODE_ENV || 'development',
          serverTime: new Date().toISOString(),
          uptimeSeconds: Math.floor(uptimeSec),
          uptimeHuman: formatUptime(uptimeSec)
        },
        process: {
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          memoryUsage: {
            rss: formatBytes(mem.rss),
            heapTotal: formatBytes(mem.heapTotal),
            heapUsed: formatBytes(mem.heapUsed),
            external: formatBytes(mem.external)
          }
        },
        database: {
          status: 'online',
          driver: 'mysql2/promise',
          connectionPool: 'active',
          latencyMs: dbLatencyMs,
          tableCounts: {
            users: parseInt(userCount.c || 0, 10),
            wallets: parseInt(walletCount.c || 0, 10),
            sessions: parseInt(sessionCount.c || 0, 10),
            admin_audit_logs: parseInt(auditCount.c || 0, 10)
          }
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
