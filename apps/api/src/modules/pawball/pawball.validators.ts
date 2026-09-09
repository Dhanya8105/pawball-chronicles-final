/**
 * apps/api/src/modules/pawball/pawball.validators.ts
 */

import { z } from "zod";

export const favoriteRestingPlaceSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  label: z.string().min(1).max(120),
});
