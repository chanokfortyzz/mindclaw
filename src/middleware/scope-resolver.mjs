/**
 * Scope Resolver Middleware
 *
 * Normalizes scope fields (agentId, channel, chatType, routeTag)
 * so that all downstream middleware — memory, trace, cache — use
 * a single canonical scope. This is the FIRST enrichment middleware.
 *
 * Canonical routeTag format: "<agentId>@<channel>"
 */

import { pipeline } from '../pipeline.mjs';

/**
 * Normalize a raw scope bag into canonical form.
 * Exported so migration scripts and tests can reuse the same logic.
 */
export function normalizeScope(raw = {}) {
  const agentId = clean(raw.agentId || raw.agent_id || raw.agent || 'unknown');
  const channel = clean(raw.channel || raw.channelId || raw.provider || 'default');
  const chatType = clean(raw.chatType || raw.chat_type || 'chat');
  const routeTag = `${agentId}@${channel}`;

  return { agentId, channel, chatType, routeTag };
}

/**
 * Score how well a stored scope matches a target scope.
 * Returns 0-100. Higher = better match.
 */
export function scopeScore(stored, target) {
  if (!stored || !target) return 0;
  let score = 0;

  // Exact routeTag match is strongest signal
  if (stored.routeTag && stored.routeTag === target.routeTag) return 100;

  // agentId match
  if (stored.agentId && stored.agentId === target.agentId) score += 50;

  // channel match
  if (stored.channel && stored.channel === target.channel) score += 30;

  // chatType match
  if (stored.chatType && stored.chatType === target.chatType) score += 10;

  // Penalize known noise channels
  if (isNoiseChannel(stored.channel)) score -= 40;

  return Math.max(0, Math.min(100, score));
}

/**
 * Build a deterministic cache key that prevents cross-scope pollution.
 */
export function scopeCacheKey(scope, messageHash) {
  return `${scope.routeTag}:${scope.chatType}:${messageHash || ''}`;
}

// --- internals ---

const NOISE_CHANNELS = new Set(['heartbeat', 'ping', 'health', 'default']);

function isNoiseChannel(ch) {
  return NOISE_CHANNELS.has(ch);
}

function clean(val) {
  return String(val || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'unknown';
}

// --- Pipeline middleware: extract scope from request + harness hints ---

pipeline.use('scope-resolver', async ({ request, config, context }) => {
  // Gather raw scope from all available sources
  const raw = {};

  // 1. Global hints set by harness plugin (most reliable)
  const hint = globalThis.__mindclaw_scope_hint;
  if (hint && typeof hint === 'object') {
    Object.assign(raw, hint);
  }

  // 2. Request metadata
  const meta = request.metadata || request.meta || {};
  if (meta.agentId) raw.agentId = meta.agentId;
  if (meta.channel) raw.channel = meta.channel;
  if (meta.chatType) raw.chatType = meta.chatType;

  // 3. Context channel (from pipeline.detectChannel)
  if (!raw.channel && context.channel && context.channel !== 'default') {
    raw.channel = context.channel;
  }

  // Normalize
  const scope = normalizeScope(raw);
  context.scope = scope;

  return { meta: { scope } };
});
