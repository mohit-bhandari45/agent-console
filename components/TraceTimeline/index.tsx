"use client"

import { useState } from "react"
import { TraceEvent, TimelineEntry } from "@/lib/websocket/types"
import { highlightElement } from "@/lib/utils"

function getIcon(type: string): string {
    switch (type) {
        case "TOOL_CALL": return "🔧"
        case "TOOL_RESULT": return "✅"
        case "CONTEXT_SNAPSHOT": return "📸"
        case "PING": return "💓"
        case "STREAM_END": return "🏁"
        case "ERROR": return "❌"
        default: return "📌"
    }
}

type Props = { events: TraceEvent[] }

export default function TraceTimeline({ events }: Props) {
    const [filter, setFilter] = useState<string>("ALL")
    const [search, setSearch] = useState<string>("")
    const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set())

    const entries: TimelineEntry[] = []
    for (const event of events) {
        const msg = event.message;

        if (msg.type === "TOKEN") {
            const last = entries[entries.length - 1]
            if (last && last.kind === "token_batch") {
                last.endSeq = msg.seq
                last.count++
                last.text += msg.text
                last.endTime = event.timestamp
            } else {
                entries.push({
                    kind: "token_batch",
                    startSeq: msg.seq,
                    endSeq: msg.seq,
                    count: 1,
                    text: msg.text,
                    startTime: event.timestamp,
                    endTime: event.timestamp,
                    stream_id: msg.stream_id
                })
            }
        } else {
            entries.push({
                kind: "single",
                timestamp: event.timestamp,
                message: msg
            })
        }
    }

    const filtered = entries.filter(entry => {
        if (filter !== "ALL") {
            if (entry.kind === "token_batch" && filter !== "TOKEN") return false
            if (entry.kind === "single" && entry.message.type !== filter) return false
        }
        if (search) {
            const str = JSON.stringify(entry).toLowerCase()
            if (!str.includes(search.toLowerCase())) return false
        }
        return true
    })

    const toggleBatch = (i: number) => {
        setExpandedBatches(prev => {
            const next = new Set(prev)
            next.has(i) ? next.delete(i) : next.add(i)
            return next
        })
    }

    return (
        <div className="flex flex-col h-full bg-gray-950">

            {/* Header */}
            <div className="p-3 border-b border-gray-800 bg-gray-900">
                <h2 className="text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wider">
                    Trace Timeline
                </h2>

                {/* Filter buttons */}
                <div className="flex flex-wrap gap-1 mb-2">
                    {["ALL", "TOKEN", "TOOL_CALL", "TOOL_RESULT", "PING", "CONTEXT_SNAPSHOT"].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${filter === f
                                ? "bg-blue-600 text-white"
                                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <input
                    className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.length === 0 && (
                    <p className="text-xs text-gray-600 text-center mt-6 font-mono">
                        No events yet...
                    </p>
                )}

                {filtered.map((entry, i) => {
                    if (entry.kind === "token_batch") {
                        const duration = ((entry.endTime - entry.startTime) / 1000).toFixed(2)
                        const isExpanded = expandedBatches.has(i)

                        return (
                            <div
                                key={i}
                                id={`timeline-${entry.stream_id}`}
                                className="rounded-lg p-2 bg-blue-950 border border-blue-900 cursor-pointer hover:border-blue-700 transition-colors"
                                onClick={() => {
                                    highlightElement(`chat-${entry.stream_id}`);
                                    toggleBatch(i)
                                }}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-mono text-blue-300">
                                        💬 {entry.count} tokens ({duration}s) {isExpanded ? "▲" : "▼"}
                                    </span>
                                    <span className="text-xs text-blue-700 font-mono">
                                        [{entry.startSeq}-{entry.endSeq}]
                                    </span>
                                </div>
                                {isExpanded && (
                                    <p className="text-xs text-blue-400 mt-2 pt-2 border-t border-blue-900 font-mono leading-relaxed">
                                        {entry.text}
                                    </p>
                                )}
                            </div>
                        )
                    }

                    const isToolResult = entry.message.type === "TOOL_RESULT"

                    return (
                        <div
                            key={i}
                            id={
                                entry.message.type === "TOOL_CALL" ? `timeline-${entry.message.call_id}` :
                                    entry.message.type === "TOOL_RESULT" ? `timeline-result-${entry.message.call_id}` :
                                        `timeline-${entry.message.seq}`
                            }
                            onClick={() => {
                                if (entry.message.type === "TOOL_CALL") {
                                    highlightElement(`chat-${entry.message.call_id}`);
                                }
                                if (entry.message.type === "TOOL_RESULT") {
                                    highlightElement(`chat-${entry.message.call_id}`)
                                }
                            }}
                            className={`rounded-lg p-2 border text-xs font-mono ${isToolResult ? "ml-3 border-l-2" : ""
                                } ${entry.message.type === "TOOL_CALL"
                                    ? "bg-yellow-950 border-yellow-900 text-yellow-300"
                                    : entry.message.type === "TOOL_RESULT"
                                        ? "bg-green-950 border-green-800 border-l-green-500 text-green-300"
                                        : entry.message.type === "CONTEXT_SNAPSHOT"
                                            ? "bg-purple-950 border-purple-900 text-purple-300"
                                            : entry.message.type === "PING"
                                                ? "bg-gray-900 border-gray-800 text-gray-500"
                                                : entry.message.type === "STREAM_END"
                                                    ? "bg-gray-900 border-gray-700 text-gray-400"
                                                    : entry.message.type === "ERROR"
                                                        ? "bg-red-950 border-red-900 text-red-300"
                                                        : "bg-gray-900 border-gray-800 text-gray-400"
                                }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">
                                    {getIcon(entry.message.type)} {entry.message.type}
                                </span>
                                <span className="opacity-50 text-xs">
                                    [seq:{entry.message.seq}]
                                </span>
                            </div>

                            {entry.message.type === "TOOL_CALL" && entry.message.type === "TOOL_CALL" && (
                                <div className="mt-1 opacity-70">
                                    <div>{entry.message.tool_name}</div>
                                    <div className="break-all whitespace-pre-wrap">
                                        {JSON.stringify(entry.message.args, null, 2)}
                                    </div>
                                </div>
                            )}

                            {entry.message.type === "TOOL_RESULT" && entry.message.type === "TOOL_RESULT" && (
                                <div className="mt-1 opacity-70 break-all whitespace-pre-wrap">
                                    {JSON.stringify(entry.message.result, null, 2)}
                                </div>
                            )}

                            {entry.message.type === "CONTEXT_SNAPSHOT" && entry.message.type === "CONTEXT_SNAPSHOT" && (
                                <div className="mt-1 opacity-70">
                                    {entry.message.context_id}
                                </div>
                            )}

                            {entry.message.type === "PING" && (
                                <div className="mt-1 opacity-70">
                                    ↔ PONG sent
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}