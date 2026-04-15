/**
 * Memory Loop Middleware
 *
 * Reads facts and execution lessons from JSON files,
 * injects relevant ones into the system prompt,
 * and records new events after responses.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '../pipeline.mjs';

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
  } catch {}
}

function selectRelevant(items, message, limit = 5) {
  if (!items.length) return [];
  // Score by keyword overlap with user message
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = items.map(item => {
    const text = JSON.stringify(item.event || item).toLowerCase();
    const hits = words.filter(w => text.includes(w)).length;
    return { item, score: hits };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).filter(s => s.score > 0).map(s => s.item);
}

pipeline.use('memory-loop', async ({ request, config, context }) => {
  if (!config.modules?.memoryLoop) return {};

  const sysMsg = request.messages?.[0];
  if (!sysMsg || (sysMsg.role !== 'system' && sysMsg.role !== 'developer')) return {};

  const userMsg = request.messages?.findLast(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';

  const facts = readJson(config.memory?.factsPath);
  const lessons = readJson(config.memory?.lessonsPath);

  const relevantFacts = selectRelevant(facts, text, 5);
  const relevantLessons = selectRelevant(lessons, text, 3);

  if (relevantFacts.length === 0 && relevantLessons.length === 0) {
    return { meta: { facts: 0, lessons: 0 } };
  }

  const parts = [];
  if (relevantFacts.length > 0) {
    const factLines = relevantFacts.map(f => {
      const e = f.event || f;
      return `- ${e.message || e.content || JSON.stringify(e).slice(0, 100)}`;
    });
    parts.push(`## Known Facts\n${factLines.join('\n')}`);
  }
  if (relevantLessons.length > 0) {
    const lessonLines = relevantLessons.map(l => {
      const e = l.event || l;
      return `- ${e.tool_name || ''}: ${e.message || e.content || JSON.stringify(e).slice(0, 100)}`;
    });
    parts.push(`## Execution Lessons\n${lessonLines.join('\n')}`);
  }

  sysMsg.content += '\n\n' + parts.join('\n\n');

  // Store user message as fact for future reference
  context._memoryUserMsg = text;

  return {
    request,
    meta: { facts: relevantFacts.length, lessons: relevantLessons.length },
  };
});

// Record user interaction after response
pipeline.onResponse('memory-loop', async ({ response, context, config }) => {
  if (!config.modules?.memoryLoop) return;
  if (!context._memoryUserMsg) return;

  const factsPath = config.memory?.factsPath;
  if (!factsPath) return;

  const facts = readJson(factsPath);
  const maxFacts = config.memory?.maxFacts || 200;

  facts.push({
    ts: new Date().toISOString(),
    bucket: 'fact',
    event: { type: 'user_message', channel: context.channel, message: context._memoryUserMsg },
  });

  // Prune old entries
  while (facts.length > maxFacts) facts.shift();

  writeJson(factsPath, facts);
});
