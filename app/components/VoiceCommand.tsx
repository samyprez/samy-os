"use client";

import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
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

type AssistantAction = {
  action: "create_task" | "create_event" | "create_client" | "query" | "none";
  title: string | null;
  area: string | null;
  priority: "Alta" | "Media" | "Baja" | null;
  due_date: string | null;
  starts_at: string | null;
  location: string | null;
  client_name: string | null;
  contact: string | null;
  service: string | null;
  response: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function hasWakePhrase(text: string) {
  return /^(?:oye\s+)?(?:samy\s*os|samy|asistente\s+virtual|asistente)\b/i.test(text.trim());
}

function stripWakePhrase(text: string) {
  return text
    .replace(/^\s*(?:oye\s+)?(?:samy\s*os|samy|asistente\s+virtual|asistente)[,:\s-]*/i, "")
    .trim();
}

function normalizeCommand(text: string) {
  return text.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

export default function VoiceCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Activa el asistente y llámame diciendo “Samy OS”.");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const assistantModeRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const lastCommandRef = useRef<{ command: string; at: number } | null>(null);

  function clearRestartTimer() {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function startRecognition(delay = 650) {
    clearRestartTimer();
    if (!assistantModeRef.current || processingRef.current || speakingRef.current) return;

    restartTimerRef.current = window.setTimeout(() => {
      if (!assistantModeRef.current || processingRef.current || speakingRef.current) return;
      try {
        recognitionRef.current?.start();
        setListening(true);
        setMessage("Asistente activo. Esperando “Samy OS”…");
      } catch {
        // Chrome throws when recognition is already active. That is harmless.
      }
    }, delay);
  }

  function stopRecognition() {
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }
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

    const finish = () => {
      speakingRef.current = false;
      startRecognition(900);
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  async function interpret(command: string) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch("/api/assistant-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: command,
          now: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      let data: (AssistantAction & { error?: string }) | null = null;

      try {
        data = rawBody ? (JSON.parse(rawBody) as AssistantAction & { error?: string }) : null;
      } catch {
        throw new Error(`El servidor devolvió una respuesta inválida (${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `No pude interpretar la instrucción (${response.status}).`);
      }
      if (!data) throw new Error("El servidor no devolvió una respuesta.");

      return data;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("La respuesta tardó demasiado. Inténtalo nuevamente.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function executeCommand(spokenText: string) {
    if (processingRef.current || speakingRef.current) return;

    const command = stripWakePhrase(spokenText);
    const normalized = normalizeCommand(command);
    const now = Date.now();
    const previous = lastCommandRef.current;

    if (normalized && previous?.command === normalized && now - previous.at < 5000) return;
    if (normalized) lastCommandRef.current = { command: normalized, at: now };

    processingRef.current = true;
    stopRecognition();

    try {
      if (!command) {
        const reply = "Sí, Samy. ¿Qué necesitas?";
        setMessage(reply);
        speak(reply);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

      setMessage("ChatGPT está entendiendo la instrucción…");
      const action = await interpret(command);
      let databaseError: { message: string } | null = null;
      let recordCreated = false;
      let duplicateFound = false;

      if (action.action === "create_task") {
        if (!action.title) throw new Error(action.response || "Falta el nombre de la tarea.");

        let duplicateQuery = supabase
          .from("tasks")
          .select("id")
          .eq("user_id", user.id)
          .eq("title", action.title)
          .eq("status", "Pendiente");

        duplicateQuery = action.due_date
          ? duplicateQuery.eq("due_date", action.due_date)
          : duplicateQuery.is("due_date", null);

        const duplicate = await duplicateQuery.limit(1);
        if (duplicate.error) throw new Error(duplicate.error.message);
        duplicateFound = Boolean(duplicate.data?.length);

        if (!duplicateFound) {
          const result = await supabase.from("tasks").insert({
            user_id: user.id,
            title: action.title,
            area: action.area || "General",
            status: "Pendiente",
            priority: action.priority || "Media",
            due_date: action.due_date,
          });
          databaseError = result.error;
          recordCreated = !result.error;
        }
      } else if (action.action === "create_event") {
        if (!action.title || !action.starts_at) {
          throw new Error(action.response || "Faltan el título o la fecha del evento.");
        }

        const duplicate = await supabase
          .from("events")
          .select("id")
          .eq("user_id", user.id)
          .eq("title", action.title)
          .eq("starts_at", action.starts_at)
          .limit(1);

        if (duplicate.error) throw new Error(duplicate.error.message);
        duplicateFound = Boolean(duplicate.data?.length);

        if (!duplicateFound) {
          const result = await supabase.from("events").insert({
            user_id: user.id,
            title: action.title,
            starts_at: action.starts_at,
            location: action.location,
            status: "Programado",
          });
          databaseError = result.error;
          recordCreated = !result.error;
        }
      } else if (action.action === "create_client") {
        if (!action.client_name) throw new Error(action.response || "Falta el nombre del cliente.");

        const duplicate = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", action.client_name)
          .limit(1);

        if (duplicate.error) throw new Error(duplicate.error.message);
        duplicateFound = Boolean(duplicate.data?.length);

        if (!duplicateFound) {
          const result = await supabase.from("clients").insert({
            user_id: user.id,
            name: action.client_name,
            primary_contact: action.contact,
            service: action.service,
            status: "Activo",
            priority: action.priority || "Media",
            next_step: "Definir próximo paso",
          });
          databaseError = result.error;
          recordCreated = !result.error;
        }
      }

      if (databaseError) throw new Error(databaseError.message);

      const reply = duplicateFound
        ? "Esa información ya estaba registrada. No la dupliqué."
        : action.response || "Listo. Completé la acción.";

      setMessage(reply);
      speak(reply);

      if (recordCreated) {
        router.refresh();
      }
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
      if (speakingRef.current || processingRef.current) return;

      const spoken = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? "";
      if (!spoken) return;

      setTranscript(spoken);
      if (!hasWakePhrase(spoken)) {
        setMessage("Asistente activo. Esperando “Samy OS”…");
        return;
      }

      void executeCommand(spoken);
    };

    recognition.onerror = (event) => {
      // Chrome emits these during normal stop/restart cycles.
      if (["aborted", "no-speech"].includes(event.error)) return;
      if (!speakingRef.current && assistantModeRef.current) {
        setMessage(`Problema con el micrófono: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      startRecognition();
    };

    return recognition;
  }

  function enableAssistant() {
    let recognition = recognitionRef.current;
    if (!recognition) recognition = createRecognition();

    if (!recognition) {
      setMessage("Usa Google Chrome o Microsoft Edge para activar el asistente por voz.");
      return;
    }

    recognitionRef.current = recognition;
    assistantModeRef.current = true;
    processingRef.current = false;
    speakingRef.current = false;
    lastCommandRef.current = null;
    setAssistantMode(true);
    setMessage("Asistente activo. Llámame diciendo “Samy OS”…");

    // Do not speak here: Chrome would abort the microphone immediately after activation.
    startRecognition(100);
  }

  function disableAssistant() {
    assistantModeRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    lastCommandRef.current = null;
    clearRestartTimer();
    setAssistantMode(false);
    setListening(false);

    try {
      recognitionRef.current?.abort?.();
    } catch {
      try {
        recognitionRef.current?.stop();
      } catch {}
    }

    window.speechSynthesis.cancel();
    setMessage("Asistente pausado.");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full text-white shadow-2xl transition hover:scale-105 ${assistantMode ? "bg-emerald-500 shadow-emerald-500/30" : "bg-violet-500 shadow-violet-500/30"}`}
        aria-label="Abrir asistente virtual"
      >
        {assistantMode ? <Sparkles size={23} /> : <Mic size={23} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 p-4 sm:place-items-center">
          <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#11141c] p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-400">OpenAI + Samy OS</p>
                <h2 className="mt-2 text-2xl font-semibold">Asistente virtual inteligente</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-white/5">
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm leading-6 text-zinc-300">{message}</p>
              {transcript && <p className="mt-3 text-sm font-medium text-violet-300">“{transcript}”</p>}
              {assistantMode && (
                <p className="mt-2 text-xs text-zinc-500">{listening ? "Escuchando…" : "Procesando o respondiendo…"}</p>
              )}
            </div>

            <button
              type="button"
              onClick={assistantMode ? disableAssistant : enableAssistant}
              className={`mt-5 flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 font-semibold transition ${assistantMode ? "bg-red-500 hover:bg-red-400" : "bg-violet-500 hover:bg-violet-400"}`}
            >
              {assistantMode ? <MicOff size={21} /> : <Mic size={21} />}
              {assistantMode ? "Pausar asistente" : "Activar asistente virtual"}
            </button>

            <div className="mt-4 rounded-xl bg-violet-500/10 p-3 text-xs leading-5 text-violet-200">
              Di: “Samy OS, crea una tarea para llamar a Salami mañana a las diez”.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
