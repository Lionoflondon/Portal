export const EVENT_LIFECYCLE_STATES = ['Scheduled', 'Live', 'Ending', 'Canonised', 'Archived'];

export const HISTORICAL_LOCKED_FIELDS = [
  'title',
  'description',
  'summary',
  'timeline',
  'category',
  'tags',
  'locationSummary',
  'primaryLocation',
  'coordinates',
  'media',
  'participants',
  'statistics',
  'metadata',
  'parentEventId',
  'childEventIds',
  'relatedEventIds',
  'storyGraphEventIds',
  'organiserUid',
  'organizerUid',
  'createdBy',
  'authorUid',
  'canonisedAt',
];

export const SOCIAL_LOCK_FIELDS = {
  commentsEnabled: false,
  repliesEnabled: false,
  reactionsEnabled: false,
  mediaUploadsEnabled: false,
  timelineEditsEnabled: false,
  metadataEditsEnabled: false,
  creatorEditsEnabled: false,
  notificationsEnabled: false,
  recommendationsEnabled: false,
  liveMapEnabled: false,
};

const DEFAULT_DURATIONS_MS = {
  breaking_news: 24 * 60 * 60 * 1000,
  traffic_incident: 12 * 60 * 60 * 1000,
  community_event: 7 * 24 * 60 * 60 * 1000,
  concert: 24 * 60 * 60 * 1000,
  festival: 48 * 60 * 60 * 1000,
  sport: 24 * 60 * 60 * 1000,
  sports: 24 * 60 * 60 * 1000,
  general_event: 7 * 24 * 60 * 60 * 1000,
};

export function normaliseEventType(value = '') {
  const normalised = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalised === 'breaking_news' || normalised === 'live_incident') return 'breaking_news';
  if (normalised === 'traffic' || normalised === 'travel' || normalised === 'transport') return 'traffic_incident';
  if (normalised === 'community') return 'community_event';
  if (normalised === 'sports') return 'sports';
  if (normalised === 'public_event' || normalised === 'other' || !normalised) return 'general_event';
  return normalised;
}

export function durationForEvent(event = {}, config = {}) {
  const durations = { ...DEFAULT_DURATIONS_MS, ...(config.durationsMs || {}) };
  const key = normaliseEventType(event.eventType || event.category || event.type);
  return durations[key] || durations.general_event;
}

export function toDate(value, fallback = null) {
  if (!value) return fallback;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function computeStartAt(event = {}, now = new Date()) {
  return toDate(event.startAt, null)
    || toDate(event.startTime, null)
    || (event.date ? toDate(`${event.date}T${event.time || '00:00'}`, null) : null)
    || toDate(event.publishedAt, null)
    || toDate(event.createdAt, null)
    || now;
}

export function computeExpiresAt(event = {}, config = {}, now = new Date()) {
  const startAt = computeStartAt(event, now);
  const supplied = toDate(event.expiresAt, null);
  const maxDuration = Number(config.maxDurationMs || 366 * 24 * 60 * 60 * 1000);
  const minDuration = Number(config.minDurationMs || 30 * 60 * 1000);
  const defaultExpiry = new Date(startAt.getTime() + durationForEvent(event, config));
  if (!supplied) return defaultExpiry;
  const min = new Date(startAt.getTime() + minDuration);
  const max = new Date(startAt.getTime() + maxDuration);
  if (supplied < min) return min;
  if (supplied > max) return max;
  return supplied;
}

export function lifecycleForEvent(event = {}, now = new Date()) {
  const current = event.lifecycleState || legacyLifecycleState(event);
  if (['Canonised', 'Archived'].includes(current)) return current;
  const startAt = computeStartAt(event, now);
  const expiresAt = computeExpiresAt(event, {}, now);
  if (now < startAt) return 'Scheduled';
  if (now >= expiresAt) return 'Canonised';
  const endingWindowMs = Math.min(6 * 60 * 60 * 1000, Math.max(30 * 60 * 1000, (expiresAt.getTime() - startAt.getTime()) * 0.1));
  if (expiresAt.getTime() - now.getTime() <= endingWindowMs) return 'Ending';
  return 'Live';
}

export function legacyLifecycleState(event = {}) {
  if (event.lifecycleState) return event.lifecycleState;
  if (event.archived === true || String(event.status || '').toLowerCase() === 'historic') return 'Archived';
  if (['Upcoming', 'Scheduled'].includes(event.status)) return 'Scheduled';
  return 'Live';
}

export function assertOneWayTransition(from, to) {
  const fromIndex = EVENT_LIFECYCLE_STATES.indexOf(from);
  const toIndex = EVENT_LIFECYCLE_STATES.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex >= fromIndex;
}

export function isCanonised(event = {}) {
  return ['Canonised', 'Archived'].includes(event.lifecycleState) || event.canonised === true;
}

export function isSocialLocked(event = {}) {
  return isCanonised(event) || event.socialLocked === true;
}

export function archiveSearchMetadata(event = {}, now = new Date()) {
  const startAt = computeStartAt(event, now);
  return {
    archiveYear: startAt.getUTCFullYear(),
    archiveMonth: startAt.getUTCMonth() + 1,
    archiveDate: startAt.toISOString().slice(0, 10),
    archiveCountry: event.country || null,
    archiveCity: event.city || event.locationSummary || null,
    archiveCategory: event.category || event.eventType || 'Other',
    archiveTopics: Array.from(new Set([...(event.tags || []), event.category, event.eventType].filter(Boolean).map((item) => String(item).toLowerCase()))),
    permanentUrl: `/events/${event.eventId || event.id || ''}`,
  };
}

export function canonisationPatch(event = {}, stats = {}, now = new Date()) {
  const startAt = computeStartAt(event, now);
  const expiresAt = computeExpiresAt(event, {}, now);
  return {
    lifecycleState: 'Canonised',
    status: 'Historic',
    archived: true,
    canonised: true,
    socialLocked: true,
    immutable: true,
    liveFeedEligible: false,
    currentEventEligible: false,
    recommendationEligible: false,
    ...SOCIAL_LOCK_FIELDS,
    startAt,
    expiresAt,
    canonisedAt: now,
    updatedAt: now,
    finalStatistics: stats,
    statistics: stats,
    historicalMetadata: archiveSearchMetadata(event, now),
    lockedFields: HISTORICAL_LOCKED_FIELDS,
  };
}

export function changedLockedFields(before = {}, after = {}) {
  return HISTORICAL_LOCKED_FIELDS.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

export function ordinaryEditAllowed(before = {}, after = {}) {
  if (!isCanonised(before)) return true;
  return changedLockedFields(before, after).length === 0;
}

export function overrideAuditPayload({ adminUid, eventId, reason, caseId, before = {}, after = {}, startedAt = new Date(), endedAt = new Date(), action = 'historical_override' }) {
  const fieldsChanged = changedLockedFields(before, after);
  return {
    system: 'portal_historical_canonisation',
    action,
    entityType: 'event',
    eventId,
    actorUid: adminUid,
    reason,
    caseId: caseId || null,
    fieldsChanged,
    previousValues: Object.fromEntries(fieldsChanged.map((field) => [field, before[field] ?? null])),
    newValues: Object.fromEntries(fieldsChanged.map((field) => [field, after[field] ?? null])),
    overrideStartedAt: startedAt,
    overrideEndedAt: endedAt,
    overrideDurationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    immutable: true,
  };
}
