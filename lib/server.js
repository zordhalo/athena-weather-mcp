/**
 * Minimal, dependency-free MCP server (JSON-RPC 2.0 over Streamable HTTP).
 *
 * Hand-rolled rather than SDK-based so the exact wire shape is under our
 * control — specifically so one tool result can carry the widget in ALL of the
 * competing host conventions at once (see toolResult()).
 */

import { buildExplorerPayload, fetchAlerts, sortAlerts } from './weather.js';
import { renderWidget } from './widget.js';

export const PROTOCOL_VERSION = '2025-06-18';
const WIDGET_URI = 'ui://weather/explorer.html';
const SERVER_INFO = { name: 'athena-weather-explorer', version: '1.0.0' };

/* ------------------------------------------------------------------ tools */

const TOOLS = [
  {
    name: 'explore_weather',
    title: 'Weather Alert & Forecast Explorer',
    description:
      'Open an interactive weather explorer for any location on Earth. Renders an embedded widget ' +
      'with live conditions, a clickable 7-day forecast, a switchable hourly chart (temperature / ' +
      'chance of rain / wind), and expandable active government weather alerts. Use this whenever ' +
      'someone asks about the weather, forecast, or alerts/warnings for a place.',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Place name, e.g. "Miami, Florida", "Denver", "London, Ontario", "Tokyo".',
        },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: 7,
          default: 7,
          description: 'How many forecast days to include (1-7).',
        },
      },
      required: ['location'],
    },
    annotations: { title: 'Weather Alert & Forecast Explorer', readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'list_active_alerts',
    title: 'Active Severe Weather Alerts',
    description:
      'List currently active US National Weather Service alerts, optionally filtered by state code ' +
      '(e.g. "TX", "FL") and severity ("Extreme", "Severe", "Moderate", "Minor"). Returns the ' +
      'affected areas so you can then call explore_weather on a specific location.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Two-letter US state/territory code, e.g. "CA".' },
        severity: {
          type: 'string',
          enum: ['Extreme', 'Severe', 'Moderate', 'Minor'],
          description: 'Only return alerts at this severity.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
      },
    },
    annotations: { title: 'Active Severe Weather Alerts', readOnlyHint: true, openWorldHint: true },
  },
].map((t) => ({
  ...t,
  // Anthropic Apps + OpenAI Apps SDK both key the widget off tool _meta.
  _meta: {
    ui: { resourceUri: WIDGET_URI, preferBorder: true },
    'openai/outputTemplate': WIDGET_URI,
    'openai/widgetAccessible': true,
    'openai/toolInvocation/invoking': 'Checking conditions and alerts…',
    'openai/toolInvocation/invoked': 'Weather explorer ready',
  },
}));

/**
 * Build a tool result that renders as a widget on every host convention we
 * know of, and degrades to a readable text summary on hosts that support none.
 */
function toolResult({ html, summary, structured, uri = WIDGET_URI }) {
  return {
    content: [
      { type: 'text', text: summary },
      // mcp-ui / MCP spec embedded-resource convention
      {
        type: 'resource',
        resource: {
          uri,
          mimeType: 'text/html',
          text: html,
          _meta: { 'mcpui.dev/ui-preferred-frame-size': ['100%', '760px'] },
        },
      },
    ],
    structuredContent: structured,
    _meta: {
      ui: { resourceUri: uri },
      'openai/outputTemplate': uri,
      'mcpui.dev/ui-preferred-frame-size': ['100%', '760px'],
    },
  };
}

