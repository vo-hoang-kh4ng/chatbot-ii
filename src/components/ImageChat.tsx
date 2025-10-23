"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export default function ImageChat() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [prompt, setPrompt] = useState("What's in this photo?");
  const [preview, setPreview] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSelectFile(f: File | null) {
    setFile(f);
    setImageUrl("");
    if (f) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  }

  async function ask() {
    setError(null);
    setReply("");
    setLoading(true);
    try {
      if (imageUrl) {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, prompt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        setReply(data.reply || "");
      } else if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("prompt", prompt);
        const res = await fetch("/api/image", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        setReply(data.reply || "");
      } else {
        throw new Error("Hãy chọn ảnh hoặc nhập URL ảnh.");
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-xl font-semibold">Image Chat</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Tải ảnh (PNG/JPG)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
          />
          <div className="text-sm text-zinc-500">hoặc URL ảnh</div>
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setFile(null);
              setPreview(e.target.value || null);
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Câu hỏi</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button className="rounded bg-black text-white px-4 py-2 dark:bg-zinc-200 dark:text-black" onClick={ask} disabled={loading}>
            Hỏi ảnh
          </button>
        </div>
      </div>

      {preview && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Xem trước</div>
          <img src={preview} alt="preview" className="max-h-64 rounded border object-contain" />
        </div>
      )}

      {loading && <div className="text-sm text-zinc-500">Đang phân tích ảnh...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {reply && (
        <div className="rounded border p-3">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{reply}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
