import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
  limit,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  extractRichLinkPreview,
  safeFileName,
  uploadMediaFile,
  validateHttpsUrl,
  validateMediaFile,
} from './media.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

export const portalFirebase = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const portalAuth = portalFirebase ? getAuth(portalFirebase) : null;
export const portalDb = portalFirebase ? getFirestore(portalFirebase) : null;
export const portalStorage = portalFirebase ? getStorage(portalFirebase) : null;
export const portalFunctions = portalFirebase ? getFunctions(portalFirebase, 'europe-west2') : null;

function requireService(service, name) {
  if (!service) throw new Error(`Portal ${name} is not configured.`);
  return service;
}

export function observeSession(callback) {
  return onAuthStateChanged(requireService(portalAuth, 'Authentication'), callback);
}

export async function registerPortalUser({ displayName, email, password }) {
  const auth = requireService(portalAuth, 'Authentication');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await setDoc(doc(requireService(portalDb, 'Firestore'), 'users', credential.user.uid), {
    displayName,
    email: credential.user.email,
    preferences: { emailUpdates: true },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return credential.user;
}

export async function ensurePortalUserProfile(user) {
  if (!user?.uid) return;
  const reference = doc(requireService(portalDb, 'Firestore'), 'users', user.uid);
  const existing = await getDoc(reference);
  if (existing.exists()) return;
  await setDoc(reference, {
    displayName: user.displayName || '',
    email: user.email || '',
    preferences: { emailUpdates: true },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function signInPortalUser(email, password) {
  return signInWithEmailAndPassword(requireService(portalAuth, 'Authentication'), email, password);
}

export function signInPortalUserWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(requireService(portalAuth, 'Authentication'), provider);
}

export function signOutPortalUser() {
  return signOut(requireService(portalAuth, 'Authentication'));
}

export async function getPortalTokenClaims(user) {
  const result = await getIdTokenResult(user, true);
  return result.claims || {};
}

export function sendPortalPasswordReset(email) {
  return sendPasswordResetEmail(requireService(portalAuth, 'Authentication'), email);
}

export async function updatePortalProfile(user, { displayName, emailUpdates, bio, location, website, pronouns, birthdayVisibility, profileVisibility, profilePhotoUrl, bannerUrl }) {
  if (displayName) await updateProfile(user, { displayName });
  await setDoc(doc(requireService(portalDb, 'Firestore'), 'users', user.uid), {
    ...(displayName ? { displayName } : {}),
    ...(emailUpdates === undefined ? {} : { preferences: { emailUpdates: Boolean(emailUpdates) } }),
    ...(bio === undefined ? {} : { bio }),
    ...(location === undefined ? {} : { location }),
    ...(website === undefined ? {} : { website }),
    ...(pronouns === undefined ? {} : { pronouns }),
    ...(birthdayVisibility === undefined ? {} : { birthdayVisibility }),
    ...(profileVisibility === undefined ? {} : { profileVisibility }),
    ...(profilePhotoUrl === undefined ? {} : { profilePhotoUrl }),
    ...(bannerUrl === undefined ? {} : { bannerUrl }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function uploadPortalProfilePhoto(user, file, onProgress, kind = 'profile') {
  validateMediaFile(file, 'profile');
  const path = `users/${user.uid}/private/${kind}/${Date.now()}-${safeFileName(file)}`;
  return uploadMediaFile({
    storage: requireService(portalStorage, 'Storage'),
    path,
    file,
    context: 'profile',
    ownerUid: user.uid,
    onProgress,
  }).then((asset) => asset.url);
}

export function changePortalPassword(password) {
  const user = requireService(portalAuth, 'Authentication').currentUser;
  if (!user) throw new Error('Please sign in again before changing your password.');
  return updatePassword(user, password);
}

export function observeProfile(uid, callback, onError) {
  return onSnapshot(doc(requireService(portalDb, 'Firestore'), 'users', uid), callback, onError);
}

export function observeEvents(callback, onError, includeArchived = false) {
  const events = collection(requireService(portalDb, 'Firestore'), 'events');
  const eventQuery = includeArchived
    ? query(events, orderBy('updatedAt', 'desc'))
    : query(events, where('archived', '==', false), orderBy('updatedAt', 'desc'));
  return onSnapshot(eventQuery, callback, onError);
}

export function observeGlobalEvents(callback, onError) {
  return onSnapshot(
    query(collection(requireService(portalDb, 'Firestore'), 'events'), where('archived', '==', false), where('visibility', '==', 'public'), orderBy('lastMeaningfulUpdateAt', 'desc')),
    callback,
    onError,
  );
}

export function observeEvent(eventId, callback, onError) {
  return onSnapshot(doc(requireService(portalDb, 'Firestore'), 'events', eventId), callback, onError);
}

export async function createPortalEvent(user, values) {
  const heroImageUrl = values.heroImageUrl ? validateHttpsUrl(values.heroImageUrl).toString() : '';
  return callPortalIdentity('createPortalEvent', { ...values, heroImageUrl });
}

export function updatePortalEvent(eventId, values) {
  const heroImageUrl = values.heroImageUrl || values.heroImageUrl === '' ? values.heroImageUrl : values.existingHeroImageUrl || '';
  const safeHeroImageUrl = heroImageUrl ? validateHttpsUrl(heroImageUrl).toString() : '';
  return callPortalIdentity('updatePortalEvent', { ...values, eventId, heroImageUrl: safeHeroImageUrl });
}

export async function uploadPortalEventCover(user, draftId, file, onProgress) {
  if (!file) return null;
  validateMediaFile(file, 'event');
  if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('Event cover must be an image under 25 MB.');
  const prepared = await compressImage(file);
  const uploaded = await uploadPostFile(user, draftId, prepared, 'event-cover', onProgress);
  return uploaded.url;
}

export function archivePortalEvent(eventId) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'events', eventId), {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}

export function observeReports(eventId, callback, onError) {
  return onSnapshot(
    query(collection(requireService(portalDb, 'Firestore'), 'events', eventId, 'reports'), orderBy('createdAt', 'desc')),
    callback,
    onError,
  );
}

export function observeEventSources(eventId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'eventSources'), where('eventId', '==', eventId), orderBy('publishedAt', 'desc')), callback, onError);
}

export function observeEventContributions(eventId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'eventContributions'), where('eventId', '==', eventId), orderBy('createdAt', 'desc')), callback, onError);
}

export function observeEventStatusHistory(eventId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'eventStatusHistory'), where('eventId', '==', eventId), orderBy('createdAt', 'desc')), callback, onError);
}

