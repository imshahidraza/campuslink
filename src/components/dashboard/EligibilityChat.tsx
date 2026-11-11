"use client";

import { useRef, useState, useTransition } from "react";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { askEligibilityAction, wordEligibilityAnswerAction } from "@/lib/actions/assistant";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { AiWaitNote } from "@/components/ui/Loader";
import type { DriveFacts } from "@/lib/assistant";

interface Message {
  id: number;
  from: "me" | "bot";
  text: string;
  facts?: DriveFacts[];
  friendly?: string | null;
  wording?: boolean; // the AI is still putting it into words
}

function FactCard({ f }: { f: DriveFacts }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">
          {f.role} <span className="text-muted font-normal">at {f.company}</span>
        </p>
        {f.eligible ? (
          <Badge tone="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Eligible
          </Badge>
        ) : (
          <Badge tone="danger" className="gap-1">
            <XCircle className="h-3 w-3" /> Not eligible
          </Badge>
        )}
      </div>
      {f.reasons.length > 0 && (
        <ul className="mt-2 text-xs text-muted list-disc pl-4 space-y-0.5">
          {f.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {f.fixes.length > 0 && (
        <div className="mt-2 space-y-1">
          {f.fixes.map((x) => (
            <p key={x.problem} className="text-xs text-muted">
              <span className="text-ink font-medium">What you can do: </span>
              {x.fix}
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        <span className="text-ink font-medium">Asks for: </span>
        {f.requirements.join(" · ")}
      </p>
      {f.deadline && (
        <p className="mt-1 text-xs text-muted">
          <span className="text-ink font-medium">Last date to apply: </span>
          {f.deadline}
          {f.deadlinePassed ? " (passed)" : f.daysLeft !== null ? ` (${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} left)` : ""}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        {f.canApply ? "You can apply from Drives & Matching." : f.applyBlockedBecause ? `You can't apply right now: ${f.applyBlockedBecause}.` : ""}
      </p>
    </div>
  );
}

export function EligibilityChat({ suggestions }: { suggestions: string[] }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      from: "bot",
      text: "Ask me about any open drive: whether you are eligible, why not, what it asks for, or the last date to apply. My answers come from the exact rules and your own record.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const counter = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  function patch(id: number, p: Partial<Message>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));
  }

  function send(question: string) {
    const q = question.trim();
    if (!q || isPending) return;
    setInput("");
    const myId = counter.current++;
    const botId = counter.current++;
    setMessages((prev) => [...prev, { id: myId, from: "me", text: q }]);
    startTransition(async () => {
      const r = await askEligibilityAction(q);
      if (!r.ok) {
        setMessages((prev) => [...prev, { id: botId, from: "bot", text: r.error }]);
        return;
      }
      setMessages((prev) => [...prev, { id: botId, from: "bot", text: r.data.summary, facts: r.data.facts, wording: true }]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
      // The exact answer is already on screen. Now ask the local AI to say it in friendlier words.
      const w = await wordEligibilityAnswerAction(q);
      patch(botId, { friendly: w.friendly, wording: false });
    });
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={m.from === "me" ? "flex justify-end" : "flex"}>
            <div
              className={
                m.from === "me"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand-950 text-white px-4 py-2.5 text-sm"
                  : "max-w-full sm:max-w-[90%] rounded-2xl rounded-bl-md bg-surface border border-border-soft px-4 py-3 text-sm text-ink"
              }
            >
              {m.friendly ? <p className="leading-relaxed">{m.friendly}</p> : <p className="whitespace-pre-line leading-relaxed">{m.text}</p>}
              {m.wording && <div className="mt-2"><AiWaitNote show label="Putting it in friendlier words..." /></div>}
              {m.facts && m.facts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.facts.length > 1 && m.facts.length <= 30 && <p className="text-[11px] text-muted">Exact details from the rules:</p>}
                  {m.facts.map((f) => (
                    <FactCard key={f.driveId} f={f} />
                  ))}
                </div>
              )}
              {m.friendly && <p className="mt-2 text-[11px] text-muted">The details below the words are exact. The AI only helped with the wording.</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              disabled={isPending}
              onClick={() => send(s)}
              className="text-xs rounded-full border border-border-soft bg-white px-3 py-1.5 text-muted hover:border-brand-300 hover:text-ink disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={300}
          placeholder="Ask about a drive, for example: Am I eligible for Infosys?"
          className="flex-1 rounded-full border border-border-soft bg-white px-4 py-2.5 text-sm text-ink"
          aria-label="Your question"
        />
        <Button type="submit" disabled={isPending || input.trim().length < 2}>
          <Send className="h-4 w-4" /> Ask
        </Button>
      </form>
    </div>
  );
}
