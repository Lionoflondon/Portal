// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
});
