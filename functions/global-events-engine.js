export const EVENT_STATUSES = ['Breaking', 'Developing', 'Confirmed', 'Resolved', 'Historic'];
export const CONFIDENCE_LABELS = ['Emerging', 'Corroborated', 'Confirmed', 'Disputed'];
export const TIMELINE_ENTRY_TYPES = [
  'event_detected',
  'official_notice',
  'structured_fact',
  'score_update',
  'weather_warning',
  'transport_update',
  'Signal',
  'Report',
  'Update',
  'Post',
  'media',
  'correction',
  'contradiction',
  'status_change',
  'relationship_created',
  'event_resolved',
  'event_archived',
];

const STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'into', 'of', 'on', 'the', 'to', 'with']);
const BLOCKED_PLACEHOLDER_PATTERNS = [
  /\bearthquake\b/i,
  /^m\s+\d+(?:\.\d+)?\s*-/i,
  /\bnoda,? japan\b/i,
  /\bfalse pass,? alaska\b/i,
  /\bloyalty islands\b/i,
];

export function normaliseEventText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(' ');
}

export function candidateKey(candidate = {}) {
  return `${candidate.provider}:${candidate.providerItemId}`;
}

export function normaliseCandidate(input = {}) {
  const provider = String(input.provider || '').trim();
  const providerItemId = String(input.providerItemId || input.id || input.sourceUrl || '').trim();
  const title = String(input.title || input.headline || '').trim();
  if (!provider || !providerItemId || !title) throw new Error('Candidate requires provider, providerItemId and title.');
  return {
    provider,
    providerItemId,
    title,
    summary: String(input.summary || '').trim(),
    sourceUrl: String(input.sourceUrl || '').trim(),
    publishedAt: input.publishedAt || input.publicationTimestamp || null,
    updatedAt: input.updatedAt || null,
    locationText: String(input.locationText || input.location || '').trim(),
    coordinates: input.coordinates || null,
    category: input.category || 'World',
    mediaPreview: input.mediaPreview || null,
    sourceTrust: input.sourceTrust || { tier: 'publisher', reputation: 'standard' },
    structuredData: input.structuredData || null,
    sourceName: input.sourceName || provider,
    fingerprint: normaliseEventText(`${title} ${input.locationText || ''} ${input.category || ''}`),
  };
}

