/**
 * apps/api/src/modules/lore/lore.gemini.ts
 *
 * The one LLM call in lore generation: a text-only Gemini `generateContent`
 * request (same REST endpoint / raw-`fetch`-no-SDK approach as
 * modules/capture/cv.service.ts) that turns a PawBall's already-decided,
 * deterministic identity (name, class, element, rarity, region, aura
 * traits) plus the raw CV reading into prose a template pool couldn't:
 *
 *   - `generateLoreViaGemini`        — origin loreText + personality,
 *     called once per new PawBall from lore.engine.ts's `generateIdentity`.
 *   - `generateWeeklyUpdateViaGemini` — one weekly life-update sentence,
 *     called once per PawBall per week from jobs/weeklyLifeTick.ts.
 *
 * Everything upstream of this file — name, class, element, rarity, stats,
 * abilities — is still pure rule-table + seeded-RNG (lore.engine.ts). Only
 * the prose generated here is an LLM call, and both callers fall back to a
 * deterministic template (lore.engine.ts's `template*` functions) if
 * GEMINI_API_KEY is unset or the call fails after retries, so neither a
 * capture nor a weekly-life run ever hard-fails on flavor text.
 *
 * The retry/timeout/JSON-extraction logic below is deliberately a
 * self-contained copy of cv.service.ts's, not a shared import: this module
 * has no image bytes to send and a different (JSON, no inlineData) request
 * shape, and keeping the two independent means a change to one Gemini
 * caller can't accidentally break the other.
 */

import { config } from "../../config";

export class LoreGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoreGenerationError";
  }
}

export interface LoreGenInput {
  fantasyName: string;
  title: string;
  breed: string;
  coatColor: string;
  coatPattern: string;
  pose: string;
  surroundings: string[];
  fantasyClass: string;
  element: string;
  regionName: string;
  auraTraits: string[];
  rarity: string;
}

export interface LoreGenResult {
  loreText: string;
  personality: string;
}

export interface WeeklyGenInput {
  fantasyName: string;
  fantasyClass: string;
  element: string;
  regionName: string;
  trait: string;
  rarity: string;
  breed: string;
  weekNumber: number;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRIES = 3;

const LORE_SYSTEM_PROMPT = `You are the lore writer for PawBall Chronicles, a cat-collection RPG where every captured cat becomes a unique fantasy creature card.
Given one cat's already-decided traits below, return ONLY valid JSON matching this schema:
{ "loreText": string, "personality": string }
loreText: 3-4 sentences telling THIS cat's origin story, grounded in its breed, coat, pose, surroundings, home region, fantasy class and element. Vivid and specific to these inputs, a little wry — never generic, never a list restating the input facts.
personality: 1-2 sentences on how this cat behaves and feels to be around, consistent with its aura traits and class.
Never mention "Gemini", "AI", or that this text is generated. No markdown. No explanation. Raw JSON only.`;

const WEEKLY_SYSTEM_PROMPT = `You are the lore writer for PawBall Chronicles, a cat-collection RPG.
Given one cat's fantasy identity below, write ONE short in-fiction sentence about what it got up to this week in its home region — small, specific, a little whimsical, consistent with its class, element, rarity and aura trait. Do not repeat previous weeks' beats; invent a fresh one.
Return ONLY valid JSON matching this schema: { "weeklyUpdate": string }
Never mention "Gemini", "AI", or that this text is generated. No markdown. No explanation. Raw JSON only.`;

export async function generateLoreViaGemini(input: LoreGenInput): Promise<LoreGenResult> {
  if (!config.geminiApiKey) {
    throw new LoreGenerationError("GEMINI_API_KEY not set");
  }
  const userPrompt = [
    `Name: ${input.fantasyName}`,
    `Title: ${input.title}`,
    `Breed: ${input.breed}`,
    `Coat: ${input.coatColor} ${input.coatPattern}`,
    `Pose when found: ${input.pose}`,
    `Surroundings: ${input.surroundings.join(", ") || "unknown"}`,
    `Fantasy class: ${input.fantasyClass}`,
    `Element: ${input.element}`,
    `Home region: ${input.regionName}`,
    `Aura traits: ${input.auraTraits.join(", ") || "none"}`,
    `Rarity: ${input.rarity}`,
  ].join("\n");

  const raw = await callGeminiJson(LORE_SYSTEM_PROMPT, userPrompt);
  const loreText = typeof raw.loreText === "string" ? raw.loreText.trim() : "";
  const personality = typeof raw.personality === "string" ? raw.personality.trim() : "";
  if (!loreText || !personality) {
    throw new LoreGenerationError(
      "Gemini lore response was missing loreText and/or personality"
    );
  }
  return { loreText, personality };
}

export async function generateWeeklyUpdateViaGemini(
  input: WeeklyGenInput
): Promise<string> {
  if (!config.geminiApiKey) {
    throw new LoreGenerationError("GEMINI_API_KEY not set");
  }
  const userPrompt = [
    `Name: ${input.fantasyName}`,
    `Fantasy class: ${input.fantasyClass}`,
    `Element: ${input.element}`,
    `Home region: ${input.regionName}`,
    `Aura trait: ${input.trait}`,
    `Rarity: ${input.rarity}`,
    `Breed: ${input.breed}`,
    `ISO week number: ${input.weekNumber}`,
  ].join("\n");

  const raw = await callGeminiJson(WEEKLY_SYSTEM_PROMPT, userPrompt);
  const weeklyUpdate = typeof raw.weeklyUpdate === "string" ? raw.weeklyUpdate.trim() : "";
  if (!weeklyUpdate) {
    throw new LoreGenerationError("Gemini weekly-update response was missing weeklyUpdate");
  }
  return weeklyUpdate;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

async function callGeminiJson(
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown>> {
  const url = `${GEMINI_ENDPOINT}/${config.geminiModel}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Some temperature, unlike the CV reading — this is meant to read as
      // prose, not a deterministic extraction.
      temperature: 0.9,
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
        throw new LoreGenerationError(`Gemini request failed: ${lastError}`);
      }
      await sleep(1000 * (attempt + 1));
      continue;
    }

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (res.status === 429 || res.status >= 500) {
      lastError = json.error?.message ?? `HTTP ${res.status}`;
      if (attempt === RETRIES - 1) {
        throw new LoreGenerationError(`Gemini unavailable: ${lastError}`);
      }
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new LoreGenerationError(
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
      throw new LoreGenerationError(
        "Gemini lore response was truncated (finishReason=MAX_TOKENS); raise MAX_OUTPUT_TOKENS."
      );
    }
    if (!text) {
      throw new LoreGenerationError(
        `Gemini returned no text (finishReason=${finish || "none"}, blockReason=${json.promptFeedback?.blockReason ?? "none"})`
      );
    }
    return extractJson(text);
  }

  throw new LoreGenerationError(`Gemini request failed: ${lastError}`);
}

/** Gemini is asked for `application/json`, but strip a stray ```json fence
 * or surrounding prose defensively before parsing. */
function extractJson(text: string): Record<string, unknown> {
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
    throw new LoreGenerationError(
      `Gemini returned unparseable JSON: ${(err as Error).message}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
