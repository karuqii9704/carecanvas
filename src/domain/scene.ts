import type { CareJob } from "@/domain/job";

/**
 * Deterministic illustrator for the `demo` and `harness` profiles.
 *
 * Instead of returning one fixed picture, the image stage reads the direction
 * and composes a scene from a closed vocabulary: subject, held object, setting,
 * palette, and mood. Every field is an enum, so no user text ever reaches the
 * SVG and the output can never contain readable lettering.
 */

export const sceneSubjects = [
  "red-panda",
  "panda",
  "fox",
  "bear",
  "cat",
  "dog",
  "rabbit",
  "owl",
  "turtle",
  "penguin",
  "elephant",
  "lion",
  "frog",
  "mouse",
  "koala",
  "friend",
] as const;
export const sceneObjects = ["emotion-card", "book", "balloon", "flower", "star", "heart", "ball", "none"] as const;
export const sceneSettings = ["reading-nook", "garden", "classroom", "night", "beach", "forest"] as const;
export const scenePalettes = ["warm", "cool", "pastel", "sunny"] as const;
export const sceneMoods = ["calm", "happy", "sleepy", "curious"] as const;
export const sceneModes = ["img2img", "inpaint"] as const;
export const sceneVariants = ["clean", "micro-text"] as const;

export type SceneSubject = (typeof sceneSubjects)[number];
export type SceneObject = (typeof sceneObjects)[number];
export type SceneSetting = (typeof sceneSettings)[number];
export type ScenePalette = (typeof scenePalettes)[number];
export type SceneMood = (typeof sceneMoods)[number];
export type SceneMode = (typeof sceneModes)[number];
export type SceneVariant = (typeof sceneVariants)[number];

export type SceneSpec = {
  subject: SceneSubject;
  object: SceneObject;
  setting: SceneSetting;
  palette: ScenePalette;
  mood: SceneMood;
  mode: SceneMode;
  variant: SceneVariant;
};

type Vocabulary<T extends string> = ReadonlyArray<readonly [T, readonly string[]]>;

const subjectWords: Vocabulary<SceneSubject> = [
  ["red-panda", ["red panda", "panda merah"]],
  ["panda", ["panda", "giant panda"]],
  ["fox", ["fox", "rubah"]],
  ["bear", ["bear", "teddy", "beruang"]],
  ["cat", ["cat", "kitten", "kitty", "kucing"]],
  ["dog", ["dog", "puppy", "puppies", "anjing"]],
  ["rabbit", ["rabbit", "bunny", "bunnies", "hare", "kelinci"]],
  ["owl", ["owl", "burung hantu"]],
  ["turtle", ["turtle", "tortoise", "kura-kura", "penyu"]],
  ["penguin", ["penguin"]],
  ["elephant", ["elephant", "gajah"]],
  ["lion", ["lion", "singa"]],
  ["frog", ["frog", "katak", "kodok"]],
  ["mouse", ["mouse", "mice", "tikus"]],
  ["koala", ["koala"]],
];

const objectWords: Vocabulary<SceneObject> = [
  ["emotion-card", ["emotion card", "feelings card", "feeling card", "card", "kartu"]],
  ["book", ["book", "storybook", "buku"]],
  ["balloon", ["balloon", "balon"]],
  ["flower", ["flower", "sunflower", "daisy", "bunga"]],
  ["star", ["star", "bintang"]],
  ["heart", ["heart"]],
  ["ball", ["ball", "bola"]],
];

const settingWords: Vocabulary<SceneSetting> = [
  ["reading-nook", ["reading nook", "nook", "library", "living room", "armchair", "sofa", "pojok baca", "perpustakaan"]],
  ["garden", ["garden", "park", "meadow", "playground", "outdoors", "taman", "kebun"]],
  ["classroom", ["classroom", "school", "class", "kelas", "sekolah"]],
  ["night", ["night", "bedtime", "moon", "starry", "bedroom", "malam", "kamar tidur", "bulan"]],
  ["beach", ["beach", "seaside", "ocean", "sea", "pantai", "laut"]],
  ["forest", ["forest", "woods", "woodland", "jungle", "hutan"]],
];

const paletteWords: Vocabulary<ScenePalette> = [
  ["cool", ["blue", "cool", "biru", "sejuk"]],
  ["pastel", ["pastel", "lilac", "pink", "lembut"]],
  ["sunny", ["sunny", "bright", "yellow", "golden", "cerah", "kuning"]],
  ["warm", ["terracotta", "warm", "orange", "hangat"]],
];

