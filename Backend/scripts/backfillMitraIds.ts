import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import { prisma } from "../src/lib/db.js";
import { generateMitraId, assignMitraId } from "../src/lib/mitraId.js";

async function runBackfill() {
  const isDryRun =
    process.argv.includes("--dry-run") ||
    process.argv.includes("-d") ||
    process.env.DRY_RUN === "true";

  console.log("=================================================");
  console.log(`Mitra ID Backfill Script`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (No database writes)" : "LIVE (Writing to database)"}`);
  console.log("=================================================\n");

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        mitraId: true,
      },
    });

    console.log(`Found ${users.length} total user record(s) in the database.\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      if (user.mitraId && user.mitraId.trim() !== "") {
        skippedCount++;
        console.log(`[SKIP] User "${user.name || user.email}" (${user.id}) already has Mitra ID: ${user.mitraId}`);
        continue;
      }

      // Name fallback: user's name if present, otherwise part of email before '@'
      const effectiveName = user.name && user.name.trim().length > 0
        ? user.name.trim()
        : (user.email ? user.email.split("@")[0] : "user");

      try {
        if (isDryRun) {
          const simulatedId = await generateMitraId(effectiveName, prisma);
          updatedCount++;
          console.log(
            `[DRY RUN] Would assign Mitra ID "${simulatedId}" to user "${effectiveName}" (email: ${user.email}, id: ${user.id})`
          );
        } else {
          const assignedId = await assignMitraId(user.id, effectiveName, prisma);
          updatedCount++;
          console.log(
            `[UPDATED] Assigned Mitra ID "${assignedId}" to user "${effectiveName}" (email: ${user.email}, id: ${user.id})`
          );
        }
      } catch (userErr: any) {
        errorCount++;
        console.error(`[ERROR] Failed to process user ${user.id} (${user.email}):`, userErr.message);
      }
    }

    console.log("\n=================================================");
    console.log("Mitra ID Backfill Summary");
    console.log("=================================================");
    console.log(`Total users inspected: ${users.length}`);
    console.log(`Updated:               ${updatedCount}`);
    console.log(`Skipped:               ${skippedCount}`);
    console.log(`Errors:                ${errorCount}`);
    console.log(`Execution Mode:        ${isDryRun ? "DRY RUN (No changes made)" : "LIVE (Changes committed)"}`);
    console.log("=================================================");
  } catch (error: any) {
    console.error("Fatal error during Mitra ID backfill:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runBackfill();

