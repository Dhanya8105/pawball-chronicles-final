"use client";

import { useForm } from "react-hook-form";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLogin } from "./useAuth";
import { ApiClientError } from "@/lib/apiClient";

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginForm() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const onSubmit = (values: LoginFormValues) => login.mutate(values);

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-white/70">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email", { required: "Email is required" })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 outline-none focus:border-pawball-gold"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-white/70">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password", { required: "Password is required" })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 outline-none focus:border-pawball-gold"
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
        )}
      </div>

      {login.isError && (
        <p className="text-sm text-red-400">
          {login.error instanceof ApiClientError
            ? login.error.message
            : "Something went wrong. Please try again."}
        </p>
      )}

      <button
        type="submit"
        disabled={login.isPending}
        className="rounded-lg bg-pawball-gold px-4 py-2 font-medium text-pawball-ink transition-opacity disabled:opacity-50"
      >
        {login.isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-white/60">
        New here?{" "}
        <Link href="/register" className="text-pawball-gold hover:underline">
          Create an account
        </Link>
      </p>
    </motion.form>
  );
}
