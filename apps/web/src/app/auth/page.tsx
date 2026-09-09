"use client";

/**
 * apps/web/src/app/auth/page.tsx
 *
 * Sign in / create account, tabbed. On success the session is stored and
 * the user is sent to the capture screen. Rendered bare by AppShell (no
 * nav, no guard).
 */

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ApiError, auth } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type Tab = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [tab, setTab] = useState<Tab>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hydrated && user) router.replace("/");
  }, [hydrated, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        tab === "login"
          ? await auth.login({ email, password })
          : await auth.register({ email, password, displayName });
      setSession(result.user, result.accessToken, result.refreshToken);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again."
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.24em] text-gold">
          PawBall Chronicles
        </p>
        <h1 className="fantasy-name mt-2 text-center text-4xl text-ink">
          Every cat has a legend
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm text-muted">
          Build a Chronicle of the cats you meet — each one a collectible,
          bonded to where and when you found it.
        </p>

        <div className="mt-8 grid grid-cols-2 rounded-chip border border-hair p-1">
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError("");
              }}
              className="relative rounded-chip px-4 py-2 text-sm font-bold"
              style={{ color: tab === t ? "#0d0a1a" : "#9d8fc7" }}
            >
              {tab === t && (
                <motion.span
                  layoutId="auth-tab"
                  className="absolute inset-0 rounded-chip bg-gold"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">
                {t === "login" ? "Sign in" : "Create account"}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {tab === "register" && (
            <Field
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="nickname"
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={tab === "login" ? "current-password" : "new-password"}
            minLength={tab === "register" ? 8 : undefined}
            required
          />

          {error && <p className="text-sm text-coral">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-chip bg-gold px-4 py-3 text-sm font-black text-page shadow-glow-gold disabled:opacity-50"
          >
            {busy
              ? "One moment…"
              : tab === "login"
                ? "Sign in"
                : "Begin your Chronicle"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-faint">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full rounded-stat border border-hair bg-card px-4 py-3 text-sm text-ink outline-none focus:border-purple"
      />
    </label>
  );
}
