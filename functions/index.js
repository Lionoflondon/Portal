import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Buffer } from 'node:buffer';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { entryIdFor, isEligibleForVortex, makeEntry, preferredEntryType } from './entry-engine.js';
import { normalizeHandle, validateHandle } from './identity-engine.js';
import { registryDecision, requiresElevatedReclaim } from './handle-registry.js';
import { validateReclaimRequest } from './reclaim-policy.js';
import { canAutoIssueFreeHandle, evaluateHandleRisk } from './handle-risk-engine.js';
import { echoKey, echoNotificationId, isEchoablePost, nextEchoCount } from './echo-engine.js';
import { PlaceholderPaymentProvider, activePaymentProvider, calculateCommission, marketplacePaymentProvider, marketplaceStateForHandle, mayBeginCheckout, mayListHandle, mayTransfer, pricingForHandle, thirdPartyHandleSalesEnabled } from './marketplace-engine.js';
import { confidenceFromSignals, dedupeDecision, initialStatusForCandidate, isMeaningfulEventChange, normaliseCandidate, shouldPublishCandidate, timelineEntryId } from './global-events-engine.js';
import { normaliseViewerKey, safeDeviceType, shouldCountView } from './post-view-engine.js';

initializeApp();
setGlobalOptions({ region: 'europe-west2' });
const db = getFirestore();

const PRODUCTION_PROVIDER_ROLLOUT = [
  {
    id: 'usgs-earthquakes-4-5-day',
    displayName: 'USGS Earthquakes 4.5+ Day Feed',
    category: 'Weather',
    kind: 'usgs-earthquake-geojson',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    enabled: true,
    rolloutStage: 'limited_publication',
    publishMode: 'limited',
    refreshIntervalMinutes: 30,
    maxItems: 8,
    minimumMagnitude: 4.5,
    sourceTrust: { tier: 'official', reputation: 'high' },
    region: 'World',
    geographicScope: 'World',
    rateLimit: { maxRequestsPerRun: 1 },
    parsingVersion: 1,
    healthState: 'configured',
    legalNotes: 'USGS public earthquake feed; Portal stores metadata, concise summaries and links only.',
  },
  {
    id: 'github-blog-rss-shadow',
    displayName: 'GitHub Blog RSS',
    category: 'Technology',
    kind: 'rss',
    url: 'https://github.blog/feed/',
    enabled: false,
    rolloutStage: 'shadow',
    publishMode: 'shadow',
    refreshIntervalMinutes: 120,
    maxItems: 5,
    significanceKeywords: ['security', 'incident', 'major outage', 'platform change', 'research'],
    sourceTrust: { tier: 'official', reputation: 'high' },
    region: 'World',
    geographicScope: 'World',
    rateLimit: { maxRequestsPerRun: 1 },
    parsingVersion: 1,
    healthState: 'configured',
    legalNotes: 'Official GitHub feed; disabled until technology significance filters are manually reviewed.',
  },
  {
    id: 'nasa-news-rss-shadow',
    displayName: 'NASA News Releases RSS',
    category: 'Technology',
    kind: 'rss',
    url: 'https://www.nasa.gov/news-release/feed/',
    enabled: false,
    rolloutStage: 'shadow',
    publishMode: 'shadow',
    refreshIntervalMinutes: 180,
    maxItems: 5,
    significanceKeywords: ['launch', 'discovery', 'mission', 'research', 'major'],
    sourceTrust: { tier: 'official', reputation: 'high' },
    region: 'World',
    geographicScope: 'World',
    rateLimit: { maxRequestsPerRun: 1 },
    parsingVersion: 1,
    healthState: 'configured',
    legalNotes: 'Official NASA feed; disabled for first rollout inspection.',
  },
];

