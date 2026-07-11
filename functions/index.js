import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { entryIdFor, isEligibleForVortex, makeEntry, preferredEntryType } from './entry-engine.js';
import { HANDLE_CHANGE_COOLDOWN_MS, HANDLE_REDIRECT_GRACE_MS, normalizeHandle, validateHandle } from './identity-engine.js';
import { registryDecision, requiresElevatedReclaim } from './handle-registry.js';
import { validateReclaimRequest } from './reclaim-policy.js';
import { echoKey, echoNotificationId, isEchoablePost, nextEchoCount } from './echo-engine.js';
import { calculateCommission, marketplacePaymentProvider, mayBeginCheckout, mayListHandle, mayTransfer, thirdPartyHandleSalesEnabled } from './marketplace-engine.js';

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

export const projectPortalQuoteEcho = onDocumentWritten('quoteEchoes/{quoteEchoId}', async (event) => {
  const entryRef = db.collection('vortexEntries').doc(entryIdFor('Quote Echo', event.params.quoteEchoId));
  if (!event.data?.after.exists || !isEligibleForVortex(event.data.after.data())) { await entryRef.delete(); return; }
  const quote = event.data.after.data();
  const entry = makeEntry({ type: 'Quote Echo', sourceId: event.params.quoteEchoId, source: { ...quote, title: quote.quoteText, body: quote.quoteText }, counts: { contributionCount: 1 } });
  await entryRef.set({ ...entry, sourcePostId: quote.sourcePostId, originalAuthorUid: quote.originalAuthorUid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
});

export const createPortalPost = onCall(async (request) => {
  const uid = requireAuth(request); const body = String(request.data?.body || '').trim();
  if (body.length < 1 || body.length > 2000) throw new HttpsError('invalid-argument', 'Posts must be 1-2000 characters.');
  const profileSnapshot = await db.collection('users').doc(uid).get(); const profile = profileSnapshot.data() || {};
  if (!profile.normalizedHandle) throw new HttpsError('failed-precondition', 'Choose your Portal handle before publishing a Post.');
  const postRef = db.collection('posts').doc();
  await postRef.set({ body, authorUid: uid, createdBy: uid, authorHandle: profile.handle, authorDisplayName: profile.displayName || null, visibility: 'public', moderationState: 'approved', draft: false, deleted: false, echoCount: 0, publishedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { postId: postRef.id };
});

function postAuthor(post = {}) { return post.authorUid || post.createdBy || null; }
function postAttribution(post = {}) { return { originalAuthorUid: postAuthor(post), originalHandleSnapshot: post.authorHandle || post.handle || null, originalPublishedAt: post.publishedAt || post.createdAt || null }; }

export const echoPortalPost = onCall(async (request) => {
  const echoingUid = requireAuth(request); const postId = String(request.data?.postId || '');
  if (!postId) throw new HttpsError('invalid-argument', 'Choose a Post to Echo.');
  const postRef = db.collection('posts').doc(postId); const echoRef = db.collection('postEchoes').doc(echoKey(postId, echoingUid)); const actorRef = db.collection('users').doc(echoingUid);
  const result = await db.runTransaction(async (transaction) => {
    const [postSnapshot, echoSnapshot, actorSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(echoRef), transaction.get(actorRef)]);
    if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available to Echo.');
    const post = postSnapshot.data(); const originalAuthorUid = postAuthor(post); const actor = actorSnapshot.data() || {};
    if (originalAuthorUid === echoingUid) throw new HttpsError('failed-precondition', 'You cannot Echo your own Post.');
    if (echoSnapshot.exists && echoSnapshot.data().status === 'active') return { echoId: echoRef.id, echoed: true, idempotent: true };
    transaction.set(echoRef, { echoId: echoRef.id, sourcePostId: postId, ...postAttribution(post), echoingUid, echoedAt: FieldValue.serverTimestamp(), status: 'active', visibility: 'public', createdAt: echoSnapshot.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(postRef, { echoCount: nextEchoCount(post.echoCount, 1), updatedAt: FieldValue.serverTimestamp() });
    if (originalAuthorUid) transaction.set(db.collection('users').doc(originalAuthorUid).collection('notifications').doc(echoNotificationId(postId, echoingUid)), { type: 'echo', postId, echoId: echoRef.id, authorUid: echoingUid, authorHandle: actor.handle || actor.normalizedHandle || null, authorDisplayName: actor.displayName || null, sourceAuthorUid: originalAuthorUid, read: false, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return { echoId: echoRef.id, echoed: true, idempotent: false };
  });
  return result;
});

export const undoPortalEcho = onCall(async (request) => {
  const echoingUid = requireAuth(request); const postId = String(request.data?.postId || ''); const echoRef = db.collection('postEchoes').doc(echoKey(postId, echoingUid)); const postRef = db.collection('posts').doc(postId);
  return db.runTransaction(async (transaction) => {
    const [echoSnapshot, postSnapshot] = await Promise.all([transaction.get(echoRef), transaction.get(postRef)]);
    if (!echoSnapshot.exists || echoSnapshot.data().status !== 'active') return { echoed: false, idempotent: true };
    transaction.update(echoRef, { status: 'removed', removedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (postSnapshot.exists) transaction.update(postRef, { echoCount: nextEchoCount(postSnapshot.data().echoCount, -1), updatedAt: FieldValue.serverTimestamp() });
    return { echoed: false, idempotent: false };
  });
});

export const createPortalQuoteEcho = onCall(async (request) => {
  const quotingUid = requireAuth(request); const postId = String(request.data?.postId || ''); const quoteText = String(request.data?.quoteText || '').trim();
  if (!postId || quoteText.length < 1 || quoteText.length > 1000) throw new HttpsError('invalid-argument', 'Quote Echo commentary must be 1-1000 characters.');
  const quoteRef = db.collection('quoteEchoes').doc(); const postRef = db.collection('posts').doc(postId); const actorRef = db.collection('users').doc(quotingUid);
  const result = await db.runTransaction(async (transaction) => {
    const [postSnapshot, actorSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(actorRef)]); if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available to Quote Echo.');
    const post = postSnapshot.data(); const originalAuthorUid = postAuthor(post); const actor = actorSnapshot.data() || {};
    transaction.set(quoteRef, { quoteEchoId: quoteRef.id, quoteAuthorUid: quotingUid, quoteText, sourcePostId: postId, ...postAttribution(post), moderationState: 'approved', visibility: 'public', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (originalAuthorUid) transaction.set(db.collection('users').doc(originalAuthorUid).collection('notifications').doc(`quoteEcho_${quoteRef.id}`), { type: 'quote_echo', postId, quoteEchoId: quoteRef.id, authorUid: quotingUid, authorHandle: actor.handle || actor.normalizedHandle || null, authorDisplayName: actor.displayName || null, sourceAuthorUid: originalAuthorUid, read: false, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return { quoteEchoId: quoteRef.id };
  });
  return result;
});

export const deletePortalQuoteEcho = onCall(async (request) => {
  const uid = requireAuth(request); const quoteRef = db.collection('quoteEchoes').doc(String(request.data?.quoteEchoId || ''));
  await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(quoteRef); if (!snapshot.exists) throw new HttpsError('not-found', 'Quote Echo not found.'); if (snapshot.data().quoteAuthorUid !== uid) throw new HttpsError('permission-denied', 'Only the Quote Echo author can delete it.'); transaction.update(quoteRef, { visibility: 'deleted', deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); });
  return { deleted: true };
});

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage your Portal identity.');
  return request.auth.uid;
}

async function handleAvailability(value) {
  const validation = validateHandle(value);
  if (!validation.valid) return { available: false, state: validation.state || 'invalid', reason: validation.reason };
  const [active, reserved, protectedHandle, policy] = await Promise.all([
    db.collection('handles').doc(validation.normalizedHandle).get(),
    db.collection('reservedHandles').doc(validation.normalizedHandle).get(),
    db.collection('protectedHandles').doc(validation.normalizedHandle).get(),
    db.collection('handlePolicies').doc(validation.normalizedHandle).get(),
  ]);
  if (!active.exists) { const decision = registryDecision({ reserved, protectedHandle, policy }); return { available: decision.allowed, state: decision.state, reason: decision.reason, normalizedHandle: validation.normalizedHandle }; }
  const handle = active.data();
  const state = handle.status === 'protected' || handle.saleEligible === false ? 'protected' : handle.status === 'redirect' || handle.status === 'reserved' ? 'reserved' : 'taken';
  return { available: false, state, normalizedHandle: validation.normalizedHandle };
}

function profileSetup(input) {
  if (!input || typeof input !== 'object') return null;
  const displayName = String(input.displayName || '').trim();
  if (displayName.length < 2 || displayName.length > 80) throw new HttpsError('invalid-argument', 'Add a display name between 2 and 80 characters.');
  const bio = String(input.bio || '').trim();
  const location = String(input.location || '').trim();
  const website = String(input.website || '').trim();
  if (bio.length > 240 || location.length > 120) throw new HttpsError('invalid-argument', 'Keep your bio and location concise.');
  if (website) {
    try { const parsed = new URL(website); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol'); } catch { throw new HttpsError('invalid-argument', 'Use a valid website URL.'); }
  }
  return { displayName, bio, location, website };
}

async function claimHandle(uid, requestedHandle, changing = false, setup = null) {
  const validation = validateHandle(requestedHandle);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.reason);
  const now = Date.now();
  const profileRef = db.collection('users').doc(uid);
  const targetRef = db.collection('handles').doc(validation.normalizedHandle);
  const reservedRef = db.collection('reservedHandles').doc(validation.normalizedHandle);
  const protectedRef = db.collection('protectedHandles').doc(validation.normalizedHandle);
  const policyRef = db.collection('handlePolicies').doc(validation.normalizedHandle);
  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, targetSnapshot, reservedSnapshot, protectedSnapshot, policySnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(targetRef), transaction.get(reservedRef), transaction.get(protectedRef), transaction.get(policyRef)]);
    const profile = profileSnapshot.data() || {};
    const existingOwnerUid = targetSnapshot.data()?.ownerUid || targetSnapshot.data()?.uid || null;
    if (existingOwnerUid && existingOwnerUid !== uid) throw new HttpsError('already-exists', 'That handle was just taken. Please choose another.');
    const decision = registryDecision({ reserved: reservedSnapshot, protectedHandle: protectedSnapshot, policy: policySnapshot, now });
    if (!decision.allowed) throw new HttpsError('failed-precondition', decision.reason);
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
    transaction.set(profileRef, { ...(setup || {}), handle: originalHandle, normalizedHandle: validation.normalizedHandle, handleReservedAt: profile.handleReservedAt || FieldValue.serverTimestamp(), handleChangedAt: FieldValue.serverTimestamp(), handleLastAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { handle: originalHandle, normalizedHandle: validation.normalizedHandle, idempotent: false };
  });
}

export const checkHandleAvailability = onCall(async (request) => {
  requireAuth(request);
  return handleAvailability(request.data?.handle || '');
});

export const reserveHandle = onCall(async (request) => claimHandle(requireAuth(request), request.data?.handle || '', false, profileSetup(request.data?.profile)));
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
  await target.set({ uid: event.params.uid, displayName: user.displayName || null, handle: user.handle, normalizedHandle: user.normalizedHandle, profilePhotoUrl: user.profilePhotoUrl || null, bio: user.bio || null, location: user.location || null, website: user.website || null, accountType: user.accountType || 'member', verificationState: user.verificationState || 'unverified', joinedAt: user.createdAt || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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

function requireElevatedPortalAdmin(request, category) {
  const uid = requirePortalAdmin(request);
  if (requiresElevatedReclaim(category) && request.auth.token.portalHandleSuperAdmin !== true) throw new HttpsError('permission-denied', 'Elevated Portal administration is required for this handle category.');
  return uid;
}

export const getAdminHandleRecord = onCall(async (request) => {
  requirePortalAdmin(request);
  const normalizedHandle = normalizeHandle(request.data?.handle || '');
  if (!normalizedHandle) throw new HttpsError('invalid-argument', 'Enter a handle to search.');
  const [handle, reserved, protectedHandle, policy, listings] = await Promise.all([
    db.collection('handles').doc(normalizedHandle).get(), db.collection('reservedHandles').doc(normalizedHandle).get(), db.collection('protectedHandles').doc(normalizedHandle).get(), db.collection('handlePolicies').doc(normalizedHandle).get(), db.collection('handleListings').doc(normalizedHandle).get(),
  ]);
  return { normalizedHandle, handle: handle.exists ? handle.data() : null, reserved: reserved.exists ? reserved.data() : null, protected: protectedHandle.exists ? protectedHandle.data() : null, policy: policy.exists ? policy.data() : null, listing: listings.exists ? listings.data() : null };
});

export const reclaimPortalHandle = onCall(async (request) => {
  const normalizedHandle = normalizeHandle(request.data?.handle || '');
  const reason = request.data?.reason;
  const notes = String(request.data?.notes || '').trim();
  const outcome = request.data?.outcome;
  const claimantUid = request.data?.claimantUid || null;
  const linkedCaseId = request.data?.linkedCaseId || null;
  if (!validateReclaimRequest({ handle: normalizedHandle, reason, notes, outcome, confirmation: request.data?.confirmation })) throw new HttpsError('invalid-argument', 'Provide a handle, reason, internal notes, typed confirmation and a valid outcome.');
  const handleRef = db.collection('handles').doc(normalizedHandle);
  const protectedRef = db.collection('protectedHandles').doc(normalizedHandle);
  const reservedRef = db.collection('reservedHandles').doc(normalizedHandle);
  const policyRef = db.collection('handlePolicies').doc(normalizedHandle);
  const globalRef = db.collection('handlePolicies').doc('_config');
  const result = await db.runTransaction(async (transaction) => {
    const [handleSnapshot, protectedSnapshot, reservedSnapshot, globalSnapshot] = await Promise.all([transaction.get(handleRef), transaction.get(protectedRef), transaction.get(reservedRef), transaction.get(globalRef)]);
    const current = handleSnapshot.data() || {};
    const registry = protectedSnapshot.data() || reservedSnapshot.data() || current;
    const adminUid = requireElevatedPortalAdmin(request, registry.category || current.marketplaceClass || 'marketplace');
    if (requiresElevatedReclaim(registry.category || current.marketplaceClass || 'marketplace') && request.data?.highRiskConfirmed !== true) throw new HttpsError('failed-precondition', 'Confirm this high-risk reclaim separately.');
    const previousOwnerUid = current.ownerUid || current.uid || null;
    const previousProfileRef = previousOwnerUid ? db.collection('users').doc(previousOwnerUid) : null;
    const claimantRef = claimantUid ? db.collection('users').doc(claimantUid) : null;
    const [previousProfile, claimantProfile] = await Promise.all([previousProfileRef ? transaction.get(previousProfileRef) : Promise.resolve(null), claimantRef ? transaction.get(claimantRef) : Promise.resolve(null)]);
    if (['assign_verified_claimant', 'assign_portal_account'].includes(outcome) && (!claimantUid || !claimantProfile?.exists)) throw new HttpsError('not-found', 'The receiving Portal account could not be found.');
    const reclaimRef = db.collection('handleTransfers').doc();
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = previousOwnerUid ? db.collection('users').doc(previousOwnerUid).collection('notifications').doc(`handle_reclaim_${reclaimRef.id}`) : null;
    const days = Number(globalSnapshot.data()?.reclaimCoolingOffDays || 30);
    const availableAfter = new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000);
    if (previousProfile?.exists && previousProfile.data().normalizedHandle === normalizedHandle) transaction.update(previousProfileRef, { handle: FieldValue.delete(), normalizedHandle: FieldValue.delete(), handleChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (outcome === 'assign_verified_claimant' || outcome === 'assign_portal_account') {
      transaction.set(handleRef, { normalizedHandle, originalHandle: normalizedHandle, ownerUid: claimantUid, uid: claimantUid, previousOwnerUid, status: 'verified_owner', marketplaceClass: outcome === 'assign_portal_account' ? 'portal_owned' : 'user_owned', saleEligible: false, claimEligible: false, currentListingId: null, lastTransferredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(claimantRef, { handle: normalizedHandle, normalizedHandle, handleReservedAt: FieldValue.serverTimestamp(), handleChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (outcome === 'return_to_marketplace') {
      transaction.set(handleRef, { normalizedHandle, originalHandle: normalizedHandle, ownerUid: null, uid: null, previousOwnerUid, status: 'marketplace', marketplaceClass: 'marketplace', saleEligible: true, claimEligible: false, currentListingId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(policyRef, { normalizedHandle, status: 'marketplace', category: 'marketplace', marketplaceEligible: true, transferable: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (outcome === 'release_to_availability') {
      transaction.set(handleRef, { normalizedHandle, originalHandle: normalizedHandle, ownerUid: null, uid: null, previousOwnerUid, status: 'available', marketplaceClass: 'available', saleEligible: true, currentListingId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(policyRef, { normalizedHandle, status: 'available', availableAfter, marketplaceEligible: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      const permanent = outcome === 'permanently_reserve';
      const record = { normalizedHandle, displayHandle: `@${normalizedHandle}`, category: registry.category || 'marketplace', status: permanent ? 'reserved' : 'protected', claimable: !permanent, verificationRequired: true, transferable: false, marketplaceEligible: false, notes: 'Registry state applied through admin reclaim.', updatedAt: FieldValue.serverTimestamp() };
      transaction.set(permanent ? reservedRef : protectedRef, record, { merge: true });
      transaction.set(handleRef, { normalizedHandle, originalHandle: normalizedHandle, ownerUid: null, uid: null, previousOwnerUid, status: record.status, marketplaceClass: record.category, saleEligible: false, claimEligible: record.claimable, currentListingId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    transaction.set(reclaimRef, { transferId: reclaimRef.id, type: 'admin_reclaim', handleId: normalizedHandle, normalizedHandle, previousOwnerUid, actingAdminUid: adminUid, reason, outcome, linkedCaseId, createdAt: FieldValue.serverTimestamp() });
    transaction.set(auditRef, { system: 'portal_handle_registry', action: 'handle_reclaimed', actorUid: adminUid, normalizedHandle, previousOwnerUid, previousHandle: normalizedHandle, reason, notes, outcome, linkedCaseId, immutable: true, createdAt: FieldValue.serverTimestamp() });
    if (notificationRef) transaction.set(notificationRef, { type: 'handle_reclaimed', normalizedHandle, reason, appealRoute: '#/settings', createdAt: FieldValue.serverTimestamp() });
    return { normalizedHandle, outcome, previousOwnerUid };
  });
  return result;
});

export const managePortalHandleRegistry = onCall(async (request) => {
  const adminUid = requirePortalAdmin(request);
  const normalizedHandle = normalizeHandle(request.data?.handle || '');
  const action = request.data?.action;
  const category = String(request.data?.category || 'marketplace');
  if (!normalizedHandle || !['reserve', 'protect', 'release', 'retire', 'marketplace', 'verify_owner'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a handle and valid registry action.');
  if (requiresElevatedReclaim(category) && request.auth.token.portalHandleSuperAdmin !== true) throw new HttpsError('permission-denied', 'Elevated Portal administration is required for this category.');
  const handleRef = db.collection('handles').doc(normalizedHandle); const reservedRef = db.collection('reservedHandles').doc(normalizedHandle); const protectedRef = db.collection('protectedHandles').doc(normalizedHandle); const policyRef = db.collection('handlePolicies').doc(normalizedHandle);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(handleRef); const ownerUid = snapshot.data()?.ownerUid || snapshot.data()?.uid || null;
    if (action === 'reserve' || action === 'protect') transaction.set(action === 'reserve' ? reservedRef : protectedRef, { normalizedHandle, displayHandle: `@${normalizedHandle}`, category, status: action === 'reserve' ? 'reserved' : 'protected', claimable: action === 'protect', verificationRequired: action === 'protect', transferable: false, marketplaceEligible: false, notes: String(request.data?.notes || ''), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (action === 'release') transaction.set(policyRef, { normalizedHandle, status: 'available', marketplaceEligible: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (action === 'retire') transaction.set(policyRef, { normalizedHandle, status: 'retired', marketplaceEligible: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (action === 'marketplace') transaction.set(policyRef, { normalizedHandle, status: 'marketplace', category: 'marketplace', marketplaceEligible: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (action === 'verify_owner') {
      const verifiedUid = request.data?.verifiedUid; if (!verifiedUid) throw new HttpsError('invalid-argument', 'Choose the verified owner.');
      transaction.set(handleRef, { normalizedHandle, ownerUid: verifiedUid, uid: verifiedUid, previousOwnerUid: ownerUid, status: 'verified_owner', marketplaceClass: 'user_owned', saleEligible: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    transaction.set(db.collection('auditLogs').doc(), { system: 'portal_handle_registry', action: `registry_${action}`, actorUid: adminUid, normalizedHandle, category, immutable: true, createdAt: FieldValue.serverTimestamp() });
  });
  return { normalizedHandle, action };
});

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
  const [protectedHandle, reservedHandle, policy] = await Promise.all([db.collection('protectedHandles').doc(handle).get(), db.collection('reservedHandles').doc(handle).get(), db.collection('handlePolicies').doc(handle).get()]);
  const registryRecord = protectedHandle.exists ? protectedHandle.data() : reservedHandle.exists ? reservedHandle.data() : policy.exists ? policy.data() : null;
  return { handle: registry.exists ? registry.data() : registryRecord ? { ...registryRecord, normalizedHandle: handle, saleEligible: registryRecord.marketplaceEligible === true, marketplaceClass: registryRecord.category || 'protected' } : { normalizedHandle: handle, status: 'available', marketplaceClass: 'available', saleEligible: true }, listing: listing.exists ? listing.data() : null };
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
