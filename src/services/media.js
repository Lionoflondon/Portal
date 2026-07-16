import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

export class MediaValidationError extends Error {
  constructor(message, code = 'media/invalid') {
    super(message);
    this.name = 'MediaValidationError';
    this.code = code;
  }
}

export const mediaContexts = {
  profile: { maxSize: 10 * 1024 * 1024, types: ['image/'], label: 'Profile media' },
  post: { maxSize: 100 * 1024 * 1024, types: ['image/', 'video/'], label: 'Post media' },
  event: { maxSize: 100 * 1024 * 1024, types: ['image/', 'video/'], label: 'Event media' },
  message: { maxSize: 50 * 1024 * 1024, types: ['image/', 'video/'], label: 'Message media' },
  document: { maxSize: 25 * 1024 * 1024, types: ['application/pdf', 'text/plain'], label: 'Document' },
};

const blockedExtensions = new Set(['svg', 'html', 'htm', 'js', 'mjs', 'xml']);
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']);
const videoExtensions = new Set(['mp4', 'mov', 'webm', 'm4v', 'hevc']);
const audioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg']);
const documentExtensions = new Set(['pdf', 'txt']);

export function fileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

export function safeFileName(file) {
  const extension = fileExtension(file?.name);
  const suffix = extension ? `.${extension}` : '';
  return `${crypto.randomUUID()}${suffix}`;
}

export function mediaKindFromType(contentType = '', url = '') {
  const type = String(contentType).toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || type.startsWith('text/')) return 'document';
  const extension = fileExtension(url.split('?')[0]);
  if (imageExtensions.has(extension)) return 'image';
  if (videoExtensions.has(extension)) return 'video';
  if (audioExtensions.has(extension)) return 'audio';
  if (documentExtensions.has(extension)) return 'document';
  return 'unknown';
}

export function validateHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new MediaValidationError('Media links must be valid URLs.', 'media/url-malformed');
  }
  if (parsed.protocol !== 'https:') {
    throw new MediaValidationError('Media links must use HTTPS.', 'media/url-insecure');
  }
  return parsed;
}

export function validateMediaFile(file, context = 'post') {
  if (!file) throw new MediaValidationError('Choose a file to upload.', 'media/file-missing');
  const policy = mediaContexts[context] || mediaContexts.post;
  const extension = fileExtension(file.name);
  if (blockedExtensions.has(extension) || file.type === 'image/svg+xml') {
    throw new MediaValidationError('This file type is not supported on Portal.', 'media/file-unsafe');
  }
  if (!policy.types.some((type) => file.type === type || file.type?.startsWith(type))) {
    throw new MediaValidationError(`${policy.label} does not support this file type.`, 'media/type-unsupported');
  }
  if (file.size > policy.maxSize) {
    throw new MediaValidationError(`${policy.label} is too large.`, 'media/file-too-large');
  }
  return file;
}

export async function validateRemoteMediaUrl(value, { timeoutMs = 5000 } = {}) {
  const parsed = validateHttpsUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed.toString(), { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new MediaValidationError('Remote media could not be reached.', 'media/remote-unavailable');
    const contentType = response.headers.get('content-type') || '';
    const kind = mediaKindFromType(contentType, parsed.pathname);
    if (kind === 'unknown') throw new MediaValidationError('Remote media type is not supported.', 'media/remote-unsupported');
    return { url: parsed.toString(), contentType, kind };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeMediaAsset(asset, fallbackKind = 'image') {
  if (!asset) return { status: 'unavailable', kind: fallbackKind };
  const value = typeof asset === 'string' ? { url: asset } : asset;
  if (!value.url) return { ...value, status: 'unavailable', kind: value.kind || fallbackKind };
  try {
    const parsed = validateHttpsUrl(value.url);
    const kind = value.kind || mediaKindFromType(value.contentType || value.type, parsed.pathname) || fallbackKind;
    if (kind === 'unknown') return { ...value, status: 'unavailable', kind: fallbackKind };
    return { ...value, url: parsed.toString(), kind, status: value.status || 'ready' };
  } catch {
    return { ...value, status: 'unavailable', kind: value.kind || fallbackKind };
  }
}

export function extractRichLinkPreview(text = '') {
  const match = String(text).match(/https:\/\/[^\s)]+/i)?.[0];
  if (!match) return null;
  try {
    const url = validateHttpsUrl(match).toString();
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { url, title: host, domain: host, description: 'Link shared on Portal' };
  } catch {
    return null;
  }
}

export function uploadMediaFile({ storage, path, file, context = 'post', ownerUid, onProgress, metadata = {} }) {
  validateMediaFile(file, context);
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type,
    customMetadata: {
      ownerUid: ownerUid || '',
      originalName: file.name || 'media',
      mediaContext: context,
      ...metadata,
    },
  });
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      onProgress?.(percent, snapshot);
    }, reject, async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({
          url,
          path,
          contentType: file.type,
          type: file.type,
          size: file.size,
          name: file.name || 'media',
          kind: mediaKindFromType(file.type, file.name),
          status: 'ready',
          variants: { original: url },
          thumbnailUrl: null,
          posterUrl: null,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
