"use client";

/**
 * apps/web/src/lib/providers/QueryProvider.tsx
 *
 * TanStack Query needs a single QueryClient instance shared across the
 * client tree. useState (not a module-level singleton) ensures each
 * server-rendered request gets its own client, per TanStack's official
 * Next.js App Router guidance — a module singleton would leak query cache
 * across different users' requests on the server.
 */

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
