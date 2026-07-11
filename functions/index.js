import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { entryIdFor, isEligibleForVortex, makeEntry, preferredEntryType } from './entry-engine.js';
import { HANDLE_CHANGE_COOLDOWN_MS, HANDLE_REDIRECT_GRACE_MS, normalizeHandle, validateHandle } from './identity-engine.js';
import { calculateCommission, marketplacePaymentProvider, mayBeginCheckout, mayListHandle, mayTransfer, PROTECTED_HANDLES, thirdPartyHandleSalesEnabled } from './marketplace-engine.js';

initializeApp();
setGlobalOptions({ region: 'europe-west2' });
const db = getFirestore();

async function countEventActivity(eventId) {
  const reports = await db.collection('events').doc(eventId).collection('reports').get();
  const eligibleReports = reports.docs.map((item) => item.data()).filter(isEligibleForVortex);
  const followers = await db.collectionGroup('vortex').where('eventId', '==', eventId).count().get();
  return {
    contributionCount: eligibleReports.length,
    reportCount: eligibleReports.length,
    sourceCount: new Set(eligibleReports.map((item) => item.sourceType).filter(Boolean)).size,
    followerCount: followers.data().count,
  };
}

async function removeEntry(type, sourceId) {
  await db.collection('vortexEntries').doc(entryIdFor(type, sourceId)).delete();
}

