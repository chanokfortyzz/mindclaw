#!/usr/bin/env node
/**
 * Mindclaw Memory Migration Script
 *
 * Scans old memory JSON files and normalizes all scope fields
 * to the canonical format: { agentId, channel, chatType, routeTag }.
 *
 * Usage:
 *   node bin/migrate-memory.mjs [--dir <state-dir>] [--dry-run]
 *
 * What it does:
 *   1. Backs up each file to <file>.bak-<timestamp>
 *   2. Normalizes scope fields on every entry
 *   3. Maps legacy formats (openclaw-weixin, default, heartbeat, etc.)
 *   4. Outputs a migration report
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Inline normalizeScope so the script is self-contained
function normalizeScope(raw = {}) {
  const agentId = clean(raw.agentId || raw.agent_id || raw.agent || 'unknown');
  const channel = clean(raw.channel || raw.channelId || raw.provider || 'default');
  const chatType = clean(raw.chatType || raw.chat_type || 'chat');
  const routeTag = `${agentId}@${channel}`;
  return { agentId, channel, chatType, routeTag };
}

function clean(val) {
  return String(val || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'unknown';
}

// Legacy routeTag patterns → canonical mapping
const LEGACY_MAP = {
  'openclaw-weixin': { agentId: 'sage', channel: 'weixin' },
  'sage-weixin@openclaw-weixin': { agentId: 'sage', channel: 'weixin' },
  'sage-weixin': { agentId: 'sage', channel: 'weixin' },
  'heartbeat': { agentId: 'unknown', channel: 'heartbeat' },
  'default': { agentId: 'unknown', channel: 'default' },
  'ping': { agentId: 'unknown', channel: 'ping' },
};

function resolveLegacy(entry) {
  // Try to extract raw scope from various legacy locations
  const raw = {};
  const event = entry.event || {};

  // Check for legacy routeTag directly on entry or event
  const legacyTag = entry.routeTag || event.routeTag || entry.channel || event.channel || '';

  // Pull whatever fields exist
  if (entry.agentId || event.agentId) raw.agentId = entry.agentId || event.agentId;
  if (entry.channel || event.channel) raw.channel = entry.channel || event.channel;
  if (entry.chatType || event.chatType) raw.chatType = entry.chatType || event.chatType;

  // If entry already has a scope object, merge it
  if (entry.scope && typeof entry.scope === 'object') {
    Object.assign(raw, entry.scope);
  }

  // Legacy map overrides — these are known-bad formats that must be corrected
  if (LEGACY_MAP[legacyTag]) {
    Object.assign(raw, LEGACY_MAP[legacyTag]);
  }

  return normalizeScope(raw);
}

function migrateFile(filePath, dryRun) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, status: 'skipped', reason: 'not found' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { file: filePath, status: 'error', reason: `parse error: ${err.message}` };
  }

  if (!Array.isArray(data)) {
    return { file: filePath, status: 'skipped', reason: 'not an array' };
  }

  let migrated = 0;
  let alreadyClean = 0;

  for (const entry of data) {
    const newScope = resolveLegacy(entry);
    const oldScope = entry.scope || {};

    const changed = oldScope.routeTag !== newScope.routeTag
      || oldScope.agentId !== newScope.agentId
      || oldScope.channel !== newScope.channel;

    if (changed) {
      entry.scope = newScope;
      // Also fix event-level fields for consistency
      if (entry.event) {
        entry.event.agentId = newScope.agentId;
        entry.event.channel = newScope.channel;
        entry.event.routeTag = newScope.routeTag;
      }
      migrated++;
    } else {
      alreadyClean++;
    }
  }

  if (!dryRun && migrated > 0) {
    // Backup
    const backupPath = `${filePath}.bak-${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    // Write migrated data
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  return {
    file: filePath,
    status: migrated > 0 ? (dryRun ? 'would-migrate' : 'migrated') : 'clean',
    total: data.length,
    migrated,
    alreadyClean,
  };
}

// --- Main ---

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const stateDir = values.dir || path.join(process.cwd(), 'state');
const dryRun = values['dry-run'];

console.log(`[migrate] Scanning: ${stateDir}`);
console.log(`[migrate] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log('');

// Find all JSON files in state dir
const files = [];
if (fs.existsSync(stateDir)) {
  for (const entry of fs.readdirSync(stateDir)) {
    if (entry.endsWith('.json') && !entry.endsWith('.tmp')) {
      files.push(path.join(stateDir, entry));
    }
  }
}

// Also check common legacy paths
const legacyPaths = [
  'mindclaw-facts-user.json',
  'mindclaw-facts-workspace.json',
  'mindclaw-facts-general.json',
  'mindclaw-execution-lessons.json',
  'facts.json',
  'lessons.json',
].map(f => path.join(stateDir, f));

for (const lp of legacyPaths) {
  if (fs.existsSync(lp) && !files.includes(lp)) {
    files.push(lp);
  }
}

if (files.length === 0) {
  console.log('[migrate] No memory files found.');
  process.exit(0);
}

const report = [];
for (const f of files) {
  const result = migrateFile(f, dryRun);
  report.push(result);
  const icon = result.status === 'migrated' ? 'OK' : result.status === 'would-migrate' ? 'DRY' : result.status;
  console.log(`  [${icon}] ${path.basename(f)} — ${result.migrated || 0}/${result.total || 0} entries fixed`);
}

console.log('');
console.log('[migrate] Summary:');
console.log(`  Files scanned: ${report.length}`);
console.log(`  Migrated: ${report.filter(r => r.status === 'migrated').length}`);
console.log(`  Already clean: ${report.filter(r => r.status === 'clean').length}`);
console.log(`  Errors: ${report.filter(r => r.status === 'error').length}`);
if (dryRun) console.log('  (dry run — no files were modified)');
