import Link from "next/link";
import { ApiStatusBadge } from "@/components/ApiStatusBadge";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-pawball-gold">
        PawBall Chronicles
      </p>
      <h1 className="text-4xl font-bold sm:text-5xl">
        Every Cat Has A Legend.
      </h1>
      <p className="max-w-md text-white/70">
        Auth & persistence milestone — accounts, capture upload, and capture
        history now persist to MongoDB. The fantasy engine and real artwork
        generation arrive in upcoming milestones.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg border border-white/15 px-5 py-2 text-sm hover:bg-white/5"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-pawball-gold px-5 py-2 text-sm font-medium text-pawball-ink"
        >
          Create account
        </Link>
      </div>
      <ApiStatusBadge />
    </main>
  );
}
