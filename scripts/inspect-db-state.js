const { getPool } = require('../backend/src/config/db');

async function inspect() {
  const pool = getPool();
  
  const [users] = await pool.query('SELECT id, username, role, full_name, email, created_at FROM users ORDER BY id ASC');
  console.log(`TOTAL USERS: ${users.length}`);
  
  console.log('--- ALL USERS ---');
  for (const u of users) {
    console.log(`User #${u.id} | username: ${u.username} | role: ${u.role} | name: ${u.full_name} | email: ${u.email}`);
  }

  const [matches] = await pool.query('SELECT id, competition, match_title, team_one, team_two, status, settled, created_at FROM matches ORDER BY created_at DESC');
  console.log(`\nTOTAL MATCHES: ${matches.length}`);
  for (const m of matches.slice(0, 10)) {
    console.log(`Match ${m.id} | ${m.match_title} | status: ${m.status} | settled: ${m.settled}`);
  }
  if (matches.length > 10) {
    console.log(`... and ${matches.length - 10} more matches`);
  }

  const [bets] = await pool.query('SELECT COUNT(*) as cnt FROM bets');
  console.log(`\nTOTAL BETS: ${bets[0].cnt}`);

  const [txs] = await pool.query('SELECT COUNT(*) as cnt FROM coin_transactions');
  console.log(`TOTAL TRANSACTIONS: ${txs[0].cnt}`);

  const [settlements] = await pool.query('SELECT COUNT(*) as cnt FROM settlements');
  console.log(`TOTAL SETTLEMENTS: ${settlements[0].cnt}`);

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
