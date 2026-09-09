/**
 * apps/api/src/db/mongoose.ts
 *
 * Single place that owns the Mongoose connection lifecycle. src/index.ts
 * calls connectDb() before binding the HTTP port, so the process never
 * starts accepting requests against a database it can't reach. Tests use
 * mongodb-memory-server and call connectDb() with that instance's URI
 * instead — same function, different URI, no special-casing in app code.
 *
 * serverSelectionTimeoutMS is set explicitly: Mongoose's default behavior
 * is to buffer commands and keep retrying server selection in the
 * background rather than rejecting the initial connect() promise, which
 * would make a misconfigured MONGO_URI hang index.ts's startup sequence
 * indefinitely instead of failing fast with a clear error.
 */

import mongoose from "mongoose";
import { config } from "../config";

mongoose.set("strictQuery", true);

let isConnected = false;

export async function connectDb(uriOverride?: string): Promise<void> {
  if (isConnected) return;

  const uri = uriOverride ?? config.mongoUri;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  isConnected = true;

  mongoose.connection.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[mongoose] connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
  });
}

export async function disconnectDb(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
