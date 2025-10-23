 "use client";

import { useState } from "react";
import ChatUnified from "@/components/ChatUnified";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">AI Chat Demo</h1>
        <section className="rounded border bg-white p-4 dark:bg-zinc-900">
          <ChatUnified />
        </section>
      </main>
    </div>
  );
}