async function projectEvent(eventId, event) {
  const eventRef = db.collection('vortexEntries').doc(entryIdFor('Event', eventId));
  if (!isEligibleForVortex(event)) { await eventRef.delete(); return; }
  const counts = await countEventActivity(eventId);
  const entry = makeEntry({ type: 'Event', sourceId: eventId, source: event, counts, parentSignalId: event.parentSignalId || null });
  await eventRef.set({ ...entry, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (event.parentSignalId) await removeEntry('Signal', event.parentSignalId);
}

async function projectSignal(signalId, signal) {
  const event = signal.promotedEventId ? await db.collection('events').doc(signal.promotedEventId).get() : null;
  if (event?.exists && isEligibleForVortex(event.data())) { await removeEntry('Signal', signalId); return; }
  if (preferredEntryType({ signal }) !== 'Signal') { await removeEntry('Signal', signalId); return; }
  const entry = makeEntry({ type: 'Signal', sourceId: signalId, source: signal, counts: signal.counts || {}, parentEventId: null });
  await db.collection('vortexEntries').doc(entry.entryId).set({ ...entry, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export const projectPortalEvent = onDocumentWritten('events/{eventId}', async (event) => {
  if (!event.data?.after.exists) { await removeEntry('Event', event.params.eventId); return; }
  await projectEvent(event.params.eventId, event.data.after.data());
});

export const refreshVortexEventFromReport = onDocumentWritten('events/{eventId}/reports/{reportId}', async (event) => {
  const parent = await db.collection('events').doc(event.params.eventId).get();
  if (parent.exists) await projectEvent(event.params.eventId, parent.data());
});

export const refreshVortexEventFromUpdate = onDocumentWritten('events/{eventId}/updates/{updateId}', async (event) => {
  const parent = await db.collection('events').doc(event.params.eventId).get();
  if (parent.exists) await projectEvent(event.params.eventId, parent.data());
});

export const projectPortalSignal = onDocumentWritten('signals/{signalId}', async (event) => {
  if (!event.data?.after.exists) { await removeEntry('Signal', event.params.signalId); return; }
  await projectSignal(event.params.signalId, event.data.after.data());
});

export const projectStandalonePost = onDocumentWritten('posts/{postId}', async (event) => {
  const postId = event.params.postId;
  if (!event.data?.after.exists) { await removeEntry('Post', postId); return; }
  const post = event.data.after.data();
  if (post.parentEventId || post.parentSignalId || preferredEntryType({ post }) !== 'Post') { await removeEntry('Post', postId); return; }
  const entry = makeEntry({ type: 'Post', sourceId: postId, source: post });
  await db.collection('vortexEntries').doc(entry.entryId).set({ ...entry, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info('Projected standalone Portal post', { postId });
});

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage your Portal identity.');
  return request.auth.uid;
}

async function handleAvailability(value) {
  const validation = validateHandle(value);
  if (!validation.valid) return { available: false, state: 'invalid', reason: validation.reason };
  const active = await db.collection('handles').doc(validation.normalizedHandle).get();
  return active.exists ? { available: false, state: 'unavailable', normalizedHandle: validation.normalizedHandle } : { available: true, state: 'available', normalizedHandle: validation.normalizedHandle };
}

async function claimHandle(uid, requestedHandle, changing = false) {
  const validation = validateHandle(requestedHandle);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.reason);
  const now = Date.now();
  const profileRef = db.collection('users').doc(uid);
  const targetRef = db.collection('handles').doc(validation.normalizedHandle);
  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, targetSnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(targetRef)]);
    const profile = profileSnapshot.data() || {};
    if (targetSnapshot.exists && targetSnapshot.data().uid !== uid) throw new HttpsError('already-exists', 'That handle is unavailable.');
    if (profile.normalizedHandle === validation.normalizedHandle) return { handle: profile.handle, normalizedHandle: profile.normalizedHandle, idempotent: true };
    const lastAttempt = profile.handleLastAttemptAt?.toMillis?.() || 0;
    if (now - lastAttempt < 5_000) throw new HttpsError('resource-exhausted', 'Try that again in a moment.');
    const lastChange = profile.handleChangedAt?.toMillis?.() || 0;
    if (changing && profile.normalizedHandle && now - lastChange < HANDLE_CHANGE_COOLDOWN_MS) throw new HttpsError('failed-precondition', 'Handles can be changed once every 30 days.');
    if (profile.normalizedHandle) {
      const oldHandleRef = db.collection('handles').doc(profile.normalizedHandle);
      transaction.set(oldHandleRef, { uid, originalHandle: profile.handle, normalizedHandle: profile.normalizedHandle, status: 'redirect', redirectTo: validation.normalizedHandle, redirectExpiresAt: new Date(now + HANDLE_REDIRECT_GRACE_MS), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const originalHandle = requestedHandle.trim().replace(/^@/, '');
    transaction.set(targetRef, { uid, ownerUid: uid, originalHandle, normalizedHandle: validation.normalizedHandle, status: 'active', marketplaceClass: 'active_user', saleEligible: true, claimEligible: false, verificationRequired: false, previousHandle: profile.normalizedHandle || null, reservedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(profileRef, { handle: originalHandle, normalizedHandle: validation.normalizedHandle, handleReservedAt: profile.handleReservedAt || FieldValue.serverTimestamp(), handleChangedAt: FieldValue.serverTimestamp(), handleLastAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { handle: originalHandle, normalizedHandle: validation.normalizedHandle, idempotent: false };
  });
}

export const checkHandleAvailability = onCall(async (request) => {
  requireAuth(request);
  return handleAvailability(request.data?.handle || '');
});

export const reserveHandle = onCall(async (request) => claimHandle(requireAuth(request), request.data?.handle || '', false));
export const changeHandle = onCall(async (request) => claimHandle(requireAuth(request), request.data?.handle || '', true));

export const resolveHandle = onCall(async (request) => {
  const requested = normalizeHandle(request.data?.handle || '');
  const validation = validateHandle(requested);
  if (!validation.valid) throw new HttpsError('invalid-argument', 'That handle is invalid.');
  const handle = await db.collection('handles').doc(validation.normalizedHandle).get();
  if (!handle.exists) throw new HttpsError('not-found', 'Profile not found.');
  const pointer = handle.data();
  const uid = pointer.status === 'redirect' ? pointer.uid : pointer.uid;
  const publicProfile = await db.collection('publicProfiles').doc(uid).get();
  if (!publicProfile.exists) throw new HttpsError('not-found', 'Profile not found.');
  return { ...publicProfile.data(), redirectedFrom: pointer.status === 'redirect' ? requested : null };
});

export const searchPortalProfiles = onCall(async (request) => {
  requireAuth(request);
  const term = normalizeHandle(request.data?.term || '');
  if (term.length < 2) return { profiles: [] };
  const exact = await db.collection('handles').doc(term).get();
  if (exact.exists && exact.data().status === 'active') {
    const profile = await db.collection('publicProfiles').doc(exact.data().uid).get();
    return { profiles: profile.exists ? [profile.data()] : [] };
  }
  const matches = await db.collection('publicProfiles').orderBy('normalizedHandle').startAt(term).endAt(`${term}\uf8ff`).limit(8).get();
  return { profiles: matches.docs.map((item) => item.data()) };
});

export const syncPublicPortalProfile = onDocumentWritten('users/{uid}', async (event) => {
  const target = db.collection('publicProfiles').doc(event.params.uid);
  if (!event.data?.after.exists) { await target.delete(); return; }
  const user = event.data.after.data();
  if (!user.normalizedHandle || user.handleStatus === 'suspended') { await target.delete(); return; }
  await target.set({ uid: event.params.uid, displayName: user.displayName || null, handle: user.handle, normalizedHandle: user.normalizedHandle, profilePhotoUrl: user.profilePhotoUrl || null, bio: user.bio || null, accountType: user.accountType || 'member', verificationState: user.verificationState || 'unverified', joinedAt: user.createdAt || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
});

export const notifyPortalReportMentions = onDocumentWritten('events/{eventId}/reports/{reportId}', async (event) => {
  if (!event.data?.after.exists) return;
  const report = event.data.after.data();
  if (!isEligibleForVortex(report)) return;
  const handles = [...new Set((report.body || '').match(/@([a-zA-Z0-9_]{3,24})/g) || [])].slice(0, 5);
  for (const token of handles) {
    const registry = await db.collection('handles').doc(normalizeHandle(token)).get();
    if (!registry.exists || registry.data().status !== 'active' || registry.data().uid === report.createdBy) continue;
    await db.collection('users').doc(registry.data().uid).collection('notifications').doc(`mention_${event.params.reportId}_${registry.data().uid}`).set({ type: 'mention', mentionedUid: registry.data().uid, authorUid: report.createdBy, eventId: event.params.eventId, reportId: event.params.reportId, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }
});

function requirePortalAdmin(request) {
  const uid = requireAuth(request);
  if (request.auth.token.portalAdmin !== true) throw new HttpsError('permission-denied', 'Portal administrator access is required.');
  return uid;
}

function validMoney(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new HttpsError('invalid-argument', 'Price must be a positive integer in minor units.');
  return value;
}

async function writeAudit(action, actorUid, data) {
  await db.collection('auditLogs').add({ system: 'portal_handle_marketplace', action, actorUid, ...data, createdAt: FieldValue.serverTimestamp() });
}

export const searchHandleMarketplace = onCall(async (request) => {
  requireAuth(request);
  const handle = normalizeHandle(request.data?.handle || '');
  if (!handle) return { listings: [] };
  const listing = await db.collection('handleListings').doc(handle).get();
  const registry = await db.collection('handles').doc(handle).get();
  return { handle: registry.exists ? registry.data() : PROTECTED_HANDLES.has(handle) ? { normalizedHandle: handle, status: 'protected', marketplaceClass: 'legacy_company', saleEligible: false, claimEligible: 'controlled_review_only', protectedReason: 'established organisation' } : { normalizedHandle: handle, status: 'available', marketplaceClass: 'available', saleEligible: true }, listing: listing.exists ? listing.data() : null };
});

export const createHandleListing = onCall(async (request) => {
  const sellerUid = requireAuth(request); const normalizedHandle = normalizeHandle(request.data?.handle || ''); const askingPriceAmount = validMoney(request.data?.askingPriceAmount); const currency = request.data?.currency || 'GBP';
  const handleRef = db.collection('handles').doc(normalizedHandle); const listingRef = db.collection('handleListings').doc(normalizedHandle);
  await db.runTransaction(async (transaction) => {
    const [handleSnapshot, listingSnapshot] = await Promise.all([transaction.get(handleRef), transaction.get(listingRef)]);
    if (!handleSnapshot.exists) throw new HttpsError('not-found', 'That handle is not registered.');
    const handle = handleSnapshot.data();
    if ((handle.ownerUid || handle.uid) !== sellerUid || !mayListHandle(handle)) throw new HttpsError('failed-precondition', 'This handle is not eligible for marketplace listing.');
    if (listingSnapshot.exists && !['cancelled', 'transferred', 'blocked'].includes(listingSnapshot.data().listingStatus)) throw new HttpsError('already-exists', 'This handle already has a marketplace listing.');
    transaction.set(listingRef, { listingId: normalizedHandle, handleId: normalizedHandle, normalizedHandle, sellerUid, ownershipType: handle.marketplaceClass === 'portal_owned' ? 'portal_owned' : 'user_owned', listingStatus: 'pending_verification', askingPriceAmount, currency, acceptedOfferId: null, buyerUid: null, grossSaleAmount: null, portalCommissionAmount: null, sellerProceedsAmount: null, paymentProvider: null, paymentStatus: 'not_started', settlementStatus: 'not_started', transferStatus: 'locked', moderationState: 'pending', disputeState: false, saleEligible: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(handleRef, { status: 'offer_pending', currentListingId: normalizedHandle, updatedAt: FieldValue.serverTimestamp() });
  });
  await writeAudit('listing_created', sellerUid, { normalizedHandle });
  return { listingId: normalizedHandle, listingStatus: 'pending_verification' };
});

export const submitHandleOffer = onCall(async (request) => {
  const buyerUid = requireAuth(request); const listingId = normalizeHandle(request.data?.listingId || ''); const offerAmount = validMoney(request.data?.offerAmount);
  const listingRef = db.collection('handleListings').doc(listingId); const offerRef = db.collection('handleOffers').doc();
  await db.runTransaction(async (transaction) => {
    const listingSnapshot = await transaction.get(listingRef); if (!listingSnapshot.exists) throw new HttpsError('not-found', 'Listing not found.'); const listing = listingSnapshot.data();
    if (listing.listingStatus !== 'active' || listing.disputeState || listing.sellerUid === buyerUid || listing.saleEligible !== true) throw new HttpsError('failed-precondition', 'Offers are not available for this handle.');
    transaction.set(offerRef, { offerId: offerRef.id, listingId, handleId: listing.normalizedHandle, buyerUid, sellerUid: listing.sellerUid, offerAmount, currency: listing.currency, status: 'offer_pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await writeAudit('offer_submitted', buyerUid, { listingId, offerId: offerRef.id }); return { offerId: offerRef.id };
});

export const acceptHandleOffer = onCall(async (request) => {
  const sellerUid = requireAuth(request); const offerId = request.data?.offerId || ''; const offerRef = db.collection('handleOffers').doc(offerId);
  await db.runTransaction(async (transaction) => {
    const offerSnapshot = await transaction.get(offerRef); if (!offerSnapshot.exists) throw new HttpsError('not-found', 'Offer not found.'); const offer = offerSnapshot.data(); const listingRef = db.collection('handleListings').doc(offer.listingId); const listingSnapshot = await transaction.get(listingRef); const listing = listingSnapshot.data();
    if (!listingSnapshot.exists || offer.sellerUid !== sellerUid || offer.status !== 'offer_pending' || listing.listingStatus !== 'active' || listing.disputeState) throw new HttpsError('failed-precondition', 'This offer cannot be accepted.');
    const totals = calculateCommission(offer.offerAmount);
    transaction.update(offerRef, { status: 'offer_accepted', updatedAt: FieldValue.serverTimestamp() });
    transaction.update(listingRef, { listingStatus: listing.ownershipType === 'user_owned' ? 'awaiting_payment_provider' : 'payment_pending', acceptedOfferId: offerId, buyerUid: offer.buyerUid, grossSaleAmount: totals.grossAmountMinor, portalCommissionAmount: listing.ownershipType === 'user_owned' ? totals.portalCommissionMinor : totals.grossAmountMinor, sellerProceedsAmount: listing.ownershipType === 'user_owned' ? totals.sellerProceedsMinor : 0, paymentStatus: 'blocked', settlementStatus: 'not_started', transferStatus: 'locked', updatedAt: FieldValue.serverTimestamp() });
  });
  await writeAudit('offer_accepted', sellerUid, { offerId }); return { thirdPartyHandleSalesEnabled, message: 'Portal-managed checkout is being prepared. This handle cannot be transferred outside Portal.' };
});

export const createMarketplaceCheckout = onCall(async (request) => {
  const buyerUid = requireAuth(request); const listingId = normalizeHandle(request.data?.listingId || ''); const listingSnapshot = await db.collection('handleListings').doc(listingId).get(); if (!listingSnapshot.exists) throw new HttpsError('not-found', 'Listing not found.'); const listing = listingSnapshot.data();
  const check = mayBeginCheckout(listing); if (!check.allowed || listing.ownershipType === 'user_owned') throw new HttpsError('failed-precondition', check.reason || 'Portal-managed checkout is being prepared. This handle cannot be transferred outside Portal.');
  return marketplacePaymentProvider.createMarketplaceCheckout({ listing, buyerUid });
});

export const openHandleDispute = onCall(async (request) => {
  const uid = requireAuth(request); const listingId = normalizeHandle(request.data?.listingId || ''); const disputeRef = db.collection('handleDisputes').doc();
  await db.runTransaction(async (transaction) => { const listingRef = db.collection('handleListings').doc(listingId); const listingSnapshot = await transaction.get(listingRef); if (!listingSnapshot.exists) throw new HttpsError('not-found', 'Listing not found.'); transaction.update(listingRef, { listingStatus: 'disputed', disputeState: true, transferStatus: 'locked', updatedAt: FieldValue.serverTimestamp() }); transaction.set(disputeRef, { disputeId: disputeRef.id, listingId, openedByUid: uid, status: 'open', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); });
  await writeAudit('dispute_opened', uid, { listingId, disputeId: disputeRef.id }); return { disputeId: disputeRef.id };
});

export const completeHandleTransfer = onCall(async (request) => {
  const adminUid = requirePortalAdmin(request); const listingId = normalizeHandle(request.data?.listingId || ''); const listingRef = db.collection('handleListings').doc(listingId); const handleRef = db.collection('handles').doc(listingId);
  await db.runTransaction(async (transaction) => { const [listingSnapshot, handleSnapshot] = await Promise.all([transaction.get(listingRef), transaction.get(handleRef)]); if (!listingSnapshot.exists || !handleSnapshot.exists) throw new HttpsError('not-found', 'Listing or handle not found.'); const listing = listingSnapshot.data(); const handle = handleSnapshot.data(); const transferState = { status: listing.settlementStatus === 'confirmed' ? 'settlement_confirmed' : '', paymentConfirmed: listing.paymentStatus === 'confirmed', sellerProceedsAssigned: listing.ownershipType === 'portal_owned' || listing.settlementStatus === 'proceeds_assigned', disputeState: listing.disputeState }; if (!mayTransfer(transferState) || (handle.ownerUid || handle.uid) !== listing.sellerUid || handle.saleEligible === false || listing.disputeState) throw new HttpsError('failed-precondition', 'Trusted settlement is required before transfer.'); const transferRef = db.collection('handleTransfers').doc(); const transactionRef = db.collection('handleTransactions').doc(); transaction.update(handleRef, { ownerUid: listing.buyerUid, uid: listing.buyerUid, previousOwnerUid: listing.sellerUid, status: 'transferred', marketplaceClass: 'user_owned', currentListingId: null, lastTransferredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); transaction.update(listingRef, { listingStatus: 'transferred', transferStatus: 'completed', updatedAt: FieldValue.serverTimestamp() }); transaction.set(transferRef, { transferId: transferRef.id, listingId, handleId: listingId, sellerUid: listing.sellerUid, buyerUid: listing.buyerUid, createdAt: FieldValue.serverTimestamp() }); transaction.set(transactionRef, { transactionId: transactionRef.id, listingId, grossSaleAmount: listing.grossSaleAmount, portalCommissionAmount: listing.portalCommissionAmount, sellerProceedsAmount: listing.sellerProceedsAmount, createdAt: FieldValue.serverTimestamp() }); });
  await writeAudit('transfer_completed', adminUid, { listingId }); return { transferred: true };
});

export const submitProtectedHandleClaim = onCall(async (request) => { const uid = requireAuth(request); const normalizedHandle = normalizeHandle(request.data?.handle || ''); const claimRef = db.collection('protectedHandleClaims').doc(); await claimRef.set({ claimId: claimRef.id, normalizedHandle, claimantUid: uid, organisationName: request.data?.organisationName || '', officialDomainEmail: request.data?.officialDomainEmail || '', status: 'pending_review', createdAt: FieldValue.serverTimestamp() }); await writeAudit('protected_claim_submitted', uid, { normalizedHandle, claimId: claimRef.id }); return { claimId: claimRef.id }; });
