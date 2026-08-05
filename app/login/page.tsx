"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function confirmLocalUser() {
    const response = await fetch("/api/auth/dev-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(result.error || "No se pudo confirmar el usuario localmente.");
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    let { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error?.message.toLowerCase().includes("email not confirmed")) {
      try {
        await confirmLocalUser();
        const retry = await supabase.auth.signInWithPassword({ email, password });
        error = retry.error;
      } catch (confirmationError) {
        setLoading(false);
        setMessage(
          confirmationError instanceof Error
            ? confirmationError.message
            : "No se pudo confirmar el usuario localmente.",
        );
        return;
      }
    }

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.assign("/");
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }

    try {
      await confirmLocalUser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);

      if (signInError) {
        setMessage(signInError.message);
        return;
      }

      window.location.assign("/");
    } catch (confirmationError) {
      setLoading(false);
      setMessage(
        confirmationError instanceof Error
          ? confirmationError.message
          : "Cuenta creada, pero no se pudo confirmar automáticamente.",
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Samy OS</p>
        <h1 className="mt-3 text-3xl font-semibold">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-zinc-400">Entra a tu centro de operaciones.</p>

        <form className="mt-8 space-y-4" onSubmit={signIn}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-violet-400"
          />

          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-violet-400"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Procesando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={signUp}
            disabled={loading}
            className="w-full rounded-xl border border-white/10 px-4 py-3 font-semibold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear cuenta
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
