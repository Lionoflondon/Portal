import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { protectedRegistrySeed, reservedHandleSeed } from '../protected-handle-seed.js';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function writeSeed(collection, records) {
  for (let index = 0; index < records.length; index += 400) {
    const batch = db.batch();
    records.slice(index, index + 400).forEach((record) => batch.set(db.collection(collection).doc(record.normalizedHandle), { ...record, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await batch.commit();
  }
}

await writeSeed('protectedHandles', protectedRegistrySeed);
await writeSeed('reservedHandles', reservedHandleSeed);
await db.collection('handlePolicies').doc('_config').set({ reclaimCoolingOffDays: 30, highRiskCategories: ['system', 'portal', 'emergency', 'government', 'brand', 'celebrity', 'politician', 'public_figure', 'moderator', 'staff'], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`Seeded ${protectedRegistrySeed.length} protected and ${reservedHandleSeed.length} reserved Portal handles.`);
