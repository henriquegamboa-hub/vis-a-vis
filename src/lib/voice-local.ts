import type { AutomaticSpeechRecognitionPipeline, ProgressInfo } from "@huggingface/transformers";
import { isAudible, resampleTo16k } from "@/lib/record-pcm";
import { microphoneDeniedMessage } from "@/lib/voice-browser";

/** Whisper base, multilingue, quantifié q8. Premier chargement d’environ 81 Mo. */
const MODEL_ID = "onnx-community/whisper-base";

type Transcriber = AutomaticSpeechRecognitionPipeline;

let loading: Promise<Transcriber> | null = null;
const listeners = new Set<(ratio: number) => void>();

function publish(ratio: number) {
  for (const listener of listeners) listener(ratio);
}

async function loadModel(): Promise<Transcriber> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  // GitHub Pages n’envoie pas les en-têtes qui autorisent le wasm multi-fils.
  // Le proxy laisse la page réactive pendant la reconnaissance, pour qu’Arrêter réponde.
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = true;
  }
  return pipeline("automatic-speech-recognition", MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress_total") publish(info.progress / 100);
      if (info.status === "ready") publish(1);
    },
  });
}

/** Télécharge et garde le modèle. Les appels suivants réutilisent le même chargement. */
export function ensureLocalModel(onProgress: (ratio: number) => void): Promise<void> {
  listeners.add(onProgress);
  if (!loading) {
    loading = loadModel().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading.then(
    () => {
      listeners.delete(onProgress);
    },
    (error: unknown) => {
      listeners.delete(onProgress);
      throw error;
    },
  );
}

/** Reconnaissance dans l’application. L’audio n’est pas envoyé. Chaîne vide si rien d’audible. */
export async function transcribeFrench(samples: Float32Array, sampleRate: number): Promise<string> {
  if (!isAudible(samples, sampleRate)) return "";
  const transcriber = await loadModelCached();
  const audio = resampleTo16k(samples, sampleRate);
  const output = await transcriber(audio, { language: "french", task: "transcribe" });
  return cleanTranscript(output.text ?? "");
}

/** Whisper renvoie souvent des points ou une indication de silence quand il n’a rien compris. */
function cleanTranscript(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || /^[\s.….,!?;:'"«»\-–—()]+$/.test(cleaned)) return "";
  if (/^\[(?:blank|silence|musique|music|bruit|applaudissements)[^\]]*\]$/i.test(cleaned)) return "";
  return cleaned;
}

function loadModelCached(): Promise<Transcriber> {
  if (!loading) loading = loadModel().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export function localFailureMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return microphoneDeniedMessage();
    if (error.name === "NotFoundError") return "Aucun micro.";
  }
  if (error instanceof Error) {
    if (error.message.startsWith("Ce navigateur") || error.message.startsWith("Le micro")) return error.message;
    if (/failed to fetch|network|timeout|http error/i.test(error.message)) {
      return "Le modèle n’a pas pu être téléchargé.";
    }
  }
  return "La reconnaissance dans l’application a échoué.";
}
