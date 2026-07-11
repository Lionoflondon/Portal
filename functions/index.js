import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { entryIdFor, isEligibleForVortex, makeEntry, preferredEntryType } from './entry-engine.js';

initializeApp();
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
