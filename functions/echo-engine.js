export function isEchoablePost(post = {}) {
  return Boolean(post.authorUid || post.createdBy)
    && post.visibility === 'public'
    && post.draft !== true
    && post.deleted !== true
    && post.moderationState !== 'rejected'
    && post.moderationState !== 'removed';
}

export function echoKey(postId, uid) { return `${postId}_${uid}`; }

export function nextEchoCount(current, delta) { return Math.max(0, (Number(current) || 0) + delta); }

export function echoNotificationId(postId, echoingUid) { return `echo_${postId}_${echoingUid}`; }
