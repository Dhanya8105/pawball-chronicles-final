/**
 * apps/api/src/modules/capture/capture.pipeline.ts
 *
 * Runs the deterministic, in-process half of the capture pipeline described
 * in docs/architecture/01-system-architecture.md §2 — everything after the
 * CV call and before (the still-unbuilt, Milestone 6) real artwork step:
 *
 *   CV result -> Region resolution -> Bond resolution
 *             -> (new cat) Aura + Lore generation + PawBall creation
 *             -> (known cat) sighting count / bond level bump
 *             -> Sighting document (append-only)
 *             -> Capture marked complete
 *
 * `jobs/analyzeCapture.ts` calls `runCapturePipeline` immediately after it
 * writes `cvResult` onto the capture. It is safe to re-run: the first line
 * bails if a Sighting already exists for this capture (BullMQ retry, manual
 * replay), and Region creation is idempotent per grid cell.
 *
 * There is no model call here. `modules/capture/cv.service.ts` owns the only
 * model inference in the system (Gemini Vision); Aura, Lore and Region are
 * rule tables + a seeded RNG.
 */

import type { HydratedDocument } from "mongoose";
import type { CvAnalysisResult } from "./cv.service";
import { computeSeed } from "../../lib/seededRandom";
import { MemoryModel } from "../../models/Memory";
import { PawBallModel, type PawBallDocument } from "../../models/PawBall";
import { SightingModel } from "../../models/Sighting";
import { toGeoPoint } from "../../models/geo";
import { deriveAura } from "../aura/aura.engine";
import { nextBondLevel, resolveBond } from "../bond/bond.engine";
import { generateArtwork } from "../artwork/artwork.service";
import { generateIdentity } from "../lore/lore.engine";
import { resolveRegion } from "../region/region.engine";
import type { CaptureDocument } from "./capture.model";

type CaptureDoc = HydratedDocument<CaptureDocument>;
type PawBallDoc = HydratedDocument<PawBallDocument>;

/** Below this YOLO detection confidence the capture is rejected and the
 * frontend prompts a retake (CAPTURE_LOW_CONFIDENCE in the API contract). */
export const MIN_CAT_CONFIDENCE = 0.4;

export interface PipelineOutcome {
  status: CaptureDocument["status"];
  pawballId?: string;
  isNewPawball?: boolean;
  rejectedReason?: "not_a_cat" | "low_confidence";
}

export async function runCapturePipeline(
  capture: CaptureDoc
): Promise<PipelineOutcome> {
  // Idempotency guard — a Sighting is the pipeline's terminal write.
  const already = await SightingModel.findOne({ captureId: capture._id })
    .select("_id pawballId")
    .lean();
  if (already) {
    return {
      status: "complete",
      pawballId: already.pawballId?.toString(),
      isNewPawball: false,
    };
  }

  const cv = capture.cvResult as CvAnalysisResult | null;
  if (!cv) {
    throw new Error("runCapturePipeline called before cvResult was written");
  }

  const ownerId = capture.ownerId.toString();
  const { lat, lng } = capture.location as { lat: number; lng: number };
  const capturedAt = capture.capturedAt as Date;

  // --- Reject non-cats / low-confidence detections -------------------------
  // The no-API-key mock result (cv.mock) is exempt: it deliberately carries
  // confidence 0.0, and its whole purpose is to let the pipeline run
  // end-to-end in local dev. A real reading still has to clear the gate.
  if (!cv.mock && !cv.isCat) {
    capture.status = "failed";
    capture.error = {
      stage: "cv_analysis",
      message: "No cat was detected in this photo.",
    } as CaptureDocument["error"];
    await capture.save();
    return { status: "failed", rejectedReason: "not_a_cat" };
  }
  if (!cv.mock && cv.confidence < MIN_CAT_CONFIDENCE) {
    capture.status = "failed";
    capture.error = {
      stage: "cv_analysis",
      message: `Cat detection confidence too low (${cv.confidence.toFixed(2)}). Try a clearer photo.`,
    } as CaptureDocument["error"];
    await capture.save();
    return { status: "failed", rejectedReason: "low_confidence" };
  }

  const surroundingLabels = cv.surroundings.map((s) => s.label);

  // --- Region ------------------------------------------------------------
  const region = await resolveRegion({
    ownerId,
    lat,
    lng,
    surroundings: surroundingLabels,
    capturedAt,
  });

  // --- Bond ------------------------------------------------------------
  const bond = await resolveBond({ ownerId, cvResult: cv, lat, lng });

  let pawball: PawBallDoc | null = null;
  let isNewPawball = bond.isNewPawball;

  if (!bond.isNewPawball && bond.pawballId) {
    pawball = await PawBallModel.findOne({ _id: bond.pawballId, ownerId });
    // Defensive: match pointed at a PawBall that's gone -> treat as new.
    if (!pawball) isNewPawball = true;
  }

  if (isNewPawball || !pawball) {
    pawball = await createPawBall(capture, cv, region, capturedAt);
    await MemoryModel.create({
      pawballId: pawball._id,
      ownerId: capture.ownerId,
      type: "title_earned",
      text: `${pawball.identity.fantasyName}, ${pawball.identity.title}, was discovered in ${region.fantasyName}.`,
      occurredAt: capturedAt,
    });
  } else {
    await recordRepeatSighting(pawball, region, capturedAt);
  }

  // --- Sighting (append-only) ------------------------------------------
  await SightingModel.create({
    pawballId: pawball._id,
    ownerId: capture.ownerId,
    captureId: capture._id,
    location: toGeoPoint(lat, lng),
    regionId: region.regionId,
    capturedAt,
    weatherSnapshot: null,
    cvSnapshot: cv,
  });

  // --- Capture bookkeeping ------------------------------------------
  capture.status = "complete";
  capture.bondResult = {
    pawballId: pawball._id.toString(),
    isNewPawball,
    similarityScore: bond.similarityScore ?? undefined,
  } as unknown as CaptureDocument["bondResult"];
  capture.completedAt = new Date();
  await capture.save();

  return {
    status: "complete",
    pawballId: pawball._id.toString(),
    isNewPawball,
  };
}

