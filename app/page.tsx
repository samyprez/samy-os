import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-4 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Samy OS</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Tu centro de operaciones</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          Accede a tus tareas, clientes, eventos y al asistente de voz desde un solo lugar.
        </p>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center justify-center rounded-2xl bg-violet-500 px-6 py-4 font-semibold transition hover:bg-violet-400"
        >
          Abrir Dashboard
        </Link>
      </section>
    </main>
  );
}
