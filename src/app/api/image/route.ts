import OpenAI from "openai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY. Set it in .env" }), { status: 500 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { imageUrl, prompt } = body || {};
      if (!imageUrl) return new Response(JSON.stringify({ error: "imageUrl is required" }), { status: 400 });
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a concise vision assistant. Always base your answer on the provided image and explicitly reference it (e.g., 'In the image, ...'). If uncertain, state what is unclear in the image.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt || "Describe the image." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      });
      const content = completion.choices?.[0]?.message?.content ?? "";
      return new Response(JSON.stringify({ reply: content }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const form = await req.formData();
    const file = form.get("file");
    const prompt = (form.get("prompt") as string) || "Describe the image.";
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file is required" }), { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mime = file.type || "image/png";

    const dataUrl = `data:${mime};base64,${base64}`;

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a concise vision assistant. Always base your answer on the provided image and explicitly reference it (e.g., 'In the image, ...'). If uncertain, state what is unclear in the image.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply: content }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
