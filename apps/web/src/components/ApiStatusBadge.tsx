"use client";

/**
 * apps/web/src/components/ApiStatusBadge.tsx
 *
 * Proves the web -> api connection actually works end-to-end via a real
 * TanStack Query call, not a hardcoded "connected" label. Hits the api's
 * root-mounted /health route directly (not through apiFetch's /api/v1
 * base — health is intentionally unversioned, see apps/api/src/app.ts).
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

interface HealthResponse {
  success: boolean;
  data?: { status: string; service: string; timestamp: string };
}

async function fetchApiHealth(): Promise<HealthResponse> {
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
  ).replace(/\/api\/v1\/?$/, "");
  const res = await fetch(`${apiBase}/health`);
  return res.json();
}

export function ApiStatusBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchApiHealth,
    retry: 1,
  });

  const label = isLoading
    ? "Checking API…"
    : isError || !data?.success
      ? "API unreachable"
      : `API online (${data.data?.service})`;

  const dotColor = isLoading
    ? "bg-pawball-moon"
    : isError || !data?.success
      ? "bg-red-500"
      : "bg-emerald-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm"
    >
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {label}
    </motion.div>
  );
}
