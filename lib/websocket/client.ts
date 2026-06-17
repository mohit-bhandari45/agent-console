import { ClientMessage, ServerMessage } from "./types";
import { SequenceBuffer } from "./sequenceBuffer";
import { TraceEvent } from "./types";

export class AgentWebSocketClient {
    private ws: WebSocket | null = null;
    private streamingText: string = "";
    private reconnectAttempts: number = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private buffer: SequenceBuffer = new SequenceBuffer();
    private currentState: string = "disconnected";
    private onTokenCallback: ((text: string, stream_id: string) => void) | null = null;
    private onToolCallCallback: ((call_id: string, tool_name: string, args: Record<string, unknown>) => void) | null = null;
    private onToolResultCallback: ((call_id: string, result: Record<string, unknown>) => void) | null = null;
    private onStateChangeCallback: (state: string) => void
    private onEventCallback: (event: TraceEvent) => void;
    private onStreamEndCallback: (() => void) | null = null

    constructor(
        onToken: (text: string, stream_id: string) => void,
        onToolCall: ((call_id: string, tool_name: string, args: Record<string, unknown>) => void),
        onToolResult: ((call_id: string, result: Record<string, unknown>) => void),
        onStateChange: (state: string) => void,
        onEvent: (event: TraceEvent) => void,
        onStreamEnd: () => void
    ) {
        this.onTokenCallback = onToken;
        this.onToolCallCallback = onToolCall;
        this.onToolResultCallback = onToolResult;
        this.onStateChangeCallback = onStateChange;
        this.onEventCallback = onEvent;
        this.onStreamEndCallback = onStreamEnd;
    }

    sendMessage(content: string): void {
        this.ws?.send(JSON.stringify({ type: "USER_MESSAGE", content: content }));
    }

    connect(): void {
        this.ws = new WebSocket("ws://localhost:4747/ws");

        this.ws.onopen = () => {
            console.log("Connected to server")
            this.reconnectAttempts = 0;

            const last_seq: number = this.buffer.getLastProcessed();
            if (last_seq > 0) {
                const RESUME: ClientMessage = {
                    type: "RESUME",
                    last_seq: last_seq
                };
                this.ws?.send(JSON.stringify(RESUME));
                this.setState("resuming");
            } else {
                this.setState("connected");
            }
        }

        this.ws.onmessage = (event) => {
            if (this.currentState === "resuming") {
                this.setState("connected");
            }
            const message: ServerMessage = JSON.parse(event.data);
            console.log("Message type:", message.type, "seq:", message.seq)

            if (message.type === "PING") {
                const PONG: ClientMessage = {
                    type: "PONG",
                    echo: message.challenge || ""
                }
                this.ws?.send(JSON.stringify(PONG))
                console.log("Sent PONG for challenge:", message.challenge)
            }

            const messages: ServerMessage[] = this.buffer.add(message);
            for (const message of messages) {
                console.log("Processing seq:", message.seq, "type:", message.type)
                const eventPayload: TraceEvent = {
                    timestamp: Date.now(),
                    message: message
                };
                this.onEventCallback?.(eventPayload);
                this.handleMessage(message);
            }
        }

        this.ws.onclose = () => {
            console.log("Connection closed")
            this.setState?.("reconnecting");
            this.scheduleReconnect();
        }

        this.ws.onerror = () => {
            console.log("Connection error")
            this.setState?.("reconnecting");
            this.scheduleReconnect();
        }
    }

    handleMessage(message: ServerMessage) {
        if (message.type === "PING") {
            const PONG: ClientMessage = {
                type: "PONG",
                echo: message.challenge || ""
            }
            this.ws?.send(JSON.stringify(PONG));
            console.log("Sent PONG for challenge:", message.challenge)
        } else if (message.type === "TOKEN") {
            this.streamingText += message.text;
            this.onTokenCallback?.(message.text, message.stream_id);
            console.log("Current text so far: ", this.streamingText);
        } else if (message.type === "STREAM_END") {
            console.log("Stream finished! Full text:", this.streamingText);
            this.streamingText = "";
            this.onStreamEndCallback?.();
            this.buffer.reset();
        } else if (message.type === "TOOL_CALL") {
            console.log("Tool Call: ", message.tool_name, message.args);

            const TOOL_ACK: ClientMessage = {
                type: "TOOL_ACK",
                call_id: message.call_id
            }
            this.ws?.send(JSON.stringify(TOOL_ACK));
            this.onToolCallCallback?.(message.call_id, message.tool_name, message.args);
        } else if (message.type === "TOOL_RESULT") {
            console.log("Tool result:", message.call_id, message.result)
            this.onToolResultCallback?.(message.call_id, message.result);
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        const delay: number = Math.min(500 * Math.pow(2, this.reconnectAttempts), 1000);
        console.log(`Reconnecting in ${delay}ms...`)

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect()
        }, delay)
    }

    private setState(state: string) {
        this.currentState = state;
        this.onStateChangeCallback?.(state);
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }
}