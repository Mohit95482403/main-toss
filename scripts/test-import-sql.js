const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('../backend/src/config/db');

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const nextCh = i + 1 < sql.length ? sql[i + 1] : '';

    // Handle line comments (-- )
    if (!inString && !inBlockComment && ch === '-' && nextCh === '-') {
      inLineComment = true;
      i++; // skip next -
      continue;
    }
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    // Handle block comments (/* */)
    if (!inString && !inLineComment && ch === '/' && nextCh === '*') {
      // Check for conditional comments /*! ... */ which are valid SQL in MySQL
      if (i + 2 < sql.length && sql[i + 2] === '!') {
        // Keep conditional comments as part of SQL!
      } else {
        inBlockComment = true;
        i++;
        continue;
      }
    }
    if (inBlockComment) {
      if (ch === '*' && nextCh === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // Handle string literals
    if ((ch === "'" || ch === '"') && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = ch;
      } else if (stringChar === ch) {
        inString = false;
      }
    }

    // Handle statement separator
    if (ch === ';' && !inString) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed.length > 0) {
    statements.push(finalTrimmed);
  }

  return statements;
}

async function testSqlImport() {
  console.log('[TEST IMPORT] Connecting to local server...');
  const pool = getPool();
  const testDb = 'test_aiven_sql_check_' + Date.now();

  try {
    console.log(`[TEST IMPORT] Creating temporary test database: \`${testDb}\`...`);
    await pool.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    const sqlFilePath = path.resolve(__dirname, 'sql/daddy_toss_book_aiven_fixed.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    const statements = splitSqlStatements(sqlContent);
    console.log(`[TEST IMPORT] Correctly parsed ${statements.length} distinct SQL statements.`);

    const conn = await pool.getConnection();
    await conn.query(`USE \`${testDb}\``);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await conn.query(stmt);
      } catch (stmtErr) {
        console.error(`[TEST IMPORT ERROR] Statement #${i + 1} failed:`);
        console.error(stmt.substring(0, 300) + '...');
        console.error('Error details:', stmtErr.message);
        throw stmtErr;
      }
    }

    console.log('[TEST IMPORT] All statements executed successfully without error!');

    // Verify imported tables
    const [tables] = await conn.query('SHOW TABLES');
    console.log(`[TEST IMPORT] Verified ${tables.length} tables created:`, tables.map(r => Object.values(r)[0]));

    // Verify user records
    const [users] = await conn.query('SELECT id, username, role FROM users');
    console.log('[TEST IMPORT] Verified users in test database:');
    users.forEach(u => console.log(`   - ID: ${u.id}, Username: ${u.username}, Role: ${u.role}`));

    // Verify wallets
    const [wallets] = await conn.query('SELECT id, user_id, available_balance FROM wallets');
    console.log('[TEST IMPORT] Verified wallets in test database:');
    wallets.forEach(w => console.log(`   - ID: ${w.id}, User ID: ${w.user_id}, Balance: ${w.available_balance}`));

    // Verify primary keys
    for (const tbl of tables.map(r => Object.values(r)[0])) {
      const [keys] = await conn.query(`SHOW KEYS FROM \`${tbl}\` WHERE Key_name = 'PRIMARY'`);
      console.log(`   - Table \`${tbl}\`: PRIMARY KEY (${keys.map(k => k.Column_name).join(', ')})`);
    }

    conn.release();

    // Clean up temporary database
    console.log(`[TEST IMPORT] Cleaning up temporary test database \`${testDb}\`...`);
    await pool.query(`DROP DATABASE \`${testDb}\``);
    console.log('[TEST IMPORT] Temporary database dropped cleanly.');

    console.log('====================================================');
    console.log('SQL DUMP DRY-RUN IMPORT PASSED WITH 100% SUCCESS!');
    console.log('====================================================');
  } catch (err) {
    console.error('[TEST IMPORT FAILED]', err.message);
    try {
      await pool.query(`DROP DATABASE IF EXISTS \`${testDb}\``);
    } catch (e) {}
    process.exit(1);
  } finally {
    await closePool();
  }
}

testSqlImport();
