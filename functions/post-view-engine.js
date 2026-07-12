export const VIEW_DEDUPE_MS = 24 * 60 * 60 * 1000;

export function normaliseViewerKey({ uid = '', anonymousId = '' } = {}) {
  if (uid) return { viewerId: `auth_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96)}`, viewerType: 'authenticated' };
  const safeAnonymousId = String(anonymousId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  if (safeAnonymousId.length < 12) return null;
  return { viewerId: `anon_${safeAnonymousId}`, viewerType: 'anonymous' };
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

export function shouldCountView(existingView = null, nowMs = Date.now()) {
  if (!existingView) return true;
  return nowMs - timestampMillis(existingView.lastCountedAt) >= VIEW_DEDUPE_MS;
}

export function safeDeviceType(value = '') {
  return ['desktop', 'tablet', 'mobile', 'unknown'].includes(value) ? value : 'unknown';
}
