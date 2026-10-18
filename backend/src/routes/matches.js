/**
 * IRONMAN TOSS BOOK - Public Matches API Router
 * Retrieves authentic match fixtures, toss odds, and categories directly from MySQL database.
 */

const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

/**
 * GET /api/matches
 * Returns authentic sporting fixtures from MySQL database with category filtering and dynamic counts.
 */
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const category = (req.query.category || 'all').trim().toLowerCase();
    const search = (req.query.search || '').trim();

    // 1. Calculate real-time counts for active/eligible matches from MySQL (excluding expired matches)
    const [[countsRow]] = await pool.query(`
      SELECT
        COUNT(CASE WHEN status IN ('live', 'upcoming') AND (settled = 0 OR settled IS FALSE) AND (match_end_time IS NULL OR match_end_time > UTC_TIMESTAMP() OR match_end_time > NOW()) THEN 1 END) AS totalAll,
        SUM(CASE WHEN status = 'live' AND (settled = 0 OR settled IS FALSE) AND (match_end_time IS NULL OR match_end_time > UTC_TIMESTAMP() OR match_end_time > NOW()) THEN 1 ELSE 0 END) AS totalLive,
        SUM(CASE WHEN status = 'upcoming' AND (settled = 0 OR settled IS FALSE) AND (match_end_time IS NULL OR match_end_time > UTC_TIMESTAMP() OR match_end_time > NOW()) THEN 1 ELSE 0 END) AS totalUpcoming
      FROM matches
      WHERE status IN ('live', 'upcoming') AND (settled = 0 OR settled IS FALSE)
        AND (match_end_time IS NULL OR match_end_time > UTC_TIMESTAMP() OR match_end_time > NOW())
    `);

    const counts = {
      all: parseInt(countsRow?.totalAll || 0, 10),
      live: parseInt(countsRow?.totalLive || 0, 10),
      upcoming: parseInt(countsRow?.totalUpcoming || 0, 10),
      completed: 0
    };

    // 2. Build parameterized query for fixtures
    // Mandatory filter: ONLY active, unsettled, UNEXPIRED matches are eligible for the user's Home page
    const whereClauses = [
      "(match_end_time IS NULL OR match_end_time > UTC_TIMESTAMP() OR match_end_time > NOW())"
    ];
    const queryParams = [];

    if (category === 'live') {
      whereClauses.push("status = 'live'", "(settled = 0 OR settled IS FALSE)");
    } else if (category === 'upcoming') {
      whereClauses.push("status = 'upcoming'", "(settled = 0 OR settled IS FALSE)");
    } else if (category === 'completed') {
      // Completed matches are archived and excluded from the user Home page
      whereClauses.push("1 = 0");
    } else {
      // Default: 'all' eligible active matches (upcoming or live, unsettled)
      whereClauses.push("status IN ('live', 'upcoming')", "(settled = 0 OR settled IS FALSE)");
    }

    if (search.length > 0) {
      whereClauses.push('(match_title LIKE ? OR competition LIKE ? OR team_one LIKE ? OR team_two LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
        id,
        competition,
        stage,
        match_title,
        team_one,
        team_one_abbr,
        team_one_rate,
        team_one_logo,
        team_two,
        team_two_abbr,
        team_two_rate,
        team_two_logo,
        scheduled_time,
        match_end_time,
        venue,
        status,
        toss_winner,
        settled,
        settled_at,
        created_at
       FROM matches
       ${whereSql}
       ORDER BY
         CASE WHEN status = 'live' THEN 1 WHEN status = 'upcoming' THEN 2 ELSE 3 END,
         created_at DESC,
         match_end_time ASC`,
      queryParams
    );

    const matches = rows.map((m) => ({
      id: m.id,
      competition: m.competition,
      stage: m.stage || 'Fixture',
      matchTitle: m.match_title,
      teamOne: m.team_one,
      teamOneAbbr: m.team_one_abbr || m.team_one.substring(0, 3).toUpperCase(),
      teamOneRate: parseFloat(m.team_one_rate || 1.90),
      teamOneLogo: m.team_one_logo || null,
      team_one_logo: m.team_one_logo || null,
      teamTwo: m.team_two,
      teamTwoAbbr: m.team_two_abbr || m.team_two.substring(0, 3).toUpperCase(),
      teamTwoRate: parseFloat(m.team_two_rate || 1.90),
      teamTwoLogo: m.team_two_logo || null,
      team_two_logo: m.team_two_logo || null,
      scheduledTime: m.scheduled_time || 'Schedule TBA',
      matchEndTime: m.match_end_time,
      match_end_time: m.match_end_time,
      isExpired: Boolean(m.match_end_time && new Date(m.match_end_time).getTime() <= Date.now()),
      venue: m.venue || 'Venue TBA',
      status: m.status,
      tossWinner: m.toss_winner,
      settled: Boolean(m.settled),
      settledAt: m.settled_at,
      createdAt: m.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        matches,
        counts
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/matches/:id
 * Retrieves single match fixture by ID directly from MySQL.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const matchId = (req.params.id || '').trim();
    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Match identifier is required.' }
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        id, competition, stage, match_title, team_one, team_one_abbr, team_one_rate, team_one_logo,
        team_two, team_two_abbr, team_two_rate, team_two_logo, scheduled_time, match_end_time, venue, status,
        toss_winner, settled, settled_at, created_at
       FROM matches
       WHERE id = ?
       LIMIT 1`,
      [matchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found in database.' }
      });
    }

    const m = rows[0];
    return res.status(200).json({
      success: true,
      data: {
        id: m.id,
        competition: m.competition,
        stage: m.stage || 'Fixture',
        matchTitle: m.match_title,
        teamOne: m.team_one,
        teamOneAbbr: m.team_one_abbr || m.team_one.substring(0, 3).toUpperCase(),
        teamOneRate: parseFloat(m.team_one_rate || 1.90),
        teamOneLogo: m.team_one_logo || null,
        team_one_logo: m.team_one_logo || null,
        teamTwo: m.team_two,
        teamTwoAbbr: m.team_two_abbr || m.team_two.substring(0, 3).toUpperCase(),
        teamTwoRate: parseFloat(m.team_two_rate || 1.90),
        teamTwoLogo: m.team_two_logo || null,
        team_two_logo: m.team_two_logo || null,
        scheduledTime: m.scheduled_time || 'Schedule TBA',
        matchEndTime: m.match_end_time,
        match_end_time: m.match_end_time,
        isExpired: Boolean(m.match_end_time && new Date(m.match_end_time).getTime() <= Date.now()),
        venue: m.venue || 'Venue TBA',
        status: m.status,
        tossWinner: m.toss_winner,
        settled: Boolean(m.settled),
        settledAt: m.settled_at,
        createdAt: m.created_at
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
