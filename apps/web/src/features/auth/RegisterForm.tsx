"use client";

import { useForm } from "react-hook-form";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRegister } from "./useAuth";
import { ApiClientError } from "@/lib/apiClient";

interface RegisterFormValues {
  displayName: string;
  email: string;
  password: string;
}

export function RegisterForm() {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>();

  const onSubmit = (values: RegisterFormValues) => registerMutation.mutate(values);

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <div>
        <label htmlFor="displayName" className="mb-1 block text-sm text-white/70">
          Display name
        </label>
        <input
          id="displayName"
          autoComplete="nickname"
          {...register("displayName", { required: "Display name is required" })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 outline-none focus:border-pawball-gold"
        />
        {errors.displayName && (
          <p className="mt-1 text-sm text-red-400">{errors.displayName.message}</p>
        )}
      </div>

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
          autoComplete="new-password"
          {...register("password", {
            required: "Password is required",
            minLength: { value: 8, message: "Must be at least 8 characters" },
          })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 outline-none focus:border-pawball-gold"
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
        )}
      </div>

      {registerMutation.isError && (
        <p className="text-sm text-red-400">
          {registerMutation.error instanceof ApiClientError
            ? registerMutation.error.message
            : "Something went wrong. Please try again."}
        </p>
      )}

      <button
        type="submit"
        disabled={registerMutation.isPending}
        className="rounded-lg bg-pawball-gold px-4 py-2 font-medium text-pawball-ink transition-opacity disabled:opacity-50"
      >
        {registerMutation.isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-white/60">
        Already have an account?{" "}
        <Link href="/login" className="text-pawball-gold hover:underline">
          Sign in
        </Link>
      </p>
    </motion.form>
  );
}
