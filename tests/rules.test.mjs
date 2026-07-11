// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'portal-prod-f2308',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9195, rules: await readFile('storage.rules', 'utf8') },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('Portal Firebase rules', () => {
  it('keeps profiles and Vortex data private to their owner', async () => {
    const jason = testEnv.authenticatedContext('jason');
    const maya = testEnv.authenticatedContext('maya');
    await assertSucceeds(setDoc(doc(jason.firestore(), 'users/jason'), { displayName: 'Jason' }));
    await assertFails(getDoc(doc(maya.firestore(), 'users/jason')));
    await assertSucceeds(setDoc(doc(jason.firestore(), 'users/jason/vortex/event-1'), { eventId: 'event-1' }));
    await assertFails(getDoc(doc(maya.firestore(), 'users/jason/vortex/event-1')));
  });

  it('blocks direct handle ownership writes while allowing profile details', async () => {
    const jason = testEnv.authenticatedContext('jason-profile');
    await assertSucceeds(setDoc(doc(jason.firestore(), 'users/jason-profile'), { displayName: 'Jason', email: 'jason@example.com', preferences: {}, createdAt: new Date(), updatedAt: new Date() }));
    await assertSucceeds(setDoc(doc(jason.firestore(), 'users/jason-profile'), { bio: 'Building Portal.', location: 'London', website: 'https://portal.example' }, { merge: true }));
    await assertFails(setDoc(doc(jason.firestore(), 'users/jason-profile'), { handle: 'jason' }, { merge: true }));
    await assertFails(setDoc(doc(jason.firestore(), 'handles/jason'), { ownerUid: 'jason-profile' }));
  });

  it('allows shared event reads while preserving creator-only writes', async () => {
    const jason = testEnv.authenticatedContext('jason');
    const maya = testEnv.authenticatedContext('maya');
    const anon = testEnv.unauthenticatedContext();
    const event = doc(jason.firestore(), 'events/event-1');
    await assertSucceeds(setDoc(event, { title: 'Portal event', summary: 'A real verified happening.', status: 'Developing', archived: false, createdBy: 'jason' }));
    await assertSucceeds(getDoc(doc(maya.firestore(), 'events/event-1')));
    await assertFails(setDoc(doc(maya.firestore(), 'events/event-1'), { title: 'Changed by Maya' }, { merge: true }));
    await assertFails(getDoc(doc(anon.firestore(), 'events/event-1')));
  });

  it('only accepts authenticated, owned media uploads', async () => {
    const jason = testEnv.authenticatedContext('jason');
    const maya = testEnv.authenticatedContext('maya');
    await assertSucceeds(uploadBytes(ref(jason.storage(), 'event-media/event-1/jason/photo.jpg'), new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(maya.storage(), 'event-media/event-1/jason/photo.jpg'), new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(jason.storage(), 'event-media/event-1/jason/notes.txt'), new Uint8Array([1, 2]), { contentType: 'text/plain' }));
  });

  it('keeps Echo and Quote Echo writes server-authoritative', async () => {
    const jason = testEnv.authenticatedContext('jason-echo');
    const maya = testEnv.authenticatedContext('maya-echo');
    await assertFails(setDoc(doc(jason.firestore(), 'postEchoes/post-1_jason-echo'), { sourcePostId: 'post-1', echoingUid: 'jason-echo', status: 'active' }));
    await assertFails(setDoc(doc(jason.firestore(), 'quoteEchoes/quote-1'), { sourcePostId: 'post-1', quoteAuthorUid: 'jason-echo', visibility: 'public' }));
    await assertFails(setDoc(doc(maya.firestore(), 'posts/post-1'), { authorUid: 'maya-echo', visibility: 'public' }));
  });

  it('keeps Echo notifications private and read-only except read state', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/jason-notify/notifications/echo-1'), { type: 'echo', postId: 'post-1', read: false, createdAt: new Date() });
    });
    const jason = testEnv.authenticatedContext('jason-notify');
    const maya = testEnv.authenticatedContext('maya-notify');
    await assertSucceeds(getDoc(doc(jason.firestore(), 'users/jason-notify/notifications/echo-1')));
    await assertFails(getDoc(doc(maya.firestore(), 'users/jason-notify/notifications/echo-1')));
    await assertFails(setDoc(doc(jason.firestore(), 'users/jason-notify/notifications/client-made'), { type: 'echo', read: false }));
    await assertSucceeds(updateDoc(doc(jason.firestore(), 'users/jason-notify/notifications/echo-1'), { read: true, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(jason.firestore(), 'users/jason-notify/notifications/echo-1'), { postId: 'post-2' }));
  });

  it('keeps Global Event Engine records server-authoritative', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'eventTimeline/entry-1'), { eventId: 'event-1', entryType: 'event_detected', eventTimestamp: new Date(), ingestionTimestamp: new Date(), moderationState: 'approved' });
      await setDoc(doc(context.firestore(), 'eventSources/source-1'), { eventId: 'event-1', provider: 'official' });
    });
    const jason = testEnv.authenticatedContext('jason-global-events');
    await assertSucceeds(getDoc(doc(jason.firestore(), 'eventTimeline/entry-1')));
    await assertSucceeds(getDoc(doc(jason.firestore(), 'eventSources/source-1')));
    await assertFails(setDoc(doc(jason.firestore(), 'eventTimeline/client-entry'), { eventId: 'event-1', entryType: 'status_change' }));
    await assertFails(setDoc(doc(jason.firestore(), 'eventCandidates/client-candidate'), { title: 'Fake candidate' }));
    await assertFails(setDoc(doc(jason.firestore(), 'ingestionProviders/client-provider'), { enabled: true }));
  });

  it('keeps handle anti-abuse state server-authoritative', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'handleRequests/request-1'), { uid: 'jason-risk', normalizedHandle: 'jason', status: 'pending_review', riskScore: 50, approvalState: 'pending_review', paymentState: 'not_required', issuanceState: 'not_issued' });
    });
    const jason = testEnv.authenticatedContext('jason-risk');
    const maya = testEnv.authenticatedContext('maya-risk');
    await assertSucceeds(getDoc(doc(jason.firestore(), 'handleRequests/request-1')));
    await assertFails(getDoc(doc(maya.firestore(), 'handleRequests/request-1')));
    await assertFails(setDoc(doc(jason.firestore(), 'handleRequests/request-1'), { riskScore: 0, approvalState: 'approved', issuanceState: 'issued' }, { merge: true }));
    await assertFails(setDoc(doc(jason.firestore(), 'handleRiskSignals/device-1'), { kind: 'device', signature: 'abc', uid: 'jason-risk' }));
  });

  it('keeps handle purchase records owner-readable and server-authoritative', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'handlePurchases/purchase-1'), { uid: 'jason-purchase', normalizedHandle: 'nebula', status: 'assigned', developmentPaid: true, paymentStatus: 'approved', issuanceState: 'issued', createdAt: new Date() });
    });
    const jason = testEnv.authenticatedContext('jason-purchase');
    const maya = testEnv.authenticatedContext('maya-purchase');
    await assertSucceeds(getDoc(doc(jason.firestore(), 'handlePurchases/purchase-1')));
    await assertFails(getDoc(doc(maya.firestore(), 'handlePurchases/purchase-1')));
    await assertFails(setDoc(doc(jason.firestore(), 'handlePurchases/purchase-2'), { uid: 'jason-purchase', developmentPaid: true, paymentStatus: 'approved', issuanceState: 'issued' }));
    await assertFails(updateDoc(doc(jason.firestore(), 'handlePurchases/purchase-1'), { paymentStatus: 'approved', issuanceState: 'issued' }));
  });
});
