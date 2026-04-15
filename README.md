# Mindclaw

[OpenClaw](https://github.com/nicepkg/openclaw) 的可插拔 AI 中间件代理。拦截 LLM 请求流量，通过中间件管道增强提示词、管理记忆、路由技能、压缩上下文，全程不修改网关代码。

[English](#english) | 中文

## 为什么做这个

OpenClaw 是个好网关，但它管的是「把消息送到 LLM」这件事。至于怎么让 LLM 变得更聪明 —— 记住用户说过什么、知道什么时候该小心、根据渠道调整说话方式 —— 这些它不管。

直接改 OpenClaw 源码？每次上游更新你就得祈祷不冲突。fork 一份？维护成本比写新功能还高。

所以 Mindclaw 选了最简单的路：做一个代理，架在网关前面。请求进来，过一遍中间件管道，增强完了再转发。网关完全不知道发生了什么，也不需要知道。

崩了？重启两秒。不想用了？nginx 指回网关，完事。

## 站在巨人肩膀上

这不是凭空造出来的。Mindclaw 的核心设计从几个项目里偷师：

- [Hermes Agent](https://github.com/NousResearch/Hermes-Function-Calling)（NousResearch）—— 上下文压缩的三层策略、错误分类恢复、事实记忆和执行记忆分离。Mindclaw 的 facts/lessons 双文件记忆就是照着它的思路来的。
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) / [Codex](https://github.com/openai/codex) —— 任务复杂度判断。简单的事情别浪费算力，复杂的事情别用小模型硬扛。task-analyzer 就干这个。
- [OpenClaw](https://github.com/nicepkg/openclaw) 本身 —— 插件系统设计得不错，harness 直接用它的生命周期钩子做渠道检测。

## 装上 Mindclaw 你多了什么

| 能力 | 没有 Mindclaw | 有 Mindclaw |
|---|---|---|
| 记忆 | 每次对话从零开始 | 自动积累事实和经验教训，下次对话带上相关记忆 |
| 自进化 | 技能全靠手写 | 从执行经验中自动生成 candidate skill |
| 技能淘汰 | 技能只增不减 | Darwin 式适应度评估，无用技能自动淘汰 |
| 风险意识 | LLM 说删就删 | `rm -rf`、`drop table` 这种操作会被拦下来加警告 |
| 技能发现 | 手动告诉 LLM 能干什么 | 自动匹配触发词，把技能提示塞进 prompt |
| 任务路由 | 所有请求一视同仁 | 自动判断复杂度，为模型选择提供依据 |
| 上下文控制 | 聊多了就爆 token | 主动裁剪历史，保住关键上下文 |
| 渠道适配 | 微信和 Discord 说一样的话 | 按渠道定制提示词，该简短简短，该详细详细 |
| 供应商兼容 | 换个 API 就报错 | 自动处理 thinking/developer 角色等兼容性问题 |
| 可观测性 | 出了问题靠猜 | 全链路 JSONL 追踪，每个中间件干了什么一目了然 |
| 依赖 | — | 零外部依赖。不需要 Redis、Postgres、向量数据库 |

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

## 自进化：技能从经验中长出来

Mindclaw 不只是静态的 prompt 拼装器。它有一套最小可行的自进化机制：

**Skill Learning Lite** — 系统记录每次执行的 trace（意图、工具链、结果）。相似任务按 intent + 工具签名自动分桶。当同一类任务成功 3 次以上，系统自动生成 candidate skill —— 一个从实际执行经验中提炼出的技能草稿。

candidate 不会自动生效。它只是被注入到 prompt 里作为提示，由 LLM 自己决定是否采用。这是刻意的保守：让系统先学会观察，再学会行动。

```
执行 trace → intent 分桶 → 重复成功 ≥ 3 → 生成 candidate skill → prompt hint
```

## Darwin 式技能淘汰

技能不是生出来就永远活着。Mindclaw 参照达尔文自然选择的思路，给技能加了适应度评估和淘汰机制：

- 每个 skill（包括 candidate 和 learned）都有命中率（hit rate）和成功率（success rate）
- 长期不被触发的技能，适应度下降
- 连续失败的技能，适应度加速衰减
- 适应度低于阈值的技能自动降级或淘汰
- 高适应度的 candidate 可以晋升为 learned skill

这意味着技能池是活的 —— 有用的技能越来越强，没用的自然消亡。系统不会因为学了太多东西而变臃肿。

```
candidate skill
  ├─ 命中率高 + 成功率高 → 晋升 learned skill
  ├─ 命中率低 → 适应度衰减 → 降级/淘汰
  └─ 连续失败 → 加速淘汰

learned skill
  ├─ 持续有效 → 保留
  └─ 长期未触发或失败率上升 → 降级回 candidate 或淘汰
```

这套机制的核心不是"学得多"，而是"留下对的"。

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

## Design Documents

- [Hermes MVP Execution Plan](docs/hermes-mvp-execution-plan.md) — 融合 Hermes Agent 架构的 MVP 裁剪版执行计划
- [Single Evolving Agent](docs/single-evolving-agent.md) — 从多 Agent 向单进化 Agent 收敛的结构调整方案
- [Dynamic Context Loader](docs/dynamic-context-loader.md) — 按任务、预算、阶段动态装载上下文的设计稿
- [Safety & Extensibility Plan](docs/safety-extensibility-plan.md) — 安全增强与可扩展并存方案
- [Safety Implementation Checklist](docs/safety-implementation-checklist.md) — 安全增强实施清单
- [MVP Implementation Checklist](docs/mvp-implementation-checklist.md) — MVP 实施任务拆解清单

## License

MIT
