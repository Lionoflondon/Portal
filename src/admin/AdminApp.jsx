import { useEffect, useState } from 'react';
import {
  changePortalPassword,
  executePortalAdminAction,
  getPortalAdminHandle,
  getPortalAdminUserRecord,
  getPortalTokenClaims,
  hasFirebaseConfig,
  managePortalHandleRegistry,
  managePortalAdminUser,
  observePortalAdminCollection,
  observeSession,
  observeVortexEntries,
  reclaimPortalHandle,
  refundPlaceholderPortalHandlePurchase,
  reviewPortalHandleRequest,
  searchPortalAdminNotifications,
  searchPortalAdminReports,
  searchPortalAdminUsers,
  sendPortalPasswordReset,
  signInPortalUser,
  signInPortalUserWithGoogle,
  signOutPortalUser,
} from '../services/firebase.js';
import { isAdminUser } from './auth.js';

function firebaseMessage(reason) {
  const code = reason?.code || '';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Incorrect email or password.';
  if (code.includes('auth/user-not-found')) return 'No Portal Admin account exists for that email.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Reset your password or try again later.';
  if (code.includes('auth/invalid-email')) return 'Enter a valid email address.';
  if (code.includes('auth/network-request-failed')) return 'Network error. Check your connection and try again.';
  return reason?.message?.replace('Firebase: ', '') || 'Something went wrong. Please try again.';
}

function initials(name = '') {
  return name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase() || 'P';
}

function Brand() {
  return <a href="#/" className="brand" aria-label="Portal Admin home"><span className="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" /></svg></span><span className="brand-name">Portal Admin</span></a>;
}

function Avatar({ children }) {
  return <span className="avatar size-sm">{children}</span>;
}

function formatMoney(amount, currency = 'GBP') {
  if (!Number.isFinite(amount)) return 'Unknown amount';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

function timeLabel(value) {
  if (!value) return 'Not set';
  const date = value.toDate ? value.toDate() : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value?._seconds ? new Date(value._seconds * 1000) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available';
}

function relativeTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value?._seconds ? new Date(value._seconds * 1000) : null;
  if (!date) return 'Not set';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 48 * 60 * 60_000) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function useAdminCollection(key, search = '', max = 1000) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!hasFirebaseConfig) { setLoading(false); return undefined; }
    if (key === 'users') {
      setLoading(true);
      const timer = window.setTimeout(() => {
        searchPortalAdminUsers(search, max).then((result) => { setItems(result.users || []); setError(''); setLoading(false); }).catch((reason) => { setError(firebaseMessage(reason)); setLoading(false); });
      }, 250);
      return () => window.clearTimeout(timer);
    }
    if (key === 'broadcastNotifications') {
      setLoading(true);
      const timer = window.setTimeout(() => {
        searchPortalAdminNotifications(search, max).then((result) => { setItems(result.notifications || []); setError(''); setLoading(false); }).catch((reason) => { setError(firebaseMessage(reason)); setLoading(false); });
      }, 250);
      return () => window.clearTimeout(timer);
    }
    if (key === 'reports') {
      setLoading(true);
      const timer = window.setTimeout(() => {
        searchPortalAdminReports(search, max).then((result) => { setItems(result.reports || []); setError(''); setLoading(false); }).catch((reason) => { setError(firebaseMessage(reason)); setLoading(false); });
      }, 250);
      return () => window.clearTimeout(timer);
    }
    return observePortalAdminCollection(key, (snapshot) => {
      setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, (reason) => {
      setError(firebaseMessage(reason));
      setLoading(false);
    }, max);
  }, [key, search, max]);
  return { items, error, loading };
}

function valueForPath(item = {}, path = '') {
  return path.split('.').reduce((current, key) => current?.[key], item);
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return 'Not available';
  if (value?.toDate || value instanceof Date || value?._seconds) return timeLabel(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return timeLabel(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === 'object' ? item.id || item.handle || item.action || 'Record' : item).join(', ') : 'Not available';
  if (typeof value === 'object') return 'Available';
  return String(value);
}

function renderAdminCell(column, value, item) {
  if (column === 'Profile photo') return value ? <img className="admin-user-avatar" src={value} alt="" /> : <Avatar>{initials(item.displayName || item.email)}</Avatar>;
  if (column === 'Handle') return value ? `@${value}` : 'Not available';
  if (['Joined', 'Last active'].includes(column)) return timeLabel(value);
  return displayValue(value);
}

async function runAdminAction(action, payload = {}) {
  return executePortalAdminAction(action, payload);
}

function pulseValue(story = {}) {
  const raw = story.pulseStrength ?? story.pulseScore ?? story.relevanceScore ?? story['confidence'] ?? 0;
  const normalized = Number(raw) <= 1 && Number(raw) > 0 ? Number(raw) * 100 : Number(raw);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(normalized) ? normalized : 0)));
}

function pulseLabel(value) {
  if (value >= 88) return 'Critical';
  if (value >= 76) return 'Major';
  if (value >= 62) return 'Strong';
  if (value >= 36) return 'Building';
  return 'Weak';
}

function storyStatus(story = {}, value = pulseValue(story)) {
  if (String(story.status || '').toLowerCase() === 'archived') return '⚫ Archived';
  if (value >= 88) return '🔴 Critical';
  if (value >= 76) return '🟠 Major';
  if (value >= 62) return '🟡 Strong';
  if (value >= 36) return '🟢 Building';
  return '🟢 Emerging';
}

function trendLabel(story = {}, value = pulseValue(story)) {
  if (story.growthTrend) return story.growthTrend;
  const velocity = Number(story.activityVelocity ?? story.velocity ?? 0);
  if (velocity > 0.2 || value >= 76) return 'Growing';
  if (velocity < -0.1) return 'Declining';
  if (story.latestActivityAt && Date.now() - (story.latestActivityAt.toDate ? story.latestActivityAt.toDate().getTime() : 0) > 72 * 60 * 60_000) return 'Dormant';
  return 'Stable';
}

