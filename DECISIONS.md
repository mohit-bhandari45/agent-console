# DECISIONS.md

## Architectural Approach

This application is a real-time AI agent console built with Next.js 14 (App Router) and TypeScript. The core challenge is not UI rendering but distributed systems: handling out-of-order WebSocket messages, mid-stream tool call interruptions, and seamless state recovery after connection drops.

---

## 1. Seq-Based Ordering and Deduplication

**Problem:** In chaos mode, messages arrive out of order and duplicates are sent.

**Solution:** A `SequenceBuffer` class that acts as a waiting room:
- Every incoming message is stored in a `Map<number, ServerMessage>` keyed by seq number
- A `Set<number>` tracks all processed seq numbers for deduplication
- A `nextExpected` counter tracks which seq to process next
- The `drain()` method processes all consecutive messages starting from `nextExpected`

**Data structure choice:** `Map` for O(1) lookup by seq number. `Set` for O(1) duplicate checking. Both are more efficient than arrays for this use case.

**Why not sort an array?** Sorting is O(n log n) on every message arrival. Map + drain is O(1) per message in the common case.

**Reset strategy:** Buffer resets on `sendMessage()` — not on `STREAM_END`. This is because PING messages continue with increasing seq numbers after STREAM_END, and the next user message always starts from seq 1. Resetting on send aligns perfectly with the server's seq counter restart.

**PING handling:** PING is handled immediately in `onmessage` before the buffer (for timely PONG response) but also passes through the buffer to fill seq gaps. This prevents downstream messages from being stuck waiting for a PING seq that was never buffered.

---

## 2. Preventing Layout Shift During Tool Call Interruptions

**Problem:** When a TOOL_CALL arrives mid-stream, the text must freeze in place without reflow or flicker. When streaming resumes after TOOL_RESULT, text must continue from exactly where it paused.

**Solution:** Each agent message is modeled as an array of `Segment` objects:

```typescript
type Segment = TextSegment | ToolSegment
```

- When TOKEN arrives → append to last `TextSegment` or create new one
- When TOOL_CALL arrives → push a new `ToolSegment` with `status: "waiting"`
- When TOOL_RESULT arrives → update that `ToolSegment` to `status: "done"`
- When TOKEN arrives after tool → push a NEW `TextSegment`

This means text never moves. Each segment is fixed in place. The tool card appears between two frozen text segments. No reflow possible.

**CSS strategy:** `whitespace-pre-wrap` on text segments preserves spacing. Tool cards use fixed height with no layout dependency on surrounding text.

---

## 3. Reconnection State Recovery

**Problem:** When connection drops, the client must recover exactly where it left off — not restart from zero.

**Key insight:** Two different numbers matter:
- What the socket **received** (raw)
- What the UI **rendered** (processed by `handleMessage`)

The `RESUME` message uses the second number — `lastProcessedSeq` from `SequenceBuffer` — because this represents what was actually rendered to the DOM, not just received.

**Reconnection flow:**
1. `onclose` fires → set state to "reconnecting"
2. `scheduleReconnect()` with exponential backoff (500ms → 1s → 2s → 4s → 8s, capped at 10s)
3. `onopen` fires → check `lastProcessedSeq`
4. If > 0 → send `RESUME { last_seq }` as first message → set state to "resuming"
5. If = 0 → fresh connection → set state to "connected"
6. First message after RESUME → set state back to "connected"

**Mid-tool-call drop:** If connection drops after TOOL_CALL but before TOOL_RESULT, the tool card remains visible with "waiting" status. When server replays TOOL_RESULT after RESUME, the card updates correctly because the segment is found by `call_id`.

---

## 4. Operations Dashboard (50 Concurrent Streams)

If this needed to handle 50 concurrent agent streams on one screen:

- **State isolation:** Each stream gets its own state slice — messages, events, connection state. A `Map<streamId, StreamState>` would replace the single message array.
- **Virtual scrolling:** With 50 timelines updating at 30+ events/sec, DOM nodes become the bottleneck. React Virtual or TanStack Virtual would render only visible rows.
- **Shared WebSocket:** Instead of 50 separate WebSocket connections, one multiplexed connection with stream routing by `stream_id`.
- **Web Workers:** Move seq ordering and message processing off the main thread to prevent UI jank.
- **Throttled renders:** Batch state updates with `unstable_batchedUpdates` or a 100ms render throttle per stream.

---

## 5. 100x Longer Responses (Document Generation)

If agent responses were 100x longer:

- **Virtualized text rendering:** Instead of one `<p>` tag with the full text, split into chunks and use virtual scrolling so only visible text is in the DOM.
- **Streaming to a ref:** Accumulate text in a `useRef` instead of `useState` to avoid re-rendering the full component on every token. Flush to DOM on a 100ms interval.
- **Progressive diff:** For the trace timeline, token batches would become very large. Cap batch display at 500 tokens and paginate within the batch.
- **Memory management:** Clear old messages from state after they scroll out of view, keeping only the last N messages in memory.

---

## 6. Known Protocol Race Condition

The `TOOL_ACK` timeout creates a race condition:

- Server waits up to 5 seconds for `TOOL_ACK`
- Client sends `TOOL_ACK` immediately upon receiving `TOOL_CALL`
- But in chaos mode, if the connection drops between `TOOL_CALL` and `TOOL_ACK`, the server may send `TOOL_RESULT` before the client reconnects and sends `TOOL_ACK` for the replayed `TOOL_CALL`

This means the server could log a protocol violation even though the client behaved correctly — it sent `TOOL_ACK` for the replayed message as soon as it received it. The race condition is in the protocol design, not the client implementation.

---

## State Management Choice

**Plain React state (`useState`)** with careful immutability.

**Why not Redux/Zustand?** The state shape is simple — messages array, events array, connection state. The complexity is in the WebSocket layer (the `AgentWebSocketClient` class), not in state management. Adding a state library would add indirection without solving the real problems.

**Why not `useReducer`?** The WebSocket callbacks already act as reducers — they receive the current state and return the new state. Extracting them into a separate reducer file would add boilerplate without clarity.

**The real state machine** lives in `AgentWebSocketClient` as `currentState: string` — not in React. This is intentional: connection lifecycle management belongs in the protocol layer, not the render layer.