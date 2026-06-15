# Agent Console

A real-time AI agent console built with Next.js 14, TypeScript, and WebSockets. Connects to a mock AI agent backend, renders streaming responses with mid-stream tool call interruptions, displays a live agent trace timeline, and survives chaos mode without crashing or losing state.

---

## Architecture

The application is split into two layers:

**Protocol Layer (`lib/websocket/`)** — handles all WebSocket communication independently of React. The `AgentWebSocketClient` class manages connection lifecycle, heartbeat responses, sequence ordering, deduplication, and state recovery. The `SequenceBuffer` class ensures messages are always processed in seq order regardless of arrival order.

**Render Layer (`app/`, `components/`)** — React components that receive data via callbacks from the protocol layer. The chat panel renders streaming segments, the trace timeline logs every protocol event in real time.

---

## WebSocket State Machine

```
DISCONNECTED
     │
     ▼ connect()
CONNECTING
     │
     ▼ onopen
CONNECTED ──────────────────────────────┐
     │                                  │
     ▼ USER_MESSAGE sent                │
STREAMING                               │
     │                                  │
     ▼ TOOL_CALL arrives                │
TOOL_CALL_PENDING                       │
     │                                  │
     ▼ TOOL_RESULT arrives              │
STREAMING (resumes)                     │
     │                                  │
     ▼ STREAM_END                       │
IDLE ───────────────────────────────────┘
     │
     ▼ onclose / onerror
RECONNECTING
     │
     ▼ scheduleReconnect() with backoff
CONNECTING
     │
     ▼ onopen + lastProcessedSeq > 0
RESUMING ── sends RESUME { last_seq } ──► server replays missed events
     │
     ▼ first message arrives
CONNECTED
```

---

## Running the App

### 1. Start the backend

```bash
cd hiring/June-2026_FullStackAI/agent-server
docker build -t agent-server .
docker run -p 4747:4747 agent-server
```

For chaos mode:

```bash
docker run -p 4747:4747 agent-server --mode chaos
```

### 2. Start the frontend

```bash
cd agent-console
npm install
npm run dev
```

Open `http://localhost:3000`

### 3. Build for production

```bash
npm run build
npm run start
```

---

## Trigger Keywords

The backend picks responses based on keywords in your message:

| Type this | What happens |
|---|---|
| `hello` | Simple greeting, no tool calls |
| `report` | One tool call mid-stream + context update |
| `analyze` | Two sequential tool calls |
| `lookup` | Tool call before any tokens |
| `schema` | 550KB context snapshot |
| `long` | Long response with many tokens |

---

## Project Structure

```
agent-console/
├── app/
│   └── page.tsx              ← main page, wires callbacks
├── lib/
│   └── websocket/
│       ├── client.ts         ← WebSocket connection manager
│       ├── sequenceBuffer.ts ← seq ordering + deduplication
│       └── types.ts          ← all TypeScript types
├── components/
│   └── TraceTimeline/
│       └── index.tsx         ← real-time event log panel
├── DECISIONS.md              ← architectural decisions
└── README.md
```

---

## Key Technical Decisions

See `DECISIONS.md` for full details. Summary:

- **Seq ordering:** `SequenceBuffer` uses `Map` + `Set` for O(1) ordering and deduplication
- **Tool call interruptions:** Agent messages modeled as `Segment[]` arrays — text never reflows
- **State recovery:** `RESUME` uses `lastProcessedSeq` (DOM-rendered) not `lastReceivedSeq` (socket-received)
- **PING handling:** Replied to immediately in `onmessage`, also buffered to fill seq gaps
- **Buffer reset:** Resets on `sendMessage()` not `STREAM_END` — aligns with server seq restart

---

## Screenshots

### Streamed Response with Tool Call
![Chat panel showing streaming text with tool call card](./screenshots/chat-tool-call.png)

### Trace Timeline
![Trace timeline showing all protocol events](./screenshots/trace-timeline.png)

---

## Chaos Mode Screen Recording

[Link to screen recording]

---

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **Native WebSocket API** (no libraries)