/**
 * apps/api/src/modules/capture/capture.validators.ts
 *
 * The image itself is validated by multer (middleware/upload.ts); this only
 * validates the accompanying form fields. multipart/form-data fields always
 * arrive as strings, hence z.coerce.number() rather than z.number().
 */

import { z } from "zod";

export const createCaptureFieldsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  capturedAt: z.coerce.date().optional(),
});
