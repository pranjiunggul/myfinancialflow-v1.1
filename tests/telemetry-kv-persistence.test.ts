/**
 * Automated Verification Suite: Telemetry Worker KV Persistence & Retrieval
 *
 * Verifies that:
 * 1. POST /report durably persists reports into Cloudflare KV (persisted: true)
 * 2. GET /report?id=... retrieves the exact stored record from KV
 * 3. GET /reports lists stored records chronologically
 * 4. Strict allow-list enforcement: forbidden keys (e.g. account balances, credentials) are stripped and NEVER stored
 * 5. DELETE /report?id=... cleanly purges test records from KV
 */

const TELEMETRY_URL = 'https://financeflow-telemetry.dhikaherlambang.workers.dev';

async function runTelemetryKVPersistenceTest() {
  console.log('🚀 Running Cloudflare KV Telemetry Persistence & Retrieval Verification...\n');

  const testTimestamp = Date.now();
  const testPayload = {
    errorMessage: `Verification Test Error: IndexedDB transaction abort at ${testTimestamp}`,
    stackTrace: 'Error: IndexedDB transaction abort\n    at db.ts:55:10\n    at async run (app.ts:12:3)',
    appVersion: '0.1.0-test',
    deviceType: 'desktop',
    os: 'windows',
    browser: 'chrome',
    timestamp: testTimestamp,
    // Sensitive keys that must be dropped by the worker:
    accountBalance: 50000000,
    userAccountName: 'BCA Main Savings',
    apiKey: 'sk-ant-test-secret-key-12345',
  };

  console.log('--- Step 1: Submitting Telemetry Payload with Disallowed Sensitive Keys ---');
  const postRes = await fetch(`${TELEMETRY_URL}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
  });

  if (!postRes.ok) {
    throw new Error(`Failed to POST /report: HTTP ${postRes.status} ${postRes.statusText}`);
  }

  const postData = await postRes.json();
  console.log('POST /report response:', postData);

  if (!postData.success) {
    throw new Error('Expected postData.success to be true');
  }
  if (!postData.id || !postData.id.startsWith('crash_')) {
    throw new Error(`Expected valid crash ID starting with "crash_", got: ${postData.id}`);
  }
  if (postData.persisted !== true) {
    throw new Error(`Expected postData.persisted === true (KV binding active), got: ${postData.persisted}`);
  }
  console.log('[PASS] Crash report accepted and confirmed persisted to Cloudflare KV.');

  const createdId = postData.id;

  console.log(`\n--- Step 2: Retrieving Stored Report by ID (${createdId}) ---`);
  // Small delay to ensure KV propagation across edge datacenters if needed
  await new Promise((r) => setTimeout(r, 600));

  const getRes = await fetch(`${TELEMETRY_URL}/report?id=${encodeURIComponent(createdId)}`);
  if (!getRes.ok) {
    throw new Error(`Failed to GET /report?id=${createdId}: HTTP ${getRes.status} ${getRes.statusText}`);
  }

  const getData = await getRes.json();
  console.log('GET /report?id response:', getData);

  if (!getData.success || !getData.report) {
    throw new Error('Expected getData.success to be true and report to be present');
  }

  const report = getData.report;
  if (report.id !== createdId) {
    throw new Error(`Expected report.id === "${createdId}", got: "${report.id}"`);
  }
  if (report.errorMessage !== testPayload.errorMessage) {
    throw new Error(`Expected report.errorMessage to match input, got: "${report.errorMessage}"`);
  }
  if (report.deviceType !== 'desktop' || report.os !== 'windows' || report.browser !== 'chrome') {
    throw new Error('Expected technical environment metadata to match');
  }

  console.log('\n--- Step 3: Zero-Financial-Data Guarantee Verification on Persisted Record ---');
  const allowedKeys = new Set([
    'id',
    'errorMessage',
    'stackTrace',
    'appVersion',
    'deviceType',
    'os',
    'browser',
    'timestamp',
    'storedAt',
  ]);

  const persistedKeys = Object.keys(report);
  console.log('Persisted record keys:', persistedKeys);

  const unauthorizedKeys = persistedKeys.filter((k) => !allowedKeys.has(k));
  if (unauthorizedKeys.length > 0) {
    throw new Error(`Persisted record contains unauthorized non-allowlisted keys: ${unauthorizedKeys.join(', ')}`);
  }

  if (
    report.accountBalance !== undefined ||
    report.userAccountName !== undefined ||
    report.apiKey !== undefined
  ) {
    throw new Error('CRITICAL PRIVACY VIOLATION: Disallowed financial/credential keys were stored in KV!');
  }
  console.log('[PASS] Zero-knowledge / zero-financial-data guarantee verified: Disallowed keys completely stripped.');

  console.log('\n--- Step 4: Listing Crash Reports via GET /reports ---');
  const listRes = await fetch(`${TELEMETRY_URL}/reports?limit=20`);
  if (!listRes.ok) {
    throw new Error(`Failed to GET /reports: HTTP ${listRes.status} ${listRes.statusText}`);
  }

  const listData = await listRes.json();
  console.log(`GET /reports count: ${listData.count}, items returned: ${listData.reports?.length}`);

  if (!listData.success || !Array.isArray(listData.reports)) {
    throw new Error('Expected listData.reports to be an array');
  }

  const foundInList = listData.reports.some((r: any) => r.id === createdId);
  if (!foundInList) {
    throw new Error(`Created report ${createdId} was not found in the /reports list!`);
  }
  console.log(`[PASS] Report ${createdId} successfully found in chronological /reports list.`);

  console.log(`\n--- Step 5: Clean-Up via DELETE /report?id=${createdId} ---`);
  const deleteRes = await fetch(`${TELEMETRY_URL}/report?id=${encodeURIComponent(createdId)}`, {
    method: 'DELETE',
  });
  if (!deleteRes.ok) {
    throw new Error(`Failed to DELETE /report: HTTP ${deleteRes.status} ${deleteRes.statusText}`);
  }

  const deleteData = await deleteRes.json();
  console.log('DELETE response:', deleteData);
  if (!deleteData.success || deleteData.deletedId !== createdId) {
    throw new Error(`Expected deleteData.deletedId === "${createdId}"`);
  }

  // Small delay then confirm 404
  await new Promise((r) => setTimeout(r, 600));
  const verifyDeletedRes = await fetch(`${TELEMETRY_URL}/report?id=${encodeURIComponent(createdId)}`);
  if (verifyDeletedRes.status !== 404) {
    throw new Error(`Expected 404 after deletion, got HTTP ${verifyDeletedRes.status}`);
  }
  console.log('[PASS] Report cleanly removed from KV; confirmed 404 on subsequent lookup.');

  console.log('\n🎉 ALL TELEMETRY KV PERSISTENCE & RETRIEVAL VERIFICATIONS PASSED!\n');
}

runTelemetryKVPersistenceTest().catch((err) => {
  console.error('\n❌ Telemetry KV Persistence Test Failed:', err);
  process.exit(1);
});
