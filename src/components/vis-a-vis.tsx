import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeftRight, ChevronDown, Moon, Sun } from "lucide-react";
import {
  BRAILLE_SIGNS,
  CHORD_KEYS,
  CODE_TO_DOT,
  dotsForChar,
  resolveChord,
} from "@/lib/braille";

type Side = "left" | "right";
type Theme = "dark" | "light";
type Field = "keyboard" | "braille" | null;

type Cell = {
  ch: string;
  dots: number[] | null;
};

type Message = {
  id: number;
  side: Side;
  text: string;
  cells: Cell[] | null;
  at: Date;
};

const LETTER_ROWS: (string | null)[][] = [
  ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
  ["k", "l", "m", "n", "o", "p", "q", "r", "s", "t"],
  ["u", "v", "x", "y", "z", null, null, "w", null, null],
];

const ACCENT_ROWS: (string | null)[][] = [
  [null, null, null, null, null, "ç", "é", "à", "è", "ù"],
  ["â", "ê", "î", "ô", "û", "ë", "ï", "ü", null, null],
  ["ä", null, null, null, "ö", null, null, null, null, "ß"],
  ["Ä", null, null, null, "Ö", "Ç", "É", "Ü", "È", null],
];

const DIGIT_ROWS: (string | null)[][] = [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]];

const SIGN_ROWS: (string | null)[][] = [
  [",", ";", ":", ".", "?", "!", "'", '"', "(", ")"],
  ["[", "]", "{", "}", "<", ">", "*", "+", "-", "/"],
  ["=", "%", "&", "@", "#", "$", "€", "\\", "_", "|"],
  ["^", "•", "¦", null, null, null, null, null, null, null],
];

const CHART: { label: string; rows: (string | null)[][] }[] = [
  { label: "Lettres", rows: LETTER_ROWS },
  { label: "Accents", rows: ACCENT_ROWS },
  { label: "Chiffres", rows: DIGIT_ROWS },
  { label: "Signes", rows: SIGN_ROWS },
];

type EncodeMode = "release" | "press" | "toggle-release" | "toggle-button";

const ENCODE_MODES: { id: EncodeMode; label: string }[] = [
  { id: "release", label: "Encodage quand on relâche les touches" },
  { id: "press", label: "Encodage quand on appuie les touches" },
  { id: "toggle-release", label: "Interrupteurs, encodage au dernier relâchement" },
  { id: "toggle-button", label: "Interrupteurs, encodage au bouton" },
];

const IDLE_HINT: Record<EncodeMode, string> = {
  release: "Maintenez, puis relâchez.",
  press: "L’accord s’écrit à l’appui.",
  "toggle-release": "Relâchez la dernière touche.",
  "toggle-button": "Puis le bouton Encoder.",
};

const PRESS_TEMPOS: { ms: number; label: string }[] = [
  { ms: 0, label: "Immédiat" },
  { ms: 100, label: "1/10 s" },
  { ms: 500, label: "1/2 s" },
  { ms: 1000, label: "1 s" },
];

/** Mode relâchement : écart fixe entre deux touches d’un même geste. Ni réglable, ni affiché. */
const RELEASE_GRACE_MS = 100;
const FRAME_MIN = 480;
const FRAME_DEFAULT = 1040;

function clampFrameWidth(value: number) {
  if (typeof window === "undefined") return value;
  const max = window.innerWidth;
  const min = Math.min(FRAME_MIN, max);
  return Math.round(Math.min(max, Math.max(min, value)));
}

const SIGN_BY_CHAR = new Map(BRAILLE_SIGNS.map((entry) => [entry.char, entry]));

