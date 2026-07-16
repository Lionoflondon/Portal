import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveSearchMetadata,
  assertOneWayTransition,
  canonisationPatch,
  changedLockedFields,
  computeExpiresAt,
  isSocialLocked,
  lifecycleForEvent,
  ordinaryEditAllowed,
  overrideAuditPayload,
} from './historical-canonisation-engine.js';

const now = new Date('2026-07-16T12:00:00Z');

test('organiser supplied expiry is validated against platform bounds', () => {
  const startAt = new Date('2026-07-16T10:00:00Z');
  assert.equal(computeExpiresAt({ startAt, expiresAt: '2026-07-16T10:05:00Z' }, {}, now).toISOString(), '2026-07-16T10:30:00.000Z');
  assert.equal(computeExpiresAt({ startAt, expiresAt: '2027-09-01T10:00:00Z' }, {}, now).toISOString(), '2027-07-17T10:00:00.000Z');
  assert.equal(computeExpiresAt({ startAt, expiresAt: '2026-07-16T18:00:00Z' }, {}, now).toISOString(), '2026-07-16T18:00:00.000Z');
});

test('expiry is generated automatically from event category defaults', () => {
  const startAt = new Date('2026-07-16T00:00:00Z');
  assert.equal(computeExpiresAt({ startAt, eventType: 'Breaking News' }, {}, now).toISOString(), '2026-07-17T00:00:00.000Z');
  assert.equal(computeExpiresAt({ startAt, eventType: 'Travel' }, {}, now).toISOString(), '2026-07-16T12:00:00.000Z');
  assert.equal(computeExpiresAt({ startAt, eventType: 'Community' }, {}, now).toISOString(), '2026-07-23T00:00:00.000Z');
});

test('lifecycle transitions are one-way and reach canonised automatically', () => {
  assert.equal(assertOneWayTransition('Live', 'Ending'), true);
  assert.equal(assertOneWayTransition('Canonised', 'Live'), false);
  assert.equal(lifecycleForEvent({ startAt: '2026-07-17T10:00:00Z', eventType: 'Other' }, now), 'Scheduled');
  assert.equal(lifecycleForEvent({ startAt: '2026-07-16T00:00:00Z', expiresAt: '2026-07-16T13:00:00Z' }, now), 'Ending');
  assert.equal(lifecycleForEvent({ startAt: '2026-07-15T00:00:00Z', expiresAt: '2026-07-16T10:00:00Z' }, now), 'Canonised');
});

test('canonisation locks social interaction and produces archive metadata', () => {
  const patch = canonisationPatch({ id: 'event-1', title: 'Final', startAt: '2026-06-10T15:00:00Z', country: 'GB', city: 'London', category: 'Sport', tags: ['World Cup'] }, { followerCount: 12 }, now);
  assert.equal(patch.lifecycleState, 'Canonised');
  assert.equal(patch.commentsEnabled, false);
  assert.equal(patch.recommendationEligible, false);
  assert.equal(patch.historicalMetadata.archiveYear, 2026);
  assert.equal(patch.historicalMetadata.archiveMonth, 6);
  assert.equal(patch.historicalMetadata.archiveDate, '2026-06-10');
  assert.equal(isSocialLocked(patch), true);
});

test('archive search metadata preserves parent and child historical discovery fields', () => {
  const metadata = archiveSearchMetadata({ id: 'match-1', startAt: '2026-07-11T20:00:00Z', country: 'US', city: 'New York', category: 'Sports', tags: ['world cup', 'final'] }, now);
  assert.equal(metadata.archiveCountry, 'US');
  assert.equal(metadata.archiveCity, 'New York');
  assert.ok(metadata.archiveTopics.includes('world cup'));
  assert.ok(metadata.permanentUrl.endsWith('/match-1'));
});

test('ordinary users cannot mutate locked historical fields', () => {
  const before = { lifecycleState: 'Canonised', title: 'Original', description: 'Before', category: 'Weather' };
  assert.deepEqual(changedLockedFields(before, { ...before, title: 'Changed' }), ['title']);
  assert.equal(ordinaryEditAllowed(before, { ...before, viewCount: 10 }), true);
  assert.equal(ordinaryEditAllowed(before, { ...before, title: 'Changed' }), false);
});

test('Platform Admin override audit records values and duration', () => {
  const audit = overrideAuditPayload({
    adminUid: 'admin-1',
    eventId: 'event-1',
    reason: 'Verified historical correction',
    caseId: 'CASE-42',
    before: { title: 'Wrong title', lifecycleState: 'Canonised' },
    after: { title: 'Correct title', lifecycleState: 'Canonised' },
    startedAt: new Date('2026-07-16T12:00:00Z'),
    endedAt: new Date('2026-07-16T12:00:03Z'),
  });
  assert.equal(audit.actorUid, 'admin-1');
  assert.deepEqual(audit.fieldsChanged, ['title']);
  assert.equal(audit.previousValues.title, 'Wrong title');
  assert.equal(audit.newValues.title, 'Correct title');
  assert.equal(audit.overrideDurationMs, 3000);
});
