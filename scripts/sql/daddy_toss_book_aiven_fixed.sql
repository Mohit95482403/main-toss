-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 22, 2026 at 10:26 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ironman_toss_book`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin_audit_logs`
--

CREATE TABLE `admin_audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `admin_username` varchar(50) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `target_type` varchar(50) NOT NULL,
  `target_id` int(11) DEFAULT NULL,
  `target_identifier` varchar(100) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `admin_audit_logs`
--

INSERT INTO `admin_audit_logs` (`id`, `admin_id`, `admin_username`, `action_type`, `target_type`, `target_id`, `target_identifier`, `details`, `ip_address`, `created_at`) VALUES
(1, 6, 'admin', 'admin_provisioned', 'system', 6, 'admin', '{\"event\":\"Initial root administrator account provisioned\",\"role\":\"super_admin\"}', '127.0.0.1', '2026-10-14 13:50:20'),
(2331, 6, 'admin', 'ADMIN_CREDIT', 'user_wallet', 1087, 'cointest_1792656347738', '{\"actionType\":\"ADMIN_CREDIT\",\"amount\":250,\"balanceBefore\":500,\"balanceAfter\":750,\"reason\":\"Test deposit adjustment approved by admin\",\"transactionUuid\":\"0a1337cd-10c3-4fdd-ad3b-79043b20ecaa\"}', '127.0.0.1', '2026-10-22 08:05:47'),
(2332, 6, 'admin', 'ADMIN_DEBIT', 'user_wallet', 1087, 'cointest_1792656347738', '{\"actionType\":\"ADMIN_DEBIT\",\"amount\":150,\"balanceBefore\":750,\"balanceAfter\":600,\"reason\":\"Admin fee deduction test\",\"transactionUuid\":\"90bb3ae4-7f63-49ee-847a-4971180880ba\"}', '127.0.0.1', '2026-10-22 08:05:47'),
(2333, 6, 'admin', 'ADMIN_CREDIT', 'user_wallet', 1087, 'cointest_1792656347738', '{\"actionType\":\"ADMIN_CREDIT\",\"amount\":100,\"balanceBefore\":600,\"balanceAfter\":700,\"reason\":\"Idempotency test addition\",\"transactionUuid\":\"a6c8c5a9-7246-4a9f-a6e6-db0d9c5fa41d\"}', '127.0.0.1', '2026-10-22 08:05:47'),
(2356, 6, 'admin', 'ADMIN_CREDIT', 'user_wallet', 1096, 'p6_1792656653888_715', '{\"actionType\":\"ADMIN_CREDIT\",\"amount\":300,\"balanceBefore\":500,\"balanceAfter\":800,\"reason\":\"Loyalty bonus credit\",\"transactionUuid\":\"3f821fa2-f7ca-4c22-af84-e22eed950db8\"}', '127.0.0.1', '2026-10-22 08:10:53'),
(2357, 6, 'admin', 'ADMIN_DEBIT', 'user_wallet', 1096, 'p6_1792656653888_715', '{\"actionType\":\"ADMIN_DEBIT\",\"amount\":200,\"balanceBefore\":800,\"balanceAfter\":600,\"reason\":\"Correction debit\",\"transactionUuid\":\"e5ab2a31-60ca-421a-84c0-86da78716c5e\"}', '127.0.0.1', '2026-10-22 08:10:53'),
(2382, 6, 'admin', 'ADMIN_CREDIT', 'user_wallet', 1109, 'testF_1792656689169_646', '{\"actionType\":\"ADMIN_CREDIT\",\"amount\":250,\"balanceBefore\":500,\"balanceAfter\":750,\"reason\":\"Loyalty bonus reward\",\"transactionUuid\":\"e6a00cb0-dd2e-4a4a-9a46-e3fd81bc3df6\"}', '127.0.0.1', '2026-10-22 08:11:29'),
(2383, 6, 'admin', 'ADMIN_DEBIT', 'user_wallet', 1109, 'testF_1792656689169_646', '{\"actionType\":\"ADMIN_DEBIT\",\"amount\":150,\"balanceBefore\":750,\"balanceAfter\":600,\"reason\":\"Administrative penalty deduction\",\"transactionUuid\":\"050d0e79-c213-4be6-8e5c-2fc35fa81cf3\"}', '127.0.0.1', '2026-10-22 08:11:29');

-- --------------------------------------------------------

--
-- Table structure for table `bets`
--

CREATE TABLE `bets` (
  `id` varchar(50) NOT NULL,
  `user_id` int(11) NOT NULL,
  `match_id` varchar(50) NOT NULL,
  `market_name` varchar(100) NOT NULL DEFAULT 'Toss Winner',
  `selection` varchar(100) NOT NULL,
  `stake` decimal(12,2) NOT NULL,
  `odds` decimal(5,2) NOT NULL,
  `potential_return` decimal(12,2) NOT NULL,
  `status` enum('pending','live','won','lost','no_result','cancelled') NOT NULL DEFAULT 'live',
  `settlement_status` enum('pending','settled','cancelled','reversed') NOT NULL DEFAULT 'pending',
  `settlement_version` int(11) DEFAULT NULL,
  `idempotency_key` varchar(150) DEFAULT NULL,
  `payout` decimal(12,2) DEFAULT 0.00,
  `refund_amount` decimal(12,2) DEFAULT 0.00,
  `settled_at` timestamp NULL DEFAULT NULL,
  `settled_by` int(11) DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `coin_transactions`
--

CREATE TABLE `coin_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `transaction_uuid` varchar(36) NOT NULL,
  `user_id` int(11) NOT NULL,
  `username` varchar(30) NOT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `admin_username` varchar(50) DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `balance_before` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `metadata` longtext DEFAULT NULL,
  `bet_id` varchar(50) DEFAULT NULL,
  `match_id` varchar(50) DEFAULT NULL,
  `settlement_uuid` varchar(50) DEFAULT NULL,
  `related_transaction_id` varchar(64) DEFAULT NULL,
  `idempotency_key` varchar(100) DEFAULT NULL,
  `status` enum('completed','failed') NOT NULL DEFAULT 'completed',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `idempotency_records`
