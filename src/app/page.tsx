 "use client";

 import { useState } from "react";
 import ChatUI from "@/components/ChatUI";
 import ImageChat from "@/components/ImageChat";
 import CsvUI from "@/components/CsvUI";

 export default function Home() {
  const [tab, setTab] = useState<"chat" | "image" | "csv">("chat");

  return (
    <div className="min-h-screen w-full bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">AI Chat Demo</h1>

        <div className="flex w-full gap-2">
          <button
            className={`rounded px-4 py-2 border ${tab === "chat" ? "bg-black text-white dark:bg-zinc-200 dark:text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-zinc-100"}`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            className={`rounded px-4 py-2 border ${tab === "image" ? "bg-black text-white dark:bg-zinc-200 dark:text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-zinc-100"}`}
            onClick={() => setTab("image")}
          >
            Image
          </button>
          <button
            className={`rounded px-4 py-2 border ${tab === "csv" ? "bg-black text-white dark:bg-zinc-200 dark:text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-zinc-100"}`}
            onClick={() => setTab("csv")}
          >
            CSV
          </button>
        </div>

        <section className="rounded border bg-white p-4 dark:bg-zinc-900">
          {tab === "chat" && <ChatUI />}
          {tab === "image" && <ImageChat />}
          {tab === "csv" && <CsvUI />}
        </section>
      </main>
    </div>
  );
 }
