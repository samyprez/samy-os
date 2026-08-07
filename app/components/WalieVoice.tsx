"use client";

import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionErrorLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WalieAction = {
  action: "create_task" | "create_note" | "create_event" | "create_client" | "query" | "none";
  title: string | null;
  body: string | null;
  area: string | null;
  priority: "Alta" | "Media" | "Baja" | null;
  due_date: string | null;
  starts_at: string | null;
  location: string | null;
  client_name: string | null;
  contact: string | null;
  service: string | null;
  related_to: string | null;
  response: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const wakePattern = /(?:walie|wally|wali|asistente\s+personal|asistente\s+virtual|asistente)\b/i;
const wakeOnlyPattern = /^\s*(?:oye\s+)?(?:walie|wally|wali|asistente\s+personal|asistente\s+virtual|asistente)[,:\s-]*$/i;

function stripWakePhrase(text: string) {
  return text
    .replace(/^\s*(?:oye\s+)?(?:walie|wally|wali|asistente\s+personal|asistente\s+virtual|asistente)[,:\s-]*/i, "")
    .trim();
}

export default function WalieVoice() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Activa a Walie y di: “Walie, crea una tarea…”");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const enabledRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const wakeArmedUntilRef = useRef(0);
  const lastCommandRef = useRef<{ text: string; at: number } | null>(null);

  function clearTimer() {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }

  function startRecognition(delay = 500) {
    clearTimer();
    if (!enabledRef.current || processingRef.current || speakingRef.current) return;
    restartTimerRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.start();
        setListening(true);
        setMessage(
          Date.now() < wakeArmedUntilRef.current
            ? "Sí, Samy. Te escucho…"
            : "Walie está escuchando. Di “Walie” y tu instrucción.",
        );
      } catch {}
    }, delay);
  }

  function stopRecognition() {
    clearTimer();
    try { recognitionRef.current?.stop(); } catch {}
    setListening(false);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      startRecognition();
      return;
    }
    speakingRef.current = true;
    stopRecognition();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1;
    const done = () => {
      speakingRef.current = false;
      startRecognition(800);
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  }

  async function interpret(command: string) {
    const response = await fetch("/api/walie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: command,
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = (await response.json()) as WalieAction & { error?: string };
    if (!response.ok) throw new Error(data.error || "Walie no pudo interpretar la instrucción.");
    return data;
  }

  async function execute(spoken: string) {
    if (processingRef.current || speakingRef.current) return;
    const command = stripWakePhrase(spoken);
    if (!command) {
      wakeArmedUntilRef.current = Date.now() + 8000;
      setMessage("Sí, Samy. Te escucho…");
      return;
    }

    wakeArmedUntilRef.current = 0;
    const normalized = command.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
    const now = Date.now();
    if (lastCommandRef.current?.text === normalized && now - lastCommandRef.current.at < 5000) return;
    lastCommandRef.current = { text: normalized, at: now };

    processingRef.current = true;
    stopRecognition();

    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("Tu sesión no está activa. Inicia sesión de nuevo.");
      const userId = data.user.id;

      setMessage("Walie está entendiendo la instrucción…");
      const action = await interpret(command);

      if (action.action === "create_task") {
        if (!action.title) throw new Error("No pude identificar el nombre de la tarea.");
        const duplicate = await supabase
          .from("tasks")
          .select("id")
          .eq("user_id", userId)
          .eq("title", action.title)
          .eq("status", "Pendiente")
          .limit(1);
        if (duplicate.error) throw new Error(duplicate.error.message);
        if (duplicate.data?.length) {
          speak("Esa tarea ya estaba registrada. No la dupliqué.");
          return;
        }
        const result = await supabase.from("tasks").insert({
          user_id: userId,
          title: action.title,
          area: action.area || "General",
          priority: action.priority || "Media",
          status: "Pendiente",
          due_date: action.due_date,
          source: "Walie",
        });
        if (result.error) throw new Error(result.error.message);
      } else if (action.action === "create_note") {
        if (!action.body) throw new Error("No pude identificar el contenido de la nota.");
        const result = await supabase.from("notes").insert({
          user_id: userId,
          body: action.body,
          related_to: action.related_to,
          category: "Walie",
          priority: action.priority || "Media",
        });
        if (result.error) throw new Error(result.error.message);
      } else if (action.action === "create_event") {
        if (!action.title || !action.starts_at) throw new Error("Faltan el título o la fecha del evento.");
        const result = await supabase.from("events").insert({
          user_id: userId,
          title: action.title,
          starts_at: action.starts_at,
          location: action.location,
          status: "Programado",
        });
        if (result.error) throw new Error(result.error.message);
      } else if (action.action === "create_client") {
        if (!action.client_name) throw new Error("Falta el nombre del cliente.");
        const result = await supabase.from("clients").insert({
          user_id: userId,
          name: action.client_name,
          primary_contact: action.contact,
          service: action.service,
          status: "Activo",
          priority: action.priority || "Media",
          next_step: "Definir próximo paso",
        });
        if (result.error) throw new Error(result.error.message);
      }

      const reply = action.response || "Listo. Lo guardé.";
      setMessage(reply);
      speak(reply);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      const reply = error instanceof Error ? error.message : "No pude completar la acción.";
      setMessage(reply);
      speak(reply);
    } finally {
      processingRef.current = false;
      if (!speakingRef.current) startRecognition();
    }
  }

  function createRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      if (processingRef.current || speakingRef.current) return;
      const spoken = event.results[event.results.length - 1]?.[0]?.transcript?.trim() || "";
      if (!spoken) return;

      setTranscript(spoken);
      const armed = Date.now() < wakeArmedUntilRef.current;
      const containsWake = wakePattern.test(spoken);

      if (armed && !containsWake) {
        void execute(spoken);
        return;
      }

      if (!containsWake) {
        setMessage("Walie está escuchando. Di “Walie” y tu instrucción.");
        return;
      }

      if (wakeOnlyPattern.test(spoken)) {
        wakeArmedUntilRef.current = Date.now() + 8000;
        setMessage("Sí, Samy. Te escucho…");
        return;
      }

      void execute(spoken);
    };
    recognition.onerror = (event) => {
      if (["aborted", "no-speech"].includes(event.error)) return;
      setMessage(`Problema con el micrófono: ${event.error}.`);
    };
    recognition.onend = () => {
      setListening(false);
      startRecognition();
    };
    return recognition;
  }

  function enable() {
    const recognition = recognitionRef.current || createRecognition();
    if (!recognition) {
      setMessage("Walie por voz necesita Google Chrome o Microsoft Edge.");
      return;
    }
    recognitionRef.current = recognition;
    enabledRef.current = true;
    processingRef.current = false;
    speakingRef.current = false;
    wakeArmedUntilRef.current = 0;
    setEnabled(true);
    setMessage("Walie está activo. Di “Walie” y tu instrucción.");
    startRecognition(100);
  }

  function disable() {
    enabledRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    wakeArmedUntilRef.current = 0;
    clearTimer();
    setEnabled(false);
    setListening(false);
    try { recognitionRef.current?.abort?.(); } catch {}
    window.speechSynthesis?.cancel();
    setMessage("Walie está pausado.");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full text-white shadow-2xl transition hover:scale-105 ${enabled ? "bg-emerald-500" : "bg-violet-500"}`}
        aria-label="Abrir Walie"
      >
        {enabled ? <Sparkles size={23} /> : <Mic size={23} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 p-4 sm:place-items-center">
          <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#11141c] p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-400">Samy OS</p>
                <h2 className="mt-2 text-2xl font-semibold">Walie</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-white/5"><X size={20} /></button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm leading-6 text-zinc-300">{message}</p>
              {transcript && <p className="mt-3 text-sm font-medium text-violet-300">“{transcript}”</p>}
              {enabled && <p className="mt-2 text-xs text-zinc-500">{listening ? "Escuchando…" : "Procesando…"}</p>}
            </div>

            <button
              type="button"
              onClick={enabled ? disable : enable}
              className={`mt-5 flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 font-semibold ${enabled ? "bg-red-500" : "bg-violet-500"}`}
            >
              {enabled ? <MicOff size={21} /> : <Mic size={21} />}
              {enabled ? "Pausar Walie" : "Activar Walie"}
            </button>

            <div className="mt-4 rounded-xl bg-violet-500/10 p-3 text-xs leading-5 text-violet-200">
              Puedes decirlo de una vez: “Walie, crea una tarea para llamar a Salami mañana”. También funciona en dos pasos: “Walie” y luego tu instrucción.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
