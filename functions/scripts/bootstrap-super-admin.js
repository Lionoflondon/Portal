import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/* global process */

const OWNER_EMAIL = 'ayojason600@gmail.com';
const OWNER_ROLE = 'super-admin';
const OWNER_PERMISSIONS = ['*'];

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'portal-prod-f2308' });

const auth = getAuth();
const db = getFirestore();

async function bootstrapSuperAdmin() {
  const user = await auth.getUserByEmail(OWNER_EMAIL);
  const existingClaims = user.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    portalAdmin: true,
    portalAdminRole: OWNER_ROLE,
    portalAdminRoles: [OWNER_ROLE],
    portalHandleSuperAdmin: true,
  };
  await auth.setCustomUserClaims(user.uid, nextClaims);

  const adminRef = db.collection('portalAdmins').doc(user.uid);
  const existing = await adminRef.get();
  await adminRef.set({
    uid: user.uid,
    email: user.email || OWNER_EMAIL,
    role: OWNER_ROLE,
    active: true,
    permissions: OWNER_PERMISSIONS,
    createdAt: existing.exists ? existing.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: existing.exists ? existing.data().createdBy || 'bootstrap-super-admin' : 'bootstrap-super-admin',
    bootstrapSource: 'functions/scripts/bootstrap-super-admin.js',
  }, { merge: true });

  await db.collection('auditLogs').add({
    action: 'bootstrap_super_admin',
    actorUid: 'system',
    targetUid: user.uid,
    targetEmail: OWNER_EMAIL,
    entityType: 'portalAdmins',
    reason: 'Repair canonical Portal Admin owner authority.',
    oldValue: { portalAdminRole: existingClaims.portalAdminRole || null, portalAdminRoles: existingClaims.portalAdminRoles || null },
    newValue: { portalAdminRole: OWNER_ROLE, portalAdminRoles: [OWNER_ROLE], portalAdmin: true },
    immutable: true,
    status: 'recorded',
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({ ok: true, uid: user.uid, email: user.email, role: OWNER_ROLE }));
}

bootstrapSuperAdmin().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
