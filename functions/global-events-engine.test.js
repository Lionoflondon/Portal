import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceFromSignals,
  dedupeDecision,
  initialStatusForCandidate,
  isMeaningfulEventChange,
  isTrustedStatusChange,
  normaliseCandidate,
  normaliseTimelineEntry,
  paginateTimeline,
  replayTimelineAt,
  sameHappening,
  sortTimelineEntries,
  applyCorrection,
  structuredSnapshotFromTimeline,
} from './global-events-engine.js';

test('external candidate normalises into a canonical candidate format', () => {
  const candidate = normaliseCandidate({
    provider: 'approved-rss',
    providerItemId: 'item-1',
    headline: 'Major rail disruption after signalling failure',
    summary: 'Services are delayed across London.',
    location: 'London',
    category: 'Transport',
  });
  assert.equal(candidate.title, 'Major rail disruption after signalling failure');
  assert.equal(candidate.locationText, 'London');
  assert.equal(candidate.category, 'Transport');
  assert.ok(candidate.fingerprint.includes('rail disruption'));
});

test('repeated provider item and two sources for one happening attach to one Event', () => {
  const candidate = normaliseCandidate({ provider: 'rss-a', providerItemId: '1', title: 'Flood warning issued for York', locationText: 'York', category: 'Weather', publishedAt: '2026-07-11T08:00:00Z' });
  const existing = { id: 'event-1', title: 'Flood warning issued in York', locationSummary: 'York', category: 'Weather', startTime: '2026-07-11T08:10:00Z' };
  assert.equal(sameHappening(candidate, existing), true);
  assert.deepEqual(dedupeDecision(candidate, [existing]), { action: 'attach', eventId: 'event-1' });
});

test('unrelated happenings remain separate while loose matches enter Custodian review', () => {
  const candidate = normaliseCandidate({ provider: 'rss-a', providerItemId: '2', title: 'Concert cancelled in Manchester', locationText: 'Manchester', category: 'Culture' });
  assert.deepEqual(dedupeDecision(candidate, [{ id: 'event-2', title: 'Wildfire spreads near Athens', locationSummary: 'Athens', category: 'Weather' }]), { action: 'create' });
  assert.deepEqual(dedupeDecision(candidate, [{ id: 'event-3', title: 'Concert cancelled after venue issue', locationSummary: 'Leeds', category: 'Culture' }]), { action: 'review', eventId: 'event-3' });
});

test('external candidates cannot directly set Confirmed without trusted authority', () => {
  assert.equal(initialStatusForCandidate({ sourceTrust: { tier: 'publisher' } }), 'Breaking');
  assert.equal(isTrustedStatusChange('user', 'Confirmed'), false);
  assert.equal(isTrustedStatusChange('Custodian', 'Confirmed'), true);
});

test('confidence labels respond to independent source and official-source signals', () => {
  assert.equal(confidenceFromSignals({ sourceCount: 1 }), 'Emerging');
  assert.equal(confidenceFromSignals({ sourceCount: 2 }), 'Corroborated');
  assert.equal(confidenceFromSignals({ sourceCount: 1, officialSourceCount: 1 }), 'Confirmed');
  assert.equal(confidenceFromSignals({ sourceCount: 3, contradictionCount: 1 }), 'Disputed');
});

test('meaningful updates notify while minor refreshes stay quiet', () => {
  assert.equal(isMeaningfulEventChange({ type: 'status_changed' }), true);
  assert.equal(isMeaningfulEventChange({ type: 'source_refreshed' }), false);
});

test('timeline entries display in true event-time order with ingestion time preserved', () => {
  const lateReport = normaliseTimelineEntry({ eventId: 'event-1', entryType: 'Report', eventTimestamp: '2026-07-11T16:18:00Z', ingestionTimestamp: '2026-07-11T16:24:00Z', content: 'Late eyewitness report' });
  const official = normaliseTimelineEntry({ eventId: 'event-1', entryType: 'official_notice', eventTimestamp: '2026-07-11T16:20:00Z', ingestionTimestamp: '2026-07-11T16:21:00Z', content: 'Official notice' });
  const ordered = sortTimelineEntries([official, lateReport]);
  assert.equal(ordered[0].content, 'Late eyewitness report');
  assert.ok(ordered[0].ingestionTimestamp > ordered[0].eventTimestamp);
});

test('corrections do not delete the original claim', () => {
  const claim = normaliseTimelineEntry({ eventId: 'event-1', entryId: 'claim-1', entryType: 'Report', eventTimestamp: 100, ingestionTimestamp: 110, content: 'Initial claim' });
  const correction = normaliseTimelineEntry({ eventId: 'event-1', entryId: 'correction-1', entryType: 'correction', eventTimestamp: 200, ingestionTimestamp: 205, correctionTargetId: 'claim-1', content: 'Corrected position' });
  const corrected = applyCorrection([claim], correction);
  assert.equal(corrected.length, 2);
  assert.equal(corrected.find((entry) => entry.entryId === 'claim-1').correctionState, 'corrected');
});

test('structured snapshots derive from timeline entries without mutating history', () => {
  const nilNil = normaliseTimelineEntry({ eventId: 'match-1', entryId: 'score-0', entryType: 'score_update', eventTimestamp: 10, structuredData: { home: 'England', away: 'France', score: '0-0' } });
  const oneNil = normaliseTimelineEntry({ eventId: 'match-1', entryId: 'score-1', entryType: 'score_update', eventTimestamp: 20, structuredData: { score: '1-0', scorer: 'Example Player' } });
  const snapshot = structuredSnapshotFromTimeline([oneNil, nilNil]);
  assert.equal(snapshot.score, '1-0');
  assert.equal(nilNil.structuredData.score, '0-0');
});

test('historical replay excludes future corrections and pagination is stable', () => {
  const entries = [
    normaliseTimelineEntry({ eventId: 'event-1', entryId: 'detected', entryType: 'event_detected', eventTimestamp: 100, content: 'Detected' }),
    normaliseTimelineEntry({ eventId: 'event-1', entryId: 'claim', entryType: 'Report', eventTimestamp: 150, content: 'Claim' }),
    normaliseTimelineEntry({ eventId: 'event-1', entryId: 'later-correction', entryType: 'correction', eventTimestamp: 300, correctionTargetId: 'claim', content: 'Later correction' }),
  ];
  assert.deepEqual(replayTimelineAt(entries, 200).map((entry) => entry.entryId), ['detected', 'claim']);
  assert.deepEqual(paginateTimeline(entries, { limit: 2 }).page.map((entry) => entry.entryId), ['detected', 'claim']);
});
