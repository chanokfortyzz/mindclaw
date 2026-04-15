/**
 * Memory Loop Middleware
 *
 * Reads facts and execution lessons from JSON files,
 * ranks them by scope relevance + keyword overlap + freshness,
 * injects the top-k into the system prompt,
 * and records new events with canonical scope after responses.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '../pipeline.mjs';
import { normalizeScope, scopeScore } from './scope-resolver.mjs';

// --- JSON helpers ---

function readJson(filePath, fallback = []) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error('[mindclaw] memory write error:', err.message);
  }
}

// --- Ranking engine ---

const MAX_FACTS = 6;
const MAX_LESSONS = 4;
const FRESHNESS_HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Score a single memory item against current scope + user message.
 * Returns a number; higher = more relevant.
 */
function scoreItem(item, targetScope, messageWords) {
  let score = 0;

  // 1. Scope relevance (0-100, weight 0.5)
  const itemScope = normalizeScope(item.scope || item.event || item);
  score += scopeScore(itemScope, targetScope) * 0.5;

  // 2. Keyword overlap (weight 0.3)
  const text = JSON.stringify(item.event || item).toLowerCase();
  const hits = messageWords.filter(w => text.includes(w)).length;
  const keywordScore = messageWords.length > 0
    ? (hits / messageWords.length) * 100
    : 0;
  score += keywordScore * 0.3;

  // 3. Freshness (weight 0.2)
  const ts = item.ts ? new Date(item.ts).getTime() : 0;
  const age = Date.now() - ts;
  const freshness = Math.exp(-age / FRESHNESS_HALF_LIFE_MS) * 100;
  score += freshness * 0.2;

  return score;
}

function selectRelevant(items, targetScope, message, limit) {
  if (!items.length) return [];
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = items.map(item => ({
    item,
    score: scoreItem(item, targetScope, words),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).filter(s => s.score > 0).map(s => s.item);
}

// --- Pipeline middleware ---

pipeline.use('memory-loop', async ({ request, config, context }) => {
  if (!config.modules?.memoryLoop) return {};

  const sysMsg = request.messages?.[0];
  if (!sysMsg || (sysMsg.role !== 'system' && sysMsg.role !== 'developer')) return {};

  const userMsg = request.messages?.findLast(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';

  const targetScope = context.scope || normalizeScope({});

  const facts = readJson(config.memory?.factsPath);
  const lessons = readJson(config.memory?.lessonsPath);

  const relevantFacts = selectRelevant(facts, targetScope, text, MAX_FACTS);
  const relevantLessons = selectRelevant(lessons, targetScope, text, MAX_LESSONS);

  if (relevantFacts.length === 0 && relevantLessons.length === 0) {
    return { meta: { facts: 0, lessons: 0, scope: targetScope } };
  }

  const parts = [];
  if (relevantFacts.length > 0) {
    const factLines = relevantFacts.map(f => {
      const e = f.event || f;
      return `- ${e.message || e.content || JSON.stringify(e).slice(0, 100)}`;
    });
    parts.push(`## Factual Memory Snapshot\n${factLines.join('\n')}`);
  }
  if (relevantLessons.length > 0) {
    const lessonLines = relevantLessons.map(l => {
      const e = l.event || l;
      return `- ${e.tool_name || ''}: ${e.message || e.content || JSON.stringify(e).slice(0, 100)}`;
    });
    parts.push(`## Execution Lessons Snapshot\n${lessonLines.join('\n')}`);
  }

  sysMsg.content += '\n\n' + parts.join('\n\n');
  context._memoryUserMsg = text;

  return {
    request,
    meta: {
      facts: relevantFacts.length,
      lessons: relevantLessons.length,
      scope: targetScope,
    },
  };
});

// --- Record user interaction after response (with canonical scope) ---

pipeline.onResponse('memory-loop', async ({ response, context, config }) => {
  if (!config.modules?.memoryLoop) return;
  if (!context._memoryUserMsg) return;

  const factsPath = config.memory?.factsPath;
  if (!factsPath) return;

  const scope = context.scope || normalizeScope({});
  const facts = readJson(factsPath);
  const maxFacts = config.memory?.maxFacts || 200;

  facts.push({
    ts: new Date().toISOString(),
    bucket: 'fact',
    scope: { ...scope },
    event: {
      type: 'user_message',
      channel: scope.channel,
      agentId: scope.agentId,
      routeTag: scope.routeTag,
      message: context._memoryUserMsg,
    },
  });

  while (facts.length > maxFacts) facts.shift();
  writeJson(factsPath, facts);
});
