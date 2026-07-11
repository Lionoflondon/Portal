import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommission, mayBeginCheckout, mayListHandle, mayTransfer, thirdPartyHandleSalesEnabled } from './marketplace-engine.js';

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
