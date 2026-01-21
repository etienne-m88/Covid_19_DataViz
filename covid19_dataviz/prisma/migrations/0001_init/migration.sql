-- CreateTable
CREATE TABLE "DailyReport" (
    "id" SERIAL NOT NULL,
    "fips" TEXT,
    "admin2" TEXT,
    "provinceState" TEXT,
    "countryRegion" TEXT NOT NULL,
    "lastUpdate" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "confirmed" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "recovered" INTEGER NOT NULL DEFAULT 0,
    "active" INTEGER NOT NULL DEFAULT 0,
    "combinedKey" TEXT,
    "incidentRate" DOUBLE PRECISION,
    "caseFatalityRatio" DOUBLE PRECISION,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyGlobalStats" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalConfirmed" BIGINT NOT NULL DEFAULT 0,
    "totalDeaths" BIGINT NOT NULL DEFAULT 0,
    "newDeaths" INTEGER,
    "totalRecovered" BIGINT NOT NULL DEFAULT 0,
    "totalActive" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyGlobalStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryStats" (
    "id" SERIAL NOT NULL,
    "countryRegion" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalConfirmed" INTEGER NOT NULL DEFAULT 0,
    "totalDeaths" INTEGER NOT NULL DEFAULT 0,
    "newDeaths" INTEGER,
    "totalRecovered" INTEGER NOT NULL DEFAULT 0,
    "totalActive" INTEGER NOT NULL DEFAULT 0,
    "incidentRate" DOUBLE PRECISION,
    "caseFatalityRatio" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryPopulation" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "population" BIGINT NOT NULL,

    CONSTRAINT "CountryPopulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_countryRegion_reportDate_idx" ON "DailyReport"("countryRegion", "reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_provinceState_reportDate_idx" ON "DailyReport"("provinceState", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_countryRegion_provinceState_admin2_reportDate_key" ON "DailyReport"("countryRegion", "provinceState", "admin2", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGlobalStats_date_key" ON "DailyGlobalStats"("date");

-- CreateIndex
CREATE INDEX "DailyGlobalStats_date_idx" ON "DailyGlobalStats"("date");

-- CreateIndex
CREATE INDEX "CountryStats_countryRegion_idx" ON "CountryStats"("countryRegion");

-- CreateIndex
CREATE INDEX "CountryStats_date_idx" ON "CountryStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CountryStats_countryRegion_date_key" ON "CountryStats"("countryRegion", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPopulation_country_year_key" ON "CountryPopulation"("country", "year");

