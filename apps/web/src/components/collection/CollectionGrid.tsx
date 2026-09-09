"use client";

/**
 * apps/web/src/components/collection/CollectionGrid.tsx
 *
 * Filter/sort chips + a staggered list of collectible tiles. Tapping a tile
 * opens a spring bottom sheet with the full PawBallCard (detail is fetched
 * on open so the list stays lightweight).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type {
  CollectionResponse,
  CollectionStats,
  PawBallDetail,
  PawBallSummary,
  Rarity,
} from "@pawball/shared-types";
import { ApiError, collection, pawballs } from "@/lib/api";
import { rarityColor } from "@/components/cards/rarity";
import { PawBallCard } from "@/components/cards/PawBallCard";
import { BottomSheet } from "@/components/layout/BottomSheet";

const RARITY_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

const SORTS: Array<{ value: string; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "rarity", label: "Rarity" },
  { value: "bond", label: "Bond" },
];

export function CollectionGrid() {
  const [rarity, setRarity] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PawBallSummary | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [list, s] = await Promise.all([
        collection.list({ rarity: rarity || undefined, sortBy, pageSize: 50 }),
        collection.stats(),
      ]);
      setData(list);
      setStats(s);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your collection.");
      setStatus("error");
    }
  }, [rarity, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
          Chronicle
        </p>
        <h1 className="fantasy-name mt-1 text-4xl text-ink">Collection</h1>
        {stats && (
          <p className="mt-2 text-sm text-muted">
            {stats.total} {stats.total === 1 ? "legend" : "legends"} ·{" "}
            {stats.byRarity.legendary} legendary · {stats.byRarity.epic} epic
          </p>
        )}
      </header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {RARITY_FILTERS.map((f) => {
          const active = rarity === f.value;
          const count =
            f.value === ""
              ? stats?.total
              : stats?.byRarity[f.value as Rarity];
          return (
            <button
              key={f.value || "all"}
              onClick={() => setRarity(f.value)}
              className="shrink-0 rounded-chip border px-3 py-1.5 text-xs font-bold transition-colors"
              style={{
                borderColor: active
                  ? f.value
                    ? rarityColor(f.value)
                    : "#5de8c0"
                  : "rgba(180,150,255,0.18)",
                color: active
                  ? f.value
                    ? rarityColor(f.value)
                    : "#5de8c0"
                  : "#9d8fc7",
                background: active ? "rgba(93,232,192,0.08)" : "transparent",
              }}
            >
              {f.label}
              {count !== undefined ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {SORTS.map((s) => {
          const active = sortBy === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setSortBy(s.value)}
              className="shrink-0 rounded-chip px-3 py-1.5 text-xs font-bold"
              style={{
                color: active ? "#0d0a1a" : "#9d8fc7",
                background: active ? "#a78bfa" : "transparent",
                border: active ? "none" : "1px solid rgba(180,150,255,0.18)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {status === "loading" && (
        <p className="py-16 text-center text-sm text-muted">Loading legends…</p>
      )}

      {status === "error" && (
        <p className="py-16 text-center text-sm text-coral">{error}</p>
      )}

      {status === "ready" && data && data.items.length === 0 && (
        <div className="rounded-card border border-dashed border-hair p-10 text-center">
          <p className="text-sm text-muted">No legends here yet.</p>
          <p className="mt-1 text-xs text-faint">
            Capture a cat to begin your Chronicle.
          </p>
        </div>
      )}

      {status === "ready" && data && data.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {data.items.map((pb, i) => (
            <motion.li
              key={pb.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: "easeOut" }}
            >
              <button
                onClick={() => setSelected(pb)}
                className="group w-full overflow-hidden rounded-card border-2 bg-card text-left"
                style={{ borderColor: rarityColor(pb.identity.rarity) }}
              >
                <div className="relative aspect-square overflow-hidden bg-surface">
                  {pb.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pb.thumbnailUrl}
                      alt={pb.identity.fantasyName}
                      className="h-full w-full object-cover transition-transform group-active:scale-95"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                      No image
                    </div>
                  )}
                  <span
                    className="absolute left-2 top-2 rounded-chip px-2 py-0.5 text-[10px] font-black uppercase"
                    style={{
                      color: "#0d0a1a",
                      background: rarityColor(pb.identity.rarity),
                    }}
                  >
                    {pb.identity.rarity}
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="fantasy-name truncate text-base text-ink">
                    {pb.identity.fantasyName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {pb.identity.class} · {pb.identity.element}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-faint">
                    {pb.regionName || "Unknown region"}
                  </p>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <CollectionSheet
        summary={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function CollectionSheet({
  summary,
  onClose,
}: {
  summary: PawBallSummary | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PawBallDetail | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setDetail(null);
    setLoadError("");
    if (!summary) return;
    let cancelled = false;
    pawballs
      .get(summary.id)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : "Couldn't load this legend."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [summary]);

  return (
    <BottomSheet open={!!summary} onClose={onClose}>
      {loadError ? (
        <p className="py-10 text-center text-sm text-coral">{loadError}</p>
      ) : detail ? (
        <PawBallCard pawball={detail} />
      ) : (
        <p className="py-16 text-center text-sm text-muted">Summoning…</p>
      )}
    </BottomSheet>
  );
}