export function observeEventTimeline(eventId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'eventTimeline'), where('eventId', '==', eventId), orderBy('eventTimestamp', 'asc'), orderBy('sequence', 'asc'), orderBy('ingestionTimestamp', 'asc')), callback, onError);
}

export function createPortalReport(user, eventId, values) {
  return addDoc(collection(requireService(portalDb, 'Firestore'), 'events', eventId, 'reports'), {
    body: values.body.trim(),
    sourceType: values.sourceType,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.size < 900 * 1024 || typeof document === 'undefined') return file;
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file;
}

function uploadPostFile(user, draftId, file, kind, onProgress) {
  const path = `post-media/${user.uid}/${draftId}/${kind}-${safeFileName(file)}`;
  return uploadMediaFile({
    storage: requireService(portalStorage, 'Storage'),
    path,
    file,
    context: 'post',
    ownerUid: user.uid,
    metadata: { draftId },
    onProgress: (amount) => onProgress?.(kind, amount),
  });
}

export async function uploadPortalPostMedia(user, draftId, { photos = [], video = null }, onProgress) {
  if (photos.length > 10) throw new Error('Posts support up to 10 photos.');
  const preparedPhotos = [];
  for (const [index, photo] of photos.entries()) {
    validateMediaFile(photo, 'post');
    if (!photo.type.startsWith('image/')) throw new Error('Photos must be image files.');
    if (photo.size > 25 * 1024 * 1024) throw new Error('Photos must be image files under 25 MB.');
    const compressed = await compressImage(photo);
    preparedPhotos.push({ ...(await uploadPostFile(user, draftId, compressed, `photo-${index + 1}`, onProgress)), width: 0, height: 0 });
  }
  let preparedVideo = null;
  if (video) {
    validateMediaFile(video, 'post');
    if (!video.type.startsWith('video/')) throw new Error('Videos must be video files.');
    preparedVideo = await uploadPostFile(user, draftId, video, 'video', onProgress);
  }
  return { photos: preparedPhotos, video: preparedVideo };
}

function uploadEvidence(user, eventId, reportId, file, kind, onProgress) {
  if (!file) return Promise.resolve(null);
  return uploadMediaFile({
    storage: requireService(portalStorage, 'Storage'),
    path: `event-media/${eventId}/${user.uid}/${reportId}-${kind}-${safeFileName(file)}`,
    file,
    context: 'event',
    ownerUid: user.uid,
    metadata: { eventId, reportId },
    onProgress: (amount) => onProgress?.(kind, amount),
  }).then((asset) => asset.url);
}

export async function publishPortalReport(user, values, onProgress) {
  const db = requireService(portalDb, 'Firestore');
  let eventId = values.eventId;
  if (!eventId) {
    const event = await callPortalIdentity('createPortalEvent', {
      title: values.eventTitle.trim(),
      description: values.description.trim(),
      eventType: values.sourceType || 'Report',
      category: values.sourceType || 'Report',
      location: values.location.trim() || '',
      visibility: 'public',
    });
    eventId = event.eventId || event.id;
  }
  const report = await addDoc(collection(db, 'events', eventId, 'reports'), {
    title: values.title.trim(),
    body: values.description.trim(),
    location: values.location.trim() || null,
    occurredAt: values.occurredAt ? Timestamp.fromDate(new Date(values.occurredAt)) : null,
    sourceType: values.identityMode === 'Casual' ? 'Community' : 'Eyewitness',
    identityMode: values.identityMode,
    visibility: 'public',
    moderationState: 'approved',
    draft: false,
    publishedAt: serverTimestamp(),
    media: {},
    createdBy: user.uid,
    authorUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    const [photoUrl, videoUrl] = await Promise.all([
      uploadEvidence(user, eventId, report.id, values.photo, 'photo', onProgress),
      uploadEvidence(user, eventId, report.id, values.video, 'video', onProgress),
    ]);
    await updateDoc(report, { media: { ...(photoUrl ? { photoUrl } : {}), ...(videoUrl ? { videoUrl } : {}) }, updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'events', eventId), { updatedAt: serverTimestamp() });
    return { eventId, reportId: report.id };
  } catch (error) {
    await updateDoc(report, { uploadFailed: true, updatedAt: serverTimestamp() });
    throw error;
  }
}

export function observeVortex(uid, callback, onError) {
  return onSnapshot(collection(requireService(portalDb, 'Firestore'), 'users', uid, 'vortex'), callback, onError);
}

export function observeVortexEntries(callback, onError) {
  return onSnapshot(
    query(collection(requireService(portalDb, 'Firestore'), 'vortexEntries'), orderBy('latestActivityAt', 'desc')),
    callback,
    onError,
  );
}

export function observePublicPosts(callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'posts'), where('visibility', '==', 'public'), orderBy('publishedAt', 'desc')), callback, onError);
}

