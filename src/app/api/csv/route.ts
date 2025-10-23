import { NextRequest } from "next/server";
import { parse } from "csv-parse/sync";
import { extent, mean, median, min, max, bin as d3bin } from "d3-array";

export const runtime = "nodejs";

async function fetchCsvFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status} ${res.statusText}`);
  return await res.text();
}

function toNumber(x: any) {
  if (x === null || x === undefined || x === "") return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

function computeStats(rows: any[], columns: string[]) {
  const result: Record<string, any> = {};
  for (const col of columns) {
    const vals = rows.map((r) => r[col]);
    const missing = vals.filter((v) => v === null || v === undefined || v === "").length;
    const nums = vals.map(toNumber).filter((v) => !Number.isNaN(v));
    const isNumeric = nums.length > 0 && nums.length >= vals.length * 0.5;
    result[col] = {
      type: isNumeric ? "numeric" : "string",
      missing,
      unique: new Set(vals.filter((v) => v !== null && v !== undefined && v !== "")).size,
      count: vals.length,
      ...(isNumeric
        ? {
            min: min(nums) ?? null,
            max: max(nums) ?? null,
            mean: mean(nums) ?? null,
            median: median(nums) ?? null,
            range: extent(nums),
          }
        : {}),
    };
  }
  return result;
}

function computeHistogram(rows: any[], column: string, bins: number = 10) {
  const nums = rows.map((r) => toNumber(r[column])).filter((v) => !Number.isNaN(v));
  const generator = d3bin().thresholds(bins);
  const buckets = generator(nums).map((b) => ({ x0: b.x0 ?? 0, x1: b.x1 ?? 0, count: b.length }));
  return { column, bins: buckets };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let csvText = "";
    let action: string | undefined;
    let histogramColumn: string | undefined;
    let bins: number | undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const url = body?.url as string | undefined;
      const text = body?.csv as string | undefined;
      action = body?.action;
      histogramColumn = body?.histogramColumn;
      bins = body?.bins;
      if (url) csvText = await fetchCsvFromUrl(url);
      else if (text) csvText = text;
      else return new Response(JSON.stringify({ error: "Provide either url or csv text" }), { status: 400 });
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = (form.get("action") as string) || undefined;
      histogramColumn = (form.get("histogramColumn") as string) || undefined;
      const binsRaw = form.get("bins") as string | null;
      bins = binsRaw ? Number(binsRaw) : undefined;
      const url = (form.get("url") as string) || undefined;
      const file = form.get("file");
      if (url) csvText = await fetchCsvFromUrl(url);
      else if (file instanceof File) {
        const ab = await file.arrayBuffer();
        csvText = Buffer.from(ab).toString("utf-8");
      } else {
        return new Response(JSON.stringify({ error: "Provide a CSV file or url" }), { status: 400 });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unsupported content-type" }), { status: 415 });
    }

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as any[];

    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    if (!action || action === "summarize") {
      const stats = computeStats(records, columns);
      return new Response(
        JSON.stringify({
          rowCount: records.length,
          columns,
          stats,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "stats") {
      const stats = computeStats(records, columns);
      return new Response(JSON.stringify({ columns, stats }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (action === "missing") {
      const stats = computeStats(records, columns);
      const missingSorted = Object.entries(stats)
        .map(([col, s]: any) => ({ column: col, missing: s.missing, count: s.count }))
        .sort((a, b) => b.missing - a.missing);
      return new Response(JSON.stringify({ columns, missing: missingSorted }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (action === "histogram") {
      if (!histogramColumn) return new Response(JSON.stringify({ error: "histogramColumn is required" }), { status: 400 });
      const hist = computeHistogram(records, histogramColumn, bins ?? 10);
      return new Response(JSON.stringify(hist), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
