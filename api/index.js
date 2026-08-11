/**
 * HTTP surface.
 *
 *  POST /mcp   — Streamable HTTP MCP endpoint (JSON-RPC)
 *  GET  /mcp   — SSE stream (kept open; some hosts probe this before POSTing)
 *  GET  /widget?location=Miami — the widget standalone, for browser preview/demo
 *  GET  /      — landing page
 */

import { handleRpc, PROTOCOL_VERSION, SERVER_INFO } from '../lib/server.js';
import { buildExplorerPayload } from '../lib/weather.js';
import { renderWidget } from '../lib/widget.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  /* ---------------------------------------------------- widget preview */
  if (path === '/widget') {
    const location = url.searchParams.get('location') || 'Miami, Florida';
    try {
      const payload = await buildExplorerPayload(location, 7);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=180');
      return res.status(200).send(renderWidget(payload));
    } catch (err) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(`<p style="font:14px system-ui">${err.message}</p>`);
    }
  }

  if (path === '/health') return res.status(200).json({ ok: true, ...SERVER_INFO });

  /* -------------------------------------------------------- MCP: SSE  */
  if (req.method === 'GET' && (path === '/mcp' || path === '/sse')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    const ka = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => clearInterval(ka));
    return;
  }

  /* -------------------------------------------------------- MCP: POST */
  if (req.method === 'POST' && (path === '/mcp' || path === '/sse' || path === '/')) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return res.status(400).json({
        jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' },
      });
    }

    res.setHeader('MCP-Protocol-Version', PROTOCOL_VERSION);
    res.setHeader('Mcp-Session-Id', 'stateless');

    // Batches are legal JSON-RPC; handle them so strict clients don't break.
    const messages = Array.isArray(body) ? body : [body];
    const results = [];
    for (const m of messages) {
      const r = await handleRpc(m);
      if (r) results.push(r);
    }
    if (!results.length) return res.status(202).end();

    const out = Array.isArray(body) ? results : results[0];

    // Some hosts demand an SSE-framed response; honour Accept when it asks.
    const accept = String(req.headers.accept ?? '');
    if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: message\ndata: ${JSON.stringify(out)}\n\n`);
      return res.end();
    }

    return res.status(200).json(out);
  }

  if (req.method === 'DELETE') return res.status(204).end();

  /* ------------------------------------------------------ landing page */
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html><meta charset="utf-8">
<title>Athena Weather MCP</title>
<style>body{font:15px/1.6 ui-sans-serif,system-ui;max-width:640px;margin:60px auto;padding:0 20px;color:#111}
code{background:#f2f4f7;padding:2px 6px;border-radius:5px}a{color:#2563eb}</style>
<h1>🌩️ Weather Alert &amp; Forecast Explorer — MCP</h1>
<p>Streamable-HTTP MCP server exposing live weather data with an embedded interactive widget.</p>
<p><b>MCP endpoint:</b> <code>${'${origin}/mcp'.replace('${origin}', '')}/mcp</code></p>
<ul>
  <li><code>explore_weather</code> — interactive explorer for any location</li>
  <li><code>list_active_alerts</code> — live US NWS severe weather alerts</li>
</ul>
<p>Data: <a href="https://open-meteo.com">Open-Meteo</a> (forecast) ·
<a href="https://www.weather.gov/documentation/services-web-api">NWS</a> (alerts).</p>
<p>Widget preview: <a href="/widget?location=Miami,Florida">/widget?location=Miami,Florida</a></p>`);
}
