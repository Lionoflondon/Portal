import { useEffect, useMemo, useRef, useState } from 'react';
import { eventStatuses, eventTypes, routes, secondaryRoutes, sourceTypes } from '../domain/portal.js';
import { ActionIcon, Icon } from './icons.jsx';
import {
  archivePortalEvent,
  changePortalHandle,
  changePortalPassword,
  checkPortalHandle,
  createPortalConversation,
  createPortalEvent,
  createPortalHandleListing,
  createPortalReport,
  createPortalQuoteEcho,
  createPortalPost,
  createPortalPostReply,
  deletePortalPost,
  echoPortalPost,
  ensurePortalUserProfile,
  hasFirebaseConfig,
  getPortalPublicProfiles,
  deleteOwnPortalMessage,
  markAllPortalNotificationsRead,
  markPortalConversationRead,
  markPortalNotificationRead,
  observeEvent,
  observeEventContributions,
  observeEvents,
  observeEventSources,
  observeEventStatusHistory,
  observeEventTimeline,
  observeIngestionProviders,
  observePost,
  observePostReplies,
  observePortalNotifications,
  observePortalConversations,
  observePortalMessages,
  observeProfile,
  observePublicPosts,
  observeUserPostBookmarks,
  observeUserPostLikes,
  observeUserEchoes,
  observeReports,
  observeSession,
  observeVortex,
  observeVortexEntries,
  openPortalHandleDispute,
  completePortalHandlePurchase,
  confirmPortalHandlePurchase,
  observeHandlePurchases,
  observeHandleRequests,
  registerPortalUser,
  registerPortalPostView,
  reservePortalHandle,
  resolvePortalHandle,
  searchPortalHandleMarketplace,
  searchPortalProfiles,
  sendPortalMessage,
  sendPortalPasswordReset,
  setPortalConversationTyping,
  setVortexFollow,
  signInPortalUser,
  signOutPortalUser,
  startPortalHandlePurchase,
  submitPortalHandleOffer,
  submitPortalEventContribution,
  togglePortalProfileFollow,
  togglePortalPostBookmark,
  togglePortalPostLike,
  updatePortalEvent,
  updatePortalConversationState,
  updatePortalProfile,
  undoPortalEcho,
  uploadPortalPostMedia,
  uploadPortalMessageMedia,
  uploadPortalProfilePhoto,
} from '../services/firebase.js';

function initials(name = '') { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'P'; }
function Avatar({ children, size = 'md' }) { return <span className={`avatar size-${size}`}>{children}</span>; }
function timeLabel(value) { return value?.toDate ? value.toDate().toLocaleDateString() : 'Now'; }
function relativeTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return 'Just now';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h`;
  if (diff < 48 * 60 * 60_000) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function exactTime(value) { const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null; return date ? date.toLocaleString() : 'Exact time pending'; }
function timestampMillis(value) { const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null; return date?.getTime?.() || 0; }
function formatViewCount(count = 0) {
  const value = Number(count || 0);
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}K`;
  const millions = value / 1_000_000;
  return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
}
function viewCountLabel(count = 0) {
  const value = Number(count || 0);
  return `${formatViewCount(value)} ${value === 1 ? 'View' : 'Views'}`;
}
function portalAnonymousId() {
  const key = 'portal.anonymousViewerId';
  try {
    const current = window.localStorage.getItem(key);
    if (current) return current;
    const next = crypto.randomUUID().replace(/-/g, '');
    window.localStorage.setItem(key, next);
    return next;
  } catch { return ''; }
}
function deviceType() {
  if (typeof navigator === 'undefined') return 'unknown';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (!coarse) return 'desktop';
  return window.innerWidth >= 768 ? 'tablet' : 'mobile';
}
function useIsMobileLayout() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return mobile;
}
function cleanHandle(value = '') { return String(value || '').replace(/^@/, '').trim().toLowerCase(); }
function publicProfileRoute(handle = '') { const normalized = cleanHandle(handle); return normalized ? `#/@${normalized}` : '#/profile'; }
function publicProfileUrl(handle = '') { const normalized = cleanHandle(handle); return normalized ? `${window.location.origin}/@${normalized}` : `${window.location.origin}/#/profile`; }
function firebaseMessage(error) { return error?.message?.replace('Firebase: ', '') || 'Something went wrong. Please try again.'; }
function publicAuthError(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code) console.debug('Portal authentication failed', code);
  if (code.includes('auth/invalid-email')) return { title: 'Invalid email address', body: 'Please enter a valid email address.' };
  if (code.includes('auth/wrong-password')) return { title: 'Incorrect password', body: 'The password you entered is incorrect. Try again or reset your password.' };
  if (code.includes('auth/user-not-found')) return { title: 'No account found', body: "We couldn't find a Portal account with that email. Create a new account to get started." };
  if (code.includes('auth/network-request-failed') || code.includes('auth/network')) return { title: "You're offline", body: 'Check your internet connection and try again.' };
  if (code.includes('auth/too-many-requests')) return { title: 'Too many attempts', body: 'For your security, sign-in has been temporarily limited. Please wait a few minutes before trying again.' };
  if (code.includes('auth/invalid-credential') || code.includes('auth/invalid-login-credentials')) return { title: "Couldn't sign you in", body: "The email or password you entered doesn't match a Portal account. Check your details and try again, or create a new account if you're new to Portal." };
  if (code.includes('auth/email-already-in-use')) return { title: 'Account already exists', body: 'A Portal account already uses that email. Sign in instead, or reset your password if you need help getting back in.' };
  return { title: 'Something went wrong', body: "We couldn't sign you in right now. Please try again shortly." };
}
function formatMoney(amountMinor, currency = 'GBP') {
  if (!Number.isFinite(amountMinor)) return 'Custom price';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amountMinor / 100);
}
function routeHandleQuery(route) { return new URLSearchParams(route.split('?')[1] || '').get('handle') || ''; }
function normalizedQueryHandle(value = '') { return value.replace(/^@/, '').trim().toLowerCase(); }
function requestLabel(item = {}) {
  const state = item.status || item.approvalState || item.paymentStatus || item.issuanceState || 'pending_review';
  return String(state).replaceAll('_', ' ');
}
function lifecycleIndex(item = {}) {
  if (item.status === 'refunded' || item.paymentStatus === 'refunded') return 7;
  if (item.status === 'declined' || item.approvalState === 'rejected') return 6;
  if (item.status === 'assigned' || item.issuanceState === 'issued') return 5;
  if (item.approvalState === 'approved') return 4;
  if (item.status === 'payment_approved' || item.developmentPaid === true) return 2;
  if (item.paymentStatus === 'not_started' || item.paymentState === 'awaiting_payment') return 1;
  return 0;
}
const handleLifecycleSteps = ['Request', 'Payment', 'Safety review', 'Identity check', 'Portal review', 'Issued', 'Declined', 'Refund'];

export const EVENTS_UNAVAILABLE_MESSAGE = 'Events are temporarily unavailable. Please try again shortly.';
export const PROFILE_HANDLE_PLACEHOLDER = 'Choose your unique handle';
const eventRegions = ['World', 'Nearby', 'United Kingdom', 'Europe', 'Africa', 'Americas', 'Asia'];
const eventCategories = ['All', ...eventTypes];
const eventReaches = ['Random', 'Local', 'Citywide', 'National', 'Global'];
const contributionTabs = ['Overview', 'Timeline', 'Updates', 'Photos', 'Videos', 'Discussion', 'Reports', 'Sources', 'Contributors', 'Related Events'];

function Brand() { return <a href="#/" className="brand" aria-label="Portal home"><span className="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" /></svg></span><span className="brand-name desktop-only">Portal</span></a>; }
function NavLink({ route, current }) { const active = route.path === '/' ? current === '/' : current === route.path || current.startsWith(`${route.path}?`); return <a href={`#${route.path}`} className="nav-item" aria-current={active ? 'page' : undefined}><Icon name={route.icon} /><span>{route.label}</span></a>; }

