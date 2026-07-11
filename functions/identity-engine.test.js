import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDLE_CHANGE_COOLDOWN_MS, displayHandle, normalizeHandle, validateHandle } from './identity-engine.js';

test('normalizes handles case-insensitively', () => {
  assert.equal(normalizeHandle('@Jason'), 'jason');
  assert.equal(normalizeHandle('JASON'), 'jason');
  assert.equal(displayHandle('Jason'), '@jason');
});

test('validates Portal handle format and reserved names', () => {
  assert.equal(validateHandle('jason_adesanya').valid, true);
  assert.equal(validateHandle('_jason').valid, false);
  assert.equal(validateHandle('ja__son').valid, false);
  assert.equal(validateHandle('portal').valid, false);
  assert.equal(validateHandle('admin_news').valid, false);
});

test('uses a 30 day handle change cooldown', () => {
  assert.equal(HANDLE_CHANGE_COOLDOWN_MS, 30 * 24 * 60 * 60 * 1000);
});
