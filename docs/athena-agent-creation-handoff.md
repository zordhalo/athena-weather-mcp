# Hand-off prompt — Create the Athena agent and attach the weather MCP server

> **For:** a browser-driving agent (Playwright MCP / computer-use) operating a logged-in **athenachat.bot** session for `lucas@advancelabs.dev`.
> **Why a browser agent:** Athena exposes no public API for agent creation. MCP server configuration is step 4 of the in-app agent wizard — a UI-only job.
> **Created:** 2026-08-10 · **Deadline-critical:** submission closes **2026-08-11 01:59:19 UTC**.

---

## Paste-ready agent prompt

You are operating a logged-in **athenachat.bot** session for **`lucas@advancelabs.dev`**. Your job is to **create one new AI agent, attach an already-deployed MCP server to it, verify the tools actually work, and report back the agent's share link.**

This is for a timed interview challenge that closes at **01:59:19 UTC on 2026-08-11**. Work quickly and report early if blocked — a fast "I'm stuck on X" is worth more than a slow perfect run.

### Why this matters (context, not instructions)

The challenge requires an Athena agent that uses MCP to retrieve real public data and render an embedded interactive widget. The MCP server is **already built, deployed, and verified working** — the only missing piece is the Athena agent that points at it. Everything you need is below; you are not building or debugging the server.

### Hard guardrails (read before doing anything)

1. **Do not post anything in the existing "Athena AI Interview Challenge Agent" chat thread.** That is the examiner's thread. Lucas submits there himself. You must not send the submission, the links, or any message into it.
2. **Do not spend money without asking.** Agent creation may require the **Agents Pro plan ($5.99/month)** — the free tier is listed as *"10 prompts, 0 Agents"*. If you hit a paywall or upgrade prompt, **stop immediately and report it**. Do not enter payment details.
3. **Do not delete or modify any existing agent.** You are creating one new agent.
4. If Athena asks to re-authenticate or presents a 2FA challenge, **stop and report** — do not attempt to authenticate.
5. **Do not modify the MCP server URL.** Paste it exactly as given. If a field rejects it, report the exact validation message.
6. Take a screenshot at each ✅ checkpoint and include them in your final report.

### The values to use

**Agent name:**
```
Weather Alert & Forecast Explorer
```

**MCP server URL** (no auth, no headers, no API key — leave those blank):
```
https://athena-weather-mcp-mocha.vercel.app/mcp
```

**Agent prompt / instructions:**
```
You are a weather alert and forecast explorer. When a user asks about weather,
conditions, forecast, alerts, warnings, or storms for any place, call the
explore_weather tool with that location — it renders an interactive widget with
live conditions, a 7-day forecast, an hourly chart, and active government alerts.
Use list_active_alerts to find where severe weather is currently happening.
Always call the tool rather than answering from memory; weather data must be live.
```

**Conversation starters** (add all three if the field allows):
```
What's the weather in Burlington, Vermont?
Show me active severe weather alerts right now
Any flood warnings in Vermont?
```

### Part A — Create the agent

1. Go to **https://athenachat.bot** and open **My Agents** (top-left nav).
2. ✅ **Checkpoint:** screenshot the agent list *before* changing anything, and note how many agents exist.
3. Start a **new agent**. Work through the five-step wizard:
   - **1. Defining your prompt** — paste the agent prompt above. Set the name.
   - **2. Uploading knowledge** — skip, upload nothing.
   - **3. Add conversation starters** — add the three above.
   - **4. Configuring MCP server** — paste the MCP URL above. Leave auth/headers/API-key fields blank.
   - **5. Agent created** — save.
4. If step 4 asks for a **transport type**, choose **Streamable HTTP**; if only **SSE** is offered, choose that. The server supports both on the same URL.
5. If step 4 offers a **"test connection" / "fetch tools"** button, press it and screenshot the result.
6. ✅ **Checkpoint:** screenshot step 4 filled in, *before* saving.
7. ✅ **Checkpoint:** screenshot the created agent, and confirm the agent count increased by exactly one.

**Expected tools.** If Athena lists the server's tools anywhere, it should show exactly two: **`explore_weather`** and **`list_active_alerts`**. If it shows zero tools or an error, capture the exact error text and report — that is the single most important diagnostic in this whole job.

### Part B — Verify the MCP connection actually works

Open a chat with the new agent (not the challenge thread) and run these in order.

8. Send: **`What tools do you have?`**
   - ✅ Expected: it names `explore_weather` and `list_active_alerts`.
   - ❌ If it lists nothing or makes tools up, the MCP server did not attach. Screenshot and report.
9. Send: **`What's the weather in Burlington, Vermont?`**
   - ✅ Expected: the agent calls `explore_weather` and returns live data — roughly 73°F, overcast, and **an active Flash Flood Warning**.
   - ✅ **Checkpoint:** screenshot the full response.
10. **The critical question — did a widget render?** Report *precisely* which of these you see:
    - **(a)** An embedded interactive panel/iframe with day cards, a chart, and an alert card, **or**
    - **(b)** Only plain text describing the weather, **or**
    - **(c)** Raw HTML source dumped as text, **or**
    - **(d)** An error.

    This determines whether the widget requirement is met. Do not guess or paraphrase — say exactly what appeared.
11. **If (a) — a widget rendered:** exercise it and screenshot each result:
    - Click a different **day card** (e.g. Thu) — the chart title and values should change.
    - Click the **Rain %** toggle — the chart should switch to bars.
    - Click the **Flash Flood Warning** card — it should expand to full NWS text.
12. Send: **`Show me active severe weather alerts right now`** and screenshot — confirms the second tool.

### Part C — Capture the share link

13. Find the agent's **share link** (the pattern looks like `https://athenachat.bot/chatbot/agent/<slug>`).
14. ✅ **Checkpoint:** screenshot where you found it, and copy the exact URL.
15. Confirm the link opens the agent — ideally check it loads in a logged-out/incognito context, since the examiner will open it without Lucas's session. If it demands login, **say so explicitly**; that would block the submission.

### Report back

Report these, in this order:

1. **The agent share link** (exact URL) — this is the single most important output.
2. **Did the MCP server attach?** Which tools were listed.
3. **Did a widget render inline?** (a) / (b) / (c) / (d) from step 10, described precisely.
4. **Which interactions worked** — day selector, metric toggle, alert expansion.
5. **Whether the share link works logged-out.**
6. **Anything you had to deviate on** — different field names, unexpected wizard steps, validation errors.
7. All ✅ checkpoint screenshots.

If you hit the paywall, 2FA, or the MCP field rejects the URL: **stop and report immediately with a screenshot.** Do not work around it. Lucas is on a deadline and needs to make that call himself.
