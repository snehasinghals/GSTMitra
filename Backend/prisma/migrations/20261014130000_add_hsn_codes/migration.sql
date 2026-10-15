CREATE TABLE IF NOT EXISTS "HsnCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "keywords" TEXT NOT NULL DEFAULT '',
  "digits" INTEGER NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'GOODS',
  CONSTRAINT "HsnCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HsnCode_type_code_key" ON "HsnCode"("type", "code");
CREATE INDEX IF NOT EXISTS "HsnCode_code_idx" ON "HsnCode"("code");

