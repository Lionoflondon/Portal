import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityAfterReclaim, validateReclaimRequest } from './reclaim-policy.js';

test('requires reason, notes, outcome and typed confirmation for a reclaim', () => {
  const request = { handle: 'bbc', reason: 'trademark', notes: 'Verified trademark enforcement request.', outcome: 'mark_protected', confirmation: 'RECLAIM @bbc' };
  assert.equal(validateReclaimRequest(request), true);
  assert.equal(validateReclaimRequest({ ...request, confirmation: 'RECLAIM @other' }), false);
});

test('applies the configured cooling-off period before public availability', () => {
  assert.equal(availabilityAfterReclaim(30, 0).getTime(), 30 * 24 * 60 * 60 * 1000);
});
