const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const origPath = path.resolve(__dirname, 'sql/ironman_toss_book.sql');
const origDownloadsPath = 'C:\\Users\\NARENDRA\\Downloads\\ironman_toss_book.sql';
const fixedPath = path.resolve(__dirname, 'sql/daddy_toss_book_aiven_fixed.sql');
const fixedDownloadsPath = 'C:\\Users\\NARENDRA\\Downloads\\daddy_toss_book_aiven_fixed.sql';

const origSql = fs.readFileSync(origPath, 'utf8');
const fixedSql = fs.readFileSync(fixedPath, 'utf8');

console.log('====================================================');
console.log('SQL DUMP PROGRAMMATIC VALIDATION SUITE (AIVEN MYSQL 8.4)');
console.log('====================================================');

let passedChecks = 0;
let totalChecks = 0;

function assertCheck(desc, condition) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${desc}`);
  } else {
    console.error(`  [FAIL] ${desc}`);
  }
}

// 1. Output file exists and has non-zero size
assertCheck('Output file exists in workspace', fs.existsSync(fixedPath) && fs.statSync(fixedPath).size > 0);
assertCheck('Output file exists in Downloads folder', fs.existsSync(fixedDownloadsPath) && fs.statSync(fixedDownloadsPath).size > 0);

// 2. Original backup has not been modified
const origDownloadsContent = fs.readFileSync(origDownloadsPath, 'utf8');
const origHash = crypto.createHash('sha256').update(origSql).digest('hex');
const downloadsOrigHash = crypto.createHash('sha256').update(origDownloadsContent).digest('hex');
assertCheck('Original backup in Downloads is completely untouched (SHA256 match)', origHash === downloadsOrigHash);

// 3. Every expected table is present (all 10 tables)
const expectedTables = [
  'admin_audit_logs',
  'bets',
  'coin_transactions',
  'idempotency_records',
  'matches',
  'sessions',
  'settlements',
  'users',
  'user_preferences',
  'wallets'
];

expectedTables.forEach(t => {
  const tableCreated = fixedSql.includes(`CREATE TABLE \`${t}\``);
  assertCheck(`Table \`${t}\` is defined in CREATE TABLE`, tableCreated);
});

// 4. Every table has a PRIMARY KEY in its initial CREATE TABLE statement
expectedTables.forEach(t => {
  const createTableRegex = new RegExp(`CREATE TABLE \\\`${t}\\\`\\s*\\([\\s\\S]*?\\)\\s*ENGINE=InnoDB`, 'i');
  const match = fixedSql.match(createTableRegex);
  const hasPk = match && match[0].includes('PRIMARY KEY (`id`)');
  assertCheck(`Table \`${t}\` initial CREATE TABLE has PRIMARY KEY (\`id\`)`, Boolean(hasPk));
});

// 5. No duplicate primary key definitions (No "ADD PRIMARY KEY" in ALTER TABLE)
const addPkCount = (fixedSql.match(/ADD PRIMARY KEY/gi) || []).length;
assertCheck(`No redundant ADD PRIMARY KEY statements remain (found: ${addPkCount})`, addPkCount === 0);

// 6. String-based bets.id and matches.id remain strings (VARCHAR(50)) and NOT auto-increment
const betsCreate = fixedSql.match(/CREATE TABLE `bets`\s*\([\s\S]*?\)\s*ENGINE=InnoDB/i)[0];
const matchesCreate = fixedSql.match(/CREATE TABLE `matches`\s*\([\s\S]*?\)\s*ENGINE=InnoDB/i)[0];
assertCheck('bets.id is VARCHAR(50) NOT NULL without AUTO_INCREMENT', betsCreate.includes('`id` varchar(50) NOT NULL') && !betsCreate.includes('`id` varchar(50) NOT NULL AUTO_INCREMENT'));
assertCheck('matches.id is VARCHAR(50) NOT NULL without AUTO_INCREMENT', matchesCreate.includes('`id` varchar(50) NOT NULL') && !matchesCreate.includes('`id` varchar(50) NOT NULL AUTO_INCREMENT'));

