# API & Tool Reference

## Worker HTTP endpoints

### `GET /api/health`
```json
{ "ok": true, "key": true, "toolSecret": true }
```

### `GET /api/token`
Mints an AssemblyAI Voice Agent token (valid 300 s to connect, session up to 3 h) and returns the station's inline session config. `?voice_focus=0` leaves out `input.voice_focus`.
```json
{
  "token": "…",
  "wsUrl": "wss://agents.assemblyai.com/v1/ws",
  "session": {
    "system_prompt": "…",
    "tools": [{ "type": "function", "name": "fire_ticket", "description": "…", "parameters": { … }, "timeout_seconds": 5 }, …],
    "input": { "format": { "encoding": "audio/pcm" }, "keyterms": ["86", "all day", "Salmon", …], "voice_focus": "near-field", "voice_focus_threshold": 0.85 },
    "output": { "voice": "michael", "format": { "encoding": "audio/pcm" } }
  }
}
```
The token request and `wsUrl` are derived from the `AAI_BASE` var (default `https://agents.assemblyai.com`), which `npm run dev:mock` points at the local fake server.

Errors: `500 {"error":"ASSEMBLYAI_API_KEY is not set"}`, `502` if AssemblyAI refuses or can't be reached.

### `GET /api/tools/inventory?item=<name>`
HTTP tool (owner phone agent). Requires the header `x-tool-secret: <TOOL_SECRET>`, otherwise `401`.
```json
{ "ok": true, "item": "Brownie", "remaining": 10, "out": false, "summary": "10 Brownie left." }
```
Unknown item: `{ "ok": false, "error": "unknown_item", "options": ["…"], "summary": "Which item?" }`

### `GET /api/tools/report`
HTTP tool (owner line). Same auth.
```json
{
  "ok": true,
  "out_of_stock": ["Salmon"],
  "open_tickets": 4, "done_tickets": 1, "oldest_open_minutes": 14,
  "low_stock": ["Short Rib (2)"],
  "recent": ["86 Salmon", "Fired table 12", "…"],
  "summary": "86 list: Salmon. 4 open tickets, 1 done."
}
```

## Kitchen WebSocket (`/ws`)
All screens and stations connect here. Messages are JSON.

**Client → server**
| Message | Meaning |
|---|---|
| `{ "type": "action", "id": 1, "action": { "type": "mark_86", "item": "salmon", "remaining": 0 } }` | Run an action. Any action below |
| `{ "type": "action", "id": 2, "action": { "type": "seed_rush" } }` | Reset and load demo tickets |
| `{ "type": "action", "id": 3, "action": { "type": "reset" } }` | Reset to the menu defaults |
| `{ "type": "ping", "id": 4 }` | Replies with `pong` |

**Server → client**
| Message | When |
|---|---|
| `{ "type": "state", "state": State }` | On connect and after every change (to everyone) |
| `{ "type": "ack", "id": 1, "result": Result }` | Reply to the sender of an action |
| `{ "type": "alert", "table": 4, "text": "Table 4, 12 minutes." }` | A fired ticket passed 10 minutes (once per ticket) |
| `{ "type": "error", "error": "bad_json" }` | Malformed message |

The browser helper is `connectBoard({ onState, onAlert, onStatus })` in `public/js/board.js`, which returns `{ act(action) → Promise<Result> }` and reconnects automatically.

## State
```ts
State = {
  items: Array<{ id, name, aliases: string[], count: number, price, category, out: boolean, outAt: number|null }>,
  tickets: Array<{
    id: number, table: number, source: 'pos'|'online',
    status: 'new'|'fired'|'held'|'done'|'void',
    lines: Array<{ id, name, qty }>,
    createdAt: number, firedAt?: number, doneAt?: number,
    allergy: string|null, alerted: boolean
  }>,
  log: Array<{ at: number, text: string }>,   // newest first, max 40
  nextTicket: number
}

Result = { ok: true, say: string, ...extra } | { ok: false, error: string, say?: string, ...extra }
```
Actions target the **most recent open** ticket (`new` / `fired` / `held`) for a table.

