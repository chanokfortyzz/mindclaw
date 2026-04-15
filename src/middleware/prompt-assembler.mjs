/**
 * Prompt Assembler Middleware
 *
 * Enriches the system prompt with channel-specific instructions,
 * memory context, and skill hints.
 */

import { pipeline } from '../pipeline.mjs';

pipeline.use('prompt-assembler', async ({ request, config, context }) => {
  const sysMsg = request.messages?.[0];
  if (!sysMsg || (sysMsg.role !== 'system' && sysMsg.role !== 'developer')) {
    return {};
  }

  const channelConfig = config.channels?.[context.channel] || config.channels?.default || {};
  const parts = [];

  // Channel-specific prepend
  if (channelConfig.prepend) {
    parts.push(channelConfig.prepend);
  }

  // Original system prompt
  parts.push(sysMsg.content);

  sysMsg.content = parts.join('\n');
  return { request, meta: { channel: context.channel, enriched: parts.length > 1 } };
});