export function observePost(postId, callback, onError) {
  return onSnapshot(doc(requireService(portalDb, 'Firestore'), 'posts', postId), callback, onError);
}

export function observeUserEchoes(uid, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'postEchoes'), where('echoingUid', '==', uid), where('status', '==', 'active'), orderBy('echoedAt', 'desc')), callback, onError);
}

export function observeUserPostLikes(uid, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'postLikes'), where('uid', '==', uid), where('status', '==', 'active')), callback, onError);
}

export function observeUserPostBookmarks(uid, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'postBookmarks'), where('uid', '==', uid), where('status', '==', 'active')), callback, onError);
}

export function observePostReplies(postId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'postReplies'), where('postId', '==', postId), where('visibility', '==', 'public'), orderBy('createdAt', 'asc')), callback, onError);
}

export function observePortalNotifications(uid, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'users', uid, 'notifications'), orderBy('createdAt', 'desc')), callback, onError);
}

export function observePortalConversations(uid, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'messageConversations'), where('participantUids', 'array-contains', uid), orderBy('lastMessageAt', 'desc')), callback, onError);
}

export function observePortalMessages(conversationId, callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'messageConversations', conversationId, 'messages'), orderBy('createdAt', 'asc'), limit(80)), callback, onError);
}

export async function createPortalConversation(user, profile) {
  const db = requireService(portalDb, 'Firestore');
  if (!profile?.uid || profile.uid === user.uid) throw new Error('Choose another Portal profile to message.');
  const participants = [user.uid, profile.uid].sort();
  const conversationId = `dm_${participants.join('_')}`;
  const conversationRef = doc(db, 'messageConversations', conversationId);
  try {
    await setDoc(conversationRef, {
      participantUids: participants,
      participantHandles: [user.displayName || 'You', profile.handle || profile.displayName || 'Portal user'],
      participantPhotoUrls: [user.photoURL || '', profile.profilePhotoUrl || ''],
      title: profile.displayName || `@${profile.handle}`,
      createdBy: user.uid,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      pinned: false,
      pinnedBy: [],
      archivedBy: [],
      deletedBy: [],
      unreadBy: [],
      typingUids: [],
    });
  } catch (error) {
    // A deterministic DM may already exist. Its participants can read and reopen it;
    // a missing document cannot be read under the membership rule, so create comes first.
    if (error?.code !== 'permission-denied') throw error;
    const existing = await getDoc(conversationRef);
    if (!existing.exists() || !existing.data().participantUids?.includes(user.uid)) throw error;
  }
  return conversationId;
}

