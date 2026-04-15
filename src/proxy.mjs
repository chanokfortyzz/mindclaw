/**
 * Mindclaw Proxy — core HTTP proxy server
 *
 * Sits between external traffic and OpenClaw Gateway.
 * Intercepts LLM-bound requests, runs them through the middleware pipeline,
 * then forwards to the upstream gateway.
 */

import http from 'node:http';
import { pipeline } from './pipeline.mjs';
import './middleware/index.mjs';

export function createProxy({ port, upstream, config }) {
  const upstreamUrl = new URL(upstream);

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString();

      try {
        // Run through Mindclaw pipeline (may modify body for LLM requests)
        const processed = await pipeline.process({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
          config,
        });

        // Forward to upstream gateway
        const proxyReq = http.request(
          {
            hostname: upstreamUrl.hostname,
            port: upstreamUrl.port,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: upstreamUrl.host,
              ...(processed.body
                ? { 'content-length': Buffer.byteLength(processed.body) }
                : {}),
            },
          },
          (proxyRes) => {
            // Collect response for response handlers, then pipe to client
            if (processed.context) {
              const resChunks = [];
              proxyRes.on('data', (c) => resChunks.push(c));
              proxyRes.on('end', () => {
                const resBody = Buffer.concat(resChunks);
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(resBody);
                // Fire response handlers async (don't block client)
                let resJson;
                try { resJson = JSON.parse(resBody.toString()); } catch {}
                pipeline.handleResponse({
                  response: { status: proxyRes.statusCode, body: resJson },
                  context: processed.context,
                  config,
                }).catch(() => {});
              });
            } else {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            }
          }
        );

        proxyReq.on('error', (err) => {
          console.error('[mindclaw] upstream error:', err.message);
          res.writeHead(502);
          res.end(JSON.stringify({ error: 'upstream error', message: err.message }));
        });

        if (processed.body) {
          proxyReq.write(processed.body);
        }
        proxyReq.end();
      } catch (err) {
        console.error('[mindclaw] pipeline error:', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'pipeline error', message: err.message }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`[mindclaw] listening on :${port} -> ${upstream}`);
  });

  server.on('error', (err) => {
    console.error('[mindclaw] server error:', err.message);
    process.exit(1);
  });

  return server;
}
