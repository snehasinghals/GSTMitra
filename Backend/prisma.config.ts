import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(configDirectory, "../.env") });

export default defineConfig({
  schema: path.resolve(configDirectory, "prisma/schema.prisma"),
  migrations: { path: path.resolve(configDirectory, "prisma/migrations") },
  datasource: { url: env("DATABASE_URL") },
});
