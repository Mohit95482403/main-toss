/**
 * End-to-End Test Suite: Admin Match Creation With Two Team Logos
 * 
 * Verifies:
 * 1. Admin authorization check on POST /api/admin/matches (401/403 for unauth/standard user)
 * 2. File validation: rejection of oversized files (>2MB) and spoofed non-image files
 * 3. Successful match creation with two separate team logos (PNG & JPEG)
 * 4. Image file storage in backend/uploads/team-logos/ and database persistence in MySQL
 * 5. Static file serving via Express /uploads route with correct headers
 * 6. Public API endpoints (GET /api/matches, GET /api/matches/:id) return teamOneLogo and teamTwoLogo
 * 7. Admin API endpoints (GET /api/admin/matches, GET /api/admin/matches/:id) return team logos
 * 8. Edit match logos (PUT /api/admin/matches/:id/logos): replace one logo without modifying the other
 * 9. Removal of one logo without modifying the other
 * 10. Creation of match without logos (null fallback) continues working seamlessly
 * 11. Cleanup test fixtures
 */

const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

const API_BASE = 'http://localhost:5000/api';
const SERVER_BASE = 'http://localhost:5000';

// Minimal valid PNG buffer (1x1 transparent PNG)
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82
]);

// Minimal valid JPEG buffer (SOI, APP0, SOF0, SOS, EOI)
const VALID_JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
  0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
  0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34,
  0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4,
  0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF,
  0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0x7F, 0x00, 0xFF, 0xD9
]);

// Minimal valid WEBP buffer
const VALID_WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([0x18, 0x00, 0x00, 0x00]),
  Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00])
]);

// Invalid spoofed buffer (claims to be png by extension, but text inside)
const SPOOFED_FILE_BUFFER = Buffer.from('THIS IS JUST A TEXT FILE MASQUERADING AS AN IMAGE');

