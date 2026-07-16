import { describe, expect, it, vi } from 'vitest';
import {
  extractRichLinkPreview,
  normalizeMediaAsset,
  validateHttpsUrl,
  validateMediaFile,
  validateRemoteMediaUrl,
} from './media.js';

function file(name, type, size = 1024) {
  return new File([new Uint8Array(size)], name, { type });
}

describe('Portal MediaService', () => {
  it('requires HTTPS remote media URLs', () => {
    expect(validateHttpsUrl('https://cdn.useportalnow.com/image.jpg').hostname).toBe('cdn.useportalnow.com');
    expect(() => validateHttpsUrl('http://cdn.useportalnow.com/image.jpg')).toThrow('HTTPS');
    expect(() => validateHttpsUrl('not-a-url')).toThrow('valid URLs');
  });

  it('rejects unsafe and unsupported uploads before publishing', () => {
    expect(() => validateMediaFile(file('avatar.svg', 'image/svg+xml'), 'profile')).toThrow('not supported');
    expect(() => validateMediaFile(file('clip.mp4', 'video/mp4'), 'profile')).toThrow('does not support');
    expect(() => validateMediaFile(file('huge.jpg', 'image/jpeg', 11 * 1024 * 1024), 'profile')).toThrow('too large');
    expect(validateMediaFile(file('photo.webp', 'image/webp'), 'post').name).toBe('photo.webp');
  });

  it('normalises invalid media into the unavailable state', () => {
    expect(normalizeMediaAsset('https://cdn.useportalnow.com/photo.avif').status).toBe('ready');
    expect(normalizeMediaAsset('http://cdn.useportalnow.com/photo.avif').status).toBe('unavailable');
    expect(normalizeMediaAsset(null, 'video')).toMatchObject({ status: 'unavailable', kind: 'video' });
  });

  it('validates reachable remote media metadata', async () => {
    const headers = new Headers({ 'content-type': 'image/jpeg' });
    globalThis.fetch = vi.fn(async () => ({ ok: true, headers }));
    await expect(validateRemoteMediaUrl('https://cdn.useportalnow.com/photo.jpg')).resolves.toMatchObject({ kind: 'image' });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn.useportalnow.com/photo.jpg', expect.objectContaining({ method: 'HEAD' }));
  });

  it('uses secure links for rich previews', () => {
    expect(extractRichLinkPreview('Read https://useportalnow.com/story')).toMatchObject({ domain: 'useportalnow.com' });
    expect(extractRichLinkPreview('Read http://useportalnow.com/story')).toBeNull();
  });
});
