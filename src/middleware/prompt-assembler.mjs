/**
 * Prompt Assembler Middleware
 *
 * Enriches the system prompt with channel-specific instructions.
 * Memory injection is now handled by memory-loop with scope-aware ranking.
 * This middleware only handles channel prepend and scope annotation.
 */

import { pipeline } from '../pipeline.mjs';

pipeline.use('prompt-assembler', async ({ request, config, context }) => {
  const sysMsg = request.messages?.[0];
  if (!sysMsg || (sysMsg.role !== 'system' && sysMsg.role !== 'developer')) {
    return {};
  }

  const scope = context.scope || {};
  const channelConfig = config.channels?.[scope.channel]
    || config.channels?.[context.channel]
    || config.channels?.default
    || {};

  const parts = [];

  // Channel-specific prepend
  if (channelConfig.prepend) {
    parts.push(channelConfig.prepend);
  }

  // Scope annotation so the LLM knows its context
  if (scope.routeTag && scope.routeTag !== 'unknown@default') {
    parts.push(`[Session scope: agent=${scope.agentId}, channel=${scope.channel}, type=${scope.chatType}]`);
  }

  // Original system prompt
  parts.push(sysMsg.content);

  sysMsg.content = parts.join('\n');
  return {
    request,
    meta: { channel: scope.channel || context.channel, enriched: parts.length > 1 },
  };
});
