/**
 * Google Drive Sync Client for MyFinancialFlow V1.1
 * Uses Google Identity Services (GIS) token client and direct Google Drive v3 REST API.
 * 
 * V1.1 Architecture:
 * - Operates under `drive.file` scope (transparent, visible folder; strictly restricted
 *   to files and folders created by this application).
 * - Stores readable, human-verifiable structured JSON data files in "MyFinancialFlow Data/".
 * - Stores viewable receipt images in "MyFinancialFlow Data/Receipts/YYYY-MM/".
 * - Lightweight Tamper-Evidence: Computes per-file SHA-256 checksums and an authenticated
 *   tamper seal across manifest.json and data files, detecting unauthorized external edits
 *   (especially to the Google Account Lock `approvedAccountId`).
 */

import {
  computeSha256Hex,
  computeHmacSha256,
} from './crypto';
import type { SyncManifest, SyncPayloadData, ReceiptAttachment } from '../types';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
          revoke?: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// V1.1 Scope: Visible files created by app
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file email';
// Legacy appDataFolder scope preserved for fallback reference
export const LEGACY_APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata email';

export const ROOT_FOLDER_NAME = 'MyFinancialFlow Data';
export const RECEIPTS_FOLDER_NAME = 'Receipts';

export const MANIFEST_FILE_NAME = 'manifest.json';
export const TRANSACTIONS_FILE_NAME = 'transactions.json';
export const ACCOUNTS_FILE_NAME = 'accounts.json';
export const CATEGORIES_FILE_NAME = 'categories.json';
export const GOALS_FILE_NAME = 'goals.json';
export const INVESTMENTS_FILE_NAME = 'investments.json';
export const METADATA_FILE_NAME = 'metadata.json';

// In-memory token cache
let currentAccessToken: string | null = null;
let tokenExpiresAt = 0;

export function getCachedAccessToken(): string | null {
  if (currentAccessToken && Date.now() < tokenExpiresAt) {
    return currentAccessToken;
  }
  return null;
}

export function setCachedAccessToken(token: string | null, expiresInSeconds: number = 3500): void {
  currentAccessToken = token;
  tokenExpiresAt = token ? Date.now() + expiresInSeconds * 1000 : 0;
}

/**
 * Dynamically loads the Google Identity Services (GIS) client script if not already present
 */
export async function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Request an OAuth2 Access Token for Google Drive using the `drive.file` scope
 */
