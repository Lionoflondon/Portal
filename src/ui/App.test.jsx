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
    expect(composerBlock).toContain('Upload photos');
    expect(composerBlock).toContain('Upload video');
    expect(composerBlock).toContain('Drag photos here');
    expect(composerBlock).toContain('Auto title preview');
    expect(composerBlock).toContain('Current location');
    expect(composerBlock).not.toContain('Emoji picker');
    expect(composerBlock).not.toContain('Topic / Hashtag selector');
  });

  it('renders post media in shared Post cards', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const mediaBlock = source.match(/function PostMedia\([\s\S]*?\n}\n\nfunction PostCard/)?.[0] || '';
    expect(mediaBlock).toContain('post-photo-grid');
    expect(mediaBlock).toContain('post-video');
    expect(mediaBlock).toContain('Attached link');
    expect(mediaBlock).toContain('poll-option');
  });

  it('uses an icon-only feed interaction bar with Echo copy only in the repost menu', () => {
    const source = readFileSync(resolve('src/ui/App.jsx'), 'utf8');
    const postCardBlock = source.match(/function PostCard\([\s\S]*?\n}\n\nfunction Home/)?.[0] || '';
    expect(postCardBlock).toContain('interaction-bar');
    expect(postCardBlock).toContain('❤️ <span>{post.likeCount || 0}</span>');
    expect(postCardBlock).toContain('💬 <span>{post.replyCount || 0}</span>');
    expect(postCardBlock).toContain('🔁 <span>{post.echoCount || 0}</span>');
    expect(postCardBlock).toContain('🔖');
    expect(postCardBlock).toContain('📤');
    expect(postCardBlock).toContain("aria-label={liked ? 'Unlike' : 'Like'}");
    expect(postCardBlock).toContain('aria-label="Reply"');
    expect(postCardBlock).toContain('aria-label="Repost"');
    expect(postCardBlock).toContain("aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}");
    expect(postCardBlock).toContain('aria-label="Share"');
    expect(postCardBlock).toContain('Share this post instantly with your followers.');
    expect(postCardBlock).toContain('Share this post while adding your own thoughts.');
    expect(postCardBlock).not.toContain('Undo Echo');
    expect(postCardBlock).not.toContain('Quote Echo</button>');
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
