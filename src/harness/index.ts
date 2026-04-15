/**
 * Mindclaw OpenClaw Plugin (Harness)
 *
 * Gateway-side plugin that hooks into OpenClaw's plugin lifecycle.
 * Runs INSIDE the Gateway process and provides:
 *   - Accurate scope detection from Gateway context
 *   - Scope hints shared with the proxy via globalThis
 *   - LLM input/output lifecycle hooks
 *   - Provider-agnostic: works the same regardless of upstream LLM provider
 *
 * Install: copy this directory to ~/.openclaw/extensions/mindclaw/
 * Config: add "mindclaw" to plugins.allow in openclaw.json
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = process.env.MINDCLAW_LOG || '/tmp/mindclaw-harness.log';

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  const line = `[${new Date().toISOString()}] [mindclaw-harness] [${level}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err: any) {
    // Do NOT silently swallow — write to stderr as fallback
    console.error(`[mindclaw-harness] LOG WRITE FAILED: ${err.message}`);
    console.error(line.trim());
  }
}

const state = {
  callCount: 0,
  channels: new Map<string, number>(),
};

/**
 * Extract full scope from Gateway event/context.
 * Returns { agentId, channel, chatType } — the proxy's scope-resolver
 * will normalize these into canonical routeTag format.
 */
function extractScope(event: any, ctx: any): { agentId: string; channel: string; chatType: string } {
  let agentId = 'unknown';
  let channel = 'default';
  let chatType = 'chat';

  // 1. Direct context fields (most reliable)
  if (ctx?.agentId) agentId = String(ctx.agentId).trim();
  if (ctx?.messageProvider) channel = String(ctx.messageProvider).trim().toLowerCase();

  // 2. Parse sessionKey: "agent:<agentId>:<channel>:<chatType>:<userId>"
  const sk = String(ctx?.sessionKey || '');
  const parts = sk.split(':');
  if (parts.length >= 3) {
    if (parts[1] && agentId === 'unknown') agentId = parts[1];
    if (parts[2] && channel === 'default') channel = parts[2].toLowerCase();
    if (parts[3]) chatType = parts[3].toLowerCase();
  }

  // 3. Legacy fallbacks
  if (channel === 'default') {
    const legacy = ctx?.OriginatingChannel || ctx?.Surface || ctx?.Provider || '';
    if (legacy) channel = String(legacy).trim().toLowerCase();
  }
  if (channel === 'default' && event?.provider) {
    channel = String(event.provider).trim().toLowerCase();
  }

  return { agentId, channel, chatType };
}

/**
 * Share scope with the Mindclaw proxy process.
 * The proxy's scope-resolver reads globalThis.__mindclaw_scope_hint.
 */
function setScopeHint(scope: { agentId: string; channel: string; chatType: string }) {
  (globalThis as any).__mindclaw_scope_hint = { ...scope };
  (globalThis as any).__mindclaw_scope_hint_ts = Date.now();
  // Keep legacy channel hint for backward compat with pipeline.detectChannel
  (globalThis as any).__mindclaw_channel_hint = scope.channel;
  (globalThis as any).__mindclaw_channel_hint_ts = Date.now();
}

log('MODULE LOADED');

export function register(api: any) {
  log('REGISTER CALLED (mindclaw-harness v2 — scope-aware)');

  api.on('before_prompt_build', async (event: any, ctx: any) => {
    const scope = extractScope(event, ctx);
    setScopeHint(scope);
    log(`HOOK: before_prompt_build scope=${JSON.stringify(scope)}, provider=${ctx?.messageProvider || 'none'}`);
    return { systemPrompt: event.prompt, prependContext: '' };
  });

  api.on('llm_input', async (event: any, ctx: any) => {
    state.callCount++;
    const scope = extractScope(event, ctx);
    setScopeHint(scope);
    state.channels.set(scope.channel, (state.channels.get(scope.channel) || 0) + 1);
    log(`HOOK: llm_input #${state.callCount} scope=${JSON.stringify(scope)}, model=${event?.model || '?'}`);
  });

  api.on('llm_output', async (event: any, ctx: any) => {
    const scope = extractScope(event, ctx);
    log(`HOOK: llm_output scope=${JSON.stringify(scope)}`);
  });

  log('ALL HOOKS REGISTERED');
}
