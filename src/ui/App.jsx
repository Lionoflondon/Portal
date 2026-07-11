import { useEffect, useState } from 'react';
import { eventStatuses, routes, secondaryRoutes, sourceTypes } from '../domain/portal.js';
import {
  archivePortalEvent,
  changePortalPassword,
  createPortalReport,
  hasFirebaseConfig,
  observeEvent,
  observeEvents,
  observeProfile,
  observeReports,
  observeSession,
  observeVortex,
  publishPortalReport,
  registerPortalUser,
  sendPortalPasswordReset,
  setVortexFollow,
  signInPortalUser,
  signOutPortalUser,
  updatePortalEvent,
  updatePortalProfile,
} from '../services/firebase.js';

const iconPaths = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  events: '<rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  vortex: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3M12 19v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  messages: '<path d="M21 11.5a8.5 8.5 0 01-12.4 7.6L3 21l1.9-5.7A8.5 8.5 0 1112.5 20" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  notifications: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  profile: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  premium: '<path d="M5 18h14l1.5-9-5 3-3.5-6-3.5 6-5-3L5 18z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  creator: '<path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.8"/><path d="M8 13l2.5 2.5L16 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  brand: '<path d="M3 9l9-6 9 6-9 6-9-6zM3 9v6l9 6 9-6V9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  admin: '<path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  search: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

function Icon({ name }) { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconPaths[name] || '' }} />; }
function initials(name = '') { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'P'; }
function Avatar({ children, size = 'md' }) { return <span className={`avatar size-${size}`}>{children}</span>; }
function timeLabel(value) { return value?.toDate ? value.toDate().toLocaleDateString() : 'Now'; }
function firebaseMessage(error) { return error?.message?.replace('Firebase: ', '') || 'Something went wrong. Please try again.'; }

export const EVENTS_UNAVAILABLE_MESSAGE = 'Events are temporarily unavailable. Please try again shortly.';

function Brand() { return <a href="#/" className="brand" aria-label="Portal home"><span className="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" /></svg></span><span className="brand-name desktop-only">Portal</span></a>; }
function NavLink({ route, current }) { return <a href={`#${route.path}`} className="nav-item" aria-current={current === route.path ? 'page' : undefined}><Icon name={route.icon} /><span>{route.label}</span></a>; }

function Sidebar({ current, profile, onCreate }) {
  return <nav className="sidebar desktop-only" aria-label="Primary"><Brand /><div className="nav-group">{routes.map((route) => <NavLink key={route.path} route={route} current={current} />)}</div><button className="create-btn" onClick={onCreate} aria-haspopup="dialog"><span>+</span>Create</button><div className="nav-group secondary-nav"><div className="eyebrow nav-label">More</div>{secondaryRoutes.map((route) => <NavLink key={route.path} route={route} current={current} />)}</div><div className="sidebar-footer"><a href="#/settings" className="profile-summary"><Avatar>{initials(profile?.displayName)}</Avatar><span className="profile-meta"><strong>{profile?.displayName || 'Portal member'}</strong><span>{profile?.email || ''}</span></span></a></div></nav>;
}
function Topbar({ profile }) { return <header className="topbar mobile-only"><Brand /><div className="topbar-actions"><a aria-label="Open settings" href="#/settings"><Avatar size="sm">{initials(profile?.displayName)}</Avatar></a></div></header>; }
function BottomNav({ current }) { return <nav className="bottom-nav mobile-only" aria-label="Primary">{['/', '/events', '/vortex', '/profile'].map((path) => { const route = routes.find((item) => item.path === path); return <a key={path} href={`#${path}`} className={`bnav-item ${path === '/vortex' ? 'vortex-center' : ''}`} aria-current={current === path ? 'page' : undefined}><Icon name={route.icon} /><span>{route.label}</span></a>; })}</nav>; }

function Section({ title, link, children }) { return <section><div className="section-header"><h2>{title}</h2>{link ? <a className="see-all" href={link}>See all</a> : null}</div><div className="section-body">{children}</div></section>; }
function Loading({ label = 'Loading Portal...' }) { return <div className="glass card empty-state"><div className="loader" /><p className="body-sm">{label}</p></div>; }
function ErrorState({ message }) { return <div className="glass card empty-state"><h2 className="display-md">Portal could not load this</h2><p className="body-sm">{message}</p></div>; }

