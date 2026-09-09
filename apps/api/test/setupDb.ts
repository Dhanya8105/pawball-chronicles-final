/**
 * apps/api/test/setupDb.ts
 *
 * Spins up a real in-memory MongoDB instance for tests that need actual
 * persistence behavior (unique-index enforcement, TTL semantics, query
 * correctness) rather than mocking Mongoose entirely — mocks would let
 * schema bugs slip through unnoticed. Each test file that needs the DB
 * imports setupTestDb() and calls it inside beforeAll/afterAll/afterEach.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/db/mongoose";

let mongod: MongoMemoryServer | null = null;

export function setupTestDb() {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDb(mongod.getUri());
  }, 60_000);

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  afterAll(async () => {
    await disconnectDb();
    if (mongod) await mongod.stop();
  });
}
