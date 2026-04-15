/**
 * Provider Compat Middleware
 *
 * Fixes compatibility issues with different LLM providers.
 * Many OpenAI-compatible proxies don't support thinking/developer roles.
 */

import { pipeline } from '../pipeline.mjs';

pipeline.use('provider-compat', async ({ request, config, context }) => {
  // Strip non-standard fields that some providers reject
  const hasThinking = 'thinking' in request || 'thinking_budget' in request;
  const hasDeveloper = Array.isArray(request.messages) && request.messages.some(m => m.role === 'developer' || m.role === 'thinking');

  if (!hasThinking && !hasDeveloper) return {};

  delete request.thinking;
  delete request.thinking_budget;

  if (Array.isArray(request.messages)) {
    request.messages = request.messages
      .filter(m => m && m.role && m.role !== 'thinking')
      .map(m => (m.role === 'developer' ? { ...m, role: 'system' } : m));
  }

  return { request, meta: { fixed: true } };
});
