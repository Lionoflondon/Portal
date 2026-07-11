export const thirdPartyHandleSalesEnabled = false;
export const PORTAL_COMMISSION_BPS = 1000;
export const activePaymentProvider = 'placeholder';

export const HANDLE_PRICING = {
  standard: { category: 'Standard', amountMinor: 500, currency: 'GBP', periodMonths: 12, renewalAmountMinor: 500, description: 'A standard Portal identity.' },
  premium: { category: 'Premium', amountMinor: null, currency: 'GBP', periodMonths: 12, renewalAmountMinor: null, description: 'A premium Portal identity with custom pricing.' },
  business: { category: 'Business', amountMinor: 2000, currency: 'GBP', periodMonths: 12, renewalAmountMinor: 2000, description: 'A business Portal identity.' },
  creator: { category: 'Creator', amountMinor: 500, currency: 'GBP', periodMonths: 12, renewalAmountMinor: 500, description: 'A creator Portal identity.' },
  legacy: { category: 'Legacy', amountMinor: null, currency: 'GBP', periodMonths: 0, renewalAmountMinor: null, description: 'A legacy identity that is not publicly available.' },
  protected: { category: 'Protected', amountMinor: null, currency: 'GBP', periodMonths: 0, renewalAmountMinor: null, description: 'A protected identity that is not publicly available.' },
};

const PREMIUM_WORDS = new Set(['ai', 'app', 'bank', 'business', 'creator', 'crypto', 'finance', 'football', 'game', 'gold', 'health', 'home', 'jobs', 'king', 'london', 'media', 'music', 'news', 'shop', 'sport', 'tech', 'travel', 'video']);

export function classifyHandleForPurchase(handle = '', registry = {}, listing = null) {
  if (registry.status === 'protected' || registry.marketplaceClass === 'protected') return 'protected';
  if (registry.marketplaceClass === 'legacy_company' || registry.category === 'legacy_company') return 'legacy';
  if (listing) return 'marketplace';
  const normalized = String(handle || registry.normalizedHandle || '').toLowerCase();
  if (registry.marketplaceClass === 'business') return 'business';
  if (registry.marketplaceClass === 'creator') return 'creator';
  if (registry.marketplaceClass === 'premium' || PREMIUM_WORDS.has(normalized) || normalized.length <= 3) return 'premium';
  return 'standard';
}

export function pricingForHandle(handle = '', registry = {}, listing = null) {
  if (listing) {
    return {
      category: 'Marketplace listing',
      amountMinor: listing.askingPriceAmount,
      renewalAmountMinor: null,
      currency: listing.currency || 'GBP',
      periodMonths: 0,
      description: 'Seller-priced marketplace listing.',
      customPrice: false,
    };
  }
  const type = classifyHandleForPurchase(handle, registry, listing);
  const base = HANDLE_PRICING[type] || HANDLE_PRICING.standard;
  const configuredAmount = registry.customPriceAmountMinor ?? registry.priceAmountMinor ?? registry.askingPriceAmount;
  if (type === 'premium' && Number.isSafeInteger(configuredAmount) && configuredAmount > 0) {
    return {
      ...base,
      type,
      amountMinor: configuredAmount,
      renewalAmountMinor: Number.isSafeInteger(registry.renewalAmountMinor) ? registry.renewalAmountMinor : configuredAmount,
      description: registry.description || base.description,
      customPrice: false,
    };
  }
  return { ...base, type, customPrice: base.amountMinor == null };
}

export function marketplaceStateForHandle(registry = {}, listing = null) {
  if (registry.status === 'available') return 'Available';
  if (registry.status === 'reserved') return 'Reserved';
  if (registry.status === 'protected' || registry.saleEligible === false) return 'Protected';
  if (registry.status === 'marketplace' || listing) return listing ? 'Owned' : 'Premium';
  if (registry.ownerUid || registry.uid) return 'Owned';
  if (registry.marketplaceClass === 'premium') return 'Premium';
  if (registry.marketplaceClass === 'coming_soon') return 'Coming Soon';
  return 'Available';
}

export const PlaceholderPaymentProvider = {
  providerId: 'placeholder',
  developmentMode: true,
  async startPurchase({ orderId, amountMinor, currency }) {
    return { provider: 'placeholder', orderId, status: 'started', amountMinor, currency };
  },
  async confirmPurchase({ orderId }) {
    return { provider: 'placeholder', orderId, approved: true, token: `dev_${orderId}` };
  },
  async completePurchase({ orderId, token }) {
    return { provider: 'placeholder', orderId, confirmed: Boolean(token), token };
  },
};

export function calculateCommission(grossAmountMinor) {
  if (!Number.isSafeInteger(grossAmountMinor) || grossAmountMinor <= 0) throw new Error('Sale amount must be a positive integer in minor units.');
  const portalCommissionMinor = Math.floor((grossAmountMinor * PORTAL_COMMISSION_BPS) / 10_000);
  return { grossAmountMinor, portalCommissionMinor, sellerProceedsMinor: grossAmountMinor - portalCommissionMinor };
}

export function mayListHandle(handle = {}) {
  return handle.status === 'active' && handle.saleEligible !== false && handle.marketplaceClass !== 'protected';
}

export function mayBeginCheckout(listing) {
  if (listing.disputeState || listing.status === 'disputed') return { allowed: false, reason: 'This listing is unavailable.' };
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