const moodWords: Vocabulary<SceneMood> = [
  ["sleepy", ["sleepy", "asleep", "sleep", "bedtime", "tired", "resting", "mengantuk", "tidur"]],
  ["happy", ["happy", "joy", "joyful", "cheerful", "smiling", "smile", "excited", "gembira", "senang", "bahagia"]],
  ["curious", ["curious", "wonder", "wondering", "exploring", "explore", "penasaran"]],
  ["calm", ["calm", "peaceful", "gentle", "relaxed", "tenang"]],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp>();

function wordPattern(word: string): RegExp {
  let pattern = patternCache.get(word);
  if (!pattern) {
    // Whole words only, with an optional plural, so "star" never matches "start".
    pattern = new RegExp(`(?<!\\p{L})${escapeRegExp(word)}(?:e?s)?(?!\\p{L})`, "iu");
    patternCache.set(word, pattern);
  }
  return pattern;
}

/** The earliest mention wins; on a tie the longer phrase wins ("red panda" over "panda"). */
function firstMention<T extends string>(text: string, vocabulary: Vocabulary<T>): T | undefined {
  let best: { value: T; index: number; length: number } | undefined;
  for (const [value, words] of vocabulary) {
    for (const word of words) {
      const match = wordPattern(word).exec(text);
      if (!match) continue;
      if (!best || match.index < best.index || (match.index === best.index && word.length > best.length)) {
        best = { value, index: match.index, length: word.length };
      }
    }
  }
  return best?.value;
}

type SceneSource = Pick<CareJob, "prompt" | "mode" | "simulateFirstQaFailure"> & {
  sceneBrief?: Pick<NonNullable<CareJob["sceneBrief"]>, "refinedPrompt">;
};

/**
 * Reads the person's own direction first and only falls back to the agent's
 * refined brief, so a model cannot swap the subject the person asked for.
 */
export function deriveSceneSpec(job: SceneSource, attempt: number): SceneSpec {
  const direction = job.prompt;
  const brief = job.sceneBrief?.refinedPrompt ?? "";
  const pick = <T extends string>(vocabulary: Vocabulary<T>, fallback: T, useBrief = true): T =>
    firstMention(direction, vocabulary) ?? (useBrief ? firstMention(brief, vocabulary) : undefined) ?? fallback;

  const inpaint = job.mode === "inpaint";
  return {
    subject: pick(subjectWords, "friend"),
    object: pick(objectWords, "none"),
    // Inpainting may only change the masked region, so the source room and palette stay.
    setting: inpaint ? "reading-nook" : pick(settingWords, "reading-nook"),
    palette: inpaint ? "warm" : pick(paletteWords, "warm", false),
    mood: pick(moodWords, "calm"),
    mode: job.mode,
    variant: job.simulateFirstQaFailure && attempt === 1 ? "micro-text" : "clean",
  };
}

const SCENE_PREFIX = "/api/scene/";
const specKeys = ["subject", "object", "setting", "palette", "mood", "mode", "variant"] as const;
const specDomains: Record<(typeof specKeys)[number], readonly string[]> = {
  subject: sceneSubjects,
  object: sceneObjects,
  setting: sceneSettings,
  palette: scenePalettes,
  mood: sceneMoods,
  mode: sceneModes,
  variant: sceneVariants,
};

export function sceneUrl(spec: SceneSpec): string {
  return `${SCENE_PREFIX}${specKeys.map((key) => spec[key]).join("~")}.svg`;
}

export function isSceneUrl(value: string): boolean {
  return value.startsWith(SCENE_PREFIX);
}

/** Accepts either the bare slug ("fox~book~…~clean.svg") or the full `/api/scene/…` path. */
export function parseSceneSlug(value: string): SceneSpec | null {
  const slug = (isSceneUrl(value) ? value.slice(SCENE_PREFIX.length) : value).replace(/\.svg$/, "");
  const parts = slug.split("~");
  if (parts.length !== specKeys.length) return null;
  const spec: Record<string, string> = {};
  for (const [index, key] of specKeys.entries()) {
    const part = parts[index] ?? "";
    if (!specDomains[key].includes(part)) return null;
    spec[key] = part;
  }
  return spec as SceneSpec;
}

const subjectLabels: Record<SceneSubject, string> = {
  "red-panda": "red panda",
  panda: "panda",
  fox: "fox",
  bear: "bear",
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  owl: "owl",
  turtle: "turtle",
  penguin: "penguin",
  elephant: "elephant",
  lion: "lion",
  frog: "frog",
  mouse: "mouse",
  koala: "koala",
  friend: "friendly character",
};

const objectLabels: Record<SceneObject, string> = {
  "emotion-card": "a blank emotion card",
  book: "an open book",
  balloon: "a balloon",
  flower: "a flower",
  star: "a star",
  heart: "a heart",
  ball: "a ball",
  none: "nothing in its paws",
};

const settingLabels: Record<SceneSetting, string> = {
  "reading-nook": "in a quiet reading nook",
  garden: "in a sunny garden",
  classroom: "in a calm classroom",
  night: "in a moonlit bedroom",
  beach: "on a gentle beach",
  forest: "in a friendly forest",
};

export function describeScene(spec: SceneSpec): string {
  return `A ${spec.mood} ${subjectLabels[spec.subject]} holding ${objectLabels[spec.object]} ${settingLabels[spec.setting]}`;
}

export function subjectLabel(subject: SceneSubject): string {
  return subjectLabels[subject];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const INK = "#173D3A";

type Palette = {
  wall: string;
  floor: string;
  shadow: string;
  window: string;
  sun: string;
  hill: string;
  accent: string;
  accentSoft: string;
  leaf: string;
  leafLight: string;
  paper: string;
  muted: string;
};

const palettes: Record<ScenePalette, Palette> = {
  warm: {
    wall: "#E7E3D8", floor: "#C8B69E", shadow: "#AD8C6E", window: "#D4E4E0", sun: "#F1C36D", hill: "#AFC9C1",
    accent: "#C96E50", accentSoft: "#E6A65D", leaf: "#789D75", leafLight: "#92B386", paper: "#FAF7EE", muted: "#738984",
  },
  cool: {
    wall: "#DCE6EC", floor: "#A9BCC8", shadow: "#7F97A6", window: "#EEF5F8", sun: "#F4D58D", hill: "#9FC1CF",
    accent: "#4F7FA0", accentSoft: "#8DB6C9", leaf: "#6E9C8E", leafLight: "#94BDAE", paper: "#F7FAFB", muted: "#6F8794",
  },
  pastel: {
    wall: "#F3E9EF", floor: "#DCCAD8", shadow: "#B9A2B6", window: "#E6F0F0", sun: "#F7D9A0", hill: "#C9DCCF",
    accent: "#C48AAE", accentSoft: "#F0BFA0", leaf: "#8FB59A", leafLight: "#B2CDB6", paper: "#FFFAFC", muted: "#8E8195",
  },
  sunny: {
    wall: "#F6EBC8", floor: "#D9B97E", shadow: "#B8955A", window: "#DDEFF3", sun: "#F2B93B", hill: "#B9D58C",
    accent: "#E08D3C", accentSoft: "#F2C14E", leaf: "#6FA05A", leafLight: "#98C27A", paper: "#FFFBEF", muted: "#8A7F62",
  },
};

const NIGHT = { wall: "#2B3F5C", floor: "#46597A", shadow: "#33445F", window: "#1D2D45", hill: "#3E5776" };

function copySpace(p: Palette, onPaper: boolean): string {
  // Abstract bars mark the space left for facilitator copy; they are never letters.
  const card = onPaper ? `<rect x="760" y="150" width="310" height="210" rx="22" fill="${p.paper}" opacity=".85"/>` : "";
  return `${card}
  <rect x="788" y="183" width="254" height="20" rx="10" fill="${INK}"/>
  <rect x="788" y="247" width="201" height="14" rx="7" fill="${p.muted}"/>
  <rect x="788" y="282" width="242" height="14" rx="7" fill="${p.muted}"/>
  <rect x="788" y="317" width="166" height="14" rx="7" fill="${p.muted}"/>`;
}

function plant(p: Palette): string {
  return `<path d="M1014 641C999 550 1017 470 1074 416C1114 496 1116 579 1085 647" fill="${p.leaf}" stroke="${INK}" stroke-width="12"/>
  <path d="M1028 637C951 586 925 523 936 462C1003 488 1046 546 1052 638" fill="${p.leafLight}" stroke="${INK}" stroke-width="12"/>
  <rect x="978" y="629" width="130" height="122" rx="16" fill="${p.accentSoft}" stroke="${INK}" stroke-width="12"/>`;
}

function armchair(p: Palette): string {
  return `<path d="M250 615C250 525 323 452 413 452H478C568 452 641 525 641 615V728H250V615Z" fill="${p.accent}" stroke="${INK}" stroke-width="14"/>
  <rect x="214" y="590" width="76" height="194" rx="34" fill="${p.accentSoft}" stroke="${INK}" stroke-width="14"/>
  <rect x="601" y="590" width="76" height="194" rx="34" fill="${p.accentSoft}" stroke="${INK}" stroke-width="14"/>
  <path d="M344 777L328 838M556 777L571 838" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>`;
}

function sparkle(x: number, y: number, r: number, fill: string): string {
  const k = r * 0.28;
  return `<path d="M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z" fill="${fill}"/>`;
}

function background(spec: SceneSpec, p: Palette): string {
  switch (spec.setting) {
    case "garden":
      return `<rect width="1200" height="900" fill="${p.window}"/>
  <circle cx="190" cy="170" r="78" fill="${p.sun}"/>
  <path d="M0 560C180 470 360 520 520 470C700 414 900 470 1200 430V900H0Z" fill="${p.hill}"/>
  <rect y="690" width="1200" height="210" fill="${p.leafLight}"/>
  <path d="M60 690V600M140 690V600M220 690V600M60 625H230" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
  ${[120, 760, 860, 1120].map((x, i) => `<path d="M${x} 800V760" stroke="${INK}" stroke-width="6"/><circle cx="${x}" cy="752" r="16" fill="${i % 2 ? p.accentSoft : p.accent}" stroke="${INK}" stroke-width="5"/>`).join("")}
  <ellipse cx="445" cy="770" rx="300" ry="60" fill="${p.leaf}" opacity=".35"/>
  ${copySpace(p, true)}`;
    case "classroom":
      return `<rect width="1200" height="900" fill="${p.wall}"/>
  <rect x="70" y="90" width="520" height="300" rx="14" fill="#3F5F55" stroke="${INK}" stroke-width="14"/>
  <path d="M90 372H570" stroke="${p.paper}" stroke-width="8" stroke-linecap="round" opacity=".6"/>
  <rect y="690" width="1200" height="210" fill="${p.floor}"/>
  <rect x="740" y="470" width="360" height="220" rx="10" fill="${p.accentSoft}" stroke="${INK}" stroke-width="12"/>
  <path d="M740 580H1100" stroke="${INK}" stroke-width="10"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${770 + i * 52}" y="${i % 2 ? 500 : 490}" width="34" height="${i % 2 ? 72 : 82}" rx="5" fill="${[p.accent, p.leaf, p.sun][i % 3]}" stroke="${INK}" stroke-width="6"/>`).join("")}
  <ellipse cx="445" cy="760" rx="300" ry="62" fill="${p.shadow}" opacity=".35"/>
  ${copySpace(p, true)}`;
    case "night":
      return `<rect width="1200" height="900" fill="${NIGHT.wall}"/>
  <rect x="86" y="80" width="420" height="420" rx="12" fill="${NIGHT.window}" stroke="${INK}" stroke-width="14"/>
  <path d="M296 87V493M93 290H499" stroke="${INK}" stroke-width="10"/>
  <path d="M410 150A62 62 0 1 0 440 260A52 52 0 1 1 410 150Z" fill="#F4E3A1"/>
  ${sparkle(170, 160, 16, "#F4E3A1")}${sparkle(230, 230, 10, "#F4E3A1")}${sparkle(150, 400, 12, "#F4E3A1")}${sparkle(380, 420, 9, "#F4E3A1")}
  <rect y="690" width="1200" height="210" fill="${NIGHT.floor}"/>
  <ellipse cx="445" cy="760" rx="320" ry="70" fill="${NIGHT.shadow}" opacity=".7"/>
  <rect x="980" y="560" width="120" height="130" rx="12" fill="${p.accentSoft}" stroke="${INK}" stroke-width="12"/>
  <path d="M1000 560L1040 470L1080 560Z" fill="#F4E3A1" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
  <circle cx="1040" cy="520" r="120" fill="#F4E3A1" opacity=".12"/>
  ${copySpace(p, true)}`;
    case "beach":
      return `<rect width="1200" height="900" fill="${p.window}"/>
  <circle cx="150" cy="140" r="70" fill="${p.sun}"/>
  <rect y="430" width="1200" height="200" fill="#8EC3CF"/>
  <path d="M0 470C60 450 120 490 180 470S300 450 360 470S480 490 540 470" stroke="${p.paper}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M640 540C700 520 760 560 820 540S940 520 1000 540" stroke="${p.paper}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M0 640C300 600 900 600 1200 640V900H0Z" fill="#E9D3A8"/>
  <path d="M100 800a24 24 0 0 1 48 0Z" fill="${p.accent}" stroke="${INK}" stroke-width="5"/>
  <circle cx="1100" cy="790" r="16" fill="${p.accentSoft}" stroke="${INK}" stroke-width="5"/>
  <ellipse cx="445" cy="770" rx="300" ry="60" fill="#CDB27E" opacity=".5"/>
  ${copySpace(p, true)}`;
    case "forest":
      return `<rect width="1200" height="900" fill="${p.window}"/>
  ${[90, 230, 640, 760, 1110].map((x, i) => `<rect x="${x - 16}" y="${380 + (i % 2) * 30}" width="32" height="330" fill="#8A6A4F" stroke="${INK}" stroke-width="8"/><circle cx="${x}" cy="${330 + (i % 2) * 30}" r="${100 - (i % 3) * 12}" fill="${i % 2 ? p.leaf : p.leafLight}" stroke="${INK}" stroke-width="10"/>`).join("")}
  <rect y="690" width="1200" height="210" fill="${p.leaf}"/>
  <ellipse cx="445" cy="770" rx="300" ry="60" fill="${INK}" opacity=".15"/>
  ${copySpace(p, true)}`;
    case "reading-nook":
    default:
      return `<rect width="1200" height="900" fill="${p.wall}"/>
  <rect x="86" y="80" width="420" height="490" rx="12" fill="${p.window}" stroke="${INK}" stroke-width="14"/>
  <path d="M296 87V563M93 318H499" stroke="${INK}" stroke-width="10"/>
  <circle cx="182" cy="178" r="62" fill="${p.sun}"/>
  <path d="M98 536C176 468 264 503 334 452C397 406 447 419 500 448V563H98V536Z" fill="${p.hill}"/>
  <rect y="690" width="1200" height="210" fill="${p.floor}"/>
  <ellipse cx="437" cy="742" rx="322" ry="77" fill="${p.shadow}" opacity=".35"/>
  ${copySpace(p, false)}
  ${plant(p)}`;
  }
}

type EarKind = "pointy" | "round" | "long" | "floppy" | "big-round" | "tufts" | "none";

type Creature = {
  body: string;
  head: string;
  belly: string;
  muzzle?: string;
  ears: EarKind;
  earColor: string;
  earInner?: string;
  nose: "nose" | "beak" | "none";
  extras: Array<"tail-stripes" | "tail-tip" | "whiskers" | "eye-patches" | "panda-patches" | "trunk" | "mane" | "shell" | "frog-eyes" | "big-nose">;
};

const creatures: Record<SceneSubject, Creature> = {
  "red-panda": { body: "#C96E50", head: "#B9583C", belly: "#7A3A28", muzzle: "#F4D6B8", ears: "pointy", earColor: "#A94D35", earInner: "#F4D6B8", nose: "nose", extras: ["tail-stripes", "eye-patches"] },
  panda: { body: "#F5F2EA", head: "#F5F2EA", belly: "#FFFFFF", ears: "round", earColor: "#2C2F33", nose: "nose", extras: ["panda-patches"] },
  fox: { body: "#D9773A", head: "#D9773A", belly: "#FBEFE2", muzzle: "#FBEFE2", ears: "pointy", earColor: "#C0612A", earInner: "#3B2A22", nose: "nose", extras: ["tail-tip", "whiskers"] },
  bear: { body: "#9A6B4F", head: "#9A6B4F", belly: "#C99B78", muzzle: "#D9B48F", ears: "round", earColor: "#86593F", earInner: "#C99B78", nose: "nose", extras: [] },
  cat: { body: "#B7AFA3", head: "#B7AFA3", belly: "#EDE7DD", muzzle: "#EDE7DD", ears: "pointy", earColor: "#9E968A", earInner: "#E9B7AE", nose: "nose", extras: ["whiskers"] },
  dog: { body: "#C99A6B", head: "#C99A6B", belly: "#F1DEC5", muzzle: "#F1DEC5", ears: "floppy", earColor: "#8A5F3F", nose: "nose", extras: [] },
  rabbit: { body: "#E9E2DA", head: "#E9E2DA", belly: "#FFFFFF", muzzle: "#FFFFFF", ears: "long", earColor: "#E9E2DA", earInner: "#EDB8B8", nose: "nose", extras: ["whiskers"] },
  owl: { body: "#8C6E55", head: "#8C6E55", belly: "#D9C4A8", ears: "tufts", earColor: "#7A5D46", nose: "beak", extras: [] },
  turtle: { body: "#5C8E77", head: "#8DB18B", belly: "#D4E4C0", ears: "none", earColor: "#8DB18B", nose: "none", extras: ["shell"] },
  penguin: { body: "#2F3B45", head: "#2F3B45", belly: "#FFFFFF", muzzle: "#FFFFFF", ears: "none", earColor: "#2F3B45", nose: "beak", extras: [] },
  elephant: { body: "#9CA6B0", head: "#9CA6B0", belly: "#C3CAD1", ears: "big-round", earColor: "#8A94A0", earInner: "#E3B9BE", nose: "none", extras: ["trunk"] },
  lion: { body: "#D9A54A", head: "#E3B45C", belly: "#F3DDB0", muzzle: "#F3DDB0", ears: "round", earColor: "#C98F35", nose: "nose", extras: ["mane", "whiskers"] },
  frog: { body: "#7FB069", head: "#7FB069", belly: "#D6E9B8", ears: "none", earColor: "#7FB069", nose: "none", extras: ["frog-eyes"] },
  mouse: { body: "#B8B2AE", head: "#B8B2AE", belly: "#E8E3DF", muzzle: "#E8E3DF", ears: "big-round", earColor: "#B8B2AE", earInner: "#EDB8B8", nose: "nose", extras: ["whiskers"] },
  koala: { body: "#9EA3A8", head: "#9EA3A8", belly: "#E3E5E7", ears: "big-round", earColor: "#9EA3A8", earInner: "#FFFFFF", nose: "none", extras: ["big-nose"] },
  friend: { body: "#7FB3A8", head: "#8DC2B6", belly: "#D7EDE6", ears: "round", earColor: "#6FA397", earInner: "#D7EDE6", nose: "none", extras: [] },
};

const CX = 445;
const HEAD_Y = 470;

function ears(c: Creature): string {
  const s = `stroke="${INK}" stroke-width="12" stroke-linejoin="round"`;
  const inner = c.earInner ?? c.earColor;
  switch (c.ears) {
    case "pointy":
      return `<path d="M352 420L318 318L414 382Z" fill="${c.earColor}" ${s}/><path d="M538 420L572 318L476 382Z" fill="${c.earColor}" ${s}/>
      <path d="M356 398L338 344L388 378Z" fill="${inner}"/><path d="M534 398L552 344L502 378Z" fill="${inner}"/>`;
    case "round":
      return `<circle cx="352" cy="385" r="46" fill="${c.earColor}" ${s}/><circle cx="538" cy="385" r="46" fill="${c.earColor}" ${s}/>
      <circle cx="352" cy="385" r="22" fill="${inner}"/><circle cx="538" cy="385" r="22" fill="${inner}"/>`;
    case "big-round":
      return `<circle cx="318" cy="420" r="82" fill="${c.earColor}" ${s}/><circle cx="572" cy="420" r="82" fill="${c.earColor}" ${s}/>
      <circle cx="318" cy="420" r="48" fill="${inner}"/><circle cx="572" cy="420" r="48" fill="${inner}"/>`;
    case "long":
      return `<ellipse cx="392" cy="290" rx="36" ry="118" fill="${c.earColor}" ${s}/><ellipse cx="498" cy="290" rx="36" ry="118" fill="${c.earColor}" ${s}/>
      <ellipse cx="392" cy="295" rx="16" ry="88" fill="${inner}"/><ellipse cx="498" cy="295" rx="16" ry="88" fill="${inner}"/>`;
    case "floppy":
      return "";
    case "tufts":
      return `<path d="M360 400L342 340L404 376Z" fill="${c.earColor}" ${s}/><path d="M530 400L548 340L486 376Z" fill="${c.earColor}" ${s}/>`;
    case "none":
    default:
      return "";
  }
}

function floppyEars(c: Creature): string {
  if (c.ears !== "floppy") return "";
  const s = `stroke="${INK}" stroke-width="12"`;
  return `<path d="M340 410C292 430 286 520 318 560C346 540 360 470 360 430Z" fill="${c.earColor}" ${s}/>
  <path d="M550 410C598 430 604 520 572 560C544 540 530 470 530 430Z" fill="${c.earColor}" ${s}/>`;
}

function eyes(mood: SceneMood, owl: boolean): string {
  const lx = 400;
  const rx = 490;
  const y = HEAD_Y - 6;
  const rings = owl
    ? `<circle cx="${lx}" cy="${y}" r="38" fill="#F3E6CF" stroke="${INK}" stroke-width="8"/><circle cx="${rx}" cy="${y}" r="38" fill="#F3E6CF" stroke="${INK}" stroke-width="8"/>`
    : "";
  switch (mood) {
    case "happy":
      return `${rings}<path d="M${lx - 16} ${y + 6}Q${lx} ${y - 14} ${lx + 16} ${y + 6}M${rx - 16} ${y + 6}Q${rx} ${y - 14} ${rx + 16} ${y + 6}" stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"/>`;
    case "sleepy":
      return `${rings}<path d="M${lx - 16} ${y}Q${lx} ${y + 14} ${lx + 16} ${y}M${rx - 16} ${y}Q${rx} ${y + 14} ${rx + 16} ${y}" stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"/>`;
    case "curious":
      return `${rings}<circle cx="${lx}" cy="${y}" r="15" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="15" fill="${INK}"/>
      <circle cx="${lx + 5}" cy="${y - 5}" r="5" fill="#FFFFFF"/><circle cx="${rx + 5}" cy="${y - 5}" r="5" fill="#FFFFFF"/>
      <path d="M${lx - 20} ${y - 34}Q${lx} ${y - 46} ${lx + 18} ${y - 36}" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
    case "calm":
    default:
      return `${rings}<circle cx="${lx}" cy="${y}" r="11" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="11" fill="${INK}"/>`;
  }
}

function mouth(mood: SceneMood, wide: boolean): string {
  const y = HEAD_Y + 52;
  const w = wide ? 40 : 18;
  switch (mood) {
    case "happy":
      return `<path d="M${CX - w - 6} ${y - 4}Q${CX} ${y + 34} ${CX + w + 6} ${y - 4}Z" fill="#B9564A" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
    case "curious":
      return `<ellipse cx="${CX}" cy="${y + 6}" rx="9" ry="11" fill="#B9564A" stroke="${INK}" stroke-width="6"/>`;
    case "sleepy":
      return `<path d="M${CX - 10} ${y + 4}Q${CX} ${y + 12} ${CX + 10} ${y + 4}" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
    case "calm":
    default:
      return `<path d="M${CX - w} ${y}Q${CX} ${y + 18} ${CX + w} ${y}" stroke="${INK}" stroke-width="7" stroke-linecap="round" fill="none"/>`;
  }
}

function heldObject(object: SceneObject, p: Palette): string {
  const y = 650;
  switch (object) {
    case "emotion-card":
      return `<rect x="${CX - 75}" y="${y - 56}" width="150" height="112" rx="16" fill="${p.paper}" stroke="${INK}" stroke-width="10"/>
      <circle cx="${CX}" cy="${y}" r="25" fill="${p.sun}"/><path d="M${CX - 16} ${y + 8}C${CX - 6} ${y + 19} ${CX + 8} ${y + 19} ${CX + 18} ${y + 8}" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    case "book":
      return `<path d="M${CX} ${y - 40}C${CX - 30} ${y - 58} ${CX - 80} ${y - 58} ${CX - 100} ${y - 44}V${y + 50}C${CX - 80} ${y + 36} ${CX - 30} ${y + 36} ${CX} ${y + 54}Z" fill="${p.paper}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
      <path d="M${CX} ${y - 40}C${CX + 30} ${y - 58} ${CX + 80} ${y - 58} ${CX + 100} ${y - 44}V${y + 50}C${CX + 80} ${y + 36} ${CX + 30} ${y + 36} ${CX} ${y + 54}Z" fill="${p.paper}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
      <path d="M${CX - 78} ${y - 18}H${CX - 22}M${CX - 78} ${y + 4}H${CX - 30}M${CX + 22} ${y - 18}H${CX + 78}M${CX + 30} ${y + 4}H${CX + 78}" stroke="${p.muted}" stroke-width="6" stroke-linecap="round"/>
      <path d="M${CX - 104} ${y + 50}H${CX + 104}" stroke="${p.accent}" stroke-width="12" stroke-linecap="round"/>`;
    case "balloon":
      return `<path d="M${CX + 60} ${y}C${CX + 110} ${y - 120} ${CX + 70} ${y - 220} ${CX + 160} ${y - 330}" stroke="${INK}" stroke-width="5" fill="none"/>
      <ellipse cx="${CX + 170}" cy="${y - 400}" rx="70" ry="84" fill="${p.accent}" stroke="${INK}" stroke-width="10"/>
      <path d="M${CX + 160} ${y - 318}L${CX + 172} ${y - 330}L${CX + 182} ${y - 316}Z" fill="${p.accent}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="${CX + 146}" cy="${y - 430}" rx="14" ry="22" fill="#FFFFFF" opacity=".5"/>`;
    case "flower":
      return `<path d="M${CX} ${y + 50}V${y - 40}" stroke="${p.leaf}" stroke-width="12" stroke-linecap="round"/>
      <ellipse cx="${CX + 26}" cy="${y + 10}" rx="24" ry="12" fill="${p.leafLight}" stroke="${INK}" stroke-width="5"/>
      ${[0, 72, 144, 216, 288].map((a) => `<circle cx="${CX + Math.round(Math.cos((a * Math.PI) / 180) * 30)}" cy="${y - 60 + Math.round(Math.sin((a * Math.PI) / 180) * 30)}" r="22" fill="${p.accentSoft}" stroke="${INK}" stroke-width="6"/>`).join("")}
      <circle cx="${CX}" cy="${y - 60}" r="18" fill="${p.sun}" stroke="${INK}" stroke-width="6"/>`;
    case "star": {
      const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 30 : 70;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return `${CX + Math.round(Math.cos(a) * r)} ${y + Math.round(Math.sin(a) * r)}`;
      });
      return `<path d="M${points.join("L")}Z" fill="${p.sun}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`;
    }
    case "heart":
      return `<path d="M${CX} ${y + 56}C${CX - 90} ${y} ${CX - 80} ${y - 70} ${CX - 30} ${y - 66}C${CX - 10} ${y - 64} ${CX} ${y - 50} ${CX} ${y - 40}C${CX} ${y - 50} ${CX + 10} ${y - 64} ${CX + 30} ${y - 66}C${CX + 80} ${y - 70} ${CX + 90} ${y} ${CX} ${y + 56}Z" fill="${p.accent}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`;
    case "ball":
      return `<circle cx="${CX}" cy="${y}" r="62" fill="${p.accentSoft}" stroke="${INK}" stroke-width="9"/>
      <path d="M${CX - 60} ${y - 14}C${CX - 20} ${y + 6} ${CX + 20} ${y + 6} ${CX + 60} ${y - 14}M${CX - 16} ${y - 60}C${CX + 6} ${y - 20} ${CX + 6} ${y + 20} ${CX - 16} ${y + 60}" stroke="${p.accent}" stroke-width="10" fill="none"/>`;
    case "none":
    default:
      return "";
  }
}

