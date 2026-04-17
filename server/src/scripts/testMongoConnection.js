import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try server/.env first, then fall back to root .env.
dotenv.config();
if (!process.env.MONGODB_URI) {
  const rootEnvPath = path.resolve(__dirname, "../../../.env");
  dotenv.config({ path: rootEnvPath });
}

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("FAIL: MONGODB_URI not found in server/.env or root .env");
  process.exit(1);
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("PASS: MongoDB connected");
  await mongoose.disconnect();
  process.exit(0);
} catch (error) {
  console.error("FAIL: MongoDB not connected");
  console.error(error?.message || error);
  process.exit(1);
}