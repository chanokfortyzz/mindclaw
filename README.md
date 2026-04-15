# Mindclaw

Pluggable AI middleware proxy for [OpenClaw](https://github.com/nicepkg/openclaw). Intercepts LLM traffic, enriches prompts, compresses context, and routes skills — without modifying the gateway.

## Quick Start

```bash
# Install
npm install -g mindclaw

# Run (sits between nginx and OpenClaw Gateway)
mindclaw --port 7000 --upstream http://localhost:7005
```

## Architecture

Mindclaw has two components that work together:

```
External Traffic (WeChat/Discord/etc.)
        │
        ▼
   ┌─────────┐
   │  nginx   │ :443
   └────┬─────┘
        ▼
   ┌─────────────┐
   │  Mindclaw    │ :7000  ← prompt enrichment, skill routing,
   │  Proxy       │           context compression, trace logging
   └────┬────────┘
        ▼
   ┌─────────────┐
   │  OpenClaw    │ :7005  ← gateway with Mindclaw Harness plugin
   │  Gateway     │           (provides channel detection via plugin API)
   │  + Harness   │
   └─────────────┘
```

- **Proxy** (`src/proxy.mjs`) — HTTP middleware, intercepts and enriches LLM requests
- **Harness** (`src/harness/`) — OpenClaw Gateway plugin, hooks into lifecycle events for accurate channel detection

The harness shares channel info with the proxy via `globalThis.__mindclaw_channel_hint`. This gives the proxy reliable channel detection without parsing request bodies.

## Middleware Pipeline

Mindclaw processes LLM requests through a middleware chain:

| Middleware | Purpose |
|---|---|
| `provider-compat` | Fix provider-specific issues (thinking roles, etc.) |
| `prompt-assembler` | Enrich system prompt with channel context |
| `context-compressor` | Trim long conversations to stay in budget |
| `trace-logger` | Record all LLM requests for diagnostics |

## Custom Middleware

```js
import { pipeline } from 'mindclaw';

pipeline.use('my-plugin', async ({ request, config, context }) => {
  // Modify request.messages, add context, etc.
  return { request, meta: { custom: true } };
});
```

## Config

Create `mindclaw.json`:

```json
{
  "modules": {
    "promptAssembler": true,
    "skillRouter": true,
    "contextCompressor": true,
    "traceLogger": true
  },
  "channels": {
    "openclaw-weixin": {
      "prepend": "回复简短，少废话。",
      "splitLong": true,
      "maxSegmentLength": 120
    }
  },
  "trace": {
    "enabled": true,
    "logPath": "./logs/mindclaw-trace.jsonl"
  }
}
```

## License

MIT