--

CREATE TABLE `idempotency_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(150) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `scope` varchar(50) NOT NULL,
  `request_hash` varchar(64) NOT NULL,
  `status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  `response_status` int(11) DEFAULT NULL,
  `response_body` mediumtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `idempotency_records`
--

INSERT INTO `idempotency_records` (`id`, `idempotency_key`, `user_id`, `scope`, `request_hash`, `status`, `response_status`, `response_body`, `created_at`, `updated_at`, `expires_at`) VALUES
(214, 'idemp-key-test-1792656347809', 6, 'ADMIN_COIN_ADJUST', 'b20c34354dc8ec7d59da4a8b577e8a0f787ef0682c19ec8c0ce6fdf867c8e23c', 'completed', 200, '{\"success\":true,\"message\":\"Coins added successfully. Updated balance: 700.00\",\"data\":{\"transactionUuid\":\"a6c8c5a9-7246-4a9f-a6e6-db0d9c5fa41d\",\"userId\":1087,\"username\":\"cointest_1792656347738\",\"actionType\":\"ADMIN_CREDIT\",\"amount\":100,\"balanceBefore\":600,\"balanceAfter\":700,\"reason\":\"Idempotency test addition\",\"adminUsername\":\"admin\",\"createdAt\":\"2026-10-22T08:05:47.815Z\"}}', '2026-10-22 08:05:47', '2026-10-22 08:05:47', NULL),
(215, 'IDEMP-BET-1792656653616-0.7898543105423133', 1093, 'BET_PLACE', '59685b42dc66dafbb62bf238aa97575e79e4cf7b37c1d94dccd63a3e3d92ed08', 'completed', 201, '{\"success\":true,\"message\":\"Bet of ₹300.00 placed successfully on MI!\",\"data\":{\"bet\":{\"id\":\"BET-1792656653626-505\",\"matchId\":\"MATCH-1792656653590\",\"matchTitle\":\"CSK vs MI\",\"selection\":\"MI\",\"rate\":1.95,\"stake\":300,\"potentialReturn\":585,\"potentialProfit\":285,\"status\":\"pending\"},\"wallet\":{\"availableBalance\":1200,\"exposureBalance\":800,\"currency\":\"INR\"}}}', '2026-10-22 08:10:53', '2026-10-22 08:10:53', NULL),
(216, 'CANCEL-KEY-1792656653636', 1093, 'BET_CANCEL', '576087e4d75703beecd22af336653aecc96f36d11799e4c91288e1ab78647c3e', 'completed', 200, '{\"success\":true,\"message\":\"Bet cancelled successfully. Your stake has been refunded.\",\"bet\":{\"id\":\"BET-1792656653606-917\",\"status\":\"cancelled\",\"settlementStatus\":\"cancelled\"},\"refundedAmount\":500,\"balance\":1700,\"data\":{\"bet\":{\"id\":\"BET-1792656653606-917\",\"matchId\":\"MATCH-1792656653590\",\"matchTitle\":\"CSK vs MI\",\"selection\":\"CSK\",\"stake\":500,\"status\":\"cancelled\",\"settlementStatus\":\"cancelled\",\"refundAmount\":500,\"cancelledAt\":\"2026-10-22T08:10:53.654Z\"},\"refundedAmount\":500,\"wallet\":{\"availableBalance\":1700,\"exposureBalance\":300,\"currency\":\"INR\"}}}', '2026-10-22 08:10:53', '2026-10-22 08:10:53', NULL),
(217, 'SETTLE-KEY-1792656653855', 6, 'MATCH_SETTLE', '9a292373f9baaa8225897d22c4e4b7927b7efb3ba58a764f8cfab5da5cc2af1f', 'completed', 200, '{\"success\":true,\"message\":\"Match \\\"SRH vs DC\\\" successfully settled with outcome: SRH.\",\"data\":{\"settlementUuid\":\"04297480-8ea3-4fb7-b828-1f7c33aa78a8\",\"settlement_uuid\":\"04297480-8ea3-4fb7-b828-1f7c33aa78a8\",\"matchId\":\"MATCH-1792656653838\",\"match_id\":\"MATCH-1792656653838\",\"matchTitle\":\"SRH vs DC\",\"match_title\":\"SRH vs DC\",\"declaredOutcome\":\"SRH\",\"declared_outcome\":\"SRH\",\"status\":\"completed\",\"settled\":true,\"totalBetsSettled\":1,\"bets_settled\":1,\"wonCount\":1,\"lostCount\":0,\"noResultCount\":0,\"totalStake\":500,\"totalPayoutCredited\":975,\"totalPayout\":975,\"settledBy\":\"admin\",\"timestamp\":\"2026-10-22T08:10:53.874Z\"}}', '2026-10-22 08:10:53', '2026-10-22 08:10:53', NULL),
(218, 'ADMIN-CR-1792656653944', 6, 'ADMIN_COIN_ADJUST', '59677294b213774ad79cc55e80d1bdc107c0b6076e315bc203fdbef9c8cc4f4d', 'completed', 200, '{\"success\":true,\"message\":\"Coins added successfully. Updated balance: 800.00\",\"data\":{\"transactionUuid\":\"3f821fa2-f7ca-4c22-af84-e22eed950db8\",\"userId\":1096,\"username\":\"p6_1792656653888_715\",\"actionType\":\"ADMIN_CREDIT\",\"amount\":300,\"balanceBefore\":500,\"balanceAfter\":800,\"reason\":\"Loyalty bonus credit\",\"adminUsername\":\"admin\",\"createdAt\":\"2026-10-22T08:10:53.967Z\"}}', '2026-10-22 08:10:53', '2026-10-22 08:10:53', NULL),
(219, 'ADMIN-DR-1792656653979', 6, 'ADMIN_COIN_ADJUST', '9a556f39b50483573aabc5534eb1fc48a4e445b81ddfc5e97a48de907883a191', 'completed', 200, '{\"success\":true,\"message\":\"Coins deducted successfully. Updated balance: 600.00\",\"data\":{\"transactionUuid\":\"e5ab2a31-60ca-421a-84c0-86da78716c5e\",\"userId\":1096,\"username\":\"p6_1792656653888_715\",\"actionType\":\"ADMIN_DEBIT\",\"amount\":200,\"balanceBefore\":800,\"balanceAfter\":600,\"reason\":\"Correction debit\",\"adminUsername\":\"admin\",\"createdAt\":\"2026-10-22T08:10:53.998Z\"}}', '2026-10-22 08:10:53', '2026-10-22 08:10:53', NULL),
(220, 'BET-IDEMP-1792656688597-9208', 1102, 'BET_PLACE', 'c0a28e7e3ded772a166bc4b5a61ee8b1594cea4a9878571c47e4c7fef709a6e1', 'completed', 201, '{\"success\":true,\"message\":\"Bet of ₹500.00 placed successfully on Mumbai Indians!\",\"data\":{\"bet\":{\"id\":\"BET-1792656688708-261\",\"matchId\":\"MATCH-1792656688696\",\"matchTitle\":\"Mumbai Indians vs Chennai Super Kings\",\"selection\":\"Mumbai Indians\",\"rate\":2,\"stake\":500,\"potentialReturn\":1000,\"potentialProfit\":500,\"status\":\"pending\"},\"wallet\":{\"availableBalance\":1500,\"exposureBalance\":500,\"currency\":\"INR\"}}}', '2026-10-22 08:11:28', '2026-10-22 08:11:28', NULL),
(221, 'BET-IDEMP-NEW-1792656688597', 1102, 'BET_PLACE', '8609461698be99659ad8f5729fc940e9473cfd65d43cc24d950c8ca33df89a6b', 'completed', 201, '{\"success\":true,\"message\":\"Bet of ₹300.00 placed successfully on Mumbai Indians!\",\"data\":{\"bet\":{\"id\":\"BET-1792656688741-768\",\"matchId\":\"MATCH-1792656688696\",\"matchTitle\":\"Mumbai Indians vs Chennai Super Kings\",\"selection\":\"Mumbai Indians\",\"rate\":2,\"stake\":300,\"potentialReturn\":600,\"potentialProfit\":300,\"status\":\"pending\"},\"wallet\":{\"availableBalance\":1200,\"exposureBalance\":800,\"currency\":\"INR\"}}}', '2026-10-22 08:11:28', '2026-10-22 08:11:28', NULL),
(222, 'CONC-B1-1792656688597', 1103, 'BET_PLACE', 'd53227c350ea52b53533432c7296c633e9413ba8d6fb3f421701d32f2d16285d', 'completed', 201, '{\"success\":true,\"message\":\"Bet of ₹700.00 placed successfully on Gujarat Titans!\",\"data\":{\"bet\":{\"id\":\"BET-1792656688801-665\",\"matchId\":\"MATCH-1792656688794\",\"matchTitle\":\"Gujarat Titans vs Rajasthan Royals\",\"selection\":\"Gujarat Titans\",\"rate\":2,\"stake\":700,\"potentialReturn\":1400,\"potentialProfit\":700,\"status\":\"pending\"},\"wallet\":{\"availableBalance\":300,\"exposureBalance\":700,\"currency\":\"INR\"}}}', '2026-10-22 08:11:28', '2026-10-22 08:11:28', NULL),
(224, 'CANCEL-IDEMP-1792656688597', 1104, 'BET_CANCEL', '09e7c323dea7f551b0882ba18f0b6628af37b495028276814d42ab22ccbb80d2', 'completed', 200, '{\"success\":true,\"message\":\"Bet cancelled successfully. Your stake has been refunded.\",\"bet\":{\"id\":\"BET-1792656688866-246\",\"status\":\"cancelled\",\"settlementStatus\":\"cancelled\"},\"refundedAmount\":400,\"balance\":1000,\"data\":{\"bet\":{\"id\":\"BET-1792656688866-246\",\"matchId\":\"MATCH-1792656688860\",\"matchTitle\":\"Kolkata Knight Riders vs Delhi Capitals\",\"selection\":\"Kolkata Knight Riders\",\"stake\":400,\"status\":\"cancelled\",\"settlementStatus\":\"cancelled\",\"refundAmount\":400,\"cancelledAt\":\"2026-10-22T08:11:28.874Z\"},\"refundedAmount\":400,\"wallet\":{\"availableBalance\":1000,\"exposureBalance\":0,\"currency\":\"INR\"}}}', '2026-10-22 08:11:28', '2026-10-22 08:11:28', NULL),
(225, 'SETTLE-IDEMP-1792656688597', 6, 'MATCH_SETTLE', '030bbb131dfcd31d6de90d6b3618a7f1a2c7e95cecb415d5f5da7871e3a9d9d4', 'completed', 200, '{\"success\":true,\"message\":\"Match \\\"Sunrisers Hyderabad vs Punjab Kings\\\" successfully settled with outcome: Sunrisers Hyderabad.\",\"data\":{\"settlementUuid\":\"90849f8f-4ba1-4148-a7c3-5fa9335282f2\",\"settlement_uuid\":\"90849f8f-4ba1-4148-a7c3-5fa9335282f2\",\"matchId\":\"MATCH-1792656688979\",\"match_id\":\"MATCH-1792656688979\",\"matchTitle\":\"Sunrisers Hyderabad vs Punjab Kings\",\"match_title\":\"Sunrisers Hyderabad vs Punjab Kings\",\"declaredOutcome\":\"Sunrisers Hyderabad\",\"declared_outcome\":\"Sunrisers Hyderabad\",\"status\":\"completed\",\"settled\":true,\"totalBetsSettled\":1,\"bets_settled\":1,\"wonCount\":1,\"lostCount\":0,\"noResultCount\":0,\"totalStake\":500,\"totalPayoutCredited\":1000,\"totalPayout\":1000,\"settledBy\":\"admin\",\"timestamp\":\"2026-10-22T08:11:29.007Z\"}}', '2026-10-22 08:11:29', '2026-10-22 08:11:29', NULL),
(226, 'REV-IDEMP-1792656688597', 6, 'SETTLEMENT_REVERSE', '20d0cff891def0a5410e843d83018b666b0b571f2b1dad481bded1c11318c6fc', 'completed', 200, '{\"success\":true,\"message\":\"Settlement for match \\\"Lucknow Super Giants vs Gujarat Titans\\\" has been successfully reversed. All financial payouts have been reconciled.\",\"data\":{\"matchId\":\"MATCH-1792656689113\",\"matchTitle\":\"Lucknow Super Giants vs Gujarat Titans\",\"status\":\"settlement_reversed\",\"settlementStatus\":\"reversed\",\"settled\":false,\"reversedSettlement\":{\"settlementUuid\":\"80c7eb91-86ba-42f7-8138-23d89b45d9a6\",\"version\":1,\"declaredOutcome\":\"Lucknow Super Giants\",\"reversalReason\":\"Official toss call corrected after video review\",\"reversedAt\":\"2026-10-22T08:11:29.147Z\",\"reversedBy\":\"admin\",\"reversalAmount\":800,\"winningBetsReversed\":1}}}', '2026-10-22 08:11:29', '2026-10-22 08:11:29', NULL),
(227, 'RESETTL-IDEMP-1792656688597', 6, 'SETTLEMENT_RESETTLE', '5accd0f43436cbfef96aaea0359aac219e66c9b1a75b94bae234201173dcbb29', 'completed', 200, '{\"success\":true,\"message\":\"Match \\\"Lucknow Super Giants vs Gujarat Titans\\\" successfully resettled with corrected outcome: Gujarat Titans (Settlement Version 2).\",\"data\":{\"settlementUuid\":\"03ba89c0-77ce-4e5b-b279-ef2af5587639\",\"version\":2,\"matchId\":\"MATCH-1792656689113\",\"matchTitle\":\"Lucknow Super Giants vs Gujarat Titans\",\"declaredOutcome\":\"Gujarat Titans\",\"status\":\"completed\",\"settled\":true,\"settlementStatus\":\"resettled\",\"totalBetsSettled\":2,\"wonCount\":1,\"lostCount\":1,\"noResultCount\":0,\"totalStake\":800,\"totalPayoutCredited\":800,\"settledBy\":\"admin\",\"timestamp\":\"2026-10-22T08:11:29.163Z\"}}', '2026-10-22 08:11:29', '2026-10-22 08:11:29', NULL),
(228, 'ADMIN-CREDIT-1792656688597', 6, 'ADMIN_COIN_ADJUST', '7cc4af66c5d13a812fe655e0fde4649583d6b1d706942319261f8110e44806d1', 'completed', 200, '{\"success\":true,\"message\":\"Coins added successfully. Updated balance: 750.00\",\"data\":{\"transactionUuid\":\"e6a00cb0-dd2e-4a4a-9a46-e3fd81bc3df6\",\"userId\":1109,\"username\":\"testF_1792656689169_646\",\"actionType\":\"ADMIN_CREDIT\",\"amount\":250,\"balanceBefore\":500,\"balanceAfter\":750,\"reason\":\"Loyalty bonus reward\",\"adminUsername\":\"admin\",\"createdAt\":\"2026-10-22T08:11:29.225Z\"}}', '2026-10-22 08:11:29', '2026-10-22 08:11:29', NULL),
(229, 'ADMIN-DEBIT-1792656688597', 6, 'ADMIN_COIN_ADJUST', 'b822a8560227da89a233fc524aa406ce5365934557905256ef09af69efef5a38', 'completed', 200, '{\"success\":true,\"message\":\"Coins deducted successfully. Updated balance: 600.00\",\"data\":{\"transactionUuid\":\"050d0e79-c213-4be6-8e5c-2fc35fa81cf3\",\"userId\":1109,\"username\":\"testF_1792656689169_646\",\"actionType\":\"ADMIN_DEBIT\",\"amount\":150,\"balanceBefore\":750,\"balanceAfter\":600,\"reason\":\"Administrative penalty deduction\",\"adminUsername\":\"admin\",\"createdAt\":\"2026-10-22T08:11:29.236Z\"}}', '2026-10-22 08:11:29', '2026-10-22 08:11:29', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `matches`
--

CREATE TABLE `matches` (
  `id` varchar(50) NOT NULL,
  `competition` varchar(150) NOT NULL,
  `stage` varchar(100) DEFAULT NULL,
  `match_title` varchar(200) NOT NULL,
  `team_one` varchar(100) NOT NULL,
  `team_one_abbr` varchar(10) DEFAULT NULL,
  `team_one_rate` decimal(5,2) NOT NULL DEFAULT 1.90,
  `team_one_logo` varchar(255) DEFAULT NULL,
  `team_two` varchar(100) NOT NULL,
  `team_two_abbr` varchar(10) DEFAULT NULL,
  `team_two_rate` decimal(5,2) NOT NULL DEFAULT 1.90,
  `team_two_logo` varchar(255) DEFAULT NULL,
  `scheduled_time` varchar(100) DEFAULT NULL,
  `match_start_time` datetime DEFAULT NULL,
  `match_end_time` datetime DEFAULT NULL,
  `venue` varchar(200) DEFAULT NULL,
  `status` enum('upcoming','live','completed','abandoned','settlement_reversed') NOT NULL DEFAULT 'upcoming',
  `toss_winner` varchar(100) DEFAULT NULL,
  `settled` tinyint(1) NOT NULL DEFAULT 0,
  `settlement_version` int(11) NOT NULL DEFAULT 0,
  `settlement_status` enum('unsettled','settled','reversed','resettled') NOT NULL DEFAULT 'unsettled',
  `settled_at` timestamp NULL DEFAULT NULL,
  `settled_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token_hash` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`id`, `token_hash`, `user_id`, `ip_address`, `user_agent`, `expires_at`, `created_at`) VALUES
(103, 'd40edff05e0fff81ae9d01c23bc7b318bc3833886eb370deb3a7faa6c8937d53', 6, NULL, NULL, '2026-10-15 13:06:24', '2026-10-15 11:06:24'),
(158, '672c99f9f07387e74c1c62ed156be1b55e8f17b75f2414ccc6047c429d049672', 6, '::1', 'node', '2026-10-16 11:54:57', '2026-10-15 11:54:57'),
(159, 'f558d291937875be7fb9a31a4ac9be19544d47df841784f10aaae06ea2331c73', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-16 11:55:39', '2026-10-15 11:55:39'),
(196, 'a615269661c9299c09697c39315a1310c3ff01ab75dd385501a2d4f969533cc0', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-17 12:44:29', '2026-10-16 12:44:29'),
(197, '50b7e2abe9827fdc3e2fa200efa6f0d34634490fecb32008fd34d9922c4c89c0', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-17 12:57:05', '2026-10-16 12:57:05'),
(248, '5a6b1495aeb45685e6798046db10e8d6c161bdf2f4b0ddb4613dce72d53cb308', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-18 12:57:30', '2026-10-17 12:57:30'),
(330, 'cea7176b4653c82ddbe2da199b9dbf54fbbbd7a0d783abb8b582135ff47b5a3c', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:06:53', '2026-10-19 20:06:53'),
(332, '263de3966b6b6617db1935fe7d679cc566715650f363fa5ed95e973cf4991ac0', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:14:59', '2026-10-19 20:14:59'),
(333, 'c10ae5f90ba150ee57ae93ff59164d5134bfc83ab422dadde15eece0d2ea058c', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:17:12', '2026-10-19 20:17:12'),
(334, '5f95964c432bc09b1f41685e20563aa1f4cfdd56486a2115b5fe9a1eec1466c3', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:26:00', '2026-10-19 20:26:00'),
(335, '6f61369ccd3608d360c61a5b4e33943549e65461dd1f887d9123c42fc18e78f9', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:34:37', '2026-10-19 20:34:37'),
(336, 'b6c4e2f3eb1c12586f84832ac9da1c0a51e8dde91b15d2c399db18f9df713358', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 20:38:32', '2026-10-19 20:38:32'),
(366, 'a58ae79bc335e1b2d85d4d32f26bd8b463bd2e81ecd81e425cefbcd90d69a80a', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-20 21:16:14', '2026-10-19 21:16:14'),
(367, 'b8457ed5b583d358c86bed520f5e6702a268ad51e549f070ad400d3969386c96', 6, '::1', 'node', '2026-10-21 08:06:47', '2026-10-20 08:06:47'),
(374, 'e0e6715da02813ff8f129eaca1d9aa98ee9454330047723dcaa5c3fee8ca74b0', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-21 08:08:24', '2026-10-20 08:08:24'),
(375, 'a40dfaaef52036a0df3fed9b85bdaadf4649eae79179187c676eb667355bb34c', 6, '::1', 'node', '2026-10-21 08:15:54', '2026-10-20 08:15:54'),
(380, '540bce0fd4a72ced770936fcb383d8fa96f4ed0722fcf3e05e8d6d471bfa7ec8', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-23 07:10:29', '2026-10-22 07:10:29'),
(381, 'd7c2bfc5ff986bfc4956fda1fe42365c07b19f2ac4e36e00d949a28a4821b357', 6, '::1', 'node', '2026-10-23 07:12:31', '2026-10-22 07:12:31'),
(382, 'bb04417beed72b99428d2a37a98cdc9a6c3cd11123cc271302411cbce3f67cff', 6, '::1', 'node', '2026-10-23 07:12:54', '2026-10-22 07:12:54'),
(383, '40102f550deffa74bb2d25ae49435fce6f584064a6194bd2d6dfa665f8725c65', 6, '::1', 'node', '2026-10-23 07:13:06', '2026-10-22 07:13:06'),
(384, '5fd3979f46ca50006cfa0f09b1723e2155a6dde657801374d534c693e92ef67c', 6, '::1', 'node', '2026-10-23 07:13:14', '2026-10-22 07:13:14'),
(385, 'cedbd8c49f600544f85257d65f400d3b9d1cc89cd3ba7d9012d2b1956ce8a5ab', 6, '::1', 'node', '2026-10-23 07:13:57', '2026-10-22 07:13:57'),
(386, '94d4bd8c254eb943f2b06234b04d2d2d2fa9756afcb700a020d872ba05630bea', 6, '::1', 'node', '2026-10-23 07:14:12', '2026-10-22 07:14:12'),
(389, 'ad62d971e1592db5edda391f922ba5f749c3cdf045b35d946850311d89998bf7', 6, '::1', 'node', '2026-10-23 07:17:20', '2026-10-22 07:17:20'),
(394, 'd29f40688ff439b8f88b05918ddebd94fc3a89b63c661fd1f1ec2a8673562e3b', 6, '::1', 'node', '2026-10-23 07:18:51', '2026-10-22 07:18:51'),
(400, '92ac209297ba94f9535f714ad006a5e362b0942aff9c58a36649c434624cfa32', 6, '::1', 'node', '2026-10-23 07:25:45', '2026-10-22 07:25:45'),
(405, 'e5db85aeb2b239f12d902ff145d89bccf64d7090ccf8479d161d455c59ebfe5a', 6, '127.0.0.1', 'node', '2026-10-23 08:04:09', '2026-10-22 08:04:09'),
(410, '2cb6af28b6583974498d6cda0589daf80ba79bad5de1e92e389a1b68a81598c7', 6, '127.0.0.1', 'node', '2026-10-23 08:05:42', '2026-10-22 08:05:42');

-- --------------------------------------------------------

--
-- Table structure for table `settlements`
--

CREATE TABLE `settlements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `settlement_uuid` varchar(36) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `status` enum('current','reversed') NOT NULL DEFAULT 'current',
  `match_id` varchar(50) NOT NULL,
  `declared_outcome` varchar(100) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `admin_username` varchar(50) NOT NULL,
  `total_bets` int(11) NOT NULL DEFAULT 0,
  `won_bets` int(11) NOT NULL DEFAULT 0,
  `lost_bets` int(11) NOT NULL DEFAULT 0,
  `no_result_bets` int(11) NOT NULL DEFAULT 0,
  `total_stake` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_payout` decimal(12,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `reversal_reason` text DEFAULT NULL,
  `reversed_at` timestamp NULL DEFAULT NULL,
  `reversed_by_id` int(11) DEFAULT NULL,
  `reversed_by_username` varchar(50) DEFAULT NULL,
  `reversal_amount` decimal(12,2) DEFAULT 0.00,
  `corrected_by_settlement_uuid` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(36) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `username` varchar(30) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('user','admin','super_admin') DEFAULT 'user',
  `status` enum('active','suspended','banned') DEFAULT 'active',
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `uuid`, `full_name`, `username`, `email`, `phone`, `password_hash`, `role`, `status`, `must_change_password`, `created_at`, `updated_at`) VALUES
(6, 'bedb61b9-fed2-4c43-b153-8ae9043550a8', 'System Administrator', 'admin', 'admin@ironmantossbook.com', '9999999999', 'scrypt$b3c4a520f6b8cb452b3e07d6418cc968$61f9c16e107c4d398a089b5fa9d7b4cf5564a6b71e34152fb1aa9b27843f4225bd3b1b0b44fe5889a08489d6fd78c9f79126866c978eb3bc489036efe3317d59', 'super_admin', 'active', 0, '2026-10-14 13:50:20', '2026-10-15 10:37:19'),
(1084, '69fafd69-cdef-11f1-8a1b-7c10c9ae16ae', 'mohit sonawane', 'dtb1', 'dtb1@example.com', NULL, 'scrypt$efe63684e55c3ec90284045df4ef4652$6dad708559cfc231586643f596bdb1daac75b6a6a4a2840801fe8aa86b8203d19d6f8f0e4d728baada65b4da1edb356e8127c92384bec19c833637378dbf742b', 'user', 'active', 0, '2026-10-22 08:05:31', '2026-10-22 08:05:31');

-- --------------------------------------------------------

--
-- Table structure for table `user_preferences`
--

CREATE TABLE `user_preferences` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `dark_mode_enabled` tinyint(1) DEFAULT 0,
  `toss_alerts` tinyint(1) DEFAULT 1,
  `match_reminders` tinyint(1) DEFAULT 1,
  `wallet_notices` tinyint(1) DEFAULT 1,
  `promo_updates` tinyint(1) DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `user_preferences`
--

INSERT INTO `user_preferences` (`id`, `user_id`, `dark_mode_enabled`, `toss_alerts`, `match_reminders`, `wallet_notices`, `promo_updates`, `updated_at`) VALUES
(6, 6, 1, 1, 1, 1, 0, '2026-10-14 13:50:20');

-- --------------------------------------------------------

--
-- Table structure for table `wallets`
--

CREATE TABLE `wallets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `available_balance` decimal(12,2) DEFAULT 0.00,
  `exposure_balance` decimal(12,2) DEFAULT 0.00,
  `currency` varchar(10) DEFAULT 'INR',
  `version` int(11) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `wallets`
--

INSERT INTO `wallets` (`id`, `user_id`, `available_balance`, `exposure_balance`, `currency`, `version`, `created_at`, `updated_at`) VALUES
(6, 6, 0.00, 0.00, 'INR', 1, '2026-10-14 13:50:20', '2026-10-14 13:50:20'),
(1084, 1084, 1000.00, 0.00, 'INR', 1, '2026-10-22 08:05:31', '2026-10-22 08:05:31');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  ADD KEY `idx_audit_admin` (`admin_id`),
  ADD KEY `idx_audit_action` (`action_type`),
  ADD KEY `idx_audit_created` (`created_at`);

--
-- Indexes for table `bets`
--
ALTER TABLE `bets`
  ADD UNIQUE KEY `idempotency_key` (`idempotency_key`),
  ADD KEY `settled_by` (`settled_by`),
  ADD KEY `idx_bets_user` (`user_id`),
  ADD KEY `idx_bets_match` (`match_id`),
  ADD KEY `idx_bets_status` (`status`),
  ADD KEY `idx_bets_settlement` (`settlement_status`),
  ADD KEY `idx_bets_created` (`created_at`),
  ADD KEY `idx_bets_cancelled` (`cancelled_at`),
  ADD KEY `idx_bets_idempotency` (`idempotency_key`);

--
-- Indexes for table `coin_transactions`
--
ALTER TABLE `coin_transactions`
  ADD UNIQUE KEY `transaction_uuid` (`transaction_uuid`),
  ADD UNIQUE KEY `idempotency_key` (`idempotency_key`),
  ADD KEY `admin_id` (`admin_id`),
  ADD KEY `idx_coin_tx_user` (`user_id`),
  ADD KEY `idx_coin_tx_username` (`username`),
  ADD KEY `idx_coin_tx_action` (`action_type`),
  ADD KEY `idx_coin_tx_created` (`created_at`),
  ADD KEY `idx_coin_tx_idempotency` (`idempotency_key`),
  ADD KEY `idx_coin_tx_bet` (`bet_id`),
  ADD KEY `idx_coin_tx_match` (`match_id`),
  ADD KEY `idx_coin_tx_settlement` (`settlement_uuid`),
  ADD KEY `idx_coin_tx_related_tx` (`related_transaction_id`),
  ADD KEY `idx_coin_tx_user_created` (`user_id`,`created_at`),
  ADD KEY `idx_coin_tx_user_action` (`user_id`,`action_type`);

--
-- Indexes for table `idempotency_records`
--
ALTER TABLE `idempotency_records`
  ADD UNIQUE KEY `idempotency_key` (`idempotency_key`),
  ADD KEY `idx_idem_user_scope` (`user_id`,`scope`),
  ADD KEY `idx_idem_created` (`created_at`);

--
-- Indexes for table `matches`
--
ALTER TABLE `matches`
  ADD KEY `settled_by` (`settled_by`),
  ADD KEY `idx_matches_status` (`status`),
  ADD KEY `idx_matches_settled` (`settled`),
  ADD KEY `idx_matches_created` (`created_at`),
  ADD KEY `idx_matches_end_time` (`match_end_time`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_sessions_token` (`token_hash`),
  ADD KEY `idx_sessions_expires` (`expires_at`);

--
-- Indexes for table `settlements`
--
ALTER TABLE `settlements`
  ADD UNIQUE KEY `settlement_uuid` (`settlement_uuid`),
  ADD KEY `admin_id` (`admin_id`),
  ADD KEY `idx_settlement_match` (`match_id`),
  ADD KEY `idx_settlement_created` (`created_at`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD UNIQUE KEY `uuid` (`uuid`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_users_username` (`username`),
  ADD KEY `idx_users_email` (`email`),
  ADD KEY `idx_users_status` (`status`),
  ADD KEY `idx_users_created` (`created_at`),
  ADD KEY `idx_users_role` (`role`),
  ADD KEY `idx_users_must_change_pass` (`must_change_password`);

--
-- Indexes for table `user_preferences`
--
ALTER TABLE `user_preferences`
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `wallets`
--
ALTER TABLE `wallets`
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2389;

--
-- AUTO_INCREMENT for table `coin_transactions`
--
ALTER TABLE `coin_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1566;

--
-- AUTO_INCREMENT for table `idempotency_records`
--
ALTER TABLE `idempotency_records`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=230;

--
-- AUTO_INCREMENT for table `sessions`
--
ALTER TABLE `sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=415;

--
-- AUTO_INCREMENT for table `settlements`
--
ALTER TABLE `settlements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=233;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1113;

--
-- AUTO_INCREMENT for table `user_preferences`
--
ALTER TABLE `user_preferences`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1039;

--
-- AUTO_INCREMENT for table `wallets`
--
ALTER TABLE `wallets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1113;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  ADD CONSTRAINT `admin_audit_logs_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `bets`
--
ALTER TABLE `bets`
  ADD CONSTRAINT `bets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bets_ibfk_2` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bets_ibfk_3` FOREIGN KEY (`settled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `coin_transactions`
--
ALTER TABLE `coin_transactions`
  ADD CONSTRAINT `coin_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `coin_transactions_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `matches`
--
ALTER TABLE `matches`
  ADD CONSTRAINT `matches_ibfk_1` FOREIGN KEY (`settled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `settlements`
--
ALTER TABLE `settlements`
  ADD CONSTRAINT `settlements_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `settlements_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_preferences`
--
ALTER TABLE `user_preferences`
  ADD CONSTRAINT `user_preferences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `wallets`
--
ALTER TABLE `wallets`
  ADD CONSTRAINT `wallets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
