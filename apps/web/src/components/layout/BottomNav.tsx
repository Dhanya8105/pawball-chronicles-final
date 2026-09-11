"use client";

/**
 * apps/web/src/components/layout/BottomNav.tsx
 *
 * Fixed 4-tab mobile nav (Capture / Collection / Map / Journal), pinned to
 * the bottom of the 430px app column. Active tab glows mint.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { PAW_PATH } from "@/components/effects/pawPath";

type Tab = { href: string; label: string; icon: React.ReactNode };

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Capture",
    icon: (
      <svg {...iconProps}>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M4 8.5h2.2L8 6h8l1.8 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      </svg>
    ),
  },
  {
    href: "/collection",
    label: "Collection",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.6" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "Map",
    icon: (
      <svg {...iconProps}>
        <path d="M12 21s-6.5-5.6-6.5-10a6.5 6.5 0 0 1 13 0c0 4.4-6.5 10-6.5 10Z" />
        <circle cx="12" cy="11" r="2.4" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (
      <svg {...iconProps}>
        <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
        <path d="M9 3v18" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-app items-stretch gap-1 border-t border-hair bg-surface/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur"
      aria-label="Primary"
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-1 flex-col items-center gap-1 rounded-chip px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
            style={{ color: active ? "#5de8c0" : "#9d8fc7" }}
          >
            {active && (
              <motion.span
                layoutId="tab-glow"
                className="absolute inset-0 rounded-chip"
                style={{ background: "rgba(93,232,192,0.12)" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{tab.icon}</span>
            <span className="relative">{tab.label}</span>
            {/* Requirement 5: not a layoutId element (those glide between
                tabs) — this one is only rendered on the active tab's own
                subtree, so React mounts it fresh every time a different
                tab becomes active, replaying the spring bounce-in. */}
            {active && (
              <motion.svg
                viewBox="0 0 24 24"
                fill="#5de8c0"
                className="absolute -bottom-0.5"
                style={{ width: 9, height: 9 }}
                initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
              >
                <path d={PAW_PATH} />
              </motion.svg>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
