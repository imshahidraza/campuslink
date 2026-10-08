import { NextResponse } from "next/server";
import { ollamaHealthCheck } from "@/lib/ollama";

export async function GET() {
  const result = await ollamaHealthCheck();
  return NextResponse.json(result);
}
