# 🌩️ Weather Alert & Forecast Explorer — Athena MCP Agent

An MCP server that exposes **live open weather data** and renders it as an **embedded interactive widget** inside Athena.

Built for the Athena AI Interview Challenge — subject: *Weather alert and forecast explorer*.

---

## Live endpoints

| | URL |
|---|---|
| **MCP endpoint** | `https://<deployment>/mcp` |
| Widget preview (browser) | `https://<deployment>/widget?location=Miami,Florida` |
| Health | `https://<deployment>/health` |

---

## Real open/public data sources

No API keys, no auth, no scraping — both are official public feeds.

| Source | Use | Coverage |
|---|---|---|
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Current conditions, 7-day daily forecast, hourly series | Global |
| [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | Free-text location → coordinates | Global |
| [US National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Active severe weather alerts/warnings | United States |

Alert coverage is stated honestly in the payload (`alertCoverage`) rather than
silently returning an empty list outside the US.

---

## MCP tools

### `explore_weather`
Opens the interactive explorer for any location on Earth.

```json
{ "location": "Tampa, Florida", "days": 7 }
```

Returns a text summary (for the model), `structuredContent` (for programmatic use),
**and** the interactive widget.

### `list_active_alerts`
Lists currently active NWS alerts, filterable by state code and severity — used to
find where severe weather is happening, then drill in with `explore_weather`.

```json
{ "area": "TX", "severity": "Severe" }
```

---

## The widget — interactions

The widget ships **three** meaningful interactions (two were required):

1. **Day selector** — click any of the 7 forecast day cards to pivot the entire
   hourly view to that day. Keyboard accessible (Enter/Space).
2. **Metric toggle** — switch the hourly chart between **Temperature**,
   **Rain %**, and **Wind**. The chart re-renders as a line or bar series with
   an axis scaled to the selected metric.
3. **Expandable alerts** — click any active NWS alert to expand the full official
   description, protective-action instructions, onset/expiry window, urgency and
   certainty.

Hovering the chart also scrubs a per-hour readout (temp / precip / wind).

Selecting a day or expanding an alert additionally emits a follow-up prompt to
the host so the conversation can continue from what the user clicked.

---

## Design notes

**Host-convention hedging.** MCP hosts disagree on how a tool returns UI. Each
`explore_weather` result therefore carries the widget in every known convention
at once — an `mcp-ui` embedded resource in the content array, plus
`_meta.ui.resourceUri` (Anthropic Apps) and `_meta["openai/outputTemplate"]`
(OpenAI Apps SDK). Unknown `_meta` keys are ignored by spec, so this costs
nothing and removes a single point of failure.

**Self-contained widget.** The full dataset is inlined as JSON at render time and
every interaction runs client-side. The widget makes zero network calls and needs
zero host cooperation to be fully interactive — important because iframe CSP and
host-messaging support vary widely. Host messaging is layered on as enhancement,
never as a dependency.

**Graceful degradation.** Hosts with no widget support still get a complete text
summary plus `structuredContent`, so the model can answer regardless.

**Safety.** NWS alert text is third-party input and is rendered exclusively via
`textContent` / DOM construction — never `innerHTML`.

---

## Run locally

```bash
npm run dev      # http://localhost:3000/mcp
```

Smoke test:

```bash
curl -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"explore_weather","arguments":{"location":"Miami, Florida"}}}'
```

Open the widget standalone in a browser:

```
http://localhost:3000/widget?location=Tampa,Florida
```

## Stack

Zero runtime dependencies. Hand-rolled JSON-RPC 2.0 over Streamable HTTP
(`POST /mcp`, with SSE framing when the client's `Accept` header asks for it),
deployed as a Node serverless function on Vercel.
