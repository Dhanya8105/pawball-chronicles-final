"use client";

/**
 * apps/web/src/components/journal/JournalFeed.tsx
 *
 * The Journal: weekly-life + bond-unlock + discovery memories, grouped by
 * PawBall, newest legends first. There is no single /journal endpoint — the
 * feed is composed client-side from a page of the collection plus each
 * PawBall's /memories, which keeps this purely a frontend concern.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { MemoryEntry, PawBallSummary } from "@pawball/shared-types";
import { ApiError, collection, pawballs } from "@/lib/api";

const PAGE_SIZE = 8;
const MEMORIES_PER_PAWBALL = 6;

interface Group {
  pawball: PawBallSummary;
  entries: MemoryEntry[];
}

const MEMORY_TONE: Record<string, string> = {
  weekly_life: "#9d8fc7",
  bond_unlock: "#5de8c0",
  title_earned: "#f4c842",
  seasonal_event: "#a78bfa",
};

const MEMORY_LABEL: Record<string, string> = {
  weekly_life: "This week",
  bond_unlock: "Bond",
  title_earned: "Discovered",
  seasonal_event: "Season",
};

export function JournalFeed() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const loadPage = useCallback(async (pageToLoad: number) => {
    try {
      const list = await collection.list({
        sortBy: "recent",
        page: pageToLoad,
        pageSize: PAGE_SIZE,
      });
      setTotal(list.total);

      const withMemories = await Promise.all(
        list.items.map(async (pawball) => {
          const mem = await pawballs.memories(
            pawball.id,
            1,
            MEMORIES_PER_PAWBALL
          );
          return { pawball, entries: mem.items };
        })
      );

      const nonEmpty = withMemories.filter((g) => g.entries.length > 0);
      setGroups((prev) =>
        pageToLoad === 1 ? nonEmpty : [...prev, ...nonEmpty]
      );
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the journal.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const hasMore = page * PAGE_SIZE < total;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
          Chronicle
        </p>
        <h1 className="fantasy-name mt-1 text-4xl text-ink">Journal</h1>
        <p className="mt-2 text-sm text-muted">
          What your legends have been up to.
        </p>
      </header>

      {status === "loading" && (
        <p className="py-16 text-center text-sm text-muted">
          Turning the pages…
        </p>
      )}

      {status === "error" && (
        <p className="py-16 text-center text-sm text-coral">{error}</p>
      )}

      {status === "ready" && groups.length === 0 && (
        <div className="rounded-card border border-dashed border-hair p-10 text-center">
          <p className="text-sm text-muted">No entries yet.</p>
          <p className="mt-1 text-xs text-faint">
            Capture a cat — its story starts the moment you do.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group, gi) => (
          <motion.section
            key={group.pawball.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (gi % PAGE_SIZE) * 0.05, duration: 0.35 }}
          >
            <div className="flex items-center gap-3">
              {group.pawball.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.pawball.thumbnailUrl}
                  alt={group.pawball.identity.fantasyName}
                  className="h-11 w-11 rounded-chip border border-hair object-cover"
                />
              ) : (
                <div className="h-11 w-11 rounded-chip border border-hair bg-surface" />
              )}
              <div className="min-w-0">
                <p className="fantasy-name truncate text-lg text-ink">
                  {group.pawball.identity.fantasyName}
                </p>
                <p className="truncate text-xs text-faint">
                  {group.pawball.regionName || "Unknown region"}
                </p>
              </div>
            </div>

            <ol className="mt-3 space-y-2 border-l border-hair pl-4">
              {group.entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
                    style={{ background: MEMORY_TONE[entry.type] ?? "#9d8fc7" }}
                  />
                  <p
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: MEMORY_TONE[entry.type] ?? "#9d8fc7" }}
                  >
                    {MEMORY_LABEL[entry.type] ?? entry.type} ·{" "}
                    {new Date(entry.occurredAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">
                    {entry.text}
                  </p>
                </li>
              ))}
            </ol>
          </motion.section>
        ))}
      </div>

      {status === "ready" && hasMore && (
        <button
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void loadPage(next);
          }}
          className="w-full rounded-chip border border-hair px-4 py-3 text-sm font-bold text-muted"
        >
          Load more legends
        </button>
      )}
    </div>
  );
}
