/**
 * Privacy-Preserving Crash & Error Reporting Service
 *
 * =========================================================================================
 * ARCHITECTURAL CODING CONVENTION (MANDATORY FOR ALL CURRENT & FUTURE CODEBASE MAINTAINERS):
 * Error messages thrown anywhere in this application MUST NEVER interpolate user or
 * financial data values into the message string (e.g. do NOT write `Failed to parse amount: ${val}`
 * or `Account not found: ${account.name}`).
 *
 * All errors must remain strictly technical and generic (e.g. "Failed to parse numeric amount in transaction"
 * or "Account ID not found in database").
 *
 * This preserves the "Zero Financial Data Guarantee" at the source, preventing sensitive financial
 * values from ever leaking into stack traces or error logging pipelines.
 * =========================================================================================
 */

import { db } from '../db/database';
import { detectDeviceInfo } from './device';

export const TELEMETRY_WORKER_URL = 'https://financeflow-telemetry.dhikaherlambang.workers.dev/report';
export const TELEMETRY_REPORTS_URL = 'https://financeflow-telemetry.dhikaherlambang.workers.dev/reports';

export interface StoredCrashReport extends TelemetryPayload {
  id: string;
  storedAt: number;
}

export interface TelemetryReportsResponse {
  success: boolean;
  count: number;
  reports: StoredCrashReport[];
}

/**
 * Retrieves persisted crash reports from the Cloudflare KV-backed telemetry worker.
 * Strictly returns allow-listed technical crash logs.
 */
export async function fetchStoredCrashReports(
  authToken?: string,
  limit = 50,
  fetchFn = fetch
): Promise<StoredCrashReport[]> {
  try {
    const url = new URL(TELEMETRY_REPORTS_URL);
    url.searchParams.set('limit', String(limit));

    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetchFn(url.toString(), { method: 'GET', headers });
    if (!res.ok) return [];

    const data: TelemetryReportsResponse = await res.json();
    return data.reports || [];
  } catch (err) {
    console.warn('[Telemetry] Failed to fetch stored reports:', err);
    return [];
  }
}

/**
 * Deletes a persisted crash report from Cloudflare KV by ID.
 */
export async function deleteStoredCrashReport(
  id: string,
  authToken?: string,
  fetchFn = fetch
): Promise<boolean> {
  try {
    const url = new URL('https://financeflow-telemetry.dhikaherlambang.workers.dev/report');
    url.searchParams.set('id', id);

    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetchFn(url.toString(), { method: 'DELETE', headers });
    return res.ok;
  } catch (err) {
    console.warn('[Telemetry] Failed to delete report:', err);
    return false;
  }
}

export interface TelemetryPayload {
  errorMessage: string;
  stackTrace: string;
  appVersion: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser: string;
  timestamp: number;
}

/**
 * Strips potential URL parameters or file paths from stack traces for maximum privacy
 */
export function sanitizeStackTrace(stack = ''): string {
  return stack
    .replace(/\?.*?(?=[":\s])/g, '') // Strip query params
    .replace(/[a-zA-Z0-9_\-./]+(?=:)/g, (match) => {
      // Retain only basename of source files
      const parts = match.split(/[/\\]/);
      return parts[parts.length - 1];
    })
    .slice(0, 1500);
}

/**
 * Builds an allow-listed telemetry payload strictly from Error metadata and device info.
 * NEVER accepts or serializes application state, transactions, balances, or user inputs.
 */
export function buildSanitizedTelemetryPayload(err: any): TelemetryPayload {
  const deviceInfo = detectDeviceInfo();
  const rawMessage = typeof err === 'string' ? err : err?.message || 'Unknown runtime error';

  return {
    errorMessage: String(rawMessage).slice(0, 500),
    stackTrace: sanitizeStackTrace(err?.stack || ''),
    appVersion: '0.1.0',
    deviceType: deviceInfo.deviceType,
    os: deviceInfo.osName || 'unknown',
    browser: deviceInfo.browserName || 'unknown',
    timestamp: Date.now(),
  };
}

/**
 * Sends a crash report if the user has explicitly opted in
 */
export async function reportClientError(
  err: any,
  workerUrl = TELEMETRY_WORKER_URL,
  fetchFn = fetch
): Promise<boolean> {
  try {
    const settings = await db.settings.get('current');
    if (!settings || !settings.crashReportingEnabled) {
      // Default is OFF — never report unless user explicitly opted in
      return false;
    }

    const payload = buildSanitizedTelemetryPayload(err);

    const response = await fetchFn(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Version': payload.appVersion,
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch (sendErr) {
    console.warn('[Telemetry] Error reporting failed to send:', sendErr);
    return false;
  }
}

/**
 * Initializes global unhandled rejection & window error listeners
 */
export function initializeGlobalTelemetryListeners(): () => void {
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportClientError(event.reason);
  };

  const handleWindowError = (event: ErrorEvent) => {
    reportClientError(event.error || event.message);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    }
  };
}