export async function sendPortalMessage(user, conversation, body, media = null) {
  const db = requireService(portalDb, 'Firestore');
  const conversationRef = doc(db, 'messageConversations', conversation.id);
  const messageRef = collection(db, 'messageConversations', conversation.id, 'messages');
  const text = body.trim();
  if (!text && !media) throw new Error('Write a message or attach media.');
  await addDoc(messageRef, {
    senderUid: user.uid,
    body: text,
    media,
    replyTo: conversation.replyTo || null,
    linkPreview: extractLinkPreview(text),
    readBy: [user.uid],
    createdAt: serverTimestamp(),
  });
  await updateDoc(conversationRef, {
    lastMessage: text || (media?.type?.startsWith('image/') ? 'Photo' : 'Video'),
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unreadBy: (conversation.participantUids || []).filter((uid) => uid !== user.uid),
  });
}

export async function updatePortalConversationState(user, conversationId, action) {
  const updates = { updatedAt: serverTimestamp() };
  if (action === 'pin') updates.pinnedBy = arrayUnion(user.uid);
  if (action === 'unpin') updates.pinnedBy = arrayRemove(user.uid);
  if (action === 'archive') updates.archivedBy = arrayUnion(user.uid);
  if (action === 'delete') updates.deletedBy = arrayUnion(user.uid);
  if (!['pin', 'unpin', 'archive', 'delete'].includes(action)) throw new Error('Unsupported conversation action.');
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'messageConversations', conversationId), updates);
}

export function markPortalConversationRead(user, conversationId) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'messageConversations', conversationId), {
    unreadBy: arrayRemove(user.uid),
    updatedAt: serverTimestamp(),
  });
}

export function setPortalConversationTyping(user, conversationId, typing) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'messageConversations', conversationId), {
    typingUids: typing ? arrayUnion(user.uid) : arrayRemove(user.uid),
    updatedAt: serverTimestamp(),
  });
}

export function deleteOwnPortalMessage(user, conversationId, messageId) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'messageConversations', conversationId, 'messages', messageId), {
    body: 'Message deleted',
    media: null,
    deletedByUid: user.uid,
    deletedAt: serverTimestamp(),
  });
}

export async function markAllPortalNotificationsRead(uid, notifications) {
  const db = requireService(portalDb, 'Firestore');
  const batch = writeBatch(db);
  notifications.filter((item) => !item.read).forEach((item) => batch.update(doc(db, 'users', uid, 'notifications', item.id), { read: true, updatedAt: serverTimestamp() }));
  await batch.commit();
}

function extractLinkPreview(text) {
  return extractRichLinkPreview(text);
}

export function uploadPortalMessageMedia(user, conversationId, file, onProgress) {
  validateMediaFile(file, 'message');
  const path = `messages/${conversationId}/${user.uid}/${Date.now()}-${safeFileName(file)}`;
  return uploadMediaFile({
    storage: requireService(portalStorage, 'Storage'),
    path,
    file,
    context: 'message',
    ownerUid: user.uid,
    metadata: { conversationId },
    onProgress,
  });
}

