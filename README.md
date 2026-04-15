# Mindclaw

[OpenClaw](https://github.com/nicepkg/openclaw) 的可插拔 AI 中间件代理。拦截 LLM 请求流量，通过中间件管道增强提示词、管理记忆、路由技能、压缩上下文，全程不修改网关代码。

[English](#english) | 中文

## 快速开始

```bash
npm install -g mindclaw

# 启动（部署在 nginx 和 OpenClaw Gateway 之间）
mindclaw --port 7000 --upstream http://localhost:7005
```

## 架构

```
外部流量 (微信/Discord/Telegram/...)
        |
        v
   +-----------+
   |   nginx   | :443
   +-----+-----+
         v
   +-------------+
   |  Mindclaw   | :7000  <- 中间件管道
   |  Proxy      |
   +-----+-------+
         v
   +-------------+
   |  OpenClaw   | :7005  <- 网关 + harness 插件
   |  Gateway    |
   +-------------+
```

Mindclaw 是一个独立进程，纯 HTTP 层代理。如果它崩溃，网关照常运行；想禁用它，把 nginx 直接指向网关即可。零耦合。

## 中间件管道

请求按顺序经过一组中间件，每个都可以独立开关：

| 中间件 | 功能 | 配置键 |
|---|---|---|
| `provider-compat` | 修复供应商兼容性问题（thinking 角色、developer→system 转换） | 始终开启 |
| `prompt-assembler` | 按渠道注入特定的系统提示词上下文 | `promptAssembler` |
| `memory-loop` | 将相关事实和执行经验注入提示词 | `memoryLoop` |
| `skill-router` | 检测技能触发词，注入技能提示 | `skillRouter` |
| `task-analyzer` | 分析任务复杂度（简单/中等/复杂） | `taskAnalyzer` |
| `risk-gate` | 检测高风险操作（rm -rf、drop table 等），注入警告 | `riskGate` |
| `context-compressor` | 裁剪过长对话，控制 token 预算 | `contextCompressor` |
| `trace-logger` | 将所有 LLM 请求记录到 JSONL 文件 | `traceLogger` |

## 记忆系统

两个 JSON 文件，不依赖任何外部服务：

- `facts.json` — 用户消息、纠正、观察记录。按关键词与当前消息的重叠度评分，注入最相关的条目
- `lessons.json` — 工具调用、错误及其结果。让 LLM 从过去的执行经验中学习

没有向量数据库，没有 embedding，没有 Redis。对于大多数 agent 工作负载（用户用相似词汇问相似问题），关键词匹配够用了。

## 技能系统

技能是包含 `SKILL.md` 的目录：

```
skills/
  weather/
    SKILL.md    # triggers: weather, forecast, temperature
  browser/
    SKILL.md    # triggers: browse, screenshot
```

skill-router 在启动时扫描这些目录，提取触发词。匹配时将技能描述注入系统提示词，由 LLM 自行决定是否使用。Mindclaw 不执行技能，只做提示。

## 自定义中间件

```js
import { pipeline } from 'mindclaw';

// 请求中间件
pipeline.use('my-plugin', async ({ request, config, context }) => {
  return { request, meta: { custom: true } };
});

// 响应中间件（异步，不阻塞用户）
pipeline.onResponse('my-logger', async ({ response, context, config }) => {
  console.log('LLM responded:', response.status);
});
```

## Harness 插件

可选的 OpenClaw Gateway 插件，用于精确的渠道检测：

```bash
node bin/install-harness.mjs ~/.openclaw
```

Harness 运行在网关进程内，读取 `ctx.messageProvider` 和 `ctx.sessionKey`，通过 `globalThis.__mindclaw_channel_hint` 共享给代理。这是 Mindclaw 唯一依赖网关内部的部分。

## 配置

复制 `mindclaw.example.json` 为 `mindclaw.json`：

```json
{
  "modules": {
    "promptAssembler": true,
    "skillRouter": true,
    "memoryLoop": true,
    "riskGate": true,
    "traceLogger": true
  },
  "skills": { "scanDirs": ["./skills"] },
  "memory": { "factsPath": "./state/facts.json" },
  "trace": { "logPath": "./logs/mindclaw-trace.jsonl" }
}
```

所有模块默认关闭，通过配置按需启用。

## 生产部署

```
mindclaw-proxy.service  → :7000 (代理)
openclaw-gateway.service → :7005 (网关)
```

nginx 将外部流量路由到 :7000，代理增强请求后转发到 :7005。网关正常处理，完全不知道上游发生了什么。

---

<a name="english"></a>

## English

Pluggable AI middleware proxy for [OpenClaw](https://github.com/nicepkg/openclaw). Intercepts LLM traffic, enriches prompts, manages memory, routes skills, and compresses context — without modifying the gateway.

See [DESIGN.md](DESIGN.md) for architecture details, design principles, and inspirations.

## License

MIT