function EventCard({ event, follow, onFollow }) {
  return <article className="glass card interactive event-card memory-event-card"><span className={`event-status ${event.status.toLowerCase()}`}>{event.status}</span><a href={`#/events/${event.id}`}><strong>{event.title}</strong></a><span className="body-sm">{event.summary}</span><div className="metrics"><span>{event.parentEventId ? 'Connected event' : 'Independent event'}</span><span>{timeLabel(event.updatedAt)}</span></div>{onFollow ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => onFollow(event.id, !follow)}>{follow ? 'Following' : 'Follow event'}</button> : null}</article>;
}

function EventCollection({ events, loading, error, empty, onFollow, following = new Set() }) {
  if (loading) return <Loading label="Finding events..." />;
  if (error) return <ErrorState message={error} />;
  if (!events.length) return <div className="glass card empty-state"><h2 className="display-md">{empty}</h2><p className="body-sm">Create a report or event to begin building Portal&apos;s living memory.</p></div>;
  return <div className="hscroll">{events.map((event) => <EventCard key={event.id} event={event} follow={following.has(event.id)} onFollow={onFollow} />)}</div>;
}

function Home({ eventState, onFollow, following }) {
  return <div className="page"><div className="welcome-head"><div><h1 className="display-xl">Humanity&apos;s living memory</h1><p className="body-md">Reports become evidence. Conversations become context. Events become connected memory.</p></div></div><Section title="Events happening now" link="#/events"><EventCollection {...eventState} error={eventState.error ? EVENTS_UNAVAILABLE_MESSAGE : ''} empty="No events yet" onFollow={onFollow} following={following} /></Section><Section title="Your Vortex" link="#/vortex"><div className="glass card empty-state"><div className="icon-wrap"><Icon name="vortex" /></div><h2 className="display-md">Follow the connections</h2><p className="body-sm">Your saved events become a personal path through Portal&apos;s universe.</p></div></Section></div>;
}

function EventForm({ initial, events, onSubmit, onCancel, busy }) {
  const [values, setValues] = useState(initial || { title: '', summary: '', status: 'Developing', parentEventId: '' });
  const [error, setError] = useState('');
  function submit(event) { event.preventDefault(); if (values.title.trim().length < 3 || values.summary.trim().length < 12) { setError('Use a clear title and a summary of at least 12 characters.'); return; } onSubmit(values); }
  return <form className="form-stack" onSubmit={submit}><label>Event name<input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} maxLength="120" required /></label><label>Summary<textarea value={values.summary} onChange={(event) => setValues({ ...values, summary: event.target.value })} maxLength="1000" required /></label><label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{eventStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Parent event<select value={values.parentEventId} onChange={(event) => setValues({ ...values, parentEventId: event.target.value })}><option value="">No parent event</option>{events.filter((event) => event.id !== initial?.id).map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}</select></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save event'}</button>{onCancel ? <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button> : null}</div></form>;
}

function Events({ user, eventState, onFollow, following, onCreate }) {
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? eventState.events : eventState.events.filter((event) => event.status === filter);
  return <div className="page"><div className="welcome-head"><div><h1 className="display-xl">Events</h1><p className="body-md">Real happenings, organised by evidence, status and relationship.</p></div><button type="button" className="btn btn-primary" onClick={onCreate}>Create event</button></div><Section title="Status"><div className="chip-row">{['All', ...eventStatuses].map((status) => <button type="button" className={`chip ${filter === status ? 'active' : ''}`} onClick={() => setFilter(status)} key={status}>{status}</button>)}</div></Section><Section title="Events"><EventCollection events={filtered} loading={eventState.loading} error={eventState.error ? EVENTS_UNAVAILABLE_MESSAGE : ''} empty="No matching events" onFollow={onFollow} following={following} /></Section><p className="body-sm">Signed in as {user.email}</p></div>;
}

