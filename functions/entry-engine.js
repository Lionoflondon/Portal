export const SIGNAL_CONFIDENCE_THRESHOLD = 0.65;

export function isEligibleForVortex(item = {}) {
  return item.visibility !== 'private'
    && item.draft !== true
    && item.archived !== true
    && item.deletedAt == null
    && item.moderationState !== 'rejected'
    && item.moderationState !== 'false';
}

export function entryIdFor(type, sourceId) {
  return `${type.toLowerCase()}_${sourceId}`;
}

export function preferredEntryType({ event, signal, report, post }) {
  if (event && isEligibleForVortex(event)) return 'Event';
  if (signal && isEligibleForVortex(signal) && Number(signal.confidence || 0) >= SIGNAL_CONFIDENCE_THRESHOLD) return 'Signal';
  if (report && isEligibleForVortex(report)) return 'Report';
  if (post && isEligibleForVortex(post)) return 'Post';
  return null;
}

export function makeEntry({ type, sourceId, source, counts = {}, parentEventId = null, parentSignalId = null }) {
  return {
    entryId: entryIdFor(type, sourceId),
    entryType: type,
    sourceId,
    parentEventId,
    parentSignalId,
    title: source.title || source.summary || 'Untitled contribution',
    displaySummary: source.summary || source.body || '',
    status: source.status || (type === 'Signal' ? 'Provisional' : null),
    toneMode: source.toneMode || 'neutral',
    sensitivity: source.sensitivity || 'standard',
    locationSummary: source.location || source.locationSummary || null,
    firstActivityAt: source.firstActivityAt || source.createdAt || null,
    latestActivityAt: source.updatedAt || source.latestActivityAt || source.createdAt || null,
    publishedAt: source.publishedAt || source.createdAt || null,
    contributionCount: counts.contributionCount || 0,
    reportCount: counts.reportCount || 0,
    sourceCount: counts.sourceCount || 0,
    followerCount: counts.followerCount || 0,
    reactionCount: counts.reactionCount || 0,
    ...(type === 'Signal' ? { confidence: Number(source.confidence || 0) } : {}),
    moderationState: source.moderationState || 'approved',
    visibility: source.visibility || 'public',
  };
}
