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
    const styles = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(source).toContain("home: '<path d=\"M4 10.8 12 4l8 6.8\"");
    expect(source).toContain("events: '<path d=\"M3 12h4l2-5 4 10 2-5h6\"");
    expect(source).toContain("messages: '<path d=\"M5.2 6.5h13.6");
    expect(source).toContain("notifications: '<path d=\"M18 10.2a6 6 0 0 0-12 0");
    expect(source).toContain("profile: '<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"14\"");
    expect(source).toContain("brand: '<path d=\"M12 3.5 19.5 7v5.2");
    expect(source).toContain("admin: '<path d=\"m12 4 2.35 4.75");
    expect(source).toContain("create: '<path d=\"M12 5v14M5 12h14\"");
    expect(source).toContain("className={name === 'vortex' ? 'vortex-icon' : undefined}");
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
    const marketplaceBlock = source.match(/function HandleMarketplace\([\s\S]*?\n}\n\nfunction AdminHandleRegistry/)?.[0] || '';
    expect(marketplaceBlock).toContain('Reserve, discover and trade eligible Portal identities.');
    expect(marketplaceBlock).toContain('Reserve your free handle');
    expect(marketplaceBlock).toContain('Handle lifecycle');
    expect(marketplaceBlock).toContain('Suggestions');
    expect(marketplaceBlock).toContain('Your Requests');
    expect(marketplaceBlock).toContain('Development Payment Mode');
    expect(marketplaceBlock).toContain('Temporary Development Mode');
    expect(marketplaceBlock).toContain('Placeholder payment approved.');
    expect(marketplaceBlock).not.toContain('Stripe');
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
    const postCardBlock = source.match(/function PostCard\([\s\S]*?\n}\n\nfunction Home/)?.[0] || '';
    const actionIconBlock = source.match(/function ActionIcon\([\s\S]*?\n}\n\nfunction PostCard/)?.[0] || '';
    expect(postCardBlock).toContain('interaction-bar');
    expect(actionIconBlock).toContain("name === 'like'");
    expect(actionIconBlock).toContain("name === 'reply'");
    expect(actionIconBlock).toContain("name === 'echo'");
    expect(actionIconBlock).toContain("name === 'bookmark'");
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
});
