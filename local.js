/** Local dev server — wraps the Vercel handler in a plain Node http server. */
import { createServer } from 'node:http';
import handler from './api/index.js';

const PORT = process.env.PORT ?? 3000;

createServer((req, res) => {
  // Shim the two Express-ish helpers the handler uses.
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  handler(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  });
}).listen(PORT, () => console.log(`→ http://localhost:${PORT}/mcp`));
