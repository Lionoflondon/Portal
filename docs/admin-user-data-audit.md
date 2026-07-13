# Portal Admin User Data Audit

Audited against the production `portal-prod-f2308` Firestore collection inventory on 13 July 2026.

## User sources used

- Firebase Authentication: UID, email, phone, providers, verification, disabled state, creation time, last sign-in, last refresh and Admin claims.
- `users/{uid}`: private Portal profile, photo, banner, handle, account type, trust and stored counters.
- `publicProfiles/{uid}`: public profile fallback.
- `handles`: canonical ownership and owned-handle count.
- `handleListings`: seller listings.
- `handlePurchases`: purchases associated with the Portal UID.
- `posts`: authored Post count.
- `postReplies`: authored comment/reply count.
- `events`: created Event count.
- Event `reports` collection group: submitted Report count.
- `auditLogs`: lazy-loaded Admin audit history targeting the user.

The Users table loads Auth, profile and bounded aggregate data through `searchPortalAdminUsers`. The profile drawer lazily loads the full Portal record through `getPortalAdminUserRecord`.

## Sources not present in Portal production

The Portal Firebase project does not currently contain root collections for `senderProfiles`, `riderProfiles`, `portalProfiles`, business profiles, follower graphs, following graphs, warnings, suspensions, verification requests, documents, deliveries, bookings, earnings or Roth balances.

The Admin UI reports these fields as `Not available`. It does not query unrelated Firebase projects and does not infer membership or financial data.

## Security

Both user callables require the existing `view_users` RBAC permission. Firestore rules remain unchanged and continue to block direct client reads of private `users` records. User-management actions remain in `managePortalAdminUser` with their existing per-action permissions and immutable audit records.