function sparkPoints(story = {}, value = pulseValue(story)) {
  const history = Array.isArray(story.pulseHistory) ? story.pulseHistory : [];
  const points = history.length ? history.map((item) => pulseValue(item)) : [Math.max(4, value - 18), Math.max(7, value - 9), value, Math.min(100, value + (trendLabel(story, value) === 'Growing' ? 8 : 0))];
  return points.slice(-8).map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, point));
    return `${x},${y}`;
  }).join(' ');
}

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function login(event) {
    event.preventDefault();
    setBusy(true); setNotice(''); setError('');
    try { await signInPortalUser(email.trim(), password); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true); setNotice(''); setError('');
    try { await sendPortalPasswordReset(email.trim()); setNotice('Password reset email sent.'); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }

  async function googleLogin() {
    setBusy(true); setNotice(''); setError('');
    try { await signInPortalUserWithGoogle(); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }

  return <main className="auth-shell"><section className="auth-panel"><Brand /><div><h1 className="display-xl">Admin login</h1><p className="body-md">Portal Admin is restricted to authorised staff.</p></div>{!hasFirebaseConfig ? <p className="form-error">Firebase environment configuration is missing.</p> : <form className="form-stack" onSubmit={login}><button className="btn btn-primary" type="button" onClick={googleLogin} disabled={busy}>Continue with Google</button><div className="auth-divider"><span>or use email and password</span></div><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Password<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span></label>{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<button className="btn btn-secondary" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in...' : 'Sign in with password'}</button><button className="btn btn-secondary" type="button" onClick={reset} disabled={busy || !email.trim()}>Forgotten password</button></form>}</section></main>;
}

function AccessDenied({ user }) {
  return <main className="auth-shell"><section className="auth-panel"><Brand /><Avatar>{initials(user?.displayName || user?.email)}</Avatar><div><h1 className="display-xl">Access denied</h1><p className="body-md">This account is not authorised for Portal Admin.</p><p className="body-sm">Signed in as {user?.email || 'unknown account'}.</p></div><button className="btn btn-secondary" type="button" onClick={() => signOutPortalUser()}>Sign out</button></section></main>;
}

function AdminPasswordPanel() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    setNotice(''); setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await changePortalPassword(password);
      setPassword('');
      setConfirm('');
      setNotice('Password changed.');
    } catch (reason) {
      const code = reason?.code || '';
      setError(code.includes('auth/requires-recent-login') ? 'Please sign out and sign in again before changing your password.' : firebaseMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <section className="glass card"><h2 className="display-md">Account security</h2><form className="form-stack" onSubmit={save}><label>New password<span className="password-field"><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button type="button" className="password-toggle" onClick={() => setShow((visible) => !visible)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button></span></label><label>Confirm password<input type={show ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<button className="btn btn-primary" disabled={busy || !password || !confirm}>{busy ? 'Changing...' : 'Change password'}</button></form></section>;
}

const marketplaceSubsections = ['Overview', 'Handle Registry', 'Purchase Requests', 'Transfer Requests', 'Reserved Handles', 'Protected Handles', 'Premium Handles', 'Brand Claims', 'Ownership Disputes', 'Pricing', 'Users and Ownership', 'Audit Log', 'Settings'];
const handleTypes = ['Standard', 'Premium', 'Brand', 'Company', 'Institution', 'Public Interest', 'Government', 'Emergency Service', 'Celebrity', 'Staff', 'Moderator', 'System', 'Legacy', 'Permanently Reserved'];
const handleStatuses = ['Available', 'Requested', 'Pending Approval', 'Approved for Purchase', 'Payment Pending', 'Active', 'Reserved', 'Protected', 'Suspended', 'Locked', 'Under Review', 'Transfer Pending', 'Rescinded', 'Released', 'Expired', 'Retired'];
const handleFilters = ['Available', 'Owned', 'Pending', 'Premium', 'Protected', 'Reserved', 'Suspended', 'Expired', 'Disputed', 'Locked', 'Unverified Owner', 'Renewal Due'];
const handleAdminActions = ['Approve Handle Request', 'Reject', 'Reserve', 'Protect', 'Reclaim', 'Rescind', 'Suspend', 'Transfer', 'Reassign', 'Lock', 'Unlock', 'Rename', 'Release', 'Retire'];
const handleRegistryColumns = ['Handle', 'Display Name', 'Current Owner', 'Owner User ID', 'Handle Type', 'Status', 'Price', 'Renewal Price', 'Reserved Reason', 'Verification Status', 'Created Date', 'Acquired Date', 'Expiry Date', 'Last Changed', 'Admin Lock', 'Risk Flags'];

function handleStatus(record = {}) {
  const status = record.status || record.approvalState || record.listingStatus || record.transferStatus || 'available';
  return String(status).replaceAll('_', ' ');
}

function normalizeRegistryHandle(item = {}) {
  return item.normalizedHandle || item.handleId || item.id || item.displayHandle?.replace(/^@/, '') || '';
}

function AdminHandleMarketplace() {
  const [term, setTerm] = useState('');
  const [record, setRecord] = useState(null);
  const [activeSection, setActiveSection] = useState('Overview');
  const [filter, setFilter] = useState('Owned');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('protect');
  const [category, setCategory] = useState('brand');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState('');
  const [renewalPrice, setRenewalPrice] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reason, setReason] = useState('impersonation');
  const [outcome, setOutcome] = useState('mark_protected');
  const [claimantUid, setClaimantUid] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);
  const handles = useAdminCollection('handles', 250);
  const listings = useAdminCollection('handleListings', 150);
  const requests = useAdminCollection('handleRequests', 150);
  const purchases = useAdminCollection('handlePurchases', 150);
  const transfers = useAdminCollection('handleTransfers', 150);
  const disputes = useAdminCollection('handleDisputes', 100);
  const protectedHandles = useAdminCollection('protectedHandles', 150);
  const reservedHandles = useAdminCollection('reservedHandles', 150);
  const claims = useAdminCollection('protectedHandleClaims', 100);
  const audits = useAdminCollection('auditLogs', 150);
  const policies = useAdminCollection('handlePolicies', 150);

  async function refresh(handle = record?.normalizedHandle || term) {
    setRecord(await getPortalAdminHandle(handle));
  }

  async function search(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await refresh(term); setActiveSection('Handle Registry'); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function manage(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await managePortalHandleRegistry({ handle: record.normalizedHandle, action, category, notes, priceAmount: price ? Number(price) : null, renewalPriceAmount: renewalPrice ? Number(renewalPrice) : null, currency, ...(action === 'verify_owner' ? { verifiedUid: claimantUid } : {}) });
      await refresh(record.normalizedHandle);
      setNotice(`Registry action ${action.replaceAll('_', ' ')} completed.`);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function reclaim(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await reclaimPortalHandle({ handle: record.normalizedHandle, reason, notes, outcome, claimantUid: claimantUid || null, confirmation, highRiskConfirmed });
      setReclaimOpen(false);
      await refresh(record.normalizedHandle);
      setNotice(`@${record.normalizedHandle} reclaimed with outcome ${outcome.replaceAll('_', ' ')}.`);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function refundPurchase(purchaseId) {
    setBusy(true); setError(''); setNotice('');
    try { await refundPlaceholderPortalHandlePurchase(purchaseId); await refresh(record.normalizedHandle); setNotice('Placeholder purchase refunded.'); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function reviewRequest(item, reviewAction) {
    const internalNotes = notes.trim() || `Admin marketplace action: ${reviewAction.replaceAll('_', ' ')}`;
    setBusy(true); setError(''); setNotice('');
    try {
      await reviewPortalHandleRequest({ requestId: item.requestId || item.id, action: reviewAction, notes: internalNotes, alternativeHandle: claimantUid || null });
      setNotice(`${reviewAction.replaceAll('_', ' ')} recorded for @${item.normalizedHandle}.`);
      if (record?.normalizedHandle === item.normalizedHandle) await refresh(record.normalizedHandle);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function auditOnlyAction(label, target = record?.normalizedHandle) {
    setBusy(true); setError(''); setNotice('');
    try {
      await runAdminAction(label.toLowerCase().replaceAll(' ', '_'), { entityType: 'handle_marketplace', targetId: target || null, reason: notes.trim() || `Handle Marketplace: ${label}` });
      setNotice(`${label} recorded through Admin audit.`);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  const registryRows = [...handles.items, ...reservedHandles.items, ...protectedHandles.items, ...policies.items].reduce((map, item) => {
    const key = normalizeRegistryHandle(item);
    if (!key) return map;
    map.set(key, { ...map.get(key), ...item, normalizedHandle: key });
    return map;
  }, new Map());
  const rows = [...registryRows.values()];
  const filteredRows = rows.filter((item) => {
    const haystack = JSON.stringify(item).toLowerCase();
    const termMatch = !term.trim() || haystack.includes(term.toLowerCase().replace(/^@/, ''));
    const statusText = handleStatus(item).toLowerCase();
    const classText = String(item.marketplaceClass || item.category || item.handleType || '').toLowerCase();
    const filterMatch = filter === 'Owned' ? Boolean(item.ownerUid || item.uid) : filter === 'Available' ? statusText.includes('available') : filter === 'Pending' ? statusText.includes('pending') || statusText.includes('requested') : filter === 'Premium' ? classText.includes('premium') : filter === 'Protected' ? statusText.includes('protected') || classText.includes('protected') : filter === 'Reserved' ? statusText.includes('reserved') : filter === 'Suspended' ? statusText.includes('suspended') : filter === 'Expired' ? statusText.includes('expired') : filter === 'Disputed' ? item.disputeState || statusText.includes('dispute') : filter === 'Locked' ? item.adminLock || statusText.includes('locked') : filter === 'Unverified Owner' ? Boolean(item.ownerUid || item.uid) && item.verificationState !== 'verified' : filter === 'Renewal Due' ? Boolean(item.renewalDate || item.expiresAt) : true;
    return termMatch && filterMatch;
  });
  const ownedCount = rows.filter((item) => item.ownerUid || item.uid).length;
  const availableCount = rows.filter((item) => handleStatus(item).toLowerCase().includes('available')).length;
  const reservedCount = reservedHandles.items.length + rows.filter((item) => handleStatus(item).toLowerCase().includes('reserved')).length;
  const protectedCount = protectedHandles.items.length + rows.filter((item) => handleStatus(item).toLowerCase().includes('protected')).length;
  const premiumCount = rows.filter((item) => String(item.marketplaceClass || item.category || item.handleType || '').toLowerCase().includes('premium')).length;
  const pendingPurchaseRequests = requests.items.filter((item) => ['pending_review', 'pending approval', 'requested'].includes(String(item.status || item.approvalState || '').toLowerCase())).length;
  const pendingTransferRequests = transfers.items.filter((item) => String(item.status || item.transferStatus || '').toLowerCase().includes('pending')).length;
  const handleRevenue = purchases.items.reduce((total, item) => total + Number(item.amountMinor || item.grossSaleAmount || 0), 0);
  const kpis = [
    ['Total Registered Handles', rows.length],
    ['Active Owned Handles', ownedCount],
    ['Available Handles', availableCount],
    ['Reserved Handles', reservedCount],
    ['Protected Handles', protectedCount],
    ['Premium Handles', premiumCount],
    ['Handles Listed for Purchase', listings.items.length],
    ['Pending Purchase Requests', pendingPurchaseRequests],
    ['Pending Transfer Requests', pendingTransferRequests],
    ['Pending Brand Claims', claims.items.filter((item) => String(item.status || '').includes('pending')).length],
    ['Suspended Handles', rows.filter((item) => handleStatus(item).toLowerCase().includes('suspended')).length],
    ['Rescinded Handles', requests.items.filter((item) => String(item.status || '').toLowerCase().includes('rescinded')).length],
    ['Expired Handles', rows.filter((item) => handleStatus(item).toLowerCase().includes('expired')).length],
    ['Handle Revenue', formatMoney(handleRevenue)],
    ['Renewals Due', rows.filter((item) => item.renewalDate || item.expiresAt).length],
    ['Ownership Disputes', disputes.items.length],
  ];
  const recentActivity = [...requests.items.map((item) => ({ ...item, activityType: 'New handle reservation' })), ...purchases.items.map((item) => ({ ...item, activityType: 'Purchase' })), ...transfers.items.map((item) => ({ ...item, activityType: item.type || 'Transfer' })), ...audits.items.filter((item) => String(item.system || '').includes('handle')).map((item) => ({ ...item, activityType: item.action || 'Registry audit' }))].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 10);
  const handleDetail = record ? {
    exactHandle: `@${record.normalizedHandle}`,
    normalizedHandle: record.normalizedHandle,
    displayCasing: record.handle?.originalHandle || record.protected?.displayHandle || record.reserved?.displayHandle || `@${record.normalizedHandle}`,
    currentOwner: record.handle?.ownerUid || record.handle?.uid || 'No active owner',
    previousOwners: record.handle?.previousOwnerUid || 'None recorded',
    handleType: record.policy?.category || record.protected?.category || record.reserved?.category || record.handle?.handleType || record.handle?.marketplaceClass || 'Standard',
    currentStatus: record.protected?.status || record.reserved?.status || record.policy?.status || record.handle?.status || 'available',
    purchasePrice: formatMoney(record.policy?.priceAmount ?? record.listing?.askingPriceAmount ?? record.purchases?.[0]?.amountMinor),
    renewalFee: formatMoney(record.policy?.renewalPriceAmount ?? record.purchases?.[0]?.renewalAmountMinor),
    acquisitionMethod: record.handle?.freeHandle ? 'Free handle' : record.purchases?.[0]?.paymentProviderMode || record.handle?.status || 'Registry',
    ownershipStartDate: timeLabel(record.handle?.reservedAt || record.handle?.lastTransferredAt),
    expiryOrRenewalDate: timeLabel(record.purchases?.[0]?.renewalDate || record.policy?.expiresAt),
    verificationStatus: record.handle?.verificationState || record.requests?.[0]?.approvalState || 'unverified',
    protectionReason: record.protected?.protectedReason || record.protected?.notes || '—',
    reservationReason: record.reserved?.reservedReason || record.reserved?.notes || '—',
    brandAssociation: record.protected?.brandAssociation || record.policy?.brandAssociation || '—',
    fullOwnershipTimeline: record.transfers?.length ? `${record.transfers.length} ownership timeline entries` : 'No ownership timeline entries recorded',
    adminNotes: record.protected?.notes || record.reserved?.notes || record.policy?.notes || '—',
  } : null;

  return <div className="page handle-marketplace-admin"><div><h1 className="display-xl">Marketplace</h1><p className="body-md">Portal Handle Marketplace and Handle Registry control. This is not a product marketplace: no products, shops, carts, shipping, delivery, stock or physical-goods orders.</p></div><div className="marketplace-subnav" role="tablist">{marketplaceSubsections.map((item) => <button className={`source-chip ${activeSection === item ? 'active' : ''}`} role="tab" aria-selected={activeSection === item} type="button" onClick={() => setActiveSection(item)} key={item}>{item}</button>)}</div><form className="glass card form-stack" onSubmit={search}><label>Search handle<input value={term} onChange={(event) => setTerm(event.target.value.replace(/^@/, ''))} placeholder="@handle" /></label><button className="btn btn-primary" disabled={busy || !term.trim()}>Open handle detail</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<section className="admin-kpi-grid">{kpis.map(([label, value]) => <article className="glass card admin-kpi-card" key={label}><span className="eyebrow">{label}</span><strong>{value}</strong><small>Handle registry metric</small></article>)}</section><section className="glass card"><div className="section-header"><h2 className="display-md">Recent handle activity</h2><span className="source-chip">Auditable</span></div><div className="admin-activity-list">{recentActivity.length ? recentActivity.map((item) => <article className="admin-activity-row" key={`${item.activityType}-${item.id || item.requestId || item.purchaseId || item.transferId || item.auditId}`}><span className="source-chip">{item.activityType}</span><strong>@{item.normalizedHandle || item.handleId || item.targetId || 'handle'}</strong><p className="body-sm">{handleStatus(item)} · {relativeTime(item.createdAt || item.updatedAt)}</p></article>) : <p className="body-sm">No recent handle activity available.</p>}</div></section><section className="glass card"><div className="section-header"><h2 className="display-md">Canonical Handle Registry</h2><span className="source-chip">{filteredRows.length} shown</span></div><div className="chip-row">{handleFilters.map((item) => <button className={`chip ${filter === item ? 'active' : ''}`} type="button" onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><div className="admin-table handle-registry-table" role="table" aria-label="Handle registry">{handleRegistryColumns.map((column) => <span className="admin-table-heading" role="columnheader" key={column}>{column}</span>)}{filteredRows.slice(0, 80).map((item) => <button className="admin-table-cell-row" type="button" role="row" key={normalizeRegistryHandle(item)} onClick={() => { setTerm(normalizeRegistryHandle(item)); refresh(normalizeRegistryHandle(item)).catch((err) => setError(firebaseMessage(err))); }}><span>@{normalizeRegistryHandle(item)}</span><span>{item.originalHandle || item.displayHandle || '—'}</span><span>{item.ownerDisplayName || item.ownerUid || item.uid || '—'}</span><span>{item.ownerUid || item.uid || '—'}</span><span>{item.handleType || item.marketplaceClass || item.category || 'Standard'}</span><span>{handleStatus(item)}</span><span>{formatMoney(item.priceAmount || item.askingPriceAmount)}</span><span>{formatMoney(item.renewalPriceAmount)}</span><span>{item.reservedReason || item.protectedReason || item.notes || '—'}</span><span>{item.verificationState || item.verificationStatus || 'unverified'}</span><span>{timeLabel(item.createdAt)}</span><span>{timeLabel(item.reservedAt || item.lastTransferredAt)}</span><span>{timeLabel(item.expiresAt || item.renewalDate)}</span><span>{relativeTime(item.updatedAt || item.lastChangedAt)}</span><span>{item.adminLock || item.locked ? 'Locked' : '—'}</span><span>{displayValue(item.riskFlags || item.riskBand || item.riskScore)}</span></button>)}</div></section>{record ? <section className="glass card admin-drawer"><div className="section-header"><h2 className="display-lg">{handleDetail.exactHandle}</h2><span className="source-chip">{handleDetail.currentStatus}</span></div><div className="admin-detail-grid">{Object.entries(handleDetail).map(([label, value]) => <span key={label}><strong>{label.replace(/([A-Z])/g, ' $1')}</strong>{value}</span>)}</div><div className="admin-action-grid">{handleAdminActions.map((item) => <button className="btn btn-secondary btn-sm" type="button" onClick={() => item === 'Reclaim' ? setReclaimOpen(true) : auditOnlyAction(item, record.normalizedHandle)} key={item}>{item}</button>)}</div></section> : null}<section className="marketplace-admin-grid"><article className="glass card"><h2 className="display-md">Purchase Requests</h2><div className="stack">{requests.items.slice(0, 12).map((item) => <div className="marketplace-review-row" key={item.id || item.requestId}><span><strong>@{item.normalizedHandle}</strong><small>{item.requestType} · {item.riskBand || 'risk pending'} · {handleStatus(item)}</small></span><div className="form-actions"><button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => reviewRequest(item, 'approve')}>Approve Handle Request</button><button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => reviewRequest(item, 'reject')}>Reject</button><button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => reviewRequest(item, 'request_id')}>Request ID</button><button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => reviewRequest(item, 'rescind_issued_handle')}>Rescind</button></div></div>)}</div></article><article className="glass card"><h2 className="display-md">Transfer Requests</h2><div className="stack">{transfers.items.slice(0, 8).map((item) => <div className="marketplace-review-row" key={item.id || item.transferId}><span><strong>@{item.normalizedHandle || item.handleId}</strong><small>{item.type || 'transfer'} · {handleStatus(item)}</small></span><button className="btn btn-secondary btn-sm" type="button" onClick={() => auditOnlyAction('Transfer handle', item.normalizedHandle || item.handleId)}>Review transfer</button></div>)}</div></article><article className="glass card"><h2 className="display-md">Protected Handles</h2><div className="stack">{protectedHandles.items.slice(0, 8).map((item) => <button className="profile-option-row" type="button" key={item.id || item.normalizedHandle} onClick={() => { setTerm(normalizeRegistryHandle(item)); refresh(normalizeRegistryHandle(item)).catch((err) => setError(firebaseMessage(err))); }}><span><strong>@{normalizeRegistryHandle(item)}</strong><small>{item.category} · {item.notes || item.protectedReason || 'protected'}</small></span><span className="source-chip">{item.status}</span></button>)}</div></article><article className="glass card"><h2 className="display-md">Reserved Handles</h2><div className="stack">{reservedHandles.items.slice(0, 8).map((item) => <button className="profile-option-row" type="button" key={item.id || item.normalizedHandle} onClick={() => { setTerm(normalizeRegistryHandle(item)); refresh(normalizeRegistryHandle(item)).catch((err) => setError(firebaseMessage(err))); }}><span><strong>@{normalizeRegistryHandle(item)}</strong><small>{item.category} · {item.notes || item.reservedReason || 'reserved'}</small></span><span className="source-chip">{item.status}</span></button>)}</div></article></section>{record ? <section className="glass card"><h2 className="display-md">Pricing</h2><form className="form-stack" onSubmit={manage}><label>Action<select value={action} onChange={(event) => setAction(event.target.value)}>{['price', 'protect', 'reserve', 'marketplace', 'release', 'retire', 'verify_owner', 'lock', 'unlock', 'suspend'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label>Handle type<select value={category} onChange={(event) => setCategory(event.target.value)}>{handleTypes.map((item) => <option key={item} value={item.toLowerCase().replaceAll(' ', '_')}>{item}</option>)}</select></label><label>Purchase price, minor units<input type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="500 = £5" /></label><label>Renewal price, minor units<input type="number" value={renewalPrice} onChange={(event) => setRenewalPrice(event.target.value)} placeholder="500 = £5" /></label><label>Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength="3" /></label>{action === 'verify_owner' ? <label>Verified owner UID<input value={claimantUid} onChange={(event) => setClaimantUid(event.target.value)} /></label> : null}<label>Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>Apply backend registry action</button></form></section> : null}{record ? <section className="marketplace-admin-grid"><article className="glass card"><h2 className="display-md">User requests</h2><div className="stack">{record.requests?.length ? record.requests.map((item) => <article className="marketplace-review-row" key={item.id || item.requestId}><span><strong>{item.requestType}</strong><small>{handleStatus(item)} · Risk {item.riskScore} · {item.riskBand}</small></span><div className="form-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => reviewRequest(item, 'approve')}>Approve</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => reviewRequest(item, 'reject')}>Reject</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => reviewRequest(item, 'protect_handle')}>Protect</button></div></article>) : <p className="body-sm">No user requests recorded.</p>}</div></article><article className="glass card"><h2 className="display-md">Payment history</h2>{record.purchases?.length ? <div className="stack">{record.purchases.map((item) => <article className="marketplace-review-row" key={item.id || item.purchaseId}><span><strong>{formatMoney(item.amountMinor, item.currency)}</strong><small>{item.paymentProviderMode || item.provider || 'unknown provider'} · {item.paymentStatus || item.status} · token {item.temporaryPaymentToken ? 'redacted' : 'none'}</small></span>{item.paymentProviderMode === 'placeholder' && item.paymentStatus !== 'refunded' ? <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => refundPurchase(item.purchaseId || item.id)}>Refund placeholder purchase</button> : null}</article>)}</div> : <p className="body-sm">No purchases recorded.</p>}</article><article className="glass card"><h2 className="display-md">Transfer history</h2><div className="stack">{transfers.items.filter((item) => (item.normalizedHandle || item.handleId) === record.normalizedHandle).slice(0, 8).map((item) => <p className="body-sm" key={item.id || item.transferId}>{item.type} · {timeLabel(item.createdAt)} · previous {item.previousOwnerUid || 'none'}</p>)}</div></article><article className="glass card"><h2 className="display-md">Audit history</h2><div className="stack">{audits.items.filter((item) => item.normalizedHandle === record.normalizedHandle || item.targetId === record.normalizedHandle).slice(0, 8).map((item) => <p className="body-sm" key={item.id || item.auditId}>{item.action} · {relativeTime(item.createdAt)} · {item.actorUid || item.adminUid}</p>)}</div></article></section> : null}{reclaimOpen && record ? <section className="glass card"><h2 className="display-md">Reclaim @{record.normalizedHandle}</h2><form className="form-stack" onSubmit={reclaim}><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}>{['impersonation', 'trademark', 'fraud', 'abuse', 'legal_compliance', 'public_interest', 'system_use', 'enforcement'].map((item) => <option key={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}>{['mark_protected', 'permanently_reserve', 'assign_verified_claimant', 'assign_portal_account', 'return_to_marketplace', 'release_to_availability'].map((item) => <option key={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>{outcome.includes('assign_') ? <label>Receiving Portal UID<input value={claimantUid} onChange={(event) => setClaimantUid(event.target.value)} /></label> : null}<label>Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} required minLength="8" /></label><label>Type RECLAIM @{record.normalizedHandle}<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={highRiskConfirmed} onChange={(event) => setHighRiskConfirmed(event.target.checked)} /> I confirm this may be a high-risk reclaim.</label><div className="form-actions"><button className="btn btn-primary" disabled={busy}>Confirm reclaim</button><button className="btn btn-secondary" type="button" onClick={() => setReclaimOpen(false)}>Cancel</button></div></form></section> : null}<section className="glass card"><h2 className="display-md">Marketplace settings</h2><div className="admin-detail-grid"><span><strong>Handle Types</strong>{handleTypes.join(', ')}</span><span><strong>Statuses</strong>{handleStatuses.join(', ')}</span><span><strong>Admin Authority</strong>{handleAdminActions.join(', ')}</span><span><strong>Excluded</strong>Product listings, physical goods, seller shops, shopping carts, shipping, delivery, product orders, general seller accounts, product disputes, product categories and stock management.</span></div></section></div>;
}

function VortexControlCentre() {
  const [stories, setStories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return undefined;
    }
    return observeVortexEntries((snapshot) => {
      setStories(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoading(false);
    }, (reason) => {
      setError(firebaseMessage(reason));
      setLoading(false);
    });
  }, []);

  const activeStories = stories.filter((story) => String(story.status || '').toLowerCase() !== 'archived');
  const criticalStories = stories.filter((story) => pulseValue(story) >= 88);
  const growingStories = stories.filter((story) => trendLabel(story, pulseValue(story)) === 'Growing');
  const breakingStories = stories.filter((story) => ['breaking', 'critical'].includes(String(story.status || '').toLowerCase()) || pulseValue(story) >= 88);
  const pendingReviews = stories.filter((story) => story.moderationState === 'pending_review' || story.reviewState === 'pending').length;
  const officialSourceCount = stories.reduce((total, story) => total + (Number(story.officialSourceCount ?? story.sourceCount ?? 0) > 0 ? 1 : 0), 0);
  const custodianCount = stories.reduce((total, story) => total + Number(story.custodianReviewCount ?? story.reviewCount ?? 0), 0);

  const dashboard = [
    ['Active Pulses', activeStories.length],
    ['Breaking Stories', breakingStories.length],
    ['Growing Pulses', growingStories.length],
    ['Critical Pulses', criticalStories.length],
    ['Official Sources Online', officialSourceCount],
    ['Custodians Active', custodianCount],
    ['Pending Reviews', pendingReviews],
    ['Platform Health', error ? 'Review' : 'Stable'],
  ];

  const actions = [
    'Promote to Breaking',
    'Pin Story',
    'Merge Stories',
    'Split Story',
    'Assign Custodian',
    'Request Official Confirmation',
    'Add Official Source',
    'Archive Story',
    'Lock Discussion',
    'Issue Public Advisory',
    'Remove Spam Cluster',
  ];

  return <div className="page vortex-control-page"><div><h1 className="display-xl">Vortex Control Centre</h1><p className="body-md">Monitor live story Pulse, growth, verification and operational review signals.</p></div><div className="admin-metric-grid">{dashboard.map(([label, value]) => <article className="glass card admin-pulse-card" key={label}><span className="eyebrow">{label}</span><strong>{value}</strong></article>)}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <section className="glass card"><p className="body-md">Loading Pulse stories...</p></section> : stories.length ? <div className="vortex-story-grid">{stories.map((story) => {
    const value = pulseValue(story);
    const label = pulseLabel(value);
    const status = storyStatus(story, value);
    const trend = trendLabel(story, value);
    return <article className="glass card vortex-story-card" key={story.entryId || story.id}><div className="story-head"><div><span className="source-chip">{status}</span><h2 className="display-md">{story.title || story.headline || 'Untitled story'}</h2></div><div><span className="eyebrow">Growth Trend</span><span className={`pulse-trend ${trend.toLowerCase()}`}>{trend}</span></div></div><div className="pulse-strength"><span className="eyebrow">Pulse Strength</span><div><strong>Pulse {value}</strong><span>{label}</span></div><div className="pulse-meter" aria-label={`Pulse ${value} ${label}`}><span style={{ width: `${value}%` }} /></div></div><svg className="pulse-graph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Pulse trend ${trend}`}><polyline points={sparkPoints(story, value)} /></svg><div className="story-detail-grid"><span><strong>Time Started</strong>{timeLabel(story.firstActivityAt || story.createdAt || story.publishedAt)}</span><span><strong>Last Activity</strong>{relativeTime(story.latestActivityAt || story.updatedAt)}</span><span><strong>Locations</strong>{story.locationSummary || story.region || story.scope || 'World'}</span><span><strong>Independent Contributors</strong>{story.independentContributorCount ?? story.contributionCount ?? 0}</span><span><strong>Official Sources</strong>{story.officialSourceCount ?? story.sourceCount ?? 0}</span><span><strong>Custodian Reviews</strong>{story.custodianReviewCount ?? story.reviewCount ?? 0}</span><span><strong>Verification Status</strong>{story.verificationStatus || story.moderationState || 'Emerging'}</span><span><strong>Related Stories</strong>{story.relatedStoryCount ?? story.relatedEventIds?.length ?? 0}</span></div><div className="admin-action-grid">{actions.map((action) => <button className="btn btn-secondary btn-sm" type="button" key={action}>{action}</button>)}</div></article>;
  })}</div> : <section className="glass card empty-state compact-empty"><h2 className="display-md">No live Pulse stories yet</h2><p className="body-sm">Stories appear here when Vortex entries are projected by Portal&apos;s event and discovery systems.</p></section>}</div>;
}

const adminSections = [
  ['/', 'Dashboard'],
  ['/users', 'Users'],
  ['/moderation', 'Moderation'],
  ['/events', 'Events'],
  ['/trending', 'Trending'],
  ['/verification', 'Verification'],
  ['/marketplace', 'Marketplace'],
  ['/creators', 'Creators'],
  ['/reports', 'Reports'],
  ['/notifications', 'Notifications'],
  ['/analytics', 'Analytics'],
  ['/reporting', 'Reporting'],
  ['/recovery', 'Disaster Recovery'],
  ['/audit-log', 'Audit Log'],
  ['/system-health', 'System Health'],
  ['/settings', 'Settings'],
];

const dashboardKpis = ['Active users', 'Users online now', 'Posts today', 'New registrations', 'Active events', 'Pending reports', 'Verification queue', 'Marketplace revenue', 'Tips today', 'Platform uptime'];
const dashboardCharts = ['User growth', 'Posts/hour', 'Engagement', 'Active regions', 'Top categories'];
const dashboardActivity = ['New reports', 'New verified users', 'Handle sales', 'Trending stories', 'System alerts'];

function AdminDashboard() {
  const users = useAdminCollection('users', 200);
  const posts = useAdminCollection('reports', 100);
  const events = useAdminCollection('events', 100);
  const moderation = useAdminCollection('moderationReports', 100);
  const verification = useAdminCollection('verificationRequests', 100);
  const marketplace = useAdminCollection('handleListings', 100);
  const health = useAdminCollection('systemHealth', 30);
  const approvals = useAdminCollection('adminApprovals', 10);
  const sessions = useAdminCollection('adminSessions', 10);
  const today = new Date().toDateString();
  const todayCount = (items, field = 'createdAt') => items.filter((item) => {
    const date = item[field]?.toDate ? item[field].toDate() : null;
    return date?.toDateString() === today;
  }).length;
  const kpiValues = {
    'Active users': users.items.length,
    'Users online now': users.items.filter((item) => item.online || item.presence === 'online').length,
    'Posts today': todayCount(posts.items),
    'New registrations': todayCount(users.items),
    'Active events': events.items.filter((item) => !item.archived).length,
    'Pending reports': moderation.items.filter((item) => ['pending', 'open', 'pending_review'].includes(String(item.status || item.moderationState || '').toLowerCase())).length,
    'Verification queue': verification.items.filter((item) => String(item.status || '').includes('pending')).length,
    'Marketplace revenue': formatMoney(marketplace.items.reduce((total, item) => total + Number(item.portalCommissionAmount || item.grossSaleAmount || 0), 0)),
    'Tips today': formatMoney(todayCount(users.items, 'lastTipAt')),
    'Platform uptime': health.items.some((item) => item.status === 'critical') ? 'Critical' : 'Healthy',
  };
  return <div className="page enterprise-dashboard"><div><h1 className="display-xl">Dashboard</h1><p className="body-md">Enterprise operations overview for Portal staff.</p></div><div className="admin-kpi-grid">{dashboardKpis.map((label) => <article className="glass card admin-kpi-card" key={label}><span className="eyebrow">{label}</span><strong>{kpiValues[label]}</strong><small>Live backend metric</small></article>)}</div><section className="admin-chart-grid">{dashboardCharts.map((label) => <article className="glass card admin-chart-card" key={label}><div className="section-header"><h2>{label}</h2><span className="source-chip">Live</span></div><div className="admin-chart-placeholder" aria-label={`${label} chart`} /></article>)}</section><section className="glass card"><h2 className="display-md">Activity feed</h2><div className="admin-activity-list">{dashboardActivity.map((item) => <article className="admin-activity-row" key={item}><span className="source-chip">{item}</span><p className="body-sm">{moderation.error || users.error || events.error || 'Live activity appears as backend records arrive.'}</p></article>)}</div></section><section className="admin-chart-grid"><article className="glass card"><h2 className="display-md">Sensitive Action Approvals</h2><p className="body-sm">Approval request, Approve, Reject, Approval history and reason required for permanent bans, protected handle transfers, government handle changes, verification removal, platform-wide broadcasts, marketplace reversals and large creator payout approvals.</p><span className="source-chip">{approvals.items.length} pending or recent</span></article><article className="glass card"><h2 className="display-md">Admin Session Security</h2><p className="body-sm">Current admin sessions, Last login, IP, Device, Location, Session expiry, Force logout and recent authentication checks for sensitive actions.</p><span className="source-chip">{sessions.items.length} active records</span></article></section><AdminPasswordPanel /></div>;
}

function UserProfileDrawer({ user, loading, actions, onAction, onClose }) {
  const marketplace = user.marketplace || {};
  const memberships = user.memberships || {};
  const sections = [
    ['Account', [['Joined', user.createdAt], ['Last login', user.lastLoginAt], ['Last active', user.lastActiveAt], ['Providers', user.providers], ['Email verified', user.emailVerified], ['Disabled', user.disabled], ['Roles', user.roles], ['Sessions', user.sessions], ['Devices', user.devices], ['Account status', user.accountStatus]]],
    ['Platform Membership', [['Sender', memberships.sender || user.sender], ['Rider', memberships.rider || user.rider], ['Portal', memberships.portal || user.portal], ['Business', memberships.business || user.business], ['Company', user.businessName]]],
    ['Trust', [['Trust score', user.trustScore], ['Reports', user.reportCount], ['Warnings', user.warningCount], ['Suspensions', user.suspensionCount], ['Verification', user.verificationState]]],
    ['Marketplace', [['Owned handles', marketplace.ownedHandles || user.marketplaceOwnershipCount], ['Listings', marketplace.listings || user.marketplaceListingCount], ['Purchases', marketplace.purchases || user.marketplacePurchaseCount], ['Handle ownership history', marketplace.ownershipHistory]]],
    ['Portal', [['Followers', user.followerCount], ['Following', user.followingCount], ['Posts', user.postCount], ['Comments', user.commentCount], ['Events', user.eventCount]]],
    ['Circum', [['Deliveries', user.circum?.deliveries], ['Bookings', user.circum?.bookings], ['Earnings', user.circum?.earnings], ['Roth balance', user.circum?.rothBalance]]],
    ['Admin', [['Audit history', user.auditHistory]]],
  ];
  return <section className="glass card admin-drawer admin-user-drawer"><div className="admin-user-banner" style={user.bannerUrl ? { backgroundImage: `linear-gradient(180deg,rgba(7,9,15,.1),rgba(7,9,15,.78)),url(${user.bannerUrl})` } : undefined} /><div className="section-header"><div className="admin-user-identity">{user.profilePhotoUrl ? <img className="admin-user-avatar large" src={user.profilePhotoUrl} alt="" /> : <Avatar>{initials(user.displayName || user.email)}</Avatar>}<span><h2>{user.displayName || 'Not available'}</h2><small>{user.normalizedHandle ? `@${user.normalizedHandle}` : 'No handle'}</small></span></div><button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Close</button></div><div className="admin-detail-grid user-contact-grid"><span><strong>UID</strong>{displayValue(user.uid)}</span><span><strong>Email</strong>{displayValue(user.email)}</span><span><strong>Phone</strong>{displayValue(user.phone)}</span></div>{loading ? <p className="body-sm">Loading complete user record...</p> : sections.map(([title, fields]) => <section className="admin-user-section" key={title}><h3>{title}</h3><div className="admin-detail-grid">{fields.map(([label, value]) => <span key={label}><strong>{label}</strong>{displayValue(value)}</span>)}</div></section>)}<div className="admin-action-grid">{actions.map((action) => <button className="btn btn-secondary btn-sm" type="button" onClick={() => onAction(action, user)} key={action}>{action}</button>)}</div></section>;
}

function AdminDataTable({ title, description, searchPlaceholder, columns, rowFields = [], actions = [], queues = [], collectionKey, detailFields = [] }) {
  const [term, setTerm] = useState('');
  const { items, error, loading } = useAdminCollection(collectionKey, ['users', 'broadcastNotifications', 'reports'].includes(collectionKey) ? term : '');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const filtered = items.filter((item) => JSON.stringify(item).toLowerCase().includes(term.toLowerCase()));
  async function selectItem(item) {
    setSelected(item); setActionError('');
    if (title !== 'Users') return;
    setDetailLoading(true);
    try { const result = await getPortalAdminUserRecord(item.uid || item.id); setSelected(result.user || item); }
    catch (reason) { setActionError(firebaseMessage(reason)); }
    finally { setDetailLoading(false); }
  }
  async function actionClick(action, target = selected) {
    setNotice(''); setActionError('');
    try {
      const normalizedAction = action.toLowerCase().replaceAll(' ', '_');
      if (title === 'Users' && target && ['suspend', 'unsuspend', 'force_logout', 'reset_password', 'transfer_handle'].includes(normalizedAction)) {
        const payload = { targetUid: target.uid || target.id, reason: 'portal_owner_user_management' };
        if (normalizedAction === 'transfer_handle') {
          const recipientUid = window.prompt('Receiving Portal UID');
          if (!recipientUid) return;
          payload.recipientUid = recipientUid.trim();
          payload.normalizedHandle = target.normalizedHandle;
        }
        const result = await managePortalAdminUser(normalizedAction, payload);
        if (result.passwordResetLink) { await navigator.clipboard.writeText(result.passwordResetLink); setNotice('Password reset link generated and copied.'); }
        else setNotice(`${action} completed through the Portal owner callable.`);
        return;
      }
      await runAdminAction(normalizedAction, { entityType: title, targetId: target?.id || null, reason: 'admin_v4_privileged_action' }); setNotice(`${action} requested through callable function.`);
    } catch (reason) { setActionError(firebaseMessage(reason)); }
  }
  return <div className="page admin-ops-page"><div><h1 className="display-xl">{title}</h1><p className="body-md">{description}</p></div>{title === 'Moderation' ? <section className="glass card"><h2 className="display-md">Moderator Productivity</h2><p className="body-sm">Saved filters, pinned queues, keyboard shortcuts, bulk actions, Quick approve, Quick remove, Quick suspend, context side panel, live updates and undo for reversible actions.</p></section> : null}{queues.length ? <div className="admin-queue-grid">{queues.map((queue) => <button className="glass card admin-queue-card" type="button" key={queue}><strong>{queue}</strong><span className="body-sm">{items.filter((item) => String(item.queue || item.category || item.type || '').toLowerCase().includes(queue.toLowerCase().split(' ')[0])).length} pending</span></button>)}</div> : null}<section className="glass card"><div className="section-header"><h2>{title} search</h2><span className="source-chip">Cloud Functions only · No direct client writes</span></div><label className="admin-search-field">Global search<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={searchPlaceholder} /></label>{error || actionError ? <p className="form-error" role="alert">{error || actionError}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<div className="admin-table" role="table" aria-label={title}><div className="admin-table-row admin-table-head" role="row">{columns.map((column) => <span role="columnheader" key={column}>{column}</span>)}</div>{loading ? <div className="admin-table-row empty" role="row"><span role="cell">Loading live records...</span>{columns.slice(1).map((column) => <span role="cell" key={column}>Not available</span>)}</div> : filtered.length ? filtered.slice(0, 250).map((item) => <button className="admin-table-row clickable" role="row" type="button" onClick={() => selectItem(item)} key={item.id}>{columns.map((column, index) => <span role="cell" key={column}>{renderAdminCell(column, valueForPath(item, rowFields[index] || column), item)}</span>)}</button>) : <div className="admin-table-row empty" role="row">{columns.map((column, index) => <span role="cell" key={column}>{index === 0 ? 'No matching live records' : 'Not available'}</span>)}</div>}</div></section>{selected && title === 'Users' ? <UserProfileDrawer user={selected} loading={detailLoading} actions={actions} onAction={actionClick} onClose={() => setSelected(null)} /> : selected ? <section className="glass card admin-drawer"><div className="section-header"><h2>{title} profile drawer</h2><button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelected(null)}>Close</button></div><div className="admin-detail-grid">{(detailFields.length ? detailFields : columns).map((field) => <span key={field}><strong>{field}</strong>{displayValue(valueForPath(selected, field) ?? valueForPath(selected, field.toLowerCase().replaceAll(' ', '')))}</span>)}</div>{actions.length ? <div className="admin-action-grid">{actions.map((action) => <button className="btn btn-secondary btn-sm" type="button" onClick={() => actionClick(action)} key={action}>{action}</button>)}</div> : null}</section> : null}{actions.length && !selected ? <section className="glass card"><h2 className="display-md">Actions</h2><div className="admin-action-grid">{actions.map((action) => <button className="btn btn-secondary btn-sm" type="button" onClick={() => actionClick(action, null)} key={action}>{action}</button>)}</div></section> : null}</div>;
}

function UsersAdmin() {
  return <AdminDataTable collectionKey="users" title="Users" description="Global user operations, trust, verification and marketplace ownership." searchPlaceholder="Search by handle, name, email, UID, phone, business or company" columns={['Profile photo', 'Display name', 'Handle', 'UID', 'Email', 'Phone', 'Account type(s)', 'Sender', 'Rider', 'Portal', 'Business', 'Joined', 'Verification status', 'Trust score', 'Warnings', 'Reports', 'Suspensions', 'Marketplace ownership', 'Followers', 'Following', 'Posts', 'Events', 'Last active', 'Account status']} rowFields={['profilePhotoUrl', 'displayName', 'normalizedHandle', 'uid', 'email', 'phone', 'accountTypes', 'sender', 'rider', 'portal', 'business', 'createdAt', 'verificationState', 'trustScore', 'warningCount', 'reportCount', 'suspensionCount', 'marketplaceOwnershipCount', 'followerCount', 'followingCount', 'postCount', 'eventCount', 'lastActiveAt', 'accountStatus']} actions={['Suspend', 'Unsuspend', 'Ban', 'Delete account', 'Force logout', 'Reset password', 'Reset handle', 'Transfer handle', 'Message user', 'View reports']} />;
}

function ModerationAdmin() {
  return <AdminDataTable collectionKey="moderationReports" title="Moderation" description="Central review queues for unsafe, abusive or illegal content." searchPlaceholder="Search moderation cases" columns={['Case', 'Queue', 'Reporter', 'Report reason', 'Report timestamp', 'Target content', 'Report count', 'Previous moderation history', 'Reporter notes', 'Confidence indicators']} rowFields={['id', 'queue', 'reporterUid', 'reason', 'createdAt', 'targetPreview', 'reportCount', 'moderationHistory', 'reporterNotes', 'confidenceIndicators']} queues={['Reported Posts', 'Reported Replies', 'Reported Echoes', 'Reported Quote Echoes', 'Reported Media', 'Reported Profiles', 'Spam', 'Impersonation', 'Copyright', 'Harassment']} actions={['Approve', 'Remove', 'Restore', 'Warn user', 'Suspend account', 'Escalate', 'Permanent delete', 'Merge duplicate reports', 'Moderator notes', 'Bulk moderation', 'Quick approve', 'Quick remove', 'Quick suspend']} />;
}

function EventsAdmin() {
  return <AdminDataTable collectionKey="events" title="Events" description="Live Event operations with Interactive event map, merge review, source timeline, reporter history, media gallery, archive controls and regional monitoring." searchPlaceholder="Search Events by title, region, source or status" columns={['Event', 'Region', 'Status', 'Reporter confidence', 'Event health', 'Timeline', 'Media gallery']} rowFields={['title', 'region', 'status', 'reporterConfidence', 'eventHealth', 'timelineCount', 'mediaCount']} actions={['Merge duplicate events', 'Split merged events', 'Archive', 'Feature', 'Remove', 'Apply regional filters']} />;
}

function TrendingAdmin() {
  return <AdminDataTable collectionKey="analyticsDaily" title="Trending" description="Global, country and city trend controls." searchPlaceholder="Search trends, handles, hashtags or Events" columns={['Trend', 'Scope', 'Velocity', 'Source', 'Spam risk', 'Status']} rowFields={['trend', 'scope', 'velocity', 'source', 'spamRisk', 'status']} queues={['Global trends', 'Country trends', 'City trends', 'Emerging topics', 'Trending handles', 'Trending hashtags', 'Trending events']} actions={['Pin', 'Remove', 'Merge', 'Suppress spam']} />;
}

function VerificationAdmin() {
  return <AdminDataTable collectionKey="verificationRequests" title="Verification" description="Identity review for people, journalists, businesses, creators and institutions." searchPlaceholder="Search verification requests" columns={['Applicant', 'Type', 'Documents', 'Risk', 'Status', 'Reviewer']} rowFields={['uid', 'type', 'documentCount', 'riskBand', 'status', 'reviewerUid']} queues={['People', 'Journalists', 'Businesses', 'Creators', 'Government', 'Emergency Services']} actions={['Approve', 'Reject', 'Request documents', 'Remove verification']} />;
}

function CreatorsAdmin() {
  return <AdminDataTable collectionKey="users" title="Creators" description="Creator directory, earnings, strikes and verification operations." searchPlaceholder="Search creators" columns={['Creator', 'Followers', 'Tips received', 'Monthly earnings', 'Subscriptions', 'Strikes', 'Verification']} rowFields={['displayName', 'followerCount', 'tipsReceivedAmount', 'monthlyEarningsAmount', 'subscriptionCount', 'creatorStrikeCount', 'verificationState']} actions={['View creator', 'Review strikes', 'Adjust verification', 'View earnings']} />;
}

function ReportsAdmin() {
  return <AdminDataTable collectionKey="reports" title="Reports" description="Unified report inbox with evidence, history and moderator actions." searchPlaceholder="Search reports by reporter, user, category or evidence" columns={['Reporter', 'Reported user', 'Category', 'Evidence', 'History', 'Status']} rowFields={['reporterUid', 'reportedUid', 'category', 'evidence', 'history', 'status']} queues={['Unified inbox', 'Spam', 'Abuse', 'Harassment', 'Copyright', 'Violence', 'Illegal content', 'Impersonation', 'False information']} actions={['Approve', 'Remove', 'Escalate', 'Add moderator note']} />;
}

function NotificationsAdmin() {
  return <AdminDataTable collectionKey="broadcastNotifications" title="Notifications" description="Broadcast tools for platform, country, city, segment and specific-user messages." searchPlaceholder="Search broadcasts" columns={['Broadcast', 'Audience', 'Type', 'Status', 'Scheduled', 'Sent']} rowFields={['title', 'audience', 'type', 'status', 'scheduledAt', 'sentAt']} queues={['Entire platform', 'Verified users', 'Businesses', 'Specific country', 'Specific city', 'Specific users']} actions={['Announcement', 'Maintenance', 'Security', 'Emergency', 'Feature rollout', 'Preview before sending']} />;
}

function AnalyticsAdmin() {
  return <AdminDataTable collectionKey="analyticsDaily" title="Analytics" description="Growth, engagement, creator, marketplace, tips, regional and device analytics." searchPlaceholder="Search analytics reports" columns={['Metric', 'Current', 'Change', 'Region', 'Device', 'Period']} rowFields={['metric', 'current', 'change', 'country', 'device', 'date']} queues={['DAU', 'MAU', 'Retention', 'Engagement', 'Posts/day', 'Echoes/day', 'Quote Echoes/day', 'Likes/day', 'Creator growth', 'Marketplace revenue', 'Tips', 'Country distribution', 'City distribution', 'Device breakdown', 'Referral performance', 'Date range selector', 'CSV export']} />;
}

function AuditLogAdmin() {
  return <AdminDataTable collectionKey="auditLogs" title="Audit Log" description="Read-only searchable, filterable and exportable admin action history with timeline view." searchPlaceholder="Search by admin, target, action, reason, IP, device, correlation ID or status" columns={['Timestamp', 'Admin', 'Role', 'Target', 'Entity type', 'Action', 'Old value', 'New value', 'Reason', 'Approval status', 'IP', 'Device', 'Correlation ID', 'Status']} rowFields={['createdAt', 'actorUid', 'role', 'targetId', 'entityType', 'action', 'oldValue', 'newValue', 'reason', 'approvalStatus', 'ip', 'device', 'correlationId', 'status']} actions={['Export CSV', 'Export JSON', 'Timeline view']} />;
}

function ReportingAdmin() {
  return <AdminDataTable collectionKey="adminExports" title="Reporting" description="Export Users, Reports, Moderation, Marketplace, Analytics, Audit Logs and Verification as CSV or JSON." searchPlaceholder="Search exports" columns={['Export', 'Format', 'Status', 'Requested by', 'Created']} rowFields={['entityType', 'format', 'status', 'requestedByUid', 'createdAt']} queues={['Users', 'Reports', 'Moderation', 'Marketplace', 'Analytics', 'Audit Logs', 'Verification', 'CSV', 'JSON']} actions={['Export CSV', 'Export JSON']} />;
}

function RecoveryAdmin() {
  return <AdminDataTable collectionKey="recoveryQueue" title="Disaster Recovery" description="Soft delete, recovery queue, rollback tools, restore deleted content, restore suspended users, restore handles, retention timers and backups." searchPlaceholder="Search recovery queue" columns={['Entity', 'Type', 'Status', 'Retention timer', 'Deleted by', 'Created']} rowFields={['targetId', 'entityType', 'status', 'retentionUntil', 'deletedByUid', 'createdAt']} queues={['Soft delete', 'Recovery queue', 'Rollback tools', 'Backups']} actions={['Restore deleted content', 'Restore suspended users', 'Restore handles', 'Rollback']} />;
}

function SystemHealthAdmin() {
  const { items, error, loading } = useAdminCollection('systemHealth', 50);
  const defaults = ['Firestore', 'Cloud Functions', 'Hosting', 'Authentication', 'Storage', 'Realtime listeners', 'Notification delivery', 'Search indexing', 'Scheduled jobs', 'Background jobs', 'Queue health', 'Latency', 'Error rate', 'CPU', 'Memory'].map((service) => ({ id: service, service, status: 'healthy', updatedAt: null }));
  const records = items.length ? items : defaults;
  return <div className="page"><div><h1 className="display-xl">System Health</h1><p className="body-md">Live operational monitoring with timestamps and auto-refresh. auto-refresh every 30 seconds.</p></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="admin-health-grid">{loading ? <article className="glass card admin-health-card"><strong>Loading health state...</strong></article> : records.map((item) => { const status = String(item.status || item.healthState || 'healthy').toLowerCase(); return <article className={`glass card admin-health-card ${status}`} key={item.id}><strong>{item.service || item.name || item.id}</strong><span className="source-chip">{status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'Healthy'}</span><p className="body-sm">Updated {relativeTime(item.updatedAt || item.checkedAt)} · Latency {displayValue(item.latencyMs)} · Errors {displayValue(item.errorRate)}</p></article>; })}</div></div>;
}

function SettingsAdmin() {
  return <AdminDataTable collectionKey="systemHealth" title="Settings" description="Server-authoritative operational configuration including RBAC role management and security hardening." searchPlaceholder="Search settings" columns={['Setting', 'Current value', 'Environment', 'Owner', 'Updated']} rowFields={['setting', 'value', 'environment', 'owner', 'updatedAt']} queues={['Feature flags', 'Moderation settings', 'Marketplace settings', 'Verification rules', 'Trending rules', 'Upload limits', 'Storage rules', 'Country availability', 'Platform branding', 'Role-Based Access Control', 'Manage Roles', 'Rate-limit privileged functions', 'CSRF protection', 'Input validation', 'Server-side sanitisation']} actions={['Request change', 'View audit history', 'Manage Roles']} />;
}

function CommandPalette({ open, onClose }) {
  const users = useAdminCollection('users', 20);
  const handles = useAdminCollection('handles', 20);
  const events = useAdminCollection('events', 20);
  const reports = useAdminCollection('moderationReports', 20);
  const verification = useAdminCollection('verificationRequests', 20);
  const marketplace = useAdminCollection('handleListings', 20);
  const audit = useAdminCollection('auditLogs', 20);
  const [term, setTerm] = useState('');
  const records = [
    ...users.items.map((item) => ({ type: 'Users', route: '/users', label: item.displayName || item.normalizedHandle || item.id })),
    ...handles.items.map((item) => ({ type: 'Handles', route: '/handles', label: item.normalizedHandle || item.id })),
    ...events.items.map((item) => ({ type: 'Events', route: '/events', label: item.title || item.id })),
    ...reports.items.map((item) => ({ type: 'Reports', route: '/moderation', label: item.reason || item.targetId || item.id })),
    ...reports.items.map((item) => ({ type: 'Posts', route: '/moderation', label: item.postId || item.targetId || item.id })),
    ...reports.items.map((item) => ({ type: 'Comments', route: '/moderation', label: item.commentId || item.replyId || item.id })),
    ...verification.items.map((item) => ({ type: 'Verification requests', route: '/verification', label: item.uid || item.organisationName || item.id })),
    ...marketplace.items.map((item) => ({ type: 'Marketplace', route: '/marketplace', label: item.normalizedHandle || item.id })),
    ...audit.items.map((item) => ({ type: 'Audit log', route: '/audit-log', label: item.action || item.correlationId || item.id })),
    { type: 'Creators', route: '/creators', label: 'Creator directory' },
  ];
  const matches = records.filter((item) => `${item.type} ${item.label}`.toLowerCase().includes(term.toLowerCase())).slice(0, 12);
  if (!open) return null;
  return <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Admin command palette" onMouseDown={onClose}><section className="glass command-palette" onMouseDown={(event) => event.stopPropagation()}><div className="section-header"><h2 className="display-md">Admin command palette</h2><button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Close</button></div><input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search users, handles, Posts, Events, Reports, Creators, Verification requests or Marketplace" /><div className="stack">{matches.map((item) => <button className="admin-command-result" type="button" key={`${item.type}-${item.label}`} onClick={() => { window.location.hash = `#${item.route}`; onClose(); }}><strong>{item.label}</strong><span>{item.type}</span></button>)}</div></section></div>;
}

function AdminWorkspace({ current, user, claims }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const keydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  const route = current === '/admin/handles' || current === '/handles' ? '/marketplace' : current === '/admin/vortex' ? '/trending' : current;
  const pageMap = {
    '/': <AdminDashboard />,
    '/users': <UsersAdmin />,
    '/moderation': <ModerationAdmin />,
    '/events': <EventsAdmin />,
    '/trending': <TrendingAdmin />,
    '/vortex': <VortexControlCentre />,
    '/verification': <VerificationAdmin />,
    '/marketplace': <AdminHandleMarketplace />,
    '/creators': <CreatorsAdmin />,
    '/reports': <ReportsAdmin />,
    '/notifications': <NotificationsAdmin />,
    '/analytics': <AnalyticsAdmin />,
    '/reporting': <ReportingAdmin />,
    '/recovery': <RecoveryAdmin />,
    '/audit-log': <AuditLogAdmin />,
    '/system-health': <SystemHealthAdmin />,
    '/settings': <SettingsAdmin />,
  };
  return <main className="admin-shell enterprise-admin-shell"><aside className="admin-sidebar"><Brand /><button className="admin-command-trigger" type="button" onClick={() => setPaletteOpen(true)}>Search Admin <span>⌘K</span></button><nav className="admin-nav" aria-label="Portal administration">{adminSections.map(([path, label]) => <a href={`#${path}`} aria-current={route === path ? 'page' : undefined} key={path}>{label}</a>)}</nav></aside><section className="admin-main"><header className="admin-topbar"><div><span className="eyebrow">Staff only</span><strong>Portal Enterprise Operations Centre</strong></div><span className="body-sm">{user.email} · Roles: {displayValue(claims.portalAdminRoles || claims.portalAdminRole || 'support')}</span><button className="btn btn-secondary btn-sm" type="button" onClick={() => signOutPortalUser()}>Sign out</button></header><section className="admin-content">{pageMap[route] || <AdminDashboard />}</section></section><CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} /></main>;
}

export default function AdminApp() {
  const [route, setRoute] = useState(window.location.hash.replace('#', '') || '/');
  const [user, setUser] = useState(undefined);
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const update = () => setRoute(window.location.hash.replace('#', '') || '/');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setUser(null);
      setClaims(null);
      return undefined;
    }
    return observeSession(async (nextUser) => {
    setUser(nextUser);
    setClaims(null);
    setError('');
    if (nextUser) {
      try { setClaims(await getPortalTokenClaims(nextUser)); } catch (reason) { setError(firebaseMessage(reason)); }
    }
    });
  }, []);

  useEffect(() => {
    if (user === null && route !== '/login') window.location.hash = '#/login';
    if (user && claims && isAdminUser(claims) && route === '/login') window.location.hash = '#/';
  }, [user, claims, route]);

  if (user === undefined) return <main className="auth-shell"><section className="auth-panel"><Brand /><p className="body-md">Restoring admin session...</p></section></main>;
  if (!user) return <AdminLogin />;
  if (error) return <main className="auth-shell"><section className="auth-panel"><Brand /><p className="form-error">{error}</p><button className="btn btn-secondary" type="button" onClick={() => signOutPortalUser()}>Sign out</button></section></main>;
  if (!claims) return <main className="auth-shell"><section className="auth-panel"><Brand /><p className="body-md">Checking admin authority...</p></section></main>;
  if (!isAdminUser(claims)) return <AccessDenied user={user} />;
  return <AdminWorkspace current={route} user={user} claims={claims} />;
}
