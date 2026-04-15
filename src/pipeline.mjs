/**
 * Mindclaw Pipeline — middleware chain for LLM request processing
 *
 * Each middleware receives { request, config, context } and can modify the request.
 * Middlewares are executed in order. Only LLM-bound requests are processed.
 */

const middlewares = [];

function use(name, fn) {
  middlewares.push({ name, fn });
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

  return { body: JSON.stringify(parsed), context };
}

function detectChannel(body, headers) {
  // Check global hint (set by mindclaw harness plugin inside Gateway)
  for (const key of ['__mindclaw_channel_hint', '__openclaw_channel_hint']) {
    const hint = globalThis[key];
    const ts = globalThis[key + '_ts'] || 0;
    if (typeof hint === 'string' && hint && (Date.now() - ts) < 30000) {
      globalThis[key] = '';
      return hint.trim().toLowerCase();
    }
  }

  // Check metadata
  const candidates = [
    body.channel,
    body.metadata?.channel,
    body.metadata?.channelId,
    body.deliveryContext?.channel,
  ].filter(Boolean);

  if (candidates.length > 0) return String(candidates[0]).toLowerCase();

  // Probe body text
  const probe = JSON.stringify(body.metadata || {});
  if (/weixin|wechat/i.test(probe)) return 'openclaw-weixin';
  if (/discord/i.test(probe)) return 'discord';
  if (/yuanbao/i.test(probe)) return 'yuanbao';

  return 'default';
}

export const pipeline = { use, process };
