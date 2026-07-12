import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { secondaryRoutes } from '../domain/portal.js';
import { App, EVENTS_UNAVAILABLE_MESSAGE, PROFILE_HANDLE_PLACEHOLDER } from './App.jsx';

describe('Portal app shell', () => {
  it('renders the authenticated entry surface and explains missing local config', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Firebase environment configuration is missing.')).toBeInTheDocument();
  });

  it('uses a concise Events availability message', () => {
    expect(EVENTS_UNAVAILABLE_MESSAGE).toBe('Events are temporarily unavailable. Please try again shortly.');
  });

  it('keeps the handle choice empty until the member provides one', () => {
    expect(PROFILE_HANDLE_PLACEHOLDER).toBe('Choose your unique handle');
  });

  it('keeps account-only destinations out of the visible sidebar', () => {
    expect(secondaryRoutes.map((route) => route.label)).toEqual(['Official Sources', 'Custodians']);
  });

  it('uses the Portal teal navigation icon and primary action system', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const icons = readFileSync(resolve('src/ui/icons.jsx'), 'utf8');
    const styles = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(source).toContain("import { ActionIcon, Icon } from './icons.jsx';");
    expect(icons).toContain("home: '<path d=\"M4 10.8 12 4l8 6.8\"");
    expect(icons).toContain("events: '<path d=\"M3 12h4l2-5 4 10 2-5h6\"");
    expect(icons).toContain("messages: '<path d=\"M5.2 6.5h13.6");
    expect(icons).toContain("notifications: '<path d=\"M18 10.2a6 6 0 0 0-12 0");
    expect(icons).toContain("profile: '<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"14\"");
    expect(icons).toContain("brand: '<path d=\"M12 3.5 19.5 7v5.2");
    expect(icons).toContain("custodians: '<path d=\"m12 4 2.35 4.75");
    expect(icons).toContain("create: '<path d=\"M12 5v14M5 12h14\"");
    expect(icons).toContain("className={name === 'vortex' ? 'vortex-icon' : undefined}");
    expect(source).toContain('<Icon name="create" />Create');
    expect(styles).toContain('--accent:#63D6F2');
    expect(styles).toContain('--nav-inactive:#7E8798');
    expect(styles).toContain('.nav-item[aria-current=page]{color:var(--accent);background:rgba(99,214,242,.10)');
    expect(styles).toContain('.btn-primary{background:var(--accent);color:#fff');
    expect(styles).toContain('.create-btn{margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 16px;border-radius:16px;background:var(--accent);color:#fff');
  });

  it('keeps event discovery out of Home and routes it to Events', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const homeBlock = source.match(/function Home\([\s\S]*?\n}\n\nfunction PostComposer/)?.[0] || '';
    const eventsBlock = source.match(/function Events\([\s\S]*?\n}\n\nfunction EventDetail/)?.[0] || '';
    expect(homeBlock).not.toContain('Happening around the world');
    expect(homeBlock).not.toContain('Events happening now');
    expect(homeBlock).not.toContain('EventCollection');
    expect(eventsBlock).toContain('Happening around the world');
    expect(eventsBlock).toContain('Events happening now');
  });

  it('keeps handle purchasing inside Marketplace with development payment copy', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const marketplaceBlock = source.match(/function HandleMarketplace\([\s\S]*?\n}\n\nfunction HandleIdentity/)?.[0] || '';
    expect(marketplaceBlock).toContain('Reserve, discover and trade eligible Portal identities.');
    expect(marketplaceBlock).toContain('Reserve your free handle');
    expect(marketplaceBlock).toContain('Handle lifecycle');
    expect(marketplaceBlock).toContain('Suggestions');
    expect(marketplaceBlock).toContain('Your Requests');
    expect(marketplaceBlock).toContain('Development Payment Mode');
    expect(marketplaceBlock).toContain('Temporary Development Mode');
    expect(marketplaceBlock).toContain('Placeholder payment approved.');
    expect(marketplaceBlock).not.toContain('Stripe');
    expect(marketplaceBlock).not.toContain('Admin approval');
    expect(marketplaceBlock).not.toContain('Portal admin');
  });

  it('keeps Public Portal isolated from Admin routes and components', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const styles = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(source).not.toContain('AdminWorkspace');
    expect(source).not.toContain('AdminHandleRegistry');
    expect(source).not.toContain("current === '/admin'");
    expect(source).not.toContain("startsWith('/admin/");
    expect(source).not.toContain('getPortalAdminHandle');
    expect(source).not.toContain('managePortalHandleRegistry');
    expect(source).not.toContain('reclaimPortalHandle');
    expect(source).not.toContain('portalAdmin');
    expect(styles).not.toContain('.admin-shell');
    expect(styles).not.toContain('.admin-nav');
    expect(styles).not.toContain('.pulse-meter');
  });

  it('uses Profile as a handle summary instead of a second marketplace', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const profileBlock = source.match(/function PersonalProfile\([\s\S]*?\n}\n\nfunction FeaturePage/)?.[0] || '';
    expect(profileBlock).toContain('Section title="Handles"');
    expect(profileBlock).toContain('#/marketplace?handle=');
    expect(profileBlock).not.toContain('Search handles');
  });

  it('polishes Publish Post into compact icon-driven panels', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const composerBlock = source.match(/function PostComposer\([\s\S]*?\n}\n\nfunction PostDetail/)?.[0] || '';
    expect(composerBlock).toContain('composer-icon-row');
    expect(composerBlock).toContain('aria-label="Media"');
    expect(composerBlock).toContain('aria-label="Link"');
    expect(composerBlock).toContain('aria-label="Poll"');
    expect(composerBlock).toContain('aria-label="Location"');
    expect(composerBlock).toContain('id="post-media-picker"');
    expect(composerBlock).toContain('accept="image/*,video/*"');
    expect(composerBlock).toContain('pickMediaFiles');
    expect(composerBlock).toContain('compact-media-preview');
    expect(composerBlock).toContain('Auto title preview');
    expect(composerBlock).toContain('Current location');
    expect(composerBlock).not.toContain('Upload photos');
    expect(composerBlock).not.toContain('Upload video');
    expect(composerBlock).not.toContain('Drag photos here');
    expect(composerBlock).not.toContain('Emoji picker');
    expect(composerBlock).not.toContain('Topic / Hashtag selector');
    expect(composerBlock).not.toContain('Visibility');
  });

  it('renders post media in shared Post cards', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const mediaBlock = source.match(/function PostMedia\([\s\S]*?\n}\n\nfunction PostCard/)?.[0] || '';
    expect(mediaBlock).toContain('post-photo-grid');
    expect(mediaBlock).toContain('post-video');
    expect(mediaBlock).toContain('Attached link');
    expect(mediaBlock).toContain('poll-option');
  });

  it('uses a premium SVG feed interaction bar with Echo copy only in the menu', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const icons = readFileSync(resolve('src/ui/icons.jsx'), 'utf8');
    const postCardBlock = source.match(/function PostCard\([\s\S]*?\n}\n\nfunction Home/)?.[0] || '';
    expect(postCardBlock).toContain('interaction-bar');
    expect(postCardBlock).toContain('IntersectionObserver');
    expect(postCardBlock).toContain('intersectionRatio >= 0.5');
    expect(postCardBlock).toContain('setTimeout(() =>');
    expect(postCardBlock).toContain('}, 2000)');
    expect(postCardBlock).toContain('document.visibilityState');
    expect(postCardBlock).toContain('post-view-count');
    expect(postCardBlock).toContain('<ActionIcon name="view" />');
    expect(postCardBlock).toContain('formatViewCount(post.viewCount)');
    expect(icons).toContain("name === 'like'");
    expect(icons).toContain("name === 'reply'");
    expect(icons).toContain("name === 'echo'");
    expect(icons).toContain("name === 'bookmark'");
    expect(icons).toContain("name === 'view'");
    expect(postCardBlock).toContain('<ActionIcon name="share" />');
    expect(postCardBlock).toContain('interaction-label');
    expect(postCardBlock).toContain('interaction-count');
    expect(postCardBlock).toContain("aria-label={liked ? 'Unlike' : 'Like'}");
    expect(postCardBlock).toContain('aria-label="Reply"');
    expect(postCardBlock).toContain('aria-label="Echo"');
    expect(postCardBlock).toContain("aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}");
    expect(postCardBlock).toContain('aria-label="Share"');
    expect(postCardBlock).toContain('Re-share to your followers.');
    expect(postCardBlock).toContain('Echo with comment');
    expect(postCardBlock).toContain('Quote the post in a new post.');
    expect(postCardBlock).toContain('Cancel');
    expect(postCardBlock).not.toContain('❤️');
    expect(postCardBlock).not.toContain('🔁 <span>');
    expect(postCardBlock).not.toContain('📤');
    expect(postCardBlock).not.toContain('Undo Echo');
    expect(postCardBlock).not.toContain('Echoes</span>');
    expect(postCardBlock).not.toContain('echoed</p>');
  });

  it('opens Post detail for threaded replies and exact timestamps', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const detailBlock = source.match(/function PostDetail\([\s\S]*?\n}\n\nfunction EventForm/)?.[0] || '';
    expect(detailBlock).toContain('observePostReplies');
    expect(source).toContain('createPortalPostReply');
    expect(detailBlock).toContain('Opened at');
    expect(detailBlock).toContain('Reply to this Post');
  });

  it('uses a floating Echo popover instead of expanding under the Post', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const postCardBlock = source.match(/function PostCard\([\s\S]*?\n}\n\nfunction Home/)?.[0] || '';
    expect(postCardBlock).toContain('floating-popover');
    expect(postCardBlock).toContain('popover-dismiss');
    expect(postCardBlock).toContain("event.key === 'Escape'");
  });

  it('adds full Profile editing, modern notifications, real messages and People search', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    expect(source).toContain('function ProfileEditModal');
    expect(source).toContain('Profile photo');
    expect(source).toContain('Banner');
    expect(source).toContain('Pronouns');
    expect(source).toContain('notification-card modern');
    expect(source).toContain('function Messages');
    expect(source).toContain('observePortalConversations');
    expect(source).toContain('People');
    expect(source).toContain('searchPortalProfiles');
  });

  it('routes every public profile trigger through the canonical handle profile screen', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const service = readFileSync(resolve('src/services/firebase.js'), 'utf8');
    const postCardBlock = source.match(/function PostCard\([\s\S]*?\n}\n\nfunction Home/)?.[0] || '';
    const homeBlock = source.match(/function Home\([\s\S]*?\n}\n\nfunction PostComposer/)?.[0] || '';
    const detailBlock = source.match(/function PostDetail\([\s\S]*?\n}\n\nfunction EventForm/)?.[0] || '';
    const vortexBlock = source.match(/function Vortex\([\s\S]*?\n}\n\nfunction Settings/)?.[0] || '';
    const profileBlock = source.match(/function PersonalProfile\([\s\S]*?\n}\n\nfunction FeaturePage/)?.[0] || '';
    const notificationBlock = source.match(/function Notifications\([\s\S]*?\n}\n\nfunction Messages/)?.[0] || '';
    const publicProfileBlock = source.match(/function PublicProfile\([\s\S]*?\n}\n\nfunction useRoute/)?.[0] || '';
    expect(source).toContain('function publicProfileRoute');
    expect(source).toContain("if (current.startsWith('/@')) return <PublicProfile");
    expect(postCardBlock).toContain('href={publicProfileRoute(author)}');
    expect(postCardBlock).toContain('href={publicProfileRoute(post.echoedByHandle)}');
    expect(homeBlock).toContain('href={publicProfileRoute(creatorHandle)}');
    expect(detailBlock).toContain('href={publicProfileRoute(replyHandle)}');
    expect(vortexBlock).toContain('href={publicProfileRoute(person.handle)}');
    expect(profileBlock).toContain('href={publicProfileRoute(handle)}');
    expect(notificationBlock).toContain('window.location.hash = publicProfileRoute(item.handle)');
    expect(source).not.toContain('href={`/@${handle}`}');
    expect(source).not.toContain('href={`/@${person.handle}`}');
    expect(publicProfileBlock).toContain('Profile not found');
    expect(publicProfileBlock).toContain('Return Home');
    expect(publicProfileBlock).toContain('Followers');
    expect(publicProfileBlock).toContain('Following');
    expect(publicProfileBlock).toContain('Posts');
    expect(publicProfileBlock).toContain('Replies');
    expect(publicProfileBlock).toContain('Echoes');
    expect(publicProfileBlock).toContain('Media');
    expect(publicProfileBlock).toContain('Likes');
    expect(publicProfileBlock).toContain('Events');
    expect(publicProfileBlock).toContain('Shared reports');
    expect(publicProfileBlock).toContain('Share Profile');
    expect(publicProfileBlock).toContain('Copy Profile Link');
    expect(publicProfileBlock).toContain('Report User');
    expect(publicProfileBlock).toContain('Block User');
    expect(publicProfileBlock).toContain('Mute User');
    expect(publicProfileBlock).not.toContain('email');
    expect(publicProfileBlock).not.toContain('admin');
    expect(service).toContain('searchPortalProfiles(term)');
    expect(service).toContain('data.profiles || data || []');
  });
});