export async function requestGoogleDriveAuth(clientId: string): Promise<string> {
  await loadGisScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is not available in this environment.');
  }

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Google authentication failed: ${resp.error}`));
        } else if (resp.access_token) {
          setCachedAccessToken(resp.access_token);
          resolve(resp.access_token);
        } else {
          reject(new Error('No access token received from Google Identity Services.'));
        }
      },
    });

    client.requestAccessToken();
  });
}

/**
 * Fetch profile info of the authenticated Google user (email, name, and unique Google account ID)
 */
export async function fetchGoogleProfile(
  accessToken: string,
  fetchFn = fetch
): Promise<{ email: string; name: string; id: string }> {
  // Strategy 1: Drive about endpoint
  try {
    const driveResp = await fetchFn('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (driveResp.ok) {
      const data = await driveResp.json();
      if (data.user?.emailAddress) {
        return {
          email: data.user.emailAddress,
          name: data.user.displayName || 'Google User',
          id: data.user.permissionId || data.user.emailAddress,
        };
      }
    }
  } catch (err) {
    console.warn('Drive about user fetch failed:', err);
  }

  // Strategy 2: OAuth2 userinfo endpoint
  try {
    const resp = await fetchFn(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        email: data.email || 'Google User',
        name: data.name || 'Google User',
        id: data.sub || data.id || data.email || 'unknown_google_id',
      };
    }
  } catch (err) {
    console.warn('Userinfo fetch failed:', err);
  }

  // Fallback
  return {
    email: 'Connected Google Account',
    name: 'Google User',
    id: 'fallback_google_account_id',
  };
}

/**
 * Helper to check API errors with friendly Indonesian messaging for unenabled Drive API
 */
function handleDriveApiError(resp: Response, detail: string, actionName: string): never {
  if (resp.status === 403) {
    throw new Error(
      detail ||
      'Google Drive API belum diaktifkan di Google Cloud Console. Silakan aktifkan "Google Drive API" di Google Cloud Console lalu coba lagi.'
    );
  }
  throw new Error(`Drive ${actionName} failed: ${resp.status} ${detail || resp.statusText}`);
}

/**
 * Find or create a folder in visible Google Drive
 */
export async function getOrCreateDriveFolder(
  folderName: string,
  parentId?: string,
  accessToken: string = '',
  fetchFn = fetch
): Promise<{ id: string; name: string }> {
  const parentQuery = parentId ? `'${parentId}' in parents and ` : '';
  const q = encodeURIComponent(
    `${parentQuery}mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`
  );
  const searchUrl = `${DRIVE_API_URL}?q=${q}&fields=files(id,name)`;

  const searchResp = await fetchFn(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchResp.ok) {
    let detail = '';
    try {
      const err = await searchResp.json();
      detail = err?.error?.message || '';
    } catch {}
    handleDriveApiError(searchResp, detail, 'folder search');
  }

  const searchData = await searchResp.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }

  // Create folder
  const createResp = await fetchFn(DRIVE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!createResp.ok) {
    let detail = '';
    try {
      const err = await createResp.json();
      detail = err?.error?.message || '';
    } catch {}
    handleDriveApiError(createResp, detail, 'folder creation');
  }

  return await createResp.json();
}

/**
 * Find a file in a specific folder by name
 */
export async function findFileInFolder(
  filename: string,
  folderId: string,
  accessToken: string,
  fetchFn = fetch
): Promise<{ id: string; name: string; modifiedTime: string; webViewLink?: string; webContentLink?: string } | null> {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${filename}' and trashed = false`);
  const url = `${DRIVE_API_URL}?q=${q}&fields=files(id,name,modifiedTime,size,webViewLink,webContentLink)`;

  const resp = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const err = await resp.json();
      detail = err?.error?.message || '';
    } catch {}
    handleDriveApiError(resp, detail, 'file search');
  }

  const data = await resp.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

/**
 * Download file content as text
 */
export async function downloadFileContent(
  fileId: string,
  accessToken: string,
  fetchFn = fetch
): Promise<string> {
  const url = `${DRIVE_API_URL}/${fileId}?alt=media`;
  const resp = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const err = await resp.json();
      detail = err?.error?.message || '';
    } catch {}
    handleDriveApiError(resp, detail, 'file download');
  }

  return await resp.text();
}

/**
 * Upload or update a text/JSON file in a specific Drive folder
 */
