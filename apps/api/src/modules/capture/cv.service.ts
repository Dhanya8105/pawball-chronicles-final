/**
 * apps/api/src/modules/capture/cv.service.ts
 *
 * Computer-vision analysis of a capture photo, in-process — this used to be
 * a separate FastAPI service (services/ai). It calls the Google Gemini
 * `generateContent` REST endpoint directly with `fetch` (no SDK): the image
 * is fetched from its Cloudinary URL, sent inline as base64, and Gemini is
 * asked for a strict JSON object matching `CvAnalysisResult`.
 *
 * The `coat.color` and `surroundings` vocabularies in SYSTEM_PROMPT are
 * pinned to the exact value sets the deterministic Region / Class / Element
 * / Rarity engines key off (see modules/region + modules/lore), so the CV
 * reading actually drives them instead of falling through to defaults.
 *
 * When `GEMINI_API_KEY` is unset, `analyzeImage` returns a clearly-labelled
 * mock (`mock: true`, all confidences 0.0) so the capture -> bond -> lore
 * pipeline still runs end-to-end in local dev.
 */

import { config } from "../../config";

// ---------------------------------------------------------------------------
// Result shape (unchanged — downstream engines depend on it)
// ---------------------------------------------------------------------------

export interface CvConfidenceValue {
  label: string;
  confidence: number;
}

export interface CvCoatResult {
  color: string;
  pattern: string;
  confidence: number;
}

export interface CvSurroundingLabel {
  label: string;
  confidence: number;
}

export interface CvAnalysisResult {
  isCat: boolean;
  confidence: number;
  breed: CvConfidenceValue;
  pose: CvConfidenceValue;
  faceOrientation: CvConfidenceValue;
  eyeOpenness: CvConfidenceValue;
  earOrientation: CvConfidenceValue;
  tailVisible: boolean;
  coat: CvCoatResult;
  estimatedAgeGroup: CvConfidenceValue;
  surroundings: CvSurroundingLabel[];
  /** true when GEMINI_API_KEY was unset and this is the placeholder result. */
  mock?: boolean;
}

/** Thrown for any real (non-mock) CV failure — the analyze worker turns it
 * into a `Capture.error` after BullMQ exhausts retries. */
export class CvAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CvAnalysisError";
  }
}

// ---------------------------------------------------------------------------
// Prompt + model
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a computer vision API for a cat collection game.
Analyze the image and return ONLY valid JSON matching this schema:
{ isCat, confidence, breed{label,confidence}, pose{label,confidence},
  faceOrientation{label,confidence}, eyeOpenness{label,confidence},
  earOrientation{label,confidence}, tailVisible, coat{color,pattern,confidence},
  estimatedAgeGroup{label,confidence}, surroundings[{label,confidence}] }
pose label must be one of: sitting|sleeping|running|loaf|standing|unknown
eyeOpenness label must be one of: open|half|closed
earOrientation label must be one of: forward|alert|relaxed|flat
estimatedAgeGroup label must be one of: kitten|adult|senior
coat.color MUST be the single closest match from this list, nothing else:
  orange|black|white|grey|brown|cream|calico|tabby|black-and-white|tortoiseshell|golden
surroundings: up to 4 labels, and EVERY label MUST come from this list, nothing else:
  temple|shrine|garden|park|forest|beach|coast|alley|street|market|indoor|rooftop|construction|night|rain|sunset|snow
