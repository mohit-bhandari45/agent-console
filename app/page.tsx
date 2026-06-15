"use client";

import { AgentWebSocketClient } from "@/lib/websocket/client";
import { Message, Segment, TraceEvent } from "@/lib/websocket/types";
import { useRef, useEffect, useState } from "react";
import TraceTimeline from "@/components/TraceTimeline";
import { highlightElement } from "@/lib/utils";

export default function Home() {
    const clientRef = useRef<AgentWebSocketClient | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [connState, setConnState] = useState<string>("disconnected");
    const [input, setInput] = useState<string>("");
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const [events, setEvents] = useState<TraceEvent[]>([]);
    const [isStreaming, setIsStreaming] = useState<boolean>(false)

    useEffect(() => {
        const client = new AgentWebSocketClient(
            (text, stream_id) => {
                setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (!last || last.role === "user") return prev;
                    if (!last.stream_id) last.stream_id = stream_id
                    const lastSegment = last.segments[last.segments.length - 1];
                    if (lastSegment && lastSegment.kind === "text") {
                        lastSegment.content += text;
                    } else {
                        last.segments.push({ kind: "text", content: text });
                    }
                    return updated;
                });
            },
            (call_id, tool_name, args) => {
                setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (!last || last.role !== "agent") return prev;
                    last.segments.push({ kind: "tool", call_id, tool_name, args, status: "waiting" });
                    return updated;
                });
            },
            (call_id, result) => {
                setMessages(prev => prev.map((message, index) => {
                    if (index !== prev.length - 1) return message;
                    if (message.role !== "agent") return message;
                    return {
                        ...message,
                        segments: message.segments.map(seg => {
                            if (seg.kind === "tool" && seg.call_id === call_id) {
                                return { ...seg, result, status: "done" as const }
                            }
                            return seg;
                        })
                    }
                }));
            },
            (state) => setConnState(state),
            (event) => setEvents(prev => [...prev, event]),
            () => setIsStreaming(false)
        );

        clientRef.current = client;
        client.connect();
        return () => client.disconnect();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function handleSend() {
        if (!input.trim()) return;

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: "user",
            segments: [{ kind: "text", content: input }]
        };
        const agentMessage: Message = {
            id: `agent_${Date.now()}`,
            role: "agent",
            segments: []
        };

        setMessages(prev => [...prev, userMessage, agentMessage]);
        setIsStreaming(true)
        clientRef.current?.sendMessage(input);
        setInput("");
    }

    const statusColor =
        connState === "connected" ? "bg-green-500" :
            connState === "reconnecting" ? "bg-yellow-500" :
                connState === "resuming" ? "bg-blue-500" :
                    "bg-red-500";

    return (
        <main className="flex flex-col h-screen bg-gray-950 text-gray-100">

            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900">
                <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                <span className="text-sm font-medium text-gray-200">Agent Console</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded font-mono ${connState === "connected" ? "bg-green-900 text-green-300" :
                    connState === "reconnecting" ? "bg-yellow-900 text-yellow-300" :
                        connState === "resuming" ? "bg-blue-900 text-blue-300" :
                            "bg-red-900 text-red-300"
                    }`}>
                    {connState}
                </span>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">

                {/* LEFT — Chat Panel */}
                <div className="flex flex-col flex-1 overflow-hidden">

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                Send a message to start...
                            </div>
                        )}
                        {messages.map(message => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div id={`chat-${message.stream_id}`} className={`max-w-lg rounded-xl px-4 py-3 text-sm ${message.role === "user"
                                    ? "bg-blue-600 text-white rounded-br-sm"
                                    : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"
                                    }`}>
                                    {message.segments.map((segment, i) => (
                                        <SegmentView key={i} segment={segment} />
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900">
                        <input
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            value={input}
                            disabled={isStreaming}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSend()}
                            placeholder="Type hello, report, analyze, lookup, schema..."
                        />
                        <button
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                            disabled={isStreaming}
                            onClick={handleSend}
                        >
                            Send
                        </button>
                    </div>
                </div>

                {/* RIGHT — Trace Timeline */}
                <div className="w-80 border-l border-gray-800 overflow-hidden flex flex-col">
                    <TraceTimeline events={events} />
                </div>

            </div>
        </main>
    );
}

function SegmentView({ segment }: { segment: Segment }) {
    if (segment.kind === "text") {
        return <p className="whitespace-pre-wrap leading-relaxed">{segment.content}</p>;
    }

    if (segment.kind === "tool") {
        return (
            <div
                id={`chat-${segment.call_id}`}
                onClick={() => highlightElement(`timeline-${segment.call_id}`)}
                className={`my-2 p-3 rounded-lg text-xs font-mono border cursor-pointer ${segment.status === "waiting"
                    ? "bg-yellow-950 border-yellow-800 text-yellow-300"
                    : "bg-green-950 border-green-800 text-green-300"
                    }`}>
                <div className="font-bold mb-1">
                    {segment.status === "waiting" ? "⏳" : "✅"} {segment.tool_name}
                </div>
                <div className="opacity-70">
                    args: {JSON.stringify(segment.args)}
                </div>
                {segment.result && (
                    <div className="mt-1 opacity-70">
                        result: {JSON.stringify(segment.result)}
                    </div>
                )}
            </div>
        );
    }
}