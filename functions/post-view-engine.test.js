import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseViewerKey, safeDeviceType, shouldCountView, VIEW_DEDUPE_MS } from './post-view-engine.js';

test('normalises authenticated and anonymous view identities', () => {
  assert.deepEqual(normaliseViewerKey({ uid: 'user_1' }), { viewerId: 'auth_user_1', viewerType: 'authenticated' });
  assert.deepEqual(normaliseViewerKey({ anonymousId: 'anon-device-123456' }), { viewerId: 'anon_anon-device-123456', viewerType: 'anonymous' });
  assert.equal(normaliseViewerKey({ anonymousId: 'short' }), null);
});

test('applies a rolling twenty-four hour dedupe window', () => {
  const now = 10 * VIEW_DEDUPE_MS;
  assert.equal(shouldCountView(null, now), true);
  assert.equal(shouldCountView({ lastCountedAt: now - 1000 }, now), false);
  assert.equal(shouldCountView({ lastCountedAt: now - VIEW_DEDUPE_MS - 1 }, now), true);
});

test('sanitises device type metadata', () => {
  assert.equal(safeDeviceType('mobile'), 'mobile');
  assert.equal(safeDeviceType('desktop'), 'desktop');
  assert.equal(safeDeviceType('scripted-toaster'), 'unknown');
});
