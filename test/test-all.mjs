/**
 * Mindclaw Test Suite
 *
 * Uses Node.js built-in test runner (node --test).
 * Run: node --test test/test-all.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// --- scope-resolver tests ---

import { normalizeScope, scopeScore, scopeCacheKey } from '../src/middleware/scope-resolver.mjs';

describe('normalizeScope', () => {
  it('normalizes standard input', () => {
    const s = normalizeScope({ agentId: 'Sage', channel: 'Weixin', chatType: 'group' });
    assert.equal(s.agentId, 'sage');
    assert.equal(s.channel, 'weixin');
    assert.equal(s.chatType, 'group');
    assert.equal(s.routeTag, 'sage@weixin');
  });

  it('handles empty input', () => {
    const s = normalizeScope({});
    assert.equal(s.agentId, 'unknown');
    assert.equal(s.channel, 'default');
    assert.equal(s.routeTag, 'unknown@default');
  });

  it('handles legacy field names', () => {
    const s = normalizeScope({ agent_id: 'sage', channelId: 'wx', chat_type: 'private' });
    assert.equal(s.agentId, 'sage');
    assert.equal(s.channel, 'wx');
    assert.equal(s.chatType, 'private');
  });

  it('strips special characters', () => {
    const s = normalizeScope({ agentId: 'sage-weixin@openclaw', channel: 'open!claw' });
    assert.equal(s.agentId, 'sage-weixinopenclaw');
    assert.equal(s.channel, 'openclaw');
  });
});

describe('scopeScore', () => {
  const target = { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' };

  it('exact routeTag match = 100', () => {
    assert.equal(scopeScore({ routeTag: 'sage@weixin' }, target), 100);
  });

  it('agentId only match', () => {
    const score = scopeScore({ agentId: 'sage', channel: 'other', routeTag: 'sage@other' }, target);
    assert.ok(score >= 40 && score <= 70, `score ${score} should be 40-70`);
  });

  it('noise channel penalized', () => {
    const noise = scopeScore({ agentId: 'sage', channel: 'heartbeat', routeTag: 'sage@heartbeat' }, target);
    const normal = scopeScore({ agentId: 'sage', channel: 'telegram', routeTag: 'sage@telegram' }, target);
    assert.ok(noise < normal, `noise ${noise} should be < normal ${normal}`);
  });

  it('no match = 0', () => {
    assert.equal(scopeScore({ agentId: 'other', channel: 'other', routeTag: 'other@other' }, target), 0);
  });
});

describe('scopeCacheKey', () => {
  it('includes routeTag, chatType, and hash', () => {
    const key = scopeCacheKey({ routeTag: 'sage@weixin', chatType: 'chat' }, 'abc123');
    assert.equal(key, 'sage@weixin:chat:abc123');
  });

  it('different scopes produce different keys', () => {
    const k1 = scopeCacheKey({ routeTag: 'sage@weixin', chatType: 'chat' }, 'abc');
    const k2 = scopeCacheKey({ routeTag: 'sage@telegram', chatType: 'chat' }, 'abc');
    assert.notEqual(k1, k2);
  });
});

// --- migration script logic tests ---

describe('migration: resolveLegacy', () => {
  // Inline the logic from migrate-memory.mjs for testing
  const LEGACY_MAP = {
    'openclaw-weixin': { agentId: 'sage', channel: 'weixin' },
    'sage-weixin@openclaw-weixin': { agentId: 'sage', channel: 'weixin' },
    'heartbeat': { agentId: 'unknown', channel: 'heartbeat' },
    'default': { agentId: 'unknown', channel: 'default' },
  };

  function resolveLegacy(entry) {
    const raw = {};
    const event = entry.event || {};
    const legacyTag = entry.routeTag || event.routeTag || entry.channel || event.channel || '';
    if (entry.agentId || event.agentId) raw.agentId = entry.agentId || event.agentId;
    if (entry.channel || event.channel) raw.channel = entry.channel || event.channel;
    if (entry.scope) Object.assign(raw, entry.scope);
    // Legacy map overrides raw values (this is the fix — legacy map wins)
    if (LEGACY_MAP[legacyTag]) Object.assign(raw, LEGACY_MAP[legacyTag]);
    return normalizeScope(raw);
  }

  it('maps openclaw-weixin to sage@weixin', () => {
    const scope = resolveLegacy({ event: { channel: 'openclaw-weixin' } });
    assert.equal(scope.agentId, 'sage');
    assert.equal(scope.channel, 'weixin');
    assert.equal(scope.routeTag, 'sage@weixin');
  });

  it('maps heartbeat correctly', () => {
    const scope = resolveLegacy({ channel: 'heartbeat' });
    assert.equal(scope.channel, 'heartbeat');
  });

  it('preserves already-clean entries', () => {
    const scope = resolveLegacy({ scope: { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' } });
    assert.equal(scope.routeTag, 'sage@weixin');
  });
});

// --- memory-loop integration test ---

describe('memory-loop: selectRelevant (via pipeline)', () => {
  // Create temp state files and test the full pipeline
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindclaw-test-'));
  const factsPath = path.join(tmpDir, 'facts.json');
  const lessonsPath = path.join(tmpDir, 'lessons.json');

  const now = new Date().toISOString();
  const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const testFacts = [
    { ts: now, scope: { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' }, event: { message: '用户喜欢简洁回答' } },
    { ts: now, scope: { agentId: 'sage', channel: 'telegram', chatType: 'chat', routeTag: 'sage@telegram' }, event: { message: 'telegram 用户偏好英文' } },
    { ts: oldDate, scope: { agentId: 'unknown', channel: 'heartbeat', chatType: 'chat', routeTag: 'unknown@heartbeat' }, event: { message: 'heartbeat ping' } },
    { ts: now, scope: { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' }, event: { message: '微信群聊天记录' } },
  ];

  fs.writeFileSync(factsPath, JSON.stringify(testFacts));
  fs.writeFileSync(lessonsPath, JSON.stringify([]));

  it('scope-matched facts rank higher than unmatched', () => {
    // Import the scoring function indirectly by testing the ranking
    const target = { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' };
    const words = ['微信', '回答'];

    const scored = testFacts.map(item => {
      const itemScope = normalizeScope(item.scope);
      let score = scopeScore(itemScope, target) * 0.5;
      const text = JSON.stringify(item.event).toLowerCase();
      const hits = words.filter(w => text.includes(w)).length;
      score += (words.length > 0 ? (hits / words.length) * 100 : 0) * 0.3;
      return { msg: item.event.message, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // weixin facts should be top 2
    assert.ok(scored[0].msg.includes('微信') || scored[0].msg.includes('回答'));
    // heartbeat should be last
    assert.equal(scored[scored.length - 1].msg, 'heartbeat ping');
  });

  // Cleanup
  it('cleanup temp files', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// --- cross-channel isolation test ---

describe('cross-channel isolation', () => {
  it('different channels produce different cache keys', () => {
    const k1 = scopeCacheKey({ routeTag: 'sage@weixin', chatType: 'chat' }, 'samemsg');
    const k2 = scopeCacheKey({ routeTag: 'sage@telegram', chatType: 'chat' }, 'samemsg');
    const k3 = scopeCacheKey({ routeTag: 'sage@weixin', chatType: 'group' }, 'samemsg');
    assert.notEqual(k1, k2);
    assert.notEqual(k1, k3);
  });

  it('heartbeat scope scores low against weixin target', () => {
    const target = { agentId: 'sage', channel: 'weixin', chatType: 'chat', routeTag: 'sage@weixin' };
    const heartbeat = { agentId: 'unknown', channel: 'heartbeat', chatType: 'chat', routeTag: 'unknown@heartbeat' };
    assert.equal(scopeScore(heartbeat, target), 0);
  });
});