function character(spec: SceneSpec, p: Palette): string {
  const c = creatures[spec.subject];
  const s = `stroke="${INK}" stroke-width="12"`;
  const has = (extra: Creature["extras"][number]) => c.extras.includes(extra);
  const parts: string[] = [];

  // Tail behind the body.
  if (has("tail-stripes")) {
    parts.push(`<path d="M560 720C660 720 720 640 700 560C690 520 650 520 640 560C630 610 600 650 550 660Z" fill="${c.body}" ${s} stroke-linejoin="round"/>
    <path d="M690 600L648 590M676 650L632 630" stroke="${c.belly}" stroke-width="14" stroke-linecap="round"/>`);
  }
  if (has("tail-tip")) {
    parts.push(`<path d="M560 720C680 730 740 640 712 560C700 524 660 524 650 560C640 620 600 660 550 662Z" fill="${c.body}" ${s} stroke-linejoin="round"/>
    <path d="M712 560C700 524 660 524 650 560C664 574 700 574 712 560Z" fill="#FBEFE2" stroke="${INK}" stroke-width="8"/>`);
  }

  // Body or shell.
  if (has("shell")) {
    parts.push(`<ellipse cx="${CX}" cy="650" rx="205" ry="140" fill="${c.body}" ${s}/>
    <path d="M${CX - 150} 600L${CX + 150} 700M${CX + 150} 600L${CX - 150} 700M${CX} 520V780" stroke="${c.belly}" stroke-width="8" opacity=".8"/>`);
  } else {
    parts.push(`<ellipse cx="${CX}" cy="650" rx="150" ry="125" fill="${c.body}" ${s}/>
    <ellipse cx="${CX}" cy="672" rx="92" ry="82" fill="${c.belly}"/>`);
  }
  // Feet.
  parts.push(`<ellipse cx="${CX - 72}" cy="770" rx="50" ry="26" fill="${has("shell") ? c.head : c.body}" ${s}/>
  <ellipse cx="${CX + 72}" cy="770" rx="50" ry="26" fill="${has("shell") ? c.head : c.body}" ${s}/>`);

  // Head layers.
  if (has("mane")) {
    parts.push(`<circle cx="${CX}" cy="${HEAD_Y}" r="168" fill="#A8682C" ${s}/>`);
  }
  parts.push(ears(c));
  parts.push(`<ellipse cx="${CX}" cy="${HEAD_Y}" rx="128" ry="112" fill="${c.head}" ${s}/>`);
  parts.push(floppyEars(c));
  if (has("frog-eyes")) {
    parts.push(`<circle cx="392" cy="${HEAD_Y - 86}" r="40" fill="${c.head}" ${s}/><circle cx="498" cy="${HEAD_Y - 86}" r="40" fill="${c.head}" ${s}/>
    <circle cx="392" cy="${HEAD_Y - 86}" r="22" fill="#FFFFFF"/><circle cx="498" cy="${HEAD_Y - 86}" r="22" fill="#FFFFFF"/>`);
  }
  if (has("panda-patches")) {
    parts.push(`<ellipse cx="398" cy="${HEAD_Y - 2}" rx="30" ry="38" fill="#2C2F33" transform="rotate(-20 398 ${HEAD_Y - 2})"/>
    <ellipse cx="492" cy="${HEAD_Y - 2}" rx="30" ry="38" fill="#2C2F33" transform="rotate(20 492 ${HEAD_Y - 2})"/>`);
  }
  if (c.muzzle) {
    parts.push(`<ellipse cx="${CX}" cy="${HEAD_Y + 38}" rx="72" ry="50" fill="${c.muzzle}"/>`);
  }
  if (has("eye-patches")) {
    parts.push(`<path d="M372 450C380 420 410 418 420 440C414 470 382 476 372 450Z" fill="#F4D6B8"/>
    <path d="M518 450C510 420 480 418 470 440C476 470 508 476 518 450Z" fill="#F4D6B8"/>`);
  }
  // Eyes on dark fur (panda patches, penguin head) are drawn light so they stay visible.
  const eyeMarkup = eyes(spec.mood, spec.subject === "owl");
  parts.push(has("panda-patches") || spec.subject === "penguin" ? eyeMarkup.replaceAll(`fill="${INK}"`, `fill="#FFFFFF"`).replaceAll(`stroke="${INK}"`, `stroke="#FFFFFF"`) : eyeMarkup);
  parts.push(`<circle cx="372" cy="${HEAD_Y + 34}" r="16" fill="#E79A8C" opacity=".45"/><circle cx="518" cy="${HEAD_Y + 34}" r="16" fill="#E79A8C" opacity=".45"/>`);

  if (c.nose === "nose") {
    parts.push(`<ellipse cx="${CX}" cy="${HEAD_Y + 26}" rx="15" ry="11" fill="${INK}"/>`);
  } else if (c.nose === "beak") {
    parts.push(`<path d="M${CX - 18} ${HEAD_Y + 20}L${CX + 18} ${HEAD_Y + 20}L${CX} ${HEAD_Y + 50}Z" fill="#E8A13A" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`);
  }
  if (has("big-nose")) {
    parts.push(`<ellipse cx="${CX}" cy="${HEAD_Y + 24}" rx="26" ry="34" fill="#3A3D42"/>`);
  }
  if (has("trunk")) {
    parts.push(`<path d="M${CX - 22} ${HEAD_Y + 20}C${CX - 26} ${HEAD_Y + 110} ${CX + 10} ${HEAD_Y + 150} ${CX + 54} ${HEAD_Y + 130}L${CX + 46} ${HEAD_Y + 106}C${CX + 22} ${HEAD_Y + 116} ${CX + 20} ${HEAD_Y + 80} ${CX + 22} ${HEAD_Y + 20}Z" fill="${c.head}" ${s} stroke-linejoin="round"/>`);
  }
  if (c.nose !== "beak" && !has("trunk")) {
    parts.push(mouth(spec.mood, spec.subject === "frog"));
  }
  if (has("whiskers")) {
    parts.push(`<path d="M360 ${HEAD_Y + 30}H310M362 ${HEAD_Y + 46}L314 ${HEAD_Y + 58}M530 ${HEAD_Y + 30}H580M528 ${HEAD_Y + 46}L576 ${HEAD_Y + 58}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`);
  }

  // Held object, then paws over its edges.
  parts.push(heldObject(spec.object, p));
  const arm = spec.subject === "panda" ? "#2C2F33" : has("shell") ? c.head : c.body;
  if (spec.object === "none") {
    parts.push(`<path d="M${CX - 120} 610L${CX - 96} 690M${CX + 120} 610L${CX + 96} 690" stroke="${INK}" stroke-width="40" stroke-linecap="round"/>
    <path d="M${CX - 120} 610L${CX - 96} 690M${CX + 120} 610L${CX + 96} 690" stroke="${arm}" stroke-width="24" stroke-linecap="round"/>`);
  } else if (spec.object === "balloon") {
    parts.push(`<path d="M${CX - 118} 610L${CX - 80} 690M${CX + 112} 620L${CX + 64} 652" stroke="${INK}" stroke-width="40" stroke-linecap="round"/>
    <path d="M${CX - 118} 610L${CX - 80} 690M${CX + 112} 620L${CX + 64} 652" stroke="${arm}" stroke-width="24" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="M${CX - 128} 600L${CX - 78} 640M${CX + 128} 600L${CX + 78} 640" stroke="${INK}" stroke-width="40" stroke-linecap="round"/>
    <path d="M${CX - 128} 600L${CX - 78} 640M${CX + 128} 600L${CX + 78} 640" stroke="${arm}" stroke-width="24" stroke-linecap="round"/>`);
  }
  return parts.join("\n  ");
}

function microText(): string {
  // The defect the reliability drill asks visual QA to catch: tiny marks that read as lettering.
  const rows = [
    [372, 712],
    [380, 728],
    [790, 360],
    [800, 378],
  ];
  return rows
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y}l6 -6l6 6l6 -6l6 6m8 0l5 -7l5 7m8 -3h10m6 3l6 -6l6 6l6 -6" stroke="${INK}" stroke-width="2.5" fill="none" opacity=".75"/>`,
    )
    .join("\n  ");
}

export function renderSceneSvg(spec: SceneSpec): string {
  const p = palettes[spec.palette];
  const description = describeScene(spec);
  const chair = spec.mode === "img2img" && spec.setting === "reading-nook" ? armchair(p) : "";
  return `<svg width="1200" height="900" viewBox="0 0 1200 900" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">CareCanvas ${spec.mode === "inpaint" ? "inpainted" : "rendered"} wellbeing illustration</title>
  <desc id="desc">${description}.</desc>
  ${background(spec, p)}
  ${chair}
  ${character(spec, p)}
  ${spec.variant === "micro-text" ? microText() : ""}
</svg>`;
}
