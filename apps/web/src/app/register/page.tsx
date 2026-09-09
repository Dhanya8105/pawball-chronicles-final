import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-pawball-gold">
          PawBall Chronicles
        </p>
        <h1 className="mt-2 text-2xl font-bold">Every Cat Has A Legend.</h1>
        <p className="mt-1 text-sm text-white/60">Create your account to begin.</p>
      </div>
      <RegisterForm />
    </main>
  );
}
