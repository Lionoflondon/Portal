import { useState } from 'react';
import { normalizeMediaAsset } from '../services/media.js';

export function UnavailableMedia({ label = 'Media unavailable', detail = 'This media could not be loaded safely.' }) {
  return <div className="unavailable-media" role="img" aria-label={label}><span className="unavailable-media-mark" aria-hidden="true">◌</span><strong>{label}</strong><small>{detail}</small></div>;
}

export function PortalMedia({ asset, alt = '', className = '', kind, fallbackLabel = 'Media unavailable' }) {
  const [failed, setFailed] = useState(false);
  const media = normalizeMediaAsset(asset, kind);
  if (failed || media.status !== 'ready') return <UnavailableMedia label={fallbackLabel} />;
  const classes = ['portal-media', className].filter(Boolean).join(' ');
  if (media.kind === 'image') {
    return <img className={classes} src={media.url} alt={media.alt || alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  if (media.kind === 'video') {
    return <video className={classes} src={media.url} poster={media.posterUrl || media.thumbnailUrl || undefined} controls preload="metadata" playsInline onError={() => setFailed(true)} />;
  }
  if (media.kind === 'audio') {
    return <audio className={classes} src={media.url} controls preload="metadata" />;
  }
  if (media.kind === 'document') {
    return <a className={`${classes} document-media`} href={media.url} target="_blank" rel="noreferrer">{media.name || 'Open document'}</a>;
  }
  return <UnavailableMedia label={fallbackLabel} />;
}
