"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";

type Msg = {
  role: "user" | "assistant";
  content: string;
  at: number;
};

export default function ChatUI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("chat_messages");
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("chat_messages", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setError(null);
    const next = [...messages, { role: "user", content: text, at: Date.now() } as Msg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply || "", at: Date.now() }]);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-xl font-semibold">Core Chat</h2>
      <div className="h-64 overflow-y-auto rounded border p-3 bg-white/50 dark:bg-zinc-900/50">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-500">Bắt đầu trò chuyện...</div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="rounded p-2 border">
              <div className="text-xs text-zinc-500 flex items-center justify-between">
                <span>{m.role === "user" ? "Bạn" : "Trợ lý"}</span>
                <span>{format(new Date(m.at), "HH:mm:ss dd/MM")}</span>
              </div>
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>
                    {m.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              )}
            </div>
          ))}
          {loading && <div className="text-sm text-zinc-500">Đang trả lời...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập tin nhắn..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50 dark:bg-zinc-200 dark:text-black"
          onClick={send}
          disabled={loading}
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
