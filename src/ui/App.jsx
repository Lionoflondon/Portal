import { useEffect, useMemo, useState } from 'react';
import {
  constellations,
  contributors,
  conversations,
  events,
  eventStatuses,
  reports,
  routes,
  secondaryRoutes,
} from '../domain/portal.js';
import { hasFirebaseConfig } from '../services/firebase.js';

const iconPaths = {
  home: '<path d="M3 11l9-8 9 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v10h14V10" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  events: '<rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  vortex: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3M12 19v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  messages: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  notifications: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  profile: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  premium: '<path d="M5 18h14l1.5-9-5 3-3.5-6-3.5 6-5-3L5 18z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  creator: '<path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 13l2.5 2.5L16 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  brand: '<path d="M3 9l9-6 9 6-9 6-9-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 9v6l9 6 9-6V9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  admin: '<path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  search: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  reply: '<path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.7 4.6 6 4a5 5 0 016 2 5 5 0 016-2c3.3.6 4.8 4 3.3 7.2C19 15.6 12 20 12 20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  share: '<circle cx="18" cy="5" r="2.6" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="19" r="2.6" stroke="currentColor" stroke-width="1.8"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2" stroke="currentColor" stroke-width="1.8"/>',
};

function Icon({ name, className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: iconPaths[name] ?? '' }}
    />
  );
}

function Brand() {
  return (
    <a href="#/" className="brand" aria-label="Portal home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M2 12h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" />
        </svg>
      </span>
      <span className="brand-name desktop-only">Portal</span>
    </a>
  );
}

function Avatar({ children, size = 'md' }) {
  return <span className={`avatar size-${size}`}>{children}</span>;
}

function NavLink({ route, current }) {
  return (
    <a href={`#${route.path}`} className="nav-item" aria-current={current === route.path ? 'page' : undefined}>
      <Icon name={route.icon} />
      <span>{route.label}</span>
      {route.badge ? <span className="badge badge-count">{route.badge}</span> : null}
      {route.dot ? <span className="dot-badge" aria-hidden="true" /> : null}
    </a>
  );
}

function Sidebar({ current, onCreate }) {
  return (
    <nav className="sidebar desktop-only" aria-label="Primary">
      <Brand />
      <div className="nav-group" role="list">
        {routes.map((route) => (
          <NavLink key={route.path} route={route} current={current} />
        ))}
      </div>
      <button className="create-btn" onClick={onCreate} aria-haspopup="dialog">
        <span>+</span>
        Create
      </button>
      <div className="nav-group secondary-nav" role="list">
        <div className="eyebrow nav-label">More</div>
        {secondaryRoutes.map((route) => (
          <NavLink key={route.path} route={route} current={current} />
        ))}
      </div>
      <div className="sidebar-footer">
        <a href="#/profile" className="profile-summary">
          <Avatar>JA</Avatar>
          <span className="profile-meta">
            <strong>Jason Adesanya</strong>
            <span>@jason</span>
          </span>
        </a>
      </div>
    </nav>
  );
}

function Topbar() {
  return (
    <header className="topbar mobile-only">
      <Brand />
      <div className="topbar-actions">
        <a aria-label="Notifications" href="#/notifications">
          <Icon name="notifications" />
          <span className="dot-badge" aria-hidden="true" />
        </a>
        <a aria-label="Open profile menu" href="#/profile">
          <Avatar size="sm">JA</Avatar>
        </a>
      </div>
    </header>
  );
}

