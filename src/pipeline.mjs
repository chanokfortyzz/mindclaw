import { createHash } from 'node:crypto';

/**
 * Mindclaw Pipeline — middleware chain for LLM request processing
 *
 * Each middleware receives { request, config, context } and can modify the request.
 * Middlewares are executed in order. Only LLM-bound requests are processed.
 */

const middlewares = [];
const responseHandlers = [];

function use(name, fn) {
  middlewares.push({ name, fn });
}

function onResponse(name, fn) {
  responseHandlers.push({ name, fn });
}

function messageHash(body) {
  const userMsg = body.messages?.findLast?.(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function process({ method, url, headers, body, config }) {
  // Only intercept POST requests with JSON body that look like LLM calls
  if (method !== 'POST' || !body) {
    return { body };
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body };
  }

  // Detect LLM request: has messages array with role/content
  if (!Array.isArray(parsed.messages)) {
    return { body };
  }

  const context = {
    url,
    model: parsed.model || 'unknown',
    channel: detectChannel(parsed, headers),
    timestamp: Date.now(),
    messageHash: messageHash(parsed),
    middlewareResults: {},
  };

  // Run middleware chain
  for (const mw of middlewares) {
    try {
      const result = await mw.fn({ request: parsed, config, context });
      if (result?.request) {
        parsed = result.request;
      }
      if (result?.meta) {
        context.middlewareResults[mw.name] = result.meta;
      }
    } catch (err) {
      console.error(`[mindclaw] middleware "${mw.name}" error:`, err.message);
    }
  }

  // Build cache key from scope (set by scope-resolver middleware)
  if (context.scope) {
    context.cacheKey = `${context.scope.routeTag}:${context.scope.chatType}:${context.messageHash}`;
  }

  return { body: JSON.stringify(parsed), context };
}

async function handleResponse({ response, context, config }) {
  for (const handler of responseHandlers) {
    try {
      await handler.fn({ response, context, config });
    } catch (err) {
      console.error(`[mindclaw] response handler "${handler.name}" error:`, err.message);
    }
  }
}

function detectChannel(body, headers) {
  // Check global hint (set by mindclaw harness plugin inside Gateway)
  const hint = globalThis.__mindclaw_channel_hint;
  const ts = globalThis.__mindclaw_channel_hint_ts || 0;
  if (typeof hint === 'string' && hint && (Date.now() - ts) < 30000) {
    globalThis.__mindclaw_channel_hint = '';
    return hint.trim().toLowerCase();
  }

  // Check metadata fields
  const candidates = [
    body.channel,
    body.metadata?.channel,
    body.metadata?.channelId,
    body.deliveryContext?.channel,
  ].filter(Boolean);

  if (candidates.length > 0) return String(candidates[0]).toLowerCase();

  return 'default';
}

export const pipeline = { use, onResponse, process, handleResponse };
