/**
 * Device Identity & Connected Devices Management Service
 * Provides persistent device identity, user-agent parsing, friendly naming,
 * and cross-device sync manifest aggregation for single-user multi-device tracking.
 */

import { db, getOrCreateDeviceId } from '../db/database';
import type { ConnectedDeviceInfo, DeviceType } from '../types';

export function detectDeviceInfo(userAgent?: string): {
  deviceType: DeviceType;
  defaultName: string;
  browserName: string;
  osName: string;
} {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';

  // 1. Detect OS
  let osName = 'Unknown OS';
  if (/windows/i.test(ua)) osName = 'Windows';
  else if (/macintosh|mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) osName = 'macOS';
  else if (/iphone/i.test(ua)) osName = 'iPhone (iOS)';
  else if (/ipad/i.test(ua)) osName = 'iPad (iPadOS)';
  else if (/android/i.test(ua)) osName = 'Android';
  else if (/linux/i.test(ua)) osName = 'Linux';

  // 2. Detect Browser
  let browserName = 'Browser';
  if (/edg/i.test(ua)) browserName = 'Edge';
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browserName = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browserName = 'Safari';
  else if (/firefox|fxios/i.test(ua)) browserName = 'Firefox';

  // 3. Detect Device Type
  let deviceType: DeviceType = 'desktop';
  if (/tablet|ipad/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android/i.test(ua)) {
    deviceType = 'mobile';
  }

  const defaultName = `${osName} - ${browserName}`;

  return { deviceType, defaultName, browserName, osName };
}

/**
 * Get or initialize persistent local device identity
 */
export async function getLocalDeviceInfo(): Promise<ConnectedDeviceInfo> {
  const deviceId = getOrCreateDeviceId();
  const detection = detectDeviceInfo();

  const FIRST_SEEN_KEY = 'financeflow_device_first_seen';
  let firstSeenAt = Date.now();
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(FIRST_SEEN_KEY);
      if (stored) {
        firstSeenAt = parseInt(stored, 10) || firstSeenAt;
      } else {
        localStorage.setItem(FIRST_SEEN_KEY, String(firstSeenAt));
      }
    } catch {}
  }

  const settings = await db.settings.get('current');
  let customStorageName: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      customStorageName = localStorage.getItem('financeflow_device_name');
    } catch {}
  }
  const customName = settings?.deviceName || customStorageName;

  const deviceName = customName && customName !== 'FinanceFlow Device' && customName !== 'MyFinancialFlow Device'
    ? customName
    : detection.defaultName;

  return {
    deviceId,
    deviceName,
    deviceType: detection.deviceType,
    browserName: detection.browserName,
    osName: detection.osName,
    firstSeenAt,
    lastSyncAt: settings?.lastSyncedAt || Date.now(),
    isCurrentDevice: true,
  };
}

/**
 * Update user-friendly custom device name
 */
export async function updateLocalDeviceName(name: string): Promise<ConnectedDeviceInfo> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Device name cannot be empty');

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('financeflow_device_name', trimmed);
    } catch {}
  }

  await db.settings.update('current', { deviceName: trimmed });

  const info = await getLocalDeviceInfo();
  info.deviceName = trimmed;
  return info;
}

/**
 * Merge and aggregate connected devices list from sync manifest and local state
 */
export function aggregateDevicesList(
  remoteDevices: ConnectedDeviceInfo[] = [],
  currentDevice: ConnectedDeviceInfo
): ConnectedDeviceInfo[] {
  const deviceMap = new Map<string, ConnectedDeviceInfo>();

  // 1. Add remote devices
  for (const dev of remoteDevices) {
    if (!dev || !dev.deviceId) continue;
    deviceMap.set(dev.deviceId, {
      ...dev,
      isCurrentDevice: dev.deviceId === currentDevice.deviceId,
    });
  }

  // 2. Add or update current device
  const existingCurrent = deviceMap.get(currentDevice.deviceId);
  deviceMap.set(currentDevice.deviceId, {
    ...currentDevice,
    // Keep custom name if user renamed
    deviceName: currentDevice.deviceName || existingCurrent?.deviceName || currentDevice.deviceName,
    lastSyncAt: Math.max(currentDevice.lastSyncAt || 0, existingCurrent?.lastSyncAt || 0),
    isCurrentDevice: true,
  });

  // 3. Sort: current device first, then by lastSyncAt descending
  return Array.from(deviceMap.values()).sort((a, b) => {
    if (a.isCurrentDevice && !b.isCurrentDevice) return -1;
    if (!a.isCurrentDevice && b.isCurrentDevice) return 1;
    return (b.lastSyncAt || 0) - (a.lastSyncAt || 0);
  });
}
