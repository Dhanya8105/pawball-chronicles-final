"use client";

/**
 * apps/web/src/components/capture/CapturePanel.tsx
 *
 * The capture flow: choose/take a photo -> POST /captures -> reveal the
 * resulting PawBallCard (or show a retake prompt if the CV rejected it).
 *
 * Two server modes, both handled here:
 *   - No-Redis: POST /captures runs the whole pipeline inline (~5–10s) and
 *     returns { status: 'complete', pawball } — reveal it directly.
 *   - Queued: POST returns { status: 'pending_analysis' }; poll
 *     GET /captures/:id through the pipeline stages, then reveal.
 *
 * The loader is the design-spec "5 dots illuminate in sequence, 1.2s apart"
 * — each dot maps to a pipeline stage and lights as that stage is reached.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CaptureRecord, PawBallDetail } from "@pawball/shared-types";
import { ApiError, captures, pawballs } from "@/lib/api";
import { PawBallCard } from "@/components/cards/PawBallCard";

const STAGES = [
  "Uploading photo",
  "Analyzing the cat",
  "Reading the surroundings",
  "Consulting the lore",
  "Revealing the card",
] as const;

type Phase =
  | { kind: "idle" }
  | { kind: "preview"; file: File; url: string }
  | { kind: "working"; step: number }
  | { kind: "revealed"; pawball: PawBallDetail; isNew: boolean }
  | { kind: "rejected"; message: string }
  | { kind: "error"; message: string };

export function CapturePanel() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    []
  );

  const reset = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setPhase((p) => {
      if (p.kind === "preview") URL.revokeObjectURL(p.url);
      return { kind: "idle" };
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase({ kind: "preview", file, url: URL.createObjectURL(file) });
  };

  const getPosition = () =>
    new Promise<{ lat: number; lng: number }>((resolve) => {
      if (!("geolocation" in navigator)) return resolve({ lat: 0, lng: 0 });
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 0, lng: 0 }),
        { timeout: 6000, maximumAge: 60_000 }
      );
    });

  const beginPolling = useCallback((captureId: string) => {
    const tick = async () => {
      try {
        const record = await captures.get(captureId);
        applyRecord(record, setPhase);
        if (record.status === "complete" || record.status === "failed") return;
        setPhase((p) =>
          p.kind === "working"
            ? { kind: "working", step: stepForStatus(record.status) }
            : p
        );
      } catch (err) {
        setPhase({ kind: "error", message: messageFor(err) });
        return;
      }
      pollRef.current = setTimeout(tick, 2000);
    };
    pollRef.current = setTimeout(tick, 1200);
  }, []);

  const submit = async () => {
    if (phase.kind !== "preview") return;
    const { file } = phase;
    setPhase({ kind: "working", step: 0 });
    try {
      const { lat, lng } = await getPosition();
      const form = new FormData();
      form.append("image", file);
      form.append("lat", String(lat));
      form.append("lng", String(lng));
      form.append("capturedAt", new Date().toISOString());
      // In no-Redis mode the API runs the whole pipeline in this request and
      // takes ~5–10s — show the middle of the loader while we wait.
      setPhase({ kind: "working", step: 2 });
      const res = await captures.create(form);

      // Synchronous mode: the card (or rejection) is already in the response.
      if (res.status === "complete" && res.pawball) {
        setPhase({
          kind: "revealed",
          pawball: res.pawball,
          isNew: res.bondResult?.isNewPawball ?? true,
        });
        return;
      }
      if (res.status === "failed") {
        setPhase({
          kind: "rejected",
          message:
            res.error?.message ??
            "The Chronicle couldn't read a cat in that photo. Try a clearer, closer shot.",
        });
        return;
      }

      // Queued mode: poll GET /captures/:id through the pipeline stages.
      setPhase({ kind: "working", step: 1 });
      beginPolling(res.captureId);
    } catch (err) {
      setPhase({ kind: "error", message: messageFor(err) });
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
          PawBall Chronicles
        </p>
        <h1 className="fantasy-name mt-1 text-4xl text-ink">Capture a cat</h1>
        <p className="mt-2 text-sm text-muted">
          Photograph any cat you meet. The Chronicle turns it into a
          collectible legend — bonded to where and when you found it.
        </p>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {(phase.kind === "idle" || phase.kind === "preview") && (
          <motion.div
            key="chooser"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-card border-2 border-dashed border-hair bg-card text-center"
            >
              {phase.kind === "preview" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={phase.url}
                  alt="Selected cat"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="px-8">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-chip bg-surface text-purple">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                      <path d="M4 8.5h2.2L8 6h8l1.8 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-ink">
                    Take or choose a photo
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    JPG or PNG · a clear, close shot works best
                  </p>
                </div>
              )}
            </button>

            {phase.kind === "preview" && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-chip border border-hair px-4 py-3 text-sm font-bold text-muted"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={submit}
                  className="flex-[2] rounded-chip bg-gold px-4 py-3 text-sm font-black text-page shadow-glow-gold"
                >
                  Reveal the legend
                </button>
              </div>
            )}
          </motion.div>
        )}

        {phase.kind === "working" && (
          <motion.div
            key="working"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-card border border-hair bg-card p-6"
          >
            <StepDots step={phase.step} />
            <p className="mt-5 text-center text-sm text-muted">
              {STAGES[Math.min(phase.step, STAGES.length - 1)]}…
            </p>
          </motion.div>
        )}

        {phase.kind === "revealed" && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-center text-sm font-bold text-mint">
              {phase.isNew
                ? "A new legend joins your Chronicle"
                : "You met this legend again"}
            </p>
            <PawBallCard pawball={phase.pawball} reveal />
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-chip border border-hair px-4 py-3 text-sm font-bold text-muted"
            >
              Capture another
            </button>
          </motion.div>
        )}

        {(phase.kind === "rejected" || phase.kind === "error") && (
          <motion.div
            key="problem"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-card border border-coral/40 bg-card p-6 text-center"
          >
            <p className="text-sm font-bold text-coral">
              {phase.kind === "rejected" ? "No legend this time" : "Something went wrong"}
            </p>
            <p className="mt-2 text-sm text-muted">{phase.message}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 w-full rounded-chip bg-purple px-4 py-3 text-sm font-black text-page"
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function stepForStatus(status: CaptureRecord["status"]): number {
  switch (status) {
    case "pending_analysis":
      return 1;
    case "analyzed":
      return 3;
    case "generating_art":
      return 4;
    case "complete":
      return 4;
    default:
      return 1;
  }
}

async function applyRecord(
  record: CaptureRecord,
  setPhase: (p: Phase) => void
): Promise<void> {
  if (record.status === "failed") {
    setPhase({
      kind: "rejected",
      message:
        record.error?.message ??
        "The Chronicle couldn't read a cat in that photo. Try a clearer, closer shot.",
    });
    return;
  }
  if (record.status === "complete") {
    const pawballId = record.bondResult?.pawballId
      ? String(record.bondResult.pawballId)
      : null;
    if (!pawballId) {
      setPhase({
        kind: "error",
        message: "The capture completed but no legend was linked to it.",
      });
      return;
    }
    try {
      const pawball = await pawballs.get(pawballId);
      setPhase({
        kind: "revealed",
        pawball,
        isNew: record.bondResult?.isNewPawball ?? true,
      });
    } catch (err) {
      setPhase({ kind: "error", message: messageFor(err) });
    }
  }
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Network error. Check your connection and try again.";
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {STAGES.map((_, i) => {
        const lit = i <= step;
        return (
          <motion.span
            key={i}
            className="h-3 w-3 rounded-full"
            animate={{
              backgroundColor: lit ? "#5de8c0" : "#2c2545",
              boxShadow: lit
                ? "0 0 12px 0 rgba(93,232,192,0.7)"
                : "0 0 0 0 rgba(0,0,0,0)",
              scale: i === step ? [1, 1.35, 1] : 1,
            }}
            transition={{
              backgroundColor: { duration: 0.4 },
              scale: { duration: 1.2, repeat: i === step ? Infinity : 0 },
            }}
          />
        );
      })}
    </div>
  );
}
