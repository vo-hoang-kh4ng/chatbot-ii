import { NextRequest, NextResponse } from "next/server";

const PY_AGENT_URL = process.env.CSV_AGENT_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // If JSON body, forward to /ask_json
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const res = await fetch(`${PY_AGENT_URL}/ask_json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    // Otherwise treat as multipart form and forward to /ask
    const formData = await req.formData();
    const form = new FormData();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        form.append(key, value);
      } else {
        // It's a File
        form.append(key, value as File);
      }
    }

    const res = await fetch(`${PY_AGENT_URL}/ask`, {
      method: "POST",
      body: form,
    });

    // Try to parse JSON; if not JSON, return text
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } else {
      const text = await res.text();
      return new NextResponse(text, { status: res.status });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Proxy error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
