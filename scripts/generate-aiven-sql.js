const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, 'sql/ironman_toss_book.sql');
const destWorkspace = path.resolve(__dirname, 'sql/daddy_toss_book_aiven_fixed.sql');
const destDownloads = 'C:\\Users\\NARENDRA\\Downloads\\daddy_toss_book_aiven_fixed.sql';

console.log('[1/5] Reading original SQL file:', srcPath);
const originalContent = fs.readFileSync(srcPath, 'utf8');

// The 10 tables to correct:
// Integer IDs: admin_audit_logs, coin_transactions, idempotency_records, sessions, settlements, users, user_preferences, wallets
// String IDs: bets, matches

let content = originalContent;

// Ensure FOREIGN_KEY_CHECKS = 0 at start and 1 at end
if (!content.includes('FOREIGN_KEY_CHECKS')) {
  content = content.replace(
    'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";\nSTART TRANSACTION;',
    'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";\nSET FOREIGN_KEY_CHECKS = 0;\nSTART TRANSACTION;'
  );
  content = content.replace(
    'COMMIT;\n\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;',
    'SET FOREIGN_KEY_CHECKS = 1;\nCOMMIT;\n\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;'
  );
}

// 1. admin_audit_logs
content = content.replace(
`CREATE TABLE \`admin_audit_logs\` (
  \`id\` int(11) NOT NULL,
  \`admin_id\` int(11) NOT NULL,
  \`admin_username\` varchar(50) NOT NULL,
  \`action_type\` varchar(50) NOT NULL,
  \`target_type\` varchar(50) NOT NULL,
  \`target_id\` int(11) DEFAULT NULL,
  \`target_identifier\` varchar(100) DEFAULT NULL,
  \`details\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`details\`)),
  \`ip_address\` varchar(45) DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`admin_audit_logs\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`admin_id\` int(11) NOT NULL,
  \`admin_username\` varchar(50) NOT NULL,
  \`action_type\` varchar(50) NOT NULL,
  \`target_type\` varchar(50) NOT NULL,
  \`target_id\` int(11) DEFAULT NULL,
  \`target_identifier\` varchar(100) DEFAULT NULL,
  \`details\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`details\`)),
  \`ip_address\` varchar(45) DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 2. bets (String ID varchar(50))
content = content.replace(
`CREATE TABLE \`bets\` (
  \`id\` varchar(50) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`match_id\` varchar(50) NOT NULL,
  \`market_name\` varchar(100) NOT NULL DEFAULT 'Toss Winner',
  \`selection\` varchar(100) NOT NULL,
  \`stake\` decimal(12,2) NOT NULL,
  \`odds\` decimal(5,2) NOT NULL,
  \`potential_return\` decimal(12,2) NOT NULL,
  \`status\` enum('pending','live','won','lost','no_result','cancelled') NOT NULL DEFAULT 'live',
  \`settlement_status\` enum('pending','settled','cancelled','reversed') NOT NULL DEFAULT 'pending',
  \`settlement_version\` int(11) DEFAULT NULL,
  \`idempotency_key\` varchar(150) DEFAULT NULL,
  \`payout\` decimal(12,2) DEFAULT 0.00,
  \`refund_amount\` decimal(12,2) DEFAULT 0.00,
  \`settled_at\` timestamp NULL DEFAULT NULL,
  \`settled_by\` int(11) DEFAULT NULL,
  \`cancelled_at\` timestamp NULL DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`bets\` (
  \`id\` varchar(50) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`match_id\` varchar(50) NOT NULL,
  \`market_name\` varchar(100) NOT NULL DEFAULT 'Toss Winner',
  \`selection\` varchar(100) NOT NULL,
  \`stake\` decimal(12,2) NOT NULL,
  \`odds\` decimal(5,2) NOT NULL,
  \`potential_return\` decimal(12,2) NOT NULL,
  \`status\` enum('pending','live','won','lost','no_result','cancelled') NOT NULL DEFAULT 'live',
  \`settlement_status\` enum('pending','settled','cancelled','reversed') NOT NULL DEFAULT 'pending',
  \`settlement_version\` int(11) DEFAULT NULL,
  \`idempotency_key\` varchar(150) DEFAULT NULL,
  \`payout\` decimal(12,2) DEFAULT 0.00,
  \`refund_amount\` decimal(12,2) DEFAULT 0.00,
  \`settled_at\` timestamp NULL DEFAULT NULL,
  \`settled_by\` int(11) DEFAULT NULL,
  \`cancelled_at\` timestamp NULL DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 3. coin_transactions
content = content.replace(
`CREATE TABLE \`coin_transactions\` (
  \`id\` int(11) NOT NULL,
  \`transaction_uuid\` varchar(36) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`username\` varchar(30) NOT NULL,
  \`admin_id\` int(11) DEFAULT NULL,
  \`admin_username\` varchar(50) DEFAULT NULL,
  \`action_type\` varchar(50) NOT NULL,
  \`amount\` decimal(12,2) NOT NULL,
  \`balance_before\` decimal(12,2) NOT NULL,
  \`balance_after\` decimal(12,2) NOT NULL,
  \`reason\` varchar(255) NOT NULL,
  \`metadata\` longtext DEFAULT NULL,
  \`bet_id\` varchar(50) DEFAULT NULL,
  \`match_id\` varchar(50) DEFAULT NULL,
  \`settlement_uuid\` varchar(50) DEFAULT NULL,
  \`related_transaction_id\` varchar(64) DEFAULT NULL,
  \`idempotency_key\` varchar(100) DEFAULT NULL,
  \`status\` enum('completed','failed') NOT NULL DEFAULT 'completed',
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`coin_transactions\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`transaction_uuid\` varchar(36) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`username\` varchar(30) NOT NULL,
  \`admin_id\` int(11) DEFAULT NULL,
  \`admin_username\` varchar(50) DEFAULT NULL,
  \`action_type\` varchar(50) NOT NULL,
  \`amount\` decimal(12,2) NOT NULL,
  \`balance_before\` decimal(12,2) NOT NULL,
  \`balance_after\` decimal(12,2) NOT NULL,
  \`reason\` varchar(255) NOT NULL,
  \`metadata\` longtext DEFAULT NULL,
  \`bet_id\` varchar(50) DEFAULT NULL,
  \`match_id\` varchar(50) DEFAULT NULL,
  \`settlement_uuid\` varchar(50) DEFAULT NULL,
  \`related_transaction_id\` varchar(64) DEFAULT NULL,
  \`idempotency_key\` varchar(100) DEFAULT NULL,
  \`status\` enum('completed','failed') NOT NULL DEFAULT 'completed',
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 4. idempotency_records
content = content.replace(
`CREATE TABLE \`idempotency_records\` (
  \`id\` int(11) NOT NULL,
  \`idempotency_key\` varchar(150) NOT NULL,
  \`user_id\` int(11) DEFAULT NULL,
  \`scope\` varchar(50) NOT NULL,
  \`request_hash\` varchar(64) NOT NULL,
  \`status\` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  \`response_status\` int(11) DEFAULT NULL,
  \`response_body\` mediumtext DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  \`expires_at\` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`idempotency_records\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`idempotency_key\` varchar(150) NOT NULL,
  \`user_id\` int(11) DEFAULT NULL,
  \`scope\` varchar(50) NOT NULL,
  \`request_hash\` varchar(64) NOT NULL,
  \`status\` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  \`response_status\` int(11) DEFAULT NULL,
  \`response_body\` mediumtext DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  \`expires_at\` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 5. matches (String ID varchar(50))
content = content.replace(
`CREATE TABLE \`matches\` (
  \`id\` varchar(50) NOT NULL,
  \`competition\` varchar(150) NOT NULL,
  \`stage\` varchar(100) DEFAULT NULL,
  \`match_title\` varchar(200) NOT NULL,
  \`team_one\` varchar(100) NOT NULL,
  \`team_one_abbr\` varchar(10) DEFAULT NULL,
  \`team_one_rate\` decimal(5,2) NOT NULL DEFAULT 1.90,
  \`team_one_logo\` varchar(255) DEFAULT NULL,
  \`team_two\` varchar(100) NOT NULL,
  \`team_two_abbr\` varchar(10) DEFAULT NULL,
  \`team_two_rate\` decimal(5,2) NOT NULL DEFAULT 1.90,
  \`team_two_logo\` varchar(255) DEFAULT NULL,
  \`scheduled_time\` varchar(100) DEFAULT NULL,
  \`match_start_time\` datetime DEFAULT NULL,
  \`match_end_time\` datetime DEFAULT NULL,
  \`venue\` varchar(200) DEFAULT NULL,
  \`status\` enum('upcoming','live','completed','abandoned','settlement_reversed') NOT NULL DEFAULT 'upcoming',
  \`toss_winner` + '` varchar(100) DEFAULT NULL,\n  `settled` tinyint(1) NOT NULL DEFAULT 0,\n  `settlement_version` int(11) NOT NULL DEFAULT 0,\n  `settlement_status` enum(\'unsettled\',\'settled\',\'reversed\',\'resettled\') NOT NULL DEFAULT \'unsettled\',\n  `settled_at` timestamp NULL DEFAULT NULL,\n  `settled_by` int(11) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
`CREATE TABLE \`matches\` (
  \`id\` varchar(50) NOT NULL,
  \`competition\` varchar(150) NOT NULL,
  \`stage\` varchar(100) DEFAULT NULL,
  \`match_title\` varchar(200) NOT NULL,
  \`team_one\` varchar(100) NOT NULL,
  \`team_one_abbr\` varchar(10) DEFAULT NULL,
  \`team_one_rate\` decimal(5,2) NOT NULL DEFAULT 1.90,
  \`team_one_logo\` varchar(255) DEFAULT NULL,
  \`team_two\` varchar(100) NOT NULL,
  \`team_two_abbr\` varchar(10) DEFAULT NULL,
  \`team_two_rate\` decimal(5,2) NOT NULL DEFAULT 1.90,
  \`team_two_logo\` varchar(255) DEFAULT NULL,
  \`scheduled_time\` varchar(100) DEFAULT NULL,
  \`match_start_time\` datetime DEFAULT NULL,
  \`match_end_time\` datetime DEFAULT NULL,
  \`venue\` varchar(200) DEFAULT NULL,
  \`status\` enum('upcoming','live','completed','abandoned','settlement_reversed') NOT NULL DEFAULT 'upcoming',
  \`toss_winner` + '` varchar(100) DEFAULT NULL,\n  `settled` tinyint(1) NOT NULL DEFAULT 0,\n  `settlement_version` int(11) NOT NULL DEFAULT 0,\n  `settlement_status` enum(\'unsettled\',\'settled\',\'reversed\',\'resettled\') NOT NULL DEFAULT \'unsettled\',\n  `settled_at` timestamp NULL DEFAULT NULL,\n  `settled_by` int(11) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
);

