#!/usr/bin/env node
/**
 * Mindclaw CLI Entry Point
 *
 * Usage:
 *   npx mindclaw --upstream http://localhost:7005
 *   npx mindclaw --port 7000 --upstream http://localhost:7005 --config ./mindclaw.json
 */

import { parseArgs } from 'node:util';
import { createProxy } from '../src/proxy.mjs';
import { loadConfig } from '../src/config.mjs';

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '7000' },
    upstream: { type: 'string', short: 'u', default: 'http://localhost:7005' },
    config: { type: 'string', short: 'c', default: '' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`
mindclaw - Pluggable AI middleware for OpenClaw

Usage:
  mindclaw [options]

Options:
  -p, --port <port>        Listen port (default: 7000)
  -u, --upstream <url>     OpenClaw Gateway URL (default: http://localhost:7005)
  -c, --config <path>      Config file path (default: auto-detect)
  -h, --help               Show this help
`);
  process.exit(0);
}

const config = loadConfig(values.config);
const port = parseInt(values.port, 10);
const upstream = values.upstream;

createProxy({ port, upstream, config });
