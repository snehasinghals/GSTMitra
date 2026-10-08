import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const classPath = path.join(root, "app/generated/prisma/internal/class.ts");
const text = fs.readFileSync(classPath, "utf8");
const match = text.match(/"inlineSchema": "((?:\\.|[^"\\])*)"/);
if (!match) {
  console.error("Could not find inlineSchema");
  process.exit(1);
}
const schema = JSON.parse(`"${match[1]}"`);
const out = path.join(root, "prisma/schema.prisma");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, schema.endsWith("\n") ? schema : `${schema}\n`);
console.log(`Wrote ${out} (${schema.split("\n").length} lines)`);
