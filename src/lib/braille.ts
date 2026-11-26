export type SignGroup = "lettre" | "accent" | "chiffre" | "signe";

export type Sign = {
  dots: number[];
  char: string;
  group: SignGroup;
};

function sign(dots: number[], char: string, group: SignGroup): Sign {
  return { dots: [...dots].sort((a, b) => a - b), char, group };
}

/**
 * Table 8 points relevée sur les fiches (caractère, points, cellule à 8 points).
 * Les majuscules a–z sont la lettre plus le point 7.
 * Les accents minuscules ajoutent en général le point 8, parfois 7 et 8.
 */
export const BRAILLE_SIGNS: Sign[] = [
  sign([1], "a", "lettre"),
  sign([1, 2], "b", "lettre"),
  sign([1, 4], "c", "lettre"),
  sign([1, 4, 5], "d", "lettre"),
  sign([1, 5], "e", "lettre"),
  sign([1, 2, 4], "f", "lettre"),
  sign([1, 2, 4, 5], "g", "lettre"),
  sign([1, 2, 5], "h", "lettre"),
  sign([2, 4], "i", "lettre"),
  sign([2, 4, 5], "j", "lettre"),
  sign([1, 3], "k", "lettre"),
  sign([1, 2, 3], "l", "lettre"),
  sign([1, 3, 4], "m", "lettre"),
  sign([1, 3, 4, 5], "n", "lettre"),
  sign([1, 3, 5], "o", "lettre"),
  sign([1, 2, 3, 4], "p", "lettre"),
  sign([1, 2, 3, 4, 5], "q", "lettre"),
  sign([1, 2, 3, 5], "r", "lettre"),
  sign([2, 3, 4], "s", "lettre"),
  sign([2, 3, 4, 5], "t", "lettre"),
  sign([1, 3, 6], "u", "lettre"),
  sign([1, 2, 3, 6], "v", "lettre"),
  sign([2, 4, 5, 6], "w", "lettre"),
  sign([1, 3, 4, 6], "x", "lettre"),
  sign([1, 3, 4, 5, 6], "y", "lettre"),
  sign([1, 3, 5, 6], "z", "lettre"),
  sign([1, 7], "A", "lettre"),
  sign([1, 2, 7], "B", "lettre"),
  sign([1, 4, 7], "C", "lettre"),
  sign([1, 4, 5, 7], "D", "lettre"),
  sign([1, 5, 7], "E", "lettre"),
  sign([1, 2, 4, 7], "F", "lettre"),
  sign([1, 2, 4, 5, 7], "G", "lettre"),
  sign([1, 2, 5, 7], "H", "lettre"),
  sign([2, 4, 7], "I", "lettre"),
  sign([2, 4, 5, 7], "J", "lettre"),
  sign([1, 3, 7], "K", "lettre"),
  sign([1, 2, 3, 7], "L", "lettre"),
  sign([1, 3, 4, 7], "M", "lettre"),
  sign([1, 3, 4, 5, 7], "N", "lettre"),
  sign([1, 3, 5, 7], "O", "lettre"),
  sign([1, 2, 3, 4, 7], "P", "lettre"),
  sign([1, 2, 3, 4, 5, 7], "Q", "lettre"),
  sign([1, 2, 3, 5, 7], "R", "lettre"),
  sign([2, 3, 4, 7], "S", "lettre"),
  sign([2, 3, 4, 5, 7], "T", "lettre"),
  sign([1, 3, 6, 7], "U", "lettre"),
  sign([1, 2, 3, 6, 7], "V", "lettre"),
  sign([2, 4, 5, 6, 7], "W", "lettre"),
  sign([1, 3, 4, 6, 7], "X", "lettre"),
  sign([1, 3, 4, 5, 6, 7], "Y", "lettre"),
  sign([1, 3, 5, 6, 7], "Z", "lettre"),
  sign([1, 2, 3, 4, 5, 6, 8], "é", "accent"),
  sign([2, 3, 4, 6, 8], "è", "accent"),
  sign([1, 2, 4, 6, 8], "ë", "accent"),
  sign([1, 2, 6, 7, 8], "ê", "accent"),
  sign([1, 2, 3, 5, 6, 8], "à", "accent"),
  sign([1, 6, 7, 8], "â", "accent"),
  sign([2, 3, 4, 5, 6, 8], "ù", "accent"),
  sign([1, 5, 6, 7, 8], "û", "accent"),
  sign([1, 4, 5, 6, 7, 8], "ô", "accent"),
  sign([1, 4, 6, 7, 8], "î", "accent"),
  sign([1, 2, 4, 5, 6, 8], "ï", "accent"),
  sign([1, 2, 3, 4, 6, 7, 8], "ç", "accent"),
  sign([3, 4, 5, 8], "ä", "accent"),
  sign([2, 4, 6, 8], "ö", "accent"),
  sign([1, 2, 5, 6, 8], "ü", "accent"),
  sign([3, 4, 5, 6, 8], "ß", "accent"),
  sign([1, 2, 3, 4, 5, 6, 7], "É", "accent"),
  sign([3, 5, 7, 8], "È", "accent"),
  sign([1, 2, 3, 4, 6, 7], "Ç", "accent"),
  sign([5, 6, 7], "Ä", "accent"),
  sign([3, 5, 8], "Ö", "accent"),
  sign([2, 3, 6, 8], "Ü", "accent"),
  sign([3, 4, 6], "0", "chiffre"),
  sign([1, 6], "1", "chiffre"),
  sign([1, 2, 6], "2", "chiffre"),
  sign([1, 4, 6], "3", "chiffre"),
  sign([1, 4, 5, 6], "4", "chiffre"),
  sign([1, 5, 6], "5", "chiffre"),
  sign([1, 2, 4, 6], "6", "chiffre"),
  sign([1, 2, 4, 5, 6], "7", "chiffre"),
  sign([1, 2, 5, 6], "8", "chiffre"),
  sign([2, 4, 6], "9", "chiffre"),
  sign([3], ".", "signe"),
  sign([2], ",", "signe"),
  sign([2, 3], ";", "signe"),
  sign([2, 5], ":", "signe"),
  sign([2, 6], "?", "signe"),
  sign([5], "!", "signe"),
  sign([4], '"', "signe"),
  sign([6], "'", "signe"),
  sign([2, 3, 6], "(", "signe"),
  sign([3, 5, 6], ")", "signe"),
  sign([1, 2, 3, 5, 6, 7], "[", "signe"),
  sign([2, 3, 4, 5, 6, 7], "]", "signe"),
  sign([1, 2, 3, 5, 6], "{", "signe"),
  sign([2, 3, 4, 5, 6], "}", "signe"),
  sign([4, 5, 7], "€", "signe"),
  sign([3, 4, 5, 6], "#", "signe"),
  sign([3, 4, 5, 7], "@", "signe"),
  sign([4, 6], "$", "signe"),
  sign([1, 2, 3, 4, 6], "&", "signe"),
  sign([3, 4, 7], "\\", "signe"),
  sign([4, 5, 6, 7], "_", "signe"),
  sign([3, 4], "|", "signe"),
  sign([1, 5, 8], "¦", "signe"),
  sign([4, 5, 6, 8], "•", "signe"),
  sign([3, 5], "*", "signe"),
  sign([2, 3, 5], "+", "signe"),
  sign([3, 6], "-", "signe"),
  sign([2, 5, 6], "/", "signe"),
  sign([2, 3, 5, 6], "=", "signe"),
  sign([1, 2, 3, 4, 5, 6], "%", "signe"),
  sign([5, 6], "<", "signe"),
  sign([4, 5], ">", "signe"),
  sign([2, 3, 4, 6, 7], "^", "signe"),
];

