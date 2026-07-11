import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutoIssueFreeHandle, evaluateHandleRisk } from './handle-risk-engine.js';

test('normal first account with verified email is low risk', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: true, accountAgeDays: 45, goodStandingDays: 45 } });
  assert.equal(result.band, 'low');
  assert.equal(canAutoIssueFreeHandle(result), true);
});

test('second account on same device moves into review without single-signal blocking', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: true, deviceMatchCount: 3 } });
  assert.equal(result.band, 'medium');
  assert.equal(result.publicState, 'pending_review');
});

test('different email on same device combines independent signals', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: false, deviceMatchCount: 3, browserMatchCount: 4 } });
  assert.equal(result.band, 'high');
  assert.equal(result.requiresIdentityVerification, true);
});

test('same email on different device can remain low risk when established', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: true, accountAgeDays: 60, goodStandingDays: 60, deviceMatchCount: 0 } });
  assert.equal(result.band, 'low');
});

test('rapid account creation and request velocity create critical risk', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: false, networkAccountVelocity24h: 5, recentHandleRequests24h: 5, knownFraudIndicator: true } });
  assert.equal(result.band, 'critical');
});

test('repeated free-handle changes raise review risk', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: true, previousFreeHandleChanges30d: 8, recentHandleRequests24h: 3 } });
  assert.equal(result.band, 'high');
  assert.equal(result.requiresIdentityVerification, true);
});

test('protected handle attempts and related suspended accounts require verification', () => {
  const result = evaluateHandleRisk({ signals: { emailVerified: true, protectedHandleAttempts: 2, relatedSuspendedAccounts: 1 } });
  assert.equal(result.band, 'high');
  assert.equal(result.publicState, 'additional_verification_required');
});
