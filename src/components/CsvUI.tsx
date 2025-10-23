"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function CsvUI() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"builtin" | "agent">("builtin");
  const [action, setAction] = useState<"summarize" | "stats" | "missing" | "histogram">("summarize");
  const [histColumn, setHistColumn] = useState("");
  const [bins, setBins] = useState<number>(10);
  const [question, setQuestion] = useState<string>("Summarize the dataset");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInput = useMemo(() => !!file || !!url, [file, url]);

  function isValidUrl(u: string) {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function run() {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      if (mode === "agent") {
        // Call via Next.js proxy to avoid CORS and localhost bridging issues
        const endpoint = "/api/csv-agent";
        let res: Response;
        if (url) {
          if (!isValidUrl(url)) throw new Error("URL CSV không hợp lệ. Hãy nhập URL bắt đầu bằng http(s)://");
          const form = new FormData();
          form.append("question", question);
          form.append("csv_url", url);
          res = await fetch(endpoint, { method: "POST", body: form });
        } else if (file) {
          const MAX = 10 * 1024 * 1024;
          if (file.size > MAX) throw new Error("File CSV quá lớn (>10MB). Hãy chọn file nhỏ hơn.");
          const form = new FormData();
          form.append("question", question);
          form.append("file", file);
          res = await fetch(endpoint, { method: "POST", body: form });
        } else {
          throw new Error("Hãy chọn file CSV hoặc nhập URL CSV");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.error || "Agent request failed");
        setResult({ agent: true, ...data });
      } else {
        // builtin mode via Next API
        let res: Response;
        if (url) {
          if (!isValidUrl(url)) throw new Error("URL CSV không hợp lệ. Hãy nhập URL bắt đầu bằng http(s)://");
          res = await fetch("/api/csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, action, histogramColumn: histColumn, bins }),
          });
        } else if (file) {
          const MAX = 10 * 1024 * 1024; // 10MB
          if (file.size > MAX) throw new Error("File CSV quá lớn (>10MB). Hãy chọn file nhỏ hơn.");
          const form = new FormData();
          form.append("file", file);
          form.append("action", action);
          if (histColumn) form.append("histogramColumn", histColumn);
          form.append("bins", String(bins));
          res = await fetch("/api/csv", { method: "POST", body: form });
        } else {
          throw new Error("Hãy chọn file CSV hoặc nhập URL CSV");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
        setResult(data);
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-xl font-semibold">CSV Data Chat</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Tải CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <div className="text-sm text-zinc-500">hoặc URL CSV (ví dụ: raw GitHub)</div>
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="https://.../data.csv"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (e.target.value) setFile(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Chế độ</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
          >
            <option value="builtin">Builtin (Next API)</option>
            <option value="agent">Agent (Python/LangChain)</option>
          </select>

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

          {mode === "builtin" && action === "histogram" && (
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

          {mode === "agent" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Câu hỏi (Agent)</label>
              <input
                className="w-full rounded border px-3 py-2"
                placeholder="e.g., Plot a histogram of price"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
          )}

          <button
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50 dark:bg-zinc-200 dark:text-black"
            onClick={run}
            disabled={
              loading ||
              !hasInput ||
              (mode === "builtin" && action === "histogram" && !histColumn) ||
              (mode === "agent" && !question.trim())
            }
          >
            {mode === "agent" ? "Hỏi Agent" : "Phân tích CSV"}
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-500">Đang xử lý CSV...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {result && (
        <div className="space-y-4">
          {result.agent && (
            <div className="space-y-2">
              {result.answer && (
                <div className="rounded border p-3 whitespace-pre-wrap text-sm">{result.answer}</div>
              )}
              {result.image_base64 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Biểu đồ (Agent)</div>
                  <img
                    src={`data:image/png;base64,${result.image_base64}`}
                    alt="chart"
                    className="max-h-96 rounded border object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {result.rowCount !== undefined && (
            <div className="text-sm">
              <b>Rows:</b> {result.rowCount} | <b>Columns:</b> {result.columns?.length || 0}
            </div>
          )}

          {result.stats && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800">
                    <th className="border px-2 py-1 text-left">Column</th>
                    <th className="border px-2 py-1 text-left">Type</th>
                    <th className="border px-2 py-1 text-right">Missing</th>
                    <th className="border px-2 py-1 text-right">Unique</th>
                    <th className="border px-2 py-1 text-right">Min</th>
                    <th className="border px-2 py-1 text-right">Max</th>
                    <th className="border px-2 py-1 text-right">Mean</th>
                    <th className="border px-2 py-1 text-right">Median</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries<any>(result.stats).map(([col, s]) => (
                    <tr key={col}>
                      <td className="border px-2 py-1">{col}</td>
                      <td className="border px-2 py-1">{s.type}</td>
                      <td className="border px-2 py-1 text-right">{s.missing}</td>
                      <td className="border px-2 py-1 text-right">{s.unique}</td>
                      <td className="border px-2 py-1 text-right">{s.min ?? "-"}</td>
                      <td className="border px-2 py-1 text-right">{s.max ?? "-"}</td>
                      <td className="border px-2 py-1 text-right">{s.mean ?? "-"}</td>
                      <td className="border px-2 py-1 text-right">{s.median ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.missing && Array.isArray(result.missing) && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800">
                    <th className="border px-2 py-1 text-left">Column</th>
                    <th className="border px-2 py-1 text-right">Missing</th>
                    <th className="border px-2 py-1 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {result.missing.map((row: any) => (
                    <tr key={row.column}>
                      <td className="border px-2 py-1">{row.column}</td>
                      <td className="border px-2 py-1 text-right">{row.missing}</td>
                      <td className="border px-2 py-1 text-right">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.bins && Array.isArray(result.bins) && (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.bins} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="x0" tickFormatter={(v) => String(v)} />
                  <YAxis />
                  <Tooltip formatter={(value: any, name: any, props: any) => [value, name]} />
                  <Bar dataKey="count" fill="#111" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