export async function uploadFileToFolder(
  filename: string,
  folderId: string,
  content: string,
  accessToken: string,
  contentType = 'application/json',
  fetchFn = fetch
): Promise<{ id: string; name: string; webViewLink?: string; webContentLink?: string }> {
  const existing = await findFileInFolder(filename, folderId, accessToken, fetchFn);

  if (existing) {
    const updateUrl = `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=media&fields=id,name,webViewLink,webContentLink`;
    const resp = await fetchFn(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: content,
    });

    if (!resp.ok) {
      let detail = '';
      try {
        const err = await resp.json();
        detail = err?.error?.message || '';
      } catch {}
      handleDriveApiError(resp, detail, 'file update');
    }

    const resJson = await resp.json();
    return {
      id: resJson.id || existing.id,
      name: filename,
      webViewLink: resJson.webViewLink || existing.webViewLink,
      webContentLink: resJson.webContentLink || existing.webContentLink,
    };
  } else {
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: contentType,
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${contentType}\r\n\r\n` +
      content +
      closeDelimiter;

    const createUrl = `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`;
    const resp = await fetchFn(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!resp.ok) {
      let detail = '';
      try {
        const err = await resp.json();
        detail = err?.error?.message || '';
      } catch {}
      handleDriveApiError(resp, detail, 'file creation');
    }

    const resJson = await resp.json();
    return resJson;
  }
}

/**
 * Upload receipt image to Google Drive in folder "MyFinancialFlow Data/Receipts/YYYY-MM/"
 */
export async function uploadReceiptImageToDrive(
  receipt: ReceiptAttachment,
  txDate: string,
  accessToken: string,
  fetchFn = fetch
): Promise<{ fileId: string; webViewLink: string; webContentLink: string; yearMonth: string }> {
  // 1. Get or create root folder
  const rootFolder = await getOrCreateDriveFolder(ROOT_FOLDER_NAME, undefined, accessToken, fetchFn);

  // 2. Get or create Receipts folder
  const receiptsFolder = await getOrCreateDriveFolder(RECEIPTS_FOLDER_NAME, rootFolder.id, accessToken, fetchFn);

  // 3. Determine Year-Month folder
  const yearMonth = txDate && txDate.length >= 7 ? txDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const monthlyFolder = await getOrCreateDriveFolder(yearMonth, receiptsFolder.id, accessToken, fetchFn);

  // 4. Filename
  const filename = `rcpt_${receipt.transactionId || receipt.id}.jpg`;

  // 5. Check if already uploaded
  const existing = await findFileInFolder(filename, monthlyFolder.id, accessToken, fetchFn);
  if (existing && existing.webViewLink) {
    return {
      fileId: existing.id,
      webViewLink: existing.webViewLink,
      webContentLink: existing.webContentLink || existing.webViewLink,
      yearMonth,
    };
  }

  // 6. Upload image payload
  const rawData = receipt.dataBase64 || '';
  const base64Data = rawData.includes(',') ? rawData.split(',')[1] : rawData;
  const mimeType = receipt.mimeType || 'image/jpeg';

  const boundary = '-------receiptuploadboundary98765';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: filename,
    parents: [monthlyFolder.id],
    mimeType,
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const createUrl = `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`;
  const resp = await fetchFn(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const err = await resp.json();
      detail = err?.error?.message || '';
    } catch {}
    handleDriveApiError(resp, detail, 'receipt image upload');
  }

  const resJson = await resp.json();
  const webViewLink = resJson.webViewLink || `https://drive.google.com/file/d/${resJson.id}/view`;
  const webContentLink = resJson.webContentLink || webViewLink;

  return {
    fileId: resJson.id,
    webViewLink,
    webContentLink,
    yearMonth,
  };
}

/**
 * Result of tamper-evidence verification on read
 */
export interface TamperStatus {
  ok: boolean;
  accountLockValid: boolean;
  accountLockMismatchReason?: string;
  mismatches: string[];
  externalEditsDetected: boolean;
}

/**
 * Upload visible, human-readable structured JSON files to Google Drive with Tamper-Evidence
 */
