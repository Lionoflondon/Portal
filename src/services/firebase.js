import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
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
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

export function signInPortalUser(email, password) {
  return signInWithEmailAndPassword(requireService(portalAuth, 'Authentication'), email, password);
}

export function signOutPortalUser() {
  return signOut(requireService(portalAuth, 'Authentication'));
}

export function sendPortalPasswordReset(email) {
  return sendPasswordResetEmail(requireService(portalAuth, 'Authentication'), email);
}

export async function updatePortalProfile(user, { displayName, emailUpdates }) {
  await updateProfile(user, { displayName });
  await setDoc(doc(requireService(portalDb, 'Firestore'), 'users', user.uid), {
    displayName,
    preferences: { emailUpdates: Boolean(emailUpdates) },
    updatedAt: serverTimestamp(),
  }, { merge: true });
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

export function observeEvent(eventId, callback, onError) {
  return onSnapshot(doc(requireService(portalDb, 'Firestore'), 'events', eventId), callback, onError);
}

export async function createPortalEvent(user, values) {
  return addDoc(collection(requireService(portalDb, 'Firestore'), 'events'), {
    title: values.title.trim(),
    summary: values.summary.trim(),
    status: values.status,
    parentEventId: values.parentEventId || null,
    archived: false,
    visibility: 'public',
    moderationState: 'approved',
    publishedAt: serverTimestamp(),
    createdBy: user.uid,
    authorUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updatePortalEvent(eventId, values) {
  return updateDoc(doc(requireService(portalDb, 'Firestore'), 'events', eventId), {
    title: values.title.trim(),
    summary: values.summary.trim(),
    status: values.status,
    parentEventId: values.parentEventId || null,
    updatedAt: serverTimestamp(),
  });
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

export function createPortalReport(user, eventId, values) {
  return addDoc(collection(requireService(portalDb, 'Firestore'), 'events', eventId, 'reports'), {
    body: values.body.trim(),
    sourceType: values.sourceType,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function safeFileName(file) {
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `${crypto.randomUUID()}${extension}`;
}

function uploadEvidence(user, eventId, reportId, file, kind, onProgress) {
  if (!file) return Promise.resolve(null);
  const task = uploadBytesResumable(
    ref(requireService(portalStorage, 'Storage'), `event-media/${eventId}/${user.uid}/${reportId}-${kind}-${safeFileName(file)}`),
    file,
    { contentType: file.type },
  );
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snapshot) => onProgress?.(kind, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), reject, async () => {
      try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (error) { reject(error); }
    });
  });
}

export async function publishPortalReport(user, values, onProgress) {
  const db = requireService(portalDb, 'Firestore');
  let eventId = values.eventId;
  if (!eventId) {
    const event = await addDoc(collection(db, 'events'), {
      title: values.eventTitle.trim(),
      summary: values.description.trim(),
      status: 'Developing',
      parentEventId: null,
      archived: false,
      visibility: 'public',
      moderationState: 'approved',
      publishedAt: serverTimestamp(),
      createdBy: user.uid,
      authorUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    eventId = event.id;
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

export function setVortexFollow(uid, eventId, following) {
  const reference = doc(requireService(portalDb, 'Firestore'), 'users', uid, 'vortex', eventId);
  return following
    ? setDoc(reference, { eventId, createdAt: serverTimestamp() })
    : deleteDoc(reference);
}

export async function getPortalProfile(uid) {
  return getDoc(doc(requireService(portalDb, 'Firestore'), 'users', uid));
}

function callPortalIdentity(name, payload) {
  return httpsCallable(requireService(portalFunctions, 'Functions'), name)(payload).then((result) => result.data);
}

export function checkPortalHandle(handle) { return callPortalIdentity('checkHandleAvailability', { handle }); }
export function reservePortalHandle(handle) { return callPortalIdentity('reserveHandle', { handle }); }
export function changePortalHandle(handle) { return callPortalIdentity('changeHandle', { handle }); }
export function resolvePortalHandle(handle) { return callPortalIdentity('resolveHandle', { handle }); }
export function searchPortalProfiles(term) { return callPortalIdentity('searchPortalProfiles', { term }); }
