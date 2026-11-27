type VoiceHandlers = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onSpeech: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

type RecognitionResult = {
  isFinal: boolean;
  0?: { transcript: string };
};

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = {
  error: string;
};

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onspeechstart: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => BrowserRecognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  if (typeof host.SpeechRecognition === "function") return host.SpeechRecognition;
  if (typeof host.webkitSpeechRecognition === "function") return host.webkitSpeechRecognition;
  return null;
}

/** Message quand le navigateur refuse le micro, ou quand la page n’est pas en localhost / https. */
export function microphoneDeniedMessage(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Le micro est bloqué sur cette adresse. Ouvrez http://localhost:8080/.";
  }
  return "Le micro est refusé. Autorisez-le pour ce site : cadenas dans la barre d’adresse, Microphone, puis réessayez.";
}

function browserErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return microphoneDeniedMessage();
    case "audio-capture":
      return "Aucun micro.";
    case "network":
      return "La reconnaissance du navigateur a échoué. Elle dépend souvent du réseau.";
    case "language-not-supported":
      return "Ce navigateur ne reconnaît pas le français.";
    default:
      return "La reconnaissance du navigateur a échoué.";
  }
}

/** Reconnaissance vocale du navigateur (Web Speech), à partir du micro du système. */
export class BrowserVoice {
  private recognition: BrowserRecognition | null = null;
  private active = false;

  constructor(private handlers: VoiceHandlers) {}

  start(): boolean {
    const Ctor = recognitionCtor();
    if (!Ctor) return false;
    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    // Une phrase à la fois : le mode continu ne renvoie souvent aucun texte.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index]?.[0]?.transcript ?? "";
        if (event.results[index]?.isFinal) finalText += piece;
        else interim += piece;
      }
      if (finalText.trim()) this.handlers.onFinal(finalText);
      this.handlers.onInterim(interim.trim());
    };
    recognition.onspeechstart = () => {
      this.handlers.onSpeech();
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      this.active = false;
      this.handlers.onError(browserErrorMessage(event.error));
    };
    recognition.onend = () => {
      if (!this.active) {
        this.handlers.onEnd();
        return;
      }
      window.setTimeout(() => {
        if (!this.active) {
          this.handlers.onEnd();
          return;
        }
        try {
          recognition.start();
        } catch {
          this.active = false;
          this.handlers.onError("La reconnaissance du navigateur s’est arrêtée.");
        }
      }, 200);
    };
    try {
      recognition.start();
    } catch {
      return false;
    }
    this.recognition = recognition;
    this.active = true;
    return true;
  }

  stop() {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      /* déjà arrêté */
    }
    this.recognition = null;
  }
}

type NamedVoice = { name: string; lang: string };

/** Femmes, du français de France vers les autres voix françaises naturelles. */
const FEMALE_FRENCH_NAMES = [
  "google français",
  "google francais",
  "amélie",
  "amelie",
  "audrey",
  "aurélie",
  "aurelie",
  "hortense",
  "julie",
  "denise",
  "virginie",
  "céline",
  "celine",
];

function isFrench(voice: NamedVoice): boolean {
  return voice.lang.toLowerCase().startsWith("fr");
}

/** Préfère une voix de femme. Ne prend pas la première voix fr-FR, souvent Eddy ou Thomas. */
export function preferredFrenchVoice<T extends NamedVoice>(voices: readonly T[]): T | undefined {
  const french = voices.filter(isFrench);
  for (const hint of FEMALE_FRENCH_NAMES) {
    const matches = french.filter((voice) => voice.name.toLowerCase().includes(hint));
    const france = matches.find((voice) => voice.lang.toLowerCase() === "fr-fr");
    if (france) return france;
    if (matches[0]) return matches[0];
  }
  return undefined;
}

function rankedFrenchVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const french = voices.filter(isFrench);
  const preferred = preferredFrenchVoice(french);
  if (!preferred) return french;
  return [preferred, ...french.filter((voice) => voice !== preferred)];
}

function voicesReady(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const current = synth.getVoices();
  if (current.length > 0) return Promise.resolve(current);
  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 600);
  });
}

function speakWithVoice(synth: SpeechSynthesis, text: string, voices: SpeechSynthesisVoice[], index: number) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  const voice = voices[index];
  if (voice) {
    try {
      utterance.voice = voice;
    } catch {
      /* fr-FR sur l’énoncé suffit si cette voix est refusée. */
    }
  }
  utterance.onerror = (event) => {
    if (event.error === "interrupted" || event.error === "canceled") return;
    if (index + 1 < voices.length) speakWithVoice(synth, text, voices, index + 1);
  };
  synth.resume();
  synth.speak(utterance);
}

/** Lecture en français, voix de femme. `interrupt` coupe la phrase en cours, pour Rejouer. */
export function speakFrench(text: string, interrupt = false) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Lecture vocale indisponible dans ce navigateur.");
  }
  const synth = window.speechSynthesis;
  const start = () => {
    void voicesReady(synth).then((voices) => {
      speakWithVoice(synth, text, rankedFrenchVoices(voices), 0);
    });
  };
  if (!interrupt) {
    start();
    return;
  }
  synth.cancel();
  window.setTimeout(start, 50);
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export function speechOutputAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
