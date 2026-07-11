export const HIGH_RISK_CATEGORIES = new Set(['system', 'portal', 'emergency', 'government', 'brand', 'celebrity', 'politician', 'public_figure', 'moderator', 'staff']);

export function registryDecision({ reserved, protectedHandle, policy, now = Date.now() } = {}) {
  if (reserved?.exists) return { allowed: false, state: 'reserved', reason: 'This handle is reserved.' };
  if (protectedHandle?.exists) return { allowed: false, state: 'protected', reason: 'This handle is protected.' };
  const data = policy?.exists ? policy.data() : null;
  if (data?.availableAfter?.toMillis?.() > now) return { allowed: false, state: 'reserved', reason: 'This handle is in its protection period.' };
  if (data?.status === 'marketplace' || data?.marketplaceEligible === true) return { allowed: false, state: 'marketplace', reason: 'This handle is managed through the Portal marketplace.' };
  return { allowed: true, state: 'available' };
}

export function requiresElevatedReclaim(category) { return HIGH_RISK_CATEGORIES.has(category); }
