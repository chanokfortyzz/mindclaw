# Mindclaw

Pluggable AI middleware proxy for [OpenClaw](https://github.com/nicepkg/openclaw). Intercepts LLM traffic, enriches prompts, manages memory, routes skills, and compresses context — without modifying the gateway.

## Quick Start

```bash
npm install -g mindclaw

# Run (sits between nginx and OpenClaw Gateway)
mindclaw --port 7000 --upstream http://localhost:7005
```

## Architecture

```
External Traffic (WeChat/Discord/Telegram/etc.)
        |
        v
   +-----------+
   |   nginx   | :443
   +-----+-----+
         v
   +-------------+
   |  Mindclaw   | :7000  <- middleware pipeline
   |  Proxy      |
   +-----+-------+
         v
   +-------------+
   |  OpenClaw   | :7005  <- gateway + harness plugin
   |  Gateway    |
   +-------------+
```

## Middleware Pipeline

Requests pass through a chain of middleware, each independently toggleable:

| Middleware | Purpose | Config key |
|---|---|---|
| `provider-compat` | Fix provider-specific issues (thinking roles, developer->system) | always on |
| `prompt-assembler` | Enrich system prompt with channel-specific context | `promptAssembler` |
| `memory-loop` | Inject relevant facts and execution lessons into prompt | `memoryLoop` |
| `skill-router` | Detect skill triggers and inject skill hints | `skillRouter` |
| `task-analyzer` | Classify task complexity (simple/medium/complex) | `taskAnalyzer` |
| `risk-gate` | Evaluate destructive/risky operations, add warnings | `riskGate` |
| `context-compressor` | Trim long conversations to stay in token budget | `contextCompressor` |
| `trace-logger` | Record all LLM requests to JSONL for diagnostics | `traceLogger` |

## Custom Middleware

```js
import { pipeline } from 'mindclaw';

// Request middleware
pipeline.use('my-plugin', async ({ request, config, context }) => {
  return { request, meta: { custom: true } };
});

// Response middleware
pipeline.onResponse('my-logger', async ({ response, context, config }) => {
  console.log('LLM responded:', response.status);
});
```

## Harness Plugin

Optional OpenClaw Gateway plugin for accurate channel detection:

```bash
npx mindclaw-install-harness
```

## Config

Copy `mindclaw.example.json` to `mindclaw.json`:

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

## License

MIT
