import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-pawball-gold">
          PawBall Chronicles
        </p>
        <h1 className="mt-2 text-2xl font-bold">Welcome back</h1>
      </div>
      <LoginForm />
    </main>
  );
}
