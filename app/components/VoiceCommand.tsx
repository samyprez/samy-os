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

export default function VoiceCommand() {
  const [open, setOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Activa el asistente y llámame diciendo “Samy OS”.");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const assistantModeRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);

  function restartRecognition() {
    if (!assistantModeRef.current || speakingRef.current) return;
    window.setTimeout(() => {
      try {
        recognitionRef.current?.start();
        setListening(true);
      } catch {}
    }, 350);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;

    speakingRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1;
    utterance.onend = () => {
      speakingRef.current = false;
      restartRecognition();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      restartRecognition();
    };
    window.speechSynthesis.speak(utterance);
  }

  async function interpret(command: string) {
    const response = await fetch("/api/assistant-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: command,
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    const data = (await response.json()) as AssistantAction & { error?: string };
    if (!response.ok) throw new Error(data.error || `No pude interpretar la instrucción (${response.status}).`);
    return data;
  }

  async function executeCommand(spokenText: string) {
    if (processingRef.current || speakingRef.current) return;
    processingRef.current = true;

    try {
      const command = stripWakePhrase(spokenText);
      if (!command) {
        setMessage("Sí, Samy. ¿Qué necesitas?");
        speak("Sí, Samy. ¿Qué necesitas?");
        return;
      }

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

      setMessage("ChatGPT está entendiendo la instrucción…");
      const action = await interpret(command);
      let databaseError: { message: string } | null = null;

      if (action.action === "create_task") {
        if (!action.title) throw new Error(action.response || "Falta el nombre de la tarea.");
        const result = await supabase.from("tasks").insert({
          user_id: user.id,
          title: action.title,
          area: action.area || "General",
          status: "Pendiente",
          priority: action.priority || "Media",
          due_date: action.due_date,
        });
        databaseError = result.error;
      } else if (action.action === "create_event") {
        if (!action.title || !action.starts_at) {
          throw new Error(action.response || "Faltan el título o la fecha del evento.");
        }
        const result = await supabase.from("events").insert({
          user_id: user.id,
          title: action.title,
          starts_at: action.starts_at,
          location: action.location,
          status: "Programado",
        });
        databaseError = result.error;
      } else if (action.action === "create_client") {
        if (!action.client_name) throw new Error(action.response || "Falta el nombre del cliente.");
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
      }

      if (databaseError) throw new Error(databaseError.message);

      setMessage(action.response);
      speak(action.response);
      if (["create_task", "create_event", "create_client"].includes(action.action)) {
        window.setTimeout(() => window.location.reload(), 1800);
      }
    } catch (error) {
      const response = error instanceof Error ? error.message : "No pude completar la acción.";
      setMessage(response);
      speak(response);
    } finally {
      processingRef.current = false;
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
      const spoken = event.results[event.results.length - 1]?.[0]?.transcript ?? "";
      setTranscript(spoken);
      if (!hasWakePhrase(spoken)) {
        setMessage("Asistente activo. Esperando “Samy OS”…");
        return;
      }
      void executeCommand(spoken);
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && !speakingRef.current) {
        setMessage(`Problema con el micrófono: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (!speakingRef.current) restartRecognition();
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
    setAssistantMode(true);
    setListening(true);
    setMessage("Asistente activo. Llámame diciendo “Samy OS”…");
    try {
      recognition.start();
    } catch {}
    speak("Asistente virtual activado.");
  }

  function disableAssistant() {
    assistantModeRef.current = false;
    speakingRef.current = false;
    setAssistantMode(false);
    setListening(false);
    recognitionRef.current?.stop();
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
              Di: “Samy OS, crea un cliente llamado Restaurante El Patio” o “Samy OS, agenda una reunión con Salami mañana a las tres en Toronto”.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
