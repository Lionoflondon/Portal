export const reclaimReasons = new Set(['impersonation', 'trademark', 'fraud', 'abuse', 'legal_compliance', 'public_interest', 'system_use', 'enforcement']);
export const reclaimOutcomes = new Set(['permanently_reserve', 'mark_protected', 'assign_verified_claimant', 'assign_portal_account', 'return_to_marketplace', 'release_to_availability']);

export function validateReclaimRequest({ handle, reason, notes, outcome, confirmation }) {
  return Boolean(handle && reclaimReasons.has(reason) && String(notes || '').trim().length >= 8 && reclaimOutcomes.has(outcome) && confirmation === `RECLAIM @${handle}`);
}

export function availabilityAfterReclaim(days, now = Date.now()) { return new Date(now + Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000); }
