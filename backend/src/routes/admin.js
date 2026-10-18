/**
 * IRONMAN TOSS BOOK - Administrative Governance & Operations Router (Day 14)
 * Secure, role-guarded APIs for platform management, user administration,
 * audit logging, and operational monitoring.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeUser } = require('../utils/crypto');
const { createUserAccount } = require('../services/userService');
const { uploadTeamLogos, deleteUploadedFile } = require('../middleware/uploadLogo');

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

    // Concurrently execute genuine statistics queries through the connection pool
    const [
      [[userCounts]],
      [[walletSums]],
      [[sessionCount]],
      [[recentAudits]]
    ] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
          SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS bannedUsers,
          SUM(CASE WHEN role IN ('admin', 'super_admin') THEN 1 ELSE 0 END) AS adminUsers,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS newUsers24h,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS newUsers7d
        FROM users;
      `),
      pool.query(`
        SELECT 
          COUNT(*) AS totalWallets,
          COALESCE(SUM(available_balance), 0) AS totalAvailableBalance,
          COALESCE(SUM(exposure_balance), 0) AS totalExposureBalance
        FROM wallets;
      `),
      pool.query(`
        SELECT COUNT(*) AS activeSessions
        FROM sessions
        WHERE expires_at > NOW();
      `),
      pool.query(`
        SELECT COUNT(*) AS recentAudits24h
        FROM admin_audit_logs
        WHERE created_at >= NOW() - INTERVAL 24 HOUR;
      `)
    ]);

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

    // Total count query and paginated data query executed concurrently
    const countQuery = `SELECT COUNT(*) AS total FROM users u ${whereSql}`;
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
    const [ [[countResult]], [rows] ] = await Promise.all([
      pool.query(countQuery, queryParams),
      pool.query(dataQuery, dataParams)
    ]);
    const total = parseInt(countResult.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

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
// 2B. USER PROVISIONING: CREATE NEW USER ACCOUNT (ADMIN ONLY)
// =============================================================================
const handleAdminCreateUser = async (req, res, next) => {
  try {
    const {
      displayName,
      fullName,
      username,
      email,
      password,
      confirmPassword,
      phone,
      initialCoinBalance,
      initialBalance,
      accountStatus,
      status,
      role
    } = req.body || {};

    const rawDisplayName = displayName !== undefined ? displayName : fullName;
    const trimmedDisplayName = (rawDisplayName || '').trim();
    if (!trimmedDisplayName || trimmedDisplayName.length < 2 || trimmedDisplayName.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'displayName',
          message: 'Display Name is required and must be between 2 and 100 characters.'
        }
      });
    }

    const trimmedUsername = (username || '').trim();
    if (!trimmedUsername || !/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'username',
          message: 'Username is required, must be 3-30 characters long, and contain only letters, numbers, or underscores.'
        }
      });
    }

    const rawPassword = password || '';
    if (!rawPassword || rawPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'password',
          message: 'Password is required and must be at least 8 characters long.'
        }
      });
    }

    if (confirmPassword === undefined || confirmPassword === null || confirmPassword === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'confirmPassword',
          message: 'Password confirmation is required.'
        }
      });
    }

    if (rawPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'confirmPassword',
          message: 'Password and Confirm Password do not match.'
        }
      });
    }

    const rawCoinBalance = initialCoinBalance !== undefined ? initialCoinBalance : initialBalance;
    if (rawCoinBalance === undefined || rawCoinBalance === null || rawCoinBalance === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'initialCoinBalance',
          message: 'Initial coin balance is required.'
        }
      });
    }

    const parsedBalance = Number(rawCoinBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0 || parsedBalance > 100000000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'initialCoinBalance',
          message: 'Initial coin balance must be a valid, non-negative amount within supported limits.'
        }
      });
    }

    const rawStatus = (accountStatus !== undefined ? accountStatus : (status !== undefined ? status : '')).toString().trim().toLowerCase();
    const allowedStatuses = ['active', 'suspended'];
    if (!rawStatus || !allowedStatuses.includes(rawStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'accountStatus',
          message: `Account status is required and must be one of: ${allowedStatuses.join(', ')}.`
        }
      });
    }

    const registeredUser = await createUserAccount({
      admin: req.user,
      displayName: trimmedDisplayName,
      fullName: trimmedDisplayName,
      username: trimmedUsername,
      email: email || null,
      password: rawPassword,
      confirmPassword,
      phone: phone || null,
      initialCoinBalance: parsedBalance,
      initialBalance: parsedBalance,
      accountStatus: rawStatus,
      status: rawStatus,
      role,
      ip: req.ip
    });

    return res.status(201).json({
      success: true,
      message: `Player account "${registeredUser.username}" created successfully.`,
      data: {
        user: registeredUser
      }
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          field: err.field,
          message: err.message
        }
      });
    }
    next(err);
  }
};

router.post('/users/create', handleAdminCreateUser);
router.post('/users', handleAdminCreateUser);

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
// 3B. GET PLAYER TOSS & BETTING REPORT (ADMIN USER INSPECTOR)
// =============================================================================
router.get('/users/:id/toss-report', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Valid user identifier is required.' }
      });
    }

    const pool = getPool();

    // Verify user exists and retrieve core profile details
    const [userRows] = await pool.query(
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.created_at,
              w.available_balance, w.exposure_balance, w.currency
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User record not found.' }
      });
    }

    const targetUser = userRows[0];

    // Validate period parameter
    const periodRaw = (req.query.period || '7d').toString().trim().toLowerCase();
    const periodMap = {
      '7d': 7,
      '7days': 7,
      '7_days': 7,
      '15d': 15,
      '15days': 15,
      '15_days': 15,
      '30d': 30,
      '30days': 30,
      '30_days': 30,
      'lifetime': null,
      'all': null
    };

    if (!(periodRaw in periodMap)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PERIOD',
          message: 'Period must be one of: 7d, 15d, 30d, lifetime.'
        }
      });
    }

    const days = periodMap[periodRaw];
    const canonicalPeriod = days ? `${days}d` : 'lifetime';

    // Parse and validate pagination
    let page = parseInt(req.query.page || '1', 10);
    let limit = parseInt(req.query.limit || '10', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;

    // Date filtering clause based on bet placement time (b.created_at)
    let dateFilterSql = '';
    const baseParams = [userId];
    if (days !== null) {
      dateFilterSql = 'AND b.created_at >= NOW() - INTERVAL ? DAY';
      baseParams.push(days);
    }

    // 1. Summary Statistics Aggregation Query
    const summaryQuery = `
      SELECT 
        COUNT(b.id) AS total_bets,
        COALESCE(SUM(b.stake), 0.00) AS total_stake,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) AS won_bets,
        COUNT(CASE WHEN b.status = 'lost' THEN 1 END) AS lost_bets,
        COUNT(CASE WHEN b.settlement_status = 'pending' THEN 1 END) AS pending_bets,
        COUNT(CASE WHEN b.status = 'no_result' THEN 1 END) AS no_result_bets,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'settled' THEN b.payout ELSE 0.00 END), 0.00) AS total_payout,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'settled' THEN (b.payout - b.stake) ELSE 0.00 END), 0.00) AS net_profit_loss
      FROM bets b
      WHERE b.user_id = ? ${dateFilterSql}
    `;

    // 2. Toss Selection Breakdown Query
    const breakdownQuery = `
      SELECT 
        b.selection,
        COUNT(b.id) AS total_bets,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) AS won_bets,
        COUNT(CASE WHEN b.status = 'lost' THEN 1 END) AS lost_bets,
        COUNT(CASE WHEN b.settlement_status = 'pending' THEN 1 END) AS pending_bets,
        COUNT(CASE WHEN b.status = 'no_result' THEN 1 END) AS no_result_bets,
        COALESCE(SUM(b.stake), 0.00) AS total_stake,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'settled' THEN b.payout ELSE 0.00 END), 0.00) AS total_payout,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'settled' THEN (b.payout - b.stake) ELSE 0.00 END), 0.00) AS net_profit_loss
      FROM bets b
      WHERE b.user_id = ? ${dateFilterSql}
      GROUP BY b.selection
      ORDER BY total_bets DESC, total_stake DESC
    `;

    // 3. Detailed Paginated Bet Records Query
    const recordsQuery = `
      SELECT 
        b.id,
        b.match_id,
        b.market_name,
        b.selection,
        b.stake,
        b.odds,
        b.potential_return,
        b.status,
        b.settlement_status,
        b.payout,
        b.settled_at,
        b.created_at,
        m.match_title,
        m.competition,
        m.team_one,
        m.team_two,
        m.team_one_logo,
        m.team_two_logo,
        m.toss_winner,
        m.settled AS match_settled
      FROM bets b
      LEFT JOIN matches m ON m.id = b.match_id
      WHERE b.user_id = ? ${dateFilterSql}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `;

    // 4. Total Count Query for pagination
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM bets b
      WHERE b.user_id = ? ${dateFilterSql}
    `;

    const recordsParams = [...baseParams, limit, offset];

    const [
      [[summaryRow]],
      [breakdownRows],
      [recordRows],
      [[countRow]]
    ] = await Promise.all([
      pool.query(summaryQuery, baseParams),
      pool.query(breakdownQuery, baseParams),
      pool.query(recordsQuery, recordsParams),
      pool.query(countQuery, baseParams)
    ]);

    const totalRecords = parseInt(countRow?.total || 0, 10);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const summary = {
      totalBets: parseInt(summaryRow?.total_bets || 0, 10),
      totalStake: parseFloat(summaryRow?.total_stake || 0),
      wonBets: parseInt(summaryRow?.won_bets || 0, 10),
      lostBets: parseInt(summaryRow?.lost_bets || 0, 10),
      pendingBets: parseInt(summaryRow?.pending_bets || 0, 10),
      noResultBets: parseInt(summaryRow?.no_result_bets || 0, 10),
      totalPayout: parseFloat(summaryRow?.total_payout || 0),
      netProfitLoss: parseFloat(summaryRow?.net_profit_loss || 0)
    };

    const breakdown = breakdownRows.map(r => ({
      selection: r.selection,
      totalBets: parseInt(r.total_bets || 0, 10),
      wonBets: parseInt(r.won_bets || 0, 10),
      lostBets: parseInt(r.lost_bets || 0, 10),
      pendingBets: parseInt(r.pending_bets || 0, 10),
      noResultBets: parseInt(r.no_result_bets || 0, 10),
      totalStake: parseFloat(r.total_stake || 0),
      totalPayout: parseFloat(r.total_payout || 0),
      netProfitLoss: parseFloat(r.net_profit_loss || 0)
    }));

    const records = recordRows.map(r => ({
      id: r.id,
      matchId: r.match_id,
      matchTitle: r.match_title || 'Match Deleted/Unavailable',
      competition: r.competition || null,
      teamOne: r.team_one || null,
      teamTwo: r.team_two || null,
      teamOneLogo: r.team_one_logo || null,
      teamTwoLogo: r.team_two_logo || null,
      marketName: r.market_name || 'Toss Winner',
      selection: r.selection,
      stake: parseFloat(r.stake || 0),
      odds: parseFloat(r.odds || 0),
      potentialReturn: parseFloat(r.potential_return || 0),
      payout: parseFloat(r.payout || 0),
      status: r.status,
      settlementStatus: r.settlement_status,
      tossWinner: r.toss_winner || null,
      matchSettled: Boolean(r.match_settled),
      createdAt: r.created_at,
      settledAt: r.settled_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: targetUser.id,
          uuid: targetUser.uuid,
          fullName: targetUser.full_name,
          username: targetUser.username,
          email: targetUser.email,
          phone: targetUser.phone,
          role: targetUser.role,
          status: targetUser.status,
          createdAt: targetUser.created_at,
          wallet: {
            availableBalance: parseFloat(targetUser.available_balance || 0),
            exposureBalance: parseFloat(targetUser.exposure_balance || 0),
            currency: targetUser.currency || 'INR'
          }
        },
        period: canonicalPeriod,
        summary,
        breakdown,
        records,
        pagination: {
          page,
          limit,
          total: totalRecords,
          totalPages
        }
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
// 6. PERMANENTLY DELETE USER (ADMIN / SUPER_ADMIN)
// =============================================================================
const handleAdminDeleteUser = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId) || targetUserId < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Valid user identifier is required.' }
      });
    }

    let { confirmUsername, reason } = req.body || {};

    // Robust fallbacks for confirmUsername
    if (!confirmUsername && req.query?.confirmUsername) {
      confirmUsername = req.query.confirmUsername;
    }
    if (!reason && req.query?.reason) {
      reason = req.query.reason;
    }
    if (!confirmUsername && typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(req.body);
        if (parsed.confirmUsername) confirmUsername = parsed.confirmUsername;
        if (parsed.reason) reason = parsed.reason;
      } catch (e) {}
    }

    // 1. Self-deletion prevention
    if (req.user.id === targetUserId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SELF_ACTION_BLOCKED',
          message: 'Security policy: You cannot delete your own currently authenticated administrator account.'
        }
      });
    }

    const pool = getPool();

    // 2. Fetch target user with wallet and account metadata
    const [targetRows] = await pool.query(
      `SELECT u.id, u.uuid, u.username, u.email, u.full_name, u.role, u.status, u.created_at,
              w.available_balance, w.exposure_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [targetUserId]
    );

    if (targetRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Target user record not found.' }
      });
    }

    const targetUser = targetRows[0];

    // 3. Exact username confirmation check (trimmed for accidental leading/trailing spaces)
    const trimmedConfirm = (confirmUsername || '').trim();
    if (!trimmedConfirm || trimmedConfirm !== targetUser.username) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_MISMATCH',
          message: `Confirmation failed: You must type the exact username "${targetUser.username}" to authorize account deletion.`
        }
      });
    }

    // 4. Administrative account protection & governance constraints
    if (['admin', 'super_admin'].includes(targetUser.role)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only a super_admin possesses authority to manage administrative accounts.'
          }
        });
      }

      // Last active administrator check
      const [[adminCountResult]] = await pool.query(
        "SELECT COUNT(*) AS activeAdminCount FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active'"
      );
      if (adminCountResult.activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'LAST_ADMIN_PROTECTED',
            message: 'Security policy: Cannot delete the last active administrator account.'
          }
        });
      }

      // Administrative audit logs retention check
      const [[adminAuditResult]] = await pool.query(
        'SELECT COUNT(*) AS logCount FROM admin_audit_logs WHERE admin_id = ?',
        [targetUserId]
      );
      if (adminAuditResult.logCount > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RETENTION_BLOCKED',
            message: 'Administrative account is referenced in regulatory audit trails and cannot be permanently deleted. Please suspend or ban the account instead.'
          }
        });
      }
    }

    // 5. Active wager / liability protection: Check for pending unsettled bets
    const [[pendingBetsResult]] = await pool.query(
      "SELECT COUNT(*) AS pendingCount FROM bets WHERE user_id = ? AND settlement_status = 'pending'",
      [targetUserId]
    );
    if (pendingBetsResult.pendingCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVE_BETS_EXIST',
          message: `Cannot delete user: Account has ${pendingBetsResult.pendingCount} active or pending wager(s). Matches must be settled before deletion.`
        }
      });
    }

    // 6. Execute atomic deletion within MySQL transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Permanent administrative audit log entry
      await connection.query(
        `INSERT INTO admin_audit_logs (admin_id, admin_username, action_type, target_type, target_id, target_identifier, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          req.user.username,
          'delete_user',
          'user',
          targetUserId,
          targetUser.username,
          JSON.stringify({
            deletedUserId: targetUserId,
            deletedUsername: targetUser.username,
            deletedEmail: targetUser.email,
            deletedFullName: targetUser.full_name,
            deletedRole: targetUser.role,
            deletedStatus: targetUser.status,
            walletBalance: parseFloat(targetUser.available_balance || 0),
            registeredAt: targetUser.created_at,
            reason: reason ? String(reason).trim() : 'Permanent account deletion confirmed by admin',
            deletedAt: new Date().toISOString()
          }),
          req.ip || '127.0.0.1'
        ]
      );

      // Invalidate active login sessions
      await connection.query('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);

      // Remove preferences
      await connection.query('DELETE FROM user_preferences WHERE user_id = ?', [targetUserId]);

      // Permanently remove the user account (wallets and settled bets cascade cleanly)
      await connection.query('DELETE FROM users WHERE id = ?', [targetUserId]);

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    return res.status(200).json({
      success: true,
      message: `User account "${targetUser.username}" and associated account data have been permanently deleted.`,
      data: {
        deletedUserId: targetUserId,
        deletedUsername: targetUser.username
      }
    });
  } catch (err) {
    next(err);
  }
};

router.delete('/users/:id', handleAdminDeleteUser);
router.post('/users/:id/delete', handleAdminDeleteUser);

// =============================================================================
// 7. ADMINISTRATIVE AUDIT LOGS HISTORY
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

    // Count query and paginated audit records executed concurrently
    const countQuery = `SELECT COUNT(*) AS total FROM admin_audit_logs ${whereSql}`;
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

    const [ [[countResult]], [rows] ] = await Promise.all([
      pool.query(countQuery, queryParams),
      pool.query(dataQuery, [...queryParams, limit, offset])
    ]);
    const total = parseInt(countResult.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

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
          name: 'DADDY TOSS BOOK',
          version: '1.0.0-day17',
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

// =============================================================================
// 8. MATCH MONITORING: LIST MATCHES WITH BET STATS
// =============================================================================
router.get('/matches', async (req, res, next) => {
  try {
    const pool = getPool();

    const search = req.query.search ? req.query.search.trim() : '';
    const statusFilter = req.query.status ? req.query.status.trim() : 'all';
    const hasBetsFilter = req.query.hasBets ? req.query.hasBets.trim() : 'all';
    const settlementFilter = req.query.settlement ? req.query.settlement.trim() : 'all';

    const whereClauses = [];
    const queryParams = [];

    if (search.length > 0) {
      whereClauses.push('(m.id LIKE ? OR m.match_title LIKE ? OR m.competition LIKE ? OR m.team_one LIKE ? OR m.team_two LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (statusFilter !== 'all' && ['live', 'upcoming', 'completed', 'abandoned'].includes(statusFilter)) {
      whereClauses.push('m.status = ?');
      queryParams.push(statusFilter);
    }

    if (settlementFilter === 'settled') {
      whereClauses.push('m.settled = TRUE');
    } else if (settlementFilter === 'pending') {
      whereClauses.push('m.settled = FALSE');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Having clause for hasBets filter
    let havingSql = '';
    if (hasBetsFilter === 'true') {
      havingSql = 'HAVING total_bets > 0';
    } else if (hasBetsFilter === 'false') {
      havingSql = 'HAVING total_bets = 0';
    }

    const matchesQuery = `
      SELECT 
        m.id,
        m.competition,
        m.stage,
        m.match_title,
        m.team_one,
        m.team_one_abbr,
        m.team_one_rate,
        m.team_one_logo,
        m.team_two,
        m.team_two_abbr,
        m.team_two_rate,
        m.team_two_logo,
        m.scheduled_time,
        m.match_end_time,
        m.venue,
        m.status,
        m.toss_winner,
        m.settled,
        m.settled_at,
        m.created_at,
        COUNT(b.id) AS total_bets,
        COUNT(DISTINCT b.user_id) AS total_players,
        COALESCE(SUM(b.stake), 0.00) AS total_stake,
        COUNT(CASE WHEN b.settlement_status = 'pending' THEN 1 END) AS pending_bets,
        COUNT(CASE WHEN b.settlement_status = 'settled' THEN 1 END) AS settled_bets
      FROM matches m
      LEFT JOIN bets b ON b.match_id = m.id
      ${whereSql}
      GROUP BY m.id
      ${havingSql}
      ORDER BY 
        CASE WHEN m.status = 'live' THEN 1 WHEN m.status = 'upcoming' THEN 2 ELSE 3 END ASC,
        m.settled ASC,
        total_bets DESC,
        m.created_at DESC
    `;

    // Platform-wide overview summary metrics
    const summaryQuery = `
      SELECT 
        (SELECT COUNT(DISTINCT match_id) FROM bets) AS totalMatchesWithBets,
        (SELECT COUNT(*) FROM bets) AS totalBets,
        (SELECT COUNT(*) FROM bets WHERE settlement_status = 'pending') AS pendingBets,
        (SELECT COUNT(*) FROM bets WHERE settlement_status = 'settled') AS settledBets,
        (SELECT COALESCE(SUM(stake), 0.00) FROM bets) AS totalStakes,
        (SELECT COALESCE(SUM(payout), 0.00) FROM bets WHERE settlement_status = 'settled') AS totalSettledPayouts
    `;

    const [ [matchesRows], [[summaryResult]] ] = await Promise.all([
      pool.query(matchesQuery, queryParams),
      pool.query(summaryQuery)
    ]);

    const formattedMatches = matchesRows.map(row => ({
      id: row.id,
      competition: row.competition,
      stage: row.stage,
      matchTitle: row.match_title,
      match_title: row.match_title,
      teamOne: row.team_one,
      team_one: row.team_one,
      teamOneAbbr: row.team_one_abbr,
      teamOneRate: parseFloat(row.team_one_rate || 0),
      teamOneLogo: row.team_one_logo || null,
      team_one_logo: row.team_one_logo || null,
      teamTwo: row.team_two,
      team_two: row.team_two,
      teamTwoAbbr: row.team_two_abbr,
      teamTwoRate: parseFloat(row.team_two_rate || 0),
      teamTwoLogo: row.team_two_logo || null,
      team_two_logo: row.team_two_logo || null,
      scheduledTime: row.scheduled_time,
      matchEndTime: row.match_end_time,
      match_end_time: row.match_end_time,
      isExpired: Boolean(row.match_end_time && new Date(row.match_end_time).getTime() <= Date.now()),
      venue: row.venue,
      status: row.status,
      tossWinner: row.toss_winner,
      toss_winner: row.toss_winner,
      settled: Boolean(row.settled),
      settledAt: row.settled_at,
      settled_at: row.settled_at,
      createdAt: row.created_at,
      totalBets: parseInt(row.total_bets || 0, 10),
      total_bets: parseInt(row.total_bets || 0, 10),
      totalPlayers: parseInt(row.total_players || 0, 10),
      total_players: parseInt(row.total_players || 0, 10),
      totalStake: parseFloat(row.total_stake || 0),
      total_stake: parseFloat(row.total_stake || 0),
      pendingBets: parseInt(row.pending_bets || 0, 10),
      pending_bets: parseInt(row.pending_bets || 0, 10),
      settledBets: parseInt(row.settled_bets || 0, 10),
      settled_bets: parseInt(row.settled_bets || 0, 10)
    }));

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalMatchesWithBets: parseInt(summaryResult.totalMatchesWithBets || 0, 10),
          matches_with_bets: parseInt(summaryResult.totalMatchesWithBets || 0, 10),
          totalBets: parseInt(summaryResult.totalBets || 0, 10),
          total_bets: parseInt(summaryResult.totalBets || 0, 10),
          pendingBets: parseInt(summaryResult.pendingBets || 0, 10),
          pending_bets: parseInt(summaryResult.pendingBets || 0, 10),
          settledBets: parseInt(summaryResult.settledBets || 0, 10),
          settled_bets: parseInt(summaryResult.settledBets || 0, 10),
          totalStakes: parseFloat(summaryResult.totalStakes || 0),
          total_stakes_placed: parseFloat(summaryResult.totalStakes || 0),
          totalSettledPayouts: parseFloat(summaryResult.totalSettledPayouts || 0)
        },
        matches: formattedMatches,
        count: formattedMatches.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 9. MATCH MONITORING: GET ALL BETS FOR A SPECIFIC MATCH
// =============================================================================
router.get('/matches/:id/bets', async (req, res, next) => {
  try {
    const matchId = req.params.id ? req.params.id.trim() : '';
    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MATCH_ID', message: 'Match identifier is required.' }
      });
    }

    const pool = getPool();

    // Verify match exists
    const [matchRows] = await pool.query(
      `SELECT id, competition, stage, match_title, team_one, team_one_abbr, team_one_rate, team_one_logo,
              team_two, team_two_abbr, team_two_rate, team_two_logo, scheduled_time, match_end_time, venue, status,
              toss_winner, settled, settled_at, created_at
       FROM matches WHERE id = ?`,
      [matchId]
    );

    if (matchRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Match "${matchId}" not found in database.` }
      });
    }

    const matchInfo = matchRows[0];

    // Pagination
    let page = parseInt(req.query.page || '1', 10);
    let limit = parseInt(req.query.limit || '100', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 100;
    if (limit > 500) limit = 500;
    const offset = (page - 1) * limit;

    // Filters
    const statusFilter = req.query.status ? req.query.status.trim() : 'all';
    const settlementFilter = req.query.settlement_status ? req.query.settlement_status.trim() : 'all';
    const search = req.query.search ? req.query.search.trim() : '';

    const whereClauses = ['b.match_id = ?'];
    const queryParams = [matchId];

    if (statusFilter !== 'all' && ['pending', 'live', 'won', 'lost', 'no_result'].includes(statusFilter)) {
      whereClauses.push('b.status = ?');
      queryParams.push(statusFilter);
    }

    if (settlementFilter !== 'all' && ['pending', 'settled'].includes(settlementFilter)) {
      whereClauses.push('b.settlement_status = ?');
      queryParams.push(settlementFilter);
    }

    if (search.length > 0) {
      whereClauses.push('(b.id LIKE ? OR u.username LIKE ? OR u.full_name LIKE ? OR b.selection LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM bets b 
      JOIN users u ON u.id = b.user_id 
      ${whereSql}
    `;

    const dataQuery = `
      SELECT 
        b.id,
        b.user_id,
        u.username,
        u.full_name AS player_name,
        b.match_id,
        b.market_name,
        b.selection,
        b.stake,
        b.odds,
        b.potential_return,
        b.status,
        b.settlement_status,
        b.payout,
        b.refund_amount,
        b.cancelled_at,
        b.created_at,
        b.settled_at
      FROM bets b
      JOIN users u ON u.id = b.user_id
      ${whereSql}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ? OFFSET ?
    `;

    // Aggregate summary query for this match's bets
    const summaryQuery = `
      SELECT
        COUNT(*) AS total_bets,
        COUNT(DISTINCT b.user_id) AS total_players,
        COALESCE(SUM(b.stake), 0.00) AS total_stake,
        COUNT(CASE WHEN b.settlement_status = 'pending' THEN 1 END) AS pending_bets,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'pending' THEN b.stake ELSE 0.00 END), 0.00) AS pending_stake,
        COUNT(CASE WHEN b.settlement_status = 'settled' THEN 1 END) AS settled_bets,
        COALESCE(SUM(CASE WHEN b.settlement_status = 'settled' THEN b.stake ELSE 0.00 END), 0.00) AS settled_stake,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) AS won_bets,
        COUNT(CASE WHEN b.status = 'lost' THEN 1 END) AS lost_bets,
        COUNT(CASE WHEN b.status = 'no_result' THEN 1 END) AS refund_bets,
        COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bets,
        COALESCE(SUM(b.payout), 0.00) AS total_payout
      FROM bets b
      WHERE b.match_id = ?
    `;

    const [ [[countResult]], [betsRows], [[summaryResult]] ] = await Promise.all([
      pool.query(countQuery, queryParams),
      pool.query(dataQuery, [...queryParams, limit, offset]),
      pool.query(summaryQuery, [matchId])
    ]);

    const total = parseInt(countResult?.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    const formattedBets = betsRows.map(row => ({
      id: row.id,
      userId: row.user_id,
      user_id: row.user_id,
      username: row.username,
      playerName: row.player_name,
      full_name: row.player_name,
      matchId: row.match_id,
      match_id: row.match_id,
      marketName: row.market_name,
      market_name: row.market_name,
      selection: row.selection,
      stake: parseFloat(row.stake || 0),
      odds: parseFloat(row.odds || 0),
      potentialReturn: parseFloat(row.potential_return || 0),
      potential_return: parseFloat(row.potential_return || 0),
      status: row.status,
      settlementStatus: row.settlement_status,
      settlement_status: row.settlement_status,
      payout: parseFloat(row.payout || 0),
      refundAmount: parseFloat(row.refund_amount || 0),
      refund_amount: parseFloat(row.refund_amount || 0),
      cancelledAt: row.cancelled_at,
      cancelled_at: row.cancelled_at,
      createdAt: row.created_at,
      created_at: row.created_at,
      placed_at: row.created_at,
      settledAt: row.settled_at,
      settled_at: row.settled_at
    }));

    const summary = {
      totalBets: parseInt(summaryResult?.total_bets || 0, 10),
      total_bets: parseInt(summaryResult?.total_bets || 0, 10),
      totalPlayers: parseInt(summaryResult?.total_players || 0, 10),
      total_players: parseInt(summaryResult?.total_players || 0, 10),
      totalStake: parseFloat(summaryResult?.total_stake || 0),
      total_stake: parseFloat(summaryResult?.total_stake || 0),
      pendingBets: parseInt(summaryResult?.pending_bets || 0, 10),
      pending_bets: parseInt(summaryResult?.pending_bets || 0, 10),
      pendingStake: parseFloat(summaryResult?.pending_stake || 0),
      pending_stake: parseFloat(summaryResult?.pending_stake || 0),
      settledBets: parseInt(summaryResult?.settled_bets || 0, 10),
      settled_bets: parseInt(summaryResult?.settled_bets || 0, 10),
      settledStake: parseFloat(summaryResult?.settled_stake || 0),
      settled_stake: parseFloat(summaryResult?.settled_stake || 0),
      wonBets: parseInt(summaryResult?.won_bets || 0, 10),
      won_bets: parseInt(summaryResult?.won_bets || 0, 10),
      lostBets: parseInt(summaryResult?.lost_bets || 0, 10),
      lost_bets: parseInt(summaryResult?.lost_bets || 0, 10),
      refundBets: parseInt(summaryResult?.refund_bets || 0, 10),
      refund_bets: parseInt(summaryResult?.refund_bets || 0, 10),
      cancelledBets: parseInt(summaryResult?.cancelled_bets || 0, 10),
      cancelled_bets: parseInt(summaryResult?.cancelled_bets || 0, 10),
      totalPayout: parseFloat(summaryResult?.total_payout || 0),
      total_payout: parseFloat(summaryResult?.total_payout || 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        match: {
          id: matchInfo.id,
          matchTitle: matchInfo.match_title,
          match_title: matchInfo.match_title,
          competition: matchInfo.competition,
          stage: matchInfo.stage,
          teamOne: matchInfo.team_one,
          team_one: matchInfo.team_one,
          teamOneAbbr: matchInfo.team_one_abbr,
          team_one_abbr: matchInfo.team_one_abbr,
          teamOneRate: parseFloat(matchInfo.team_one_rate || 1.90),
          team_one_rate: parseFloat(matchInfo.team_one_rate || 1.90),
          rate_team_one: parseFloat(matchInfo.team_one_rate || 1.90),
          teamTwo: matchInfo.team_two,
          team_two: matchInfo.team_two,
          teamTwoAbbr: matchInfo.team_two_abbr,
          team_two_abbr: matchInfo.team_two_abbr,
          teamTwoRate: parseFloat(matchInfo.team_two_rate || 1.90),
          team_two_rate: parseFloat(matchInfo.team_two_rate || 1.90),
          rate_team_two: parseFloat(matchInfo.team_two_rate || 1.90),
          scheduledTime: matchInfo.scheduled_time,
          scheduled_time: matchInfo.scheduled_time,
          matchEndTime: matchInfo.match_end_time,
          match_end_time: matchInfo.match_end_time,
          isExpired: Boolean(matchInfo.match_end_time && new Date(matchInfo.match_end_time).getTime() <= Date.now()),
          venue: matchInfo.venue,
          status: matchInfo.status,
          tossWinner: matchInfo.toss_winner,
          toss_winner: matchInfo.toss_winner,
          settled: Boolean(matchInfo.settled),
          settledAt: matchInfo.settled_at,
          settled_at: matchInfo.settled_at
        },
        bets: formattedBets,
        summary,
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

function parseExpiryDateTime(input) {
  if (!input) return null;
  if (typeof input === 'number') return new Date(input);
  const str = String(input).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return new Date(n < 1e11 ? n * 1000 : n);
  }
  // If datetime-local without timezone (e.g. "2026-10-16T21:30" or "2026-10-16 21:30:00")
  // Interpret as Indian Standard Time (IST, UTC+5:30)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str.replace(' ', 'T') + '+05:30');
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// =============================================================================
// 9. MATCH MANAGEMENT: CREATE, SCHEDULE & DELETE MATCH
// =============================================================================
async function handleAdminCreateMatch(req, res, next) {
  try {
    const pool = getPool();
    const admin = req.user;

    const competition = (req.body.competition || '').trim();
    const stage = (req.body.stage || '').trim() || 'Fixture';
    const teamOne = (req.body.team_one || req.body.teamOne || '').trim();
    const teamOneAbbr = (req.body.team_one_abbr || req.body.teamOneAbbr || '').trim() || teamOne.substring(0, 4).toUpperCase();
    const teamOneRate = parseFloat(req.body.team_one_rate || req.body.teamOneRate || 1.90);

    const teamTwo = (req.body.team_two || req.body.teamTwo || '').trim();
    const teamTwoAbbr = (req.body.team_two_abbr || req.body.teamTwoAbbr || '').trim() || teamTwo.substring(0, 4).toUpperCase();
    const teamTwoRate = parseFloat(req.body.team_two_rate || req.body.teamTwoRate || 1.90);

    const scheduledTime = (req.body.scheduled_time || req.body.scheduledTime || '').trim() || 'Schedule TBA';
    const rawStartTime = req.body.match_start_time || req.body.matchStartTime || req.body.start_time || req.body.startTime;
    const matchStartTime = rawStartTime ? parseExpiryDateTime(rawStartTime) : null;
    const rawEndTime = req.body.match_end_time || req.body.matchEndTime || req.body.end_time || req.body.endTime;
    const matchEndTime = parseExpiryDateTime(rawEndTime);

    const venue = (req.body.venue || '').trim() || 'Cricket Stadium';
    const status = (req.body.status || 'upcoming').trim().toLowerCase();

    // Extract team logos from uploaded files or body
    let teamOneLogo = null;
    let teamTwoLogo = null;

    if (req.files) {
      const file1 = (req.files.teamOneLogo || req.files.team_one_logo)?.[0];
      if (file1) {
        teamOneLogo = `/uploads/team-logos/${file1.filename}`;
      }
      const file2 = (req.files.teamTwoLogo || req.files.team_two_logo)?.[0];
      if (file2) {
        teamTwoLogo = `/uploads/team-logos/${file2.filename}`;
      }
    }

    if (!teamOneLogo && (req.body.team_one_logo || req.body.teamOneLogo)) {
      teamOneLogo = String(req.body.team_one_logo || req.body.teamOneLogo).trim() || null;
    }
    if (!teamTwoLogo && (req.body.team_two_logo || req.body.teamTwoLogo)) {
      teamTwoLogo = String(req.body.team_two_logo || req.body.teamTwoLogo).trim() || null;
    }

    // Validation
    const validationErrors = [];
    if (!competition) validationErrors.push({ field: 'competition', message: 'Competition / tournament name is required.' });
    if (!teamOne) validationErrors.push({ field: 'team_one', message: 'First team name is required.' });
    if (!teamTwo) validationErrors.push({ field: 'team_two', message: 'Second team name is required.' });
    if (isNaN(teamOneRate) || teamOneRate < 1.01 || teamOneRate > 99.99) {
      validationErrors.push({ field: 'team_one_rate', message: 'Team 1 toss rate must be between 1.01 and 99.99.' });
    }
    if (isNaN(teamTwoRate) || teamTwoRate < 1.01 || teamTwoRate > 99.99) {
      validationErrors.push({ field: 'team_two_rate', message: 'Team 2 toss rate must be between 1.01 and 99.99.' });
    }
    if (!['upcoming', 'live'].includes(status)) {
      validationErrors.push({ field: 'status', message: "Status must be either 'upcoming' or 'live'." });
    }

    if (!matchEndTime || isNaN(matchEndTime.getTime())) {
      validationErrors.push({
        field: 'match_end_time',
        message: 'Valid match end / expiry date and time is required.'
      });
    } else if (matchEndTime.getTime() <= Date.now()) {
      validationErrors.push({
        field: 'match_end_time',
        message: 'Match end time cannot be in the past. Please set a future expiry time.'
      });
    }

    if (validationErrors.length > 0) {
      if (teamOneLogo && teamOneLogo.startsWith('/uploads/')) await deleteUploadedFile(teamOneLogo);
      if (teamTwoLogo && teamTwoLogo.startsWith('/uploads/')) await deleteUploadedFile(teamTwoLogo);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationErrors.map(e => e.message).join(' '),
          details: validationErrors
        }
      });
    }

    const matchTitle = `${teamOne} vs ${teamTwo}`;
    const matchId = `MATCH-${Date.now()}`;

    await pool.query(
      `INSERT INTO matches (
        id, competition, stage, match_title,
        team_one, team_one_abbr, team_one_rate, team_one_logo,
        team_two, team_two_abbr, team_two_rate, team_two_logo,
        scheduled_time, match_start_time, match_end_time, venue, status, toss_winner, settled, settled_at, settled_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`,
      [
        matchId,
        competition,
        stage,
        matchTitle,
        teamOne,
        teamOneAbbr,
        teamOneRate,
        teamOneLogo,
        teamTwo,
        teamTwoAbbr,
        teamTwoRate,
        teamTwoLogo,
        scheduledTime,
        matchStartTime,
        matchEndTime,
        venue,
        status
      ]
    );

    // Immutable audit trail recording
    await logAdminAction(
      admin,
      'create_match',
      'match',
      null,
      matchId,
      {
        matchId,
        matchTitle,
        competition,
        teamOne,
        teamTwo,
        teamOneRate,
        teamTwoRate,
        teamOneLogo,
        teamTwoLogo,
        scheduledTime,
        matchEndTime,
        venue,
        status
      },
      req.ip
    );

    const createdMatch = {
      id: matchId,
      competition,
      stage,
      matchTitle,
      teamOne,
      teamOneAbbr,
      teamOneRate,
      teamOneLogo,
      team_one_logo: teamOneLogo,
      teamTwo,
      teamTwoAbbr,
      teamTwoRate,
      teamTwoLogo,
      team_two_logo: teamTwoLogo,
      scheduledTime,
      matchEndTime,
      match_end_time: matchEndTime,
      venue,
      status,
      settled: false
    };

    return res.status(201).json({
      success: true,
      message: 'Match fixture created successfully in database.',
      data: {
        match: createdMatch
      }
    });
  } catch (err) {
    if (req.files) {
      const file1 = (req.files.teamOneLogo || req.files.team_one_logo)?.[0];
      if (file1) await deleteUploadedFile(file1.filename);
      const file2 = (req.files.teamTwoLogo || req.files.team_two_logo)?.[0];
      if (file2) await deleteUploadedFile(file2.filename);
    }
    next(err);
  }
}

async function handleAdminUpdateMatchLogos(req, res, next) {
  try {
    const pool = getPool();
    const matchId = (req.params.id || '').trim();

    const [rows] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found.' }
      });
    }

    const currentMatch = rows[0];
    let newTeamOneLogo = currentMatch.team_one_logo;
    let newTeamTwoLogo = currentMatch.team_two_logo;

    const removeTeamOne = req.body.remove_team_one_logo === 'true' || req.body.remove_team_one_logo === true || req.body.removeTeamOneLogo === true;
    const removeTeamTwo = req.body.remove_team_two_logo === 'true' || req.body.remove_team_two_logo === true || req.body.removeTeamTwoLogo === true;

    if (removeTeamOne) {
      newTeamOneLogo = null;
    } else if (req.files && (req.files.teamOneLogo || req.files.team_one_logo)) {
      const f1 = (req.files.teamOneLogo || req.files.team_one_logo)[0];
      newTeamOneLogo = `/uploads/team-logos/${f1.filename}`;
    } else if (req.body.team_one_logo !== undefined && req.body.team_one_logo !== '') {
      newTeamOneLogo = String(req.body.team_one_logo).trim();
    }

    if (removeTeamTwo) {
      newTeamTwoLogo = null;
    } else if (req.files && (req.files.teamTwoLogo || req.files.team_two_logo)) {
      const f2 = (req.files.teamTwoLogo || req.files.team_two_logo)[0];
      newTeamTwoLogo = `/uploads/team-logos/${f2.filename}`;
    } else if (req.body.team_two_logo !== undefined && req.body.team_two_logo !== '') {
      newTeamTwoLogo = String(req.body.team_two_logo).trim();
    }

    await pool.query(
      'UPDATE matches SET team_one_logo = ?, team_two_logo = ? WHERE id = ?',
      [newTeamOneLogo, newTeamTwoLogo, matchId]
    );

    await logAdminAction(
      req.user,
      'update_match_logos',
      'match',
      null,
      matchId,
      {
        matchId,
        previousTeamOneLogo: currentMatch.team_one_logo,
        newTeamOneLogo,
        previousTeamTwoLogo: currentMatch.team_two_logo,
        newTeamTwoLogo
      },
      req.ip
    );

    const [updatedRows] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    const m = updatedRows[0];

    return res.status(200).json({
      success: true,
      message: 'Match team logos updated successfully.',
      data: {
        match: {
          id: m.id,
          matchTitle: m.match_title,
          teamOne: m.team_one,
          teamOneLogo: m.team_one_logo,
          team_one_logo: m.team_one_logo,
          teamTwo: m.team_two,
          teamTwoLogo: m.team_two_logo,
          team_two_logo: m.team_two_logo
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

router.post('/matches', uploadTeamLogos, handleAdminCreateMatch);
router.post('/matches/create', uploadTeamLogos, handleAdminCreateMatch);
router.put('/matches/:id/logos', uploadTeamLogos, handleAdminUpdateMatchLogos);

router.put('/matches/:id/schedule', async (req, res, next) => {
  try {
    const matchId = (req.params.id || '').trim();
    const pool = getPool();

    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found.' }
      });
    }

    const rawEndTime = req.body.match_end_time || req.body.matchEndTime || req.body.end_time;
    const scheduledTime = req.body.scheduled_time || req.body.scheduledTime;

    const parsedEndTime = parseExpiryDateTime(rawEndTime);
    if (!parsedEndTime || isNaN(parsedEndTime.getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_END_TIME', message: 'Valid match end / expiry date and time is required.' }
      });
    }

    await pool.query(
      'UPDATE matches SET match_end_time = ?, scheduled_time = COALESCE(?, scheduled_time) WHERE id = ?',
      [parsedEndTime, scheduledTime ? String(scheduledTime).trim() : null, matchId]
    );

    await logAdminAction(
      req.user,
      'update_match_schedule',
      'match',
      null,
      matchId,
      {
        matchId,
        previousEndTime: matches[0].match_end_time,
        newEndTime: parsedEndTime,
        scheduledTime: scheduledTime || matches[0].scheduled_time
      },
      req.ip
    );

    const [updatedRows] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    const m = updatedRows[0];

    return res.status(200).json({
      success: true,
      message: 'Match schedule and end time updated successfully.',
      data: {
        match: {
          id: m.id,
          matchTitle: m.match_title,
          scheduledTime: m.scheduled_time,
          matchEndTime: m.match_end_time,
          match_end_time: m.match_end_time,
          isExpired: Boolean(m.match_end_time && new Date(m.match_end_time).getTime() <= Date.now())
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/matches/:id', async (req, res, next) => {
  try {
    const matchId = req.params.id ? req.params.id.trim() : '';
    const pool = getPool();

    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found.' }
      });
    }

    const [bets] = await pool.query('SELECT COUNT(*) as count FROM bets WHERE match_id = ?', [matchId]);
    if (bets[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'HAS_BETS', message: 'Cannot delete match with existing player wagers. Settle or cancel bets first.' }
      });
    }

    await pool.query('DELETE FROM matches WHERE id = ?', [matchId]);
    await logAdminAction(req.user, 'delete_match', 'match', null, matchId, { matchId }, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Match fixture deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
});

router.put('/matches/:id/status', async (req, res, next) => {
  try {
    const matchId = (req.params.id || '').trim();
    const status = (req.body.status || '').trim().toLowerCase();
    const tossWinner = req.body.toss_winner ? req.body.toss_winner.trim() : (req.body.tossWinner ? req.body.tossWinner.trim() : null);

    if (!['upcoming', 'live', 'completed', 'abandoned'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: "Status must be 'upcoming', 'live', 'completed', or 'abandoned'." }
      });
    }

    const pool = getPool();
    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found.' }
      });
    }

    const isCompleted = status === 'completed' || status === 'abandoned';
    await pool.query(
      `UPDATE matches 
       SET status = ?, 
           toss_winner = COALESCE(?, toss_winner), 
           settled = CASE WHEN ? THEN TRUE ELSE settled END,
           settled_at = CASE WHEN ? AND settled_at IS NULL THEN NOW() ELSE settled_at END,
           settled_by = CASE WHEN ? AND settled_by IS NULL THEN ? ELSE settled_by END
       WHERE id = ?`,
      [status, tossWinner, isCompleted, isCompleted, isCompleted, req.user.id, matchId]
    );

    await logAdminAction(req.user, 'update_match_status', 'match', null, matchId, { status, tossWinner, isCompleted }, req.ip);

    return res.status(200).json({
      success: true,
      message: `Match status updated to ${status}.`,
      data: {
        match_id: matchId,
        status,
        settled: isCompleted,
        toss_winner: tossWinner || matches[0].toss_winner
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 10. BET SETTLEMENT: GET MATCHES ELIGIBLE FOR SETTLEMENT
// =============================================================================
router.get('/settlement/eligible', async (req, res, next) => {
  try {
    const pool = getPool();

    const query = `
      SELECT 
        m.id,
        m.competition,
        m.stage,
        m.match_title,
        m.team_one,
        m.team_one_abbr,
        m.team_one_rate,
        m.team_two,
        m.team_two_abbr,
        m.team_two_rate,
        m.scheduled_time,
        m.venue,
        m.status,
        m.toss_winner,
        m.settled,
        COUNT(b.id) AS pending_bets_count,
        COALESCE(SUM(b.stake), 0.00) AS pending_total_stake
      FROM matches m
      JOIN bets b ON b.match_id = m.id AND b.settlement_status = 'pending'
      WHERE m.settled = FALSE
      GROUP BY m.id
      ORDER BY pending_bets_count DESC, m.created_at DESC
    `;

    const [rows] = await pool.query(query);

    const eligible = rows.map(r => ({
      id: r.id,
      competition: r.competition,
      stage: r.stage,
      matchTitle: r.match_title,
      match_title: r.match_title,
      teamOne: r.team_one,
      team_one: r.team_one,
      teamOneAbbr: r.team_one_abbr,
      teamOneRate: parseFloat(r.team_one_rate || 0),
      teamTwo: r.team_two,
      team_two: r.team_two,
      teamTwoAbbr: r.team_two_abbr,
      teamTwoRate: parseFloat(r.team_two_rate || 0),
      scheduledTime: r.scheduled_time,
      venue: r.venue,
      status: r.status,
      pendingBetsCount: parseInt(r.pending_bets_count || 0, 10),
      pending_bets_count: parseInt(r.pending_bets_count || 0, 10),
      pendingTotalStake: parseFloat(r.pending_total_stake || 0),
      total_pending_stake: parseFloat(r.pending_total_stake || 0)
    }));

    return res.status(200).json({
      success: true,
      data: {
        matches: eligible,
        eligible_matches: eligible,
        totalEligible: eligible.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 11. BET SETTLEMENT: PREVIEW SETTLEMENT CALCULATIONS (READ-ONLY)
// =============================================================================
router.post('/settlement/preview', async (req, res, next) => {
  try {
    const rawMatchId = req.body.matchId !== undefined ? String(req.body.matchId) : (req.body.match_id !== undefined ? String(req.body.match_id) : '');
    const rawOutcome = req.body.outcome || req.body.declaredOutcome || req.body.declared_outcome;

    if (!rawMatchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MATCH_ID', message: 'A valid match identifier is required.' }
      });
    }

    if (!rawOutcome || typeof rawOutcome !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_OUTCOME', message: 'Declared outcome selection is required.' }
      });
    }

    const pool = getPool();

    // Check match
    const [matchRows] = await pool.query(
      'SELECT id, match_title, team_one, team_two, status, settled, settled_at FROM matches WHERE id = ?',
      [rawMatchId.trim()]
    );

    if (matchRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'MATCH_NOT_FOUND', message: `Match "${rawMatchId}" does not exist.` }
      });
    }

    const match = matchRows[0];
    if (match.settled) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_SETTLED', message: `Match "${match.match_title}" was already settled on ${match.settled_at}.` }
      });
    }

    const cleanOutcome = rawOutcome.trim();
    const validOutcomes = [match.team_one, match.team_two, 'NO_RESULT'];
    if (!validOutcomes.includes(cleanOutcome)) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'OUTCOME_MISMATCH', 
          message: `Outcome must be "${match.team_one}", "${match.team_two}", or "NO_RESULT". Received: "${cleanOutcome}".` 
        }
      });
    }

    // Retrieve pending bets
    const [bets] = await pool.query(
      `SELECT b.id, b.user_id, u.username, u.full_name, b.selection, b.stake, b.odds, b.potential_return
       FROM bets b
       JOIN users u ON u.id = b.user_id
       WHERE b.match_id = ? AND b.settlement_status = 'pending'`,
      [match.id]
    );

    let wonCount = 0;
    let lostCount = 0;
    let noResultCount = 0;
    let totalStake = 0;
    let totalPayout = 0;

    const betPreviews = bets.map(b => {
      const stakeNum = parseFloat(b.stake);
      const oddsNum = parseFloat(b.odds);
      const potentialRetNum = parseFloat(b.potential_return);
      totalStake += stakeNum;

      let expectedStatus = 'lost';
      let expectedPayout = 0.00;

      if (cleanOutcome === 'NO_RESULT') {
        expectedStatus = 'no_result';
        expectedPayout = stakeNum; // full refund
        noResultCount++;
      } else if (b.selection === cleanOutcome) {
        expectedStatus = 'won';
        expectedPayout = potentialRetNum;
        wonCount++;
      } else {
        expectedStatus = 'lost';
        expectedPayout = 0.00;
        lostCount++;
      }

      totalPayout += expectedPayout;

      return {
        betId: b.id,
        username: b.username,
        playerName: b.full_name,
        selection: b.selection,
        stake: stakeNum,
        odds: oddsNum,
        expectedStatus,
        expectedPayout
      };
    });

    const totalWinningPayout = parseFloat(totalPayout.toFixed(2));
    const totalRefundedAmount = cleanOutcome === 'NO_RESULT' ? parseFloat(totalStake.toFixed(2)) : 0.00;
    const winningStake = cleanOutcome === 'NO_RESULT' ? 0.00 : bets.filter(b => b.selection === cleanOutcome).reduce((a, b) => a + parseFloat(b.stake), 0);
    const totalLosingStake = cleanOutcome === 'NO_RESULT' ? 0.00 : parseFloat((totalStake - winningStake).toFixed(2));

    return res.status(200).json({
      success: true,
      data: {
        matchId: match.id,
        match_id: match.id,
        matchTitle: match.match_title,
        match_title: match.match_title,
        declaredOutcome: cleanOutcome,
        declared_outcome: cleanOutcome,
        totalEligibleBets: bets.length,
        eligible_bets_count: bets.length,
        wonBetsCount: wonCount,
        lostBetsCount: lostCount,
        noResultCount: noResultCount,
        totalStake: parseFloat(totalStake.toFixed(2)),
        totalExpectedPayout: totalWinningPayout,
        betPreviews,
        preview: {
          won_bets_count: wonCount,
          lost_bets_count: lostCount,
          refund_bets_count: noResultCount,
          total_winning_payout: totalWinningPayout,
          total_losing_stake: totalLosingStake,
          total_refunded_amount: totalRefundedAmount,
          total_stake_processed: parseFloat(totalStake.toFixed(2)),
          net_balance_impact: totalWinningPayout
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 12. BET SETTLEMENT: ATOMIC TRANSACTIONAL SETTLEMENT PROCESSING
// =============================================================================
router.post('/settlement/process', async (req, res, next) => {
  const pool = getPool();
  let connection = null;

  try {
    const rawMatchId = req.body.matchId !== undefined ? String(req.body.matchId) : (req.body.match_id !== undefined ? String(req.body.match_id) : '');
    const rawOutcome = req.body.outcome || req.body.declaredOutcome || req.body.declared_outcome;
    const notes = req.body.notes;

    if (!rawMatchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MATCH_ID', message: 'A valid match identifier is required.' }
      });
    }

    if (!rawOutcome || typeof rawOutcome !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_OUTCOME', message: 'Declared outcome selection is required.' }
      });
    }

    const cleanMatchId = rawMatchId.trim();
    const cleanOutcome = rawOutcome.trim();
    const cleanNotes = notes ? String(notes).trim() : null;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Row-lock match to prevent concurrent settlements
    const [matchRows] = await connection.query(
      'SELECT id, match_title, team_one, team_two, status, settled, settled_at FROM matches WHERE id = ? FOR UPDATE',
      [cleanMatchId]
    );

    if (matchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'MATCH_NOT_FOUND', message: `Match "${cleanMatchId}" does not exist.` }
      });
    }

    const match = matchRows[0];
    if (match.settled) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_SETTLED', message: `Match "${match.match_title}" was already settled on ${match.settled_at}. Duplicate settlement prevented.` }
      });
    }

    const validOutcomes = [match.team_one, match.team_two, 'NO_RESULT'];
    if (!validOutcomes.includes(cleanOutcome)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { 
          code: 'OUTCOME_MISMATCH', 
          message: `Outcome must be "${match.team_one}", "${match.team_two}", or "NO_RESULT". Received: "${cleanOutcome}".` 
        }
      });
    }

    // 2. Row-lock eligible pending bets
    const [bets] = await connection.query(
      `SELECT b.id, b.user_id, u.username, b.selection, b.stake, b.odds, b.potential_return
       FROM bets b
       JOIN users u ON u.id = b.user_id
       WHERE b.match_id = ? AND b.settlement_status = 'pending'
       FOR UPDATE`,
      [match.id]
    );

    let wonCount = 0;
    let lostCount = 0;
    let noResultCount = 0;
    let totalStake = 0;
    let totalPayout = 0;

    // 3. Process each bet atomically
    for (const b of bets) {
      const stakeNum = parseFloat(b.stake);
      const potentialRetNum = parseFloat(b.potential_return);
      totalStake += stakeNum;

      let resultStatus = 'lost';
      let payoutAmount = 0.00;

      if (cleanOutcome === 'NO_RESULT') {
        resultStatus = 'no_result';
        payoutAmount = stakeNum; // refund stake
        noResultCount++;
      } else if (b.selection === cleanOutcome) {
        resultStatus = 'won';
        payoutAmount = potentialRetNum;
        wonCount++;
      } else {
        resultStatus = 'lost';
        payoutAmount = 0.00;
        lostCount++;
      }

      totalPayout += payoutAmount;

      // Update bet ticket
      await connection.query(
        `UPDATE bets 
         SET status = ?, settlement_status = 'settled', payout = ?, settled_at = NOW(), settled_by = ? 
         WHERE id = ? AND settlement_status = 'pending'`,
        [resultStatus, payoutAmount, req.user.id, b.id]
      );

      // Update player wallet: release exposure and credit payout if won/refunded
      await connection.query(
        `UPDATE wallets 
         SET available_balance = available_balance + ?,
             exposure_balance = GREATEST(0.00, exposure_balance - ?),
             version = version + 1
         WHERE user_id = ?`,
        [payoutAmount, stakeNum, b.user_id]
      );
    }

    // 4. Update match to settled
    await connection.query(
      `UPDATE matches 
       SET status = 'completed', toss_winner = ?, settled = TRUE, settled_at = NOW(), settled_by = ? 
       WHERE id = ?`,
      [cleanOutcome, req.user.id, match.id]
    );

    // 5. Generate settlement audit record in settlements table
    const crypto = require('crypto');
    const settlementUuid = crypto.randomUUID();

    await connection.query(
      `INSERT INTO settlements 
       (settlement_uuid, match_id, declared_outcome, admin_id, admin_username, total_bets, won_bets, lost_bets, no_result_bets, total_stake, total_payout, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementUuid,
        match.id,
        cleanOutcome,
        req.user.id,
        req.user.username,
        bets.length,
        wonCount,
        lostCount,
        noResultCount,
        totalStake,
        totalPayout,
        cleanNotes
      ]
    );

    // 6. Record administrative audit log
    await connection.query(
      `INSERT INTO admin_audit_logs 
       (admin_id, admin_username, action_type, target_type, target_id, target_identifier, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.user.username,
        'BET_SETTLEMENT',
        'MATCH',
        null,
        match.id,
        JSON.stringify({
          settlementUuid,
          matchId: match.id,
          matchTitle: match.match_title,
          declaredOutcome: cleanOutcome,
          totalBets: bets.length,
          wonCount,
          lostCount,
          noResultCount,
          totalStake,
          totalPayout,
          notes: cleanNotes
        }),
        req.ip || '127.0.0.1'
      ]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Match "${match.match_title}" successfully settled with outcome: ${cleanOutcome}.`,
      data: {
        settlementUuid,
        settlement_uuid: settlementUuid,
        matchId: match.id,
        match_id: match.id,
        matchTitle: match.match_title,
        match_title: match.match_title,
        declaredOutcome: cleanOutcome,
        declared_outcome: cleanOutcome,
        status: 'completed',
        settled: true,
        totalBetsSettled: bets.length,
        bets_settled: bets.length,
        wonCount,
        lostCount,
        noResultCount,
        totalStake: parseFloat(totalStake.toFixed(2)),
        totalPayoutCredited: parseFloat(totalPayout.toFixed(2)),
        settledBy: req.user.username,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {}
    }
    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =============================================================================
// 13. BET SETTLEMENT: GET SETTLEMENT HISTORY
// =============================================================================
router.get('/settlement/history', async (req, res, next) => {
  try {
    const pool = getPool();

    let page = parseInt(req.query.page || '1', 10);
    let limit = parseInt(req.query.limit || '10', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) AS total FROM settlements';
    const dataQuery = `
      SELECT 
        s.id,
        s.settlement_uuid,
        s.match_id,
        m.match_title,
        m.competition,
        s.declared_outcome,
        s.admin_id,
        s.admin_username,
        s.total_bets,
        s.won_bets,
        s.lost_bets,
        s.no_result_bets,
        s.total_stake,
        s.total_payout,
        s.notes,
        s.created_at
      FROM settlements s
      LEFT JOIN matches m ON m.id = s.match_id
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ? OFFSET ?
    `;

    const [ [[countResult]], [rows] ] = await Promise.all([
      pool.query(countQuery),
      pool.query(dataQuery, [limit, offset])
    ]);

    const total = parseInt(countResult.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    const formattedHistory = rows.map(r => ({
      id: r.id,
      settlementUuid: r.settlement_uuid,
      settlement_uuid: r.settlement_uuid,
      matchId: r.match_id,
      match_id: r.match_id,
      matchTitle: r.match_title || r.match_id,
      match_title: r.match_title || r.match_id,
      competition: r.competition || 'Cricket Toss',
      declaredOutcome: r.declared_outcome,
      declared_outcome: r.declared_outcome,
      adminId: r.admin_id,
      admin_id: r.admin_id,
      adminUsername: r.admin_username,
      admin_username: r.admin_username,
      settled_by_username: r.admin_username,
      settled_by_admin_id: r.admin_id,
      settled_at: r.created_at,
      totalBets: parseInt(r.total_bets || 0, 10),
      bets_settled: parseInt(r.total_bets || 0, 10),
      wonBets: parseInt(r.won_bets || 0, 10),
      won_count: parseInt(r.won_bets || 0, 10),
      lostBets: parseInt(r.lost_bets || 0, 10),
      lost_count: parseInt(r.lost_bets || 0, 10),
      noResultBets: parseInt(r.no_result_bets || 0, 10),
      refund_count: parseInt(r.no_result_bets || 0, 10),
      totalStake: parseFloat(r.total_stake || 0),
      total_stake: parseFloat(r.total_stake || 0),
      totalPayout: parseFloat(r.total_payout || 0),
      total_payout: parseFloat(r.total_payout || 0),
      notes: r.notes,
      createdAt: r.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        settlements: formattedHistory,
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

/**
 * ============================================================================
 * PLAYER COIN MANAGEMENT ROUTES (Admin Player Balance Operations)
 * ============================================================================
 */