Omit any surroundings label that does not clearly apply; do not invent new labels.
If no cat is present return isCat:false with confidence and nulls elsewhere.
No markdown. No explanation. Raw JSON only.`;

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Current flash models spend a few hundred tokens on internal reasoning that
// also counts against maxOutputTokens and can't be disabled — the budget has
// to cover reasoning + the ~350-token JSON.
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 45_000;
const RETRIES = 3;

// ---------------------------------------------------------------------------

export async function analyzeImage(imageUrl: string): Promise<CvAnalysisResult> {
  if (!config.geminiApiKey) return mockResult();

  const { bytes, mimeType } = await fetchImage(imageUrl);
  const raw = await callGemini(bytes, mimeType);
  return toResult(raw);
}

async function fetchImage(
  imageUrl: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  let res: Response;
  try {
    res = await fetch(imageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new CvAnalysisError(
      `Could not fetch capture image: ${(err as Error).message}`
    );
  }
  if (!res.ok) {
    throw new CvAnalysisError(`Could not fetch capture image (HTTP ${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const headerType = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mimeType =
    headerType && headerType.startsWith("image/")
      ? headerType
      : guessMimeType(imageUrl);
  return { bytes, mimeType };
}

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

function guessMimeType(url: string): string {
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "image/jpeg";
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

async function callGemini(
  bytes: Buffer,
  mimeType: string
): Promise<Record<string, unknown>> {
  const url = `${GEMINI_ENDPOINT}/${config.geminiModel}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: bytes.toString("base64") } },
          { text: "Analyze this image." },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
    },
  });

  let lastError = "";
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.geminiApiKey as string,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error / timeout — transient, retry.
      lastError = (err as Error).message;
      if (attempt === RETRIES - 1) {
        throw new CvAnalysisError(`Gemini request failed: ${lastError}`);
      }
      await sleep(1500 * (attempt + 1));
      continue;
    }

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (res.status === 429 || res.status >= 500) {
      lastError = json.error?.message ?? `HTTP ${res.status}`;
      if (attempt === RETRIES - 1) {
        throw new CvAnalysisError(`Gemini unavailable: ${lastError}`);
      }
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new CvAnalysisError(
        `Gemini error ${res.status}: ${json.error?.message ?? "unknown"}`
      );
    }

    const candidate = json.candidates?.[0];
    const finish = candidate?.finishReason ?? "";
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (finish === "MAX_TOKENS") {
      throw new CvAnalysisError(
        "Gemini response was truncated (finishReason=MAX_TOKENS); raise MAX_OUTPUT_TOKENS."
      );
    }
    if (!text) {
      throw new CvAnalysisError(
        `Gemini returned no text (finishReason=${finish || "none"}, blockReason=${json.promptFeedback?.blockReason ?? "none"})`
      );
    }
    return extractJson(text);
  }

  throw new CvAnalysisError(`Gemini request failed: ${lastError}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Parsing / normalisation
// ---------------------------------------------------------------------------

/** Gemini is asked for `application/json`, but strip a stray ```json fence
 * or surrounding prose defensively before parsing. */
export function extractJson(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.slice(3);
    if (t.slice(0, 4).toLowerCase() === "json") t = t.slice(4);
    if (t.endsWith("```")) t = t.slice(0, -3);
    t = t.trim();
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch (err) {
    throw new CvAnalysisError(
      `Gemini returned unparseable JSON: ${(err as Error).message}`
    );
  }
}

function conf(node: unknown, defaultLabel = "unknown"): CvConfidenceValue {
  if (typeof node !== "object" || node === null) {
    return { label: defaultLabel, confidence: 0 };
  }
  const n = node as Record<string, unknown>;
  const label = typeof n.label === "string" && n.label ? n.label : defaultLabel;
  const c = n.confidence;
  return { label, confidence: typeof c === "number" ? c : 0 };
}

export function toResult(raw: Record<string, unknown>): CvAnalysisResult {
  const coat = (typeof raw.coat === "object" && raw.coat ? raw.coat : {}) as Record<
    string,
    unknown
  >;

  const surroundings: CvSurroundingLabel[] = [];
  const rawSurroundings = Array.isArray(raw.surroundings) ? raw.surroundings : [];
  for (const item of rawSurroundings.slice(0, 4)) {
    if (item && typeof item === "object" && (item as Record<string, unknown>).label) {
      const s = item as Record<string, unknown>;
      surroundings.push({
        label: String(s.label),
        confidence: typeof s.confidence === "number" ? s.confidence : 0,
      });
    }
  }

  return {
    isCat: raw.isCat === true,
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    breed: conf(raw.breed),
    pose: conf(raw.pose),
    faceOrientation: conf(raw.faceOrientation),
    eyeOpenness: conf(raw.eyeOpenness, "open"),
    earOrientation: conf(raw.earOrientation, "relaxed"),
    tailVisible: raw.tailVisible === true,
    coat: {
      color: typeof coat.color === "string" && coat.color ? coat.color : "unknown",
      pattern:
        typeof coat.pattern === "string" && coat.pattern ? coat.pattern : "unknown",
      confidence: typeof coat.confidence === "number" ? coat.confidence : 0,
    },
    estimatedAgeGroup: conf(raw.estimatedAgeGroup, "adult"),
    surroundings,
    mock: false,
  };
}

/** Placeholder returned when GEMINI_API_KEY is unset. Every confidence is
 * 0.0 so nothing downstream mistakes it for a real reading; `mock: true`
 * makes it explicit. */
export function mockResult(): CvAnalysisResult {
  return {
    isCat: true,
    confidence: 0,
    breed: { label: "Domestic Shorthair", confidence: 0 },
    pose: { label: "sitting", confidence: 0 },
    faceOrientation: { label: "facing camera", confidence: 0 },
    eyeOpenness: { label: "open", confidence: 0 },
    earOrientation: { label: "relaxed", confidence: 0 },
    tailVisible: true,
    coat: { color: "unknown", pattern: "unknown", confidence: 0 },
    estimatedAgeGroup: { label: "adult", confidence: 0 },
    surroundings: [],
    mock: true,
  };
}
