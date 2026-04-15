/**
 * Trace Logger Middleware
 *
 * Records every LLM request passing through the proxy for diagnostics.
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

  const entry = {
    _ts: new Date().toISOString(),
    channel: context.channel,
    model: context.model,
    url: context.url,
    messageCount: request.messages?.length || 0,
    middlewareResults: context.middlewareResults,
  };

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {}

  return { meta: { logged: true } };
});
