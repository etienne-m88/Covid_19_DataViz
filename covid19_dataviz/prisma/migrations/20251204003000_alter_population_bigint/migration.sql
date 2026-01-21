-- Alter population to BIGINT to store large country totals
ALTER TABLE "CountryPopulation"
ALTER COLUMN "population" TYPE BIGINT USING "population"::bigint;
