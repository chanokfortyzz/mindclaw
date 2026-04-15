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

2. **prompt-assembler** — Prepends channel-specific instructions to the system prompt. For example, a WeChat channel might get "keep replies short", while Discord gets "use full Markdown".

3. **memory-loop** — Reads facts and execution lessons from local JSON files, scores them by keyword relevance to the current message, and injects the top matches into the system prompt. After the response, it records the interaction as a new fact. This gives the LLM a form of long-term memory without any external database.

4. **skill-router** — Scans user messages for trigger keywords defined in SKILL.md files. When a match is found, it injects a hint into the system prompt telling the LLM which skill is available and where to load it from.

5. **task-analyzer** — Classifies the user's request as simple, medium, or complex based on pattern matching. Downstream systems can use this to decide whether to route to a lightweight model or a more capable one.

6. **risk-gate** — Detects potentially destructive operations (`rm -rf`, `drop table`, `kill -9`, etc.) and annotates the context with a risk level. High-risk requests get a warning injected into the system prompt, asking the LLM to confirm with the user before executing.

7. **context-compressor** — When the conversation history exceeds a threshold, drops older messages while keeping the system prompt and recent context intact.

8. **trace-logger** — Appends a JSONL entry for every LLM request, recording channel, model, message count, and the results of all upstream middleware. Useful for debugging and analytics.

## Response Hooks

Middleware can also register response handlers via `pipeline.onResponse()`. These fire asynchronously after the upstream response is sent to the client, so they never add latency. The memory-loop uses this to record interactions without blocking the user.

## The Harness Plugin

Mindclaw has an optional companion: a lightweight OpenClaw Gateway plugin (the "harness") that runs inside the gateway process. Its only job is channel detection — it reads `ctx.messageProvider` and `ctx.sessionKey` from the gateway's internal context and shares the result with the proxy via `globalThis.__mindclaw_channel_hint`.

This is necessary because the proxy only sees HTTP requests, and the channel information is often buried in gateway-internal context that doesn't appear in the request body. The harness bridges this gap.

Install it with:
```bash
node bin/install-harness.mjs ~/.openclaw
```

## Memory Model

Mindclaw's memory is deliberately simple: two JSON files.

- **facts.json** — Records of user messages, corrections, and observations. Each entry has a timestamp, channel, and content. Capped at a configurable maximum (default 200), oldest entries pruned first.

- **lessons.json** — Records of tool calls, errors, and their outcomes. Used to teach the LLM from past execution experience.

On each request, the memory-loop scores all entries by keyword overlap with the current user message and injects the top matches into the system prompt. No vector database, no embeddings, no external service. This is intentional — it keeps the system simple, portable, and debuggable.

The trade-off is that keyword matching is crude compared to semantic search. For most agent workloads (where the user is asking about things they've asked about before, using similar vocabulary), it works well enough.

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
