export const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDLE_REDIRECT_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

const RESERVED = new Set(['admin', 'administrator', 'portal', 'vortex', 'signal', 'event', 'report', 'update', 'post', 'support', 'help', 'official', 'moderator', 'moderation', 'security', 'system', 'root', 'staff', 'news', 'verified']);
const PROHIBITED = new Set(['fuck', 'shit', 'cunt', 'nazi']);

export function normalizeHandle(value = '') {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function validateHandle(value) {
  const normalizedHandle = normalizeHandle(value);
  if (!/^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$/.test(normalizedHandle)) return { valid: false, reason: 'Use 3-24 letters, numbers or underscores. Start and end with a letter or number.' };
  if (/_{2,}/.test(normalizedHandle)) return { valid: false, reason: 'Keep underscores single.' };
  if (RESERVED.has(normalizedHandle) || PROHIBITED.has(normalizedHandle) || [...RESERVED].some((item) => normalizedHandle.startsWith(`${item}_`) || normalizedHandle.endsWith(`_${item}`))) return { valid: false, reason: 'That handle is protected or unavailable.' };
  return { valid: true, normalizedHandle };
}

export function displayHandle(value) {
  return `@${normalizeHandle(value)}`;
}
