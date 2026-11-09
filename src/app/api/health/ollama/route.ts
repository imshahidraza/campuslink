import { NextResponse } from "next/server";
import { ollamaHealthCheck, aiQueueStatus } from "@/lib/ollama";
import { getSession } from "@/lib/auth";

// Signed-in users only, and no internal addresses in the answer.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, detail: "Please sign in." }, { status: 401 });
  const result = await ollamaHealthCheck();
  return NextResponse.json({
    ok: result.ok,
    detail: result.ok ? "Gemma is connected." : "Gemma is not reachable right now.",
    queue: aiQueueStatus(),
  });
}