export async function uploadVisibleSyncToDrive(
  manifest: SyncManifest,
  payloadData: SyncPayloadData,
  masterPin: string,
  accessToken: string,
  fetchFn = fetch
): Promise<{ rootFolderId: string }> {
  // 1. Root folder: "MyFinancialFlow Data"
  const rootFolder = await getOrCreateDriveFolder(ROOT_FOLDER_NAME, undefined, accessToken, fetchFn);

  // 2. Prepare structured readable JSON strings
  const txContent = JSON.stringify(payloadData.tables?.transactions || (payloadData as any).transactions || [], null, 2);
  const accContent = JSON.stringify(payloadData.tables?.accounts || (payloadData as any).accounts || [], null, 2);
  const catContent = JSON.stringify(payloadData.tables?.categories || (payloadData as any).categories || [], null, 2);
  const goalsContent = JSON.stringify(payloadData.tables?.financial_goals || (payloadData as any).financial_goals || [], null, 2);
  const invContent = JSON.stringify(
    {
      investment_assets: payloadData.tables?.investment_assets || (payloadData as any).investment_assets || [],
      asset_valuations: payloadData.tables?.asset_valuations || (payloadData as any).asset_valuations || [],
    },
    null,
    2
  );
  const metaContent = JSON.stringify(
    {
      debts_receivables: payloadData.tables?.debts_receivables || (payloadData as any).debts_receivables || [],
      debt_payments: payloadData.tables?.debt_payments || (payloadData as any).debt_payments || [],
      recurring_rules: payloadData.tables?.recurring_rules || (payloadData as any).recurring_rules || [],
      subscription_patterns: payloadData.tables?.subscription_patterns || (payloadData as any).subscription_patterns || [],
      achievements: payloadData.tables?.achievements || (payloadData as any).achievements || [],
    },
    null,
    2
  );

  // 3. Compute per-file SHA-256 Checksums for Tamper Evidence
  const fileChecksums: Record<string, string> = {
    [TRANSACTIONS_FILE_NAME]: await computeSha256Hex(txContent),
    [ACCOUNTS_FILE_NAME]: await computeSha256Hex(accContent),
    [CATEGORIES_FILE_NAME]: await computeSha256Hex(catContent),
    [GOALS_FILE_NAME]: await computeSha256Hex(goalsContent),
    [INVESTMENTS_FILE_NAME]: await computeSha256Hex(invContent),
    [METADATA_FILE_NAME]: await computeSha256Hex(metaContent),
  };

  // 4. Compute Authenticated Tamper Seals
  const approvedAccountId = manifest.approvedAccountId || '';
  const accountSeal = await computeHmacSha256(approvedAccountId, masterPin);

  const checksumChain = Object.keys(fileChecksums)
    .sort()
    .map((k) => `${k}:${fileChecksums[k]}`)
    .join('|');
  const tamperSealPayload = `${manifest.activeRevisionId}|${approvedAccountId}|${checksumChain}`;
  const tamperSeal = await computeHmacSha256(tamperSealPayload, masterPin);

  // Update manifest with integrity metadata
  manifest.fileChecksums = fileChecksums;
  manifest.approvedAccountSeal = accountSeal;
  manifest.tamperSeal = tamperSeal;
  manifest.updatedAt = Date.now();

  const manifestContent = JSON.stringify(manifest, null, 2);

  // 5. Upload structured readable data files
  await uploadFileToFolder(TRANSACTIONS_FILE_NAME, rootFolder.id, txContent, accessToken, 'application/json', fetchFn);
  await uploadFileToFolder(ACCOUNTS_FILE_NAME, rootFolder.id, accContent, accessToken, 'application/json', fetchFn);
  await uploadFileToFolder(CATEGORIES_FILE_NAME, rootFolder.id, catContent, accessToken, 'application/json', fetchFn);
  await uploadFileToFolder(GOALS_FILE_NAME, rootFolder.id, goalsContent, accessToken, 'application/json', fetchFn);
  await uploadFileToFolder(INVESTMENTS_FILE_NAME, rootFolder.id, invContent, accessToken, 'application/json', fetchFn);
  await uploadFileToFolder(METADATA_FILE_NAME, rootFolder.id, metaContent, accessToken, 'application/json', fetchFn);

  // 6. Upload manifest.json
  await uploadFileToFolder(MANIFEST_FILE_NAME, rootFolder.id, manifestContent, accessToken, 'application/json', fetchFn);

  return { rootFolderId: rootFolder.id };
}

/**
 * Download and parse visible structured JSON files from Google Drive with Tamper Verification
 */
