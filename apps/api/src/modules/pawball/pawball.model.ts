/**
 * apps/api/src/modules/pawball/pawball.model.ts
 *
 * The PawBall schema moved to src/models/PawBall.ts in Milestone 4 (it is
 * the core game aggregate consumed by capture / bond / lore / collection /
 * map, so it no longer belongs to a single module). This re-export keeps
 * the historical import path working.
 */

export { PawBallModel, type PawBallDocument } from "../../models/PawBall";
