"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useCaptureHistory } from "./useCaptureHistory";

const STATUS_LABELS: Record<string, string> = {
  pending_analysis: "Awaiting analysis",
  analyzed: "Analyzed",
  generating_art: "Generating artwork",
  complete: "Complete",
  failed: "Failed",
};

export function CaptureHistoryList() {
  const { data, isLoading, isError } = useCaptureHistory();

  if (isLoading) {
    return <p className="text-white/60">Loading your captures…</p>;
  }

  if (isError) {
    return <p className="text-red-400">Couldn&apos;t load your captures.</p>;
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-white/60">
        <p>No captures yet.</p>
        <p className="mt-1 text-sm">
          The camera capture flow arrives in an upcoming milestone — for now,
          this list reflects whatever captures exist in the database.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.items.map((capture, index) => (
        <motion.li
          key={capture._id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.03 }}
          className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
        >
          <Image
            src={capture.originalImageUrl}
            alt="Captured cat"
            width={64}
            height={64}
            className="h-16 w-16 rounded-lg object-cover"
          />
          <div className="flex-1">
            <p className="text-sm text-white/60">
              {new Date(capture.capturedAt).toLocaleString()}
            </p>
            <p className="font-medium">
              {STATUS_LABELS[capture.status] ?? capture.status}
            </p>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
