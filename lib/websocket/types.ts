// server -> client
interface TokenMessage {
    type: "TOKEN";
    seq: number;
    text: string;
    stream_id: string;
}

interface ToolCallMessage {
    type: "TOOL_CALL";
    seq: number;
    call_id: string;
    tool_name: string;
    args: Record<string, unknown>;
    stream_id: string
}

interface ToolResultMessage {
    type: "TOOL_RESULT";
    seq: number;
    call_id: string;
    result: Record<string, unknown>
    stream_id: string
}

export interface ContextSnapshotMessage {
  type: "CONTEXT_SNAPSHOT";
  seq: number;
  context_id: string;
  data: Record<string, unknown>;
}

interface PingMessage {
    type: "PING",
    seq: number,
    challenge: string
}

interface StreamEndMessage {
    type: "STREAM_END";
    seq: number;
    stream_id: string;
}


export type ServerMessage = TokenMessage | PingMessage | StreamEndMessage | ToolCallMessage | ToolResultMessage | ContextSnapshotMessage;

// client -> server
interface PongPayload {
    type: "PONG",
    echo: string
}

interface ToolAckPayload {
    type: "TOOL_ACK",
    call_id: string
}

interface ResumePayload {
    type: "RESUME",
    last_seq: number;
}

export type ClientMessage = PongPayload | ToolAckPayload | ResumePayload;

// -------------- Frontend Types ---------------

// Chat types
type TextSegment = {
    kind: "text"
    content: string
}

type ToolSegment = {
    kind: "tool"
    call_id: string;
    tool_name: string;
    args: Record<string, unknown>
    result?: Record<string, unknown>
    status: "waiting" | "done"
}

export type Segment = TextSegment | ToolSegment;
export type Message = {
    id: string;
    role: "user" | "agent"
    segments: Segment[]
    stream_id?: string
}

// TraceTimeline types
export type TraceEvent = {
    timestamp: number
    message: ServerMessage
}

type TokenBatch = {
    kind: "token_batch";
    startSeq: number
    endSeq: number
    count: number
    text: string
    startTime: number
    endTime: number
    stream_id: string
}

type SingleEvent = {
  kind: "single"
  timestamp: number
  message: ServerMessage
}

export type TimelineEntry = TokenBatch | SingleEvent;