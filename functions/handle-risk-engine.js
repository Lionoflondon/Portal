export const RISK_THRESHOLDS = {
  low: 20,
  medium: 50,
  high: 80,
};

export function riskBand(score = 0) {
  if (score >= RISK_THRESHOLDS.high) return 'critical';
  if (score >= RISK_THRESHOLDS.medium) return 'high';
  if (score >= RISK_THRESHOLDS.low) return 'medium';
  return 'low';
}

export function publicReviewState(band) {
  if (band === 'low') return 'approved';
  if (band === 'medium') return 'pending_review';
  if (band === 'high') return 'additional_verification_required';
  return 'pending_admin_investigation';
}

function count(value) {
  return Number(value || 0);
}

export function evaluateHandleRisk(input = {}) {
  const signals = input.signals || {};
  const reasons = [];
  let score = 30;
  const add = (points, code, detail) => { score += points; reasons.push({ code, points, detail }); };

  if (signals.emailVerified) add(-18, 'verified_email', 'Email address is verified.');
  else add(16, 'email_unverified', 'Email address is not verified.');

  if (signals.phoneEnabled) {
    if (signals.phoneVerified) add(-14, 'verified_phone', 'Phone number is verified.');
    else add(12, 'phone_unverified', 'Phone verification is enabled but incomplete.');
  }

  if (count(signals.accountAgeDays) >= 30) add(-10, 'established_account', 'Account is at least 30 days old.');
  if (count(signals.goodStandingDays) >= 30) add(-8, 'good_standing', 'Account has prior good standing.');

  if (count(signals.deviceMatchCount) > 1) add(Math.min(25, count(signals.deviceMatchCount) * 6), 'reused_device_signature', 'Device signature is linked to other accounts.');
  if (count(signals.browserMatchCount) > 2) add(Math.min(16, count(signals.browserMatchCount) * 3), 'browser_fingerprint_overlap', 'Browser fingerprint overlaps with other accounts.');
  if (count(signals.networkAccountVelocity24h) > 2) add(Math.min(24, count(signals.networkAccountVelocity24h) * 5), 'network_account_velocity', 'Multiple recent accounts are linked to this network.');
  if (count(signals.recentHandleRequests24h) > 2) add(Math.min(24, count(signals.recentHandleRequests24h) * 5), 'rapid_handle_requests', 'Handle requests are unusually frequent.');
  if (count(signals.previousFreeHandleChanges30d) > 3) add(Math.min(24, count(signals.previousFreeHandleChanges30d) * 4), 'excessive_free_handle_changes', 'Free handle changes are unusually frequent.');
  if (count(signals.previousActiveHandles) > 0) add(Math.min(16, count(signals.previousActiveHandles) * 4), 'previous_active_handles', 'Account has prior active handle history.');
  if (count(signals.previousDeclinedRequests) > 0) add(Math.min(18, count(signals.previousDeclinedRequests) * 6), 'previous_declined_requests', 'Prior handle requests were declined.');
  if (count(signals.protectedHandleAttempts) > 0) add(Math.min(24, count(signals.protectedHandleAttempts) * 8), 'protected_handle_attempts', 'Requests targeted protected or reserved handles.');
  if (count(signals.relatedSuspendedAccounts) > 0) add(35, 'related_suspended_accounts', 'Related account indicators include suspended or banned accounts.');
  if (signals.ipReputation === 'high_risk') add(24, 'high_risk_network', 'Network reputation is high risk.');
  if (signals.knownFraudIndicator) add(40, 'known_fraud_indicator', 'Known fraud indicator was detected.');

  score = Math.max(0, Math.min(100, score));
  const band = riskBand(score);
  return {
    score,
    band,
    publicState: publicReviewState(band),
    reasons,
    requiresManualReview: band !== 'low',
    requiresIdentityVerification: band === 'high' || band === 'critical',
  };
}

export function canAutoIssueFreeHandle(evaluation) {
  return evaluation?.band === 'low';
}
