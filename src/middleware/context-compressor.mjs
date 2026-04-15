/**
 * Context Compressor Middleware
 *
 * When conversation history is too long, compresses older messages
 * to stay within token budget.
 */

import { pipeline } from '../pipeline.mjs';

pipeline.use('context-compressor', async ({ request, config, context }) => {
  if (!request.messages || request.messages.length <= 6) return {};

  const maxMessages = 40;
  if (request.messages.length <= maxMessages) return {};

  // Keep system message + last N messages, summarize middle
  const system = request.messages[0];
  const recent = request.messages.slice(-maxMessages + 1);
  const dropped = request.messages.length - maxMessages;

  request.messages = [system, ...recent];

  return {
    request,
    meta: { compressed: true, droppedMessages: dropped, remaining: request.messages.length },
  };
});
