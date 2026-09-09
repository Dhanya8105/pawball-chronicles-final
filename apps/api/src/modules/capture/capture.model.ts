/**
 * apps/api/src/modules/capture/capture.model.ts
 *
 * Matches docs/architecture/02-data-schema.md `captures` collection.
 * Milestone 3 update: cvResult is now actually populated by
 * jobs/analyzeCapture.ts after a successful /cv/analyze call, and status
 * can now reach 'analyzed' or 'failed' (previously every capture sat at
 * 'pending_analysis' forever, since Milestone 2 created captures but never
 * called the AI service). 'generating_art' and 'complete' remain reachable
 * only once Milestone 6 wires the next pipeline stage.
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const captureSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending_analysis", "analyzed", "generating_art", "complete", "failed"],
      default: "pending_analysis",
      required: true,
    },
    originalImageUrl: { type: String, required: true },
    location: {
      type: new Schema(
        { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
        { _id: false }
      ),
      required: true,
    },
    capturedAt: { type: Date, required: true },
    // Mixed (not a strict sub-schema) deliberately: the CV result shape
    // mirrors services/ai's CvAnalysisResult (docs/architecture/03-ai-
    // pipeline.md), which is still evolving as classifiers change (e.g.
    // breed.py's documented future swap from CLIP-zero-shot to a
    // fine-tuned classifier once that checkpoint exists — see
    // services/ai/app/pipelines/cv/breed.py). A strict nested schema here
    // would need a migration every time that shape changes; Mixed defers
    // that cost until the shape actually stabilizes.
    cvResult: { type: Schema.Types.Mixed, default: null },
    bondResult: {
      type: new Schema(
        {
          pawballId: { type: Schema.Types.ObjectId, ref: "PawBall" },
          isNewPawball: Boolean,
          similarityScore: Number,
        },
        { _id: false }
      ),
      default: null,
    },
    generatedArtUrl: { type: String, default: null },
    error: {
      type: new Schema(
        { stage: { type: String, required: true }, message: { type: String, required: true } },
        { _id: false }
      ),
      default: null,
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

captureSchema.index({ ownerId: 1, createdAt: -1 });

export type CaptureDocument = InferSchemaType<typeof captureSchema> & {
  _id: Schema.Types.ObjectId;
};
export const CaptureModel: Model<CaptureDocument> = model<CaptureDocument>(
  "Capture",
  captureSchema
);
