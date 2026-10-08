import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Add your Neon connection string to the root .env file.");
}

const pool = new pg.Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 15_000,
  maxLifetimeSeconds: 240,
  connectionTimeoutMillis: 30_000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// Without this, an error on an idle connection (Neon closing it, network blip)
// is an unhandled 'error' event and can crash the whole API process.
pool.on("error", (err) => {
  console.error("Unexpected error on idle database connection:", err.message);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

const TRANSIENT_DATABASE_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "P1001",
  "P1017",
]);

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { code?: unknown; cause?: unknown };
  if (typeof value.code === "string") return value.code;
  return getErrorCode(value.cause);
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = getErrorCode(error);
    if (!code || !TRANSIENT_DATABASE_CODES.has(code)) throw error;

    console.warn(`Transient database connection error during ${context} (${code}); retrying once.`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return operation();
  }
}

export async function warmupDatabase(retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("Database is awake.");
      return;
    } catch (error) {
      console.error(`Database warmup failed (attempt ${attempt}/${retries}).`);
      if (attempt === retries) {
        console.error("Check DATABASE_URL / Neon project status.", error);
        return;
      }
      await new Promise((r) => setTimeout(r, 3000)); // wait 3 sec, then try again
    }
  }
}