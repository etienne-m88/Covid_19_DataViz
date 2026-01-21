-- Align database with Prisma schema: add newDeaths columns if missing
ALTER TABLE "DailyGlobalStats" ADD COLUMN IF NOT EXISTS "newDeaths" INTEGER;
ALTER TABLE "CountryStats" ADD COLUMN IF NOT EXISTS "newDeaths" INTEGER;
