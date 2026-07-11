export const thirdPartyHandleSalesEnabled = false;
export const PORTAL_COMMISSION_BPS = 1000;
export const PROTECTED_HANDLES = new Set(['bbc']);

export function calculateCommission(grossAmountMinor) {
  if (!Number.isSafeInteger(grossAmountMinor) || grossAmountMinor <= 0) throw new Error('Sale amount must be a positive integer in minor units.');
  const portalCommissionMinor = Math.floor((grossAmountMinor * PORTAL_COMMISSION_BPS) / 10_000);
  return { grossAmountMinor, portalCommissionMinor, sellerProceedsMinor: grossAmountMinor - portalCommissionMinor };
}

export function mayListHandle(handle = {}) {
  return handle.status === 'active' && handle.saleEligible !== false && !PROTECTED_HANDLES.has(handle.normalizedHandle);
}

export function mayBeginCheckout(listing) {
  if (listing.disputeState || listing.status === 'disputed') return { allowed: false, reason: 'This listing is under review.' };
  if (listing.portalOwned) return { allowed: false, reason: 'Portal-owned checkout requires a configured payment provider.' };
  return thirdPartyHandleSalesEnabled ? { allowed: true } : { allowed: false, reason: 'Portal-managed checkout is being prepared. This handle cannot be transferred outside Portal.' };
}

export function mayTransfer(sale = {}) {
  return sale.status === 'settlement_confirmed'
    && sale.paymentConfirmed === true
    && sale.sellerProceedsAssigned === true
    && sale.disputeState !== true;
}

export const marketplacePaymentProvider = {
  async createMarketplaceCheckout() { throw new Error('Marketplace payment provider is not configured.'); },
  async verifyMarketplacePayment() { return { confirmed: false }; },
  calculateCommission,
  async assignSellerProceeds() { return { assigned: false }; },
  async confirmSettlement() { return { confirmed: false }; },
  async refundMarketplacePayment() { return { refunded: false }; },
  async reconcileMarketplaceSale() { return { reconciled: false }; },
};