const BY_KEY = new Map<string, Sign>();
const BY_CHAR = new Map<string, number[]>();

for (const entry of BRAILLE_SIGNS) {
  const key = entry.dots.join("-");
  if (BY_KEY.has(key)) {
    throw new Error(`Points braille en double : ${key} (${entry.char})`);
  }
  BY_KEY.set(key, entry);
  if (BY_CHAR.has(entry.char)) {
    throw new Error(`Caractère en double : ${entry.char}`);
  }
  BY_CHAR.set(entry.char, entry.dots);
}

BY_CHAR.set("’", BY_CHAR.get("'") ?? []);
BY_CHAR.set("‘", BY_CHAR.get("'") ?? []);

export type ChordHit = {
  char: string;
  dots: number[];
};

/** Accord exact : les points 1 à 8 composent le signe, sans préfixe séparé. */
export function resolveChord(rawDots: number[]): ChordHit | null {
  const unique = [...new Set(rawDots)].filter((dot) => dot >= 1 && dot <= 8).sort((a, b) => a - b);
  if (unique.length === 0) return null;
  const found = BY_KEY.get(unique.join("-"));
  if (!found) return null;
  return { char: found.char, dots: found.dots };
}

export function dotsForChar(char: string): number[] | null {
  return BY_CHAR.get(char) ?? null;
}

/** Positions physiques, rangée d’appui, comme une machine Perkins. */
export const CHORD_KEYS: { code: string; qwerty: string; azerty: string; dot: number }[] = [
  { code: "KeyA", qwerty: "A", azerty: "Q", dot: 7 },
  { code: "KeyS", qwerty: "S", azerty: "S", dot: 3 },
  { code: "KeyD", qwerty: "D", azerty: "D", dot: 2 },
  { code: "KeyF", qwerty: "F", azerty: "F", dot: 1 },
  { code: "KeyJ", qwerty: "J", azerty: "J", dot: 4 },
  { code: "KeyK", qwerty: "K", azerty: "K", dot: 5 },
  { code: "KeyL", qwerty: "L", azerty: "L", dot: 6 },
  { code: "Semicolon", qwerty: ";", azerty: "M", dot: 8 },
];

export const CODE_TO_DOT: Record<string, number> = Object.fromEntries(
  CHORD_KEYS.map((key) => [key.code, key.dot]),
);