export function titleSimilarity(left = '', right = '') {
  const a = new Set(normaliseEventText(left).split(' ').filter(Boolean));
  const b = new Set(normaliseEventText(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function sameHappening(candidate, event = {}) {
  const similarity = titleSimilarity(candidate.title, event.title);
  const categoryMatch = !event.category || !candidate.category || event.category === candidate.category;
  const locationMatch = !event.locationSummary || !candidate.locationText || normaliseEventText(event.locationSummary) === normaliseEventText(candidate.locationText);
  const eventTime = timestampMs(event.startTime || event.publishedAt || event.createdAt);
  const candidateTime = timestampMs(candidate.publishedAt);
  const closeTime = !eventTime || !candidateTime || Math.abs(eventTime - candidateTime) <= 36 * 60 * 60 * 1000;
  return similarity >= 0.55 && categoryMatch && locationMatch && closeTime;
}

export function dedupeDecision(candidate, events = []) {
  const exact = events.find((event) => sameHappening(candidate, event));
  if (exact) return { action: 'cluster_story', eventId: exact.id };
  const possible = events.find((event) => titleSimilarity(candidate.title, event.title) >= 0.35);
  if (possible) return { action: 'review', eventId: possible.id };
  return { action: 'create' };
}

export function confidenceFromSignals({ sourceCount = 0, officialSourceCount = 0, verifiedReportCount = 0, contradictionCount = 0, custodianConfirmed = false } = {}) {
  if (contradictionCount > 0) return 'Disputed';
  if (custodianConfirmed || officialSourceCount > 0 || verifiedReportCount > 0) return 'Confirmed';
  if (sourceCount >= 2) return 'Corroborated';
  return 'Emerging';
}

export function initialStatusForCandidate(candidate = {}) {
  if (candidate.sourceTrust?.tier === 'official') return 'Developing';
  return 'Breaking';
}

export function isTrustedStatusChange(actorType, status) {
  return ['external_ingestion', 'official_source', 'Custodian'].includes(actorType) && EVENT_STATUSES.includes(status);
}

export function isMeaningfulEventChange(change = {}) {
  return ['status_changed', 'major_update', 'official_source_added', 'correction_confirmed', 'event_resolved', 'related_event_linked'].includes(change.type);
}

export function shouldPublishCandidate(candidate = {}, provider = {}) {
  const candidateText = `${candidate.provider || ''} ${candidate.sourceName || ''} ${candidate.title || ''} ${candidate.summary || ''} ${candidate.sourceUrl || ''}`;
  if (BLOCKED_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(candidateText))) return false;
  if (provider.approvedForPublication !== true || provider.rolloutStage !== 'production' || provider.enabled !== true) return false;
  if (provider.rolloutStage === 'shadow') return false;
  if (provider.publishMode === 'shadow') return false;
  const title = normaliseEventText(`${candidate.title} ${candidate.summary}`);
  const required = provider.significanceKeywords || [];
  if (required.length && !required.some((keyword) => title.includes(normaliseEventText(keyword)))) return false;
  if (provider.minimumMagnitude && Number(candidate.structuredData?.magnitude || 0) < provider.minimumMagnitude) return false;
  if (provider.excludeKeywords?.some((keyword) => title.includes(normaliseEventText(keyword)))) return false;
  return true;
}

export function timelineEntryId(eventId, sourceKey, entryType, sequence = 0) {
  return `${eventId}_${entryType}_${String(sourceKey || 'manual').replace(/[^a-zA-Z0-9_-]/g, '_')}_${sequence}`;
}

export function normaliseTimelineEntry(input = {}) {
  if (!input.eventId) throw new Error('Timeline entry requires eventId.');
  if (!TIMELINE_ENTRY_TYPES.includes(input.entryType)) throw new Error(`Unsupported timeline entry type: ${input.entryType}`);
  const eventTimestamp = timestampMs(input.eventTimestamp || input.happenedAt || input.createdAt);
  const ingestionTimestamp = timestampMs(input.ingestionTimestamp || input.createdAt) || Date.now();
  return {
    entryId: input.entryId || timelineEntryId(input.eventId, input.sourceKey || input.sourceId || input.authorUid, input.entryType, input.sequence || 0),
    eventId: input.eventId,
    entryType: input.entryType,
    eventTimestamp,
    publicationTimestamp: timestampMs(input.publicationTimestamp || input.submittedAt) || ingestionTimestamp,
    ingestionTimestamp,
    sequence: Number(input.sequence || 0),
    source: input.source || null,
    authorUid: input.authorUid || null,
    handleSnapshot: input.handleSnapshot || null,
    content: String(input.content || input.summary || '').trim(),
    structuredData: input.structuredData || null,
    confidenceLabel: input.confidenceLabel || 'Emerging',
    moderationState: input.moderationState || 'approved',
    correctionTargetId: input.correctionTargetId || null,
    supersedesEntryId: input.supersedesEntryId || null,
    supersededByEntryId: input.supersededByEntryId || null,
    media: input.media || [],
    sourceAttribution: input.sourceAttribution || null,
    geography: input.geography || null,
  };
}

export function sortTimelineEntries(entries = []) {
  return [...entries].sort((left, right) => (left.eventTimestamp - right.eventTimestamp)
    || ((left.sequence || 0) - (right.sequence || 0))
    || (left.ingestionTimestamp - right.ingestionTimestamp)
    || String(left.entryId).localeCompare(String(right.entryId)));
}

export function replayTimelineAt(entries = [], cutoffTimestamp) {
  const cutoff = timestampMs(cutoffTimestamp);
  return sortTimelineEntries(entries).filter((entry) => entry.eventTimestamp <= cutoff);
}

export function applyCorrection(entries = [], correction) {
  return entries.map((entry) => (entry.entryId === correction.correctionTargetId
    ? { ...entry, supersededByEntryId: correction.entryId, correctionState: correction.entryType === 'contradiction' ? 'disputed' : 'corrected' }
    : entry)).concat(correction);
}

export function structuredSnapshotFromTimeline(entries = []) {
  return sortTimelineEntries(entries).reduce((snapshot, entry) => {
    if (!entry.structuredData || entry.moderationState === 'rejected') return snapshot;
    return { ...snapshot, ...entry.structuredData, lastStructuredEntryId: entry.entryId, lastStructuredAt: entry.eventTimestamp };
  }, {});
}

export function paginateTimeline(entries = [], { after = null, limit = 50, entryTypes = [] } = {}) {
  const sorted = sortTimelineEntries(entries).filter((entry) => !entryTypes.length || entryTypes.includes(entry.entryType));
  const start = after ? sorted.findIndex((entry) => entry.entryId === after) + 1 : 0;
  const page = sorted.slice(Math.max(0, start), Math.max(0, start) + limit);
  return { page, nextCursor: page.length === limit ? page[page.length - 1].entryId : null };
}
