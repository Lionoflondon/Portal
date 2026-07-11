import test from 'node:test';
import assert from 'node:assert/strict';
import { echoKey, echoNotificationId, isEchoablePost, nextEchoCount } from './echo-engine.js';

test('only public moderated Posts can be Echoed', () => {
  assert.equal(isEchoablePost({ authorUid: 'author', visibility: 'public', moderationState: 'approved' }), true);
  assert.equal(isEchoablePost({ authorUid: 'author', visibility: 'private', moderationState: 'approved' }), false);
  assert.equal(isEchoablePost({ authorUid: 'author', visibility: 'public', draft: true }), false);
});

test('Echo identity is one deterministic record per user and source Post', () => {
  assert.equal(echoKey('post-1', 'user-1'), 'post-1_user-1');
  assert.equal(echoKey('post-1', 'user-1'), echoKey('post-1', 'user-1'));
  assert.equal(echoNotificationId('post-1', 'user-1'), 'echo_post-1_user-1');
});

test('Echo counters never decrement below zero', () => {
  assert.equal(nextEchoCount(0, -1), 0);
  assert.equal(nextEchoCount(2, -1), 1);
  assert.equal(nextEchoCount(1, 1), 2);
});
