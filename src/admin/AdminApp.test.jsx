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
    expect(adminSource).toContain('Search by handle, name, email, UID, phone or company');
    expect(adminSource).toContain('Trust Score');
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
    expect(adminSource).toContain('Search by handle, name, email, UID, phone or company');
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
});