export function observeIngestionProviders(callback, onError) {
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), 'ingestionProviders'), orderBy('updatedAt', 'desc')), callback, onError);
}

export function markPortalNotificationRead(uid, notificationId) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'users', uid, 'notifications', notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

export function setVortexFollow(uid, eventId, following) {
  const reference = doc(requireService(portalDb, 'Firestore'), 'users', uid, 'vortex', eventId);
  return following
    ? setDoc(reference, { eventId, createdAt: serverTimestamp() })
    : deleteDoc(reference);
}

export async function getPortalProfile(uid) {
  return getDoc(doc(requireService(portalDb, 'Firestore'), 'users', uid));
}

const publicProfileRequests = new Map();
export async function getPortalPublicProfiles(uids = []) {
  const db = requireService(portalDb, 'Firestore');
  const unique = [...new Set(uids.filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (uid) => {
    if (!publicProfileRequests.has(uid)) {
      publicProfileRequests.set(uid, getDoc(doc(db, 'publicProfiles', uid)).then((snapshot) => snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null).catch((error) => { publicProfileRequests.delete(uid); throw error; }));
    }
    return [uid, await publicProfileRequests.get(uid)];
  }));
  return Object.fromEntries(pairs.filter(([, profile]) => profile));
}

function callPortalIdentity(name, payload) {
  return httpsCallable(requireService(portalFunctions, 'Functions'), name)(payload).then((result) => result.data);
}

export function checkPortalHandle(handle) { return callPortalIdentity('checkHandleAvailability', { handle }); }
export function togglePortalProfileFollow(targetUid, following) { return callPortalIdentity('togglePortalProfileFollow', { targetUid, following }); }
export function reservePortalHandle(handle, profile) { return callPortalIdentity('reserveHandle', { handle, ...(profile ? { profile } : {}) }); }
export function changePortalHandle(handle) { return callPortalIdentity('changeHandle', { handle }); }
export function resolvePortalHandle(handle) { return callPortalIdentity('resolveHandle', { handle }); }
export function searchPortalProfiles(term) { return callPortalIdentity('searchPortalProfiles', { term }).then((data) => data.profiles || data || []); }
export function searchPortalHandleMarketplace(handle) { return callPortalIdentity('searchHandleMarketplace', { handle }); }
export function startPortalHandlePurchase(handle) { return callPortalIdentity('startHandlePurchase', { handle }); }
export function confirmPortalHandlePurchase(purchaseId) { return callPortalIdentity('confirmHandlePurchase', { purchaseId }); }
export function completePortalHandlePurchase(purchaseId) { return callPortalIdentity('completeHandlePurchase', { purchaseId }); }
export function createPortalHandleListing(handle, askingPriceAmount, currency = 'GBP') { return callPortalIdentity('createHandleListing', { handle, askingPriceAmount, currency }); }
export function submitPortalHandleOffer(listingId, offerAmount) { return callPortalIdentity('submitHandleOffer', { listingId, offerAmount }); }
export function openPortalHandleDispute(listingId) { return callPortalIdentity('openHandleDispute', { listingId }); }
export function echoPortalPost(postId) { return callPortalIdentity('echoPortalPost', { postId }); }
export function undoPortalEcho(postId) { return callPortalIdentity('undoPortalEcho', { postId }); }
export function createPortalQuoteEcho(postId, quoteText) { return callPortalIdentity('createPortalQuoteEcho', { postId, quoteText }); }
export function createPortalPost(payload) { return callPortalIdentity('createPortalPost', typeof payload === 'string' ? { body: payload } : payload); }
export function deletePortalPost(postId) { return callPortalIdentity('deletePortalPost', { postId }); }
export function togglePortalPostLike(postId) { return callPortalIdentity('togglePostLike', { postId }); }
export function togglePortalPostBookmark(postId) { return callPortalIdentity('togglePostBookmark', { postId }); }
export function registerPortalPostView(postId, metadata = {}) { return callPortalIdentity('registerPostView', { postId, ...metadata }); }
export function createPortalPostReply(postId, body) { return callPortalIdentity('createPostReply', { postId, body }); }
export function deletePortalQuoteEcho(quoteEchoId) { return callPortalIdentity('deletePortalQuoteEcho', { quoteEchoId }); }
export function submitPortalEventContribution(eventId, type, body, extra = {}) { return callPortalIdentity('submitEventContribution', { eventId, type, body, ...extra }); }
export function getPortalAdminHandle(handle) { return callPortalIdentity('getAdminHandleRecord', { handle }); }
export function managePortalHandleRegistry(payload) { return callPortalIdentity('managePortalHandleRegistry', payload); }
export function reclaimPortalHandle(payload) { return callPortalIdentity('reclaimPortalHandle', payload); }
export function refundPlaceholderPortalHandlePurchase(purchaseId) { return callPortalIdentity('refundPlaceholderHandlePurchase', { purchaseId }); }
export function requestPaidPortalHandleReview(handle, paymentReference, riskSignals = {}) { return callPortalIdentity('requestPaidHandleReview', { handle, paymentReference, riskSignals }); }
export function reviewPortalHandleRequest(payload) { return callPortalIdentity('reviewHandleRequest', payload); }
export function executePortalAdminAction(action, payload = {}) {
  const idempotencyKey = payload.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);
  return callPortalIdentity('executePortalAdminAction', { action, idempotencyKey, ...payload });
}
export function searchPortalAdminUsers(query = '', max = 1000) { return callPortalIdentity('searchPortalAdminUsers', { query, limit: max }); }
export function searchPortalAdminNotifications(query = '', max = 100) { return callPortalIdentity('searchPortalAdminNotifications', { query, limit: max }); }
export function searchPortalAdminReports(query = '', max = 250) { return callPortalIdentity('searchPortalAdminReports', { query, limit: max }); }
export function getPortalAdminUserRecord(uid) { return callPortalIdentity('getPortalAdminUserRecord', { uid }); }
export function managePortalAdminUser(action, payload = {}) { return callPortalIdentity('managePortalAdminUser', { action, ...payload }); }