function Sidebar({ current, onCreate }) {
  return <nav className="sidebar desktop-only" aria-label="Primary"><Brand /><div className="nav-group">{routes.map((route) => <NavLink key={route.path} route={route} current={current} />)}</div><button className="create-btn" onClick={onCreate} aria-haspopup="dialog"><Icon name="create" />Create</button><div className="nav-group secondary-nav"><div className="eyebrow nav-label">More</div>{secondaryRoutes.map((route) => <NavLink key={route.path} route={route} current={current} />)}</div></nav>;
}
function Topbar({ profile, unreadCount = 0 }) { return <header className="topbar mobile-only"><Brand /><div className="topbar-actions"><a className="topbar-bookmark-link" aria-label="Open bookmarks" href="#/bookmarks"><ActionIcon name="bookmark" /></a><a className="topbar-notification-link" aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Open notifications'} href="#/notifications"><Icon name="notifications" />{unreadCount > 0 ? <span className="notification-badge" aria-hidden="true">{unreadCount > 20 ? '20+' : unreadCount}</span> : null}</a><a aria-label="Open profile" href="#/profile"><Avatar size="sm">{initials(profile?.displayName)}</Avatar></a></div></header>; }
function BottomNav({ current }) { return <nav className="bottom-nav mobile-only" aria-label="Primary">{['/', '/events', '/vortex', '/messages', '/profile'].map((path) => { const route = routes.find((item) => item.path === path); const active = path === '/' ? current === '/' : current === path || current.startsWith(`${path}?`); return <a key={path} href={`#${path}`} className={`bnav-item ${path === '/vortex' ? 'vortex-center' : ''}`} aria-current={active ? 'page' : undefined}><Icon name={route.icon} /><span>{route.label}</span></a>; })}</nav>; }

function Section({ title, link, children }) { return <section><div className="section-header"><h2>{title}</h2>{link ? <a className="see-all" href={link}>See all</a> : null}</div><div className="section-body">{children}</div></section>; }
function Loading({ label = 'Loading Portal...' }) { return <div className="glass card empty-state"><div className="loader" /><p className="body-sm">{label}</p></div>; }
function ErrorState({ message }) { return <div className="glass card empty-state"><h2 className="display-md">Portal could not load this</h2><p className="body-sm">{message}</p></div>; }

function eventIsGathering(event = {}) {
  return ['Public Event', 'Community', 'Sport', 'Entertainment', 'Business', 'Education'].includes(event.eventType || event.category);
}
function eventReach(event = {}) {
  const value = event.reach || event.reachClassification || 'Random';
  return eventReaches.includes(value) ? value : 'Random';
}
function eventPulse(event = {}) {
  return Math.max(0, Math.min(100, Number(event.pulseStrength ?? event.activityScore ?? 0)));
}
function eventMovement(event = {}) {
  if (['Resolved', 'Historic', 'Archived'].includes(event.status)) return 'Resolved';
  const movement = String(event.movement || event.activityMovement || '').toLowerCase();
  if (movement.includes('rapid') || movement.includes('accelerat')) return 'Rapidly changing';
  if (movement.includes('escalat')) return 'Escalating';
  if (movement.includes('stable')) return 'Stable';
  if (movement.includes('quiet') || movement.includes('cool')) return 'Quiet';
  return eventPulse(event) >= 60 ? 'Active' : 'Stable';
}
function eventTimeParts(event = {}) {
  return {
    updated: relativeTime(event.lastMeaningfulUpdateAt || event.updatedAt || event.createdAt),
    started: relativeTime(event.startTime || event.eventTime || event.createdAt),
  };
}
function canonicalEvents(events = []) {
  const seen = new Set();
  return events.filter((event) => {
    const key = event.canonicalEventId || event.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function eventCardWeight(event = {}) {
  const mediaWeight = event.heroImageUrl || event.mediaPreview?.url || event.photos?.length ? 230 : 150;
  return mediaWeight + Math.min(150, String(event.summary || '').length * .45) + Math.min(70, String(event.title || '').length * .5);
}
function useEventMasonryColumns() {
  const getCount = () => {
    if (typeof window === 'undefined') return 4;
    if (window.innerWidth < 680) return 1;
    if (window.innerWidth < 980) return 2;
    if (window.innerWidth < 1320) return 3;
    if (window.innerWidth >= 2200) return 5;
    return 4;
  };
  const [count, setCount] = useState(getCount);
  useEffect(() => {
    const resize = () => setCount(getCount());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return count;
}
function EventCard({ event, follow, onFollow }) {
  const location = event.locationSummary || event.primaryLocation || event.venue || event.region || 'World';
  const actor = event.hostName || event.reporterHandle || event.authorHandle || event.createdByType || 'Portal contributor';
  const status = event.archived ? 'Archived' : event.status || 'Developing';
  const gathering = eventIsGathering(event);
  const hero = event.heroImageUrl || event.mediaPreview?.url || event.photos?.[0]?.url || '';
  const reach = eventReach(event); const pulse = eventPulse(event); const timing = eventTimeParts(event);
  const open = () => { window.location.hash = `#/events/${event.id}`; };
  const keyOpen = (item) => { if (item.key === 'Enter' || item.key === ' ') { item.preventDefault(); open(); } };
  return <article className={`glass interactive event-card masonry-event-card reach-${reach.toLowerCase()} event-variant-${String(event.id || '').charCodeAt(0) % 4 || 0}`} role="link" tabIndex="0" onClick={open} onKeyDown={keyOpen} aria-label={`Open ${event.title}`}><a className="event-media" href={`#/events/${event.id}`} style={hero ? { backgroundImage: `linear-gradient(180deg, rgba(7,9,15,.04), rgba(7,9,15,.72)), url(${hero})` } : undefined} aria-label={event.title}>{event.video?.thumbnailUrl ? <span className="source-chip">Video</span> : null}</a><div className="masonry-event-content"><div className="event-card-topline"><span className={`event-status ${status.toLowerCase()}`}>{status}</span><span className={`event-reach reach-${reach.toLowerCase()}`}>{reach}</span></div><div className="event-sector">{event.eventType || event.category || 'Other'}</div><a href={`#/events/${event.id}`}><strong>{event.title}</strong></a>{event.summary ? <p className="body-sm">{event.summary}</p> : null}<div className="event-essential-meta"><span>{location}</span><span>{actor}</span></div><div className="event-timing"><span>Updated {timing.updated}</span><span>Started {timing.started}</span></div><div className="event-intelligence"><span><b>Pulse Strength</b> {pulse}</span><span>{eventMovement(event)}</span></div><div className="event-card-counts"><span>{event.followerCount || event.interestedCount || 0} {gathering ? 'interested' : 'following'}</span><span>{event.reportCount || 0} reports</span><span>{event.mediaCount || event.photos?.length || 0} media</span><span>{event.contributorCount || 0} contributors</span><span>{event.relatedEventIds?.length || event.storyGraphEventIds?.length || 0} connected</span><span>{event.updateCount || event.timelineCount || 0} updates</span></div><div className="event-card-actions compact"><button className="btn btn-primary btn-sm" type="button" onClick={(item) => { item.stopPropagation(); onFollow?.(event.id, !follow); }}>{follow ? 'Following' : gathering ? 'Interested' : 'Follow'}</button><button className="btn btn-secondary btn-sm" type="button" onClick={(item) => { item.stopPropagation(); navigator.clipboard?.writeText(`${window.location.origin}/#/events/${event.id}`).catch(() => {}); }}>Share</button></div></div></article>;
}

function EventCollection({ events, loading, error, empty, onFollow, following = new Set() }) {
  const columnCount = useEventMasonryColumns();
  if (loading) return <div className="event-masonry skeleton-masonry">{Array.from({ length: 8 }).map((_, index) => <div className="glass card event-skeleton" key={index} />)}</div>;
  if (error) return <ErrorState message={error} />;
  const columns = Array.from({ length: columnCount }, () => ({ weight: 0, events: [] }));
  canonicalEvents(events).forEach((event) => {
    const column = columns.reduce((shortest, candidate) => candidate.weight < shortest.weight ? candidate : shortest, columns[0]);
    column.events.push(event); column.weight += eventCardWeight(event) + 20;
  });
  if (!events.length) return <div className="glass card empty-state"><h2 className="display-md">{empty}</h2><p className="body-sm">When something happens, Portal will give it a place in the world timeline.</p></div>;
  return <div className="event-masonry" style={{ '--event-columns': columnCount }} aria-label="Masonry event discovery grid">{columns.map((column, index) => <div className="event-masonry-column" key={`event-column-${index}`}>{column.events.map((event) => <EventCard key={event.id} event={event} follow={following.has(event.id)} onFollow={onFollow} />)}</div>)}</div>;
}

function PostMedia({ post }) {
  const [galleryIndex, setGalleryIndex] = useState(null);
  const photos = post.photos || [];
  return <>{photos.length ? <div className={`post-photo-grid count-${Math.min(photos.length, 4)}`}>{photos.map((photo, index) => <button className="media-expand-button" type="button" onClick={() => setGalleryIndex(index)} key={photo.url || index} aria-label={`Open media ${index + 1}`}><img src={photo.url} alt={`Post media ${index + 1}`} loading="lazy" /></button>)}</div> : null}{galleryIndex != null ? <div className="modal-overlay media-gallery" role="dialog" aria-modal="true" aria-label="Media gallery" onMouseDown={() => setGalleryIndex(null)}><div className="media-gallery-frame" onMouseDown={(item) => item.stopPropagation()}><button className="modal-close" type="button" onClick={() => setGalleryIndex(null)} aria-label="Close media">×</button><img src={photos[galleryIndex]?.url} alt="" /></div></div> : null}{post.video?.url ? <video className="post-video" src={post.video.url} poster={post.video.thumbnailUrl || undefined} controls preload="metadata" /> : null}{post.link?.url ? <a className="glass card embedded-post" href={post.link.url} target="_blank" rel="noreferrer"><strong>{post.link.title || 'Attached link'}</strong><p>{post.link.url}</p></a> : null}{post.poll?.options?.length ? <div className="glass card poll-card"><strong>{post.poll.question || 'Poll'}</strong>{post.poll.options.map((option) => <span className="poll-option" key={option.id || option.text}>{option.text}</span>)}</div> : null}{post.topics?.length ? <div className="topic-row">{post.topics.map((topic) => <span className="source-chip" key={topic}>#{topic}</span>)}</div> : null}{post.location ? <span className="source-chip">Location: {post.location}</span> : null}</>;
}

function PostCard({ post, currentUser, echoed, liked, bookmarked, onEcho = () => {}, onQuote = () => {}, onLike = () => {}, onBookmark = () => {}, onReply = () => {}, onView = () => {}, onDelete = () => {} }) {
  const cardRef = useRef(null); const viewTimer = useRef(null); const viewSent = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false); const [replyOpen, setReplyOpen] = useState(false); const [ownerMenuOpen, setOwnerMenuOpen] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const [deleting, setDeleting] = useState(false); const [creatorProfile, setCreatorProfile] = useState(null); const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 }); const author = post.authorHandle || post.handle || 'portal member'; const name = post.authorDisplayName || post.displayName || author; const authorUid = post.authorUid || post.createdBy; const postUrl = `${window.location.origin}/#/posts/${post.id}`; const isOwner = Boolean(currentUser?.uid && authorUid === currentUser.uid);
  useEffect(() => { let active = true; if (!authorUid) return undefined; getPortalPublicProfiles([authorUid]).then((profiles) => { if (active) setCreatorProfile(profiles[authorUid] || null); }).catch(() => {}); return () => { active = false; }; }, [authorUid]);
  const supportEligible = post.supportEligible === true || post.creatorSupportEligible === true || creatorProfile?.supportEligible === true || creatorProfile?.supportEnabled === true || creatorProfile?.tipsEnabled === true;
  const supportUrl = post.supportUrl || post.supportLink || creatorProfile?.supportUrl || creatorProfile?.supportLink || creatorProfile?.tipUrl || '';
  const supportReady = supportEligible && /^(https?:\/\/|#\/)/i.test(supportUrl);
  useEffect(() => {
    if (!post.id || viewSent.current || typeof IntersectionObserver === 'undefined') return undefined;
    const clearViewTimer = () => { if (viewTimer.current) { clearTimeout(viewTimer.current); viewTimer.current = null; } };
    const observer = new IntersectionObserver(([entry]) => {
      if (viewSent.current) return;
      clearViewTimer();
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
        viewTimer.current = setTimeout(() => {
          if (document.visibilityState !== 'visible' || viewSent.current) return;
          viewSent.current = true;
          onView(post.id);
        }, 2000);
      }
    }, { threshold: [0, 0.5, 0.75, 1] });
    observer.observe(cardRef.current);
    const visibility = () => { if (document.visibilityState !== 'visible') clearViewTimer(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearViewTimer(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [post.id, onView]);
  useEffect(() => {
    if (!menuOpen && !ownerMenuOpen && !confirmDelete) return undefined;
    const close = (event) => { if (event.key === 'Escape') { setMenuOpen(false); setOwnerMenuOpen(false); setConfirmDelete(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen, ownerMenuOpen, confirmDelete]);
  function openMenu(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 332) });
    setMenuOpen(true); setOwnerMenuOpen(false);
  }
  function openOwnerMenu(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 8, left: Math.min(rect.left - 235, window.innerWidth - 276) });
    setOwnerMenuOpen(true); setMenuOpen(false);
  }
  async function share() {
    try { if (navigator.share) await navigator.share({ title: 'Portal Post', text: post.body || post.text || post.content || '', url: postUrl }); else await navigator.clipboard.writeText(postUrl); } catch { /* sharing can be cancelled */ }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(postUrl); } catch { /* copy can fail */ } }
  async function confirmDeletePost() {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(post); setConfirmDelete(false); }
    finally { setDeleting(false); }
  }
  return <article className="glass card post-card" ref={cardRef}><div className="post-meta"><a href={publicProfileRoute(author)}><Avatar size="sm">{initials(name)}</Avatar></a><div><a href={publicProfileRoute(author)}><strong>{name}</strong></a><a href={publicProfileRoute(author)}>@{author}</a></div><a className="post-time" href={`#/posts/${post.id}`} title={exactTime(post.publishedAt || post.createdAt)}>{relativeTime(post.publishedAt || post.createdAt)}</a>{isOwner ? <button className="icon-button post-overflow" type="button" aria-label="Post options" aria-haspopup="menu" aria-expanded={ownerMenuOpen} onClick={openOwnerMenu}>•••</button> : null}</div>{post.echoedByHandle ? <p className="echo-context">⟳ <a href={publicProfileRoute(post.echoedByHandle)}>@{post.echoedByHandle}</a></p> : null}<a className="post-body post-link" href={`#/posts/${post.id}`}>{post.body || post.text || post.content}</a><PostMedia post={post} /><div className="post-view-count" aria-label={viewCountLabel(post.viewCount)}><ActionIcon name="view" /><span>{viewCountLabel(post.viewCount)}</span></div><div className="interaction-bar" aria-label="Post interactions"><button className={`interaction-icon ${liked ? 'active like-active' : ''}`} type="button" onClick={() => onLike(post.id)} aria-label={liked ? 'Remove Love' : 'Love'} aria-pressed={liked}><ActionIcon name="like" filled={liked} /><span className="interaction-label">Love</span><span className="interaction-count">{post.likeCount || 0}</span></button><button className="interaction-icon" type="button" onClick={() => setReplyOpen((open) => !open)} aria-label="Comment" aria-expanded={replyOpen}><ActionIcon name="reply" /><span className="interaction-label">Comment</span><span className="interaction-count">{post.replyCount || 0}</span></button><button className={`interaction-icon ${echoed ? 'active' : ''}`} type="button" onClick={openMenu} aria-label="Echo" aria-haspopup="menu" aria-expanded={menuOpen}><ActionIcon name="echo" /><span className="interaction-label">Echo</span><span className="interaction-count">{post.echoCount || 0}</span></button>{menuOpen ? <><button className="popover-dismiss" type="button" aria-label="Close Echo menu" onClick={() => setMenuOpen(false)} /><div className="repost-menu glass floating-popover" role="menu" style={{ top: menuPosition.top, left: menuPosition.left }}><button type="button" role="menuitem" onClick={() => { onEcho(post.id, true); setMenuOpen(false); }}><strong>Echo</strong><span>Re-share to your followers.</span></button><button type="button" role="menuitem" onClick={() => { onQuote(post); setMenuOpen(false); }}><strong>Echo with comment</strong><span>Add your own thoughts.</span></button><button type="button" role="menuitem" onClick={() => { onQuote(post); setMenuOpen(false); }}><strong>Quote</strong><span>Quote the post in a new post.</span></button><button type="button" role="menuitem" onClick={() => setMenuOpen(false)}><strong>Cancel</strong></button></div></> : null}<a className={`interaction-icon support-action ${supportReady ? 'active' : 'disabled'}`} href={supportReady ? supportUrl : undefined} target={supportReady && /^https?:/i.test(supportUrl) ? '_blank' : undefined} rel={supportReady && /^https?:/i.test(supportUrl) ? 'noreferrer' : undefined} aria-disabled={!supportReady} title={supportReady ? `Support ${name}` : supportEligible ? 'Support setup is not available yet.' : 'This creator is not currently eligible to receive support.'} onClick={(event) => { if (!supportReady) event.preventDefault(); }}><ActionIcon name="support" /><span className="interaction-label">Support</span></a><button className={`interaction-icon ${bookmarked ? 'active' : ''}`} type="button" onClick={() => onBookmark(post.id)} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'} aria-pressed={bookmarked}><ActionIcon name="bookmark" filled={bookmarked} /><span className="interaction-label">Bookmark</span></button><button className="interaction-icon" type="button" onClick={share} aria-label="Share"><ActionIcon name="share" /><span className="interaction-label">Share</span></button></div>{ownerMenuOpen ? <><button className="popover-dismiss" type="button" aria-label="Close post options" onClick={() => setOwnerMenuOpen(false)} /><div className="repost-menu glass floating-popover post-owner-menu" role="menu" style={{ top: menuPosition.top, left: menuPosition.left }}><button type="button" role="menuitem" onClick={() => setOwnerMenuOpen(false)}><strong>Edit post</strong><span>Editing Posts is coming soon.</span></button><button className="danger-menu-item" type="button" role="menuitem" onClick={() => { setOwnerMenuOpen(false); setConfirmDelete(true); }}><strong>Delete post</strong><span>Remove this Post from Portal.</span></button><button type="button" role="menuitem" onClick={() => { copyLink(); setOwnerMenuOpen(false); }}><strong>Copy link</strong><span>Copy this Post URL.</span></button><button type="button" role="menuitem" disabled><strong>Pin to profile</strong><span>Coming soon.</span></button></div></> : null}{confirmDelete ? <div className="modal-overlay delete-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby={`deletePostTitle-${post.id}`} onMouseDown={() => !deleting && setConfirmDelete(false)}><div className="modal form-modal delete-confirm-sheet" onMouseDown={(event) => event.stopPropagation()}><h2 id={`deletePostTitle-${post.id}`} className="display-md">Delete this post?</h2><p className="body-sm">This action cannot be undone.</p><div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button><button className="btn btn-danger" type="button" onClick={confirmDeletePost} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button></div></div></div> : null}{replyOpen ? <div className="inline-reply-thread glass"><span className="body-sm">Reply thread</span><button className="btn btn-secondary btn-sm" type="button" onClick={() => onReply(post)}>Open conversation</button></div> : null}</article>;
}

function QuoteEchoComposer({ post, onClose, onSubmit, busy }) {
  const [quoteText, setQuoteText] = useState('');
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="quoteEchoTitle"><div className="modal form-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2 id="quoteEchoTitle">Quote Echo</h2><p className="body-sm">Add your perspective without losing the original Post.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button></div><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(quoteText); }}><textarea value={quoteText} onChange={(event) => setQuoteText(event.target.value)} maxLength="1000" placeholder="What do you make of this?" required /><a className="glass card embedded-post quoted-source" href={`#/posts/${post.id}`}><strong>{post.authorDisplayName || `@${post.authorHandle || post.handle || 'portal member'}`}</strong><span>@{post.authorHandle || post.handle || 'portal member'}</span><p>{post.body || post.text || post.content}</p><PostMedia post={post} /></a><div className="form-actions"><button className="btn btn-primary" disabled={busy || !quoteText.trim()}>{busy ? 'Publishing...' : 'Publish Quote Echo'}</button><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button></div></form></div></div>;
}

function Bookmarks({ posts, bookmarkedPostIds, user, echoedPostIds, likedPostIds, onEcho, onQuote, onLike, onBookmark, onReply, onView, onDelete }) {
  const [search, setSearch] = useState('');
  const savedPosts = posts.filter((post) => bookmarkedPostIds.has(post.id)).filter((post) => `${post.body || ''} ${post.authorDisplayName || ''} ${post.authorHandle || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => timestampMillis(b.publishedAt || b.createdAt) - timestampMillis(a.publishedAt || a.createdAt));
  return <div className="page bookmarks-page"><div><h1 className="display-xl">Bookmarks</h1><p className="body-md">Your private saved places across Portal.</p></div><label className="field bookmark-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bookmarks" /></label><Section title="Saved Posts"><div className="stack">{savedPosts.length ? savedPosts.map((post) => <PostCard key={post.id} post={post} currentUser={user} echoed={echoedPostIds.has(post.id)} liked={likedPostIds.has(post.id)} bookmarked onEcho={onEcho} onQuote={onQuote} onLike={onLike} onBookmark={onBookmark} onReply={onReply} onView={onView} onDelete={onDelete} />) : <div className="glass card compact-empty"><p className="body-sm">{search ? 'No saved Posts match your search.' : 'Posts you bookmark will appear here, newest first.'}</p></div>}</div></Section><div className="bookmark-secondary-grid"><Section title="Saved Events"><div className="glass card compact-empty"><p className="body-sm">Saved Events will appear here when Event bookmarks are available.</p></div></Section><Section title="Saved Creators"><div className="glass card compact-empty"><p className="body-sm">Saved creators will appear here when creator bookmarks are available.</p></div></Section></div></div>;
}

function Home({ user, posts, echoedPostIds, likedPostIds, bookmarkedPostIds, onEcho, onQuote, onLike, onBookmark, onReply, onView, onDelete, onCreatePost }) {
  const recentPosts = posts.slice(0, 8);
  const suggestedCreators = [...new Map(posts.map((post) => [post.authorUid || post.createdBy || post.authorHandle, post])).values()].filter(Boolean).slice(0, 4);
  return <div className="page home-page"><div className="welcome-head"><div><h1 className="display-xl">Humanity&apos;s living memory</h1><p className="body-md">Posts, Reports and creator activity from people you follow.</p></div><button className="btn btn-primary" type="button" onClick={onCreatePost}>Post</button></div><div className="home-layout"><section className="home-timeline"><Section title="Your timeline"><div className="stack home-feed">{recentPosts.length ? recentPosts.map((post) => <PostCard key={post.id} post={post} currentUser={user} echoed={echoedPostIds.has(post.id)} liked={likedPostIds.has(post.id)} bookmarked={bookmarkedPostIds.has(post.id)} onEcho={onEcho} onQuote={onQuote} onLike={onLike} onBookmark={onBookmark} onReply={onReply} onView={onView} onDelete={onDelete} />) : <div className="glass card empty-state compact-empty"><h2 className="display-md">Your timeline is quiet</h2><p className="body-sm">Post or follow creators.</p><button className="btn btn-primary btn-sm" type="button" onClick={onCreatePost}>Post</button></div>}</div></Section><Section title="Recent Reports"><div className="glass card empty-state compact-empty"><h2 className="display-md">No Reports yet</h2><p className="body-sm">Reports from followed creators and sources will appear here.</p></div></Section></section><aside className="home-widgets" aria-label="Creator activity"><Section title="Suggested creators">{suggestedCreators.length ? <div className="creator-grid">{suggestedCreators.map((post) => { const name = post.authorDisplayName || post.authorHandle || 'Portal member'; const creatorHandle = post.authorHandle || post.handle || 'portal'; return <article className="glass card creator-card" key={post.authorUid || post.createdBy || post.authorHandle || post.id}><a href={publicProfileRoute(creatorHandle)}><Avatar size="sm">{initials(name)}</Avatar></a><div><a href={publicProfileRoute(creatorHandle)}><strong>{name}</strong></a><a className="body-sm" href={publicProfileRoute(creatorHandle)}>@{creatorHandle}</a></div><a className="btn btn-secondary btn-sm" href="#/vortex">Follow</a></article>; })}</div> : <div className="glass card empty-state compact-empty"><h2 className="display-md">No creator suggestions yet</h2><p className="body-sm">Suggestions appear when public creator activity exists.</p></div>}</Section><Section title="Creator activity"><div className="glass card empty-state compact-empty"><h2 className="display-md">Nothing new</h2><p className="body-sm">Fresh Posts and Reports from followed creators collect here.</p></div></Section></aside></div></div>;
}

function PostComposer({ onClose, onSubmit, busy, user }) {
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [videoDuration, setVideoDuration] = useState('');
  const [link, setLink] = useState({ url: '', title: '' });
  const [poll, setPoll] = useState({ question: '', options: ['', ''] });
  const [draftSaved, setDraftSaved] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [topics] = useState('');
  const [location, setLocation] = useState('');
  const [visibility] = useState('public');
  const [activePanel, setActivePanel] = useState('');
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const photoPreviews = useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);
  useEffect(() => () => photoPreviews.forEach((item) => URL.revokeObjectURL(item.url)), [photoPreviews]);
  function addPhotos(files) {
    const next = [...photos, ...Array.from(files || []).filter((file) => file.type.startsWith('image/'))].slice(0, 10);
    setPhotos(next); setError(next.length ? '' : 'Choose image files only.');
  }
  function movePhoto(index, direction) {
    const next = [...photos]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setPhotos(next);
  }
  function pickVideo(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Choose a video file.'); return; }
    setVideo(file); setError('');
    const element = document.createElement('video');
    element.preload = 'metadata'; element.onloadedmetadata = () => setVideoDuration(`${Math.round(element.duration)}s`); element.src = URL.createObjectURL(file);
  }
  function pickMediaFiles(files) {
    const selected = Array.from(files || []);
    addPhotos(selected.filter((file) => file.type.startsWith('image/')));
    const movie = selected.find((file) => file.type.startsWith('video/'));
    if (movie) pickVideo(movie);
  }
  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) { setError('Write something before publishing.'); return; }
    setError('');
    try {
      const draftId = crypto.randomUUID();
      const uploaded = await uploadPortalPostMedia(user, draftId, { photos, video }, (kind, amount) => setProgress((current) => ({ ...current, [kind]: amount })));
      await onSubmit({
        body,
        photos: uploaded.photos,
        video: uploaded.video ? { ...uploaded.video, duration: Number.parseInt(videoDuration, 10) || 0 } : null,
        link: link.url.trim() ? link : null,
        poll: poll.question.trim() && poll.options.filter((item) => item.trim()).length >= 2 ? poll : null,
        topics: topics.split(',').map((item) => item.trim()).filter(Boolean),
        location: location.trim() || null,
        visibility,
      });
    } catch (reason) { setError(firebaseMessage(reason)); }
  }
  function linkHostPreview() {
    if (!link.url) return 'Title appears here';
    try { return new URL(link.url.startsWith('http') ? link.url : `https://${link.url}`).hostname || 'Title appears here'; } catch { return link.url.replace(/^https?:\/\//, '').split('/')[0] || 'Title appears here'; }
  }
  function saveDraft() {
    try { window.localStorage.setItem('portalPostDraft', JSON.stringify({ body, link, poll, location, scheduledFor, savedAt: Date.now() })); setDraftSaved(true); } catch { setDraftSaved(false); }
  }
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="postComposerTitle"><div className="modal form-modal rich-post-modal polished-composer" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2 id="postComposerTitle">Start a conversation</h2><p className="body-sm">Share a thought, story, link or moment with Portal.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button></div><form className="composer-compact" onSubmit={submit}><textarea value={body} onChange={(event) => { setBody(event.target.value); setDraftSaved(false); }} maxLength="2000" placeholder="What do you want to share?" required /><input id="post-media-picker" type="file" accept="image/*,video/*" multiple hidden onChange={(event) => pickMediaFiles(event.target.files)} /><div className="composer-icon-row" aria-label="Post attachments"><button className={`composer-icon-btn ${photos.length || video ? 'active' : ''}`} type="button" onClick={() => document.getElementById('post-media-picker')?.click()} aria-label="Media">🖼</button><button className={`composer-icon-btn ${activePanel === 'link' ? 'active' : ''}`} type="button" onClick={() => setActivePanel(activePanel === 'link' ? '' : 'link')} aria-label="Link" aria-expanded={activePanel === 'link'}>🔗</button><button className={`composer-icon-btn ${activePanel === 'poll' ? 'active' : ''}`} type="button" onClick={() => setActivePanel(activePanel === 'poll' ? '' : 'poll')} aria-label="Poll" aria-expanded={activePanel === 'poll'}>📊</button><button className={`composer-icon-btn ${activePanel === 'location' ? 'active' : ''}`} type="button" onClick={() => setActivePanel(activePanel === 'location' ? '' : 'location')} aria-label="Location" aria-expanded={activePanel === 'location'}>📍</button><button className={`composer-icon-btn ${scheduleOpen ? 'active' : ''}`} type="button" onClick={() => setScheduleOpen(!scheduleOpen)} aria-label="Schedule" aria-expanded={scheduleOpen}>⏱</button></div>{photoPreviews.length ? <div className="composer-preview-grid compact-media-preview">{photoPreviews.map(({ file, url }, index) => <div className="composer-thumb" key={`${file.name}-${index}`}><img src={url} alt="" /><div><button type="button" onClick={() => movePhoto(index, -1)} aria-label="Move photo left">←</button><button type="button" onClick={() => movePhoto(index, 1)} aria-label="Move photo right">→</button><button type="button" onClick={() => setPhotos(photos.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove photo">×</button></div></div>)}</div> : null}{video ? <div className="glass card compact-empty video-preview"><strong>{video.name}</strong><span className="body-sm">{videoDuration || 'Duration loading'}{progress.video ? ` · Upload ${progress.video}%` : ''}</span><button className="btn btn-secondary btn-sm" type="button" onClick={() => setVideo(null)}>Remove video</button></div> : null}{activePanel === 'link' ? <section className="composer-panel glass" aria-label="Link options"><div className="form-grid"><label>URL<input value={link.url} onChange={(event) => setLink({ ...link, url: event.target.value })} type="url" placeholder="https://" /></label><label>Auto title preview<input value={link.title} onChange={(event) => setLink({ ...link, title: event.target.value })} placeholder={linkHostPreview()} maxLength="120" /></label></div></section> : null}{activePanel === 'poll' ? <section className="composer-panel glass" aria-label="Poll options"><label>Question<input value={poll.question} onChange={(event) => setPoll({ ...poll, question: event.target.value })} maxLength="160" /></label><div className="poll-options">{poll.options.map((option, index) => <input key={index} value={option} onChange={(event) => { const next = [...poll.options]; next[index] = event.target.value; setPoll({ ...poll, options: next }); }} placeholder={`Poll option ${index + 1}`} />)}{poll.options.length < 4 ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}>Add option</button> : null}</div></section> : null}{activePanel === 'location' ? <section className="composer-panel glass" aria-label="Location options"><label>Search location<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength="120" placeholder="Add a place if useful" /></label><div className="composer-panel-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => setLocation('Current location')}>Current location</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setLocation('')}>Remove location</button></div></section> : null}{scheduleOpen ? <section className="composer-panel glass" aria-label="Schedule options"><label>Schedule for<input value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} type="datetime-local" /></label><p className="body-sm">Scheduling is prepared in the composer; publishing still uses the current live post flow until backend scheduling is enabled.</p></section> : null}{previewOpen ? <section className="composer-panel glass post-publish-preview" aria-label="Post preview"><span className="eyebrow">Preview</span><p>{body}</p>{link.url ? <small>{link.title || linkHostPreview()}</small> : null}{location ? <small>{location}</small> : null}</section> : null}{Object.keys(progress).length ? <p className="body-sm">{Object.entries(progress).map(([key, value]) => `${key} ${value}%`).join(' · ')}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{draftSaved ? <p className="form-notice" role="status">Draft saved on this device.</p> : null}<div className="form-actions composer-submit-row"><button className="btn btn-primary" disabled={busy || !body.trim()}>{busy ? 'Publishing...' : 'Post'}</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setPreviewOpen(!previewOpen)} disabled={!body.trim()}>{previewOpen ? 'Hide preview' : 'Preview'}</button><button className="btn btn-secondary btn-sm" type="button" onClick={saveDraft} disabled={!body.trim()}>Save draft</button><button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button></div></form></div></div>;
}

function PostDetail({ postId, user, echoed, liked, bookmarked, onEcho, onQuote, onLike, onBookmark, onView, onDelete, onReplySubmit }) {
  const [post, setPost] = useState(null); const [replies, setReplies] = useState([]); const [replyText, setReplyText] = useState(''); const [replyBusy, setReplyBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { const stop = observePost(postId, (snapshot) => { setPost(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); setLoading(false); }, (reason) => { setError(firebaseMessage(reason)); setLoading(false); }); return stop; }, [postId]);
  useEffect(() => { const stop = observePostReplies(postId, (snapshot) => setReplies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [postId]);
  async function submitReply(event) {
    event.preventDefault();
    if (!replyText.trim() || replyBusy) return;
    setReplyBusy(true); setError('');
    try { await onReplySubmit(postId, replyText); setReplyText(''); } catch (reason) { setError(firebaseMessage(reason)); } finally { setReplyBusy(false); }
  }
  if (loading) return <Loading label="Opening Post..." />;
  if (error) return <ErrorState message={error} />;
  if (!post || post.deleted || post.visibility !== 'public') return <ErrorState message="This Post is unavailable." />;
  return <div className="page"><a className="see-all" href="#/">Back to Home</a><div><h1 className="display-xl">Post</h1><p className="body-md">Opened at {exactTime(post.publishedAt || post.createdAt)}.</p></div><PostCard post={post} currentUser={user} echoed={echoed} liked={liked} bookmarked={bookmarked} onEcho={onEcho} onQuote={onQuote} onLike={onLike} onBookmark={onBookmark} onView={onView} onDelete={onDelete} onReply={() => document.getElementById('replyComposer')?.focus()} /><Section title="Replies"><form className="glass card reply-composer" onSubmit={submitReply}><textarea id="replyComposer" value={replyText} onChange={(event) => setReplyText(event.target.value)} maxLength="1000" placeholder="Reply to this Post" /><div className="form-actions"><button className="btn btn-primary btn-sm" disabled={replyBusy || !replyText.trim()}>{replyBusy ? 'Replying...' : 'Reply'}</button></div></form><div className="reply-list">{replies.length ? replies.map((reply) => { const replyHandle = reply.authorHandle || 'portal'; const replyName = reply.authorDisplayName || replyHandle || 'Portal member'; return <article className="glass card reply-card" key={reply.id}><div className="post-meta"><a href={publicProfileRoute(replyHandle)}><Avatar size="sm">{initials(replyName)}</Avatar></a><div><a href={publicProfileRoute(replyHandle)}><strong>{replyName}</strong></a><a href={publicProfileRoute(replyHandle)}>@{replyHandle}</a></div><span className="post-time" title={exactTime(reply.createdAt)}>{relativeTime(reply.createdAt)}</span></div><p className="body-md">{reply.body}</p></article>; }) : <div className="glass card compact-empty"><p className="body-sm">No replies yet.</p></div>}</div></Section></div>;
}

function EventForm({ initial, events, onSubmit, onCancel, busy }) {
  const [values, setValues] = useState(initial || { title: '', description: '', summary: '', eventType: 'Community', status: 'Upcoming', reach: 'Random', location: '', venue: '', capacity: '', organiserName: '', registration: 'Open', automaticGps: false, date: '', time: '', endTime: '', visibility: 'public', parentEventId: '' });
  const [error, setError] = useState('');
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })); }
  function submit(event) { event.preventDefault(); if (values.title.trim().length < 3 || (values.description || values.summary || '').trim().length < 12) { setError('Say what is happening in a clear title and description.'); return; } onSubmit({ ...values, summary: values.summary || values.description }); }
  return <form className="form-stack event-create-form conversation-event-form" onSubmit={submit}><div className="event-question-card glass"><span className="eyebrow">Create an Event from a conversation</span><strong>What is happening, and why should people care?</strong></div><label>Title<input value={values.title} onChange={(event) => update('title', event.target.value)} maxLength="120" required placeholder="What is happening?" /></label><label>Why should people care?<textarea value={values.description || values.summary || ''} onChange={(event) => update('description', event.target.value)} maxLength="1000" required placeholder="Give the context, story or reason people should follow this." /></label><div className="form-grid"><label>Cover image<input type="file" accept="image/*" disabled title="Cover upload uses the existing Event media pipeline when enabled." /></label><label>Category<select value={values.eventType || values.category || 'Other'} onChange={(event) => { update('eventType', event.target.value); update('category', event.target.value); }}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label></div><div className="form-grid"><label>Who is it for?<input value={values.audience || ''} onChange={(event) => update('audience', event.target.value)} maxLength="140" placeholder="Community, creators, supporters, neighbours..." /></label><label>What should attendees expect?<input value={values.expectations || ''} onChange={(event) => update('expectations', event.target.value)} maxLength="180" placeholder="Discussion, meetup, performance, update..." /></label></div><div className="form-grid"><label>Venue<input value={values.venue || values.location || values.locationSummary || ''} onChange={(event) => { update('venue', event.target.value); update('location', event.target.value); }} maxLength="180" placeholder="Place, area or venue" /></label><label className="check-row"><input type="checkbox" checked={Boolean(values.automaticGps)} onChange={(event) => update('automaticGps', event.target.checked)} /> Automatic GPS</label></div><div className="form-grid"><label>Date<input type="date" value={values.date || ''} onChange={(event) => update('date', event.target.value)} /></label><label>Start time<input type="time" value={values.time || ''} onChange={(event) => update('time', event.target.value)} /></label><label>End time<input type="time" value={values.endTime || ''} onChange={(event) => update('endTime', event.target.value)} /></label></div><div className="form-grid"><label>Capacity<input type="number" min="1" value={values.capacity || ''} onChange={(event) => update('capacity', event.target.value)} placeholder="Optional" /></label><label>Registration<select value={values.registration || 'Open'} onChange={(event) => update('registration', event.target.value)}><option>Open</option><option>Approval required</option><option>Invite only</option><option>No registration</option></select></label><label>Visibility<select value={values.visibility || 'public'} onChange={(event) => update('visibility', event.target.value)}><option value="public">Public</option><option value="followers">Followers</option><option value="private">Private</option></select></label></div><div className="form-grid"><label>Organiser details<input value={values.organiserName || ''} onChange={(event) => update('organiserName', event.target.value)} maxLength="120" placeholder="Your name, group or community" /></label><label>Status<select value={values.status} onChange={(event) => update('status', event.target.value)}>{eventStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div><label>Original discussion<select value={values.parentEventId || ''} onChange={(event) => update('parentEventId', event.target.value)}><option value="">No linked discussion yet</option>{events.filter((event) => event.id !== initial?.id).map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}</select></label><p className="body-sm">Events stay connected to the conversations that inspired them. Vortex may cluster related activity without merging ownership or attribution.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Create event'}</button>{onCancel ? <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button> : null}</div></form>;
}

function Events({ user, eventState, onFollow, following, onCreate }) {
  const [filter, setFilter] = useState('Live'); const [region, setRegion] = useState('World'); const [category, setCategory] = useState('All');
  const now = Date.now();
  const filtered = eventState.events.filter((event) => region === 'World' || event.region === region || event.country === region || event.geographicScope === region || event.locationSummary === region).filter((event) => category === 'All' || event.category === category || event.eventType === category).filter((event) => {
    const status = event.archived ? 'Archived' : event.status;
    if (filter === 'Nearby') return true;
    if (filter === 'Live') return ['Live', 'Developing'].includes(status);
    if (filter === 'Breaking') return event.eventType === 'Breaking News' || status === 'Live';
    if (filter === 'Today') { const time = event.startTime?.toDate ? event.startTime.toDate().getTime() : event.createdAt?.toDate ? event.createdAt.toDate().getTime() : now; return Math.abs(now - time) < 24 * 60 * 60_000; }
    if (filter === 'Upcoming') return status === 'Upcoming';
    if (filter === 'Following') return following.has(event.id);
    if (filter === 'Trending') return Number(event.followerCount || 0) + Number(event.updateCount || 0) > 0;
    if (filter === 'Archived') return status === 'Archived' || status === 'Resolved';
    return true;
  });
  return <div className="page events-page events-canvas"><div className="events-atmosphere" aria-hidden="true" /><div className="welcome-head events-heading"><div><h1 className="display-xl">What is happening?</h1><p className="body-md">Portal Events is the world&apos;s timeline: incidents, culture, sport, weather, government, community and everything unfolding around us.</p></div><button type="button" className="btn btn-primary" onClick={onCreate}>Create event</button></div><div className="event-discovery-controls"><div><span className="eyebrow">Status</span><div className="chip-row">{['Nearby', 'Live', 'Breaking', 'Today', 'Upcoming', 'Following', 'Trending', 'Archived'].map((item) => <button type="button" className={`chip ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div><div><span className="eyebrow">Region</span><div className="chip-row">{eventRegions.map((item) => <button type="button" className={`chip ${region === item ? 'active' : ''}`} onClick={() => setRegion(item)} key={item}>{item}</button>)}</div></div><div><span className="eyebrow">Sector</span><div className="chip-row">{eventCategories.map((item) => <button type="button" className={`chip ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div></div></div><Section title="Happening now"><EventCollection events={filtered} loading={eventState.loading} error={eventState.error ? EVENTS_UNAVAILABLE_MESSAGE : ''} empty="Nothing matching this view yet" onFollow={onFollow} following={following} /></Section><p className="body-sm events-session">Signed in as {user.email}</p></div>;
}

function EventDetail({ eventId, user, events, onFollow, following }) {
  const [event, setEvent] = useState(null); const [reports, setReports] = useState([]); const [sources, setSources] = useState([]); const [contributions, setContributions] = useState([]); const [history, setHistory] = useState([]); const [timeline, setTimeline] = useState([]); const [activeTab, setActiveTab] = useState('Overview'); const [replayIndex, setReplayIndex] = useState(null); const [selectedReport, setSelectedReport] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [report, setReport] = useState({ body: '', sourceType: 'Eyewitness' }); const [contribution, setContribution] = useState({ type: 'Update', body: '' });
  useEffect(() => { const stop = observeEvent(eventId, (snapshot) => { setEvent(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); setLoading(false); }, (reason) => { setError(firebaseMessage(reason)); setLoading(false); }); return stop; }, [eventId]);
  useEffect(() => { const stop = observeReports(eventId, (snapshot) => setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  useEffect(() => { const stop = observeEventSources(eventId, (snapshot) => setSources(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  useEffect(() => { const stop = observeEventContributions(eventId, (snapshot) => setContributions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  useEffect(() => { const stop = observeEventStatusHistory(eventId, (snapshot) => setHistory(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  useEffect(() => { const stop = observeEventTimeline(eventId, (snapshot) => setTimeline(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); return stop; }, [eventId]);
  async function save(values) { setBusy(true); try { await updatePortalEvent(eventId, values); setEditing(false); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function archive() { if (!window.confirm('Archive this event? It will disappear from the live event list.')) return; setBusy(true); try { await archivePortalEvent(eventId); window.location.hash = '#/events'; } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function submitReport(item) { item.preventDefault(); if (report.body.trim().length < 12 || busy) return; setBusy(true); try { await createPortalReport(user, eventId, report); setReport({ body: '', sourceType: 'Eyewitness' }); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function submitContribution(item) { item.preventDefault(); if (contribution.body.trim().length < 3 || busy) return; setBusy(true); try { await submitPortalEventContribution(eventId, contribution.type, contribution.body); setContribution({ type: 'Update', body: '' }); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  if (loading) return <Loading label="Opening event..." />; if (error) return <ErrorState message={error} />; if (!event) return <ErrorState message="This event no longer exists or you do not have access to it." />;
  const owner = event.createdBy === user.uid;
  const cover = event.heroImageUrl || event.mediaPreview?.url || event.photos?.[0]?.url || '';
  const pulse = eventPulse(event);
  const eventAuthor = event.authorHandle || event.reporterHandle || event.hostName || event.createdByType || 'Portal contributor';
  const openReport = (item) => setSelectedReport(item);
  const replayEntries = replayIndex == null ? timeline : timeline.slice(0, replayIndex + 1); const replayEntry = replayIndex == null ? timeline[timeline.length - 1] : timeline[replayIndex];
  const tabEntries = activeTab === 'Timeline' ? timeline : activeTab === 'Reports' ? timeline.filter((item) => item.entryType === 'Report') : activeTab === 'Updates' ? timeline.filter((item) => item.entryType === 'Update') : activeTab === 'Signals' ? timeline.filter((item) => item.entryType === 'Signal') : activeTab === 'Conversation' ? timeline.filter((item) => ['Post', 'Quote Echo'].includes(item.entryType)) : activeTab === 'Evidence' ? timeline.filter((item) => ['Report', 'media', 'official_notice', 'structured_fact'].includes(item.entryType)) : timeline;
  return <div className="page"><a className="see-all" href="#/events">Back to events</a><div className={`glass card hero-event event-detail-hero ${event.status === 'Historic' ? 'historic-event' : ''}`} style={cover ? { backgroundImage: `linear-gradient(180deg, rgba(7,9,15,.20), rgba(7,9,15,.86)), url(${cover})` } : undefined}><div className="inline-meta"><span className={`event-status ${(event.status || '').toLowerCase()}`}>{event.status}</span>{event.confidenceLabel ? <span className="source-chip">{event.confidenceLabel}</span> : null}<span className="source-chip">{event.category || event.eventType || 'World'}</span>{event.verificationState === 'verified' ? <span className="source-chip">Verified</span> : null}</div><h1>{event.title}</h1><p className="body-md">{event.description || event.summary}</p><div className="hero-meta"><button className="btn btn-primary btn-sm" type="button" onClick={() => onFollow(event.id, !following)}>{following ? 'Following' : 'Follow event'}</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/#/events/${event.id}`).catch(() => {})}>Copy link</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => navigator.share ? navigator.share({ title: event.title, url: `${window.location.origin}/#/events/${event.id}` }).catch(() => {}) : navigator.clipboard?.writeText(`${window.location.origin}/#/events/${event.id}`).catch(() => {})}>Share</button><button className="btn btn-secondary btn-sm" type="button">Echo</button><button className="btn btn-secondary btn-sm" type="button">Quote Echo</button><button className="btn btn-secondary btn-sm" type="button">Reply</button><button className="btn btn-secondary btn-sm" type="button">Bookmark</button><button className="btn btn-secondary btn-sm" type="button">Report</button><button className="btn btn-secondary btn-sm" type="button" disabled>Support</button>{owner ? <><button className="btn btn-secondary btn-sm" type="button" onClick={() => setEditing(!editing)}>Edit</button><button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={archive}>Archive</button></> : null}</div><div className="metrics event-detail-metrics"><span>Author {eventAuthor}</span><span>Started {timeLabel(event.startTime || event.publishedAt || event.createdAt)}</span><span>Updated {timeLabel(event.lastMeaningfulUpdateAt || event.updatedAt)}</span><span>Region {event.region || event.locationSummary || event.primaryLocation || 'World'}</span><span>Category {event.category || event.eventType || 'Other'}</span><span>Pulse Strength {pulse}</span><span>{event.contributorCount || contributions.length} contributors</span><span>{event.followerCount || event.interestedCount || 0} followers</span></div></div>{editing ? <section className="glass card"><h2 className="display-md">Edit event</h2><EventForm initial={event} events={events} onSubmit={save} onCancel={() => setEditing(false)} busy={busy} /></section> : null}<Section title={event.status === 'Historic' ? 'Historical replay' : 'Live chronology'}><div className="glass card replay-panel"><div className="form-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => setReplayIndex(0)} disabled={!timeline.length}>Start</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setReplayIndex((current) => Math.max(0, (current ?? timeline.length - 1) - 1))} disabled={!timeline.length}>Previous update</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setReplayIndex((current) => Math.min(timeline.length - 1, (current ?? timeline.length - 1) + 1))} disabled={!timeline.length}>Next update</button><button className="btn btn-primary btn-sm" type="button" onClick={() => setReplayIndex(null)}>Final outcome</button></div><p className="body-sm">{replayEntry ? `Viewing ${replayEntries.length} of ${timeline.length} entries. Happened ${timeLabel(replayEntry.eventTimestamp)} · Added to Portal ${timeLabel(replayEntry.ingestionTimestamp || replayEntry.createdAt)}.` : 'No canonical timeline entries yet.'}</p></div></Section><Section title="Add to this Event"><form className="form-stack glass card" onSubmit={submitContribution}><label>Contribution type<select value={contribution.type} onChange={(item) => setContribution({ ...contribution, type: item.target.value })}>{['Update', 'Post', 'Signal', 'Report', 'Correction', 'Source'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Contribution<textarea value={contribution.body} onChange={(item) => setContribution({ ...contribution, body: item.target.value })} maxLength="2000" required /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Adding...' : 'Add to Event record'}</button></form></Section><Section title="Event record"><div className="tabs" role="tablist">{contributionTabs.map((item) => <button className={`tab ${activeTab === item ? 'active' : ''}`} role="tab" aria-selected={activeTab === item} onClick={() => setActiveTab(item)} key={item} type="button">{item}</button>)}</div>{activeTab === 'Overview' ? <div className="event-overview-grid"><div className="glass card"><h2 className="display-md">Final verified summary</h2><p className="body-sm">{event.finalSummary || event.summary}</p></div><div className="glass card"><h2 className="display-md">Current snapshot</h2><p className="body-sm">{event.currentSnapshot ? JSON.stringify(event.currentSnapshot) : 'No structured snapshot yet.'}</p></div><div className="glass card"><h2 className="display-md">Archive state</h2><p className="body-sm">{reports.length} reports · {history.length} status entries · {timeline.length} chronology entries.</p></div><div className="glass card"><h2 className="display-md">Vortex story graph</h2><p className="body-sm">This Event remains independent. Vortex can cluster it with related Events without merging ownership, media, comments or URL.</p><p className="body-sm">Original creator, timestamp, media, comments and URL stay attached to this Event.</p></div></div> : activeTab === 'Sources' ? <div className="stack">{sources.length ? sources.map((source) => <article className="glass card timeline-entry" key={source.id}><span className="source-chip">{source.provider}</span><strong>{source.title}</strong><p className="body-sm">{source.summary || 'Source no longer available'}</p>{source.sourceUrl ? <a className="see-all" href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : <span className="body-sm">Source no longer available</span>}</article>) : <div className="glass card empty-state"><p className="body-sm">No source records yet.</p></div>}</div> : activeTab === 'Contributors' ? <div className="stack">{contributions.length ? contributions.map((item) => <article className="glass card timeline-entry" key={item.id}><span className="source-chip">{item.contributionType}</span><strong>@{item.authorHandle || 'portal member'}</strong><p className="body-sm">{item.body}</p></article>) : <div className="glass card empty-state"><p className="body-sm">No contributors yet.</p></div>}</div> : activeTab === 'Related Events' ? <div className="stack"><div className="glass card story-graph-note"><strong>Clustered in Vortex, not merged.</strong><p className="body-sm">Each contributing Event keeps its original creator, timestamp, media, comments and URL. Open Vortex to follow the unified story graph.</p><a className="btn btn-secondary btn-sm" href="#/vortex">Open Vortex</a></div>{events.filter((item) => event.relatedEventIds?.includes(item.id) || event.storyGraphEventIds?.includes(item.id) || item.relatedEventIds?.includes(event.id) || item.storyGraphEventIds?.includes(event.id)).map((item) => <EventCard key={item.id} event={item} follow={false} onFollow={null} />)}</div> : <TimelineList entries={tabEntries} onOpenEntry={openReport} />}</Section><Section title="Reports"><form className="form-stack glass card" onSubmit={submitReport}><label>What happened?<textarea value={report.body} onChange={(item) => setReport({ ...report, body: item.target.value })} maxLength="2000" required /></label><label>Source type<select value={report.sourceType} onChange={(item) => setReport({ ...report, sourceType: item.target.value })}>{sourceTypes.map((source) => <option key={source}>{source}</option>)}</select></label><button className="btn btn-secondary" disabled={busy}>{busy ? 'Adding report...' : 'Add report'}</button></form><div className="stack">{reports.length ? reports.map((item) => <button className="glass card report-detail-card" type="button" onClick={() => openReport(item)} key={item.id}><span className="source-chip">{item.sourceType || 'Report'}</span><strong>{item.title || 'Member report'}</strong><p className="body-sm">{item.body}</p><span className="body-sm">Added {relativeTime(item.createdAt)}</span></button>) : <div className="glass card compact-empty"><p className="body-sm">No member Reports yet.</p></div>}</div></Section>{selectedReport ? <ReportDetailModal report={selectedReport} event={event} onClose={() => setSelectedReport(null)} /> : null}</div>;
}

function ReportDetailModal({ report, event, onClose }) {
  const body = report.body || report.content || report.summary || '';
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reportDetailTitle" onMouseDown={onClose}><div className="modal form-modal report-detail-modal" onMouseDown={(item) => item.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Report detail</span><h2 id="reportDetailTitle">{report.title || event.title}</h2></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button></div><div className="report-detail-body"><div className="inline-meta"><span className="source-chip">{report.sourceType || report.entryType || 'Report'}</span><span className="source-chip">{report.confidenceLabel || 'Emerging'}</span><span className="source-chip">{event.category || event.eventType || 'Event'}</span></div><p className="body-md">{body}</p>{report.photoUrl ? <img className="report-detail-media" src={report.photoUrl} alt="" /> : null}{report.videoUrl ? <video className="post-video" src={report.videoUrl} controls preload="metadata" /> : null}{report.link?.url ? <a className="glass card embedded-post" href={report.link.url} target="_blank" rel="noreferrer"><strong>{report.link.title || 'Attached link'}</strong><p>{report.link.url}</p></a> : null}<div className="metrics"><span>Author {report.authorHandle || report.handleSnapshot || report.createdBy || 'Portal member'}</span><span>Added {timeLabel(report.ingestionTimestamp || report.createdAt)}</span><span>Updated {timeLabel(report.updatedAt || report.createdAt)}</span><span>Region {event.region || event.locationSummary || 'World'}</span></div><div className="form-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/#/events/${event.id}`).catch(() => {})}>Copy link</button><button className="btn btn-secondary btn-sm" type="button">Reply</button><button className="btn btn-secondary btn-sm" type="button">Bookmark</button><button className="btn btn-secondary btn-sm" type="button">Report</button></div></div></div></div>;
}

function TimelineList({ entries, onOpenEntry = null }) {
  if (!entries.length) return <div className="glass card empty-state"><p className="body-sm">No entries in this view yet.</p></div>;
  return <div className="timeline canonical-timeline">{entries.map((entry) => { const openable = entry.entryType === 'Report' && onOpenEntry; const content = <><time>{timeLabel(entry.eventTimestamp || entry.createdAt)}</time><div><div className="inline-meta"><span className="source-chip">{entry.entryType}</span><span className="source-chip">{entry.confidenceLabel || 'Emerging'}</span>{entry.correctionTargetId ? <span className="source-chip">Correction</span> : null}</div><p className="body-sm">{entry.content || entry.summary || entry.body}</p><p className="body-sm">Added to Portal {timeLabel(entry.ingestionTimestamp || entry.createdAt)}{entry.handleSnapshot ? ` by @${entry.handleSnapshot}` : entry.source ? ` from ${entry.source}` : ''}</p>{entry.sourceAttribution?.sourceUrl ? <a className="see-all" href={entry.sourceAttribution.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}</div></>; return openable ? <button className="timeline-row timeline-entry report-timeline-button" type="button" onClick={() => onOpenEntry(entry)} key={entry.id || entry.entryId}>{content}</button> : <article className="timeline-row timeline-entry" key={entry.id || entry.entryId}>{content}</article>; })}</div>;
}

function Vortex({ entries, loading, error, following, onFollow }) {
  const [term, setTerm] = useState(''); const [tab, setTab] = useState('All'); const [people, setPeople] = useState([]); const [peopleError, setPeopleError] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => { try { return JSON.parse(window.localStorage.getItem('portalRecentSearches') || '[]'); } catch { return []; } });
  useEffect(() => { const value = term.trim(); if (!value || (tab !== 'People' && !value.startsWith('@'))) { setPeople([]); return undefined; } const timer = window.setTimeout(async () => { try { const result = await searchPortalProfiles(value.replace(/^@/, '')); setPeople(Array.isArray(result) ? result : result.matches || []); setPeopleError(''); } catch (reason) { setPeopleError(firebaseMessage(reason)); } }, 250); return () => window.clearTimeout(timer); }, [term, tab]);
  function rememberSearch(value) { const clean = value.trim(); if (!clean) return; const next = [clean, ...recentSearches.filter((item) => item !== clean)].slice(0, 6); setRecentSearches(next); window.localStorage.setItem('portalRecentSearches', JSON.stringify(next)); }
  function updateTerm(value) { setTerm(value); }
  const haystack = (entry) => `${entry.title} ${entry.displaySummary} ${entry.entryType} ${entry.status || ''} ${entry.locationSummary || ''} ${entry.topic || ''} ${entry.category || ''} ${entry.sourceName || ''}`.toLowerCase();
  const results = entries.filter((entry) => haystack(entry).includes(term.toLowerCase().replace(/^@/, ''))).filter((entry) => tab === 'Following' ? entry.entryType === 'Event' && following.has(entry.sourceId) : tab === 'Live' ? entry.entryType === 'Event' && ['Breaking', 'Developing'].includes(entry.status) : tab === 'Historic' ? entry.entryType === 'Event' && entry.status === 'Historic' : tab === 'All' || tab === 'People' || (tab === 'Quote Echoes' ? entry.entryType === 'Quote Echo' : entry.entryType === tab.slice(0, -1)));
  const liveSuggestions = term.trim() ? results.slice(0, 5).map((entry) => entry.title || entry.displaySummary).filter(Boolean) : [];
  const trending = entries.slice(0, 6).map((entry) => entry.topic || entry.category || entry.title).filter(Boolean);
  return <div className="page vortex-page"><div><h1 className="display-xl">Vortex</h1><p className="body-md">Search people, Posts, Reports, Events, Signals, Sources, Topics, Places and Handles. Vortex clusters related Events into one developing story graph while every Event keeps its own creator, timestamp, media, comments and URL.</p></div><div className="vortex-orb-field" aria-hidden="true"><span className="label">Travel through humanity&apos;s knowledge</span></div><div className="vortex-search-wrap"><label className="glass field vortex-field"><Icon name="search" /><input value={term} onChange={(event) => updateTerm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') rememberSearch(term); }} type="search" placeholder="Search @handles, people, Posts, Reports, Events, Signals, Sources, topics or places..." /></label></div><div className="glass card vortex-suggestions"><div><span className="eyebrow">Live suggestions</span><div className="chip-row">{liveSuggestions.length ? liveSuggestions.map((item) => <button className="chip" type="button" onClick={() => { setTerm(item); rememberSearch(item); }} key={item}>{item}</button>) : <span className="body-sm">Start typing to surface Portal matches.</span>}</div></div><div><span className="eyebrow">Recent searches</span><div className="chip-row">{recentSearches.length ? recentSearches.map((item) => <button className="chip" type="button" onClick={() => setTerm(item)} key={item}>{item}</button>) : <span className="body-sm">No recent searches yet.</span>}</div></div><div><span className="eyebrow">Trending searches</span><div className="chip-row">{trending.length ? trending.map((item) => <button className="chip" type="button" onClick={() => { setTerm(item); rememberSearch(item); }} key={item}>{item}</button>) : <span className="body-sm">Trending appears when real Portal activity exists.</span>}</div></div></div><div className="tabs" role="tablist">{['All', 'People', 'Posts', 'Reports', 'Events', 'Signals', 'Sources', 'Topics', 'Places', 'Handles'].map((item) => <button className={`tab ${tab === item ? 'active' : ''}`} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} key={item} type="button">{item}</button>)}</div>{peopleError ? <p className="form-error">{peopleError}</p> : null}{(tab === 'People' || people.length > 0) && people.length ? <div className="stack vortex-feed">{people.map((person) => <a className="glass card interactive profile-option-row" href={publicProfileRoute(person.handle)} key={person.uid}><span><strong>{person.displayName || person.handle}</strong><span className="body-sm">@{person.handle} {person.bio ? `· ${person.bio}` : ''}</span></span>{person.verificationState === 'verified' ? <span className="source-chip">Verified</span> : null}</a>)}</div> : null}{loading ? <Loading label="Scanning the Vortex..." /> : error ? <ErrorState message="The Vortex is temporarily unavailable. Please try again shortly." /> : !results.length && !people.length ? <div className="glass card empty-state"><h2 className="display-md">The Vortex found nothing.</h2><p className="body-sm">Either it never happened or everyone is pretending.</p></div> : <div className="stack vortex-feed">{tab === 'People' ? null : results.map((entry) => <VortexEntry key={entry.entryId} entry={entry} following={following.has(entry.sourceId)} onFollow={onFollow} />)}</div>}</div>;
}

function storyEventIds(entry = {}) {
  return [...new Set([
    ...(Array.isArray(entry.storyGraphEventIds) ? entry.storyGraphEventIds : []),
    ...(Array.isArray(entry.contributingEventIds) ? entry.contributingEventIds : []),
    ...(Array.isArray(entry.relatedEventIds) ? entry.relatedEventIds : []),
    ...(Array.isArray(entry.eventIds) ? entry.eventIds : []),
    ...(Array.isArray(entry.sourceIds) ? entry.sourceIds : []),
    entry.entryType === 'Event' ? entry.sourceId : null,
    entry.parentEventId || null,
  ].filter(Boolean))];
}

function publicPulseValue(entry = {}) {
  return Math.max(0, Math.min(100, Math.round(Number(entry.pulseStrength ?? entry.relevanceScore ?? entry.activityScore ?? 0))));
}

function publicPulseLabel(value) {
  if (value >= 85) return 'Critical';
  if (value >= 65) return 'Strong';
  if (value >= 35) return 'Building';
  if (value > 0) return 'Emerging';
  return 'Forming';
}

function VortexEntry({ entry, following, onFollow }) {
  const eventEntry = entry.entryType === 'Event';
  const eventIds = storyEventIds(entry);
  const primaryEventId = eventEntry ? entry.sourceId : eventIds[0];
  const href = primaryEventId ? `#/events/${primaryEventId}` : null;
  const pulse = publicPulseValue(entry);
  const pulseLabel = publicPulseLabel(pulse);
  return <article className="glass card vortex-entry vortex-story-entry"><div className="inline-meta"><span className={`entry-type ${entry.entryType.toLowerCase()}`}>{entry.entryType}</span><span className="source-chip">Story graph</span>{entry.status ? <span className="source-chip">{entry.status}</span> : null}<span className="body-sm">Active {relativeTime(entry.latestActivityAt)}</span></div>{href ? <a href={href}><h2 className="display-md">{entry.title}</h2></a> : <h2 className="display-md">{entry.title}</h2>}<p className="body-sm">{entry.displaySummary}</p><div className="vortex-pulse"><div><span className="eyebrow">Pulse Strength</span><strong>Pulse {pulse || 'building'}</strong><span className="body-sm">{pulseLabel}</span></div><div className="vortex-pulse-bar" aria-label={`Pulse Strength ${pulse || 0} ${pulseLabel}`}><span style={{ width: `${pulse || 12}%` }} /></div></div><div className="metrics"><span>{eventIds.length || 1} contributing Events</span><span>{entry.contributionCount || 0} timeline items</span><span>{entry.reportCount || 0} reports</span><span>{entry.sourceCount || 0} official/source updates</span></div><div className="story-graph-note"><strong>Events are not merged.</strong><p className="body-sm">Vortex unifies timeline, discussion, media, official updates, related Events and live map while each Event keeps its original creator, timestamp, media, comments and URL.</p></div>{eventIds.length ? <div className="story-event-links" aria-label="Contributing Events">{eventIds.slice(0, 5).map((eventId) => <a className="source-chip" href={`#/events/${eventId}`} key={eventId}>Open Event</a>)}{eventIds.length > 5 ? <span className="body-sm">+{eventIds.length - 5} more</span> : null}</div> : null}<div className="vortex-map-strip"><span>Live map</span><span className="body-sm">{entry.locationSummary || 'World'}</span></div>{eventEntry ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => onFollow(entry.sourceId, !following)}>{following ? 'Following' : 'Follow event'}</button> : null}</article>;
}

function HandleMarketplace({ user, profile, handlePurchases = [], handleRequests = [], route }) {
  const initialHandle = normalizedQueryHandle(routeHandleQuery(route));
  const [handle, setHandle] = useState(initialHandle);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(initialHandle ? 'detail' : 'search');
  const [purchase, setPurchase] = useState(null);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [error, setError] = useState('');
  const [offer, setOffer] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const queryHandle = normalizedQueryHandle(routeHandleQuery(route));
    if (!queryHandle) return undefined;
    setHandle(queryHandle);
    let cancelled = false;
    setBusy(true); setError('');
    searchPortalHandleMarketplace(queryHandle).then((record) => {
      if (!cancelled) { setResult(record); setStep('detail'); }
    }).catch((reason) => !cancelled && setError(firebaseMessage(reason))).finally(() => !cancelled && setBusy(false));
    return () => { cancelled = true; };
  }, [route]);

  async function search(event) {
    event.preventDefault();
    const next = normalizedQueryHandle(handle);
    if (!next) return;
    setBusy(true); setError(''); setPaymentNotice(''); setPurchase(null);
    try {
      const record = await searchPortalHandleMarketplace(next);
      setResult(record); setStep('detail'); window.location.hash = `#/marketplace?handle=${next}`;
    } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  async function list() {
    setBusy(true); setError('');
    try { await createPortalHandleListing(result.handle.normalizedHandle, Number(price)); setResult(await searchPortalHandleMarketplace(result.handle.normalizedHandle)); }
    catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  async function makeOffer() { setBusy(true); setError(''); try { await submitPortalHandleOffer(result.listing.listingId, Number(offer)); setOffer(''); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function dispute() { setBusy(true); setError(''); try { await openPortalHandleDispute(result.listing.listingId); setResult(await searchPortalHandleMarketplace(result.handle.normalizedHandle)); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function startPurchase() {
    setBusy(true); setError('');
    try { setPurchase(await startPortalHandlePurchase(result.details.normalizedHandle)); setStep('review'); }
    catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  async function confirmPurchase() {
    setBusy(true); setError('');
    try { const confirmation = await confirmPortalHandlePurchase(purchase.purchaseId); setPaymentNotice(confirmation.message || 'Placeholder payment approved.'); setPurchase({ ...purchase, ...confirmation }); setStep('confirmation'); }
    catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  async function completePurchase() {
    setBusy(true); setError('');
    try { setPurchase({ ...purchase, ...(await completePortalHandlePurchase(purchase.purchaseId)) }); setStep('success'); }
    catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); }
  }
  async function changeToAvailableHandle() {
    const next = details?.normalizedHandle;
    if (!next || busy) return;
    setBusy(true); setError(''); setPaymentNotice('');
    try {
      const changed = await changePortalHandle(next);
      setPaymentNotice(`@${changed.handle || next} is now your Portal handle.`);
      setResult(await searchPortalHandleMarketplace(changed.handle || next));
    } catch (reason) {
      if (reason?.code === 'already-exists') setError('That handle was just taken. Please choose another.');
      else setError(firebaseMessage(reason));
    } finally { setBusy(false); }
  }

  const listing = result?.listing;
  const details = result?.details;
  const pricing = result?.pricing || {};
  const state = result?.state || details?.availability || 'Unavailable';
  const canPurchase = result && ['Available', 'Premium'].includes(state) && pricing.amountMinor != null && !listing;
  const isOwner = result?.handle?.ownerUid === user.uid || result?.handle?.uid === user.uid;
  const purchaseLabel = pricing.amountMinor == null ? 'Request pricing' : state === 'Premium' ? 'Review premium purchase' : 'Reserve';
  const latestActivity = [...handlePurchases, ...handleRequests].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 6);
  const activeHandle = profile?.normalizedHandle || profile?.handle || '';
  const currentRequest = latestActivity[0] || {};
  const currentLifecycleIndex = lifecycleIndex(currentRequest);

  return <div className="page marketplace-page"><div><h1 className="display-xl">Handle Marketplace</h1><p className="body-md">Reserve, discover and trade eligible Portal identities.</p></div><section className="glass card handle-account-card"><div><span className="eyebrow">Your handle</span><h2 className="display-lg">{activeHandle ? `@${activeHandle}` : 'Reserve your free handle'}</h2><p className="body-sm">{activeHandle ? 'Active status · Active user ownership' : 'Your first Portal handle is free when it passes safety and availability checks.'}</p></div><div className="handle-account-actions"><span className="source-chip">{activeHandle ? 'Free handle active' : 'Free handle eligible'}</span><a className="btn btn-secondary btn-sm" href="#/settings">{activeHandle ? 'Change handle' : 'Reserve free handle'}</a>{currentRequest.normalizedHandle ? <span className="source-chip">{requestLabel(currentRequest)}</span> : null}</div></section><section className="glass card lifecycle-card"><div className="section-header"><h2>Handle lifecycle</h2><span className="body-sm">{currentRequest.normalizedHandle ? `@${currentRequest.normalizedHandle}` : 'No active request'}</span></div><div className="lifecycle-steps">{handleLifecycleSteps.map((item, index) => <span className={`lifecycle-step ${index <= currentLifecycleIndex && currentRequest.normalizedHandle ? 'active' : ''}`} key={item}>{item}</span>)}</div></section><form className="glass card form-stack handle-search-card marketplace-search-panel" onSubmit={search}><label>Search handles<div className="handle-input"><span aria-hidden="true">@</span><input value={handle} onChange={(event) => setHandle(event.target.value.replace(/^@/, ''))} placeholder="Exact or partial handle search" autoCapitalize="none" autoCorrect="off" /></div></label><button className="btn btn-primary" disabled={busy || !handle.trim()}>{busy ? 'Searching...' : 'Search Marketplace'}</button></form>{error ? <div className="glass card compact-empty"><p className="form-error" role="alert">{error}</p><button className="btn btn-secondary btn-sm" type="button" onClick={() => handle && search({ preventDefault() {} })}>Retry</button></div> : null}{paymentNotice ? <p className="form-notice" role="status">{paymentNotice}</p> : null}{result?.suggestions?.length ? <section><div className="section-header"><h2>Suggestions</h2><span className="body-sm">Live marketplace and handle matches</span></div><div className="marketplace-grid">{result.suggestions.map((item) => <a className="glass card interactive listing-card" href={`#/marketplace?handle=${item.normalizedHandle}`} key={item.normalizedHandle}><span className={`state-badge state-${String(item.state).toLowerCase().replaceAll(' ', '-')}`}>{item.state}</span><strong>@{item.normalizedHandle}</strong><span className="body-sm">{item.category}</span>{item.askingPriceAmount ? <span className="body-sm">{formatMoney(item.askingPriceAmount, item.currency)}</span> : null}</a>)}</div></section> : result && !result.suggestions?.length && step === 'detail' ? <div className="glass card compact-empty"><p className="body-sm">No related marketplace listings found for this search.</p></div> : null}{step === 'search' && !result ? <div className="glass card empty-state"><h2 className="display-md">Find a Portal identity</h2><p className="body-sm">Search any handle to see availability, pricing, protection and marketplace status.</p></div> : null}{result && step === 'detail' ? <section className="glass card marketplace-card handle-detail-card"><div className="handle-detail-head"><div><span className={`state-badge state-${state.toLowerCase().replaceAll(' ', '-')}`}>{state}</span><h2 className="display-lg">@{details.normalizedHandle}</h2><p className="body-sm">{state === 'Protected' ? 'This handle is protected and is not available for sale.' : details.description}</p></div><div className="price-lockup"><span className="eyebrow">Price</span><strong>{formatMoney(pricing.amountMinor, pricing.currency)}</strong><span className="body-sm">{pricing.periodMonths ? `${pricing.periodMonths} month registration` : 'Marketplace terms'}</span></div></div><div className="handle-detail-grid"><div><span className="eyebrow">Availability</span><strong>{details.availability}</strong></div><div><span className="eyebrow">Category</span><strong>{details.category}</strong></div><div><span className="eyebrow">Registration period</span><strong>{details.registrationPeriodMonths ? `${details.registrationPeriodMonths} months` : 'Not available'}</strong></div><div><span className="eyebrow">Renewal price</span><strong>{formatMoney(details.renewalPriceMinor, details.currency)}</strong></div><div><span className="eyebrow">Transfer eligibility</span><strong>{details.transferEligibility}</strong></div><div><span className="eyebrow">Verification required</span><strong>{details.verificationRequired ? 'Yes' : 'No'}</strong></div></div>{details.developmentPaymentMode ? <div className="dev-payment-banner"><strong>Development Payment Mode</strong><span>No real payment has been taken.</span></div> : null}{state === 'Reserved' ? <p className="form-error">This handle is reserved and cannot be claimed.</p> : null}{state === 'Protected' ? <p className="form-error">This handle is protected and is not available for sale.</p> : null}{state === 'Coming Soon' ? <p className="form-notice">This handle category is coming soon.</p> : null}{state === 'Available' && activeHandle ? <p className="form-notice">Changing to this handle replaces your current free handle.</p> : null}{state === 'Owned' && !listing ? <p className="form-notice">{isOwner ? 'Your current Portal identity.' : 'This handle is owned. Owner details are hidden unless it is listed for sale.'}</p> : null}{listing ? <div className="listing-panel"><div className="metrics"><span>{listing.listingStatus}</span><span>{formatMoney(listing.askingPriceAmount, listing.currency)}</span><span>{listing.ownershipType}</span></div>{listing.ownershipType === 'user_owned' ? <p className="form-notice">Portal-managed checkout is being prepared. This handle cannot be transferred outside Portal.</p> : null}{listing.sellerUid !== user.uid && listing.listingStatus === 'active' ? <div className="form-actions"><input className="market-input" type="number" placeholder="Offer (minor units)" value={offer} onChange={(event) => setOffer(event.target.value)} /><button className="btn btn-secondary" type="button" disabled={busy || !offer} onClick={makeOffer}>Make offer</button></div> : null}{listing.sellerUid === user.uid && !listing.disputeState ? <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={dispute}>Open dispute</button> : null}</div> : null}{!listing && isOwner ? <div className="form-stack"><label>Seller listing price (minor units)<input type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button className="btn btn-secondary" type="button" disabled={busy || !price} onClick={list}>Create marketplace listing</button></div> : null}<div className="form-actions"><button className="btn btn-primary" type="button" disabled={busy || !canPurchase} onClick={startPurchase}>{purchaseLabel}</button>{state === 'Available' && activeHandle ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={changeToAvailableHandle}>{busy ? 'Changing...' : 'Change to this handle'}</button> : null}{state === 'Available' && !activeHandle ? <a className="btn btn-secondary" href="#/settings">Reserve free</a> : null}{listing && listing.listingStatus === 'active' ? <button className="btn btn-secondary" type="button" disabled>Buy now unavailable</button> : null}<a className="btn btn-secondary" href="#/profile">View Profile handles</a></div></section> : null}<section><div className="section-header"><h2>Your Requests</h2><span className="body-sm">Live review and purchase activity</span></div>{latestActivity.length ? <div className="stack request-list">{latestActivity.map((item) => <a className="glass card interactive profile-option-row" href={`#/marketplace?handle=${item.normalizedHandle}`} key={item.id || item.purchaseId || item.requestId}><span><strong>@{item.normalizedHandle}</strong><span className="body-sm">{requestLabel(item)} · {item.requestType || item.handleType || item.paymentProviderMode || 'handle request'}</span></span><span className="source-chip">{item.issuanceState || item.paymentStatus || item.approvalState || item.status}</span></a>)}</div> : <div className="glass card empty-state compact-empty"><h2 className="display-md">No handle requests yet</h2><p className="body-sm">Search the marketplace or reserve your free handle when you are ready.</p></div>}</section>{purchase && step === 'review' ? <section className="glass card marketplace-card"><span className="step-pill">Reserve → Review → Payment → Confirmation</span><h2 className="display-lg">Review @{result.details.normalizedHandle}</h2><div className="receipt-grid"><span>Handle</span><strong>@{result.details.normalizedHandle}</strong><span>Price</span><strong>{formatMoney(pricing.amountMinor, pricing.currency)}</strong><span>Renewal</span><strong>{formatMoney(pricing.renewalAmountMinor, pricing.currency)} / year</strong><span>Terms</span><strong>{pricing.periodMonths} month registration</strong><span>Refund policy</span><strong>Development purchases can be refunded by Portal support.</strong></div><div className="form-actions"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => setStep('payment')}>Continue</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setStep('detail')}>Cancel</button></div></section> : null}{purchase && step === 'payment' ? <section className="glass card marketplace-card payment-card"><div className="dev-payment-banner"><strong>Development Payment Mode</strong><span>No real payment has been taken.</span></div><h2 className="display-lg">Payment Provider</h2><p className="body-md">(Temporary Development Mode)</p><div className="payment-method-grid">{['Credit Card', 'Apple Pay', 'Google Pay', 'PayPal'].map((method) => <div className="glass card compact-empty payment-method" key={method}><strong>{method}</strong><span className="source-chip">Coming Soon</span></div>)}</div><button className="btn btn-primary" type="button" disabled={busy} onClick={confirmPurchase}>{busy ? 'Approving...' : 'Development Purchase'}</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setStep('review')}>Cancel payment</button></section> : null}{purchase && step === 'confirmation' ? <section className="glass card marketplace-card"><h2 className="display-lg">Placeholder payment approved.</h2><p className="body-sm">{paymentNotice}</p><div className="receipt-grid"><span>Purchase reference</span><strong>{purchase.purchaseId}</strong><span>Temporary payment token</span><strong>{purchase.temporaryPaymentToken ? 'Generated' : 'Pending'}</strong></div><button className="btn btn-primary" type="button" disabled={busy} onClick={completePurchase}>{busy ? 'Assigning...' : 'Complete purchase and assign handle'}</button></section> : null}{purchase && step === 'success' ? <section className="glass card marketplace-card success-card"><h2 className="display-lg">✓ Handle Reserved</h2><p className="profile-handle">@{purchase.handle || result.details.normalizedHandle}</p><div className="receipt-grid"><span>Purchase reference</span><strong>{purchase.purchaseId}</strong><span>Renewal date</span><strong>{purchase.renewalDate?.toDate ? purchase.renewalDate.toDate().toLocaleDateString() : 'One year from today'}</strong><span>Registration period</span><strong>{purchase.registrationPeriodMonths || pricing.periodMonths} months</strong></div><div className="form-actions"><a className="btn btn-primary" href="#/profile">Go to profile</a><a className="btn btn-secondary" href="#/">Go to Portal</a><a className="btn btn-secondary" href={publicProfileRoute(purchase.handle || result.details.normalizedHandle)}>Share profile</a></div></section> : null}</div>;
}

function HandleIdentity({ profile }) {
  const [handle, setHandle] = useState(profile?.handle || ''); const [state, setState] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setHandle(profile?.handle || ''); }, [profile?.handle]);
  useEffect(() => { const next = handle.trim(); if (!next || next.length < 3 || next === profile?.handle) { setState(''); return undefined; } setState('Checking'); const timer = window.setTimeout(async () => { try { const result = await checkPortalHandle(next); setState(result.available ? 'Available' : ({ taken: 'Already taken', reserved: 'Reserved', protected: 'Protected', invalid: 'Invalid' }[result.state] || 'Already taken')); } catch { setState('Temporarily unavailable'); } }, 350); return () => window.clearTimeout(timer); }, [handle, profile?.handle]);
  async function reserve(event) { event.preventDefault(); if (!handle.trim() || busy) return; setBusy(true); setNotice(''); try { const result = profile?.normalizedHandle ? await changePortalHandle(handle) : await reservePortalHandle(handle); setNotice(`@${result.handle} is yours.`); setState('Reserved'); } catch (reason) { setNotice(firebaseMessage(reason)); } finally { setBusy(false); } }
  return <section className="glass card"><h2 className="display-md">Portal identity</h2><p className="body-sm">This is how people will recognise, mention and find you across Portal.</p><form className="form-stack" onSubmit={reserve}><label>Handle<div className="handle-input"><span aria-hidden="true">@</span><input value={handle} onChange={(event) => setHandle(event.target.value.replace(/^@/, ''))} minLength="3" maxLength="24" autoCapitalize="none" autoCorrect="off" /></div></label>{state ? <p className={state === 'Available' || state === 'Reserved' ? 'form-notice' : 'form-error'} role="status">{state}</p> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<button className="btn btn-primary" disabled={busy || state === 'Already taken' || state === 'Reserved' || state === 'Protected' || state === 'Invalid' || state === 'Checking'}>{busy ? 'Reserving...' : profile?.normalizedHandle ? 'Change handle' : 'Reserve handle'}</button></form></section>;
}

function ProfileSetup({ user, profile }) {
  const [values, setValues] = useState({ displayName: profile?.displayName || user.displayName || '', handle: '', bio: profile?.bio || '', location: profile?.location || '', website: profile?.website || '' });
  const [photo, setPhoto] = useState(null); const [availability, setAvailability] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const isMobile = useIsMobileLayout();
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  useEffect(() => { const handle = values.handle.trim(); if (!handle) { setAvailability(''); return undefined; } setAvailability('Checking'); const timer = window.setTimeout(async () => { try { const result = await checkPortalHandle(handle); setAvailability(result.available ? 'Available' : ({ taken: 'Already taken', reserved: 'Reserved', protected: 'Protected', invalid: 'Invalid' }[result.state] || 'Already taken')); } catch { setAvailability('Temporarily unavailable'); } }, 400); return () => window.clearTimeout(timer); }, [values.handle]);
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })); }
  function selectPhoto(file) { if (!file) { setPhoto(null); return; } if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { setError('Choose an image file up to 10 MB.'); return; } setError(''); setPhoto(file); }
  function expandBio(event) { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }
  async function createProfile(event) {
    event.preventDefault(); if (busy) return;
    if (!values.displayName.trim()) { setError('Display name is required.'); return; }
    if (!values.handle.trim()) { setAvailability('Invalid'); setError('Choose your unique handle before creating your profile.'); return; }
    if (['Checking', 'Already taken', 'Reserved', 'Protected', 'Invalid', 'Temporarily unavailable'].includes(availability)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await reservePortalHandle(values.handle, { displayName: values.displayName.trim(), bio: values.bio.trim(), location: values.location.trim(), website: values.website.trim() });
      if (photo) { const profilePhotoUrl = await uploadPortalProfilePhoto(user, photo, setProgress); await updatePortalProfile(user, { profilePhotoUrl }); }
      setMessage('Profile created. Welcome properly to Portal.');
      window.location.hash = '#/settings';
    } catch (reason) {
      if (reason?.code === 'already-exists') { setAvailability('Already taken'); setError('That handle was just taken. Please choose another.'); } else setError(firebaseMessage(reason));
    } finally { setBusy(false); }
  }
  const blocked = busy || !values.handle.trim() || !values.displayName.trim() || availability !== 'Available';
  if (isMobile) return <div className="page mobile-profile-setup"><form className="mobile-profile-form glass" onSubmit={createProfile}><header className="mobile-profile-head"><span className="eyebrow">Portal profile</span><h1 className="display-lg">Create your Profile</h1><p className="body-sm">Choose how Portal remembers and introduces you.</p></header><div className="mobile-avatar-row"><button className="mobile-avatar-picker" type="button" onClick={() => document.getElementById('mobile-profile-photo-picker')?.click()} aria-label="Choose profile photo">{photoPreview ? <img src={photoPreview} alt="" /> : <Avatar size="lg">{initials(values.displayName || user.displayName)}</Avatar>}<span>Change photo</span></button><input id="mobile-profile-photo-picker" className="mobile-hidden-file" type="file" accept="image/*" onChange={(event) => selectPhoto(event.target.files?.[0])} />{photo ? <p className="body-sm">{photo.name}{progress ? ` · Upload ${progress}%` : ''}</p> : null}</div><div className="mobile-profile-fields"><label>Display name<input value={values.displayName} onChange={(event) => update('displayName', event.target.value)} required maxLength="80" /></label><label>Handle<div className="handle-input"><span aria-hidden="true">@</span><input value={values.handle} onChange={(event) => update('handle', event.target.value.replace(/^@/, ''))} placeholder={PROFILE_HANDLE_PLACEHOLDER} required minLength="3" maxLength="24" autoCapitalize="none" autoCorrect="off" /></div></label>{availability ? <p className={availability === 'Available' ? 'form-notice' : availability === 'Checking' ? 'form-status' : 'form-error'} role="status">{availability}</p> : null}<label>Bio<textarea value={values.bio} onChange={(event) => update('bio', event.target.value)} onInput={expandBio} rows="3" maxLength="240" /></label><label>Location<input value={values.location} onChange={(event) => update('location', event.target.value)} maxLength="120" /></label><label>Website<input value={values.website} onChange={(event) => update('website', event.target.value)} type="url" placeholder="https://" maxLength="200" /></label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="form-notice" role="status">{message}</p> : null}<div className="mobile-profile-save"><button className="btn btn-primary" disabled={blocked}>{busy ? 'Creating profile...' : 'Create Profile'}</button></div></form></div>;
  return <div className="page profile-setup"><div><h1 className="display-xl">Create your Profile</h1><p className="body-md">Choose how Portal remembers and introduces you.</p></div><section className="glass card"><form className="form-stack" onSubmit={createProfile}><label>Profile photo <input type="file" accept="image/*" onChange={(event) => selectPhoto(event.target.files?.[0])} /></label>{photo ? <p className="body-sm">{photo.name}{progress ? ` · Upload ${progress}%` : ''}</p> : null}<label>Display name<input value={values.displayName} onChange={(event) => update('displayName', event.target.value)} required maxLength="80" /></label><label>Handle<div className="handle-input"><span aria-hidden="true">@</span><input value={values.handle} onChange={(event) => update('handle', event.target.value.replace(/^@/, ''))} placeholder={PROFILE_HANDLE_PLACEHOLDER} required minLength="3" maxLength="24" autoCapitalize="none" autoCorrect="off" /></div></label>{availability ? <p className={availability === 'Available' ? 'form-notice' : availability === 'Checking' ? 'form-status' : 'form-error'} role="status">{availability}</p> : null}<label>Bio <textarea value={values.bio} onChange={(event) => update('bio', event.target.value)} maxLength="240" /></label><label>Location <input value={values.location} onChange={(event) => update('location', event.target.value)} maxLength="120" /></label><label>Website <input value={values.website} onChange={(event) => update('website', event.target.value)} type="url" placeholder="https://" maxLength="200" /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="form-notice" role="status">{message}</p> : null}<div className="form-actions"><button className="btn btn-primary" disabled={blocked}>{busy ? 'Creating profile...' : 'Create Profile'}</button><button className="btn btn-secondary" type="button" disabled={blocked} onClick={createProfile}>Reserve Handle</button></div></form></section></div>;
}

function ProfileEditModal({ user, profile, onClose, onSaved }) {
  const draftKey = `portal.profileDraft.${user.uid}`;
  const initialValues = { displayName: profile?.displayName || user.displayName || '', handle: profile?.normalizedHandle || profile?.handle || '', bio: profile?.bio || '', location: profile?.location || '', website: profile?.website || '', pronouns: profile?.pronouns || '', birthdayVisibility: profile?.birthdayVisibility || 'Private', profileVisibility: profile?.profileVisibility || 'Public' };
  const [values, setValues] = useState(() => { try { return { ...initialValues, ...JSON.parse(window.localStorage.getItem(draftKey) || '{}') }; } catch { return initialValues; } });
  const [files, setFiles] = useState({ profile: null, banner: null }); const [previews, setPreviews] = useState({ profile: profile?.profilePhotoUrl || '', banner: profile?.bannerUrl || '' }); const [progress, setProgress] = useState({}); const [availability, setAvailability] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const currentHandle = cleanHandle(profile?.normalizedHandle || profile?.handle || '');
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues) || Boolean(files.profile || files.banner);
  useEffect(() => { if (dirty) window.localStorage.setItem(draftKey, JSON.stringify(values)); }, [dirty, draftKey, values]);
  useEffect(() => { const next = cleanHandle(values.handle); if (!next || next === currentHandle) { setAvailability(''); return undefined; } setAvailability('Checking'); const timer = window.setTimeout(async () => { try { const result = await checkPortalHandle(next); setAvailability(result.available ? 'Available' : ({ taken: 'Already taken', reserved: 'Reserved', protected: 'Protected', invalid: 'Invalid' }[result.state] || 'Already taken')); } catch { setAvailability('Temporarily unavailable'); } }, 350); return () => window.clearTimeout(timer); }, [values.handle, currentHandle]);
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })); }
  function closeSafely() { if (dirty && !window.confirm('Discard unsaved profile changes?')) return; onClose(); }
  function pick(kind, file) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { setError('Choose an image file up to 10 MB.'); return; }
    setFiles((current) => ({ ...current, [kind]: file }));
    setPreviews((current) => ({ ...current, [kind]: URL.createObjectURL(file) }));
    setError('');
  }
  async function save(event) {
    event.preventDefault(); if (!dirty || busy) return;
    const nextHandle = cleanHandle(values.handle);
    if (nextHandle && nextHandle !== currentHandle && availability !== 'Available') { setError('Choose an available handle before saving.'); return; }
    setBusy(true); setError('');
    try {
      if (nextHandle && nextHandle !== currentHandle) {
        if (currentHandle) await changePortalHandle(nextHandle); else await reservePortalHandle(nextHandle);
      }
      const uploaded = {};
      if (files.profile) uploaded.profilePhotoUrl = await uploadPortalProfilePhoto(user, files.profile, (amount) => setProgress((current) => ({ ...current, profile: amount })), 'profile');
      if (files.banner) uploaded.bannerUrl = await uploadPortalProfilePhoto(user, files.banner, (amount) => setProgress((current) => ({ ...current, banner: amount })), 'banner');
      await updatePortalProfile(user, { displayName: values.displayName.trim(), bio: values.bio.trim(), location: values.location.trim(), website: values.website.trim(), pronouns: values.pronouns.trim(), birthdayVisibility: values.birthdayVisibility, profileVisibility: values.profileVisibility, ...uploaded });
      window.localStorage.removeItem(draftKey);
      onSaved?.('Profile updated');
      onClose();
    }
    catch (reason) { if (reason?.code === 'already-exists') setError('That handle was just taken. Please choose another.'); else setError(firebaseMessage(reason)); }
    finally { setBusy(false); }
  }
  const saveDisabled = busy || !dirty || !values.displayName.trim() || (cleanHandle(values.handle) !== currentHandle && availability !== 'Available');
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="editProfileTitle" onMouseDown={closeSafely}><div className="modal form-modal profile-edit-modal profile-edit-screen" onMouseDown={(event) => event.stopPropagation()}><form className="form-stack" onSubmit={save}><div className="profile-edit-sticky"><button className="modal-close" type="button" onClick={closeSafely} aria-label="Close">×</button><div><h2 id="editProfileTitle">Edit Profile</h2><p className="body-sm">Preview changes before saving them to Portal.</p></div><button className="btn btn-primary btn-sm" disabled={saveDisabled}>{busy ? 'Saving...' : 'Save'}</button></div><section className="glass card profile-live-preview" aria-label="Profile preview"><div className="profile-cover preview-cover" style={previews.banner ? { backgroundImage: `linear-gradient(180deg, rgba(7,9,15,.08), rgba(7,9,15,.48)), url(${previews.banner})` } : undefined} /><div className="profile-preview-row">{previews.profile ? <img className="profile-photo-lg" src={previews.profile} alt="" /> : <Avatar size="lg">{initials(values.displayName)}</Avatar>}<div><strong>{values.displayName || 'Display name'}</strong><p className="profile-handle">@{cleanHandle(values.handle) || 'handle'}</p><p className="body-sm">{values.bio || 'Your bio preview appears here.'}</p></div></div></section><div className="form-grid"><label>Photo<input type="file" accept="image/*" onChange={(event) => pick('profile', event.target.files?.[0])} /></label><label>Banner<input type="file" accept="image/*" onChange={(event) => pick('banner', event.target.files?.[0])} /></label></div>{Object.keys(progress).length ? <p className="body-sm">{Object.entries(progress).map(([key, value]) => `${key} ${value}%`).join(' · ')}</p> : null}<label>Display name<input value={values.displayName} onChange={(event) => update('displayName', event.target.value)} required maxLength="80" /></label><label>Handle<div className="handle-input"><span aria-hidden="true">@</span><input value={values.handle} onChange={(event) => update('handle', event.target.value.replace(/^@/, ''))} minLength="3" maxLength="24" autoCapitalize="none" autoCorrect="off" /></div></label>{availability ? <p className={availability === 'Available' ? 'form-notice' : availability === 'Checking' ? 'form-status' : 'form-error'} role="status">{availability}</p> : null}<label>Bio<textarea value={values.bio} onChange={(event) => update('bio', event.target.value)} maxLength="240" /></label><div className="form-grid"><label>Location<input value={values.location} onChange={(event) => update('location', event.target.value)} maxLength="120" /></label><label>Website<input value={values.website} onChange={(event) => update('website', event.target.value)} type="url" placeholder="https://" maxLength="200" /></label></div><label>Pronouns<input value={values.pronouns} onChange={(event) => update('pronouns', event.target.value)} maxLength="40" placeholder="Optional" /></label><div className="form-grid"><label>Birthday visibility<select value={values.birthdayVisibility} onChange={(event) => update('birthdayVisibility', event.target.value)}><option>Private</option><option>Month and day</option><option>Public</option></select></label><label>Profile visibility<select value={values.profileVisibility} onChange={(event) => update('profileVisibility', event.target.value)}><option>Public</option><option>Portal members</option><option>Private</option></select></label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button className="btn btn-secondary" type="button" onClick={closeSafely} disabled={busy}>Cancel</button></div></form></div></div>;
}

function PersonalProfile({ user, profile, posts, echoActivity, handlePurchases, echoedPostIds, likedPostIds, bookmarkedPostIds, onEcho, onQuote, onLike, onBookmark, onReply, onView, onDelete, onProfileSaved }) {
  const displayName = profile?.displayName || user.displayName || 'Portal member';
  const handle = profile?.normalizedHandle || profile?.handle || '';
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('Posts'); const ownedPosts = posts.filter((post) => post.authorUid === user.uid || post.createdBy === user.uid); const echoedPosts = echoActivity.map((echo) => { const source = posts.find((post) => post.id === echo.sourcePostId); return source ? { ...source, echoedByHandle: handle } : null; }).filter(Boolean); const activityPosts = tab === 'Media' ? ownedPosts.filter((post) => post.photos?.length || post.video?.url) : tab === 'Replies' ? [] : tab === 'Echoes' ? echoedPosts : ownedPosts;
  const issuedPurchases = handlePurchases.filter((item) => item.status === 'assigned' || item.issuanceState === 'issued');
  const pendingPurchases = handlePurchases.filter((item) => ['review', 'payment_approved', 'pending_review'].includes(item.status) || ['not_issued', 'pending_review'].includes(item.issuanceState));
  const profileStats = [['Followers', profile?.followerCount || 0], ['Following', profile?.followingCount || 0], ['Posts', profile?.postCount || ownedPosts.length], ['Echoes', profile?.echoCount || echoActivity.length], ['Events attended', profile?.eventsAttendedCount || profile?.eventCount || 0]];
  return <div className="page personal-profile"><div className="profile-cover" style={profile?.bannerUrl ? { backgroundImage: `linear-gradient(180deg, rgba(7,9,15,.08), rgba(7,9,15,.48)), url(${profile.bannerUrl})` } : undefined} aria-hidden="true" /><section className="glass card personal-profile-card">{profile?.profilePhotoUrl ? <img className="profile-photo-lg" src={profile.profilePhotoUrl} alt="" /> : <Avatar size="lg">{initials(displayName)}</Avatar>}<div className="personal-profile-main"><div><h1 className="display-xl">{displayName}</h1><p className="profile-handle">@{handle}</p>{profile?.verificationState === 'verified' ? <span className="source-chip">Verified</span> : null}{profile?.pronouns ? <p className="body-sm">{profile.pronouns}</p> : null}</div><div className="form-actions profile-quick-actions"><button className="btn btn-primary btn-sm" type="button" onClick={() => setEditing(true)}>Edit Profile</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => navigator.share ? navigator.share({ title: displayName, url: publicProfileUrl(handle) }).catch(() => {}) : navigator.clipboard?.writeText(publicProfileUrl(handle)).catch(() => {})}>Share Profile</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(publicProfileUrl(handle)).catch(() => {})}>Copy Profile Link</button><a className="btn btn-secondary btn-sm" href={publicProfileRoute(handle)}>View as Public</a></div></div>{profile?.bio ? <p className="body-md">{profile.bio}</p> : <p className="body-sm">Add a bio so people know which corner of humanity&apos;s memory you&apos;re building.</p>}<div className="profile-details">{profile?.location ? <span>{profile.location}</span> : null}{profile?.website ? <a href={profile.website} target="_blank" rel="noreferrer">{profile.website.replace(/^https?:\/\//, '')}</a> : null}<span>Joined {relativeTime(profile?.createdAt)}</span></div><div className="metrics profile-metrics">{profileStats.map(([label, value]) => <span key={label}><strong>{formatViewCount(value)}</strong> {label}</span>)}</div></section><Section title="Handles"><div className="profile-option-list handles-summary">{profile?.normalizedHandle ? <a className="glass card interactive profile-option-row" href={`#/marketplace?handle=${profile.normalizedHandle}`}><span><strong>@{profile.normalizedHandle}</strong><span className="body-sm">Active free handle · {profile.verificationState || 'unverified'}</span></span><span className="source-chip">Free</span></a> : null}{issuedPurchases.map((item) => <a className="glass card interactive profile-option-row" href={`#/marketplace?handle=${item.normalizedHandle}`} key={item.purchaseId || item.id}><span><strong>@{item.normalizedHandle}</strong><span className="body-sm">{item.status === 'rescinded' ? 'Rescinded' : 'Issued'} · Renewal {timeLabel(item.renewalDate)}</span></span><span className="source-chip">{item.handleType || 'Paid'}</span></a>)}{pendingPurchases.map((item) => <a className="glass card interactive profile-option-row" href={`#/marketplace?handle=${item.normalizedHandle}`} key={item.purchaseId || item.id}><span><strong>@{item.normalizedHandle}</strong><span className="body-sm">Pending review or assignment · {item.paymentStatus || item.status}</span></span><span className="source-chip">Pending</span></a>)}{!profile?.normalizedHandle && !issuedPurchases.length && !pendingPurchases.length ? <div className="glass card compact-empty"><p className="body-sm">No handles are currently associated with this account.</p><a className="btn btn-primary btn-sm" href="#/marketplace">Open Handle Marketplace</a></div> : null}</div></Section><Section title="Your activity"><div className="profile-tabs">{['Posts', 'Replies', 'Media'].map((item) => <button className={`profile-tab ${tab === item ? 'active' : ''}`} type="button" onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="stack">{activityPosts.length ? activityPosts.map((post) => <PostCard key={`${tab}-${post.id}`} post={post} currentUser={user} echoed={echoedPostIds.has(post.id)} liked={likedPostIds.has(post.id)} bookmarked={bookmarkedPostIds.has(post.id)} onEcho={onEcho} onQuote={onQuote} onLike={onLike} onBookmark={onBookmark} onReply={onReply} onView={onView} onDelete={onDelete} />) : <div className="glass card compact-empty"><p className="body-sm">No {tab.toLowerCase()} here yet.</p></div>}</div></Section><Section title="Account and profile options"><div className="profile-option-list"><a className="glass card interactive profile-option-row" href="#/settings"><span><strong>Settings</strong><span className="body-sm">Identity, preferences, password and safety.</span></span><span className="see-all">Open</span></a><a className="glass card interactive profile-option-row" href="#/memory"><span><strong>Portal+ Memory</strong><span className="body-sm">Private memory tools will live here as Portal+ expands.</span></span><span className="source-chip">Limited</span></a><a className="glass card interactive profile-option-row" href="#/contributors"><span><strong>Contributor Hub</strong><span className="body-sm">Creator tools, reporting activity and contributor context.</span></span><span className="source-chip">Limited</span></a></div></Section>{editing ? <ProfileEditModal user={user} profile={profile} onClose={() => setEditing(false)} onSaved={onProfileSaved} /> : null}</div>;
}

function FeaturePage({ title, description, children }) {
  return <div className="page"><div><h1 className="display-xl">{title}</h1><p className="body-md">{description}</p></div>{children || <div className="glass card empty-state compact-empty"><h2 className="display-md">Limited for now</h2><p className="body-sm">This destination is available from Profile while Portal keeps Home, Events and Vortex in front.</p></div>}</div>;
}

function notificationText(item) {
  const actor = notificationActorName(item);
  if (item.type === 'like' || item.type === 'reaction') return `${actor} liked your post.`;
  if (item.type === 'reply') return `${actor} replied to your post.`;
  if (item.type === 'quote_echo') return `${actor} quoted your post.`;
  if (item.type === 'echo') return `${actor} echoed your post.`;
  if (item.type === 'follow') return `${actor} followed you.`;
  if (item.type === 'mention') return `${actor} mentioned you.`;
  if (item.type === 'handle_approval') return 'Your handle was approved.';
  if (item.type === 'portal_notice') return item.summary || 'Portal notice.';
  if (item.type === 'event_update') return item.summary || 'An Event you follow changed meaningfully.';
  if (item.type === 'handle_reclaim') return 'A handle action needs your attention.';
  return 'Portal has an update for you.';
}

function notificationIcon(type) {
  return ({ like: '❤️', reply: '💬', echo: '🔁', quote_echo: '✍️', follow: '👤', mention: '📣', handle_approval: '✅', portal_notice: '🛡️' })[type] || '🔔';
}

function notificationActorName(item) {
  if (item.type === 'portal_notice') return 'Portal';
  return item.actorDisplayName || item.displayName || item.actorHandle || item.authorHandle || 'Portal member';
}

function notificationActorUid(item) { return item.actorUid || item.authorUid || item.echoingUid || item.quotingUid || item.followerUid || null; }

function Notifications({ user }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [filter, setFilter] = useState('All'); const [visible, setVisible] = useState(20); const [actorProfiles, setActorProfiles] = useState({});
  useEffect(() => { const stop = observePortalNotifications(user.uid, (snapshot) => { setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); setLoading(false); }, (reason) => { setError(firebaseMessage(reason)); setLoading(false); }); return stop; }, [user.uid]);
  useEffect(() => { let active = true; const actorUids = items.filter((item) => item.type !== 'portal_notice').map(notificationActorUid).filter(Boolean); if (!actorUids.length) { setActorProfiles({}); return undefined; } getPortalPublicProfiles(actorUids).then((profiles) => { if (active) setActorProfiles(profiles); }).catch(() => {}); return () => { active = false; }; }, [items]);
  async function open(item) { if (!item.read) { try { await markPortalNotificationRead(user.uid, item.id); } catch { /* read status can recover on the next refresh */ } } if (item.handle) window.location.hash = publicProfileRoute(item.handle).replace(/^#/, ''); else if (item.profileHandle) window.location.hash = publicProfileRoute(item.profileHandle).replace(/^#/, ''); else if (item.eventId) window.location.hash = `#/events/${item.eventId}`; else if (item.postId) window.location.hash = `#/posts/${item.postId}`; }
  const categories = ['All', 'Replies', 'Echoes', 'Mentions', 'Follows', 'Events', 'Official Sources', 'Verification'];
  const activeItems = items.filter((item) => item.archived !== true);
  const filtered = activeItems.filter((item) => {
    if (filter === 'All') return true;
    if (filter === 'Replies') return item.type === 'reply';
    if (filter === 'Echoes') return item.type === 'echo' || item.type === 'quote_echo';
    if (filter === 'Mentions') return item.type === 'mention' && (!item.mentionedUid || item.mentionedUid === user.uid) && (!item.targetUid || item.targetUid === user.uid);
    if (filter === 'Follows') return item.type === 'follow';
    if (filter === 'Events') return item.type === 'event_update' || item.eventId;
    if (filter === 'Official Sources') return item.type === 'official_source' || item.sourceId;
    if (filter === 'Verification') return item.type === 'handle_approval' || item.type === 'verification_update';
    return true;
  });
  async function markAll() { try { await markAllPortalNotificationsRead(user.uid, filtered); } catch (reason) { setError(firebaseMessage(reason)); } }
  if (loading) return <Loading label="Gathering notifications..." />;
  if (error) return <ErrorState message={error} />;
  return <div className="page notifications-page"><div className="section-header"><div><h1 className="display-xl">Notifications</h1><p className="body-md">Replies, Echoes, mentions, follows, Event updates, sources and verification.</p></div><button className="btn btn-secondary btn-sm" type="button" onClick={markAll} disabled={!filtered.some((item) => !item.read)}>Mark all read</button></div><div className="tabs" role="tablist">{categories.map((item) => <button className={`tab ${filter === item ? 'active' : ''}`} role="tab" aria-selected={filter === item} type="button" onClick={() => { setFilter(item); setVisible(20); }} key={item}>{item}</button>)}</div><div className="stack notification-feed">{filtered.length ? filtered.slice(0, visible).map((item) => { const actor = actorProfiles[notificationActorUid(item)] || {}; const resolved = { ...item, actorDisplayName: actor.displayName || item.actorDisplayName, actorHandle: actor.handle || actor.normalizedHandle || item.actorHandle || item.authorHandle, actorPhotoUrl: actor.profilePhotoUrl || item.actorPhotoUrl, actorVerificationState: actor.verificationState || item.actorVerificationState }; return <button key={item.id} className={`glass card notification-card modern ${item.read ? '' : 'unread'}`} type="button" onClick={() => open(resolved)}><span className="notification-avatar">{resolved.actorPhotoUrl && resolved.type !== 'portal_notice' ? <img src={resolved.actorPhotoUrl} alt="" /> : notificationIcon(resolved.type)}</span><span className="notification-copy"><strong>{notificationActorName(resolved)}{resolved.actorVerificationState === 'verified' ? <span className="notification-verified" aria-label="Verified">✓</span> : null}</strong>{resolved.actorHandle && resolved.type !== 'portal_notice' ? <small>@{cleanHandle(resolved.actorHandle)}</small> : null}<span>{notificationText(resolved)}</span>{resolved.postPreview || resolved.preview ? <small>{resolved.postPreview || resolved.preview}</small> : null}</span><time>{relativeTime(resolved.createdAt)}</time></button>; }) : <div className="glass card empty-state compact-empty"><h2 className="display-md">Quiet for now</h2><p className="body-sm">Activity matching this filter will appear here live.</p></div>}{visible < filtered.length ? <button className="btn btn-secondary" type="button" onClick={() => setVisible((count) => count + 20)}>Load more</button> : null}</div></div>;
}

function Messages({ user }) {
  const [conversations, setConversations] = useState([]); const [activeId, setActiveId] = useState(''); const [messages, setMessages] = useState([]); const [search, setSearch] = useState(''); const [body, setBody] = useState(''); const [emoji, setEmoji] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [uploading, setUploading] = useState(0);
  const [people, setPeople] = useState([]); const [peopleLoading, setPeopleLoading] = useState(false); const [replyTo, setReplyTo] = useState(null); const [visibleMessages, setVisibleMessages] = useState(40);
  useEffect(() => observePortalConversations(user.uid, (snapshot) => { const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); setConversations(next); if (!activeId && next[0]) setActiveId(next[0].id); }, (reason) => setError(firebaseMessage(reason))), [user.uid, activeId]);
  useEffect(() => { if (!activeId) { setMessages([]); return undefined; } return observePortalMessages(activeId, (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (reason) => setError(firebaseMessage(reason))); }, [activeId]);
  useEffect(() => { if (activeId) markPortalConversationRead(user, activeId).catch(() => {}); }, [activeId, user]);
  useEffect(() => { const term = search.trim(); if (term.length < 2) { setPeople([]); return undefined; } let cancelled = false; setPeopleLoading(true); const timer = setTimeout(async () => { try { const results = await searchPortalProfiles(term.replace(/^@/, '')); if (!cancelled) setPeople(results.filter((person) => person.uid !== user.uid)); } catch (reason) { if (!cancelled) setError(firebaseMessage(reason)); } finally { if (!cancelled) setPeopleLoading(false); } }, 250); return () => { cancelled = true; clearTimeout(timer); }; }, [search, user.uid]);
  const active = conversations.find((item) => item.id === activeId);
  const filtered = conversations.filter((item) => !item.deletedBy?.includes(user.uid) && !item.archivedBy?.includes(user.uid) && `${item.title || ''} ${(item.participantHandles || []).join(' ')} ${item.lastMessage || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(Boolean(b.pinnedBy?.includes(user.uid))) - Number(Boolean(a.pinnedBy?.includes(user.uid))));
  const visibleMessageList = messages.slice(Math.max(messages.length - visibleMessages, 0));
  async function startConversation(person) { setBusy(true); setError(''); try { const id = await createPortalConversation(user, person); setActiveId(id); setSearch(''); setPeople([]); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function conversationAction(action) { if (!active) return; try { await updatePortalConversationState(user, active.id, action); if (['archive', 'delete'].includes(action)) setActiveId(''); } catch (reason) { setError(firebaseMessage(reason)); } }
  async function send(event) { event.preventDefault(); if (!active || (!body.trim() && !emoji) || busy) return; setBusy(true); setError(''); try { await sendPortalMessage(user, { ...active, replyTo }, `${body}${emoji}`); setBody(''); setEmoji(''); setReplyTo(null); await setPortalConversationTyping(user, active.id, false); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function updateBody(value) { setBody(value); if (active) setPortalConversationTyping(user, active.id, Boolean(value.trim())).catch(() => {}); }
  async function copyMessage(message) { try { await navigator.clipboard.writeText(message.body || message.media?.url || ''); } catch { setError('Copy is unavailable in this browser.'); } }
  async function removeMessage(message) { if (message.senderUid !== user.uid) return; try { await deleteOwnPortalMessage(user, active.id, message.id); } catch (reason) { setError(firebaseMessage(reason)); } }
  async function upload(file) { if (!active || !file) return; setBusy(true); setError(''); try { const media = await uploadPortalMessageMedia(user, active.id, file, setUploading); await sendPortalMessage(user, active, '', media); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); setUploading(0); } }
  return <div className="page messages-page"><div><h1 className="display-xl">Messages</h1><p className="body-md">Real-time Portal conversations.</p></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="messages-layout"><aside className="glass card inbox-panel"><label className="field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" /></label>{search.trim().length >= 2 ? <div className="people-results"><span className="eyebrow">{peopleLoading ? 'Searching people' : 'People'}</span>{people.length ? people.map((person) => <button className="conversation-row" type="button" onClick={() => startConversation(person)} disabled={busy} key={person.uid}><span className="presence-dot" aria-label="Profile found" /><span><strong>{person.displayName || `@${person.handle}`}</strong><small>@{person.handle}</small></span></button>) : !peopleLoading ? <p className="body-sm">No people found.</p> : null}</div> : null}<div className="conversation-list">{filtered.length ? filtered.map((conversation) => <button className={`conversation-row ${conversation.id === activeId ? 'active' : ''}`} type="button" onClick={() => setActiveId(conversation.id)} key={conversation.id}><span className="presence-dot" aria-label={conversation.online ? 'Online' : 'Offline'} /><span><strong>{conversation.title || (conversation.participantHandles || []).filter(Boolean).join(', ') || 'Portal conversation'}</strong><small>{conversation.lastMessage || 'No messages yet'} · {relativeTime(conversation.lastMessageAt || conversation.updatedAt)}</small></span>{conversation.pinnedBy?.includes(user.uid) ? <span className="source-chip">Pinned</span> : null}{conversation.unreadBy?.includes(user.uid) ? <span className="badge-count">•</span> : null}</button>) : <div className="compact-empty"><p className="body-sm">No conversations yet. Search a Portal profile to start one.</p></div>}</div></aside><section className="glass card conversation-panel">{active ? <><div className="conversation-head"><div><strong>{active.title || 'Conversation'}</strong><p className="body-sm">{active.typingUids?.filter((uid) => uid !== user.uid).length ? 'Typing...' : 'Online indicators and read receipts update here.'}</p></div><div className="message-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => conversationAction(active.pinnedBy?.includes(user.uid) ? 'unpin' : 'pin')}>{active.pinnedBy?.includes(user.uid) ? 'Unpin' : 'Pin'}</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => conversationAction('archive')}>Archive</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => conversationAction('delete')}>Delete local</button></div></div><div className="message-list">{messages.length > visibleMessages ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => setVisibleMessages((count) => count + 40)}>Load older messages</button> : null}{visibleMessageList.map((message, index) => { const previous = visibleMessageList[index - 1]; const day = message.createdAt?.toDate ? message.createdAt.toDate().toDateString() : ''; const previousDay = previous?.createdAt?.toDate ? previous.createdAt.toDate().toDateString() : ''; return <div key={message.id}>{day && day !== previousDay ? <div className="date-separator">{day}</div> : null}<article className={`message-bubble ${message.senderUid === user.uid ? 'mine' : ''}`}><p>{message.replyTo?.body ? <small>Replying to: {message.replyTo.body}</small> : null}{message.body}</p>{message.linkPreview?.url ? <a className="link-preview" href={message.linkPreview.url} target="_blank" rel="noreferrer"><strong>{message.linkPreview.title}</strong><span>{message.linkPreview.url}</span></a> : null}{message.media?.url ? message.media.type?.startsWith('image/') ? <img src={message.media.url} alt="" /> : <video src={message.media.url} controls /> : null}<small>{relativeTime(message.createdAt)}{message.readBy?.length > 1 ? ' · Read' : ''}</small><span className="message-tools"><button type="button" onClick={() => setReplyTo({ id: message.id, body: message.body })}>Reply</button><button type="button" onClick={() => copyMessage(message)}>Copy</button>{message.senderUid === user.uid ? <button type="button" onClick={() => removeMessage(message)}>Delete</button> : null}</span></article></div>; })}</div>{replyTo ? <div className="reply-draft"><span>Replying to {replyTo.body || 'media'}</span><button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div> : null}<form className="message-compose" onSubmit={send}><select aria-label="Emoji" value={emoji} onChange={(event) => setEmoji(event.target.value)}><option value="">Emoji</option>{['😀', '😂', '🔥', '❤️', '👀', '🙏'].map((item) => <option key={item}>{item}</option>)}</select><input value={body} onChange={(event) => updateBody(event.target.value)} placeholder="Message, paste a link, or reply..." /><label className="btn btn-secondary btn-sm">Media<input type="file" accept="image/*,video/*" hidden onChange={(event) => upload(event.target.files?.[0])} /></label><button className="btn btn-primary btn-sm" disabled={busy || (!body.trim() && !emoji)}>{busy ? uploading ? `${uploading}%` : 'Sending...' : 'Send'}</button></form></> : <div className="empty-state compact-empty"><h2 className="display-md">No conversation selected</h2><p className="body-sm">Search people to start a conversation, or choose an existing inbox thread.</p></div>}</section></div></div>;
}

function Custodians() {
  const [providers, setProviders] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { const stop = observeIngestionProviders((snapshot) => { setProviders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); setLoading(false); }, (reason) => { setError(firebaseMessage(reason)); setLoading(false); }); return stop; }, []);
  return <div className="page"><div><h1 className="display-xl">Custodians</h1><p className="body-md">How Portal protects the public record through review, corrections and official-source context.</p></div><section className="glass card"><h2 className="display-md">Custodian process</h2><p className="body-sm">Duplicate Events, disputed facts, misleading media and protected identity concerns are reviewed by authorised Portal Custodians outside the public product.</p></section><Section title="Public source availability">{loading ? <Loading label="Checking source availability..." /> : error ? <div className="glass card compact-empty"><p className="body-sm">Source availability is temporarily unavailable.</p></div> : providers.length ? <div className="stack">{providers.map((provider) => <article className="glass card provider-health-card" key={provider.id}><div className="inline-meta"><span className="source-chip">{provider.enabled ? 'Available' : 'Unavailable'}</span><span className="source-chip">{provider.region || provider.scope || 'World'}</span></div><strong>{provider.displayName || provider.id}</strong><p className="body-sm">{provider.category} · Last public update {timeLabel(provider.lastSuccessfulRunAt)}</p></article>)}</div> : <div className="glass card empty-state compact-empty"><p className="body-sm">No public source availability records yet.</p></div>}</Section></div>;
}

function Settings({ user, profile }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || user.displayName || ''); const [emailUpdates, setEmailUpdates] = useState(profile?.preferences?.emailUpdates ?? true); const [pushUpdates, setPushUpdates] = useState(profile?.preferences?.pushUpdates ?? true); const [compactMotion, setCompactMotion] = useState(profile?.preferences?.reducedMotion ?? false); const [profileVisibility, setProfileVisibility] = useState(profile?.profileVisibility || 'Public'); const [messagePreference, setMessagePreference] = useState(profile?.messagePreference || 'People I follow'); const [password, setPassword] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setDisplayName(profile?.displayName || user.displayName || ''); setEmailUpdates(profile?.preferences?.emailUpdates ?? true); setPushUpdates(profile?.preferences?.pushUpdates ?? true); setCompactMotion(profile?.preferences?.reducedMotion ?? false); setProfileVisibility(profile?.profileVisibility || 'Public'); setMessagePreference(profile?.messagePreference || 'People I follow'); }, [profile, user.displayName]);
  async function save(event) { event.preventDefault(); setBusy(true); setError(''); try { await updatePortalProfile(user, { displayName: displayName.trim(), emailUpdates, pushUpdates, reducedMotion: compactMotion, profileVisibility, messagePreference }); setNotice('Settings saved.'); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  async function passwordChange(event) { event.preventDefault(); if (password.length < 8) { setError('Use at least 8 characters for a new password.'); return; } setBusy(true); setError(''); try { await changePortalPassword(password); setPassword(''); setNotice('Password updated.'); } catch (reason) { setError(firebaseMessage(reason)); } finally { setBusy(false); } }
  return <div className="page settings-page"><div><h1 className="display-xl">Settings</h1><p className="body-md">Your Portal profile, privacy, safety and account preferences.</p></div>{notice ? <p className="form-notice" role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<HandleIdentity profile={profile} /><form className="settings-grid" onSubmit={save}><section className="glass card"><h2 className="display-md">Appearance</h2><label className="check-row"><input type="checkbox" checked={compactMotion} onChange={(event) => setCompactMotion(event.target.checked)} /> Reduce motion</label><p className="body-sm">Portal keeps the premium dark interface and teal accent across devices.</p></section><section className="glass card"><h2 className="display-md">Accessibility</h2><div className="profile-option-list"><span className="source-chip">Keyboard focus visible</span><span className="source-chip">High contrast dark theme</span><span className="source-chip">Reduced motion support</span></div></section><section className="glass card"><h2 className="display-md">Notifications</h2><label className="check-row"><input type="checkbox" checked={emailUpdates} onChange={(event) => setEmailUpdates(event.target.checked)} /> Email updates</label><label className="check-row"><input type="checkbox" checked={pushUpdates} onChange={(event) => setPushUpdates(event.target.checked)} /> Push notifications</label></section><section className="glass card"><h2 className="display-md">Privacy</h2><label>Profile visibility<select value={profileVisibility} onChange={(event) => setProfileVisibility(event.target.value)}><option>Public</option><option>Portal members</option><option>Private</option></select></label><label>Messaging<select value={messagePreference} onChange={(event) => setMessagePreference(event.target.value)}><option>Everyone</option><option>People I follow</option><option>No one</option></select></label></section><section className="glass card"><h2 className="display-md">Security</h2><label>Email<input value={user.email || ''} disabled /></label><p className="body-sm">Email changes require Firebase reauthentication and verification.</p></section><section className="glass card"><h2 className="display-md">Blocked users</h2><p className="body-sm">No blocked users are currently synced to this device.</p></section><section className="glass card"><h2 className="display-md">Muted users</h2><p className="body-sm">Muted people and topics will appear here when available.</p></section><section className="glass card"><h2 className="display-md">Connected accounts</h2><p className="body-sm">Signed in with Firebase Authentication.</p></section><section className="glass card"><h2 className="display-md">Help</h2><p className="body-sm">Use Profile, Events, Vortex and Marketplace for the main Portal flows.</p></section><section className="glass card"><h2 className="display-md">About Portal</h2><p className="body-sm">Portal is humanity&apos;s living memory.</p></section><section className="glass card settings-save-card"><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength="80" /></label><button className="btn btn-primary" disabled={busy}>Save settings</button></section></form><section className="glass card"><h2 className="display-md">Password</h2><form className="form-stack" onSubmit={passwordChange}><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" /></label><button className="btn btn-secondary" disabled={busy}>Update password</button></form></section><button className="btn btn-secondary" type="button" onClick={() => signOutPortalUser()}>Sign out</button></div>;
}

function AuthScreen() {
  const [mode, setMode] = useState('signin'); const [values, setValues] = useState({ name: '', email: '', password: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [notice, setNotice] = useState('');
  function update(field, value) { setValues({ ...values, [field]: value }); if (field === 'email' || field === 'password') setError(null); }
  function switchMode(nextMode) { setMode(nextMode); setError(null); setNotice(''); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice('');
    try {
      if (mode === 'signup') {
        if (values.name.trim().length < 2) throw new Error('missing-name');
        await registerPortalUser({ displayName: values.name.trim(), email: values.email.trim(), password: values.password });
      } else if (mode === 'reset') {
        await sendPortalPasswordReset(values.email.trim());
        setNotice('A password reset email has been sent.');
      } else {
        await signInPortalUser(values.email.trim(), values.password);
      }
    } catch (reason) {
      setError(reason?.message === 'missing-name' ? { title: 'Add your name', body: 'Please add your name before creating your Portal account.' } : publicAuthError(reason));
    } finally { setBusy(false); }
  }
  return <main className="auth-shell"><div className="auth-panel"><Brand /><div><h1 className="display-xl">{mode === 'signup' ? 'Create your Portal' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1><p className="body-md">{mode === 'signup' ? 'Start organising the world’s happenings.' : 'Enter Portal’s living memory.'}</p></div>{!hasFirebaseConfig ? <ErrorState message="Firebase environment configuration is missing." /> : <form className="form-stack" onSubmit={submit}>{mode === 'signup' ? <label>Name<input value={values.name} onChange={(event) => update('name', event.target.value)} required /></label> : null}<label>Email<input type="email" value={values.email} onChange={(event) => update('email', event.target.value)} required autoComplete="email" /></label>{mode !== 'reset' ? <label>Password<input type="password" value={values.password} onChange={(event) => update('password', event.target.value)} required minLength="8" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label> : null}{error ? <AuthErrorCard error={error} /> : null}{notice ? <p className="form-notice" role="status">{notice}</p> : null}<button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button></form>}<div className="auth-links">{mode !== 'signin' ? <button type="button" onClick={() => switchMode('signin')}>Sign in</button> : <button type="button" onClick={() => switchMode('signup')}>Create an account</button>}{mode === 'signin' ? <button type="button" onClick={() => switchMode('reset')}>Forgot password?</button> : null}</div></div></main>;
}

function AuthErrorCard({ error }) {
  return <section className="auth-error-card" role="alert" aria-live="assertive"><strong>{error.title}</strong><p>{error.body}</p></section>;
}

function CreateModal({ open, onClose, user, events }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!open) return null;
  async function submit(values) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const created = await createPortalEvent(user, values);
      onClose();
      window.location.hash = `#/events/${created.id}`;
    } catch (reason) { setError(firebaseMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="createModalTitle" onMouseDown={onClose}><div className="modal form-modal report-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2 id="createModalTitle">Create event</h2><p className="body-sm">What is happening?</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<EventForm events={events} onSubmit={submit} onCancel={onClose} busy={busy} /></div></div>;
}

function PublicProfile({ handle, user }) {
  const normalizedHandle = cleanHandle(handle);
  const [profile, setProfile] = useState(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [following, setFollowing] = useState(false); const [followBusy, setFollowBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setProfile(null); setError(''); setNotice('');
    if (!normalizedHandle) { setError('Profile not found'); return undefined; }
    resolvePortalHandle(normalizedHandle).then((data) => { if (!cancelled) { setProfile(data); setFollowing(data.isFollowing === true); } }).catch(() => { if (!cancelled) setError('Profile not found'); });
    return () => { cancelled = true; };
  }, [normalizedHandle]);
  async function copyProfileLink() {
    try { await navigator.clipboard.writeText(publicProfileUrl(profile?.handle || normalizedHandle)); setNotice('Profile link copied.'); } catch { setNotice('Copy is unavailable in this browser.'); }
  }
  async function shareProfile() {
    const url = publicProfileUrl(profile?.handle || normalizedHandle);
    try { if (navigator.share) await navigator.share({ title: profile?.displayName || `@${normalizedHandle}`, url }); else await copyProfileLink(); } catch { /* sharing can be cancelled */ }
  }
  async function changeFollow() {
    if (!user || !profile?.uid || followBusy || profile.uid === user.uid) return;
    const previous = following;
    const next = !previous;
    setFollowing(next);
    setProfile((current) => ({ ...current, followerCount: Math.max(0, Number(current?.followerCount || 0) + (next ? 1 : -1)) }));
    setFollowBusy(true); setNotice('');
    try {
      const result = await togglePortalProfileFollow(profile.uid, next);
      setFollowing(result.following === true);
      setProfile((current) => ({ ...current, followerCount: result.followerCount }));
    } catch (reason) {
      setFollowing(previous);
      setProfile((current) => ({ ...current, followerCount: Math.max(0, Number(current?.followerCount || 0) + (next ? -1 : 1)) }));
      setNotice(firebaseMessage(reason));
    } finally { setFollowBusy(false); }
  }
  if (error) return <main className="auth-shell"><section className="glass card empty-state"><h1 className="display-lg">Profile not found</h1><p className="body-sm">This Portal identity is missing, invalid, deleted or not public.</p><a className="btn btn-primary" href="#/">Return Home</a></section></main>;
  if (!profile) return <main className="auth-shell"><Loading label="Finding this Portal identity..." /></main>;
  const displayName = profile.displayName || profile.handle || normalizedHandle;
  const profileHandle = cleanHandle(profile.handle || profile.normalizedHandle || normalizedHandle);
  const joined = profile.createdAt || profile.joinedAt || profile.handleReservedAt;
  const stats = [
    ['Followers', profile.followerCount || 0],
    ['Following', profile.followingCount || 0],
    ['Posts', profile.postCount || 0],
    ['Replies', profile.replyCount || 0],
    ['Echoes', profile.echoCount || 0],
    ['Media', profile.mediaCount || 0],
    ['Events', profile.eventCount || 0],
    ['Shared reports', profile.reportCount || 0]
  ];
  return <main className="public-profile"><Brand /><div className="page public-profile-page"><div className="profile-cover" style={profile.bannerUrl ? { backgroundImage: `linear-gradient(180deg, rgba(7,9,15,.08), rgba(7,9,15,.48)), url(${profile.bannerUrl})` } : undefined} aria-hidden="true" /><section className="glass card personal-profile-card">{profile.profilePhotoUrl ? <img className="profile-photo-lg" src={profile.profilePhotoUrl} alt="" /> : <Avatar size="lg">{initials(displayName)}</Avatar>}<div className="personal-profile-main"><div><h1 className="display-xl">{displayName}</h1><p className="profile-handle">@{profileHandle}</p>{profile.verificationState === 'verified' ? <span className="source-chip">Verified</span> : null}</div><div className="form-actions">{profile.uid === user?.uid ? <a className="btn btn-primary btn-sm" href="#/profile">Back to my profile</a> : <button className={`btn btn-${following ? 'secondary' : 'primary'} btn-sm`} type="button" onClick={changeFollow} disabled={!user || followBusy} aria-pressed={following}>{followBusy ? 'Saving...' : following ? 'Following' : 'Follow'}</button>}<a className="btn btn-secondary btn-sm" href="#/messages">Message</a><button className="btn btn-secondary btn-sm" type="button" onClick={shareProfile}>Share Profile</button><button className="btn btn-secondary btn-sm" type="button" onClick={copyProfileLink}>Copy Profile Link</button>{user && profile.uid !== user.uid ? <a className="btn btn-secondary btn-sm" href="#/profile">My Profile</a> : null}</div></div>{profile.bio ? <p className="body-md">{profile.bio}</p> : <p className="body-sm">No public bio yet.</p>}<div className="profile-details">{profile.location ? <span>{profile.location}</span> : null}{profile.website ? <a href={profile.website} target="_blank" rel="noreferrer">{profile.website.replace(/^https?:\/\//, '')}</a> : null}<span>Joined {relativeTime(joined)}</span></div>{notice ? <p className="form-notice" role="status">{notice}</p> : null}</section><section className="metrics public-profile-stats">{stats.map(([label, value]) => <span key={label}><strong>{formatViewCount(value)}</strong> {label}</span>)}</section><Section title="Public activity"><div className="profile-tabs">{['Posts', 'Replies', 'Echoes', 'Media', 'Likes', 'Events', 'Shared reports'].map((item) => <button className="profile-tab" type="button" key={item}>{item}</button>)}</div><div className="glass card compact-empty"><p className="body-sm">Public activity for @{profileHandle} appears here when available.</p></div></Section><Section title="Profile actions"><div className="form-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => setNotice('Report received for review.')}>Report User</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setNotice('User blocked on this device for now.')}>Block User</button><button className="btn btn-secondary btn-sm" type="button" onClick={() => setNotice('User muted on this device for now.')}>Mute User</button></div></Section></div></main>;
}

function useRoute() { const routeValue = () => { const hashRoute = window.location.hash.replace('#', ''); return hashRoute && hashRoute !== '/' ? hashRoute : window.location.pathname.startsWith('/@') ? window.location.pathname : hashRoute || '/'; }; const [route, setRoute] = useState(routeValue); useEffect(() => { const change = () => setRoute(routeValue()); window.addEventListener('hashchange', change); window.addEventListener('popstate', change); return () => { window.removeEventListener('hashchange', change); window.removeEventListener('popstate', change); }; }, []); return route; }

export function App() {
  const current = useRoute(); const [user, setUser] = useState(undefined); const [profile, setProfile] = useState(null); const [events, setEvents] = useState([]); const [eventsLoading, setEventsLoading] = useState(true); const [eventsError, setEventsError] = useState(''); const [vortexEntries, setVortexEntries] = useState([]); const [vortexLoading, setVortexLoading] = useState(true); const [vortexError, setVortexError] = useState(''); const [following, setFollowing] = useState(new Set()); const [posts, setPosts] = useState([]); const [echoedPostIds, setEchoedPostIds] = useState(new Set()); const [likedPostIds, setLikedPostIds] = useState(new Set()); const [bookmarkedPostIds, setBookmarkedPostIds] = useState(new Set()); const [echoActivity, setEchoActivity] = useState([]); const [handlePurchases, setHandlePurchases] = useState([]); const [handleRequests, setHandleRequests] = useState([]); const [shellNotifications, setShellNotifications] = useState([]); const [deletedPostIds, setDeletedPostIds] = useState(new Set()); const [toast, setToast] = useState(''); const [quotePost, setQuotePost] = useState(null); const [postComposerOpen, setPostComposerOpen] = useState(false); const [echoBusy, setEchoBusy] = useState(false); const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { if (!hasFirebaseConfig) { setUser(null); return undefined; } return observeSession(async (nextUser) => { if (nextUser) { try { await ensurePortalUserProfile(nextUser); } catch { /* Profile setup will surface any persistent account issue. */ } } setUser(nextUser); }); }, []);
  useEffect(() => { if (!user) return undefined; const stopProfile = observeProfile(user.uid, (snapshot) => setProfile(snapshot.exists() ? snapshot.data() : null)); const stopEvents = observeEvents((snapshot) => { setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); setEventsLoading(false); }, (reason) => { setEventsError(firebaseMessage(reason)); setEventsLoading(false); }); const stopVortex = observeVortex(user.uid, (snapshot) => setFollowing(new Set(snapshot.docs.map((item) => item.id)))); const stopEntries = observeVortexEntries((snapshot) => { setVortexEntries(snapshot.docs.map((item) => item.data())); setVortexLoading(false); }, (reason) => { setVortexError(firebaseMessage(reason)); setVortexLoading(false); }); const stopPosts = observePublicPosts((snapshot) => setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setPosts([])); const stopPurchases = observeHandlePurchases(user.uid, (snapshot) => setHandlePurchases(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setHandlePurchases([])); const stopRequests = observeHandleRequests(user.uid, (snapshot) => setHandleRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).reverse()), () => setHandleRequests([])); const stopLikes = observeUserPostLikes(user.uid, (snapshot) => setLikedPostIds(new Set(snapshot.docs.map((item) => item.data().postId))), () => setLikedPostIds(new Set())); const stopBookmarks = observeUserPostBookmarks(user.uid, (snapshot) => setBookmarkedPostIds(new Set(snapshot.docs.map((item) => item.data().postId))), () => setBookmarkedPostIds(new Set())); const stopEchoes = observeUserEchoes(user.uid, (snapshot) => { const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); setEchoActivity(records); setEchoedPostIds(new Set(records.map((item) => item.sourcePostId))); }, () => { setEchoActivity([]); setEchoedPostIds(new Set()); }); const stopNotifications = observePortalNotifications(user.uid, (snapshot) => setShellNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setShellNotifications([])); return () => { stopProfile(); stopEvents(); stopVortex(); stopEntries(); stopPosts(); stopPurchases(); stopRequests(); stopLikes(); stopBookmarks(); stopEchoes(); stopNotifications(); }; }, [user]);
  useEffect(() => { const accountRoutes = { '/settings': 'Settings', '/memory': 'Portal+ Memory', '/contributors': 'Contributor Hub', '/messages': 'Messages', '/sources': 'Official Sources' }; const route = current.startsWith('/events/') ? 'Event' : current.startsWith('/posts/') ? 'Post' : accountRoutes[current] || routes.concat(secondaryRoutes).find((item) => item.path === current)?.label || 'Home'; document.title = `${route} · Portal`; }, [current]);
  async function follow(eventId, next) { if (!user) return; await setVortexFollow(user.uid, eventId, next); }
  async function echo(postId, next) { if (!user || echoBusy) return; setEchoBusy(true); try { if (next) await echoPortalPost(postId); else await undoPortalEcho(postId); } catch (reason) { window.alert(firebaseMessage(reason)); } finally { setEchoBusy(false); } }
  async function like(postId) { if (!user || echoBusy) return; setEchoBusy(true); try { await togglePortalPostLike(postId); } catch (reason) { window.alert(firebaseMessage(reason)); } finally { setEchoBusy(false); } }
  async function bookmark(postId) { if (!user || echoBusy) return; setEchoBusy(true); try { await togglePortalPostBookmark(postId); } catch (reason) { window.alert(firebaseMessage(reason)); } finally { setEchoBusy(false); } }
  async function view(postId) { if (!postId) return; try { await registerPortalPostView(postId, { anonymousId: portalAnonymousId(), deviceType: deviceType() }); } catch { /* View registration should never interrupt reading. */ } }
  function openReply(post) { if (post?.id) window.location.hash = `#/posts/${post.id}`; }
  async function submitReply(postId, body) { if (!user) return; await createPortalPostReply(postId, body); }
  async function quote(quoteText) { if (!quotePost || echoBusy) return; setEchoBusy(true); try { await createPortalQuoteEcho(quotePost.id, quoteText); setQuotePost(null); } catch (reason) { window.alert(firebaseMessage(reason)); } finally { setEchoBusy(false); } }
  async function publishPost(payload) { if (echoBusy) return; setEchoBusy(true); try { await createPortalPost(payload); setPostComposerOpen(false); } catch (reason) { window.alert(firebaseMessage(reason)); } finally { setEchoBusy(false); } }
  async function removePost(post) {
    if (!user || !post?.id) return;
    setDeletedPostIds((current) => new Set([...current, post.id]));
    setToast('');
    try {
      await deletePortalPost(post.id);
      setToast('Post deleted.');
      window.setTimeout(() => setToast(''), 2600);
      if (current.startsWith('/posts/') && current.split('/')[2] === post.id) window.location.hash = '#/profile';
    } catch (reason) {
      setDeletedPostIds((currentSet) => { const next = new Set(currentSet); next.delete(post.id); return next; });
      window.alert(firebaseMessage(reason) || 'Post could not be deleted.');
      throw reason;
    }
  }

  if (user === undefined) return <main className="auth-shell"><Loading label="Restoring your Portal session..." /></main>;
  if (current.startsWith('/@')) return <PublicProfile handle={current.slice(2)} user={user} />;
  if (!user) return <AuthScreen />;
  const unreadNotificationCount = shellNotifications.filter((item) => !item.read && item.archived !== true).length;
  const visiblePosts = posts.filter((post) => !deletedPostIds.has(post.id));
  const eventState = { events, loading: eventsLoading, error: eventsError };
  if (current === '/bookmarks') {
    const bookmarksPage = <Bookmarks posts={visiblePosts} bookmarkedPostIds={bookmarkedPostIds} user={user} echoedPostIds={echoedPostIds} likedPostIds={likedPostIds} onEcho={echo} onQuote={setQuotePost} onLike={like} onBookmark={bookmark} onReply={openReply} onView={view} onDelete={removePost} />;
    return <><a href="#main" className="skip-link">Skip to content</a><div className="app"><Sidebar current={current} onCreate={() => setCreateOpen(true)} /><Topbar profile={profile} unreadCount={unreadNotificationCount} /><div className="main-col"><main id="main" className="content-col" tabIndex="-1">{bookmarksPage}</main></div><BottomNav current={current} /></div>{quotePost ? <QuoteEchoComposer post={quotePost} onClose={() => setQuotePost(null)} onSubmit={quote} busy={echoBusy} /> : null}</>;
  }
  let page; if (current === '/events') page = <Events user={user} eventState={eventState} onFollow={follow} following={following} onCreate={() => setCreateOpen(true)} />; else if (current.startsWith('/events/')) page = <EventDetail eventId={current.split('/')[2]} user={user} events={events} onFollow={follow} following={following.has(current.split('/')[2])} />; else if (current.startsWith('/posts/')) page = <PostDetail postId={current.split('/')[2]} user={user} echoed={echoedPostIds.has(current.split('/')[2])} liked={likedPostIds.has(current.split('/')[2])} bookmarked={bookmarkedPostIds.has(current.split('/')[2])} onEcho={echo} onQuote={setQuotePost} onLike={like} onBookmark={bookmark} onView={view} onDelete={removePost} onReplySubmit={submitReply} />; else if (current === '/notifications') page = <Notifications user={user} />; else if (current === '/messages') page = <Messages user={user} />; else if (current === '/sources') page = <FeaturePage title="Official Sources" description="Verified institutions, publishers and public sources connected to Portal Events." />; else if (current === '/memory') page = <FeaturePage title="Portal+ Memory" description="Your extended memory tools, accessible from Profile without crowding the primary navigation." />; else if (current === '/contributors') page = <FeaturePage title="Contributor Hub" description="Creator reporting tools and contributor context, kept inside Profile while the core network grows." />; else if (current === '/vortex') page = <Vortex entries={vortexEntries} loading={vortexLoading} error={vortexError} following={following} onFollow={follow} />; else if (current.startsWith('/marketplace')) page = <HandleMarketplace user={user} profile={profile} handlePurchases={handlePurchases} handleRequests={handleRequests} route={current} />; else if (current === '/settings') page = <Settings user={user} profile={profile} />; else if (current === '/profile') page = profile ? <PersonalProfile user={user} profile={profile} posts={visiblePosts} echoActivity={echoActivity} handlePurchases={handlePurchases} echoedPostIds={echoedPostIds} likedPostIds={likedPostIds} bookmarkedPostIds={bookmarkedPostIds} onEcho={echo} onQuote={setQuotePost} onLike={like} onBookmark={bookmark} onReply={openReply} onView={view} onDelete={removePost} onProfileSaved={(message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); }} /> : <ProfileSetup user={user} profile={profile} />; else if (current === '/custodians' || current === '/stewardship') page = <Custodians />; else page = <Home user={user} posts={visiblePosts} echoedPostIds={echoedPostIds} likedPostIds={likedPostIds} bookmarkedPostIds={bookmarkedPostIds} onEcho={echo} onQuote={setQuotePost} onLike={like} onBookmark={bookmark} onReply={openReply} onView={view} onDelete={removePost} onCreatePost={() => setPostComposerOpen(true)} />;
  return <><a href="#main" className="skip-link">Skip to content</a><div className="app"><Sidebar current={current} onCreate={() => setCreateOpen(true)} /><Topbar profile={profile} unreadCount={unreadNotificationCount} /><div className="main-col"><main id="main" className="content-col" tabIndex="-1">{page}</main></div><BottomNav current={current} /></div>{toast ? <div className="toast" role="status">{toast}</div> : null}<CreateModal open={createOpen} onClose={() => setCreateOpen(false)} user={user} profile={profile} events={events} />{quotePost ? <QuoteEchoComposer post={quotePost} onClose={() => setQuotePost(null)} onSubmit={quote} busy={echoBusy} /> : null}{postComposerOpen ? <PostComposer user={user} onClose={() => setPostComposerOpen(false)} onSubmit={publishPost} busy={echoBusy} /> : null}</>;
}
