import { useEffect, useRef, useState } from "react";
import { beginContext, beginMic, isAudible, recordPcm } from "@/lib/record-pcm";
import { BrowserVoice } from "@/lib/voice-browser";
import { ensureLocalModel, localFailureMessage, transcribeFrench } from "@/lib/voice-local";

export type KeyboardEntry = "keyboard" | "local" | "external";
export type VoicePhase = "idle" | "loading" | "listening" | "transcribing";

const ENTRIES: readonly KeyboardEntry[] = ["keyboard", "local", "external"];

function isKeyboardEntry(value: string): value is KeyboardEntry {
  return (ENTRIES as readonly string[]).includes(value);
}

export type VoiceDraft = {
  read(): string;
  write(value: string): void;
};

function joinSpeech(prefix: string, spoken: string): string {
  const extra = spoken.trim().replace(/\s+/g, " ");
  if (!extra) return prefix;
  if (!prefix) return extra;
  return /\s$/.test(prefix) ? `${prefix}${extra}` : `${prefix} ${extra}`;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Saisie vocale du clavier : modèle local, ou reconnaissance du navigateur. */
export function useKeyboardVoice(draft: VoiceDraft) {
  const [entry, setEntry] = useState<KeyboardEntry>("keyboard");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [status, setStatus] = useState("");
  const draftRef = useRef(draft);
  const entryRef = useRef(entry);
  const phaseRef = useRef<VoicePhase>("idle");
  const sessionRef = useRef(0);
  const browserRef = useRef<BrowserVoice | null>(null);
  const recordAbortRef = useRef<AbortController | null>(null);
  const externalStopRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const externalPrefixRef = useRef("");
  const localBusyRef = useRef(false);
  const localTicketRef = useRef(0);

  draftRef.current = draft;
  entryRef.current = entry;

  function movePhase(next: VoicePhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      browserRef.current?.stop();
      recordAbortRef.current?.abort();
    };
  }, []);

  function haltBrowser() {
    browserRef.current?.stop();
    browserRef.current = null;
  }

  function appendHeard(text: string) {
    const piece = text.trim();
    if (!piece) return;
    const current = draftRef.current.read();
    draftRef.current.write(joinSpeech(current, piece));
  }

  function changeEntry(value: string) {
    if (!isKeyboardEntry(value) || value === entryRef.current) return;
    sessionRef.current += 1;
    externalStopRef.current = false;
    haltBrowser();
    recordAbortRef.current?.abort();
    recordAbortRef.current = null;
    entryRef.current = value;
    setEntry(value);
    movePhase("idle");
    setStatus("");
  }

  function finishExternal(session: number) {
    if (session !== sessionRef.current || !externalStopRef.current) return;
    const prefix = externalPrefixRef.current;
    const heard = heardSpeechRef.current;
    sessionRef.current += 1;
    externalStopRef.current = false;
    haltBrowser();
    movePhase("idle");
    const added = draftRef.current.read().trim() !== prefix.trim();
    if (added) setStatus("Texte ajouté.");
    else if (heard) setStatus("Le navigateur a entendu la voix, mais n’a pas renvoyé de texte.");
    else setStatus("Le navigateur n’a pas renvoyé de texte.");
  }

  function stopExternal() {
    if (externalStopRef.current) return;
    externalStopRef.current = true;
    const session = sessionRef.current;
    browserRef.current?.stop();
    window.setTimeout(() => finishExternal(session), 800);
  }

  function stop() {
    if (entryRef.current === "external") {
      if (!browserRef.current) {
        sessionRef.current += 1;
        externalStopRef.current = false;
        movePhase("idle");
        setStatus("Écoute annulée.");
        return;
      }
      stopExternal();
      return;
    }
    const current = phaseRef.current;
    if (current === "loading" || current === "transcribing") {
      sessionRef.current += 1;
      localTicketRef.current += 1;
      localBusyRef.current = false;
      recordAbortRef.current?.abort();
      recordAbortRef.current = null;
      movePhase("idle");
      setStatus(current === "transcribing" ? "Reconnaissance annulée." : "Écoute annulée.");
      return;
    }
    recordAbortRef.current?.abort();
  }

  function listen() {
    if (phaseRef.current !== "idle") return;
    if (entryRef.current === "local" && localBusyRef.current) {
      setStatus("La reconnaissance précédente n’est pas encore terminée.");
      return;
    }
    // L’appel part du clic lui-même. Dans une fonction async, le navigateur refuse le micro.
    const micPromise = beginMic();
    if (entryRef.current === "external") {
      void listenExternal(micPromise);
      return;
    }
    let context: AudioContext;
    try {
      context = beginContext();
    } catch (error) {
      micPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
      setStatus(localFailureMessage(error));
      return;
    }
    void listenLocal(micPromise, context);
  }

  async function listenExternal(micPromise: Promise<MediaStream>) {
    const session = sessionRef.current;
    movePhase("loading");
    setStatus("Demande d’accès au micro…");
    try {
      const stream = await micPromise;
      stream.getTracks().forEach((track) => track.stop());
      if (session !== sessionRef.current) return;
      startExternalSession(session);
    } catch (error) {
      if (session !== sessionRef.current) return;
      movePhase("idle");
      setStatus(localFailureMessage(error));
    }
  }

  function startExternalSession(session: number) {
    externalStopRef.current = false;
    heardSpeechRef.current = false;
    const prefix = draftRef.current.read();
    externalPrefixRef.current = prefix;
    let committed = "";
    let lastFinal = "";
    let lastFinalAt = 0;
    const publish = (interim: string) => {
      if (session !== sessionRef.current) return;
      draftRef.current.write(joinSpeech(prefix, joinSpeech(committed, interim)));
    };
    const voice = new BrowserVoice({
      onInterim(text) {
        if (session !== sessionRef.current) return;
        publish(text);
        setStatus(text ? `En cours : ${text}` : "Écoute en cours.");
      },
      onFinal(text) {
        if (session !== sessionRef.current) return;
        const piece = text.trim();
        const now = Date.now();
        if (!piece || (piece === lastFinal && now - lastFinalAt < 600)) {
          publish("");
          return;
        }
        lastFinal = piece;
        lastFinalAt = now;
        committed = joinSpeech(committed, piece);
        publish("");
      },
      onSpeech() {
        if (session !== sessionRef.current) return;
        heardSpeechRef.current = true;
        setStatus("Parole détectée.");
      },
      onEnd() {
        finishExternal(session);
      },
      onError(message) {
        if (session !== sessionRef.current) return;
        externalStopRef.current = false;
        haltBrowser();
        movePhase("idle");
        setStatus(message);
        sessionRef.current += 1;
      },
    });
    if (!voice.start()) {
      movePhase("idle");
      setStatus("Ce navigateur ne propose pas la reconnaissance vocale.");
      return;
    }
    browserRef.current = voice;
    movePhase("listening");
    setStatus("Écoute en cours.");
  }

  async function listenLocal(micPromise: Promise<MediaStream>, context: AudioContext) {
    const session = sessionRef.current;
    const controller = new AbortController();
    recordAbortRef.current = controller;
    const guardedMic = micPromise.then(
      (stream) => {
        if (session !== sessionRef.current || controller.signal.aborted) {
          stream.getTracks().forEach((track) => track.stop());
        }
        return stream;
      },
      (error: unknown) => {
        if (session === sessionRef.current) {
          sessionRef.current += 1;
          localTicketRef.current += 1;
          controller.abort();
          localBusyRef.current = false;
          movePhase("idle");
          setStatus(localFailureMessage(error));
        }
        throw error;
      },
    );
    void guardedMic.catch(() => {});
    const ticket = localTicketRef.current + 1;
    localTicketRef.current = ticket;
    localBusyRef.current = true;
    movePhase("loading");
    setStatus("Préparation du modèle…");
    try {
      await ensureLocalModel((ratio) => {
        if (session !== sessionRef.current) return;
        if (ratio < 1) setStatus(`Téléchargement du modèle, ${Math.round(ratio * 100)} %.`);
      });
      if (session !== sessionRef.current || controller.signal.aborted) return;
      const stream = await guardedMic;
      if (session !== sessionRef.current || controller.signal.aborted) return;
      movePhase("listening");
      setStatus("Écoute en cours. Arrêter pour transcrire.");
      const captured = await recordPcm(context, stream, controller.signal);
      stream.getTracks().forEach((track) => track.stop());
      recordAbortRef.current = null;
      if (session !== sessionRef.current) return;
      if (!isAudible(captured.samples, captured.sampleRate)) {
        setStatus("Aucun son n’a été capté.");
        return;
      }
      movePhase("transcribing");
      setStatus(captured.limited ? "Limite de 30 secondes. Reconnaissance…" : "Reconnaissance…");
      const text = await transcribeFrench(captured.samples, captured.sampleRate);
      if (session !== sessionRef.current) return;
      if (text) appendHeard(text);
      setStatus(text ? "Texte ajouté." : "Rien n’a été reconnu.");
    } catch (error) {
      if (session !== sessionRef.current) return;
      if (isAbort(error)) {
        setStatus("Écoute annulée.");
        return;
      }
      setStatus(localFailureMessage(error));
    } finally {
      if (localTicketRef.current === ticket) localBusyRef.current = false;
      recordAbortRef.current = null;
      micPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
      if (context.state !== "closed") await context.close().catch(() => {});
      if (session === sessionRef.current) movePhase("idle");
    }
  }

  return { entry, phase, status, changeEntry, listen, stop };
}