// 7. Integer ID tables have AUTO_INCREMENT in CREATE TABLE
const intIdTables = ['admin_audit_logs', 'coin_transactions', 'idempotency_records', 'sessions', 'settlements', 'users', 'user_preferences', 'wallets'];
intIdTables.forEach(t => {
  const tCreate = fixedSql.match(new RegExp(`CREATE TABLE \\\`${t}\\\`\\s*\\([\\s\\S]*?\\)\\s*ENGINE=InnoDB`, 'i'))[0];
  const hasAi = tCreate.includes('`id` int(11) NOT NULL AUTO_INCREMENT');
  assertCheck(`Table \`${t}\` has AUTO_INCREMENT in initial CREATE TABLE`, hasAi);
});

// 8. All original INSERT INTO statements and records are preserved
const origInserts = origSql.match(/INSERT INTO `[^`]+`[\s\S]*?;/gi) || [];
const fixedInserts = fixedSql.match(/INSERT INTO `[^`]+`[\s\S]*?;/gi) || [];
assertCheck(`All INSERT INTO statements preserved (${origInserts.length} total blocks)`, origInserts.length === fixedInserts.length);

origInserts.forEach((ins, idx) => {
  const tableNameMatch = ins.match(/INSERT INTO `([^`]+)`/i);
  const tbl = tableNameMatch ? tableNameMatch[1] : `block #${idx}`;
  assertCheck(`INSERT block for \`${tbl}\` matches verbatim`, fixedSql.includes(ins.trim()));
});

// 9. Existing explicit IDs remain unchanged
// Users: admin (id: 6), dtb1 (id: 1084)
assertCheck('User admin (id: 6) record preserved', fixedSql.includes("(6, 'bedb61b9-fed2-4c43-b153-8ae9043550a8', 'System Administrator', 'admin'"));
assertCheck('User dtb1 (id: 1084) record preserved', fixedSql.includes("(1084, '69fafd69-cdef-11f1-8a1b-7c10c9ae16ae', 'mohit sonawane', 'dtb1'"));

// Wallets: admin (id: 6, user_id: 6, 0.00), dtb1 (id: 1084, user_id: 1084, 1000.00)
assertCheck('Wallet for admin preserved (0.00)', fixedSql.includes("(6, 6, 0.00, 0.00, 'INR', 1"));
assertCheck('Wallet for dtb1 preserved (1000.00)', fixedSql.includes("(1084, 1084, 1000.00, 0.00, 'INR', 1"));

// 10. Foreign-key constraints remain present
const origFks = origSql.match(/ADD CONSTRAINT `[^`]+` FOREIGN KEY/gi) || [];
const fixedFks = fixedSql.match(/ADD CONSTRAINT `[^`]+` FOREIGN KEY/gi) || [];
assertCheck(`All foreign keys preserved (${origFks.length} constraints)`, origFks.length === fixedFks.length && origFks.length === 12);

// 11. Required unique and normal indexes remain present
const origIndexes = origSql.match(/ADD (UNIQUE )?KEY `[^`]+`/gi) || [];
const fixedIndexes = fixedSql.match(/ADD (UNIQUE )?KEY `[^`]+`/gi) || [];
assertCheck(`All unique and secondary indexes preserved (${origIndexes.length} indexes)`, origIndexes.length === fixedIndexes.length);

// 12. AUTO_INCREMENT values remain valid
const autoIncMatches = fixedSql.match(/AUTO_INCREMENT=\d+/gi) || [];
assertCheck(`All 8 AUTO_INCREMENT values preserved`, autoIncMatches.length === 8);

console.log('====================================================');
console.log(`VALIDATION RESULTS: ${passedChecks} / ${totalChecks} CHECKS PASSED (${Math.round((passedChecks / totalChecks) * 100)}%)`);
console.log('====================================================');

if (passedChecks === totalChecks) {
  process.exit(0);
} else {
  process.exit(1);
}
