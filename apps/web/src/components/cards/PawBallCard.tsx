"use client";

/**
 * apps/web/src/components/cards/PawBallCard.tsx
 *
 * The full collectible card: artwork, rarity frame + glow, fantasy name +
 * title, class/element/rarity badges, bond progress, five stat boxes, aura
 * trait chips, passive + ultimate abilities, and the origin lore.
 *
 * `reveal` plays the spring scale(0.9->1) + rotateY(-10->0) entrance used on
 * the capture screen.
 */

import { motion } from "framer-motion";
import type { PawBallDetail } from "@pawball/shared-types";
import { rarityColor, rarityGlow } from "./rarity";

const STAT_LABELS: Array<[keyof PawBallDetail["stats"], string]> = [
  ["attack", "ATK"],
  ["defense", "DEF"],
  ["agility", "AGI"],
  ["spirit", "SPI"],
  ["wisdom", "WIS"],
];

const BOND_LABEL: Record<string, string> = {
  stranger: "Stranger",
  acquaintance: "Acquaintance",
  friend: "Friend",
  trusted_companion: "Trusted Companion",
  guardian: "Guardian",
  legend: "Legend",
};

export function PawBallCard({
  pawball,
  reveal = false,
}: {
  pawball: PawBallDetail;
  reveal?: boolean;
}) {
  const color = rarityColor(pawball.identity.rarity);
  const image =
    pawball.artwork.currentImageUrl || pawball.originalPhotoUrl || "";

  return (
    <motion.article
      initial={reveal ? { opacity: 0, scale: 0.9, rotateY: -10 } : false}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      style={{ borderColor: color, boxShadow: rarityGlow(pawball.identity.rarity) }}
      className="overflow-hidden rounded-card border-2 bg-card"
    >
      {/* Artwork */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={pawball.identity.fantasyName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-faint">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color }}
          >
            {pawball.identity.rarity}
          </p>
          <h2 className="fantasy-name mt-1 text-3xl text-ink">
            {pawball.identity.fantasyName}
          </h2>
          <p className="mt-1 text-sm text-muted">{pawball.identity.title}</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge>{pawball.identity.class}</Badge>
          <Badge>{pawball.identity.element}</Badge>
          <Badge tone={color}>{pawball.regionName || "Unknown region"}</Badge>
        </div>

        {/* Bond */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Bond · {BOND_LABEL[pawball.bond.level] ?? pawball.bond.level}</span>
            <span>{pawball.bond.sightingCount} sightings</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-chip bg-surface">
            <motion.div
              className="h-full rounded-chip"
              style={{ background: "linear-gradient(90deg,#5de8c0,#a78bfa)" }}
              initial={{ width: 0 }}
              animate={{ width: `${(pawball.bond.levelNumeric / 5) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-1.5">
          {STAT_LABELS.map(([key, label]) => (
            <div
              key={key}
              className="rounded-stat border border-hair bg-surface px-1 py-2 text-center"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-faint">
                {label}
              </div>
              <div className="power-number mt-0.5 text-lg text-ink">
                {pawball.stats[key]}
              </div>
            </div>
          ))}
        </div>

        {/* Aura */}
        {pawball.aura.traits.length > 0 && (
          <div>
            <SectionLabel>Aura</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pawball.aura.traits.map((t) => (
                <span
                  key={t}
                  className="rounded-chip border border-hair bg-surface px-2.5 py-1 text-xs text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Abilities */}
        <div className="space-y-2">
          <SectionLabel>Abilities</SectionLabel>
          <Ability
            kind="Passive"
            name={pawball.abilities.passive.name}
            description={pawball.abilities.passive.description}
          />
          <Ability
            kind="Ultimate"
            name={pawball.abilities.ultimate.name}
            description={pawball.abilities.ultimate.description}
            tone={color}
          />
        </div>

        {/* Lore */}
        {pawball.loreText && (
          <div>
            <SectionLabel>Lore</SectionLabel>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {pawball.loreText}
            </p>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className="rounded-badge border px-3 py-1 text-xs font-bold"
      style={{
        borderColor: tone ?? "rgba(180,150,255,0.18)",
        color: tone ?? "#f0ebff",
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-faint">
      {children}
    </p>
  );
}

function Ability({
  kind,
  name,
  description,
  tone,
}: {
  kind: string;
  name: string;
  description: string;
  tone?: string;
}) {
  return (
    <div className="rounded-stat border border-hair bg-surface p-3">
      <div className="flex items-baseline gap-2">
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: tone ?? "#5de8c0" }}
        >
          {kind}
        </span>
        <span className="text-sm font-bold text-ink">{name}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
    </div>
  );
}
