# Mindclaw: Design & Principles

## What is Mindclaw

Mindclaw is a middleware proxy that sits between your reverse proxy (nginx) and the OpenClaw Gateway. It intercepts every LLM-bound request, runs it through a pipeline of pluggable middleware, and forwards the enriched request to the gateway. The gateway itself is untouched — Mindclaw works purely at the HTTP layer.

```
nginx :443 → Mindclaw :7000 → OpenClaw Gateway :7005
```

## Why a Proxy Instead of Patching the Gateway

OpenClaw is a third-party project. Patching its source code means:

- Every upstream update risks breaking your changes
- You can't share your enhancements without forking the entire project
- Debugging becomes a nightmare when your code is tangled with theirs

Mindclaw avoids all of this. It's a separate process. If it crashes, the gateway still works. If you want to disable it, just point nginx directly at the gateway. Zero coupling.

## The Middleware Pipeline

Every LLM request passes through an ordered chain of middleware. Each middleware is independent — it can be enabled or disabled via config, and it only sees a clean `{ request, config, context }` interface.

The current chain, in execution order:

1. **provider-compat** — Strips non-standard fields (`thinking`, `developer` role) that many OpenAI-compatible proxies reject. Always on.

2. **scope-resolver** *(new in v0.2)* — Normalizes scope fields (`agentId`, `channel`, `chatType`, `routeTag`) from all available sources (harness hints, request metadata, pipeline detection). Outputs a canonical scope object (`routeTag = <agentId>@<channel>`) that all downstream middleware share. This eliminates the scope mismatch bug where writes used one key format and reads used another.

3. **prompt-assembler** — Prepends channel-specific instructions and a scope annotation to the system prompt. Uses canonical scope from scope-resolver for channel lookup.

4. **memory-loop** — Reads facts and execution lessons from local JSON files, ranks them by a weighted score combining scope relevance (50%), keyword overlap (30%), and time freshness (20%). Injects top-6 facts and top-4 lessons into the system prompt. Noise channels (heartbeat, ping, default) are penalized. After the response, records the interaction with canonical scope. This replaces the old `slice(-N)` approach that was easily polluted by unrelated traffic.

5. **skill-router** — Scans user messages for trigger keywords defined in SKILL.md files. When a match is found, it injects a hint into the system prompt telling the LLM which skill is available and where to load it from.

6. **task-analyzer** — Classifies the user's request as simple, medium, or complex based on pattern matching. Downstream systems can use this to decide whether to route to a lightweight model or a more capable one.

7. **risk-gate** — Detects potentially destructive operations (`rm -rf`, `drop table`, `kill -9`, etc.) and annotates the context with a risk level. High-risk requests get a warning injected into the system prompt, asking the LLM to confirm with the user before executing.

8. **context-compressor** — When the conversation history exceeds a threshold, drops older messages while keeping the system prompt and recent context intact.

9. **trace-logger** — Appends a JSONL entry for every LLM request, recording scope, model, message count, memory injection stats (fact/lesson counts), and all middleware results. Errors are surfaced to stderr instead of being silently swallowed.

## Response Hooks

Middleware can also register response handlers via `pipeline.onResponse()`. These fire asynchronously after the upstream response is sent to the client, so they never add latency. The memory-loop uses this to record interactions without blocking the user.

## The Harness Plugin

Mindclaw has an optional companion: a lightweight OpenClaw Gateway plugin (the "harness") that runs inside the gateway process. It extracts the full session scope — `agentId`, `channel`, `chatType` — from the gateway's internal context (`ctx.messageProvider`, `ctx.sessionKey`, `ctx.agentId`) and shares it with the proxy via `globalThis.__mindclaw_scope_hint`.

This is necessary because the proxy only sees HTTP requests, and the scope information is often buried in gateway-internal context that doesn't appear in the request body. The harness bridges this gap. It is provider-agnostic — the same hooks fire regardless of whether the upstream LLM is Claude, GPT, Kimi, or Minimax.

Install it with:
```bash
node bin/install-harness.mjs ~/.openclaw
```

## Memory Model

Mindclaw's memory is deliberately simple: two JSON files.

- **facts.json** — Records of user messages, corrections, and observations. Each entry has a timestamp, canonical scope (`{ agentId, channel, chatType, routeTag }`), and content. Capped at a configurable maximum (default 200), oldest entries pruned first.

- **lessons.json** — Records of tool calls, errors, and their outcomes. Used to teach the LLM from past execution experience.

On each request, the memory-loop scores all entries by a weighted combination of:
- **Scope match (50%)** — exact routeTag match scores highest; agentId-only match is partial; noise channels (heartbeat, ping) are penalized
- **Keyword overlap (30%)** — words from the current user message matched against entry content
- **Freshness (20%)** — exponential decay with a 3-day half-life

The top-6 facts and top-4 lessons are injected into the system prompt under `## Factual Memory Snapshot` and `## Execution Lessons Snapshot` sections.

No vector database, no embeddings, no external service. This is intentional — it keeps the system simple, portable, and debuggable.

### Cache Key Isolation

The pipeline generates a deterministic cache key for each request: `<routeTag>:<chatType>:<messageHash>`. This prevents cross-channel cache pollution where a WeChat session could accidentally receive a Telegram session's cached prompt.

### Migration

Legacy memory data (pre-v0.2) used inconsistent scope formats (`openclaw-weixin`, `sage-weixin`, `default`, etc.). The migration script normalizes all entries:

```bash
node bin/migrate-memory.mjs --dir /path/to/state          # live migration (auto-backup)
node bin/migrate-memory.mjs --dir /path/to/state --dry-run # preview only
```

## Skill System

