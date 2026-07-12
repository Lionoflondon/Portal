import { useEffect, useState } from 'react';
import {
  changePortalPassword,
  getPortalAdminHandle,
  getPortalTokenClaims,
  hasFirebaseConfig,
  managePortalHandleRegistry,
  observeVortexEntries,
  observeSession,
  reclaimPortalHandle,
  refundPlaceholderPortalHandlePurchase,
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
  const date = value.toDate ? value.toDate() : value instanceof Date ? value : null;
  return date ? date.toLocaleDateString() : 'Not set';
}

function relativeTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return 'Not set';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 48 * 60 * 60_000) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

function AdminHandleRegistry() {
  const [term, setTerm] = useState('');
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('protect');
  const [category, setCategory] = useState('brand');
  const [notes, setNotes] = useState('');
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reason, setReason] = useState('impersonation');
  const [outcome, setOutcome] = useState('mark_protected');
  const [claimantUid, setClaimantUid] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);

  async function refresh(handle = record?.normalizedHandle || term) {
    setRecord(await getPortalAdminHandle(handle));
  }

  async function search(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await refresh(term); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function manage(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await managePortalHandleRegistry({ handle: record.normalizedHandle, action, category, notes, ...(action === 'verify_owner' ? { verifiedUid: claimantUid } : {}) });
      await refresh(record.normalizedHandle);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function reclaim(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await reclaimPortalHandle({ handle: record.normalizedHandle, reason, notes, outcome, claimantUid: claimantUid || null, confirmation, highRiskConfirmed });
      setReclaimOpen(false);
      await refresh(record.normalizedHandle);
    } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  async function refundPurchase(purchaseId) {
    setBusy(true); setError('');
    try { await refundPlaceholderPortalHandlePurchase(purchaseId); await refresh(record.normalizedHandle); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }

  return <div className="page"><div><h1 className="display-xl">Handle management</h1><p className="body-md">Protected Handle Registry controls. Every action is recorded.</p></div><form className="glass card form-stack" onSubmit={search}><label>Search handle<input value={term} onChange={(event) => setTerm(event.target.value.replace(/^@/, ''))} placeholder="@handle" /></label><button className="btn btn-primary" disabled={busy || !term.trim()}>Search registry</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}{record ? <><section className="glass card marketplace-card"><div><h2 className="display-lg">@{record.normalizedHandle}</h2><p className="body-sm">{record.protected?.status || record.reserved?.status || record.policy?.status || record.handle?.status || 'available'}</p></div><div className="metrics"><span>{record.protected?.category || record.reserved?.category || record.policy?.category || record.handle?.marketplaceClass || 'unclassified'}</span><span>{record.handle?.ownerUid ? 'Owned' : 'No active owner'}</span></div></section><section className="glass card"><h2 className="display-md">Identity risk review</h2>{record.requests?.length ? <div className="stack">{record.requests.map((item) => <article className="glass card compact-empty" key={item.id || item.requestId}><div className="inline-meta"><span className="source-chip">{item.requestType}</span><span className="source-chip">{item.status}</span><span className="source-chip">{item.riskBand}</span></div><p className="body-sm">Risk score {item.riskScore} · Email {item.emailVerified ? 'verified' : 'not verified'} · Phone {item.phoneVerified ? 'verified' : 'not verified'}</p><p className="body-sm">Device matches {item.deviceMatchCount || 0} · Browser matches {item.browserMatchCount || 0}</p><p className="body-sm">{(item.riskReasons || []).map((itemReason) => itemReason.code).join(', ') || 'No risk reasons recorded.'}</p></article>)}</div> : <p className="body-sm">No handle risk reviews recorded for this handle.</p>}</section><section className="glass card"><h2 className="display-md">Handle purchases</h2>{record.purchases?.length ? <div className="stack">{record.purchases.map((item) => <article className="glass card compact-empty" key={item.id || item.purchaseId}><div className="inline-meta"><span className="source-chip">{item.paymentProviderMode || item.provider || 'unknown provider'}</span><span className="source-chip">{item.paymentStatus || item.status}</span><span className="source-chip">{item.issuanceState || 'not issued'}</span></div><p className="body-sm">{formatMoney(item.amountMinor, item.currency)} · Buyer {item.uid} · Renewal {timeLabel(item.renewalDate)}</p>{item.paymentProviderMode === 'placeholder' && item.paymentStatus !== 'refunded' ? <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => refundPurchase(item.purchaseId || item.id)}>Refund placeholder purchase</button> : null}</article>)}</div> : <p className="body-sm">No purchases recorded for this handle.</p>}</section><section className="glass card"><h2 className="display-md">Registry action</h2><form className="form-stack" onSubmit={manage}><label>Action<select value={action} onChange={(event) => setAction(event.target.value)}>{['protect', 'reserve', 'marketplace', 'release', 'retire', 'verify_owner'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} /></label>{action === 'verify_owner' ? <label>Verified owner UID<input value={claimantUid} onChange={(event) => setClaimantUid(event.target.value)} /></label> : null}<label>Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="btn btn-secondary" disabled={busy}>Apply registry action</button></form></section><section className="glass card"><h2 className="display-md">Enforcement</h2><p className="body-sm">Reclaim Handle requires a reason, internal notes and typed confirmation.</p><button className="btn btn-primary" type="button" onClick={() => setReclaimOpen(true)}>Reclaim Handle</button></section>{reclaimOpen ? <section className="glass card"><h2 className="display-md">Reclaim @{record.normalizedHandle}</h2><form className="form-stack" onSubmit={reclaim}><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}>{['impersonation', 'trademark', 'fraud', 'abuse', 'legal_compliance', 'public_interest', 'system_use', 'enforcement'].map((item) => <option key={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}>{['mark_protected', 'permanently_reserve', 'assign_verified_claimant', 'assign_portal_account', 'return_to_marketplace', 'release_to_availability'].map((item) => <option key={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>{outcome.includes('assign_') ? <label>Receiving Portal UID<input value={claimantUid} onChange={(event) => setClaimantUid(event.target.value)} /></label> : null}<label>Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} required minLength="8" /></label><label>Type RECLAIM @{record.normalizedHandle}<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={highRiskConfirmed} onChange={(event) => setHighRiskConfirmed(event.target.checked)} /> I confirm this may be a high-risk reclaim.</label><div className="form-actions"><button className="btn btn-primary" disabled={busy}>Confirm reclaim</button><button className="btn btn-secondary" type="button" onClick={() => setReclaimOpen(false)}>Cancel</button></div></form></section> : null}</> : null}</div>;
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

function AdminWorkspace({ current, user }) {
  const handles = current === '/handles' || current === '/admin/handles';
  const vortex = current === '/vortex' || current === '/admin/vortex';
  return <main className="admin-shell"><header className="admin-topbar"><Brand /><div><span className="eyebrow">Staff only</span><strong>Portal administration</strong></div><span className="body-sm">{user.email}</span><button className="btn btn-secondary btn-sm" type="button" onClick={() => signOutPortalUser()}>Sign out</button></header><div className="admin-layout"><nav className="admin-nav" aria-label="Portal administration"><a href="#/" aria-current={!handles && !vortex ? 'page' : undefined}>Overview</a><a href="#/vortex" aria-current={vortex ? 'page' : undefined}>Vortex Control Centre</a><a href="#/handles" aria-current={handles ? 'page' : undefined}>Handle Registry</a></nav><section className="admin-content">{handles ? <AdminHandleRegistry /> : vortex ? <VortexControlCentre /> : <div className="page"><div><h1 className="display-xl">Portal administration</h1><p className="body-md">Controlled operational surfaces for Portal staff.</p></div><section className="glass card"><h2 className="display-md">Vortex Control Centre</h2><p className="body-sm">Monitor active Pulse stories, growth trends, official source signals and Custodian review load.</p><a className="btn btn-primary" href="#/vortex">Open Vortex Control Centre</a></section><section className="glass card"><h2 className="display-md">Handle Registry</h2><p className="body-sm">Search, classify and reclaim protected Portal identities. Server functions enforce admin authority.</p><a className="btn btn-primary" href="#/handles">Open Handle Registry</a></section><AdminPasswordPanel /></div>}</section></div></main>;
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
  return <AdminWorkspace current={route} user={user} />;
}
