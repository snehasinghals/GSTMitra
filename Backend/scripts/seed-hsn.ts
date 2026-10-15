import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HsnRow {
  code: string;
  description: string;
  keywords: string;
  digits: number;
  type: "GOODS" | "SERVICE";
}

function parseCsv(filePath: string, type: "GOODS" | "SERVICE"): HsnRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  // Skip header: code,description,keywords,digits
  const rows: HsnRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // CSV parser handling quoted descriptions containing commas
    const fields: string[] = [];
    let insideQuotes = false;
    let currentField = "";

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        if (insideQuotes && line[c + 1] === '"') {
          currentField += '"';
          c++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        fields.push(currentField);
        currentField = "";
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);

    if (fields.length >= 4) {
      const code = fields[0].trim(); // MUST stay as string, preserve leading zeros
      const description = fields[1].trim();
      const keywords = (fields[2] || "").trim();
      const digits = parseInt(fields[3].trim(), 10) || code.length;

      if (code) {
        rows.push({
          code,
          description,
          keywords,
          digits,
          type,
        });
      }
    }
  }

  return rows;
}

async function seed() {
  console.log("Reading CSV files...");
  const hsnPath = path.resolve(__dirname, "../data/hsn.csv");
  const sacPath = path.resolve(__dirname, "../data/sac.csv");

  const goodsRows = parseCsv(hsnPath, "GOODS");
  const serviceRows = parseCsv(sacPath, "SERVICE");

  console.log(`Parsed ${goodsRows.length} goods and ${serviceRows.length} services.`);

  const allRows = [...goodsRows, ...serviceRows];
  const BATCH_SIZE = 1000;

  console.log(`Inserting ${allRows.length} records in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    await prisma.hsnCode.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allRows.length / BATCH_SIZE)}`);
  }

  const goodsCount = await prisma.hsnCode.count({ where: { type: "GOODS" } });
  const serviceCount = await prisma.hsnCode.count({ where: { type: "SERVICE" } });
  const totalCount = await prisma.hsnCode.count();

  console.log("\n--- SEEDING COMPLETED ---");
  console.log(`Goods rows in DB: ${goodsCount}`);
  console.log(`Service rows in DB: ${serviceCount}`);
  console.log(`Total HsnCode rows in DB: ${totalCount}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Failed to seed HSN codes:", err);
  process.exit(1);
});

