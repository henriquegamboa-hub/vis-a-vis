/** Durée max d’un passage : Whisper traite au plus 30 secondes d’un coup. */
export const RECORD_LIMIT_MS = 30_000;

export type CapturedAudio = {
  samples: Float32Array;
  sampleRate: number;
  /** Vrai quand l’enregistrement s’est arrêté tout seul à la limite. */
  limited: boolean;
};

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

/**
 * Ouvre le micro pendant le clic, avec la contrainte la plus simple.
 * Des options en plus, ou un son démarré avant cet appel, font refuser le micro
 * sans afficher de demande.
 */
export function beginMic(): Promise<MediaStream> {
  if (typeof window === "undefined" || window.isSecureContext === false) {
    return Promise.reject(new Error("Le micro est bloqué sur cette adresse. Ouvrez http://localhost:8080/."));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("Ce navigateur ne donne pas accès au micro."));
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

/**
 * Crée le contexte audio pendant le clic, après l’appel au micro.
 * Un contexte ouvert plus tard, après le chargement du modèle, reste souvent suspendu.
 */
export function beginContext(): AudioContext {
  const context = new AudioContext();
  void context.resume();
  return context;
}

/**
 * Enregistre le micro jusqu’à l’arrêt ou la limite.
 * L’annulation rend ce qui a déjà été capté, sans rester bloquée.
 */
export async function recordPcm(
  context: AudioContext,
  stream: MediaStream,
  signal: AbortSignal,
  maxMs = RECORD_LIMIT_MS,
): Promise<CapturedAudio> {
  const chunks: Float32Array[] = [];
  let release = () => {};
  try {
    if (signal.aborted) return captured(chunks, context, false);
    const source = context.createMediaStreamSource(stream);
    release = await withAbort(signal, attachCapture(context, source, chunks));
    if (signal.aborted || context.state === "closed") return captured(chunks, context, false);
    if (context.state === "suspended") {
      try {
        await withAbort(signal, resumeSoon(context));
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
    if (signal.aborted || context.state !== "running") return captured(chunks, context, false);
    const limited = await waitForStop(signal, maxMs);
    return captured(chunks, context, limited);
  } finally {
    release();
  }
}

function captured(chunks: Float32Array[], context: AudioContext, limited: boolean): CapturedAudio {
  const sampleRate = context.sampleRate;
  return {
    samples: mergeChunks(chunks),
    sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48_000,
    limited,
  };
}

async function attachCapture(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  chunks: Float32Array[],
): Promise<() => void> {
  const mute = context.createGain();
  mute.gain.value = 0.00001;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, "pcm-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (event.data?.length) chunks.push(event.data);
    };
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    return () => {
      node.port.onmessage = null;
      node.disconnect();
      source.disconnect();
      mute.disconnect();
    };
  } catch {
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      if (data.length > 0) chunks.push(new Float32Array(data));
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    return () => {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
    };
  }
}

/** Le contexte ouvert hors geste ne se relance pas toujours. On n’attend pas indéfiniment. */
function resumeSoon(context: AudioContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Le micro n’a pas démarré. Cliquez de nouveau sur Écouter."));
    }, 4_000);
    context.resume().then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Le micro n’a pas démarré."));
      },
    );
  });
}

function waitForStop(signal: AbortSignal, maxMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => finish(true), maxMs);
    const onAbort = () => finish(false);
    function finish(limited: boolean) {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(limited);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function withAbort<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      promise.catch(() => {});
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.aborted ? abortError() : error);
      },
    );
  });
}

function abortError(): DOMException {
  return new DOMException("Enregistrement interrompu.", "AbortError");
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

/** Le pipeline Whisper attend un mono à 16 kHz. */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  const toRate = 16_000;
  if (input.length === 0 || fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  const last = input.length - 1;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, last);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

/** Écarte le silence, sur lequel Whisper invente souvent une phrase. */
export function isAudible(samples: Float32Array, sampleRate: number): boolean {
  if (samples.length < sampleRate * 0.25) return false;
  const step = Math.max(1, Math.floor(samples.length / 8_000));
  let sum = 0;
  let count = 0;
  for (let index = 0; index < samples.length; index += step) {
    const value = samples[index];
    sum += value * value;
    count += 1;
  }
  return Math.sqrt(sum / count) >= 0.004;
}