async function createPawBall(
  capture: CaptureDoc,
  cv: CvAnalysisResult,
  region: { regionId: string; fantasyName: string; biome: string },
  capturedAt: Date
): Promise<PawBallDoc> {
  const ownerId = capture.ownerId.toString();
  const breed = cv.breed.label;
  const coatColor = cv.coat.color;

  const aura = deriveAura(cv);
  const seed = computeSeed([ownerId, capturedAt.toISOString(), breed, coatColor]);

  const generated = await generateIdentity({
    seed,
    breed,
    coatColor,
    coatPattern: cv.coat.pattern,
    pose: cv.pose.label,
    surroundings: cv.surroundings.map((s) => s.label),
    biome: region.biome as Parameters<typeof generateIdentity>[0]["biome"],
    regionName: region.fantasyName,
    auraTraits: aura.traits,
    capturedAt,
  });

  const artwork = await resolveArtwork(capture, {
    breed,
    coatColor,
    fantasyClass: generated.identity.class,
    element: generated.identity.element,
    regionName: region.fantasyName,
  });

  return PawBallModel.create({
    ownerId: capture.ownerId,
    faceEmbeddingId: null,
    identity: generated.identity,
    visualProfile: {
      breed,
      breedConfidence: cv.breed.confidence ?? null,
      coatColor,
      coatPattern: cv.coat.pattern,
      estimatedAgeGroup: normalizeAgeGroup(cv.estimatedAgeGroup.label),
    },
    aura,
    abilities: generated.abilities,
    stats: generated.stats,
    loreText: generated.loreText,
    personality: generated.personality,
    bond: {
      level: "stranger",
      levelNumeric: 0,
      sightingCount: 1,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
    },
    artwork: {
      currentImageUrl: artwork.url,
      history: [artwork],
    },
    originalPhotoUrl: capture.originalImageUrl,
    homeRegion: { regionId: region.regionId, name: region.fantasyName },
    locationsVisited: [region.regionId],
    titlesEarned: [
      {
        title: generated.identity.title,
        earnedAt: capturedAt,
        reason: `First discovered in ${region.fantasyName}.`,
      },
    ],
  });
}

interface ArtworkResolution {
  url: string;
  generatedAt: Date;
  providerUsed: string;
}

/** Fantasy card artwork, generated once when a new PawBall is created (not
 * on repeat sightings of an already-owned cat). Falls back to the original
 * capture photo — same "never hard-fail a capture on a generation step"
 * pattern as the CV and lore Gemini calls — if FAL_API_KEY is unset or the
 * fal.ai call fails after retries. */
async function resolveArtwork(
  capture: CaptureDoc,
  input: {
    breed: string;
    coatColor: string;
    fantasyClass: string;
    element: string;
    regionName: string;
  }
): Promise<ArtworkResolution> {
  try {
    const result = await generateArtwork({
      originalImageUrl: capture.originalImageUrl,
      ...input,
    });
    return { url: result.imageUrl, generatedAt: new Date(), providerUsed: result.providerUsed };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[artwork] fal.ai generation failed for capture ${capture._id.toString()} — falling back to the original photo:`,
      (err as Error).message
    );
    return { url: capture.originalImageUrl, generatedAt: new Date(), providerUsed: "original-photo" };
  }
}

async function recordRepeatSighting(
  pawball: PawBallDoc,
  region: { regionId: string; fantasyName: string },
  capturedAt: Date
): Promise<void> {
  pawball.bond.sightingCount += 1;
  if (capturedAt > pawball.bond.lastSeenAt) {
    pawball.bond.lastSeenAt = capturedAt;
  }

  const previousLevel = pawball.bond.level;
  const { level, levelNumeric } = nextBondLevel(pawball.bond.sightingCount);
  pawball.bond.level = level;
  pawball.bond.levelNumeric = levelNumeric;

  const visited = pawball.locationsVisited.map((id) => id.toString());
  if (!visited.includes(region.regionId)) {
    pawball.locationsVisited.push(
      region.regionId as unknown as PawBallDocument["locationsVisited"][number]
    );
  }

  await pawball.save();

  if (level !== previousLevel) {
    await MemoryModel.create({
      pawballId: pawball._id,
      ownerId: pawball.ownerId,
      type: "bond_unlock",
      text: bondUnlockText(pawball.identity.fantasyName, level, region.fantasyName),
      occurredAt: capturedAt,
    });
  }
}

function bondUnlockText(
  name: string,
  level: string,
  regionName: string
): string {
  const phrases: Record<string, string> = {
    acquaintance: `${name} no longer bolts when you approach in ${regionName}. Progress.`,
    friend: `${name} came to you first today. You are, officially, friends.`,
    trusted_companion: `${name} led you along their private route through ${regionName}, which is not a thing they do for strangers.`,
    guardian: `${name} put themselves between you and a barking dog in ${regionName} without hesitating. Guardian, now.`,
    legend: `${name} is known to every cat in ${regionName}, and now walks beside you as an equal. A legend.`,
  };
  return phrases[level] ?? `${name} grew closer to you in ${regionName}.`;
}

function normalizeAgeGroup(label: string): "kitten" | "adult" | "senior" {
  const l = label.toLowerCase();
  if (l === "kitten" || l === "senior") return l;
  return "adult";
}
