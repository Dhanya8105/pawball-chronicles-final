/**
 * apps/api/src/modules/artwork/artwork.service.ts
 *
 * A new PawBall's card artwork, generated once at creation by fal.ai's
 * `flux/dev/image-to-image` REST API (raw `fetch`, no SDK — same approach
 * as modules/capture/cv.service.ts and modules/lore/lore.gemini.ts): the
 * original capture photo goes in as the source image, so the actual cat's
 * pose and composition carry into the illustration, restyled by a prompt
 * built from its already-decided breed, coat color, fantasy class, element
 * and home region.
 *
 * fal.ai's own guidance is to prefer the queue (`queue.fal.run`, submit +
 * poll) over the direct sync endpoint (`fal.run`) for production traffic —
 * the sync endpoint doesn't retry and can time out on slower models. This
 * module uses the sync endpoint anyway, deliberately: it's called inline
 * from the capture pipeline (capture.pipeline.ts), which already accepts
 * this shape of tradeoff for the CV and lore Gemini calls — a single
 * request with its own timeout + retry-on-429/5xx, falling back to the
 * original photo on failure rather than ever blocking or failing a
 * capture on artwork. Polling a queue would add real complexity for a step
 * that's allowed to just not happen.
 */

import { config } from "../../config";

export class ArtworkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtworkGenerationError";
  }
}

export interface ArtworkGenInput {
  /** The original capture photo — sent as the image-to-image source, so
   * the generated artwork keeps this cat's actual pose/composition. */
  originalImageUrl: string;
  breed: string;
  coatColor: string;
  fantasyClass: string;
  element: string;
  regionName: string;
}

export interface ArtworkGenResult {
  imageUrl: string;
  providerUsed: "fal-ai/flux/dev/image-to-image";
}

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev/image-to-image";
const REQUEST_TIMEOUT_MS = 60_000;
const RETRIES = 3;

// How much of the source photo's composition survives (lower = more of the
// original cat's pose/framing kept; fal's own default is 0.95, which would
// discard almost all of it). num_inference_steps is trimmed from flux/dev's
// default of 40 to keep this closer to the rest of the pipeline's latency
// budget without a visible quality hit at this strength.
const STRENGTH = 0.75;
const NUM_INFERENCE_STEPS = 28;
const GUIDANCE_SCALE = 3.5;

export async function generateArtwork(input: ArtworkGenInput): Promise<ArtworkGenResult> {
  if (!config.falApiKey) {
    throw new ArtworkGenerationError("FAL_API_KEY not set");
  }

  const prompt = buildPrompt(input);
  const body = JSON.stringify({
    image_url: input.originalImageUrl,
    prompt,
    strength: STRENGTH,
    num_inference_steps: NUM_INFERENCE_STEPS,
    guidance_scale: GUIDANCE_SCALE,
    num_images: 1,
    output_format: "jpeg",
  });

  let lastError = "";
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(FAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // fal.ai's REST auth format is `Key <api-key>`, not `Bearer`.
          Authorization: `Key ${config.falApiKey}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error / timeout — transient, retry.
      lastError = (err as Error).message;
      if (attempt === RETRIES - 1) {
        throw new ArtworkGenerationError(`fal.ai request failed: ${lastError}`);
      }
      await sleep(1500 * (attempt + 1));
      continue;
    }

    const json = (await res.json().catch(() => ({}))) as FalResponse;

    if (res.status === 429 || res.status >= 500) {
      lastError = json.detail ? JSON.stringify(json.detail) : `HTTP ${res.status}`;
      if (attempt === RETRIES - 1) {
        throw new ArtworkGenerationError(`fal.ai unavailable: ${lastError}`);
      }
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new ArtworkGenerationError(
        `fal.ai error ${res.status}: ${json.detail ? JSON.stringify(json.detail) : "unknown"}`
      );
    }

    const url = json.images?.[0]?.url;
    if (!url) {
      throw new ArtworkGenerationError("fal.ai response had no image URL");
    }
    return { imageUrl: url, providerUsed: "fal-ai/flux/dev/image-to-image" };
  }

  throw new ArtworkGenerationError(`fal.ai request failed: ${lastError}`);
}

function buildPrompt(input: ArtworkGenInput): string {
  return (
    `fantasy trading card illustration of a ${input.coatColor} ${input.breed} cat, ` +
    `${input.element} elemental magic, ${input.fantasyClass} armor, glowing effects, ` +
    `painterly style, premium collectible card art, native to the ${input.regionName} region`
  );
}

interface FalResponse {
  images?: Array<{ url?: string; width?: number; height?: number; content_type?: string }>;
  seed?: number;
  has_nsfw_concepts?: boolean[];
  detail?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