Skills are directories containing a `SKILL.md` file with metadata:

```
skills/
  weather/
    SKILL.md    # triggers: weather, forecast, temperature
  browser/
    SKILL.md    # triggers: browse, screenshot
```

The skill-router scans these directories at startup, extracts trigger keywords from the frontmatter, and matches them against incoming messages. When a skill matches, its description and file path are injected into the system prompt as a hint.

The LLM decides whether and how to use the skill. Mindclaw doesn't execute skills — it just makes the LLM aware of them.

## Inspirations

### Hermes Agent (NousResearch)

Hermes Agent's architecture influenced several Mindclaw design decisions:

- **Context compression** — Hermes uses a three-tier strategy (light trim → structured summary → iterative update). Mindclaw's context-compressor currently implements the first tier (drop old messages). The structured summary tier is designed but not yet shipped.

- **Error classification** — Hermes classifies LLM errors into categories (auth, rate limit, timeout, context overflow) and applies different recovery strategies for each. This pattern was adopted in the production Mindclaw deployment on VPS, though the open-source version keeps it simpler.

- **Memory architecture** — Hermes separates factual memory from execution memory, which Mindclaw mirrors with its facts/lessons split.

### OpenClaw's Plugin System

OpenClaw supports gateway plugins via `openclaw.plugin.json` + a `register(api)` entry point. The harness uses this to hook into `before_prompt_build`, `llm_input`, and `llm_output` lifecycle events. This is the only part of Mindclaw that depends on OpenClaw internals.

### Claude Code / Codex

The task-analyzer middleware was inspired by how Claude Code and Codex decide whether a task is simple enough to handle inline or complex enough to delegate to a background agent. The pattern matching is basic but effective for routing decisions.

## What Mindclaw Does NOT Do

- It does not modify the OpenClaw Gateway source code
- It does not call LLM APIs itself (it only modifies requests passing through)
- It does not require any external services (no Redis, no Postgres, no vector DB)
- It does not auto-execute skills or tools (it only hints to the LLM)

## Running in Production

On the VPS where Mindclaw was developed, it runs as two systemd services:

```
mindclaw-proxy.service  → :7000 (proxy)
openclaw-gateway.service → :7005 (gateway)
```

nginx routes external traffic to :7000. The proxy enriches requests and forwards to :7005. The gateway processes them normally, unaware that anything happened upstream.

If the proxy dies, restarting it takes ~2 seconds. The gateway keeps running throughout.

## Changelog: v0.2.0 (2026-04-15)

### Bug Fixes

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | 记忆作用域不统一 | 写入用 `openclaw-weixin`，读取用 `sage-weixin@openclaw-weixin`，新会话看起来没继承记忆 | 新增 `scope-resolver` 中间件，所有读写统一为 `routeTag = <agentId>@<channel>` |
| 2 | 长期记忆召回太蠢 | `slice(-N)` 直接取最近几条，heartbeat/ping 会污染主会话 | 改为加权打分召回：scope 50% + 关键词 30% + 时间衰减 20%，噪声 channel 惩罚 |
| 3 | prompt 注入硬编码 | `facts.slice(-3)` / `lessons.slice(-2)` 容易塞入无关记忆 | 改为 relevance ranking，facts top-6，lessons top-4 |
| 4 | 旧 memory 数据脏 | 历史数据 agentId/routeTag 格式不统一，新逻辑无法正确召回 | 写了 `migrate-memory.mjs` 脚本，VPS 上 309 条数据已全部迁移 |
| 5 | trace-logger 吞错误 | `catch {}` 静默吞掉写入失败，trace 断了无感知 | 改为 `console.error` 输出，增加 scope/memory 注入统计字段 |
| 6 | cache key 串味 | cache key 只用 message 文本，不同 channel 可能命中同一缓存 | cache key 改为 `routeTag:chatType:messageHash` |
| 7 | 新旧数据并存 | 新写入规范化了但旧数据还是脏格式 | migration 脚本 + 写入链路全部接入 `normalizeScope()` |
| 8 | provider 链路不一致 | 不同 provider failover 时可能绕过 memory injection | harness 改为提取完整 scope，provider 无关 |
| 9 | trace 断流 | harness log 写入失败被吞掉 | harness `log()` 函数不再 silent catch，fallback 到 stderr |

### New Files
- `src/middleware/scope-resolver.mjs` — 作用域规范化中间件 + `normalizeScope()` / `scopeScore()` / `scopeCacheKey()` 导出
- `bin/migrate-memory.mjs` — 旧数据迁移脚本（支持 `--dry-run`，自动备份）
- `test/test-all.mjs` — 17 个测试（scope / ranking / cache / migration / isolation）

### Modified Files
- `src/pipeline.mjs` — 增加 `messageHash` + `cacheKey` 生成
- `src/middleware/index.mjs` — 注册 scope-resolver（provider-compat 之后第一个）
- `src/middleware/memory-loop.mjs` — 重写为 scope-aware ranking
- `src/middleware/prompt-assembler.mjs` — 使用 canonical scope
- `src/middleware/trace-logger.mjs` — 不再吞错误，增加 scope/memory 字段
- `src/harness/index.ts` — 提取完整 scope，传递 `__mindclaw_scope_hint`
- `package.json` — 增加 `test` / `migrate` / `migrate:dry` scripts

### Remaining Risks
- 如果 OpenClaw Gateway 更新了 `ctx.sessionKey` 格式，harness 的解析逻辑需要同步更新
- 当前 keyword matching 仍然是词袋模型，语义相近但用词不同的记忆可能召回不到
- migration 脚本的 `LEGACY_MAP` 是硬编码的，如果有新的脏格式需要手动添加映射