// 6. sessions
content = content.replace(
`CREATE TABLE \`sessions\` (
  \`id\` int(11) NOT NULL,
  \`token_hash\` varchar(64) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`ip_address\` varchar(45) DEFAULT NULL,
  \`user_agent\` text DEFAULT NULL,
  \`expires_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`sessions\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`token_hash\` varchar(64) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`ip_address\` varchar(45) DEFAULT NULL,
  \`user_agent\` text DEFAULT NULL,
  \`expires_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 7. settlements
content = content.replace(
`CREATE TABLE \`settlements\` (
  \`id\` int(11) NOT NULL,
  \`settlement_uuid\` varchar(36) NOT NULL,
  \`version\` int(11) NOT NULL DEFAULT 1,
  \`status\` enum('current','reversed') NOT NULL DEFAULT 'current',
  \`match_id\` varchar(50) NOT NULL,
  \`declared_outcome\` varchar(100) NOT NULL,
  \`admin_id\` int(11) NOT NULL,
  \`admin_username\` varchar(50) NOT NULL,
  \`total_bets\` int(11) NOT NULL DEFAULT 0,
  \`won_bets\` int(11) NOT NULL DEFAULT 0,
  \`lost_bets\` int(11) NOT NULL DEFAULT 0,
  \`no_result_bets\` int(11) NOT NULL DEFAULT 0,
  \`total_stake\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`total_payout\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`notes\` text DEFAULT NULL,
  \`reversal_reason\` text DEFAULT NULL,
  \`reversed_at\` timestamp NULL DEFAULT NULL,
  \`reversed_by_id\` int(11) DEFAULT NULL,
  \`reversed_by_username\` varchar(50) DEFAULT NULL,
  \`reversal_amount\` decimal(12,2) DEFAULT 0.00,
  \`corrected_by_settlement_uuid\` varchar(36) DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`settlements\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`settlement_uuid\` varchar(36) NOT NULL,
  \`version\` int(11) NOT NULL DEFAULT 1,
  \`status\` enum('current','reversed') NOT NULL DEFAULT 'current',
  \`match_id\` varchar(50) NOT NULL,
  \`declared_outcome\` varchar(100) NOT NULL,
  \`admin_id\` int(11) NOT NULL,
  \`admin_username\` varchar(50) NOT NULL,
  \`total_bets\` int(11) NOT NULL DEFAULT 0,
  \`won_bets\` int(11) NOT NULL DEFAULT 0,
  \`lost_bets\` int(11) NOT NULL DEFAULT 0,
  \`no_result_bets\` int(11) NOT NULL DEFAULT 0,
  \`total_stake\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`total_payout\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`notes\` text DEFAULT NULL,
  \`reversal_reason\` text DEFAULT NULL,
  \`reversed_at\` timestamp NULL DEFAULT NULL,
  \`reversed_by_id\` int(11) DEFAULT NULL,
  \`reversed_by_username\` varchar(50) DEFAULT NULL,
  \`reversal_amount\` decimal(12,2) DEFAULT 0.00,
  \`corrected_by_settlement_uuid\` varchar(36) DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 8. users
content = content.replace(
`CREATE TABLE \`users\` (
  \`id\` int(11) NOT NULL,
  \`uuid\` varchar(36) NOT NULL,
  \`full_name\` varchar(100) NOT NULL,
  \`username\` varchar(30) NOT NULL,
  \`email\` varchar(150) DEFAULT NULL,
  \`phone\` varchar(20) DEFAULT NULL,
  \`password_hash\` varchar(255) NOT NULL,
  \`role\` enum('user','admin','super_admin') DEFAULT 'user',
  \`status\` enum('active','suspended','banned') DEFAULT 'active',
  \`must_change_password\` tinyint(1) NOT NULL DEFAULT 0,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`users\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`uuid\` varchar(36) NOT NULL,
  \`full_name\` varchar(100) NOT NULL,
  \`username\` varchar(30) NOT NULL,
  \`email\` varchar(150) DEFAULT NULL,
  \`phone\` varchar(20) DEFAULT NULL,
  \`password_hash\` varchar(255) NOT NULL,
  \`role\` enum('user','admin','super_admin') DEFAULT 'user',
  \`status\` enum('active','suspended','banned') DEFAULT 'active',
  \`must_change_password\` tinyint(1) NOT NULL DEFAULT 0,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 9. user_preferences
content = content.replace(
`CREATE TABLE \`user_preferences\` (
  \`id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`dark_mode_enabled\` tinyint(1) DEFAULT 0,
  \`toss_alerts\` tinyint(1) DEFAULT 1,
  \`match_reminders\` tinyint(1) DEFAULT 1,
  \`wallet_notices\` tinyint(1) DEFAULT 1,
  \`promo_updates\` tinyint(1) DEFAULT 0,
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`user_preferences\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) NOT NULL,
  \`dark_mode_enabled\` tinyint(1) DEFAULT 0,
  \`toss_alerts\` tinyint(1) DEFAULT 1,
  \`match_reminders\` tinyint(1) DEFAULT 1,
  \`wallet_notices\` tinyint(1) DEFAULT 1,
  \`promo_updates\` tinyint(1) DEFAULT 0,
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

// 10. wallets
content = content.replace(
`CREATE TABLE \`wallets\` (
  \`id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`available_balance\` decimal(12,2) DEFAULT 0.00,
  \`exposure_balance\` decimal(12,2) DEFAULT 0.00,
  \`currency\` varchar(10) DEFAULT 'INR',
  \`version\` int(11) DEFAULT 1,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
`CREATE TABLE \`wallets\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) NOT NULL,
  \`available_balance\` decimal(12,2) DEFAULT 0.00,
  \`exposure_balance\` decimal(12,2) DEFAULT 0.00,
  \`currency\` varchar(10) DEFAULT 'INR',
  \`version\` int(11) DEFAULT 1,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
);

console.log('[2/5] Removing redundant ADD PRIMARY KEY statements in Indexes section...');

// Remove ADD PRIMARY KEY (`id`), from ALTER TABLE statements
// admin_audit_logs
content = content.replace(
`ALTER TABLE \`admin_audit_logs\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`admin_audit_logs\``
);