export async function downloadVisibleSyncFromDrive(
  masterPin: string,
  accessToken: string,
  fetchFn = fetch
): Promise<{
  manifest: SyncManifest | null;
  payload: SyncPayloadData | null;
  tamperStatus: TamperStatus;
}> {
  const defaultStatus: TamperStatus = {
    ok: true,
    accountLockValid: true,
    mismatches: [],
    externalEditsDetected: false,
  };

  // 1. Search for root folder "MyFinancialFlow Data"
  const q = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${ROOT_FOLDER_NAME}' and trashed = false`);
  const searchUrl = `${DRIVE_API_URL}?q=${q}&fields=files(id,name)`;
  const folderResp = await fetchFn(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!folderResp.ok) {
    return { manifest: null, payload: null, tamperStatus: defaultStatus };
  }

  const folderData = await folderResp.json();
  if (!folderData.files || folderData.files.length === 0) {
    return { manifest: null, payload: null, tamperStatus: defaultStatus };
  }
  const rootFolderId = folderData.files[0].id;

  // 2. Find manifest.json
  const manifestFile = await findFileInFolder(MANIFEST_FILE_NAME, rootFolderId, accessToken, fetchFn);
  if (!manifestFile) {
    return { manifest: null, payload: null, tamperStatus: defaultStatus };
  }

  const manifestRaw = await downloadFileContent(manifestFile.id, accessToken, fetchFn);
  let manifest: SyncManifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return {
      manifest: null,
      payload: null,
      tamperStatus: {
        ok: false,
        accountLockValid: false,
        accountLockMismatchReason: 'manifest.json is corrupted or not valid JSON.',
        mismatches: [MANIFEST_FILE_NAME],
        externalEditsDetected: true,
      },
    };
  }

  // 3. Verify Account Lock Seal
  let accountLockValid = true;
  let accountLockMismatchReason: string | undefined;
  if (manifest.approvedAccountId && manifest.approvedAccountSeal && masterPin) {
    const expectedAccountSeal = await computeHmacSha256(manifest.approvedAccountId, masterPin);
    if (manifest.approvedAccountSeal !== expectedAccountSeal) {
      accountLockValid = false;
      accountLockMismatchReason =
        'Remote Google Account Lock was altered outside MyFinancialFlow. Authenticated tamper seal mismatch.';
    }
  }

  // 4. Download and verify content of data files
  const fileChecksums = manifest.fileChecksums || {};
  const mismatches: string[] = [];

  const downloadTable = async <T>(filename: string): Promise<T | null> => {
    const file = await findFileInFolder(filename, rootFolderId, accessToken, fetchFn);
    if (!file) return null;
    const content = await downloadFileContent(file.id, accessToken, fetchFn);

    // Check integrity hash if recorded in manifest
    if (fileChecksums[filename]) {
      const computedHash = await computeSha256Hex(content);
      if (computedHash !== fileChecksums[filename]) {
        mismatches.push(filename);
      }
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      mismatches.push(filename);
      return null;
    }
  };

  const transactions = (await downloadTable<any[]>(TRANSACTIONS_FILE_NAME)) || [];
  const accounts = (await downloadTable<any[]>(ACCOUNTS_FILE_NAME)) || [];
  const categories = (await downloadTable<any[]>(CATEGORIES_FILE_NAME)) || [];
  const goals = (await downloadTable<any[]>(GOALS_FILE_NAME)) || [];
  const investmentsData = (await downloadTable<{ investment_assets?: any[]; asset_valuations?: any[] }>(INVESTMENTS_FILE_NAME)) || {};
  const metaData = (await downloadTable<{
    debts_receivables?: any[];
    debt_payments?: any[];
    recurring_rules?: any[];
    subscription_patterns?: any[];
    achievements?: any[];
  }>(METADATA_FILE_NAME)) || {};

  const tableData = {
    accounts,
    categories,
    transactions,
    debts_receivables: metaData.debts_receivables || [],
    debt_payments: metaData.debt_payments || [],
    recurring_rules: metaData.recurring_rules || [],
    subscription_patterns: metaData.subscription_patterns || [],
    financial_goals: goals,
    investment_assets: investmentsData.investment_assets || [],
    asset_valuations: investmentsData.asset_valuations || [],
    achievements: metaData.achievements || [],
  };

  const payload: SyncPayloadData = {
    deviceId: manifest.deviceId || 'remote_device',
    deviceName: manifest.deviceName || 'Remote Device',
    timestamp: manifest.lastSyncTimestamp || Date.now(),
    schemaVersion: manifest.schemaVersion || 8,
    approvedAccountId: manifest.approvedAccountId,
    approvedAccountEmail: manifest.approvedAccountEmail,
    tables: tableData,
    ...tableData,
  };

  const externalEditsDetected = mismatches.length > 0 || !accountLockValid;
  const tamperStatus: TamperStatus = {
    ok: !externalEditsDetected,
    accountLockValid,
    accountLockMismatchReason,
    mismatches,
    externalEditsDetected,
  };

  return { manifest, payload, tamperStatus };
}

/**
 * Backward compatibility wrappers
 */
export async function uploadEncryptedSyncToDrive(
  manifest: SyncManifest,
  payloadData: SyncPayloadData,
  masterPin: string,
  accessToken: string,
  fetchFn = fetch
): Promise<void> {
  // In V1.1, transparent visible sync replaces the old encrypted blob
  await uploadVisibleSyncToDrive(manifest, payloadData, masterPin, accessToken, fetchFn);
}

export async function downloadEncryptedSyncFromDrive(
  masterPin: string,
  accessToken: string,
  fetchFn = fetch
): Promise<{
  manifest: SyncManifest | null;
  payload: SyncPayloadData | null;
  tamperStatus?: TamperStatus;
}> {
  return await downloadVisibleSyncFromDrive(masterPin, accessToken, fetchFn);
}