## Actions
| Action | Args | Success `say` | Errors |
|---|---|---|---|
| `fire_ticket` | `table` | `Fired 12.` | `no_open_ticket` |
| `hold_ticket` | `table` | `Holding 9.` | `no_open_ticket` |
| `bump_ticket` | `table` | `Bumped 4.` | `no_open_ticket` |
| `void_ticket` | `table`, `confirmed` | `Voided 7.` | `needs_confirmation` (if `confirmed !== true`), `no_open_ticket` |
| `flag_allergy` | `table`, `allergen` | `12: nuts flagged.` | `no_open_ticket` |
| `ticket_status` | `table` | `7: 14 minutes, fired.` + `minutes`, `status`, `items`, `allergy` | `no_open_ticket` |
| `mark_86` | `item`, `remaining` (0 = out) | `86 Salmon.` / `Short Rib, 2 left.` | `unknown_item` + `options` |
| `restore_item` | `item`, `count?` (default 10) | `Salmon back on.` | `unknown_item` |
| `all_day` | `item` | `3 Truffle Fries all day. 2 open tickets.` + `all_day`, `remaining` | `unknown_item` |
| `inventory_lookup` | `item` | `10 Brownie left.` | `unknown_item` |
| `add_ticket` | `lines: [{item, qty}]`, `table?`, `source?` | `Ticket 106 in.` + `table` | `unknown_item`, `sold_out` + `item`, `empty_ticket` |
| `report` | – | summary | – |
| `mark_alerted` | `id` | – | internal |

## Voice agent tools (`agent/station.json`)
All station tools are client-side function tools (`"type": "function"`), sent inline in `session.update`, using the default `execution_mode: "interactive"`. Item parameters are restricted to an `enum` of the lowercase menu names, filled in by `src/session.js` from `data/menu.json`.

| Tool | Kind | Parameters | Example utterances |
|---|---|---|---|
| `fire_ticket` | client | `table: integer` | "Fire twelve", "Fire table nine" |
| `hold_ticket` | client | `table: integer` | "Hold nine" |
| `bump_ticket` | client | `table: integer` | "Bump four", "Twelve is up", "Seven out the window" |
| `void_ticket` | client | `table: integer`, `confirmed: boolean` | "Void seven" → "Void 7?" → "Yes" |
| `flag_allergy` | client | `table: integer`, `allergen: string` | "Twelve has a nut allergy" |
| `ticket_status` | client | `table: integer` | "How long on seven?", "Where's nine?" |
| `mark_86` | client | `item: enum`, `remaining: integer` | "86 salmon", "Two short rib left" |
| `restore_item` | client | `item: enum`, `count?: integer` | "Salmon is back on" |
| `all_day` | client | `item: enum` | "All day fries" |
| `inventory_lookup` | client | `item: enum` | "How many brownies left?" |

Example exchange on the AssemblyAI socket:
```json
← {"type":"tool.call","call_id":"call_1","name":"mark_86","arguments":{"item":"salmon","remaining":0}}
→ {"type":"tool.result","call_id":"call_1","result":"{\"ok\":true,\"say\":\"86 Salmon.\",\"item\":\"Salmon\",\"remaining\":0}"}
← {"type":"transcript.agent","text":"86 salmon.","interrupted":false}
```

### Owner phone agent (`agent/owner.json`, stored agent created by `npm run agent:owner`)
| Tool | Kind | Endpoint |
|---|---|---|
| `get_service_report` | HTTP GET | `/api/tools/report` |
| `inventory_lookup` | HTTP GET | `/api/tools/inventory` |

## AssemblyAI messages used
| Direction | Message | Used for |
|---|---|---|
| → | `session.update { session }` | Start a session with the inline config |
| → | `session.resume { session_id }` | Reconnect within 30 s |
| → | `input.audio { audio }` | 80 ms PCM16 24 kHz batches (2 × 40 ms worklet chunks), base64 |
| → | `tool.result { call_id, result }` | As soon as the tool finishes; `result` is a JSON string |
| → | `reply.create { instructions }` | Late-ticket alerts |
| → | `session.end` | Stop |
| ← | `session.ready`, `session.ended`, `session.error` | Lifecycle |
| ← | `input.speech.started/stopped` | Result timing, latency clock |
| ← | `transcript.user.delta`, `transcript.user`, `transcript.agent` | Live transcript, log |
| ← | `transcript.agent.delta` | Silent-reply gate (audio plays only once real words arrive) |
| ← | `reply.started`, `reply.audio`, `reply.done` | Playback, barge-in, result timing |
| ← | `tool.call` | Client tools |