// bets
content = content.replace(
`ALTER TABLE \`bets\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`bets\``
);

// coin_transactions
content = content.replace(
`ALTER TABLE \`coin_transactions\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`coin_transactions\``
);

// idempotency_records
content = content.replace(
`ALTER TABLE \`idempotency_records\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`idempotency_records\``
);

// matches
content = content.replace(
`ALTER TABLE \`matches\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`matches\``
);

// sessions
content = content.replace(
`ALTER TABLE \`sessions\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`sessions\``
);

// settlements
content = content.replace(
`ALTER TABLE \`settlements\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`settlements\``
);

// users
content = content.replace(
`ALTER TABLE \`users\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`users\``
);

// user_preferences
content = content.replace(
`ALTER TABLE \`user_preferences\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`user_preferences\``
);

// wallets
content = content.replace(
`ALTER TABLE \`wallets\`\n  ADD PRIMARY KEY (\`id\`),`,
`ALTER TABLE \`wallets\``
);

console.log('[3/5] Saving corrected SQL to workspace:', destWorkspace);
fs.writeFileSync(destWorkspace, content, 'utf8');

console.log('[4/5] Saving copy to Downloads:', destDownloads);
try {
  fs.writeFileSync(destDownloads, content, 'utf8');
  console.log('  ✓ Saved successfully to Downloads path!');
} catch (e) {
  console.warn('  ! Direct write to Downloads failed (' + e.message + '), will copy via PowerShell.');
}

console.log('[5/5] Generation complete!');
