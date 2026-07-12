# Portal Admin V5 Production Readiness Report

Date: 2026-07-12

Scope: Portal Admin only. Public Portal was not modified.

## Executive Summary

Portal Admin has the correct isolated build entry, dedicated Admin application shell, callable-only privileged action model, server-side RBAC primitives, sensitive-action approval records, immutable audit log writes from Cloud Functions, idempotency keys, rate-limit records, correlation IDs and an Admin isolation guard.

Deployment recommendation: **Do not launch to production yet.**

Reason: there are no critical code-execution findings in the audited Admin callable path, but production readiness cannot be signed off until live load tests, recovery drills and observability alert wiring have been executed against the intended Firebase project. Also, Firestore rules currently make `auditLogs` unreadable from the client, while the Admin UI contains a direct audit-log table. That is secure for immutability, but the audit-log viewer needs a callable read API or explicit admin-read rules before launch.

## Security Audit Summary

### Verified Controls

- Admin routes are isolated in the dedicated Admin build entry:
  - `admin/index.html`
  - `admin/src/main.jsx`
  - `vite.admin.config.js`
  - `dist-admin`
- Public/Admin import boundaries are checked by `scripts/guard-portal-isolation.mjs`.
- Privileged Admin actions execute through `executePortalAdminAction`.
- `executePortalAdminAction` requires:
  - Firebase Authentication
  - `portalAdmin` token claim
  - server-side RBAC permission
  - reason
  - idempotency key
  - rate-limit record
  - immutable audit entry
  - correlation ID
- Sensitive actions create approval records in `adminApprovals`.
- Audit entries include action ID, timestamp, admin, role, target, old value, new value, reason, approval status, device, IP, correlation ID and status.
- Client writes are blocked for trusted collections including `handles`, `protectedHandles`, `reservedHandles`, `handlePolicies`, `marketplaceConfig`, `handleRiskSignals` and `auditLogs`.
- Protected handle operations use server-side permission gates.
- Duplicate privileged submissions are blocked through `adminIdempotency`.
- Rate-limit state is written to `adminRateLimits`.
- Input is sanitised by `sanitizeAdminInput` before audit storage.

### Findings

| Severity | Finding | Status | Recommendation |
| --- | --- | --- | --- |
| High | Admin UI reads `auditLogs` directly, but Firestore rules deny client reads. | Open | Add a callable audit-log search/export function or add admin-only read rules after threat review. |
| High | Live production load testing has not been executed. | Open | Run staged 25/50/100 moderator and 500-operation tests before launch. |
| High | Disaster recovery drills have not been executed against production-like data. | Open | Run restore, rollback and handle recovery drills in staging. |
| Medium | Observability alert destinations are documented but not verified live. | Open | Configure Firebase/GCP alert policies and run alert-fire drills. |
| Medium | Some legacy Admin callables now have RBAC gates, but need emulator tests with multiple custom-claim roles. | Open | Add role-specific callable emulator tests before broad admin onboarding. |
| Low | Admin bundle size exceeds Vite warning threshold. | Accepted | Consider code splitting after launch readiness is otherwise cleared. |

## Privilege Escalation / IDOR Review

No direct Admin route bypass was found in the Admin shell. Privileged actions are sent to Cloud Functions with server-side permission checks.

Open risk: table rows can reference arbitrary target IDs, so all future action-specific callables must independently verify target existence, target type and caller permission. The generic action logger does not mutate target records, so it does not currently create an IDOR mutation path.

## Firestore Rules Review

Least-privilege posture is strict. Trusted Admin and registry collections are not client-writable.

Important launch note: Admin operational tables that read server-only collections need callable read APIs or explicit admin-read rules. This applies especially to:

- `auditLogs`
- `adminApprovals`
- `adminSessions`
- `adminActionTimeline`
- `recoveryQueue`
- some handle registry records

## Load Testing Results

Live load testing was **not executed** because deployment and production traffic were explicitly prohibited in this task.

Required pre-launch tests:

| Scenario | Target | Required measurements |
| --- | --- | --- |
| 25 moderators | Moderation queue/search/actions | Average latency, p95, reads/writes, failures |
| 50 moderators | Moderation + reports + verification | Average latency, p95, reads/writes, function duration |
| 100 moderators | Mixed Admin read load | Listener stability, memory, error rate |
| 500 concurrent admin operations | Callable action logger, audit logging, approvals | Cold starts, p95, failures, duplicate protection |

Pass criteria:

- p95 privileged callable latency under 1500 ms after warm-up
- no duplicate audit entries for repeated idempotency keys
- no unauthorised operation succeeds
- no failed provider or queue stalls unrelated Admin surfaces
- Cloud Function memory remains below configured threshold

## Disaster Recovery Results

Recovery implementation surfaces exist, but live recovery drills were **not executed**.

Required drills:

- Restore deleted content
- Restore suspended users
- Recover handles
- Rollback failed moderation
- Rollback failed verification
- Validate recovery queue
- Validate retention timers
- Restore from backup export

Expected documentation per drill:

- Start time
- End time
- Operator
- Target entity
- Recovery action
- Audit ID
- Data integrity result
- User-visible state after recovery

## Observability Plan

Production monitoring must cover:

- Firestore
- Cloud Functions
- Hosting
- Authentication
- Storage
- Notifications
- Realtime listeners
- Search indexing
- Queues
- Error rates
- Latency
- Memory
- CPU

Required alerts:

- Function failures
- High latency
- Permission failures
- Repeated approval failures
- Large moderation spikes
- Authentication failures
- Unexpected traffic

Alert destinations must be confirmed with the operations owner before launch.

## Operational Tools

Existing Admin V4/V5 surfaces support or document:

- Incident dashboard concepts through System Health and Dashboard
- Maintenance and emergency broadcasts through Notifications
- Read-only emergency mode and feature flags through Settings
- Background job monitor through System Health
- Queue monitor through Moderation and Reports
- System announcements through Notifications
- Command palette for Users, Handles, Posts, Comments, Events, Reports, Verification, Creators, Marketplace and Audit Log

Open item: live operational tool actions should remain callable-only and require explicit RBAC permissions.

## Documentation Index

Current internal documents:

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/admin-production-readiness.md`

Required before launch:

- RBAC guide
- Moderation workflow
- Verification workflow
- Marketplace workflow
- Audit logging guide
- Incident response guide
- Recovery guide
- Deployment guide
- Rollback guide

## Final Validation

Required commands:

```bash
npm run lint
npm test
npm run build:admin
node --check functions/index.js
node scripts/admin-production-readiness-check.mjs
```

## Known Issues

1. Audit-log viewing cannot work through direct Firestore client reads under current rules.
2. Production load testing not run.
3. Disaster recovery drills not run.
4. Monitoring alert policies not verified live.
5. Role-specific emulator tests should be expanded before onboarding multiple Admin teams.

## Remaining Risks

- Misconfigured custom claims could grant too much or too little access.
- Generic Admin action logging does not replace action-specific business validation.
- Admin direct reads of server-only collections need a deliberate API/rules decision.
- Production concurrency characteristics remain unproven until load tests are executed.

## Deployment Recommendation

**Do not deploy Portal Admin V5 as production-ready yet.**

The Admin application is structurally improved and security posture is stronger, but launch should wait until:

1. Audit log access is moved behind a secure callable API or approved admin-read rules.
2. Load tests are executed and documented.
3. Disaster recovery drills are executed and documented.
4. Monitoring and alert policies are configured and verified.
5. Role-specific callable permission tests are expanded.