/**
 * GET /api/admin/coins/search
 * Search for players by username (exact or partial match)
 */
router.get('/coins/search', async (req, res, next) => {
  try {
    const rawUsername = (req.query.username || '').trim();
    if (!rawUsername) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide a username to search.'
        }
      });
    }

    const pool = getPool();
    // Case-insensitive match, order by exact match first, then alphabetically
    const [players] = await pool.query(
      `SELECT 
        u.id,
        u.uuid,
        u.username,
        u.full_name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.created_at,
        COALESCE(w.available_balance, 0.00) AS available_balance,
        COALESCE(w.exposure_balance, 0.00) AS exposure_balance,
        COALESCE(w.currency, 'INR') AS currency
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE LOWER(u.username) LIKE LOWER(?)
       ORDER BY (LOWER(u.username) = LOWER(?)) DESC, u.username ASC
       LIMIT 50`,
      [`%${rawUsername}%`, rawUsername]
    );

    const formatted = players.map(p => ({
      id: p.id,
      uuid: p.uuid,
      username: p.username,
      fullName: p.full_name,
      email: p.email,
      phone: p.phone,
      role: p.role,
      status: p.status,
      createdAt: p.created_at,
      available_balance: parseFloat(p.available_balance || 0),
      exposure_balance: parseFloat(p.exposure_balance || 0),
      currency: p.currency
    }));

    return res.status(200).json({
      success: true,
      data: {
        players: formatted,
        count: formatted.length,
        query: rawUsername
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/coins/players/:id
 * Retrieve selected player's authoritative account details and latest coin balance
 */
router.get('/coins/players/:id', async (req, res, next) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    if (!playerId || isNaN(playerId) || playerId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid player ID provided.'
        }
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        u.id,
        u.uuid,
        u.username,
        u.full_name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.created_at,
        COALESCE(w.available_balance, 0.00) AS available_balance,
        COALESCE(w.exposure_balance, 0.00) AS exposure_balance,
        COALESCE(w.currency, 'INR') AS currency
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = ?
       LIMIT 1`,
      [playerId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Player with ID ${playerId} not found.`
        }
      });
    }

    const p = rows[0];
    return res.status(200).json({
      success: true,
      data: {
        player: {
          id: p.id,
          uuid: p.uuid,
          username: p.username,
          fullName: p.full_name,
          email: p.email,
          phone: p.phone,
          role: p.role,
          status: p.status,
          createdAt: p.created_at,
          available_balance: parseFloat(p.available_balance || 0),
          exposure_balance: parseFloat(p.exposure_balance || 0),
          currency: p.currency
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/coins/adjust
 * Add or deduct coins from a player's account atomically with idempotency protection
 */
router.post('/coins/adjust', async (req, res, next) => {
  const pool = getPool();
  let connection = null;

  try {
    const { userId, actionType, amount, reason, idempotencyKey } = req.body || {};

    // 1. Validate inputs
    const parsedUserId = parseInt(userId, 10);
    if (!parsedUserId || isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid player ID is required.'
        }
      });
    }

    if (!['ADMIN_CREDIT', 'ADMIN_DEBIT'].includes(actionType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: "Action type must be either 'ADMIN_CREDIT' or 'ADMIN_DEBIT'."
        }
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Adjustment amount must be a positive number greater than zero.'
        }
      });
    }

    // Limit precision to 2 decimal places
    const cleanAmount = Math.round(parsedAmount * 100) / 100;
    if (cleanAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Adjustment amount must be at least 0.01 coins.'
        }
      });
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 3) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A clear reason or note (minimum 3 characters) is required for every balance adjustment.'
        }
      });
    }

    const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : null;

    // 2. Check for duplicate idempotent submission
    if (cleanIdempotencyKey) {
      const [existing] = await pool.query(
        `SELECT * FROM coin_transactions WHERE idempotency_key = ? LIMIT 1`,
        [cleanIdempotencyKey]
      );
      if (existing.length > 0) {
        const tx = existing[0];
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_REQUEST',
            message: 'Duplicate adjustment prevented. This transaction was already processed.',
            data: {
              transactionUuid: tx.transaction_uuid,
              actionType: tx.action_type,
              amount: parseFloat(tx.amount),
              balanceBefore: parseFloat(tx.balance_before),
              balanceAfter: parseFloat(tx.balance_after),
              createdAt: tx.created_at
            }
          }
        });
      }
    }

    // 3. Begin atomic transaction with row locking
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock player wallet row FOR UPDATE
    const [userRows] = await connection.query(
      `SELECT u.id, u.username, u.status, w.available_balance, w.exposure_balance
       FROM users u
       JOIN wallets w ON u.id = w.user_id
       WHERE u.id = ?
       FOR UPDATE`,
      [parsedUserId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Player with ID ${parsedUserId} does not exist.`
        }
      });
    }

    const player = userRows[0];
    const currentBalance = parseFloat(player.available_balance || 0);
    let newBalance;

    if (actionType === 'ADMIN_DEBIT') {
      if (currentBalance < cleanAmount) {
        await connection.rollback();
        connection.release();
        connection = null;
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: `Insufficient balance: Player ${player.username} has ${currentBalance.toFixed(2)} coins available, cannot deduct ${cleanAmount.toFixed(2)} coins.`
          }
        });
      }
      newBalance = Math.round((currentBalance - cleanAmount) * 100) / 100;
    } else {
      newBalance = Math.round((currentBalance + cleanAmount) * 100) / 100;
    }

    // Update wallet available_balance
    await connection.query(
      `UPDATE wallets 
       SET available_balance = ?, version = version + 1
       WHERE user_id = ?`,
      [newBalance, parsedUserId]
    );

    // Record adjustment in coin_transactions
    const crypto = require('crypto');
    const transactionUuid = crypto.randomUUID();

    await connection.query(
      `INSERT INTO coin_transactions 
       (transaction_uuid, user_id, username, admin_id, admin_username, action_type, amount, balance_before, balance_after, reason, idempotency_key, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [
        transactionUuid,
        parsedUserId,
        player.username,
        req.user.id,
        req.user.username,
        actionType,
        cleanAmount,
        currentBalance,
        newBalance,
        cleanReason,
        cleanIdempotencyKey
      ]
    );

    // Commit database changes
    await connection.commit();
    connection.release();
    connection = null;

    // Record audit log entry
    await logAdminAction(
      req.user,
      actionType,
      'user_wallet',
      parsedUserId,
      player.username,
      {
        actionType,
        amount: cleanAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        reason: cleanReason,
        transactionUuid
      },
      req.ip
    );

    const message = `Coins ${actionType === 'ADMIN_CREDIT' ? 'added' : 'deducted'} successfully. Updated balance: ${newBalance.toFixed(2)}`;

    return res.status(200).json({
      success: true,
      message,
      data: {
        transactionUuid,
        userId: parsedUserId,
        username: player.username,
        actionType,
        amount: cleanAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        reason: cleanReason,
        adminUsername: req.user.username,
        createdAt: new Date()
      }
    });

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {}
      connection.release();
    }
    next(err);
  }
});

