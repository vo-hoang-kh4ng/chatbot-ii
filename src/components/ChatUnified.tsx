"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";

// Minimal message model with optional rich payloads
type Msg = {
  role: "user" | "assistant";
  at: number;
  text?: string; // markdown/plain text
  imagePreview?: string; // for user-selected image preview
  agentImageBase64?: string; // image returned by CSV Agent
  pending?: boolean; // placeholder assistant message while loading
};

type Session = {
  id: string;
  title: string;
  createdAt: number;
};

export default function ChatUnified() {
  const [mode, setMode] = useState<"chat" | "image" | "csv-simple" | "csv-agent">("chat");

  // shared chat input
  const [question, setQuestion] = useState("");

  // image inputs
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState("");
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  // csv inputs
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUrl, setCsvUrl] = useState("");

  // csv-simple options
  const [action, setAction] = useState<"summarize" | "stats" | "missing" | "histogram">("summarize");
  const [histColumn, setHistColumn] = useState("");
  const [bins, setBins] = useState<number>(10);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>("");

  // Load sessions and start a new session by default
  useEffect(() => {
    try {
      const sessRaw = localStorage.getItem("unified_sessions");
      const oldRaw = localStorage.getItem("unified_messages"); // backward compat
      let sess: Session[] = [];
      if (sessRaw) {
        const parsed = JSON.parse(sessRaw);
        if (Array.isArray(parsed)) sess = parsed;
      }

      if (!sess.length) {
        // migrate legacy single-thread if exists
        const newId = cryptoRandomId();
        const createdAt = Date.now();
        let legacyMsgs: Msg[] = [];
        if (oldRaw) {
          try {
            const parsed = JSON.parse(oldRaw);
            if (Array.isArray(parsed)) legacyMsgs = parsed;
          } catch {}
          localStorage.removeItem("unified_messages");
        }
        const firstTitle = legacyMsgs.find(m => m.role === "user" && m.text)?.text?.slice(0, 40) || "Cuộc trò chuyện";
        const firstSession: Session = { id: newId, title: firstTitle, createdAt };
        localStorage.setItem(messagesKey(newId), JSON.stringify(legacyMsgs));
        sess = [firstSession];
      }

      // Always start with a fresh session when loading the app
      const freshId = cryptoRandomId();
      const fresh: Session = { id: freshId, title: "Cuộc trò chuyện mới", createdAt: Date.now() };
      const all = [fresh, ...sess];
      setSessions(all);
      setSessionId(freshId);
      localStorage.setItem("unified_sessions", JSON.stringify(all));
      localStorage.setItem(messagesKey(freshId), JSON.stringify([]));
      setMessages([]);
    } catch {}
  }, []);

  // Persist messages per-session
  useEffect(() => {
    try {
      if (sessionId) {
        localStorage.setItem(messagesKey(sessionId), JSON.stringify(messages));
      }
    } catch {}
  }, [messages, sessionId]);

  // Helper: storage key per session
  function messagesKey(id: string) {
    return `unified_messages_${id}`;
  }

  function cryptoRandomId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      // @ts-ignore
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function createNewSession() {
    const id = cryptoRandomId();
    const s: Session = { id, title: "Cuộc trò chuyện mới", createdAt: Date.now() };
    const next = [s, ...sessions];
    setSessions(next);
    setSessionId(id);
    setMessages([]);
    localStorage.setItem(messagesKey(id), JSON.stringify([]));
    localStorage.setItem("unified_sessions", JSON.stringify(next));
  }

  function switchSession(id: string) {
    setSessionId(id);
    try {
      const raw = localStorage.getItem(messagesKey(id));
      const parsed = raw ? JSON.parse(raw) : [];
      setMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessages([]);
    }
  }

  const hasCsvInput = useMemo(() => !!csvFile || !!csvUrl, [csvFile, csvUrl]);
  const hasImgInput = useMemo(() => !!imgFile || !!imgUrl, [imgFile, imgUrl]);

  function resetAttachments() {
    setImgFile(null);
    setImgUrl("");
    setImgPreview(null);
    setCsvFile(null);
    setCsvUrl("");
  }

  function onSelectImage(f: File | null) {
    setImgFile(f);
    setImgUrl("");
    setImgPreview(f ? URL.createObjectURL(f) : null);
  }

  function isValidUrl(u: string) {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function replacePending(update: Partial<Msg>) {
    setMessages((cur) => {
      const idx = cur.findIndex((m) => m.role === "assistant" && m.pending);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], ...update, pending: false, at: Date.now() } as Msg;
        return next;
      }
      return cur;
    });
  }

  function removePendingOnError() {
    setMessages((cur) => {
      const idx = cur.findIndex((m) => m.role === "assistant" && m.pending);
      if (idx >= 0) {
        const next = [...cur];
        next.splice(idx, 1);
        return next;
      }
      return cur;
    });
  }

  async function send() {
    setError(null);

    // Build and push user message snapshot first
    const userMsg: Msg = {
      role: "user",
      at: Date.now(),
      text: question || undefined,
      imagePreview: imgPreview || undefined,
    };

    // Basic validations depending on mode
    try {
      if (mode === "image") {
        if (!hasImgInput) throw new Error("Hãy chọn ảnh hoặc nhập URL ảnh");
      } else if (mode === "csv-agent") {
        if (!hasCsvInput) throw new Error("Hãy chọn file CSV hoặc nhập URL CSV");
        if (!question.trim()) throw new Error("Nhập câu hỏi (Agent)");
      } else if (mode === "csv-simple") {
        if (!hasCsvInput) throw new Error("Hãy chọn file CSV hoặc nhập URL CSV");
        if (action === "histogram" && !histColumn) throw new Error("Nhập tên cột để vẽ histogram");
      } else {
        if (!question.trim()) throw new Error("Nhập tin nhắn");
      }

      // push user message + pending assistant placeholder
      setMessages((cur) => [
        ...cur,
        userMsg,
        { role: "assistant", at: Date.now(), text: "Trợ lý đang suy nghĩ...", pending: true },
      ]);
      // If this is the first user message, update session title
      if (sessions.length && sessionId && !messages.some(m => m.role === "user")) {
        const idx = sessions.findIndex(s => s.id === sessionId);
        if (idx >= 0) {
          const next = [...sessions];
          next[idx] = { ...next[idx], title: (userMsg.text || "Cuộc trò chuyện").slice(0, 40) };
          setSessions(next);
          localStorage.setItem("unified_sessions", JSON.stringify(next));
        }
      }
      setLoading(true);

      // Route by mode
      if (mode === "chat") {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...messages, userMsg].map(({ role, text }) => ({ role, content: text || "" })) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        replacePending({ text: data.reply || "" });
      }

      if (mode === "image") {
        let res: Response;
        if (imgUrl) {
          if (!isValidUrl(imgUrl)) throw new Error("URL ảnh không hợp lệ");
          res = await fetch("/api/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: imgUrl, prompt: question || "What's in this image?" }),
          });
        } else if (imgFile) {
          const form = new FormData();
          form.append("file", imgFile);
          form.append("prompt", question || "What's in this image?");
          res = await fetch("/api/image", { method: "POST", body: form });
        } else {
          throw new Error("Thiếu ảnh");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        setMessages((cur) => [...cur, { role: "assistant", at: Date.now(), text: data.reply || "" }]);
      }

      if (mode === "csv-agent") {
        // Use Next proxy to Python agent
        let res: Response;
        if (csvUrl) {
          if (!isValidUrl(csvUrl)) throw new Error("URL CSV không hợp lệ");
          const form = new FormData();
          form.append("question", question);
          form.append("csv_url", csvUrl);
          res = await fetch("/api/csv-agent", { method: "POST", body: form });
        } else if (csvFile) {
          const MAX = 10 * 1024 * 1024;
          if (csvFile.size > MAX) throw new Error("File CSV quá lớn (>10MB)");
          const form = new FormData();
          form.append("question", question);
          form.append("file", csvFile);
          res = await fetch("/api/csv-agent", { method: "POST", body: form });
        } else {
          throw new Error("Thiếu CSV");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.error || "Agent request failed");
        if (data.answer || data.image_base64) {
          replacePending({ text: data.answer, agentImageBase64: data.image_base64 });
        } else {
          replacePending({ text: "(Agent không trả về nội dung)" });
        }
      }

      if (mode === "csv-simple") {
        let res: Response;
        if (csvUrl) {
          if (!isValidUrl(csvUrl)) throw new Error("URL CSV không hợp lệ");
          res = await fetch("/api/csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: csvUrl, action, histogramColumn: histColumn, bins }),
          });
        } else if (csvFile) {
          const MAX = 10 * 1024 * 1024;
          if (csvFile.size > MAX) throw new Error("File CSV quá lớn (>10MB)");
          const form = new FormData();
          form.append("file", csvFile);
          form.append("action", action);
          if (histColumn) form.append("histogramColumn", histColumn);
          form.append("bins", String(bins));
          res = await fetch("/api/csv", { method: "POST", body: form });
        } else {
          throw new Error("Thiếu CSV");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        // Convert builtin result to a readable markdown summary
        let md = "";
        if (data.rowCount !== undefined) md += `Rows: ${data.rowCount}  Columns: ${(data.columns?.length)||0}` + "\n\n";
        if (data.summary) md += data.summary + "\n\n";
        if (data.missing && Array.isArray(data.missing)) {
          md += "Missing columns (top):\n" + data.missing.map((r: any) => `- ${r.column}: ${r.missing} (${r.count})`).join("\n") + "\n\n";
        }
        if (data.stats) {
          md += "Stats (head):\n" + Object.keys(data.stats).slice(0, 6).map((k) => `- ${k}`).join("\n");
        }
        replacePending({ text: md || "(đã xử lý CSV)" });
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
      removePendingOnError();
    } finally {
      setLoading(false);
      // keep attachments for context unless switching mode; do not auto-reset
    }
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-xl font-semibold">Trò chuyện thống nhất</h2>

      {/* Layout with sidebar (sessions) + main panel */}
      <div className="grid gap-4 sm:grid-cols-5">
        {/* Sidebar */}
        <aside className="sm:col-span-2 space-y-3">
          <button
            className="w-full rounded bg-black text-white px-3 py-2 text-sm dark:bg-zinc-200 dark:text-black"
            onClick={createNewSession}
          >
            Chat mới
          </button>
          <div className="rounded border divide-y max-h-96 overflow-y-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`w-full text-left p-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${s.id === sessionId ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <div className="font-medium truncate">{s.title || "(không tiêu đề)"}</div>
                <div className="text-xs text-zinc-500">{new Date(s.createdAt).toLocaleString()}</div>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="p-2 text-sm text-zinc-500">Chưa có cuộc trò chuyện</div>
            )}
          </div>
        </aside>

        {/* Main panel */}
        <div className="sm:col-span-3 space-y-4">
          {/* Conversation */}
          <div className="h-80 overflow-y-auto rounded border p-3 bg-white/50 dark:bg-zinc-900/50">
            {messages.length === 0 && <div className="text-sm text-zinc-500">Bắt đầu trò chuyện...</div>}
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className="rounded p-2 border">
                  <div className="text-xs text-zinc-500 flex items-center justify-between">
                    <span>{m.role === "user" ? "Bạn" : "Trợ lý"}</span>
                    <span>{format(new Date(m.at), "HH:mm:ss dd/MM")}</span>
                  </div>
                  {m.text && (
                    <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  )}
                  {m.imagePreview && (
                    <div className="mt-2">
                      <img src={m.imagePreview} alt="preview" className="max-h-64 rounded border object-contain" />
                    </div>
                  )}
                  {m.agentImageBase64 && (
                    <div className="mt-2">
                      <img src={`data:image/png;base64,${m.agentImageBase64}`} alt="chart" className="max-h-96 rounded border object-contain" />
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="text-sm text-zinc-500">Đang xử lý...</div>}
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          </div>

          {/* Controls */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Chế độ</label>
              <select
                className="w-full rounded border px-3 py-2"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as any);
                  setError(null);
                }}
              >
                <option value="chat">Chat văn bản</option>
                <option value="image">Ảnh (VQA)</option>
                <option value="csv-simple">CSV - Hành động đơn giản</option>
                <option value="csv-agent">CSV - Agent (Chat tự nhiên)</option>
              </select>

              {/* Image inputs */}
              {mode === "image" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tải ảnh (PNG/JPG)</label>
                  <div>
                    <label className="inline-flex items-center justify-center rounded border px-3 py-2 cursor-pointer bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                      Upload ảnh
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => onSelectImage(e.target.files?.[0] || null)} />
                    </label>
                    {imgFile && <span className="ml-2 text-sm text-green-600">{imgFile.name}</span>}
                  </div>
                  <div className="text-sm text-zinc-500">hoặc URL ảnh</div>
                  <input
                    className="w-full rounded border px-3 py-2"
                    placeholder="https://..."
                    value={imgUrl}
                    onChange={(e) => {
                      setImgUrl(e.target.value);
                      setImgFile(null);
                      setImgPreview(e.target.value || null);
                    }}
                  />
                </div>
              )}

              {/* CSV inputs shared */}
              {(mode === "csv-simple" || mode === "csv-agent") && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">CSV</label>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
                  <div className="text-sm text-zinc-500">hoặc URL CSV</div>
                  <input
                    className="w-full rounded border px-3 py-2"
                    placeholder="https://.../data.csv"
                    value={csvUrl}
                    onChange={(e) => {
                      setCsvUrl(e.target.value);
                      if (e.target.value) setCsvFile(null);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              {/* Action dropdown appears only for csv-simple */}
              {mode === "csv-simple" && (
                <>
                  <label className="text-sm font-medium">Hành động</label>
                  <select
                    className="w-full rounded border px-3 py-2"
                    value={action}
                    onChange={(e) => setAction(e.target.value as any)}
                  >
                    <option value="summarize">Tóm tắt</option>
                    <option value="stats">Thống kê cơ bản</option>
                    <option value="missing">Cột thiếu dữ liệu nhiều nhất</option>
                    <option value="histogram">Histogram cột số</option>
                  </select>
                  {action === "histogram" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="w-full rounded border px-3 py-2"
                        placeholder="Tên cột số (vd: price)"
                        value={histColumn}
                        onChange={(e) => setHistColumn(e.target.value)}
                      />
                      <input
                        type="number"
                        className="w-full rounded border px-3 py-2"
                        placeholder="Số bins"
                        value={bins}
                        min={2}
                        max={50}
                        onChange={(e) => setBins(Number(e.target.value) || 10)}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Question input: shown for chat, image, csv-agent; hidden for csv-simple unless needed */}
              {(mode === "chat" || mode === "image" || mode === "csv-agent") && (
                <>
                  <label className="text-sm font-medium">Câu hỏi</label>
                  <input
                    className="w-full rounded border px-3 py-2"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={mode === "image" ? "Hỏi về bức ảnh" : mode === "csv-agent" ? "e.g., Plot a histogram of price" : "Nhập tin nhắn..."}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                </>
              )}

              <div className="flex gap-2">
                <button
                  className="rounded bg-black text-white px-4 py-2 disabled:opacity-50 dark:bg-zinc-200 dark:text-black inline-flex items-center gap-2"
                  onClick={send}
                  disabled={
                    loading ||
                    (mode === "image" && !hasImgInput) ||
                    (mode === "csv-agent" && (!hasCsvInput || !question.trim())) ||
                    (mode === "csv-simple" && (!hasCsvInput || (action === "histogram" && !histColumn))) ||
                    (mode === "chat" && !question.trim())
                  }
                >
                  {loading && (
                    <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin"></span>
                  )}
                  {loading ? "Đang gửi..." : "Gửi"}
                </button>
                <button
                  className="rounded border px-4 py-2"
                  onClick={() => {
                    setQuestion("");
                    resetAttachments();
                  }}
                >
                  Xóa đính kèm
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