async function countEventActivity(eventId) {
  const reports = await db.collection('events').doc(eventId).collection('reports').get();
  const sources = await db.collection('eventSources').where('eventId', '==', eventId).get();
  const contributions = await db.collection('eventContributions').where('eventId', '==', eventId).get();
  const eligibleReports = reports.docs.map((item) => item.data()).filter(isEligibleForVortex);
  const sourceDocs = sources.docs.map((item) => item.data());
  const contributionDocs = contributions.docs.map((item) => item.data()).filter(isEligibleForVortex);
  const followers = await db.collectionGroup('vortex').where('eventId', '==', eventId).count().get();
  return {
    contributionCount: eligibleReports.length + contributionDocs.length,
    reportCount: eligibleReports.length,
    sourceCount: sourceDocs.length || new Set(eligibleReports.map((item) => item.sourceType).filter(Boolean)).size,
    officialSourceCount: sourceDocs.filter((item) => item.sourceTrust?.tier === 'official').length,
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

async function recalculateEvent(eventId, change = { type: 'source_refreshed' }) {
  const eventRef = db.collection('events').doc(eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists) return null;
  const counts = await countEventActivity(eventId);
  const confidenceLabel = confidenceFromSignals(counts);
  await eventRef.set({
    sourceCount: counts.sourceCount,
    officialSourceCount: counts.officialSourceCount,
    contributorCount: counts.contributionCount,
    evidenceCount: counts.reportCount,
    confidenceLabel,
    lastMeaningfulUpdateAt: isMeaningfulEventChange(change) ? FieldValue.serverTimestamp() : eventSnapshot.data().lastMeaningfulUpdateAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('auditLogs').add({ entityType: 'event', entityId: eventId, changeType: change.type, createdAt: FieldValue.serverTimestamp(), summary: change.summary || null });
  if (isMeaningfulEventChange(change)) await notifyEventFollowers(eventId, change);
  return { eventId, ...counts, confidenceLabel };
}

async function notifyEventFollowers(eventId, change) {
  const followers = await db.collectionGroup('vortex').where('eventId', '==', eventId).get();
  const notificationId = `event_${eventId}_${change.type}_${change.dedupeKey || 'latest'}`;
  await Promise.all(followers.docs.map((follow) => {
    const userId = follow.ref.parent.parent.id;
    if (follow.data().muted === true) return null;
    return db.collection('users').doc(userId).collection('notifications').doc(notificationId).set({
      type: 'event_update',
      eventId,
      changeType: change.type,
      summary: change.summary || 'An Event you follow changed meaningfully.',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }).filter(Boolean));
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
  const visibility = ['public', 'followers', 'private'].includes(String(request.data?.visibility || '').toLowerCase()) ? String(request.data.visibility).toLowerCase() : 'public';
  const photos = Array.isArray(request.data?.photos) ? request.data.photos.slice(0, 10).map((item) => ({
    url: String(item.url || ''),
    path: String(item.path || ''),
    contentType: String(item.contentType || ''),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    size: Number(item.size || 0),
  })).filter((item) => item.url.startsWith('https://') && item.path.startsWith(`post-media/${uid}/`) && item.contentType.startsWith('image/') && item.size <= 25 * 1024 * 1024) : [];
  const videoInput = request.data?.video || null;
  const video = videoInput && String(videoInput.url || '').startsWith('https://') && String(videoInput.path || '').startsWith(`post-media/${uid}/`) && String(videoInput.contentType || '').startsWith('video/') && Number(videoInput.size || 0) <= 100 * 1024 * 1024 ? {
    url: String(videoInput.url),
    path: String(videoInput.path),
    thumbnailUrl: String(videoInput.thumbnailUrl || ''),
    contentType: String(videoInput.contentType || ''),
    size: Number(videoInput.size || 0),
    duration: Number(videoInput.duration || 0),
  } : null;
  const link = request.data?.link?.url ? { url: String(request.data.link.url).slice(0, 500), title: String(request.data.link.title || '').slice(0, 120) } : null;
  const pollOptions = Array.isArray(request.data?.poll?.options) ? request.data.poll.options.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4) : [];
  const poll = pollOptions.length >= 2 ? { question: String(request.data.poll.question || '').slice(0, 160), options: pollOptions.map((text, index) => ({ id: `option_${index + 1}`, text, votes: 0 })) } : null;
  const topics = Array.isArray(request.data?.topics) ? request.data.topics.map((item) => String(item || '').replace(/^#/, '').trim().toLowerCase()).filter(Boolean).slice(0, 8) : [];
  const location = request.data?.location ? String(request.data.location).trim().slice(0, 120) : null;
  const profileSnapshot = await db.collection('users').doc(uid).get(); const profile = profileSnapshot.data() || {};
  if (!profile.normalizedHandle) throw new HttpsError('failed-precondition', 'Choose your Portal handle before publishing a Post.');
  const postRef = db.collection('posts').doc();
  await postRef.set({ body, authorUid: uid, createdBy: uid, authorHandle: profile.handle, authorDisplayName: profile.displayName || null, visibility, moderationState: 'approved', draft: false, deleted: false, echoCount: 0, photos, video, link, poll, topics, location, media: { photoCount: photos.length, hasVideo: Boolean(video) }, publishedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
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

export const togglePostLike = onCall(async (request) => {
  const uid = requireAuth(request); const postId = String(request.data?.postId || '');
  if (!postId) throw new HttpsError('invalid-argument', 'Choose a Post to like.');
  const postRef = db.collection('posts').doc(postId); const likeRef = db.collection('postLikes').doc(`${postId}_${uid}`);
  return db.runTransaction(async (transaction) => {
    const [postSnapshot, likeSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(likeRef)]);
    if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available.');
    const active = likeSnapshot.exists && likeSnapshot.data().status === 'active';
    transaction.set(likeRef, { likeId: likeRef.id, postId, uid, status: active ? 'removed' : 'active', updatedAt: FieldValue.serverTimestamp(), createdAt: likeSnapshot.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(postRef, { likeCount: Math.max(0, Number(postSnapshot.data().likeCount || 0) + (active ? -1 : 1)), updatedAt: FieldValue.serverTimestamp() });
    return { liked: !active };
  });
});

export const togglePostBookmark = onCall(async (request) => {
  const uid = requireAuth(request); const postId = String(request.data?.postId || '');
  if (!postId) throw new HttpsError('invalid-argument', 'Choose a Post to bookmark.');
  const postRef = db.collection('posts').doc(postId); const bookmarkRef = db.collection('postBookmarks').doc(`${postId}_${uid}`);
  return db.runTransaction(async (transaction) => {
    const [postSnapshot, bookmarkSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(bookmarkRef)]);
    if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available.');
    const active = bookmarkSnapshot.exists && bookmarkSnapshot.data().status === 'active';
    transaction.set(bookmarkRef, { bookmarkId: bookmarkRef.id, postId, uid, status: active ? 'removed' : 'active', updatedAt: FieldValue.serverTimestamp(), createdAt: bookmarkSnapshot.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
    return { bookmarked: !active };
  });
});

export const registerPostView = onCall(async (request) => {
  const postId = String(request.data?.postId || '').trim();
  if (!postId) throw new HttpsError('invalid-argument', 'Choose a Post to view.');
  const viewer = normaliseViewerKey({ uid: request.auth?.uid || '', anonymousId: request.data?.anonymousId || '' });
  if (!viewer) throw new HttpsError('invalid-argument', 'A stable viewer identifier is required.');
  const postRef = db.collection('posts').doc(postId);
  const viewRef = db.collection('postViews').doc(postId).collection('viewers').doc(viewer.viewerId);
  const deviceType = safeDeviceType(String(request.data?.deviceType || 'unknown'));
  return db.runTransaction(async (transaction) => {
    const [postSnapshot, viewSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(viewRef)]);
    if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available.');
    const existing = viewSnapshot.exists ? viewSnapshot.data() : null;
    const counted = shouldCountView(existing);
    const now = FieldValue.serverTimestamp();
    transaction.set(viewRef, {
      postId,
      viewerId: viewer.viewerId,
      viewerType: viewer.viewerType,
      deviceType,
      firstViewedAt: existing?.firstViewedAt || now,
      lastViewedAt: now,
      ...(counted ? { lastCountedAt: now } : {}),
      updatedAt: now,
      viewAttempts: FieldValue.increment(1),
    }, { merge: true });
    if (counted) {
      const post = postSnapshot.data();
      transaction.update(postRef, {
        viewCount: Math.max(0, Number(post.viewCount || 0)) + 1,
        uniqueViewerCount: viewSnapshot.exists ? Number(post.uniqueViewerCount || 0) : Number(post.uniqueViewerCount || 0) + 1,
        authenticatedViewCount: viewer.viewerType === 'authenticated' ? Number(post.authenticatedViewCount || 0) + 1 : Number(post.authenticatedViewCount || 0),
        anonymousViewCount: viewer.viewerType === 'anonymous' ? Number(post.anonymousViewCount || 0) + 1 : Number(post.anonymousViewCount || 0),
        updatedAt: now,
      });
    }
    return { counted, viewCount: counted ? Number(postSnapshot.data().viewCount || 0) + 1 : Number(postSnapshot.data().viewCount || 0) };
  });
});

export const createPostReply = onCall(async (request) => {
  const uid = requireAuth(request); const postId = String(request.data?.postId || ''); const body = String(request.data?.body || '').trim();
  if (!postId || body.length < 1 || body.length > 1000) throw new HttpsError('invalid-argument', 'Replies must be 1-1000 characters.');
  const postRef = db.collection('posts').doc(postId); const replyRef = db.collection('postReplies').doc(); const profileSnapshot = await db.collection('users').doc(uid).get(); const profile = profileSnapshot.data() || {};
  await db.runTransaction(async (transaction) => {
    const postSnapshot = await transaction.get(postRef);
    if (!postSnapshot.exists || !isEchoablePost(postSnapshot.data())) throw new HttpsError('failed-precondition', 'This Post is not available.');
    transaction.set(replyRef, { replyId: replyRef.id, postId, body, authorUid: uid, authorHandle: profile.handle || profile.normalizedHandle || null, authorDisplayName: profile.displayName || null, visibility: 'public', moderationState: 'approved', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(postRef, { replyCount: Math.max(0, Number(postSnapshot.data().replyCount || 0) + 1), updatedAt: FieldValue.serverTimestamp() });
  });
  return { replyId: replyRef.id };
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

function escapeXml(value = '') {
  return String(value).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function xmlTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? escapeXml(match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim()) : '';
}

async function fetchProviderCandidates(provider) {
  if (!provider.enabled) return [];
  if (!provider.url) return [];
  if (provider.kind === 'usgs-earthquake-geojson') {
    const response = await fetch(provider.url);
    if (!response.ok) throw new Error(`Provider ${provider.id} returned ${response.status}`);
    const payload = await response.json();
    const features = Array.isArray(payload.features) ? payload.features : [];
    return features.slice(0, provider.maxItems || 10).map((feature) => {
      const props = feature.properties || {};
      const coordinates = feature.geometry?.coordinates ? { longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], depthKm: feature.geometry.coordinates[2] } : null;
      const magnitude = Number(props.mag || 0);
      return normaliseCandidate({
        provider: provider.id,
        providerItemId: props.ids || feature.id || props.code || props.url,
        title: props.title || `Magnitude ${magnitude} earthquake`,
        summary: `${props.title || 'Earthquake'}${props.tsunami ? ' with tsunami alert metadata.' : '.'}`,
        sourceUrl: props.url,
        publishedAt: props.time ? new Date(props.time).toISOString() : null,
        updatedAt: props.updated ? new Date(props.updated).toISOString() : null,
        locationText: props.place || provider.defaultLocation || 'World',
        coordinates,
        category: 'Weather',
        sourceTrust: provider.sourceTrust || { tier: 'official', reputation: 'high' },
        structuredData: { magnitude, place: props.place || null, alert: props.alert || null, tsunami: Boolean(props.tsunami), status: props.status || null },
      });
    }).filter((candidate) => shouldPublishCandidate(candidate, provider));
  }
  if (provider.kind === 'official-json') {
    const response = await fetch(provider.url);
    if (!response.ok) throw new Error(`Provider ${provider.id} returned ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items || payload.events || [];
    return items.slice(0, provider.maxItems || 20).map((item) => normaliseCandidate({
      provider: provider.id,
      providerItemId: item.id || item.guid || item.url || item.link,
      title: item.title || item.headline,
      summary: item.summary || item.description,
      sourceUrl: item.url || item.link,
      publishedAt: item.publishedAt || item.pubDate || item.date,
      updatedAt: item.updatedAt,
      locationText: item.location || item.locationText || provider.defaultLocation,
      coordinates: item.coordinates || null,
      category: item.category || provider.defaultCategory || 'World',
      sourceTrust: provider.sourceTrust || { tier: 'official', reputation: 'high' },
    })).filter((candidate) => shouldPublishCandidate(candidate, provider));
  }
  if (provider.kind === 'rss' || provider.kind === 'atom') {
    const response = await fetch(provider.url);
    if (!response.ok) throw new Error(`Provider ${provider.id} returned ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(new RegExp('<item[\\\\s\\\\S]*?</item>|<entry[\\\\s\\\\S]*?</entry>', 'gi'))].map((match) => match[0]);
    return items.slice(0, provider.maxItems || 20).map((item) => {
      const link = xmlTag(item, 'link') || item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
      return normaliseCandidate({
        provider: provider.id,
        providerItemId: xmlTag(item, 'guid') || xmlTag(item, 'id') || link || xmlTag(item, 'title'),
        title: xmlTag(item, 'title'),
        summary: xmlTag(item, 'description') || xmlTag(item, 'summary'),
        sourceUrl: link,
        publishedAt: xmlTag(item, 'pubDate') || xmlTag(item, 'published') || xmlTag(item, 'updated'),
        updatedAt: xmlTag(item, 'updated'),
        locationText: provider.defaultLocation || '',
        category: provider.defaultCategory || 'World',
        sourceTrust: provider.sourceTrust || { tier: 'publisher', reputation: 'standard' },
      });
    }).filter((candidate) => shouldPublishCandidate(candidate, provider));
  }
  throw new Error(`Unsupported provider kind: ${provider.kind}`);
}

async function upsertCandidate(candidate, provider) {
  const candidateId = `${candidate.provider}_${Buffer.from(candidate.providerItemId).toString('base64url').slice(0, 80)}`;
  const candidateRef = db.collection('eventCandidates').doc(candidateId);
  const existingCandidate = await candidateRef.get();
  if (existingCandidate.exists && existingCandidate.data().eventId) return { action: 'already_attached', eventId: existingCandidate.data().eventId };
  const windowStart = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const nearbyEvents = await db.collection('events').where('archived', '==', false).where('updatedAt', '>=', windowStart).limit(50).get();
  const decision = dedupeDecision(candidate, nearbyEvents.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  await candidateRef.set({ ...candidate, providerConfigId: provider.id, decision: decision.action, eventId: decision.eventId || null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (decision.action === 'review') {
    await db.collection('eventMergeReviews').doc(candidateId).set({ candidateId, possibleEventId: decision.eventId, status: 'pending_custodian_review', reason: 'possible_duplicate', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return decision;
  }
  const eventRef = decision.action === 'attach' ? db.collection('events').doc(decision.eventId) : db.collection('events').doc();
  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    const now = FieldValue.serverTimestamp();
    if (!eventSnapshot.exists) {
      transaction.set(eventRef, {
        title: candidate.title,
        summary: candidate.summary,
        status: initialStatusForCandidate(candidate),
        category: candidate.category || 'World',
        startTime: candidate.publishedAt ? new Date(candidate.publishedAt) : now,
        lastMeaningfulUpdateAt: now,
        primaryLocation: candidate.locationText || null,
        locationSummary: candidate.locationText || null,
        geographicScope: provider.geographicScope || 'World',
        coordinates: candidate.coordinates || null,
        country: provider.country || null,
        region: provider.region || null,
        sourceCount: 0,
        contributorCount: 0,
        evidenceCount: 0,
        officialSourceCount: 0,
        confidenceLabel: 'Emerging',
        duplicateEventIds: [],
        relatedEventIds: [],
        visibility: 'public',
        archived: false,
        moderationState: 'approved',
        createdByType: 'external_ingestion',
        createdBy: 'external_ingestion',
        authorUid: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      transaction.set(eventRef, { updatedAt: now }, { merge: true });
    }
    transaction.set(candidateRef, { eventId: eventRef.id, decision: eventSnapshot.exists ? 'attach' : 'create', updatedAt: now }, { merge: true });
    transaction.set(db.collection('eventSources').doc(candidateId), {
      eventId: eventRef.id,
      candidateId,
      provider: candidate.provider,
      providerItemId: candidate.providerItemId,
      title: candidate.title,
      summary: candidate.summary.slice(0, 700),
      sourceUrl: candidate.sourceUrl,
      publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
      updatedAt: candidate.updatedAt ? new Date(candidate.updatedAt) : null,
      sourceTrust: candidate.sourceTrust,
      contentFingerprint: candidate.fingerprint,
      sourceAvailabilityState: 'available',
      createdAt: now,
      ingestedAt: now,
    }, { merge: true });
    const timelineType = candidate.sourceTrust?.tier === 'official' ? 'official_notice' : 'event_detected';
    transaction.set(db.collection('eventTimeline').doc(timelineEntryId(eventRef.id, candidateId, timelineType)), {
      eventId: eventRef.id,
      entryType: timelineType,
      eventTimestamp: candidate.publishedAt ? new Date(candidate.publishedAt) : now,
      publicationTimestamp: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
      ingestionTimestamp: now,
      sequence: 0,
      source: candidate.provider,
      authorUid: null,
      handleSnapshot: null,
      content: candidate.summary || candidate.title,
      structuredData: candidate.structuredData || null,
      confidenceLabel: eventSnapshot.exists ? eventSnapshot.data().confidenceLabel || 'Emerging' : 'Emerging',
      moderationState: 'approved',
      correctionTargetId: null,
      supersedesEntryId: null,
      supersededByEntryId: null,
      media: candidate.mediaPreview ? [candidate.mediaPreview] : [],
      sourceAttribution: { provider: candidate.provider, sourceName: candidate.sourceName || candidate.provider, title: candidate.title, sourceUrl: candidate.sourceUrl, sourceUnavailable: false, contentFingerprint: candidate.fingerprint },
      geography: { locationText: candidate.locationText, coordinates: candidate.coordinates || null },
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection('eventStatusHistory').doc(), { eventId: eventRef.id, status: eventSnapshot.exists ? eventSnapshot.data().status : initialStatusForCandidate(candidate), reason: eventSnapshot.exists ? 'source_attached' : 'external_candidate_created', actorType: 'external_ingestion', createdAt: now });
  });
  await recalculateEvent(eventRef.id, { type: decision.action === 'attach' ? 'source_refreshed' : 'major_update', summary: candidate.title, dedupeKey: candidateId });
  return { action: decision.action === 'attach' ? 'attach' : 'create', eventId: eventRef.id };
}

async function ensureProductionProviders() {
  await Promise.all(PRODUCTION_PROVIDER_ROLLOUT.map((provider) => db.collection('ingestionProviders').doc(provider.id).set({
    ...provider,
    endpoint: provider.url,
    secretReference: null,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })));
}

function shouldRunProvider(provider = {}) {
  const intervalMinutes = Number(provider.refreshIntervalMinutes || 30);
  const lastRunMs = provider.lastRunAt?.toMillis?.() || 0;
  if (!lastRunMs) return true;
  return Date.now() - lastRunMs >= Math.max(1, intervalMinutes) * 60 * 1000;
}

async function runGlobalEventsIngestion({ providerLimit = 10 } = {}) {
  await ensureProductionProviders();
  const providersSnapshot = await db.collection('ingestionProviders').where('enabled', '==', true).limit(10).get();
  const runRef = await db.collection('ingestionRuns').add({ status: 'running', providerCount: providersSnapshot.size, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  let candidateCount = 0; let errorCount = 0; let createdCount = 0; let attachedCount = 0; let reviewCount = 0; let skippedCount = 0;
  for (const providerDoc of providersSnapshot.docs.slice(0, providerLimit)) {
    const provider = { id: providerDoc.id, ...providerDoc.data() };
    try {
      if (!shouldRunProvider(provider)) {
        skippedCount += 1;
        await providerDoc.ref.set({ healthState: provider.healthState || 'healthy', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }
      const candidates = await fetchProviderCandidates(provider);
      candidateCount += candidates.length;
      for (const candidate of candidates) {
        const outcome = await upsertCandidate(candidate, provider);
        if (outcome.action === 'create') createdCount += 1;
        else if (outcome.action === 'attach' || outcome.action === 'already_attached') attachedCount += 1;
        else if (outcome.action === 'review') reviewCount += 1;
      }
      await providerDoc.ref.set({ lastSuccessfulRunAt: FieldValue.serverTimestamp(), lastRunAt: FieldValue.serverTimestamp(), lastError: null, healthState: 'healthy', lastCandidateCount: candidates.length, lastCreatedCount: createdCount, lastAttachedCount: attachedCount, lastReviewCount: reviewCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      errorCount += 1;
      logger.error('Global Events provider failed', { providerId: provider.id, error: error.message });
      await providerDoc.ref.set({ lastFailureAt: FieldValue.serverTimestamp(), lastError: error.message, healthState: 'degraded', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection('auditLogs').add({ entityType: 'ingestionProvider', entityId: provider.id, changeType: 'provider_failure', summary: error.message, createdAt: FieldValue.serverTimestamp() });
    }
  }
  const result = { runId: runRef.id, candidateCount, createdCount, attachedCount, reviewCount, skippedCount, errorCount };
  await runRef.set({ status: errorCount ? 'completed_with_errors' : 'completed', candidateCount, createdCount, attachedCount, reviewCount, skippedCount, errorCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info('Global Events ingestion completed', result);
  return result;
}

export const ingestGlobalEvents = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Etc/UTC', maxInstances: 1 }, async () => {
  await runGlobalEventsIngestion();
});

export const runGlobalEventsIngestionNow = onCall(async (request) => {
  const uid = requireAuth(request);
  if (request.auth.token.admin !== true && request.auth.token.custodian !== true) throw new HttpsError('permission-denied', 'Only Portal admins or Custodians can run ingestion manually.');
  await db.collection('auditLogs').add({ entityType: 'ingestionRun', entityId: 'manual', changeType: 'manual_ingestion_requested', actorUid: uid, createdAt: FieldValue.serverTimestamp() });
  return runGlobalEventsIngestion({ providerLimit: 1 });
});

export const submitEventContribution = onCall(async (request) => {
  const uid = requireAuth(request);
  const eventId = String(request.data?.eventId || '');
  const contributionType = String(request.data?.type || '');
  const body = String(request.data?.body || '').trim();
  if (!eventId || !['Post', 'Report', 'Signal', 'Update', 'Correction', 'Source'].includes(contributionType)) throw new HttpsError('invalid-argument', 'Choose a valid Event contribution type.');
  if (body.length < 3 || body.length > 2000) throw new HttpsError('invalid-argument', 'Add a useful contribution between 3 and 2000 characters.');
  const eventRef = db.collection('events').doc(eventId);
  const profileRef = db.collection('users').doc(uid);
  const contributionRef = db.collection('eventContributions').doc();
  await db.runTransaction(async (transaction) => {
    const [eventSnapshot, profileSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(profileRef)]);
    if (!eventSnapshot.exists || !isEligibleForVortex(eventSnapshot.data())) throw new HttpsError('not-found', 'This Event is unavailable.');
    const profile = profileSnapshot.data() || {};
    transaction.set(contributionRef, {
      eventId,
      contributionType,
      body,
      authorUid: uid,
      authorHandle: profile.handle || profile.normalizedHandle || null,
      authorDisplayName: profile.displayName || null,
      locationPrecision: request.data?.locationPrecision || 'not_shared',
      sourceUrl: request.data?.sourceUrl || null,
      moderationState: 'approved',
      visibility: 'public',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection('eventTimeline').doc(contributionRef.id), {
      entryId: contributionRef.id,
      eventId,
      entryType: contributionType,
      eventTimestamp: request.data?.eventTimestamp ? new Date(request.data.eventTimestamp) : FieldValue.serverTimestamp(),
      publicationTimestamp: FieldValue.serverTimestamp(),
      ingestionTimestamp: FieldValue.serverTimestamp(),
      sequence: 0,
      source: contributionType === 'Source' ? request.data?.sourceUrl || null : null,
      authorUid: uid,
      handleSnapshot: profile.handle || profile.normalizedHandle || null,
      content: body,
      structuredData: request.data?.structuredData || null,
      confidenceLabel: eventSnapshot.data().confidenceLabel || 'Emerging',
      moderationState: 'approved',
      correctionTargetId: request.data?.correctionTargetId || null,
      supersedesEntryId: request.data?.supersedesEntryId || null,
      supersededByEntryId: null,
      media: request.data?.media || [],
      sourceAttribution: request.data?.sourceUrl ? { sourceUrl: request.data.sourceUrl, sourceUnavailable: false } : null,
      geography: request.data?.geography || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection('eventStatusHistory').doc(), { eventId, status: eventSnapshot.data().status, reason: `${contributionType.toLowerCase()}_added`, actorType: 'user', actorUid: uid, createdAt: FieldValue.serverTimestamp() });
  });
  await recalculateEvent(eventId, { type: contributionType === 'Update' ? 'major_update' : 'source_refreshed', summary: body.slice(0, 140), dedupeKey: contributionRef.id });
  return { contributionId: contributionRef.id };
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

function millis(value) {
  return value?.toMillis?.() || (value instanceof Date ? value.getTime() : 0);
}

function clientRiskHints(request) {
  const hints = request.data?.riskSignals || {};
  const safeString = (value) => String(value || '').trim().slice(0, 160);
  return {
    deviceSignature: safeString(hints.deviceSignature || request.data?.deviceSignature),
    browserSignature: safeString(hints.browserSignature || request.data?.browserSignature),
    networkSignature: safeString(hints.networkSignature || request.data?.networkSignature),
    ipReputation: ['standard', 'elevated', 'high_risk'].includes(hints.ipReputation) ? hints.ipReputation : 'standard',
    knownFraudIndicator: hints.knownFraudIndicator === true,
  };
}

async function collectHandleRiskSignals(uid, request, normalizedHandle, profile = {}) {
  const now = Date.now();
  const hints = clientRiskHints(request);
  const accountCreatedAt = millis(profile.createdAt);
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [
    previousFreeChanges,
    declinedRequests,
    protectedAttempts,
    recentRequests,
    deviceMatches,
    browserMatches,
    networkVelocity,
  ] = await Promise.all([
    db.collection('handleRequests').where('uid', '==', uid).where('requestType', '==', 'free').where('status', '==', 'approved').where('createdAt', '>=', since30d).count().get(),
    db.collection('handleRequests').where('uid', '==', uid).where('status', 'in', ['rejected', 'declined']).count().get(),
    db.collection('handleRequests').where('uid', '==', uid).where('targetPolicyState', 'in', ['reserved', 'protected']).count().get(),
    db.collection('handleRequests').where('uid', '==', uid).where('createdAt', '>=', since24h).count().get(),
    hints.deviceSignature ? db.collection('handleRiskSignals').where('kind', '==', 'device').where('signature', '==', hints.deviceSignature).count().get() : Promise.resolve({ data: () => ({ count: 0 }) }),
    hints.browserSignature ? db.collection('handleRiskSignals').where('kind', '==', 'browser').where('signature', '==', hints.browserSignature).count().get() : Promise.resolve({ data: () => ({ count: 0 }) }),
    hints.networkSignature ? db.collection('handleRiskSignals').where('kind', '==', 'network').where('signature', '==', hints.networkSignature).where('createdAt', '>=', since24h).count().get() : Promise.resolve({ data: () => ({ count: 0 }) }),
  ]);
  return {
    emailVerified: request.auth?.token?.email_verified === true,
    phoneEnabled: Boolean(request.auth?.token?.phone_number || request.auth?.token?.phone_verified),
    phoneVerified: Boolean(request.auth?.token?.phone_number || request.auth?.token?.phone_verified === true),
    accountAgeDays: accountCreatedAt ? Math.floor((now - accountCreatedAt) / (24 * 60 * 60 * 1000)) : 0,
    goodStandingDays: profile.suspended === true || profile.banned === true ? 0 : (accountCreatedAt ? Math.floor((now - accountCreatedAt) / (24 * 60 * 60 * 1000)) : 0),
    previousActiveHandles: profile.normalizedHandle ? 1 : 0,
    previousFreeHandleChanges30d: previousFreeChanges.data().count,
    previousDeclinedRequests: declinedRequests.data().count,
    protectedHandleAttempts: protectedAttempts.data().count,
    recentHandleRequests24h: recentRequests.data().count,
    deviceMatchCount: deviceMatches.data().count,
    browserMatchCount: browserMatches.data().count,
    networkAccountVelocity24h: networkVelocity.data().count,
    relatedSuspendedAccounts: profile.relatedSuspendedAccountCount || 0,
    ipReputation: hints.ipReputation,
    knownFraudIndicator: hints.knownFraudIndicator,
    hints,
  };
}

async function recordRiskSignals(uid, requestId, signals) {
  const writes = [];
  const now = FieldValue.serverTimestamp();
  if (signals.hints?.deviceSignature) writes.push(db.collection('handleRiskSignals').doc(`device_${signals.hints.deviceSignature}_${uid}`).set({ kind: 'device', signature: signals.hints.deviceSignature, uid, requestId, createdAt: now, updatedAt: now }, { merge: true }));
  if (signals.hints?.browserSignature) writes.push(db.collection('handleRiskSignals').doc(`browser_${signals.hints.browserSignature}_${uid}`).set({ kind: 'browser', signature: signals.hints.browserSignature, uid, requestId, createdAt: now, updatedAt: now }, { merge: true }));
  if (signals.hints?.networkSignature) writes.push(db.collection('handleRiskSignals').doc(`network_${signals.hints.networkSignature}_${uid}_${requestId}`).set({ kind: 'network', signature: signals.hints.networkSignature, uid, requestId, createdAt: now, updatedAt: now }, { merge: true }));
  await Promise.all(writes);
}

async function claimHandle(request, uid, requestedHandle, changing = false, setup = null) {
  const validation = validateHandle(requestedHandle);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.reason);
  const now = Date.now();
  const profileRef = db.collection('users').doc(uid);
  const targetRef = db.collection('handles').doc(validation.normalizedHandle);
  const reservedRef = db.collection('reservedHandles').doc(validation.normalizedHandle);
  const protectedRef = db.collection('protectedHandles').doc(validation.normalizedHandle);
  const policyRef = db.collection('handlePolicies').doc(validation.normalizedHandle);
  const profileSnapshotBefore = await profileRef.get();
  const profileBefore = profileSnapshotBefore.data() || {};
  const riskSignals = await collectHandleRiskSignals(uid, request, validation.normalizedHandle, profileBefore);
  const riskEvaluation = evaluateHandleRisk({ uid, normalizedHandle: validation.normalizedHandle, signals: riskSignals });
  const requestRef = db.collection('handleRequests').doc();
  const result = await db.runTransaction(async (transaction) => {
    const [profileSnapshot, targetSnapshot, reservedSnapshot, protectedSnapshot, policySnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(targetRef), transaction.get(reservedRef), transaction.get(protectedRef), transaction.get(policyRef)]);
    const profile = profileSnapshot.data() || {};
    const existingOwnerUid = targetSnapshot.data()?.ownerUid || targetSnapshot.data()?.uid || null;
    if (existingOwnerUid && existingOwnerUid !== uid) throw new HttpsError('already-exists', 'That handle was just taken. Please choose another.');
    const decision = registryDecision({ reserved: reservedSnapshot, protectedHandle: protectedSnapshot, policy: policySnapshot, now });
    const targetPolicyState = decision.allowed ? 'normal' : decision.state;
    transaction.set(requestRef, {
      requestId: requestRef.id,
      uid,
      normalizedHandle: validation.normalizedHandle,
      originalHandle: requestedHandle.trim().replace(/^@/, ''),
      requestType: 'free',
      targetPolicyState,
      status: decision.allowed && canAutoIssueFreeHandle(riskEvaluation) ? 'approved' : riskEvaluation.publicState,
      approvalState: decision.allowed && canAutoIssueFreeHandle(riskEvaluation) ? 'approved' : 'pending_review',
      issuanceState: decision.allowed && canAutoIssueFreeHandle(riskEvaluation) ? 'issued' : 'not_issued',
      paymentState: 'not_required',
      riskScore: riskEvaluation.score,
      riskBand: riskEvaluation.band,
      riskReasons: riskEvaluation.reasons,
      emailVerified: riskSignals.emailVerified,
      phoneVerified: riskSignals.phoneVerified,
      deviceMatchCount: riskSignals.deviceMatchCount,
      browserMatchCount: riskSignals.browserMatchCount,
      relatedAccountIndicators: {
        networkAccountVelocity24h: riskSignals.networkAccountVelocity24h,
        relatedSuspendedAccounts: riskSignals.relatedSuspendedAccounts,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!decision.allowed) {
      transaction.set(db.collection('auditLogs').doc(), { system: 'portal_handle_risk', action: 'protected_or_reserved_handle_requested', actorUid: uid, normalizedHandle: validation.normalizedHandle, riskBand: riskEvaluation.band, createdAt: FieldValue.serverTimestamp() });
      return { status: 'declined', publicState: 'Declined', reason: decision.reason, requestId: requestRef.id };
    }
    if (profile.normalizedHandle === validation.normalizedHandle) return { handle: profile.handle, normalizedHandle: profile.normalizedHandle, idempotent: true };
    const lastAttempt = profile.handleLastAttemptAt?.toMillis?.() || 0;
    if (now - lastAttempt < 5_000) throw new HttpsError('resource-exhausted', 'Try that again in a moment.');
    if (!canAutoIssueFreeHandle(riskEvaluation)) {
      transaction.set(db.collection('auditLogs').doc(), { system: 'portal_handle_risk', action: 'handle_request_queued', actorUid: uid, normalizedHandle: validation.normalizedHandle, riskBand: riskEvaluation.band, createdAt: FieldValue.serverTimestamp() });
      return { status: riskEvaluation.publicState, publicState: riskEvaluation.publicState === 'pending_review' ? 'Pending Review' : riskEvaluation.publicState === 'additional_verification_required' ? 'Additional verification required' : 'Pending Review', requestId: requestRef.id };
    }
    if (profile.normalizedHandle) {
      const oldHandleRef = db.collection('handles').doc(profile.normalizedHandle);
      transaction.set(oldHandleRef, { uid: null, ownerUid: null, previousOwnerUid: uid, originalHandle: profile.handle, normalizedHandle: profile.normalizedHandle, status: 'marketplace', marketplaceClass: 'marketplace', saleEligible: true, claimEligible: false, currentListingId: null, releasedFromFreeHandleAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const originalHandle = requestedHandle.trim().replace(/^@/, '');
    transaction.set(targetRef, { uid, ownerUid: uid, originalHandle, normalizedHandle: validation.normalizedHandle, status: 'active', marketplaceClass: 'active_user', freeHandle: true, saleEligible: true, claimEligible: false, verificationRequired: false, previousHandle: profile.normalizedHandle || null, reservedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(profileRef, { ...(setup || {}), handle: originalHandle, normalizedHandle: validation.normalizedHandle, activeFreeHandle: validation.normalizedHandle, previousFreeHandle: profile.normalizedHandle || null, handleReservedAt: profile.handleReservedAt || FieldValue.serverTimestamp(), handleChangedAt: FieldValue.serverTimestamp(), handleLastAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection('handleTransfers').doc(), { type: 'free_handle_change', normalizedHandle: validation.normalizedHandle, previousHandle: profile.normalizedHandle || null, ownerUid: uid, requestId: requestRef.id, createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('auditLogs').doc(), { system: 'portal_handle_risk', action: changing ? 'free_handle_changed' : 'free_handle_issued', actorUid: uid, normalizedHandle: validation.normalizedHandle, previousHandle: profile.normalizedHandle || null, riskBand: riskEvaluation.band, createdAt: FieldValue.serverTimestamp() });
    return { handle: originalHandle, normalizedHandle: validation.normalizedHandle, status: 'approved', publicState: 'Approved', requestId: requestRef.id, idempotent: false };
  });
  await recordRiskSignals(uid, requestRef.id, riskSignals);
  return result;
}

export const checkHandleAvailability = onCall(async (request) => {
  requireAuth(request);
  return handleAvailability(request.data?.handle || '');
});

export const reserveHandle = onCall(async (request) => claimHandle(request, requireAuth(request), request.data?.handle || '', false, profileSetup(request.data?.profile)));
export const changeHandle = onCall(async (request) => claimHandle(request, requireAuth(request), request.data?.handle || '', true));

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

export const executePortalAdminAction = onCall(async (request) => {
  const adminUid = requirePortalAdmin(request);
  const action = String(request.data?.action || '').trim();
  const entityType = String(request.data?.entityType || 'admin').trim();
  const targetId = request.data?.targetId ? String(request.data.targetId) : null;
  const reason = String(request.data?.reason || 'admin_action').trim();
  if (!action || action.length > 80) throw new HttpsError('invalid-argument', 'A valid admin action is required.');
  if (entityType.length > 80) throw new HttpsError('invalid-argument', 'A valid entity type is required.');
  const auditRef = db.collection('auditLogs').doc();
  const timelineRef = db.collection('adminActionTimeline').doc();
  const payload = {
    adminUid,
    action,
    entityType,
    targetId,
    reason,
    oldValue: request.data?.oldValue ?? null,
    newValue: request.data?.newValue ?? null,
    ip: request.rawRequest?.ip || null,
    device: request.rawRequest?.headers?.['user-agent'] || null,
    immutable: true,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.runTransaction(async (transaction) => {
    transaction.set(auditRef, { ...payload, auditId: auditRef.id, system: 'portal_admin_v3' });
    transaction.set(timelineRef, { ...payload, timelineId: timelineRef.id, status: 'recorded' });
  });
  return { ok: true, auditId: auditRef.id, timelineId: timelineRef.id };
});

export const getAdminHandleRecord = onCall(async (request) => {
  requirePortalAdmin(request);
  const normalizedHandle = normalizeHandle(request.data?.handle || '');
  if (!normalizedHandle) throw new HttpsError('invalid-argument', 'Enter a handle to search.');
  const [handle, reserved, protectedHandle, policy, listings, requests, purchases] = await Promise.all([
    db.collection('handles').doc(normalizedHandle).get(), db.collection('reservedHandles').doc(normalizedHandle).get(), db.collection('protectedHandles').doc(normalizedHandle).get(), db.collection('handlePolicies').doc(normalizedHandle).get(), db.collection('handleListings').doc(normalizedHandle).get(),
    db.collection('handleRequests').where('normalizedHandle', '==', normalizedHandle).orderBy('createdAt', 'desc').limit(10).get(),
    db.collection('handlePurchases').where('normalizedHandle', '==', normalizedHandle).orderBy('createdAt', 'desc').limit(10).get(),
  ]);
  return { normalizedHandle, handle: handle.exists ? handle.data() : null, reserved: reserved.exists ? reserved.data() : null, protected: protectedHandle.exists ? protectedHandle.data() : null, policy: policy.exists ? policy.data() : null, listing: listings.exists ? listings.data() : null, requests: requests.docs.map((item) => ({ id: item.id, ...item.data() })), purchases: purchases.docs.map((item) => ({ id: item.id, ...item.data(), temporaryPaymentToken: item.data().temporaryPaymentToken ? 'redacted' : null })) };
});

export const refundPlaceholderHandlePurchase = onCall(async (request) => {
  const adminUid = requirePortalAdmin(request);
  const purchaseId = String(request.data?.purchaseId || '');
  if (!purchaseId) throw new HttpsError('invalid-argument', 'Choose a purchase to refund.');
  const purchaseRef = db.collection('handlePurchases').doc(purchaseId);
  const snapshot = await purchaseRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Purchase not found.');
  const purchase = snapshot.data();
  if (purchase.paymentProviderMode !== 'placeholder') throw new HttpsError('failed-precondition', 'Only placeholder purchases can be refunded here.');
  await purchaseRef.set({ status: 'refunded', paymentStatus: 'refunded', refundStatus: 'refunded', refundedAt: FieldValue.serverTimestamp(), refundedByUid: adminUid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ system: 'portal_handle_marketplace', action: 'placeholder_purchase_refunded', actorUid: adminUid, purchaseId, normalizedHandle: purchase.normalizedHandle, createdAt: FieldValue.serverTimestamp() });
  return { purchaseId, status: 'refunded' };
});

export const requestPaidHandleReview = onCall(async (request) => {
  const uid = requireAuth(request);
  const normalizedHandle = normalizeHandle(request.data?.handle || '');
  const paymentReference = String(request.data?.paymentReference || '').trim().slice(0, 160);
  if (!normalizedHandle || !paymentReference) throw new HttpsError('invalid-argument', 'Choose a handle and payment reference.');
  const validation = validateHandle(normalizedHandle);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.reason);
  const [handleSnapshot, reservedSnapshot, protectedSnapshot, policySnapshot] = await Promise.all([
    db.collection('handles').doc(validation.normalizedHandle).get(),
    db.collection('reservedHandles').doc(validation.normalizedHandle).get(),
    db.collection('protectedHandles').doc(validation.normalizedHandle).get(),
    db.collection('handlePolicies').doc(validation.normalizedHandle).get(),
  ]);
  const policyDecision = registryDecision({ reserved: reservedSnapshot, protectedHandle: protectedSnapshot, policy: policySnapshot });
  const profile = (await db.collection('users').doc(uid).get()).data() || {};
  const riskSignals = await collectHandleRiskSignals(uid, request, validation.normalizedHandle, profile);
  const riskEvaluation = evaluateHandleRisk({ uid, normalizedHandle: validation.normalizedHandle, signals: riskSignals });
  const requestRef = db.collection('handleRequests').doc();
  await requestRef.set({
    requestId: requestRef.id,
    uid,
    normalizedHandle: validation.normalizedHandle,
    requestType: 'paid',
    status: 'pending_review',
    approvalState: 'pending_review',
    issuanceState: 'not_issued',
    paymentState: 'paid_pending_review',
    paymentReference,
    targetPolicyState: !policyDecision.allowed ? policyDecision.state : handleSnapshot.exists ? handleSnapshot.data().status || 'owned' : 'normal',
    riskScore: riskEvaluation.score,
    riskBand: riskEvaluation.band,
    riskReasons: riskEvaluation.reasons,
    emailVerified: riskSignals.emailVerified,
    phoneVerified: riskSignals.phoneVerified,
    deviceMatchCount: riskSignals.deviceMatchCount,
    browserMatchCount: riskSignals.browserMatchCount,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recordRiskSignals(uid, requestRef.id, riskSignals);
  await db.collection('auditLogs').add({ system: 'portal_handle_risk', action: 'paid_handle_review_requested', actorUid: uid, normalizedHandle: validation.normalizedHandle, requestId: requestRef.id, riskBand: riskEvaluation.band, createdAt: FieldValue.serverTimestamp() });
  return { requestId: requestRef.id, status: 'Pending Review' };
});

export const reviewHandleRequest = onCall(async (request) => {
  const adminUid = requirePortalAdmin(request);
  const requestId = String(request.data?.requestId || '');
  const action = String(request.data?.action || '');
  const notes = String(request.data?.notes || '').trim();
  const alternativeHandle = request.data?.alternativeHandle ? normalizeHandle(request.data.alternativeHandle) : null;
  if (!requestId || !['approve', 'reject', 'refund', 'offer_alternative', 'request_id', 'suspend_review', 'rescind_issued_handle', 'protect_handle'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a review request and valid action.');
  if (!notes || notes.length < 6) throw new HttpsError('invalid-argument', 'Internal notes are required.');
  const requestRef = db.collection('handleRequests').doc(requestId);
  await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new HttpsError('not-found', 'Handle request not found.');
    const item = requestSnapshot.data();
    const handleRef = db.collection('handles').doc(item.normalizedHandle);
    const profileRef = db.collection('users').doc(item.uid);
    const update = { reviewedByUid: adminUid, reviewedAt: FieldValue.serverTimestamp(), internalNotes: notes, updatedAt: FieldValue.serverTimestamp() };
    if (action === 'approve') {
      const [handleSnapshot, profileSnapshot] = await Promise.all([transaction.get(handleRef), transaction.get(profileRef)]);
      const ownerUid = handleSnapshot.data()?.ownerUid || handleSnapshot.data()?.uid || null;
      if (ownerUid && ownerUid !== item.uid) throw new HttpsError('failed-precondition', 'Handle is already owned.');
      transaction.set(handleRef, { uid: item.uid, ownerUid: item.uid, originalHandle: item.normalizedHandle, normalizedHandle: item.normalizedHandle, status: 'active', marketplaceClass: item.requestType === 'paid' ? 'user_owned' : 'active_user', freeHandle: item.requestType === 'free', saleEligible: true, reservedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (item.requestType === 'free') {
        const previous = profileSnapshot.data()?.normalizedHandle;
        if (previous && previous !== item.normalizedHandle) transaction.set(db.collection('handles').doc(previous), { uid: null, ownerUid: null, previousOwnerUid: item.uid, status: 'marketplace', marketplaceClass: 'marketplace', saleEligible: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(profileRef, { handle: item.normalizedHandle, normalizedHandle: item.normalizedHandle, activeFreeHandle: item.normalizedHandle, previousFreeHandle: previous || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      Object.assign(update, { status: 'approved', approvalState: 'approved', issuanceState: 'issued' });
    } else if (action === 'reject') Object.assign(update, { status: 'declined', approvalState: 'rejected', issuanceState: 'not_issued' });
    else if (action === 'refund') Object.assign(update, { status: 'declined', approvalState: 'rejected', paymentState: 'refund_required', issuanceState: 'not_issued' });
    else if (action === 'offer_alternative') Object.assign(update, { status: 'alternative_offered', approvalState: 'alternative_offered', alternativeHandle });
    else if (action === 'request_id') Object.assign(update, { status: 'additional_verification_required', approvalState: 'identity_requested' });
    else if (action === 'suspend_review') Object.assign(update, { status: 'suspended_review', approvalState: 'suspended' });
    else if (action === 'rescind_issued_handle') {
      transaction.set(handleRef, { uid: null, ownerUid: null, previousOwnerUid: item.uid, status: 'marketplace', marketplaceClass: 'marketplace', saleEligible: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(profileRef, { handle: FieldValue.delete(), normalizedHandle: FieldValue.delete(), activeFreeHandle: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      Object.assign(update, { status: 'rescinded', approvalState: 'rescinded', issuanceState: 'rescinded' });
    } else if (action === 'protect_handle') {
      transaction.set(db.collection('protectedHandles').doc(item.normalizedHandle), { normalizedHandle: item.normalizedHandle, displayHandle: `@${item.normalizedHandle}`, category: 'marketplace', status: 'protected', claimable: false, verificationRequired: true, transferable: false, marketplaceEligible: false, notes: 'Protected through risk review.', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      Object.assign(update, { status: 'protected', approvalState: 'protected', issuanceState: 'not_issued' });
    }
    transaction.set(requestRef, update, { merge: true });
    transaction.set(db.collection('auditLogs').doc(), { system: 'portal_handle_risk', action: `handle_request_${action}`, actorUid: adminUid, requestId, normalizedHandle: item.normalizedHandle, notes, immutable: true, createdAt: FieldValue.serverTimestamp() });
  });
  return { requestId, action };
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
  const [protectedHandle, reservedHandle, policy, listingMatches, handleMatches] = await Promise.all([
    db.collection('protectedHandles').doc(handle).get(),
    db.collection('reservedHandles').doc(handle).get(),
    db.collection('handlePolicies').doc(handle).get(),
    db.collection('handleListings').where('normalizedHandle', '>=', handle).where('normalizedHandle', '<=', `${handle}\uf8ff`).limit(12).get(),
    db.collection('handles').where('normalizedHandle', '>=', handle).where('normalizedHandle', '<=', `${handle}\uf8ff`).limit(12).get(),
  ]);
  const registryRecord = protectedHandle.exists ? protectedHandle.data() : reservedHandle.exists ? reservedHandle.data() : policy.exists ? policy.data() : null;
  const handleRecord = registry.exists ? registry.data() : registryRecord ? { ...registryRecord, normalizedHandle: handle, saleEligible: registryRecord.marketplaceEligible === true, marketplaceClass: registryRecord.category || 'protected' } : { normalizedHandle: handle, status: 'available', marketplaceClass: 'available', saleEligible: true };
  const listingRecord = listing.exists ? listing.data() : null;
  const state = marketplaceStateForHandle(handleRecord, listingRecord);
  const pricing = pricingForHandle(handle, handleRecord, listingRecord);
  const listings = listingMatches.docs.map((item) => ({ listingId: item.id, ...item.data() }));
  const ownedSuggestions = handleMatches.docs.map((item) => {
    const record = item.data();
    return {
      normalizedHandle: record.normalizedHandle || item.id,
      state: marketplaceStateForHandle(record, listings.find((listingItem) => listingItem.normalizedHandle === (record.normalizedHandle || item.id)) || null),
      category: record.marketplaceClass || record.category || 'active_user',
    };
  });
  const listingSuggestions = listings.map((item) => ({
    normalizedHandle: item.normalizedHandle || item.listingId || item.id,
    state: item.ownershipType === 'portal_owned' ? 'Premium' : 'Owned',
    category: item.ownershipType || 'listed_by_owner',
    askingPriceAmount: item.askingPriceAmount,
    currency: item.currency || 'GBP',
    listingStatus: item.listingStatus,
  }));
  const suggestions = [...new Map([...listingSuggestions, ...ownedSuggestions].map((item) => [item.normalizedHandle, item])).values()].slice(0, 12);
  return {
    handle: handleRecord,
    listing: listingRecord,
    listings,
    suggestions,
    state,
    pricing,
    details: {
      normalizedHandle: handle,
      displayHandle: `@${handle}`,
      availability: state,
      category: pricing.category,
      description: pricing.description,
      registrationPeriodMonths: pricing.periodMonths,
      renewalPriceMinor: pricing.renewalAmountMinor,
      currency: pricing.currency,
      transferEligibility: handleRecord.transferable === false || state === 'Protected' || state === 'Reserved' ? 'Not transferable' : 'Eligible after review',
      verificationRequired: handleRecord.verificationRequired === true || pricing.type === 'business' || pricing.type === 'premium',
      ownerHidden: !listingRecord,
      developmentPaymentMode: activePaymentProvider === 'placeholder',
    },
  };
});

export const startHandlePurchase = onCall(async (request) => {
  const uid = requireAuth(request);
  const handle = normalizeHandle(request.data?.handle || '');
  if (!handle) throw new HttpsError('invalid-argument', 'Choose a handle.');
  const [handleSnapshot, protectedHandle, reservedHandle, policy, listingSnapshot] = await Promise.all([
    db.collection('handles').doc(handle).get(),
    db.collection('protectedHandles').doc(handle).get(),
    db.collection('reservedHandles').doc(handle).get(),
    db.collection('handlePolicies').doc(handle).get(),
    db.collection('handleListings').doc(handle).get(),
  ]);
  const registryRecord = protectedHandle.exists ? protectedHandle.data() : reservedHandle.exists ? reservedHandle.data() : policy.exists ? policy.data() : null;
  const handleRecord = handleSnapshot.exists ? handleSnapshot.data() : registryRecord ? { ...registryRecord, normalizedHandle: handle, saleEligible: registryRecord.marketplaceEligible === true, marketplaceClass: registryRecord.category || 'protected' } : { normalizedHandle: handle, status: 'available', marketplaceClass: 'available', saleEligible: true };
  const listing = listingSnapshot.exists ? listingSnapshot.data() : null;
  const state = marketplaceStateForHandle(handleRecord, listing);
  const pricing = pricingForHandle(handle, handleRecord, listing);
  if (['Protected', 'Reserved', 'Unavailable', 'Coming Soon'].includes(state) || pricing.amountMinor == null) throw new HttpsError('failed-precondition', 'This handle is not available for placeholder purchase.');
  if (listing) throw new HttpsError('failed-precondition', 'Marketplace listings require the approved settlement provider before checkout.');
  if (handleRecord.ownerUid || handleRecord.uid) throw new HttpsError('already-exists', 'That handle is already owned.');
  const purchaseRef = db.collection('handlePurchases').doc();
  const providerSession = await PlaceholderPaymentProvider.startPurchase({ orderId: purchaseRef.id, amountMinor: pricing.amountMinor, currency: pricing.currency });
  await purchaseRef.set({ purchaseId: purchaseRef.id, uid, normalizedHandle: handle, displayHandle: `@${handle}`, status: 'review', step: 'review', amountMinor: pricing.amountMinor, renewalAmountMinor: pricing.renewalAmountMinor, currency: pricing.currency, registrationPeriodMonths: pricing.periodMonths, renewalDate: new Date(Date.now() + pricing.periodMonths * 30 * 24 * 60 * 60 * 1000), provider: providerSession.provider, paymentProviderMode: 'placeholder', developmentPaid: false, paymentStatus: 'not_started', issuanceState: 'not_issued', handleType: pricing.category, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection('auditLogs').add({ system: 'portal_handle_marketplace', action: 'purchase_started', actorUid: uid, purchaseId: purchaseRef.id, normalizedHandle: handle, provider: providerSession.provider, createdAt: FieldValue.serverTimestamp() });
  return { purchaseId: purchaseRef.id, provider: providerSession.provider, developmentMode: true, handle, pricing, status: 'review' };
});

export const confirmHandlePurchase = onCall(async (request) => {
  const uid = requireAuth(request);
  const purchaseId = String(request.data?.purchaseId || '');
  if (!purchaseId) throw new HttpsError('invalid-argument', 'Missing purchase.');
  const purchaseRef = db.collection('handlePurchases').doc(purchaseId);
  const snapshot = await purchaseRef.get();
  if (!snapshot.exists || snapshot.data().uid !== uid) throw new HttpsError('not-found', 'Purchase not found.');
  const confirmation = await PlaceholderPaymentProvider.confirmPurchase({ orderId: purchaseId });
  await purchaseRef.set({ status: 'payment_approved', step: 'confirmation', developmentPaid: true, paymentStatus: 'approved', temporaryPaymentToken: confirmation.token, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ system: 'portal_handle_marketplace', action: 'placeholder_payment_approved', actorUid: uid, purchaseId, createdAt: FieldValue.serverTimestamp() });
  return { purchaseId, message: 'Placeholder payment approved.', temporaryPaymentToken: confirmation.token };
});

export const completeHandlePurchase = onCall(async (request) => {
  const uid = requireAuth(request);
  const purchaseId = String(request.data?.purchaseId || '');
  const purchaseRef = db.collection('handlePurchases').doc(purchaseId);
  let result;
  await db.runTransaction(async (transaction) => {
    const purchaseSnapshot = await transaction.get(purchaseRef);
    if (!purchaseSnapshot.exists || purchaseSnapshot.data().uid !== uid) throw new HttpsError('not-found', 'Purchase not found.');
    const purchase = purchaseSnapshot.data();
    if (purchase.status === 'assigned') { result = purchase; return; }
    if (purchase.developmentPaid !== true || !purchase.temporaryPaymentToken) throw new HttpsError('failed-precondition', 'Complete placeholder payment first.');
    const handleRef = db.collection('handles').doc(purchase.normalizedHandle);
    const handleSnapshot = await transaction.get(handleRef);
    const ownerUid = handleSnapshot.data()?.ownerUid || handleSnapshot.data()?.uid || null;
    if (ownerUid && ownerUid !== uid) throw new HttpsError('already-exists', 'That handle was just taken.');
    transaction.set(handleRef, { uid, ownerUid: uid, normalizedHandle: purchase.normalizedHandle, originalHandle: purchase.normalizedHandle, status: 'active', marketplaceClass: purchase.handleType.toLowerCase(), handleType: purchase.handleType, freeHandle: false, saleEligible: true, verificationState: 'unverified', reservedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection('handleTransfers').doc(), { type: 'placeholder_purchase_assignment', purchaseId, normalizedHandle: purchase.normalizedHandle, buyerUid: uid, createdAt: FieldValue.serverTimestamp() });
    transaction.set(purchaseRef, { status: 'assigned', step: 'success', issuanceState: 'issued', assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    result = { ...purchase, status: 'assigned' };
  });
  const completion = await PlaceholderPaymentProvider.completePurchase({ orderId: purchaseId, token: result.temporaryPaymentToken });
  await db.collection('auditLogs').add({ system: 'portal_handle_marketplace', action: 'handle_purchase_completed', actorUid: uid, purchaseId, normalizedHandle: result.normalizedHandle, provider: completion.provider, createdAt: FieldValue.serverTimestamp() });
  return { purchaseId, status: 'assigned', handle: result.normalizedHandle, renewalDate: result.renewalDate, registrationPeriodMonths: result.registrationPeriodMonths };
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
