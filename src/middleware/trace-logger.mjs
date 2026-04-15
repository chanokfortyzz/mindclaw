/**
 * Trace Logger Middleware
 *
 * Records every LLM request passing through the proxy for diagnostics.
 * NEVER silently swallows errors — logs to stderr as fallback.
 * Includes scope, memory injection stats, and middleware results.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '../pipeline.mjs';

let logPath = '';

pipeline.use('trace-logger', async ({ request, config, context }) => {
  if (!config.trace?.enabled) return {};

  if (!logPath) {
    logPath = config.trace?.logPath
      || path.join(process.env.HOME || '/tmp', '.openclaw', 'logs', 'mindclaw-trace.jsonl');
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const memoryMeta = context.middlewareResults?.['memory-loop'] || {};
  const scope = context.scope || {};

  const entry = {
    _ts: new Date().toISOString(),
    scope: {
      agentId: scope.agentId || null,
      channel: scope.channel || context.channel,
      chatType: scope.chatType || null,
      routeTag: scope.routeTag || null,
    },
    model: context.model,
    url: context.url,
    messageCount: request.messages?.length || 0,
    memory: {
      factCount: memoryMeta.facts ?? null,
      lessonCount: memoryMeta.lessons ?? null,
      injectedScope: memoryMeta.scope || null,
    },
    middlewareResults: context.middlewareResults,
  };

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (err) {
    // DO NOT swallow — surface the error so trace gaps are visible
    console.error(`[mindclaw] trace-logger WRITE FAILED: ${err.message}`);
    console.error('[mindclaw] trace entry:', JSON.stringify(entry));
  }

  return { meta: { logged: true } };
});
