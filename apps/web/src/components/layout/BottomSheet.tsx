"use client";

/**
 * apps/web/src/components/layout/BottomSheet.tsx
 *
 * Spring-in bottom sheet: y 100% -> 0, dimmed backdrop, drag-down or
 * backdrop-tap to dismiss. Used for collection card detail and map marker
 * detail. Constrained to the 430px app column.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative max-h-[88vh] w-full max-w-app overflow-y-auto rounded-t-card border border-hair bg-surface px-4 pb-8 pt-3 no-scrollbar"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose();
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-chip bg-faint" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
