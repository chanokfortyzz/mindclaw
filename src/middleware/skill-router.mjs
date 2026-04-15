/**
 * Skill Router Middleware
 *
 * Detects skill triggers in user messages and injects skill hints
 * into the system prompt. Skills are loaded from config.skills.scanDirs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from '../pipeline.mjs';

let skillIndex = null;

function scanSkills(config) {
  if (skillIndex) return skillIndex;
  skillIndex = [];

  const dirs = config.skills?.scanDirs || [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      try {
        const content = fs.readFileSync(skillMd, 'utf-8');
        const triggers = extractTriggers(content);
        skillIndex.push({
          name: entry.name,
          path: skillMd,
          triggers,
          description: extractField(content, 'description') || entry.name,
        });
      } catch {}
    }
  }

  // Merge built-in triggers
  for (const [name, triggers] of Object.entries(config.skills?.builtIn || {})) {
    if (!skillIndex.find(s => s.name === name)) {
      skillIndex.push({ name, path: '', triggers, description: name });
    }
  }

  return skillIndex;
}

function extractTriggers(content) {
  const match = content.match(/^triggers:\s*(.+)$/m);
  if (match) return match[1].split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : '';
}

function matchTriggers(message, triggers) {
  const msg = message.toLowerCase();
  for (const trigger of triggers) {
    // Direct match
    if (msg.includes(trigger.toLowerCase())) return true;
    // Regex match
    try {
      if (new RegExp(trigger, 'i').test(msg)) return true;
    } catch {}
  }
  return false;
}

pipeline.use('skill-router', async ({ request, config, context }) => {
  if (!config.modules?.skillRouter) return {};

  const sysMsg = request.messages?.[0];
  if (!sysMsg || (sysMsg.role !== 'system' && sysMsg.role !== 'developer')) return {};

  const userMsg = request.messages?.findLast(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';
  if (!text) return {};

  const skills = scanSkills(config);
  const matched = skills.filter(s => matchTriggers(text, s.triggers));

  if (matched.length === 0) return { meta: { matched: [] } };

  // Inject skill hints into system prompt
  const hints = matched.map(s =>
    `[Skill: ${s.name}] ${s.description}${s.path ? ` — load from ${s.path}` : ''}`
  ).join('\n');

  sysMsg.content += `\n\n## Available Skills\n${hints}`;

  return {
    request,
    meta: { matched: matched.map(s => s.name) },
  };
});