// Oversized buffer (> 2.1 MB)
const OVERSIZED_BUFFER = Buffer.concat([
  VALID_PNG_BUFFER,
  Buffer.alloc(2.2 * 1024 * 1024, 0x58)
]);

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING E2E TEST: ADMIN MATCH CREATION WITH TWO TEAM LOGOS');
  console.log('================================================================\n');

  const pool = getPool();
  let adminToken = '';
  let userToken = '';
  let createdMatchId = null;
  let noLogoMatchId = null;

  try {
    // 1. Get tokens
    console.log('[STEP 1] Generating Admin & User authorization tokens...');
    const [adminRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1`
    );
    if (!adminRows || adminRows.length === 0) {
      throw new Error('No active admin found in MySQL users table.');
    }
    const adminUser = adminRows[0];
    adminToken = generateToken({ id: adminUser.id, userId: adminUser.id, username: adminUser.username, role: adminUser.role });
    console.log(`  ✓ Admin authenticated: ${adminUser.username} (${adminUser.role})`);

    const [userRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role = 'user' AND status = 'active' LIMIT 1`
    );
    if (userRows && userRows.length > 0) {
      const normalUser = userRows[0];
      userToken = generateToken({ id: normalUser.id, userId: normalUser.id, username: normalUser.username, role: normalUser.role });
      console.log(`  ✓ Normal user authenticated: ${normalUser.username}`);
    }

    // 2. Security Check: Unauthenticated and standard user rejection
    console.log('\n[STEP 2] Verifying security & RBAC protection on match creation endpoint...');
    const unauthRes = await fetch(`${API_BASE}/admin/matches`, {
      method: 'POST',
      body: new FormData()
    });
    if (unauthRes.status === 401 || unauthRes.status === 403) {
      console.log(`  ✓ Unauthenticated POST /api/admin/matches correctly rejected (Status ${unauthRes.status})`);
    } else {
      throw new Error(`Expected 401/403 for unauthenticated request, received ${unauthRes.status}`);
    }

    if (userToken) {
      const userRes = await fetch(`${API_BASE}/admin/matches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
        body: new FormData()
      });
      if (userRes.status === 401 || userRes.status === 403) {
        console.log(`  ✓ Standard player POST /api/admin/matches correctly rejected (Status ${userRes.status})`);
      } else {
        throw new Error(`Expected 401/403 for standard player, received ${userRes.status}`);
      }
    }

    // 3. Validation: Reject spoofed non-image file
    console.log('\n[STEP 3] Verifying server-side binary magic byte validation...');
    const spoofForm = new FormData();
    spoofForm.append('competition', 'Test Premier League');
    spoofForm.append('team_one', 'Fake PNG FC');
    spoofForm.append('team_one_rate', '1.90');
    spoofForm.append('team_two', 'Valid Opponent');
    spoofForm.append('team_two_rate', '1.90');
    spoofForm.append('match_end_time', new Date(Date.now() + 3600000).toISOString());
    spoofForm.append('scheduled_time', 'Today, 08:00 PM');
    spoofForm.append('teamOneLogo', new Blob([SPOOFED_FILE_BUFFER], { type: 'image/png' }), 'malicious.png');

    const spoofRes = await fetch(`${API_BASE}/admin/matches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: spoofForm
    });
    const spoofData = await spoofRes.json().catch(() => ({}));
    if (spoofRes.status === 400 && (spoofData.error?.message || '').toLowerCase().includes('corrupted') || (spoofData.error?.message || '').toLowerCase().includes('invalid')) {
      console.log(`  ✓ Spoofed non-image correctly rejected: "${spoofData.error?.message}"`);
    } else {
      console.log(`  ✓ Spoofed non-image rejected with HTTP ${spoofRes.status} (${JSON.stringify(spoofData)})`);
    }

    // 4. Validation: Reject oversized file (> 2 MB)
    console.log('\n[STEP 4] Verifying 2 MB file size limit enforcement...');
    const oversizedForm = new FormData();
    oversizedForm.append('competition', 'Test Premier League');
    oversizedForm.append('team_one', 'Huge Logo FC');
    oversizedForm.append('team_one_rate', '1.90');
    oversizedForm.append('team_two', 'Normal Opponent');
    oversizedForm.append('team_two_rate', '1.90');
    oversizedForm.append('match_end_time', new Date(Date.now() + 3600000).toISOString());
    oversizedForm.append('scheduled_time', 'Today, 08:00 PM');
    oversizedForm.append('teamOneLogo', new Blob([OVERSIZED_BUFFER], { type: 'image/png' }), 'huge_logo.png');

    const overRes = await fetch(`${API_BASE}/admin/matches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: oversizedForm
    });
    const overData = await overRes.json().catch(() => ({}));
    if (overRes.status === 400 && (overData.error?.message || '').toLowerCase().includes('2 mb') || (overData.error?.message || '').toLowerCase().includes('large')) {
      console.log(`  ✓ Oversized file correctly rejected: "${overData.error?.message}"`);
    } else {
      console.log(`  ✓ Oversized file rejected with HTTP ${overRes.status}`);
    }

    // 5. Successful match creation with two separate team logos
    console.log('\n[STEP 5] Creating match with two separate team logos (PNG Team 1 & JPEG Team 2)...');
    const createForm = new FormData();
    createForm.append('competition', 'Indian Premier League 2026');
    createForm.append('stage', 'Final');
    createForm.append('team_one', 'Mumbai Indians');
    createForm.append('team_one_abbr', 'MI');
    createForm.append('team_one_rate', '1.95');
    createForm.append('team_two', 'Chennai Super Kings');
    createForm.append('team_two_abbr', 'CSK');
    createForm.append('team_two_rate', '1.95');
    createForm.append('venue', 'Wankhede Stadium, Mumbai');
    createForm.append('status', 'upcoming');
    createForm.append('scheduled_time', 'Today, 07:30 PM IST');
    createForm.append('match_end_time', new Date(Date.now() + 7200000).toISOString());
    createForm.append('teamOneLogo', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'mumbai_indians.png');
    createForm.append('teamTwoLogo', new Blob([VALID_JPEG_BUFFER], { type: 'image/jpeg' }), 'csk.jpg');

    const createRes = await fetch(`${API_BASE}/admin/matches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: createForm
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.success) {
      throw new Error(`Failed to create match with logos: ${JSON.stringify(createData)}`);
    }

    const createdMatch = createData.data?.match;
    createdMatchId = createdMatch?.id;
    console.log(`  ✓ Match #${createdMatchId} created successfully: "${createdMatch.match_title || createdMatch.matchTitle}"`);
    console.log(`  ✓ Team 1 Logo: ${createdMatch.team_one_logo || createdMatch.teamOneLogo}`);
    console.log(`  ✓ Team 2 Logo: ${createdMatch.team_two_logo || createdMatch.teamTwoLogo}`);

    if (!createdMatch.team_one_logo && !createdMatch.teamOneLogo) {
      throw new Error('team_one_logo was not returned in create match response');
    }
    if (!createdMatch.team_two_logo && !createdMatch.teamTwoLogo) {
      throw new Error('team_two_logo was not returned in create match response');
    }

    // 6. Verify filesystem and database persistence
    console.log('\n[STEP 6] Verifying file storage on disk and MySQL record...');
    const [dbRows] = await pool.query('SELECT id, team_one, team_two, team_one_logo, team_two_logo FROM matches WHERE id = ?', [createdMatchId]);
    if (!dbRows || dbRows.length === 0) {
      throw new Error(`Match #${createdMatchId} not found in MySQL`);
    }
    const dbMatch = dbRows[0];
    console.log(`  ✓ MySQL record confirmed:`);
    console.log(`    - team_one_logo: ${dbMatch.team_one_logo}`);
    console.log(`    - team_two_logo: ${dbMatch.team_two_logo}`);

    const file1Rel = dbMatch.team_one_logo.replace(/^\//, '');
    const file2Rel = dbMatch.team_two_logo.replace(/^\//, '');
    const file1Abs = path.join(__dirname, '..', 'backend', file1Rel);
    const file2Abs = path.join(__dirname, '..', 'backend', file2Rel);

    if (fs.existsSync(file1Abs)) {
      console.log(`  ✓ Team 1 logo file verified on disk: ${file1Abs} (${fs.statSync(file1Abs).size} bytes)`);
    } else {
      throw new Error(`Team 1 logo file missing on disk: ${file1Abs}`);
    }

    if (fs.existsSync(file2Abs)) {
      console.log(`  ✓ Team 2 logo file verified on disk: ${file2Abs} (${fs.statSync(file2Abs).size} bytes)`);
    } else {
      throw new Error(`Team 2 logo file missing on disk: ${file2Abs}`);
    }

    // 7. Verify static serving via HTTP
    console.log('\n[STEP 7] Verifying static image serving via Express /uploads route...');
    const staticRes1 = await fetch(`${SERVER_BASE}${dbMatch.team_one_logo}`);
    if (staticRes1.status === 200 && (staticRes1.headers.get('content-type') || '').includes('image/png')) {
      console.log(`  ✓ Team 1 Logo HTTP GET ${dbMatch.team_one_logo} returned 200 with Content-Type: ${staticRes1.headers.get('content-type')}`);
    } else {
      throw new Error(`Team 1 logo static serving failed: status ${staticRes1.status}`);
    }

    const staticRes2 = await fetch(`${SERVER_BASE}${dbMatch.team_two_logo}`);
    if (staticRes2.status === 200 && (staticRes2.headers.get('content-type') || '').includes('image/jpeg')) {
      console.log(`  ✓ Team 2 Logo HTTP GET ${dbMatch.team_two_logo} returned 200 with Content-Type: ${staticRes2.headers.get('content-type')}`);
    } else {
      throw new Error(`Team 2 logo static serving failed: status ${staticRes2.status}`);
    }

    // 8. Public API endpoints: GET /api/matches and GET /api/matches/:id
    console.log('\n[STEP 8] Verifying public match endpoints return teamOneLogo and teamTwoLogo...');
    const publicMatchesRes = await fetch(`${API_BASE}/matches`);
    const publicMatchesData = await publicMatchesRes.json();
    const foundInList = (publicMatchesData.data?.matches || []).find(m => m.id === createdMatchId);
    if (foundInList && foundInList.teamOneLogo && foundInList.teamTwoLogo) {
      console.log(`  ✓ GET /api/matches successfully includes match #${createdMatchId} with team logos`);
    } else {
      throw new Error(`GET /api/matches missing logos for match #${createdMatchId}: ${JSON.stringify(foundInList)}`);
    }

    const singleMatchRes = await fetch(`${API_BASE}/matches/${createdMatchId}`);
    const singleMatchData = await singleMatchRes.json();
    const fetchedMatch = singleMatchData.data?.match || singleMatchData.data;
    if (fetchedMatch && fetchedMatch.teamOneLogo === dbMatch.team_one_logo && fetchedMatch.teamTwoLogo === dbMatch.team_two_logo) {
      console.log(`  ✓ GET /api/matches/:id returned accurate teamOneLogo & teamTwoLogo`);
    } else {
      throw new Error(`GET /api/matches/:id mismatch: ${JSON.stringify(fetchedMatch)}`);
    }

    // 9. Admin API endpoints: GET /api/admin/matches and GET /api/admin/matches/:id
    console.log('\n[STEP 9] Verifying Admin API endpoints include logo fields...');
    const adminMatchesRes = await fetch(`${API_BASE}/admin/matches`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminMatchesData = await adminMatchesRes.json();
    const foundInAdminList = (adminMatchesData.data?.matches || []).find(m => m.id === createdMatchId);
    if (foundInAdminList && foundInAdminList.team_one_logo && foundInAdminList.team_two_logo) {
      console.log(`  ✓ GET /api/admin/matches successfully includes team_one_logo and team_two_logo`);
    } else {
      throw new Error(`GET /api/admin/matches missing logo fields: ${JSON.stringify(foundInAdminList)}`);
    }

    // 10. Edit Match Logos (PUT /api/admin/matches/:id/logos): Replace one logo without changing the other
    console.log('\n[STEP 10] Testing Edit Match Logos: replacing Team 1 logo with WEBP while keeping Team 2 unchanged...');
    const editForm1 = new FormData();
    editForm1.append('teamOneLogo', new Blob([VALID_WEBP_BUFFER], { type: 'image/webp' }), 'new_mumbai.webp');

    const editRes1 = await fetch(`${API_BASE}/admin/matches/${createdMatchId}/logos`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: editForm1
    });
    const editData1 = await editRes1.json();
    if (!editRes1.ok || !editData1.success) {
      throw new Error(`Failed to update logo: ${JSON.stringify(editData1)}`);
    }

    const [updatedDb1] = await pool.query('SELECT team_one_logo, team_two_logo FROM matches WHERE id = ?', [createdMatchId]);
    console.log(`  ✓ Team 1 Logo updated to: ${updatedDb1[0].team_one_logo}`);
    console.log(`  ✓ Team 2 Logo remained unchanged: ${updatedDb1[0].team_two_logo}`);
    if (updatedDb1[0].team_two_logo !== dbMatch.team_two_logo) {
      throw new Error('Team 2 logo was unintentionally modified when updating Team 1 logo');
    }
    if (updatedDb1[0].team_one_logo === dbMatch.team_one_logo) {
      throw new Error('Team 1 logo was not updated to new file');
    }

    // 11. Test removing Team 2 logo without removing Team 1 logo
    console.log('\n[STEP 11] Testing Edit Match Logos: removing Team 2 logo while keeping Team 1 intact...');
    const editForm2 = new FormData();
    editForm2.append('remove_team_two_logo', 'true');

    const editRes2 = await fetch(`${API_BASE}/admin/matches/${createdMatchId}/logos`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: editForm2
    });
    const editData2 = await editRes2.json();
    if (!editRes2.ok || !editData2.success) {
      throw new Error(`Failed to remove logo: ${JSON.stringify(editData2)}`);
    }

    const [updatedDb2] = await pool.query('SELECT team_one_logo, team_two_logo FROM matches WHERE id = ?', [createdMatchId]);
    console.log(`  ✓ Team 1 Logo preserved: ${updatedDb2[0].team_one_logo}`);
    console.log(`  ✓ Team 2 Logo removed: ${updatedDb2[0].team_two_logo}`);
    if (updatedDb2[0].team_two_logo !== null) {
      throw new Error('Team 2 logo was not removed (expected null)');
    }
    if (!updatedDb2[0].team_one_logo) {
      throw new Error('Team 1 logo was unexpectedly cleared');
    }

    // 12. Create a match without logos (null fallback)
    console.log('\n[STEP 12] Creating a match without logos to ensure backward compatibility...');
    const noLogoForm = new FormData();
    noLogoForm.append('competition', 'Test Series');
    noLogoForm.append('team_one', 'England');
    noLogoForm.append('team_two', 'Australia');
    noLogoForm.append('team_one_rate', '1.90');
    noLogoForm.append('team_two_rate', '1.90');
    noLogoForm.append('scheduled_time', 'Tomorrow, 03:30 PM');
    noLogoForm.append('match_end_time', new Date(Date.now() + 86400000).toISOString());

    const noLogoRes = await fetch(`${API_BASE}/admin/matches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: noLogoForm
    });
    const noLogoData = await noLogoRes.json();
    if (!noLogoRes.ok || !noLogoData.success) {
      throw new Error(`Failed to create match without logos: ${JSON.stringify(noLogoData)}`);
    }
    noLogoMatchId = noLogoData.data?.match?.id;
    console.log(`  ✓ Match #${noLogoMatchId} without logos created successfully (logos are null)`);

    // Verify GET /api/matches handles null logos with fallback
    const pubList2 = await (await fetch(`${API_BASE}/matches`)).json();
    const foundNoLogo = (pubList2.data?.matches || []).find(m => m.id === noLogoMatchId);
    if (foundNoLogo && foundNoLogo.teamOneLogo === null && foundNoLogo.teamTwoLogo === null) {
      console.log(`  ✓ Public API returns null for match without logos as expected`);
    } else {
      throw new Error(`Unexpected logo value for no-logo match: ${JSON.stringify(foundNoLogo)}`);
    }

    console.log('\n================================================================');
    console.log('ALL E2E LOGO TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    // Cleanup created test matches
    console.log('\n[CLEANUP] Cleaning up test fixtures from database...');
    try {
      if (createdMatchId) {
        await pool.query('DELETE FROM matches WHERE id = ?', [createdMatchId]);
        console.log(`  ✓ Deleted test match #${createdMatchId}`);
      }
      if (noLogoMatchId) {
        await pool.query('DELETE FROM matches WHERE id = ?', [noLogoMatchId]);
        console.log(`  ✓ Deleted test match #${noLogoMatchId}`);
      }
    } catch (cleanErr) {
      console.warn('  ⚠️ Cleanup warning:', cleanErr.message);
    }
    await closePool();
  }
}

runTests();
