import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  modules: {
    promptAssembler: true,
    skillRouter: true,
    memoryLoop: true,
    contextCompressor: true,
    taskAnalyzer: true,
    riskGate: true,
    traceLogger: true,
  },
  skills: {
    scanDirs: [],
    builtIn: {},
  },
  memory: {
    factsPath: '',
    lessonsPath: '',
    maxFacts: 200,
    maxLessons: 200,
    pruneAfterDays: 7,
  },
  channels: {
    default: { prepend: '' },
  },
  trace: {
    enabled: true,
    logPath: '',
  },
};

export function loadConfig(configPath) {
  if (configPath && fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return deepMerge(DEFAULTS, raw);
  }

  // Auto-detect: look for mindclaw.json in cwd, then ~/.openclaw/
  const candidates = [
    path.join(process.cwd(), 'mindclaw.json'),
    path.join(process.env.HOME || '', '.openclaw', 'mindclaw.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      console.log(`[mindclaw] config loaded from ${p}`);
      return deepMerge(DEFAULTS, raw);
    }
  }

  console.log('[mindclaw] no config file found, using defaults');
  return { ...DEFAULTS };
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
