"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  answerVideoQuestionAction,
  finishVideoAction,
  reportVideoLeaveAction,
  skipVideoQuestionAction,
  startVideoAction,
} from "@/lib/actions/videoStudent";
import { CHUNK_MS, MIN_HOLD_SECONDS, VIDEO_MINUTES, VIDEO_QUESTION_COUNT, type EndReason, type VideoStage } from "@/lib/video";
import { VideoDoneCard } from "./VideoDone";

const RULES = [
  "Sit in a quiet, well-lit room.",
  "Prefer a plain, distraction-free background.",
  "Keep your face visible to the camera.",
  "Ensure the microphone is functioning properly.",
  "Avoid unnecessary background noise.",
  "Do not use unauthorized external assistance.",
  "Keep the assessment tab active.",
  `The assessment has a maximum duration of ${VIDEO_MINUTES} minutes.`,
  "Each question can be answered once or skipped permanently.",
  "Hold the microphone button while speaking and release it to submit the answer.",
  "The entire assessment will be continuously recorded with audio and video from the moment Start Test is clicked.",
  "The recruiter can review the recording and AI-generated evaluation.",
];

const CONSENT_TEXT = "I understand the assessment rules and consent to continuous audio and video recording for evaluation.";

type Phase = "setup" | "recording" | "ending" | "done";
type Devices = "idle" | "asking" | "ready" | "denied" | "error";
interface Piece {
  seq: number;
  blob: Blob;
  state: "queued" | "sending" | "done";
}
interface Question {
  position: number;
  prompt: string;
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function VideoInterview({ driveId, title }: { driveId: string; title: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("setup");
  const [consent, setConsent] = useState(false);
  const [devices, setDevices] = useState<Devices>("idle");
  const [deviceMsg, setDeviceMsg] = useState("");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  // Whether this browser can record: unknown while the page is drawn on the server, then a fixed true or false.
  const supported = useSyncExternalStore<boolean | null>(
    () => () => {},
    () => pickMime() !== null,
    () => null
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [soon, setSoon] = useState(false);
  const [leaves, setLeaves] = useState(0);
  const [trouble, setTrouble] = useState(false);

  const [endNote, setEndNote] = useState("");
  const [pieces, setPieces] = useState({ done: 0, total: 0 });
  const [canForce, setCanForce] = useState(false);
  const [endError, setEndError] = useState("");
  const [stage, setStage] = useState<VideoStage>("SUBMITTED");
  const [endReason, setEndReason] = useState<EndReason>("ALL_DONE");

  // Things that handlers read at the moment they run. They live in refs because a handler made earlier would otherwise see old values.
  const phaseRef = useRef<Phase>("setup");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  const attemptIdRef = useRef<string | null>(null);
  const recStartRef = useRef(0); // performance.now() when the recorder started: time zero of the recording
  const deadlineRef = useRef(0); // performance.now() value at which the 15 minutes end
  const holdRef = useRef<{ startPerf: number; byKey: boolean } | null>(null);
  const indexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const busyRef = useRef(false);
  const startingRef = useRef(false);
  const endingRef = useRef(false);
  const pumpingRef = useRef(false);
  const pauseUntilRef = useRef(0);
  const failuresRef = useRef(0);
  const refusedRef = useRef(false);
  const forceRef = useRef(false);
  const reasonRef = useRef<EndReason>("ALL_DONE");
  const awayRef = useRef(false);
  const micButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // A video element gets the camera as soon as it appears (the preview first, then the small self-view while recording).
  const attachStream = useCallback((el: HTMLVideoElement | null) => {
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => {});
    }
  }, []);

  function stopDevices() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  // Everything is released if the student leaves this page.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
      stopDevices();
    };
  }, []);

  /* ---------- Camera and microphone check ---------- */

  const finishRef = useRef<(reason: EndReason, note?: string) => Promise<void>>(async () => {});

  function onTrackEnded() {
    if (phaseRef.current === "recording") {
      void finishRef.current("DEVICE", "Your camera or microphone stopped working. The interview has ended. What was recorded has been saved.");
    } else if (phaseRef.current === "setup") {
      stopDevices();
      setDevices("error");
      setDeviceMsg("Your camera or microphone was disconnected. Please connect it and press the button again.");
    }
  }

  async function enableDevices() {
    if (devices === "asking") return;
    setDevices("asking");
    setDeviceMsg("");
    setHeard(false);
    stopDevices();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 24 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException("Missing a camera or microphone.", "NotFoundError");
      }
      streamRef.current = stream;
      stream.getTracks().forEach((t) => t.addEventListener("ended", onTrackEnded));
      // The microphone test: a level meter on the same microphone. It is only measured here, never recorded or sent.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setDevices("ready");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setDevices("denied");
        setDeviceMsg("Permission was not given. Click the camera icon in the address bar, allow the camera and microphone for this site, then press the button again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setDevices("error");
        setDeviceMsg("No camera or no microphone was found. Connect both and press the button again.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setDevices("error");
        setDeviceMsg("Your camera or microphone is being used by another program. Close it and press the button again.");
      } else {
        setDevices("error");
        setDeviceMsg("The camera and microphone could not be started. Please try again, using Google Chrome or Microsoft Edge on a computer.");
      }
    }
  }

  // The level meter, updated while the check is on screen.
  useEffect(() => {
    if (devices !== "ready" || phase !== "setup") return;
    const buf = new Uint8Array(1024);
    const id = setInterval(() => {
      const an = analyserRef.current;
      if (!an) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 8));
      if (rms > 0.012) setHeard(true); // quiet voices with automatic gain still pass; silence (about 0) does not
    }, 100);
    return () => clearInterval(id);
  }, [devices, phase]);

  /* ---------- Uploading the recording, piece by piece ---------- */

  const countPieces = useCallback(() => {
    const all = piecesRef.current;
    setPieces({ done: all.filter((p) => p.state === "done").length, total: all.length });
  }, []);

  const pump = useCallback(async () => {
    if (pumpingRef.current || !attemptIdRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        const next = piecesRef.current.find((p) => p.state === "queued");
        if (!next) break;
        if (Date.now() < pauseUntilRef.current) break;
        next.state = "sending";
        let outcome: "ok" | "retry" | "fatal" = "retry";
        try {
          const res = await fetch(`/api/video/${attemptIdRef.current}/chunk?seq=${next.seq}`, {
            method: "POST",
            body: next.blob,
            headers: { "Content-Type": "application/octet-stream" },
            credentials: "same-origin",
          });
          if (res.ok) outcome = "ok";
          else if ([401, 403, 404, 409, 411, 413, 415].includes(res.status)) outcome = "fatal";
        } catch {
          outcome = "retry"; // no connection
        }
        if (outcome === "ok") {
          next.state = "done";
          failuresRef.current = 0;
          setTrouble(false);
        } else if (outcome === "fatal") {
          next.state = "queued";
          refusedRef.current = true;
          break;
        } else {
          next.state = "queued";
          failuresRef.current += 1;
          setTrouble(true);
          const wait = Math.min(8000, 500 * 2 ** Math.min(failuresRef.current, 5));
          pauseUntilRef.current = Date.now() + wait;
          setTimeout(() => void pump(), wait + 50);
          break;
        }
      }
    } finally {
      pumpingRef.current = false;
      countPieces();
    }
    if (refusedRef.current && phaseRef.current === "recording") {
      void finishRef.current("UPLOAD", "The server stopped accepting the recording, so the interview has ended.");
    }
  }, [countPieces]);

  useEffect(() => {
    const online = () => {
      pauseUntilRef.current = 0;
      void pump();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [pump]);

  /* ---------- Start ---------- */

  async function startTest() {
    if (startingRef.current || !consent || devices !== "ready") return;
    const stream = streamRef.current;
    const mime = pickMime();
    if (!stream || !mime || stream.getTracks().some((t) => t.readyState !== "live")) {
      setStartError("The camera or microphone is not available. Please press the button above again.");
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setStartError("");

    // 1. The recording starts first. If it cannot start, nothing has been created on the server, so nothing counts as started.
    let recorder: MediaRecorder;
    piecesRef.current = [];
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 500_000, audioBitsPerSecond: 48_000 });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          piecesRef.current.push({ seq: piecesRef.current.length, blob: ev.data, state: "queued" });
          countPieces();
          void pump();
        }
      };
      recorder.onerror = () => {
        if (phaseRef.current === "recording") void finishRef.current("DEVICE", "The recording stopped because of an error. The interview has ended. What was recorded has been saved.");
      };
      recorder.onstop = () => {
        if (phaseRef.current === "recording" && !endingRef.current) {
          void finishRef.current("DEVICE", "The recording stopped unexpectedly. The interview has ended. What was recorded has been saved.");
        }
      };
      const started = new Promise<void>((resolve, reject) => {
        recorder.onstart = () => resolve();
        setTimeout(() => reject(new Error("timeout")), 4000);
      });
      recorder.start(CHUNK_MS);
      await started;
      if (recorder.state !== "recording") throw new Error("not recording");
    } catch {
      piecesRef.current = [];
      setStartError("The recording could not be started, so the test has not begun. Please try again, using Google Chrome or Microsoft Edge on a computer.");
      startingRef.current = false;
      setStarting(false);
      return;
    }
    recorderRef.current = recorder;
    recStartRef.current = performance.now();

    // 2. Now the server creates the attempt and starts its own clock.
    let result: Awaited<ReturnType<typeof startVideoAction>>;
    try {
      result = await startVideoAction({ driveId, consent: true, mimeType: recorder.mimeType || mime });
    } catch {
      result = { ok: false, error: "Could not reach the server. Please check your connection and try again." };
    }
    if (!result.ok) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      recorderRef.current = null;
      piecesRef.current = [];
      setStartError(`${result.error} The test has not begun.`);
      startingRef.current = false;
      setStarting(false);
      return;
    }
    attemptIdRef.current = result.data.attemptId;
    deadlineRef.current = performance.now() + (result.data.deadlineAtMs - result.data.serverNowMs);
    questionsRef.current = result.data.questions;
    setQuestions(result.data.questions);
    setIndex(0);
    indexRef.current = 0;
    phaseRef.current = "recording";
    setPhase("recording");
    setStarting(false);
    void pump();
  }

  /* ---------- Ending: stop the recording, send every piece, tell the server ---------- */

  const completeUpload = useCallback(async () => {
    setEndError("");
    const total = piecesRef.current.length;
    const began = Date.now();
    for (let round = 0; round < 4; round++) {
      for (;;) {
        pauseUntilRef.current = 0;
        await pump();
        const left = piecesRef.current.filter((p) => p.state !== "done").length;
        countPieces();
        if (left === 0 || refusedRef.current || forceRef.current) break;
        if (Date.now() - began > 90_000) setCanForce(true);
        await sleep(1000);
      }
      let res: Awaited<ReturnType<typeof finishVideoAction>>;
      try {
        res = await finishVideoAction(driveId, { chunkCount: total, force: forceRef.current || refusedRef.current, reason: reasonRef.current });
      } catch {
        setEndError("Could not reach the server. Please check your connection. This page will keep trying, or press the button below.");
        return;
      }
      if (!res.ok) {
        setEndError(res.error);
        return;
      }
      if (res.data.done) {
        setStage(res.data.stage);
        phaseRef.current = "done";
        setPhase("done");
        router.refresh();
        return;
      }
      // The server is missing some pieces: they are sent again.
      for (const seq of res.data.missing) {
        const p = piecesRef.current[seq];
        if (p) p.state = "queued";
      }
    }
    setEndError("Some of the recording could not be saved. Press the button below to submit what has been saved.");
    setCanForce(true);
  }, [driveId, pump, countPieces, router]);

  const finish = useCallback(
    async (reason: EndReason, note?: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      reasonRef.current = reason;
      setEndReason(reason);
      setEndNote(note ?? "");
      holdRef.current = null;
      setHolding(false);
      phaseRef.current = "ending";
      setPhase("ending");

      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        const stopped = new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          setTimeout(resolve, 5000);
        });
        try {
          rec.stop(); // the last piece is handed over just before the recorder stops
        } catch {
          /* already stopped */
        }
        await stopped;
      }
      stopDevices();
      await completeUpload();
    },
    [completeUpload]
  );

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  /* ---------- Answering and skipping ---------- */

  async function submitAnswer(startPerf: number, endPerf: number): Promise<boolean> {
    const q = questionsRef.current[indexRef.current];
    if (!q) return false;
    busyRef.current = true;
    setBusy(true);
    const startSec = (startPerf - recStartRef.current) / 1000;
    const endSec = (endPerf - recStartRef.current) / 1000;
    let r: Awaited<ReturnType<typeof answerVideoQuestionAction>>;
    try {
      r = await answerVideoQuestionAction(driveId, q.position, startSec, endSec);
    } catch {
      r = { ok: false, error: "Could not reach the server. Please try again." };
    }
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) {
      setHint(r.error);
      return false;
    }
    setHint("");
    if (r.data.remaining === 0) void finish("ALL_DONE");
    else setIndex((i) => i + 1);
    return true;
  }

  function beginHold(byKey: boolean) {
    if (busyRef.current || holdRef.current || phaseRef.current !== "recording") return;
    holdRef.current = { startPerf: performance.now(), byKey };
    setHolding(true);
    setHint("");
    setConfirmSkip(false);
  }

  async function endHold(submit: boolean) {
    const h = holdRef.current;
    if (!h) return;
    holdRef.current = null;
    setHolding(false);
    if (!submit) {
      setHint("That was cancelled. Hold the button when you are ready to speak.");
      return;
    }
    const endPerf = performance.now();
    if ((endPerf - h.startPerf) / 1000 < MIN_HOLD_SECONDS) {
      setHint("That was too short to count as an answer. Hold the button while you speak, then let go.");
      return;
    }
    await submitAnswer(h.startPerf, endPerf);
  }

  async function skip() {
    const q = questionsRef.current[indexRef.current];
    if (!q || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setConfirmSkip(false);
    let r: Awaited<ReturnType<typeof skipVideoQuestionAction>>;
    try {
      r = await skipVideoQuestionAction(driveId, q.position);
    } catch {
      r = { ok: false, error: "Could not reach the server. Please try again." };
    }
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) {
      setHint(r.error);
      return;
    }
    setHint("");
    if (r.data.remaining === 0) void finish("ALL_DONE");
    else setIndex((i) => i + 1);
  }

  // After each question the microphone button gets the focus again, so a keyboard user can carry on.
  useEffect(() => {
    if (phase === "recording") micButtonRef.current?.focus();
  }, [index, phase]);

  /* ---------- The 15 minutes (the server's own deadline is the one that counts) ---------- */

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(async () => {
      const left = deadlineRef.current - performance.now();
      if (left <= 60_000) setSoon(true);
      if (left > 0 || endingRef.current) return;
      clearInterval(id);
      // The answer being held at this moment ends here and still counts.
      const h = holdRef.current;
      holdRef.current = null;
      setHolding(false);
      if (h && (deadlineRef.current - h.startPerf) / 1000 >= MIN_HOLD_SECONDS) await submitAnswer(h.startPerf, deadlineRef.current);
      void finish("TIME_UP");
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ---------- Leaving the page ---------- */

  useEffect(() => {
    if (phase !== "recording") return;
    function gone() {
      if (awayRef.current || endingRef.current) return;
      awayRef.current = true;
      if (holdRef.current) {
        holdRef.current = null;
        setHolding(false);
        setHint("The answer was cancelled because you left the page. Hold the button again when you are ready.");
      }
      setLeaves((n) => n + 1);
      void reportVideoLeaveAction(driveId).then((r) => {
        if (r.ok && r.data.count > 0) setLeaves(r.data.count);
      });
    }
    function back() {
      awayRef.current = false;
    }
    const onVisibility = () => (document.hidden ? gone() : back());
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault(); // the browser asks "Leave site?"
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", gone);
    window.addEventListener("focus", back);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", gone);
      window.removeEventListener("focus", back);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase, driveId]);

  /* ---------- Screens ---------- */

  if (phase === "done") return <VideoDoneCard stage={stage} reason={endReason} />;

  if (phase === "ending") {
    return (
      <Card className="mt-6">
        <CardContent className="pt-5">
          <h2 className="text-lg font-semibold text-ink">Saving your recording</h2>
          {endNote && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">{endNote}</p>}
          <p className="text-sm text-muted mt-3 leading-relaxed" role="status">
            Please keep this page open until this finishes. Uploaded {pieces.done} of {pieces.total} parts.
          </p>
          {trouble && <p className="text-sm text-amber-900 mt-2">The connection is not working right now. The recording is kept in this page and will be sent when the connection returns.</p>}
          {endError && <p role="alert" className="text-sm text-rose-700 mt-3 leading-relaxed">{endError}</p>}
          {(canForce || endError) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {endError && (
                <Button size="sm" onClick={() => void completeUpload()}>
                  Try again
                </Button>
              )}
              {canForce && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    forceRef.current = true;
                    void completeUpload();
                  }}
                >
                  Submit what has been saved
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (phase === "recording") {
    const q = questions[index];
    return (
      <div className="mt-6">
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-rose-800" role="status">
            <span className="inline-block h-3 w-3 rounded-full bg-rose-600 animate-pulse" aria-hidden />
            Recording: your camera and microphone are on
          </p>
          <p className="text-xs text-rose-800">Question {Math.min(index + 1, VIDEO_QUESTION_COUNT)} of {VIDEO_QUESTION_COUNT}</p>
        </div>

        {(leaves > 0 || trouble || soon) && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 leading-relaxed space-y-1">
            {soon && <p>Less than a minute is left. Finish the question you are on.</p>}
            {leaves > 0 && <p>You have left this page {leaves} time{leaves === 1 ? "" : "s"}. The recruiter can see this. Please stay on this page.</p>}
            {trouble && <p>Your connection is slow or lost. The recording is kept in this page and will be sent when the connection returns. Do not close or refresh the page.</p>}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-[1fr_200px] items-start">
          <Card>
            <CardContent className="pt-5">
              {q ? (
                <>
                  <h2 className="text-lg font-medium text-ink leading-relaxed" aria-live="polite">
                    {q.prompt}
                  </h2>
                  <p className="text-xs text-muted mt-3 leading-relaxed">
                    Hold the microphone button while you speak. Let go to submit your answer. You can answer once, or skip for good.
                  </p>

                  <div className="mt-6 flex flex-col items-center gap-4">
                    <button
                      ref={micButtonRef}
                      type="button"
                      disabled={busy}
                      aria-pressed={holding}
                      aria-label={holding ? "Recording your answer. Release to submit." : "Hold to answer. Release to submit."}
                      onPointerDown={(e) => {
                        if (e.pointerType === "mouse" && e.button !== 0) return;
                        e.preventDefault();
                        try {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                          /* not capturable: the window events below still end the hold */
                        }
                        beginHold(false);
                      }}
                      onPointerUp={() => {
                        if (holdRef.current && !holdRef.current.byKey) void endHold(true);
                      }}
                      onPointerCancel={() => {
                        if (holdRef.current && !holdRef.current.byKey) void endHold(false);
                      }}
                      onLostPointerCapture={() => {
                        if (holdRef.current && !holdRef.current.byKey) void endHold(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          if (!e.repeat) beginHold(true);
                        }
                      }}
                      onKeyUp={(e) => {
                        if ((e.key === " " || e.key === "Enter") && holdRef.current?.byKey) {
                          e.preventDefault();
                          void endHold(true);
                        }
                      }}
                      onBlur={() => {
                        if (holdRef.current?.byKey) void endHold(false);
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
                      className={`h-24 w-24 rounded-full flex items-center justify-center border-4 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-500 ${
                        holding ? "bg-rose-600 border-rose-300 text-white" : "bg-brand-500 border-brand-100 text-white hover:brightness-110"
                      }`}
                    >
                      <Mic className="h-9 w-9" aria-hidden />
                    </button>
                    <p className="text-sm text-ink font-medium" aria-live="polite">
                      {busy ? "Saving your answer..." : holding ? "Speak now. Release to submit." : "Hold to answer"}
                    </p>
                    {hint && <p role="alert" className="text-sm text-amber-900 text-center leading-relaxed max-w-md">{hint}</p>}

                    {!confirmSkip ? (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(true)} disabled={busy || holding}>
                        Skip this question
                      </Button>
                    ) : (
                      <div role="group" aria-label="Confirm skipping" className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-center max-w-md">
                        <p className="text-sm text-ink leading-relaxed">Skip this question for good? You will not see it again, and it gets 0 marks.</p>
                        <div className="mt-3 flex justify-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => void skip()} disabled={busy}>
                            Yes, skip it
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmSkip(false)} disabled={busy}>
                            No, go back
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">Finishing...</p>
              )}
            </CardContent>
          </Card>

          <div className="md:sticky md:top-4">
            <video ref={attachStream} muted playsInline autoPlay aria-label="Your camera" className="w-full max-w-[200px] rounded-xl bg-black aspect-[4/3] object-cover" />
            <p className="text-[11px] text-muted mt-2 leading-relaxed">This is what the camera sees. The whole interview, including time between questions, is being recorded.</p>
          </div>
        </div>
      </div>
    );
  }

  // setup
  const ready = consent && devices === "ready" && heard && supported === true && !starting;
  return (
    <div className="mt-6 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Instructions and terms</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <p className="text-sm text-muted leading-relaxed">
            {title}. You will answer {VIDEO_QUESTION_COUNT} questions out loud, in at most {VIDEO_MINUTES} minutes in total. Please read every point.
          </p>
          <ol className="mt-4 space-y-2 list-decimal pl-5 text-sm text-ink leading-relaxed">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted leading-relaxed">
            If you close or refresh this page while the interview is running, the recording stops and the interview ends. The AI only gives advice to the
            recruiter. A person makes every decision. You will not see marks on this page.
          </p>
          <label className="mt-5 flex items-start gap-3 rounded-lg border border-border-soft px-3 py-3 cursor-pointer hover:bg-surface">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
            <span className="text-sm text-ink leading-relaxed">{CONSENT_TEXT}</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check your camera and microphone</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {supported === false && (
            <p role="alert" className="text-sm text-rose-700 mb-3 leading-relaxed">
              This browser cannot record video here. Please open this page in Google Chrome or Microsoft Edge on a computer.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-[240px_1fr] items-start">
            <div className="rounded-xl bg-black aspect-[4/3] overflow-hidden flex items-center justify-center">
              {devices === "ready" ? (
                <video ref={attachStream} muted playsInline autoPlay aria-label="Camera preview" className="w-full h-full object-cover" />
              ) : (
                <Camera className="h-8 w-8 text-white/50" aria-hidden />
              )}
            </div>
            <div>
              <Button size="sm" variant={devices === "ready" ? "secondary" : "primary"} onClick={() => void enableDevices()} disabled={devices === "asking" || supported === false}>
                {devices === "asking" ? "Waiting for permission..." : devices === "ready" ? "Check again" : "Allow camera and microphone"}
              </Button>
              <p className="text-xs text-muted mt-2 leading-relaxed">The browser will ask for permission. Nothing is recorded until you press Start Test.</p>
              {deviceMsg && (
                <p role="alert" className="text-sm text-rose-700 mt-3 leading-relaxed">
                  {deviceMsg}
                </p>
              )}
              {devices === "ready" && (
                <div className="mt-4">
                  <p className="text-sm text-ink flex items-center gap-2">
                    <Mic className="h-4 w-4" aria-hidden /> Say a few words to test your microphone
                  </p>
                  <div
                    role="meter"
                    aria-label="Microphone level"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(level * 100)}
                    className="mt-2 h-3 w-full max-w-xs rounded-full bg-surface-2 overflow-hidden"
                  >
                    <div className="h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
                  </div>
                  <p className="text-xs mt-2" aria-live="polite">
                    {heard ? <span className="text-emerald-700">Your microphone is working.</span> : <span className="text-muted">We have not heard anything yet.</span>}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void startTest()} disabled={!ready}>
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {starting ? "Starting..." : "Start Test"}
        </Button>
        <p className="text-xs text-muted leading-relaxed max-w-md">
          {!consent
            ? "Tick the consent box to continue."
            : devices !== "ready"
              ? "Allow the camera and microphone to continue."
              : !heard
                ? "Say a few words so we can check your microphone."
                : "Recording begins the moment you press Start Test."}
        </p>
      </div>
      {startError && (
        <p role="alert" className="text-sm text-rose-700 leading-relaxed">
          {startError}
        </p>
      )}
    </div>
  );
}
