/**
 * Risk Gate Middleware
 *
 * Evaluates user messages for potentially destructive or risky operations
 * and annotates the context with risk level.
 */

import { pipeline } from '../pipeline.mjs';

const CATEGORIES = {
  destructive: {
    patterns: [/rm\s+-rf/i, /drop\s+table/i, /delete\s+all/i, /format\s+disk/i, /pkill|kill\s+-9/i],
    risk: 'high',
    approval: 'require-confirm',
  },
  'provider-mutation': {
    patterns: [/切换.*模型|换.*provider|改.*api.?key/i, /change.*model|switch.*provider/i],
    risk: 'medium',
    approval: 'warn',
  },
  'system-mutation': {
    patterns: [/systemctl|service.*restart|reboot/i, /修改.*配置|改.*config/i],
    risk: 'medium',
    approval: 'warn',
  },
  'batch-write': {
    patterns: [/批量.*写入|bulk.*write|mass.*update/i],
    risk: 'medium',
    approval: 'warn',
  },
  'file-write': {
    patterns: [/写入.*文件|覆盖|overwrite/i],
    risk: 'low',
    approval: 'allow',
  },
};

function evaluate(message) {
  const msg = typeof message === 'string' ? message : String(message || '');

  for (const [category, def] of Object.entries(CATEGORIES)) {
    for (const pattern of def.patterns) {
      if (pattern.test(msg)) {
        return { risk: def.risk, category, approval: def.approval };
      }
    }
  }

  return { risk: 'none', category: 'safe', approval: 'allow' };
}

pipeline.use('risk-gate', async ({ request, config, context }) => {
  if (!config.modules?.riskGate) return {};

  const userMsg = request.messages?.findLast(m => m.role === 'user');
  const text = typeof userMsg?.content === 'string' ? userMsg.content : '';
  if (!text) return {};

  const result = evaluate(text);
  context.risk = result;

  // For high-risk operations, add a warning to system prompt
  if (result.risk === 'high') {
    const sysMsg = request.messages?.[0];
    if (sysMsg && (sysMsg.role === 'system' || sysMsg.role === 'developer')) {
      sysMsg.content += `\n\n## Risk Warning\nThis request involves a potentially destructive operation (${result.category}). Confirm with the user before executing.`;
    }
  }

  return {
    request,
    meta: result,
  };
});

export { evaluate };
