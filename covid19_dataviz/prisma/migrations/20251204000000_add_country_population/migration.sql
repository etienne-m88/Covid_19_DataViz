-- Create CountryPopulation table if not exists
CREATE TABLE IF NOT EXISTS "CountryPopulation" (
    "id" SERIAL PRIMARY KEY,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "population" INTEGER NOT NULL,
    CONSTRAINT "CountryPopulation_country_year_key" UNIQUE ("country","year")
);
