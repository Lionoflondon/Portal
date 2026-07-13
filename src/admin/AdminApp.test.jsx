import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_CLAIM, isAdminUser } from './auth.js';

describe('Portal Admin authentication', () => {
  it('requires the canonical Portal admin token claim', () => {
    expect(ADMIN_CLAIM).toBe('portalAdmin');
    expect(isAdminUser({ portalAdmin: true })).toBe(true);
    expect(isAdminUser({ admin: true })).toBe(false);
    expect(isAdminUser({ custodian: true })).toBe(false);
    expect(isAdminUser({ email: 'ayojason600@gmail.com' })).toBe(false);
    expect(isAdminUser({})).toBe(false);
  });

  it('renders the required login controls and denial state', () => {
    const source = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    expect(source).toContain('Admin login');
    expect(source).toContain('signInPortalUserWithGoogle');
    expect(source).toContain('Continue with Google');
    expect(source).toContain('or use email and password');
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="current-password"');
    expect(source).toContain('Show password');
    expect(source).toContain('Hide password');
    expect(source).toContain('Forgotten password');
    expect(source).toContain('function AdminPasswordPanel');
    expect(source).toContain('changePortalPassword');
    expect(source).toContain('Account security');
    expect(source).toContain('Change password');
    expect(source).toContain('Passwords do not match.');
    expect(source).toContain('Incorrect email or password.');
    expect(source).toContain('Restoring admin session...');
    expect(source).toContain('Checking admin authority...');
    expect(source).toContain("route === '/login'");
    expect(source).toContain("window.location.hash = '#/'");
    expect(source).not.toContain("!user || route === '/login'");
    expect(source).toContain('Access denied');
    expect(source).toContain('Signed in as');
    expect(source).toContain('Sign out');
  });

  it('keeps the Admin build on the dedicated admin entry without public timeline actions', () => {
    const entry = readFileSync(resolve('admin/src/main.jsx'), 'utf8');
    const config = readFileSync(resolve('vite.admin.config.js'), 'utf8');
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const styles = readFileSync(resolve('src/admin/admin.css'), 'utf8');
    expect(entry).toContain("AdminApp from '@portal/admin/AdminApp.jsx'");
    expect(entry).toContain("import '@portal/admin/admin.css'");
    expect(config).toContain("root: 'admin'");
    expect(config).toContain('envDir: repoRoot');
    expect(config).toContain("outDir: '../dist-admin'");
    expect(adminSource).toContain('if (!hasFirebaseConfig)');
    expect(adminSource).not.toContain('interaction-bar');
    expect(adminSource).not.toContain('Echo with comment');
    expect(adminSource).not.toContain('Bookmark');
    expect(adminSource).not.toContain('Share this post');
    expect(styles).toContain('.admin-shell .form-stack select');
    expect(styles).toContain('.admin-shell .form-stack select option');
  });

  it('builds the Vortex Control Centre around Pulse instead of exposed confidence wording', () => {
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const styles = readFileSync(resolve('src/admin/admin.css'), 'utf8');
    expect(adminSource).toContain('function VortexControlCentre');
    expect(adminSource).toContain('Vortex Control Centre');
    expect(adminSource).toContain('Pulse Strength');
    expect(adminSource).toContain('Growth Trend');
    expect(adminSource).toContain('Active Pulses');
    expect(adminSource).toContain('Breaking Stories');
    expect(adminSource).toContain('Growing Pulses');
    expect(adminSource).toContain('Critical Pulses');
    expect(adminSource).toContain('Official Sources Online');
    expect(adminSource).toContain('Custodians Active');
    expect(adminSource).toContain('Pending Reviews');
    expect(adminSource).toContain('Platform Health');
    expect(adminSource).toContain('Promote to Breaking');
    expect(adminSource).toContain('Pin Story');
    expect(adminSource).toContain('Merge Stories');
    expect(adminSource).toContain('Split Story');
    expect(adminSource).toContain('Assign Custodian');
    expect(adminSource).toContain('Request Official Confirmation');
    expect(adminSource).toContain('Add Official Source');
    expect(adminSource).toContain('Archive Story');
    expect(adminSource).toContain('Lock Discussion');
    expect(adminSource).toContain('Issue Public Advisory');
    expect(adminSource).toContain('Remove Spam Cluster');
    expect(adminSource).toContain('🟢 Emerging');
    expect(adminSource).toContain('🔴 Critical');
    expect(adminSource).toContain('⚫ Archived');
    expect(adminSource).toContain("['/trending', 'Trending']");
    expect(adminSource).not.toContain('AI Confidence');
    expect(adminSource).not.toContain('Machine confidence');
    expect(adminSource).not.toContain('Algorithm confidence');
    expect(adminSource).not.toContain('Probability %');
    expect(styles).toContain('.pulse-meter');
    expect(styles).toContain('background:var(--accent)');
    expect(styles).toContain('.pulse-graph');
    expect(styles).toContain('@keyframes pulse-flow');
  });

  it('keeps Admin isolated from Public Portal UI modules', () => {
    const entry = readFileSync(resolve('admin/src/main.jsx'), 'utf8');
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    expect(entry).not.toContain('@portal/ui');
    expect(adminSource).not.toContain("from '../ui/");
    expect(adminSource).not.toContain('PostCard');
    expect(adminSource).not.toContain('QuoteEchoComposer');
    expect(adminSource).not.toContain('interaction-bar');
  });

  it('renders Portal Admin V2 enterprise navigation and operations surfaces', () => {
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const styles = readFileSync(resolve('src/admin/admin.css'), 'utf8');
    const service = readFileSync(resolve('src/services/firebase.js'), 'utf8');
    const functions = readFileSync(resolve('functions/index.js'), 'utf8');
    for (const label of ['Dashboard', 'Users', 'Moderation', 'Events', 'Trending', 'Verification', 'Handle Marketplace', 'Creators', 'Reports', 'Notifications', 'Analytics', 'Audit Log', 'System Health', 'Settings']) {
      expect(adminSource).toContain(label);
    }
    for (const metric of ['Active users', 'Users online now', 'Posts today', 'New registrations', 'Active events', 'Pending reports', 'Verification queue', 'Marketplace revenue', 'Tips today', 'Platform uptime']) {
      expect(adminSource).toContain(metric);
    }
    for (const chart of ['User growth', 'Posts/hour', 'Engagement', 'Active regions', 'Top categories']) {
      expect(adminSource).toContain(chart);
    }
    for (const activity of ['New reports', 'New verified users', 'Handle sales', 'Trending stories', 'System alerts']) {
      expect(adminSource).toContain(activity);
    }
    expect(adminSource).toContain('function UsersAdmin');
    expect(adminSource).toContain('Search by handle, name, email, UID, phone, business or company');
    expect(adminSource).toContain('Trust score');
    expect(adminSource).toContain('Force logout');
    expect(adminSource).toContain('function ModerationAdmin');
    expect(adminSource).toContain('Reported Posts');
    expect(adminSource).toContain('Reported Quote Echoes');
    expect(adminSource).toContain('Permanent delete');
    expect(adminSource).toContain('function EventsAdmin');
    expect(adminSource).toContain('Live Event operations');
    expect(adminSource).toContain('Reporter confidence');
    expect(adminSource).toContain('Event health');
    expect(adminSource).toContain('function VerificationAdmin');
    expect(adminSource).toContain('Emergency Services');
    expect(adminSource).toContain('function ReportsAdmin');
    expect(adminSource).toContain('False information');
    expect(adminSource).toContain('function NotificationsAdmin');
    expect(adminSource).toContain('Entire platform');
    expect(adminSource).toContain('Specific city');
    expect(adminSource).toContain('function AnalyticsAdmin');
    expect(adminSource).toContain('Device breakdown');
    expect(adminSource).toContain('function AuditLogAdmin');
    expect(adminSource).toContain('Timestamp');
    expect(adminSource).toContain('Old value');
    expect(adminSource).toContain('New value');
    expect(adminSource).toContain('function SystemHealthAdmin');
    expect(adminSource).toContain("useAdminCollection('systemHealth'");
    expect(adminSource).toContain('Firestore');
    expect(adminSource).toContain('Functions');
    expect(adminSource).toContain('Search indexing');
    expect(adminSource).toContain('function SettingsAdmin');
    expect(adminSource).toContain('Feature flags');
    expect(adminSource).toContain('Country availability');
    expect(adminSource).toContain('Platform branding');
    expect(styles).toContain('.enterprise-admin-shell');
    expect(styles).toContain('.admin-sidebar');
    expect(styles).toContain('.admin-kpi-grid');
    expect(styles).toContain('.admin-table');
    expect(styles).toContain('.admin-health-grid');
    expect(service).toContain('observePortalAdminCollection');
    expect(service).toContain('executePortalAdminAction');
    expect(functions).toContain('export const executePortalAdminAction');
    expect(functions).toContain('requirePortalAdmin(request)');
    expect(functions).toContain("db.collection('auditLogs').doc()");
    expect(functions).toContain("db.collection('adminActionTimeline').doc()");
  });

  it('connects Admin V3 live operations without direct client writes', () => {
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const service = readFileSync(resolve('src/services/firebase.js'), 'utf8');
    expect(adminSource).toContain('function useAdminCollection');
    expect(adminSource).toContain('function AdminDataTable');
    expect(adminSource).toContain('Reporter');
    expect(adminSource).toContain('Report reason');
    expect(adminSource).toContain('Target content');
    expect(adminSource).toContain('Confidence indicators');
    expect(adminSource).toContain('Bulk moderation');
    expect(adminSource).toContain('Search by handle, name, email, UID, phone, business or company');
    expect(adminSource).toContain('Profile photo');
    expect(adminSource).toContain('Handle ownership history');
    expect(adminSource).toContain('Sessions');
    expect(adminSource).toContain('Devices');
    expect(adminSource).toContain('ownership timeline');
    expect(adminSource).toContain('Interactive event map');
    expect(adminSource).toContain('CSV export');
    expect(adminSource).toContain('Date range selector');
    expect(adminSource).toContain('Live operational monitoring with timestamps and auto-refresh.');
    expect(adminSource).toContain('Admin command palette');
    expect(adminSource).toContain("event.key.toLowerCase() === 'k'");
    expect(adminSource).toContain('Preview before sending');
    expect(adminSource).toContain('runAdminAction');
    expect(adminSource).toContain('executePortalAdminAction(action');
    expect(adminSource).not.toContain('setDoc(');
    expect(adminSource).not.toContain('updateDoc(');
    expect(service).toContain('moderationReports');
    expect(service).toContain('verificationRequests');
    expect(service).toContain('broadcastNotifications');
    expect(service).toContain('systemHealth');
  });

  it('hardens Admin V4 with server-enforced RBAC, approvals, audit and recovery surfaces', () => {
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const service = readFileSync(resolve('src/services/firebase.js'), 'utf8');
    const functions = readFileSync(resolve('functions/index.js'), 'utf8');
    expect(functions).toContain('ADMIN_ROLE_PERMISSIONS');
    expect(functions).toContain('super_admin');
    expect(functions).toContain('trust_safety');
    expect(functions).toContain('verification_team');
    expect(functions).toContain('marketplace_team');
    expect(functions).toContain('read_only_auditor');
    expect(functions).toContain('requireAdminPermission(request, permission)');
    expect(functions).toContain('SENSITIVE_ADMIN_ACTIONS');
    expect(functions).toContain('adminApprovals');
    expect(functions).toContain('adminSessions');
    expect(functions).toContain('adminIdempotency');
    expect(functions).toContain('adminRateLimits');
    expect(functions).toContain('correlationId');
    expect(functions).toContain('approvalStatus');
    expect(functions).toContain('sanitizeAdminInput');
    expect(functions).toContain('csrfChecked');
    expect(functions).toContain('idempotencyKey');
    expect(adminSource).toContain('Sensitive Action Approvals');
    expect(adminSource).toContain('Admin Session Security');
    expect(adminSource).toContain('Moderator Productivity');
    expect(adminSource).toContain('Quick approve');
    expect(adminSource).toContain('Quick remove');
    expect(adminSource).toContain('Quick suspend');
    expect(adminSource).toContain('Disaster Recovery');
    expect(adminSource).toContain('Soft delete');
    expect(adminSource).toContain('Recovery queue');
    expect(adminSource).toContain('Restore handles');
    expect(adminSource).toContain('Export CSV');
    expect(adminSource).toContain('Export JSON');
    expect(adminSource).toContain('Role-Based Access Control');
    expect(adminSource).toContain('Rate-limit privileged functions');
    expect(adminSource).toContain('CSRF protection');
    expect(adminSource).toContain('Server-side sanitisation');
    expect(adminSource).toContain('CPU');
    expect(adminSource).toContain('Memory');
    expect(adminSource).toContain('auto-refresh every 30 seconds');
    expect(adminSource).toContain('Audit log');
    expect(adminSource).toContain('Comments');
    expect(adminSource).toContain('Roles:');
    expect(service).toContain('adminApprovals');
    expect(service).toContain('adminSessions');
    expect(service).toContain('recoveryQueue');
    expect(service).toContain('adminExports');
  });

  it('keeps Portal owner user management behind server RBAC callables', () => {
    const adminSource = readFileSync(resolve('src/admin/AdminApp.jsx'), 'utf8');
    const service = readFileSync(resolve('src/services/firebase.js'), 'utf8');
    const functions = readFileSync(resolve('functions/index.js'), 'utf8');
    expect(functions).toContain("requireAdminPermission(request, 'view_users')");
    expect(functions).toContain('export const searchPortalAdminUsers = onCall');
    expect(functions).toContain('export const getPortalAdminUserRecord = onCall');
    expect(functions).toContain('export const managePortalAdminUser = onCall');
    expect(functions).toContain('listAllAuthUsers');
    expect(functions).toContain('getUserProfiles');
    expect(functions).toContain('adminUserAggregates');
    expect(functions).toContain("db.collection('handles')");
    expect(functions).toContain("db.collection('handleListings')");
    expect(functions).toContain("db.collection('handlePurchases')");
    expect(functions).toContain("db.collection('posts')");
    expect(functions).toContain("db.collection('postReplies')");
    expect(functions).toContain("db.collection('events')");
    expect(functions).toContain("db.collectionGroup('reports')");
    expect(functions).toContain("reset_password: 'reset_user_password'");
    expect(functions).toContain("transfer_handle: 'transfer_handle'");
    expect(functions).toContain("support: ['warn_user', 'force_logout', 'message_user', 'view_reports', 'view_audit_logs']");
    expect(service).toContain("callPortalIdentity('searchPortalAdminUsers'");
    expect(service).toContain("callPortalIdentity('getPortalAdminUserRecord'");
    expect(service).toContain("callPortalIdentity('managePortalAdminUser'");
    expect(service).not.toContain("users: ['users', 'updatedAt']");
    expect(adminSource).toContain("key === 'users'");
    expect(adminSource).toContain('function UserProfileDrawer');
    for (const field of ['Profile photo', 'Display name', 'Handle', 'UID', 'Email', 'Phone', 'Account type(s)', 'Joined', 'Verification status', 'Trust score', 'Marketplace ownership', 'Last active', 'Account status']) {
      expect(adminSource).toContain(field);
    }
    for (const section of ['Platform Membership', 'Trust', 'Marketplace', 'Portal', 'Circum', 'Audit history']) {
      expect(adminSource).toContain(section);
    }
    expect(adminSource).toContain("return 'Not available'");
    expect(adminSource).toContain('Password reset link generated and copied.');
    const audit = readFileSync(resolve('docs/admin-user-data-audit.md'), 'utf8');
    expect(audit).toContain('Firebase Auth');
    expect(audit).toContain('Sources not present in Portal production');
    expect(audit).toContain('Firestore rules remain unchanged');
  });

  it('documents Admin V5 production readiness and launch blockers', () => {
    const report = readFileSync(resolve('docs/admin-production-readiness.md'), 'utf8');
    const script = readFileSync(resolve('scripts/admin-production-readiness-check.mjs'), 'utf8');
    const pkg = readFileSync(resolve('package.json'), 'utf8');
    expect(report).toContain('Production Readiness Report');
    expect(report).toContain('Do not launch to production yet.');
    expect(report).toContain('Security Audit Summary');
    expect(report).toContain('Load Testing Results');
    expect(report).toContain('Disaster Recovery Results');
    expect(report).toContain('Observability Plan');
    expect(report).toContain('Audit-log viewing cannot work through direct Firestore client reads under current rules.');
    expect(report).toContain('Deployment Recommendation');
    expect(script).toContain('Admin production readiness check passed.');
    expect(pkg).toContain('check:admin-readiness');
  });
});
