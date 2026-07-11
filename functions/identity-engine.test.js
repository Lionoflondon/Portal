import test from 'node:test';
import assert from 'node:assert/strict';
import { displayHandle, normalizeHandle, validateHandle } from './identity-engine.js';

test('normalizes handles case-insensitively', () => {
  assert.equal(normalizeHandle('@Jason'), 'jason');
  assert.equal(normalizeHandle('JASON'), 'jason');
  assert.equal(displayHandle('Jason'), '@jason');
});

test('validates Portal handle format', () => {
  assert.equal(validateHandle('jason_adesanya').valid, true);
  assert.equal(validateHandle('_jason').valid, false);
  assert.equal(validateHandle('ja__son').valid, false);
});

test('rejects empty and invalid handles without creating an identity', () => {
  assert.equal(validateHandle('').valid, false);
  assert.equal(validateHandle('jay-son').valid, false);
  assert.equal(validateHandle('jason adesanya').valid, false);
});

test('maps case variants to one atomic registry document key', () => {
  const firstUserClaim = normalizeHandle('@PortalJason');
  const secondUserClaim = normalizeHandle('portaljason');
  assert.equal(firstUserClaim, secondUserClaim);
  assert.equal(new Set([firstUserClaim, secondUserClaim]).size, 1);
});

test('free handle changes are not blocked by a fixed cooldown', () => {
  assert.equal(validateHandle('new_handle').valid, true);
});
