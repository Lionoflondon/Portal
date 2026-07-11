import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PlaceholderPaymentProvider,
  calculateCommission,
  marketplaceStateForHandle,
  mayBeginCheckout,
  mayListHandle,
  mayTransfer,
  pricingForHandle,
  thirdPartyHandleSalesEnabled,
} from './marketplace-engine.js';

test('calculates Portal 10 percent commission in integer minor units', () => {
  assert.deepEqual(calculateCommission(100000), { grossAmountMinor: 100000, portalCommissionMinor: 10000, sellerProceedsMinor: 90000 });
});

test('blocks third-party checkout while the settlement rail is disabled', () => {
  assert.equal(thirdPartyHandleSalesEnabled, false);
  assert.equal(mayBeginCheckout({ portalOwned: false }).allowed, false);
});

test('protects legacy identities and requires trusted settlement for transfer', () => {
  assert.equal(mayListHandle({ status: 'active', normalizedHandle: 'bbc', saleEligible: false }), false);
  assert.equal(mayTransfer({ status: 'settlement_confirmed', paymentConfirmed: true, sellerProceedsAssigned: false }), false);
  assert.equal(mayTransfer({ status: 'settlement_confirmed', paymentConfirmed: true, sellerProceedsAssigned: true }), true);
});

test('prices standard, business and backend-configured premium handles', () => {
  assert.equal(pricingForHandle('quietname').amountMinor, 500);
  assert.equal(pricingForHandle('agency', { marketplaceClass: 'business' }).amountMinor, 2000);
  const premium = pricingForHandle('orbit', { marketplaceClass: 'premium', customPriceAmountMinor: 7500, renewalAmountMinor: 5000 });
  assert.equal(premium.category, 'Premium');
  assert.equal(premium.amountMinor, 7500);
  assert.equal(premium.renewalAmountMinor, 5000);
  assert.equal(premium.customPrice, false);
});

test('marks protected and reserved handles as unavailable for purchase', () => {
  assert.equal(marketplaceStateForHandle({ status: 'protected', saleEligible: false }), 'Protected');
  assert.equal(marketplaceStateForHandle({ status: 'reserved' }), 'Reserved');
});

test('placeholder provider follows the future payment provider contract', async () => {
  const session = await PlaceholderPaymentProvider.startPurchase({ orderId: 'purchase-1', amountMinor: 500, currency: 'GBP' });
  assert.equal(session.provider, 'placeholder');
  const confirmation = await PlaceholderPaymentProvider.confirmPurchase({ orderId: 'purchase-1' });
  assert.equal(confirmation.approved, true);
  assert.match(confirmation.token, /^dev_purchase-1/);
  const completion = await PlaceholderPaymentProvider.completePurchase({ orderId: 'purchase-1', token: confirmation.token });
  assert.equal(completion.confirmed, true);
});
