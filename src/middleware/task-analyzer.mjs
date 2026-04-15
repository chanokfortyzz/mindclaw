/**
 * Task Analyzer Middleware
 *
 * Classifies user messages by complexity (simple/medium/complex)
 * and annotates context for downstream routing decisions.
 */

import { pipeline } from '../pipeline.mjs';

const COMPLEX_PATTERNS = [
  /整个项目|全部文件|所有js|批量|大规模/,
  /重构|迁移|改造|升级|重写/,
  /typescript|ts迁移|模块化|架构/,
  /超过\s*\d+\s*个文件|几十个|上百个/,
  /refactor|migrate|rewrite|overhaul/i,
];

const SIMPLE_PATTERNS = [
  /解释一下|查一下|什么是|怎么写/,
  /简单的|一个小问题|举个例子/,
  /explain|what is|how to|example/i,
];

function analyze(message) {
  const msg = typeof message === 'string' ? message.toLowerCase() : String(message || '').toLowerCase();

  for (const p of SIMPLE_PATTERNS) {
    if (p.test(msg)) return { level: 'simple', reason: 'simple query pattern' };
  }
  for (const p of COMPLEX_PATTERNS) {
    if (p.test(msg)) return { level: 'complex', reason: `complex pattern: ${p.source}` };
  }

  const fileMatch = msg.match(/(\d+)\s*个文件/);
  if (fileMatch) {
    const count = parseInt(fileMatch[1]);
    if (count > 5) return { level: 'complex', reason: `estimated ${count} files` };
  }

  return { level: 'medium', reason: 'undetermined' };
}

pipeline.use('task-analyzer', async ({ request, config, context }) => {
  if (!config.modules?.taskAnalyzer) return {};

  const userMsg = request.messages?.findLast(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';
  if (!text) return {};

  const result = analyze(text);
  context.taskAnalysis = result;

  return { meta: result };
});

export { analyze };