const adminCollectionConfig = {
  moderationReports: ['moderationReports', 'createdAt'],
  reports: ['reports', 'createdAt'],
  handles: ['handles', 'updatedAt'],
  handleListings: ['handleListings', 'updatedAt'],
  handleRequests: ['handleRequests', 'createdAt'],
  handlePurchases: ['handlePurchases', 'createdAt'],
  handleTransfers: ['handleTransfers', 'createdAt'],
  handleDisputes: ['handleDisputes', 'updatedAt'],
  protectedHandles: ['protectedHandles', 'updatedAt'],
  reservedHandles: ['reservedHandles', 'updatedAt'],
  protectedHandleClaims: ['protectedHandleClaims', 'createdAt'],
  handlePolicies: ['handlePolicies', 'updatedAt'],
  events: ['events', 'updatedAt'],
  analyticsDaily: ['analyticsDaily', 'date'],
  systemHealth: ['systemHealth', 'updatedAt'],
  auditLogs: ['auditLogs', 'createdAt'],
  adminApprovals: ['adminApprovals', 'updatedAt'],
  adminSessions: ['adminSessions', 'lastActionAt'],
  adminActionTimeline: ['adminActionTimeline', 'createdAt'],
  recoveryQueue: ['recoveryQueue', 'createdAt'],
  adminExports: ['adminExports', 'createdAt'],
  verificationRequests: ['verificationRequests', 'createdAt'],
  broadcastNotifications: ['broadcastNotifications', 'createdAt'],
};

export function observePortalAdminCollection(key, callback, onError, max = 50) {
  const config = adminCollectionConfig[key];
  if (!config) throw new Error(`Unknown Portal Admin collection: ${key}`);
  const [path, orderField] = config;
  return onSnapshot(query(collection(requireService(portalDb, 'Firestore'), path), orderBy(orderField, 'desc'), limit(max)), callback, onError);
}

export function observeHandlePurchases(uid, callback, onError) {
  return onSnapshot(
    query(collection(requireService(portalDb, 'Firestore'), 'handlePurchases'), where('uid', '==', uid), orderBy('createdAt', 'desc')),
    callback,
    onError,
  );
}

export function observeHandleRequests(uid, callback, onError) {
  return onSnapshot(
    query(collection(requireService(portalDb, 'Firestore'), 'handleRequests'), where('uid', '==', uid), orderBy('createdAt', 'asc')),
    callback,
    onError,
  );
}
