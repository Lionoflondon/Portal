import test from 'node:test';
import assert from 'node:assert/strict';
import { registryDecision, requiresElevatedReclaim } from './handle-registry.js';
import { protectedHandleSeed } from './protected-handle-seed.js';

const snapshot = (data) => ({ exists: Boolean(data), data: () => data });

test('registry blocks reserved, protected and marketplace handles before reservation', () => {
  assert.equal(registryDecision({ reserved: snapshot({}) }).state, 'reserved');
  assert.equal(registryDecision({ protectedHandle: snapshot({}) }).state, 'protected');
  assert.equal(registryDecision({ policy: snapshot({ status: 'marketplace' }) }).state, 'marketplace');
  assert.equal(registryDecision({}).allowed, true);
});

test('requires elevated administration for high risk reclaims', () => {
  assert.equal(requiresElevatedReclaim('government'), true);
  assert.equal(requiresElevatedReclaim('premium_generic'), false);
});

test('seed records are unique, normalized and complete', () => {
  assert.ok(protectedHandleSeed.length >= 150);
  assert.equal(new Set(protectedHandleSeed.map((item) => item.normalizedHandle)).size, protectedHandleSeed.length);
  assert.ok(protectedHandleSeed.every((item) => item.displayHandle === `@${item.normalizedHandle}` && item.category && item.status));
});