/**
 * GET /api/admin/coins/history
 * Paginated list of coin adjustments with filtering support
 */
router.get('/coins/history', async (req, res, next) => {
  try {
    const pool = getPool();
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
    const offset = (page - 1) * limit;

    const usernameFilter = (req.query.username || '').trim();
    const actionFilter = (req.query.actionType || req.query.action || '').trim().toUpperCase();
    const userIdFilter = parseInt(req.query.userId, 10);
    const startDate = (req.query.startDate || '').trim();
    const endDate = (req.query.endDate || '').trim();

    let whereConditions = ['1=1'];
    const queryParams = [];

    if (userIdFilter && !isNaN(userIdFilter) && userIdFilter > 0) {
      whereConditions.push('ct.user_id = ?');
      queryParams.push(userIdFilter);
    } else if (usernameFilter) {
      whereConditions.push('LOWER(ct.username) LIKE LOWER(?)');
      queryParams.push(`%${usernameFilter}%`);
    }

    if (actionFilter && ['ADMIN_CREDIT', 'ADMIN_DEBIT'].includes(actionFilter)) {
      whereConditions.push('ct.action_type = ?');
      queryParams.push(actionFilter);
    }

    if (startDate) {
      whereConditions.push('ct.created_at >= ?');
      queryParams.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      whereConditions.push('ct.created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count total matching adjustments
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM coin_transactions ct WHERE ${whereClause}`,
      queryParams
    );

    // Fetch adjustment records
    const [rows] = await pool.query(
      `SELECT 
        ct.id,
        ct.transaction_uuid,
        ct.user_id,
        ct.username,
        ct.admin_id,
        ct.admin_username,
        ct.action_type,
        ct.amount,
        ct.balance_before,
        ct.balance_after,
        ct.reason,
        ct.status,
        ct.created_at
       FROM coin_transactions ct
       WHERE ${whereClause}
       ORDER BY ct.created_at DESC, ct.id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const formattedHistory = rows.map(r => ({
      id: r.id,
      transactionUuid: r.transaction_uuid,
      transaction_uuid: r.transaction_uuid,
      userId: r.user_id,
      user_id: r.user_id,
      username: r.username,
      adminId: r.admin_id,
      admin_id: r.admin_id,
      adminUsername: r.admin_username,
      admin_username: r.admin_username,
      actionType: r.action_type,
      action_type: r.action_type,
      amount: parseFloat(r.amount || 0),
      balanceBefore: parseFloat(r.balance_before || 0),
      balance_before: parseFloat(r.balance_before || 0),
      balanceAfter: parseFloat(r.balance_after || 0),
      balance_after: parseFloat(r.balance_after || 0),
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      created_at: r.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        history: formattedHistory,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

