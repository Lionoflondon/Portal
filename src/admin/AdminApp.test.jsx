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
    const styles = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(entry).toContain("AdminApp from '@portal/admin/AdminApp.jsx'");
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
});
