import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_CONFIDENCE_THRESHOLD, entryIdFor, isEligibleForVortex, makeEntry, preferredEntryType } from './entry-engine.js';

test('only eligible public contributions enter Vortex', () => {
  assert.equal(isEligibleForVortex({ visibility: 'public', moderationState: 'approved' }), true);
  assert.equal(isEligibleForVortex({ visibility: 'private' }), false);
  assert.equal(isEligibleForVortex({ draft: true }), false);
  assert.equal(isEligibleForVortex({ moderationState: 'rejected' }), false);
});

test('deduplication prefers Event then Signal then Report then Post', () => {
  assert.equal(preferredEntryType({ event: {}, signal: { confidence: 1 }, report: {}, post: {} }), 'Event');
  assert.equal(preferredEntryType({ signal: { confidence: SIGNAL_CONFIDENCE_THRESHOLD }, report: {}, post: {} }), 'Signal');
  assert.equal(preferredEntryType({ report: {}, post: {} }), 'Report');
  assert.equal(preferredEntryType({ post: {} }), 'Post');
});

test('a promoted Signal is replaced by its Event projection', () => {
  assert.equal(entryIdFor('Signal', 'signal-1'), 'signal_signal-1');
  assert.equal(entryIdFor('Event', 'event-1'), 'event_event-1');
});

test('Updates refresh parent activity and trusted counts without separate cards', () => {
  const entry = makeEntry({ type: 'Event', sourceId: 'event-1', source: { title: 'A real event', updatedAt: 'newest' }, counts: { contributionCount: 4, reportCount: 3, sourceCount: 2 } });
  assert.equal(entry.entryType, 'Event');
  assert.equal(entry.latestActivityAt, 'newest');
  assert.equal(entry.contributionCount, 4);
  assert.equal(entry.entryId, 'event_event-1');
});

test('false Signals and absorbed contributions are ineligible as standalone entries', () => {
  assert.equal(preferredEntryType({ signal: { confidence: 0.99, moderationState: 'false' } }), null);
  assert.equal(preferredEntryType({ report: { archived: true } }), null);
});