function BottomNav({ current }) {
  const bottom = ['/', '/events', '/vortex', '/messages', '/profile'];
  return (
    <nav className="bottom-nav mobile-only" aria-label="Primary">
      {bottom.map((path) => {
        const route = routes.find((item) => item.path === path);
        return (
          <a
            key={path}
            href={`#${path}`}
            className={`bnav-item ${path === '/vortex' ? 'vortex-center' : ''}`}
            aria-current={current === path ? 'page' : undefined}
            aria-label={route.label}
          >
            <Icon name={route.icon} />
            <span>{route.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function EventCard({ event }) {
  return (
    <article className="glass card interactive event-card memory-event-card">
      <span className={`event-status ${event.status.toLowerCase()}`}>
        {event.live ? <span className="pulse-dot" /> : null}
        {event.status}
      </span>
      <strong>{event.name}</strong>
      <span className="body-sm">{event.stats}</span>
      <div className="metrics">
        <span>Parent: {event.parent}</span>
        <span>Children: {event.children}</span>
      </div>
    </article>
  );
}

function ReportRow({ report }) {
  return (
    <article className="glass card interactive report-item">
      {report.media ? <div className="media-thumb" aria-hidden="true" /> : null}
      <div className="body">
        <div className="inline-meta">
          <span className="source-chip">{report.source}</span>
          <span className="body-sm">{report.time}</span>
        </div>
        <strong>{report.event}</strong>
        <p className="body-sm">{report.body}</p>
      </div>
    </article>
  );
}

function ConversationRow({ conversation }) {
  return (
    <article className="glass card interactive convo-item">
      <Avatar>{conversation.initials}</Avatar>
      <div className="body">
        <div className="row1">
          <strong>{conversation.name}</strong>
          <span className="handle">{conversation.handle}</span>
          <span className="dot" />
          <span className="time">{conversation.time}</span>
        </div>
        <p>{conversation.body}</p>
        <div className="convo-actions">
          <button type="button">
            <Icon name="reply" /> {conversation.replies}
          </button>
          <button type="button">
            <Icon name="heart" /> {conversation.likes}
          </button>
          <button type="button">
            <Icon name="share" /> {conversation.shares}
          </button>
        </div>
      </div>
    </article>
  );
}

function Home() {
  return (
    <div className="page">
      <div className="welcome-head">
        <div>
          <h1 className="display-xl">Humanity&apos;s living memory</h1>
          <p className="body-md">Reports become evidence. Conversations become context. Events become connected memory.</p>
        </div>
      </div>
      <section>
        <div className="glass card hero-event">
          <span className="badge badge-live">
            <span className="pulse" /> BREAKING EVENT
          </span>
          <h2>France vs Morocco semi final</h2>
          <div className="hero-meta">
            <div className="avatar-stack">
              <Avatar size="sm">MC</Avatar>
              <Avatar size="sm">TB</Avatar>
              <Avatar size="sm">BW</Avatar>
            </div>
            <span className="body-sm">842 reports · 14 videos · parent: Women&apos;s Euros</span>
            <a className="btn btn-primary btn-sm" href="#/events">
              Enter event
            </a>
          </div>
        </div>
      </section>
      <Section title="Live events" link="#/events">
        <div className="hscroll">{events.map((event) => <EventCard key={event.name} event={event} />)}</div>
      </Section>
      <Section title="Incoming reports" link="#/events">
        <div className="stack">{reports.map((report) => <ReportRow key={`${report.source}-${report.event}`} report={report} />)}</div>
      </Section>
      <Section title="Constellations" link="#/vortex">
        <div className="hscroll">
          {constellations.map((item) => (
            <article className="glass card interactive community-card" key={item.name}>
              <div className="cover" />
              <div>
                <strong>{item.name}</strong>
                <br />
                <span>{item.meta}</span>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title="Conversations" link="#/vortex">
        <div className="stack">{conversations.map((conversation) => <ConversationRow key={conversation.body} conversation={conversation} />)}</div>
      </Section>
    </div>
  );
}

function Events() {
  return (
    <div className="page">
      <div className="welcome-head">
        <div>
          <h1 className="display-xl">Events</h1>
          <p className="body-md">Real happenings, organised by evidence, status and relationship.</p>
        </div>
      </div>
      <div className="glass card hero-event">
        <span className="badge badge-live">
          <span className="pulse" /> BREAKING
        </span>
        <h2>France vs Morocco semi final</h2>
        <div className="hero-meta">
          <span className="body-sm">{events[0].summary}</span>
          <button className="btn btn-primary btn-sm" type="button">
            Follow event
          </button>
        </div>
      </div>
      <Section title="Status">
        <div className="chip-row">
          {['All', ...eventStatuses, 'Official', 'Near me'].map((status, index) => (
            <button type="button" className={`chip ${index === 0 ? 'active' : ''}`} key={status}>
              {status}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Events">
        <div className="hscroll">{events.map((event) => <EventCard key={event.name} event={event} />)}</div>
      </Section>
      <Section title="Timeline">
        <div className="glass card timeline">
          <TimelineRow time="20:41" title="Equaliser reported" body="Seven eyewitness reports and two videos attached to the match event." />
          <TimelineRow time="20:48" title="Official source pending" body="Portal AI keeps status as Breaking until the governing body confirms." />
          <TimelineRow time="20:56" title="Related event created" body="Golden Boot race connected as a child event from match impact." />
        </div>
      </Section>
      <Section title="Reports">
        <div className="stack">{reports.map((report) => <ReportRow key={`${report.source}-${report.event}`} report={report} />)}</div>
      </Section>
    </div>
  );
}

function Vortex() {
  return (
    <div className="page vortex-page">
      <div>
        <h1 className="display-xl">Vortex</h1>
        <p className="body-md">The rocket through Portal&apos;s universe: search, jump and trace how events connect.</p>
      </div>
      <div className="vortex-orb-field" aria-hidden="true">
        <span className="label">Travel through humanity&apos;s knowledge</span>
      </div>
      <div className="vortex-search-wrap">
        <label className="glass field vortex-field">
          <Icon name="search" />
          <input type="text" placeholder="Search a happening, report, source or constellation..." />
        </label>
      </div>
      <div className="tabs" role="tablist">
        {['Events', 'Reports', 'Conversations', 'Sources', 'Media', 'Constellations', 'People'].map((tab, index) => (
          <button className={`tab ${index === 0 ? 'active' : ''}`} role="tab" aria-selected={index === 0} key={tab} type="button">
            {tab}
          </button>
        ))}
      </div>
      <div className="glass card empty-state">
        <div className="icon-wrap">
          <Icon name="vortex" />
        </div>
        <h2 className="display-md">Start travelling</h2>
        <p className="body-sm">Find an event, inspect its reports, follow its parent and child events, or jump into the conversations around it.</p>
      </div>
    </div>
  );
}

function SimplePage({ title, children }) {
  return (
    <div className="page">
      <h1 className="display-xl">{title}</h1>
      {children}
    </div>
  );
}

function Section({ title, link, children }) {
  return (
    <section>
      <div className="section-header">
        <h2>{title}</h2>
        {link ? (
          <a className="see-all" href={link}>
            See all
          </a>
        ) : null}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function TimelineRow({ time, title, body }) {
  return (
    <div className="timeline-row">
      <time>{time}</time>
      <div>
        <strong>{title}</strong>
        <p className="body-sm">{body}</p>
      </div>
    </div>
  );
}

function RightRail() {
  return (
    <aside className="right-rail desktop-only" aria-label="Suggestions">
      <div className="glass card">
        <div className="section-header">
          <h2 className="display-md">Breaking events</h2>
        </div>
        <div className="stack compact">
          {events.map((event) => (
            <div className="rail-list-item" key={event.name}>
              <div className="body">
                <strong>{event.name}</strong>
                <span>{event.status} · {event.stats.split(' · ')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="glass card">
        <div className="section-header">
          <h2 className="display-md">Top contributors</h2>
        </div>
        <div className="stack compact">
          {contributors.map((contributor) => (
            <div className="rail-list-item" key={contributor.name}>
              <Avatar size="sm">{contributor.initials}</Avatar>
              <div className="body">
                <strong>{contributor.name}</strong>
                <span>{contributor.meta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CreateModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" aria-labelledby="createModalTitle" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-head">
          <h2 id="createModalTitle">Create</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-options">
          <button className="modal-option" type="button">
            <span className="icon-wrap"><Icon name="messages" /></span>
            <span><strong>Conversation</strong><span>Casual talk, replies and reactions</span></span>
          </button>
          <button className="modal-option" type="button">
            <span className="icon-wrap"><Icon name="creator" /></span>
            <span><strong>Report</strong><span>Add evidence to a real happening</span></span>
          </button>
          <button className="modal-option" type="button">
            <span className="icon-wrap"><Icon name="vortex" /></span>
            <span><strong>Match to event</strong><span>Let AI place content in the universe</span></span>
          </button>
        </div>
      </div>
    </div>
  );
}

function useRoute() {
  const [route, setRoute] = useState(() => window.location.hash.replace('#', '') || '/');
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#', '') || '/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return route;
}

export function App() {
  const current = useRoute();
  const [createOpen, setCreateOpen] = useState(false);
  const page = useMemo(() => {
    switch (current) {
      case '/events':
        return <Events />;
      case '/vortex':
        return <Vortex />;
      case '/messages':
        return <SimplePage title="Messages"><div className="glass card empty-state"><h2>Select a conversation</h2><p className="body-sm">Messaging is scaffolded for Portal conversations.</p></div></SimplePage>;
      case '/notifications':
        return <SimplePage title="Notifications"><div className="glass card empty-state"><h2>No critical updates</h2><p className="body-sm">Event and contributor alerts will appear here.</p></div></SimplePage>;
      case '/profile':
        return <SimplePage title="Jason Adesanya"><div className="glass card"><p className="body-md">Contributor profile for reports, conversations, and event impact.</p></div></SimplePage>;
      case '/settings':
        return <SimplePage title="Settings"><div className="glass card"><p className="body-md">Firebase configured: {hasFirebaseConfig ? 'yes' : 'environment pending'}.</p></div></SimplePage>;
      default:
        return <Home />;
    }
  }, [current]);

  useEffect(() => {
    const title = routes.concat(secondaryRoutes).find((item) => item.path === current)?.label ?? 'Home';
    document.title = `${title} · Portal`;
  }, [current]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="app">
        <Sidebar current={current} onCreate={() => setCreateOpen(true)} />
        <Topbar />
        <div className="main-col">
          <main id="main" className="content-col" tabIndex="-1">{page}</main>
          <RightRail />
        </div>
        <BottomNav current={current} />
      </div>
      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
