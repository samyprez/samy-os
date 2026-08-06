"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

const isDevelopment = process.env.NODE_ENV !== "production";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validateCredentials(email: string, password: string) {
  if (!email) return "Escribe tu correo electrónico.";
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Escribe un correo electrónico válido.";
  if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function confirmLocalUser(normalizedEmail: string) {
    if (!isDevelopment) return;

    const response = await fetch("/api/auth/dev-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const rawBody = await response.text();
    let result: { error?: string } = {};

    try {
      result = rawBody ? (JSON.parse(rawBody) as { error?: string }) : {};
    } catch {
      throw new Error("El servidor devolvió una respuesta inválida al confirmar la cuenta local.");
    }

    if (!response.ok) {
      throw new Error(result.error || "No se pudo confirmar el usuario localmente.");
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const normalizedEmail = normalizeEmail(email);
    const validationError = validateCredentials(normalizedEmail, password);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      let { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (
        isDevelopment &&
        error?.message.toLowerCase().includes("email not confirmed")
      ) {
        await confirmLocalUser(normalizedEmail);
        const retry = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        error = retry.error;
      }

      if (error) {
        setMessage(error.message);
        return;
      }

      window.location.assign("/");
    } catch (signInError) {
      setMessage(
        signInError instanceof Error
          ? signInError.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    if (loading) return;

    const normalizedEmail = normalizeEmail(email);
    const validationError = validateCredentials(normalizedEmail, password);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!isDevelopment) {
        setMessage(
          "Cuenta creada. Revisa tu correo y confirma la cuenta antes de iniciar sesión.",
        );
        return;
      }

      await confirmLocalUser(normalizedEmail);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setMessage(signInError.message);
        return;
      }

      window.location.assign("/");
    } catch (signUpError) {
      setMessage(
        signUpError instanceof Error
          ? signUpError.message
          : "No se pudo crear la cuenta.",
      );
    } finally {
      setLoading(false);
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
            disabled={loading}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-violet-400 disabled:opacity-60"
          />

          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-violet-400 disabled:opacity-60"
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
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300"
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
