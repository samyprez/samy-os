"use client";

import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type SpeechRecognitionErrorLike = {
  error: string;
};

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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHour(text: string) {
  const words: Record<string, number> = {
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
  };

  const numeric = text.match(/(?:a las|a la)\s+(\d{1,2})(?::(\d{2}))?/);
  let hour = numeric ? Number(numeric[1]) : null;
  const minute = numeric?.[2] ? Number(numeric[2]) : 0;

  if (hour === null) {
    const spoken = text.match(/(?:a las|a la)\s+(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)/);
    hour = spoken ? words[spoken[1]] : null;
  }

  if (hour === null) hour = 9;
  if (text.includes("de la tarde") || text.includes("pm")) {
    if (hour < 12) hour += 12;
  }
  if (text.includes("de la noche") && hour < 12) hour += 12;
  if (text.includes("de la manana") && hour === 12) hour = 0;

  return { hour, minute };
}

function parseDate(text: string) {
  const now = new Date();
  const result = new Date(now);
  result.setSeconds(0, 0);

  if (text.includes("manana")) result.setDate(result.getDate() + 1);
  else if (text.includes("pasado manana")) result.setDate(result.getDate() + 2);
  else {
    const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    const requested = days.findIndex((day) => text.includes(day));
    if (requested >= 0) {
      const distance = (requested - result.getDay() + 7) % 7 || 7;
      result.setDate(result.getDate() + distance);
    }
  }

  const { hour, minute } = parseHour(text);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function cleanEventTitle(raw: string) {
  return raw
    .replace(/^(crea|crear|agrega|agregar|programa|programar)\s+(una?\s+)?(reunion|evento|cita)\s+(con\s+)?/i, "")
    .replace(/\s+(hoy|manana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo).*$/i, "")
    .trim();
}

function cleanTaskTitle(raw: string) {
  return raw
    .replace(/^(crea|crear|agrega|agregar|anade|añade)\s+(una?\s+)?tarea\s+(para\s+)?/i, "")
    .replace(/\s+(hoy|manana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo).*$/i, "")
    .trim();
}

export default function VoiceCommand() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Presiona el micrófono y habla.");

  async function executeCommand(spokenText: string) {
    const command = normalize(spokenText);
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      setMessage("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const isEvent = /(reunion|evento|cita|calendario|programa)/.test(command);
    const isTask = /(tarea|pendiente|recordar|recuerdame|llamar|seguimiento)/.test(command);

    if (isEvent) {
      const title = cleanEventTitle(spokenText) || "Nuevo evento";
      const locationMatch = spokenText.match(/\s+en\s+(.+?)(?:\s+(?:hoy|mañana|manana|el lunes|el martes|el miércoles|el miercoles|el jueves|el viernes|el sábado|el sabado|el domingo|a las|a la)|$)/i);
      const location = locationMatch?.[1]?.trim() || null;
      const startsAt = parseDate(command);

      const { error } = await supabase.from("events").insert({
        user_id: user.id,
        title,
        starts_at: startsAt.toISOString(),
        location,
        status: "Programado",
      });

      if (error) {
        setMessage(`No pude crear el evento: ${error.message}`);
        return;
      }

      setMessage(`Evento creado: ${title}, ${startsAt.toLocaleString()}.`);
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }

    if (isTask) {
      const title = cleanTaskTitle(spokenText) || spokenText.trim();
      const dueDate = parseDate(command).toISOString().slice(0, 10);
      const areaMatch = spokenText.match(/(?:para|de|con)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.-]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.-]*)*)/);
      const area = areaMatch?.[1]?.trim() || "General";

      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        title,
        area,
        status: "Pendiente",
        priority: command.includes("urgente") || command.includes("prioridad alta") ? "Alta" : "Media",
        due_date: dueDate,
      });

      if (error) {
        setMessage(`No pude crear la tarea: ${error.message}`);
        return;
      }

      setMessage(`Tarea creada: ${title}.`);
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }

    setMessage("Todavía no reconocí esa acción. Prueba: “Crea una reunión con Salami mañana a las tres en Toronto” o “Agrega una tarea para llamar a MiKiosko el viernes”.");
  }

  function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setMessage("Este navegador no permite reconocimiento de voz. Usa Google Chrome o Microsoft Edge.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(spoken);
      setMessage("Procesando instrucción…");
      void executeCommand(spoken);
    };

    recognition.onerror = (event) => {
      setMessage(`No pude escuchar correctamente: ${event.error}.`);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    setListening(true);
    setMessage("Escuchando…");
    recognition.start();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-violet-500 text-white shadow-2xl shadow-violet-500/30 transition hover:scale-105 hover:bg-violet-400"
        aria-label="Abrir comandos por voz"
      >
        <Mic size={23} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 p-4 sm:place-items-center">
          <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#11141c] p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Samy OS Voice</p>
                <h2 className="mt-2 text-2xl font-semibold">Dime qué debo hacer</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm leading-6 text-zinc-300">{message}</p>
              {transcript && <p className="mt-3 text-sm font-medium text-violet-300">“{transcript}”</p>}
            </div>

            <button
              type="button"
              onClick={startListening}
              disabled={listening}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-violet-500 px-5 py-4 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {listening ? <MicOff size={21} /> : <Mic size={21} />}
              {listening ? "Escuchando…" : "Hablar con Samy OS"}
            </button>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-violet-500/10 p-3 text-xs leading-5 text-violet-200">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              Ejemplo: “Crea una reunión con Salami Sibao mañana a las tres de la tarde en Toronto”.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