function EventDetail({ eventId, user, events, onFollow, following }) {
  const [event, setEvent] = useState(null); const [reports, setReports] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [report, setReport] = useState({ body: '', sourceType: 'Eyewitness' });
  useEffect(() => { const stop = observeEvent(eventId, (snapshot) => { setEvent(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); setLoading(false); }, (reason) => { setError(firebaseMessage(reason)); setLoading(false); }); return stop; }, [eventId]);
  useEffect(() => { const stop = observeReports(eventId, (snapshot) => setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  async function save(values) { setBusy(true); try { await updatePortalEvent(eventId, values); setEditing(false); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function archive() { if (!window.confirm('Archive this event? It will disappear from the live event list.')) return; setBusy(true); try { await archivePortalEvent(eventId); window.location.hash = '#/events'; } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function submitReport(item) { item.preventDefault(); if (report.body.trim().length < 12 || busy) return; setBusy(true); try { await createPortalReport(user, eventId, report); setReport({ body: '', sourceType: 'Eyewitness' }); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  if (loading) return <Loading label="Opening event..." />; if (error) return <ErrorState message={error} />; if (!event) return <ErrorState message="This event no longer exists or you do not have access to it." />;
  const owner = event.createdBy === user.uid;
  return <div className="page"><a className="see-all" href="#/events">Back to events</a><div className="glass card hero-event"><span className={`event-status ${event.status.toLowerCase()}`}>{event.status}</span><h1>{event.title}</h1><p className="body-md">{event.summary}</p><div className="hero-meta"><button className="btn btn-primary btn-sm" onClick={() => onFollow(event.id, !following)}>{following ? 'Following' : 'Follow event'}</button>{owner ? <><button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>Edit</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={archive}>Archive</button></> : null}</div></div>{editing ? <section className="glass card"><h2 className="display-md">Edit event</h2><EventForm initial={event} events={events} onSubmit={save} onCancel={() => setEditing(false)} busy={busy} /></section> : null}<Section title="Reports"><form className="form-stack glass card" onSubmit={submitReport}><label>What happened?<textarea value={report.body} onChange={(item) => setReport({ ...report, body: item.target.value })} maxLength="2000" required /></label><label>Source type<select value={report.sourceType} onChange={(item) => setReport({ ...report, sourceType: item.target.value })}>{sourceTypes.map((source) => <option key={source}>{source}</option>)}</select></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Adding report...' : 'Add report'}</button></form><div className="stack">{reports.length ? reports.map((item) => <article className="glass card report-item" key={item.id}>{item.media?.photoUrl ? <img className="report-media" src={item.media.photoUrl} alt="Report evidence" /> : null}{item.media?.videoUrl ? <video className="report-media" controls src={item.media.videoUrl} /> : null}<div className="body"><div className="inline-meta"><span className="source-chip">{item.identityMode || item.sourceType}</span><span className="body-sm">{item.location || timeLabel(item.occurredAt || item.createdAt)}</span></div>{item.title ? <strong>{item.title}</strong> : null}<p className="body-sm">{item.body}</p></div></article>) : <div className="glass card empty-state"><p className="body-sm">No reports yet. History is taking notes.</p></div>}</div></Section></div>;
}

function Vortex({ events, loading, error, following, onFollow }) {
  const [term, setTerm] = useState(''); const [tab, setTab] = useState('Events');
  const results = events.filter((event) => `${event.title} ${event.summary} ${event.status}`.toLowerCase().includes(term.toLowerCase())).filter((event) => tab === 'Following' ? following.has(event.id) : true);
  return <div className="page vortex-page"><div><h1 className="display-xl">Vortex</h1><p className="body-md">The rocket through Portal&apos;s universe: search, jump and trace how events connect.</p></div><div className="vortex-orb-field" aria-hidden="true"><span className="label">Travel through humanity&apos;s knowledge</span></div><div className="vortex-search-wrap"><label className="glass field vortex-field"><Icon name="search" /><input value={term} onChange={(event) => setTerm(event.target.value)} type="search" placeholder="Search a happening or constellation..." /></label></div><div className="tabs" role="tablist">{['Events', 'Following'].map((item) => <button className={`tab ${tab === item ? 'active' : ''}`} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} key={item} type="button">{item}</button>)}</div><EventCollection events={results} loading={loading} error={error} empty={tab === 'Following' ? 'Your Vortex is waiting' : 'No events found'} onFollow={onFollow} following={following} /></div>;
}

function Settings({ user, profile }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || user.displayName || ''); const [emailUpdates, setEmailUpdates] = useState(profile?.preferences?.emailUpdates ?? true); const [password, setPassword] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setDisplayName(profile?.displayName || user.displayName || ''); setEmailUpdates(profile?.preferences?.emailUpdates ?? true); }, [profile, user.displayName]);
  async function save(event) { event.preventDefault(); setBusy(true); setError(''); try { await updatePortalProfile(user, { displayName: displayName.trim(), emailUpdates }); setNotice('Profile saved.'); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function passwordChange(event) { event.preventDefault(); if (password.length < 8) { setError('Use at least 8 characters for a new password.'); return; } setBusy(true); setError(''); try { await changePortalPassword(password); setPassword(''); setNotice('Password updated.'); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  return <div className="page"><div><h1 className="display-xl">Settings</h1><p className="body-md">Your Portal profile and private preferences.</p></div>{notice ? <p className="form-notice" role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<section className="glass card"><h2 className="display-md">Profile</h2><form className="form-stack" onSubmit={save}><label>Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength="80" /></label><label>Email<input value={user.email || ''} disabled /></label><label className="check-row"><input type="checkbox" checked={emailUpdates} onChange={(event) => setEmailUpdates(event.target.checked)} /> Email updates</label><button className="btn btn-primary" disabled={busy}>Save preferences</button></form></section><section className="glass card"><h2 className="display-md">Security</h2><form className="form-stack" onSubmit={passwordChange}><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" /></label><button className="btn btn-secondary" disabled={busy}>Update password</button></form></section><button className="btn btn-secondary" type="button" onClick={() => signOutPortalUser()}>Sign out</button></div>;
}

function AuthScreen() {
  const [mode, setMode] = useState('signin'); const [values, setValues] = useState({ name: '', email: '', password: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { if (mode === 'signup') { if (values.name.trim().length < 2) throw new Error('Please add your name.'); await registerPortalUser({ displayName: values.name.trim(), email: values.email.trim(), password: values.password }); } else if (mode === 'reset') { await sendPortalPasswordReset(values.email.trim()); setNotice('A password reset email has been sent.'); } else { await signInPortalUser(values.email.trim(), values.password); } } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  return <main className="auth-shell"><div className="auth-panel"><Brand /><div><h1 className="display-xl">{mode === 'signup' ? 'Create your Portal' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1><p className="body-md">{mode === 'signup' ? 'Start organising the world’s happenings.' : 'Enter Portal’s living memory.'}</p></div>{!hasFirebaseConfig ? <ErrorState message="Firebase environment configuration is missing." /> : <form className="form-stack" onSubmit={submit}>{mode === 'signup' ? <label>Name<input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></label> : null}<label>Email<input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} required autoComplete="email" /></label>{mode !== 'reset' ? <label>Password<input type="password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} required minLength="8" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button></form>}<div className="auth-links">{mode !== 'signin' ? <button type="button" onClick={() => setMode('signin')}>Sign in</button> : <button type="button" onClick={() => setMode('signup')}>Create an account</button>}{mode === 'signin' ? <button type="button" onClick={() => setMode('reset')}>Forgot password?</button> : null}</div></div></main>;
}

function CreateModal({ open, onClose, user, events }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [progress, setProgress] = useState({});
  const [values, setValues] = useState({ title: '', description: '', location: '', occurredAt: '', identityMode: 'Reporter', eventId: '', eventTitle: '', photo: null, video: null });
  if (!open) return null;
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })); }
  function pickMedia(kind, file) {
    if (!file) return update(kind, null);
    const expected = kind === 'photo' ? 'image/' : 'video/';
    const limitMb = kind === 'photo' ? 25 : 100;
    if (!file.type.startsWith(expected) || file.size > limitMb * 1024 * 1024) { setError(`${kind === 'photo' ? 'Photos' : 'Videos'} must be a valid ${kind} under ${limitMb} MB.`); return; }
    setError(''); update(kind, file);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (values.title.trim().length < 3 || values.description.trim().length < 12 || (!values.eventId && values.eventTitle.trim().length < 3)) { setError('Give the report some substance, then attach it to an event or name the new happening.'); return; }
    setBusy(true); setError('');
    try { const record = await publishPortalReport(user, values, (kind, amount) => setProgress((current) => ({ ...current, [kind]: amount }))); onClose(); window.location.hash = `#/events/${record.eventId}`; } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="createModalTitle" onMouseDown={onClose}><div className="modal form-modal report-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2 id="createModalTitle">Report a happening</h2><p className="body-sm">Give history something better than a vague group chat memory.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<form className="form-stack" onSubmit={submit}><label>Report title<input value={values.title} onChange={(event) => update('title', event.target.value)} maxLength="120" required /></label><label>What happened?<textarea value={values.description} onChange={(event) => update('description', event.target.value)} maxLength="2000" required /></label><div className="form-grid"><label>Location<input value={values.location} onChange={(event) => update('location', event.target.value)} maxLength="180" placeholder="Where it happened" /></label><label>Date and time<input type="datetime-local" value={values.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label></div><fieldset className="identity-mode"><legend>How should Portal frame this?</legend>{['Reporter', 'Casual'].map((mode) => <label key={mode}><input type="radio" name="identity" checked={values.identityMode === mode} onChange={() => update('identityMode', mode)} /> {mode}</label>)}</fieldset><label>Attach to an event<select value={values.eventId} onChange={(event) => update('eventId', event.target.value)}><option value="">Create a new event from this report</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{!values.eventId ? <label>New event name<input value={values.eventTitle} onChange={(event) => update('eventTitle', event.target.value)} maxLength="120" placeholder="The happening this belongs to" required /></label> : null}<div className="form-grid media-inputs"><label>Photo evidence<input type="file" accept="image/*" onChange={(event) => pickMedia('photo', event.target.files?.[0])} /></label><label>Video evidence<input type="file" accept="video/*" onChange={(event) => pickMedia('video', event.target.files?.[0])} /></label></div>{values.photo || values.video ? <p className="body-sm">{values.photo?.name || ''}{values.photo && values.video ? ' · ' : ''}{values.video?.name || ''}{progress.photo ? ` · Photo ${progress.photo}%` : ''}{progress.video ? ` · Video ${progress.video}%` : ''}</p> : null}<div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Publishing evidence...' : 'Publish report'}</button><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button></div></form></div></div>;
}

function useRoute() { const [route, setRoute] = useState(() => window.location.hash.replace('#', '') || '/'); useEffect(() => { const change = () => setRoute(window.location.hash.replace('#', '') || '/'); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []); return route; }

export function App() {
  const current = useRoute(); const [user, setUser] = useState(undefined); const [profile, setProfile] = useState(null); const [events, setEvents] = useState([]); const [eventsLoading, setEventsLoading] = useState(true); const [eventsError, setEventsError] = useState(''); const [following, setFollowing] = useState(new Set()); const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { if (!hasFirebaseConfig) { setUser(null); return undefined; } return observeSession(setUser); }, []);
  useEffect(() => { if (!user) return undefined; const stopProfile = observeProfile(user.uid, (snapshot) => setProfile(snapshot.exists() ? snapshot.data() : null)); const stopEvents = observeEvents((snapshot) => { setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); setEventsLoading(false); }, (reason) => { setEventsError(firebaseMessage(reason)); setEventsLoading(false); }); const stopVortex = observeVortex(user.uid, (snapshot) => setFollowing(new Set(snapshot.docs.map((item) => item.id)))); return () => { stopProfile(); stopEvents(); stopVortex(); }; }, [user]);
  useEffect(() => { const route = current.startsWith('/events/') ? 'Event' : routes.concat(secondaryRoutes).find((item) => item.path === current)?.label || 'Home'; document.title = `${route} · Portal`; }, [current]);
  async function follow(eventId, next) { if (!user) return; await setVortexFollow(user.uid, eventId, next); }
  if (user === undefined) return <main className="auth-shell"><Loading label="Restoring your Portal session..." /></main>;
  if (!user) return <AuthScreen />;
  const eventState = { events, loading: eventsLoading, error: eventsError };
  let page; if (current === '/events') page = <Events user={user} eventState={eventState} onFollow={follow} following={following} onCreate={() => setCreateOpen(true)} />; else if (current.startsWith('/events/')) page = <EventDetail eventId={current.split('/')[2]} user={user} events={events} onFollow={follow} following={following.has(current.split('/')[2])} />; else if (current === '/vortex') page = <Vortex {...eventState} following={following} onFollow={follow} />; else if (current === '/settings') page = <Settings user={user} profile={profile} />; else if (current === '/profile') page = <div className="page"><h1 className="display-xl">{profile?.displayName || user.displayName || 'Profile'}</h1><div className="glass card"><p className="body-md">Your reports, event contributions and followed connections live in your Portal profile.</p></div></div>; else page = <Home eventState={eventState} onFollow={follow} following={following} />;
  return <><a href="#main" className="skip-link">Skip to content</a><div className="app"><Sidebar current={current} profile={{ ...profile, email: user.email }} onCreate={() => setCreateOpen(true)} /><Topbar profile={profile} /><div className="main-col"><main id="main" className="content-col" tabIndex="-1">{page}</main></div><BottomNav current={current} /></div><CreateModal open={createOpen} onClose={() => setCreateOpen(false)} user={user} events={events} /></>;
}