function trimCells(cells: Cell[]): Cell[] {
  let start = 0;
  let end = cells.length;
  while (start < end && cells[start].ch.trim() === "") start += 1;
  while (end > start && cells[end - 1].ch.trim() === "") end -= 1;
  return cells.slice(start, end);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function DotGrid({ dots, large = false, compact = false }: { dots: number[] | null; large?: boolean; compact?: boolean }) {
  const on = new Set(dots ?? []);
  return (
    <span
      className={large ? "grid grid-cols-2 gap-1" : compact ? "grid grid-cols-2 gap-px" : "grid grid-cols-2 gap-0.5"}
      aria-hidden="true"
    >
      {[1, 4, 2, 5, 3, 6, 7, 8].map((dot) => (
        <span
          key={dot}
          className={
            (large ? "size-2 " : compact ? "size-1.5 " : "size-2 ") +
            "rounded-full border " +
            (on.has(dot) ? "border-accent bg-accent" : "border-dot bg-transparent")
          }
        />
      ))}
    </span>
  );
}

function Glyph({ cell }: { cell: Cell }) {
  if (cell.ch === " ") {
    return <span className="inline-block w-3" data-char=" " aria-hidden="true" />;
  }
  return (
    <span className="inline-flex w-7 flex-col items-center gap-1" data-char={cell.ch} aria-hidden="true">
      <DotGrid dots={cell.dots} />
      <span className="font-serif text-base leading-none">{cell.ch}</span>
    </span>
  );
}

export function VisAVis() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [active, setActive] = useState<Field>(null);
  const [lastField, setLastField] = useState<"keyboard" | "braille">("keyboard");
  const [draft, setDraft] = useState("");
  const [cells, setCells] = useState<Cell[]>([]);
  const [cursor, setCursor] = useState(0);
  const [previewDots, setPreviewDots] = useState<number[]>([]);
  const [unknown, setUnknown] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState("");
  const [mode, setMode] = useState<EncodeMode>("release");
  const [tempo, setTempo] = useState(0);
  const [toggleDots, setToggleDots] = useState<number[]>([]);
  const [frameWidth, setFrameWidth] = useState(FRAME_DEFAULT);

  const keyboardRef = useRef<HTMLTextAreaElement>(null);
  const brailleRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const lastFieldRef = useRef<"keyboard" | "braille">("keyboard");
  const cellsRef = useRef<Cell[]>([]);
  const cursorRef = useRef(0);
  const draftRef = useRef("");
  const heldRef = useRef(new Set<string>());
  const chordRef = useRef(new Set<number>());
  const togglesRef = useRef(new Set<number>());
  const gestureRef = useRef<{ index: number; inserted: boolean } | null>(null);
  const modeRef = useRef<EncodeMode>("release");
  const modeTouchedRef = useRef(false);
  const tempoRef = useRef(0);
  const sourceDotRef = useRef(new Map<string, number>());
  const graceRef = useRef(new Map<number, number>());
  const pressTimerRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const pressCommittedRef = useRef(false);
  const idRef = useRef(1);
  const unknownTimer = useRef<number | null>(null);

  function commit(next: Cell[], nextCursor: number) {
    cellsRef.current = next;
    cursorRef.current = nextCursor;
    setCells(next);
    setCursor(nextCursor);
  }

  function updateDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
  }

  function insertCells(added: Cell[]) {
    if (added.length === 0) return;
    const current = cellsRef.current;
    const index = cursorRef.current;
    commit([...current.slice(0, index), ...added, ...current.slice(index)], index + added.length);
  }

  function insertFromChart(char: string) {
    const sign = SIGN_BY_CHAR.get(char);
    if (!sign) return;
    insertCells([{ ch: sign.char, dots: sign.dots }]);
    brailleRef.current?.focus();
  }

  function backspace() {
    const index = cursorRef.current;
    if (index === 0) return;
    const current = cellsRef.current;
    commit([...current.slice(0, index - 1), ...current.slice(index)], index - 1);
  }

  function delForward() {
    const index = cursorRef.current;
    const current = cellsRef.current;
    if (index >= current.length) return;
    commit([...current.slice(0, index), ...current.slice(index + 1)], index);
  }

  function move(delta: number) {
    const next = Math.max(0, Math.min(cellsRef.current.length, cursorRef.current + delta));
    commit(cellsRef.current, next);
  }

  function pushMessage(side: Side, text: string, braille: Cell[] | null) {
    const id = idRef.current;
    idRef.current += 1;
    setMessages((prev) => [...prev, { id, side, text, cells: braille, at: new Date() }]);
    setLive(side === "left" ? `Message clavier envoyé. ${text}` : `Message braille envoyé. ${text}`);
  }

  function sendKeyboard() {
    const text = draftRef.current.trim();
    if (!text) return;
    pushMessage("left", text, null);
    updateDraft("");
    keyboardRef.current?.focus();
  }

  function sendBraille() {
    const trimmed = trimCells(cellsRef.current);
    if (trimmed.length === 0) return;
    pushMessage("right", trimmed.map((cell) => cell.ch).join(""), trimmed);
    commit([], 0);
    brailleRef.current?.focus();
  }

  function flashUnknown() {
    setUnknown(true);
    setLive("Accord inconnu.");
    if (unknownTimer.current) window.clearTimeout(unknownTimer.current);
    unknownTimer.current = window.setTimeout(() => setUnknown(false), 900);
  }

  function insertText(text: string) {
    const added: Cell[] = [];
    for (const ch of text) {
      if (ch === "\r") continue;
      if (ch === "\n" || ch === "\t" || ch === " ") {
        added.push({ ch: " ", dots: null });
        continue;
      }
      added.push({ ch, dots: dotsForChar(ch) });
    }
    insertCells(added);
  }

  const apiRef = useRef({
    setPreview: setPreviewDots,
    insertChord(hit: { char: string; dots: number[] }) {
      setUnknown(false);
      insertCells([{ ch: hit.char, dots: hit.dots }]);
    },
    insertSpace() {
      insertCells([{ ch: " ", dots: null }]);
    },
    insertText,
    backspace,
    delForward,
    move,
    sendBraille,
    flashUnknown,
  });
  apiRef.current = {
    setPreview: setPreviewDots,
    insertChord(hit) {
      setUnknown(false);
      insertCells([{ ch: hit.char, dots: hit.dots }]);
    },
    insertSpace() {
      insertCells([{ ch: " ", dots: null }]);
    },
    insertText,
    backspace,
    delForward,
    move,
    sendBraille,
    flashUnknown,
  };

  function sortedDots(source: Set<number>): number[] {
    return [...source].sort((a, b) => a - b);
  }

  function clearPressTimer() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function clearReleaseTimer() {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }

  /** Les touches relâchées à moins d’un dixième de seconde l’une de l’autre restent dans l’accord. */
  function flushStaleRelease(now: number) {
    let latest = 0;
    for (const at of graceRef.current.values()) latest = Math.max(latest, at);
    if (latest === 0 || now - latest <= RELEASE_GRACE_MS) return;
    for (const dot of graceRef.current.keys()) chordRef.current.delete(dot);
    graceRef.current.clear();
    clearReleaseTimer();
  }

  function chordAfterGroupedRelease(now: number): number[] {
    flushStaleRelease(now);
    return sortedDots(chordRef.current);
  }

  function scheduleReleaseGrace() {
    clearReleaseTimer();
    if (graceRef.current.size === 0) return;
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      if (modeRef.current !== "release") return;
      for (const dot of graceRef.current.keys()) {
        if (!dotStillHeld(dot)) chordRef.current.delete(dot);
      }
      graceRef.current.clear();
      if (chordStillHeld()) paint(sortedDots(chordRef.current));
    }, RELEASE_GRACE_MS);
  }

  function notePartialRelease(dot: number) {
    const now = Date.now();
    flushStaleRelease(now);
    graceRef.current.set(dot, now);
    scheduleReleaseGrace();
  }

  function publishToggles() {
    const dots = sortedDots(togglesRef.current);
    setToggleDots(dots);
    return dots;
  }

  function paint(dots: number[]) {
    if (modeRef.current !== "toggle-button") {
      setPreviewDots(dots);
      return;
    }
    const merged = new Set<number>([...togglesRef.current, ...dots]);
    setPreviewDots([...merged].sort((a, b) => a - b));
  }

  function commitChord(dots: number[]) {
    const hit = resolveChord(dots);
    if (hit) {
      setUnknown(false);
      insertCells([{ ch: hit.char, dots: hit.dots }]);
      return;
    }
    if (dots.length > 0) flashUnknown();
  }

  function chordStillHeld(): boolean {
    for (const id of heldRef.current) {
      if (modeRef.current === "toggle-button" && id.startsWith("ptr-")) continue;
      return true;
    }
    return false;
  }

  function dotStillHeld(dot: number): boolean {
    for (const [id, value] of sourceDotRef.current) {
      if (value === dot && heldRef.current.has(id)) return true;
    }
    return false;
  }

  function armPress() {
    if (tempoRef.current === 0) {
      applyProvisional(resolveChord(sortedDots(chordRef.current)));
      return;
    }
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      if (modeRef.current !== "press" || pressCommittedRef.current) return;
      pressCommittedRef.current = true;
      gestureRef.current = null;
      commitChord(sortedDots(chordRef.current));
    }, tempoRef.current);
  }

  function applyProvisional(hit: { char: string; dots: number[] } | null) {
    const gesture = gestureRef.current;
    if (!gesture) {
      if (hit) {
        const index = cursorRef.current;
        insertCells([{ ch: hit.char, dots: hit.dots }]);
        gestureRef.current = { index, inserted: true };
      } else {
        gestureRef.current = { index: cursorRef.current, inserted: false };
      }
      return;
    }
    if (gesture.inserted && hit) {
      const next = cellsRef.current.slice();
      next[gesture.index] = { ch: hit.char, dots: hit.dots };
      commit(next, gesture.index + 1);
    } else if (gesture.inserted && !hit) {
      commit(
        [...cellsRef.current.slice(0, gesture.index), ...cellsRef.current.slice(gesture.index + 1)],
        gesture.index,
      );
      gesture.inserted = false;
    } else if (!gesture.inserted && hit) {
      const index = gesture.index;
      const current = cellsRef.current;
      commit(
        [...current.slice(0, index), { ch: hit.char, dots: hit.dots }, ...current.slice(index)],
        index + 1,
      );
      gesture.inserted = true;
    }
  }

  function pressSource(id: string, dot: number) {
    if (heldRef.current.has(id)) return;
    heldRef.current.add(id);
    sourceDotRef.current.set(id, dot);
    const current = modeRef.current;

    if (current === "toggle-button") {
      if (togglesRef.current.has(dot)) togglesRef.current.delete(dot);
      else togglesRef.current.add(dot);
      publishToggles();
      paint([]);
      return;
    }

    if (current === "toggle-release") {
      if (togglesRef.current.has(dot)) togglesRef.current.delete(dot);
      else togglesRef.current.add(dot);
      setPreviewDots(sortedDots(togglesRef.current));
      return;
    }

    if (current === "press" && tempoRef.current > 0 && pressCommittedRef.current) return;

    graceRef.current.delete(dot);
    chordRef.current.add(dot);
    paint(sortedDots(chordRef.current));
    if (current === "release") scheduleReleaseGrace();
    if (current === "press") armPress();
  }

  function releaseSource(id: string) {
    if (!heldRef.current.has(id)) return;
    const dot = sourceDotRef.current.get(id);
    heldRef.current.delete(id);
    sourceDotRef.current.delete(id);
    const current = modeRef.current;

    if (current === "toggle-button") {
      paint([]);
      return;
    }

    if (current === "toggle-release") {
      if (chordStillHeld()) {
        setPreviewDots(sortedDots(togglesRef.current));
        return;
      }
      const dots = sortedDots(togglesRef.current);
      togglesRef.current.clear();
      setPreviewDots([]);
      commitChord(dots);
      return;
    }

    if (current === "press") {
      if (chordStillHeld()) {
        paint(sortedDots(chordRef.current));
        return;
      }
      clearPressTimer();
      const dots = sortedDots(chordRef.current);
      const committed = pressCommittedRef.current;
      const gesture = gestureRef.current;
      pressCommittedRef.current = false;
      gestureRef.current = null;
      chordRef.current.clear();
      graceRef.current.clear();
      setPreviewDots([]);
      if (tempoRef.current === 0) {
        if (gesture && !gesture.inserted && dots.length > 0) flashUnknown();
      } else if (!committed) commitChord(dots);
      return;
    }

    if (chordStillHeld()) {
      if (dot !== undefined && !dotStillHeld(dot)) notePartialRelease(dot);
      paint(sortedDots(chordRef.current));
      return;
    }

    clearReleaseTimer();
    const list = chordAfterGroupedRelease(Date.now());
    chordRef.current.clear();
    graceRef.current.clear();
    setPreviewDots([]);
    commitChord(list);
  }

  function encodeToggles() {
    const dots = sortedDots(togglesRef.current);
    if (dots.length === 0) return;
    const hit = resolveChord(dots);
    if (!hit) {
      flashUnknown();
      return;
    }
    togglesRef.current.clear();
    publishToggles();
    paint([]);
    setUnknown(false);
    insertCells([{ ch: hit.char, dots: hit.dots }]);
    brailleRef.current?.focus();
  }

  function cancelGesture() {
    clearPressTimer();
    clearReleaseTimer();
    heldRef.current.clear();
    sourceDotRef.current.clear();
    graceRef.current.clear();
    gestureRef.current = null;
    pressCommittedRef.current = false;
    chordRef.current.clear();
    if (modeRef.current === "toggle-button") {
      paint([]);
      return;
    }
    togglesRef.current.clear();
    setToggleDots([]);
    setPreviewDots([]);
  }

  function changeMode(next: EncodeMode) {
    modeTouchedRef.current = true;
    modeRef.current = next;
    setMode(next);
    cancelGesture();
    togglesRef.current.clear();
    setToggleDots([]);
    setPreviewDots([]);
    setUnknown(false);
  }

  function changeTempo(ms: number) {
    tempoRef.current = ms;
    setTempo(ms);
  }

  const handlersRef = useRef({
    onKeyDown(_event: KeyboardEvent) {},
    onKeyUp(_event: KeyboardEvent) {},
    cancel() {},
  });
  handlersRef.current = {
    onKeyDown(event: KeyboardEvent) {
      if (!focusedRef.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const dot = CODE_TO_DOT[event.code];
      if (dot) {
        event.preventDefault();
        if (event.repeat || heldRef.current.has(event.code)) return;
        pressSource(event.code, dot);
        return;
      }
      const chording = heldRef.current.size > 0;
      if (event.code === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (!chording) sendBraille();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (!chording) insertCells([{ ch: " ", dots: null }]);
        return;
      }
      if (event.code === "Backspace") {
        event.preventDefault();
        if (!chording) backspace();
        return;
      }
      if (event.code === "Delete") {
        event.preventDefault();
        if (!chording) delForward();
        return;
      }
      if (event.code === "ArrowLeft" || event.code === "Home") {
        event.preventDefault();
        if (!chording) move(event.code === "Home" ? -1e9 : -1);
        return;
      }
      if (event.code === "ArrowRight" || event.code === "End") {
        event.preventDefault();
        if (!chording) move(event.code === "End" ? 1e9 : 1);
      }
    },
    onKeyUp(event: KeyboardEvent) {
      if (!CODE_TO_DOT[event.code] || !heldRef.current.has(event.code)) return;
      event.preventDefault();
      releaseSource(event.code);
    },
    cancel() {
      cancelGesture();
    },
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onResize = () => setFrameWidth((current) => clampFrameWidth(current));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function startResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const pointerId = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(pointerId);
    } catch {
      /* pointeur synthétique */
    }
    const startX = event.clientX;
    const startWidth = frameRef.current?.getBoundingClientRect().width ?? frameWidth;
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const delta = pointerEvent.clientX - startX;
      const next = side === "right" ? startWidth + delta * 2 : startWidth - delta * 2;
      setFrameWidth(clampFrameWidth(next));
    };
    const end = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function nudgeFrame(side: "left" | "right", event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const outward = side === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
    setFrameWidth((current) => clampFrameWidth(current + (outward ? step : -step)));
  }

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const caret = caretRef.current;
    const field = brailleRef.current;
    if (!caret || !field) return;
    const caretRect = caret.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    if (caretRect.right > fieldRect.right) field.scrollLeft += caretRect.right - fieldRect.right + 8;
    else if (caretRect.left < fieldRect.left) field.scrollLeft -= fieldRect.left - caretRect.left + 8;
    if (caretRect.bottom > fieldRect.bottom) field.scrollTop += caretRect.bottom - fieldRect.bottom + 8;
    else if (caretRect.top < fieldRect.top) field.scrollTop -= fieldRect.top - caretRect.top + 8;
  }, [cursor, cells]);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 767px)");
    const touch = window.matchMedia("(pointer: coarse) and (max-width: 1024px)");
    const apply = () => {
      if (modeTouchedRef.current) return;
      const next: EncodeMode = narrow.matches || touch.matches ? "toggle-button" : "release";
      modeRef.current = next;
      setMode(next);
    };
    apply();
    narrow.addEventListener("change", apply);
    touch.addEventListener("change", apply);
    return () => {
      narrow.removeEventListener("change", apply);
      touch.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handlersRef.current.onKeyDown(event);
    }
    function onKeyUp(event: KeyboardEvent) {
      handlersRef.current.onKeyUp(event);
    }
    function onPaste(event: ClipboardEvent) {
      if (!focusedRef.current) return;
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      apiRef.current.insertText(text);
    }
    function onWindowBlur() {
      handlersRef.current.cancel();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("blur", onWindowBlur);
      if (unknownTimer.current) window.clearTimeout(unknownTimer.current);
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  function remember(field: "keyboard" | "braille") {
    lastFieldRef.current = field;
    setLastField(field);
  }

  function toggleFocus() {
    if (lastFieldRef.current === "braille") keyboardRef.current?.focus();
    else brailleRef.current?.focus();
  }

  function placeCursor(index: number) {
    commit(cellsRef.current, index);
    brailleRef.current?.focus();
  }

  const pending = previewDots.length > 0 ? resolveChord(previewDots) : null;
  const tempoLabel = PRESS_TEMPOS.find((entry) => entry.ms === tempo)?.label ?? "Immédiat";
  const keyboardChord = mode === "toggle-button" && previewDots.some((dot) => !toggleDots.includes(dot));
  const status = unknown
    ? "Accord inconnu."
    : previewDots.length === 0
      ? IDLE_HINT[mode]
      : !pending
        ? "Aucun signe."
        : mode === "toggle-button" && !keyboardChord
          ? "Encodez."
          : mode === "press"
            ? tempo === 0
              ? "À l’appui."
              : `Tempo ${tempoLabel}.`
            : `Relâchez : ${pending.char}`;
  const brailleBlank = trimCells(cells).length === 0;
  const keyboardBlank = draft.trim() === "";

  return (
    <div className="flex h-dvh justify-center overflow-hidden bg-bg">
      <div
        ref={frameRef}
        style={{ "--vv-frame": `${frameWidth}px` } as CSSProperties}
        className="relative flex h-full w-full max-w-full flex-col overflow-hidden bg-bg font-sans text-fg md:w-(--vv-frame)"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Bord gauche"
          aria-valuemin={FRAME_MIN}
          aria-valuenow={frameWidth}
          tabIndex={0}
          data-testid="frame-left"
          onPointerDown={(event) => startResize("left", event)}
          onKeyDown={(event) => nudgeFrame("left", event)}
          className="absolute inset-y-0 left-0 z-30 hidden w-3 cursor-ew-resize touch-none md:block"
        >
          <span className="vv-edge pointer-events-none absolute inset-y-0 left-0 w-[3px]" />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Bord droit"
          aria-valuemin={FRAME_MIN}
          aria-valuenow={frameWidth}
          tabIndex={0}
          data-testid="frame-right"
          onPointerDown={(event) => startResize("right", event)}
          onKeyDown={(event) => nudgeFrame("right", event)}
          className="absolute inset-y-0 right-0 z-30 hidden w-3 cursor-ew-resize touch-none md:block"
        >
          <span className="vv-edge pointer-events-none absolute inset-y-0 right-0 w-[3px]" />
        </div>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex shrink-0 rounded-lg border border-border bg-surface p-2" aria-hidden="true">
            <DotGrid dots={[1, 2, 3, 6]} />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl leading-none">Vis-à-vis</h1>
            <p className="mt-1 text-sm leading-snug text-muted">Conversation locale, sans mémoire.</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="toggle-theme"
          aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg"
        >
          {theme === "dark" ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
        </button>
      </header>

      <div ref={logRef} data-testid="log" className="flex min-h-40 flex-1 flex-col overflow-y-auto">
        <div className="mt-auto flex flex-col gap-4 px-4 py-6">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-md py-8 text-center">
              <p className="font-serif text-xl">Rien pour l’instant</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Le clavier pose ses messages à gauche. Le braille, à droite. Rien n’est enregistré : un
                rechargement efface la conversation.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                data-testid="message"
                data-side={message.side}
                data-text={message.text}
                className={
                  "vv-msg flex w-full " + (message.side === "left" ? "justify-start" : "justify-end")
                }
              >
                <div className="w-fit max-w-full">
                  <div
                    className={
                      "mb-1 flex items-baseline gap-2 " +
                      (message.side === "right" ? "justify-end" : "justify-start")
                    }
                  >
                    <span className="text-xs font-medium tracking-wide text-muted uppercase">
                      {message.side === "left" ? "Clavier" : "Braille"}
                    </span>
                    <time className="text-xs text-muted" dateTime={message.at.toISOString()}>
                      {formatTime(message.at)}
                    </time>
                  </div>
                  <div
                    className={
                      "rounded-2xl border px-3 py-2 " +
                      (message.side === "right"
                        ? "border-accent bg-bubble-right"
                        : "border-border bg-surface")
                    }
                  >
                    {message.side === "right" && message.cells ? (
                      <>
                        <span className="sr-only">{message.text}</span>
                        <div className="flex flex-wrap items-end gap-x-1 gap-y-2">
                          {message.cells.map((cell, index) => (
                            <Glyph key={index} cell={cell} />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="font-serif text-base leading-relaxed wrap-break-word whitespace-pre-wrap">
                        {message.text}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="max-h-[68dvh] shrink-0 overflow-y-auto border-t border-border">
        <div className="px-4 pt-3 pb-3">
        <button
          type="button"
          data-testid="toggle-focus"
          onClick={toggleFocus}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg"
        >
          <ArrowLeftRight className="size-5" aria-hidden="true" />
          {lastField === "braille" ? "Basculer vers le clavier" : "Basculer vers le braille"}
        </button>

        <div className="mt-3 grid grid-cols-2 items-stretch gap-3">
          <section
            className={
              "flex min-w-0 flex-col gap-2 rounded-xl border-2 bg-surface p-2 " +
              (active === "keyboard" ? "border-accent" : "border-border")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Clavier</h2>
              {active === "keyboard" ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">
                  Actif
                </span>
              ) : (
                <span className="text-xs text-muted">à gauche</span>
              )}
            </div>
            <textarea
              ref={keyboardRef}
              data-testid="keyboard-input"
              value={draft}
              rows={2}
              aria-label="Saisie clavier"
              placeholder="Écrire au clavier…"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => updateDraft(event.target.value)}
              onFocus={() => {
                remember("keyboard");
                setActive("keyboard");
              }}
              onBlur={() => setActive((current) => (current === "keyboard" ? null : current))}
              onKeyDown={(event) => {
                if (
                  (event.key === "Enter" || event.code === "NumpadEnter") &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  sendKeyboard();
                }
              }}
              className="min-h-16 w-full resize-none bg-transparent font-serif text-base leading-relaxed text-fg outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendKeyboard}
              disabled={keyboardBlank}
              className="mt-auto h-11 rounded-lg border border-border text-sm font-medium"
            >
              Envoyer
            </button>
          </section>

          <section
            className={
              "flex min-w-0 flex-col gap-2 rounded-xl border-2 bg-surface p-2 " +
              (active === "braille" ? "border-accent" : "border-border")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Braille</h2>
              {active === "braille" ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">
                  Actif
                </span>
              ) : (
                <span className="text-xs text-muted">à droite</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DotGrid dots={previewDots} large />
              <p
                data-testid="braille-status"
                className={"min-w-0 flex-1 text-xs leading-snug " + (unknown ? "text-fg" : "text-muted")}
              >
                <span className="font-serif text-lg leading-none text-fg">
                  {pending ? pending.char : "·"}
                </span>
                <span className="mt-1 block">{status}</span>
              </p>
            </div>
            <div
              ref={brailleRef}
              data-testid="braille-input"
              role="textbox"
              aria-multiline="false"
              aria-label="Saisie braille par accords"
              tabIndex={0}
              onFocus={() => {
                focusedRef.current = true;
                remember("braille");
                setActive("braille");
              }}
              onBlur={(event) => {
                const next = event.relatedTarget as HTMLElement | null;
                if (next?.closest("[data-chord-control]")) return;
                focusedRef.current = false;
                cancelGesture();
                setActive((current) => (current === "braille" ? null : current));
              }}
              onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("[data-glyph]")) return;
                event.preventDefault();
                placeCursor(cellsRef.current.length);
              }}
              className="max-h-28 min-h-16 overflow-auto rounded-lg outline-none"
            >
              <div className="flex min-h-16 flex-wrap items-end gap-x-1 gap-y-2">
                {cells.length === 0 && cursor === 0 ? (
                  <span className="vv-caret" ref={caretRef} aria-hidden="true" />
                ) : null}
                {cells.length === 0 ? (
                  <span className="font-serif text-base text-muted">Accord braille…</span>
                ) : null}
                {cells.map((cell, index) => (
                  <span key={index} className="inline-flex items-end">
                    {cursor === index ? <span className="vv-caret" ref={caretRef} aria-hidden="true" /> : null}
                    <span
                      data-glyph
                      data-char={cell.ch}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        const after = event.clientX >= rect.left + rect.width / 2;
                        placeCursor(after ? index + 1 : index);
                      }}
                    >
                      <Glyph cell={cell} />
                    </span>
                  </span>
                ))}
                {cells.length > 0 && cursor === cells.length ? (
                  <span className="vv-caret" ref={caretRef} aria-hidden="true" />
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendBraille}
              disabled={brailleBlank}
              className="mt-auto h-11 rounded-lg border border-border text-sm font-medium"
            >
              Envoyer
            </button>
          </section>
        </div>

        <div className={"mt-3 grid gap-2 " + (mode === "press" ? "sm:grid-cols-2" : "")}>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Mode braille</span>
            <select
              data-testid="braille-mode"
              value={mode}
              onChange={(event) => changeMode(event.target.value as EncodeMode)}
              className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-fg"
            >
              {ENCODE_MODES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {mode === "press" ? (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Tempo d’appui</span>
              <select
                data-testid="braille-tempo"
                value={tempo}
                onChange={(event) => changeTempo(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-fg"
              >
                {PRESS_TEMPOS.map((entry) => (
                  <option key={entry.ms} value={entry.ms}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 sm:mx-auto sm:max-w-md sm:grid-cols-8">
          {CHORD_KEYS.map((key) => (
            <button
              key={key.code}
              type="button"
              tabIndex={-1}
              data-chord-control
              data-testid={`dot-${key.dot}`}
              data-down={previewDots.includes(key.dot) ? "1" : "0"}
              aria-pressed={previewDots.includes(key.dot)}
              aria-label={`Point ${key.dot}`}
              disabled={mode !== "toggle-button"}
              onPointerDown={(event) => {
                if (mode !== "toggle-button") return;
                event.preventDefault();
                brailleRef.current?.focus();
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  /* événement non capturable */
                }
                pressSource(`ptr-${event.pointerId}`, key.dot);
              }}
              onPointerUp={(event) => releaseSource(`ptr-${event.pointerId}`)}
              onPointerCancel={(event) => releaseSource(`ptr-${event.pointerId}`)}
              className="flex h-11 touch-none flex-col items-center justify-center rounded-lg border border-border bg-bg select-none data-[down=1]:border-accent disabled:opacity-70"
            >
              <span className="text-sm leading-none font-medium">{key.qwerty}</span>
              <span className="mt-1 text-xs text-muted">{key.dot}</span>
            </button>
          ))}
        </div>
        {mode === "toggle-button" ? (
          <button
            type="button"
            data-chord-control
            data-testid="braille-encode"
            onMouseDown={(event) => event.preventDefault()}
            onClick={encodeToggles}
            disabled={toggleDots.length === 0}
            className="mt-2 h-11 w-full rounded-lg bg-accent text-sm font-semibold text-accent-fg"
          >
            Encoder
          </button>
        ) : null}
        <p className="mt-2 text-xs leading-snug text-muted">
          Les points à l'écran ne se touchent qu'en mode interrupteurs au bouton. Point 7 : majuscule. Point 8 : accents et signes. AZERTY : Q S D F et J K L M.
        </p>
        </div>

        <details className="group border-t border-border">
          <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            Tableau braille, 8 points
            <ChevronDown className="size-4 text-muted group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {CHART.map((section) => (
              <section key={section.label}>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{section.label}</h3>
                <div className="grid grid-cols-10 gap-0.5 sm:gap-1">
                  {section.rows.flat().map((char, index) =>
                    char ? (
                      <button
                        key={`${section.label}-${index}`}
                        type="button"
                        data-chart-char={char}
                        title={`Points ${SIGN_BY_CHAR.get(char)?.dots.join("-") ?? ""}`}
                        aria-label={`Insérer ${char}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertFromChart(char)}
                        className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border bg-surface py-1 hover:border-accent"
                      >
                        <DotGrid dots={SIGN_BY_CHAR.get(char)?.dots ?? []} compact />
                        <span className="font-serif text-sm leading-none">{char}</span>
                      </button>
                    ) : (
                      <span key={`${section.label}-vide-${index}`} aria-hidden="true" />
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </details>
      </div>
      </div>
    </div>
  );
}
