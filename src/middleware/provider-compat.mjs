/**
 * Provider Compat Middleware
 *
 * Fixes compatibility issues with different LLM providers.
 * e.g., gpt-agent doesn't support thinking/developer roles.
 */

import { pipeline } from '../pipeline.mjs';

pipeline.use('provider-compat', async ({ request, config, context }) => {
  const url = context.url || '';

  // gpt-agent compatibility: strip thinking, convert developer -> system
  if (url.includes('gpt-agent') || request.model?.includes('claude')) {
    delete request.thinking;
    delete request.thinking_budget;

    if (Array.isArray(request.messages)) {
      request.messages = request.messages
        .filter(m => m && m.role && m.role !== 'thinking')
        .map(m => (m.role === 'developer' ? { ...m, role: 'system' } : m));
    }

    return { request, meta: { provider: 'gpt-agent', fixed: true } };
  }

  return {};
});