async function callTool(name, args = {}) {
  if (name === 'explore_weather') {
    const payload = await buildExplorerPayload(args.location, args.days ?? 7);
    const html = renderWidget(payload);
    const p = payload.place;
    const where = [p.name, p.region, p.country].filter(Boolean).join(', ');
    const alertLine = payload.alerts.length
      ? `⚠️ ${payload.alerts.length} active alert(s): ` +
        payload.alerts.slice(0, 4).map((a) => `${a.event} (${a.severity})`).join('; ')
      : `No active government alerts. ${payload.alertCoverage}`;

    const summary =
      `Weather explorer for ${where} — ${payload.current.temp}°F, ${payload.current.label}, ` +
      `feels like ${payload.current.feelsLike}°F, wind ${payload.current.wind} mph.\n` +
      `${alertLine}\n` +
      `Forecast:\n` +
      payload.daily
        .map((d) => `  ${d.date}: ${d.label}, ${d.tempMin}–${d.tempMax}°F, ${d.precipChance}% precip, wind to ${d.windMax} mph`)
        .join('\n') +
      `\n(An interactive widget is displayed: pick a day, switch the hourly metric, expand any alert.)`;

    return toolResult({
      html,
      summary,
      // The resource URI carries the location. Hosts that ignore the embedded
      // resource and instead fetch _meta.ui.resourceUri via resources/read still
      // get THIS location's widget rather than a generic template.
      uri: `${WIDGET_URI}?location=${encodeURIComponent(args.location)}&days=${args.days ?? 7}`,
      structured: {
        location: where,
        coordinates: { lat: p.lat, lon: p.lon },
        current: payload.current,
        daily: payload.daily,
        alerts: payload.alerts.map((a) => ({
          event: a.event, severity: a.severity, areaDesc: a.areaDesc, expires: a.expires,
        })),
      },
    });
  }

  if (name === 'list_active_alerts') {
    const limit = args.limit ?? 15;
    const alerts = sortAlerts(
      await fetchAlerts({ area: args.area, severity: args.severity })
    ).slice(0, limit);

    const summary = alerts.length
      ? `${alerts.length} active NWS alert(s)` +
        (args.area ? ` in ${args.area.toUpperCase()}` : ' nationwide') +
        (args.severity ? ` at ${args.severity} severity` : '') + ':\n' +
        alerts.map((a) => `  • [${a.severity}] ${a.event} — ${a.areaDesc} (until ${a.expires ?? 'n/a'})`).join('\n') +
        `\nCall explore_weather with one of these areas to open the interactive explorer.`
      : 'No active NWS alerts match that filter right now.';

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: { count: alerts.length, alerts },
    };
  }

  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
}

/* ------------------------------------------------------------- dispatcher */

export async function handleRpc(msg) {
  const { id, method, params = {} } = msg ?? {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Weather alert and forecast explorer. Call explore_weather with a location to render an ' +
          'interactive widget (day selector, hourly metric toggle, expandable NWS alerts).',
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no response

    case 'ping':
      return ok({});

    case 'tools/list':
      return ok({ tools: TOOLS });

    case 'tools/call':
      try {
        return ok(await callTool(params.name, params.arguments ?? {}));
      } catch (err) {
        // Tool errors belong in the result, not the JSON-RPC error channel,
        // so the model can read and recover from them.
        return ok({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }

    case 'resources/list':
      return ok({
        resources: [{
          uri: WIDGET_URI,
          name: 'Weather Explorer Widget',
          description: 'Interactive weather alert and forecast explorer UI.',
          mimeType: 'text/html',
          _meta: { ui: { preferBorder: true } },
        }],
      });

    case 'resources/templates/list':
      return ok({ resourceTemplates: [] });

    case 'prompts/list':
      return ok({ prompts: [] });

    case 'resources/read': {
      // Hosts that render the ui:// resource (rather than the embedded resource
      // in the tool result) land here. The location travels in the URI query so
      // the right place is rendered — without it we'd serve a generic sample and
      // the widget would silently disagree with the text answer beside it.
      const requested = params.uri ?? WIDGET_URI;
      let location = null;
      let days = 7;
      try {
        const q = new URLSearchParams(requested.split('?')[1] ?? '');
        location = q.get('location');
        days = Number(q.get('days')) || 7;
      } catch { /* fall through to the placeholder */ }

      const payload = location
        ? await buildExplorerPayload(location, days).catch(() => null)
        : null;

      const html = payload
        ? renderWidget(payload)
        : `<!doctype html><meta charset="utf-8">
<div style="font:14px/1.6 ui-sans-serif,system-ui;padding:20px;text-align:center;color:#5c6673">
  🌤️ <b style="color:#10151c">Weather Explorer</b><br>
  Ask about the weather, forecast, or alerts for any location to load the explorer.
</div>`;

      return ok({
        contents: [{
          uri: requested,
          mimeType: 'text/html',
          text: html,
          _meta: { 'mcpui.dev/ui-preferred-frame-size': ['100%', '760px'] },
        }],
      });
    }

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

export { WIDGET_URI, SERVER_INFO };
