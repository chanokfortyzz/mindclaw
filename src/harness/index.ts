/**
 * Mindclaw OpenClaw Plugin (Harness)
 *
 * This is the Gateway-side plugin that hooks into OpenClaw's plugin lifecycle.
 * It runs INSIDE the Gateway process and provides:
 *   - Accurate channel detection from Gateway context (messageProvider, sessionKey)
 *   - Channel hints shared with the proxy via globalThis
 *   - LLM input/output lifecycle hooks
 *
 * Install: copy this directory to ~/.openclaw/extensions/mindclaw/
 * Config: add "mindclaw" to plugins.allow in openclaw.json
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = process.env.MINDCLAW_LOG || '/tmp/mindclaw-harness.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [mindclaw-harness] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  console.error(line.trim());
}

const state = {
  callCount: 0,
  channels: new Map<string, number>(),
};

/**
 * Extract channel identifier from Gateway event/context.
 *
 * Priority:
 *   1. ctx.messageProvider (most reliable — set by Gateway)
 *   2. ctx.sessionKey parsing ("agent:<agentId>:<channel>:<chatType>:<userId>")
 *   3. ctx.OriginatingChannel / ctx.Surface / ctx.Provider (legacy)
 *   4. event.provider string matching
 */
function extractChannel(event: any, ctx: any): string {
  if (ctx?.messageProvider) {
    return String(ctx.messageProvider).trim().toLowerCase();
  }

  const sk = String(ctx?.sessionKey || '');
  const parts = sk.split(':');
  if (parts.length >= 3 && parts[2]) {
    return parts[2].toLowerCase();
  }

  const ctxChannel = ctx?.OriginatingChannel || ctx?.Surface || ctx?.Provider || '';
  if (ctxChannel) return String(ctxChannel).trim().toLowerCase();

  if (event?.provider) {
    const p = String(event.provider).toLowerCase();
    if (p.includes('yuanbao')) return 'yuanbao';
    if (p.includes('weixin') || p.includes('wechat')) return 'openclaw-weixin';
    if (p.includes('discord')) return 'discord';
  }

  return 'default';
}

/**
 * Share channel info with the Mindclaw proxy process.
 * The proxy reads globalThis.__mindclaw_channel_hint to get accurate channel detection.
 */
function setChannelHint(channel: string) {
  (globalThis as any).__mindclaw_channel_hint = channel;
  (globalThis as any).__mindclaw_channel_hint_ts = Date.now();
  // Legacy compat
  (globalThis as any).__openclaw_channel_hint = channel;
  (globalThis as any).__openclaw_channel_hint_ts = Date.now();
}

log('MODULE LOADED');

export function register(api: any) {
  log('REGISTER CALLED (mindclaw-harness v1)');

  api.on('before_prompt_build', async (event: any, ctx: any) => {
    const channel = extractChannel(event, ctx);
    setChannelHint(channel);
    log(`HOOK: before_prompt_build channel=${channel}, provider=${ctx?.messageProvider || 'none'}, agentId=${ctx?.agentId || '?'}`);
    return { systemPrompt: event.prompt, prependContext: '' };
  });

  api.on('llm_input', async (event: any, ctx: any) => {
    state.callCount++;
    const channel = extractChannel(event, ctx);
    setChannelHint(channel);
    state.channels.set(channel, (state.channels.get(channel) || 0) + 1);
    log(`HOOK: llm_input #${state.callCount} channel=${channel}, model=${event?.model || '?'}`);
  });

  api.on('llm_output', async (event: any, ctx: any) => {
    log('HOOK: llm_output triggered');
  });

  log('ALL HOOKS REGISTERED');
}
