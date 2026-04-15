#!/usr/bin/env node
/**
 * Install Mindclaw harness plugin into an OpenClaw instance.
 *
 * Usage:
 *   node install-harness.mjs                    # auto-detect ~/.openclaw
 *   node install-harness.mjs /path/to/.openclaw # explicit path
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(__dirname, '..', 'src', 'harness');

const openclawDir = process.argv[2]
  || path.join(process.env.HOME || '', '.openclaw');

const extDir = path.join(openclawDir, 'extensions', 'mindclaw');

if (!fs.existsSync(openclawDir)) {
  console.error(`OpenClaw directory not found: ${openclawDir}`);
  process.exit(1);
}

// Copy harness files
fs.mkdirSync(extDir, { recursive: true });
for (const file of ['index.ts', 'openclaw.plugin.json', 'package.json']) {
  fs.copyFileSync(path.join(harnessDir, file), path.join(extDir, file));
}

// Add "mindclaw" to plugins.allow in openclaw.json
const configPath = path.join(openclawDir, 'openclaw.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.allow) config.plugins.allow = [];
  if (!config.plugins.allow.includes('mindclaw')) {
    config.plugins.allow.push('mindclaw');
  }
  if (!config.plugins.entries) config.plugins.entries = {};
  config.plugins.entries.mindclaw = { enabled: true };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[mindclaw] Updated ${configPath}`);
}

console.log(`[mindclaw] Harness installed to ${extDir}`);
console.log('[mindclaw] Restart OpenClaw Gateway to activate.');
